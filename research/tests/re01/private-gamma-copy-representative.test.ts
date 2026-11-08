/** Preserve the scope-recursive template cover using an existing fresh representative and exact surviving head keys. */
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
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:property-only-projection';
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
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
  const global = (name: string, type: string, head: string, abstract = false): ElementNode => ({...common, kind: 'element',
    id: eid(name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name},
    type: local(type), nillable: false, abstract, substitutionGroup: local(head)});
  const heads = [1, 2].map(index => global('CopyHead' + index, copies[index].node.id, sourceHead.id, true));
  const members = [1, 2].map(index => global('CopyMember' + index, copies[index].node.id, heads[index - 1].id));
  const descendants = [1, 2].map(index => global('CopyDescendant' + index, copies[index].node.id, members[index - 1].id));
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
    const selectedGlobals = globals.map(node => project && node.type.kind === 'local' && node.type.target === omitted.node.id
      ? {...node, type: local(representative.node.id)} : node);
    const selectedObserver = project ? observerBProjected : observerB;
    const selectedObserverParticle: ParticleNode = project ? {...observerParticleB,
      term: {kind: 'element', declaration: local(selectedObserver.id)}} : observerParticleB;
    const additions: GraphNode[] = [...selectedCopies.flatMap(copy => copy.records), carrierBase, carrier, outer,
      ...selectedGlobals, observerA, selectedObserver, observerParticleA, selectedObserverParticle];
    const rawTypes = [...sourceRows,
      raw(carrierBase, sourceContent.content, [sourceUse.id]),
      raw(carrier, {kind: 'element-only', particle: outer.id}, [publicCopy.use.id]),
      ...selectedCopies.map(copy => raw(copy.node, {kind: 'element-only', particle: copy.root.id}, [copy.use.id]))];
    const built = request.candidate({key: project ? 'one-existing-private-representative' : 'three-template-copies',
      active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint, rawTypes,
      rawElements: additions.flatMap(node => node.kind === 'element' ? [{element: node.id, type: node.type, final: [], block: []}] : [])});
    assert.equal(built.kind, 'prepared', JSON.stringify(built)); const context = built.context;
    const forest = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [{id: 'X', parent: actual, context,
      target: x.id, intermediate: b.id, ancestor: local(a.id), premises: []}]});
    assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest));
    assert.equal(forest.actualComponents.length, actual.members.length);
    assert.deepEqual(new Set(forest.actualComponents.map(item => item.component)), new Set(actual.members));
    assert.equal(forest.proof.length, 1); const step = forest.proof[0], checked = new Set(step.components.map(item => item.component));
    for (const node of additions) assert.ok(checked.has(node.id), 'mandatory fresh root: ' + node.id);
    assert.ok(!checked.has(q.id), 'original template must remain property-only in H');
    for (const receipt of step.components) {
      assert.equal(receipt.contextId, context.contextId); assert.deepEqual(receipt.obligations, []);
      assert.ok(!receipt.re01 || receipt.re01.primitive, 'unexpected own-NP requirement');
    }
    for (const copy of selectedCopies) {
      const current = context.lookup(copy.node.id), original = context.lookup(q.id);
      assert.equal(current.kind, 'found'); assert.equal(original.kind, 'found');
      const pair = compareComponentProperties(context, current.node, original.node); assert.equal(pair.kind, 'checked'); assert.equal(pair.value, true);
      assert.ok(checked.has(copy.node.id)); assert.equal(step.components.find(item => item.component === copy.node.id)?.re01?.primitive, true);
    }
    const pool = (head: string) => {const result = effectiveSubstitutionMembers(context, head); assert.equal(result.kind, 'checked'); return [...result.value].sort();};
    const pools = [sourceHead.id, ...heads.map(node => node.id), ...members.map(node => node.id)].map(head => ({head, members: pool(head)}));
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
    return {context, forest, additions, rawTypes, pools, keys, selectedObserver, selectedObserverParticle,
      summary: {members: context.members.length, actual: forest.actualComponents.length, checkedH: checked.size,
        fresh: additions.length, copyTypes: selectedCopies.length, protectedTypes: [publicCopy.node.id], representative: representative.node.id,
        omitted: project ? omitted.records.map(node => node.id) : [], originalTemplateH: checked.has(q.id), np: []}};
  };
  const old = make(false), replacement = make(true);
  assert.deepEqual(old.pools, replacement.pools);
  assert.deepEqual(old.keys.slice(0, 2), replacement.keys);
  for (const copy of [publicCopy, representative]) {
    assert.deepEqual(replacement.context.rawTypeProperties(copy.node.id), old.context.rawTypeProperties(copy.node.id));
    for (const particle of [copy.np, copy.hp, copy.own, copy.root])
      assert.deepEqual(replacement.context.lookup(particle.id), old.context.lookup(particle.id));
  }
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
  return {actual, q, old, replacement, publicCopy, representative, omitted, globals, heads, members, descendants, sourceHead,
    observerA, observerB, observerBProjected, observerParticleB};
}

