import {verificationPath} from "../helpers/verificationPath.js";
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import type {Socket} from 'node:net';
import {SaxesParser} from 'saxes';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {Ajv} from 'ajv';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';
import {createComponentSourceCapsule, reconstructComponentSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {generateComponentClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {generateComponentGateway} from '../../src/gateway/generateCheckedGateway.js';

// @constraints Only package resolution is substituted; source, values, HTTP and SOAP use production owners.
vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const namespace = 'urn:checked:union-lists';
const fixture = path.resolve('test/conformance/fixtures/assessment/atomic-union-lists.wsdl');
const soap = {11: 'http://schemas.xmlsoap.org/soap/envelope/', 12: 'http://www.w3.org/2003/05/soap-envelope'};
const input = {words: ['+01.00', 'true', '+9007199254740993', 'AUTO'], witness: '+01.00 true', inline: ['AUTO']};
const output = {words: ['-000.1250', '0', '9007199254740994'], witness: '+01.00 true', inline: ['+007']};
const faultValue = {words: ['+007', 'false', 'AUTO'], witness: '+01.00 true'};
const selector = (version: '11' | '12') => ({portType: {namespace, local: 'ListPortType'},
  binding: {namespace, local: 'Soap' + version}, operation: 'Exchange'});
const selection = (version: '11' | '12') => ({service: {namespace, local: 'ListService'}, port: 'Port' + version});
const responseBody = '<t:ExchangeResponse><t:words>-000.1250\t0\n9007199254740994</t:words><t:witness>+01.00 true</t:witness><t:inline>+007</t:inline></t:ExchangeResponse>';
const detail = '<t:ListFault><t:words>+007 false AUTO</t:words><t:witness>+01.00 true</t:witness></t:ListFault>';
const envelope = (version: '11' | '12', body: string) => `<s:Envelope xmlns:s="${soap[version]}" xmlns:t="${namespace}"><s:Body>${body}</s:Body></s:Envelope>`;
const faultBody = (version: '11' | '12', value = detail) => version === '11'
  ? `<s:Fault><faultcode>s:Server</faultcode><faultstring>Independent union fault</faultstring><detail>${value}</detail></s:Fault>`
  : `<s:Fault><s:Code><s:Value>s:Receiver</s:Value></s:Code><s:Reason><s:Text xml:lang="en">Independent union fault</s:Text></s:Reason><s:Detail>${value}</s:Detail></s:Fault>`;
let directory: string, original: string;
beforeAll(async () => {
  await mkdir(verificationPath('tmp/conformance/atomic-union-lists'), {recursive: true});
  directory = await mkdtemp(path.resolve(verificationPath('tmp/conformance/atomic-union-lists/suite-')));
  original = await readFile(fixture, 'utf8');
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function source(version: '11' | '12', text = original) {
  const root = await mkdtemp(path.join(directory, 'source-')), file = path.join(root, 'atomic-union-lists.wsdl');
  await writeFile(file, text);
  const loading = {policy: {fileRoots: [root]}};
  const selected = await selectComponentOperation(file, selector(version), {loading});
  if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
  const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  return {root, file, loading, contract: selected.contract, mapping};
}
async function owned<T>(version: '11' | '12', work: (server: {
  endpoint: string; requests: {xml: string; action?: string; contentType?: string}[];
  reply: (body: string, status?: number) => void;
}) => Promise<T>) {
  const sockets = new Set<Socket>(), requests: {xml: string; action?: string; contentType?: string}[] = [];
  let body = envelope(version, responseBody), status = 200;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({xml: Buffer.concat(chunks).toString(), action: request.headers.soapaction as string | undefined, contentType: request.headers['content-type']});
    response.writeHead(status, {'Content-Type': version === '11' ? 'text/xml' : 'application/soap+xml'}); response.end(body);
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
  try {return await work({endpoint: `http://127.0.0.1:${address.port}/soap${version}`, requests,
    reply(bytes, code = 200) {body = bytes; status = code;}});}
  finally {for (const socket of sockets) socket.destroy(); server.close(); await once(server, 'close');}
}

describe.each(['11', '12'] as const)('checked SOAP %s atomic union lists', version => {
  it('preserves independent lexical words in both directions and refuses invalid input before dispatch', async () => {
    const {contract, mapping, file, loading} = await source(version);
    expect(await selectDirectOperation(file, selector(version), {loading})).toMatchObject({kind: 'inconclusive', rule: 'whole-source-qualification'});
    await owned(version, async server => {
      const options = {...selection(version), endpoint: server.endpoint};
      const before = JSON.stringify(input);
      for (const value of [7, true, {member: 'decimal', value: '+01.00'}, ['bad'], ['1 2'], [''], [1], []]) {
        const result = await exchangeComponentSoap(contract, mapping, {...input, words: value}, options);
        expect(['value-invalid', 'scalar-invalid']).toContain(result.kind); expect(result).not.toHaveProperty('decoded');
      }
      expect(server.requests).toHaveLength(0);
      const result = await exchangeComponentSoap(contract, mapping, input, options);
      expect(result).toMatchObject({kind: 'soap-response', decoded: {validated: {value: output}}});
      expect(JSON.stringify(input)).toBe(before); expect(server.requests).toHaveLength(1);
      const request = server.requests[0]!, names: string[] = [], words: string[] = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.on('text', text => words.push(text)); parser.write(request.xml).close();
      expect(names).toEqual([`{${soap[version]}}Envelope`, `{${soap[version]}}Body`, `{${namespace}}Exchange`,
        ...['words', 'witness', 'inline'].map(local => `{${namespace}}${local}`)]);
      expect(words).toEqual(['+01.00 true +9007199254740993 AUTO', '+01.00 true', 'AUTO']);
      if (version === '11') expect(request.action).toBe('"urn:checked:lists:Exchange"');
      else expect(request.contentType).toContain('action="urn:checked:lists:Exchange"');
      server.reply(envelope(version, responseBody.replace('-000.1250', 'bad')));
      const invalid = await exchangeComponentSoap(contract, mapping, input, options);
      expect(invalid).toMatchObject({kind: 'scalar-invalid', phase: 'response'}); expect(invalid).not.toHaveProperty('decoded');
    });
  });

  it('validates handwritten declared fault detail and refuses invalid union detail without issuing a value', async () => {
    const {contract, mapping} = await source(version);
    await owned(version, async server => {
      const options = {...selection(version), endpoint: server.endpoint};
      server.reply(envelope(version, faultBody(version)), 500);
      expect(await exchangeComponentSoap(contract, mapping, input, options)).toMatchObject({kind: 'soap-fault',
        fault: {name: 'ListError'}, decoded: {validated: {value: faultValue}}});
      server.reply(envelope(version, faultBody(version, detail.replace('+007 false AUTO', 'bad false AUTO'))), 500);
      const invalid = await exchangeComponentSoap(contract, mapping, input, options);
      expect(invalid.kind).toBe('scalar-invalid'); expect(invalid).not.toHaveProperty('decoded'); expect(invalid).not.toHaveProperty('value');
    });
  });

  it('reconstructs actual string-only generated artifacts and executes their HTTP request/success/fault schemas', async () => {
    const {root, file, loading, contract} = await source(version);
    const capsule = await createComponentSourceCapsule(contract, selection(version));
    if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind + ':' + capsule.rule);
    const fresh = await reconstructComponentSourceCapsule(capsule.bytes, file, {loading});
    if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind + ':' + fresh.rule);
    const client = await generateComponentClient(fresh);
    if (client.kind !== 'generated-component-client') throw new Error(client.kind);
    expect(client.source).toMatch(/readonly "words": readonly string\[\]/);
    expect(client.source).toContain('readonly "witness": string');
    const clientDir = path.join(root, 'client'), gatewayDir = path.join(root, 'gateway');
    await mkdir(clientDir); writeDirectClient(path.join(clientDir, 'client.ts'), client);
    const generated = await generateComponentGateway(fresh, {clientDir, gatewayDir, openapiFile: path.join(root, 'openapi.json'), routePath: '/atomic'});
    const schemas = JSON.parse(await readFile(path.join(gatewayDir, 'schemas.json'), 'utf8')) as Record<string, object>;
    const ajv = new Ajv({strict: true, coerceTypes: false, useDefaults: false, removeAdditional: false});
    for (const role of ['request', 'response']) {
      const validate = ajv.compile(schemas[role]!); expect(validate(input)).toBe(true);
      for (const words of [7, true, ['1', 2], {member: 'decimal', value: '+01.00'}]) expect(validate({...input, words})).toBe(false);
      expect(validate({...input, witness: ['+01.00', 'true']})).toBe(false);
      expect(JSON.stringify(schemas[role])).not.toContain('oneOf');
    }
    const doc = generated.doc as {paths: Record<string, {post: {requestBody: {content: Record<string, {schema: object}>}}}>};
    expect(JSON.stringify(doc.paths['/atomic']!.post.requestBody.content['application/json']!.schema)).not.toContain('oneOf');
    await owned(version, async server => {
      const plugin = (await import(pathToFileURL(path.join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{clientOptions: object}>;
      const app = Fastify();
      try {
        await app.register(plugin, {clientOptions: {localSource: file, fileRoots: [root], sourceResources: [], sourceOrigins: [], capsule: capsule.bytes,
          soap: {...selection(version), endpoint: server.endpoint}}});
        const post = (payload: unknown) => app.inject({method: 'POST', url: '/atomic', payload: payload as object});
        for (const words of [7, true, {member: 'decimal', value: '+01.00'}, ['bad'], ['1 2'], [], ['']]) expect((await post({...input, words})).statusCode).toBe(400);
        for (const witness of ['1 true', ['+01.00', 'true']]) expect((await post({...input, witness})).statusCode).toBe(400);
        expect(server.requests).toHaveLength(0);
        const valid = await post(input); expect(valid.statusCode).toBe(200); expect(valid.json()).toEqual(output);
        server.reply(envelope(version, faultBody(version)), 500);
        const fault = await post(input); expect(fault.statusCode).toBe(502); expect(fault.json()).toMatchObject({fault: {name: 'ListError'}, value: faultValue});
        server.reply(envelope(version, faultBody(version, detail.replace('+007 false AUTO', 'bad false AUTO'))), 500);
        const invalid = await post(input); expect(invalid.statusCode).toBe(502); expect(invalid.json()).not.toHaveProperty('value');
        server.reply(envelope(version, responseBody.replace('-000.1250', 'bad')));
        const invalidSuccess = await post(input); expect(invalidSuccess.statusCode).toBe(502); expect(invalidSuccess.json()).not.toHaveProperty('value');
      } finally {await app.close();}
    });
    await writeFile(file, original.replace('name="Words"', 'name="ChangedWords"').replaceAll('base="t:Words"', 'base="t:ChangedWords"'));
    expect(await reconstructComponentSourceCapsule(capsule.bytes, file, {loading})).toMatchObject({kind: 'incompatible-artifact'});
  });
});

it.each([
  ['missing member', 'memberTypes="x:decimal x:boolean t:Automatic"', 'memberTypes="x:decimal t:Missing"', 'invalid-schema'],
  ['nested list', 'itemType="t:Nested"', 'itemType="t:Words"', 'invalid-schema'],
  ['bad bound', '<x:minLength value="1"/>', '<x:minLength value="5"/>', 'invalid-schema'],
  ['unrelated declaration', '</x:schema>', '<x:simpleType name="Unrelated"><x:restriction base="x:Missing"/></x:simpleType></x:schema>', 'invalid-schema'],
  ['excluded float', 'memberTypes="x:decimal x:boolean t:Automatic"', 'memberTypes="x:float x:boolean t:Automatic"', 'inconclusive'],
  ['excluded QName', 'memberTypes="x:decimal x:boolean t:Automatic"', 'memberTypes="x:QName x:boolean t:Automatic"', 'inconclusive'],
])('qualifies the complete source before selecting a list operation: %s', async (_name, before, after, kind) => {
  const root = await mkdtemp(path.join(directory, 'invalid-')), file = path.join(root, 'lists.wsdl');
  await writeFile(file, original.replace(before, after));
  expect((await selectComponentOperation(file, selector('11'), {loading: {policy: {fileRoots: [root]}}})).kind).toBe(kind);
});

it('reconstructs typed list constraints and preserves source default member choice', async () => {
  const text = original.replace('</x:schema>', '<x:simpleType name="One"><x:restriction base="x:string"><x:enumeration value="1"/></x:restriction></x:simpleType><x:simpleType name="Collision"><x:union memberTypes="t:One x:decimal"/></x:simpleType><x:simpleType name="Collisions"><x:list itemType="t:Collision"/></x:simpleType></x:schema>')
    .replace('</x:sequence></x:complexType>', '<x:element name="fixed" type="t:Collisions" fixed="1 +1" minOccurs="0"/><x:element name="default" type="t:Collisions" default="+1 1" minOccurs="0"/></x:sequence></x:complexType>');
  const {file, loading, contract} = await source('11', text);
  const capsule = await createComponentSourceCapsule(contract, selection('11'));
  if (capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
  const fresh = await reconstructComponentSourceCapsule(capsule.bytes, file, {loading});
  if (fresh.kind !== 'reconstructed-component') throw new Error(fresh.kind);
  const mapping = createComponentValueMapping(fresh.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  await owned('11', async server => {
    const options = {...selection('11'), endpoint: server.endpoint};
    expect(await exchangeComponentSoap(fresh.contract, mapping, {...input, fixed: ['+1', '+1']}, options))
      .toMatchObject({kind: 'scalar-invalid', rule: 'fixed-element-value'});
    expect(server.requests).toHaveLength(0);
    server.reply(envelope('11', responseBody.replace('</t:ExchangeResponse>', '<t:fixed>1 +001.00</t:fixed><t:default/></t:ExchangeResponse>')));
    expect(await exchangeComponentSoap(fresh.contract, mapping, {...input, fixed: ['1', '+01.00'], default: []}, options))
      .toMatchObject({kind: 'soap-response', decoded: {validated: {value: {...output, fixed: ['1', '+001.00'], default: ['+1', '1']}}}});
  });
});

it.each(['11', '12'] as const)('shares SOAP %s literal header union-list values while preserving processing and Body precedence', async version => {
  const root = await mkdtemp(path.join(directory, 'headers-')), file = path.join(root, 'headers.wsdl');
  const headerNamespace = 'urn:conformance:headers';
  const sourceText = await readFile('test/conformance/fixtures/soap/headers/declared-literal.wsdl', 'utf8');
  await writeFile(file, sourceText.replace('<x:element name="count" type="x:int"/>', '<x:element name="count"><x:simpleType><x:list><x:simpleType><x:union memberTypes="x:decimal x:boolean"/></x:simpleType></x:list></x:simpleType></x:element>')
    .replace('<x:element name="token" type="x:string"/>', '<x:element name="token"><x:simpleType><x:list><x:simpleType><x:union memberTypes="x:decimal x:boolean"/></x:simpleType></x:list></x:simpleType></x:element>')
    .replace('<x:element name="code" type="x:int"/>', '<x:element name="code"><x:simpleType><x:list><x:simpleType><x:union memberTypes="x:decimal x:boolean"/></x:simpleType></x:list></x:simpleType></x:element>'));
  const selected = await selectComponentOperation(file, {portType: {namespace: headerNamespace, local: 'HeaderPortType'}, binding: {namespace: headerNamespace, local: 'Soap' + version}, operation: 'Invoke'}, {loading: {policy: {fileRoots: [root]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
  const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
  const inputId = selected.contract.headers!.find(header => header.direction === 'input')!.id;
  const outputId = selected.contract.headers!.find(header => header.root.part === 'receipt')!.id;
  const faultId = selected.contract.headers!.find(header => header.kind === 'header-fault')!.id;
  await owned(version, async server => {
    const options = {service: {namespace: headerNamespace, local: 'HeaderService'}, port: 'Port' + version, endpoint: server.endpoint,
      headerValues: {[inputId]: {token: ['+007', 'true']}}};
    const reply = (word: string, body = '<t:Response>owned</t:Response>') => `<s:Envelope xmlns:s="${soap[version]}" xmlns:t="${headerNamespace}"><s:Header><t:Receipt s:mustUnderstand="1"><t:count>${word}</t:count></t:Receipt></s:Header><s:Body>${body}</s:Body></s:Envelope>`;
    server.reply(reply('+01.00 1'));
    expect(await exchangeComponentSoap(selected.contract, mapping, 'body', options)).toMatchObject({kind: 'unsupported', rule: 'incoming SOAP header processing required'});
    let calls = 0;
    const processors = {[outputId]: (value: unknown) => {calls++; expect(value).toEqual({count: ['+01.00', '1']}); return true as const;}};
    expect(await exchangeComponentSoap(selected.contract, mapping, 'body', {...options, headerProcessors: processors})).toMatchObject({kind: 'soap-response', headerValues: {[outputId]: {count: ['+01.00', '1']}}});
    expect(calls).toBe(1); expect(server.requests.at(-1)!.xml).toContain('+007');
    server.reply(reply('TRUE'));
    expect(await exchangeComponentSoap(selected.contract, mapping, 'body', {...options, headerProcessors: processors})).toMatchObject({kind: 'scalar-invalid'});
    expect(calls).toBe(1);
    server.reply(reply('+01.00 1', '<t:Unknown/>').replace('<t:Receipt', '<t:HeaderProblem').replace('</t:Receipt>', '</t:HeaderProblem>')
      .replace('<t:count>', '<t:code>').replace('</t:count>', '</t:code>'));
    const invalidBody = await exchangeComponentSoap(selected.contract, mapping, 'body', {...options,
      headerProcessors: {[faultId]: value => {expect(value).toEqual({code: ['+01.00', '1']}); return true;}}});
    expect(invalidBody.kind).not.toBe('soap-response'); expect(invalidBody.kind).not.toBe('soap-header-fault');
    const dispatched = server.requests.length;
    expect(await exchangeComponentSoap(selected.contract, mapping, 'body', {...options, headerValues: {[inputId]: {token: ['1 2']}}})).toMatchObject({kind: 'value-invalid'});
    expect(server.requests).toHaveLength(dispatched);
  });
});
