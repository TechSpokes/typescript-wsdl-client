import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {SaxesParser} from 'saxes';
import type {CheckedComponentOptions} from '../../src/index.js';
import type * as operationApi from '../../src/compiler/directOperation.js';
import type * as mappingApi from '../../src/compiler/directValues.js';
import type * as codecApi from '../../src/compiler/directCodec.js';
import type * as loadingApi from '../../src/loader/schemaInput.js';
import {encoderPayload, schema} from './onvif-media-wire.js';
import {selector} from './onvif-media-survey.js';

export async function roundTripMediaEncoders(entry: string, source: string,
  options: Pick<CheckedComponentOptions, 'fileRoots' | 'sourceResources' | 'sourceOrigins'>) {
  const internal = (file: string) => pathToFileURL(path.join(path.dirname(entry), file)).href;
  const {prepareSchemaSnapshotFiles} = await import(internal('loader/schemaInput.js')) as typeof loadingApi;
  const {selectComponentOperation} = await import(internal('compiler/directOperation.js')) as typeof operationApi;
  const {createComponentValueMapping} = await import(internal('compiler/directValues.js')) as typeof mappingApi;
  const {decodeComponentXml, encodeComponentXml} = await import(internal('compiler/directCodec.js')) as typeof codecApi;
  const prepared = await prepareSchemaSnapshotFiles(source, options.sourceResources,
    {policy: {fileRoots: options.fileRoots, allowedOrigins: options.sourceOrigins}});
  const selected = await selectComponentOperation(prepared.source, selector('GetVideoEncoderConfigurations'),
    {loading: prepared.loading, qualificationScope: 'lax-wildcard-operation-v1'});
  if (selected.kind !== 'selected') throw new Error(selected.rule);
  const {contract} = selected;
  const mapping = createComponentValueMapping(contract, {kind: 'output'});
  if (mapping.kind !== 'component-mapping') throw new Error(mapping.rule);
  const decoded = decodeComponentXml(contract, mapping, Buffer.from(encoderPayload));
  if (decoded.kind !== 'component-decoded') throw new Error(decoded.rule);
  const application: unknown = JSON.parse(JSON.stringify(decoded.validated.value));
  const encoded = encodeComponentXml(contract, mapping, application);
  if (encoded.kind !== 'component-encoded') throw new Error(encoded.rule);
  const xml = Buffer.from(encoded.bytes).toString('utf8');
  const sequence: string[] = [];
  const parser = new SaxesParser({xmlns: true});
  let depth = 0;
  parser.on('opentag', node => {
    if (++depth === 3) sequence.push(`{${node.uri}}${node.local}`);
  });
  parser.on('closetag', () => {depth--;});
  parser.write(xml).close();
  const core = ['Name', 'UseCount', 'Encoding', 'Resolution', 'Quality'];
  assert.deepEqual(sequence, [...core, 'H264', 'Multicast', 'SessionTimeout'].map(name => `{${schema}}${name}`)
    .concat('{urn:owned:media-extension}RateControl', [...core, 'Multicast', 'SessionTimeout'].map(name => `{${schema}}${name}`)));
  assert.ok(xml.includes(' 007 &amp; '));
  const second = decodeComponentXml(contract, mapping, encoded.bytes);
  if (second.kind !== 'component-decoded') throw new Error(second.rule);
  assert.deepEqual(JSON.parse(JSON.stringify(second.validated.value)), application);
  return {operation: 'GetVideoEncoderConfigurations', inputXml: encoderPayload, encodedXml: xml, sequence, application};
}
