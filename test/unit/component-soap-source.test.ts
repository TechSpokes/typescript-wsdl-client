import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {selectComponentOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import {prepareComponentSoapWsdl} from '../../src/compiler/directSoapSource.js';
import type {SchemaInputOptions} from '../../src/loader/schemaInput.js';

const namespace = 'urn:conformance:import-relative-types';
const selector = {portType: {namespace, local: 'ImportPortType'}, binding: {namespace, local: 'ImportBinding'}, operation: 'SubmitImported'};
const selection = {service: {namespace, local: 'ImportService'}, port: 'ImportPort'};
let directory: string, root: string, schema: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/component-soap-source', {recursive: true});
  directory = await mkdtemp(path.resolve('tmp/conformance/component-soap-source/suite-'));
  root = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8');
  schema = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8');
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});
async function source(text = root, xsd = schema, extra: Partial<SchemaInputOptions> = {}) {
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

describe('closed original snapshot bootstrap for the existing SOAP dependency', () => {
  it('prepares imported definitions from native retained bytes after original input files are removed', async () => {
    const input = await source(), before = inspectDirectOperation(input.contract).source;
    await rm(input.wsdl); await rm(input.dependency);
    const wsdl = await prepareComponentSoapWsdl(input.contract, selection, () => {});
    expect(wsdl.describeServices()).toHaveProperty('ImportService.ImportPort.SubmitImported');
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
      expect(wsdl.describeServices()).toHaveProperty('ImportService.ImportPort.SubmitImported');
      expect(requests).toBe(0);
    } finally {server.close(); await once(server, 'close');}
  });

  it('refuses dependency reserved names before handing source to the external parser', async () => {
    const input = await source(root.replace('name="payload"', 'name="prototype"'));
    await expect(prepareComponentSoapWsdl(input.contract, selection, () => {})).rejects.toThrow('dependency reserved name');
  });

  it('refuses cyclic resource bootstrap explicitly while native source selection remains valid', async () => {
    const child = await mkdtemp(path.join(directory, 'cycle-'));
    const a = schema.replace('<xs:complexType name="ImportedPayload">', '<xs:include schemaLocation="b.xsd"/><xs:complexType name="ImportedPayload">');
    await writeFile(path.join(child, 'source.wsdl'), root);
    await writeFile(path.join(child, 'import-relative-types-types.xsd'), a);
    await writeFile(path.join(child, 'b.xsd'), '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:conformance:import-relative-types:types"><xs:include schemaLocation="import-relative-types-types.xsd"/></xs:schema>');
    const selected = await selectComponentOperation(path.join(child, 'source.wsdl'), selector, {loading: {policy: {fileRoots: [child]}}});
    if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
    await expect(prepareComponentSoapWsdl(selected.contract, selection, () => {})).rejects.toThrow('cyclic SOAP metadata dependencies');
  });
});
