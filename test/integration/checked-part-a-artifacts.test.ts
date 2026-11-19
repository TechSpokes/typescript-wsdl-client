import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {SaxesParser} from 'saxes';
import {expect, it, vi} from 'vitest';
import {planCheckedComponents} from '../../src/checkedPlanning.js';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {verificationPath} from '../helpers/verificationPath.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const fixtures = path.resolve('test/conformance/fixtures');
const docs = path.join(fixtures, 'wsdl/documentation/documentation-propagation.wsdl');

async function project<T>(work: (directory: string) => Promise<T>): Promise<T> {
  const scratch = path.resolve(verificationPath('tmp/conformance/part-a'));
  await mkdir(scratch, {recursive: true});
  const directory = await mkdtemp(path.join(scratch, 'artifacts-'));
  try {return await work(directory);}
  finally {await rm(directory, {recursive: true, force: true});}
}

const outputs = (root: string) => ({clientOutDir: path.join(root, 'client'),
  openapi: {outFile: path.join(root, 'openapi.json')},
  gateway: {outDir: path.join(root, 'gateway'), serviceSlug: 'docs', versionSlug: 'v1'}});

it('propagates selected WSDL and XSD annotations in checked generated artifacts', async () => project(async root => {
  const wsdl = path.join(root, 'docs.wsdl');
  const source = (await readFile(docs, 'utf8')).replace('Display name.', 'Display <em>name</em> and literal */ marker.');
  await writeFile(wsdl, source);
  await runGenerationPipeline({wsdl, model: 'checked-components-v1', ...outputs(root)});
  const client = await readFile(path.join(root, 'client/operations/0/client.ts'), 'utf8');
  const route = await readFile(path.join(root, 'gateway/routes/0/plugin.ts'), 'utf8');
  const json = JSON.parse(await readFile(path.join(root, 'openapi.json'), 'utf8')) as {
    paths: Record<string, {post: {summary: string; description: string}}>;
    components: {schemas: Record<string, {description?: string; properties?: Record<string, {description?: string}>}>};
  };
  expect(client).toContain('/** Thing payload. */');
  expect(client).toContain('/** Display name and literal * / marker. */');
  expect(client).toContain('/** Identifier field. */');
  expect(client).toContain('/** Gets a thing. Returns details. */');
  expect(route).toContain('/** Gets a thing. Returns details. */');
  expect(json.paths['/v1/docs/GetThing']!.post).toMatchObject({summary: 'Gets a thing.', description: 'Gets a thing. Returns details.'});
  expect(Object.values(json.components.schemas)).toContainEqual(expect.objectContaining({description: 'Thing payload.',
    properties: {name: expect.objectContaining({description: 'Display name and literal */ marker.'})}}));
  const inventory = JSON.parse(await readFile(path.join(root, 'client/inventory.json'), 'utf8')) as {wsdlDocumentation: object};
  const namespace = 'urn:conformance:documentation-propagation';
  expect(inventory.wsdlDocumentation).toMatchObject({
    bindings: [{name: {namespace, local: 'DocsBinding'}, description: 'SOAP binding for demo service.'}],
    messages: [{name: {namespace, local: 'GetThingRequestMessage'}, description: 'Request wrapper message.',
      children: [{name: 'parameters', description: 'Request parameters part.'}]},
    {name: {namespace, local: 'GetThingResponseMessage'}, description: 'Response wrapper message.',
      children: [{name: 'parameters', description: 'Response parameters part.'}]}],
    services: [{name: {namespace, local: 'DocsService'}, description: 'Demo service entrypoint.',
      children: [{name: 'DocsPort', description: 'Primary SOAP port.'}]}],
  });
}));

it('requires explicit multi-binding selection and keeps the SOAP 1.1 and SOAP 1.2 bindings distinct', async () => {
  const source = path.join(fixtures, 'wsdl/bindings/binding-soap12-first.wsdl');
  const result = await planCheckedComponents(source);
  expect(result).toMatchObject({ready: false, blockers: [{category: 'ambiguous-selection'}]});
  expect(result.candidates).toHaveLength(2);
  const ports = new Set<string>();
  const bindings = new Set<string>();
  for (const candidate of result.candidates) {
    const plan = await planCheckedComponents(source, {service: candidate.service, port: candidate.port});
    expect(plan).toMatchObject({ready: true, selection: {port: candidate.port, selectors: [
      {binding: candidate.binding},
    ]}});
    ports.add(candidate.port);
    bindings.add(candidate.binding.local);
  }
  expect(ports.size).toBe(2);
  expect(bindings.size).toBe(2);
});

