import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget, DEFAULT_MAX_NODES, DEFAULT_MAX_WORK} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawScalarFacetComponent, RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';
import {schemaPatterns, intrinsicBuiltinPatterns} from '../../src/compiler/schemaPattern.js';
import {occurrenceAlgebra} from '../../src/compiler/occurrenceAnalysis.js';
import type {SchemaLexicalOperand, SchemaPatternContext} from '../../src/compiler/schemaValueContext.js';
import {schemaDecimalLanguages} from '../../src/compiler/schemaDecimalLanguage.js';
import {schemaUri, schemaUriExpression} from '../../src/compiler/schemaUri.js';
import {schemaDurationLanguages} from '../../src/compiler/schemaDurationLanguage.js';
import {parseDuration} from '../../src/compiler/schemaExactCalendar.js';
import {schemaIeeeLanguages} from '../../src/compiler/schemaIeeeLanguage.js';
import {schemaValueImages} from '../../src/compiler/schemaValueImages.js';
import {schemaIntegerImages} from '../../src/compiler/schemaIntegerImages.js';
import {schemaCalendarImages} from '../../src/compiler/schemaCalendarImages.js';
import {schemaNumericImageConditions} from '../../src/compiler/schemaNumericImageConditions.js';
import {schemaLexicalPredicates, type LexicalPredicate} from '../../src/compiler/schemaLexicalPredicates.js';
import {schemaSymbolicSequences, type SymbolicSequence} from '../../src/compiler/schemaSymbolicSequences.js';
import {schemaSymbolicValueSets, type ScalarValueSet} from '../../src/compiler/schemaSymbolicValueSets.js';
import {schemaTokenImages} from '../../src/compiler/schemaTokenImages.js';

// Fresh-context nonauthor controls, independently specified from #268's
// complete local membership/containment contract and dated XSD 1.0 facets.
// Expected answers follow explicit value witnesses or complete exclusions;
// a finite producer miss never supplies the expected negative.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalar-completeness-review';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
type Definition = RawSimpleTypeProperties & Readonly<{base: Reference}>;