describe('a private representative of one value-free anonymous Gamma template', () => {
  it('keeps the full forests, global descendant pools and surviving raw keys while jointly repairing local TYPE and scope', async () => {
    const s = await subject(), {old, replacement} = s;
    expect(old.summary).toMatchObject({members: 62, actual: 25, checkedH: 51, fresh: 37, copyTypes: 3, originalTemplateH: false});
    expect(replacement.summary).toMatchObject({members: 54, actual: 25, checkedH: 43, fresh: 29, copyTypes: 2, originalTemplateH: false});
    expect(old.forest.proof).toHaveLength(1); expect(replacement.forest.proof).toHaveLength(1);
    expect(s.omitted.records).toHaveLength(8);
    const removed = new Set(old.context.members.filter(id => !replacement.context.members.includes(id)));
    expect(removed).toEqual(new Set([...s.omitted.records.map(node => node.id), s.observerB.id]));
    expect(removed.size).toBe(9);
    expect(replacement.context.members.filter(id => !old.context.members.includes(id))).toEqual([s.observerBProjected.id]);
    for (const node of s.omitted.records) expect(replacement.context.lookup(node.id).kind).toBe('missing');
    expect(replacement.context.lookup(s.representative.node.id)).toEqual(old.context.lookup(s.representative.node.id));
    for (const result of [old, replacement]) {
      expect(new Set(result.forest.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
      const checked = new Set(result.forest.proof[0].components.map(item => item.component));
      for (const node of result.additions) expect(checked.has(node.id)).toBe(true);
      expect(checked.has(s.q.id)).toBe(false);
      expect(result.forest.proof[0].components.filter(item => item.re01 && !item.re01.primitive)).toEqual([]);
    }
    expect(s.globals).toHaveLength(6); expect(old.pools).toHaveLength(5); expect(replacement.pools).toEqual(old.pools);
    for (const node of s.globals) {
      const before = old.context.rawElementProperties(node.id), after = replacement.context.rawElementProperties(node.id);
      assert.ok(before && after); expect({...after, type: before.type}).toEqual(before);
      expect(after.type).toEqual(node.type.kind === 'local' && node.type.target === s.omitted.node.id ? local(s.representative.node.id) : node.type);
    }
    const sorted = (ids: readonly string[]) => [...ids].sort();
    expect(replacement.pools.map(pool => pool.members)).toEqual([
      sorted([s.sourceHead.id, ...s.members.map(node => node.id), ...s.descendants.map(node => node.id)]),
      sorted([s.members[0].id, s.descendants[0].id]), sorted([s.members[1].id, s.descendants[1].id]),
      sorted([s.members[0].id, s.descendants[0].id]), sorted([s.members[1].id, s.descendants[1].id]),
    ]);
    expect(replacement.keys).toEqual(old.keys.slice(0, 2));
    expect(new Set(replacement.keys.flatMap(copy => copy.keys)).size).toBe(2);
    for (const copy of [s.publicCopy, s.representative]) {
      expect(replacement.context.rawTypeProperties(copy.node.id)?.content).toEqual({kind: 'element-only', particle: copy.root.id});
      expect(replacement.context.lookup(copy.hp.id)).toEqual(old.context.lookup(copy.hp.id));
    }
    const oldScope = s.observerB.identity, scope = s.observerBProjected.identity;
    assert.equal(oldScope.kind, 'scoped'); assert.equal(scope.kind, 'scoped');
    expect(oldScope.owner).toBe(s.omitted.node.id); expect(scope.owner).toBe(s.representative.node.id);
    expect(hypotheticalScopedId(scope.owner, oldScope.path, oldScope.role)).toBe(s.observerA.id);
    expect(scope.path).not.toBe(oldScope.path); expect(s.observerBProjected.id).not.toBe(s.observerA.id);
    expect(old.context.rawElementProperties(s.observerB.id)?.type).toEqual(local(s.omitted.node.id));
    expect(replacement.selectedObserver.type).toEqual(local(s.representative.node.id));
    expect(replacement.context.rawElementProperties(s.observerBProjected.id)?.type).toEqual(local(s.representative.node.id));
    expect(replacement.selectedObserverParticle.id).toBe(s.observerParticleB.id);
    expect(replacement.selectedObserverParticle.term).toEqual({kind: 'element', declaration: local(s.observerBProjected.id)});
    expect(replacement.context.lookup(s.observerParticleB.id)).toMatchObject({kind: 'found',
      node: {kind: 'particle', id: s.observerParticleB.id, term: replacement.selectedObserverParticle.term}});
    expect(replacement.forest.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });
});
