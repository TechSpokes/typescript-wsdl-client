/** An unchanged source UR leaf can be borrowed under real new FULL roots. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, GroupNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveModelGroupContent, deriveOriginalComplexParticle, deriveOriginalUrWildcard,
  deriveRawComplexContent, originalUrWildcardSource, particleContentNode} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticCandidateDelta, SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {OriginalUrWildcardHandle, RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:source-ur-prefix';
const local = (target: string): Reference => ({kind: 'local', target});
async function seed() {
  const loaded = await loadSchemaInput(path.join(directory, 'xsd/recovery/source-ur-wildcard-borrowing.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  const type = (name: string): ComplexTypeNode => {
    const found = actual.lookup(globalId('type', {namespace, local: name})); assert.equal(found.kind, 'found');
    assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const A = type('A'), G = type('G'), D = type('D');
  const whole = (node: ComplexTypeNode) => {const result = deriveOriginalComplexParticle(actual, node.id); assert.equal(result.kind, 'checked'); return result.content;};
  const wholeA = whole(A); assert.ok(wholeA.original);
  const source = deriveActualComplexContent(actual, A.id); assert.equal(source.kind, 'checked'); assert.ok('particle' in source.view.content);
  const root = source.view.content.particle, urId = source.view.urTypeWildcards[0]!;
  const selected = deriveOriginalUrWildcard(actual, wholeA.original, urId); assert.equal(selected.kind, 'checked');
  const native = originalUrWildcardSource(actual, selected.handle);
  const row = (node: ComplexTypeNode, content: RawComplexContent): RawComplexTypeProperties => {
    const inherited = actual.lookup(node.id).kind === 'found', attrs = assessSourceAttributeUses(actual, inherited ? node.id : A.id);
    assert.equal(attrs.kind, 'checked');
    return {type: node.id, targetNamespace: namespace, derivation: {base: node.derivation!.base, method: node.derivation!.kind},
      abstract: false, final: [], block: [], content, attributeUses: attrs.value.uses.map(use => use.id),
      wildcard: inherited ? attrs.value.wildcard : {namespace: {kind: 'not', namespaces: []}, processContents: 'skip', sources: []},
      provenance: {kind: 'hypothetical-abstract', originals: inherited ? [node.id] : []}};
  };
  const originals = [A, G, D].map(node => row(node, whole(node)));
  const q: ComplexTypeNode = {...A, id: hypotheticalScopedId(D.id, '/ur/q', 'type'),
    identity: {kind: 'scoped', owner: D.id, path: '/ur/q', role: 'type'}, content: undefined, attributes: [],
    derivation: {kind: 'extension', contentKind: 'complex', base: local(A.id), facets: []}};
  const build = (mode: 'borrow' | 'ordinary' | 'missing' | 'whole-a' | 'whole-g' | 'whole-d' | 'prefix-only' | 'group' = 'borrow') => {
    const additions: GraphNode[] = [q], map = new Map<string, string>();
    const make = (slot: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({kind: 'particle',
      id: hypotheticalScopedId(q.id, slot, 'particle'), identity: {kind: 'scoped', owner: q.id, path: slot, role: 'particle'},
      context: D.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], occurs: {min, max}, term});
    const clone = (old: string): string => {
      if (old === urId && mode !== 'ordinary') return old;
      const prior = map.get(old); if (prior) return prior;
      const node = particleContentNode(actual, source.view, old); assert.ok(node); assert.equal(node.kind, 'particle');
      const slot = '/copy/' + map.size, id = hypotheticalScopedId(q.id, slot, 'particle'); map.set(old, id);
      const term: ParticleNode['term'] = 'children' in node.term ? {...node.term, children: node.term.children.map(clone)} : node.term;
      additions.push({...node, id, identity: {kind: 'scoped', owner: q.id, path: slot, role: 'particle'}, term}); return id;
    };
    let content: RawComplexContent;
    if (mode.startsWith('whole-')) content = whole(mode === 'whole-a' ? A : mode === 'whole-g' ? G : D);
    else {
      let prefix = clone(root);
      if (mode === 'group') {
        const group: GroupNode = {kind: 'group', id: globalId('group', {namespace, local: 'FreshPrefix'}),
          identity: {kind: 'global', role: 'group', name: {namespace, local: 'FreshPrefix'}}, content: prefix,
          context: D.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
        const use = make('/group-use', {kind: 'group', reference: local(group.id)}); additions.push(group, use); prefix = use.id;
      }
      const tail = make('/tail', {kind: 'any', wildcard: {namespace: {value: '##any', context: D.context}, processContents: 'skip'}}, '0', 'unbounded');
      const top = make('/top', {kind: 'sequence', children: mode === 'prefix-only' ? [prefix] : [prefix, tail.id]});
      if (mode !== 'prefix-only') additions.push(tail); additions.push(top); content = {kind: 'mixed', particle: top.id};
    }
    const endpoint: ComplexTypeNode = {...D, derivation: {kind: 'restriction', contentKind: 'complex', base: local(q.id), facets: []}};
    const borrowed = mode !== 'ordinary' && mode !== 'missing' && !mode.startsWith('whole-');
    const delta: SemanticCandidateDelta = {key: 'ur-' + mode, endpoint, additions, active: [...actual.members, ...additions.map(node => node.id)],
      rawTypes: [...originals.filter(item => item.type !== D.id), row(endpoint, whole(D)), row(q, content)],
      ...(borrowed ? {originalUrWildcards: [selected.handle]} : {})};
    return {delta, additions, result: request.candidate(delta)};
  };
  return {request, actual, A, G, D, q, source: source.view, wholeA, root, urId, handle: selected.handle, native, build};
}
function view(context: SemanticContext, type: string) {
  const content = deriveRawComplexContent(context, type); assert.equal(content.kind, 'checked');
  const normalized = prepareSemanticParticleView(context, content.view, 'restriction'); assert.equal(normalized.kind, 'checked');
  return {content: content.view, normalized: normalized.view};
}

describe('authenticated native UR leaf borrowing', () => {
  it.each(['borrow', 'group'] as const)('constructs a complete proper-prefix forest with real %s wrapper roots', async mode => {
    const s = await seed(), snapshot = JSON.stringify(s.request.graph), built = s.build(mode); assert.equal(built.result.kind, 'prepared');
    const context = built.result.context, q = view(context, s.q.id), d = view(context, s.D.id), a = view(context, s.A.id);
    expect(context.lookup(s.urId).kind).toBe('missing'); expect(context.members).not.toContain(s.urId);
    expect(q.content.urTypeWildcards).toContain(s.urId);
    const rawExtension = checkRawParticleExtension(context, q.content, a.content);
    expect(rawExtension, JSON.stringify(rawExtension)).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(context, d.normalized, q.normalized)).toMatchObject({kind: 'checked', value: true});
    const forest = verifyFiniteRe01Evidence(s.actual, s.D.id, {root: 'D', nodes: [{id: 'D', parent: s.actual, context,
      target: s.D.id, intermediate: s.q.id, ancestor: local(s.A.id), premises: []}]});
    assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest)); expect(forest.proof).toHaveLength(1);
    for (const node of built.additions) {
      expect(forest.proof[0]!.components.some(component => component.component === node.id)).toBe(true);
      expect(checkComponentConstruction(context, node.id)).toMatchObject({kind: 'checked', obligations: []});
      if (node.kind === 'particle' && 'children' in node.term || node.kind === 'group') {
        const content = deriveModelGroupContent(context, node.id); assert.equal(content.kind, 'checked');
        expect(content.view.urTypeWildcards).toContain(s.urId);
      }
    }
    const child = forkSemanticCandidate(context, {key: 'inherit', active: context.members}); assert.equal(child.kind, 'prepared');
    expect(child.context.originalUrWildcard(s.urId)).toBe(s.handle);
    for (const node of built.additions) expect(checkComponentConstruction(child.context, node.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(JSON.stringify(s.request.graph)).toBe(snapshot);
  });

  it.each(['ordinary', 'whole-a', 'whole-g', 'whole-d', 'prefix-only'] as const)('keeps the %s contrast rejected', async mode => {
    const s = await seed(), built = s.build(mode); assert.equal(built.result.kind, 'prepared');
    const context = built.result.context, q = view(context, s.q.id), d = view(context, s.D.id), a = view(context, s.A.id);
    const extension = checkRawParticleExtension(context, q.content, a.content); assert.equal(extension.kind, 'checked');
    const restriction = checkParticleRestriction(context, d.normalized, q.normalized); assert.equal(restriction.kind, 'checked');
    expect(extension.value && restriction.value).toBe(false);
    expect(extension.value).toBe(mode !== 'whole-g' && mode !== 'whole-d');
    expect(restriction.value).toBe(mode === 'whole-d');
    if (mode === 'ordinary') {expect(q.content.urTypeWildcards).toEqual([]); expect(checkComponentConstruction(context, s.q.id).kind).toBe('checked');}
  });

  it('rejects an unselected private leaf and never imports it as an active component', async () => {
    const s = await seed(), missing = s.build('missing'); expect(missing.result).toMatchObject({kind: 'candidate-rejected', code: 'missing', component: s.urId});
    const built = s.build();
    expect(s.request.candidate({...built.delta, active: [...built.delta.active, s.urId]})).toMatchObject({kind: 'candidate-rejected', code: 'missing'});
    expect(s.request.candidate({...built.delta, additions: [...built.additions, s.native], active: [...built.delta.active, s.urId]}).kind).toBe('candidate-rejected');
  });

  it('rejects forged, foreign and mutated handles before issuing views', async () => {
    const s = await seed(), other = await seed(), built = s.build();
    for (const token of [{...s.handle}, {...s.handle, particle: s.root}, {...s.handle, min: '1'}, {...s.handle, processContents: 'skip'},
      {...s.handle, namespace: 'urn:forged'}, other.handle]) {
      expect(s.request.candidate({...built.delta, originalUrWildcards: [token as OriginalUrWildcardHandle]}))
        .toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    }
    expect(deriveOriginalUrWildcard(s.actual, s.wholeA.original!, s.root)).toMatchObject({kind: 'unresolved', rule: 'original-ur-wildcard'});
    expect(() => deriveOriginalUrWildcard(other.actual, s.wholeA.original!, s.urId)).toThrow(/foreign/);
    expect(deriveOriginalUrWildcard(s.actual, s.wholeA.original!, s.urId)).toMatchObject({kind: 'checked', handle: s.handle});
  });

  it('rejects wildcard overrides and preserves inherited selections', async () => {
    const s = await seed(), built = s.build(); assert.equal(built.result.kind, 'prepared');
    const override = {particle: s.urId, namespace: {kind: 'not' as const, namespaces: []}, processContents: 'skip' as const};
    expect(s.request.candidate({...built.delta, rawParticleWildcards: [override]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    expect(forkSemanticCandidate(built.result.context, {key: 'override', active: built.result.context.members, rawParticleWildcards: [override]}).kind).toBe('candidate-rejected');
    expect(forkSemanticCandidate(built.result.context, {key: 'duplicate', active: built.result.context.members, originalUrWildcards: [s.handle]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity'});
  });

  it('checks inactive stored tuples and still rejects genuine containment cycles', async () => {
    const s = await seed(); assert.equal(s.native.identity.kind, 'scoped');
    const collision: ParticleNode = {...s.native, id: hypotheticalScopedId(s.native.identity.owner, s.native.identity.path, s.native.identity.role)};
    const prior = s.request.candidate({key: 'stored-tuple', additions: [collision], active: [...s.actual.members, collision.id]}); assert.equal(prior.kind, 'prepared');
    expect(forkSemanticCandidate(prior.context, {key: 'inactive-collision', active: s.actual.members, originalUrWildcards: [s.handle]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'identity', component: collision.id});
    const built = s.build(), top = built.additions.find(node => node.kind === 'particle' && node.identity.kind === 'scoped' && node.identity.path === '/top');
    assert.ok(top); assert.equal(top.kind, 'particle');
    const cycle: ParticleNode = {...top, term: {kind: 'sequence', children: [s.urId, top.id]}};
    expect(s.request.candidate({...built.delta, additions: built.additions.map(node => node.id === top.id ? cycle : node)}))
      .toMatchObject({kind: 'candidate-rejected', code: 'cycle'});
  });

  it('borrows provenance without creating an owner FULL dependency', async () => {
    const s = await seed(), wrapper: ParticleNode = {...s.native, id: hypotheticalScopedId(s.D.id, '/leaf-only', 'particle'),
      identity: {kind: 'scoped', owner: s.D.id, path: '/leaf-only', role: 'particle'}, occurs: {min: '1', max: '1'},
      term: {kind: 'sequence', children: [s.urId]}};
    const built = s.request.candidate({key: 'leaf-only', additions: [wrapper], active: [...s.actual.members, wrapper.id], originalUrWildcards: [s.handle]});
    assert.equal(built.kind, 'prepared'); const full = checkComponentConstruction(built.context, wrapper.id); assert.equal(full.kind, 'checked', JSON.stringify(full));
    expect(full.dependencies).not.toContain(s.A.id); expect(full.dependencies).not.toContain(s.urId);
    expect(full.typeDependencies).toEqual([]); expect(full.obligations).toEqual([]);
  });
});
