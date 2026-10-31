import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {Socket} from 'node:net';
import path from 'node:path';
import {SaxesParser} from 'saxes';
import type {SaxesTagNS} from 'saxes';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {assessSchemaSource, serializeAssessmentReport} from '../../src/compiler/checkedAssessment.js';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';

const root = path.resolve('test/conformance/fixtures/wsdl/real-services/noaa-ndfd');
const source = path.join(root, 'ndfd-xml.wsdl');
const namespace = 'http://localhost/xml/wsdl/ndfdXML.wsdl';
const wsdl = 'http://schemas.xmlsoap.org/wsdl/';
const xsd = 'http://www.w3.org/2001/XMLSchema';
const soap = 'http://schemas.xmlsoap.org/wsdl/soap/';
const selector = {
  portType: {namespace, local: 'ndfdXMLPortType'},
  binding: {namespace, local: 'ndfdXMLBinding'},
  operation: 'LatLonListZipCode',
};
const loading = {policy: {fileRoots: [root]}};

/** Independent metadata inspection only; never supplies a native plan or validity decision.
 * @why #398 requires the original provider source and an oracle independent of generator output.
 */
function tags(bytes: Buffer): SaxesTagNS[] {
  const result: SaxesTagNS[] = [];
  const scopes: Record<string, string>[] = [{}];
  const parser = new SaxesParser({xmlns: true});
  parser.on('opentag', tag => {
    const ns = {...scopes.at(-1), ...tag.ns};
    scopes.push(ns);
    result.push({...tag, ns});
  });
  parser.on('closetag', () => {scopes.pop();});
  parser.on('doctype', () => {throw new Error('Unexpected DTD in provider evidence');});
  parser.on('error', error => {throw error;});
  parser.write(bytes.toString('latin1')).close();
  return result;
}

afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

