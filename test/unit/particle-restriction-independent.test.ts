import path from 'node:path';
import assert from 'node:assert/strict';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent, deriveRawComplexContent, deriveOriginalComplexPropertyContent, deriveModelGroupContent} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import type {SemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {checkDeclaration} from '../../src/compiler/schemaDeclarationPrimitives.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../src/compiler/finiteRe01Verification.js';

// Literal outcomes specified from dated primary before relation implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6111969140
const fixtures = path.resolve('test/conformance/fixtures');
const named = (local: string) => globalId('type', {namespace: 'urn:recovery:restriction', local});
async function setup(file = 'restriction-independent.xsd') {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation: ${prepared.kind}`);
  return prepared.request;
}
function view(context: SemanticContext, local: string, purpose: 'restriction' | 'declared' = 'restriction'): SemanticParticleView {
  const content = deriveActualComplexContent(context, named(local));
  if (content.kind !== 'checked') throw new Error(`Expected effective content ${local}: ${content.kind}`);
  const result = prepareSemanticParticleView(context, content.view, purpose);
  if (result.kind !== 'checked') throw new Error(`Expected ${purpose} view ${local}: ${JSON.stringify(result)}`);
  return result.view;
}

describe('independent normalized XSD1.0 particle relation controls', () => {
  it('recognizes raw particle identity and the selected existential order for distinct implicit copies', async () => {
    const request = await setup();
    const base = view(request.actual, 'HeadOnly'), inherited = view(request.actual, 'HeadExtended');
    expect(base.root.orderUnspecified).toBe(true);
    expect(inherited).not.toBe(base);
    expect(checkParticleRestriction(request.actual, inherited, base)).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(request.actual, view(request.actual, 'HeadCopy'), base)).toMatchObject({kind: 'checked', value: true});
  });

  it.each([
    ['ChoiceBA', 'ChoiceAB', false], ['ChoiceA', 'ChoiceAB', true],
    ['SeqBA', 'SeqAB', false], ['AllBA', 'AllAB', false], ['SeqBA', 'AllAB', true],
    ['SeqAA', 'AllAOptionalB', false], ['ChoiceA', 'AllAOptionalB', true], ['ChoiceA', 'AllAB', false],
    ['SeqAA', 'ChoiceAB2', true], ['SeqAA', 'ChoiceAB', false],
    ['Big', 'BigMinusOne', false], ['Big', 'Big', true],
  ] as const)('checks %s restricting %s as %s without replacing mappings with language inclusion', async (derived, base, expected) => {
    const request = await setup();
    expect(checkParticleRestriction(request.actual, view(request.actual, derived), view(request.actual, base)))
      .toMatchObject({kind: 'checked', value: expected, rule: 'cos-particle-restrict',
        obligations: ['component-validity', 'particle-local-legality']});
  });

  it('preserves singleton all optionality and required empty choice in a separate normalized graph', async () => {
    const request = await setup(), before = JSON.stringify(request.graph);
    const declared = view(request.actual, 'OptionalAllA', 'declared');
    const normalized = view(request.actual, 'OptionalAllA');
    expect(declared.root.kind).toBe('all');
    expect(normalized.root).toMatchObject({kind: 'element', occurs: {min: '0', max: '1'}});
    expect(checkParticleRestriction(request.actual, normalized, view(request.actual, 'ChoiceA'))).toMatchObject({kind: 'checked', value: false});
    expect(view(request.actual, 'RequiredEmptyChoice').root).toMatchObject({kind: 'choice', occurs: {min: '1', max: '1'}, children: []});
    expect(view(request.actual, 'Empty').root.kind).toBe('sequence');
    expect(JSON.stringify(request.graph)).toBe(before);
  });

  it('ignores an optional choice made empty by flattening required nested choices', async () => {
    // cos-particle-restrict.2.2: each unit nested choice is pointless; the
    // resulting empty outer choice with min=0 is also pointless.
    const request = await setup('pointless-optional-choice.xsd'), before = JSON.stringify(request.graph);
    const declared = view(request.actual, 'Carrier', 'declared');
    expect(declared.root).toMatchObject({kind: 'choice', occurs: {min: '0', max: '1'}, children: [
      {kind: 'choice', occurs: {min: '1', max: '1'}, children: []},
      {kind: 'choice', occurs: {min: '1', max: '1'}, children: []},
    ]});
    const normalized = view(request.actual, 'Carrier');
    expect(normalized.root).toMatchObject({kind: 'sequence', occurs: {min: '1', max: '1'}, children: []});
    expect(normalized.root.summary).toMatchObject({nullable: true, schemaEmptiable: true, effectiveTotalRange: {min: '0', max: '0'}});
    for (const name of ['RequiredAfterFlatten', 'RequiredEmpty'])
      expect(view(request.actual, name).root).toMatchObject({kind: 'choice', occurs: {min: '1', max: '1'}, children: [],
        summary: {nullable: false, schemaEmptiable: true}});
    expect(view(request.actual, 'NewlySingleton').root.kind).toBe('element');
    expect(view(request.actual, 'Carrier', 'declared')).toBe(declared);
    expect(JSON.stringify(request.graph)).toBe(before);
  });

  it('keeps raw construction and direct-zero rejection separate from pointless comparison removal', async () => {
    const request = await setup('pointless-optional-choice.xsd'), source = request.actual.lookup(named('Carrier'));
    if (source.kind !== 'found' || source.node.kind !== 'complexType' || !source.node.content) throw new Error('Expected original carrier');
    const original = request.actual.lookup(source.node.content);
    if (original.kind !== 'found' || original.node.kind !== 'particle') throw new Error('Expected original choice');
    const freshId = named('RawCarrier'), fresh: ComplexTypeNode = {...source.node, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace: 'urn:recovery:restriction', local: 'RawCarrier'}}};
    const candidate = request.candidate({key: 'raw-optional-carrier', active: [...request.actual.members, freshId], additions: [fresh],
      rawTypes: [{type: freshId, derivation: {method: 'restriction', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
        abstract: false, final: [], block: [], content: {kind: 'element-only', particle: original.node.id}, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal raw candidate');
    const rawBefore = JSON.stringify(candidate.context.rawTypeProperties(freshId));
    const content = deriveRawComplexContent(candidate.context, freshId);
    if (content.kind !== 'checked') throw new Error('Expected authenticated raw content');
    const declared = prepareSemanticParticleView(candidate.context, content.view, 'declared');
    const normalized = prepareSemanticParticleView(candidate.context, content.view, 'restriction');
    expect(declared).toMatchObject({kind: 'checked', view: {root: {kind: 'choice', occurs: {min: '0', max: '1'}, children: [{}, {}]}}});
    expect(normalized).toMatchObject({kind: 'checked', view: {root: {kind: 'sequence', occurs: {min: '1', max: '1'}, children: []}}});
    expect(checkComponentConstruction(candidate.context, freshId)).toMatchObject({kind: 'checked', obligations: []});
    expect(JSON.stringify(candidate.context.rawTypeProperties(freshId))).toBe(rawBefore);
    const zeroId = scopedId(source.node.id, '/fresh-zero', 'particle');
    const zero: ParticleNode = {...original.node, id: zeroId,
      identity: {kind: 'scoped', owner: source.node.id, path: '/fresh-zero', role: 'particle'}, occurs: {min: '0', max: '0'}};
    const zeroCandidate = request.candidate({key: 'raw-zero-remains-invalid', active: [...request.actual.members, zeroId], additions: [zero]});
    if (zeroCandidate.kind !== 'prepared') throw new Error('Expected zero structural candidate');
    expect(checkComponentConstruction(zeroCandidate.context, zeroId)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct', component: zeroId});
  });

  it('requires authenticated restriction views and preserves sticky request exhaustion', async () => {
    const request = await setup(), derived = view(request.actual, 'ChoiceA'), base = view(request.actual, 'ChoiceAB');
    expect(() => checkParticleRestriction(request.actual, {...derived}, base)).toThrow(/Unauthenticated/);
    expect(checkParticleRestriction(request.actual, view(request.actual, 'ChoiceA', 'declared'), base)).toMatchObject({kind: 'unresolved'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkParticleRestriction(request.actual, derived, base)).toBe(request.budget.failure());
    expect(prepareSemanticParticleView(request.actual, derived.content, 'restriction')).toBe(request.budget.failure());
  });
});

const fixedNamespace = 'urn:research:mixed-fixed';
const fixedId = (local: string) => globalId('type', {namespace: fixedNamespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
async function fixedSubject() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/mixed-fixed-particle-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  const type = (name: string): ComplexTypeNode => {
    const found = actual.lookup(fixedId(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const declaration = (name: string): ElementNode => {
    const node = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element'
      && node.identity.kind === 'scoped' && node.identity.owner === fixedId(name)); assert.ok(node); return node;
  };
  const particle = (context: SemanticContext, name: string): SemanticParticleView => {
    const content = context.kind === 'actual' ? deriveActualComplexContent(context, fixedId(name)) : deriveOriginalComplexPropertyContent(context, fixedId(name));
    assert.equal(content.kind, 'checked');
    const normalized = prepareSemanticParticleView(context, content.view, 'restriction'); assert.equal(normalized.kind, 'checked'); return normalized.view;
  };
  const fresh = ({nonempty = false, simpleFacade = false}: Readonly<{nonempty?: boolean; simpleFacade?: boolean}> = {}) => {
    const template = type('M'), id = fixedId('FreshMixed');
    const nodeId = (suffix: string, role: string) => scopedId(id, suffix, role);
    const left: ElementNode = {...declaration('Same'), id: nodeId('/left', 'element'),
      identity: {kind: 'scoped', owner: id, path: '/left', role: 'element'}, type: local(id)};
    const right: ElementNode = {...left, id: nodeId('/right', 'element'), identity: {kind: 'scoped', owner: id, path: '/right', role: 'element'}};
    const leaf = (suffix: string, declaration: ElementNode): ParticleNode => ({kind: 'particle', id: nodeId(suffix, 'particle'),
      identity: {kind: 'scoped', owner: id, path: suffix, role: 'particle'}, context: template.context,
      occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: local(declaration.id)},
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
    const required: ElementNode = {...left, id: nodeId('/required', 'element'), identity: {kind: 'scoped', owner: id, path: '/required', role: 'element'},
      name: {namespace: '', local: 'required'}, type: builtin('string'), value: undefined};
    const requiredLeaf = leaf('/required-position', required), leftLeaf = leaf('/left-position', left), rightLeaf = leaf('/right-position', right);
    const root: ParticleNode = {...leftLeaf, id: nodeId('/content', 'particle'), identity: {kind: 'scoped', owner: id, path: '/content', role: 'particle'},
      term: {kind: 'sequence', children: nonempty ? [requiredLeaf.id] : []}};
    const derivation = {kind: simpleFacade ? 'extension' as const : 'restriction' as const,
      contentKind: simpleFacade ? 'simple' as const : 'complex' as const,
      base: simpleFacade ? builtin('string') : nonempty ? builtin('anyType') : local(template.id), facets: []};
    const mixed: ComplexTypeNode = {...template, id, identity: {kind: 'global', role: 'type', name: {namespace: fixedNamespace, local: 'FreshMixed'}},
      mixed: !simpleFacade, derivation, content: simpleFacade ? undefined : root.id, attributes: []};
    const additions = [mixed, root, left, right, leftLeaf, rightLeaf, ...(nonempty ? [required, requiredLeaf] : [])];
    const built = request.candidate({key: 'fixed-candidate-' + nonempty + '-' + simpleFacade, active: [...actual.members, ...additions.map(node => node.id)], additions,
      rawTypes: [{type: id, targetNamespace: fixedNamespace, derivation: {method: derivation.kind, base: derivation.base},
        content: simpleFacade ? {kind: 'simple', type: builtin('string')} : {kind: 'mixed', particle: root.id},
        abstract: false, final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}}],
      rawElements: additions.flatMap(node => node.kind === 'element' ? [{element: node.id, type: node.type, final: [], block: []}] : [])});
    assert.equal(built.kind, 'prepared');
    const view = (id: string): SemanticParticleView => {
      const content = deriveModelGroupContent(built.context, id); assert.equal(content.kind, 'checked');
      const normalized = prepareSemanticParticleView(built.context, content.view, 'restriction'); assert.equal(normalized.kind, 'checked'); return normalized.view;
    };
    return {context: built.context, mixed, left, right, derived: view(leftLeaf.id), base: view(rightLeaf.id)};
  };
  return {request, actual, type, declaration, particle, fresh};
}

describe('fixed particle values use assessed declaration scalar types', () => {
  // NameAndTypeOK.3.2.2 compares the value constraint; cos-valid-default
  // separately permits mixed content only when its particle is formally emptiable.
  it.each([
    ['Same', 'Base', true], ['Different', 'Base', false], ['Absent', 'Base', false],
    ['AnySame', 'AnyBase', true], ['AnyDifferent', 'AnyBase', false],
    ['IntSame', 'IntBase', true], ['IntDifferent', 'IntBase', false],
  ] as const)('compares %s against %s as %s without losing component prerequisites', async (derived, base, expected) => {
    const s = await fixedSubject();
    const result = checkParticleRestriction(s.actual, s.particle(s.actual, derived), s.particle(s.actual, base));
    expect(result).toMatchObject({kind: 'checked', value: expected, obligations: ['component-validity', 'particle-local-legality']});
    if (derived === 'Same') {
      assert.equal(result.kind, 'checked');
      expect(result.typeDependencies).toContainEqual({contextId: s.actual.contextId, type: {kind: 'component', id: fixedId('M')}});
    }
  });

  it('checks the whole actual restriction frontier while still refusing direct nonscalar TYPE requests', async () => {
    const s = await fixedSubject(), proof = verifyFiniteRe01Evidence(s.actual, fixedId('Primitive'), {root: {kind: 'primitive-no-change'}, nodes: []});
    expect(proof).toMatchObject({kind: 'checked-primitive', proof: []}); assert.equal(proof.kind, 'checked-primitive');
    expect(s.actual.members).toHaveLength(47);
    expect(new Set(proof.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    expect(proof.actualComponents.flatMap(item => item.obligations)).toEqual([]);
    expect(proof.actualComponents.find(item => item.component === fixedId('Restriction'))).toMatchObject({kind: 'checked'});
    const declaration = s.declaration('Same'); assert.ok(declaration.value);
    const scalar = createSchemaScalarKernel(s.actual);
    expect(scalar.assess(local(fixedId('M')), declaration.value.lexical, declaration.id))
      .toMatchObject({kind: 'unresolved', rule: 'simple-content-variety'});
    expect(scalar.assess(builtin('anyType'), declaration.value.lexical, declaration.id))
      .toMatchObject({kind: 'invalid-schema', rule: 'src-simple-type'});
  });

  it('retains both current-context declared types when their assessed value types coincide', async () => {
    const s = await fixedSubject(), f = s.fresh();
    expect(checkComponentConstruction(f.context, f.mixed.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(checkComponentConstruction(f.context, f.left.id)).toMatchObject({kind: 'checked', obligations: []});
    const result = checkParticleRestriction(f.context, f.derived, s.particle(f.context, 'Base')); assert.equal(result.kind, 'checked');
    expect(result.value).toBe(true);
    for (const id of [f.mixed.id, fixedId('M')])
      expect(result.typeDependencies).toContainEqual({contextId: f.context.contextId, type: {kind: 'component', id}});
  });

  it('leaves mixed emptiability with full declaration validity instead of certifying it through string equality', async () => {
    const s = await fixedSubject(), f = s.fresh({nonempty: true});
    expect(checkComponentConstruction(f.context, f.mixed.id)).toMatchObject({kind: 'checked', obligations: []});
    const declaration = checkDeclaration(f.context, f.left.id); assert.equal(declaration.kind, 'checked');
    expect(declaration.obligations).toContain('element-default-mixed-emptiable:' + f.mixed.id);
    expect(checkParticleRestriction(f.context, f.derived, f.base)).toMatchObject({kind: 'checked', value: true,
      obligations: ['component-validity', 'particle-local-legality']});
    expect(checkComponentConstruction(f.context, f.left.id)).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.2'});
  });

  it('keeps undischarged scalar formation prerequisites pending for an equal raw simple-content facade', async () => {
    const s = await fixedSubject(), f = s.fresh({simpleFacade: true});
    const declaration = checkDeclaration(f.context, f.left.id); assert.equal(declaration.kind, 'checked');
    expect(declaration.scalarObligations).toContainEqual({rule: 'raw-simple-content-derivation-validity', component: f.mixed.id});
    expect(checkParticleRestriction(f.context, f.derived, f.base)).toMatchObject({kind: 'unresolved', rule: 'cos-particle-restrict'});
  });
});
