import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {SaxesParser} from 'saxes';
import {expect, it, vi} from 'vitest';
import {planCheckedComponents} from '../../src/checkedPlanning.js';
import {constructNativeSource} from '../../src/compiler/checkedSourcePreparation.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {compileWsdlToProject} from '../../src/index.js';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {verificationPath} from '../helpers/verificationPath.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const fixtures = path.resolve('test/conformance/fixtures/xsd/simple-content');
const service = path.join(fixtures, 'scalar-base-extension.wsdl');
const namespace = 'urn:review';
const soapNamespace = 'http://schemas.xmlsoap.org/soap/envelope/';
const ns = (local: string) => `{${namespace}}${local}`;
const response = `<s:Envelope xmlns:s="${soapNamespace}" xmlns:t="${namespace}"><s:Body><t:ExchangeResponse>wire output</t:ExchangeResponse></s:Body></s:Envelope>`;

it.each([
  ['vacuous', '4d06acf1e1d61e4542076ff3058c5319f5253913208e5f0594a3e9974d9106f2'],
  ['empty-sequence', '6d5711a2b596dbdea5cf03c623e501a1b862fc422c56f9b86ce1a9175a6d94b3'],
])('verifies the exact archived %s source disposition', async (form, digest) => {
  const file = path.join(fixtures, `simple-base-complex-extension-${form}.xsd`);
  expect(createHash('sha256').update(await readFile(file)).digest('hex')).toBe(digest);
  const input = await loadSchemaInput(file, {policy: {fileRoots: [fixtures]}});
  const derived = globalId('type', {namespace, local: 'D'});
  const dispositions: unknown[] = [];
  const result = constructNativeSource(input, {budget: createSemanticBudget({maxWork: 100_000_000}), maxNodes: 10_000,
    simpleExtensions: true, onLocal(id, local) {if (id === derived) dispositions.push(local);}});
  expect(result).toMatchObject({kind: 'constructed-source', nativeEstablished: true,
    closure: {kind: 'checked-simple-extension-construction', unresolved: []}});
  expect(dispositions).toEqual([expect.objectContaining({kind: 'checked', re01: {target: derived, primitive: false,
    ancestor: {kind: 'builtin', name: {local: 'anySimpleType', namespace: 'http://www.w3.org/2001/XMLSchema'}}}})]);
});

type LegacyClient = {
  soapClient(): Promise<{setEndpoint(endpoint: string): void}>;
  Exchange(value: {$value: string}): Promise<{response: unknown}>;
};

it('compares both bound forms and the conventional simpleContent control through generated legacy SOAP and checked planning', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/scalar-base-extension'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'wire-'));
  const requests: string[] = [];
  const server = createServer(async (request, reply) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString('utf8'));
    reply.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'}).end(response);
  });
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected owned TCP listener');
    const original = await readFile(service, 'utf8');
    for (const mode of ['archived-order', 'reverse-order', 'simple-control'] as const) {
      const source = path.join(root, `${mode}.wsdl`);
      const text = mode === 'simple-control' ? original.replace(/<xs:complexContent>.*?<\/xs:complexContent>/g,
        '<xs:simpleContent><xs:extension base="t:B"/></xs:simpleContent>') : mode === 'reverse-order'
        ? original.replace('name="Exchange" type="t:D"', 'name="Exchange" type="t:E"')
          .replace('name="ExchangeResponse" type="t:E"', 'name="ExchangeResponse" type="t:D"') : original;
      await writeFile(source, text);
      const output = path.join(root, mode);
      await compileWsdlToProject({wsdl: source, outDir: output});
      const declared = await readFile(path.join(output, 'types.ts'), 'utf8');
      expect(declared).toMatch(/\$value\??: string/);
      const {ExtensionService} = await import(pathToFileURL(path.join(output, 'client.ts')).href) as {
        ExtensionService: new (options: {source: string}) => LegacyClient;
      };
      const legacy = new ExtensionService({source});
      (await legacy.soapClient()).setEndpoint(`http://127.0.0.1:${address.port}/soap11`);
      const expected = mode === 'simple-control' ? {$value: {$value: 'wire output'}} : {$value: 'wire output'};
      expect((await legacy.Exchange({$value: 'wire & input'})).response).toEqual(expected);
      const names: string[] = [], words: string[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
      parser.on('text', word => words.push(word));
      parser.write(requests.at(-1)!).close();
      expect(names).toEqual([`{${soapNamespace}}Envelope`, `{${soapNamespace}}Body`, ns('Exchange')]);
      expect(words).toEqual(['wire & input']);

      const beforePlanning = requests.length;
      const plan = await planCheckedComponents(source, {service: {namespace, local: 'ExtensionService'}, port: 'Port11'});
      expect(plan).toMatchObject({ready: true, blockers: []});
      expect(requests).toHaveLength(beforePlanning);
    }
    expect(requests).toHaveLength(3);
  } finally {
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await rm(root, {recursive: true, force: true});
  }
});