describe('NOAA NDFD original-source one-operation qualification', () => {
  it('pins original source and independent provider request bytes without newline or encoding rewriting', async () => {
    const provenance = JSON.parse(await readFile(path.join(root, 'provenance.json'), 'utf8'));
    for (const resource of [provenance.source, provenance.independentRequest]) {
      const bytes = await readFile(path.join(root, resource.path));
      expect(bytes.length).toBe(resource.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(resource.sha256);
      expect(bytes.toString('latin1')).toMatch(/^<\?xml version="1.0" encoding="ISO-8859-1"\?>/);
      expect(tags(bytes).length).toBeGreaterThan(0);
    }
    expect(provenance.selector).toEqual(selector);
    expect(provenance.permission.basis).toContain('public domain');
  });

  it('inventories every dependency edge without inventing schema locations or dereferencing namespaces', async () => {
    const nodes = tags(await readFile(source));
    const edges = nodes.filter(node =>
      node.uri === xsd && ['import', 'include', 'redefine'].includes(node.local) ||
      node.uri === wsdl && node.local === 'import');
    expect(edges.map(node => ({kind: node.local, namespace: node.attributes.namespace?.value,
      location: node.attributes.schemaLocation?.value ?? node.attributes.location?.value}))).toEqual([
      {kind: 'import', namespace: 'http://schemas.xmlsoap.org/soap/encoding/', location: undefined},
      {kind: 'import', namespace: wsdl, location: undefined},
    ]);
    // @why Namespace-only imports are declarations, not implicit permission to fetch those URLs.
    const componentReferenceAttributes = new Set(['type', 'base', 'ref', 'itemType', 'memberTypes', 'substitutionGroup', 'refer', 'message', 'binding', 'element']);
    for (const node of nodes) for (const attribute of Object.values(node.attributes)) {
      if (attribute.uri !== '' || !componentReferenceAttributes.has(attribute.local)) continue;
      for (const value of attribute.value.split(/\s+/)) {
        const prefix = value.includes(':') ? value.split(':')[0]! : '';
        expect([xsd, namespace]).toContain(node.ns[prefix]);
      }
    }
    expect(nodes.filter(node => node.uri === xsd && node.local === 'schema')).toHaveLength(1);
  });

  it('records RPC/encoded typed parts, no declared faults, and the independent request discrepancy', async () => {
    const nodes = tags(await readFile(source));
    const binding = nodes.findIndex(node => node.uri === wsdl && node.local === 'binding');
    expect(nodes[binding]?.attributes).toMatchObject({name: {value: 'ndfdXMLBinding'}, type: {value: 'tns:ndfdXMLPortType'}});
    expect(nodes[binding + 1]).toMatchObject({uri: soap, local: 'binding', attributes: {style: {value: 'rpc'}}});
    const request = nodes.findIndex(node => node.uri === wsdl && node.local === 'message' && node.attributes.name?.value === 'LatLonListZipCodeRequest');
    expect(nodes.slice(request + 1, request + 4).map(node => [node.attributes.name?.value, node.attributes.type?.value])).toEqual([
      ['zipCodeList', 'xsd:string'], ['XMLformat', 'xsd:string'], ['listType', 'xsd:string'],
    ]);
    const response = nodes.findIndex(node => node.uri === wsdl && node.local === 'message' && node.attributes.name?.value === 'LatLonListZipCodeResponse');
    expect(nodes[response + 1]).toMatchObject({local: 'part', attributes: {name: {value: 'listLatLonOut'}, type: {value: 'xsd:string'}}});
    const operation = nodes.findIndex((node, index) => index > binding && node.uri === wsdl && node.local === 'operation' && node.attributes.name?.value === selector.operation);
    expect(nodes[operation + 1]).toMatchObject({uri: soap, local: 'operation', attributes: {soapAction: {value: 'https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl#LatLonListZipCode'}}});
    for (const offset of [3, 5]) expect(nodes[operation + offset]).toMatchObject({uri: soap, local: 'body', attributes: {
      use: {value: 'encoded'}, namespace: {value: 'https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl'},
      encodingStyle: {value: 'http://schemas.xmlsoap.org/soap/encoding/'},
    }});
    expect(nodes.filter(node => node.uri === wsdl && node.local === 'fault')).toEqual([]);
    expect(nodes.find(node => node.uri === soap && node.local === 'address')?.attributes.location?.value)
      .toBe('http://localhost/xml/SOAP_server/ndfdXMLserver.php');
    const example = tags(await readFile(path.join(root, 'lat-lon-list-zip-code-request.xml')));
    expect(example.find(node => node.local === selector.operation)?.uri).toBe('uri:DWMLgen');
    expect(example.filter(node => ['zipCodeList', 'XMLformat', 'listType'].includes(node.local)).map(node => node.local))
      .toEqual(['zipCodeList', 'XMLformat', 'listType']);
  });

  it('reproduces the native loading refusal, leaves schema and correspondence inconclusive, and opens zero sockets', async () => {
    const sockets = vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {throw new Error('Network forbidden in offline qualification');});
    const fetches = vi.fn(() => {throw new Error('HTTP forbidden in offline qualification');});
    vi.stubGlobal('fetch', fetches);
    try {
      await expect(loadSemanticSchemaInput(source, loading)).rejects.toMatchObject({
        category: 'unsupported-capability', message: 'Unsupported XML byte encoding',
      });
      const reports = await Promise.all([1, 2].map(() => assessSchemaSource(source, {loading})));
      expect(serializeAssessmentReport(reports[0]!)).toBe(serializeAssessmentReport(reports[1]!));
      expect(reports[0]).toMatchObject({execution: 'failed', category: 'unsupported-capability', schema: 'inconclusive',
        correspondence: 'inconclusive', schemaEligible: false, admitted: false, operations: [], operationInventory: 'unassessed'});
      const selections = await Promise.all([1, 2].map(() => selectDirectOperation(source, selector, {loading})));
      expect(selections[0]).toEqual(selections[1]);
      expect(selections[0]).toMatchObject({kind: 'loading-refused', rule: 'unsupported-capability'});
      expect(selections[0]).not.toHaveProperty('contract');
    } finally {
      expect(fetches).not.toHaveBeenCalled();
      expect(sockets).not.toHaveBeenCalled();
    }
  });
});
