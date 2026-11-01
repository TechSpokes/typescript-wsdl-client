import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {selectComponentOperation, selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {prepareWsdlPolicyRequirements, assertWsdlPolicyRequirements} from '../../src/compiler/wsdlPolicyRequirements.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createApplicationBudget, createSemanticBudget} from '../../src/compiler/semanticBudget.js';

const ns = 'urn:checked:forecast';
const selector = {portType: {namespace: ns, local: 'ForecastPortType'}, binding: {namespace: ns, local: 'ForecastBinding'}, operation: 'GetForecast'};
const p = 'http://schemas.xmlsoap.org/ws/2004/09/policy';
const s = 'http://schemas.xmlsoap.org/ws/2005/07/securitypolicy';
const u = 'http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd';
// Hand-authored standard assertions, independent of the policy reader and code generators.
const policy = `<p:Policy xmlns:p="${p}" xmlns:s="${s}" xmlns:u="${u}" u:Id="TransportPolicy">
  <p:ExactlyOne><p:All><s:TransportBinding><p:Policy>
    <s:TransportToken><p:Policy><s:HttpsToken RequireClientCertificate="false"/></p:Policy></s:TransportToken>
    <s:AlgorithmSuite><p:Policy><s:Basic256/></p:Policy></s:AlgorithmSuite>
    <s:Layout><p:Policy><s:Strict/></p:Policy></s:Layout>
  </p:Policy></s:TransportBinding></p:All></p:ExactlyOne>
</p:Policy>`;
const attachment = `<p:PolicyReference xmlns:p="${p}" URI="#TransportPolicy"/>`;
let directory: string, original: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/policy-requirements', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/policy-requirements/suite-'));
  original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function source(expression = policy, reference = attachment, alter: (text: string) => string = text => text) {
  const child = await mkdtemp(path.join(directory, 'case-'));
  const file = path.join(child, 'source.wsdl');
  const text = original.replace('<wsdl:types>', expression + '\n<wsdl:types>')
    .replace('<wsdl:binding name="ForecastBinding" type="t:ForecastPortType">',
      '<wsdl:binding name="ForecastBinding" type="t:ForecastPortType">' + reference);
  await writeFile(file, alter(text));
  return {file, loading: {policy: {fileRoots: [child]}}};
}
async function select(expression = policy, reference = attachment, alter?: (text: string) => string) {
  const input = await source(expression, reference, alter);
  return selectComponentOperation(input.file, selector, {loading: input.loading});
}

