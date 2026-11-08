/** Incidence selection is source-authenticated; it is not a maxOccurs waiver. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ParticleNode} from '../../../src/compiler/canonicalGraph.js';
import {buildCanonicalGraph} from '../../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveModelGroupContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import type {SemanticParticle} from '../../../src/compiler/particleSemanticView.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:original-compositor';
const load = () => loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-compositor-incidences-independent.xsd'), {policy: {fileRoots: [fixtures]}});
async function seed() {
  const input = await load(), prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  for (const id of actual.members) {const checked = checkComponentConstruction(actual, id); assert.equal(checked.kind, 'checked', JSON.stringify(checked)); assert.deepEqual(checked.obligations, []);}
  const candidate = request.candidate({key: 'original-incidences', active: actual.members}); assert.equal(candidate.kind, 'prepared');
  const root = (name: string): ParticleNode => {
    const type = actual.lookup(globalId('type', {namespace, local: name})); assert.equal(type.kind, 'found'); assert.equal(type.node.kind, 'complexType'); assert.ok(type.node.content);
    const found = actual.lookup(type.node.content); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'particle'); return found.node;
  };
  const semantic = (particle: string) => {
    const content = deriveModelGroupContent(candidate.context, particle); assert.equal(content.kind, 'checked');
    const result = prepareSemanticParticleView(candidate.context, content.view, 'declared'); assert.equal(result.kind, 'checked'); return result.view;
  };
  return {input, request, actual, context: candidate.context, root, semantic};
}
const leaves = (node: SemanticParticle): SemanticParticle[] => node.kind === 'element' ? [node] : node.children.flatMap(leaves);

describe('original compositor incidence boundaries', () => {
  it('preserves ordered live incidences, all placement and empty compositor distinctions', async () => {
    const s = await seed();
    for (const name of ['Seq', 'All', 'EmptyChoice', 'EmptySequence']) {
      const root = s.root(name); assert.ok('children' in root.term);
      const selected = s.context.originalCompositorChildren(root.id); assert.ok(selected);
      expect(selected).toEqual(root.term.children.filter(child => !s.actual.originalSourceComponentAbsent(child)));
      expect(Object.isFrozen(selected)).toBe(true);
      const checked = checkComponentConstruction(s.context, root.id); assert.equal(checked.kind, 'checked');
      expect(checked.dependencies).toEqual(expect.arrayContaining([...selected]));
      expect(root.term.children.filter(child => !selected.includes(child)).every(child => !checked.dependencies.includes(child))).toBe(true);
    }
    const seq = s.semantic(s.root('Seq').id), all = s.semantic(s.root('All').id);
    expect(leaves(seq.root).map(leaf => leaf.element?.name.local)).toEqual(['first', 'last']);
    expect([all.root.kind, leaves(all.root).map(leaf => leaf.element?.name.local)]).toEqual(['all', ['first', 'last']]);
    const emptyChoice = s.semantic(s.root('EmptyChoice').id).root, emptySeq = s.semantic(s.root('EmptySequence').id).root;
    expect([emptyChoice.kind, emptyChoice.children.length, emptyChoice.summary.schemaEmptiable, emptyChoice.summary.hasRealization]).toEqual(['choice', 0, true, false]);
    expect([emptySeq.kind, emptySeq.children.length, emptySeq.summary.schemaEmptiable]).toEqual(['sequence', 0, true]);
  });

  it('selects the resolved named-group compositor before DFS and retains repeated positions/sharing', async () => {
    const s = await seed(), group = s.actual.lookup(globalId('group', {namespace, local: 'G'}));
    assert.equal(group.kind, 'found'); assert.equal(group.node.kind, 'group');
    expect(s.context.originalCompositorChildren(group.node.content)).toHaveLength(2);
    const groupChecked = checkComponentConstruction(s.context, group.node.id); assert.equal(groupChecked.kind, 'checked');
    expect(groupChecked.dependencies).toContain(group.node.content);
    const named = s.semantic(s.root('Named').id), repeatedRoot = s.root('Repeated'); assert.ok('children' in repeatedRoot.term);
    expect(leaves(named.root).map(leaf => leaf.element?.name.local)).toEqual(['first', 'last']);
    const repeated = leaves(s.semantic(repeatedRoot.id).root);
    expect(repeated.map(leaf => leaf.element?.name.local)).toEqual(['first', 'last', 'first', 'last']);
    expect(repeated[0].originalParticle).toBe(repeated[2].originalParticle);
    expect(repeated[1].originalParticle).toBe(repeated[3].originalParticle);
    expect(new Set(repeatedRoot.term.children).size).toBe(2);
    expect(s.context.originalCompositorChildren(repeatedRoot.id)).toEqual(repeatedRoot.term.children);
  });

  it('requires source binding, authentic receiver, membership and a nonabsent original parent', async () => {
    const s = await seed(), root = s.root('Seq');
    expect(s.actual.originalCompositorChildren(root.id)).toBeUndefined();
    expect(s.context.originalCompositorChildren(s.root('Absent').id)).toBeUndefined();
    expect(s.context.originalCompositorChildren('not-a-component')).toBeUndefined();
    expect(() => ({...s.context}).originalCompositorChildren(root.id)).toThrow(/Unauthenticated/);
    expect(() => s.context.originalCompositorChildren.call(s.actual, root.id)).toThrow(/Foreign/);
    const absentParent = s.request.candidate({key: 'outside-parent', active: []}); assert.equal(absentParent.kind, 'prepared');
    expect(absentParent.context.originalCompositorChildren(root.id)).toBeUndefined();
    const unbound = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(s.input))); assert.equal(unbound.kind, 'prepared');
    const unboundH = unbound.request.candidate({key: 'source-fields-only', active: unbound.request.actual.members}); assert.equal(unboundH.kind, 'prepared');
    expect(unboundH.context.originalCompositorChildren(root.id)).toBeUndefined();
  });

  it('does not turn a copied fresh compositor into an original or waive live-child availability', async () => {
    const s = await seed(), root = s.root('Seq'); assert.equal(root.identity.kind, 'scoped'); assert.ok('children' in root.term);
    const fresh: ParticleNode = {...root, id: scopedId(root.identity.owner, '/literal-sequence', 'particle'),
      identity: {kind: 'scoped', owner: root.identity.owner, path: '/literal-sequence', role: 'particle'}};
    const candidate = s.request.candidate({key: 'fresh-literal-children', active: [...s.actual.members, fresh.id], additions: [fresh]}); assert.equal(candidate.kind, 'prepared');
    expect(candidate.context.originalCompositorChildren(fresh.id)).toBeUndefined();
    const checked = checkComponentConstruction(candidate.context, fresh.id); assert.equal(checked.kind, 'checked');
    expect(checked.dependencies).toEqual(expect.arrayContaining([...root.term.children]));
    const retained = s.context.originalCompositorChildren(root.id); assert.ok(retained?.length);
    const outside = s.request.candidate({key: 'missing-live-child', active: s.actual.members.filter(id => id !== retained[0])});
    expect(outside).toMatchObject({kind: 'candidate-rejected', code: 'outside-context', component: retained[0]});
  });

  it('retains actual source-syntax qualification beneath an omitted incidence', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-generated-absent-syntax-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    expect(checkSchemaDocumentSyntax(prepared.request.actual)).toMatchObject({kind: 'invalid-schema'});
    // The existing fixture deliberately has an invalid minLength beneath a
    // suppressed source item. No hypothetical whole-assessment is claimed.
  });

  it('charges cached immutable vectors at inclusive limits and keeps exhaustion sticky', async () => {
    const input = await load();
    const run = (maxWork?: number) => {
      const budget = createSemanticBudget(maxWork === undefined ? {} : {maxWork});
      const prepared = prepareSourceSchemaRequest(input, {budget}); assert.equal(prepared.kind, 'prepared');
      const request = prepared.request, root = request.graph.nodes.find(node => node.kind === 'particle' && 'children' in node.term); assert.ok(root);
      const candidate = request.candidate({key: 'incidence-budget', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
      const first = candidate.context.originalCompositorChildren(root.id); assert.ok(first);
      const before = budget.usage().work, second = budget.guard(() => candidate.context.originalCompositorChildren(root.id));
      if (Array.isArray(second)) {expect(second).toBe(first); expect(budget.usage().work).toBeGreaterThan(before);}
      return {budget, context: candidate.context, root, second};
    };
    const broad = run(), exact = run(broad.budget.usage().work); expect(exact.second).toBeInstanceOf(Array);
    const below = run(broad.budget.usage().work - 1); expect(below.second).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(below.budget.guard(() => below.context.originalCompositorChildren(below.root.id))).toBe(below.second);
    expect(checkComponentConstruction(below.context, below.root.id)).toBe(below.second);
  });
});