async function setup(options: {defaultLimits?: boolean; maxWork?: number} = {}) {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-completeness-review.xsd'), {policy: {fileRoots: [fixtures]}});
  // Explicit diagnostic allowance; old-limit controls remain separately owned.
  const budget = options.defaultLimits ? createSemanticBudget() : createSemanticBudget({maxWork: options.maxWork ?? 100_000_000});
  const prepared = prepareSourceSchemaRequest(input, {budget});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source request');
  const request = prepared.request, found = request.actual.lookup(id('Template'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected source template');
  const seed = found.node;
  const lexical = (value: string): LexicalValue => ({value, context: seed.context});
  const facet = (name: string, value: string, operandType?: Reference, fixed = false): ScalarFacet => ({name, fixed, lexical: lexical(value),
    ...(operandType ? {operand: {type: operandType, owner, context: 'original' as const}} : {})});
  const component = (...facets: readonly ScalarFacet[]): RawScalarFacetComponent => ({facets, annotation: 'absent'});
  const names = new Map<string, string>();
  const raw = (local: string, base: Reference, components: readonly RawScalarFacetComponent[],
    variety: RawSimpleTypeProperties['variety'] = {kind: 'atomic'}): Definition => {
    names.set(id(local), local);
    return {type: id(local), base, final: [], variety, facetComponentSet: components,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
  };
  const candidate = (definitions: readonly Definition[]) => {
    const additions: SimpleTypeNode[] = definitions.map(definition => ({...seed, id: definition.type,
      identity: {kind: 'global', role: 'type', name: {namespace, local: names.get(definition.type)!}},
      variety: {kind: 'restriction', base: definition.base, facets: []}}));
    const result = request.candidate({key: 'nonauthor-scalar-completeness', active: [...request.actual.members, ...additions.map(node => node.id)],
      additions, rawSimpleTypes: definitions});
    if (result.kind !== 'prepared') throw new Error(`Expected structural candidate: ${JSON.stringify(result)}`);
    return createSchemaScalarKernel(result.context);
  };
  return {request, lexical, facet, component, raw, candidate, actual: createSchemaScalarKernel(request.actual)};
}

describe('nonauthor complete retained-pattern scalar containment', () => {
  it.each([
    {primitive: 'float', strict: '5', loose: '1', pattern: '0*[6-9]([.]0*)?'},
    {primitive: 'dateTime', strict: '2005-01-01T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '201[0-9]-01-01T00:00:00([.]0+)?Z'},
    {primitive: 'duration', strict: 'P1M', loose: 'P1D', pattern: 'P0*32D'},
  ])('decides $primitive bound containment at selected engineering defaults', async ({primitive, strict, loose, pattern}) => {
    const {facet, component, raw, candidate, request} = await setup({defaultLimits: true});
    const inherited = component(facet('pattern', pattern));
    const retained = [component(facet('minExclusive', loose)), inherited];
    const kernel = candidate([
      raw('Base', builtin(primitive), [component(facet('minExclusive', strict)), ...retained]),
      raw('Child', named('Base'), retained),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(request.budget.usage().work).toBeLessThanOrEqual(DEFAULT_MAX_WORK);
    expect(request.budget.usage().nodes).toBeLessThanOrEqual(DEFAULT_MAX_NODES);
  });

  it('decides the known retained {3,5} minimum case at selected engineering defaults', async () => {
    const {facet, component, raw, candidate} = await setup({defaultLimits: true});
    const pattern = component(facet('pattern', '[a-z]{5,}'));
    const kernel = candidate([
      raw('Base', builtin('string'), [component(facet('minLength', '3')), component(facet('minLength', '5')), pattern]),
      raw('Child', named('Base'), [component(facet('minLength', '3')), pattern]),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });
  it.each([
    {pattern: '[a-z]{5,}', valid: true},
    {pattern: '.{5,}', valid: true},
    {pattern: '\\p{L}{5,}', valid: true},
    {pattern: 'a+', valid: false},
  ])('decides exact minima {3,5} retaining $pattern', async ({pattern, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const retained = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin('string'), [component(facet('minLength', '3')), component(facet('minLength', '5')), retained]),
      raw('Child', named('Base'), [component(facet('minLength', '3')), retained]),
    ]);
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    if (valid) expect(kernel.assess(named('Child'), lexical('aaaaa'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([true, false])('uses all retained pattern components together (contained=%s)', async contained => {
    const {facet, component, raw, candidate} = await setup();
    // Each individual language contains words shorter than five. Their
    // intersection contains only empty, a{5,}, b{5,}; minLength 3 removes empty.
    const patterns = [component(facet('pattern', 'a*|b{5,}')),
      component(facet('pattern', contained ? 'a{5,}|b*' : 'a{3,}|b*'))];
    const kernel = candidate([
      raw('Base', builtin('string'), [component(facet('minLength', '3')), component(facet('minLength', '5')), ...patterns]),
      raw('Child', named('Base'), [component(facet('minLength', '3')), ...patterns]),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('recognizes that QName length facets accept every QName value', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const pattern = component(facet('pattern', '[a-z]+'));
    const kernel = candidate([
      raw('Base', builtin('QName'), [component(facet('minLength', '3')), component(facet('minLength', '5')), pattern]),
      raw('Child', named('Base'), [component(facet('minLength', '3')), pattern]),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Child'), lexical('a'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([true, false])('counts binary octets instead of regex characters (contained=%s)', async contained => {
    const {facet, component, raw, candidate} = await setup();
    const pattern = component(facet('pattern', contained ? '([0-9A-F]{2}){2,}' : '([0-9A-F]{2})+'));
    const kernel = candidate([
      raw('Base', builtin('hexBinary'), [component(facet('minLength', '1')), component(facet('minLength', '2')), pattern]),
      raw('Child', named('Base'), [component(facet('minLength', '1')), pattern]),
    ]);
    // Positive admits FF00 and longer octet strings; negative admits FF.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([true, false])('counts list items instead of regex characters (contained=%s)', async contained => {
    const {facet, component, raw, candidate} = await setup();
    const pattern = component(facet('pattern', contained ? '[0-9] [0-9]( [0-9])*' : '[0-9]( [0-9])*'));
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const variety = {kind: 'list' as const, item: builtin('decimal')};
    const kernel = candidate([
      raw('Base', named('DecimalList'), [whitespace, component(facet('minLength', '1')), component(facet('minLength', '2')), pattern], variety),
      raw('Child', named('Base'), [whitespace, component(facet('minLength', '1')), pattern], variety),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {pattern: '[0-5]|[6-9] [6-9]( [6-9])*', witness: '6 6', valid: true},
    {pattern: '[0-9]( [6-9])*', witness: '6', valid: false},
  ])('intersects complete list-count containment with item value predicates for $pattern ($valid)', async ({pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const inherited = component(facet('pattern', pattern));
    const retained = [whitespace, component(facet('minLength', '1')), inherited];
    const variety = {kind: 'list' as const, item: named('AboveFive')};
    const kernel = candidate([
      raw('Base', named('AboveFiveList'), [component(facet('minLength', '2')), ...retained], variety),
      raw('Child', named('Base'), retained, variety),
      raw('Probe', named('AboveFiveList'), retained, variety),
    ]);
    // The shortest regex word is "0", rejected by the item >5 predicate.
    // Positive valid lists have >=2 items; negative also admits [decimal 6].
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('finds list-count widening through an enumerated ordered-union item', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const members = [builtin('string'), builtin('decimal')];
    const variety = {kind: 'list' as const, item: named('OnlySix')};
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const retained = [whitespace, component(facet('minLength', '1')), component(facet('pattern', '[0-9]( [0-9])*'))];
    const kernel = candidate([
      raw('OnlySix', named('TextThenDecimal'), [component(facet('enumeration', '6', builtin('string')))], {kind: 'union', members}),
      raw('InitialList', builtin('anySimpleType'), [whitespace], variety),
      raw('Base', named('InitialList'), [component(facet('minLength', '2')), ...retained], variety),
      raw('Child', named('Base'), retained, variety),
      raw('Probe', named('InitialList'), retained, variety),
    ]);
    expect(kernel.assess(named('Probe'), lexical('6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'string', canonical: '6'}]}}});
    expect(kernel.assess(named('Base'), lexical('6'), owner)).toMatchObject({kind: 'invalid-schema'});
    // Neither member's first regex word 0 passes the union enumeration.
    // It does not exhaust the token language, whose value 6 widens count.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    {pattern: '(AAAA)*AAA=', witness: 'AAA=', valid: true},
    {pattern: '(AAAA)*(AA==|AAA=)', witness: 'AA==', valid: false},
    {pattern: '(AAAA)*A A A=', witness: 'A A A=', valid: true},
    {pattern: '(AAAA)*(A A = =|A A A =)', witness: 'A A = =', valid: false},
  ])('counts base64 decoded bytes retaining $pattern ($valid)', async ({pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const inherited = component(facet('pattern', pattern));
    const retained = [component(facet('minLength', '1')), inherited];
    const kernel = candidate([
      raw('Base', builtin('base64Binary'), [component(facet('minLength', '2')), ...retained]),
      raw('Child', named('Base'), retained),
      raw('Probe', builtin('base64Binary'), retained),
    ]);
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {pattern: '%0*', witness: '%00', valid: true},
    {pattern: '%0*|a+', witness: 'a', valid: false},
  ])('intersects anyURI length containment with lexical validity for $pattern ($valid)', async ({pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const inherited = component(facet('pattern', pattern));
    const retained = [component(facet('minLength', '1')), inherited];
    const kernel = candidate([
      raw('Base', builtin('anyURI'), [component(facet('minLength', '3')), ...retained]),
      raw('Child', named('Base'), retained),
      raw('Probe', builtin('anyURI'), retained),
    ]);
    // The only short words in %0* are '%' and '%0', both invalid URIs.
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {name: 'totalDigits', strict: '1', loose: '3', pattern: '0*[1-9]([.]0*)?', witness: '0007.000', valid: true},
    {name: 'totalDigits', strict: '1', loose: '3', pattern: '0*[1-9][0-9]([.]0*)?', witness: '00012.000', valid: false},
    {name: 'fractionDigits', strict: '1', loose: '3', pattern: '0*[1-9][.][0-9]0*', witness: '0007.200', valid: true},
    {name: 'fractionDigits', strict: '1', loose: '3', pattern: '0*[1-9][.][0-9][1-9]0*', witness: '0007.2300', valid: false},
    {name: 'minExclusive', strict: '5', loose: '1', pattern: '0*[6-9]([.]0*)?', witness: '0006.000', valid: true},
    {name: 'minExclusive', strict: '5', loose: '1', pattern: '0*[2-4]([.]0*)?', witness: '0002.000', valid: false},
    {name: 'maxExclusive', strict: '1.25', loose: '5.5', pattern: '0*[.]0*[1-9][0-9]*', witness: '.1250', valid: true},
    {name: 'maxExclusive', strict: '1.25', loose: '5.5', pattern: '0*1[.]2[6-9]0*', witness: '01.2600', valid: false},
    {name: 'maxExclusive', strict: '-5.5', loose: '-1.25', pattern: '\\-0*[6-9]([.]0*)?', witness: '-006.00', valid: true},
    {name: 'maxExclusive', strict: '-5.5', loose: '-1.25', pattern: '\\-0*[2-4]([.]0*)?', witness: '-002.00', valid: false},
  ])('decides $name {$strict,$loose} retaining $pattern ($valid)', async ({name, strict, loose, pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const inherited = component(facet('pattern', pattern));
    const retained = [component(facet(name, loose)), inherited];
    const kernel = candidate([
      raw('Base', builtin('decimal'), [component(facet(name, strict)), ...retained]),
      raw('Child', named('Base'), retained),
      raw('Probe', builtin('decimal'), retained),
    ]);
    // This direct admitted lexical witness independently contrasts the
    // result's value space with the stricter base value predicate.
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'dateTime', name: 'minExclusive', strict: '2005-01-01T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '201[0-9]-01-01T00:00:00([.]0+)?Z', witness: '2010-01-01T00:00:00.00Z', valid: true},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2005-01-01T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '200[1-4]-01-01T00:00:00([.]0+)?Z', witness: '2001-01-01T00:00:00.00Z', valid: false},
    {primitive: 'dateTime', name: 'maxExclusive', strict: '2000-01-01T00:00:00Z', loose: '2005-01-01T00:00:00Z', pattern: '199[0-9]-01-01T00:00:00([.]0+)?Z', witness: '1990-01-01T00:00:00.00Z', valid: true},
    {primitive: 'dateTime', name: 'maxExclusive', strict: '2000-01-01T00:00:00Z', loose: '2005-01-01T00:00:00Z', pattern: '200[1-4]-01-01T00:00:00([.]0+)?Z', witness: '2001-01-01T00:00:00.00Z', valid: false},
    {primitive: 'date', name: 'minExclusive', strict: '2005-01-01Z', loose: '2000-01-01Z', pattern: '201[0-9]-01-01Z', witness: '2010-01-01Z', valid: true},
    {primitive: 'date', name: 'minExclusive', strict: '2005-01-01Z', loose: '2000-01-01Z', pattern: '200[1-4]-01-01Z', witness: '2001-01-01Z', valid: false},
    {primitive: 'time', name: 'minExclusive', strict: '02:00:00Z', loose: '01:00:00Z', pattern: '0[3-9]:00:00([.]0+)?Z', witness: '03:00:00.00Z', valid: true},
    {primitive: 'time', name: 'minExclusive', strict: '02:00:00Z', loose: '01:00:00Z', pattern: '01:30:00([.]0+)?Z', witness: '01:30:00.00Z', valid: false},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2000-01-01T00:01:00Z', loose: '2000-01-01T00:00:00Z', pattern: '2000-01-01T00:01:60([.]0+)?Z', witness: '2000-01-01T00:01:60.00Z', valid: true},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2000-01-01T00:01:00Z', loose: '2000-01-01T00:00:00Z', pattern: '2000-01-01T00:00:60([.]0+)?Z', witness: '2000-01-01T00:00:60.00Z', valid: false},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2000-01-02T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '2000-01-02T24:00:00([.]0+)?Z', witness: '2000-01-02T24:00:00.00Z', valid: true},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2000-01-02T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '2000-01-01T24:00:00([.]0+)?Z', witness: '2000-01-01T24:00:00.00Z', valid: false},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2000-01-02T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '2000-01-03T00:00:00([.]0+)?', witness: '2000-01-03T00:00:00.00', valid: true},
    {primitive: 'dateTime', name: 'minExclusive', strict: '2000-01-02T00:00:00Z', loose: '2000-01-01T00:00:00Z', pattern: '2000-01-02T12:00:00([.]0+)?', witness: '2000-01-02T12:00:00.00', valid: false},
    {primitive: 'dateTime', name: 'minExclusive', strict: '-0001-01-01T00:00:00Z', loose: '-0002-01-01T00:00:00Z', pattern: '0001-01-01T00:00:00([.]0+)?Z', witness: '0001-01-01T00:00:00.00Z', valid: true},
    {primitive: 'dateTime', name: 'minExclusive', strict: '-0001-01-01T00:00:00Z', loose: '-0002-01-01T00:00:00Z', pattern: '\\-0002-06-01T00:00:00([.]0+)?Z', witness: '-0002-06-01T00:00:00.00Z', valid: false},
    {primitive: 'dateTime', name: 'minExclusive', strict: '-0005-01-01T00:00:00Z', loose: '-0006-01-01T00:00:00Z', pattern: '\\-0004-02-29T00:00:00([.]0+)?Z', witness: '-0004-02-29T00:00:00.00Z', valid: true},
    {primitive: 'gYear', name: 'minExclusive', strict: '2005Z', loose: '2000Z', pattern: '[1-9][0-9]{4,}Z', witness: '10000Z', valid: true},
    {primitive: 'gYear', name: 'minExclusive', strict: '2005Z', loose: '2000Z', pattern: '200[1-4]Z', witness: '2001Z', valid: false},
    {primitive: 'gYearMonth', name: 'minExclusive', strict: '2000-06Z', loose: '2000-01Z', pattern: '[1-9][0-9]{4,}-02Z', witness: '10000-02Z', valid: true},
    {primitive: 'gYearMonth', name: 'minExclusive', strict: '2000-06Z', loose: '2000-01Z', pattern: '2000-0[2-5]Z', witness: '2000-02Z', valid: false},
    {primitive: 'gMonthDay', name: 'minExclusive', strict: '--02-28Z', loose: '--01-01Z', pattern: '--02-29Z', witness: '--02-29Z', valid: true},
    {primitive: 'gMonthDay', name: 'minExclusive', strict: '--02-28Z', loose: '--01-01Z', pattern: '--02-0[1-9]Z', witness: '--02-01Z', valid: false},
    {primitive: 'gDay', name: 'minExclusive', strict: '---20Z', loose: '---01Z', pattern: '---2[1-9]Z', witness: '---21Z', valid: true},
    {primitive: 'gDay', name: 'minExclusive', strict: '---20Z', loose: '---01Z', pattern: '---1[0-9]Z', witness: '---10Z', valid: false},
    {primitive: 'gMonth', name: 'minExclusive', strict: '--06Z', loose: '--01Z', pattern: '--(0[7-9]|1[0-2])Z', witness: '--07Z', valid: true},
    {primitive: 'gMonth', name: 'minExclusive', strict: '--06Z', loose: '--01Z', pattern: '--0[2-5]Z', witness: '--02Z', valid: false},
    {primitive: 'duration', name: 'minExclusive', strict: 'P1M', loose: 'P1D', pattern: 'P0*32D', witness: 'P0032D', valid: true},
    {primitive: 'duration', name: 'minExclusive', strict: 'P1M', loose: 'P1D', pattern: 'P0*30D', witness: 'P0030D', valid: false},
    {primitive: 'duration', name: 'minExclusive', strict: 'P400Y', loose: 'P1D', pattern: 'P0*146098D', witness: 'P00146098D', valid: true},
    {primitive: 'duration', name: 'minExclusive', strict: 'P400Y', loose: 'P1D', pattern: 'P0*146097D', witness: 'P00146097D', valid: false},
    {primitive: 'duration', name: 'maxExclusive', strict: '-P1M', loose: '-P1D', pattern: '\\-P0*32D', witness: '-P0032D', valid: true},
    {primitive: 'duration', name: 'maxExclusive', strict: '-P1M', loose: '-P1D', pattern: '\\-P0*30D', witness: '-P0030D', valid: false},
    {primitive: 'duration', name: 'minExclusive', strict: 'PT0.5S', loose: 'PT0S', pattern: 'PT0*[.]60*S', witness: 'PT000.600S', valid: true},
    {primitive: 'duration', name: 'minExclusive', strict: 'PT0.5S', loose: 'PT0S', pattern: 'PT0*[.]40*S', witness: 'PT000.400S', valid: false},
    {primitive: 'duration', name: 'minExclusive', strict: 'P1D', loose: 'PT1H', pattern: 'PT0*([3-9][0-9]|[1-9][0-9]{2,})H', witness: 'PT0030H', valid: true},
    {primitive: 'duration', name: 'minExclusive', strict: 'P1D', loose: 'PT1H', pattern: 'PT0*2[0-3]H', witness: 'PT0023H', valid: false},
  ])('decides complete $primitive $name containment retaining $pattern ($valid)', async ({primitive, name, strict, loose, pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const inherited = component(facet('pattern', pattern));
    const retained = [component(facet(name, loose)), inherited];
    const kernel = candidate([
      raw('Base', builtin(primitive), [component(facet(name, strict)), ...retained]),
      raw('Child', named('Base'), retained),
      raw('Probe', builtin(primitive), retained),
    ]);
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    // Both indeterminate duration cases are value-facet violations even
    // though the corresponding facet construction comparison is not itself
    // a prohibited mathematical relation under F2.
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'float', strict: '5', loose: '1', name: 'minExclusive', pattern: '0*[6-9]([.]0*)?([eE][+\\-]?0+)?', witness: '0006.000e+00', valid: true},
    {primitive: 'float', strict: '5', loose: '1', name: 'minExclusive', pattern: '0*[2-4]([.]0*)?([eE][+\\-]?0+)?', witness: '0002.000e+00', valid: false},
    {primitive: 'double', strict: '-5.5', loose: '-1.25', name: 'maxExclusive', pattern: '\\-0*[6-9]([.]0*)?([eE][+\\-]?0+)?', witness: '-006.000e-00', valid: true},
    {primitive: 'double', strict: '-5.5', loose: '-1.25', name: 'maxExclusive', pattern: '\\-0*[2-4]([.]0*)?([eE][+\\-]?0+)?', witness: '-002.000e-00', valid: false},
    {primitive: 'float', strict: 'NaN', loose: 'INF', name: 'maxExclusive', pattern: 'NaN', witness: 'NaN', valid: true},
    {primitive: 'float', strict: 'NaN', loose: 'INF', name: 'maxExclusive', pattern: '[2-4]([.]0*)?', witness: '2.000', valid: false},
  ])('decides complete $primitive bound containment for $pattern ($valid)', async ({primitive, strict, loose, name, pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const inherited = component(facet('pattern', pattern));
    const retained = [component(facet(name, loose)), inherited];
    const kernel = candidate([
      raw('Base', builtin(primitive), [component(facet(name, strict)), ...retained]),
      raw('Child', named('Base'), retained),
      raw('Probe', builtin(primitive), retained),
    ]);
    if (witness !== 'NaN') {
      expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    }
    // maxExclusive INF rejects NaN, so that retained pattern leaves both
    // operand types empty; inclusive/exclusive NaN duties remain distinct.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });
});

describe('nonauthor regular-language authority and request limits', () => {
  it('includes the default node boundary and keeps one immutable terminal failure after crossing it', () => {
    const budget = createSemanticBudget();
    expect(budget.guard(() => budget.reserveNodes(DEFAULT_MAX_NODES))).toBeUndefined();
    expect(budget.usage().nodes).toBe(DEFAULT_MAX_NODES);
    const failure = budget.guard(() => budget.reserveNodes(1));
    expect(failure).toMatchObject({kind: 'resource-limit', limit: 'nodes', usage: {nodes: DEFAULT_MAX_NODES}});
    const before = {...budget.usage()};
    let invoked = false;
    expect(budget.guard(() => {invoked = true;})).toBe(failure);
    expect(budget.failure()).toBe(failure);
    expect(invoked).toBe(false);
    expect(budget.usage()).toEqual(before);
    expect(Object.isFrozen(failure)).toBe(true);
    expect(Object.isFrozen(budget.usage())).toBe(true);
  });

  function engine(maxWork = 1_000_000) {
    const budget = createSemanticBudget({maxWork});
    const context: SchemaPatternContext<string> = {
      step: (_owner, count = 1) => budget.chargeWork(count),
      text: value => {budget.chargeWork(value.length + 2); return value;},
      fail: (_owner, rule) => {throw new Error(`invalid:${rule}`);},
      unsupported: (_owner, rule) => {throw new Error(`unsupported:${rule}`);},
      algebra: occurrenceAlgebra(() => budget.chargeWork()),
    };
    const lexical = (value: string): SchemaLexicalOperand => ({value, context: {namespaces: {}, source: {
      uri: 'https://independent-scalar.example/control', digest: '0'.repeat(64), path: '/pattern',
      start: {offset: 0, line: 1, column: 1}, end: {offset: value.length, line: 1, column: value.length + 1},
    }}});
    const patterns = schemaPatterns(context), regular = patterns.regular;
    const language = (expression: string) => patterns.language(patterns.compile(lexical(expression), 'pattern'), 'pattern');
    return {budget, context, lexical, patterns, regular, language};
  }

  it('preserves correlations, overlapping labels and empty words in finite symbolic sequence differences', () => {
    const {context} = engine();
    type Label = readonly number[];
    const symbols = schemaSymbolicSequences<string, Label>(context, (positive, negative, owner) => {
      context.step(owner, (positive.length + negative.length + 1) * 12);
      return [0, 1, 2].some(value => positive.every(label => label.includes(value)) && negative.every(label => !label.includes(value)));
    });
    const diagonal: SymbolicSequence<Label> = {start: 0, states: [
      {accepting: false, edges: [{to: 1, label: [0]}, {to: 2, label: [1]}]},
      {accepting: false, edges: [{to: 3, label: [0]}]},
      {accepting: false, edges: [{to: 3, label: [1]}]},
      {accepting: true, edges: []},
    ]};
    const square: SymbolicSequence<Label> = {start: 0, states: [
      {accepting: false, edges: [{to: 1, label: [0, 1]}]},
      {accepting: false, edges: [{to: 2, label: [0, 1]}]},
      {accepting: true, edges: []},
    ]};
    const oneCombined: SymbolicSequence<Label> = {start: 0, states: [
      {accepting: false, edges: [{to: 1, label: [1, 2]}]}, {accepting: true, edges: []},
    ]};
    const oneSplit: SymbolicSequence<Label> = {start: 0, states: [
      {accepting: false, edges: [{to: 1, label: [1]}, {to: 2, label: [2]}]},
      {accepting: true, edges: []}, {accepting: true, edges: []},
    ]};
    const empty: SymbolicSequence<Label> = {start: 0, states: [{accepting: false, edges: []}]};
    const epsilon: SymbolicSequence<Label> = {start: 0, states: [{accepting: true, edges: []}]};
    const star = (label: Label): SymbolicSequence<Label> => ({start: 0, states: [{accepting: true, edges: [{to: 0, label}]}]});
    expect(symbols.differenceExists(diagonal, square, 'pattern')).toBe(false);
    expect(symbols.differenceExists(square, diagonal, 'pattern')).toBe(true); // 01
    expect(symbols.differenceExists(oneCombined, oneSplit, 'pattern')).toBe(false);
    expect(symbols.differenceExists(oneSplit, oneCombined, 'pattern')).toBe(false);
    expect(symbols.differenceExists(epsilon, empty, 'pattern')).toBe(true);
    expect(symbols.differenceExists(empty, epsilon, 'pattern')).toBe(false);
    expect(symbols.differenceExists(star([0, 1, 2]), star([0, 1, 2]), 'pattern')).toBe(false);
    expect(symbols.differenceExists(star([0, 1, 2]), star([0, 1]), 'pattern')).toBe(true); // 2
  });

  it('discharges contradictory non-singleton IEEE image labels by identity and exact input embedding', () => {
    const {context, regular, language, budget} = engine(DEFAULT_MAX_WORK);
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    const numeric = schemaNumericImageConditions(context, regular, ieee, expression => language(expression));
    const images = schemaSymbolicValueSets(context, regular, numeric, ieee, expression => language(expression),
      (family, spelling) => ({family, canonical: String(family === 'float' ? Math.fround(Number(spelling)) : Number(spelling))}),
      value => value.canonical);
    const positive: ScalarValueSet = {family: 'float', kind: 'ieee', inputs: [{language: language('[1-9][0-9]*'), numeric: numeric.all()}]};
    const aliases: ScalarValueSet = {family: 'float', kind: 'ieee', inputs: [{language: language('[+]?0*[1-9][0-9]*'), numeric: numeric.all()}]};
    // Each label contains many rounded values, but an identical label
    // cannot be both present and absent. Every positive source spelling is
    // also an alias-source spelling, proving the second image inclusion.
    expect(budget.guard(() => images.satisfiable([positive], [positive], 'pattern'))).toBe(false);
    expect(budget.guard(() => images.satisfiable([positive], [aliases], 'pattern'))).toBe(false);
  });

  it.each(['float', 'double'] as const)('keeps cached $family midpoint inverses separate from caller mutations', family => {
    const {context, regular, language, budget} = engine(DEFAULT_MAX_WORK);
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    const target = {family, canonical: '1'};
    const first = ieee.inverseIntervals(target, 'pattern');
    const belowPower = family === 'float' ? 25n : 54n, abovePower = family === 'float' ? 24n : 53n;
    const expectedLower = {...first[0].lower!.value}, expectedUpper = {...first[0].upper!.value};
    // Adjacent representable steps around 1 differ by a factor of two.
    expect(expectedLower.coefficient * (2n ** belowPower)).toBe(((2n ** belowPower) - 1n) * (10n ** BigInt(expectedLower.scale)));
    expect(expectedUpper.coefficient * (2n ** abovePower)).toBe(((2n ** abovePower) + 1n) * (10n ** BigInt(expectedUpper.scale)));
    first[0].lower!.value.coefficient = 0n;
    first[0].upper!.value.scale = 0;
    const afterMutation = ieee.inverseIntervals({family, canonical: '1'}, 'pattern');
    expect(afterMutation[0].lower!.value).toEqual(expectedLower);
    expect(afterMutation[0].upper!.value).toEqual(expectedUpper);
    afterMutation[0].lower!.inclusive = false;
    afterMutation[0].upper!.value.coefficient = 0n;
    const again = ieee.inverseIntervals({family, canonical: '1'}, 'pattern');
    expect(again[0].lower!.inclusive).toBe(true);
    expect(again[0].upper!.value).toEqual(expectedUpper);
    target.canonical = '2';
    expect(ieee.inverseIntervals(target, 'pattern')[0].lower!.value).not.toEqual(expectedLower);
    target.canonical = '1';
    expect(ieee.inverseIntervals(target, 'pattern')[0].lower!.value).toEqual(expectedLower);
    expect(budget.exhausted()).toBe(false);
  });

  it('precharges a cached subnormal inverse hit at the exact work boundary and one below', () => {
    const query = (maxWork: number) => {
      const {context, regular, language, budget} = engine(maxWork);
      const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
      const result = budget.guard(() => {
        ieee.inverseIntervals({family: 'double', canonical: '0'}, 'pattern');
        return ieee.inverseIntervals({family: 'double', canonical: '0'}, 'pattern');
      });
      return {budget, result};
    };
    const measured = query(DEFAULT_MAX_WORK), work = measured.budget.usage().work;
    expect(measured.result).toHaveLength(2);
    expect(query(work).result).toEqual(measured.result);
    const below = query(work - 1);
    expect(below.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    const before = {...below.budget.usage()};
    expect(below.budget.guard(() => false)).toBe(below.result);
    expect(below.budget.failure()).toBe(below.result);
    expect(below.budget.usage()).toEqual(before);
  });

  it.each([true, false])('compares complete finite IEEE images with different zero/nonfinite aliases (missingOne=%s)', missingOne => {
    const {context, regular, language, budget} = engine(DEFAULT_MAX_WORK);
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    const numeric = schemaNumericImageConditions(context, regular, ieee, expression => language(expression));
    const images = schemaSymbolicValueSets(context, regular, numeric, ieee, expression => language(expression),
      (family, spelling) => ({family, canonical: spelling === 'INF' ? 'Infinity' : spelling === '-INF' ? '-Infinity'
        : String(family === 'float' ? Math.fround(Number(spelling)) : Number(spelling))}), value => value.canonical);
    const supplied: ScalarValueSet = {kind: 'ieee', family: 'float', inputs: [{language: language('\\-0|0|1|INF|\\-INF|NaN'), numeric: numeric.all()}]};
    const inherited: ScalarValueSet = {kind: 'ieee', family: 'float', inputs: [{
      language: language('[+]0|\\-0[.]0|[1-9]e99999|\\-[1-9]e99999|NaN' + (missingOne ? '' : '|01e0')), numeric: numeric.all(),
    }]};
    // Both signed zero forms denote one zero value; these exponents round
    // to the two infinities. NaN is one schema value. The inherited image
    // therefore covers every supplied value exactly when 01e0 is retained.
    expect(budget.guard(() => images.satisfiable([supplied], [inherited], 'pattern'))).toBe(missingOne);
    expect(budget.exhausted()).toBe(false);
  });

  it('preserves maximal tokens, whitespace fragments and every earlier-list rejection in token images', () => {
    const {context, regular, language} = engine();
    type Label = readonly string[];
    const alphabet = ['a', 'b', 'ab', ' ', '\t'];
    const sequences = schemaSymbolicSequences<string, Label>(context, (positive, negative, owner) => {
      context.step(owner, (positive.length + negative.length + 1) * 12);
      return alphabet.some(value => positive.every(label => label.includes(value)) && negative.every(label => !label.includes(value)));
    });
    const tokens = schemaTokenImages<string, Label>(context, regular, () => language('[^ \\t\\r\\n]+'),
      (paths, _position, rejected, owner) => {
        const finite = regular.finiteWords(paths, owner); if (finite.kind !== 'finite') throw new Error('Independent token control is finite');
        const words = [...finite.words].filter(word => rejected.every(index => word !== (index === 0 ? 'a' : 'b')));
        return words.length ? [words] : [];
      }, cp => [String.fromCodePoint(cp)]);
    const word = (values: readonly string[]): SymbolicSequence<Label> => ({start: 0, states: [
      ...values.map((value, index) => ({accepting: false, edges: [{to: index + 1, label: [value]}]})),
      {accepting: true, edges: []},
    ]});
    const one = tokens.image(language('ab'), 0, 0, 'string', 'pattern');
    expect(sequences.differenceExists(one, word(['ab']), 'pattern')).toBe(false);
    expect(sequences.differenceExists(word(['ab']), one, 'pattern')).toBe(false);
    expect(sequences.differenceExists(one, word(['a', 'b']), 'pattern')).toBe(true);
    const spaced = tokens.image(language(' a\\tb '), 0, 0, 'string', 'pattern');
    expect(sequences.differenceExists(spaced, word([' ', 'a', '\t', 'b', ' ']), 'pattern')).toBe(false);
    expect(sequences.differenceExists(word([' ', 'a', '\t', 'b', ' ']), spaced, 'pattern')).toBe(false);
    const mixed: SymbolicSequence<Label> = {start: 0, states: [
      {accepting: false, edges: [{to: 1, label: ['a']}, {to: 2, label: ['b']}]},
      {accepting: false, edges: [{to: 3, label: ['b']}]},
      {accepting: false, edges: [{to: 3, label: ['a']}]},
      {accepting: true, edges: []},
    ]};
    const rejected = tokens.image(language('(a|b) (a|b)'), 2, 0, 'list', 'pattern');
    expect(sequences.differenceExists(rejected, mixed, 'pattern')).toBe(false);
    expect(sequences.differenceExists(mixed, rejected, 'pattern')).toBe(false);
  });

  it.each([
    {expression: '\\n|a|[b-c]', expected: ['\n', 'a', 'b', 'c']},
    {expression: '(a?){2,3}', expected: ['', 'a', 'aa', 'aaa']},
    {expression: '[a\\-c]', expected: ['-', 'a', 'c']},
    {expression: '$^', expected: ['$^']},
  ])('exhausts the complete finite language $expression', ({expression, expected}) => {
    const {regular, language, budget} = engine();
    const finite = regular.finiteWords(language(expression), 'pattern');
    expect(finite.kind).toBe('finite');
    if (finite.kind !== 'finite') throw new Error('Independent language is finite');
    expect(budget.guard(() => new Set(finite.words))).toEqual(new Set(expected));
  });

  it('distinguishes empty complete intersections, nonempty witnesses and infinite languages', () => {
    const {regular, language} = engine();
    expect(regular.witness(regular.intersect([language('a{5,}'), language('a{0,4}')], 'pattern'), 'pattern')).toBeUndefined();
    expect(regular.witness(regular.intersect([language('a+'), regular.negate(language('a{2,}'), 'pattern')], 'pattern'), 'pattern')).toBe('a');
    expect(regular.finiteWords(language('a*'), 'pattern')).toEqual({kind: 'infinite'});
  });

  it('reaches a later finite alternative while fairly enumerating an infinite branch', () => {
    const {regular, language} = engine();
    const producer = regular.words(language('a*|z'), 'pattern');
    expect([producer.next().value, producer.next().value, producer.next().value]).toEqual(['', 'a', 'z']);
  });

  it('precharges a wide fair-search frontier before allocating it at the former work limit', () => {
    const {regular, language, budget} = engine(1_000_000);
    const producer = regular.words(language('.'), 'pattern');
    const failure = budget.guard(() => producer.next());
    expect(failure).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(budget.guard(() => producer.next())).toBe(failure);
  });

  it.each([
    {mode: 'preserve', target: 'a b', raw: 'a b', valid: true},
    {mode: 'preserve', target: 'a b', raw: 'a\tb', valid: false},
    {mode: 'replace', target: 'a b', raw: 'a\tb', valid: true},
    {mode: 'replace', target: 'a b', raw: 'a\r\nb', valid: false},
    {mode: 'replace', target: 'a  b', raw: 'a\r\nb', valid: true},
    {mode: 'replace', target: 'a b', raw: ' a b ', valid: false},
    {mode: 'collapse', target: 'a b', raw: ' \ta \n\r b \n', valid: true},
    {mode: 'collapse', target: 'a b', raw: 'ab', valid: false},
    {mode: 'collapse', target: 'a b', raw: 'a\u00a0b', valid: false},
    {mode: 'collapse', target: 'a\u00a0b', raw: '\ta\u00a0b\r', valid: true},
    {mode: 'collapse', target: '12', raw: ' \t12\n', valid: true},
    {mode: 'collapse', target: '12', raw: '1\t2', valid: false},
    {mode: 'collapse', target: '', raw: '\t\r\n ', valid: true},
    {mode: 'collapse', target: '', raw: 'x', valid: false},
  ] as const)('inverts normalized XML whitespace in $mode for $target ($valid)', ({mode, target, raw, valid}) => {
    const {regular, language} = engine();
    const exact = (value: string) => value.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    const image = regular.whitespacePreimage(language(exact(target)), mode, 'pattern');
    expect(regular.witness(regular.intersect([image, language(exact(raw))], 'pattern'), 'pattern'))
      .toBe(valid ? raw : undefined);
    const forward = regular.whitespaceImage(language(exact(raw)), mode, 'pattern');
    expect(regular.witness(regular.intersect([forward, language(exact(target))], 'pattern'), 'pattern'))
      .toBe(valid ? target : undefined);
  });

  it('matches independent RFC2396/2732 URI lexical boundaries including escaped source characters', () => {
    const {regular, language, context} = engine(100_000_000);
    const grammar = language(schemaUriExpression('pattern', context));
    const cases = [
      {value: '', valid: true}, {value: '%0', valid: false}, {value: '%000', valid: true},
      {value: 'a:', valid: false}, {value: '1:', valid: false}, {value: 'urn:?', valid: true},
      {value: '?', valid: true}, {value: '#', valid: true}, {value: '##', valid: false},
      {value: 'a:[x]', valid: true}, {value: 'http://[x]', valid: false},
      {value: 'http://[::]/', valid: true}, {value: 'http://[::1]:80/a?b#c', valid: true},
      {value: '//[1:2:3:4:5:6:7:8]', valid: true}, {value: '//[1:2:3:4:5:6:7:8:9]', valid: false},
      {value: '//[1:2:3:4:5:6:7::8]', valid: false},
      {value: '//[1:2:3:4:5:6:1.2.3.4]', valid: true}, {value: '//[1:2:3:4:5:6:7:1.2.3.4]', valid: false},
      {value: 'http://[::ffff:001.002.003.004]/', valid: true}, {value: 'http://[::ffff:256.2.3.4]/', valid: false},
      {value: 'http://[fe80::1%25eth0]/', valid: false},
      {value: 'http://user%20name@[::1]:/path', valid: true}, {value: 'http://[::1]:port/path', valid: false},
      {value: 'http://registry:port/path', valid: true},
      {value: 'a/b:c', valid: true}, {value: 'é:', valid: false},
      {value: 'a\\b', valid: true}, {value: 'é/雪?x y#z', valid: true},
    ] as const;
    const exact = (value: string) => value.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&');
    for (const {value, valid} of cases) {
      expect(schemaUri(value, 'pattern', context), value).toBe(valid);
      expect(regular.witness(regular.intersect([grammar, language(exact(value))], 'pattern'), 'pattern'), value)
        .toBe(valid ? value : undefined);
    }
  });

  it.each(['minInclusive', 'minExclusive', 'maxInclusive', 'maxExclusive'] as const)
    ('preserves strict four-anchor indeterminacy in duration %s preimages', name => {
      const rows = [
        {endpoint: 'P1M', cases: [
          {word: 'P0027D', pattern: 'P0*27D', order: -1}, {word: 'P0028D', pattern: 'P0*28D', order: undefined},
          {word: 'P0030D', pattern: 'P0*30D', order: undefined}, {word: 'P0032D', pattern: 'P0*32D', order: 1},
          {word: 'P001M', pattern: 'P0*1M', order: 0},
        ]},
        {endpoint: 'P400Y', cases: [
          {word: 'P00146096D', pattern: 'P0*146096D', order: -1}, {word: 'P00146097D', pattern: 'P0*146097D', order: undefined},
          {word: 'P00146098D', pattern: 'P0*146098D', order: 1}, {word: 'P00400Y', pattern: 'P0*400Y', order: 0},
        ]},
        {endpoint: 'PT0.5S', cases: [
          {word: 'PT0.499S', pattern: 'PT0*[.]4990*S', order: -1}, {word: 'PT0.5001S', pattern: 'PT0*[.]50010*S', order: 1},
          {word: 'PT00.500S', pattern: 'PT0*[.]50*S', order: 0}, {word: '-PT0.5S', pattern: '\\-PT0*[.]50*S', order: -1},
        ]},
      ];
      for (const row of rows) {
        const {regular, language, context} = engine(100_000_000);
        const duration = schemaDurationLanguages(context, regular, (source, owner) => language(source));
        const endpoint = parseDuration(row.endpoint, {charge: count => context.step('pattern', count),
          arithmetic: digits => context.step('pattern', (digits + 4) ** 2), text: value => {context.text(value, 'pattern');}});
        const source = language(row.cases.map(value => '(' + value.pattern + ')').join('|'));
        const predicate = duration.bound(source, endpoint, name, 'pattern');
        for (const value of row.cases) {
          const included = value.order !== undefined && (name.startsWith('min') ? value.order > 0 : value.order < 0)
            || value.order === 0 && name.endsWith('Inclusive');
          const exact = value.word.replace(/\./g, '[.]').replace(/-/g, '\\-');
          expect(regular.witness(regular.intersect([predicate, language(exact)], 'pattern'), 'pattern'), row.endpoint + ' / ' + value.word)
            .toBe(included ? value.word : undefined);
        }
      }
    });

  it('preserves intrinsic NCName classes and excludes the colon', () => {
    const {context, lexical, regular, language} = engine();
    const intrinsic = intrinsicBuiltinPatterns(context);
    const name = intrinsic.language(intrinsic.compile(lexical('[\\i-[:]][\\c-[:]]*'), 'pattern'), 'pattern', regular);
    for (const accepted of ['A', 'Ω']) expect(regular.witness(regular.intersect([name, language(accepted)], 'pattern'), 'pattern')).toBe(accepted);
    expect(regular.witness(regular.intersect([name, language(':')], 'pattern'), 'pattern')).toBeUndefined();
  });

  it('decides unconstrained signed IEEE input half-lines beyond lexical zero', () => {
    const {regular, language, context} = engine();
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    expect(ieee.intervalWitness(language('1|9'), {negative: false}, 'pattern')).toBe('1');
    expect(ieee.intervalWitness(language('\\-1'), {negative: true}, 'pattern')).toBe('-1');
    expect(ieee.intervalWitness(language('NaN|INF'), {negative: false}, 'pattern')).toBeUndefined();
  });

  it('combines exact numeric image guards with nonnumeric and nonfinite alternatives', () => {
    const {regular, language, context} = engine(100_000_000);
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    const conditions = schemaNumericImageConditions(context, regular, ieee, expression => language(expression));
    const lower = {...ieee.boundIntervals('float', [{name: 'minExclusive', value: {family: 'float', canonical: '1'}}], 'pattern'), nonNumeric: false};
    const upper = {...ieee.boundIntervals('double', [{name: 'maxExclusive', value: {family: 'double', canonical: '2'}}], 'pattern'), nonNumeric: false};
    const outside = conditions.difference(conditions.all(), lower, 'pattern');
    const between = conditions.intersection(lower, upper, 'pattern');
    const rows = [
      {source: '1[.]0000000596046447753906250*', lower: false, outside: true, between: false},
      {source: '1[.]0000000596046447753906250000010*', lower: true, outside: false, between: true},
      {source: '1[.]5e0+', lower: true, outside: false, between: true},
      {source: '2e0+', lower: true, outside: false, between: false},
      {source: '\\n2e0+\\n', lower: true, outside: false, between: false},
      {source: '1e0+', lower: false, outside: true, between: false},
      {source: '\\-2e0+', lower: false, outside: true, between: false},
      {source: 'INF', lower: true, outside: false, between: false},
      {source: '\\-INF', lower: false, outside: true, between: false},
      {source: 'NaN', lower: false, outside: true, between: false},
      {source: 'a+', lower: false, outside: true, between: false},
    ];
    for (const row of rows) {
      const source = language(row.source);
      expect(conditions.exists(source, lower, 'pattern'), row.source).toBe(row.lower);
      expect(conditions.exists(source, outside, 'pattern'), row.source).toBe(row.outside);
      expect(conditions.exists(source, between, 'pattern'), row.source).toBe(row.between);
    }
  });

  it('compiles exact decimal-only IEEE interval preimages with endpoint ties', () => {
    const {regular, language, context} = engine(100_000_000);
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    const inverse = ieee.decimalInputLanguage(ieee.inverseIntervals({family: 'float', canonical: '1'}, 'pattern'), [], 'pattern');
    const rows = [
      {word: '1', valid: true}, {word: '+0001.000', valid: true},
      {word: '1.000000059604644775390625', valid: true},
      {word: '1.000000059604644775390625000001', valid: false},
      {word: '0.9999999701976776123046875', valid: true},
      {word: '0.999999970197677612304687499999', valid: false},
      {word: '-1', valid: false}, {word: '0', valid: false},
      {word: '1e0', valid: false}, {word: 'INF', valid: false}, {word: 'NaN', valid: false},
    ];
    for (const {word, valid} of rows) {
      const exact = word.replace(/\./g, '[.]').replace(/[+]/g, '[+]').replace(/-/g, '\\-');
      expect(regular.witness(regular.intersect([inverse, language(exact)], 'pattern'), 'pattern'), word).toBe(valid ? word : undefined);
    }
  });

  it('preserves nested Boolean lexical predicates and empty conjunction/disjunction truth', () => {
    const {regular, language, context} = engine(100_000_000);
    const ieee = schemaIeeeLanguages(context, regular, expression => language(expression));
    const numeric = schemaNumericImageConditions(context, regular, ieee, expression => language(expression));
    const predicates = schemaLexicalPredicates(context, regular, numeric);
    const n: LexicalPredicate = {kind: 'numeric', condition: {...ieee.boundIntervals('float', [
      {name: 'minExclusive', value: {family: 'float', canonical: '1'}},
    ], 'pattern'), nonNumeric: false}};
    const r: LexicalPredicate = {kind: 'regular', language: language('a|1e0')};
    const cases: {predicate: LexicalPredicate; accepted: readonly string[]}[] = [
      {predicate: {kind: 'not', child: {kind: 'or', children: [r, n]}}, accepted: ['NaN']},
      {predicate: {kind: 'or', children: [{kind: 'and', children: [r, n]}, {kind: 'not', child: r}]}, accepted: ['2e0', 'NaN']},
      {predicate: {kind: 'not', child: {kind: 'and', children: [n, {kind: 'not', child: r}]}}, accepted: ['a', '1e0', 'NaN']},
      {predicate: {kind: 'and', children: []}, accepted: ['a', '1e0', '2e0', 'NaN']},
      {predicate: {kind: 'or', children: []}, accepted: []},
      {predicate: {kind: 'not', child: {kind: 'and', children: []}}, accepted: []},
      {predicate: {kind: 'not', child: {kind: 'or', children: []}}, accepted: ['a', '1e0', '2e0', 'NaN']},
    ];
    for (const row of cases) for (const word of ['a', '1e0', '2e0', 'NaN'])
      expect(predicates.exists(row.predicate, language(word), 'pattern'), word).toBe(row.accepted.includes(word));
  });

  it.each([
    {family: 'decimal', source: '\\-?0*(1([.]0*)?|[.]250*)', expected: ['1', '-1', '0.25', '-0.25']},
    {family: 'decimal', source: '0001[.]2500|[+]0002[.]5000|\\-0001[.]2500|[.]0001|000[.]0000', expected: ['1.25', '2.5', '-1.25', '0.0001', '0']},
    {family: 'decimal', source: '1[.]230*|2[.]340*', expected: ['1.23', '2.34']},
    {family: 'decimal', source: '[+\\-]?(0+([.]0*)?|[.]0+)', expected: ['0']},
    {family: 'decimal', source: '[+]?0*(12|34)[.](50*|60*)', expected: ['12.5', '12.6', '34.5', '34.6']},
    {family: 'hexBinary', source: 'AaFf|aAfF', expected: ['aaff']},
    {family: 'base64Binary', source: 'A *Q *= *=', expected: ['AQ==']},
    {family: 'boolean', source: 'true|1', expected: ['true']},
    {family: 'boolean', source: '0|false|true', expected: ['false', 'true']},
    {family: 'string', source: 'a|b', expected: ['a', 'b']},
    {family: 'anyURI', source: 'a b|é', expected: ['a b', 'é']},
  ])('exhausts the independent canonical $family image of $source', ({family, source, expected}) => {
    const {regular, language, context} = engine(100_000_000);
    const images = schemaValueImages(context, regular, expression => language(expression));
    const image = images.simple(language(source), family, 'pattern');
    if (!image) throw new Error('The independently specified family has a canonical image');
    const finite = regular.finiteWords(image, 'pattern');
    expect(finite.kind).toBe('finite');
    if (finite.kind !== 'finite') throw new Error('These canonical value images are finite despite infinite aliases');
    expect(new Set(finite.words)).toEqual(new Set(expected));
  });

  it.each([
    {inputs: [{source: '0*(1|2)', weight: 12}, {source: '0*(3|4)', weight: 1}], carry: 0, expected: ['15', '16', '27', '28']},
    {inputs: [{source: '999', weight: 1}, {source: '1', weight: 1}], carry: 7, expected: ['1007']},
    {inputs: [{source: '0*(9|99)', weight: 12}, {source: '1', weight: 1}], carry: 0, expected: ['109', '1189']},
    {inputs: [{source: '0*1', weight: 86400}, {source: '0*24', weight: 3600}], carry: 0, expected: ['172800']},
    {inputs: [], carry: 0, expected: ['0']},
  ])('exhausts exact finite integer carry images with initial carry $carry', ({inputs, carry, expected}) => {
    const {regular, language, context, budget} = engine(100_000_000);
    const integers = schemaIntegerImages(context, regular, expression => language(expression));
    const result = budget.guard(() => {
      const image = integers.sum(inputs.map(input => ({language: language(input.source), weight: input.weight})), 'pattern', carry);
      const finite = regular.finiteWords(image, 'pattern');
      return finite.kind === 'finite' ? new Set(finite.words) : finite;
    });
    expect(result).toEqual(new Set(expected));
  });

  it.each([
    {source: 'P0*12M|P0*1Y', expected: ['12/0']},
    {source: 'P0*1DT0*24H|PT0*48H', expected: ['0/172800']},
    {source: 'P0*1Y0*1D|P0*2Y0*2D', expected: ['12/86400', '24/172800']},
    {source: 'PT0+[.]250*S|PT0*1[.]250*S', expected: ['0/0.25', '0/1.25']},
    {source: '\\-P0*12MT0+[.]50*S', expected: ['-12/-0.5']},
    {source: '\\-P0+DT0+S', expected: ['0/0']},
    {source: 'P0*12MT0*86400S|P0*1Y0*1D', expected: ['12/86400']},
    {source: 'PT(0|1)H(0|1)M(0|1)S', expected: ['0/0', '0/1', '0/60', '0/61', '0/3600', '0/3601', '0/3660', '0/3661']},
  ])('exhausts complete duration month/second images of $source', ({source, expected}) => {
    const {regular, language, context, budget} = engine(100_000_000);
    const images = schemaValueImages(context, regular, expression => language(expression));
    const result = budget.guard(() => {
      const finite = regular.finiteWords(images.duration(language(source), 'pattern'), 'pattern');
      return finite.kind === 'finite' ? new Set(finite.words) : finite;
    });
    expect(result).toEqual(new Set(expected));
  });

  it.each([
    {family: 'dateTime', source: '2001-12-31T23:59:60[.]250+Z', expected: ['2002-01-01T00:00:00.25Z']},
    {family: 'dateTime', source: '2000-02-29T24:00:00([.]0+)?Z', expected: ['2000-03-01T00:00:00Z']},
    {family: 'date', source: '0001-01-01[+]14:00', expected: ['-0001-12-31T10:00:00Z']},
    {family: 'dateTime', source: '\\-0001-12-31T24:00:00Z', expected: ['0001-01-01T00:00:00Z']},
    {family: 'dateTime', source: '\\-0004-02-29T23:59:60Z', expected: ['-0004-03-01T00:00:00Z']},
    {family: 'dateTime', source: '2000-01-01T00:00:00[.]1250+', expected: ['2000-01-01T00:00:00.125']},
    {family: 'time', source: '01:00:00[+]14:00', expected: ['2000-01-01T11:00:00Z']},
    {family: 'time', source: '23:59:60[.]250+Z', expected: ['2000-01-01T00:00:00.25Z']},
    {family: 'time', source: '24:00:00([.]0+)?', expected: ['2000-01-01T00:00:00']},
    {family: 'gYear', source: '\\-0001[+]14:00', expected: ['-0002-12-31T10:00:00Z']},
    {family: 'gYear', source: '0001[+]14:00', expected: ['-0001-12-31T10:00:00Z']},
    {family: 'gYearMonth', source: '2000-03[+]14:00', expected: ['2000-02-29T10:00:00Z']},
    {family: 'gMonthDay', source: '--02-29[+]14:00', expected: ['2000-02-28T10:00:00Z']},
    {family: 'gDay', source: '---31[+]14:00', expected: ['2000-01-30T10:00:00Z']},
    {family: 'gMonth', source: '--02[+]14:00', expected: ['2000-01-31T10:00:00Z']},
    {family: 'gYearMonth', source: '2000-02[+]00:00|2001-03Z', expected: ['2000-02-01T00:00:00Z', '2001-03-01T00:00:00Z']},
  ] as const)('exhausts the complete $family calendar image of $source', ({family, source, expected}) => {
    const {regular, language, context, budget} = engine(100_000_000);
    const images = schemaCalendarImages(context, regular, expression => language(expression));
    const result = budget.guard(() => {
      const finite = regular.finiteWords(images.image(language(source), family, 'pattern'), 'pattern');
      return finite.kind === 'finite' ? new Set(finite.words) : finite;
    });
    expect(result).toEqual(new Set(expected));
  });

  it.each([
    {source: '[1-9][0-9]{4,}-01-01[+]14:00', family: 'date', accepted: ['9999-12-31T10:00:00Z', '10000-12-31T10:00:00Z'], rejected: ['0999-12-31T10:00:00Z', '-0001-12-31T10:00:00Z']},
    {source: '\\-[1-9][0-9]{4,}-12-31T24:00:00Z', family: 'dateTime', accepted: ['-9999-01-01T00:00:00Z', '-10000-01-01T00:00:00Z'], rejected: ['9999-01-01T00:00:00Z', '-0999-01-01T00:00:00Z']},
  ] as const)('preserves infinite extended-year carry images for $source', ({source, family, accepted, rejected}) => {
    const {regular, language, context, budget} = engine(100_000_000);
    const images = schemaCalendarImages(context, regular, expression => language(expression));
    const image = budget.guard(() => images.image(language(source), family, 'pattern'));
    if ('kind' in image && image.kind === 'resource-limit') throw new Error('The independently bounded extended-year product must fit its diagnostic allowance');
    const exact = (word: string) => word.replace(/-/g, '\\-');
    for (const word of accepted) expect(regular.witness(regular.intersect([image, language(exact(word))], 'pattern'), 'pattern')).toBe(word);
    for (const word of rejected) expect(regular.witness(regular.intersect([image, language(exact(word))], 'pattern'), 'pattern')).toBeUndefined();
  });

  it('uses privately compiled facts and rejects copied language authority', () => {
    const {patterns, lexical, regular} = engine();
    const compiled = patterns.compile(lexical('(a|b)c'), 'pattern');
    let calls = 0;
    Object.defineProperties(compiled, {
      atoms: {get: () => {calls++; throw new Error('Public atoms are not authority');}},
      root: {get: () => {calls++; throw new Error('Public root is not authority');}},
    });
    const language = patterns.language(compiled, 'pattern');
    expect(regular.witness(language, 'pattern')).toBe('ac');
    expect(() => regular.witness({...language}, 'pattern')).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it('isolates returned automaton mutations from cached language authority and compositions', () => {
    const {regular, language} = engine();
    const original = language('a(b|c)*d');
    const published = regular.automaton(original, 'pattern');
    const before = structuredClone(published);
    for (const state of published.states) {
      Object.assign(state, {accepting: true});
      for (const edge of state.transitions) Object.assign(edge, {to: published.start, lo: 32, hi: 0x10ffff});
    }
    expect(regular.automaton(original, 'pattern')).toEqual(before);
    expect(regular.witness(original, 'pattern')).toBe('ad');
    expect(regular.witness(regular.concatenate([original, language('x')], 'pattern'), 'pattern')).toBe('adx');
  });

  it('snapshots supplied NFA ranges and reverses their complete language', () => {
    const {regular, language} = engine();
    const program = {start: 0, end: 2, edges: [
      [{to: 1, ranges: [[97, 98] as const]}], [{to: 2, ranges: [[99, 99] as const]}], [],
    ]};
    const original = regular.fromNfa(program, 'pattern');
    Object.assign(program.edges[0][0], {to: 0, ranges: [[120, 120]]});
    const finite = regular.finiteWords(original, 'pattern');
    if (finite.kind !== 'finite') throw new Error('The independent two-edge language is finite');
    expect(new Set(finite.words)).toEqual(new Set(['ac', 'bc']));
    const backwards = regular.reverse(original, 'pattern');
    expect(regular.witness(regular.intersect([backwards, language('ca')], 'pattern'), 'pattern')).toBe('ca');
    expect(regular.witness(regular.intersect([backwards, language('cb')], 'pattern'), 'pattern')).toBe('cb');
    expect(regular.witness(regular.intersect([backwards, language('ac')], 'pattern'), 'pattern')).toBeUndefined();
  });

  it('computes both regular quotients with nullable prefixes and suffixes', () => {
    const {regular, language} = engine();
    const cases = [
      {source: '(a|aa)b+c', prefix: 'a', suffix: 'c', accepted: ['b', 'bb', 'ab'], rejected: ['', 'a', 'aab', 'bc']},
      {source: '(a|b)c?', prefix: 'a?', suffix: 'c?', accepted: ['', 'a', 'b', 'c', 'ac', 'bc'], rejected: ['aa', 'cc', 'ab']},
      {source: 'Ω(雪|😀)+x', prefix: 'Ω', suffix: 'x', accepted: ['雪', '😀', '雪😀'], rejected: ['', 'Ω雪', '雪x']},
      {source: 'abc', prefix: 'a', suffix: 'd', accepted: [], rejected: ['', 'b', 'bc']},
    ];
    for (const row of cases) {
      const quotient = regular.quotient(language(row.source), language(row.prefix), language(row.suffix), 'pattern');
      for (const word of row.accepted) expect(regular.witness(regular.intersect([quotient, language(word)], 'pattern'), 'pattern')).toBe(word);
      for (const word of row.rejected) expect(regular.witness(regular.intersect([quotient, language(word)], 'pattern'), 'pattern')).toBeUndefined();
    }
  });

  it('precharges cached automaton publication and quotient traversal at the exact boundary', () => {
    const query = (maxWork: number) => {
      const e = engine(maxWork);
      const result = e.budget.guard(() => {
        const source = e.language('a*b+c*');
        e.regular.automaton(source, 'pattern');
        const cached = e.regular.automaton(source, 'pattern');
        const paths = e.regular.paths(cached, [cached.start], new Set(cached.states.flatMap((state, index) => state.accepting ? [index] : [])), 'pattern');
        return e.regular.witness(e.regular.quotient(paths, e.language('a+'), e.language('c+'), 'pattern'), 'pattern');
      });
      return {budget: e.budget, result};
    };
    const measured = query(1_000_000), work = measured.budget.usage().work;
    expect(measured.result).toBe('b');
    expect(query(work).result).toBe('b');
    const below = query(work - 1);
    expect(below.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(below.budget.guard(() => false)).toBe(below.result);
  });

  it('includes the last charged work unit and rejects one below with sticky exhaustion', () => {
    const query = (maxWork: number) => {
      const e = engine(maxWork);
      const result = e.budget.guard(() => e.regular.witness(e.regular.intersect([e.language('a{5,}'), e.language('a{0,4}')], 'pattern'), 'pattern'));
      return {budget: e.budget, result};
    };
    const measured = query(1_000_000), work = measured.budget.usage().work;
    expect(measured.result).toBeUndefined();
    expect(query(work).result).toBeUndefined();
    const below = query(work - 1);
    expect(below.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(below.budget.guard(() => false)).toBe(below.result);
  });

  it('precharges adversarial repetition at the explicit former work limit', () => {
    const {patterns, lexical, budget} = engine(1_000_000);
    const compiled = patterns.compile(lexical('a{999999999999999999999999999999999999999}'), 'pattern');
    const result = budget.guard(() => patterns.language(compiled, 'pattern'));
    expect(result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(budget.guard(() => patterns.language(compiled, 'pattern'))).toBe(result);
  });

  it('compares signed decimal preimages with independently listed exact hundredths', () => {
    const {context, patterns, lexical} = engine(100_000_000);
    const decimals = schemaDecimalLanguages(context);
    const cases = [
      {canonical: '0', alias: '-000.0000', hundredths: 0n},
      {canonical: '0.01', alias: '+000.0100', hundredths: 1n},
      {canonical: '-0.01', alias: '-000.0100', hundredths: -1n},
      {canonical: '0.99', alias: '.9900', hundredths: 99n},
      {canonical: '1.25', alias: '0001.2500', hundredths: 125n},
      {canonical: '-1.25', alias: '-0001.2500', hundredths: -125n},
      {canonical: '10.25', alias: '+0010.2500', hundredths: 1025n},
      {canonical: '-10.25', alias: '-0010.2500', hundredths: -1025n},
      {canonical: '100', alias: '000100.0', hundredths: 10000n},
    ] as const;
    for (const bound of cases) for (const greater of [false, true]) {
      const expression = decimals.relation(bound.canonical, greater, 'pattern');
      if (expression === undefined) throw new Error('Finite nonzero comparison side exists');
      const compiled = patterns.compile(lexical(expression), 'pattern');
      for (const value of cases) for (const spelling of [value.canonical, value.alias]) {
        const expected = greater ? value.hundredths > bound.hundredths : value.hundredths < bound.hundredths;
        expect(patterns.acceptsOperand(compiled, spelling, 'pattern'), `${spelling} ${greater ? '>' : '<'} ${bound.canonical}`).toBe(expected);
      }
    }
  });

  it.each([
    {name: 'totalDigits' as const, bound: '1', admitted: ['0', '000.0000', '.1', '+0009.000'], excluded: ['.01', '10', '-.001']},
    {name: 'totalDigits' as const, bound: '3', admitted: ['+00120.0000', '.00100', '-1.2300'], excluded: ['1200', '.0001', '1.234']},
    {name: 'fractionDigits' as const, bound: '2', admitted: ['1200', '.0100', '-1.23000'], excluded: ['.001', '1.234000', '-.0001']},
  ])('uses minimal exact value precision for $name $bound', ({name, bound, admitted, excluded}) => {
    const {context, patterns, lexical} = engine();
    const expression = schemaDecimalLanguages(context).precision(name, bound, 'pattern');
    const compiled = patterns.compile(lexical(expression), 'pattern');
    for (const value of admitted) expect(patterns.acceptsOperand(compiled, value, 'pattern'), value).toBe(true);
    for (const value of excluded) expect(patterns.acceptsOperand(compiled, value, 'pattern'), value).toBe(false);
  });
});

describe('nonauthor complete original typed membership', () => {
  it.each([
    {primitive: 'double', pattern: '0*.0*e0+', value: '1'},
    {primitive: 'dateTime', pattern: '2000-01-01T00:00:00[.]0+Z', value: '2000-01-01T00:00:00Z'},
    {primitive: 'duration', pattern: 'P0*12M', value: 'P1Y'},
  ])('decides infinite $primitive membership at selected engineering defaults', async ({primitive, pattern, value}) => {
    const {facet, component, raw, candidate, request} = await setup({defaultLimits: true});
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin(primitive), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, builtin(primitive)))]),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(request.budget.usage().work).toBeLessThanOrEqual(DEFAULT_MAX_WORK);
  });
  it.each([
    {primitive: 'double', pattern: '00000.00000e-5', value: '1', valid: true},
    {primitive: 'double', pattern: '00000.00000e-5', value: '10', valid: false},
    {primitive: 'decimal', pattern: '\\d{3}1', value: '1', valid: true},
    {primitive: 'decimal', pattern: '\\d{3}1', value: '-1', valid: false},
    {primitive: 'dateTime', pattern: '2000-01-01T00:00:00.0Z', value: '2000-01-01T00:00:00Z', valid: true},
    {primitive: 'dateTime', pattern: '2000-01-01T00:00:00.0Z', value: '2000-01-01T00:00:01Z', valid: false},
    {primitive: 'duration', pattern: 'P1DT0H0M0.0S', value: 'P1D', valid: true},
    {primitive: 'duration', pattern: 'P1DT0H0M0.0S', value: 'P2D', valid: false},
    {primitive: 'gMonth', pattern: '--01[+]00:00', value: '--01Z', valid: true},
    {primitive: 'gMonth', pattern: '--01[+]00:00', value: '--02Z', valid: false},
  ])('decides $primitive value $value behind $pattern ($valid)', async ({primitive, pattern, value, valid}) => {
    const {facet, component, raw, candidate} = await setup();
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin(primitive), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, builtin(primitive)))]),
    ]);
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('rejects a typed string value changed by mandatory base whitespace normalization', async () => {
    const {facet, component, raw, candidate} = await setup();
    const inherited = [component(facet('whiteSpace', 'collapse')), component(facet('pattern', 'a b'))];
    const kernel = candidate([
      raw('Base', builtin('string'), inherited),
      raw('Child', named('Base'), [...inherited, component(facet('enumeration', 'a   b', builtin('string')))]),
    ]);
    // Every Base spelling denotes "a b"; no Base spelling denotes "a   b".
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    {pattern: 'q:Local', valid: true}, {pattern: 'r:Local', valid: false},
  ])('uses original QName bindings for $pattern ($valid)', async ({pattern, valid}) => {
    const {facet, component, raw, candidate} = await setup();
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin('QName'), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', 'p:Local', builtin('QName')))]),
    ]);
    // p=q=urn:review:qname; r=urn:review:other in the original operand context.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {base: 'TextThenDecimal', type: 'decimal', value: '1', valid: false},
    {base: 'DecimalThenText', type: 'string', value: '1', valid: false},
    {base: 'DecimalThenText', type: 'string', value: 'abc', valid: true},
    {base: 'DecimalThenText', type: 'decimal', value: '1', valid: true},
  ])('preserves ordered union selection for $base / $type $value ($valid)', async ({base, type, value, valid}) => {
    const {facet, component, raw, candidate} = await setup();
    const members = base === 'TextThenDecimal' ? [builtin('string'), builtin('decimal')] : [builtin('decimal'), builtin('string')];
    const kernel = candidate([raw('Child', named(base), [component(facet('enumeration', value, builtin(type)))], {kind: 'union', members})]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'decimal', source: 'DecimalList', pattern: '0*1([.]0*)? 0*2([.]0*)?', value: '1 2', witness: '001.00 002.00', valid: true},
    {primitive: 'decimal', source: 'DecimalList', pattern: '0*1([.]0*)? 0*2([.]0*)?', value: '1 3', witness: '001.00 002.00', valid: false},
    {primitive: 'double', source: 'DoubleList', pattern: '0*.0*e0+ 0*.0*e0+', value: '1 2', witness: '1e0 2e0', valid: true},
    {primitive: 'double', source: 'DoubleList', pattern: '0*.0*e0+ 0*.0*e0+', value: '1 -2', witness: '1e0 2e0', valid: false},
    {primitive: 'dateTime', source: 'DateTimeList', pattern: '2000-01-01T00:00:00([.]0+)?Z 2001-01-01T00:00:00([.]0+)?Z', value: '2000-01-01T00:00:00Z 2001-01-01T00:00:00Z', witness: '2000-01-01T00:00:00.00Z 2001-01-01T00:00:00.00Z', valid: true},
    {primitive: 'dateTime', source: 'DateTimeList', pattern: '2000-01-01T00:00:00([.]0+)?Z 2001-01-01T00:00:00([.]0+)?Z', value: '2000-01-01T00:00:00Z 2002-01-01T00:00:00Z', witness: '2000-01-01T00:00:00.00Z 2001-01-01T00:00:00.00Z', valid: false},
    {primitive: 'duration', source: 'DurationList', pattern: 'P0*12M PT0*24H', value: 'P1Y P1D', witness: 'P0012M PT0024H', valid: true},
    {primitive: 'duration', source: 'DurationList', pattern: 'P0*12M PT0*24H', value: 'P1Y P2D', witness: 'P0012M PT0024H', valid: false},
  ])('decides complete fixed $primitive list items behind $pattern ($valid)', async ({primitive, source, pattern, value, witness, valid}) => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const inherited = component(facet('pattern', pattern));
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const variety = {kind: 'list' as const, item: builtin(primitive)};
    const kernel = candidate([
      raw('Base', named(source), [whitespace, inherited], variety),
      raw('Child', named('Base'), [whitespace, inherited, component(facet('enumeration', value, named(source)))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(actual.equivalent(named(source), lexical(witness), named(source), lexical(value), owner)).toMatchObject({kind: 'checked', value: valid, obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('does not certify selected-value containment from ordered member derivation alone', async () => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const kernel = candidate([
      raw('OnlyA', builtin('string'), [component(facet('pattern', 'a'))]),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: [named('OnlyA'), builtin('decimal')]}),
      raw('Child', named('TextThenDecimal'), [], {kind: 'union', members: [named('OnlyA'), builtin('decimal')]}),
    ]);
    expect(actual.assess(named('TextThenDecimal'), lexical('1'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'string', canonical: '1'}}});
    expect(kernel.assess(named('Probe'), lexical('1'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'decimal', canonical: '1'}}});
    // Every original Base spelling selects its first preserving string.
    // Child admits decimal 1, which has no original Base spelling; ordered
    // member derivation therefore fails the selected-value containment duty.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('checks same-primitive selected-image containment across changed member whitespace behavior', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const collapse = component(facet('whiteSpace', 'collapse'));
    const baseMembers = [named('FirstCollapse'), builtin('string')];
    const childMembers = [named('NarrowFirst'), builtin('string')];
    const kernel = candidate([
      raw('FirstCollapse', builtin('string'), [collapse]),
      raw('NarrowFirst', named('FirstCollapse'), [collapse, component(facet('pattern', 'a'))]),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('BaseEnumeration', named('Base'), [component(facet('enumeration', ' 1 ', builtin('string')))], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    expect(kernel.assess(named('Base'), lexical(' 1 '), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'string', canonical: '1'}}});
    expect(kernel.describe(named('BaseEnumeration'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('Probe'), lexical(' 1 '), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'string', canonical: ' 1 '}}});
    // All original Base values are collapsed strings. Narrowing the first
    // member introduces preserving string values despite equal primitives.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    {mode: 'preserve', value: '\t1\n', valid: true},
    {mode: 'replace', value: '\t1\n', valid: false},
    {mode: 'replace', value: ' 1 ', valid: true},
    {mode: 'replace', value: 'a  b', valid: true},
    {mode: 'collapse', value: ' 1 ', valid: false},
    {mode: 'collapse', value: '\t1\n', valid: false},
    {mode: 'collapse', value: 'a  b', valid: false},
    {mode: 'collapse', value: 'a b', valid: true},
    {mode: 'collapse', value: '', valid: true},
  ])('retains only possible $mode string outputs in ordered union typed membership ($valid)', async ({mode, value, valid}) => {
    const {facet, component, raw, candidate} = await setup();
    const members = [named('FirstMode'), builtin('string')];
    const kernel = candidate([
      raw('FirstMode', builtin('string'), [component(facet('whiteSpace', mode))]),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members}),
      raw('Child', named('Base'), [component(facet('enumeration', value, builtin('string')))], {kind: 'union', members}),
    ]);
    // FirstMode admits every spelling, so the preserving later member can
    // never produce a value outside the first member's normalization image.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'boolean', lexicalValue: 'true'}, {primitive: 'double', lexicalValue: '1e0'},
    {primitive: 'dateTime', lexicalValue: '2000-01-01T00:00:00Z'}, {primitive: 'duration', lexicalValue: 'P1Y'},
    {primitive: 'QName', lexicalValue: 'p:Local'}, {primitive: 'hexBinary', lexicalValue: 'FF'},
    {primitive: 'base64Binary', lexicalValue: 'AQ=='}, {primitive: 'list', lexicalValue: '1'},
  ])('rejects introduced $primitive selected values after narrowing a universal earlier string', async ({primitive, lexicalValue}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const later = primitive === 'list' ? named('DecimalList') : builtin(primitive);
    const baseMembers = [builtin('string'), later], childMembers = [named('OnlyA'), later];
    const kernel = candidate([
      raw('OnlyA', builtin('string'), [component(facet('pattern', 'a'))]),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    expect(kernel.assess(named('Base'), lexical(lexicalValue), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'string'}}});
    expect(kernel.assess(named('Probe'), lexical(lexicalValue), owner)).toMatchObject({kind: 'checked', value: {operand: {family: primitive}}});
    // Every Base spelling selects string. This assessed fresh primitive or
    // list value is an explicit selected-image containment counterexample.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'double', lexicalValue: '1e0'}, {primitive: 'dateTime', lexicalValue: '2000-01-01T00:00:00Z'},
    {primitive: 'duration', lexicalValue: 'P1Y'}, {primitive: 'QName', lexicalValue: 'p:Local'},
    {primitive: 'list', lexicalValue: '1'},
  ])('proves complete $primitive image containment through raw line-feed aliases', async ({primitive, lexicalValue}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const inherited = component(facet('pattern', '[^\\n\\r]*'));
    const later = primitive === 'list' ? named('DecimalList') : builtin(primitive);
    const baseMembers = [named('First'), later], childMembers = [named('NarrowFirst'), later];
    const kernel = candidate([
      raw('First', builtin('string'), [inherited]),
      raw('NarrowFirst', named('First'), [inherited, component(facet('pattern', 'a'))]),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    expect(kernel.assess(named('Base'), lexical(lexicalValue), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'string'}}});
    expect(kernel.assess(named('Base'), lexical('\n' + lexicalValue + '\n'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: primitive}}});
    expect(kernel.assess(named('Probe'), lexical(lexicalValue), owner)).toMatchObject({kind: 'checked', value: {operand: {family: primitive}}});
    // For every later-member value, LF + any spelling + LF rejects First
    // and normalizes to that same value. Base therefore contains the whole
    // later-member image; Child's only earlier string value "a" is retained.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('retains whole-list path constraints when an item uses an ordered union', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const variety = {kind: 'list' as const, item: named('DecimalThenText')};
    const inherited = [component(facet('whiteSpace', 'collapse', undefined, true)), component(facet('pattern', 'abc'))];
    const kernel = candidate([
      raw('Base', named('NumericThenTextList'), inherited, variety),
      raw('Child', named('Base'), [...inherited, component(facet('enumeration', '1', named('DecimalList')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical('abc'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'string', canonical: 'abc'}]}}});
    // Decimal 1 is an item-union value, but no spelling denoting that item
    // traverses the sole whole-list pattern path for "abc".
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('does not use raw union padding aliases inside already tokenized list items', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const one = component(facet('pattern', '1'));
    const itemMembers = [named('StringOne'), named('DecimalOne')];
    const variety = {kind: 'list' as const, item: named('ItemUnion')};
    const inherited = [component(facet('whiteSpace', 'collapse', undefined, true)), one];
    const kernel = candidate([
      raw('StringOne', builtin('string'), [one]),
      raw('DecimalOne', builtin('decimal'), [one]),
      raw('ItemUnion', builtin('anySimpleType'), [], {kind: 'union', members: itemMembers}),
      raw('InitialList', builtin('anySimpleType'), [inherited[0]], variety),
      raw('Base', named('InitialList'), inherited, variety),
      raw('Child', named('Base'), [...inherited, component(facet('enumeration', '1', named('DecimalList')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(' \t1\n '), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'string', canonical: '1'}]}}});
    // List collapse and tokenization consume all surrounding XML whitespace
    // before member selection. The sole token "1" always selects string.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('finds a raw whitespace alias that changes the selected union member', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const pattern = component(facet('pattern', '1'));
    const members = [named('StringOne'), named('DecimalOne')];
    const variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('StringOne', builtin('string'), [pattern]),
      raw('DecimalOne', builtin('decimal'), [pattern]),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1', builtin('decimal')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical('1'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'string', canonical: '1'}}});
    expect(kernel.assess(named('Base'), lexical(' 1 '), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'decimal', canonical: '1'}}});
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Child'), lexical(' 1 '), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([
    {mode: 'collapse', first: '[+]?0*1([.]0*)?', later: '[+]?0*1([.]0*)?', witness: '0001.000', valid: false},
    {mode: 'collapse', first: '0*1([.]0*)?', later: '[+]?0*1([.]0*)?', witness: '+0001.000', valid: true},
    {mode: 'preserve', first: '[+]?0*1([.]0*)?', later: '[+]?0*1([.]0*)?', witness: ' \t0001.000\n', valid: true},
    {mode: 'replace', first: '[+]?0*1([.]0*)?', later: '[+]?0*1([.]0*)?', witness: '\t0001.000\n', valid: true},
    {mode: 'collapse', first: '1|[+]1', later: '0*1([.]0*)?', witness: '001', valid: true},
  ])('decides infinite ordered decimal aliases with earlier $mode / $first ($valid)', async ({mode, first, later, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const members = [named('First'), named('Later')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('First', builtin('string'), [component(facet('whiteSpace', mode)), component(facet('pattern', first))]),
      raw('Later', builtin('decimal'), [component(facet('pattern', later))]),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1', builtin('decimal')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: valid ? 'decimal' : 'string', canonical: valid ? '1' : witness}}});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {first: 'a', valid: true}, {first: '0*.0*e0+', valid: false},
  ])('decides ordered double aliases behind an earlier collapse string $first ($valid)', async ({first, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const pattern = component(facet('pattern', '0*.0*e0+'));
    const members = [named('First'), named('Later')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('First', builtin('string'), [component(facet('whiteSpace', 'collapse')), component(facet('pattern', first))]),
      raw('Later', builtin('double'), [pattern]),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1', builtin('double')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical('1e0'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: valid ? 'double' : 'string', canonical: valid ? '1' : '1e0'}}});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {firstMin: '2', valid: true}, {firstMin: '0', valid: false},
  ])('decides double selection across a first float value predicate >$firstMin ($valid)', async ({firstMin, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const members = [named('First'), builtin('double')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('First', builtin('float'), [component(facet('minExclusive', firstMin))]),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1', builtin('double')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical('1e0'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: valid ? 'double' : 'float', canonical: '1'}}});
    // Every double-1 rounding interval lies inside float-1's interval, so
    // an earlier >0 float always selects float; an earlier >2 never does.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {name: 'minExclusive', witness: '1.000000059604644775390625', valid: true},
    {name: 'minExclusive', witness: '1.000000059604644775390625000001', valid: false},
    {name: 'minInclusive', witness: '1.000000059604644775390625', valid: false},
  ])('subtracts first-float rounding interval endpoints for $name at $witness ($valid)', async ({name, witness, valid}) => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const pattern = component(facet('pattern', witness.replace(/\./g, '[.]') + '0*'));
    const members = [named('First'), named('Later')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('First', builtin('float'), [component(facet(name, '1'))]),
      raw('Later', builtin('double'), [pattern]),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1.0000000596046448', builtin('double')))], variety),
    ]);
    expect(actual.equivalent(builtin('double'), lexical(witness), builtin('double'), lexical('1.0000000596046448'), owner))
      .toMatchObject({kind: 'checked', value: true, obligations: []});
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: valid ? 'double' : 'float'}}});
    // The exact float midpoint rounds to even float 1; adding 10^-30
    // selects the next float while both inputs round to the same double.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {firstMin: '2', valid: true}, {firstMin: '0', valid: false},
  ])('decides a selected singleton IEEE list after a first float >$firstMin ($valid)', async ({firstMin, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const members = [named('First'), named('DoubleList')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('First', builtin('float'), [component(facet('minExclusive', firstMin))]),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1', named('DoubleList')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical('1e0'), owner)).toMatchObject({kind: 'checked', value: {operand: valid
      ? {family: 'list', items: [{family: 'double', canonical: '1'}]} : {family: 'float', canonical: '1'}}});
    // All scalar aliases of singleton [double 1] lie in float-1's input
    // interval. An earlier >0 float shadows the entire list value image.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('does not treat an internal-space item value as an admitted earlier list token', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const pattern = component(facet('pattern', '0*.0*e0+ 0*.0*e0+'));
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const members = [named('FirstList'), named('LaterList')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('PairString', builtin('string'), [pattern]),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('PairString')}),
      raw('LaterList', named('DoubleList'), [whitespace, pattern], {kind: 'list', item: builtin('double')}),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', '1 1', named('DoubleList')))], variety),
    ]);
    expect(kernel.assess(named('FirstList'), lexical('1e0 1e0'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('Base'), lexical('1e0 1e0'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [
      {family: 'double', canonical: '1'}, {family: 'double', canonical: '1'},
    ]}}});
    // Every PairString value requires a separator, and no list token can
    // contain one. FirstList admits only [], while LaterList admits [1,1].
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([
    {pattern: '0*1([.]0*)?', value: '1', earlier: '1', witness: '001.00', valid: false},
    {pattern: '0*1([.]0*)?([e]0+)?', value: '1', earlier: '1', witness: '001.00e00', valid: true},
    {pattern: '0*1 0*2', value: '1 2', earlier: '1 2', witness: '001 002', valid: false},
    {pattern: '0*1 0*3', value: '1 3', earlier: '1 2', witness: '001 003', valid: true},
  ])('accounts for earlier whole-list enumeration under $pattern ($valid)', async ({pattern, value, earlier, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const members = [named('FirstList'), named('DoubleList')], variety = {kind: 'union' as const, members};
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('FirstList', named('DecimalList'), [whitespace, component(facet('enumeration', earlier, named('DecimalList')))], {kind: 'list', item: builtin('decimal')}),
      raw('Root', builtin('anySimpleType'), [], variety),
      raw('Base', named('Root'), [inherited], variety),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, named('DoubleList')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items:
      value.split(' ').map(() => ({family: valid ? 'double' : 'decimal'})),
    }}});
    // Without an exponent, every allowed alias denotes the enumerated
    // decimal sequence and is selected earlier. Exponents or a changed
    // second item defeat that earlier whole-sequence enumeration.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {value: '1', earlier: '1', pattern: '0*1([.]0*)?', witness: '001.00', valid: false},
    {value: '1 2', earlier: '1 2', pattern: '0*1 0*2', witness: '001 002', valid: false},
    {value: '1 3', earlier: '1 2', pattern: '0*1 0*3', witness: '001 003', valid: true},
  ])('accounts for an earlier IEEE whole-list enumeration before decimal $value ($valid)', async ({value, earlier, pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const members = [named('FirstList'), named('DecimalList')], variety = {kind: 'union' as const, members};
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('FirstList', named('DoubleList'), [whitespace, component(facet('enumeration', earlier, named('DoubleList')))], {kind: 'list', item: builtin('double')}),
      raw('Root', builtin('anySimpleType'), [], variety),
      raw('Base', named('Root'), [inherited], variety),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, named('DecimalList')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items:
      value.split(' ').map(() => ({family: valid ? 'decimal' : 'double'})),
    }}});
    // Every spelling of decimal 1 or 2 rounds to the same double value.
    // Only the changed complete sequence [1,3] evades the earlier enum.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([{last: '2', valid: false}, {last: '3', valid: false}, {last: '4', valid: true}])(
    'rejects every earlier IEEE list enumeration alternative before [decimal1,decimal$last] ($valid)', async ({last, valid}) => {
      const {facet, component, raw, candidate, lexical} = await setup();
      const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
      const members = [named('FirstList'), named('DecimalList')], variety = {kind: 'union' as const, members};
      const inherited = component(facet('pattern', '0*1 0*[234]'));
      const kernel = candidate([
        raw('FirstList', named('DoubleList'), [whitespace, component(
          facet('enumeration', '1 2', named('DoubleList')), facet('enumeration', '1 3', named('DoubleList')),
        )], {kind: 'list', item: builtin('double')}),
        raw('Root', builtin('anySimpleType'), [], variety),
        raw('Base', named('Root'), [inherited], variety),
        raw('Child', named('Base'), [inherited, component(facet('enumeration', '1 ' + last, named('DecimalList')))], variety),
      ]);
      expect(kernel.assess(named('Base'), lexical('001 00' + last), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items:
        [{family: valid ? 'decimal' : 'double'}, {family: valid ? 'decimal' : 'double'}],
      }}});
      // The later list is selected only when the complete sequence fails
      // both earlier enum alternatives, rather than merely one of them.
      expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    });

  it.each([{firstMin: '0', valid: false}, {firstMin: '2', valid: true}])(
    'accounts for an earlier singleton IEEE item list before atomic double ($firstMin; $valid)', async ({firstMin, valid}) => {
      const {facet, component, raw, candidate, lexical} = await setup();
      const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
      const members = [named('FirstList'), builtin('double')], variety = {kind: 'union' as const, members};
      const kernel = candidate([
        raw('FirstItem', builtin('float'), [component(facet('minExclusive', firstMin))]),
        raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
        raw('Base', builtin('anySimpleType'), [], variety),
        raw('Child', named('Base'), [component(facet('enumeration', '1', builtin('double')))], variety),
      ]);
      expect(kernel.assess(named('Base'), lexical('1e0'), owner)).toMatchObject({kind: 'checked', value: {operand:
        valid ? {family: 'double', canonical: '1'} : {family: 'list', items: [{family: 'float', canonical: '1'}]},
      }});
      // An atomic numeric spelling becomes exactly one list token. The
      // complete double-1 rounding interval is inside float-1's interval.
      expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    });

  it.each([
    {value: ' 1 ', valid: false}, {value: '\t1\n', valid: false}, {value: '2', valid: true},
  ])('applies singleton list item predicates to collapsed tokens before later preserving string ($valid)', async ({value, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const members = [named('FirstList'), builtin('string')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('OnlyOne', builtin('string'), [component(facet('pattern', '1'))]),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('OnlyOne')}),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', value, builtin('string')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(value), owner)).toMatchObject({kind: 'checked', value: {operand:
      valid ? {family: 'string', canonical: '2'} : {family: 'list', items: [{family: 'string', canonical: '1'}]},
    }});
    // The list strips outer whitespace before its preserving item parser.
    // The later preserving string has only the original literal spelling.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {value: ' 1 ', valid: false}, {value: '\t1\n', valid: false}, {value: '2', valid: true}, {value: '3', valid: false}, {value: 'a', valid: true},
  ])('normalizes singleton tokens before ordered union item predicates ($valid)', async ({value, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const itemMembers = [named('OnlyOne'), named('PositiveFloat')];
    const members = [named('FirstList'), builtin('string')], variety = {kind: 'union' as const, members};
    const kernel = candidate([
      raw('OnlyOne', builtin('string'), [component(facet('pattern', '1'))]),
      raw('PositiveFloat', builtin('float'), [component(facet('minExclusive', '2'))]),
      raw('ItemUnion', builtin('anySimpleType'), [], {kind: 'union', members: itemMembers}),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('ItemUnion')}),
      raw('Base', builtin('anySimpleType'), [], variety),
      raw('Child', named('Base'), [component(facet('enumeration', value, builtin('string')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(value), owner)).toMatchObject({kind: 'checked', value: {operand:
      valid ? {family: 'string', canonical: value} : {family: 'list', items: [{family: value === '3' ? 'float' : 'string', canonical: value === '3' ? '3' : '1'}]},
    }});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {encoded: '1111', pattern: '1( *1){3}', witness: '1 1 1 1', valid: false},
    {encoded: '1e20', pattern: '1 *e *2 *0', witness: '1 e20', valid: true},
  ])('retains latent base64 token boundaries after an earlier positive IEEE list ($encoded; $valid)', async ({encoded, pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const members = [named('FirstList'), builtin('base64Binary')], variety = {kind: 'union' as const, members};
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('FirstItem', builtin('float'), [component(facet('minExclusive', '0'))]),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
      raw('Root', builtin('anySimpleType'), [], variety),
      raw('Base', named('Root'), [inherited], variety),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', encoded, builtin('base64Binary')))], variety),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand:
      valid ? {family: 'base64Binary'} : {family: 'list', items: [{family: 'float', canonical: '1'}, {family: 'float', canonical: '1'}, {family: 'float', canonical: '1'}, {family: 'float', canonical: '1'}]},
    }});
    // Splitting 1e20 creates a nonnumeric e20 token and an alias selecting
    // base64. Every partition of 1111 instead consists of positive integers.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {encoded: '1e11', pattern: '1e1 *1', witness: '1e1 1', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '1E11', pattern: '1E1 *1', witness: '1E1 1', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '1e001111', pattern: '1e0*1( *1)+', witness: '1e001 1 1 1', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '1e+00011', pattern: '1e[+]0*1 *1', witness: '1e+0001 1', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '1e+1', pattern: '1e[+]1', witness: '1e+1', bound: 'minExclusive', endpoint: '10', primitive: 'float', valid: true},
    {encoded: '+1e1', pattern: '[+]1e1', witness: '+1e1', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '0000', pattern: '0( *0){3}', witness: '0 0 0 0', bound: 'minInclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '0000', pattern: '0( *0){3}', witness: '0 0 0 0', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: true},
    {encoded: '0e999999', pattern: '0e9( *9){5}', witness: '0e999999', bound: 'minInclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '0e999999', pattern: '0e9( *9){5}', witness: '0e999999', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: true},
    {encoded: '1e999999', pattern: '1e9( *9){5}', witness: '1e999999', bound: 'minExclusive', endpoint: '0', primitive: 'float', valid: false},
    {encoded: '1e999999', pattern: '1e9( *9){5}', witness: '1e999999', bound: 'maxInclusive', endpoint: '3.4028234663852886e38', primitive: 'float', valid: true},
    {encoded: '1e999999', pattern: '1e9( *9){5}', witness: '1e999999', bound: 'minExclusive', endpoint: '0', primitive: 'double', valid: false},
    {encoded: '1e999999', pattern: '1e9( *9){5}', witness: '1e999999', bound: 'maxInclusive', endpoint: '1.7976931348623157e308', primitive: 'double', valid: true},
    {encoded: 'INF1', pattern: 'INF 1', witness: 'INF 1', bound: undefined, endpoint: undefined, primitive: 'float', valid: false},
    {encoded: 'INF1', pattern: 'INF 1', witness: 'INF 1', bound: 'maxInclusive', endpoint: '3.4028234663852886e38', primitive: 'float', valid: true},
    {encoded: 'NaN1', pattern: 'NaN 1', witness: 'NaN 1', bound: undefined, endpoint: undefined, primitive: 'float', valid: false},
    {encoded: 'NaN1', pattern: 'NaN 1', witness: 'NaN 1', bound: 'minInclusive', endpoint: '0', primitive: 'float', valid: true},
  ])('decides base64 aliases through earlier $primitive integer-exponent items ($encoded / $bound $endpoint; $valid)', async ({encoded, pattern, witness, bound, endpoint, primitive, valid}) => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const members = [named('FirstList'), builtin('base64Binary')], variety = {kind: 'union' as const, members};
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('FirstItem', builtin(primitive), bound ? [component(facet(bound, endpoint!))] : []),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
      raw('Root', builtin('anySimpleType'), [], variety),
      raw('Base', named('Root'), [inherited], variety),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', encoded, builtin('base64Binary')))], variety),
    ]);
    expect(actual.equivalent(builtin('base64Binary'), lexical(witness), builtin('base64Binary'), lexical(encoded), owner))
      .toMatchObject({kind: 'checked', value: true, obligations: []});
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: valid ? 'base64Binary' : 'list'}}});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {baseMin: '0', childMin: '2', pattern: '1+( 1+)*', witness: '1 1 1 1', valid: false},
    {baseMin: '2', childMin: '2.5', pattern: '[123]+( [123]+)*', witness: '1 1 1 1', valid: true},
    {baseMin: '0', childMin: '2', pattern: '1e1( *1)+', witness: '1e1 1', valid: false},
    {baseMin: '0', childMin: '2', pattern: '1 *e *1( *1)+', witness: '1 e1 1', valid: true},
  ])('compares unbounded base64 images across earlier IEEE list bounds $baseMin→$childMin ($valid)', async ({baseMin, childMin, pattern, witness, valid}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const inherited = component(facet('pattern', pattern));
    const baseMembers = [named('FirstList'), builtin('base64Binary')], childMembers = [named('NarrowList'), builtin('base64Binary')];
    const kernel = candidate([
      raw('FirstItem', builtin('float'), [component(facet('minExclusive', baseMin))]),
      raw('NarrowItem', named('FirstItem'), [component(facet('minExclusive', childMin))]),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
      raw('NarrowList', named('FirstList'), [whitespace], {kind: 'list', item: named('NarrowItem')}),
      raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Base', named('Root'), [inherited], {kind: 'union', members: baseMembers}),
      raw('ProbeRoot', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Probe', named('ProbeRoot'), [inherited], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [inherited], {kind: 'union', members: childMembers}),
    ]);
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'base64Binary'}}});
    // Ones-only tokens, including a glued first positive exponent token,
    // always select a positive float list in Base. A singleton 1 token
    // defeats the child's >2 list. Integer tokens have no rounded value
    // between 2 and 2.5, so those predicates coincide at every length.
    // Permitting a gap before e instead gives every compact encoded value
    // a Base spelling with a nonnumeric e-prefix token selecting base64.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('proves unbounded decimal list images remain contained when an earlier item bound narrows', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const baseMembers = [named('AboveFiveList'), named('DecimalList')];
    const childMembers = [named('AboveSevenList'), named('DecimalList')];
    const kernel = candidate([
      raw('AboveSeven', named('AboveFive'), [component(facet('minExclusive', '7'))]),
      raw('AboveSevenList', named('AboveFiveList'), [whitespace], {kind: 'list', item: named('AboveSeven')}),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    for (const name of ['Base', 'Probe']) expect(kernel.assess(named(name), lexical('6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'decimal', canonical: '6'}]}}});
    // Every valid decimal sequence is in the unchanged final DecimalList
    // member; the earlier member always produces the same typed items.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('preserves an unbounded decimal/string item-union sequence image after earlier decimal-list narrowing', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const baseMembers = [named('AboveFiveList'), named('NumericThenTextList')], childMembers = [named('AboveSevenList'), named('NumericThenTextList')];
    const kernel = candidate([
      raw('AboveSeven', named('AboveFive'), [component(facet('minExclusive', '7'))]),
      raw('AboveSevenList', named('AboveFiveList'), [whitespace], {kind: 'list', item: named('AboveSeven')}),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    for (const type of ['Base', 'Probe']) expect(kernel.assess(named(type), lexical('6 6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [
      {family: 'decimal', canonical: '6'}, {family: 'decimal', canonical: '6'},
    ]}}});
    // The unchanged decimal-first/string-second item union retains every
    // earlier decimal value, in every position and for every list length.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('matches a fixed hex list image to a general earlier lowercase canonical item image', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const item = {kind: 'union' as const, members: [builtin('hexBinary'), builtin('boolean')]};
    const list = {kind: 'list' as const, item: named('HexBoolean')};
    const baseMembers = [named('FirstList'), named('OnlyFFList')], childMembers = [named('NarrowList'), named('OnlyFFList')];
    const kernel = candidate([
      raw('HexBoolean', builtin('anySimpleType'), [], item),
      raw('FirstList', builtin('anySimpleType'), [whitespace], list),
      raw('NarrowList', named('FirstList'), [whitespace, component(facet('pattern', '0*'))], list),
      raw('OnlyFFList', named('HexList'), [whitespace, component(facet('enumeration', 'FF', named('HexList')))], {kind: 'list', item: builtin('hexBinary')}),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    for (const type of ['Base', 'Probe']) expect(kernel.assess(named(type), lexical('FF'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [
      {family: 'hexBinary', canonical: 'ff'},
    ]}}});
    // Base's first item union already emits the exact ff byte value.
    // Uppercase lexical FF and lowercase canonical ff have one typed image.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([{laterDouble: false, valid: true}, {laterDouble: true, valid: false}])(
    'compares unbounded ordered decimal/IEEE item-union list images (laterDouble=$laterDouble; $valid)', async ({laterDouble, valid}) => {
      const {facet, component, raw, candidate, lexical} = await setup();
      const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
      const item = {kind: 'union' as const, members: [builtin('decimal'), builtin('float')]};
      const list = {kind: 'list' as const, item: named('NumericItem')};
      const later = laterDouble ? named('DoubleList') : named('LaterList');
      const baseMembers = [named('FirstList'), later], childMembers = [named('NarrowList'), later];
      const kernel = candidate([
        raw('NumericItem', builtin('anySimpleType'), [], item),
        raw('FirstList', builtin('anySimpleType'), [whitespace], list),
        raw('LaterList', builtin('anySimpleType'), [whitespace], list),
        raw('NarrowList', named('FirstList'), [whitespace, component(facet('pattern', laterDouble ? 'a*' : '[6-9]+( [6-9]+)*'))], list),
        raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
        raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
        raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
      ]);
      expect(kernel.assess(named('Base'), lexical('1e0 6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [
        {family: 'float', canonical: '1'}, {family: 'decimal', canonical: '6'},
      ]}}});
      expect(kernel.assess(named('Probe'), lexical('1e0 6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items:
        valid ? [{family: 'float', canonical: '1'}, {family: 'decimal', canonical: '6'}] : [{family: 'double', canonical: '1'}, {family: 'double', canonical: '6'}],
      }}});
      // Equal ordered item unions preserve the entire mixed typed image.
      // A decimal/float item union accepts every double lexical token but
      // never produces a double item, so narrowing it can introduce a
      // later nonempty double sequence absent from every Base spelling.
      expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    });

  it.each(['float', 'double'])('preserves the whole $primitive union image when only an earlier same-family bound narrows', async primitive => {
    const {facet, component, raw, candidate, lexical} = await setup({defaultLimits: true});
    const baseMembers = [named('First'), builtin(primitive)], childMembers = [named('NarrowFirst'), builtin(primitive)];
    const kernel = candidate([
      raw('First', builtin(primitive), [component(facet('minExclusive', '0'))]),
      raw('NarrowFirst', named('First'), [component(facet('minExclusive', '2'))]),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    for (const type of ['Base', 'Probe']) expect(kernel.assess(named(type), lexical('1e0'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: primitive, canonical: '1'}}});
    // Every value, including zero, nonfinite values and both signs, has
    // a spelling admitted by the unchanged full last member. Earlier
    // members use the same primitive parser and preserve that exact value.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([
    {first: 'float', later: 'double', contained: false}, {first: 'double', later: 'float', contained: false},
    {first: 'float', later: 'double', contained: true}, {first: 'double', later: 'float', contained: true},
  ])('decides a mixed $first/$later atomic union after narrowing its earlier bound ($contained)', async ({first, later, contained}) => {
    const {facet, component, raw, candidate, lexical} = await setup({defaultLimits: true});
    const inherited = contained ? [component(facet('pattern', '[6-9]+'))] : [];
    const baseMembers = [named('First'), builtin(later)], childMembers = [named('NarrowFirst'), builtin(later)];
    const kernel = candidate([
      raw('First', builtin(first), [component(facet('minExclusive', '0'))]),
      raw('NarrowFirst', named('First'), [component(facet('minExclusive', '2'))]),
      raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Base', named('Root'), inherited, {kind: 'union', members: baseMembers}),
      raw('ProbeRoot', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Probe', named('ProbeRoot'), inherited, {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), inherited, {kind: 'union', members: childMembers}),
    ]);
    const witness = contained ? '6' : '1';
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: first}}});
    expect(kernel.assess(named('Probe'), lexical(witness), owner)).toMatchObject({kind: 'checked', value: {operand: {family: contained ? first : later}}});
    // Every alias rounding to later-family 1 is positive in the first
    // primitive and is therefore shadowed in Base. The retained positive
    // pattern forces every input above both bounds, including overflow,
    // so it preserves the entire first-selected image at every length.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([true, false])('distinguishes the explicit former 25m allowance from current defaults for URI/list containment (%s)', async contained => {
    const query = async (formerAllowance: boolean) => {
      const {facet, component, raw, candidate, request} = await setup(formerAllowance ? {maxWork: 25_000_000} : {defaultLimits: true});
      const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
      const inherited = component(facet('pattern', contained ? '[3-9]e\\-0*1( [3-9]e\\-0*1)*' : '1e\\-0*3( 1e\\-0*3)*'));
      const baseMembers = [named('FirstList'), builtin('anyURI')], childMembers = [named('NarrowList'), builtin('anyURI')];
      const kernel = candidate([
        raw('FirstItem', builtin('float'), [component(facet('minExclusive', '0'))]),
        raw('NarrowItem', named('FirstItem'), [component(facet('minExclusive', contained ? '0.2' : '2'))]),
        raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
        raw('NarrowList', named('FirstList'), [whitespace], {kind: 'list', item: named('NarrowItem')}),
        raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
        raw('Base', named('Root'), [inherited], {kind: 'union', members: baseMembers}),
        raw('Child', named('Base'), [inherited], {kind: 'union', members: childMembers}),
      ]);
      return {request, kernel, result: kernel.describe(named('Child'), owner)};
    };
    // 3e-1 through 9e-1 exceed both positive-case bounds, so every
    // admitted sequence preserves its float-list value. Every 1e-3
    // sequence instead changes from a float list to an anyURI value.
    const former = await query(true);
    expect(former.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(former.result).toBe(former.request.budget.failure());
    const before = {...former.request.budget.usage()};
    expect(before.work).toBeLessThanOrEqual(25_000_000);
    expect(former.kernel.describe(named('Child'), owner)).toBe(former.result);
    let invoked = false;
    expect(former.request.budget.guard(() => {invoked = true;})).toBe(former.result);
    expect(invoked).toBe(false);
    expect(former.request.budget.usage()).toEqual(before);
    const current = await query(false);
    expect(current.result).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    expect(current.request.budget.usage().work).toBeLessThanOrEqual(DEFAULT_MAX_WORK);
    expect(current.request.budget.usage().nodes).toBeLessThanOrEqual(DEFAULT_MAX_NODES);
  });

  it.each([{contained: true}, {contained: false}])('compares earlier IEEE list value images with later decimal sequences ($contained)', async ({contained}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const inherited = component(facet('pattern', contained ? '0*[6-9]( 0*[6-9])*' : '0*[1-9]( 0*[1-9])*'));
    const baseMembers = [named('FirstList'), named('DecimalList')], childMembers = [named('NarrowList'), named('DecimalList')];
    const kernel = candidate([
      raw('FirstItem', builtin('float'), [component(facet('minExclusive', '0'))]),
      raw('NarrowItem', named('FirstItem'), [component(facet('minExclusive', '2'))]),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
      raw('NarrowList', named('FirstList'), [whitespace], {kind: 'list', item: named('NarrowItem')}),
      raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Base', named('Root'), [inherited], {kind: 'union', members: baseMembers}),
      raw('ProbeRoot', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Probe', named('ProbeRoot'), [inherited], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [inherited], {kind: 'union', members: childMembers}),
    ]);
    const word = contained ? '006 007' : '001 002';
    expect(kernel.assess(named('Base'), lexical(word), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'float'}, {family: 'float'}]}}});
    expect(kernel.assess(named('Probe'), lexical(word), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [
      {family: contained ? 'float' : 'decimal'}, {family: contained ? 'float' : 'decimal'},
    ]}}});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'string', contained: false}, {primitive: 'anyURI', contained: false},
    {primitive: 'string', contained: true}, {primitive: 'anyURI', contained: true},
  ])('preserves canonical $primitive token boundaries after earlier IEEE lists with negative exponents ($contained)', async ({primitive, contained}) => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const pattern = contained ? '[3-9]e\\-0*1( [3-9]e\\-0*1)*' : '1e\\-0*3( 1e\\-0*3)*';
    const inherited = component(facet('pattern', pattern));
    const baseMembers = [named('FirstList'), builtin(primitive)], childMembers = [named('NarrowList'), builtin(primitive)];
    const kernel = candidate([
      raw('FirstItem', builtin('float'), [component(facet('minExclusive', '0'))]),
      raw('NarrowItem', named('FirstItem'), [component(facet('minExclusive', contained ? '0.2' : '2'))]),
      raw('FirstList', builtin('anySimpleType'), [whitespace], {kind: 'list', item: named('FirstItem')}),
      raw('NarrowList', named('FirstList'), [whitespace], {kind: 'list', item: named('NarrowItem')}),
      raw('Root', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Base', named('Root'), [inherited], {kind: 'union', members: baseMembers}),
      raw('ProbeRoot', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Probe', named('ProbeRoot'), [inherited], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [inherited], {kind: 'union', members: childMembers}),
    ]);
    const word = contained ? '3e-001 9e-01' : '1e-003 1e-03';
    expect(kernel.assess(named('Base'), lexical(word), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list'}}});
    expect(kernel.assess(named('Probe'), lexical(word), owner)).toMatchObject({kind: 'checked', value: {operand: {family: contained ? 'list' : primitive}}});
    // Each positive-case token rounds between 0.3 and 0.9 and therefore
    // exceeds both lower bounds. In the widening cases, every token is
    // positive but below 2: Base always selects a float list, whereas Child
    // introduces preserving string or collapsed URI values at every length.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(contained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('rejects newly selected decimal list items after narrowing an earlier universal string list', async () => {
    const {facet, component, raw, candidate, lexical} = await setup();
    const whitespace = component(facet('whiteSpace', 'collapse', undefined, true));
    const baseMembers = [named('StringList'), named('DecimalList')];
    const childMembers = [named('OnlyAList'), named('DecimalList')];
    const kernel = candidate([
      raw('OnlyA', builtin('string'), [component(facet('pattern', 'a'))]),
      raw('OnlyAList', named('StringList'), [whitespace], {kind: 'list', item: named('OnlyA')}),
      raw('Base', builtin('anySimpleType'), [], {kind: 'union', members: baseMembers}),
      raw('Probe', builtin('anySimpleType'), [], {kind: 'union', members: childMembers}),
      raw('Child', named('Base'), [], {kind: 'union', members: childMembers}),
    ]);
    expect(kernel.assess(named('Base'), lexical('6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'string', canonical: '6'}]}}});
    expect(kernel.assess(named('Probe'), lexical('6'), owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'list', items: [{family: 'decimal', canonical: '6'}]}}});
    // Original Base always selects string items, so no original spelling
    // denotes the fresh singleton [decimal 6] value introduced by Child.
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    {primitive: 'dateTime', pattern: '2000-01-01T00:00:00.0+Z', value: '2000-01-01T00:00:00Z', witness: '2000-01-01T00:00:00.0Z', valid: true},
    {primitive: 'dateTime', pattern: '2000-01-01T00:00:00.0+Z', value: '2000-01-01T00:00:01Z', witness: '2000-01-01T00:00:00.0Z', valid: false},
    {primitive: 'dateTime', pattern: '2001-12-31T23:59:60[.]250+Z', value: '2002-01-01T00:00:00.25Z', witness: '2001-12-31T23:59:60.250Z', valid: true},
    {primitive: 'dateTime', pattern: '2001-12-31T23:59:60[.]250+Z', value: '2002-01-01T00:00:00.26Z', witness: '2001-12-31T23:59:60.250Z', valid: false},
    {primitive: 'dateTime', pattern: '2000-02-29T24:00:00([.]0+)?Z', value: '2000-03-01T00:00:00Z', witness: '2000-02-29T24:00:00.00Z', valid: true},
    {primitive: 'dateTime', pattern: '2000-02-29T24:00:00([.]0+)?', value: '2000-03-01T00:00:00', witness: '2000-02-29T24:00:00.00', valid: true},
    {primitive: 'dateTime', pattern: '2000-02-29T24:00:00([.]0+)?', value: '2000-03-01T00:00:00Z', witness: '2000-02-29T24:00:00.00', valid: false},
    {primitive: 'date', pattern: '0001-01-01[+]14:00', value: '-0001-12-31-10:00', witness: '0001-01-01+14:00', valid: true},
    {primitive: 'date', pattern: '0001-01-01[+]14:00', value: '-0001-12-30-10:00', witness: '0001-01-01+14:00', valid: false},
    {primitive: 'time', pattern: '01:00:00[+]14:00', value: '11:00:00Z', witness: '01:00:00+14:00', valid: true},
    {primitive: 'time', pattern: '01:00:00[+]14:00', value: '01:00:00Z', witness: '01:00:00+14:00', valid: false},
    {primitive: 'time', pattern: '23:59:60[.]250+Z', value: '00:00:00.25Z', witness: '23:59:60.250Z', valid: true},
    {primitive: 'time', pattern: '24:00:00([.]0+)?Z', value: '00:00:00Z', witness: '24:00:00.00Z', valid: true},
    {primitive: 'gYear', pattern: '\\-0001[+]00:00', value: '-0001Z', witness: '-0001+00:00', valid: true},
    {primitive: 'gYear', pattern: '\\-0001[+]00:00', value: '-0002Z', witness: '-0001+00:00', valid: false},
    {primitive: 'gYearMonth', pattern: '2000-02[+]00:00', value: '2000-02Z', witness: '2000-02+00:00', valid: true},
    {primitive: 'gYearMonth', pattern: '2000-02[+]00:00', value: '2000-03Z', witness: '2000-02+00:00', valid: false},
    {primitive: 'gMonthDay', pattern: '--02-29[+]00:00', value: '--02-29Z', witness: '--02-29+00:00', valid: true},
    {primitive: 'gMonthDay', pattern: '--02-29[+]00:00', value: '--03-01Z', witness: '--02-29+00:00', valid: false},
    {primitive: 'gDay', pattern: '---31[+]00:00', value: '---31Z', witness: '---31+00:00', valid: true},
    {primitive: 'gDay', pattern: '---31[+]00:00', value: '---30Z', witness: '---31+00:00', valid: false},
    {primitive: 'gMonth', pattern: '--02[+]00:00', value: '--02Z', witness: '--02+00:00', valid: true},
    {primitive: 'gMonth', pattern: '--02[+]00:00', value: '--03Z', witness: '--02+00:00', valid: false},
  ])('decides complete $primitive calendar aliases for $pattern ($valid)', async ({primitive, pattern, value, witness, valid}) => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin(primitive), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, builtin(primitive)))]),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(actual.equivalent(builtin(primitive), lexical(witness), builtin(primitive), lexical(value), owner)).toMatchObject({kind: 'checked', value: valid, obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {pattern: 'P0+Y0*12M', value: 'P1Y', witness: 'P000Y0012M', valid: true},
    {pattern: 'P0+Y0*12M', value: 'P1YT1S', witness: 'P000Y0012M', valid: false},
    {pattern: 'PT0*24H', value: 'P1D', witness: 'PT0024H', valid: true},
    {pattern: 'PT0*24H', value: 'P2D', witness: 'PT0024H', valid: false},
    {pattern: 'PT0*60M', value: 'PT1H', witness: 'PT0060M', valid: true},
    {pattern: 'PT0*1440M', value: 'P1D', witness: 'PT001440M', valid: true},
    {pattern: 'PT0*86400S', value: 'P1D', witness: 'PT0086400S', valid: true},
    {pattern: '\\-P0*12M', value: '-P1Y', witness: '-P0012M', valid: true},
    {pattern: '\\-P0*12M', value: 'P1Y', witness: '-P0012M', valid: false},
    {pattern: 'PT0+[.]50+S', value: 'PT0.5S', witness: 'PT000.500S', valid: true},
    {pattern: 'PT0+[.]50+S', value: 'PT0.6S', witness: 'PT000.500S', valid: false},
    {pattern: 'P0+Y', value: 'PT0S', witness: 'P000Y', valid: true},
    {pattern: '\\-P0+DT0+H0+M0+[.]0+S', value: 'PT0S', witness: '-P000DT0H0M0.000S', valid: true},
    {pattern: 'P1DT0H0M0.0+S', value: 'P1D', witness: 'P1DT0H0M0.0S', valid: true},
    {pattern: 'P1DT0H0M0.0+S', value: 'P2D', witness: 'P1DT0H0M0.0S', valid: false},
  ])('decides the complete duration decomposition language $pattern ($valid)', async ({pattern, value, witness, valid}) => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin('duration'), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, builtin('duration')))]),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(actual.equivalent(builtin('duration'), lexical(witness), builtin('duration'), lexical(value), owner)).toMatchObject({kind: 'checked', value: valid, obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {pattern: 'P', value: 'PT0S'}, {pattern: 'P1DT', value: 'P1D'},
  ])('rejects invalid empty duration fields in complete $pattern membership', async ({pattern, value}) => {
    const {facet, component, raw, candidate} = await setup();
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin('duration'), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, builtin('duration')))]),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  const binaryFraction = (coefficient: bigint, scale: number): string => {
    const digits = coefficient.toString().padStart(scale + 1, '0');
    return digits.slice(0, -scale) + '.' + digits.slice(-scale);
  };
  const zeroTie = binaryFraction(5n ** 150n, 150);
  const aboveZeroTie = binaryFraction(5n ** 150n + 1n, 150);
  const overflow = ((2n ** 25n - 1n) * 2n ** 103n).toString();
  const exactPattern = (value: string) => value.replace(/\./g, '[.]') + '0*';
  it.each([
    {primitive: 'double', pattern: '0*.0*e0+', value: '1', witness: '1e0', valid: true},
    {primitive: 'double', pattern: '0*.0*e0+', value: '-1', witness: '1e0', valid: false},
    {primitive: 'double', pattern: '1(00)+e\\-[2468]', value: '1', witness: '100e-2', valid: true},
    {primitive: 'double', pattern: '1(00)+e\\-[13579]', value: '1', witness: '100e-1', valid: false},
    {primitive: 'double', pattern: '0[.](00)+1e[13579]', value: '1', witness: '0.001e3', valid: true},
    {primitive: 'double', pattern: '0[.](00)+1e[2468]', value: '1', witness: '0.001e2', valid: false},
    {primitive: 'float', pattern: '0[.]0*1', value: '1e-45', witness: '0.' + '0'.repeat(44) + '1', valid: true},
    {primitive: 'float', pattern: '0[.]0*1', value: '0', witness: '0.' + '0'.repeat(46) + '1', valid: true},
    {primitive: 'float', pattern: '1(00)+', value: 'INF', witness: '1' + '0'.repeat(40), valid: true},
    {primitive: 'float', pattern: exactPattern(zeroTie), value: '0', witness: zeroTie, valid: true},
    {primitive: 'float', pattern: exactPattern(aboveZeroTie), value: '0', witness: aboveZeroTie, valid: false},
    {primitive: 'float', pattern: '1[.]0000000596046447753906250*', value: '1', witness: '1.000000059604644775390625', valid: true},
    {primitive: 'float', pattern: '1[.]0000000596046447753906250*', value: '1.00000011920928955078125', witness: '1.000000059604644775390625', valid: false},
    {primitive: 'float', pattern: '1[.]0000001788139343261718750*', value: '1.0000002384185791015625', witness: '1.000000178813934326171875', valid: true},
    {primitive: 'double', pattern: '1[.]000000000000000111022302462515654042363166809082031250*', value: '1', witness: '1.00000000000000011102230246251565404236316680908203125', valid: true},
    {primitive: 'double', pattern: '1[.]000000000000000111022302462515654042363166809082031250*', value: '1.0000000000000002', witness: '1.00000000000000011102230246251565404236316680908203125', valid: false},
    {primitive: 'float', pattern: '0*' + overflow + '([.]0+)?', value: 'INF', witness: overflow, valid: true},
    {primitive: 'float', pattern: '0*' + overflow + '([.]0+)?', value: '3.4028234663852886e38', witness: overflow, valid: false},
    {primitive: 'float', pattern: '\\-0*' + overflow + '([.]0+)?', value: '-INF', witness: '-' + overflow, valid: true},
    {primitive: 'float', pattern: 'N[a]N', value: 'NaN', witness: 'NaN', valid: true},
    {primitive: 'float', pattern: 'INF|0*.0*e0+', value: 'NaN', witness: 'INF', valid: false},
    {primitive: 'double', pattern: '0[.]0{307}222507385850720140*', value: '2.2250738585072014e-308', witness: '0.' + '0'.repeat(307) + '22250738585072014', valid: true},
  ])('decides complete $primitive IEEE aliases for $pattern ($valid)', async ({primitive, pattern, value, witness, valid}) => {
    const {facet, component, raw, candidate, lexical, actual} = await setup();
    const inherited = component(facet('pattern', pattern));
    const kernel = candidate([
      raw('Base', builtin(primitive), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', value, builtin(primitive)))]),
    ]);
    expect(kernel.assess(named('Base'), lexical(witness), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(actual.equivalent(builtin(primitive), lexical(witness), builtin(primitive), lexical(value), owner)).toMatchObject({kind: 'checked', value: valid, obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('precharges a periodic IEEE witness whose short exponent requires an enormous mantissa', async () => {
    const {facet, component, raw, candidate, request} = await setup();
    const inherited = component(facet('pattern', '1(00)+e\\-1000000000000000000000000000000'));
    const kernel = candidate([
      raw('Base', builtin('double'), [inherited]),
      raw('Child', named('Base'), [inherited, component(facet('enumeration', '1', builtin('double')))]),
    ]);
    const result = kernel.describe(named('Child'), owner);
    expect(result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(result).toBe(request.budget.failure());
    expect(kernel.describe(named('Base'), owner)).toBe(result);
  });

});
