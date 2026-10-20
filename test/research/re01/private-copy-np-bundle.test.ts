/** Retain an NP top's distinct inert-tail raw payload and project its child from a complete uniform old terminal. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import type {AttributeNode, AttributeUseNode, ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {resolveSemanticType} from '../../../src/compiler/schemaTypeIdentity.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:property-only-projection';
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
function implicitKeys(context: SemanticContext, type: string): readonly string[] {
  const mapped = deriveRawComplexContent(context, type); assert.equal(mapped.kind, 'checked');
  const semantic = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(semantic.kind, 'checked');
  const pending = [semantic.view.root], keys: string[] = [];
  while (pending.length) {
    const node = pending.pop()!;
    for (const block of node.orderBlocks) if (block.kind === 'implicit') keys.push(JSON.stringify([block.particle, block.head]));
    pending.push(...node.children);
  }
  return keys.sort();
}
async function subject() {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-property-projection-independent.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, sourceSnapshot = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked'); assert.equal(actual.members.length, 25);
  const get = (id: string): GraphNode => {const found = actual.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const original = (name: string): ComplexTypeNode => {const node = get(tid(name)); assert.equal(node.kind, 'complexType'); return node;};
  const a = original('A'), b = original('B'), x = original('X'), a2 = original('A2'); assert.ok(a2.content);
  const left = get(eid('Left')); assert.equal(left.kind, 'element'); assert.equal(left.type.kind, 'local');
  const q = get(left.type.target); assert.equal(q.kind, 'complexType'); assert.ok(q.content);
  const suffix = get(q.content); assert.equal(suffix.kind, 'particle'); assert.equal(suffix.term.kind, 'sequence');
  const nLeaf = get(suffix.term.children[0]), hLeaf = get(suffix.term.children[1]);
  assert.equal(nLeaf.kind, 'particle'); assert.equal(nLeaf.term.kind, 'element'); assert.equal(hLeaf.kind, 'particle');
  const nResolved = actual.resolve(nLeaf.term.declaration); assert.equal(nResolved.kind, 'found'); assert.equal(nResolved.node.kind, 'element');
  const sourceN = nResolved.node, sourceHead = get(eid('H')); assert.equal(sourceHead.kind, 'element');
  const mappedUses = assessSourceAttributeUses(actual, q.id); assert.equal(mappedUses.kind, 'checked');
  assert.equal(mappedUses.value.uses.length, 1); assert.equal(mappedUses.value.wildcard, undefined);
  const sourceUse = get(mappedUses.value.uses[0].id); assert.equal(sourceUse.kind, 'attributeUse');
  const attrResolved = actual.resolve(sourceUse.declaration); assert.equal(attrResolved.kind, 'found'); assert.equal(attrResolved.node.kind, 'attribute');
  const sourceA = attrResolved.node;
  const sourceContent = deriveOriginalComplexParticle(actual, q.id); assert.equal(sourceContent.kind, 'checked');
  const common = {context: q.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const sid = (owner: string, slot: string, role: string) => hypotheticalScopedId(owner, slot, role);
  const particle = (slot: string, term: ParticleNode['term'], occurs = {min: '1', max: '1'}): ParticleNode => ({...common,
    kind: 'particle', id: sid(x.id, slot, 'particle'), identity: {kind: 'scoped', owner: x.id, path: slot, role: 'particle'}, occurs, term});
  const copies = [0, 1, 2].map(index => {
    const slot = '/representative/copy-' + index, type = sid(x.id, slot, 'type');
    const n: ElementNode = {...sourceN, id: sid(type, '/N', 'element'),
      identity: {kind: 'scoped', owner: type, path: '/N', role: 'element'}};
    const attr: AttributeNode = {...sourceA, id: sid(type, '/a', 'attribute'),
      identity: {kind: 'scoped', owner: type, path: '/a', role: 'attribute'}};
    const use: AttributeUseNode = {...sourceUse, id: sid(x.id, slot + '/a-use', 'attributeUse'),
      identity: {kind: 'scoped', owner: x.id, path: slot + '/a-use', role: 'attributeUse'}, declaration: local(attr.id)};
    const np = particle(slot + '/N-use', {kind: 'element', declaration: local(n.id)}, nLeaf.occurs);
    const hp = particle(slot + '/H-use', hLeaf.term, hLeaf.occurs);
    const own = particle(slot + '/declared-content', {kind: 'sequence', children: [np.id, hp.id]});
    const root = particle(slot + '/effective-content', {kind: 'sequence', children: [a2.content!, own.id]});
    const node: ComplexTypeNode = {...q, id: type, identity: {kind: 'scoped', owner: x.id, path: slot, role: 'type'},
      content: root.id, attributes: [use.id]};
    return {node, n, attr, use, np, hp, own, root, records: [node, n, attr, use, np, hp, own, root] as readonly GraphNode[]};
  });
  const [publicCopy, representative, omitted] = copies;
  const helper = (name: string, method: 'extension' | 'restriction', base: Reference, content?: string): ComplexTypeNode => ({...common,
    kind: 'complexType', id: tid(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    mixed: false, abstract: false, attributes: [], content, derivation: {kind: method, contentKind: 'complex', base, facets: []}});
  const carrierBase = helper('RepresentativeSourceBase', 'restriction', builtin('anyType'));
  const outer = particle('/representative/carrier-content', {kind: 'sequence', children: [publicCopy.root.id]});
  const carrier = helper('RepresentativePropertyCarrier', 'extension', local(carrierBase.id), outer.id);
  const bundles = [representative, omitted].map((copy, index) => {
    const tails = Array.from({length: index + 1}, (_, tail) => particle('/bundle/U' + (index + 1) + '/empty-' + tail,
      {kind: 'choice', children: []}, {min: '0', max: '1'}));
    const root = particle('/bundle/U' + (index + 1) + '/raw-content', {kind: 'sequence', children: [copy.root.id, ...tails.map(node => node.id)]});
    const node: ComplexTypeNode = {...helper('BundleU' + (index + 1), 'extension', local(copy.node.id), root.id), attributes: [copy.use.id]};
    return {copy, node, tails, root, records: [node, ...tails, root] as readonly GraphNode[]};
  });
  const global = (name: string, type: string, head: string, abstract = false): ElementNode => ({...common, kind: 'element',
    id: eid(name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name},
    type: local(type), nillable: false, abstract, substitutionGroup: local(head)});
  const heads = [1, 2].map(index => global('CopyHead' + index, copies[index].node.id, sourceHead.id, true));
  const members = [1, 2].map(index => global('CopyMember' + index, bundles[index - 1].node.id, heads[index - 1].id));
  const descendants = [1, 2].map(index => global('CopyDescendant' + index, bundles[index - 1].node.id, members[index - 1].id));
  const globals = [...heads, ...members, ...descendants];
  const observer = (type: string, slot: string): ElementNode => ({...common, kind: 'element', id: sid(type, slot, 'element'),
    identity: {kind: 'scoped', owner: type, path: slot, role: 'element'}, name: {namespace, local: 'observer'},
    type: local(type), abstract: false, nillable: false});
  const observerA = observer(representative.node.id, '/observer'), observerB = observer(omitted.node.id, '/observer');
  const observerBProjected = observer(representative.node.id, '/observer-from-copy-2');
  assert.equal(sid(representative.node.id, '/observer', 'element'), observerA.id);
  assert.notEqual(observerBProjected.id, observerA.id); assert.notEqual(observerBProjected.id, observerB.id);
  const observerParticleA = particle('/representative/observer-A', {kind: 'element', declaration: local(observerA.id)}, {min: '0', max: '1'});
  const observerParticleB = particle('/representative/observer-B', {kind: 'element', declaration: local(observerB.id)}, {min: '0', max: '1'});
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({
    type: node.id, targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    content, abstract: false, final: [], block: [], attributeUses: uses,
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const sourceRows = [a, b, original('R'), endpoint, a2].map(node => raw(node,
    node.id === a2.id ? {kind: 'element-only', particle: a2.content!} : {kind: 'empty'}));
  const make = (project: boolean) => {
    const selectedCopies = project ? copies.slice(0, 2) : copies;
    const selectedBundles = project ? bundles.slice(0, 1) : bundles;
    const selectedGlobals = globals.map(node => project && node.type.kind === 'local'
      ? node.type.target === omitted.node.id ? {...node, type: local(representative.node.id)}
        : node.type.target === bundles[1].node.id ? {...node, type: local(bundles[0].node.id)} : node : node);
    const selectedObserver = project ? observerBProjected : observerB;
    const selectedObserverParticle: ParticleNode = project ? {...observerParticleB,
      term: {kind: 'element', declaration: local(selectedObserver.id)}} : observerParticleB;
    const additions: GraphNode[] = [...selectedCopies.flatMap(copy => copy.records), ...selectedBundles.flatMap(bundle => bundle.records), carrierBase, carrier, outer,
      ...selectedGlobals, observerA, selectedObserver, observerParticleA, selectedObserverParticle];
    const rawTypes = [...sourceRows,
      raw(carrierBase, sourceContent.content, [sourceUse.id]),
      raw(carrier, {kind: 'element-only', particle: outer.id}, [publicCopy.use.id]),
      ...selectedCopies.map(copy => raw(copy.node, {kind: 'element-only', particle: copy.root.id}, [copy.use.id])),
      ...selectedBundles.map(bundle => raw(bundle.node, {kind: 'element-only', particle: bundle.root.id}, [bundle.copy.use.id]))];
    const built = request.candidate({key: project ? 'one-existing-np-bundle' : 'two-private-np-bundles',
      active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint, rawTypes,
      rawElements: additions.flatMap(node => node.kind === 'element' ? [{element: node.id, type: node.type, final: [],
        block: heads.some(head => head.id === node.id) ? ['restriction'] : []}] : [])});
    assert.equal(built.kind, 'prepared', JSON.stringify(built)); const context = built.context;
    const retire = (parent: SemanticContext, bundle: typeof bundles[number], key: string) => {
      const endpoint: ComplexTypeNode = {...bundle.node,
        derivation: {kind: 'restriction', contentKind: 'complex', base: local(bundle.copy.node.id), facets: []}};
      const child = forkSemanticCandidate(parent, {key, active: parent.members, additions: [], endpoint,
        rawTypes: [raw(endpoint, {kind: 'element-only', particle: bundle.root.id}, [bundle.copy.use.id])]});
      assert.equal(child.kind, 'prepared', JSON.stringify(child)); return child.context;
    };
    const first = retire(context, bundles[0], project ? 'representative-R' : 'U1-first');
    const contexts: SemanticContext[] = [context, first];
    const child = (id: string, parent: SemanticContext, owner: SemanticContext, bundle: typeof bundles[number],
      premises: readonly string[] = []): FiniteRe01EvidenceNode => ({id, parent, context: owner, target: bundle.node.id,
      intermediate: bundle.copy.node.id, ancestor: local(a2.id), premises});
    const nodes: FiniteRe01EvidenceNode[] = [{id: 'X', parent: actual, context,
      target: x.id, intermediate: b.id, ancestor: local(a.id), premises: project ? ['U1'] : ['U1', 'U2']},
      child('U1', context, first, bundles[0], project ? [] : ['U1-U2'])];
    if (!project) {
      const terminal = retire(first, bundles[1], 'U1-then-U2'), sibling = retire(context, bundles[1], 'U2-first');
      const otherTerminal = retire(sibling, bundles[0], 'U2-then-U1'); contexts.push(terminal, sibling, otherTerminal);
      nodes.push(child('U1-U2', first, terminal, bundles[1]), child('U2', context, sibling, bundles[1], ['U2-U1']),
        child('U2-U1', sibling, otherTerminal, bundles[0]));
    }
    const forest = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes});
    assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest));
    assert.equal(forest.actualComponents.length, actual.members.length);
    assert.deepEqual(new Set(forest.actualComponents.map(item => item.component)), new Set(actual.members));
    assert.equal(forest.proof.length, project ? 2 : 5);
    for (const step of forest.proof) {
      const owner = contexts.find(item => item.contextId === step.contextId); assert.ok(owner);
      const checked = new Set(step.components.map(item => item.component));
      for (const node of additions) assert.ok(checked.has(node.id), 'mandatory inherited fresh root: ' + node.id);
      assert.ok(!checked.has(q.id), 'original template must remain property-only in H');
      for (const receipt of step.components) {assert.equal(receipt.contextId, owner.contextId); assert.deepEqual(receipt.obligations, []);}
    }
    const step = forest.proof.find(item => item.contextId === context.contextId)!;
    const checked = new Set(step.components.map(item => item.component));
    for (const copy of selectedCopies) {
      const current = context.lookup(copy.node.id), original = context.lookup(q.id);
      assert.equal(current.kind, 'found'); assert.equal(original.kind, 'found');
      const pair = compareComponentProperties(context, current.node, original.node); assert.equal(pair.kind, 'checked'); assert.equal(pair.value, true);
      assert.ok(checked.has(copy.node.id)); assert.equal(step.components.find(item => item.component === copy.node.id)?.re01?.primitive, true);
    }
    const poolsAt = (owner: SemanticContext) => [sourceHead.id, ...heads.map(node => node.id), ...members.map(node => node.id)].map(head => {
      const result = effectiveSubstitutionMembers(owner, head); assert.equal(result.kind, 'checked'); return {head, members: [...result.value].sort()};
    });
    const pools = poolsAt(context);
    const keys = selectedCopies.map(copy => {
      const mapped = deriveRawComplexContent(context, copy.node.id); assert.equal(mapped.kind, 'checked');
      const semantic = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(semantic.kind, 'checked');
      const pending = [semantic.view.root], keys: string[] = [];
      while (pending.length) {const current = pending.pop()!;
        for (const block of current.orderBlocks) if (block.kind === 'implicit') keys.push(JSON.stringify([block.particle, block.head]));
        pending.push(...current.children);
      }
      assert.deepEqual(keys, [JSON.stringify([copy.hp.id, sourceHead.id])]); return {type: copy.node.id, keys};
    });
    return {context, contexts, forest, additions, rawTypes, pools, poolsAt, keys, selectedObserver, selectedObserverParticle,
      summary: {members: context.members.length, actual: forest.actualComponents.length, checkedH: checked.size,
        nodes: forest.proof.length, contextSizes: contexts.map(owner => owner.members.length),
        checkedPerContext: contexts.map(owner => forest.proof.find(item => item.contextId === owner.contextId)!.components.length),
        ownNP: contexts.map(owner => forest.proof.find(item => item.contextId === owner.contextId)!.components
          .filter(item => item.re01 && !item.re01.primitive).map(item => item.component)),
        fresh: additions.length, copyTypes: selectedCopies.length, protectedTypes: [publicCopy.node.id], representative: representative.node.id,
        omitted: project ? [...omitted.records, ...bundles[1].records].map(node => node.id) : [], originalTemplateH: checked.has(q.id)}};
  };
  const old = make(false), replacement = make(true);
  assert.deepEqual([old.summary.members, old.summary.actual, old.summary.fresh], [69, 25, 44]);
  assert.deepEqual([replacement.summary.members, replacement.summary.actual, replacement.summary.fresh], [57, 25, 32]);
  assert.deepEqual(old.summary.checkedPerContext, [58, 55, 55, 55, 55]);
  assert.deepEqual(replacement.summary.checkedPerContext, [46, 43]);
  const omittedRecords = [...omitted.records, ...bundles[1].records]; assert.equal(omittedRecords.length, 12);
  assert.deepEqual(new Set(old.context.members.filter(id => !replacement.context.members.includes(id))), new Set([...omittedRecords.map(node => node.id), observerB.id]));
  assert.deepEqual(replacement.context.members.filter(id => !old.context.members.includes(id)), [observerBProjected.id]);
  for (const owner of replacement.contexts) for (const node of omittedRecords) assert.equal(owner.lookup(node.id).kind, 'missing');
  assert.deepEqual(old.pools, replacement.pools);
  assert.deepEqual(old.poolsAt(old.contexts[2]), replacement.poolsAt(replacement.contexts[1]));
  assert.deepEqual(old.poolsAt(old.contexts[4]), replacement.poolsAt(replacement.contexts[1]));
  assert.notDeepEqual(old.poolsAt(old.contexts[1]), replacement.poolsAt(replacement.contexts[1]));
  assert.deepEqual(old.summary.ownNP.map(ids => [...ids].sort()), [bundles.map(bundle => bundle.node.id).sort(), [bundles[1].node.id], [], [bundles[0].node.id], []]);
  assert.deepEqual(replacement.summary.ownNP, [[bundles[0].node.id], []]);
  const familyPools = (pools: ReturnType<typeof old.poolsAt>) => pools.slice(1, 3).map(pool => pool.members);
  const family1 = [members[0].id, descendants[0].id].sort(), family2 = [members[1].id, descendants[1].id].sort();
  assert.deepEqual(old.contexts.map(owner => familyPools(old.poolsAt(owner))), [[family1, family2], [[], family2], [[], []], [family1, []], [[], []]]);
  assert.deepEqual(replacement.contexts.map(owner => familyPools(replacement.poolsAt(owner))), [[family1, family2], [[], []]]);
  assert.deepEqual(old.keys.slice(0, 2), replacement.keys);
  for (const copy of [publicCopy, representative]) {
    assert.deepEqual(replacement.context.rawTypeProperties(copy.node.id), old.context.rawTypeProperties(copy.node.id));
    for (const particle of [copy.np, copy.hp, copy.own, copy.root])
      assert.deepEqual(replacement.context.lookup(particle.id), old.context.lookup(particle.id));
  }
  for (const [before, after] of [[old.context, replacement.context], [old.contexts[2], replacement.contexts[1]]]) {
    assert.deepEqual(after.rawTypeProperties(bundles[0].node.id), before.rawTypeProperties(bundles[0].node.id));
    for (const node of bundles[0].records.slice(1)) assert.deepEqual(after.lookup(node.id), before.lookup(node.id));
  }
  assert.notDeepEqual(bundles[0].root.term, bundles[1].root.term);
  assert.notDeepEqual(replacement.context.rawTypeProperties(bundles[0].node.id)?.content, replacement.context.rawTypeProperties(representative.node.id)?.content);
  for (const node of globals) {
    const before = old.context.lookup(node.id), after = replacement.context.lookup(node.id);
    assert.equal(before.kind, 'found'); assert.equal(after.kind, 'found'); assert.equal(before.node.kind, 'element'); assert.equal(after.node.kind, 'element');
    assert.deepEqual({...after.node, type: before.node.type}, before.node);
    assert.deepEqual(replacement.context.rawElementProperties(node.id)?.type, after.node.type);
  }
  assert.equal(replacement.context.lookup(omitted.node.id).kind, 'missing');
  assert.equal(replacement.context.lookup(observerB.id).kind, 'missing');
  assert.deepEqual(replacement.selectedObserver.type, local(representative.node.id));
  assert.equal(replacement.selectedObserver.identity.kind, 'scoped');
  assert.equal(replacement.selectedObserver.identity.owner, representative.node.id);
  assert.equal(replacement.selectedObserver.identity.path, '/observer-from-copy-2');
  assert.deepEqual(replacement.selectedObserverParticle.term, {kind: 'element', declaration: local(observerBProjected.id)});
  assert.deepEqual(replacement.context.rawElementProperties(observerBProjected.id)?.type, local(representative.node.id));
  assert.equal(JSON.stringify(request.graph), sourceSnapshot);
  const missing = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [{id: 'X', parent: actual, context: replacement.context,
    target: x.id, intermediate: b.id, ancestor: local(a.id), premises: []}]});
  assert.equal(missing.kind, 'unresolved'); assert.equal(missing.rule, 'missing-nested-evidence'); assert.equal(missing.component, bundles[0].node.id);
  return {actual, q, a2, old, replacement, missing, bundles, publicCopy, representative, omitted, omittedRecords,
    globals, sourceHead, observerA, observerB, observerBProjected, observerParticleB};
}

describe('one sealed NP and primitive-copy bundle', () => {
  it('keeps U1 raw roots and all inherited duties while replacing five complete nodes with two at uniform stages', async () => {
    const s = await subject(), {old, replacement} = s;
    expect(old.forest.proof).toHaveLength(5); expect(replacement.forest.proof).toHaveLength(2);
    expect(old.summary).toMatchObject({members: 69, actual: 25, fresh: 44, checkedPerContext: [58, 55, 55, 55, 55]});
    expect(replacement.summary).toMatchObject({members: 57, actual: 25, fresh: 32, checkedPerContext: [46, 43]});
    expect(old.summary.ownNP.map(ids => ids.length)).toEqual([2, 1, 0, 1, 0]);
    expect(replacement.summary.ownNP.map(ids => ids.length)).toEqual([1, 0]);
    for (const result of [old, replacement]) {
      expect(new Set(result.forest.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
      for (const step of result.forest.proof) {
        const context = result.contexts.find(owner => owner.contextId === step.contextId); assert.ok(context);
        expect(context.members).toHaveLength(result.summary.members);
        const checked = new Set(step.components.map(item => item.component));
        for (const node of result.additions) expect(checked.has(node.id)).toBe(true);
        expect(checked.has(s.q.id)).toBe(false);
        const bundle = s.bundles.find(item => item.node.id === step.target);
        if (bundle) {
          expect(step.correspondence).toMatchObject({target: bundle.node.id, intermediate: bundle.copy.node.id});
          expect(step.correspondence.ancestor).toEqual(s.q.derivation?.base);
          const ancestor = resolveSemanticType(context, step.correspondence.ancestor); assert.equal(ancestor.kind, 'component');
          expect(ancestor.node.id).toBe(s.a2.id);
        }
      }
    }
    expect(s.omittedRecords).toHaveLength(12);
    const removed = new Set(old.context.members.filter(id => !replacement.context.members.includes(id)));
    expect(removed).toEqual(new Set([...s.omittedRecords.map(node => node.id), s.observerB.id])); expect(removed.size).toBe(13);
    expect(replacement.context.members.filter(id => !old.context.members.includes(id))).toEqual([s.observerBProjected.id]);
    expect(s.bundles.map(bundle => bundle.tails.length)).toEqual([1, 2]);
    for (const bundle of s.bundles) {
      expect(bundle.root.term).toEqual({kind: 'sequence', children: [bundle.copy.root.id, ...bundle.tails.map(node => node.id)]});
      for (const tail of bundle.tails) {
        expect(tail.occurs).toEqual({min: '0', max: '1'}); expect(tail.term).toEqual({kind: 'choice', children: []});
      }
    }
    // These payloads differ in inert removable raw tails; no productive arbitrary-payload theorem is tested here.
    expect(old.pools).toHaveLength(5); expect(s.globals).toHaveLength(6);
    expect(replacement.pools).toEqual(old.pools);
    const newChild = replacement.contexts[1];
    expect(old.poolsAt(old.contexts[2])).toEqual(replacement.poolsAt(newChild));
    expect(old.poolsAt(old.contexts[4])).toEqual(replacement.poolsAt(newChild));
    expect(old.poolsAt(old.contexts[1])).not.toEqual(replacement.poolsAt(newChild));
    for (const [before, after] of [[old.context, replacement.context], [old.contexts[2], newChild], [old.contexts[4], newChild]] as const) {
      for (const node of s.globals) {
        const left = before.lookup(node.id), right = after.lookup(node.id); assert.equal(left.kind, 'found'); assert.equal(right.kind, 'found');
        assert.equal(left.node.kind, 'element'); assert.equal(right.node.kind, 'element');
        const expectedType = node.type.kind === 'local' && node.type.target === s.omitted.node.id ? local(s.representative.node.id)
          : node.type.kind === 'local' && node.type.target === s.bundles[1].node.id ? local(s.bundles[0].node.id) : node.type;
        expect({...right.node, type: left.node.type}).toEqual(left.node); expect(right.node.type).toEqual(expectedType);
        const oldRaw = before.rawElementProperties(node.id), newRaw = after.rawElementProperties(node.id); assert.ok(oldRaw && newRaw);
        expect({...newRaw, type: oldRaw.type}).toEqual(oldRaw); expect(newRaw.type).toEqual(expectedType);
      }
      for (const type of [s.publicCopy.node.id, s.representative.node.id, s.bundles[0].node.id]) {
        expect(after.rawTypeProperties(type)).toEqual(before.rawTypeProperties(type));
        expect(implicitKeys(after, type)).toEqual(implicitKeys(before, type));
      }
      for (const node of [s.representative.hp, s.representative.root, ...s.bundles[0].records.slice(1)])
        expect(after.lookup(node.id)).toEqual(before.lookup(node.id));
    }
    expect(implicitKeys(replacement.context, s.bundles[0].node.id)).toEqual([JSON.stringify([s.representative.hp.id, s.sourceHead.id])]);
    expect(implicitKeys(newChild, s.bundles[0].node.id)).toEqual([]);
    expect(s.publicCopy.hp.id).not.toBe(s.representative.hp.id);
    expect(replacement.context.rawTypeProperties(s.bundles[0].node.id)?.content).toEqual({kind: 'element-only', particle: s.bundles[0].root.id});
    expect(replacement.context.rawTypeProperties(s.bundles[0].node.id)?.content).not.toEqual(replacement.context.rawTypeProperties(s.representative.node.id)?.content);
    expect(replacement.selectedObserver.identity).toMatchObject({kind: 'scoped', owner: s.representative.node.id, path: '/observer-from-copy-2'});
    expect(replacement.selectedObserverParticle.id).toBe(s.observerParticleB.id);
    expect(s.missing).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.bundles[0].node.id});
    expect(replacement.forest.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });
});
