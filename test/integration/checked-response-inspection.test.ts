import {describe, expect, it, vi} from 'vitest';
import path from 'node:path';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {HttpClient} from 'soap/lib/http.js';
import {inspectCheckedResponse} from '../../src/checkedResponseInspection.js';
import type {CheckedComponentOptions} from '../../src/checkedPipeline.js';
import {prepareCheckedSourceInputs} from '../../src/checkedPipeline.js';
import * as checkedPipeline from '../../src/checkedPipeline.js';
import {prepareSchemaSnapshotFiles, loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareCorrectedSourceInputs, inspectSourceCorrectionInventory, SourceCorrectionError} from '../../src/compiler/sourceCorrections.js';

const directory = path.resolve('test/conformance/fixtures/xsd/standard-schema-element');
const source = path.join(directory, 'wrapper.wsdl');
const namespace = 'urn:owned:wrapper';
const name = (local: string) => ({namespace, local});
const selector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
const companionSelector = {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'};
const choices: Partial<CheckedComponentOptions> = {selectors: [selector], fileRoots: [directory], sourceResources: [], sourceOrigins: [],
  recordProjections: [{selector, source: path.join(directory, 'records.wsdl'), recordSelector: companionSelector,
    scope: 'records-with-declared-wrapper-scope'}]};
const records = '<Envelope xmlns="urn:owned:wrapper"><Records><Record Code="0007"><Name>private-record-marker</Name><Active>true</Active><Quantity>2</Quantity></Record></Records></Envelope>';
const soap = (body: string) => new TextEncoder().encode('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' + body + '</s:Body></s:Envelope>');
const wrapped = (metadata: boolean) => soap(`<Envelope xmlns="${namespace}">${metadata ? '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>' : ''}${records}</Envelope>`);

describe('offline checked SOAP response inspection', () => {
  it('enforces the native byte length before copying or loading and refuses shared response storage', async () => {
    const bytes = wrapped(true);
    const actualLength = bytes.byteLength;
    const getter = vi.fn(() => {throw new Error('Caller-owned byte metadata must not run');});
    Object.defineProperties(bytes, {byteLength: {get: getter}, buffer: {get: getter}, [Symbol.iterator]: {get: getter}});
    const absent = path.join(directory, 'not-loaded.wsdl');
    const report = await inspectCheckedResponse(absent, {selector, responseBytes: bytes, limits: {maxBytes: 8}});
    expect(report).toMatchObject({kind: 'refused', response: {byteLength: actualLength, digestAssessment: 'unassessed-limit'}});
    const valid = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: bytes});
    expect(valid, JSON.stringify(valid)).toMatchObject({kind: 'conforming', response: {byteLength: actualLength}});
    expect(getter).not.toHaveBeenCalled();
    await expect(inspectCheckedResponse(absent, {selector, responseBytes: new Uint8Array(new SharedArrayBuffer(8))})).rejects.toThrow('Shared XML bytes');
  });
  it('identifies a SOAP 1.1 protocol fault without declaring application success or exposing its reason', async () => {
    const response = soap('<s:Fault><faultcode>s:Client</faultcode><faultstring xml:lang="en">private-protocol-reason</faultstring></s:Fault>');
    const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: response,
      responseMetadata: {status: 500, contentType: 'text/xml; charset=utf-8'}});
    expect(report, JSON.stringify(report)).toMatchObject({kind: 'conforming', scope: 'full-response', admitted: false, executed: false,
      fault: {assessment: 'conforming', observed: true, declared: false}, http: {assessment: 'conforming', status: 500}});
    expect(JSON.stringify(report)).not.toContain('private-protocol-reason');
    expect(report).not.toHaveProperty('decoded');
  });
  it('selects either operation from an unchanged project while authenticating every corrected companion', async () => {
    await mkdir('tmp/conformance', {recursive: true});
    const temporary = await mkdtemp(path.resolve('tmp/conformance/inspect-multiple-operations-'));
    try {
      const wrapper = path.join(temporary, 'wrapper.wsdl');
      const secondCompanion = path.join(temporary, 'second-records.wsdl');
      const other = {...selector, operation: 'Other'};
      await writeFile(wrapper, (await readFile(source, 'utf8')).replace(
        /<wsdl:operation name="Fetch">[\s\S]*?<\/wsdl:operation>/g,
        operation => operation + operation.replace('name="Fetch"', 'name="Other"')));
      await writeFile(secondCompanion, await readFile(path.join(directory, 'records.wsdl')));
      const project: Partial<CheckedComponentOptions> = {...choices, fileRoots: [temporary, directory], selectors: [selector, other],
        recordProjections: [...choices.recordProjections!, {...choices.recordProjections![0]!, selector: other, source: secondCompanion}]};
      const uncorrected = await inspectCheckedResponse(wrapper, {checkedComponents: project, selector: other, responseBytes: wrapped(true)});
      expect(uncorrected, JSON.stringify(uncorrected)).toMatchObject({kind: 'conforming', selector: other});
      const inferredProject = {...project}; delete inferredProject.selectors;
      const inferred = await inspectCheckedResponse(wrapper, {checkedComponents: inferredProject,
        selector: other, responseBytes: wrapped(true)});
      expect(inferred, JSON.stringify(inferred)).toMatchObject({kind: 'conforming', selector: other});
      const excluded = await inspectCheckedResponse(wrapper, {checkedComponents: {...project, selectors: [selector],
        recordProjections: [project.recordProjections![0]!]}, selector: other, responseBytes: wrapped(true)});
      expect(excluded.kind).toBe('refused');
      expect(excluded.diagnostics.some(item => item.scope === 'preparation' && item.rule.includes('not a configured operation'))).toBe(true);

      const load = async (file: string) => {
        const prepared = await prepareSchemaSnapshotFiles(file, [], {policy: {fileRoots: [temporary, directory]}});
        return loadSemanticSchemaInput(prepared.source, prepared.loading);
      };
      const inputs = await Promise.all([load(wrapper), load(path.join(directory, 'records.wsdl')), load(secondCompanion)]);
      const inventory = inspectSourceCorrectionInventory(inputs);
      const drafted = await inspectCheckedResponse(wrapper, {checkedComponents: project, selector,
        responseBytes: wrapped(false), includeCorrectionDraft: true});
      expect(drafted.kind).toBe('mismatch');
      expect(drafted.correctionDraft?.resources).toEqual(inventory.resources.map(({uri, digest}) => ({uri, digest})));
      expect(drafted.correctionDraft?.corrections.every(correction =>
        (correction.target as {uri: string}).uri === inputs[0]!.root.uri)).toBe(true);
      const extra = await inspectCheckedResponse(wrapper, {checkedComponents: project, selector, includeCorrectionDraft: true,
        responseBytes: new TextEncoder().encode(new TextDecoder().decode(wrapped(true)).replace('<Quantity>2</Quantity>',
          '<Quantity>2</Quantity><Extra>private-extra</Extra>'))});
      expect(extra.kind).toBe('mismatch');
      expect(extra.correctionDraft?.resources).toEqual(inventory.resources.map(({uri, digest}) => ({uri, digest})));
      expect(extra.correctionDraft?.corrections.find(correction => correction.kind === 'insert-element')).toMatchObject({
        target: {uri: inputs[1]!.root.uri}});
      const originalCompanion = await readFile(secondCompanion, 'utf8');
      const acquire = checkedPipeline.acquireCheckedSourceInputs;
      const changeDuringDraft = vi.spyOn(checkedPipeline, 'acquireCheckedSourceInputs').mockImplementationOnce(async (...args) => {
        await writeFile(secondCompanion, originalCompanion + '\n<!-- changed after assessment -->');
        return acquire(...args);
      });
      try {
        const changing = await inspectCheckedResponse(wrapper, {checkedComponents: project, selector: other,
          responseBytes: wrapped(false), includeCorrectionDraft: true});
        expect(changing.correctionDraft).toBeUndefined();
        expect(changing.diagnostics.some(item => item.rule === 'correction-draft-source-changed-after-assessment')).toBe(true);
      } finally {changeDuringDraft.mockRestore(); await writeFile(secondCompanion, originalCompanion);}
      const quantity = inventory.nodes.find(node => node.uri === inputs[2]!.documents[0]!.uri && node.kind === 'particle'
        && node.attributes.some(attribute => attribute.name === 'name' && attribute.value === 'Quantity'));
      if (!quantity) throw new Error('Second companion Quantity particle required');
      const recipeFile = path.join(temporary, 'corrections.json');
      await writeFile(recipeFile, JSON.stringify({version: 1, resources: inventory.resources.map(({uri, digest}) => ({uri, digest})),
        corrections: [{kind: 'set-occurs', target: {id: quantity.id, uri: quantity.uri, digest: quantity.digest}, min: '0', max: '1'}]}));
      const corrected = {...project, sourceCorrectionsFile: recipeFile};
      const first = await inspectCheckedResponse(wrapper, {checkedComponents: corrected, selector, responseBytes: wrapped(true)});
      expect(first, JSON.stringify(first)).toMatchObject({kind: 'conforming', selector});
      const second = await inspectCheckedResponse(wrapper, {checkedComponents: corrected, selector: other,
        responseBytes: new TextEncoder().encode(new TextDecoder().decode(wrapped(true)).replace('<Quantity>2</Quantity>', ''))});
      expect(second, JSON.stringify(second)).toMatchObject({kind: 'conforming', selector: other});
      expect(project.selectors).toEqual([selector, other]);
      expect(project.recordProjections).toHaveLength(2);

      await writeFile(secondCompanion, (await readFile(secondCompanion, 'utf8')) + '\n<!-- changed inactive companion -->');
      const stale = await inspectCheckedResponse(wrapper, {checkedComponents: corrected, selector, responseBytes: wrapped(true)});
      expect(stale.kind).toBe('refused');
      expect(stale.diagnostics.some(item => item.scope === 'preparation')).toBe(true);
      expect(stale.outcomes.companion).toMatchObject({assessment: 'unassessed', rule: 'effective-companion-source-unavailable'});
    } finally {await rm(temporary, {recursive: true, force: true});}
  });
  it('refuses oversized and cancelled observations before source acquisition or response hashing', async () => {
    const absent = path.join(directory, 'does-not-exist.wsdl');
    const oversized = await inspectCheckedResponse(absent, {selector, responseBytes: wrapped(true), limits: {maxBytes: 8}});
    expect(oversized).toMatchObject({kind: 'refused', response: {digestAssessment: 'unassessed-limit'},
      outcomes: {response: {assessment: 'refused'}}, fault: {assessment: 'unassessed'}});
    expect(oversized.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({kind: 'resource-limit'})]));
    expect(oversized.response.digest).toBeUndefined();
    const controller = new AbortController(); controller.abort();
    const cancelled = await inspectCheckedResponse(absent, {selector, responseBytes: wrapped(true), signal: controller.signal});
    expect(cancelled).toMatchObject({kind: 'refused', response: {digestAssessment: 'unassessed-cancelled'},
      outcomes: {response: {rule: 'cooperative-cancellation'}}});
    expect(cancelled.response.digest).toBeUndefined();
    expect(cancelled.resources).toEqual([]);
  });
  it('uses the selected SOAP 1.2 binding for offline envelope and media validation', async () => {
    const file = path.resolve('test/conformance/fixtures/wsdl/bindings/binding-soap12-first.wsdl');
    const ns = 'urn:conformance:binding-soap12-first';
    const selected = {portType: {namespace: ns, local: 'PingPortType'}, binding: {namespace: ns, local: 'PingSoap12'}, operation: 'Ping'};
    const payload = `<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"><s:Body><PingResponse xmlns="${ns}"><value>private-soap12-marker</value></PingResponse></s:Body></s:Envelope>`;
    const metadata = {status: 200, contentType: 'application/soap+xml; charset=utf-8'};
    const valid = await inspectCheckedResponse(file, {selector: selected, responseBytes: new TextEncoder().encode(payload), responseMetadata: metadata});
    expect(valid).toMatchObject({kind: 'conforming', scope: 'full-response', http: {assessment: 'conforming'}});
    expect(JSON.stringify(valid)).not.toContain('private-soap12-marker');
    const wrong = await inspectCheckedResponse(file, {selector: selected,
      responseBytes: new TextEncoder().encode(payload.replaceAll('http://www.w3.org/2003/05/soap-envelope', 'http://schemas.xmlsoap.org/soap/envelope/')),
      responseMetadata: metadata});
    expect(wrong.kind).toBe('mismatch');
    expect(wrong.fault.observed).toBeUndefined();
  });
  it('assesses XML-only observations without transport or fabricated HTTP metadata and redacts values', async () => {
    const request = vi.spyOn(HttpClient.prototype, 'request').mockImplementation(() => {throw new Error('No SOAP request is authorized');});
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {throw new Error('No metadata network is authorized');});
    try {
      const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: wrapped(true)});
      expect(report).toMatchObject({version: 'checked-response-inspection-v1', kind: 'conforming', scope: 'xml-only', admitted: false, executed: false,
        http: {assessment: 'unassessed'}, outcomes: {wrapper: {assessment: 'conforming'}, companion: {assessment: 'conforming'}}});
      expect(JSON.stringify(report)).not.toContain('private-record-marker');
      expect(JSON.stringify(report)).not.toContain('<Envelope');
      expect(JSON.stringify(report)).not.toContain(directory);
      expect(report.response.digest).toMatch(/^[a-f0-9]{64}$/);
      expect(request).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    } finally {request.mockRestore(); fetch.mockRestore();}
  });

  it('retains the missing wrapper metadata mismatch while independently assessing the genuine companion subtree', async () => {
    const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: wrapped(false), includeCorrectionDraft: true});
    expect(report).toMatchObject({kind: 'mismatch', outcomes: {wrapper: {assessment: 'mismatch'}, companion: {assessment: 'conforming'}}});
    const draft = report.correctionDraft;
    expect(draft).toBeDefined();
    expect(draft!.corrections.map(correction => correction.kind)).toEqual(expect.arrayContaining(['set-occurs', 'set-wildcard-namespaces']));
    expect(draft!.corrections.find(correction => correction.kind === 'set-occurs')?.min).toBeNull();
    expect(draft!.corrections.find(correction => correction.kind === 'set-wildcard-namespaces')?.namespaces).toBeNull();
    const prepared = await prepareSchemaSnapshotFiles(source, [], {policy: {fileRoots: [directory]}});
    const input = await loadSemanticSchemaInput(prepared.source, prepared.loading);
    const companionFiles = await prepareSchemaSnapshotFiles(path.join(directory, 'records.wsdl'), [], {policy: {fileRoots: [directory]}});
    const companion = await loadSemanticSchemaInput(companionFiles.source, companionFiles.loading);
    try {
      prepareCorrectedSourceInputs([input, companion], draft);
      throw new Error('Incomplete correction draft must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(SourceCorrectionError);
      if (!(error instanceof SourceCorrectionError)) throw error;
      expect(error.category).toBe('invalid-recipe');
    }
    expect(JSON.stringify(report)).not.toContain('private-record-marker');
  });

  it('does not label a valid wrapper mismatched for bad companion scalar values or HTTP assertions', async () => {
    const invalid = new TextEncoder().encode(new TextDecoder().decode(wrapped(true)).replace('<Active>true</Active>', '<Active>private-invalid-boolean</Active>'));
    const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: invalid, includeCorrectionDraft: true});
    expect(report.kind).toBe('mismatch');
    expect(report.outcomes.wrapper?.assessment).not.toBe('mismatch');
    expect(report.outcomes.companion?.assessment).toBe('mismatch');
    expect(JSON.stringify(report)).not.toContain('private-invalid-boolean');
    expect(report.correctionDraft).toBeUndefined();
    const http = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: wrapped(true),
      responseMetadata: {status: 500, contentType: 'text/xml; charset=utf-8'}});
    expect(http).toMatchObject({kind: 'mismatch', scope: 'full-response', http: {assessment: 'mismatch', status: 500}, outcomes: {wrapper: {assessment: 'unassessed'}}});
  });

  it('combines wrapper and independently located companion insertion sites in one unresolved original-source draft', async () => {
    const bytes = new TextEncoder().encode(new TextDecoder().decode(wrapped(false)).replace('</Record>', '<Unexpected>private-extra-marker</Unexpected></Record>'));
    const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: bytes, includeCorrectionDraft: true});
    expect(report).toMatchObject({kind: 'mismatch', outcomes: {wrapper: {assessment: 'mismatch'}, companion: {assessment: 'mismatch', rule: 'unexpected-child'}}});
    expect(report.correctionDraft?.corrections.map(correction => correction.kind)).toEqual(expect.arrayContaining(['set-occurs', 'set-wildcard-namespaces', 'insert-element']));
    const insert = report.correctionDraft?.corrections.find(correction => correction.kind === 'insert-element');
    expect(insert).toMatchObject({position: {kind: 'after'}, element: {name: null, type: null, min: null, max: null}});
    expect(JSON.stringify(report)).not.toContain('private-extra-marker');
  });

  it('identifies a genuine declared SOAP fault without returning its application text', async () => {
    const response = soap('<s:Fault><faultcode>s:Server</faultcode><faultstring>private-fault-string</faultstring><detail><Problem xmlns="urn:owned:wrapper">private-fault-detail</Problem></detail></s:Fault>');
    const report = await inspectCheckedResponse(source, {checkedComponents: choices, selector, responseBytes: response,
      responseMetadata: {status: 500, contentType: 'text/xml; charset=utf-8'}});
    expect(report).toMatchObject({kind: 'conforming', fault: {observed: true, declared: true}, http: {assessment: 'conforming', status: 500}});
    expect(JSON.stringify(report)).not.toContain('private-fault-string');
    expect(JSON.stringify(report)).not.toContain('private-fault-detail');
    const malformed = await inspectCheckedResponse(source, {checkedComponents: choices, selector,
      responseBytes: soap('<s:Fault><Unexpected>private-fault-marker</Unexpected></s:Fault>')});
    expect(malformed.kind).toBe('mismatch');
    expect(malformed.fault).toEqual({assessment: 'unassessed'});
    expect(JSON.stringify(malformed)).not.toContain('private-fault-marker');
  });

  it('drafts an unexpected-child insertion at the exact sequence with unresolved semantic choices', async () => {
    const forecast = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
    const namespace = 'urn:checked:forecast';
    const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
    const responseBytes = soap(`<GetForecastResponse xmlns="${namespace}"><city>private-city-marker</city><temperature>7</temperature><complete>true</complete><NewField>private-new-value</NewField></GetForecastResponse>`);
    const report = await inspectCheckedResponse(forecast, {selector, responseBytes, includeCorrectionDraft: true});
    expect(report.kind).toBe('mismatch');
    const insertion = report.correctionDraft?.corrections.find(correction => correction.kind === 'insert-element');
    expect(insertion).toMatchObject({kind: 'insert-element', position: {kind: 'after'}, element: {name: null, type: null, min: null, max: null}});
    expect(JSON.stringify(report)).not.toContain('private-new-value');
    const ordinary = await inspectCheckedResponse(forecast, {selector, responseBytes});
    expect(ordinary.correctionDraft).toBeUndefined();
    expect(JSON.stringify(ordinary)).not.toContain('file:');
  });

  it('keeps corrected companion bytes for independent diagnostics when the outer projection refuses', async () => {
    await mkdir('tmp/conformance', {recursive: true});
    const temporary = await mkdtemp(path.resolve('tmp/conformance/inspect-corrected-companion-'));
    try {
      const wrapper = path.join(temporary, 'wrapper.wsdl');
      await writeFile(wrapper, (await readFile(source, 'utf8')).replace('<xs:any/>', '<xs:any namespace="##local"/>'));
      const rootFiles = await prepareSchemaSnapshotFiles(wrapper, [], {policy: {fileRoots: [temporary, directory]}});
      const main = await loadSemanticSchemaInput(rootFiles.source, rootFiles.loading);
      const companionFiles = await prepareSchemaSnapshotFiles(path.join(directory, 'records.wsdl'), [], {policy: {fileRoots: [temporary, directory]}});
      const companion = await loadSemanticSchemaInput(companionFiles.source, companionFiles.loading);
      const inventory = inspectSourceCorrectionInventory([main, companion]);
      const quantity = inventory.nodes.find(node => node.kind === 'particle' && node.attributes.some(attribute => attribute.name === 'name' && attribute.value === 'Quantity'));
      if (!quantity) throw new Error('Expected authored Quantity particle');
      const recipeFile = path.join(temporary, 'corrections.json');
      await writeFile(recipeFile, JSON.stringify({version: 1, resources: inventory.resources.map(({uri, digest}) => ({uri, digest})),
        corrections: [{kind: 'set-occurs', target: {id: quantity.id, uri: quantity.uri, digest: quantity.digest}, min: '0', max: '1'}]}));
      await prepareCheckedSourceInputs(wrapper, {...choices, fileRoots: [temporary, directory], sourceResources: [], sourceOrigins: [], sourceCorrectionsFile: recipeFile});
      const bytes = new TextEncoder().encode(new TextDecoder().decode(wrapped(true)).replace('<Quantity>2</Quantity>', ''));
      const report = await inspectCheckedResponse(wrapper, {checkedComponents: {...choices, fileRoots: [temporary, directory], sourceCorrectionsFile: recipeFile},
        selector, responseBytes: bytes, includeCorrectionDraft: true});
      expect(report, JSON.stringify(report)).toMatchObject({kind: 'refused', outcomes: {wrapper: {assessment: 'refused'}, companion: {assessment: 'conforming'}}});
      expect(report.correctionDraft).toBeUndefined();
      expect(report.sourceCorrections?.resources.some(resource => resource.changed)).toBe(true);
      expect(report.diagnostics.some(diagnostic => diagnostic.rule === 'extend-original-source-correction-recipe-explicitly')).toBe(true);
    } finally {await rm(temporary, {recursive: true, force: true});}
  });

  it('never fetches an unsnapshotted remote import even when its origin is permitted and sourceResources is omitted', async () => {
    await mkdir('tmp/conformance', {recursive: true});
    const temporary = await mkdtemp(path.resolve('tmp/conformance/inspect-closed-source-'));
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:offline:external"/>'));
    try {
      const file = path.join(temporary, 'forecast.wsdl');
      const original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
      await writeFile(file, original.replace('<xs:complexType name="ForecastRequest">',
        '<xs:import namespace="urn:offline:external" schemaLocation="https://offline.example.test/schema.xsd"/><xs:complexType name="ForecastRequest">'));
      const namespace = 'urn:checked:forecast';
      const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
      const report = await inspectCheckedResponse(file, {selector, responseBytes: soap(`<GetForecastResponse xmlns="${namespace}"><city>private</city><complete>true</complete></GetForecastResponse>`),
        checkedComponents: {fileRoots: [temporary], sourceOrigins: ['https://offline.example.test']}});
      expect(report.kind).toBe('refused');
      expect(fetch).not.toHaveBeenCalled();
    } finally {fetch.mockRestore(); await rm(temporary, {recursive: true, force: true});}
  });
});
