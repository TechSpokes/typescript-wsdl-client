/** Independent byte/acquisition expectations for portable metadata encoding context.
 * @since 1.7.0
 */
import {verificationPath} from "../helpers/verificationPath.js";
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {SaxesParser} from 'saxes';
import {decodeMetadataXml, parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {SchemaResourceLoader} from '../../src/loader/schemaResources.js';
import {loadSemanticSchemaInput, prepareSchemaSnapshotFiles} from '../../src/loader/schemaInput.js';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {checkedComponentRuntimeV3} from '../../src/client/checkedDirectRuntime.js';
import {inspectSourceCorrectionInventory, prepareCorrectedSourceInputs} from '../../src/compiler/sourceCorrections.js';

const namespace = 'urn:conformance:import-relative-types';
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let directory: string, wsdl: string, schema: string;
beforeAll(async () => {
  await mkdir(verificationPath('tmp/conformance/metadata-authority'), {recursive: true});
  directory = await mkdtemp(path.resolve(verificationPath('tmp/conformance/metadata-authority/suite-')));
  [wsdl, schema] = await Promise.all(['import-relative-types.wsdl', 'import-relative-types-types.xsd']
    .map(file => readFile(path.resolve('test/conformance/fixtures/xsd/imports', file), 'utf8')));
});
afterAll(async () => {await rm(directory, {recursive: true, force: true});});

describe('metadata encoding and independently configured HTTP authority', () => {
  it.each(['US-ASCII', 'ASCII'])('keeps %s strict and preserves XML character references', charset => {
    const bytes = Buffer.from('<?xml version="1.0" encoding="US-ASCII"?><v>&#xE9;</v>');
    expect(decodeMetadataXml(bytes, 'application/xml; charset=' + charset)).toContain('&#xE9;');
    expect(parseOrderedSyntax(bytes, 'urn:owned:metadata', {metadataEncoding: true, metadataContentType: 'text/xml; charset=' + charset}).root.children)
      .toMatchObject([{value: 'é'}]);
    expect(() => decodeMetadataXml(Buffer.from([60, 118, 62, 0xe9, 60, 47, 118, 62]), 'text/xml; charset=' + charset)).toThrow('US-ASCII');
  });
  it.each(['UTF-16LE', 'UTF-16BE'])('requires explicit byte order and validates %s assertions', charset => {
    const encode = (xml: string) => {const bytes = Buffer.from(xml, 'utf16le'); return charset === 'UTF-16BE' ? bytes.swap16() : bytes;};
    expect(decodeMetadataXml(encode('<v>雪</v>'), 'application/xml; charset=' + charset)).toBe('<v>雪</v>');
    expect(decodeMetadataXml(encode(`<?xml version="1.0" encoding="${charset}"?><v>雪</v>`))).toContain('雪');
    expect(() => decodeMetadataXml(encode('<?xml version="1.0" encoding="UTF-16"?><v/>'), 'application/xml; charset=' + charset)).toThrow();
    expect(() => decodeMetadataXml(encode('<v>雪</v>').subarray(0, -1), 'application/xml; charset=' + charset)).toThrow();
    expect(() => decodeMetadataXml(encode('<v>雪</v>'), 'application/xml; charset=UTF-16')).toThrow();
  });
  it('retains Latin1 identity and refuses contradictory, unknown, empty and repeated charset assertions', () => {
    const bytes = Buffer.from('<v>café\u0080</v>', 'latin1');
    expect(decodeMetadataXml(bytes, 'application/xml; charset="ISO-8859-1"')).toBe('<v>café\u0080</v>');
    for (const contentType of ['text/xml; charset=windows-1252', 'text/xml; charset=""',
      'text/xml; charset=utf-8; charset=ISO-8859-1']) expect(() => decodeMetadataXml(bytes, contentType)).toThrow();
    expect(() => decodeMetadataXml(Buffer.from('<?xml version="1.0" encoding="UTF-8"?><v/>'), 'text/xml; charset=ISO-8859-1')).toThrow();
    expect(() => decodeMetadataXml(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]), 'text/xml; charset=ISO-8859-1')).toThrow();
    expect(decodeMetadataXml(Buffer.from('<v/>'), 'application/xml; note="; charset=not-an-assertion"; charset=UTF-8')).toBe('<v/>');
  });
  it.each(['text/xml; charset=', 'text/xml; charset', 'text/xml; charset=""', 'text/xml; charset="UTF-8',
    'text/xml; charset=UTF-8 junk', 'text/xml; charset@=UTF-8', 'text/xml, text/xml',
    'text/xml; charset=UTF-8, text/xml; charset=UTF-8'])('refuses malformed or coalesced metadata authority %s', contentType => {
    expect(() => decodeMetadataXml(Buffer.from('<v/>'), contentType)).toThrow('Invalid metadata HTTP Content-Type');
  });
  it('preserves absent charset and unrelated valid parameters', () => {
    for (const contentType of ['text/xml', 'text/xml; profile=owned', 'application/xml; note="a,b; charset=ignored"',
      'text/xml; note="escaped\\\"; charset=ignored"']) expect(decodeMetadataXml(Buffer.from('<v/>'), contentType)).toBe('<v/>');
  });
  it('refuses duplicate Content-Type fields after HTTP acquisition coalesces them', async () => {
    const source = createServer((_request, reply) => {
      reply.writeHead(200, {'Content-Type': ['application/xml; charset=UTF-8', 'application/xml; charset=UTF-8']});
      reply.end('<x:schema xmlns:x="http://www.w3.org/2001/XMLSchema"/>');
    });
    source.listen(0, '127.0.0.1'); await once(source, 'listening');
    const address = source.address(); if (!address || typeof address === 'string') throw new Error('Owned metadata address required');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      await expect(loadSemanticSchemaInput(origin + '/source.xsd', {policy: {allowedOrigins: [origin]}}))
        .rejects.toThrow('Invalid metadata HTTP Content-Type');
    } finally {source.closeAllConnections(); await new Promise<void>(resolve => source.close(() => resolve()));}
  });
  it('refuses different encoding contexts on aliases of the same original bytes', async () => {
    const bytes = Buffer.from('<v/>'), canonical = 'https://metadata.invalid/original.xml', alias = 'https://metadata.invalid/alias.xml';
    const loader = await SchemaResourceLoader.create({allowedOrigins: ['https://metadata.invalid']}, undefined, new Map([
      [canonical, {bytes, digest: digest(bytes), contentType: 'application/xml; charset=UTF-8'}],
      [alias, {bytes, digest: digest(bytes), canonicalUri: canonical, contentType: 'application/xml; charset=ISO-8859-1'}],
    ]));
    await loader.fetchResource(canonical);
    await expect(loader.fetchResource(alias)).rejects.toThrow(/Conflicting/);
  });
  it('recovers an independently supplied physical root context without deriving it from a capsule', async () => {
    const root = await mkdtemp(path.join(directory, 'physical-')), file = path.join(root, 'root.xsd');
    const bytes = Buffer.from('<x:schema xmlns:x="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:é"/>', 'utf16le');
    await writeFile(file, bytes);
    const logical = 'https://metadata.invalid/companion.xsd';
    const prepared = await prepareSchemaSnapshotFiles(file, [{uri: logical, file, contentType: 'application/xml; charset=UTF-16LE'}], {policy: {fileRoots: [root]}});
    const input = await loadSemanticSchemaInput(prepared.source, prepared.loading);
    expect(input.schemas[0]!.targetNamespace).toBe('urn:é');
    expect(input.resources[0]).toMatchObject({uri: pathToFileURL(file).href, digest: digest(bytes), contentType: 'application/xml; charset=UTF-16LE'});
    await expect(prepareSchemaSnapshotFiles(file, [{uri: logical, file, contentType: 'application/xml; charset=UTF-16LE'},
      {uri: logical + '?other', file, contentType: 'application/xml; charset=UTF-8'}], {policy: {fileRoots: [root]}})).rejects.toThrow('Conflicting physical snapshot');
    const rootContext = {uri: pathToFileURL(file).href, file, contentType: 'application/xml; charset=UTF-16LE'};
    await expect(prepareSchemaSnapshotFiles(file, [rootContext, rootContext], {policy: {fileRoots: [root]}}))
      .rejects.toThrow('Duplicate logical schema snapshot');
    await expect(prepareSchemaSnapshotFiles(file, [{uri: rootContext.uri, file}], {policy: {fileRoots: [root]}}))
      .rejects.toThrow('Duplicate logical schema snapshot');
  });
  it('retains original header-only context while explicitly encoding corrected snapshots as UTF-8', async () => {
    const uri = 'https://metadata.invalid/corrected.xsd';
    const xml = '<x:schema xmlns:x="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:metadata"><x:element name="Root"><x:complexType><x:sequence><x:element name="Value" type="x:string"/></x:sequence></x:complexType></x:element></x:schema>';
    const bytes = Buffer.from(xml, 'utf16le');
    const input = await loadSemanticSchemaInput(uri, {policy: {allowedOrigins: ['https://metadata.invalid']},
      offlineResources: new Map([[uri, {bytes, digest: digest(bytes), contentType: 'application/xml; charset=UTF-16LE'}]])});
    const inventory = inspectSourceCorrectionInventory([input]);
    const target = inventory.nodes.find(node => node.kind === 'particle' && node.attributes.some(attribute => attribute.name === 'name' && attribute.value === 'Value'));
    if (!target) throw new Error('Owned correction target required');
    const corrected = prepareCorrectedSourceInputs([input], {version: 1,
      resources: inventory.resources.map(({uri, digest}) => ({uri, digest})),
      corrections: [{kind: 'set-occurs', target: {id: target.id, uri: target.uri, digest: target.digest}, min: '0', max: '1'}]});
    const effective = corrected.resources.get(uri)!;
    expect(effective.contentType).toBe('application/xml;charset=utf-8');
    expect(decodeMetadataXml(effective.bytes, effective.contentType)).toContain('minOccurs="0"');
    expect(input.resources[0]).toMatchObject({digest: digest(bytes), contentType: 'application/xml; charset=UTF-16LE'});
    expect(bytes).toEqual(Buffer.from(xml, 'utf16le'));
  });
  it.each(['http', 'file'] as const)('persists %s mixed header-only encodings into relocated generated runtime authority and original byte pins', async transport => {
    const root = await mkdtemp(path.join(directory, 'generated-')), project = path.join(root, 'project');
    const rootBytes = Buffer.from(wsdl.replace(/^<\?xml[^?]*\?>\s*/, '').replace('<wsdl:types>', '<wsdl:documentation>café</wsdl:documentation><wsdl:types>'), 'latin1');
    const schemaBytes = Buffer.from(schema.replace(/^<\?xml[^?]*\?>\s*/, '').replace('name="name"', 'name="nomÉ"'), 'utf16le');
    let metadataCalls = 0;
    const source = createServer((request, reply) => {
      metadataCalls++;
      const dependency = request.url?.endsWith('.xsd');
      reply.writeHead(200, {'Content-Type': dependency ? 'application/xml; charset=UTF-16LE' : 'application/wsdl+xml; charset=ISO-8859-1'});
      reply.end(dependency ? schemaBytes : rootBytes);
    });
    source.listen(0, '127.0.0.1'); await once(source, 'listening');
    const address = source.address(); if (!address || typeof address === 'string') throw new Error('Owned metadata address required');
    const origin = `http://127.0.0.1:${address.port}`;
    const sourceFile = path.join(root, 'source.wsdl'), schemaFile = path.join(root, 'import-relative-types-types.xsd');
    if (transport === 'file') await Promise.all([writeFile(sourceFile, rootBytes), writeFile(schemaFile, schemaBytes)]);
    try {
      await runGenerationPipeline({model: 'checked-components-v1', wsdl: transport === 'http' ? origin + '/source.wsdl' : sourceFile, clientOutDir: path.join(project, 'client'),
        gateway: {outDir: path.join(project, 'gateway'), serviceSlug: 'metadata', versionSlug: 'v1'}, openapi: {outFile: path.join(project, 'openapi.json')},
        checkedComponents: {sourceOrigins: transport === 'http' ? [origin] : [], ...(transport === 'file' ? {fileRoots: [root], sourceResources: [
          {uri: pathToFileURL(sourceFile).href, file: sourceFile, contentType: 'application/wsdl+xml; charset=ISO-8859-1'},
          {uri: pathToFileURL(schemaFile).href, file: schemaFile, contentType: 'application/xml; charset=UTF-16LE'},
        ]} : {}), selectors: [{portType: {namespace, local: 'ImportPortType'},
          binding: {namespace, local: 'ImportBinding'}, operation: 'SubmitImported'}], service: {namespace, local: 'ImportService'}, port: 'ImportPort'}});
    } finally {source.closeAllConnections(); await new Promise<void>(resolve => source.close(() => resolve()));}
    if (transport === 'http') expect(metadataCalls).toBeGreaterThanOrEqual(2);
    else expect(metadataCalls).toBe(0);
    const relocated = path.join(root, 'relocated'); await rename(project, relocated);
    if (transport === 'file') await Promise.all([rm(sourceFile), rm(schemaFile)]);
    const client = path.join(relocated, 'client');
    const saved = JSON.parse(await readFile(path.join(client, 'source-resources.json'), 'utf8')) as {
      resources: {file: string; digest: string; contentType?: string}[];
      runtime: {localSource: string; fileRoots: string[]; sourceOrigins: string[]; sourceUri?: string; capsuleFiles: Record<string, string>;
        sourceResources: {uri: string; file: string; canonicalUri?: string; contentType?: string}[]};
    };
    expect(saved.resources.map(resource => resource.digest).sort()).toEqual([digest(rootBytes), digest(schemaBytes)].sort());
    for (const resource of saved.resources) {
      expect(digest(await readFile(path.join(client, resource.file)))).toBe(resource.digest); expect(resource.contentType).toContain('charset=');
    }
    const capsule = await readFile(path.join(client, saved.runtime.capsuleFiles.SubmitImported!));
    const pinned = JSON.parse(capsule.toString()) as {resources: {contentType?: string}[]};
    expect(pinned.resources.every(resource => resource.contentType?.includes('charset='))).toBe(true);
    let calls = 0, observedXml = '';
    const upstream = createServer(async (request, reply) => {
      let xml = ''; for await (const chunk of request) xml += String(chunk);
      observedXml = xml; calls++;
      reply.writeHead(200, {'Content-Type': 'text/xml'});
      reply.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><t:SubmitImportedResponse xmlns:t="${namespace}"><t:accepted>true</t:accepted></t:SubmitImportedResponse></s:Body></s:Envelope>`);
    });
    upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
    const endpoint = upstream.address(); if (!endpoint || typeof endpoint === 'string') throw new Error('Owned SOAP address required');
    const logical = (value: string) => /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) ? value : pathToFileURL(path.resolve(client, value)).href;
    const options = {localSource: path.join(client, saved.runtime.localSource), fileRoots: saved.runtime.fileRoots.map(file => path.resolve(client, file)),
      sourceResources: saved.runtime.sourceResources.map(resource => ({...resource, uri: logical(resource.uri), file: path.join(client, resource.file),
        ...(resource.canonicalUri === undefined ? {} : {canonicalUri: logical(resource.canonicalUri)})})),
      sourceOrigins: saved.runtime.sourceOrigins, ...(saved.runtime.sourceUri === undefined ? {} : {sourceUri: saved.runtime.sourceUri}), capsule,
      soap: {service: {namespace, local: 'ImportService'}, port: 'ImportPort', endpoint: `http://127.0.0.1:${endpoint.port}/soap`}};
    try {
      const response = await checkedComponentRuntimeV3.execute(capsule.toString('base64'), {payload: {nomÉ: 'café'}}, options, checkedComponentRuntimeV3.version);
      expect(response, JSON.stringify(response)).toMatchObject({kind: 'soap-response', value: {accepted: true}}); expect(calls).toBe(1);
      const stack: {namespace: string; local: string; text: string}[] = [], fields: typeof stack = [];
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => {stack.push({namespace: tag.uri, local: tag.local, text: ''});});
      parser.on('text', text => {if (stack.length) stack.at(-1)!.text += text;});
      parser.on('closetag', () => {const field = stack.pop()!; if (field.local === 'nomÉ') fields.push(field);});
      parser.write(observedXml).close();
      expect(fields).toEqual([{namespace: namespace + ':types', local: 'nomÉ', text: 'café'}]);
      const refused = await checkedComponentRuntimeV3.execute(capsule.toString('base64'), {payload: {nomÉ: 'café'}}, {...options,
        sourceResources: options.sourceResources.map(resource => ({...resource, contentType: 'application/xml; charset=UTF-8'}))}, checkedComponentRuntimeV3.version);
      expect(refused.kind).not.toBe('soap-response'); expect(calls).toBe(1);
    } finally {upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve()));}
  });
});
