import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {beforeAll, describe, expect, it} from 'vitest';
import {selectComponentOperation, selectComponentOperationInRequest} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import type {ComponentValueMapping} from '../../src/compiler/directValues.js';
import {createComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import type {ComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import {createComponentResponseBranches, decodeComponentResponseBranchesXml, inspectComponentResponseBranches,
  validateComponentApplicationError} from '../../src/compiler/componentResponseBranches.js';
import type {ComponentResponseBranches} from '../../src/compiler/componentResponseBranches.js';
import {exchangeComponentSoap, inspectComponentSoapResponse} from '../../src/compiler/directSoap.js';

const directory = path.resolve('test/conformance/fixtures/soap/response-branches');
const name = (namespace: string, local: string) => ({namespace, local});
const selector = (namespace = 'urn:test:outer') => ({portType: name(namespace, 'PortType'), binding: name(namespace, 'Binding'), operation: 'Fetch'});
const errorPath = [name('', 'Wrapper'), name('', 'Response'), name('urn:test:payload', 'ApplicationError')];
const successXml = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><p:Response><p:Records><p:Record Code="A"><p:Quantity>2</p:Quantity></p:Record></p:Records></p:Response></o:OuterResponse>';
const errorXml = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><Wrapper Marker="owned"><Response><p:ApplicationError Retryable="false"><p:Code>42</p:Code><p:Message>synthetic error</p:Message></p:ApplicationError></Response></Wrapper></o:OuterResponse>';
const errorValue = {Wrapper: {Marker: 'owned', Response: {ApplicationError: {Retryable: false, Code: 42, Message: 'synthetic error'}}}};
const faultXml = '<s:Fault xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><faultcode>s:Server</faultcode><faultstring>synthetic fault</faultstring></s:Fault>';
const envelope = (value: string) => Buffer.from(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${value}</s:Body></s:Envelope>`);
let outer: DirectOperationContract, companion: DirectOperationContract, error: DirectOperationContract, optional: DirectOperationContract;
let input: ComponentValueMapping, projection: ComponentRecordProjection, branches: ComponentResponseBranches;

beforeAll(async () => {
  const budget = createApplicationBudget();
  const load = async (file: string, namespace?: string) => {
    const result = await selectComponentOperationInRequest(path.join(directory, file), selector(namespace), {loading: {policy: {fileRoots: [directory]}}}, budget);
    if (result.kind !== 'selected') throw new Error(JSON.stringify(result));
    return result.contract;
  };
  outer = await load('outer.wsdl'); companion = await load('companion.wsdl', 'urn:test:companion'); error = await load('error.wsdl');
  optional = await load('error-optional.wsdl');
  const mapped = createComponentValueMapping(outer, {kind: 'input'});
  if (mapped.kind !== 'component-mapping') throw new Error(JSON.stringify(mapped));
  input = mapped;
  const success = createComponentRecordProjection(outer, companion, {scope: 'records-with-declared-wrapper-scope'});
  if (success.kind !== 'component-record-projection') throw new Error(JSON.stringify(success));
  projection = success;
  const result = createComponentResponseBranches(outer, projection, [{id: 'upstream', path: errorPath, contract: error}]);
  if (result.kind !== 'component-response-branches') throw new Error(JSON.stringify(result));
  branches = result;
});

describe('independent component response branches', () => {
  it('preserves success and validates the entire error in its independently owned universe', () => {
    expect(outer.contextId).not.toBe(error.contextId);
    const success = inspectComponentSoapResponse(outer, input, envelope(successXml), {responseBranches: branches});
    expect(success).toMatchObject({kind: 'soap-response', decoded: {kind: 'component-record-decoded', validated: {
      recordCount: 1, value: {Records: {Record: [{Code: 'A', Quantity: 2}]}},
    }}});
    const application = inspectComponentSoapResponse(outer, input, envelope(errorXml), {responseBranches: branches});
    expect(application).toMatchObject({kind: 'application-error', branch: 'upstream', decoded: {
      kind: 'component-application-error-decoded', validated: {value: errorValue},
    }});
    expect(validateComponentApplicationError(branches, 'upstream', JSON.parse(JSON.stringify(errorValue))).kind).toBe('projection-expanded');
    expect(validateComponentApplicationError(branches, 'upstream', {Wrapper: {Response: {}}}).kind).not.toBe('projection-expanded');
    expect(inspectComponentSoapResponse(outer, input, envelope(errorXml), {responseProjection: projection})).toMatchObject({kind: 'mismatch'});
  });

  it('rejects duplicate, prefix, shared discriminator, invalid and undeclared path configurations', () => {
    const configured = (id: string, path = errorPath) => ({id, path, contract: error});
    for (const entries of [[], Array.from({length: 9}, (_, index) => configured(`error${index}`)),
      [configured('success')], [configured('bad:id')], [configured('x'.repeat(65))],
      [configured('upstream'), configured('upstream')], [configured('one'), configured('two', errorPath.slice(0, 1))],
      [configured('one'), configured('two')], [configured('one', [])],
      [configured('one', Array.from({length: 17}, () => name('', 'Wrapper')))],
      [configured('one', [name('urn:test:payload', 'Response')])],
      [configured('one', [name('urn:test:outer', 'Wrapper')])],
      [configured('one', [name('', 'Wrapper'), name('', 'Unknown')])],
    ]) expect(createComponentResponseBranches(outer, projection, entries).kind).toBe('unsupported');
  });

  it('authenticates owners before reading arbitrary fields and refuses incoherent shared budgets', async () => {
    const fake = new Proxy({}, {get() {throw new Error('getter must not run');}});
    expect(() => inspectComponentResponseBranches(fake as ComponentResponseBranches)).toThrow('Native matching');
    expect(() => decodeComponentResponseBranchesXml(outer, fake as ComponentResponseBranches, envelope(errorXml))).toThrow('Native matching');
    expect(() => inspectComponentResponseBranches({...branches})).toThrow('Native matching');
    const selected = await selectComponentOperation(path.join(directory, 'error.wsdl'), selector(), {loading: {policy: {fileRoots: [directory]}}});
    if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
    expect(createComponentResponseBranches(outer, projection, [{id: 'upstream', path: errorPath, contract: selected.contract}]))
      .toMatchObject({kind: 'unsupported', rule: 'response-branches-shared-budget'});
    expect(createComponentResponseBranches(outer, projection, [{id: 'upstream', path: errorPath, contract: companion}]))
      .toMatchObject({kind: 'unsupported', rule: 'response-branches-complete-output-root'});
    expect(createComponentResponseBranches(outer, projection, [{id: 'upstream', path: errorPath, contract: outer}]))
      .toMatchObject({kind: 'unsupported', rule: 'response-branches-complete-declared-grammar'});
    expect(createComponentResponseBranches(outer, projection, [{id: 'upstream', path: errorPath, contract: optional}]))
      .toMatchObject({kind: 'unsupported', rule: 'response-branches-mandatory-unit-path'});
  });

  it('refuses unknown, simultaneous and repeated matches without fallback', () => {
    for (const xml of [
      '<o:OuterResponse xmlns:o="urn:test:outer"><Unknown/></o:OuterResponse>',
      successXml.replace('</o:OuterResponse>', errorXml.slice(errorXml.indexOf('<Wrapper'), errorXml.indexOf('</o:OuterResponse>')) + '</o:OuterResponse>'),
      errorXml.replace('</Response>', '<p:ApplicationError Retryable="false"><p:Code>42</p:Code><p:Message>other</p:Message></p:ApplicationError></Response>'),
    ]) expect(inspectComponentSoapResponse(outer, input, envelope(xml), {responseBranches: branches})).toMatchObject({kind: 'mismatch'});
  });

  it('preserves exact empty namespaces, attributes, order and scalar validation of selected errors', () => {
    for (const xml of [
      errorXml.replace('<Wrapper ', '<Wrapper xmlns="urn:test:outer" '),
      errorXml.replace('<Response>', '<Response xmlns="urn:test:payload">'),
      errorXml.replaceAll('p:ApplicationError', 'o:ApplicationError'),
      errorXml.replace(' Marker="owned"', ''),
      errorXml.replace('Retryable="false"', 'Retryable="nonsense"'),
      errorXml.replace('<p:Code>42</p:Code>', '<p:Code>nonsense</p:Code>'),
      errorXml.replace('<p:Code>42</p:Code><p:Message>synthetic error</p:Message>', '<p:Message>synthetic error</p:Message><p:Code>42</p:Code>'),
      errorXml.replace('</Response>', '<p:Unknown/></Response>'),
      errorXml.replace('</Wrapper>', '<Response/></Wrapper>'),
      errorXml.replace('<o:OuterResponse ', '<o:OuterResponse Extra="unknown" '),
      errorXml.replace('<o:OuterResponse ', '<o:WrongRoot ').replace('</o:OuterResponse>', '</o:WrongRoot>'),
      successXml.replace('<p:Quantity>2</p:Quantity>', '<p:Quantity>invalid</p:Quantity>'),
    ]) {
      const result = inspectComponentSoapResponse(outer, input, envelope(xml), {responseBranches: branches});
      expect(['soap-response', 'application-error']).not.toContain(result.kind);
      expect(JSON.stringify(result)).not.toContain('nonsense');
    }
  });

  it('selects protocol Faults first and preserves HTTP, cancellation and capacity controls', () => {
    expect(inspectComponentSoapResponse(outer, input, envelope(faultXml), {responseBranches: branches,
      responseMetadata: {status: 500, contentType: 'text/xml'}})).toMatchObject({kind: 'soap-fault', fault: {version: '1.1'}});
    expect(inspectComponentSoapResponse(outer, input, envelope(errorXml), {responseBranches: branches,
      responseMetadata: {status: 500, contentType: 'text/xml'}})).toMatchObject({kind: 'protocol'});
    const controller = new AbortController(); controller.abort();
    expect(inspectComponentSoapResponse(outer, input, envelope(errorXml), {responseBranches: branches, signal: controller.signal}).kind).toBe('cancelled');
    expect(createComponentResponseBranches(outer, projection, [{id: 'upstream', path: errorPath, contract: error}], {signal: controller.signal}).kind).toBe('cancelled');
    expect(inspectComponentSoapResponse(outer, input, envelope(errorXml), {responseBranches: branches, limits: {maxBytes: 8}}).kind).toBe('resource-limit');
    expect(inspectComponentSoapResponse(outer, input, envelope(errorXml), {responseBranches: branches, limits: {maxNodes: 3}}).kind).toBe('resource-limit');
  });

  it('keeps selected nodes on the original parse and cooperates with cancellation after observation', () => {
    expect(() => decodeComponentResponseBranchesXml(outer, branches, envelope(errorXml), {
      selectPayload(root) {return {payload: {...root}, mapping: branches};},
    })).toThrow('belong');
    const controller = new AbortController();
    expect(decodeComponentResponseBranchesXml(outer, branches, Buffer.from(errorXml), {signal: controller.signal,
      selectPayload(root) {controller.abort(); return {payload: root, mapping: branches};},
    })).toMatchObject({kind: 'cancelled', rule: 'cooperative-cancellation'});
  });

  it('retains sticky shared work and node exhaustion without throwing while publishing failure metadata', async () => {
    for (const exhausted of ['work', 'nodes'] as const) {
      const budget = createApplicationBudget({maxNodes: 100_000, maxWork: 125_000_000});
      const load = async (file: string, namespace?: string) => {
        const selected = await selectComponentOperationInRequest(path.join(directory, file), selector(namespace),
          {loading: {policy: {fileRoots: [directory]}}}, budget);
        if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
        return selected.contract;
      };
      const owner = await load('outer.wsdl'), records = await load('companion.wsdl', 'urn:test:companion'), alternative = await load('error.wsdl');
      const scoped = createComponentRecordProjection(owner, records, {scope: 'records-with-declared-wrapper-scope'});
      if (scoped.kind !== 'component-record-projection') throw new Error(JSON.stringify(scoped));
      const entries = [{id: 'upstream', path: errorPath, contract: alternative}];
      const branchOwner = createComponentResponseBranches(owner, scoped, entries);
      if (branchOwner.kind !== 'component-response-branches') throw new Error(JSON.stringify(branchOwner));
      budget.guard(() => exhausted === 'work' ? budget.chargeWork(125_000_000) : budget.reserveNodes(100_000));
      expect(budget.exhausted()).toBe(true);
      expect(decodeComponentResponseBranchesXml(owner, branchOwner, Buffer.from(errorXml))).toMatchObject({kind: 'resource-limit'});
      expect(createComponentResponseBranches(owner, scoped, entries)).toMatchObject({kind: 'resource-limit'});
    }
  });

  it('retains original error bytes and typed result from an owned SOAP exchange', async () => {
    const responseBytes = envelope(errorXml), requests: string[] = [];
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      requests.push(Buffer.concat(chunks).toString('utf8'));
      response.writeHead(200, {'content-type': 'text/xml; charset=utf-8', 'content-length': responseBytes.length});
      response.end(responseBytes);
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned server address required');
      const result = await exchangeComponentSoap(outer, input, 'request', {service: name('urn:test:outer', 'Service'), port: 'Port',
        endpoint: `http://127.0.0.1:${address.port}/owned`}, projection, true, branches);
      expect(result, JSON.stringify(result)).toMatchObject({kind: 'application-error', branch: 'upstream', status: 200, decoded: {validated: {value: errorValue}}});
      if (result.kind !== 'application-error') throw new Error(JSON.stringify(result));
      expect(Buffer.from(result.responseBytes)).toEqual(responseBytes);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('>request</');
    } finally {server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));}
  });
});
