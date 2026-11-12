/**
 * Investigates native grammar reuse for alternate companion response branches.
 * @since Unreleased
 * @constraints Research only; these controls do not install a runtime branch selector.
 * @see https://github.com/TechSpokes/typescript-wsdl-client/issues/471
 */
import path from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {beforeAll, describe, expect, it} from 'vitest';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import type {ComponentValueMapping} from '../../src/compiler/directValues.js';
import {createComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import type {ComponentRecordProjection} from '../../src/compiler/componentRecordProjection.js';
import {inspectComponentSoapResponse} from '../../src/compiler/directSoap.js';
import {inspectCheckedResponse} from '../../src/index.js';

const directory = path.resolve('research/fixtures/alternate-response-branches');
const outerNamespace = 'urn:test:outer';
const name = (namespace: string, local: string) => ({namespace, local});
const selector = (namespace: string) => ({portType: name(namespace, 'PortType'), binding: name(namespace, 'Binding'), operation: 'Fetch'});
const success = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><p:Response><p:Records><p:Record Code="A"><p:Quantity>2</p:Quantity></p:Record></p:Records></p:Response></o:OuterResponse>';
const applicationError = '<o:OuterResponse xmlns:o="urn:test:outer" xmlns:p="urn:test:payload"><Wrapper Marker="owned"><Response><p:ApplicationError Retryable="false"><p:Code>42</p:Code><p:Message>synthetic error</p:Message></p:ApplicationError></Response></Wrapper></o:OuterResponse>';
const soapFault = '<s:Fault xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><faultcode>s:Server</faultcode><faultstring>synthetic fault</faultstring></s:Fault>';
const envelope = (payload: string) => Buffer.from(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>${payload}</s:Body></s:Envelope>`);
let outer: DirectOperationContract, companion: DirectOperationContract, error: DirectOperationContract, choice: DirectOperationContract;
let outerInput: ComponentValueMapping, errorInput: ComponentValueMapping, choiceInput: ComponentValueMapping;
let projection: ComponentRecordProjection;

beforeAll(async () => {
  const load = async (file: string, namespace = outerNamespace) => {
    const selected = await selectComponentOperation(path.join(directory, file), selector(namespace), {loading: {policy: {fileRoots: [directory]}}});
    if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
    return selected.contract;
  };
  outer = await load('outer.wsdl');
  companion = await load('companion.wsdl', 'urn:test:companion');
  error = await load('error.wsdl');
  choice = await load('choice.wsdl');
  const input = (contract: DirectOperationContract, groups?: {}) => {
    const mapping = createComponentValueMapping(contract, {kind: 'input'}, {}, groups);
    if (mapping.kind !== 'component-mapping') throw new Error(JSON.stringify(mapping));
    return mapping;
  };
  outerInput = input(outer); errorInput = input(error); choiceInput = input(choice, {});
  const result = createComponentRecordProjection(outer, companion, {scope: 'records-with-declared-wrapper-scope'});
  if (result.kind !== 'component-record-projection') throw new Error(JSON.stringify(result));
  projection = result;
});

describe('alternate response branch investigation', () => {
  it('retains the same boundary through public checked response configuration', async () => {
    const operation = selector(outerNamespace);
    const checkedComponents = {fileRoots: [directory], selectors: [operation], sourceOrigins: [],
      sourceResources: [{uri: pathToFileURL(path.join(directory, 'payload.xsd')).href, file: path.join(directory, 'payload.xsd')}],
      recordProjections: [{selector: operation, source: path.join(directory, 'companion.wsdl'),
        recordSelector: selector('urn:test:companion'), scope: 'records-with-declared-wrapper-scope' as const}]};
    const source = path.join(directory, 'outer.wsdl');
    const conforming = await inspectCheckedResponse(source, {selector: operation, checkedComponents, responseBytes: envelope(success)});
    expect(conforming, JSON.stringify(conforming)).toMatchObject({kind: 'conforming'});
    const refused = await inspectCheckedResponse(source, {selector: operation, checkedComponents, responseBytes: envelope(applicationError)});
    expect(refused.kind).toBe('mismatch');
    expect(refused.diagnostics).toContainEqual(expect.objectContaining({rule: 'record-wrapper-companion-boundary'}));
  });

  it('demonstrates the immediate scoped boundary and separate source authorities', () => {
    expect(outer.contextId).not.toBe(companion.contextId);
    expect(outer.contextId).not.toBe(error.contextId);
    const valid = inspectComponentSoapResponse(outer, outerInput, envelope(success), {responseProjection: projection});
    expect(valid.kind).toBe('soap-response');
    if (valid.kind !== 'soap-response' || !valid.decoded || valid.decoded.validated.kind !== 'component-record-value') throw new Error('Expected scoped records');
    expect(valid.decoded.validated.value).toEqual({Records: {Record: [{Code: 'A', Quantity: 2}]}});
    expect(valid.decoded.validated.recordCount).toBe(1);
    expect(inspectComponentSoapResponse(outer, outerInput, envelope(applicationError), {responseProjection: projection}))
      .toMatchObject({kind: 'mismatch', rule: 'record-wrapper-companion-boundary'});
    expect(createComponentRecordProjection(choice, companion, {scope: 'records-with-declared-wrapper-scope'}))
      .toMatchObject({kind: 'unsupported', rule: 'record-wrapper-terminal-scope'});
  });

  it('validates the complete alternate grammar without stripping wrappers, attributes or namespaces', () => {
    const valid = inspectComponentSoapResponse(error, errorInput, envelope(applicationError));
    expect(valid.kind).toBe('soap-response');
    if (valid.kind !== 'soap-response' || !valid.decoded) throw new Error('Expected native alternate grammar');
    expect(valid.decoded.validated.value).toEqual({Wrapper: {Marker: 'owned', Response: {
      ApplicationError: {Retryable: false, Code: 42, Message: 'synthetic error'},
    }}});
    for (const payload of [
      applicationError.replace('<Wrapper ', '<Wrapper xmlns="urn:test:outer" '),
      applicationError.replace('<Response>', '<Response xmlns="urn:test:payload">'),
      applicationError.replace('p:ApplicationError', 'o:ApplicationError').replace('</p:ApplicationError>', '</o:ApplicationError>'),
      applicationError.replace(' Marker="owned"', ''),
      applicationError.replace('<p:Code>42</p:Code>', '<p:Code>nonsense</p:Code>'),
      applicationError.replace('Retryable="false"', 'Retryable="nonsense"'),
      applicationError.replace('</Response>', '<p:Unknown/></Response>'),
    ]) expect(inspectComponentSoapResponse(error, errorInput, envelope(payload)).kind).not.toBe('soap-response');
    expect(inspectComponentSoapResponse(error, errorInput, envelope(success)).kind).not.toBe('soap-response');
  });

  it('reuses ordinary native choice for a coherent replacement closure while refusing unknown or simultaneous branches', () => {
    for (const payload of [success, applicationError]) {
      const result = inspectComponentSoapResponse(choice, choiceInput, envelope(payload));
      expect(result.kind).toBe('soap-response');
      if (result.kind !== 'soap-response' || !result.decoded) throw new Error('Expected native choice');
      expect(result.decoded.validated.value).toHaveProperty('$choice');
    }
    for (const payload of [
      success.replace('<p:Response>', '<p:Unknown>').replace('</p:Response>', '</p:Unknown>'),
      success.replace('</o:OuterResponse>', applicationError.slice(applicationError.indexOf('<Wrapper'), applicationError.indexOf('</o:OuterResponse>')) + '</o:OuterResponse>'),
      applicationError.replace('<p:Code>42</p:Code>', '<p:Code>nonsense</p:Code>'),
      success.replace('<p:Quantity>2</p:Quantity>', '<p:Quantity>nonsense</p:Quantity>'),
      applicationError.replace('<Wrapper ', '<Wrapper xmlns="urn:test:outer" '),
    ]) expect(inspectComponentSoapResponse(choice, choiceInput, envelope(payload)).kind).not.toBe('soap-response');
  });

  it('keeps SOAP Faults distinct and retains byte limits and cancellation', () => {
    expect(inspectComponentSoapResponse(outer, outerInput, envelope(soapFault), {responseProjection: projection,
      responseMetadata: {status: 500, contentType: 'text/xml; charset=utf-8'}})).toMatchObject({kind: 'soap-fault', fault: {version: '1.1'}});
    const controller = new AbortController(); controller.abort();
    expect(inspectComponentSoapResponse(error, errorInput, envelope(applicationError), {signal: controller.signal}).kind).toBe('cancelled');
    expect(inspectComponentSoapResponse(error, errorInput, envelope(applicationError), {limits: {maxBytes: 8}}).kind).toBe('resource-limit');
    expect(inspectComponentSoapResponse(error, errorInput, envelope(applicationError), {
      responseMetadata: {status: 500, contentType: 'text/xml'},
    }).kind).toBe('protocol');
  });

  it('observes the same failure and typed alternate grammar from an owned HTTP wire', async () => {
    const bytes = envelope(applicationError);
    const server = createServer((_request, response) => {
      response.writeHead(200, {'content-type': 'text/xml; charset=utf-8', 'content-length': bytes.length});
      response.end(bytes);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Expected owned TCP server');
      const response = await fetch(`http://127.0.0.1:${address.port}/owned`);
      const observed = new Uint8Array(await response.arrayBuffer());
      expect(Buffer.from(observed)).toEqual(bytes);
      const responseMetadata = {status: response.status, contentType: response.headers.get('content-type')!};
      expect(inspectComponentSoapResponse(outer, outerInput, observed, {responseMetadata, responseProjection: projection}))
        .toMatchObject({kind: 'mismatch', rule: 'record-wrapper-companion-boundary'});
      const alternate = inspectComponentSoapResponse(error, errorInput, observed, {responseMetadata});
      expect(alternate.kind).toBe('soap-response');
      if (alternate.kind !== 'soap-response' || !alternate.decoded) throw new Error('Expected native alternate grammar');
      expect(JSON.parse(JSON.stringify(alternate.decoded.validated.value))).toEqual({Wrapper: {Marker: 'owned', Response: {
        ApplicationError: {Retryable: false, Code: 42, Message: 'synthetic error'},
      }}});
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
