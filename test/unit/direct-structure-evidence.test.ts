/** Independent literal and finite-language evidence for the scoped P3.2 matcher.
 * Expected languages below never inspect the subject's plan or native particles.
 * This is structural evidence, not scalar, SOAP envelope or codec validation.
 */
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {parseOrderedSyntax, syntaxElements, XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../src/loader/orderedSyntax.js';
import {inspectDirectOperation, selectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract, DirectOperationSelector} from '../../src/compiler/directOperation.js';
import {matchDirectOperation} from '../../src/compiler/directStructure.js';

const namespace = 'urn:checked:forecast';
const soap = 'http://schemas.xmlsoap.org/soap/envelope/';
const fixture = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
const selector: DirectOperationSelector = {
  portType: {namespace, local: 'ForecastPortType'},
  binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast',
};
let scratch: string, sourceText: string;
beforeAll(async () => {
  const parent = path.resolve('tmp/conformance/direct-structure-evidence');
  await mkdir(parent, {recursive: true});
  scratch = await mkdtemp(path.join(parent, 'suite-'));
  sourceText = await readFile(fixture, 'utf8');
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});

async function contract(text?: string, choose = selector): Promise<DirectOperationContract> {
  const directory = text === undefined ? path.dirname(fixture) : await mkdtemp(path.join(scratch, 'source-'));
  const source = text === undefined ? fixture : path.join(directory, 'source.wsdl');
  if (text !== undefined) await writeFile(source, text);
  const selected = await selectDirectOperation(source, choose, {loading: {policy: {fileRoots: [directory]}}});
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error(`${selected.kind}: ${selected.rule}`);
  return selected.contract;
}
function xml(text: string): SyntaxElement {
  return parseOrderedSyntax(Buffer.from(text), 'file:///independent-message.xml').root;
}
function payload(root: string, content: string, ns = namespace): SyntaxElement {
  return xml(`<t:${root} xmlns:t="${ns}">${content}</t:${root}>`);
}
function members(names: readonly string[]): string {
  return names.map(name => `<t:${name}>${name === 'complete' ? 'true' : name === 'city' ? 'Paris' : '2'}</t:${name}>`).join('');
}
function sole(parent: SyntaxElement, ns: string, local: string): SyntaxElement {
  const children = syntaxElements(parent);
  const exact = children.filter(child => child.name.namespace === ns && child.name.local === local);
  expect(exact).toHaveLength(1);
  return exact[0]!;
}
/** Test-only exact SOAP path adapter; it neither dispatches nor validates an envelope. */
async function message(name: 'request' | 'response' | 'fault'): Promise<SyntaxElement> {
  const document = xml(await readFile(path.join(path.dirname(fixture), `forecast-messages/${name}.xml`), 'utf8'));
  expect(document.name).toEqual({namespace: soap, local: 'Envelope'});
  const body = sole(document, soap, 'Body');
  if (name === 'fault') return sole(sole(sole(body, soap, 'Fault'), '', 'detail'), namespace, 'ForecastFault');
  return sole(body, namespace, name === 'request' ? 'GetForecast' : 'GetForecastResponse');
}
function duties(result: ReturnType<typeof matchDirectOperation>) {
  expect(result.kind).toBe('structural-match');
  if (result.kind !== 'structural-match') throw new Error(result.kind);
  expect(result).toMatchObject({scope: 'structure-only', scalarValidity: 'unassessed', admitted: false});
  return result.occurrences;
}
function words(alphabet: readonly string[], maximum: number): string[][] {
  const all: string[][] = [[]];
  let level: string[][] = [[]];
  for (let length = 1; length <= maximum; length++) {
    level = level.flatMap(word => alphabet.map(letter => [...word, letter]));
    all.push(...level);
  }
  return all;
}

describe('independent direct structural evidence', () => {
  it('matches all literal Forecast directions and retains ordered source-owned scalar duties', async () => {
    const selected = await contract();
    const input = matchDirectOperation(selected, {kind: 'input'}, await message('request'));
    expect(duties(input).map(duty => [duty.declaration.name.local, duty.builtin.local, duty.lexical])).toEqual([
      ['city', 'string', 'Paris'], ['days', 'int', '2'],
    ]);
    const output = matchDirectOperation(selected, {kind: 'output'}, await message('response'));
    expect(duties(output).map(duty => [duty.declaration.name.local, duty.builtin.local, duty.lexical])).toEqual([
      ['city', 'string', 'Paris'], ['temperature', 'int', '18'], ['temperature', 'int', '-2'], ['complete', 'boolean', 'true'],
    ]);
    const fault = matchDirectOperation(selected, {kind: 'fault', name: 'ForecastError'}, await message('fault'));
    expect(duties(fault).map(duty => [duty.declaration.name.local, duty.builtin.local, duty.lexical])).toEqual([
      ['code', 'string', 'NOT_FOUND'], ['message', 'string', 'Unknown city'],
    ]);
    if (input.kind !== 'structural-match') throw new Error('expected structural match');
    expect(input.root).toBe(selected.input);
    expect(input.contextId).toBe(selected.contextId);
    for (const duty of input.occurrences) {
      const native = inspectDirectOperation(selected).context.lookup(duty.declaration.id);
      expect(native.kind === 'found' && native.node === duty.declaration).toBe(true);
      expect(duty.type).toBe(duty.declaration.type);
      expect(duty.builtin.namespace).toBe(XSD_NAMESPACE);
      expect(duty.schemaPath).toBe(duty.declaration.context.source.path);
      expect(duty.payloadPath).toEqual(expect.any(String));
      expect(Object.isFrozen(duty.namespaces)).toBe(true);
      expect(Object.isFrozen(duty)).toBe(true);
    }
    expect(Object.isFrozen(input.occurrences)).toBe(true);
    expect(Object.isFrozen(input)).toBe(true);
    expect(selected.admitted).toBe(false);
    expect(selected.missingCapabilities).toContain('matcher');
  });

  it('distinguishes wrong root, direction and undeclared fault without any partial match', async () => {
    const selected = await contract();
    for (const [direction, value] of [
      [{kind: 'input'}, payload('WrongRoot', members(['city', 'days']))],
      [{kind: 'output'}, await message('request')],
      [{kind: 'input'}, await message('fault')],
    ] as const) {
      const result = matchDirectOperation(selected, direction, value);
      expect(result.kind).toBe('mismatch');
      expect(result).not.toHaveProperty('occurrences');
    }
    expect(matchDirectOperation(selected, {kind: 'fault', name: 'forecasterror'}, await message('fault')).kind).toBe('unsupported');
    expect(matchDirectOperation(selected, {kind: 'unknown'} as never, await message('request')).kind).toBe('unsupported');
  });

  it.each([
    ['swapped request', 'GetForecast', ['days', 'city'], 'input'],
    ['missing first request', 'GetForecast', ['days'], 'input'],
    ['missing last request', 'GetForecast', ['city'], 'input'],
    ['duplicate singleton', 'GetForecast', ['city', 'city', 'days'], 'input'],
    ['extra trailing child', 'GetForecast', ['city', 'days', 'alien'], 'input'],
    ['late repeated output', 'GetForecastResponse', ['city', 'complete', 'temperature'], 'output'],
    ['missing trailing required', 'GetForecastResponse', ['city', 'temperature'], 'output'],
    ['duplicate completion', 'GetForecastResponse', ['city', 'complete', 'complete'], 'output'],
    ['wrong fault order', 'ForecastFault', ['message', 'code'], 'fault'],
  ] as const)('rejects %s', async (_label, root, names, kind) => {
    const selected = await contract();
    const direction = kind === 'fault' ? {kind, name: 'ForecastError'} as const : {kind};
    const result = matchDirectOperation(selected, direction, payload(root, members(names)));
    expect(result.kind).toBe('mismatch');
    expect(result).not.toHaveProperty('occurrences');
    expect(JSON.stringify(result)).not.toContain('Paris');
  });

  it.each([0, 1, 4])('matches exactly %s actual optional response repetitions', async count => {
    const selected = await contract();
    const result = matchDirectOperation(selected, {kind: 'output'}, payload('GetForecastResponse', members(['city', ...Array<string>(count).fill('temperature'), 'complete'])));
    expect(duties(result).map(duty => duty.declaration.name.local)).toEqual(['city', ...Array<string>(count).fill('temperature'), 'complete']);
  });

  it('uses expanded names across aliases and rejects root/child namespace rebinding', async () => {
    const selected = await contract();
    const alias = xml(`<other:GetForecast xmlns:other="${namespace}" xmlns:x="${namespace}"><x:city>Paris</x:city><other:days>2</other:days></other:GetForecast>`);
    expect(duties(matchDirectOperation(selected, {kind: 'input'}, alias)).map(duty => duty.lexical)).toEqual(['Paris', '2']);
    const wrong = [
      payload('GetForecast', members(['city', 'days']), 'urn:wrong'),
      xml(`<t:GetForecast xmlns:t="${namespace}"><t:city xmlns:t="urn:wrong">Paris</t:city><t:days>2</t:days></t:GetForecast>`),
      payload('GetForecast', '<city>Paris</city><days>2</days>'),
    ];
    for (const value of wrong) expect(matchDirectOperation(selected, {kind: 'input'}, value).kind).toBe('mismatch');
  });

  it('derives renamed operation and declaration facts from a new legitimate source', async () => {
    const ns = 'urn:independent:climate';
    const renamed = sourceText.replaceAll(namespace, ns).replaceAll('ForecastPortType', 'ClimatePort').replaceAll('ForecastBinding', 'ClimateBinding')
      .replaceAll('GetForecastResponse', 'ReadReply').replaceAll('GetForecast', 'Read').replaceAll('name="city"', 'name="place"').replaceAll('name="days"', 'name="length"');
    const selected = await contract(renamed, {portType: {namespace: ns, local: 'ClimatePort'}, binding: {namespace: ns, local: 'ClimateBinding'}, operation: 'Read'});
    const result = matchDirectOperation(selected, {kind: 'input'}, payload('Read', '<t:place>Oslo</t:place><t:length>3</t:length>', ns));
    expect(duties(result).map(duty => [duty.declaration.name, duty.builtin.local])).toEqual([
      [{namespace: ns, local: 'place'}, 'string'], [{namespace: ns, local: 'length'}, 'int'],
    ]);
    expect(matchDirectOperation(selected, {kind: 'input'}, await message('request')).kind).toBe('mismatch');
  });

  it('honors unqualified defaults and explicit local form overrides', async () => {
    const selected = await contract(sourceText.replace('elementFormDefault="qualified"', 'elementFormDefault="unqualified"').replace('name="days" type="xs:int"', 'name="days" type="xs:int" form="qualified"'));
    const good = payload('GetForecast', '<city>Paris</city><t:days>2</t:days>');
    expect(duties(matchDirectOperation(selected, {kind: 'input'}, good)).map(duty => duty.declaration.name.namespace)).toEqual(['', namespace]);
    expect(matchDirectOperation(selected, {kind: 'input'}, await message('request')).kind).toBe('mismatch');
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '<city>Paris</city><days>2</days>')).kind).toBe('mismatch');
  });

  it('supports all three scalar roots and preserves empty/invalid lexical text as unassessed duties', async () => {
    for (const [builtin, lexical] of [['string', ''], ['int', 'not-an-int'], ['boolean', 'yes']] as const) {
      const selected = await contract(sourceText.replace('name="GetForecast" type="t:ForecastRequest"', `name="GetForecast" type="xs:${builtin}"`));
      const result = matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', lexical));
      expect(duties(result).map(duty => [duty.builtin.local, duty.lexical])).toEqual([[builtin, lexical]]);
      expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '<t:nested/>')).kind).toBe('mismatch');
    }
  });

  it('supports a genuinely qualified empty sequence but still consumes all payload content', async () => {
    const selected = await contract(sourceText.replace('<xs:complexType name="ForecastRequest"><xs:sequence><xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/></xs:sequence></xs:complexType>', '<xs:complexType name="ForecastRequest"><xs:sequence/></xs:complexType>'));
    expect(duties(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', ' \t\n')))).toEqual([]);
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '<t:alien/>')).kind).toBe('mismatch');
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', 'x')).kind).toBe('mismatch');
  });

  it('ignores only XML inter-element whitespace and preserves full scalar text/maps without coercion', async () => {
    const selected = await contract();
    const value = xml(`<t:GetForecast xmlns:t="${namespace}" xmlns:operand="urn:operand"> \t\n<t:city> \t A<![CDATA[ B ]]>&amp; </t:city>\r\n<t:days> 1.5 </t:days> </t:GetForecast>`);
    const result = matchDirectOperation(selected, {kind: 'input'}, value);
    const operands = duties(result);
    expect(operands.map(duty => duty.lexical)).toEqual([' \t A B & ', ' 1.5 ']);
    expect(operands[0]!.namespaces.operand).toBe('urn:operand');
    expect(operands[0]!.payloadSource).toEqual(syntaxElements(value)[0]!.source);
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '\u00a0' + members(['city', 'days']))).kind).toBe('mismatch');
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', 'significant' + members(['city', 'days']))).kind).toBe('mismatch');
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '<t:city><t:nested/></t:city><t:days>2</t:days>')).kind).toBe('mismatch');
    expect(duties(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '<t:city/><t:days/>'))).map(duty => duty.lexical)).toEqual(['', '']);
    expect(matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', '<t:days/>')).kind).toBe('mismatch');
  });

  it.each([
    'ordinary="value"',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"',
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="t:Other"',
    'xml:lang="en"',
  ])('explicitly refuses unimplemented attribute semantics: %s', async attributes => {
    const selected = await contract();
    for (const value of [
      xml(`<t:GetForecast xmlns:t="${namespace}" ${attributes}>${members(['city', 'days'])}</t:GetForecast>`),
      payload('GetForecast', `<t:city ${attributes}>Paris</t:city><t:days>2</t:days>`),
    ]) {
      const result = matchDirectOperation(selected, {kind: 'input'}, value);
      expect(result.kind).toBe('unsupported');
      expect(result).not.toHaveProperty('occurrences');
    }
  });

  // Exhaustive finite domains are explicitly bounded corroboration, not full XSD
  // completeness: request alphabet 3, lengths 0..3 (40 words per language for
  // city days and city* days*); response alphabet 4, lengths 0..4 (341 words),
  // for all four admitted temperature min/max pairs. Total: 1,444 comparisons.
  it('agrees with an independent literal request language over all 40 bounded words', async () => {
    const selected = await contract();
    const domain = words(['city', 'days', 'alien'], 3);
    expect(domain).toHaveLength(40);
    for (const word of domain) {
      const expected = word.join(',') === 'city,days';
      const result = matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', members(word)));
      expect(result.kind, `request ${JSON.stringify(word)}`).toBe(expected ? 'structural-match' : 'mismatch');
    }
  });

  it('handles optional leading/trailing repeated slots with an independent 40-word language', async () => {
    const text = sourceText.replace('name="city" type="xs:string"', 'name="city" type="xs:string" minOccurs="0" maxOccurs="unbounded"')
      .replace('name="days" type="xs:int"', 'name="days" type="xs:int" minOccurs="0" maxOccurs="unbounded"');
    const selected = await contract(text);
    const domain = words(['city', 'days', 'alien'], 3);
    expect(domain).toHaveLength(40);
    for (const word of domain) {
      // Literal language city* days*: no alien and no city after the first days.
      const expected = word.every(letter => letter === 'city' || letter === 'days')
        && !word.slice(word.indexOf('days') < 0 ? word.length : word.indexOf('days')).includes('city');
      const result = matchDirectOperation(selected, {kind: 'input'}, payload('GetForecast', members(word)));
      expect(result.kind, `city* days*: ${JSON.stringify(word)}`).toBe(expected ? 'structural-match' : 'mismatch');
    }
  });

  it.each([
    ['0', '1'], ['1', '1'], ['0', 'unbounded'], ['1', 'unbounded'],
  ] as const)('agrees with independent response language for temperature %s..%s over all 341 words', async (minimum, maximum) => {
    const text = sourceText.replace('name="temperature" type="xs:int" minOccurs="0" maxOccurs="unbounded"', `name="temperature" type="xs:int" minOccurs="${minimum}" maxOccurs="${maximum}"`);
    const selected = await contract(text);
    const domain = words(['city', 'temperature', 'complete', 'alien'], 4);
    expect(domain).toHaveLength(341);
    for (const word of domain) {
      // Independent regular language: city temperature{min,max} complete.
      // No subject graph, occurrence helper or matcher is used to set expected.
      const middle = word.slice(1, -1);
      const expected = word.length >= 2 && word[0] === 'city' && word.at(-1) === 'complete'
        && middle.every(letter => letter === 'temperature')
        && (minimum === '0' || middle.length >= 1) && (maximum === 'unbounded' || middle.length <= 1);
      const result = matchDirectOperation(selected, {kind: 'output'}, payload('GetForecastResponse', members(word)));
      expect(result.kind, `temperature ${minimum}..${maximum}: ${JSON.stringify(word)}`).toBe(expected ? 'structural-match' : 'mismatch');
    }
  });
});
