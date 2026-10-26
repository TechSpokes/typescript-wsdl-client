import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract, DirectOperationSelector} from '../../src/compiler/directOperation.js';
import {matchDirectOperation, inspectDirectStructuralMatch} from '../../src/compiler/directStructure.js';
import type {DirectDirection} from '../../src/compiler/directStructure.js';
import {assessDirectScalars, createDirectValueMapping, expandDirectValue, inspectDirectValue, inspectDirectValueMapping, inspectDirectExpandedValue} from '../../src/compiler/directValues.js';
import type {DirectValueReceipt, DirectValueMapping, DirectExpandedValue} from '../../src/compiler/directValues.js';
import {parseOrderedSyntax, syntaxElements} from '../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../src/loader/orderedSyntax.js';
const ns = 'urn:checked:forecast';
const fixture = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
const selector: DirectOperationSelector = {portType: {namespace: ns, local: 'ForecastPortType'}, binding: {namespace: ns, local: 'ForecastBinding'}, operation: 'GetForecast'};
let scratch: string, original: string;
beforeAll(async () => {
  await mkdir('tmp/conformance/direct-values', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/direct-values/suite-'));
  original = await readFile(fixture, 'utf8');
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function contract(text?: string, choose = selector, maxWork?: number): Promise<DirectOperationContract> {
  const directory = text === undefined ? path.dirname(fixture) : await mkdtemp(path.join(scratch, 'source-'));
  const source = text === undefined ? fixture : path.join(directory, 'source.wsdl');
  if (text !== undefined) await writeFile(source, text);
  const selected = await selectDirectOperation(source, choose, {loading: {policy: {fileRoots: [directory]}}, limits: maxWork ? {maxWork} : undefined});
  if (selected.kind !== 'selected') throw new Error(`${selected.kind}:${selected.rule}`);
  return selected.contract;
}
function xml(text: string): SyntaxElement {return parseOrderedSyntax(Buffer.from(text), 'file:///direct-values-test.xml').root;}
function input(city = 'Paris', days = '2') {return xml(`<t:GetForecast xmlns:t="${ns}"><t:city>${city}</t:city><t:days>${days}</t:days></t:GetForecast>`);}
function response(bool: string) {return xml(`<t:GetForecastResponse xmlns:t="${ns}"><t:city>Paris</t:city><t:complete>${bool}</t:complete></t:GetForecastResponse>`);}
function mapping(c: DirectOperationContract, d: DirectDirection = {kind: 'input'}): DirectValueMapping {
  const r = createDirectValueMapping(c, d); expect(r.kind).toBe('direct-mapping');
  if (r.kind !== 'direct-mapping') throw new Error(r.kind); return r;
}
function value(c: DirectOperationContract, payload: SyntaxElement, d: DirectDirection = {kind: 'input'}): DirectValueReceipt {
  const m = matchDirectOperation(c, d, payload); expect(m.kind).toBe('structural-match');
  const v = assessDirectScalars(c, m); expect(v.kind).toBe('direct-value');
  if (v.kind !== 'direct-value') throw new Error(v.kind); return v;
}
function expanded(c: DirectOperationContract, m: DirectValueMapping, v: unknown): DirectExpandedValue {
  const e = expandDirectValue(c, m, v); expect(e.kind).toBe('direct-expanded');
  if (e.kind !== 'direct-expanded') throw new Error(e.kind); return e;
}
describe('direct scalar and fresh value contract', () => {
  it('projects literal Forecast fixtures in every direction and expands fresh values', async () => {
    const c = await contract();
    const fixtures = path.join(path.dirname(fixture), 'forecast-messages');
    const expected = JSON.parse(await readFile(path.join(fixtures, 'expectations.json'), 'utf8')) as {request: unknown; response: unknown};
    for (const [name, direction, application] of [
      ['request', {kind: 'input'}, expected.request],
      ['response', {kind: 'output'}, expected.response],
      ['fault', {kind: 'fault', name: 'ForecastError'}, {code: 'NOT_FOUND', message: 'Unknown city'}],
    ] as const) {
      const envelope = xml(await readFile(path.join(fixtures, name + '.xml'), 'utf8'));
      const body = syntaxElements(envelope)[0]!;
      let root = syntaxElements(body)[0]!;
      if (name === 'fault') root = syntaxElements(syntaxElements(root).find(n => n.name.local === 'detail')!)[0]!;
      const receipt = value(c, root, direction);
      expect(receipt.value).toEqual(application);
      expect(Object.getPrototypeOf(receipt.value)).toBe(null);
      expect(receipt.admitted).toBe(false);
      expect(inspectDirectValue(receipt, c)).toBe(receipt);
      const fresh = structuredClone(application);
      const e = expanded(c, mapping(c, direction), fresh);
      expect(e.validated.value).toEqual(application);
      expect(e.provenance).toBe('generated-direct-value');
      expect(inspectDirectExpandedValue(e, c)).toBe(e);
      expect(e.validated.operands.every(o => o.payloadSource.uri.startsWith('urn:'))).toBe(true);
      expect(Object.isFrozen(fresh)).toBe(false);
      const twice = expanded(c, e.validated.mapping, e.validated.value);
      expect(twice.validated.value).toEqual(e.validated.value);
      expect(twice.validated.operands.map(o => [o.declaration.name, o.canonical])).toEqual(e.validated.operands.map(o => [o.declaration.name, o.canonical]));
    }
  });
  it.each([
    ['-2147483648', -2147483648], ['2147483647', 2147483647], ['+00', 0], ['-0', 0], [' \t+002\n', 2],
  ] as const)('validates int %j through shared core', async (lexical, expected) => {
    const c = await contract(), v = value(c, input('Paris', lexical));
    expect(v.value).toEqual({city: 'Paris', days: expected});
    expect(v.operands[1]!.lexical).toBe(lexical);
    expect(v.operands[1]!.canonical).toBe(String(expected));
    expect(v.operands[1]!.declaration.type).toBe(v.operands[1]!.type);
  });
  it.each(['2147483648', '-2147483649', '1.5', '1e2', '0x10', '', 'not-an-int', '\u00a02', '2\u00a0', '1 2'])('rejects scalar-invalid int %j after structural success', async lexical => {
    const c = await contract(), m = matchDirectOperation(c, {kind: 'input'}, input('Paris', lexical));
    expect(m.kind).toBe('structural-match');
    const result = assessDirectScalars(c, m);
    expect(result).toMatchObject({kind: 'scalar-invalid', payloadPath: '/0/children/1'});
    expect(result).not.toHaveProperty('value');
    expect(result).not.toHaveProperty('operands');
    if (result.kind !== 'direct-value' && m.kind === 'structural-match') expect(result.schemaPath).toBe(m.occurrences[1]!.schemaPath);
  });
  it.each([['true', true], ['false', false], ['1', true], ['0', false], [' \tfalse\n', false]] as const)('validates boolean %j', async (lexical, expected) => {
    const c = await contract();
    const v = value(c, response(lexical), {kind: 'output'});
    expect(v.value).toEqual({city: 'Paris', temperature: [], complete: expected});
    expect(v.operands[1]!.lexical).toBe(lexical);
    expect(v.operands[1]!.canonical).toBe(expected ? 'true' : 'false');
  });
  it.each(['yes', 'TRUE', 'False', '', 'true false', '\u00a0true', '2'])('rejects boolean %j after structural success', async lexical => {
    const c = await contract(), m = matchDirectOperation(c, {kind: 'output'}, response(lexical));
    expect(m.kind).toBe('structural-match'); expect(assessDirectScalars(c, m).kind).toBe('scalar-invalid');
  });
  it.each(['', ' \t\n', 'café 漢字 😀', ' A & B '])('preserves string content %j', async text => {
    const c = await contract();
    const raw = structuredClone(input());
    (syntaxElements(raw)[0]!.children[0] as {value: string}).value = text;
    const v = value(c, raw);
    expect(v.operands[0]!.value).toBe(text);
    expect(expanded(c, v.mapping, {days: -0, city: text}).validated.value).toEqual({city: text, days: 0});
    expect(Object.is((expanded(c, v.mapping, {city: text, days: -0}).validated.value as {days: number}).days, -0)).toBe(false);
  });
  it.each(['\0', '\u0001', '\u000b', '\ud800', '\udfff', '\ufffe', '\uffff'])('rejects XML-invalid string %j without parsing', async text => {
    const c = await contract(), raw = structuredClone(input());
    (syntaxElements(raw)[0]!.children[0] as {value: string}).value = text;
    const m = matchDirectOperation(c, {kind: 'input'}, raw);
    expect(m.kind).toBe('structural-match'); expect(assessDirectScalars(c, m).kind).toBe('scalar-invalid');
    expect(expandDirectValue(c, mapping(c), {city: text, days: 2}).kind).toBe('scalar-invalid');
  });
  it('covers complete absent plans, optional omission/empty and all occurrence forms', async () => {
    for (const [min, max] of [['0', '1'], ['1', '1'], ['0', 'unbounded'], ['1', 'unbounded']] as const) {
      const c = await contract(original.replace('name="days" type="xs:int"', `name="days" type="xs:int" minOccurs="${min}" maxOccurs="${max}"`));
      const m = mapping(c); expect(m.slots).toHaveLength(2);
      for (const n of [0, 1, 3]) {
        const valid = (min === '0' || n > 0) && (max === 'unbounded' || n <= 1);
        const app = max === 'unbounded' ? {city: '', days: Array<number>(n).fill(2)} : n === 0 ? {city: ''} : {city: '', days: 2};
        const result = expandDirectValue(c, m, app);
        if (valid) {
          expect(result.kind).toBe('direct-expanded');
          if (result.kind === 'direct-expanded') expect(result.validated.value).toEqual(app);
        } else if (n === 0) expect(result.kind).toBe('value-invalid');
      }
    }
    const c = await contract(original.replace('name="city" type="xs:string"', 'name="city" type="xs:string" minOccurs="0"'));
    const m = mapping(c);
    expect(expanded(c, m, {days: 2}).validated.value).toEqual({days: 2});
    expect(expanded(c, m, {days: 2, city: ''}).validated.value).toEqual({city: '', days: 2});
  });
  it('supports scalar roots, empty sequences and a renamed namespace/form source', async () => {
    for (const [type, primitive] of [['string', ' \t😀'], ['int', -2147483648], ['boolean', false]] as const) {
      const c = await contract(original.replace('name="GetForecast" type="t:ForecastRequest"', `name="GetForecast" type="xs:${type}"`));
      const m = mapping(c); expect(m.rootBuiltin?.local).toBe(type);
      expect(expanded(c, m, primitive).validated.value).toBe(primitive);
    }
    const c = await contract(original.replace('<xs:complexType name="ForecastRequest"><xs:sequence><xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/></xs:sequence></xs:complexType>', '<xs:complexType name="ForecastRequest"><xs:sequence/></xs:complexType>'));
    const empty = value(c, xml(`<GetForecast xmlns="${ns}"/>`));
    expect(empty.value).toEqual({}); expect(empty.mapping.slots).toEqual([]);
    expect(expanded(c, empty.mapping, {}).validated.value).toEqual({});
    const other = 'urn:other';
    const renamed = original.replaceAll(ns, other).replace('elementFormDefault="qualified"', 'elementFormDefault="unqualified"').replace('name="city"', 'name="place"').replace('name="days" type="xs:int"', 'name="duration" type="xs:int" form="qualified"');
    const r = await contract(renamed, {portType: {namespace: other, local: 'ForecastPortType'}, binding: {namespace: other, local: 'ForecastBinding'}, operation: 'GetForecast'});
    const e = expanded(r, mapping(r), {duration: 3, place: 'Oslo'});
    expect(syntaxElements(e.payload).map(x => x.name)).toEqual([{namespace: '', local: 'place'}, {namespace: other, local: 'duration'}]);
    expect(e.validated.value).toEqual({place: 'Oslo', duration: 3});
  });
  it.each(['__proto__', 'constructor', 'prototype', 'toString'])('treats legal name %s as inert own data', async name => {
    const c = await contract(original.replaceAll('name="city"', `name="${name}"`));
    const fresh = {[name]: 'Paris', days: 2}, m = mapping(c), e = expanded(c, m, fresh);
    expect(e.validated.value).toEqual(fresh);
    expect(Object.getPrototypeOf(e.validated.value)).toBe(null);
    expect(Object.getPrototypeOf(fresh)).toBe(Object.prototype);
    expect(Object.isFrozen(fresh)).toBe(false);
  });
  it('rejects a nonenumerable legal length field and preserves its enumerable counterpart', async () => {
    const c = await contract(original.replaceAll('name="city"', 'name="length"')), m = mapping(c);
    const hidden = Object.defineProperty({days: 2}, 'length', {value: 'Paris'});
    expect(expandDirectValue(c, m, hidden).kind).toBe('value-invalid');
    expect(expanded(c, m, {length: 'Paris', days: 2}).validated.value).toEqual({length: 'Paris', days: 2});
    expect(Object.isFrozen(hidden)).toBe(false);
  });
  it('preserves original evidence while expansion normalizes spelling, order and typed values', async () => {
    const c = await contract(), observed = value(c, input(' \t😀 ', '+000'));
    const e = expanded(c, observed.mapping, observed.value);
    expect(observed.operands.map(o => o.lexical)).toEqual([' \t😀 ', '+000']);
    expect(e.validated.operands.map(o => o.lexical)).toEqual([' \t😀 ', '0']);
    expect(e.validated.operands.map(o => [o.declaration, o.type, o.builtin, o.value])).toEqual(observed.operands.map(o => [o.declaration, o.type, o.builtin, o.value]));
    expect(observed.operands[0]!.namespaces.t).toBe(ns);
    expect(observed.operands[1]!.payloadSource.uri).toBe('file:///direct-values-test.xml');
    expect(Object.isFrozen(observed.operands[0]!.namespaces)).toBe(true);
    expect(syntaxElements(e.payload).map(n => n.name.local)).toEqual(['city', 'days']);
  });
  it('rejects malformed application records/scalars with zero getter/coercion calls', async () => {
    const c = await contract(), m = mapping(c);
    let calls = 0;
    const getter = {get city() {calls++; throw new Error('getter');}, days: 2};
    const callable = Object.assign(() => undefined, {city: 'Paris', days: 2});
    const hidden = Object.defineProperty({days: 2}, 'city', {value: 'Paris'});
    const symbol = {city: 'Paris', days: 2, [Symbol('alien')]: 1};
    for (const app of [null, undefined, [], callable, getter, hidden, symbol, {city: 'Paris'}, {days: 2}, {city: null, days: 2}, {city: '', days: undefined}, {city: '', days: '2'}, {city: '', days: NaN}, {city: '', days: Infinity}, {city: '', days: 1.5}, {city: '', days: new Number(2)}, {city: '', days: {valueOf() {calls++; return 2;}}}, {city: '', days: 2, alien: 1}, Object.create({city: 'Paris', days: 2})]) {
      expect(expandDirectValue(c, m, app).kind).toBe('value-invalid');
      if (app && typeof app === 'object') expect(Object.isFrozen(app)).toBe(false);
    }
    for (const days of [-2147483649, 2147483648]) expect(expandDirectValue(c, m, {city: '', days}).kind).toBe('scalar-invalid');
    expect(calls).toBe(0);
  });
  it('rejects malformed arrays without calling getters or freezing caller data', async () => {
    const c = await contract(), m = mapping(c, {kind: 'output'});
    let calls = 0;
    const accessor = [1]; Object.defineProperty(accessor, '0', {get() {calls++; return 1;}});
    const extra = Object.assign([1], {alien: 2});
    const symbol = [1]; Object.defineProperty(symbol, Symbol('alien'), {value: 1});
    for (const temperature of [new Array(2), extra, symbol, accessor, [undefined], ['1'], null, undefined, 2]) {
      expect(expandDirectValue(c, m, {city: '', complete: false, temperature}).kind).toBe('value-invalid');
      if (temperature && typeof temperature === 'object') expect(Object.isFrozen(temperature)).toBe(false);
    }
    expect(calls).toBe(0);
  });
  it('authenticates actual final objects and refuses copied/JSON/foreign/zero-duty receipts before getters', async () => {
    const c = await contract(), foreign = await contract(), match = matchDirectOperation(c, {kind: 'input'}, input());
    expect(inspectDirectStructuralMatch(match, c)).toBe(match);
    const v = assessDirectScalars(c, match);
    if (v.kind !== 'direct-value') throw new Error(v.kind);
    for (const forged of [{...match}, JSON.parse(JSON.stringify(match)), {kind: 'structural-match', occurrences: []}, {get kind() {throw new Error('read');}}]) expect(() => assessDirectScalars(c, forged)).toThrow(TypeError);
    expect(() => assessDirectScalars(foreign, match)).toThrow(TypeError);
    for (const forged of [{...v.mapping}, JSON.parse(JSON.stringify(v.mapping)), {...v.mapping, direction: {kind: 'output'}}]) expect(() => expandDirectValue(c, forged, {city: '', days: 2})).toThrow(TypeError);
    expect(() => expandDirectValue(foreign, v.mapping, {})).toThrow(TypeError);
    expect(() => inspectDirectValue({...v}, c)).toThrow(TypeError);
    expect(() => inspectDirectValueMapping({...v.mapping}, c)).toThrow(TypeError);
    const out = mapping(c, {kind: 'output'});
    expect(expandDirectValue(c, out, {city: '', days: 2}).kind).toBe('value-invalid');
    expect(createDirectValueMapping(c, {kind: 'fault', name: 'forecasterror'}).kind).toBe('unsupported');
  });
  it('checks cancellation and sticky exhaustion for fresh and cached successful receipts', async () => {
    const c = await contract(), m = mapping(c), v = value(c, input()), signal = AbortSignal.abort();
    for (const result of [createDirectValueMapping(c, {kind: 'input'}, {signal}), assessDirectScalars(c, v.structural, {signal}), expandDirectValue(c, m, {city: '', days: 2}, {signal})]) {
      expect(result.kind).toBe('cancelled'); expect(result).not.toHaveProperty('value');
    }
    const {budget} = inspectDirectOperation(c).context;
    const before = budget.usage().work;
    expanded(c, m, {city: '', days: 2}); expect(budget.usage().work).toBeGreaterThan(before);
    budget.guard(() => budget.chargeWork(125_000_000 - budget.usage().work));
    expect(budget.exhausted()).toBe(false);
    expect(assessDirectScalars(c, v.structural).kind).toBe('resource-limit');
    expect(expandDirectValue(c, m, {city: '', days: 2}).kind).toBe('resource-limit');
    expect(createDirectValueMapping(c, {kind: 'input'}).kind).toBe('resource-limit');
    expect(budget.exhausted()).toBe(true);
  });
  it('honors exact inclusive operation limits and refuses publication one unit below', async () => {
    const probe = await contract(), m = mapping(probe), {budget} = inspectDirectOperation(probe).context;
    const start = budget.usage().work;
    expanded(probe, m, {city: '', days: 2});
    const end = budget.usage().work;
    for (const delta of [0, -1]) {
      const c = await contract(undefined, selector, end + delta), plan = mapping(c);
      expect(inspectDirectOperation(c).context.budget.usage().work).toBe(start);
      const result = expandDirectValue(c, plan, {city: '', days: 2});
      expect(result.kind).toBe(delta === 0 ? 'direct-expanded' : 'resource-limit');
      if (delta < 0) expect(result).not.toHaveProperty('validated');
    }
  });
  it.each(['mapping', 'scalars'] as const)('honors exact work publication boundary for %s', async stage => {
    const probe = await contract();
    const perform = (c: DirectOperationContract) => stage === 'mapping' ? createDirectValueMapping(c, {kind: 'input'}) : assessDirectScalars(c, matchDirectOperation(c, {kind: 'input'}, input()));
    expect(perform(probe).kind).toBe(stage === 'mapping' ? 'direct-mapping' : 'direct-value');
    const end = inspectDirectOperation(probe).context.budget.usage().work;
    for (const delta of [0, -1]) {
      const c = await contract(undefined, selector, end + delta);
      const result = perform(c);
      expect(result.kind).toBe(delta === 0 ? stage === 'mapping' ? 'direct-mapping' : 'direct-value' : 'resource-limit');
      if (delta < 0) expect(result).not.toHaveProperty('value');
    }
  });
  it('keeps node exhaustion sticky during inverse structural revalidation', async () => {
    const c = await contract(), m = mapping(c), {budget} = inspectDirectOperation(c).context;
    budget.reserveNodes(100_000 - budget.usage().nodes);
    const result = expandDirectValue(c, m, {city: '', days: 2});
    expect(result.kind).toBe('resource-limit'); expect(result).not.toHaveProperty('payload');
    expect(createDirectValueMapping(c, {kind: 'input'}).kind).toBe('resource-limit');
  });
  it('checks cooperative cancellation during work and immediately before inverse publication', async () => {
    const probe = await contract(), plan = mapping(probe);
    let count = 0;
    const observing = {get aborted() {count++; return false;}} as AbortSignal;
    expect(expandDirectValue(probe, plan, {city: '', days: 2}, {signal: observing}).kind).toBe('direct-expanded');
    for (const threshold of [2, Math.floor(count / 2), count]) {
      const c = await contract(), m = mapping(c);
      let visits = 0;
      // Instrumented signal only, never an application getter: synchronous loops
      // cannot observe a timer abort until JavaScript yields.
      const signal = {get aborted() {return ++visits >= threshold;}} as AbortSignal;
      const result = expandDirectValue(c, m, {city: '', days: 2}, {signal});
      expect(result.kind).toBe('cancelled'); expect(result).not.toHaveProperty('validated');
      expect(result).not.toHaveProperty('payload');
    }
  });
});
