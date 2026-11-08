/** Genuine SOURCE GROUP TYPE feedback admits the displayed three-to-two family reconstruction. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {beforeAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, GroupNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {effectiveSubstitutionMembers, checkSubstitution} from '../../../src/compiler/schemaTypeRelations.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteProofStep, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:group-self';
const local = (target: string): Reference => ({kind: 'local', target});
const string: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}};
const tid = (name: string) => globalId('type', {namespace, local: name});
const eid = (name: string) => globalId('element', {namespace, local: name});
type Boundary = 'empty' | 'prefix';

async function subject(boundary: Boundary, count: 2 | 3) {
  const source = await loadSchemaInput(path.join(fixtures, `xsd/recovery/source-group-self-${boundary}.xsd`), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(source); assert.equal(prepared.kind, 'prepared', prepared.kind === 'prepared' ? '' : 'SOURCE: ' + JSON.stringify(prepared));
  const {request} = prepared, actual = request.actual, snapshot = JSON.stringify(request.graph);
  const get = (context: SemanticContext, id: string): GraphNode => {const found = context.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const complexAt = (id: string): ComplexTypeNode => {const node = get(actual, id); assert.equal(node.kind, 'complexType'); return node;};
  const resolve = (ref: Reference): GraphNode => {const found = actual.resolve(ref); assert.equal(found.kind, 'found'); return found.node;};
  const particleAt = (id: string): ParticleNode => {const node = get(actual, id); assert.equal(node.kind, 'particle'); return node;};
  const aBoundary = complexAt(tid('A')), i = complexAt(tid('I')), r = complexAt(tid('R')), d = complexAt(tid('D'));
  const sourceGroup = get(actual, globalId('group', {namespace, local: 'G'})); assert.equal(sourceGroup.kind, 'group');
  const rDeclared = particleAt(r.content!); assert.ok('children' in rDeclared.term);
  const gammaUse = particleAt(rDeclared.term.children[0]!); assert.equal(gammaUse.term.kind, 'element');
  const gamma = resolve(gammaUse.term.declaration); assert.equal(gamma.kind, 'element');
  const a = resolve(gamma.type); assert.equal(a.kind, 'complexType');
  const groupRoot = particleAt(sourceGroup.content); assert.ok('children' in groupRoot.term);
  const tUse = particleAt(groupRoot.term.children[0]!); assert.equal(tUse.term.kind, 'element');
  const t = resolve(tUse.term.declaration); assert.equal(t.kind, 'element');
  const q = resolve(t.type); assert.equal(q.kind, 'complexType');
  const qTail = particleAt(q.content!); assert.ok('children' in qTail.term);
  const sourceDelta = particleAt(qTail.term.children[0]!);
  const sourceA = boundary === 'prefix' ? aBoundary.content! : undefined;
  const wholeQ = deriveOriginalComplexParticle(actual, q.id), wholeD = deriveOriginalComplexParticle(actual, d.id);
  assert.equal(wholeQ.kind, 'checked'); assert.equal(wholeD.kind, 'checked');
  const common = {context: aBoundary.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const complex = (name: string, method: 'extension' | 'restriction', base: Reference, content?: string): ComplexTypeNode => {
    const slot = '/group-self/' + name;
    return {...common, kind: 'complexType', id: hypotheticalScopedId(sourceGroup.id, slot, 'type'),
      identity: {kind: 'scoped', owner: sourceGroup.id, path: slot, role: 'type'}, mixed: false, abstract: false, attributes: [], content,
      derivation: {kind: method, contentKind: 'complex', base, facets: []}};
  };
  const particle = (owner: string, slot: string, term: ParticleNode['term'], min = '1', max: string = '1'): ParticleNode => ({...common,
    kind: 'particle', id: hypotheticalScopedId(owner, slot, 'particle'), identity: {kind: 'scoped', owner, path: slot, role: 'particle'},
    occurs: {min, max}, term});
  const declaration = (owner: string, slot: string, name: string, type: Reference): ElementNode => ({...common,
    kind: 'element', id: hypotheticalScopedId(owner, slot, 'element'), identity: {kind: 'scoped', owner, path: slot, role: 'element'},
    name: {namespace, local: name}, type, abstract: false, nillable: false});
  const globalElement = (name: string, type: Reference, head?: Reference): ElementNode => ({...common, kind: 'element', id: eid(name),
    identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name}, type,
    abstract: false, nillable: false, substitutionGroup: head});
  const row = (node: ComplexTypeNode, content?: RawComplexContent): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [], attributeUses: [],
    content: content ?? (node.content ? {kind: 'element-only', particle: node.content} : {kind: 'empty'}),
    provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    if (!('particle' in mapped.view.content)) return [row(node, mapped.view.content)];
    const original = deriveOriginalComplexParticle(actual, node.id); assert.equal(original.kind, 'checked'); return [row(node, original.content)];
  });
  const sourceAContent: RawComplexContent = sourceA ? {kind: 'element-only', particle: sourceA} : {kind: 'empty'};
  const jDeltaBare = complex('J_delta', 'extension', local(aBoundary.id));
  const jDeltaRoot = sourceA ? particle(jDeltaBare.id, '/content', {kind: 'sequence', children: [sourceA, sourceDelta.id]}) : undefined;
  const jDelta: ComplexTypeNode = {...jDeltaBare, content: jDeltaRoot?.id ?? sourceDelta.id};
  const d0 = globalElement('persistent-D-observer', local(d.id));
  const retiredA: ComplexTypeNode = {...a, derivation: {kind: 'restriction', contentKind: 'complex', base: local(jDelta.id), facets: []}};
  const creatorFresh: GraphNode[] = [jDelta, d0, ...(jDeltaRoot ? [jDeltaRoot] : [])];
  const creator = request.candidate({key: 'creator-a', endpoint: retiredA, active: [...actual.members, ...creatorFresh.map(node => node.id)], additions: creatorFresh,
    rawTypes: [...originalRows.filter(value => value.type !== a.id), row(retiredA, sourceAContent), row(jDelta)],
    rawElements: [{element: d0.id, type: d0.type, final: [], block: []}]}); assert.equal(creator.kind, 'prepared', creator.kind === 'prepared' ? '' : 'creator a: ' + JSON.stringify(creator));
  const parent = creator.context;
  const families = Array.from({length: count}, (_, index) => {
    const name = String(index + 1), vBare = complex('v' + name, 'extension', local(r.id)), rjBare = complex('rJ' + name, 'extension', local(aBoundary.id));
    const ru = complex('ru' + name, 'restriction', local(rjBare.id));
    const gammaCopy = declaration(r.id, '/family/' + name + '/gamma', 'gamma', local(ru.id));
    const deltaCopy = declaration(vBare.id, '/delta', 'delta', string);
    const gc = particle(vBare.id, '/gamma', {kind: 'element', declaration: local(gammaCopy.id)}, '0');
    const dc = particle(vBare.id, '/delta', {kind: 'element', declaration: local(deltaCopy.id)}, '0');
    const gammaRoot = particle(vBare.id, '/gamma-sequence', {kind: 'sequence', children: [gc.id]});
    const rPrefix = sourceA ? particle(vBare.id, '/R-prefix', {kind: 'sequence', children: [sourceA, gammaRoot.id]}) : gammaRoot;
    const groupId = globalId('group', {namespace, local: 'PrivateG' + name});
    const tCopy = declaration(groupId, '/t', 't', local(vBare.id));
    const tc = particle(groupId, '/t', {kind: 'element', declaration: local(tCopy.id)}, '0');
    const groupBody = particle(groupId, '/content', {kind: 'sequence', children: [tc.id]});
    const group: GroupNode = {...common, kind: 'group', id: groupId, identity: {kind: 'global', role: 'group', name: {namespace, local: 'PrivateG' + name}}, content: groupBody.id};
    const use = particle(vBare.id, '/G-use', {kind: 'group', reference: local(group.id)}, sourceA ? '1' : '0');
    const tail = particle(vBare.id, '/tail', {kind: 'sequence', children: [dc.id, use.id]});
    const body = particle(vBare.id, '/content', {kind: 'sequence', children: [rPrefix.id, tail.id]});
    const rjRoot = sourceA ? particle(rjBare.id, '/content', {kind: 'sequence', children: [sourceA, dc.id]}) : undefined;
    const v: ComplexTypeNode = {...vBare, content: body.id}, rj: ComplexTypeNode = {...rjBare, content: rjRoot?.id ?? dc.id};
    const member = globalElement('member' + name, local(v.id), local(eid('h')));
    const fresh: GraphNode[] = [v, ru, rj, gammaCopy, deltaCopy, gc, dc, gammaRoot, ...(sourceA ? [rPrefix] : []),
      group, tCopy, tc, groupBody, use, tail, body, ...(rjRoot ? [rjRoot] : []), member];
    return {v, ru, rj, gammaCopy, deltaCopy, tCopy, group, member, body, fresh};
  });
  const middleBare = complex('J_D', 'extension', local(aBoundary.id));
  const arms = [declaration(middleBare.id, '/h', 'h', local(aBoundary.id)), ...families.map((family, index) =>
    declaration(middleBare.id, '/member/' + index, family.member.name.local, local(family.v.id)))];
  const uses = arms.map((arm, index) => particle(middleBare.id, '/arm/' + index, {kind: 'element', declaration: local(arm.id)}));
  const choice = particle(middleBare.id, '/choice', {kind: 'choice', children: uses.map(node => node.id)});
  const middleRoot = sourceA ? particle(middleBare.id, '/content', {kind: 'sequence', children: [sourceA, choice.id]}) : choice;
  const middle: ComplexTypeNode = {...middleBare, content: middleRoot.id};
  const openingFresh: GraphNode[] = [middle, ...arms, ...uses, choice, ...(sourceA ? [middleRoot] : []), ...families.flatMap(family => family.fresh)];
  const retiredD: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const openingBuilt = forkSemanticCandidate(parent, {key: 'D-opening', endpoint: retiredD,
    active: [...parent.members, ...openingFresh.map(node => node.id)], additions: openingFresh,
    rawTypes: [row(retiredD, wholeD.content), row(middle), ...families.flatMap(family => [row(family.v), row(family.ru, sourceAContent), row(family.rj)])],
    rawElements: [...arms, ...families.flatMap(family => [family.gammaCopy, family.deltaCopy, family.tCopy, family.member])]
      .map(node => ({element: node.id, type: node.type, final: [], block: []}))}); assert.equal(openingBuilt.kind, 'prepared', openingBuilt.kind === 'prepared' ? '' : 'D opening: ' + JSON.stringify(openingBuilt));
  const opening = openingBuilt.context;
  const raw = (context: SemanticContext, id: string) => {const mapped = deriveRawComplexContent(context, id); assert.equal(mapped.kind, 'checked'); return mapped.view;};
  const semantic = (context: SemanticContext, id: string) => {const result = prepareSemanticParticleView(context, raw(context, id), 'restriction'); assert.equal(result.kind, 'checked'); return result.view;};
  const childBody = (name: string) => {
    const bare = complex(name, 'extension', local(aBoundary.id));
    const dead = particle(bare.id, '/dead', {kind: 'choice', children: []});
    const any = [0, 1, 2].map(index => particle(bare.id, '/any/' + index, {kind: 'any',
      wildcard: {namespace: {value: '##any', context: aBoundary.context}, processContents: 'skip'}}, '0', 'unbounded'));
    const root = particle(bare.id, '/content', {kind: 'sequence', children: [sourceA!, dead.id, ...any.map(node => node.id)]});
    return {node: {...bare, content: root.id}, fresh: [bare, dead, ...any, root].map(node => node.id === bare.id ? {...bare, content: root.id} : node)};
  };
  type State = {context: SemanticContext; cut: readonly number[]; added: readonly GraphNode[]; middle?: ComplexTypeNode; target?: ComplexTypeNode};
  const states: State[] = [{context: opening, cut: [], added: [...creatorFresh, ...openingFresh]}];
  const nodes: FiniteRe01EvidenceNode[] = [];
  const tree = (context: SemanticContext, cut: readonly number[], inherited: readonly GraphNode[]): readonly string[] => {
    const premises: string[] = [];
    for (let index = 0; index < count; index++) {
      if (cut.includes(index)) continue;
      const family = families[index]!, nextCut = [...cut, index], key = 'cut-' + nextCut.join('-');
      const built = sourceA ? childBody(key) : {node: complex(key, 'extension', local(aBoundary.id), family.body.id), fresh: [] as GraphNode[]};
      const k = built.node, added: GraphNode[] = sourceA ? built.fresh : [k];
      const retired: ComplexTypeNode = {...family.v, derivation: {kind: 'restriction', contentKind: 'complex', base: local(k.id), facets: []}};
      const fork = forkSemanticCandidate(context, {key, endpoint: retired, active: [...context.members, ...added.map(node => node.id)], additions: added,
        rawTypes: [row(retired), row(k)]}); assert.equal(fork.kind, 'prepared', fork.kind === 'prepared' ? '' : key + ': ' + JSON.stringify(fork));
      const child = fork.context, allFresh = [...inherited, ...added];
      states.push({context: child, cut: nextCut, added: allFresh, middle: k, target: family.v});
      const childPremises = tree(child, nextCut, allFresh); premises.push(key);
      nodes.push({id: key, parent: context, context: child, target: family.v.id, intermediate: k.id, ancestor: local(aBoundary.id), premises: childPremises});
    }
    return premises;
  };
  const openingPremises = tree(opening, [], [...creatorFresh, ...openingFresh]);
  const dNode: FiniteRe01EvidenceNode = {id: 'creator-D', parent, context: opening, target: d.id, intermediate: middle.id,
    ancestor: local(aBoundary.id), premises: openingPremises};
  const creatorNode: FiniteRe01EvidenceNode = {id: 'creator-a', parent: actual, context: parent, target: a.id,
    intermediate: jDelta.id, ancestor: local(aBoundary.id), premises: [dNode.id]};
  nodes.push(dNode, creatorNode);
  const qMiddleBody = sourceA ? childBody('actual-q-middle') : undefined;
  const qMiddle = qMiddleBody?.node ?? complex('actual-q-middle', 'extension', local(aBoundary.id), wholeQ.content.particle);
  const retiredQ: ComplexTypeNode = {...q, derivation: {kind: 'restriction', contentKind: 'complex', base: local(qMiddle.id), facets: []}};
  const qFresh: GraphNode[] = qMiddleBody ? qMiddleBody.fresh : [qMiddle];
  const qRoot = request.candidate({key: 'actual-q', endpoint: retiredQ, active: [...actual.members, ...qFresh.map(node => node.id)], additions: qFresh,
    rawTypes: [...originalRows.filter(value => value.type !== q.id), row(retiredQ, wholeQ.content), row(qMiddle, sourceA ? undefined : wholeQ.content)]}); assert.equal(qRoot.kind, 'prepared', qRoot.kind === 'prepared' ? '' : 'actual q: ' + JSON.stringify(qRoot));
  const qRetiredA: ComplexTypeNode = {...a, derivation: {kind: 'restriction', contentKind: 'complex', base: local(i.id), facets: []}};
  const qA = forkSemanticCandidate(qRoot.context, {key: 'actual-q-a', endpoint: qRetiredA, active: qRoot.context.members, additions: [],
    rawTypes: [row(qRetiredA, sourceAContent)]}); assert.equal(qA.kind, 'prepared', qA.kind === 'prepared' ? '' : 'actual q/a: ' + JSON.stringify(qA));
  nodes.push({id: 'actual-q', parent: actual, context: qRoot.context, target: q.id, intermediate: qMiddle.id,
    ancestor: local(aBoundary.id), premises: ['actual-q-a']}, {id: 'actual-q-a', parent: qRoot.context, context: qA.context, target: a.id,
    intermediate: i.id, ancestor: local(aBoundary.id), premises: []});
  const dMiddle = complex('actual-D-middle', 'extension', local(aBoundary.id), wholeD.content.particle);
  const originalDRetired: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(dMiddle.id), facets: []}};
  const dRoot = request.candidate({key: 'actual-D', endpoint: originalDRetired, active: [...actual.members, dMiddle.id], additions: [dMiddle],
    rawTypes: [...originalRows.filter(value => value.type !== d.id), row(originalDRetired, wholeD.content), row(dMiddle, wholeD.content)]}); assert.equal(dRoot.kind, 'prepared', dRoot.kind === 'prepared' ? '' : 'actual D: ' + JSON.stringify(dRoot));
  nodes.push({id: 'actual-D', parent: actual, context: dRoot.context, target: d.id, intermediate: dMiddle.id, ancestor: local(aBoundary.id), premises: []});
  const forest = verifyFiniteRe01Evidence(actual, a.id, {root: creatorNode.id, nodes});
  assert.equal(forest.kind, 'checked-candidate', JSON.stringify(forest));
  const observations = states.map(state => ({...state, pool: effectiveSubstitutionMembers(state.context, eid('h')),
    incoming: checkParticleRestriction(state.context, semantic(state.context, d.id), semantic(state.context, middle.id)),
    root: semantic(state.context, d.id).root,
    affiliations: families.map(family => checkSubstitution(state.context, family.member.id, eid('h'), {mode: 'affiliation'})),
    childExtension: sourceA && state.middle ? checkRawParticleExtension(state.context, raw(state.context, state.middle.id), raw(state.context, aBoundary.id)) : undefined,
    childRestriction: state.middle && state.target ? checkParticleRestriction(state.context, semantic(state.context, state.target.id), semantic(state.context, state.middle.id)) : undefined}));
  const properties = families.map(family => ({family, values: [[family.v.id, q.id], [family.ru.id, a.id], [family.rj.id, jDelta.id], [family.tCopy.id, t.id]]
    .map(([left, right]) => compareComponentProperties(opening, get(opening, left!), get(opening, right!))),
    extension: checkRawParticleExtension(opening, raw(opening, family.v.id), raw(opening, r.id))}));
  const independent = [{context: parent, fresh: creatorFresh}, {context: qRoot.context, fresh: qFresh},
    {context: qA.context, fresh: qFresh}, {context: dRoot.context, fresh: [dMiddle]}];
  return {boundary, count, actual, parent, opening, sourceSyntax: checkSchemaDocumentSyntax(actual), a, q, d, i, d0, sourceGroup, t,
    families, creatorFresh, openingFresh, middle, nodes, states, observations, properties, independent, forest,
    unchanged: JSON.stringify(request.graph) === snapshot,
    missingV: () => verifyFiniteRe01Evidence(actual, a.id, {root: creatorNode.id, nodes: nodes.filter(node => node.id !== openingPremises[0])
      .map(node => node.id === dNode.id ? {...node, premises: node.premises.filter(id => id !== openingPremises[0])} : node)}),
    missingD: () => verifyFiniteRe01Evidence(actual, a.id, {root: creatorNode.id, nodes: nodes.filter(node => node.id !== dNode.id)
      .map(node => node.id === creatorNode.id ? {...node, premises: []} : node)}),
    missingQ: () => verifyFiniteRe01Evidence(actual, a.id, {root: creatorNode.id, nodes: nodes.filter(node => node.id !== 'actual-q' && node.id !== 'actual-q-a')})};
}

type Subject = Awaited<ReturnType<typeof subject>>;
let subjects: Subject[];
beforeAll(async () => {
  subjects = [];
  for (const boundary of ['empty', 'prefix'] as const) for (const count of [3, 2] as const) subjects.push(await subject(boundary, count));
}, 120000);

function proof(s: Subject, context: SemanticContext): FiniteProofStep {
  assert.equal(s.forest.kind, 'checked-candidate'); const result = s.forest.proof.find(step => step.contextId === context.contextId); assert.ok(result); return result;
}

describe('genuine SOURCE GROUP SELF TYPE reconstruction at EMPTY and required-prefix boundaries', () => {
  // Source081d/standalone3d995, sole90514: these are two displayed families,
  // not a general sibling bound, arbitrary GROUP materializer or native NO.
  for (const boundary of ['empty', 'prefix'] as const) it(`checks the complete three-to-two ${boundary} reconstruction and every original/inherited root`, () => {
    for (const s of subjects.filter(value => value.boundary === boundary)) {
      expect(s.sourceSyntax.kind).toBe('checked'); expect(s.unchanged).toBe(true); assert.equal(s.forest.kind, 'checked-candidate');
      expect(new Set(s.forest.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
      expect(new Set(s.forest.actualComponents.filter(receipt => receipt.re01 && !receipt.re01.primitive).map(receipt => receipt.component)))
        .toEqual(new Set([s.a.id, s.q.id, s.d.id]));
      expect(s.states).toHaveLength(s.count === 3 ? 16 : 5);
      for (const {context, fresh} of [...s.independent, ...s.states.map(state => ({context: state.context, fresh: state.added}))]) {
        const receipts = proof(s, context).components, full = new Set(receipts.map(receipt => receipt.component));
        for (const node of fresh) expect(full.has(node.id)).toBe(true);
        for (const receipt of receipts) {expect(receipt.contextId).toBe(context.contextId); expect(receipt.obligations).toEqual([]);}
      }
      expect(proof(s, s.parent).components.map(receipt => receipt.component)).toContain(s.d0.id);
      expect(proof(s, s.parent).premises).toEqual(['creator-D']);
    }
  });

  it('exposes genuine GROUP TYPE recurrence without promoting the original q/G template to current FULL', () => {
    for (const s of subjects) {
      const full = new Set(proof(s, s.opening).components.map(receipt => receipt.component));
      expect(full.has(s.q.id)).toBe(false); expect(full.has(s.sourceGroup.id)).toBe(false);
      for (const {family, values, extension} of s.properties) {
        expect(family.tCopy.type).toEqual(local(family.v.id)); expect(s.t.type).toBeDefined();
        expect(family.tCopy.identity).toMatchObject({kind: 'scoped', owner: family.group.id});
        for (const value of values) expect(value).toMatchObject({kind: 'checked', value: true});
        expect(extension).toMatchObject({kind: 'checked', value: true});
        expect(s.opening.rawElementProperties(family.gammaCopy.id)?.type).toEqual(local(family.ru.id));
        expect(s.opening.rawTypeProperties(family.v.id)?.derivation.base).toEqual(local(tid('R')));
      }
    }
  });

  it('rechecks D via persistent d0 through both cut orders, singleton pools and the exact raw h fallback', () => {
    for (const s of subjects) for (const state of s.observations) {
      expect(state.pool.kind).toBe('checked'); assert.equal(state.pool.kind, 'checked');
      expect(new Set(state.pool.value)).toEqual(new Set(s.families.filter((_, index) => !state.cut.includes(index)).map(family => family.member.id)));
      expect(state.incoming).toMatchObject({kind: 'checked', value: true});
      for (const affiliation of state.affiliations) expect(affiliation).toMatchObject({kind: 'checked', value: true});
      expect(state.context.lookup(s.d0.id)).toEqual(s.parent.lookup(s.d0.id));
      const full = new Set(proof(s, state.context).components.map(receipt => receipt.component));
      expect(full.has(s.d.id)).toBe(true); expect(full.has(s.d0.id)).toBe(true);
      for (const family of s.families) {expect(full.has(family.member.id)).toBe(true); expect(full.has(family.group.id)).toBe(true);}
      const currentHead = s.boundary === 'prefix' ? state.root.children[1]! : state.root;
      if (state.cut.length < s.count) expect(currentHead.kind).toBe('choice');
      else {expect(currentHead.kind).toBe('element'); expect(currentHead.element?.id).toBe(eid('h'));}
    }
  });

  it('forms each actual child directly, including the positive-max empty-CHOICE wildcard prefix recipe', () => {
    for (const s of subjects) for (const state of s.observations.filter(value => value.middle)) {
      expect(state.childRestriction).toMatchObject({kind: 'checked', value: true});
      expect(proof(s, state.context).components.find(receipt => receipt.component === state.middle!.id)).toMatchObject({kind: 'checked'});
      if (s.boundary === 'prefix') {
        expect(state.childExtension).toMatchObject({kind: 'checked', value: true});
        assert.ok(state.middle?.content); const root = state.context.lookup(state.middle.content); assert.equal(root.kind, 'found'); assert.equal(root.node.kind, 'particle');
        assert.equal(root.node.term.kind, 'sequence'); expect(root.node.term.children).toHaveLength(5);
        const dead = state.context.lookup(root.node.term.children[1]!); assert.equal(dead.kind, 'found'); assert.equal(dead.node.kind, 'particle');
        expect(dead.node.occurs).toEqual({min: '1', max: '1'}); expect(dead.node.term).toEqual({kind: 'choice', children: []});
      } else {
        // cos-ct-extends over EMPTY imposes no nonempty raw prefix query.
        expect(state.childExtension).toBeUndefined(); expect(state.context.rawTypeProperties(tid('A'))?.content).toEqual({kind: 'empty'});
        expect(state.context.rawTypeProperties(state.middle!.id)?.derivation).toEqual({method: 'extension', base: local(tid('A'))});
      }
    }
  });

  it('requires actual v, creator D and independent original q evidence instead of substituting another frontier', () => {
    for (const s of subjects.filter(value => value.count === 2)) {
      expect(s.missingV()).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.families[0]!.v.id, contextId: s.opening.contextId});
      expect(s.missingD()).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.d.id, contextId: s.parent.contextId});
      expect(s.missingQ()).toMatchObject({kind: 'unresolved', rule: 'missing-actual-evidence', component: s.q.id, contextId: s.actual.contextId});
    }
  });
});
