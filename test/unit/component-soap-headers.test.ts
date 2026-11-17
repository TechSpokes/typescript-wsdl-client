import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {observeComponentXml} from '../../src/compiler/directCodec.js';
import {assessDeclaredComponentHeaders, encodeDeclaredComponentHeaders, snapshotComponentHeaderProcessors} from '../../src/compiler/componentSoapHeaders.js';
import type {ComponentHeaderProcessor} from '../../src/compiler/componentSoapHeaders.js';
import {syntaxElements} from '../../src/loader/orderedSyntax.js';

const directory = path.resolve('test/conformance/fixtures/soap/headers');
const file = path.join(directory, 'declared-literal.wsdl'), namespace = 'urn:conformance:headers';
const soap = {11: 'http://schemas.xmlsoap.org/soap/envelope/', 12: 'http://www.w3.org/2003/05/soap-envelope'};
const selector = (version: '11' | '12') => ({portType: {namespace, local: 'HeaderPortType'}, binding: {namespace, local: 'Soap' + version}, operation: 'Invoke'});
async function selected(version: '11' | '12') {
  const result = await selectComponentOperation(file, selector(version), {loading: {policy: {fileRoots: [directory]}}});
  if (result.kind !== 'selected') throw new Error(result.kind + ':' + result.rule);
  const mapping = createComponentValueMapping(result.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  return {contract: result.contract, mapping};
}
const envelope = (version: '11' | '12', headers: string) => `<s:Envelope xmlns:s="${soap[version]}" xmlns:t="${namespace}"><s:Header>${headers}</s:Header><s:Body><t:Response>owned body</t:Response></s:Body></s:Envelope>`;

describe.each(['11', '12'] as const)('source-owned SOAP %s literal headers', version => {
  it('pins input/output/headerfault message parts and retains the frozen direct refusal', async () => {
    const {contract} = await selected(version);
    expect(contract.headers?.map(header => [header.direction, header.kind, header.root.message.local, header.root.part]))
      .toEqual([['input', 'header', 'Input', 'session'], ['output', 'header-fault', 'HeaderError', 'problem'], ['output', 'header', 'Output', 'receipt']]);
    const input = contract.headers![0]!;
    expect(input.id).toBe(JSON.stringify(['input', namespace, 'Input', 'session', null]));
    expect(contract.headers![1]!.headerId).toBe(input.id);
    // @why The frozen dated-direct correspondence excludes anonymous complex types before examining the SOAP binding.
    expect(await selectDirectOperation(file, selector(version), {loading: {policy: {fileRoots: [directory]}}}))
      .toMatchObject({kind: 'inconclusive', rule: 'whole-source-qualification'});
  });
  it('natively encodes selected outgoing values and refuses missing, invalid and foreign declarations', async () => {
    const {contract, mapping} = await selected(version), id = contract.headers![0]!.id;
    const encoded = encodeDeclaredComponentHeaders(contract, mapping, {[id]: {token: 'owned & independent'}});
    expect(encoded.kind).toBe('encoded-component-headers');
    if (encoded.kind !== 'encoded-component-headers') throw new Error(encoded.kind);
    expect(encoded.blocks).toHaveLength(1); expect(encoded.blocks[0]!.xml).toContain('owned &amp; independent');
    expect(encodeDeclaredComponentHeaders(contract, mapping, {}).kind).toBe('value-invalid');
    expect(encodeDeclaredComponentHeaders(contract, mapping, {[id]: {token: 7}}).kind).toBe('value-invalid');
    expect(encodeDeclaredComponentHeaders(contract, mapping, {foreign: {token: 'owned'}}).kind).toBe('unsupported');
  });
  it('requires an actual processing acknowledgement for mandatory typed headers, not QName/schema recognition', async () => {
    const {contract, mapping} = await selected(version), declaration = contract.headers!.find(header => header.root.part === 'receipt')!;
    const observe = (xml: string) => {
      const result = observeComponentXml(contract, mapping, Buffer.from(xml), {componentResponseEncoding: {}});
      if (result.kind !== 'observed-component-xml') throw new Error(result.kind);
      return {root: result.root, header: syntaxElements(result.root, soap[version], 'Header')[0]!};
    };
    const {root, header} = observe(envelope(version, '<t:Receipt s:mustUnderstand="1"><t:count>7</t:count></t:Receipt>'));
    expect(assessDeclaredComponentHeaders(contract, mapping, root, header, undefined).kind).toBe('unsupported');
    let received: unknown;
    const process: ComponentHeaderProcessor = value => {expect(value).toEqual({count: 7}); received = value; return true;};
    const result = assessDeclaredComponentHeaders(contract, mapping, root, header, {[declaration.id]: process});
    expect(result.kind).toBe('assessed-component-headers'); expect(received).toEqual({count: 7});
    if (result.kind !== 'assessed-component-headers') throw new Error(result.kind);
    expect(result.values[declaration.id]).toEqual({count: 7}); expect(result.processed).toEqual([declaration.id]); expect(result.remaining.children).toEqual([]);
    const asyncProcessor = (() => Promise.resolve(true)) as unknown as ComponentHeaderProcessor;
    expect(assessDeclaredComponentHeaders(contract, mapping, root, header, {[declaration.id]: asyncProcessor}).kind).toBe('unsupported');
  });
  it('refuses unknown mandatory blocks and invalid typed scalars without calling processors', async () => {
    const {contract, mapping} = await selected(version), declaration = contract.headers!.find(header => header.root.part === 'receipt')!;
    let calls = 0;
    const processors = {[declaration.id]: (() => {calls++; return true;}) as ComponentHeaderProcessor};
    for (const content of [
      '<t:Receipt s:mustUnderstand="1"><t:count>7</t:count></t:Receipt><t:Unknown s:mustUnderstand="1"/>',
      '<t:Receipt s:mustUnderstand="1"><t:count>invalid</t:count></t:Receipt>',
    ]) {
      const observation = observeComponentXml(contract, mapping, Buffer.from(envelope(version, content)), {componentResponseEncoding: {}});
      if (observation.kind !== 'observed-component-xml') throw new Error(observation.kind);
      const result = assessDeclaredComponentHeaders(contract, mapping, observation.root, syntaxElements(observation.root, soap[version], 'Header')[0]!, processors);
      expect(['unsupported', 'scalar-invalid']).toContain(result.kind);
    }
    expect(calls).toBe(0);
  });
  it('retains typed headerfault values only after explicit processing', async () => {
    const {contract, mapping} = await selected(version), declaration = contract.headers!.find(header => header.kind === 'header-fault')!;
    const observation = observeComponentXml(contract, mapping, Buffer.from(envelope(version, '<t:HeaderProblem s:mustUnderstand="1"><t:code>42</t:code></t:HeaderProblem>')), {componentResponseEncoding: {}});
    if (observation.kind !== 'observed-component-xml') throw new Error(observation.kind);
    const header = syntaxElements(observation.root, soap[version], 'Header')[0]!;
    expect(assessDeclaredComponentHeaders(contract, mapping, observation.root, header, undefined).kind).toBe('unsupported');
    const result = assessDeclaredComponentHeaders(contract, mapping, observation.root, header, {[declaration.id]: value => {expect(value).toEqual({code: 42}); return true;}});
    expect(result.kind).toBe('assessed-component-headers');
    if (result.kind === 'assessed-component-headers') {expect(result.faults[declaration.id]).toEqual({code: 42}); expect(Object.keys(result.values)).toEqual([]);}
  });
});

it('rejects processor accessors and proxies without invoking them', () => {
  let reads = 0;
  const unsafe = Object.defineProperty({}, 'header', {get() {reads++; return () => true;}});
  expect(() => snapshotComponentHeaderProcessors(unsafe)).toThrow();
  expect(() => snapshotComponentHeaderProcessors(new Proxy({}, {}))).toThrow();
  expect(reads).toBe(0);
});
