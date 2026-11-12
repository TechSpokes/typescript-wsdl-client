import {describe, expect, it, vi} from 'vitest';
import path from 'node:path';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {inspectCheckedResponse} from '../../src/checkedResponseInspection.js';
import {inspectSourceCorrectionInventory} from '../../src/compiler/sourceCorrections.js';
import * as sourceCorrections from '../../src/compiler/sourceCorrections.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {selectDirectOperation, selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule, createComponentSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {checkedDirectRuntimeV1, checkedComponentRuntimeV3} from '../../src/index.js';
import {diagnosticName} from '../../src/compiler/payloadDiagnostics.js';

const source = path.resolve('test/conformance/fixtures/xsd/types/type-declared-corrections.wsdl');
const namespace = 'urn:owned:type-corrections';
const xsd = 'http://www.w3.org/2001/XMLSchema';
const selector = {portType: {namespace, local: 'ContentPortType'}, binding: {namespace, local: 'ContentBinding'}, operation: 'Fetch'};
const response = (embed: string, stamp = '2026-01-02T03:04:05Z', extra = '') => new TextEncoder().encode(
  `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FetchResponse xmlns="${namespace}" Stamp="${stamp}"><Embed>${embed}</Embed>${extra}</FetchResponse></s:Body></s:Envelope>`);
const invalidUri = '&lt;iframe src="https://example.test/private-value-marker"/&gt;';

