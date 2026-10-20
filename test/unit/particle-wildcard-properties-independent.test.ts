/** Expected component properties include finite EMPTY; lexical placeholders never define their semantics. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../src/compiler/hypotheticalScopedIdentity.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate, graphForSemanticContext} from '../../src/compiler/semanticContext.js';
import type {SemanticCandidateDelta, SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {prepareRawParticleWildcardProperties} from '../../src/compiler/schemaParticleWildcardProperties.js';
import type {RawParticleWildcardProperties} from '../../src/compiler/schemaParticleWildcardProperties.js';
import {deriveActualComplexContent, deriveBuiltinAnyTypeContent, deriveModelGroupContent, deriveRawComplexContent, particleContentNode} from '../../src/compiler/complexTypeContent.js';
import {assertSemanticParticleView, prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {checkDeclaredParticleLegality} from '../../src/compiler/particleLocalAssessment.js';
import {checkRawParticleExtension} from '../../src/compiler/particleExtension.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';
import {analyzeOccurrences} from '../../src/compiler/occurrenceAnalysis.js';
import {compareComponentProperties} from '../../src/compiler/schemaComponentEquality.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import {assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import {declarationMethods} from '../../src/compiler/schemaTypeRelations.js';
import {checkCandidateCorrespondence} from '../../src/compiler/re01CandidateCorrespondence.js';
import {wildcardNamespaces} from '../../src/compiler/wildcardAlgebra.js';

const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:abstract-particle-wildcard';
const tid = (name: string) => globalId('type', {namespace, local: name});
const empty = {kind: 'set', namespaces: []} as const;
async function subject() {
  const loaded = await loadSchemaInput(path.join(directory, 'xsd/recovery/abstract-particle-wildcard-properties.xsd'),
    {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, found = request.actual.lookup(tid('D')); assert.equal(found.kind, 'found');
  assert.equal(found.node.kind, 'complexType'); const d = found.node;
  const common = {context: d.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const particle = (slot: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...common,
    id: hypotheticalScopedId(d.id, '/wildcard/' + slot, 'particle'), kind: 'particle',
    identity: {kind: 'scoped', owner: d.id, path: '/wildcard/' + slot, role: 'particle'}, occurs: {min, max}, term});
  const any = (slot: string, min = '1', lexical = '##any', processContents: RawParticleWildcardProperties['processContents'] = 'skip') => particle(slot,
    {kind: 'any', wildcard: {namespace: {value: lexical, context: d.context}, processContents}}, min);
  const declaration = (slot: string): ElementNode => ({...common,
    id: hypotheticalScopedId(d.id, '/wildcard/' + slot, 'element'), kind: 'element',
    identity: {kind: 'scoped', owner: d.id, path: '/wildcard/' + slot, role: 'element'},
    name: {namespace: 'urn:a', local: 'a'}, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}},
    nillable: false, abstract: false});
  const tuple = (node: ParticleNode, constraint = empty as RawParticleWildcardProperties['namespace'], processContents = 'strict' as const): RawParticleWildcardProperties =>
    ({particle: node.id, namespace: constraint, processContents});
  const prepare = (additions: readonly GraphNode[], rawParticleWildcards: readonly RawParticleWildcardProperties[] = []) => {
    const result = request.candidate({key: 'particle-properties', active: [...request.actual.members, ...additions.map(node => node.id)],
      additions, rawParticleWildcards});
    assert.equal(result.kind, 'prepared', JSON.stringify(result)); return result.context;
  };
  return {request, d, particle, any, declaration, tuple, prepare};
}
function content(context: SemanticContext, particle: string) {
  const value = deriveModelGroupContent(context, particle); assert.equal(value.kind, 'checked'); return value.view;
}
function view(context: SemanticContext, particle: string, purpose: 'declared' | 'restriction' = 'declared') {
  const result = prepareSemanticParticleView(context, content(context, particle), purpose); assert.equal(result.kind, 'checked'); return result.view;
}

describe('fresh particle wildcard property boundary', () => {
  it.each(['1', '0'])('keeps EMPTY realization distinct from formal ETR for min=%s', async min => {
    const s = await subject(), w = s.any('empty', min), context = s.prepare([w], [s.tuple(w)]);
    const semantic = view(context, w.id);
    expect(semantic.root.summary).toMatchObject({nullable: min === '0', hasRealization: min === '0',
      wildcard: {min: '0', max: '0'}, elements: [], effectiveTotalRange: {min, max: '1'}, schemaEmptiable: min === '0'});
    expect(semantic.root.wildcard).toMatchObject({namespace: empty, processContents: 'strict'});
    expect(semantic.root.urTypeWildcard).toBe(false);
    expect(checkComponentConstruction(context, w.id)).toMatchObject({kind: 'checked', obligations: []});
    const graph = graphForSemanticContext(context), ordinary = analyzeOccurrences({resolved: {graph, links: [], metrics: {steps: 0}}, types: [], metrics: {steps: 0}});
    assert.equal(ordinary.kind, 'analyzed');
    // Canonical-only analysis still requires schema assessment and keeps its qualified lexical ANY default.
    expect(ordinary.analysis.particles.find(item => item.id === w.id)?.hasRealization).toBe(true);
    expect(ordinary.analysis.assessment).toBe('requires-schema-assessment');
    expect(() => assertSemanticParticleView(context, {...semantic})).toThrow(/Unauthenticated/);
  });

  it('uses the collapsed wrapper ID for occurrence viability', async () => {
    const s = await subject(), w = s.any('empty'), wrapper = s.particle('wrapper', {kind: 'sequence', children: [w.id]});
    const context = s.prepare([w, wrapper], [s.tuple(w)]), semantic = view(context, wrapper.id, 'restriction');
    expect(semantic.root.id).not.toBe(w.id); expect(semantic.root.kind).toBe('any');
    expect(semantic.root.summary).toMatchObject({nullable: false, hasRealization: false,
      effectiveTotalRange: {min: '1', max: '1'}, wildcard: {min: '0', max: '0'}});
    expect(semantic.root.wildcard?.namespace).toEqual(empty);
  });

  it.each([['1', true], ['0', false]] as const)('keeps reachable-prefix UPA after EMPTY min=%s', async (min, expected) => {
    const s = await subject(), w = s.any('barrier', min), a1 = s.declaration('a1'), a2 = s.declaration('a2');
    const p1 = s.particle('p1', {kind: 'element', declaration: {kind: 'local', target: a1.id}});
    const p2 = s.particle('p2', {kind: 'element', declaration: {kind: 'local', target: a2.id}});
    const choice = s.particle('ambiguous', {kind: 'choice', children: [p1.id, p2.id]});
    const root = s.particle('barrier-root', {kind: 'sequence', children: [w.id, choice.id]});
    const context = s.prepare([w, a1, a2, p1, p2, choice, root], [s.tuple(w)]);
    expect(checkDeclaredParticleLegality(context, view(context, root.id))).toMatchObject({kind: 'checked', value: expected,
      ...(expected ? {} : {failedRule: 'cos-nonambig'})});
    expect(view(context, root.id).root.summary).toMatchObject({hasRealization: min === '0', nullable: false,
      effectiveTotalRange: {min: min === '0' ? '1' : '2', max: '2'}, schemaEmptiable: false, wildcard: {min: '0', max: '0'}});
  });

  it('has no phantom ambiguity edge and preserves raw property/process equality', async () => {
    const s = await subject(), x = s.any('x'), y = s.any('y'), ordinary = s.any('ordinary', '1', '##any', 'strict');
    const strictSet = s.any('strict-set'), weakSet = s.any('weak-set');
    const outer = s.particle('outer', {kind: 'sequence', children: [y.id]});
    const weakOuter = s.particle('weak-outer', {kind: 'sequence', children: [weakSet.id]});
    const ordinaryOuter = s.particle('ordinary-outer', {kind: 'sequence', children: [ordinary.id]});
    const context = s.prepare([x, y, ordinary, strictSet, weakSet, outer, weakOuter, ordinaryOuter],
      [s.tuple(x), s.tuple(y), s.tuple(strictSet, {kind: 'set', namespaces: ['urn:b', 'urn:a', 'urn:a']}),
        {...s.tuple(weakSet, {kind: 'set', namespaces: ['urn:a', 'urn:b']}), processContents: 'lax'}]);
    expect(context.rawParticleWildcardProperties(strictSet.id)?.namespace).toEqual({kind: 'set', namespaces: ['urn:a', 'urn:b']});
    expect(checkRawParticleExtension(context, content(context, outer.id), content(context, x.id))).toMatchObject({kind: 'checked', value: true});
    expect(checkRawParticleExtension(context, content(context, ordinaryOuter.id), content(context, x.id))).toMatchObject({kind: 'checked', value: false});
    expect(checkRawParticleExtension(context, content(context, weakOuter.id), content(context, strictSet.id))).toMatchObject({kind: 'checked', value: false});
    expect(checkDeclaredParticleLegality(context, view(context, outer.id))).toMatchObject({kind: 'checked', value: true});
  });

  it('applies the PW namespace subset direction and process strength to selected properties', async () => {
    const s = await subject(), w = s.any('empty'), singleton = s.any('singleton'), weak = s.any('weak');
    const context = s.prepare([w, singleton, weak], [s.tuple(w), s.tuple(singleton, {kind: 'set', namespaces: ['urn:a']}),
      {...s.tuple(weak), processContents: 'skip'}]);
    expect(checkParticleRestriction(context, view(context, w.id, 'restriction'), view(context, singleton.id, 'restriction'))).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(context, view(context, singleton.id, 'restriction'), view(context, w.id, 'restriction'))).toMatchObject({kind: 'checked', value: false});
    expect(checkParticleRestriction(context, view(context, weak.id, 'restriction'), view(context, singleton.id, 'restriction'))).toMatchObject({kind: 'checked', value: false});
  });

  it('compares complete anonymous type content by the same selected namespace properties', async () => {
    const s = await subject(), x = s.any('equal-x'), y = s.any('equal-y'), ordinary = s.any('equal-ordinary', '1', '##any', 'strict');
    const f1 = s.any('finite-1'), f2 = s.any('finite-2');
    const particles = [x, y, ordinary, f1, f2];
    const types: ComplexTypeNode[] = particles.map((particle, index) => ({...s.d,
      id: hypotheticalScopedId(s.d.id, '/wildcard/type-' + index, 'type'),
      identity: {kind: 'scoped', owner: s.d.id, path: '/wildcard/type-' + index, role: 'type'},
      content: particle.id, derivation: {kind: 'extension', contentKind: 'complex', base: {kind: 'local', target: tid('A')}, facets: []},
      declaredAttributes: [], syntaxDetails: [], annotations: [], retained: []}));
    const rawTypes: RawComplexTypeProperties[] = types.map(node => ({type: node.id, targetNamespace: namespace,
      derivation: {method: 'extension', base: {kind: 'local', target: tid('A')}}, content: {kind: 'element-only', particle: node.content!},
      abstract: false, final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}}));
    const additions = [...particles, ...types], built = s.request.candidate({key: 'property-equality', additions,
      active: [...s.request.actual.members, ...additions.map(node => node.id)], rawTypes,
      rawParticleWildcards: [s.tuple(x), s.tuple(y), s.tuple(f1, {kind: 'set', namespaces: ['urn:b', 'urn:a', 'urn:a']}),
        s.tuple(f2, {kind: 'set', namespaces: ['urn:a', 'urn:b']})]});
    assert.equal(built.kind, 'prepared');
    const node = (index: number) => {const found = built.context.lookup(types[index].id); assert.equal(found.kind, 'found'); return found.node;};
    expect(compareComponentProperties(built.context, node(0), node(1))).toMatchObject({kind: 'checked', value: true});
    expect(compareComponentProperties(built.context, node(0), node(2))).toMatchObject({kind: 'checked', value: false});
    expect(compareComponentProperties(built.context, node(3), node(4))).toMatchObject({kind: 'checked', value: true});
  });

  it('inherits the exact immutable tuple and refuses any late or repeated installation', async () => {
    const s = await subject(), w = s.any('inherited'), late = s.any('late');
    const namespaces: string[] = ['urn:b', 'urn:a'], input = s.tuple(w, {kind: 'set', namespaces});
    const parent = s.prepare([w, late], [input]); namespaces.push('urn:changed');
    const fork = (context: SemanticContext, rows?: readonly RawParticleWildcardProperties[], active = context.members) =>
      forkSemanticCandidate(context, {key: 'inheritance', active, rawParticleWildcards: rows});
    const child = fork(parent); assert.equal(child.kind, 'prepared');
    expect(child.context.rawParticleWildcardProperties(w.id)).toEqual(parent.rawParticleWildcardProperties(w.id));
    expect(child.context.rawParticleWildcardProperties(w.id)?.namespace.namespaces).toEqual(['urn:a', 'urn:b']);
    expect(Object.isFrozen(child.context.rawParticleWildcardProperties(w.id)?.namespace.namespaces)).toBe(true);
    for (const row of [input, {...input, processContents: 'lax'} as const, s.tuple(late)])
      expect(fork(parent, [row]).kind).toBe('candidate-rejected');
    const inactive = fork(parent, undefined, parent.members.filter(id => id !== late.id)); assert.equal(inactive.kind, 'prepared');
    expect(fork(inactive.context, [s.tuple(late)], parent.members).kind).toBe('candidate-rejected');
    const inactiveTuple = fork(parent, undefined, parent.members.filter(id => id !== w.id)); assert.equal(inactiveTuple.kind, 'prepared');
    const restored = fork(inactiveTuple.context, undefined, parent.members); assert.equal(restored.kind, 'prepared');
    expect(restored.context.rawParticleWildcardProperties(w.id)).toEqual(parent.rawParticleWildcardProperties(w.id));
  });

  it('rejects original/private/wrong-kind/duplicate/unsupported property owners', async () => {
    const s = await subject(), w = s.any('admission'), sequence = s.particle('not-any', {kind: 'sequence', children: []});
    const source = s.request.actual.lookup(tid('B0')); assert.equal(source.kind, 'found'); assert.equal(source.node.kind, 'complexType');
    const sourceRoot = s.request.actual.lookup(source.node.content!); assert.equal(sourceRoot.kind, 'found');
    assert.equal(sourceRoot.node.kind, 'particle'); assert.equal(sourceRoot.node.term.kind, 'sequence');
    const native = deriveBuiltinAnyTypeContent(s.request.actual, s.d.id); assert.equal(native.kind, 'checked');
    const nativeView = prepareSemanticParticleView(s.request.actual, native.view, 'declared'); assert.equal(nativeView.kind, 'checked');
    expect(nativeView.view.root.children[0]).toMatchObject({urTypeWildcard: true,
      wildcard: {namespace: {kind: 'not', namespaces: []}, processContents: 'lax'}});
    const ordinary = s.prepare([w], [{...s.tuple(w, {kind: 'not', namespaces: []}), processContents: 'lax'}]);
    expect(view(ordinary, w.id).root).toMatchObject({urTypeWildcard: false,
      wildcard: {namespace: {kind: 'not', namespaces: []}, processContents: 'lax'}});
    const reject = (rows: unknown, additions: readonly GraphNode[] = [w]) => s.request.candidate({key: 'bad-owner',
      active: [...s.request.actual.members, ...additions.map(node => node.id)], additions, rawParticleWildcards: rows} as SemanticCandidateDelta);
    expect(reject([s.tuple(w), s.tuple(w)]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), particle: sourceRoot.node.id}]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), particle: sourceRoot.node.term.children[0]}]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), particle: s.d.id}]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), particle: native.view.urTypeWildcards[0]}]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), particle: 'missing'}]).kind).toBe('candidate-rejected');
    expect(reject([s.tuple(sequence)], [sequence]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), urTypeWildcard: true}]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), namespace: {...empty, origin: 'source'}}]).kind).toBe('candidate-rejected');
    expect(reject([{...s.tuple(w), processContents: 'invalid'}]).kind).toBe('candidate-rejected');
    let calls = 0;
    expect(reject([{particle: w.id, get namespace() {calls++; return empty;}, processContents: 'strict'}]).kind).toBe('candidate-rejected');
    expect(calls).toBe(0);
  });

  it('keeps unexpressible complements and lexical-only empty spellings rejected', async () => {
    const s = await subject(), badSet = s.any('bad-set'), lexical = s.any('bad-lexical', '1', ''), allowedNot = s.any('not-set');
    const zero = {...s.any('zero'), occurs: {min: '0', max: '0'}};
    const context = s.prepare([badSet, lexical, zero, allowedNot], [s.tuple(badSet, {kind: 'not', namespaces: ['urn:a', 'urn:b']}), s.tuple(zero),
      s.tuple(allowedNot, {kind: 'not', namespaces: ['urn:a', '', 'urn:a']})]);
    expect(context.rawParticleWildcardProperties(allowedNot.id)?.namespace).toEqual({kind: 'not', namespaces: ['', 'urn:a']});
    expect(checkComponentConstruction(context, allowedNot.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(checkComponentConstruction(context, badSet.id)).toMatchObject({kind: 'candidate-rejected', rule: 'wildcard-properties'});
    expect(checkComponentConstruction(context, lexical.id)).toMatchObject({kind: 'candidate-rejected'});
    expect(checkComponentConstruction(context, zero.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
  });

  it('compares generated original endpoint wildcards with the candidate tuple, retaining source origin separately', async () => {
    const loaded = await loadSchemaInput(path.join(directory, 'xsd/recovery/original-construction-inputs-independent.xsd'),
      {policy: {fileRoots: [directory]}});
    const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
    const {request} = prepared, actual = request.actual;
    const id = (name: string) => globalId('type', {namespace: 'urn:recovery:consumed-wrapper', local: name});
    const original = (name: string): ComplexTypeNode => {
      const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
    };
    const ur = original('Ur'), x = original('X'), originals = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType');
    const maps = new Map(originals.map(node => {const mapped = deriveActualComplexContent(actual, node.id);
      assert.equal(mapped.kind, 'checked'); return [node.id, mapped.view] as const;}));
    const source = maps.get(ur.id)!; assert.ok('particle' in source.content); expect(source.urTypeWildcards).not.toHaveLength(0);
    const particles = source.synthetic.map(target => {const node = particleContentNode(actual, source, target);
      assert.ok(node); assert.equal(node.kind, 'particle'); return node;});
    const renamed = new Map(particles.map((node, index) => [node.id, hypotheticalScopedId(ur.id, '/tuple-source/' + index, 'particle')]));
    const copies: ParticleNode[] = particles.map((node, index) => ({...node, id: renamed.get(node.id)!,
      identity: {kind: 'scoped', owner: ur.id, path: '/tuple-source/' + index, role: 'particle'},
      term: 'children' in node.term ? {...node.term, children: node.term.children.map(child => renamed.get(child) ?? child)}
        : node.term.kind === 'any' ? {kind: 'any', wildcard: {namespace: {...node.term.wildcard.namespace, value: '##local'}, processContents: 'strict'}} : node.term}));
    const tuples: RawParticleWildcardProperties[] = particles.flatMap(node => node.term.kind === 'any' ? [{particle: renamed.get(node.id)!,
      namespace: wildcardNamespaces(node.term.wildcard), processContents: node.term.wildcard.processContents}] : []);
    const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: {kind: 'local', target: id('B')}, facets: []}};
    const rawTypes: RawComplexTypeProperties[] = originals.map(node => {
      const selected = node.id === x.id ? endpoint : node, attributes = assessSourceAttributeUses(actual, node.id);
      assert.equal(attributes.kind, 'checked');
      const prior = maps.get(node.id)!.content;
      const content = node.id === ur.id && 'particle' in prior ? {...prior, particle: renamed.get(prior.particle)!} : prior;
      return {type: node.id, targetNamespace: node.context.effectiveNamespace, content,
        derivation: {method: selected.derivation?.kind ?? 'restriction', base: selected.derivation?.base ?? {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
        abstract: node.abstract, final: declarationMethods(actual, node, 'final') as RawComplexTypeProperties['final'],
        block: declarationMethods(actual, node, 'block') as RawComplexTypeProperties['block'],
        attributeUses: attributes.value.uses.map(use => use.id), wildcard: attributes.value.wildcard,
        provenance: {kind: 'actual-mapped', original: node.id}};
    });
    const prepare = (rows: readonly RawParticleWildcardProperties[]) => {
      const result = request.candidate({key: 'tuple-source-correspondence', endpoint, additions: copies,
        active: [...actual.members, ...copies.map(node => node.id)], rawTypes, rawParticleWildcards: rows});
      assert.equal(result.kind, 'prepared', JSON.stringify(result)); return result.context;
    };
    const compare = (context: SemanticContext) => checkCandidateCorrespondence(actual, actual, context, x.id, id('B'), {kind: 'local', target: id('A')});
    const context = prepare(tuples);
    expect(compare(context)).toMatchObject({kind: 'checked'});
    const mapped = deriveRawComplexContent(context, ur.id); assert.equal(mapped.kind, 'checked');
    expect(mapped.view.urTypeWildcards).toEqual([]);
    const native = prepareSemanticParticleView(actual, source, 'declared'); assert.equal(native.kind, 'checked');
    const pending = [native.view.root], nativeWildcards = [];
    while (pending.length) {const item = pending.pop()!; if (item.wildcard) nativeWildcards.push(item); pending.push(...item.children);}
    expect(nativeWildcards.some(item => item.urTypeWildcard)).toBe(true);
    expect(compare(prepare(tuples.map(row => ({...row, namespace: empty}))))).toMatchObject({kind: 'candidate-rejected', rule: 'endpoint-raw-wildcard', component: ur.id});
    expect(compare(prepare(tuples.map(row => ({...row, processContents: 'strict'}))))).toMatchObject({kind: 'candidate-rejected', rule: 'endpoint-raw-wildcard', component: ur.id});
  });

  it('precharges canonicalization and retains sticky one-below exhaustion', () => {
    const input = {particle: 'fresh', namespace: {kind: 'set', namespaces: ['z'.repeat(128), 'a'.repeat(128), 'z'.repeat(128)]}, processContents: 'lax'};
    const measured = createSemanticBudget(), result = measured.guard(() => prepareRawParticleWildcardProperties(input, measured));
    expect(result).toMatchObject({namespace: {kind: 'set', namespaces: ['a'.repeat(128), 'z'.repeat(128)]}});
    const work = measured.usage().work, exact = createSemanticBudget({maxWork: work});
    expect(exact.guard(() => prepareRawParticleWildcardProperties(input, exact))).toEqual(result);
    const short = createSemanticBudget({maxWork: work - 1}), failed = short.guard(() => prepareRawParticleWildcardProperties(input, short));
    expect(failed).toBe(short.failure()); expect(short.exhausted()).toBe(true);
    expect(short.guard(() => prepareRawParticleWildcardProperties(input, short))).toBe(failed);
  });
});