describe('native WSDL transport policy requirements, without enforcement admission', () => {
  it('retains exact HTTPS, suite, layout and informational action metadata without changing SOAPAction', async () => {
    const input = await source(policy, attachment, text => text.replace('<wsdl:input message="t:ForecastInput"',
      '<wsdl:input xmlns:a="http://www.w3.org/2006/05/addressing/wsdl" a:Action="metadata-action" message="t:ForecastInput"'));
    const result = await selectComponentOperation(input.file, selector, {loading: input.loading});
    expect(result.kind).toBe('selected'); if (result.kind !== 'selected') throw new Error(result.rule);
    expect(result.contract).toMatchObject({admitted: false, binding: {action: 'urn:checked:GetForecast'},
      policy: {kind: 'https-transport', requireClientCertificate: false, algorithmSuite: 'Basic256', layout: 'Strict', includeTimestamp: false, enforced: false},
      addressingActions: {required: false, input: 'metadata-action'}});
    expect(result.contract.missingCapabilities).toContain('policy-enforcement');
    const owned = inspectDirectOperation(result.contract);
    assertWsdlPolicyRequirements(owned.source, owned.policyOwner!);
    expect(() => assertWsdlPolicyRequirements(owned.source, {...owned.policyOwner!})).toThrow(TypeError);
    expect(await selectDirectOperation(input.file, selector, {loading: input.loading})).toMatchObject({kind: 'unsupported'});
  });

  it.each(['true', '1', '0'])('retains explicit client certificate boolean %s', async lexical => {
    const result = await select(policy.replace('RequireClientCertificate="false"', `RequireClientCertificate=" ${lexical} "`));
    if (result.kind !== 'selected') throw new Error(result.rule);
    expect(result.contract.policy).toMatchObject({requireClientCertificate: lexical !== '0', enforced: false});
  });

  it('uses the dated Lax/no-timestamp defaults and retains an explicit timestamp requirement', async () => {
    const noLayout = policy.replace('<s:Layout><p:Policy><s:Strict/></p:Policy></s:Layout>', '');
    const result = await select(noLayout);
    if (result.kind !== 'selected') throw new Error(result.rule);
    expect(result.contract.policy).toMatchObject({layout: 'Lax', includeTimestamp: false});
    const timestamp = await select(noLayout.replace(
      '</p:Policy></s:TransportBinding>', '<s:IncludeTimestamp/></p:Policy></s:TransportBinding>'));
    if (timestamp.kind !== 'selected') throw new Error(timestamp.rule);
    expect(timestamp.contract.policy).toMatchObject({layout: 'Lax', includeTimestamp: true, enforced: false});
  });

  it('supports an inline binding policy and percent-encoded same-document identifier', async () => {
    expect(await select('', policy)).toMatchObject({kind: 'selected', contract: {policy: {kind: 'https-transport'}}});
    expect(await select(policy, attachment.replace('#TransportPolicy', '#Transport%50olicy'))).toMatchObject({kind: 'selected'});
  });

  it.each([
    [policy.replace('<s:Basic256/>', '<s:UnknownSuite/>'), attachment, 'algorithm-suite'],
    [policy.replace('<s:Strict/>', '<s:Strict><s:Unexpected/></s:Strict>'), attachment, 'policy-leaf-content'],
    [policy.replace(' RequireClientCertificate="false"', ''), attachment, 'https-token-client-certificate-default-unqualified'],
    [policy.replace('RequireClientCertificate="false"', 'RequireClientCertificate="FALSE"'), attachment, 'https-token-client-certificate-boolean'],
    [policy.replace('<s:HttpsToken ', '<s:HttpsToken xmlns:s="urn:lookalike" '), attachment, 'transport-token-kind'],
    [policy.replace('</p:ExactlyOne>', '<p:All/></p:ExactlyOne>'), attachment, 'policy-alternatives'],
    [policy, attachment.replace('/>', ' Digest="AQI="/>'), 'policy-attribute'],
    [policy, attachment.replace('#TransportPolicy', '#Missing'), 'policy-reference-target'],
  ])('refuses unsupported/invalid policy syntax without an operation handle (%s)', async (expression, reference, rule) => {
    const result = await select(expression, reference);
    expect(result).toMatchObject({rule}); expect(result.kind).not.toBe('selected'); expect('contract' in result).toBe(false);
  });

  it('refuses unknown assertions, duplicate IDs and required WS-Addressing instead of dropping them', async () => {
    expect(await select(policy.replace('<s:TransportBinding>', '<s:SignedSupportingTokens/><s:TransportBinding>')))
      .toMatchObject({kind: 'unsupported', rule: 'policy-assertion-combination'});
    expect(await select(policy + policy)).toMatchObject({kind: 'invalid-schema', rule: 'policy-id-uniqueness'});
    expect(await select(policy, attachment + '<a:UsingAddressing xmlns:a="http://www.w3.org/2006/05/addressing/wsdl"/>'))
      .toMatchObject({kind: 'unsupported', rule: 'wsdl-extension'});
  });

  it('does not fetch external policy references and honors effective XML base', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {requests++; response.end('not policy');});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    try {
      expect(await select(policy, attachment.replace('#TransportPolicy', `http://127.0.0.1:${address.port}/policy#TransportPolicy`)))
        .toMatchObject({kind: 'unsupported', rule: 'external-policy-reference'});
      expect(requests).toBe(0);
      expect(await select(policy, attachment, text => text.replace('<wsdl:definitions ', '<wsdl:definitions xml:base="https://example.test/other.wsdl" ')))
        .toMatchObject({kind: 'unsupported', rule: 'external-policy-reference'});
    } finally {server.close(); await once(server, 'close');}
  });

  it('preserves loaded-source identity, sticky hard limits, cancellation and foreign binding boundaries', async () => {
    const fixture = await source();
    const input = await loadSemanticSchemaInput(fixture.file, fixture.loading);
    const limited = createSemanticBudget({maxWork: 10, maxNodes: 100_000});
    expect(prepareWsdlPolicyRequirements(input, limited, () => {})).toMatchObject({kind: 'resource-limit'});
    expect(prepareWsdlPolicyRequirements(input, limited, () => {})).toMatchObject({kind: 'resource-limit'});
    expect(() => prepareWsdlPolicyRequirements({...input}, createApplicationBudget(), () => {})).toThrow(TypeError);
    const stopped = new Error('owned cancellation');
    expect(() => prepareWsdlPolicyRequirements(input, createApplicationBudget(), () => {throw stopped;})).toThrow(stopped);
    const owner = prepareWsdlPolicyRequirements(input, createApplicationBudget(), () => {});
    if (owner.kind !== 'wsdl-policy-requirements') throw new Error(owner.kind);
    expect(() => owner.forBinding(input.root.root)).toThrow(TypeError);
  });
});
