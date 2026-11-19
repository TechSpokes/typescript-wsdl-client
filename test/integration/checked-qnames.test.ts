import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {Ajv} from 'ajv';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {expect, it, vi} from 'vitest';
import {decodeComponentXml, encodeComponentXml} from '../../src/compiler/directCodec.js';
import {selectComponentOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {compileWsdlToProject} from '../../src/index.js';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {assertQNameRequest, qnameFault, qnameFaultValue, qnameInput, qnameOutput, qnameResponse, qnameServiceNamespace} from '../helpers/qnameWireOracle.js';
import {verificationPath} from '../helpers/verificationPath.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const fixture = 'test/conformance/fixtures/assessment/qnames.wsdl';
const route = '/v1/qnames/Exchange';
const namespace = qnameServiceNamespace;

it.each(['11', '12'] as const)('round trips expanded names through the generated SOAP %s gateway', async version => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'case-'));
  const app = Fastify();
  const requests: string[] = [];
  let status = 200, body = qnameResponse(version);
  const upstream = createServer(async (request, reply) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString());
    reply.writeHead(status, {'Content-Type': version === '11' ? 'text/xml' : 'application/soap+xml'}).end(body);
  });
  const selection = {service: {namespace, local: 'QNameService'}, port: 'Port' + version};
  const selector = {portType: {namespace, local: 'QNamePortType'}, binding: {namespace, local: 'Soap' + version}, operation: 'Exchange'};
  try {
    const source = path.join(root, 'qnames.wsdl'), original = await readFile(fixture, 'utf8');
    await writeFile(source, original);
    const client = path.join(root, 'client'), gateway = path.join(root, 'gateway');
    const openapi = path.join(root, 'openapi.json');
    if (version === '11') {
      const legacy = path.join(root, 'legacy');
      await compileWsdlToProject({wsdl: source, outDir: legacy});
      expect(await readFile(path.join(legacy, 'types.ts'), 'utf8')).toContain('code: string');
    }
    await runGenerationPipeline({wsdl: source, model: 'checked-components-v1', checkedComponents: selection,
      clientOutDir: client, gateway: {outDir: gateway, serviceSlug: 'qnames', versionSlug: 'v1'}, openapi: {outFile: openapi}});
    const generated = await readFile(path.join(client, 'operations/0/client.ts'), 'utf8');
    expect(generated).toContain('/** Names declared by the schema. */\nexport type Request_Scalar_0 = {readonly namespace: string; readonly local: string}');
    expect(generated).toContain('/** Fixed name in this message. */');
    expect(generated).toContain('readonly "selected": {readonly "$value": string; readonly "$namespaces"');
    const op = JSON.parse(await readFile(openapi, 'utf8')) as {components: {schemas: Record<string, {properties?: Record<string, object>}>}};
    expect(Object.values(op.components.schemas)).toContainEqual(expect.objectContaining({description: 'Names declared by the schema.',
      type: 'object', required: ['namespace', 'local'], additionalProperties: false}));
    expect(Object.values(op.components.schemas).find(schema => schema.properties?.fixedName)?.properties?.fixedName)
      .toMatchObject({description: 'Fixed name in this message.'});
    if (version === '11') expect(await selectDirectOperation(source, selector, {loading: {policy: {fileRoots: [root]}}}))
      .toMatchObject({kind: 'inconclusive'});
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Expected owned TCP listener');
    const {default: plugin} = await import(pathToFileURL(path.join(gateway, 'plugin.ts')).href) as {
      default: FastifyPluginAsync<{clientOptions: object; capsules: Record<string, Uint8Array>}>;
    };
    await app.register(plugin, {capsules: {Exchange: await readFile(path.join(client, 'operations/0/contract.json'))},
      clientOptions: {localSource: source, fileRoots: [root], sourceResources: [], sourceOrigins: [],
        soap: {...selection, endpoint: `http://127.0.0.1:${address.port}/`}}});
    const post = (payload: object) => app.inject({method: 'POST', url: route, payload});
    for (const fixedName of ['d:Entry', {namespace: 'urn:wrong', local: 'Entry'}, {namespace: '', local: 'p:Entry'},
      {namespace: 'http://www.w3.org/2000/xmlns/', local: 'Entry'}]) {
      expect((await post({...qnameInput, fixedName})).statusCode).toBe(400);
    }
    for (const changed of [{words: [{namespace: 'urn:space test', local: 'Entry'}]}, {words: [{namespace: 'urn:test%ZZ', local: 'Entry'}]},
      {selected: {$value: 'absent:Entry', $namespaces: {}}}, {literal: {$value: 'soap:Entry', $namespaces: {}}}]) {
      expect((await post({...qnameInput, ...changed})).statusCode).toBe(400);
    }
    expect(requests).toHaveLength(0);
    const prefixReservations = {...qnameInput, literal: {$value: 'n0:Entry', $namespaces: {}}};
    for (const fixed of ['', 'a:Entry']) {
      body = qnameResponse(version, fixed);
      const success = await post(qnameInput);
      expect(success.statusCode).toBe(200);
      expect(success.json()).toEqual(qnameOutput);
      assertQNameRequest(requests.at(-1)!, version);
    }
    body = qnameResponse(version);
    const reserved = await post(prefixReservations);
    expect(reserved.statusCode).toBe(200);
    expect(requests.at(-1)).toContain('>n0:Entry<');
    expect(requests.at(-1)).not.toContain('xmlns:n0=');
    for (const bad of [qnameResponse(version, 'd:Entry'), qnameResponse(version, '', 'missing:Entry')]) {
      body = bad;
      const refused = await post(qnameInput);
      expect(refused.statusCode).toBe(502);
      expect(refused.json()).not.toHaveProperty('value');
    }
    status = 500; body = qnameFault(version);
    const fault = await post(qnameInput);
    expect(fault.statusCode).toBe(502);
    expect(fault.json()).toMatchObject({fault: {name: 'NameError'}, value: qnameFaultValue});
    await writeFile(source, original + '\n<!-- stale artifact -->\n');
    expect((await post(qnameInput)).statusCode).toBe(500);
    expect(requests).toHaveLength(6);
  } finally {
    await app.close();
    if (upstream.listening) {
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
    }
    await rm(root, {recursive: true, force: true});
  }
});

