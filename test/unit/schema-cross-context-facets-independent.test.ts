import {describe, expect, it} from 'vitest';
import type {Reference} from '../../src/compiler/canonicalGraph.js';
import {compareSchemaFacetProperties, createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {originalSimpleSetup, builtin, named, id, diagnosticWork} from './helpers/original-simple-correspondence.js';

// Independent pre-code oracle #268 6114722972 / #271 6114720451.
// Only the shared scalar owner determines typed facet values. Expected values
// below come from source literals and exact property/primitive identity rules.
describe('independent same-request cross-context facet authority', () => {
  it.each(['left', 'right'] as const)('retains declared-type NOTATION usability on the %s side', async side => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd'), actual = s.request.actual;
    const a = side === 'left' ? builtin('NOTATION') : named('Noted'), b = side === 'right' ? builtin('NOTATION') : named('Noted');
    expect(createSchemaScalarKernel(actual).facetPropertiesEquivalent(a, b, id('Noted')))
      .toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation'});
    expect(compareSchemaFacetProperties(actual, a, id('Noted'), actual, b, id('Noted')))
      .toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation', side, contextId: actual.contextId});
  });

  it('still compares valid declared NOTATION enumeration properties', async () => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd');
    const right = s.overlay([s.raw('Noted', [s.facet('enumeration', 't:Picture')], {base: builtin('NOTATION')})]);
    expect(compareSchemaFacetProperties(s.request.actual, named('Noted'), id('Noted'), right, named('Noted'), id('Noted')))
      .toMatchObject({kind: 'checked', value: true, obligations: []});
  });

  it.each([['1', true], ['2', false]] as const)('reads each exact same-ID context (raw minLength=%s)', async (value, equal) => {
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('MinOne', [s.facet('minLength', value)])]);
    const reference = named('MinOne');
    const result = compareSchemaFacetProperties(s.request.actual, reference, id('MinOne'), right, reference, id('MinOne'));
    expect(result).toMatchObject({kind: 'checked', value: equal, authority: 'XSD10-schema-scalar-facet-properties-v1', obligations: [],
      operands: {left: {contextId: s.request.actual.contextId, reference, owner: id('MinOne')},
        right: {contextId: right.contextId, reference, owner: id('MinOne')}}});
  });

  it('allows siblings and nested contexts without borrowing a sibling property result', async () => {
    const s = await originalSimpleSetup(), left = s.overlay([s.raw('MinOne', [s.facet('minLength', '1')])], 'left');
    const right = s.overlay([s.raw('MinOne', [s.facet('minLength', '2')])], 'right');
    const nested = forkSemanticCandidate(left, {key: 'nested', active: left.members});
    if (nested.kind !== 'prepared') throw new Error('Expected authentic nested context');
    expect(compareSchemaFacetProperties(left, named('MinOne'), id('MinOne'), right, named('MinOne'), id('MinOne')))
      .toMatchObject({kind: 'checked', value: false});
    expect(compareSchemaFacetProperties(left, named('MinOne'), id('MinOne'), nested.context, named('MinOne'), id('MinOne')))
      .toMatchObject({kind: 'checked', value: true});
    expect(compareSchemaFacetProperties(right, named('MinOne'), id('MinOne'), nested.context, named('MinOne'), id('MinOne')))
      .toMatchObject({kind: 'checked', value: false});
  });

  it('keeps facet equality separate from changed final metadata', async () => {
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('Empty', [], {final: ['list']})]);
    expect(compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'checked', value: true});
    expect(createSchemaScalarKernel(right).contentProperties(named('Empty'), id('Empty')))
      .toMatchObject({kind: 'checked', value: {final: ['list']}});
  });

  it('publishes immutable ordered operand snapshots rather than borrowing caller selectors', async () => {
    const s = await originalSimpleSetup(), actual = s.request.actual;
    const reference: {kind: 'local'; target: string} = {kind: 'local', target: id('Empty')};
    const result = compareSchemaFacetProperties(actual, reference, id('Empty'), actual, named('Empty'), id('Empty'));
    expect(result).toMatchObject({kind: 'checked', value: true});
    reference.target = id('MinOne');
    if (result.kind !== 'checked') throw new Error('Expected immutable comparison result');
    expect(result.operands.left.reference).toEqual(named('Empty'));
    expect(Object.isFrozen(result.operands.left.reference)).toBe(true);
    expect(Object.isFrozen(result.obligations)).toBe(true);
  });

  it.each([['1', true], ['2', false]] as const)('compares typed decimal alias %s', async (value, equal) => {
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('DecimalOne', [s.facet('enumeration', value)], {base: builtin('decimal')})]);
    expect(compareSchemaFacetProperties(s.request.actual, named('DecimalOne'), id('DecimalOne'), right, named('DecimalOne'), id('DecimalOne')))
      .toMatchObject({kind: 'checked', value: equal});
  });

  it.each([false, true])('uses retained QName bindings (different namespace=%s)', async different => {
    const s = await originalSimpleSetup(), facet = s.facet('enumeration', different ? 'p:Item' : 'q:Item');
    const rawFacet = {...facet, lexical: {...facet.lexical, context: {...facet.lexical.context,
      namespaces: {...facet.lexical.context.namespaces, ...(different ? {p: 'urn:different'} : {})}}}};
    const right = s.overlay([s.raw('QNameOne', [rawFacet], {base: builtin('QName')})]);
    expect(compareSchemaFacetProperties(s.request.actual, named('QNameOne'), id('QNameOne'), right, named('QNameOne'), id('QNameOne')))
      .toMatchObject({kind: 'checked', value: !different});
  });

  it('retains original typed facet context after the same active datatype changes', async () => {
    const s = await originalSimpleSetup(), lexical = s.facet('enumeration', '1');
    const raw = s.raw('Empty', [{...lexical, operand: {type: named('DecimalOne'), owner: id('DecimalOne'), context: 'original'}}], {base: builtin('decimal')});
    const right = s.overlay([s.raw('DecimalOne', [s.facet('enumeration', '2')], {base: builtin('decimal')}), raw]);
    expect(compareSchemaFacetProperties(s.request.actual, named('DecimalOne'), id('DecimalOne'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'checked', value: true});
    const activeRaw = {...raw, facetLayers: [{facets: [{...lexical, operand: {type: named('DecimalOne'), owner: id('DecimalOne'), context: 'active' as const}}]}]};
    const active = s.overlay([s.raw('DecimalOne', [s.facet('enumeration', '2')], {base: builtin('decimal')}), activeRaw]);
    expect(compareSchemaFacetProperties(s.request.actual, named('DecimalOne'), id('DecimalOne'), active, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'invalid-schema', side: 'right', contextId: active.contextId});
  });

  it('does not equate different primitive enum values with the same numeric-looking spelling', async () => {
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('Empty', [s.facet('enumeration', '1')], {base: builtin('boolean')})]);
    expect(compareSchemaFacetProperties(s.request.actual, named('DecimalOne'), id('DecimalOne'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'checked', value: false});
  });

  it('preserves both same-context local prerequisite collectors', async () => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd'), actual = s.request.actual;
    const result = compareSchemaFacetProperties(actual, named('MixedOne'), id('MixedOne'), actual, named('MixedTwo'), id('MixedTwo'));
    expect(result).toMatchObject({kind: 'checked', value: true});
    if (result.kind !== 'checked') throw new Error('Expected qualified facet equality');
    expect(result.obligations).toEqual(expect.arrayContaining([
      {rule: 'simple-content-base-mixed-emptiable', component: id('MixedBaseOne'), contextId: actual.contextId},
      {rule: 'simple-content-base-mixed-emptiable', component: id('MixedBaseTwo'), contextId: actual.contextId},
    ]));
  });

  it('preserves original mapping debt and active scalar dependencies on cold and warm calls', async () => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd'), actual = s.request.actual, right = s.overlay([]);
    const compare = () => compareSchemaFacetProperties(actual, named('MixedOne'), id('MixedOne'), right, named('MixedOne'), id('MixedOne'));
    const cold = compare(), warm = compare();
    expect(cold).toMatchObject({kind: 'checked', value: true});
    expect(warm).toEqual(cold);
    if (cold.kind !== 'checked') throw new Error('Expected qualified equality');
    // GSC1 original recipe formation owns the mixed-content mapping premise.
    // Its H scalar base is the exact inline simple component; source provenance
    // does not add the original mixed container as an H construction premise.
    expect(cold.obligations).toEqual([
      {rule: 'simple-content-base-mixed-emptiable', component: id('MixedBaseOne'), contextId: actual.contextId},
    ]);
    const inline = s.complex('MixedOne').derivation?.inlineType;
    if (!inline || inline.kind !== 'local') throw new Error('Expected explicit original inline scalar');
    expect(cold.typeDependencies).toEqual(expect.arrayContaining([{contextId: right.contextId, type: {kind: 'component', id: inline.target}}]));
  });

  it.each(['left', 'right'] as const)('retains an original invalid operand failure on the %s side', async side => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd'), actual = s.request.actual, right = s.overlay([]);
    const a = side === 'left' ? 'Bad' : 'Empty', b = side === 'right' ? 'Bad' : 'Empty';
    const result = compareSchemaFacetProperties(actual, named(a), id(a), right, named(b), id(b));
    expect(result).toMatchObject({kind: 'invalid-schema', side, contextId: side === 'left' ? actual.contextId : right.contextId});
    if (result.kind !== 'invalid-schema') throw new Error('Expected original local failure');
    expect(result.source?.uri).toMatch(/cross-context-facets-independent\.xsd$/);
  });

  it('retains a changed active operand failure without claiming the original schema failed', async () => {
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('Empty', [s.facet('minLength', '-1')])]);
    expect(compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'invalid-schema', side: 'right', contextId: right.contextId});
    expect(createSchemaScalarKernel(s.request.actual).describe(named('Empty'), id('Empty'))).toMatchObject({kind: 'checked'});
  });

  it('distinguishes the right operand position from its failing original-context typed prerequisite', async () => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd');
    const facet = {...s.facet('enumeration', 'x'), operand: {type: named('Bad'), owner: id('Bad'), context: 'original' as const}};
    const right = s.overlay([s.raw('Empty', [facet])]);
    expect(compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'invalid-schema', side: 'right', contextId: s.request.actual.contextId,
        component: id('Bad'), operands: {right: {contextId: right.contextId, owner: id('Empty')}}});
  });

  it('keeps a candidate-supplied bad value owned by H despite using a valid original datatype', async () => {
    const s = await originalSimpleSetup(), facet = {...s.facet('enumeration', ''),
      operand: {type: named('MinOne'), owner: id('MinOne'), context: 'original' as const}};
    const right = s.overlay([s.raw('Empty', [facet])]);
    expect(createSchemaScalarKernel(s.request.actual).describe(named('MinOne'), id('MinOne'))).toMatchObject({kind: 'checked'});
    expect(compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'invalid-schema', side: 'right', contextId: right.contextId});
  });

  it.each([
    ['builtin-complex', 'original'], ['declared-mixed', 'original'],
    ['builtin-complex', 'active'], ['declared-mixed', 'active'],
  ] as const)('keeps an invalid %s operand role owned by its candidate caller (%s)', async (role, origin) => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd');
    const type = role === 'builtin-complex' ? builtin('anyType') : named('MixedBaseOne');
    const facet = {...s.facet('enumeration', 'x'), operand: {type, owner: id('Empty'), context: origin}};
    const right = s.overlay([s.raw('Empty', [facet])]);
    expect(compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), right, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'invalid-schema', side: 'right', contextId: right.contextId});
  });

  it.each(['owner', 'reference'] as const)('rejects a missing original typed operand %s during authentic preparation', async missing => {
    const s = await originalSimpleSetup(), facet = {...s.facet('enumeration', 'x'), operand: {
      type: missing === 'reference' ? named('Missing') : builtin('string'),
      owner: missing === 'owner' ? id('Missing') : id('Empty'), context: 'original' as const}};
    expect(s.request.candidate({key: 'missing-original-operand', active: s.request.actual.members,
      rawSimpleTypes: [s.raw('Empty', [facet])]})).toMatchObject({kind: 'candidate-rejected', code: 'reference'});
  });

  it.each([
    ['Annotated', 'present'], ['Multi', 'absent'],
    ['AnnotatedMultiPattern', 'unresolved'], ['AnnotatedMultiEnum', 'unresolved'],
  ] as const)('preserves exact annotation mapping scope for %s', async (name, status) => {
    const s = await originalSimpleSetup(), actual = s.request.actual;
    expect(compareSchemaFacetProperties(actual, named(name), id(name), actual, named(name), id(name)))
      .toMatchObject({kind: 'checked', value: true, sourceFacetAnnotations: {left: status, right: status}});
  });

  it('uses P1 expression construction for independent multi-pattern equality across contexts', async () => {
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('Multi', [s.facet('pattern', 'a'), s.facet('pattern', 'b')])]);
    expect(compareSchemaFacetProperties(s.request.actual, named('Multi'), id('Multi'), right, named('Multi'), id('Multi')))
      .toMatchObject({kind: 'checked', value: true, obligations: []});
  });

  it('rejects unrelated authentic requests and copied or forged handles before getters run', async () => {
    const s = await originalSimpleSetup(), other = await originalSimpleSetup(), actual = s.request.actual;
    expect(() => compareSchemaFacetProperties(actual, named('Empty'), id('Empty'), other.request.actual, named('Empty'), id('Empty'))).toThrow(TypeError);
    expect(() => compareSchemaFacetProperties({...actual} as SemanticContext, named('Empty'), id('Empty'), actual, named('Empty'), id('Empty'))).toThrow(TypeError);
    let calls = 0;
    const forged = {get originalContext() {calls++; return () => actual;}} as unknown as SemanticContext;
    expect(() => compareSchemaFacetProperties(actual, named('Empty'), id('Empty'), forged, named('Empty'), id('Empty'))).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it('rejects another authentic original request even when its budget object is shared', async () => {
    const s = await originalSimpleSetup();
    const other = await originalSimpleSetup('original-simple-correspondence-independent.xsd', s.request.budget);
    expect(other.request.budget).toBe(s.request.budget);
    expect(() => compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), other.request.actual, named('Empty'), id('Empty')))
      .toThrow(TypeError);
  });

  it.each(['left', 'right'] as const)('rejects a %s reference getter without invoking it', async side => {
    const s = await originalSimpleSetup(), actual = s.request.actual;
    let calls = 0;
    const reference = {get kind() {calls++; return 'local';}, target: id('Empty')} as Reference;
    expect(() => compareSchemaFacetProperties(actual, side === 'left' ? reference : named('Empty'), id('Empty'),
      actual, side === 'right' ? reference : named('Empty'), id('Empty'))).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it('charges cached comparisons and returns sticky resource limits after success', async () => {
    const s = await originalSimpleSetup(), actual = s.request.actual, right = s.overlay([s.raw('Empty')]);
    const compare = () => compareSchemaFacetProperties(actual, named('Empty'), id('Empty'), right, named('Empty'), id('Empty'));
    expect(compare()).toMatchObject({kind: 'checked', value: true});
    const before = s.request.budget.usage().work;
    expect(compare()).toMatchObject({kind: 'checked', value: true});
    expect(s.request.budget.usage().work).toBeGreaterThan(before);
    s.request.budget.guard(() => s.request.budget.chargeWork(diagnosticWork));
    expect(compare()).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(compare()).toMatchObject({kind: 'resource-limit', limit: 'work'});
  });

  it('does not publish a partial comparison when a fresh call exhausts its remaining request budget', async () => {
    const probe = await originalSimpleSetup(), probeRight = probe.overlay([probe.raw('DecimalOne', [probe.facet('enumeration', '1')], {base: builtin('decimal')})]);
    const before = probe.request.budget.usage().work;
    expect(compareSchemaFacetProperties(probe.request.actual, named('DecimalOne'), id('DecimalOne'), probeRight, named('DecimalOne'), id('DecimalOne')))
      .toMatchObject({kind: 'checked', value: true});
    const measuredWork = probe.request.budget.usage().work - before;
    const s = await originalSimpleSetup(), right = s.overlay([s.raw('DecimalOne', [s.facet('enumeration', '1')], {base: builtin('decimal')})]);
    // Calibrate against this exact ordinary query, not an incidental helper count.
    // Both requests are cold; the second retains a strictly positive half-query allowance.
    s.request.budget.chargeWork(diagnosticWork - s.request.budget.usage().work - Math.max(1, Math.floor(measuredWork / 2)));
    expect(compareSchemaFacetProperties(s.request.actual, named('DecimalOne'), id('DecimalOne'), right, named('DecimalOne'), id('DecimalOne')))
      .toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), s.request.actual, named('Empty'), id('Empty')))
      .toMatchObject({kind: 'resource-limit', limit: 'work'});
  });
});
