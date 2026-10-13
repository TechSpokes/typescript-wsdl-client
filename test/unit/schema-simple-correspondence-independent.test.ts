import {describe, expect, it} from 'vitest';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {originalSimpleSetup, builtin, named, id, namespace, diagnosticWork} from './helpers/original-simple-correspondence.js';

// Independent pre-code oracle: #271 comment 6114720451; dc-defn property table,
// selected B original preservation, and exact source component identity.
describe('independent original simple property correspondence', () => {
  it('retains the no-overlay finite proof positive', async () => {
    const s = await originalSimpleSetup(), context = s.candidate();
    expect(s.correspondence(context)).toMatchObject({kind: 'checked', scalarObligations: []});
    expect(s.finite(context)).toMatchObject({kind: 'checked-candidate', claims: {suppliedCandidate: 'checked', universalCoverage: false,
      completeNegativeAnswer: false, searchTermination: false}});
  });

  it.each(['Empty', 'MinOne'] as const)('accepts a complete redundant original %s property overlay', async name => {
    const s = await originalSimpleSetup(), context = s.candidate([s.raw(name, name === 'MinOne' ? [s.facet('minLength', '1')] : [])]);
    expect(s.correspondence(context)).toMatchObject({kind: 'checked', scalarObligations: []});
    expect(s.finite(context)).toMatchObject({kind: 'checked-candidate', claims: {suppliedCandidate: 'checked', universalCoverage: false,
      completeNegativeAnswer: false, searchTermination: false}});
  });

  it.each(['final', 'added-facet', 'changed-facet', 'base'] as const)('rejects known changed original %s properties', async change => {
    const s = await originalSimpleSetup();
    const raw = change === 'final' ? s.raw('Empty', [], {final: ['list']})
      : change === 'added-facet' ? s.raw('Empty', [s.facet('minLength', '1')])
      : change === 'changed-facet' ? s.raw('MinOne', [s.facet('minLength', '2')])
      : s.raw('Empty', [], {base: named('PeerEmpty')});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: 'candidate-rejected'});
  });

  it('compares final as a set while preserving the exact base identity', async () => {
    const s = await originalSimpleSetup();
    expect(s.correspondence(s.candidate([s.raw('FinalSet', [], {final: ['union', 'list'], base: builtin('string')})])))
      .toMatchObject({kind: 'checked'});
  });

  it('preserves a facet fixed property even when its value is unchanged', async () => {
    const s = await originalSimpleSetup();
    expect(s.correspondence(s.candidate([s.raw('MinOne', [s.facet('minLength', '1', true)])])))
      .toMatchObject({kind: 'candidate-rejected'});
  });

  it.each([false, true])('preserves an original anonymous namespace (changed=%s)', async changed => {
    const s = await originalSimpleSetup(), declaration = s.node(globalId('element', {namespace, local: 'Anonymous'}));
    if (declaration.kind !== 'element' || declaration.type.kind !== 'local') throw new Error('Expected original anonymous scalar');
    const type = declaration.type.target;
    const raw = s.raw('Empty', [], {type, targetNamespace: changed ? 'urn:changed' : namespace,
      provenance: {kind: 'hypothetical-abstract', originals: [type]}});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: changed ? 'candidate-rejected' : 'checked'});
  });

  it.each([false, true])('preserves the exact list item identity (changed=%s)', async changed => {
    const s = await originalSimpleSetup();
    const raw = s.raw('List', [s.facet('whiteSpace', 'collapse', true)], {base: builtin('anySimpleType'),
      variety: {kind: 'list', item: named(changed ? 'PeerEmpty' : 'Empty')}});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: changed ? 'candidate-rejected' : 'checked'});
  });

  it.each([false, true])('preserves the ordered union member identities (reversed=%s)', async reversed => {
    const s = await originalSimpleSetup(), members = reversed ? [named('MinOne'), named('Empty')] : [named('Empty'), named('MinOne')];
    const raw = s.raw('Union', [], {base: builtin('anySimpleType'), variety: {kind: 'union', members}});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: reversed ? 'candidate-rejected' : 'checked'});
  });

  it.each([['1', 'checked'], ['2', 'candidate-rejected']] as const)('compares typed decimal enumeration %s', async (value, kind) => {
    const s = await originalSimpleSetup();
    expect(s.correspondence(s.candidate([s.raw('DecimalOne', [s.facet('enumeration', value)], {base: builtin('decimal')})])))
      .toMatchObject({kind});
  });

  it.each([false, true])('preserves QName value context rather than spelling (changed namespace=%s)', async changed => {
    const s = await originalSimpleSetup(), facet = s.facet('enumeration', changed ? 'p:Item' : 'q:Item');
    const lexical = {...facet.lexical, context: {...facet.lexical.context,
      namespaces: {...facet.lexical.context.namespaces, ...(changed ? {p: 'urn:different-value'} : {})}}};
    const raw = s.raw('QNameOne', [{...facet, lexical}], {base: builtin('QName')});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: changed ? 'candidate-rejected' : 'checked'});
  });

  it('compares independently mapped multi-pattern properties under selected P1', async () => {
    const s = await originalSimpleSetup(), raw = s.raw('Multi', [s.facet('pattern', 'a'), s.facet('pattern', 'b')]);
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: 'checked'});
  });

  it('does not use the particle-extension annotation exemption for original facet preservation', async () => {
    const s = await originalSimpleSetup(), raw = s.raw('Annotated', [s.facet('minLength', '1')]);
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: 'candidate-rejected', rule: 'original-facet-annotation-correspondence'});
    const explicit = s.facet('minLength', '1'), unknown = {name: explicit.name, fixed: explicit.fixed, lexical: explicit.lexical};
    expect(s.correspondence(s.candidate([s.raw('Annotated', [unknown])]))).toMatchObject({kind: 'unresolved', rule: 'original-facet-annotation-correspondence'});
    expect(s.correspondence(s.candidate([s.raw('Annotated', [s.facet('minLength', '2')])])))
      .toMatchObject({kind: 'candidate-rejected'});
  });

  it('requires explicit absence metadata to close an otherwise equal raw facet annotation property', async () => {
    const s = await originalSimpleSetup(), explicit = s.facet('minLength', '1');
    const unknown = {name: explicit.name, fixed: explicit.fixed, lexical: explicit.lexical};
    expect(s.correspondence(s.candidate([s.raw('MinOne', [unknown])]))).toMatchObject({kind: 'unresolved', rule: 'original-facet-annotation-correspondence'});
    expect(s.correspondence(s.candidate([s.raw('MinOne', [explicit])]))).toMatchObject({kind: 'checked'});
  });

  it('does not retain an annotated scalar facet after a real same-kind source replacement', async () => {
    const s = await originalSimpleSetup();
    const raw = s.raw('ReplacedAnnotation', [s.facet('minLength', '2')], {base: named('Annotated')});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: 'checked'});
  });

  it.each(['pattern', 'enumeration'] as const)('retains inherited %s annotations across later source groups', async kind => {
    const s = await originalSimpleSetup(), name = kind === 'pattern' ? 'PatternAnnotationChild' : 'EnumAnnotationChild';
    const raw = s.raw(name, [], {base: named(kind === 'pattern' ? 'PatternAnnotation' : 'EnumAnnotation'),
      facetLayers: [{facets: [s.facet(kind, 'a')]}, {facets: [s.facet(kind, kind === 'pattern' ? 'a|b' : 'a')]}]});
    expect(s.correspondence(s.candidate([raw]))).toMatchObject({kind: 'candidate-rejected', rule: 'original-facet-annotation-correspondence'});
  });

  it('rejects malformed raw annotation metadata without invoking an accessor', async () => {
    const s = await originalSimpleSetup(), facet = s.facet('minLength', '1');
    const malformed = {...facet, annotation: 'present'};
    expect(s.request.candidate({key: 'invalid-annotation-tag', active: s.request.actual.members,
      rawSimpleTypes: [s.raw('MinOne', [malformed as unknown as typeof facet])]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    let calls = 0;
    const accessor = {...facet, get annotation() {calls++; return 'absent' as const;}};
    expect(s.request.candidate({key: 'annotation-getter', active: s.request.actual.members,
      rawSimpleTypes: [s.raw('MinOne', [accessor])]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    expect(calls).toBe(0);
  });

  it('keeps original source records and QName bindings immutable under a redundant overlay', async () => {
    const s = await originalSimpleSetup(), original = s.request.actual.sourceNode(id('QNameOne'));
    const raw = s.raw('QNameOne', [s.facet('enumeration', 'q:Item')], {base: builtin('QName')}), context = s.candidate([raw]);
    expect(context.sourceNode(id('QNameOne'))).toBe(original);
    expect(original?.context.namespaces.p).toBe('urn:recovery:facet-value');
    expect(Object.isFrozen(original?.context.namespaces)).toBe(true);
    expect(s.correspondence(context)).toMatchObject({kind: 'checked'});
  });

  it('requires the authentic direct parent and rejects copied context handles', async () => {
    const s = await originalSimpleSetup(), context = s.candidate([s.raw('Empty')]), sibling = s.overlay([]);
    expect(() => s.correspondence(context, sibling)).toThrow(TypeError);
    expect(() => s.correspondence({...context} as SemanticContext)).toThrow(TypeError);
  });

  it('keeps completed correspondence subject to subsequent sticky exhaustion', async () => {
    const s = await originalSimpleSetup(), context = s.candidate([s.raw('Empty')]);
    expect(s.correspondence(context)).toMatchObject({kind: 'checked'});
    s.request.budget.guard(() => s.request.budget.chargeWork(diagnosticWork));
    expect(s.correspondence(context)).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(s.correspondence(context)).toMatchObject({kind: 'resource-limit', limit: 'work'});
  });

  it('retains original typed-operand failure ownership through the correspondence consumer', async () => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd');
    const facet = {...s.facet('enumeration', 'x'), operand: {type: named('Bad'), owner: id('Bad'), context: 'original' as const}};
    expect(s.correspondence(s.candidate([s.raw('Empty', [facet])]))).toMatchObject({kind: 'invalid-schema',
      component: id('Bad'), contextId: s.request.actual.contextId});
  });

  it('does not relabel a candidate bad value as original datatype invalidity', async () => {
    const s = await originalSimpleSetup(), facet = {...s.facet('enumeration', ''),
      operand: {type: named('MinOne'), owner: id('MinOne'), context: 'original' as const}};
    const context = s.candidate([s.raw('Empty', [facet])]);
    expect(checkComponentConstruction(s.request.actual, id('MinOne'))).toMatchObject({kind: 'checked'});
    expect(s.correspondence(context)).toMatchObject({kind: 'candidate-rejected'});
  });

  it('does not relabel a caller-supplied nonscalar operand role as original schema invalidity', async () => {
    const s = await originalSimpleSetup(), facet = {...s.facet('enumeration', 'x'),
      operand: {type: builtin('anyType'), owner: id('Empty'), context: 'original' as const}};
    expect(s.correspondence(s.candidate([s.raw('Empty', [facet])]))).toMatchObject({kind: 'candidate-rejected'});
  });

  it.each(['original', 'active'] as const)('retains %s typed-operand failure ownership through construction and finite closure', async origin => {
    const s = await originalSimpleSetup();
    const fresh: SimpleTypeNode = {...s.seed, id: id('Fresh'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'Fresh'}},
      variety: {kind: 'restriction', base: builtin('string'), facets: []}};
    const facet = {...s.facet('enumeration', ''), operand: {type: named('MinOne'), owner: id('MinOne'), context: origin}};
    const raw = s.raw('Fresh', [facet], {provenance: {kind: 'hypothetical-abstract', originals: []}});
    const context = s.candidate([raw], [fresh]);
    // Actual MinOne is valid. The invalid value is assessed only while forming
    // the fresh helper, so these checks reach the receiving closure paths.
    expect(checkComponentConstruction(s.request.actual, id('MinOne'))).toMatchObject({kind: 'checked'});
    expect(s.correspondence(context)).toMatchObject({kind: 'checked'});
    // Evaluation in the original datatype does not make a bad candidate value
    // an invalid actual-schema component: the forming obligation belongs to H.
    const expected = {kind: 'candidate-rejected'};
    expect(checkComponentConstruction(context, fresh.id)).toMatchObject(expected);
    expect(s.finite(context)).toMatchObject(expected);
  });

  it('preserves intrinsic original datatype invalidity in local construction without confusing a bad candidate value', async () => {
    const s = await originalSimpleSetup('cross-context-facets-independent.xsd');
    const fresh: SimpleTypeNode = {...s.seed, id: id('Fresh'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'Fresh'}},
      variety: {kind: 'restriction', base: builtin('string'), facets: []}};
    const facet = {...s.facet('enumeration', 'x'), operand: {type: named('Bad'), owner: id('Bad'), context: 'original' as const}};
    const context = s.candidate([s.raw('Fresh', [facet], {provenance: {kind: 'hypothetical-abstract', originals: []}})], [fresh]);
    expect(s.correspondence(context)).toMatchObject({kind: 'checked'});
    expect(checkComponentConstruction(context, fresh.id)).toMatchObject({kind: 'invalid-schema', contextId: s.request.actual.contextId,
      component: id('Bad')});
    // Full verification catches Bad in the earlier actual closure. This checks
    // that outcome, not an unreachable later candidate-close execution path.
    expect(s.finite(context)).toMatchObject({kind: 'invalid-schema', contextId: s.request.actual.contextId});
  });
});