it('reserves scoped prefixes before constructing QName attributes, text and nil descendants', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'reservations-'));
  try {
    const source = path.join(root, 'qnames.wsdl');
    const original = await readFile(fixture, 'utf8');
    await writeFile(source, original.replace('name="code" type="xs:QName"', 'name="code" type="t:QNameOrWord"')
      .replace('</xs:sequence></xs:complexType>', '</xs:sequence><xs:attribute name="primary" type="xs:QName" use="required"/></xs:complexType>'));
    const selected = await selectComponentOperation(source, {portType: {namespace, local: 'QNamePortType'},
      binding: {namespace, local: 'Soap11'}, operation: 'Exchange'}, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const input = {...qnameInput, primary: {namespace: 'urn:attribute', local: 'Entry'},
      text: {...qnameInput.text, code: {$value: 'q0:Entry', $namespaces: {q0: 'urn:code'}}},
      literal: {$value: 'q0:Unbound', $namespaces: {}}};
    const encoded = encodeComponentXml(contract, mapping, input);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value: input}});
  } finally {await rm(root, {recursive: true, force: true});}
});

it.each(['scoped', 'expanded', 'list'] as const)('keeps an exact %s default implicit when instance text uses different bindings', async variant => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'defaults-'));
  try {
    const source = path.join(root, 'qnames.wsdl');
    const original = await readFile(fixture, 'utf8');
    const text = original.replace('<xs:extension base="xs:QName">', '<xs:extension base="t:QNameOrWord">');
    const seedSource = variant === 'scoped' ? 'type="t:QNameOrWord" default="d:Seed"'
      : variant === 'expanded' ? 'type="xs:QName" default="Seed"' : 'type="t:QNameList" default="Seed d:Entry"';
    await writeFile(source, text.replace('type="xs:QName" default="d:Seed"', seedSource));
    const selected = await selectComponentOperation(source, {portType: {namespace, local: 'QNamePortType'},
      binding: {namespace, local: 'Soap11'}, operation: 'Exchange'}, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const seed = variant === 'scoped' ? {$value: 'd:Seed', $namespaces: {d: 'urn:owned:declaration'}}
      : variant === 'expanded' ? {namespace: '', local: 'Seed'} : [{namespace: '', local: 'Seed'}, qnameInput.fixedName];
    const input = {...qnameInput, text: {code: qnameInput.text.code,
      $value: variant === 'scoped' ? {$value: 'd:Text', $namespaces: {d: 'urn:instance'}} : {$value: 'Local', $namespaces: {'': 'urn:instance'}},
      seed}};
    const encoded = encodeComponentXml(contract, mapping, input);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(Buffer.from(encoded.bytes).toString()).not.toContain('seed=');
    expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value: input}});
  } finally {await rm(root, {recursive: true, force: true});}
});

