/** Independent WSDL/XSD expectations; no fixture endpoint is contacted or codec implied. */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdtemp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {selectDirectOperation, selectComponentOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectMessageRoot, DirectOperationContract, DirectOperationResult, DirectOperationSelector} from '../../src/compiler/directOperation.js';
import {assessSchemaSource, parseAssessmentReport, serializeAssessmentReport} from '../../src/compiler/checkedAssessment.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import type {GraphNode} from '../../src/compiler/canonicalGraph.js';
import {createDirectValueMapping, createComponentValueMapping, inspectComponentValueMapping, expandProjectionValue} from '../../src/compiler/directValues.js';

const fixtures = path.resolve('test/conformance/fixtures');
const forecast = path.join(fixtures, 'assessment/forecast.wsdl');
const choices = path.join(fixtures, 'wsdl/bindings/binding-direct-choices.wsdl');
const namespace = 'urn:checked:forecast';
const selector: DirectOperationSelector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
let scratch: string, sourceText: string;
beforeAll(async () => {
  const parent = path.resolve('tmp/conformance/direct-operation');
  await mkdir(parent, {recursive: true});
  scratch = await mkdtemp(path.join(parent, 'suite-'));
  sourceText = await readFile(forecast, 'utf8');
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
const loading = {policy: {fileRoots: [fixtures]}};
const select = (source = forecast, selected = selector, extra: Partial<Parameters<typeof selectDirectOperation>[2]> = {}) => selectDirectOperation(source, selected, {limits: {}, loading, ...extra});
async function altered(text: string, selected = selector, extra: Partial<Parameters<typeof selectDirectOperation>[2]> = {}) {
  const directory = await mkdtemp(path.join(scratch, 'case-'));
  const source = path.join(directory, 'source.wsdl');
  await writeFile(source, text);
  return selectDirectOperation(source, selected, {limits: {}, loading: {policy: {fileRoots: [directory]}}, ...extra});
}
function selected(result: DirectOperationResult): DirectOperationContract & {input: DirectMessageRoot; output: DirectMessageRoot} {
  expect(result.kind).toBe('selected');
  if (result.kind !== 'selected') throw new Error(`${result.kind}: ${result.rule}`);
  const {contract} = result;
  if (!('element' in contract.input) || !('element' in contract.output)) throw new Error('Document operation expected');
  return contract as DirectOperationContract & {input: DirectMessageRoot; output: DirectMessageRoot};
}
function found(context: SemanticContext, id: string): GraphNode {
  const node = context.lookup(id);
  if (node.kind !== 'found') throw new Error(`missing actual node ${id}`);
  return node.node;
}
function sequence(context: SemanticContext, root: DirectMessageRoot) {
  const type = context.resolve(root.type);
  if (type.kind !== 'found' || type.node.kind !== 'complexType' || !type.node.content) throw new Error('expected actual complex type content');
  const particle = found(context, type.node.content);
  if (particle.kind !== 'particle' || particle.term.kind !== 'sequence') throw new Error('expected ordered sequence');
  return particle.term.children.map(id => {
    const child = found(context, id);
    if (child.kind !== 'particle' || child.term.kind !== 'element') throw new Error('expected element particle');
    const element = context.resolve(child.term.declaration);
    if (element.kind !== 'found' || element.node.kind !== 'element') throw new Error('expected actual element');
    const scalar = context.resolve(element.node.type);
    if (scalar.kind !== 'builtin') throw new Error('expected builtin scalar');
    return {name: element.node.name, type: scalar.name.local, occurs: child.occurs};
  });
}

describe('authenticated direct operation source contract', () => {
  for (const [profile, selectOperation, soapNamespace] of [
    ['direct SOAP 1.1', selectDirectOperation, 'http://schemas.xmlsoap.org/wsdl/soap/'],
    ['component SOAP 1.1', selectComponentOperation, 'http://schemas.xmlsoap.org/wsdl/soap/'],
    ['component SOAP 1.2', selectComponentOperation, 'http://schemas.xmlsoap.org/wsdl/soap12/'],
  ] as const) {
    describe(`binding allowlists: ${profile}`, () => {
      async function check(extension = '') {
        const directory = await mkdtemp(path.join(scratch, 'allowlist-'));
        const source = path.join(directory, 'source.wsdl');
        await writeFile(source, sourceText.replace('<soap:binding ', extension + '<soap:binding ')
          .replaceAll('http://schemas.xmlsoap.org/wsdl/soap/', soapNamespace));
        return selectOperation(source, selector, {loading: {policy: {fileRoots: [directory]}}});
      }

      it('preserves the supported operation control', async () => {
        const result = await check();
        expect(result.kind).toBe('selected');
        if (result.kind !== 'selected') throw new Error(result.rule);
        expect(result.contract.binding).toMatchObject({version: soapNamespace.endsWith('/soap12/') ? '1.2' : '1.1',
          action: 'urn:checked:GetForecast', style: 'document', use: 'literal'});
        expect(result.contract.admitted).toBe(false);
      });

      it.each(['constructor', 'toString', '__proto__', 'ordinaryUnknown'])('refuses unknown %s source syntax', async name => {
        for (const prefix of ['soap', 'wsdl']) for (const attributes of [' flag="x"', '', ' wsdl:required="true"']) {
          const result = await check(`<${prefix}:${name}${attributes}/>`);
          expect(result, `${prefix}:${name}${attributes}`).toMatchObject({kind: 'unsupported', rule: 'wsdl-extension'});
          expect('contract' in result).toBe(false);
        }
      });
    });
  }

  it('keeps additive component source authority distinct from preview codec admission', async () => {
    const contract = selected(await selectComponentOperation(forecast, selector, {loading}));
    expect(contract).toMatchObject({basis: 'native-component-premises-v1', correspondence: 'dated-XSD-2004-components-v1', admitted: false});
    expect(inspectDirectOperation(contract).evidence).toMatchObject({kind: 'component-source', schemaEligible: true, admitted: false});
    expect(() => inspectDirectOperation({...contract})).toThrow(TypeError);
    expect(createDirectValueMapping(contract, {kind: 'input'})).toMatchObject({kind: 'unsupported', rule: 'direct-mapping-version'});
    const mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
    expect(mapping).toMatchObject({version: 'component-values-v1', admitted: false});
    inspectComponentValueMapping(mapping, contract);
    expect(() => inspectComponentValueMapping({...mapping}, contract)).toThrow(TypeError);
    const other = selected(await selectComponentOperation(forecast, selector, {loading}));
    expect(() => inspectComponentValueMapping(mapping, other)).toThrow(TypeError);
    expect(selected(await select())).toMatchObject({basis: 'native-direct-premises-v1', correspondence: 'dated-XSD-2004-direct-v1'});
  });

  it('uses the shared binding owner to select exact roots from an authorized imported component source', async () => {
    const namespace = 'urn:conformance:import-relative-types';
    const source = path.join(fixtures, 'xsd/imports/import-relative-types.wsdl');
    const selection = {portType: {namespace, local: 'ImportPortType'}, binding: {namespace, local: 'ImportBinding'}, operation: 'SubmitImported'};
    const contract = selected(await selectComponentOperation(source, selection, {loading}));
    const inspection = inspectDirectOperation(contract);
    expect(contract.binding.action).toBe('urn:SubmitImported');
    expect(contract.input.element.name).toEqual({namespace, local: 'SubmitImported'});
    expect(contract.output.element.name).toEqual({namespace, local: 'SubmitImportedResponse'});
    expect(inspection.source.resources).toHaveLength(2);
    expect(inspection.evidence).toMatchObject({kind: 'component-source', schemaEligible: true});
    const mapping = createComponentValueMapping(contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(mapping.kind);
    expect(mapping.root).toBe(contract.input);
    if (!('element' in mapping.root)) throw new Error('Document mapping expected');
    expect(inspectComponentValueMapping(mapping, contract).projection?.root).toMatchObject({kind: 'record'});
    const expanded = expandProjectionValue(inspection.context, mapping.root.element, {payload: {name: 'Synthetic imported value'}});
    expect(expanded).toMatchObject({kind: 'projection-expanded', validated: {value: {payload: {name: 'Synthetic imported value'}}}});
    if (expanded.kind !== 'projection-expanded') throw new Error(expanded.kind);
    const payload = expanded.payload.children.filter(child => child.kind === 'element');
    expect(payload.map(child => child.name)).toEqual([{namespace, local: 'payload'}]);
    expect(payload[0]!.children.filter(child => child.kind === 'element').map(child => child.name))
      .toEqual([{namespace: namespace + ':types', local: 'name'}]);
    const invalid = {payload: {name: 23}};
    expect(expandProjectionValue(inspection.context, mapping.root.element, invalid)).toMatchObject({kind: 'value-invalid'});
    expect(invalid).toEqual({payload: {name: 23}});
    const refused = await selectComponentOperation(source, {...selection, binding: {namespace, local: 'OtherBinding'}}, {loading});
    expect(refused).toMatchObject({kind: 'selection-refused'});
    expect('contract' in refused).toBe(false);
  });

  it('keeps component-source permission, explicit budget and cancellation boundaries', async () => {
    expect(await selectComponentOperation(forecast, selector, {loading: {policy: {fileRoots: [scratch]}}}))
      .toMatchObject({kind: 'loading-refused'});
    expect(await selectComponentOperation(forecast, selector, {loading, limits: {maxWork: 10}}))
      .toMatchObject({kind: 'resource-limit'});
    const controller = new AbortController(); controller.abort();
    expect(await selectComponentOperation(forecast, selector, {loading, signal: controller.signal}))
      .toMatchObject({kind: 'cancelled'});
  });
  it('derives the exact Forecast roots, order and occurrence bounds without runtime admission', async () => {
    const contract = selected(await select());
    const {context} = inspectDirectOperation(contract);
    expect(contract.selector).toEqual(selector);
    expect(contract.binding).toMatchObject({version: '1.1', style: 'document', use: 'literal', action: 'urn:checked:GetForecast', transport: 'http://schemas.xmlsoap.org/soap/http'});
    expect(contract.input.message).toEqual({namespace, local: 'ForecastInput'});
    expect(contract.input.part).toBe('parameters');
    expect(contract.input.element.name).toEqual({namespace, local: 'GetForecast'});
    expect(contract.output.message).toEqual({namespace, local: 'ForecastOutput'});
    expect(contract.output.element.name).toEqual({namespace, local: 'GetForecastResponse'});
    for (const [root, typeName] of [[contract.input, 'ForecastRequest'], [contract.output, 'ForecastResponse']] as const) {
      const type = context.resolve(root.type);
      expect(type.kind).toBe('found');
      if (type.kind === 'found') expect(type.node.identity).toEqual({kind: 'global', role: 'type', name: {namespace, local: typeName}});
    }
    expect(contract.faults.map(f => ({name: f.name, message: f.root.message, part: f.root.part, element: f.root.element.name}))).toEqual([{name: 'ForecastError', message: {namespace, local: 'ForecastError'}, part: 'detail', element: {namespace, local: 'ForecastFault'}}]);
    for (const root of [contract.input, contract.output, contract.faults[0]!.root]) expect(found(context, root.element.id)).toBe(root.element);
    expect(sequence(context, contract.input)).toEqual([{name: {namespace, local: 'city'}, type: 'string', occurs: {min: '1', max: '1'}}, {name: {namespace, local: 'days'}, type: 'int', occurs: {min: '1', max: '1'}}]);
    expect(sequence(context, contract.output).map(p => [p.name.local, p.type, p.occurs])).toEqual([['city', 'string', {min: '1', max: '1'}], ['temperature', 'int', {min: '0', max: 'unbounded'}], ['complete', 'boolean', {min: '1', max: '1'}]]);
    expect(sequence(context, contract.faults[0]!.root).map(p => [p.name.local, p.type])).toEqual([['code', 'string'], ['message', 'string']]);
    expect(contract.admitted).toBe(false);
    expect(contract.missingCapabilities).toEqual(['matcher', 'projection', 'scalar-payload', 'bundle', 'codec', 'buffered-transport', 'structured-generation']);
    expect(contract.basis).toBe('native-direct-premises-v1');
    expect(contract.correspondence).toBe('dated-XSD-2004-direct-v1');
    expect(Object.isFrozen(contract.input.element)).toBe(true);
    expect(Object.isFrozen(contract.binding)).toBe(true);
    expect(Object.isFrozen(contract.faults)).toBe(true);
  });
  it('accepts independent namespace/name/prefix changes and source-selected action', async () => {
    const renamed = sourceText.replaceAll(namespace, 'urn:other:climate').replaceAll('ForecastPortType', 'ClimatePort').replaceAll('ForecastBinding', 'ClimateBinding').replaceAll('ForecastInput', 'Ask').replaceAll('ForecastOutput', 'Answer').replaceAll('ForecastError', 'Problem').replaceAll('GetForecastResponse', 'ArbitraryReply').replaceAll('GetForecast', 'ReadClimate').replaceAll('xmlns:t=', 'xmlns:alias=').replaceAll('t:', 'alias:').replaceAll('soap:', 's:').replaceAll('xmlns:soap=', 'xmlns:s=');
    const contract = selected(await altered(renamed, {portType: {namespace: 'urn:other:climate', local: 'ClimatePort'}, binding: {namespace: 'urn:other:climate', local: 'ClimateBinding'}, operation: 'ReadClimate'}));
    expect(contract.input.message.local).toBe('Ask');
    expect(contract.output.element.name.local).toBe('ArbitraryReply');
    expect(contract.faults[0]!.name).toBe('Problem');
    expect(contract.binding.action).toBe('urn:checked:ReadClimate');
  });
  it('selects explicit operations and bindings among multiple valid choices including style overrides', async () => {
    const choose = (operation: string, binding: string): DirectOperationSelector => ({portType: {namespace: 'urn:direct:choices', local: 'Choices'}, binding: {namespace: 'urn:direct:choices', local: binding}, operation});
    for (const [operation, binding, action] of [['First', 'Primary', 'urn:first'], ['Second', 'Primary', 'urn:second'], ['Second', 'Alternate', 'urn:alternate:second']]) {
      const contract = selected(await select(choices, choose(operation!, binding!)));
      expect(contract.input.element.name.local).toBe(operation + 'Input');
      expect(contract.output.element.name.local).toBe(operation + 'Output');
      expect(contract.binding.action).toBe(action);
    }
    expect((await select(choices, {...choose('First', 'Primary'), binding: undefined} as unknown as DirectOperationSelector)).kind).toBe('selection-refused');
  });
  it('requires expanded names and refuses missing or overloaded exact operations', async () => {
    expect((await select(forecast, {...selector, portType: {...selector.portType, namespace: 'urn:wrong'}})).kind).toBe('selection-refused');
    expect((await select(forecast, {...selector, operation: 'getforecast'})).kind).toBe('selection-refused');
    const abstractOperation = /<wsdl:portType[^>]*>(.*?)<\/wsdl:portType>/s.exec(sourceText)![1]!;
    expect((await altered(sourceText.replace(abstractOperation, abstractOperation + abstractOperation))).kind).toBe('selection-refused');
  });
  it('checks the selected binding actually references the selected portType', async () => {
    const originalPort = /<wsdl:portType.*?<\/wsdl:portType>/s.exec(sourceText)![0]!;
    const otherPort = originalPort.replace('name="ForecastPortType"', 'name="OtherPort"');
    const changed = sourceText.replace(originalPort, originalPort + otherPort).replace('type="t:ForecastPortType"', 'type="t:OtherPort"');
    expect(await altered(changed)).toMatchObject({kind: 'selection-refused', rule: 'binding-portType-mismatch'});
  });
  it.each([
    ['message', (s: string) => s.replace('message="t:ForecastInput"', 'message="t:Missing"')],
    ['element', (s: string) => s.replace('element="t:GetForecast"', 'element="t:Missing"')],
    ['part selection', (s: string) => s.replace('<soap:body use="literal"/>', '<soap:body use="literal" parts="absent"/>')],
    ['part missing', (s: string) => s.replace('<wsdl:part name="parameters" element="t:GetForecast"/>', '')],
    ['bound fault missing', (s: string) => s.replace('<wsdl:fault name="ForecastError"><soap:fault name="ForecastError" use="literal"/></wsdl:fault>', '')],
    ['bound fault renamed', (s: string) => s.replace('<wsdl:fault name="ForecastError"><soap:fault', '<wsdl:fault name="Other"><soap:fault')],
    ['SOAP fault renamed', (s: string) => s.replace('<soap:fault name="ForecastError"', '<soap:fault name="Other"')],
    ['message exchange', (s: string) => s.replace('<wsdl:input message="t:ForecastInput"/><wsdl:output message="t:ForecastOutput"/>', '<wsdl:output message="t:ForecastOutput"/><wsdl:input message="t:ForecastInput"/>')],
    ['binding input name', (s: string) => s.replace('<wsdl:input><soap:body', '<wsdl:input name="Other"><soap:body')],
    ['bound message order', (s: string) => s.replace('<wsdl:input><soap:body use="literal"/></wsdl:input><wsdl:output><soap:body use="literal"/></wsdl:output>', '<wsdl:output><soap:body use="literal"/></wsdl:output><wsdl:input><soap:body use="literal"/></wsdl:input>')],
    ['empty abstract input name', (s: string) => s.replace('<wsdl:input message="t:ForecastInput"', '<wsdl:input name="" message="t:ForecastInput"')],
    ['spaced abstract input name', (s: string) => s.replace('<wsdl:input message="t:ForecastInput"', '<wsdl:input name="not a name" message="t:ForecastInput"')],
  ])('refuses broken %s mapping rather than inventing a root', async (_label, transform) => {
    expect((await altered(transform(sourceText))).kind).not.toBe('selected');
  });
  it.each([
    ['rpc', (s: string) => s.replace('style="document"', 'style="rpc"')],
    ['operation override', (s: string) => s.replace('<soap:operation ', '<soap:operation style="rpc" ')],
    ['invalid binding style masked by operation override', (s: string) => s.replace('style="document"', 'style="nonsense"').replace('<soap:operation ', '<soap:operation style="document" ')],
    ['encoded body', (s: string) => s.replace('<soap:body use="literal"', '<soap:body use="encoded"')],
    ['encoded fault', (s: string) => s.replace('<soap:fault name="ForecastError" use="literal"', '<soap:fault name="ForecastError" use="encoded"')],
    ['SOAP 1.2', (s: string) => s.replaceAll('http://schemas.xmlsoap.org/wsdl/soap/', 'http://schemas.xmlsoap.org/wsdl/soap12/')],
    ['non HTTP transport', (s: string) => s.replace('transport="http://schemas.xmlsoap.org/soap/http"', 'transport="urn:other"')],
    ['header', (s: string) => s.replace('<soap:body use="literal"/>', '<soap:body use="literal"/><soap:header message="t:ForecastInput" part="parameters" use="literal"/>')],
    ['type based part', (s: string) => s.replace('element="t:GetForecast"', 'type="t:ForecastRequest"')],
    ['multipart', (s: string) => s.replace('<wsdl:part name="parameters" element="t:GetForecast"/>', '<wsdl:part name="parameters" element="t:GetForecast"/><wsdl:part name="other" element="t:GetForecast"/>')],
    ['required extension', (s: string) => s.replace('<soap:binding ', '<unknown:policy xmlns:unknown="urn:policy" wsdl:required="true"/><soap:binding ')],
    ['optional extension', (s: string) => s.replace('<soap:binding ', '<unknown:policy xmlns:unknown="urn:policy" wsdl:required="false"/><soap:binding ')],
    ['required misplaced schema extension', (s: string) => s.replace('</wsdl:definitions>', '<xs:schema wsdl:required="true"><foreign:policy xmlns:foreign="urn:foreign"/></xs:schema></wsdl:definitions>')],
    ['optional misplaced schema extension', (s: string) => s.replace('</wsdl:definitions>', '<xs:schema wsdl:required="false"><foreign:policy xmlns:foreign="urn:foreign"/></xs:schema></wsdl:definitions>')],
    ['nested SOAP syntax', (s: string) => s.replace('<soap:body use="literal"/>', '<soap:body use="literal"><soap:address location="urn:misplaced"/></soap:body>')],
    ['message attribute on bound input', (s: string) => s.replace('<wsdl:input><soap:body', '<wsdl:input message="t:ForecastOutput"><soap:body')],
  ])('classifies legal or unknown unsupported %s separately from invalid XSD', async (_label, transform) => {
    expect((await altered(transform(sourceText))).kind).toBe('unsupported');
  });
  it('authenticates actual object identity and the expected source context', async () => {
    const contract = selected(await select());
    const foreign = selected(await select());
    const actual = inspectDirectOperation(contract).context;
    expect(inspectDirectOperation(contract, actual).contract).toBe(contract);
    expect(() => inspectDirectOperation(contract, inspectDirectOperation(foreign).context)).toThrow(TypeError);
    for (const forged of [{...contract}, JSON.parse(JSON.stringify(contract)), {...contract, input: foreign.input}, {...contract, binding: {...contract.binding, action: 'urn:forged'}}]) expect(() => inspectDirectOperation(forged)).toThrow(TypeError);
    const report = await assessSchemaSource(forecast, {loading});
    expect(() => inspectDirectOperation(parseAssessmentReport(serializeAssessmentReport(report)) as unknown as DirectOperationContract)).toThrow(TypeError);
    expect(() => { (contract.input as {part: string}).part = 'changed'; }).toThrow(TypeError);
  });
  it('requalifies changed sources while old immutable source evidence stays tied to its own snapshot', async () => {
    const original = selected(await select());
    const changed = selected(await altered(sourceText.replace('urn:checked:GetForecast', 'urn:new:action')));
    expect(changed.binding.action).toBe('urn:new:action');
    expect(original.binding.action).toBe('urn:checked:GetForecast');
    expect(changed.input.source.digest).not.toBe(original.input.source.digest);
    expect(() => inspectDirectOperation(changed, inspectDirectOperation(original).context)).toThrow(TypeError);
  });
  it('uses an explicitly changed declared-fault element instead of assuming a name convention', async () => {
    const changed = selected(await altered(sourceText.replace('element="t:ForecastFault"', 'element="t:GetForecastResponse"')));
    expect(changed.faults[0]!.name).toBe('ForecastError');
    expect(changed.faults[0]!.root.element.name).toEqual({namespace, local: 'GetForecastResponse'});
  });
  it('preserves unrelated actual-schema invalidity and correspondence-inconclusive distinctions', async () => {
    const invalid = sourceText.replace('</xs:schema>', '<xs:element name="Unrelated" type="xs:string" nillable="bogus"/></xs:schema>');
    expect((await altered(invalid)).kind).toBe('invalid-schema');
    const outside = sourceText.replace('<xs:element name="city" type="xs:string"/>', '<xs:element name="city" type="xs:token"/>');
    expect((await altered(outside)).kind).toBe('inconclusive');
  });
  it('refuses loading outside policy and preserves local file URI selection', async () => {
    expect((await select(forecast, selector, {loading: {policy: {fileRoots: [scratch]}}})).kind).toBe('loading-refused');
    expect((await select('ftp://example.invalid/source.wsdl')).kind).toBe('loading-refused');
    expect(selected(await select(pathToFileURL(forecast).href)).input.element.name).toEqual({namespace, local: 'GetForecast'});
  });
  it('keeps exhaustion sticky before loading and near the completed selection budget', async () => {
    expect((await select(forecast, selector, {limits: {maxWork: 100}})).kind).toBe('resource-limit');
    expect((await select(forecast, selector, {limits: {maxNodes: 1}})).kind).toBe('resource-limit');
    for (const [operation, expectedKind] of [[selector.operation, 'selected'], ['AbsentOperation', 'selection-refused']] as const) {
      const explicit = {...selector, operation};
      const complete = await select(forecast, explicit);
      expect(complete.kind).toBe(expectedKind);
      // One unit less than the observed selection/refusal or issuance boundary cannot fund completion.
      const limited = await select(forecast, explicit, {limits: {maxWork: complete.usage.work - 1}});
      expect(limited.kind).toBe('resource-limit');
      expect('contract' in limited).toBe(false);
    }
  });
  it('observes pre-aborted cancellation and cancellation at a loading cooperative boundary', async () => {
    const aborted = new AbortController(); aborted.abort();
    expect((await select(forecast, selector, {signal: aborted.signal})).kind).toBe('cancelled');
    const during = new AbortController();
    const server = createServer((_request, response) => {during.abort(); response.end(sourceText);});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing server address');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      const result = await selectDirectOperation(origin + '/source.wsdl', selector, {limits: {}, loading: {policy: {allowedOrigins: [origin]}}, signal: during.signal});
      expect(result.kind).toBe('cancelled');
      expect('contract' in result).toBe(false);
    } finally {server.close(); await once(server, 'close');}
  });
  it('performs no dispatch to service metadata and writes no generated output', async () => {
    let calls = 0;
    const server = createServer((_request, response) => {calls++; response.end();});
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('missing server address');
    const directory = await mkdtemp(path.join(scratch, 'no-artifacts-'));
    const source = path.join(directory, 'source.wsdl');
    await writeFile(source, sourceText.replace('http://127.0.0.1:1/forecast', `http://127.0.0.1:${address.port}/forbidden`));
    try {
      selected(await selectDirectOperation(source, selector, {limits: {}, loading: {policy: {fileRoots: [directory]}}}));
      expect(calls).toBe(0);
      expect(await readdir(directory)).toEqual(['source.wsdl']);
    } finally {server.close(); await once(server, 'close');}
  });
});
