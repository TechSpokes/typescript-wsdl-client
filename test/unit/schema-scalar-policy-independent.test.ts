import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawScalarFacetComponent, RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';

// Independent expectations from the selected P1 / evidence-qualified F2 contract:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/232#issuecomment-6141810918
// https://github.com/TechSpokes/typescript-wsdl-client/issues/266#issuecomment-6114665601
// https://github.com/TechSpokes/typescript-wsdl-client/issues/266#issuecomment-6119485803
// Pattern character equality, accepted values and legal restriction are distinct.
// The exact tuple tests do not reinterpret the existing facetLayers normal form.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalar-policy';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
type Definition = RawSimpleTypeProperties & Readonly<{base: Reference}>;
type ExactDefinition = Definition & Readonly<{facetComponentSet: readonly RawScalarFacetComponent[]; facetLayers?: never; facetBinding?: never}>;

async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-policy-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source request');
  const request = prepared.request, found = request.actual.lookup(id('Template'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected source template');
  const seed = found.node;
  const lexical = (value: string): LexicalValue => ({value, context: seed.context});
  const facet = (name: string, value: string, fixed = false): ScalarFacet => ({name, fixed, lexical: lexical(value)});
  const component = (...facets: readonly ScalarFacet[]): RawScalarFacetComponent => ({facets, annotation: 'absent'});
  const names = new Map<string, string>();
  const raw = (local: string, base: Reference, facetComponentSet: readonly RawScalarFacetComponent[]): ExactDefinition => {
    names.set(id(local), local);
    return {type: id(local), base, final: [], variety: {kind: 'atomic'}, facetComponentSet,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
  };
  const candidate = (definitions: readonly Definition[]) => {
    const additions: SimpleTypeNode[] = definitions.filter(definition => !request.actual.members.includes(definition.type)).map(definition => ({
      ...seed, id: definition.type, identity: {kind: 'global', role: 'type', name: {namespace, local: names.get(definition.type)!}},
      variety: {kind: 'restriction', base: definition.base, facets: []},
    }));
    const result = request.candidate({key: 'independent-scalar-policy', active: [...request.actual.members, ...additions.map(node => node.id)],
      additions, rawSimpleTypes: definitions});
    if (result.kind !== 'prepared') throw new Error(`Expected structural candidate: ${JSON.stringify(result)}`);
    return createSchemaScalarKernel(result.context);
  };
  return {request, lexical, facet, component, raw, candidate, actual: createSchemaScalarKernel(request.actual)};
}

describe('independent P1 exact pattern construction', () => {
  it.each([
    ['AB', 'ABCopy', true], ['AB', 'SingletonAB', true], ['AB', 'BA', false], ['AB', 'AC', false],
    ['Duplicate', 'SingletonDuplicate', true], ['Duplicate', 'AB', false],
    ['Alternating', 'SingletonAlternating', true], ['Nested', 'SingletonNested', true],
    ['AB', 'ClassAB', false], ['InheritedAB', 'SingletonAB', true], ['IntersectionA', 'OnlyA', false],
  ] as const)('compares source %s with %s by exact expression properties (%s)', async (left, right, equal) => {
    const {actual} = await setup();
    expect(actual.facetPropertiesEquivalent(named(left), named(right), owner)).toMatchObject({kind: 'checked', value: equal, obligations: []});
  });

  it.each([
    {operands: ['a', 'b'], expression: 'a|b', different: '(a)|(b)'},
    {operands: ['b', 'a'], expression: 'b|a', different: 'a|b'},
    {operands: ['a', 'b', 'a'], expression: 'a|b|a', different: 'a|b'},
    {operands: ['a|b', '(c|d)e'], expression: 'a|b|(c|d)e', different: '(a|b)|((c|d)e)'},
    {operands: ['(a|(b|c)d)', '((e|f)g)'], expression: '(a|(b|c)d)|((e|f)g)', different: '((a|(b|c)d))|(((e|f)g))'},
    {operands: ['(a|b)'], expression: '(a|b)', different: 'a|b'},
  ])('preserves supplied operand order and spelling: $operands', async ({operands, expression, different}) => {
    const {facet, component, raw, candidate} = await setup();
    const patterns = (values: readonly string[]) => component(...values.map(value => facet('pattern', value)));
    const kernel = candidate([
      raw('Raw', builtin('string'), [patterns(operands)]),
      raw('Exact', builtin('string'), [patterns([expression])]),
      raw('Different', builtin('string'), [patterns([different])]),
    ]);
    expect(kernel.facetPropertiesEquivalent(named('Raw'), named('Exact'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('Raw'), named('Different'), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
  });

  it('keeps equal accepted languages from equating reordered or redundant expression properties', async () => {
    const {actual, lexical} = await setup();
    for (const name of ['AB', 'BA', 'Duplicate', 'SingletonAB', 'ClassAB']) {
      for (const accepted of ['a', 'b']) expect(actual.assess(named(name), lexical(accepted), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(actual.assess(named(name), lexical('c'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
    for (const different of ['BA', 'Duplicate', 'ClassAB'])
      expect(actual.facetPropertiesEquivalent(named('AB'), named(different), owner)).toMatchObject({kind: 'checked', value: false});
    // A changed branch also changes the language, unlike ordering or duplicates.
    expect(actual.assess(named('AC'), lexical('b'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(actual.assess(named('AC'), lexical('c'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([false, true])('requires the exact inherited component even when the new language is the same (retained=%s)', async retained => {
    const {lexical, facet, component, raw, candidate, actual} = await setup();
    // Both source types accept only "a", but their facet sets differ.
    for (const name of ['IntersectionA', 'OnlyA']) {
      expect(actual.assess(named(name), lexical('a'), owner)).toMatchObject({kind: 'checked'});
      expect(actual.assess(named(name), lexical('b'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
    const components = [component(facet('pattern', 'a'))];
    if (retained) components.unshift(component(facet('pattern', 'a'), facet('pattern', 'b')));
    const kernel = candidate([raw('Child', named('AB'), components)]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject(retained ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    if (retained) expect(kernel.facetPropertiesEquivalent(named('Child'), named('IntersectionA'), owner))
      .toMatchObject({kind: 'checked', value: true, obligations: []});
  });
});

describe('independent F2 exact scalar restriction duties', () => {
  it.each([
    {retained: ['3', '5'], valid: true}, {retained: ['5'], valid: true}, {retained: ['3'], valid: false},
  ])('restricts exact minLength {3,5} with $retained without widening ($valid)', async ({retained, valid}) => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const minima = (values: readonly string[]) => values.map(value => component(facet('minLength', value)));
    const kernel = candidate([
      raw('Base', builtin('string'), minima(['3', '5'])),
      raw('Child', named('Base'), minima(retained)),
      raw('ThreeOnly', builtin('string'), minima(['3'])),
    ]);
    expect.soft(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect.soft(kernel.assess(named('Base'), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect.soft(kernel.assess(named('Base'), lexical('abcde'), owner)).toMatchObject({kind: 'checked', obligations: []});
    // Independent widening witness: a compatible BF3 alone does not imply containment.
    expect(kernel.assess(named('ThreeOnly'), lexical('abc'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
    if (valid) {
      expect(kernel.assess(named('Child'), lexical('abcd'), owner)).toMatchObject({kind: 'invalid-schema'});
      expect(kernel.assess(named('Child'), lexical('abcde'), owner)).toMatchObject({kind: 'checked', obligations: []});
    }
  });

  it('keeps exact repeated tuples distinct from the existing comparable facetLayers normal form', async () => {
    const {facet, component, raw, candidate} = await setup();
    const minima = ['3', '5'].map(value => facet('minLength', value));
    const {facetComponentSet: _exact, ...properties} = raw('Normalized', builtin('string'), []);
    const kernel = candidate([
      raw('Exact', builtin('string'), minima.map(value => component(value))),
      raw('FiveOnly', builtin('string'), [component(facet('minLength', '5'))]),
      {...properties, facetLayers: minima.map(value => ({facets: [value]}))},
    ]);
    expect(kernel.facetPropertiesEquivalent(named('Exact'), named('FiveOnly'), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('Normalized'), named('FiveOnly'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
  });

  it('uses a retained finite enumeration to prove containment despite a weaker numeric bound', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const enumeration = component(facet('enumeration', 'abcdef'));
    const kernel = candidate([
      raw('Base', builtin('string'), [component(facet('minLength', '3')), component(facet('minLength', '5')), enumeration]),
      raw('Child', named('Base'), [component(facet('minLength', '3')), enumeration]),
    ]);
    // Both sets contain exactly "abcdef". Failure of 3 >= 5 is not a
    // counterexample to value containment when the complete enum is retained.
    for (const name of ['Base', 'Child']) {
      expect(kernel.describe(named(name), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(name), lexical('abcdef'), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(name), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('uses an exact retained literal pattern to prove containment despite a weaker numeric bound', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const pattern = component(facet('pattern', 'abcdef'));
    const kernel = candidate([
      raw('Base', builtin('string'), [component(facet('minLength', '3')), component(facet('minLength', '5')), pattern]),
      raw('Child', named('Base'), [component(facet('minLength', '3')), pattern]),
    ]);
    // The retained expression accepts exactly "abcdef". Its complete finite
    // language proves containment; the numeric comparison 3 >= 5 does not.
    for (const name of ['Base', 'Child']) {
      expect(kernel.describe(named(name), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(name), lexical('abcdef'), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(name), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('rejects a retained enumeration when the weaker minimum newly admits one of its values', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const enumeration = component(facet('enumeration', 'abc'), facet('enumeration', 'abcdef'));
    const childFacets = [component(facet('minLength', '3')), enumeration];
    const kernel = candidate([
      raw('Base', builtin('string'), [...childFacets, component(facet('minLength', '5'))]),
      raw('Child', named('Base'), childFacets), raw('PeerValues', builtin('string'), childFacets),
    ]);
    // An enumeration is conjoined with the other facets. Base excludes "abc"
    // despite retaining it in that component; the complete child set admits it.
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical('abcdef'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('PeerValues'), lexical('abc'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('rejects the dual maxLength widening even though the weaker bound has a compatible base match', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const maxima = ['3', '5'].map(value => component(facet('maxLength', value)));
    const kernel = candidate([
      raw('Base', builtin('string'), maxima), raw('Child', named('Base'), [maxima[1]]),
      raw('PeerValues', builtin('string'), [maxima[1]]),
    ]);
    // Child's maximum 5 matches BF5, but "abcde" violates the retained BF3.
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical('abc'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical('abcde'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('PeerValues'), lexical('abcde'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('uses a concrete short value to reject widening under an infinite retained pattern', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const pattern = component(facet('pattern', 'a+'));
    const childFacets = [component(facet('minLength', '3')), pattern];
    const kernel = candidate([
      raw('Base', builtin('string'), [...childFacets, component(facet('minLength', '5'))]),
      raw('Child', named('Base'), childFacets), raw('PeerValues', builtin('string'), childFacets),
    ]);
    // "aaa" is a positive widening witness, not a claim that the infinite
    // regex language has been enumerated. A producer miss is an evidence gap.
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical('aaaaa'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('Base'), lexical('aaa'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('PeerValues'), lexical('aaa'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Child'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('keeps missing infinite-pattern containment evidence qualified instead of inventing invalidity', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const pattern = component(facet('pattern', '[a-z]{5,}'));
    const childFacets = [component(facet('minLength', '3')), pattern];
    const kernel = candidate([
      raw('Base', builtin('string'), [...childFacets, component(facet('minLength', '5'))]),
      raw('Child', named('Base'), childFacets), raw('PeerValues', builtin('string'), childFacets),
    ]);
    // Mathematically this restriction is valid: every pattern match has at
    // least five characters. The current qualified contract may lack an exact
    // infinite-language containment authority. Absence of a short witness
    // proves neither containment nor widening; unresolved evidence stays named.
    for (const name of ['Base', 'PeerValues']) {
      expect(kernel.assess(named(name), lexical('abcde'), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(name), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
    const result = kernel.describe(named('Child'), owner);
    expect(['checked', 'unresolved']).toContain(result.kind);
    if (result.kind === 'checked' && result.obligations.length)
      expect(result.obligations).toEqual([expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'})]);
  });

  it('retains both fixed metadata tuples and permits a same-value replacement with its own false marker', async () => {
    const {facet, component, raw, candidate} = await setup();
    const both = [component(facet('minLength', '3', true)), component(facet('minLength', '3', false))];
    const kernel = candidate([
      raw('Both', builtin('string'), both), raw('Reversed', builtin('string'), [...both].reverse()),
      raw('TrueOnly', builtin('string'), [both[0]]), raw('FalseOnly', builtin('string'), [both[1]]),
      raw('ChildBoth', named('Both'), both), raw('ChildFalse', named('Both'), [both[1]]),
    ]);
    for (const name of ['Both', 'ChildBoth', 'ChildFalse'])
      expect(kernel.describe(named(name), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('Both'), named('Reversed'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
    for (const singleton of ['TrueOnly', 'FalseOnly'])
      expect(kernel.facetPropertiesEquivalent(named('Both'), named(singleton), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('ChildFalse'), named('FalseOnly'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
  });

  it.each([false, true])('enforces every fixed base value despite another compatible match (fixed5=%s)', async fixed5 => {
    const {facet, component, raw, candidate} = await setup();
    const both = [component(facet('minLength', '3', true)), component(facet('minLength', '5', fixed5))];
    const kernel = candidate([
      raw('Base', builtin('string'), both), raw('ChildFive', named('Base'), [both[1]]), raw('ChildBoth', named('Base'), both),
    ]);
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    // This is a new restriction, distinct from comparing Base with itself.
    for (const child of ['ChildFive', 'ChildBoth']) expect(kernel.describe(named(child), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    {kind: 'maxLength', value: '4', valid: false}, {kind: 'maxLength', value: '6', valid: true},
    {kind: 'length', value: '4', valid: false}, {kind: 'length', value: '5', valid: true},
  ])('checks every retained minimum against $kind=$value ($valid)', async ({kind, value, valid}) => {
    const {facet, component, raw, candidate} = await setup();
    const minima = ['3', '5'].map(minimum => component(facet('minLength', minimum)));
    const kernel = candidate([
      raw('Base', builtin('string'), minima), raw('Child', named('Base'), [...minima, component(facet(kind, value))]),
    ]);
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it.each([
    {lower: ['0', '10'], upper: '20', valid: true},
    {lower: ['0', '10'], upper: '5', valid: false},
    {lower: ['5', '10'], upper: '20', valid: false},
  ])('checks cross-kind bounds and newly contributed operand membership: $lower / $upper ($valid)', async ({lower, upper, valid}) => {
    const {facet, component, raw, candidate} = await setup();
    const minima = (values: readonly string[]) => values.map(value => component(facet('minInclusive', value)));
    const kernel = candidate([
      raw('Base', builtin('decimal'), minima(['0', '10'])),
      raw('Child', named('Base'), [...minima(lower), component(facet('maxInclusive', upper))]),
    ]);
    // Inherited 0 may be retained without replaying it as a local operand.
    // Newly contributed 5 must belong to Base, whose values are at least 10.
    expect(kernel.describe(named('Child'), owner)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema'});
  });

  it('retains incomparable calendar bounds and rejects either endpoint-widening restriction', async () => {
    const {lexical, facet, component, raw, candidate, actual} = await setup();
    const local = '2001-01-01T00:00:00', zoned = `${local}Z`;
    expect(actual.compare(builtin('dateTime'), lexical(local), builtin('dateTime'), lexical(zoned), owner))
      .toMatchObject({kind: 'checked', value: 'indeterminate'});
    const both = [local, zoned].map(value => component(facet('minInclusive', value)));
    const kernel = candidate([
      raw('Base', builtin('dateTime'), both), raw('Retained', named('Base'), [...both].reverse()),
      raw('LocalOnly', builtin('dateTime'), [both[0]]), raw('ZonedOnly', builtin('dateTime'), [both[1]]),
      raw('DropsZoned', named('Base'), [both[0]]), raw('DropsLocal', named('Base'), [both[1]]),
    ]);
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('Retained'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('Base'), named('Retained'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
    for (const [single, endpoint, dropped] of [['LocalOnly', local, 'DropsZoned'], ['ZonedOnly', zoned, 'DropsLocal']]) {
      expect(kernel.assess(named(single), lexical(endpoint), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named('Base'), lexical(endpoint), owner)).toMatchObject({kind: 'invalid-schema'});
      expect(kernel.facetPropertiesEquivalent(named('Base'), named(single), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
      expect(kernel.describe(named(dropped), owner)).toMatchObject({kind: 'invalid-schema'});
    }
    expect(kernel.assess(named('Retained'), lexical('2001-01-03T00:00:00Z'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('assesses exact typed operands in their original context after the active datatype changes', async () => {
    const {lexical, facet, component, raw, candidate, actual} = await setup();
    const typed = (context: 'original' | 'active'): ScalarFacet => ({...facet('minInclusive', '1'),
      operand: {type: named('OriginalNumber'), owner: id('OriginalNumber'), context}});
    const minima = (first: ScalarFacet) => [component(first), component(facet('minInclusive', '0'))];
    const kernel = candidate([
      raw('OriginalNumber', builtin('decimal'), [component(facet('minInclusive', '2')), component(facet('maxInclusive', '2'))]),
      raw('OriginalTyped', builtin('decimal'), minima(typed('original'))),
      raw('ActiveTyped', builtin('decimal'), minima(typed('active'))),
      raw('UntypedPeer', builtin('decimal'), minima(facet('minInclusive', '1'))),
    ]);
    expect(actual.assess(named('OriginalNumber'), lexical('1'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('OriginalNumber'), lexical('1'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.describe(named('OriginalTyped'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('OriginalTyped'), named('UntypedPeer'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
    expect(kernel.describe(named('ActiveTyped'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('continues to reject duplicate scalar facets in an XML restriction', async () => {
    const {actual} = await setup();
    expect(actual.describe(named('DuplicateScalarSource'), owner)).toMatchObject({kind: 'invalid-schema', rule: 'src-single-facet-value'});
  });
});