describe('scoped native payload diagnostics', () => {
  it('marks occurrence overflow and bounded ancestor truncation explicitly', async () => {
    expect(diagnosticName({namespace, local: 'Embed'}, 100_001)).toBe(`{${namespace}}Embed[>100000]`);
    expect(diagnosticName({namespace, local: 'Embed'}, 100_000)).toBe(`{${namespace}}Embed[100000]`);
    await mkdir('tmp/conformance', {recursive: true});
    const temporary = await mkdtemp(path.resolve('tmp/conformance/diagnostic-depth-'));
    try {
      const levels = Array.from({length: 36}, (_, index) => 'Level' + index + '_'.repeat(56));
      const file = path.join(temporary, 'deep.wsdl');
      const field = '<xs:element name="Embed" type="xs:anyURI"/>';
      const schemaField = levels.map(local => `<xs:element name="${local}"><xs:complexType><xs:sequence>`).join('')
        + field + levels.map(() => '</xs:sequence></xs:complexType></xs:element>').join('');
      await writeFile(file, (await readFile(source, 'utf8')).replace(field, schemaField));
      const bytes = response(invalidUri);
      const nested = levels.map(local => `<${local}>`).join('') + `<Embed>${invalidUri}</Embed>`
        + [...levels].reverse().map(local => `</${local}>`).join('');
      const report = await inspectCheckedResponse(file, {selector, responseBytes: new TextEncoder().encode(
        new TextDecoder().decode(bytes).replace(`<Embed>${invalidUri}</Embed>`, nested))});
      expect(report.diagnostics[0]!.diagnostic).toMatchObject({truncated: true, declaration: {name: {local: 'Embed'}}});
      expect(report.diagnostics[0]!.diagnostic!.location.length).toBeLessThanOrEqual(2048);
      expect(report.diagnostics[0]!.diagnostic!.location).toContain('/[truncated]');
    } finally {await rm(temporary, {recursive: true, force: true});}
  });
  it.each(['direct', 'component'] as const)('redacts malformed response source locators from the %s public runtime', async mode => {
    const file = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
    const ns = 'urn:checked:forecast';
    const selected = await (mode === 'direct' ? selectDirectOperation : selectComponentOperation)(file, {
      portType: {namespace: ns, local: 'ForecastPortType'}, binding: {namespace: ns, local: 'ForecastBinding'}, operation: 'GetForecast'},
    {loading: {policy: {fileRoots: [path.dirname(file)]}}});
    if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
    const selection = {service: {namespace: ns, local: 'ForecastService'}, port: 'ForecastPort'};
    const capsule = await (mode === 'direct' ? createDirectSourceCapsule : createComponentSourceCapsule)(selected.contract, selection);
    if (capsule.kind !== 'direct-capsule' && capsule.kind !== 'component-capsule') throw new Error(capsule.kind);
    const server = createServer((request, reply) => {
      request.resume(); reply.writeHead(200, {'content-type': 'text/xml'});
      reply.end('<private-unknown-name-marker><unclosed');
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Owned server unavailable');
    try {
      const endpoint = `http://127.0.0.1:${address.port}/private-path-marker/endpoint-secret-marker`;
      const options = {localSource: file, fileRoots: [path.dirname(file)], capsule: capsule.bytes,
        soap: {...selection, endpoint, allowEndpoint: (url: URL) => url.origin === `http://127.0.0.1:${address.port}`}};
      const input = {city: 'request-value-marker', days: 1};
      const result = mode === 'direct'
        ? await checkedDirectRuntimeV1.execute(Buffer.from(capsule.bytes).toString('base64'), input, options, checkedDirectRuntimeV1.version)
        : await checkedComponentRuntimeV3.execute(Buffer.from(capsule.bytes).toString('base64'), input,
          {...options, sourceResources: [], sourceOrigins: []}, checkedComponentRuntimeV3.version);
      expect(result.kind, JSON.stringify(result)).toBe('xml-invalid');
      expect(result).not.toHaveProperty('source');
      for (const marker of ['endpoint-secret-marker', 'private-path-marker', 'private-unknown-name-marker', file, 'request-value-marker'])
        expect(JSON.stringify(result)).not.toContain(marker);
    } finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
  });
  it.each(['resource-limit', 'cancelled'] as const)('retains the native mismatch when trusted inventory reports %s', async category => {
    const inventory = vi.spyOn(sourceCorrections, 'inspectSourceCorrectionInventory').mockImplementationOnce(() => {
      throw new sourceCorrections.SourceCorrectionError(category, 'private-inventory-exception-marker');
    });
    try {
      const report = await inspectCheckedResponse(source, {selector, responseBytes: response(invalidUri), includeCorrectionTargets: true});
      expect(report.kind).toBe('mismatch');
      expect(report.diagnostics[0]!.diagnostic?.datatype).toEqual({namespace: xsd, local: 'anyURI'});
      expect(report.correctionTargets).toEqual([{diagnostic: 0, kind: 'unavailable', reason: `original-target-inventory-${category}`}]);
      expect(JSON.stringify(report)).not.toContain('private-inventory-exception-marker');
      expect(inventory).toHaveBeenCalledOnce();
    } finally {inventory.mockRestore();}
  });
  it('preserves strict acceptance and exposes URI element and dateTime attribute ownership without values', async () => {
    const uri = await inspectCheckedResponse(source, {selector, responseBytes: response(invalidUri)});
    expect(uri).toMatchObject({kind: 'mismatch', version: 'checked-response-inspection-v1'});
    expect(uri.diagnostics[0]).toMatchObject({kind: 'scalar-invalid', diagnostic: {
      version: 'checked-payload-diagnostic-v1', declaration: {kind: 'element', name: {namespace, local: 'Embed'}},
      owner: {kind: 'complexType', name: {namespace, local: 'Content'}}, datatype: {namespace: xsd, local: 'anyURI'},
      location: `/{${namespace}}FetchResponse[1]/{${namespace}}Embed[1]`,
    }});
    expect(uri.diagnostics[0]!.diagnostic!.universe).toMatch(/^universe-[a-f0-9]{64}$/);
    expect(uri.diagnostics[0]!.diagnostic!.resource).toMatch(/^resource-[a-f0-9]{64}$/);
    expect(uri).not.toHaveProperty('correctionTargets');
    const stamp = await inspectCheckedResponse(source, {selector, responseBytes: response('https://example.test/', '2026-01-02 03:04:05Z')});
    expect(stamp.diagnostics[0]).toMatchObject({kind: 'scalar-invalid', diagnostic: {
      declaration: {kind: 'attribute', name: {namespace: '', local: 'Stamp'}}, datatype: {namespace: xsd, local: 'dateTime'},
      location: `/{${namespace}}FetchResponse[1]/@{}Stamp[1]`,
    }});
    for (const report of [uri, stamp]) {
      const serialized = JSON.stringify(report);
      for (const marker of ['private-value-marker', 'iframe', '2026-01-02', source, 'file:']) expect(serialized).not.toContain(marker);
    }
    expect((await inspectCheckedResponse(source, {selector, responseBytes: response('https://example.test/')})).kind).toBe('conforming');
  });

  it('uses known parent names for unexpected children and wrappers while refusing them', async () => {
    const unknown = await inspectCheckedResponse(source, {selector,
      responseBytes: response('https://example.test/', undefined, '<credentialSecretUnknown>private-unknown-value</credentialSecretUnknown>')});
    expect(unknown).toMatchObject({kind: 'mismatch'});
    expect(unknown.diagnostics[0]!.diagnostic).toMatchObject({unknownField: true,
      location: `/{${namespace}}FetchResponse[1]/[unknown-field]`});
    const wrapper = await inspectCheckedResponse(source, {selector, responseBytes: new TextEncoder().encode(
      new TextDecoder().decode(response('https://example.test/')).replaceAll('FetchResponse', 'credentialSecretWrapper'))});
    expect(wrapper.kind).toBe('mismatch');
    for (const report of [unknown, wrapper]) {
      expect(JSON.stringify(report)).not.toContain('credentialSecret');
      expect(JSON.stringify(report)).not.toContain('private-unknown-value');
    }
  });

  it('recovers original declaration pins after a prior type correction and separates independent universes', async () => {
    await mkdir('tmp/conformance', {recursive: true});
    const temporary = await mkdtemp(path.resolve('tmp/conformance/private-path-marker-'));
    try {
      const original = await readFile(source);
      const independent = path.join(temporary, 'independent.wsdl');
      await writeFile(independent, original);
      const first = await inspectCheckedResponse(source, {selector, responseBytes: response(invalidUri), includeCorrectionTargets: true});
      const second = await inspectCheckedResponse(independent, {selector, responseBytes: response(invalidUri), includeCorrectionTargets: true});
      const target = first.correctionTargets![0]!;
      expect(target).toMatchObject({kind: 'available', declaredType: {namespace: xsd, local: 'anyURI'}});
      expect(second.diagnostics[0]!.diagnostic!.universe).not.toBe(first.diagnostics[0]!.diagnostic!.universe);
      expect(second.diagnostics[0]!.diagnostic!.resource).not.toBe(first.diagnostics[0]!.diagnostic!.resource);
      if (target.kind !== 'available') throw new Error('Original authored target required');
      const input = await loadSemanticSchemaInput(source, {policy: {fileRoots: [path.dirname(source)]}});
      const inventory = inspectSourceCorrectionInventory([input]);
      const correctionFile = path.join(temporary, 'correction.json');
      await writeFile(correctionFile, JSON.stringify({version: 1, resources: inventory.resources.map(({uri, digest}) => ({uri, digest})),
        corrections: [{kind: 'set-declared-type', target: target.target, expectedType: {namespace: xsd, local: 'anyURI'}, type: {namespace: xsd, local: 'string'}}]}));
      const corrected = await inspectCheckedResponse(source, {selector, responseBytes: response(invalidUri, 'bad-time-marker'),
        checkedComponents: {fileRoots: [path.dirname(source)], sourceCorrectionsFile: correctionFile}, includeCorrectionTargets: true});
      expect(corrected.diagnostics[0]).toMatchObject({diagnostic: {declaration: {kind: 'attribute', name: {local: 'Stamp'}}}});
      expect(corrected.correctionTargets![0]).toMatchObject({kind: 'available', declaredType: {namespace: xsd, local: 'dateTime'},
        target: {uri: input.root.uri, digest: input.root.digest}});
      expect(JSON.stringify(corrected.diagnostics)).not.toContain('private-path-marker');
      expect(await readFile(source)).toEqual(original);
    } finally {await rm(temporary, {recursive: true, force: true});}
  });

  it('retains one-based repeated occurrence indexes and refuses capacities and cancellation before sources', async () => {
    await mkdir('tmp/conformance', {recursive: true});
    const temporary = await mkdtemp(path.resolve('tmp/conformance/diagnostic-repeat-'));
    try {
      const file = path.join(temporary, 'repeat.wsdl');
      await writeFile(file, (await readFile(source, 'utf8')).replace('name="Embed" type="xs:anyURI"', 'name="Embed" type="xs:anyURI" maxOccurs="2"'));
      const bytes = response('https://example.test/', undefined, `<Embed>${invalidUri}</Embed>`);
      const report = await inspectCheckedResponse(file, {selector, responseBytes: bytes});
      expect(report.diagnostics[0]!.diagnostic?.location).toBe(`/{${namespace}}FetchResponse[1]/{${namespace}}Embed[2]`);
      const missing = path.join(temporary, 'absent.wsdl');
      expect((await inspectCheckedResponse(missing, {selector, responseBytes: bytes, limits: {maxBytes: 8}, includeCorrectionTargets: true})).correctionTargets)
        .toEqual([{diagnostic: 0, kind: 'unavailable', reason: 'native-declaration-unavailable'}]);
      expect((await inspectCheckedResponse(missing, {selector, responseBytes: bytes, signal: AbortSignal.abort()})).diagnostics[0]!.kind).toBe('cancelled');
    } finally {await rm(temporary, {recursive: true, force: true});}
  });
});
