import {verificationPath} from "../helpers/verificationPath.js";
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {selectComponentOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {prepareComponentSoapWsdl} from '../../src/compiler/directSoapSource.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {exchangeComponentSoap} from '../../src/compiler/directSoap.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {SaxesParser} from 'saxes';
import type {SchemaInputOptions} from '../../src/loader/schemaInput.js';

const namespace = 'urn:conformance:import-relative-types';
const selector = {portType: {namespace, local: 'ImportPortType'}, binding: {namespace, local: 'ImportBinding'}, operation: 'SubmitImported'};
const selection = {service: {namespace, local: 'ImportService'}, port: 'ImportPort'};
let directory: string, root: string, schema: string;
beforeAll(async () => {
  await mkdir(verificationPath('tmp/conformance/component-soap-source'), {recursive: true});
  directory = await mkdtemp(path.resolve(verificationPath('tmp/conformance/component-soap-source/suite-')));
  root = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8');
  schema = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8');
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function source(text: string | Uint8Array = root, xsd: string | Uint8Array = schema, extra: Partial<SchemaInputOptions> = {}) {
  const child = await mkdtemp(path.join(directory, 'case-'));
  const wsdl = path.join(child, 'source.wsdl'), dependency = path.join(child, 'import-relative-types-types.xsd');
  await writeFile(wsdl, text); await writeFile(dependency, xsd);
  const offline = extra.offlineResources ? new Map(extra.offlineResources) : undefined;
  if (offline) {
    const bytes = Buffer.from(text);
    offline.set(pathToFileURL(wsdl).href, {bytes, digest: createHash('sha256').update(bytes).digest('hex')});
  }
  const result = await selectComponentOperation(wsdl, selector, {loading: {policy: {fileRoots: [child]}, ...extra,
    ...(offline ? {offlineResources: offline} : {})}});
  if (result.kind !== 'selected') throw new Error(result.kind + ':' + result.rule);
  return {contract: result.contract, wsdl, dependency, child};
}

async function exercise(contract: DirectOperationContract, value: unknown, expectedNames: string[], soapSelection = selection) {
  let captured = '';
  const server = createServer(async (request, response) => {
    for await (const chunk of request) captured += String(chunk);
    expect(request.headers.soapaction).toBe('"urn:SubmitImported"');
    response.writeHead(200, {'content-type': 'text/xml'});
    response.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><t:SubmitImportedResponse xmlns:t="${namespace}"><t:accepted>true</t:accepted></t:SubmitImportedResponse></s:Body></s:Envelope>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
  try {
    const mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
    expect(await exchangeComponentSoap(contract, mapping, value, {...soapSelection, endpoint: `http://127.0.0.1:${address.port}/owned`}))
      .toMatchObject({kind: 'soap-response', decoded: {validated: {value: {accepted: true}}}});
    const names: string[] = [], parser = new SaxesParser({xmlns: true});
    parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.write(captured).close();
    expect(names).toEqual(['{http://schemas.xmlsoap.org/soap/envelope/}Envelope', '{http://schemas.xmlsoap.org/soap/envelope/}Body',
      `{${namespace}}SubmitImported`, ...expectedNames]);
  } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
}

describe('closed original snapshot bootstrap for the existing SOAP dependency', () => {
  it.each(['latin1', 'utf16le', 'utf16be'] as const)('prepares independently decoded %s metadata without changing original bytes', async encoding => {
    const encode = (xml: string, kind: typeof encoding): Buffer => {
      if (kind === 'latin1') return Buffer.from(xml.replace('encoding="utf-8"', 'encoding="ISO-8859-1"'), 'latin1');
      const le = Buffer.concat([Buffer.from([255, 254]), Buffer.from(xml.replace('encoding="utf-8"', 'encoding="UTF-16"'), 'utf16le')]);
      return kind === 'utf16be' ? le.swap16() : le;
    };
    const rootBytes = encode(root.replace('name="payload"', 'name="données"').replaceAll('ImportedPayload', 'ChargeÉ'), encoding);
    const schemaBytes = encode(schema.replaceAll('ImportedPayload', 'ChargeÉ').replace('name="name"', 'name="prénom"'), encoding === 'latin1' ? 'utf16be' : 'latin1');
    const input = await source(rootBytes, schemaBytes);
    const wsdl = await prepareComponentSoapWsdl(input.contract, selection, () => {});
    expect(wsdl.describeServices()).toHaveProperty('CheckedService.CheckedPort.Invoke');
    await exercise(input.contract, {'données': {'prénom': 'owned'}}, [`{${namespace}}données`, '{urn:conformance:import-relative-types:types}prénom']);
    expect(await readFile(input.wsdl)).toEqual(rootBytes);
    expect(await readFile(input.dependency)).toEqual(schemaBytes);
    expect(inspectDirectOperation(input.contract).source.resources.map(resource => resource.digest).sort()).toEqual(
      [rootBytes, schemaBytes].map(bytes => createHash('sha256').update(bytes).digest('hex')).sort());
  });

  it('prepares imported definitions from native retained bytes after original input files are removed', async () => {
    const input = await source(), before = inspectDirectOperation(input.contract).source;
    await rm(input.wsdl); await rm(input.dependency);
    const wsdl = await prepareComponentSoapWsdl(input.contract, selection, () => {});
    expect(wsdl.describeServices()).toHaveProperty('CheckedService.CheckedPort.Invoke');
    await exercise(input.contract, {payload: {name: 'owned'}}, [`{${namespace}}payload`, '{urn:conformance:import-relative-types:types}name']);
    expect(inspectDirectOperation(input.contract).source).toBe(before);
    await expect(prepareComponentSoapWsdl(input.contract, {...selection, port: 'OtherPort'}, () => {})).rejects.toThrow('SOAP port mismatch');
    await expect(prepareComponentSoapWsdl({...input.contract}, selection, () => {})).rejects.toThrow(TypeError);
  });

  it('uses the authorized HTTP schema snapshot without metadata GETs or dependency fallback', async () => {
    let requests = 0;
    const server = createServer((_request, response) => {requests++; response.end('unavailable');});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned address required');
    const origin = `http://127.0.0.1:${address.port}`, uri = origin + '/types.xsd';
    const bytes = Buffer.from(schema), digest = createHash('sha256').update(bytes).digest('hex');
    try {
      const input = await source(root.replace('schemaLocation="import-relative-types-types.xsd"', `schemaLocation="${uri}"`), schema,
        {policy: {fileRoots: [directory], allowedOrigins: [origin]}, offlineResources: new Map([[uri, {bytes, digest}]])});
      const wsdl = await prepareComponentSoapWsdl(input.contract, selection, () => {});
      expect(wsdl.describeServices()).toHaveProperty('CheckedService.CheckedPort.Invoke');
      expect(requests).toBe(0);
    } finally {server.close(); await once(server, 'close');}
  });

  it.each(['prototype', 'constructor', '__proto__', 'toString'])('executes legal source name %s without exposing dependency maps', async name => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype);
    const input = await source(root.replace('name="payload"', `name="${name}"`).replaceAll('type="types:', 'type="constructor:').replace('xmlns:types=', 'xmlns:constructor='));
    await exercise(input.contract, Object.fromEntries([[name, {name: 'owned'}]]), [`{${namespace}}${name}`, '{urn:conformance:import-relative-types:types}name']);
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before);
  });

  it('executes a cyclic graph already qualified by native source owners', async () => {
    const child = await mkdtemp(path.join(directory, 'cycle-'));
    const a = schema.replace('<xs:complexType name="ImportedPayload">', '<xs:include schemaLocation="b.xsd"/><xs:complexType name="ImportedPayload">');
    await writeFile(path.join(child, 'source.wsdl'), root);
    await writeFile(path.join(child, 'import-relative-types-types.xsd'), a);
    await writeFile(path.join(child, 'b.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:conformance:import-relative-types:types"><xs:include schemaLocation="import-relative-types-types.xsd"/></xs:schema>');
    const selected = await selectComponentOperation(path.join(child, 'source.wsdl'), selector, {loading: {policy: {fileRoots: [child]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
    await exercise(selected.contract, {payload: {name: 'owned'}}, [`{${namespace}}payload`, '{urn:conformance:import-relative-types:types}name']);
  });
  it('selects an imported service through a cyclic WSDL graph without dependency fetching', async () => {
    const child = await mkdtemp(path.join(directory, 'wsdl-cycle-'));
    const serviceNamespace = namespace + ':service';
    const service = /<wsdl:service[\s\S]*?<\/wsdl:service>/.exec(root)![0];
    const main = root.replace(service, '').replace('<wsdl:types>', `<wsdl:import namespace="${serviceNamespace}" location="service.wsdl"/><wsdl:types>`);
    const companion = `<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:tns="${namespace}" targetNamespace="${serviceNamespace}"><wsdl:import namespace="${namespace}" location="source.wsdl"/>${service}</wsdl:definitions>`;
    await writeFile(path.join(child, 'source.wsdl'), main); await writeFile(path.join(child, 'service.wsdl'), companion);
    await writeFile(path.join(child, 'import-relative-types-types.xsd'), schema);
    const selected = await selectComponentOperation(path.join(child, 'source.wsdl'), selector, {loading: {policy: {fileRoots: [child]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
    await exercise(selected.contract, {payload: {name: 'owned'}}, [`{${namespace}}payload`, '{urn:conformance:import-relative-types:types}name'],
      {service: {namespace: serviceNamespace, local: 'ImportService'}, port: 'ImportPort'});
  });
  it('retains native RPC bytes when dispatch uses a safe private method alias', async () => {
    const file = path.resolve('test/conformance/fixtures/assessment/rpc-strings.wsdl'), ns = 'urn:rpc:strings';
    const selected = await selectComponentOperation(file, {portType: {namespace: ns, local: 'StringsPortType'}, binding: {namespace: ns, local: 'StringsBinding'}, operation: 'Echo'},
      {loading: {policy: {fileRoots: [path.dirname(file)]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind);
    const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
    let captured = '';
    const server = createServer(async (request, response) => {
      for await (const chunk of request) captured += String(chunk);
      expect(request.headers.soapaction).toBe('"urn:rpc:strings#Echo"');
      response.writeHead(200, {'content-type': 'text/xml'});
      response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><r:EchoResponse xmlns:r="urn:rpc:body"><result>owned</result></r:EchoResponse></s:Body></s:Envelope>');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned port required');
    try {
      expect(await exchangeComponentSoap(selected.contract, mapping, {first: 'A', second: 'B'}, {service: {namespace: ns, local: 'Strings'}, port: 'StringsPort', endpoint: `http://127.0.0.1:${address.port}/owned`}))
        .toMatchObject({kind: 'soap-response', decoded: {validated: {value: {result: 'owned'}}}});
      const names: string[] = [], parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`)); parser.write(captured).close();
      expect(names).toContain('{urn:rpc:body}Echo'); expect(captured).not.toContain('<Invoke');
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
  });
});