it('refuses external policy and accepts a supported same-document attachment', async () => project(async root => {
  const file = path.join(root, 'policy.wsdl');
  const fixture = path.join(fixtures, 'ws-policy/references/policy-reference-external.wsdl');
  const source = (await readFile(fixture, 'utf8')).replace('</wsdl:definitions>',
    '<wsdl:service name="PolicyService"><wsdl:port name="PolicyPort" binding="tns:PolicyBinding"><soap:address location="http://127.0.0.1:1/"/></wsdl:port></wsdl:service></wsdl:definitions>');
  await writeFile(file, source);
  expect(await planCheckedComponents(file)).toMatchObject({ready: false, blockers: [{reason: 'external-policy-reference'}]});
  const contained = source.replace(/URI="https:[^"]+"/, 'URI="#owned"')
    .replace('<wsdl:binding', '<wsp:Policy xmlns:u="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" u:Id="owned"/><wsdl:binding');
  await writeFile(file, contained);
  expect(await planCheckedComponents(file)).toMatchObject({ready: true, blockers: []});
  await runGenerationPipeline({wsdl: file, model: 'checked-components-v1', ...outputs(root)});
  expect(await readFile(path.join(root, 'client/operations/0/client.ts'), 'utf8')).toContain('export type Request = string');
}));

it('generates the published deep composition fixture with an explicit owned service port', async () => project(async root => {
  const file = path.join(root, 'deep.wsdl');
  const fixture = path.join(fixtures, 'xsd/sequences/sequence-composition-deep.wsdl');
  const source = (await readFile(fixture, 'utf8')).replace('</wsdl:definitions>',
    '<wsdl:service name="DeepService"><wsdl:port name="Owned" binding="tns:DeepBinding"><soap:address location="http://127.0.0.1:1/"/></wsdl:port></wsdl:service></wsdl:definitions>');
  await writeFile(file, source);
  await runGenerationPipeline({wsdl: file, model: 'checked-components-v1', ...outputs(root)});
  const client = await readFile(path.join(root, 'client/operations/0/client.ts'), 'utf8');
  for (const field of ['levelOne', 'levelTwo', 'value']) expect(client).toContain('readonly "' + field + '"');
}));

it.each([
  ['xsd/imports/import-relative-types.wsdl', 'relative import with imported record'],
  ['xsd/types/type-simple-alias-same-name.wsdl', 'same-name alias without an extra record wrapper'],
  ['xsd/types/type-simple-restriction-list.wsdl', 'scalar restriction and named list'],
  ['xsd/types/type-simple-content-attributes.wsdl', 'attributed simple content'],
  ['xsd/sequences/sequence-baseline-complex.wsdl', 'nested repeated records'],
  ['xsd/compositors/choice-union-simple.wsdl', 'source-qualified choice'],
])('generates the paired public fixture %s for %s', async (fixture) => project(async directory => {
  const wsdl = path.join(fixtures, fixture);
  await runGenerationPipeline({wsdl, model: 'checked-components-v1', ...outputs(directory)});
  const client = await readFile(path.join(directory, 'client/operations/0/client.ts'), 'utf8');
  const openapi = JSON.parse(await readFile(path.join(directory, 'openapi.json'), 'utf8')) as {paths: object};
  expect(client).toContain('export type Request =');
  expect(Object.keys(openapi.paths)).toHaveLength(1);
}));