it('keeps exact schema-defaulted QName text implicit beside an instance-scoped attribute', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'default-text-'));
  try {
    const source = path.join(root, 'qnames.wsdl');
    const original = await readFile(fixture, 'utf8');
    await writeFile(source, original.replace('<xs:extension base="xs:QName">', '<xs:extension base="t:QNameOrWord">')
      .replace('name="code" type="xs:QName"', 'name="code" type="t:QNameOrWord"')
      .replace('name="text" type="t:NamedText"', 'name="text" type="t:NamedText" default="d:Text"'));
    const selected = await selectComponentOperation(source, {portType: {namespace, local: 'QNamePortType'},
      binding: {namespace, local: 'Soap11'}, operation: 'Exchange'}, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const input = {...qnameInput, text: {code: {$value: 'd:Code', $namespaces: {d: 'urn:instance'}},
      $value: {$value: 'd:Text', $namespaces: {d: 'urn:owned:declaration'}}}};
    const encoded = encodeComponentXml(contract, mapping, input);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(Buffer.from(encoded.bytes).toString()).toContain('code="d:Code"></');
    expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value: input}});
  } finally {await rm(root, {recursive: true, force: true});}
});

it('round trips an empty QName namespace inside an inherited nonempty default scope', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'scope-'));
  const source = path.join(root, 'qnames.wsdl');
  try {
    const original = await readFile(fixture, 'utf8');
    await writeFile(source, original.replace('</xs:sequence></xs:complexType>',
      '</xs:sequence><xs:anyAttribute namespace="##other" processContents="lax"/></xs:complexType>'));
    const selector = {portType: {namespace, local: 'QNamePortType'}, binding: {namespace, local: 'Soap11'}, operation: 'Exchange'};
    const selected = await selectComponentOperation(source, selector, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const raw = `<t:Exchange xmlns:t="${namespace}" xmlns="urn:parent" xmlns:d="urn:owned:declaration"><t:fixedName>d:Entry</t:fixedName>`
      + '<t:words xmlns="">Local</t:words><t:text xmlns="" code="Code">Text</t:text><t:selected>1</t:selected><t:choices>0</t:choices><t:literal>loose:Entry</t:literal></t:Exchange>';
    const first = decodeComponentXml(contract, mapping, Buffer.from(raw));
    if (first.kind !== 'component-decoded' || !('value' in first.validated)) throw new Error(first.kind);
    expect(first.validated.value).toMatchObject({$namespaces: {'': 'urn:parent'}, words: [{namespace: '', local: 'Local'}],
      text: {$value: {namespace: '', local: 'Text'}, code: {namespace: '', local: 'Code'}}});
    const encoded = encodeComponentXml(contract, mapping, first.validated.value);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    const second = decodeComponentXml(contract, mapping, encoded.bytes);
    expect(second).toMatchObject({kind: 'component-decoded', validated: {value: first.validated.value}});
  } finally {await rm(root, {recursive: true, force: true});}
});

it('keeps decoded strict wildcard QName attributes valid in generated HTTP and in the XML inverse', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'wildcard-'));
  const source = path.join(root, 'qnames.wsdl');
  try {
    const original = await readFile(fixture, 'utf8');
    const variant = original.replace('</xs:sequence></xs:complexType>',
      '</xs:sequence><xs:attribute name="fixedName" type="xs:QName"/><xs:anyAttribute namespace="##local" processContents="strict"/></xs:complexType>')
      .replace('</wsdl:types>', '<xs:schema><xs:attribute name="ambient" type="xs:QName"/></xs:schema></wsdl:types>');
    await writeFile(source, variant);
    const selector = {portType: {namespace, local: 'QNamePortType'}, binding: {namespace, local: 'Soap11'}, operation: 'Exchange'};
    const selection = {service: {namespace, local: 'QNameService'}, port: 'Port11'};
    const selected = await selectComponentOperation(source, selector, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const incoming = `<t:Exchange xmlns:t="${namespace}" xmlns:d="urn:owned:declaration" fixedName="d:Name" ambient="d:Other">`
      + '<t:fixedName>d:Entry</t:fixedName><t:words>d:Entry</t:words><t:text code="d:Entry">d:Text</t:text>'
      + '<t:selected>1</t:selected><t:choices>0</t:choices><t:literal>loose:Entry</t:literal></t:Exchange>';
    const decoded = decodeComponentXml(contract, mapping, Buffer.from(incoming));
    if (decoded.kind !== 'component-decoded') throw new Error(decoded.rule);
    const {value} = decoded.validated;
    expect(value).toMatchObject({$attributes: [{ambient: {namespace: 'urn:owned:declaration', local: 'Other'}},
      {fixedName: {namespace: 'urn:owned:declaration', local: 'Name'}}]});
    const gateway = path.join(root, 'gateway');
    await runGenerationPipeline({wsdl: source, model: 'checked-components-v1', checkedComponents: selection,
      clientOutDir: path.join(root, 'client'), gateway: {outDir: gateway, serviceSlug: 'qnames', versionSlug: 'v1'},
      openapi: {outFile: path.join(root, 'openapi.json')}});
    const schemas = JSON.parse(await readFile(path.join(gateway, 'routes/0/schemas.json'), 'utf8')) as {request: object};
    expect(new Ajv({strict: true}).compile(schemas.request)(value)).toBe(true);
    const encoded = encodeComponentXml(contract, mapping, value);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value}});
  } finally {await rm(root, {recursive: true, force: true});}
});

