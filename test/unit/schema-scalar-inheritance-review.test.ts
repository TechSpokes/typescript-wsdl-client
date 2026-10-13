import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawScalarFacetComponent, RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';

// Independently reproduced by the production nonauthor reviewer for #232.
// Source construction, effective DF validity, and the local S contribution
// remain separate duties under the selected F2 interpretation.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalar-inheritance-review';
const id = (local: string): string => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
type Definition = RawSimpleTypeProperties & Readonly<{base: Reference}>;

async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-inheritance-review.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source request');
  const request = prepared.request, found = request.actual.lookup(id('Template'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected template');
  const seed = found.node;
  const lexical = (value: string): LexicalValue => ({value, context: seed.context});
  const facet = (name: string, value: string, fixed = false): ScalarFacet => ({name, fixed, lexical: lexical(value)});
  const component = (...facets: readonly ScalarFacet[]): RawScalarFacetComponent => ({facets, annotation: 'absent'});
  const names = new Map<string, string>();
  const raw = (local: string, base: Reference, facetComponentSet: readonly RawScalarFacetComponent[]): Definition => {
    names.set(id(local), local);
    return {type: id(local), base, final: [], variety: {kind: 'atomic'}, facetComponentSet,
      provenance: {kind: 'hypothetical-abstract', originals: []}};
  };
  const candidate = (definitions: readonly Definition[]) => {
    const additions: SimpleTypeNode[] = definitions.filter(definition => !request.actual.members.includes(definition.type)).map(definition => ({
      ...seed, id: definition.type, identity: {kind: 'global', role: 'type', name: {namespace, local: names.get(definition.type)!}},
      variety: {kind: 'restriction', base: definition.base, facets: []},
    }));
    const result = request.candidate({key: 'independent-scalar-inheritance-review', active: [...request.actual.members, ...additions.map(node => node.id)],
      additions, rawSimpleTypes: definitions});
    if (result.kind !== 'prepared') throw new Error(`Expected structural candidate: ${JSON.stringify(result)}`);
    return createSchemaScalarKernel(result.context);
  };
  return {lexical, facet, component, raw, candidate};
}

describe('independent exact scalar integration review', () => {
  it('preserves all incomparable calendar constraints through an empty source restriction', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const endpoints = ['2001-01-01T00:00:00', '2001-01-01T00:00:00Z'];
    const kernel = candidate([raw('SourceBase', builtin('dateTime'), endpoints.map(value => component(facet('minInclusive', value))))]);
    for (const type of ['SourceBase', 'SourceChild']) {
      expect(kernel.describe(named(type), owner)).toMatchObject({kind: 'checked', obligations: []});
      for (const endpoint of endpoints)
        expect(kernel.assess(named(type), lexical(endpoint), owner)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-minInclusive-valid'});
      expect(kernel.assess(named(type), lexical('2001-01-03T00:00:00Z'), owner)).toMatchObject({kind: 'checked', obligations: []});
    }
    expect(kernel.facetPropertiesEquivalent(named('SourceBase'), named('SourceChild'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
  });

  it('preserves both fixed metadata tuples and replaces the whole kind when explicitly specified', async () => {
    const {facet, component, raw, candidate} = await setup();
    const both = [component(facet('minLength', '3', true)), component(facet('minLength', '3', false))];
    const kernel = candidate([
      raw('FixedBase', builtin('string'), both),
      raw('OnlyTrue', builtin('string'), [both[0]]), raw('OnlyFalse', builtin('string'), [both[1]]),
    ]);
    expect(kernel.facetPropertiesEquivalent(named('FixedBase'), named('FixedChild'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
    for (const singleton of ['OnlyTrue', 'OnlyFalse'])
      expect(kernel.facetPropertiesEquivalent(named('FixedChild'), named(singleton), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('FixedReplacement'), named('OnlyFalse'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
  });

  it('applies universal fixed-value duties to inherited effective facets in a new source derivation', async () => {
    const {facet, component, raw, candidate} = await setup();
    const kernel = candidate([raw('ConflictBase', builtin('string'), [component(facet('minLength', '3', true)), component(facet('minLength', '5'))])]);
    expect(kernel.describe(named('ConflictBase'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('ConflictChild'), owner)).toMatchObject({kind: 'invalid-schema', rule: 'facet-fixed'});
  });

  it('compares an exact repeated set with the actual normal form of legacy layers', async () => {
    const {facet, component, raw, candidate} = await setup();
    const minima = ['3', '5'].map(value => facet('minLength', value));
    const {facetComponentSet: _exact, ...normalized} = raw('Normalized', builtin('string'), []);
    const kernel = candidate([
      raw('Exact', builtin('string'), minima.map(value => component(value))),
      raw('FiveOnly', builtin('string'), [component(minima[1])]),
      {...normalized, facetBinding: undefined, facetLayers: minima.map(value => ({facets: [value]}))},
    ]);
    expect(kernel.facetPropertiesEquivalent(named('Normalized'), named('FiveOnly'), owner)).toMatchObject({kind: 'checked', value: true, obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('Exact'), named('FiveOnly'), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('Exact'), named('Normalized'), owner)).toMatchObject({kind: 'checked', value: false, obligations: []});
  });

  it('reconstructs a whole local scalar kind instead of retaining individual old tuples', async () => {
    const {facet, component, raw, candidate} = await setup();
    const minima = (values: readonly string[]) => values.map(value => component(facet('minInclusive', value)));
    const kernel = candidate([
      raw('Base', builtin('decimal'), minima(['0', '10'])),
      raw('ChangedKind', named('Base'), minima(['0', '10', '15'])),
      raw('ValidChangedKind', named('Base'), minima(['10', '15'])),
      raw('OtherKind', named('Base'), [...minima(['0', '10']), component(facet('maxInclusive', '20'))]),
    ]);
    // Structures st-restrict-facets clause 3 removes every B facet of a kind
    // appearing in S. ChangedKind therefore locally specifies 0, which is
    // outside B under Datatypes rf-minInclusive. OtherKind can keep S_min empty.
    expect(kernel.describe(named('Base'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('ChangedKind'), owner)).toMatchObject({kind: 'invalid-schema'});
    for (const type of ['ValidChangedKind', 'OtherKind'])
      expect(kernel.describe(named(type), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('uses F2 for a source replacement whose retained enumeration proves containment', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const kernel = candidate([raw('StringBase', builtin('string'), [
      component(facet('minLength', '3')), component(facet('minLength', '5')),
      component(facet('enumeration', 'abcdef')),
    ])]);
    // Source StringWeaker locally supplies minLength 3. It matches BF3 and
    // retains the exact enumeration, so both value spaces are {"abcdef"}.
    for (const type of ['StringBase', 'StringWeaker']) {
      expect(kernel.describe(named(type), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(type), lexical('abcdef'), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(type), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('does not conceal a widening source replacement by still enforcing a removed old tuple', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const kernel = candidate([
      raw('WeakenBase', builtin('string'), [component(facet('minLength', '3')), component(facet('minLength', '5'))]),
      raw('ThreeOnly', builtin('string'), [component(facet('minLength', '3'))]),
    ]);
    expect(kernel.assess(named('WeakenBase'), lexical('aaa'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('ThreeOnly'), lexical('aaa'), owner)).toMatchObject({kind: 'checked', obligations: []});
    const result = kernel.describe(named('WeakenChild'), owner);
    expect(['invalid-schema', 'unresolved', 'checked']).toContain(result.kind);
    if (result.kind === 'checked') {
      expect(result.obligations).toContainEqual(expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}));
      // A qualified description must still evaluate its actual supplied
      // properties. Retaining hidden minLength5 would mask the counterexample.
      expect(kernel.assess(named('WeakenChild'), lexical('aaa'), owner)).toMatchObject({kind: 'checked'});
    }
  });

  it('does not turn an indeterminate calendar comparison into the forbidden greater-than relation', async () => {
    const {facet, component, raw, candidate} = await setup();
    const both = [component(facet('minInclusive', '2001-01-01T00:00:00')), component(facet('maxInclusive', '2001-01-01T00:00:00Z'))];
    const kernel = candidate([raw('PartialPair', builtin('dateTime'), both), raw('PartialPairChild', named('PartialPair'), both)]);
    // Datatypes §4.3.7.4 rejects lower > upper. Indeterminate is not greater;
    // cvc assessment separately requires values to satisfy both comparisons.
    for (const type of ['SourcePartialPair', 'PartialPair', 'PartialPairChild'])
      expect(kernel.describe(named(type), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each([false, true])('does not use a value containment proof to erase an exact inherited bound kind (fixed=%s)', async fixed => {
    const {facet, component, raw, candidate} = await setup();
    const kernel = candidate([
      raw('BoundBase', builtin('decimal'), [component(facet('minInclusive', '0', fixed)), component(facet('minInclusive', '10'))]),
      raw('BoundChild', named('BoundBase'), [component(facet('minExclusive', '11')), component(facet('pattern', '12'))]),
    ]);
    // Its only value is 12, which is in B. But S containing minExclusive
    // cannot remove B's minInclusive components from the exact R inventory;
    // the accepted facetLayers bound normal form is a different contract.
    expect(kernel.describe(named('BoundBase'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('BoundChild'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('checks the prohibition on specifying both upper-bound kinds in one reconstructed local step', async () => {
    const {facet, component, raw, candidate} = await setup();
    const inclusive = component(facet('maxInclusive', '20')), exclusive = component(facet('maxExclusive', '10'));
    const kernel = candidate([
      raw('OneStep', builtin('decimal'), [inclusive, exclusive]),
      raw('UpperBase', builtin('decimal'), [inclusive]),
      raw('SeparateSteps', named('UpperBase'), [inclusive, exclusive]),
    ]);
    // Datatypes §4.3.8.4 forbids maxInclusive and maxExclusive together in
    // the same derivation step. An inherited maxInclusive can remain in B
    // while the subsequent S contains only the new maxExclusive component.
    expect(kernel.describe(named('OneStep'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.describe(named('SeparateSteps'), owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('permits source redeclaration of an inherited exclusive endpoint with the same authority as raw properties', async () => {
    const {lexical, facet, component, raw, candidate} = await setup();
    const kernel = candidate([
      raw('ExclusiveBase', builtin('decimal'), ['0', '10'].map(value => component(facet('minExclusive', value)))),
      raw('RawExclusiveChild', named('ExclusiveBase'), [component(facet('minExclusive', '10'))]),
    ]);
    // rf-minExclusive expressly admits equality with an inherited exclusive
    // endpoint. Primitive lexical assessment must remove every inherited
    // execution conjunct before applying that exception and the F2 duties.
    for (const type of ['SourceExclusiveChild', 'RawExclusiveChild']) {
      expect(kernel.describe(named(type), owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(type), lexical('10'), owner)).toMatchObject({kind: 'invalid-schema'});
      expect(kernel.assess(named(type), lexical('11'), owner)).toMatchObject({kind: 'checked', obligations: []});
    }
    expect(kernel.facetPropertiesEquivalent(named('SourceExclusiveChild'), named('RawExclusiveChild'), owner))
      .toMatchObject({kind: 'checked', value: true, obligations: []});
    // Five belongs to neither inherited exclusive endpoint and is not in B.
    expect(kernel.describe(named('SourceExclusiveInvalid'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('includes known annotation changes when deciding whether an entire scalar kind can be inherited', async () => {
    const {facet, component, raw, candidate} = await setup();
    const zero = component(facet('minInclusive', '0')), ten = component(facet('minInclusive', '10'));
    const annotated: RawScalarFacetComponent = {...zero, annotation: {kind: 'present', content: {
      kind: 'element', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'annotation'},
      attributes: [], namespaces: {}, children: [],
    }}};
    const unknown: RawScalarFacetComponent = {facets: zero.facets};
    const kernel = candidate([
      raw('AnnotationBase', builtin('decimal'), [zero, ten]),
      raw('AnnotationUnchanged', named('AnnotationBase'), [zero, ten]),
      raw('AnnotationChanged', named('AnnotationBase'), [annotated, ten]),
      raw('AnnotationUnknown', named('AnnotationBase'), [unknown, ten]),
    ]);
    // st-restrict-facets.3 acts on complete components, including their
    // annotation property (§4.3.10.1). A new annotation requires local S_min,
    // whose full replacement inventory includes the invalid local bound 0.
    expect(kernel.describe(named('AnnotationUnchanged'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.describe(named('AnnotationChanged'), owner)).toMatchObject({kind: 'invalid-schema'});
    // Unknown metadata might be identical and cannot justify a negative.
    const uncertain = kernel.describe(named('AnnotationUnknown'), owner);
    expect(['checked', 'unresolved']).toContain(uncertain.kind);
    if (uncertain.kind === 'checked')
      expect(uncertain.obligations).toContainEqual(expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'}));
  });

  it('applies the lower-bound pair prohibition to the exact effective datatype, across derivation steps', async () => {
    const {facet, component, raw, candidate} = await setup();
    const inclusive = component(facet('minInclusive', '0'));
    const kernel = candidate([
      raw('LowerPairBase', builtin('decimal'), [inclusive]),
      raw('RawLowerPair', named('LowerPairBase'), [inclusive, component(facet('minExclusive', '10'))]),
    ]);
    // Datatypes §4.3.9.4 says the lower kinds cannot be specified for the
    // same datatype. Unlike the upper pair's explicit local-step wording,
    // inherited exact minInclusive remains part of this effective inventory.
    expect(kernel.describe(named('LowerPairBase'), owner)).toMatchObject({kind: 'checked', obligations: []});
    for (const type of ['RawLowerPair', 'SourceLowerPair'])
      expect(kernel.describe(named(type), owner)).toMatchObject({kind: 'invalid-schema', rule: 'facet-bound-pair'});
  });
});