it('retains ArrayOf record wrappers in checked HTTP while preserving independent XML repetition', async () => project(async root => {
  const fixture = path.join(fixtures, 'xsd/sequences/sequence-occurrence-wrappers.wsdl');
  const wsdl = path.join(root, 'occurrence.wsdl');
  const source = (await readFile(fixture, 'utf8')).replaceAll('OptionalAddresses', 'ArrayOfOptionalAddress')
    .replaceAll('Addresses', 'ArrayOfAddress');
  await writeFile(wsdl, source);
  const legacy = path.join(root, 'legacy'), checked = path.join(root, 'checked');
  await runGenerationPipeline({wsdl, catalogOut: path.join(legacy, 'catalog.json'), ...outputs(legacy)});
  const legacyOpenApi = JSON.parse(await readFile(path.join(legacy, 'openapi.json'), 'utf8')) as {
    components: {schemas: Record<string, {type: string}>};
  };
  expect(legacyOpenApi.components.schemas.ArrayOfAddress).toMatchObject({type: 'array'});
  await runGenerationPipeline({wsdl, model: 'checked-components-v1', ...outputs(checked)});
  const checkedOpenApi = JSON.parse(await readFile(path.join(checked, 'openapi.json'), 'utf8')) as {
    components: {schemas: Record<string, {type: string}>};
  };
  expect(Object.values(checkedOpenApi.components.schemas)).toContainEqual(expect.objectContaining({
    type: 'object', properties: {$content: expect.objectContaining({type: 'array'})},
  }));

  const ns = 'urn:conformance:sequence-occurrence';
  const soap = 'http://schemas.xmlsoap.org/soap/envelope/';
  const response = (items: string) => `<s:Envelope xmlns:s="${soap}" xmlns:t="${ns}"><s:Body>`
    + `<t:SubmitOccurrenceResponse><t:addresses>${items}</t:addresses></t:SubmitOccurrenceResponse></s:Body></s:Envelope>`;
  const item = '<t:address><t:street>Owned</t:street></t:address>';
  let reply = response(item);
  const requests: string[] = [];
  const upstream = createServer(async (request, result) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString());
    result.writeHead(200, {'Content-Type': 'text/xml'}).end(reply);
  });
  const app = Fastify();
  try {
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Expected owned TCP listener');
    const {default: plugin} = await import(pathToFileURL(path.join(checked, 'gateway/plugin.ts')).href) as {
      default: FastifyPluginAsync<{clientOptions: object; capsules: Record<string, Uint8Array>}>;
    };
    await app.register(plugin, {capsules: {SubmitOccurrence: await readFile(path.join(checked, 'client/operations/0/contract.json'))},
      clientOptions: {localSource: wsdl, fileRoots: [root], sourceResources: [], sourceOrigins: [],
        soap: {service: {namespace: ns, local: 'OccurrenceService'}, port: 'OccurrencePort', endpoint: `http://127.0.0.1:${address.port}/`}}});
    const post = (payload: object) => app.inject({method: 'POST', url: '/v1/docs/SubmitOccurrence', payload});
    const entry = (local: string, value: unknown) => ({name: {namespace: ns, local}, value});
    const id = entry('requestId', 'owned');
    const excessive = Array.from({length: 6}, () => entry('bounded', 'too many'));
    expect((await post({$content: [id, ...excessive]})).statusCode).toBe(400);
    expect(requests).toHaveLength(0);
    const input = {$content: [id, entry('bounded', 'a'), entry('bounded', 'b')]};
    const success = await post(input);
    expect(success.statusCode).toBe(200);
    expect(success.json()).toEqual({$content: [entry('addresses', {$content: [entry('address', {street: 'Owned'})]})]});
    const names: string[] = [], words: string[] = [];
    const parser = new SaxesParser({xmlns: true});
    parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
    parser.on('text', word => words.push(word));
    parser.write(requests[0]!).close();
    expect(names).toEqual([`{${soap}}Envelope`, `{${soap}}Body`, ...['SubmitOccurrence', 'requestId', 'bounded', 'bounded'].map(local => `{${ns}}${local}`)]);
    expect(words).toEqual(['owned', 'a', 'b']);
    reply = response(item.repeat(3));
    const invalid = await post(input);
    expect(invalid.statusCode).toBe(502);
    expect(invalid.json()).not.toHaveProperty('value');
  } finally {
    await app.close();
    if (upstream.listening) {
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
    }
  }
}));