it('preserves open records and refuses to introduce an alias into a retained wildcard scope', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'protected-'));
  try {
    const source = path.join(root, 'qnames.wsdl');
    const original = await readFile(fixture, 'utf8');
    await writeFile(source, original.replace('</xs:extension></xs:simpleContent>',
      '<xs:anyAttribute namespace="##other" processContents="skip"/></xs:extension></xs:simpleContent>'));
    const selected = await selectComponentOperation(source, {portType: {namespace, local: 'QNamePortType'},
      binding: {namespace, local: 'Soap11'}, operation: 'Exchange'}, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const input = {...qnameInput, $namespaces: {t: namespace, d: 'urn:owned:declaration', e: 'urn:raw',
      i: 'http://www.w3.org/2001/XMLSchema-instance'},
    text: {...qnameInput.text, $attributes: [{ambient: {$namespace: 'urn:raw', $value: 'q0:Thing'}}]}};
    expect(encodeComponentXml(contract, mapping, input)).toMatchObject({kind: 'value-invalid', rule: 'qname-namespace-prefix-required'});
    const valid = {...input, text: {...input.text, $namespaces: {z: 'urn:owned:secondary'}}};
    const encoded = encodeComponentXml(contract, mapping, valid);
    if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
    expect(Buffer.from(encoded.bytes).toString()).toMatch(/<t:text xmlns:z="urn:owned:secondary" e:ambient="q0:Thing" code="d:Entry">z:Text<\/t:text>/);
    expect(decodeComponentXml(contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value: {
      text: {$attributes: input.text.$attributes, $value: qnameInput.text.$value},
    }}});
  } finally {await rm(root, {recursive: true, force: true});}
});

it('checks QName union namespace bindings in the assembled outgoing literal SOAP header', async () => {
  const scratch = path.resolve(verificationPath('tmp/conformance/qnames'));
  await mkdir(scratch, {recursive: true});
  const root = await mkdtemp(path.join(scratch, 'header-'));
  const requests: string[] = [];
  const upstream = createServer(async (request, reply) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(Buffer.concat(chunks).toString());
    reply.writeHead(200, {'Content-Type': 'text/xml'}).end(qnameResponse('11'));
  });
  try {
    const source = path.join(root, 'qnames.wsdl');
    const original = await readFile(fixture, 'utf8');
    await writeFile(source, original.replace('      <xs:element name="NameFault"', '      <xs:element name="NameHeader" type="t:QNameOrWord"/>\n      <xs:element name="NameFault"')
      .replace('  <wsdl:message name="Input">', '  <wsdl:message name="HeaderMessage"><wsdl:part name="name" element="t:NameHeader"/></wsdl:message>\n  <wsdl:message name="Input">')
      .replace('<s:body use="literal"/></wsdl:input>', '<s:body use="literal"/><s:header message="t:HeaderMessage" part="name" use="literal"/></wsdl:input>'));
    const selected = await selectComponentOperation(source, {portType: {namespace, local: 'QNamePortType'},
      binding: {namespace, local: 'Soap11'}, operation: 'Exchange'}, {loading: {policy: {fileRoots: [root]}}});
    if (selected.kind !== 'selected') throw new Error(selected.rule);
    const {contract} = selected, mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
    const header = contract.headers?.find(item => item.direction === 'input');
    if (!header) throw new Error('Expected exact outgoing header');
    upstream.listen(0, '127.0.0.1');
    await once(upstream, 'listening');
    const address = upstream.address();
    if (!address || typeof address === 'string') throw new Error('Expected owned TCP listener');
    const options = {service: {namespace, local: 'QNameService'}, port: 'Port11', endpoint: `http://127.0.0.1:${address.port}/`};
    expect(await exchangeComponentSoap(contract, mapping, qnameInput, {...options,
      headerValues: {[header.id]: {$value: 'soap:Entry', $namespaces: {}}}}))
      .toMatchObject({kind: 'value-invalid', rule: 'qname-header-namespace-scope-changed', phase: 'input'});
    expect(requests).toHaveLength(0);
    expect(await exchangeComponentSoap(contract, mapping, qnameInput, {...options,
      headerValues: {[header.id]: {$value: 'p:Entry', $namespaces: {p: 'urn:owned:header'}}}}))
      .toMatchObject({kind: 'soap-response', decoded: {validated: {value: qnameOutput}}});
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatch(/<[^ >]+:NameHeader[^>]+xmlns:p="urn:owned:header"[^>]*>p:Entry<\//);
  } finally {
    if (upstream.listening) {
      upstream.closeAllConnections();
      await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
    }
    await rm(root, {recursive: true, force: true});
  }
});