it.each(['11', '12'] as const)('executes the generated checked SOAP %s contract and refuses invalid values and stale artifacts', async version => {
  const scratch = path.resolve(verificationPath('tmp/conformance/scalar-base-extension'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'checked-'));
  const protocol = version === '11' ? soapNamespace : 'http://www.w3.org/2003/05/soap-envelope';
  const envelope = (body: string) => `<s:Envelope xmlns:s="${protocol}" xmlns:t="${namespace}"><s:Body>${body}</s:Body></s:Envelope>`;
  const requests: {xml: string; action: string | string[] | undefined; type: string | undefined}[] = [];
  let reply = envelope('<t:ExchangeResponse>wire output</t:ExchangeResponse>'), status = 200;
  const server = createServer(async (request, output) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({xml: Buffer.concat(chunks).toString('utf8'), action: request.headers.soapaction, type: request.headers['content-type']});
    output.writeHead(status, {'Content-Type': version === '11' ? 'text/xml' : 'application/soap+xml'}).end(reply);
  });
  const app = Fastify();
  const selection = {service: {namespace, local: 'ExtensionService'}, port: 'Port' + version};
  const selector = {portType: {namespace, local: 'ExtensionPortType'}, binding: {namespace, local: 'Soap' + version}, operation: 'Exchange'};
  try {
    const file = path.join(root, 'source.wsdl');
    const original = await readFile(service, 'utf8');
    await writeFile(file, original);
    const client = path.join(root, 'client'), gateway = path.join(root, 'gateway');
    const openapi = path.join(root, 'openapi.json');
    await runGenerationPipeline({model: 'checked-components-v1', wsdl: file, checkedComponents: selection, clientOutDir: client,
      gateway: {outDir: gateway, serviceSlug: 'extension', versionSlug: 'v1'}, openapi: {outFile: openapi}});
    const generated = await readFile(path.join(client, 'operations/0/client.ts'), 'utf8');
    expect(generated).toContain('readonly "$value": string');
    expect(await readFile(openapi, 'utf8')).toContain('"$value"');
    if (version === '11') expect(await selectDirectOperation(file, selector, {loading: {policy: {fileRoots: [root]}}}))
      .toMatchObject({kind: 'inconclusive', rule: 'whole-source-qualification'});
    const {default: plugin} = await import(pathToFileURL(path.join(gateway, 'plugin.ts')).href) as {
      default: FastifyPluginAsync<{clientOptions: object; capsules: Record<string, Uint8Array>}>;
    };
    const capsule = await readFile(path.join(client, 'operations/0/contract.json'));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected owned TCP listener');
    await app.register(plugin, {capsules: {Exchange: capsule}, clientOptions: {localSource: file, fileRoots: [root],
      sourceResources: [], sourceOrigins: [], soap: {...selection, endpoint: `http://127.0.0.1:${address.port}/soap`} }});
    const post = (payload: object) => app.inject({method: 'POST', url: '/v1/extension/Exchange', payload});
    for (const invalid of [{}, {$value: 7}, {$value: 'x', child: 'extra'}]) expect((await post(invalid)).statusCode).toBe(400);
    expect(requests).toHaveLength(0);
    const input = {$value: ' a & b '};
    const accepted = await post(input);
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({$value: 'wire output'});
    const names: string[] = [], words: string[] = [];
    const parser = new SaxesParser({xmlns: true});
    parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
    parser.on('text', word => words.push(word));
    parser.write(requests[0]!.xml).close();
    expect(names).toEqual([`{${protocol}}Envelope`, `{${protocol}}Body`, ns('Exchange')]);
    expect(words).toEqual([' a & b ']);
    if (version === '11') expect(requests[0]!.action).toBe('"urn:review:Exchange"');
    else expect(requests[0]!.type).toContain('action="urn:review:Exchange"');
    reply = envelope('<t:ExchangeResponse><t:child/></t:ExchangeResponse>');
    const invalid = await post(input);
    expect(invalid.statusCode).toBe(502);
    expect(invalid.json()).not.toHaveProperty('value');
    status = 500;
    reply = envelope(version === '11'
      ? '<s:Fault><faultcode>s:Server</faultcode><faultstring>owned</faultstring><detail><t:ExtensionFault>fault detail</t:ExtensionFault></detail></s:Fault>'
      : '<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">owned</s:Text></s:Reason><s:Detail><t:ExtensionFault>fault detail</t:ExtensionFault></s:Detail></s:Fault>');
    const fault = await post(input);
    expect(fault.statusCode).toBe(502);
    expect(fault.json()).toMatchObject({fault: {name: 'ExtensionError'}, value: {$value: 'fault detail'}});
    await writeFile(file, original + '\n<!-- stale source -->\n');
    expect((await post(input)).statusCode).toBe(500);
    expect(requests).toHaveLength(3);
  } finally {
    await app.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await rm(root, {recursive: true, force: true});
  }
});

it('qualifies inherited attributes and scalar fixed/default values and distinguishes inapplicable extensions', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/scalar-base-extension'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'constraints-'));
  const file = path.join(root, 'source.wsdl');
  const original = await readFile(service, 'utf8');
  const selection = {service: {namespace, local: 'ExtensionService'}, port: 'Port11'};
  try {
    await writeFile(file, original
      .replace('base="xs:string"/>', 'base="xs:string"><xs:attribute name="unit" type="xs:string" use="required"/></xs:extension>')
      .replace('base="t:B"><xs:sequence/>', 'base="t:B"><xs:sequence/><xs:attribute name="source" type="xs:string"/>')
      .replace('name="Exchange" type="t:D"', 'name="Exchange" type="t:D" fixed="pinned"')
      .replace('name="ExchangeResponse" type="t:E"', 'name="ExchangeResponse" type="t:E" default="fallback"'));
    expect(await planCheckedComponents(file, selection)).toMatchObject({ready: true, blockers: []});
    for (const [from, to, category] of [
      ['<xs:sequence/>', '<xs:sequence><xs:element name="child" type="xs:string"/></xs:sequence>', 'inconclusive'],
      ['</xs:annotation><xs:complexContent>', '</xs:annotation><xs:complexContent mixed="true">', 'inconclusive'],
      ['name="B">', 'name="B" final="extension">', 'invalid-source'],
    ]) {
      await writeFile(file, original.replace(from, to));
      expect(await planCheckedComponents(file, selection)).toMatchObject({ready: false, blockers: [{category}]});
    }
  } finally {await rm(root, {recursive: true, force: true});}
});
