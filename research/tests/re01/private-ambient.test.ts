/** Full-environment controls; expected roots follow the written derivations. */
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {forkSemanticCandidate, isSemanticCandidateOf, storedIdentityOccupant} from '../../../src/compiler/semanticContext.js';
import {hypotheticalScopedId} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveActualComplexContent, deriveOriginalComplexPropertyContent, deriveModelGroupContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {assertComponentConstruction, checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {DEFAULT_MAX_WORK} from '../../../src/compiler/semanticBudget.js';
import {prepareFiniteRe01Frontier, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {preparePrivateAnchoredListAssignments, preparePrivateStagedRootAssignments, recognizePrivateStagedRoot} from './anchored-list-assignment.js';
import {buildRe01Evidence, completeSeededRe01Evidence, storedRe01Rank} from './evidence-builder.js';
import {recognizePrivateAmbientEnvironment, recognizePrivateStagingDemand} from './private-ambient.js';
import {prepareInheritedMiddleAssignments} from './shared-assignment.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import type {FiniteRe01Hypothesis} from '../../../src/compiler/finiteRe01Verification.js';
import type {AnchoredListAssignment} from './anchored-list-assignment.js';

const local = (target: string) => ({kind: 'local' as const, target});
const namespace = 'urn:private:inherited';
const id = (name: string) => globalId('type', {namespace, local: name});
const json = (v: unknown) => JSON.stringify(v, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);
async function source(extra = '', supplied?: string) {
  const xml = supplied ?? await readFile('test/conformance/fixtures/xsd/recovery/private-list-inherited.xsd', 'utf8');
  const root = path.resolve('tmp/test-generation/re01-ambient'); await mkdir(root, {recursive: true});
  const directory = await mkdtemp(path.join(root, 'case-'));
  try {
    const file = path.join(directory, 'schema.xsd'); await writeFile(file, xml.replace('</xs:schema>', (supplied ? '' : '<xs:complexType name="ReaderBody"><xs:complexContent><xs:restriction base="xs:anyType"><xs:choice><xs:element ref="t:h1"/></xs:choice></xs:restriction></xs:complexContent></xs:complexType>') + extra + '</xs:schema>'));
    const loaded = await loadSemanticSchemaInput(file, {policy: {fileRoots: [root]}});
    const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared', json(prepared));
    return prepared.request.actual;
  } finally {await rm(directory, {recursive: true, force: true});}
}
async function inherited(base: 'A' | 'OffA' | 'Heads' = 'A', extra = '', readerCount = 1,
  family?: {xml: string; namespace: string; name: (name: string) => string}, subset = false, grouped = false, alternate?: string) {
  if (grouped) {
    const xml = family?.xml ?? await readFile('test/conformance/fixtures/xsd/recovery/private-list-inherited.xsd', 'utf8');
    family = {namespace: 'urn:private:inherited', name: n => n === 'fullCarrier' ? 'Heads' : n === 'subsetCarrier' ? 'ReaderBody' : n, ...family, xml: xml.replace('</xs:schema>',
      '<xs:group name="ReaderGroup"><xs:choice><xs:element ref="t:h1"/></xs:choice></xs:group>'
      + '<xs:complexType name="ReaderBody"><xs:complexContent><xs:restriction base="xs:anyType"><xs:group ref="t:ReaderGroup"/></xs:restriction></xs:complexContent></xs:complexType></xs:schema>')};
  }
  const actual = await source(extra, family?.xml);
  const namespace = family?.namespace ?? 'urn:private:inherited';
  const id = (name: string) => globalId('type', {namespace, local: family?.name(name === 'Heads' ? 'fullCarrier' : name === 'ReaderBody' ? 'subsetCarrier' : name) ?? name});
  const opening = prepareInheritedMiddleAssignments(actual, actual, id('RootD')); assert.equal(opening.kind, 'prepared-inherited-assignments');
  const plan = opening.assignments.find(at => at.intermediate === id('RootB')); assert.ok(plan);
  const carrier = actual.lookup(id('Heads')); assert.equal(carrier.kind, 'found'); assert.equal(carrier.node.kind, 'complexType');
  const body = deriveOriginalComplexParticle(actual, carrier.node.id); assert.equal(body.kind, 'checked');
  const readerCarrier = actual.lookup(id('ReaderBody')); assert.equal(readerCarrier.kind, 'found'); assert.equal(readerCarrier.node.kind, 'complexType');
  const readerBody = deriveOriginalComplexParticle(actual, readerCarrier.node.id); assert.equal(readerBody.kind, 'checked');
  const target = hypotheticalScopedId(id('A'), '/ambient-child', 'type');
  const child: ComplexTypeNode = {...carrier.node, id: target, identity: {kind: 'scoped', owner: id('A'), path: '/ambient-child', role: 'type'},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(id('R')), facets: []}};
  const readerId = hypotheticalScopedId(id(base), '/ambient-reader', 'type');
  const reader: ComplexTypeNode = {...(base === 'Heads' || subset ? readerCarrier.node : carrier.node), id: readerId, identity: {kind: 'scoped', owner: id(base), path: '/ambient-reader', role: 'type'},
    derivation: {kind: 'restriction', contentKind: 'complex', base: local(id(base)), facets: []}};
  const readers = Array.from({length: readerCount}, (_, i): ComplexTypeNode => {
    if (i === 0) return reader;
    const source = alternate ? actual.lookup(id(alternate)) : undefined;
    if (source) {assert.equal(source.kind, 'found'); assert.equal(source.node.kind, 'complexType');}
    return {...reader, ...(source?.kind === 'found' ? source.node : {}), derivation: reader.derivation,
      id: hypotheticalScopedId(id(base), '/ambient-reader-' + i, 'type'), identity: {kind: 'scoped', owner: id(base), path: '/ambient-reader-' + i, role: 'type'}} as ComplexTypeNode;
  });
  const alternateBody = alternate ? deriveOriginalComplexParticle(actual, id(alternate)) : undefined;
  if (alternateBody) assert.equal(alternateBody.kind, 'checked');
  const additions = [child, ...readers];
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'ambient-parent', additions, active: [...actual.members, ...additions.map(at => at.id)],
    rawTypes: [...plan.delta.rawTypes!, ...additions.map(node => ({type: node.id, targetNamespace: namespace,
      derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [],
      content: node !== child && alternateBody?.kind === 'checked' && node !== reader ? alternateBody.content
        : node !== child && (base === 'Heads' || subset) ? readerBody.content : body.content, attributeUses: [], provenance: {kind: 'hypothetical-abstract' as const, originals: []}}))]});
  assert.equal(built.kind, 'prepared', json(built));
  return {actual, target, readerId, hypothesis: {parent: actual, context: built.context, target: id('RootD'), intermediate: plan.intermediate, ancestor: plan.ancestor}};
}

it('native discriminator retains a source group use through staged parent and complete child', async () => {
  const {actual, target, readerId, hypothesis} = await inherited('A', '', 1, undefined, true, true);
  // Before recognizer changes: assemble the already delivered recipe at root birth,
  // preserving genuine source handles; do not substitute a flattened BODY.
  const localPlan = preparePrivateAnchoredListAssignments(actual, hypothesis.context, target);
  assert.equal(localPlan.kind, 'prepared-anchored-list-assignments', json(localPlan));
  const plan = localPlan.assignments[0]; assert.ok(plan, json(localPlan));
  const root = hypothesis.context.lookup(hypothesis.target); assert.equal(root.kind, 'found'); assert.equal(root.node.kind, 'complexType');
  const additions = [...plan.delta.additions!, ...hypothesis.context.members.filter(id => actual.lookup(id).kind === 'missing').map(id => {
    const at = hypothesis.context.lookup(id); assert.equal(at.kind, 'found'); return at.node;
  })];
  const rows = hypothesis.context.members.flatMap(id => {const row = hypothesis.context.rawTypeProperties(id); return row ? [row] : [];});
  const built = forkSemanticCandidate(actual, {...plan.delta, key: 'native-group-first-birth', endpoint: root.node, additions,
    active: [...actual.members, ...additions.map(n => n.id)], rawTypes: [...rows, ...plan.delta.rawTypes!.filter(row => row.type !== target && (hypothesis.context.lookup(row.type).kind === 'missing' || !hypothesis.context.rawTypeProperties(row.type)))]});
  assert.equal(built.kind, 'prepared', json(built));
  const group = globalId('group', {namespace, local: 'ReaderGroup'});
  expect(checkComponentConstruction(actual, group).kind).toBe('checked');
  expect(checkComponentConstruction(hypothesis.context, readerId)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
  expect(checkComponentConstruction(built.context, readerId).kind).toBe('checked');
  const seed = {...hypothesis, context: built.context};
  const frontier = prepareFiniteRe01Frontier(actual); assert.equal(frontier.kind, 'native-frontier-session', json(frontier));
  const inspected = frontier.inspectCandidate(seed); assert.equal(inspected.kind, 'inspected-frontier', json(inspected));
  expect(inspected.requirements.filter(r => !r.primitive).map(r => r.target)).toEqual([target]);
  const result = completeSeededRe01Evidence(actual, hypothesis.target, seed);
  assert.equal(result.kind, 'checked-witness', json(result)); expect(result.evidence.nodes).toHaveLength(2);
});

it('stages first-birth support at a new root and completes the retained child automatically', async () => {
  const {actual, target, readerId, hypothesis} = await inherited('A');
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  assert.equal(prepared.assignments.length, 1, json(prepared));
  const staged = prepared.assignments[0]!;
  expect(staged.mode).toBe('root-hypothesis-reconstruction');
  expect(recognizePrivateStagingDemand(actual, hypothesis.context, target).kind).toBe('recognized-private-staging-demand');
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, staged.context).kind).toBe('recognized-private-staged-root');
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, hypothesis.context).kind).toBe('outside-private-staged-root');
  expect(isSemanticCandidateOf(actual, staged.context)).toBe(true);
  const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
  const frontier = session.inspectCandidate(staged.evidence);
  assert.equal(frontier.kind, 'inspected-frontier', json(frontier));
  expect(frontier.requirements.filter(at => !at.primitive).map(at => at.target)).toEqual([target]);
  expect(checkComponentConstruction(staged.context, readerId).kind).toBe('checked');
  const {parent, context, target: root, intermediate, ancestor} = staged.evidence;
  const result = completeSeededRe01Evidence(actual, root, {parent, context, target: root, intermediate, ancestor});
  assert.equal(result.kind, 'checked-witness', json(result));
  expect(result.evidence.nodes).toHaveLength(2);
  const child = result.evidence.nodes.find(at => at.target === target); assert.ok(child);
  const scalar = staged.context.rawSimpleTypeProperties(staged.cohorts[0]!.enumeration)!;
  const facet = scalar.facetComponentSet![2]!; assert.ok('facets' in facet);
  expect(child.intermediate).toBe(facet.facets[0]!.operand!.owner);
  expect(child.context.lookup(child.intermediate)).toEqual(staged.context.lookup(child.intermediate));
  expect(child.context.rawTypeProperties(child.intermediate)).toBe(staged.context.rawTypeProperties(child.intermediate));
  for (const cohort of staged.cohorts) for (const id of [cohort.preparation, cohort.enumeration, cohort.member]) {
    expect(child.context.lookup(id)).toEqual(staged.context.lookup(id));
    expect(child.context.rawSimpleTypeProperties(id)).toBe(staged.context.rawSimpleTypeProperties(id));
  }
  expect(child.context.lookup(readerId)).toEqual(staged.context.lookup(readerId));
  expect(storedRe01Rank(actual, child.parent)).toEqual({q: 0, n: 1});
  expect(storedRe01Rank(actual, child.context)).toEqual({q: 0, n: 0});
});

const rootHypothesis = (at: AnchoredListAssignment): FiniteRe01Hypothesis => ({parent: at.parent, context: at.context,
  target: at.target, intermediate: at.intermediate, ancestor: at.evidence.ancestor});

function stagedFamily(arity: number, count: number, reverse: boolean, v: 'true' | 'false', savedMap: string) {
  const family = largerSchema(arity, count, reverse, v, savedMap), name = family.name;
  const restriction = (n: string, base: string) => `<xs:complexType name="${name(n)}"><xs:complexContent><xs:restriction base="${base}"/></xs:complexContent></xs:complexType>`;
  const extension = (n: string, base: string) => `<xs:complexType name="${name(n)}"><xs:complexContent><xs:extension base="${base}"/></xs:complexContent></xs:complexType>`;
  const scaffold = restriction('RootA', 'xs:anyType') + restriction('RootR', `t:${name('RootA')}`)
    + extension('RootB', `t:${name('RootA')}`) + extension('RootD', `t:${name('RootR')}`);
  return {...family, xml: family.xml.replace(new RegExp(`<xs:complexType name="${name('D')}">.*?</xs:complexType>`), '')
    .replace('</xs:schema>', scaffold + '</xs:schema>')};
}

it.each([[2, 1], [3, 2], [4, 3]] as const)('normalizes original group portfolios at k=%i and r=%i through complete evidence', async (arity, readers) => {
  const family = stagedFamily(arity, 1, false, 'true', 'urn:group:saved'), name = family.name;
  const carrier = name('subsetCarrier'), groupName = name('group:escaped').replace(':', '_');
  // Extract only original XML syntax, before semantic checking; no winning data.
  const pattern = new RegExp(`(<xs:complexType name="${carrier}">.*?)<xs:choice>(.*?)</xs:choice>`);
  const matched = family.xml.match(pattern); assert.ok(matched);
  const portfolio = Array.from({length: arity - 1}, (_, i) => `<xs:element ref="t:${name('head' + i)}"/>`).join('');
  family.xml = family.xml.replace(pattern, `$1<xs:group ref="t:${groupName}"/>`).replace('</xs:schema>',
    `<xs:group name="${groupName}"><xs:choice>${portfolio}</xs:choice></xs:group></xs:schema>`);
  const {actual, target, readerId, hypothesis} = await inherited('A', '', readers, family, true);
  const recognized = recognizePrivateStagingDemand(actual, hypothesis.context, target);
  assert.equal(recognized.kind, 'recognized-private-staging-demand', json(recognized)); expect(recognized.readers).toHaveLength(readers);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  const staged = prepared.assignments[0]; assert.ok(staged, json(prepared));
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, staged.context).kind).toBe('recognized-private-staged-root');
  const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
  const parent = session.inspectCandidate(rootHypothesis(staged)); assert.equal(parent.kind, 'inspected-frontier', json(parent));
  expect(parent.requirements.filter(r => !r.primitive).map(r => r.target)).toEqual([target]);
  const complete = completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged));
  assert.equal(complete.kind, 'checked-witness', json(complete)); expect(complete.evidence.nodes).toHaveLength(2);
  const child = complete.evidence.nodes.find(n => n.target === target); assert.ok(child);
  const group = globalId('group', {namespace: family.namespace, local: groupName});
  expect(complete.receipt.actualComponents.map(c => c.component)).toContain(group);
  expect(child.context.lookup(group)).toEqual(actual.lookup(group));
  expect(child.context.rawTypeProperties(readerId)).toBe(staged.context.rawTypeProperties(readerId));
  expect(storedRe01Rank(actual, child.parent)).toEqual({q: 0, n: 1});
  expect(storedRe01Rank(actual, child.context)).toEqual({q: 0, n: 0});
});

it('keeps shared definitions and distinct original use sites while matching direct observations', async () => {
  const extra = '<xs:complexType name="SecondUse"><xs:complexContent><xs:restriction base="xs:anyType"><xs:group ref="t:ReaderGroup"/></xs:restriction></xs:complexContent></xs:complexType>'
    + '<xs:complexType name="DirectUse"><xs:complexContent><xs:restriction base="xs:anyType"><xs:choice><xs:element ref="t:h1"/></xs:choice></xs:restriction></xs:complexContent></xs:complexType>'
    + '<xs:group name="UnusedGroup"><xs:choice><xs:element ref="t:h2"/></xs:choice></xs:group>';
  const {actual, target, hypothesis} = await inherited('A', extra, 2, undefined, true, true, 'SecondUse');
  expect(recognizePrivateStagingDemand(actual, hypothesis.context, target).kind).toBe('recognized-private-staging-demand');
  const group = actual.lookup(globalId('group', {namespace, local: 'ReaderGroup'})); assert.equal(group.kind, 'found'); assert.equal(group.node.kind, 'group');
  const definition = deriveModelGroupContent(actual, group.node.id); assert.equal(definition.kind, 'checked');
  const views = ['ReaderBody', 'SecondUse', 'DirectUse'].map(n => {
    const content = deriveActualComplexContent(actual, id(n)); assert.equal(content.kind, 'checked');
    const view = prepareSemanticParticleView(actual, content.view, 'restriction'); assert.equal(view.kind, 'checked'); return view.view;
  });
  for (const view of views) expect({kind: view.root.kind, occurs: view.root.occurs, head: view.root.element?.id})
    .toEqual({kind: 'element', occurs: {min: '1', max: '1'}, head: globalId('element', {namespace, local: 'h1'})});
  expect(views[0]!.root.originalParticle).not.toBe(views[1]!.root.originalParticle);
  for (const view of views.slice(0, 2)) expect(view.root.origins).toContain(group.node.content);
  expect(views[2]!.root.origins).not.toContain(group.node.content);
  const foreign = await inherited('A', '', 1, undefined, true, true);
  expect(() => prepareSemanticParticleView(foreign.actual, definition.view, 'restriction')).toThrow();
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments'); const staged = prepared.assignments[0]; assert.ok(staged);
  const completed = completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged));
  assert.equal(completed.kind, 'checked-witness', json(completed));
  const child = completed.evidence.nodes.find(n => n.target === target); assert.ok(child);
  for (const ctx of [actual, staged.context, child.context]) {
    const base = ctx === actual ? deriveActualComplexContent(ctx, id('A')) : deriveOriginalComplexPropertyContent(ctx, id('A')); assert.equal(base.kind, 'checked');
    const bv = prepareSemanticParticleView(ctx, base.view, 'restriction'); assert.equal(bv.kind, 'checked');
    for (const n of ['ReaderBody', 'SecondUse', 'DirectUse']) {
      const content = ctx === actual ? deriveActualComplexContent(ctx, id(n)) : deriveOriginalComplexPropertyContent(ctx, id(n)); assert.equal(content.kind, 'checked');
      const view = prepareSemanticParticleView(ctx, content.view, 'restriction'); assert.equal(view.kind, 'checked');
      expect(checkParticleRestriction(ctx, view.view, bv.view)).toMatchObject({kind: 'checked', value: ctx !== actual});
      expect(checkComponentConstruction(ctx, id(n)).kind).toBe('checked');
    }
  }
});

it.each(['owner', 'SOURCE'] as const)('refuses a grouped demand with a wrong reader %s', async fault => {
  const {actual, target, readerId, hypothesis} = await inherited('A', '', 1, undefined, true, true);
  const root = hypothesis.context.lookup(hypothesis.target); assert.equal(root.kind, 'found'); assert.equal(root.node.kind, 'complexType');
  const badId = hypotheticalScopedId(id('OffA'), '/ambient-reader', 'type');
  const additions = hypothesis.context.members.filter(id => actual.lookup(id).kind === 'missing').map(id => {
    const at = hypothesis.context.lookup(id); assert.equal(at.kind, 'found');
    return fault === 'owner' && id === readerId ? {...at.node, id: badId, identity: {kind: 'scoped' as const, owner: globalId('type', {namespace, local: 'OffA'}), path: '/ambient-reader', role: 'type'}} : at.node;
  });
  const wrong = deriveOriginalComplexParticle(actual, id('Heads')); assert.equal(wrong.kind, 'checked');
  const rows = hypothesis.context.members.flatMap(id => {
    const row = hypothesis.context.rawTypeProperties(id); if (!row) return [];
    return [id !== readerId ? row : {...row, type: fault === 'owner' ? badId : row.type, content: fault === 'SOURCE' ? wrong.content : row.content}];
  });
  const built = forkSemanticCandidate(actual, {key: 'wrong-group-reader-' + fault, endpoint: root.node, additions, rawTypes: rows,
    active: [...actual.members, ...additions.map(n => n.id)]}); assert.equal(built.kind, 'prepared', json(built));
  expect(recognizePrivateStagingDemand(actual, built.context, target).kind).toBe('outside-private-ambient');
});

it.each(['optional', 'repeated', 'missing', 'duplicate-unused', 'nested', 'reversed'] as const)('refuses group %s without granting negative authority', async fault => {
  const xml = await readFile('test/conformance/fixtures/xsd/recovery/private-list-inherited.xsd', 'utf8');
  const definition = fault === 'duplicate-unused' ? '<xs:element name="bad" type="t:Words"/><xs:element name="bad" type="t:Words"/>'
    : fault === 'nested' ? '<xs:group ref="t:ReaderGroup"/>' : fault === 'reversed' ? '<xs:element ref="t:h2"/><xs:element ref="t:h1"/>' : '<xs:element ref="t:h1"/>';
  const group = `<xs:group name="ReaderGroup"><xs:choice>${definition}</xs:choice></xs:group>`;
  const use = fault === 'duplicate-unused' ? '<xs:choice><xs:element ref="t:h1"/></xs:choice>'
    : `<xs:group ref="t:${fault === 'missing' ? 'Absent' : 'ReaderGroup'}" ${fault === 'optional' ? 'minOccurs="0"' : fault === 'repeated' ? 'maxOccurs="2"' : ''}/>`;
  const family = {namespace, name: (n: string) => n === 'fullCarrier' ? 'Heads' : n === 'subsetCarrier' ? 'ReaderBody' : n,
    xml: xml.replace('</xs:schema>', group + `<xs:complexType name="ReaderBody"><xs:complexContent><xs:restriction base="xs:anyType">${use}</xs:restriction></xs:complexContent></xs:complexType></xs:schema>`)};
  if (fault === 'missing' || fault === 'nested') {
    const directory = await mkdtemp(path.resolve('tmp/test-generation/re01-ambient/case-'));
    try {
      const file = path.join(directory, 'schema.xsd'); await writeFile(file, family.xml);
      const loaded = await loadSemanticSchemaInput(file, {policy: {fileRoots: [directory]}});
      expect(prepareSourceSchemaRequest(loaded)).toMatchObject({kind: 'source-preparation-failed', stage: 'reference-resolution', category: 'invalid-schema'});
    } finally {await rm(directory, {recursive: true, force: true});}
    return;
  }
  const {actual, target, hypothesis} = await inherited('A', '', 1, family, true);
  expect(recognizePrivateStagingDemand(actual, hypothesis.context, target).kind).toBe('outside-private-ambient');
  expect(preparePrivateStagedRootAssignments(actual, hypothesis.context, target)).toMatchObject({kind: 'unresolved', rule: 'private-staging-demand'});
  if (fault === 'duplicate-unused') expect(prepareFiniteRe01Frontier(actual).kind).toBe('invalid-schema');
});

it.each([
  [2, 0, false, 'true', 'urn:staged:two', 0, false],
  [3, 2, true, 'false', 'urn:staged:false', 2, true],
  [4, 3, false, 'true', 'urn:staged:four', 3, false],
] as const)('constructs the staged family k=%i ambient=%i reversed=%s v=%s map=%s readers=%i subset=%s', async (arity, count, reverse, v, map, readers, subset) => {
  const family = stagedFamily(arity, count, reverse, v, map);
  const {actual, target, hypothesis} = await inherited('A', '', readers, family, subset);
  const demand = recognizePrivateStagingDemand(actual, hypothesis.context, target);
  assert.equal(demand.kind, 'recognized-private-staging-demand', json(demand));
  expect(demand.readers).toHaveLength(readers); expect(demand.arity).toBe(arity);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared));
  assert.equal(prepared.assignments.length, 1, json(prepared)); const staged = prepared.assignments[0]!;
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, staged.context).kind).toBe('recognized-private-staged-root');
  const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
  expect(session.actual.requirements.filter(at => !at.primitive).map(at => at.target)).toEqual([hypothesis.target]);
  const parent = session.inspectCandidate(rootHypothesis(staged)); assert.equal(parent.kind, 'inspected-frontier', json(parent));
  expect(parent.requirements.filter(at => !at.primitive).map(at => at.target)).toEqual([target]);
  const result = completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged));
  assert.equal(result.kind, 'checked-witness', json(result));
  const child = result.evidence.nodes.find(at => at.target === target); assert.ok(child);
  const firstEnum = staged.context.rawSimpleTypeProperties(staged.cohorts[0]!.enumeration)!;
  const enumComponent = firstEnum.facetComponentSet!.at(-1)!; assert.ok('facets' in enumComponent);
  const middle = enumComponent.facets[0]!.operand!.owner;
  expect(child.intermediate).toBe(middle);
  const born = staged.context.members.filter(id => actual.lookup(id).kind === 'missing' && id !== target);
  for (const id of born) {
    expect(child.context.lookup(id)).toEqual(staged.context.lookup(id));
    expect(child.context.rawTypeProperties(id)).toBe(staged.context.rawTypeProperties(id));
    expect(child.context.rawSimpleTypeProperties(id)).toBe(staged.context.rawSimpleTypeProperties(id));
    expect(child.context.rawElementProperties(id)).toBe(staged.context.rawElementProperties(id));
  }
  for (const step of result.receipt.proof) {
    expect(step.components.map(at => at.component)).toEqual(expect.arrayContaining(born));
    expect(step.contextId).toBe(step.components[0]!.contextId);
  }
  expect(child.context.members).toEqual(staged.context.members);
  expect(storedRe01Rank(actual, actual)).toEqual({q: 1, n: 0});
  expect(storedRe01Rank(actual, child.parent)).toEqual({q: 0, n: 1});
  expect(storedRe01Rank(actual, child.context)).toEqual({q: 0, n: 0});
  for (const cohort of staged.cohorts) {
    const member = staged.context.lookup(cohort.member); assert.equal(member.kind, 'found'); assert.equal(member.node.kind, 'element'); assert.ok(member.node.value);
    const funded = createSchemaScalarKernel(staged.context).assess(local(cohort.preparation), member.node.value.lexical, middle);
    assert.equal(funded.kind, 'checked', json(funded)); expect(funded.value.operand.items).toHaveLength(1);
    expect(member.node.value.lexical.context.namespaces['']).toBe(map);
    expect(staged.context.lookup(cohort.head)).toEqual(actual.lookup(cohort.head));
  }
  expect(preparePrivateAnchoredListAssignments(actual, child.parent, target).kind).toBe('unresolved');
  expect(verifyFiniteRe01Evidence(actual, staged.target, result.evidence).kind).toBe('checked-candidate');
  console.log('staged family complete', {arity, count, readers, subset, work: actual.budget.usage().work, rssBytes: process.memoryUsage().rss});
});

it.each([['OffA', false], ['collision', false], ['affiliate', false], ['OffA', true], ['collision', true], ['affiliate', true]] as const)('refuses a staged demand with %s grouped=%s without narrowing existing recipes', async (fault, grouped) => {
  const extra = fault === 'collision' ? '<xs:element name="y1" type="t:Words"/>'
    : fault === 'affiliate' ? '<xs:element name="foreign" type="t:HeadWords" substitutionGroup="t:h1"/>' : '';
  const {actual, target, hypothesis} = await inherited(fault === 'OffA' ? 'OffA' : 'A', extra, 1, undefined, grouped, grouped);
  expect(recognizePrivateStagingDemand(actual, hypothesis.context, target).kind).toBe('outside-private-ambient');
  expect(preparePrivateStagedRootAssignments(actual, hypothesis.context, target)).toMatchObject({kind: 'unresolved', rule: 'private-staging-demand'});
  expect(prepareFiniteRe01Frontier(actual).kind).toBe('native-frontier-session');
});

it.each([['VALUE', false], ['map', false], ['funding', false], ['VALUE', true], ['map', true], ['funding', true], ['TYPE', true]] as const)('rejects staged wrong %s grouped=%s in its real first-birth context', async (fault, grouped) => {
  const {actual, target, hypothesis} = await inherited('A', '', 1, undefined, grouped, grouped);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target); assert.equal(prepared.kind, 'prepared-anchored-list-assignments');
  const staged = prepared.assignments[0]!, cohort = staged.cohorts[fault === 'map' ? 1 : 0]!;
  const built = forkSemanticCandidate(actual, {...staged.delta, key: 'staged-bad-' + fault,
    rawElements: staged.delta.rawElements!.map(row => fault === 'TYPE' && row.element === cohort.member ? {...row, type: local(id('OffA'))} : row),
    additions: staged.delta.additions!.map(n => n.id === cohort.member && n.kind === 'element' && n.value
      ? {...n, type: fault === 'TYPE' ? local(id('OffA')) : n.type, value: {...n.value, lexical: {...n.value.lexical,
        value: fault === 'VALUE' ? 'false' : n.value.lexical.value,
        context: fault === 'map' ? {...n.value.lexical.context, namespaces: {...n.value.lexical.context.namespaces, '': 'urn:foreign:qname'}} : n.value.lexical.context}}} : n),
    rawSimpleTypes: staged.delta.rawSimpleTypes!.map(row => fault === 'funding' && row.type === cohort.enumeration && row.facetComponentSet
      ? {...row, facetComponentSet: row.facetComponentSet.map(component => 'facets' in component
        ? {...component, facets: component.facets.map(facet => ({...facet, lexical: {...facet.lexical, value: 'false'}}))} : component)} : row),
  });
  assert.equal(built.kind, 'prepared');
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, built.context).kind).toBe('outside-private-staged-root');
  const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
  expect(session.inspectCandidate({...rootHypothesis(staged), context: built.context}).kind).toBe('candidate-rejected');
  if (fault === 'funding') {
    const member = built.context.lookup(cohort.member); assert.equal(member.kind, 'found');
    const row = built.context.rawSimpleTypeProperties(cohort.enumeration)!;
    const component = row.facetComponentSet!.at(-1)!; assert.ok('facets' in component);
    // ITEM Boolean admits false, while the genuine immediate L0's pattern true does not.
    expect(createSchemaScalarKernel(built.context).assess(cohort.item, component.facets[0]!.lexical, cohort.member).kind).toBe('checked');
    expect(createSchemaScalarKernel(built.context).assess(local(cohort.preparation), component.facets[0]!.lexical, cohort.member).kind).toBe('invalid-schema');
  }
});

it.each([false, true])('keeps missing and sibling-context evidence unresolved or invalid at the original root grouped=%s', async grouped => {
  const {actual, target, hypothesis} = await inherited('A', '', 1, undefined, grouped, grouped);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target); assert.equal(prepared.kind, 'prepared-anchored-list-assignments');
  const staged = prepared.assignments[0]!;
  expect(verifyFiniteRe01Evidence(actual, staged.target, {root: 'root', nodes: [{...staged.evidence, id: 'root', premises: []}]}))
    .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: target});
  const sibling = preparePrivateStagedRootAssignments(actual, hypothesis.context, target); assert.equal(sibling.kind, 'prepared-anchored-list-assignments');
  const completed = completeSeededRe01Evidence(actual, staged.target, rootHypothesis(sibling.assignments[0]!)); assert.equal(completed.kind, 'checked-witness');
  const foreignChild = completed.evidence.nodes.find(n => n.target === target); assert.ok(foreignChild);
  expect(verifyFiniteRe01Evidence(actual, staged.target, {root: 'root', nodes: [
    {...staged.evidence, id: 'root', premises: ['child']}, {...foreignChild, id: 'child'},
  ]})).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: target});
});

it('admits a structural staged demand while rejecting its invalid actual ambient VALUE', async () => {
  const family = stagedFamily(2, 1, false, 'true', 'urn:staged:bad');
  family.xml = family.xml.replace('name="ambient0_2_1" type="t:U_2_1" fixed="true"', 'name="ambient0_2_1" type="t:H_2_1" fixed="1"');
  const {actual, target, hypothesis} = await inherited('A', '', 1, family);
  expect(recognizePrivateStagingDemand(actual, hypothesis.context, target).kind).toBe('recognized-private-staging-demand');
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target); assert.equal(prepared.kind, 'prepared-anchored-list-assignments');
  const staged = prepared.assignments[0]!;
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, staged.context).kind).toBe('recognized-private-staged-root');
  expect(completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged)).kind).toBe('invalid-schema');
});

it.each([false, true])('precharges staged construction and recognition with inclusive sticky exhaustion grouped=%s', async grouped => {
  const {actual, target, hypothesis} = await inherited('A', '', 1, undefined, grouped, grouped);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target); assert.equal(prepared.kind, 'prepared-anchored-list-assignments');
  const staged = prepared.assignments[0]!;
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK - actual.budget.usage().work));
  expect(actual.budget.exhausted()).toBe(false);
  const result = preparePrivateStagedRootAssignments(actual, hypothesis.context, target); expect(result.kind).toBe('resource-limit');
  const usage = actual.budget.usage();
  expect(recognizePrivateStagedRoot(actual, hypothesis.context, target, staged.context)).toBe(result);
  expect(recognizePrivateStagingDemand(actual, hypothesis.context, target)).toBe(result);
  expect(completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged))).toBe(result);
  expect(actual.budget.usage()).toEqual(usage);
});

it.each(['A', 'OffA', 'Heads'] as const)('executes the inherited %s reader contrast without changing the private construction', async base => {
  const {actual, target, readerId, hypothesis} = await inherited(base);
  expect(recognizePrivateAmbientEnvironment(actual, hypothesis.context, target).kind).toBe(base === 'Heads' ? 'recognized-private-ambient' : 'outside-private-ambient');
  const prepared = preparePrivateAnchoredListAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments', json(prepared)); assert.equal(prepared.assignments.length, 1);
  const candidate = prepared.assignments[0]!;
  const reading = checkComponentConstruction(candidate.context, readerId);
  expect(reading.kind).toBe(base !== 'OffA' ? 'checked' : 'candidate-rejected');
  if (base === 'OffA') expect(reading).toMatchObject({rule: 'derivation-ok-restriction.5.4'});
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis);
  console.log('ambient contrast', base, result.kind, actual.budget.usage().work);
  if (base === 'Heads' && reading.kind === 'checked') {
    for (const cohort of candidate.cohorts) expect(reading.typeDependencies).toContainEqual({contextId: candidate.context.contextId,
      type: {kind: 'component', id: cohort.enumeration}});
    const before = checkComponentConstruction(hypothesis.context, readerId); assert.equal(before.kind, 'checked');
    const reader = hypothesis.context.lookup(readerId); assert.equal(reader.kind, 'found'); assert.equal(reader.node.kind, 'complexType');
    const body = actual.lookup(reader.node.content!); assert.equal(body.kind, 'found'); assert.equal(body.node.kind, 'particle');
    assert.equal(body.node.term.kind, 'choice'); const particle = body.node.term.children[0]!;
    expect(reading.dependencies).toContain(body.node.id);
    const leaf = checkComponentConstruction(candidate.context, particle); assert.equal(leaf.kind, 'checked');
    expect(leaf.dependencies).toContain(candidate.cohorts[0]!.member);
    const member = checkComponentConstruction(candidate.context, candidate.cohorts[0]!.member); assert.equal(member.kind, 'checked');
    expect(member.typeDependencies).toContainEqual({contextId: candidate.context.contextId, type: {kind: 'component', id: candidate.cohorts[0]!.enumeration}});
    expect(() => assertComponentConstruction(candidate.context, before)).toThrow('Unauthenticated or foreign');
    const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
    const frontier = session.inspectCandidate(hypothesis); assert.equal(frontier.kind, 'inspected-frontier');
    expect(frontier.requirements.filter(at => !at.primitive).map(at => at.target)).toEqual([target]);
    expect(frontier.components.map(at => at.component)).toContain(readerId);
    expect(verifyFiniteRe01Evidence(actual, hypothesis.target, {root: 'missing', nodes: [{...hypothesis, id: 'missing', premises: []}]}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: target});
  }
  assert.equal(result.kind, base === 'Heads' ? 'checked-witness' : 'no-witness-found', json(result));
  if (base === 'A' && result.kind === 'no-witness-found') expect(result.outcomes.some(at => at.failure.kind === 'candidate-rejected'
    && 'rule' in at.failure && at.failure.rule === 'derivation-ok-restriction.5.4' && at.failure.component === readerId
    && 'contextId' in at.failure && at.failure.contextId === hypothesis.context.contextId)).toBe(true);
  if (result.kind === 'checked-witness') {
    const child = result.evidence.nodes.find(at => at.target === target); assert.ok(child);
    const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
    const frontier = session.inspectCandidate(child); assert.equal(frontier.kind, 'inspected-frontier');
    expect(frontier.components.map(at => at.component)).toContain(readerId);
    expect(frontier.requirements.filter(at => !at.primitive)).toEqual([]);
    expect(storedRe01Rank(actual, child.parent)).toEqual({q: 0, n: 1});
    expect(storedRe01Rank(actual, child.context)).toEqual({q: 0, n: 0});
    expect(verifyFiniteRe01Evidence(actual, hypothesis.target, result.evidence).kind).toBe('checked-candidate');
  }
});

it('keeps additional declarations sharing unchanged scalar dependencies in full actual qualification', async () => {
  const extra = ['Item', 'Words', 'HeadWords'].map((type, i) => `<xs:element name="ambient${i}" type="t:${type}" fixed="true"/>`).join('');
  const {actual, target, hypothesis} = await inherited('Heads', extra);
  expect(recognizePrivateAmbientEnvironment(actual, hypothesis.context, target).kind).toBe('recognized-private-ambient');
  expect(completeSeededRe01Evidence(actual, hypothesis.target, hypothesis).kind).toBe('checked-witness');
});

it('rejects an invalid ambient actual declaration independently of the pending target', async () => {
  const family = largerSchema(2, 1, false, 'true', 'urn:bad:map');
  const actual = await source('', family.xml.replace('name="ambient0_2_1" type="t:U_2_1" fixed="true"', 'name="ambient0_2_1" type="t:H_2_1" fixed="1"'));
  expect(recognizePrivateAmbientEnvironment(actual, actual, family.target).kind).toBe('recognized-private-ambient');
  expect(buildRe01Evidence(actual, family.target).kind).toBe('invalid-schema');
});

/** A grammar family, not an input-specific answer or successful candidate. */
function largerSchema(arity: number, count: number, reverse: boolean, v: 'true' | 'false', savedMap: string) {
  const ns = `urn:ambient:${arity}:${count}:${v}`, suffix = `_${arity}_${count}`, name = (s: string) => s + suffix;
  const type = (s: string) => `t:${name(s)}`;
  const restriction = (n: string, base: string, body = '') => `<xs:complexType name="${name(n)}"><xs:complexContent><xs:restriction base="${base}">${body}</xs:restriction></xs:complexContent></xs:complexType>`;
  const choice = (body: string) => `<xs:choice>${body}</xs:choice>`;
  const arms = Array.from({length: arity}, (_, i) => `<xs:element name="${name('field' + i)}" type="${type('W')}" minOccurs="0" fixed="${i % 2 ? v : v === 'true' ? '1' : '0'}"/>`).join('');
  const headArms = Array.from({length: arity}, (_, i) => `<xs:element ref="${type('head' + i)}"/>`).join('');
  const declarations = [
    `<xs:simpleType name="${name('U')}"><xs:union memberTypes="xs:QName xs:boolean"/></xs:simpleType>`,
    `<xs:simpleType name="${name('W')}"><xs:list itemType="${type('U')}"/></xs:simpleType>`,
    `<xs:simpleType name="${name('H')}"><xs:restriction base="${type('W')}"><xs:pattern value="${v}"/></xs:restriction></xs:simpleType>`,
    ...Array.from({length: arity}, (_, i) => `<xs:element name="${name('head' + i)}" type="${type('H')}" abstract="true"/>`),
    restriction('A', 'xs:anyType', choice(arms)), restriction('R', type('A')),
    `<xs:complexType name="${name('D')}"><xs:complexContent><xs:extension base="${type('R')}">${choice(headArms)}</xs:extension></xs:complexContent></xs:complexType>`,
    ...Array.from({length: count}, (_, i) => `<xs:element name="${name('ambient' + i)}" type="${type(['U', 'W', 'H'][i % 3]!)}" fixed="${v}"/>`),
    ...Array.from({length: count}, (_, i) => restriction('ordinary' + i, 'xs:anyType', choice(`<xs:element name="${name('local' + i)}" type="${type('W')}" minOccurs="0" fixed="${v}"/>`))),
    restriction('fullCarrier', 'xs:anyType', choice(headArms)), restriction('subsetCarrier', 'xs:anyType', choice(`<xs:element ref="${type('head0')}"/>`)),
  ];
  if (reverse) declarations.reverse();
  return {xml: `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${ns}" xmlns="${savedMap}" targetNamespace="${ns}" elementFormDefault="qualified">${declarations.join('')}</xs:schema>`,
    target: globalId('type', {namespace: ns, local: name('D')}), namespace: ns, name};
}

it.each([
  [2, 0, false, 'true', 'urn:saved:zero'],
  [3, 4, true, 'false', 'urn:saved:false'],
  [4, 7, false, 'true', 'urn:saved:many'],
] as const)('recognizes and automatically proves the full larger family k=%i ambient=%i reversed=%s', async (arity, count, reverse, v, savedMap) => {
  const family = largerSchema(arity, count, reverse, v, savedMap), actual = await source('', family.xml);
  const recognized = recognizePrivateAmbientEnvironment(actual, actual, family.target);
  assert.equal(recognized.kind, 'recognized-private-ambient', json(recognized));
  expect(recognized.arity).toBe(arity); expect(recognized.readers).toEqual([]);
  const session = prepareFiniteRe01Frontier(actual); assert.equal(session.kind, 'native-frontier-session');
  // The written family has just D E R nonprimitive; every ambient type is R anyType.
  expect(session.actual.requirements.map(at => ({target: at.target, primitive: at.primitive}))).toEqual([{target: family.target, primitive: false}]);
  expect(new Set(session.actual.components.map(at => at.component))).toEqual(new Set(actual.members));
  const result = buildRe01Evidence(actual, family.target); assert.equal(result.kind, 'checked-witness', json(result));
  expect(result.mode).toBe('input-only'); expect(result.evidence.nodes).toHaveLength(1);
  const node = result.evidence.nodes[0]!;
  expect(storedRe01Rank(actual, node.context)).toEqual({q: 0, n: 0});
  expect(result.receipt.actualComponents.map(at => at.component)).toEqual(expect.arrayContaining([...recognized.ambientDeclarations]));
  for (const id of node.context.members) {
    if (actual.lookup(id).kind === 'found') continue;
    const found = node.context.lookup(id);
    if (found.kind === 'found' && found.node.kind === 'element') expect(found.node.value?.lexical.context.namespaces['']).toBe(savedMap);
  }
  console.log('larger ambient complete', {arity, count, work: actual.budget.usage().work, rssBytes: process.memoryUsage().rss});
});

it('does not certify reverse affiliations or occupied output names as ambient independence', async () => {
  for (const extra of [
    '<xs:element name="affiliate" type="t:HeadWords" substitutionGroup="t:h1"/>',
    '<xs:element name="y1" type="t:Words"/>',
  ]) {
    const {actual, target, hypothesis} = await inherited('Heads', extra);
    expect(recognizePrivateAmbientEnvironment(actual, hypothesis.context, target).kind).toBe('outside-private-ambient');
    // Out of the sufficient class is neither invalid actual input nor nonexistence.
    expect(prepareFiniteRe01Frontier(actual).kind).toBe('native-frontier-session');
    if (extra.includes('substitutionGroup')) {
      const head = globalId('element', {namespace, local: 'h1'}), member = globalId('element', {namespace, local: 'affiliate'});
      expect(hypothesis.context.lookup(head)).toEqual(actual.lookup(head));
      expect(effectiveSubstitutionMembers(actual, head)).toMatchObject({kind: 'checked', value: [member]});
    }
    const attempted = preparePrivateAnchoredListAssignments(actual, hypothesis.context, target);
    expect(attempted.kind).toBe('unresolved');
  }
});

it('retains an arbitrary finite collection of required inherited subportfolio readers', async () => {
  const {actual, target, hypothesis} = await inherited('Heads', '', 3);
  const recognized = recognizePrivateAmbientEnvironment(actual, hypothesis.context, target);
  assert.equal(recognized.kind, 'recognized-private-ambient'); expect(recognized.readers).toHaveLength(3);
  const result = completeSeededRe01Evidence(actual, hypothesis.target, hypothesis); assert.equal(result.kind, 'checked-witness', json(result));
  for (const proof of result.receipt.proof) expect(proof.components.map(at => at.component)).toEqual(expect.arrayContaining([...recognized.readers]));
  expect(result.evidence.nodes).toHaveLength(2);
});

it('does not certify a forged fresh actual-mapping provenance or a second parent fork', async () => {
  const {actual, target, readerId, hypothesis} = await inherited('Heads'), parent = hypothesis.context;
  const nodes = parent.members.map(id => parent.lookup(id)).map(at => {assert.equal(at.kind, 'found'); return at.node;});
  const endpoint = parent.lookup(hypothesis.target); assert.equal(endpoint.kind, 'found'); assert.equal(endpoint.node.kind, 'complexType');
  const built = forkSemanticCandidate(actual, {key: 'bad-reader-provenance', active: parent.members,
    endpoint: endpoint.node, additions: nodes.filter(n => actual.lookup(n.id).kind === 'missing'),
    rawTypes: nodes.flatMap(n => {const row = parent.rawTypeProperties(n.id); return row ? [{...row,
      provenance: n.id === readerId ? {kind: 'actual-mapped' as const, original: n.id} : row.provenance}] : [];})});
  assert.equal(built.kind, 'prepared');
  expect(recognizePrivateAmbientEnvironment(actual, built.context, target)).toMatchObject({kind: 'outside-private-ambient', reason: 'genuine inherited SOURCE row and provenance'});
  const second = forkSemanticCandidate(parent, {key: 'second-fork', active: parent.members}); assert.equal(second.kind, 'prepared');
  expect(recognizePrivateAmbientEnvironment(actual, second.context, target)).toMatchObject({kind: 'outside-private-ambient', reason: 'one authenticated parent fork'});
});

it('preserves individual checked positives outside the new sufficient class', async () => {
  const family = largerSchema(2, 0, false, 'true', 'urn:outside'), actual = await source('<xs:simpleType name="extra"><xs:restriction base="xs:string"/></xs:simpleType>', family.xml);
  expect(recognizePrivateAmbientEnvironment(actual, actual, family.target).kind).toBe('outside-private-ambient');
  expect(buildRe01Evidence(actual, family.target).kind).toBe('checked-witness');
});

it('rejects an illegal VALUE in the reader dependency closure while preserving its local RP relation', async () => {
  const {actual, target, readerId, hypothesis} = await inherited('Heads');
  const prepared = preparePrivateAnchoredListAssignments(actual, hypothesis.context, target); assert.equal(prepared.kind, 'prepared-anchored-list-assignments');
  const assignment = prepared.assignments[0]!;
  const subject = assignment.cohorts[0]!.member;
  const built = forkSemanticCandidate(hypothesis.context, {...assignment.delta, key: 'bad-reader-value',
    additions: assignment.delta.additions!.map(n => n.id === subject && n.kind === 'element' && n.value
      ? {...n, value: {...n.value, lexical: {...n.value.lexical, value: 'false'}}} : n)});
  assert.equal(built.kind, 'prepared');
  // Local RP compares the same global member on each side; FULL still owes its VALUE.
  expect(checkComponentConstruction(built.context, readerId).kind).toBe('checked');
  expect(checkComponentConstruction(built.context, subject).kind).toBe('candidate-rejected');
  const result = verifyFiniteRe01Evidence(actual, hypothesis.target, {root: 'root', nodes: [
    {...hypothesis, id: 'root', premises: ['child']}, {...assignment.evidence, context: built.context, id: 'child', premises: []},
  ]});
  expect(result.kind).toBe('candidate-rejected');
});

it('precharges recognition on the same sticky request budget as construction and evidence', async () => {
  const family = largerSchema(2, 2, false, 'true', 'urn:budget'), actual = await source('', family.xml);
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK - actual.budget.usage().work - 100));
  const result = recognizePrivateAmbientEnvironment(actual, actual, family.target);
  expect(result.kind).toBe('resource-limit'); expect(result).toBe(actual.budget.failure());
  const usage = actual.budget.usage().work;
  expect(recognizePrivateAmbientEnvironment(actual, actual, family.target)).toBe(result);
  expect(buildRe01Evidence(actual, family.target)).toBe(result); expect(actual.budget.usage().work).toBe(usage);
});

it.each([['observer', 'h1'], ['observer_with_a_long_fresh_name', 'h2'], ['observer_renamed', 'h1']] as const)('D2 refuses forward-only pruning of a group reader observed by %s TYPE using %s', async (name, head) => {
  const xml = await readFile('test/conformance/fixtures/xsd/recovery/private-list-inherited.xsd', 'utf8');
  const family = {namespace, name: (n: string) => n === 'fullCarrier' ? 'Heads' : n === 'subsetCarrier' ? 'ReaderBody' : n,
    xml: xml.replace('</xs:schema>', `<xs:group name="ReaderGroup"><xs:choice><xs:element ref="t:${head}"/></xs:choice></xs:group>`
      + '<xs:complexType name="ReaderBody"><xs:complexContent><xs:restriction base="xs:anyType"><xs:group ref="t:ReaderGroup"/></xs:restriction></xs:complexContent></xs:complexType></xs:schema>')};
  const {actual, target, readerId, hypothesis} = await inherited('A', '', 2, family, true);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments'); const staged = prepared.assignments[0]; assert.ok(staged);
  const unobservedAdditions = staged.delta.additions!.filter(n => n.id !== readerId);
  const unobservedPrune = forkSemanticCandidate(actual, {...staged.delta, key: 'd2-unobserved-prune', additions: unobservedAdditions,
    active: [...actual.members, ...unobservedAdditions.map(n => n.id)], rawTypes: staged.delta.rawTypes!.filter(row => row.type !== readerId)});
  assert.equal(unobservedPrune.kind, 'prepared', json(unobservedPrune));
  expect(completeSeededRe01Evidence(actual, staged.target, {...rootHypothesis(staged), context: unobservedPrune.context}).kind).toBe('checked-witness');
  const template = actual.lookup(globalId('element', {namespace, local: 'h1'}));
  assert.equal(template.kind, 'found'); assert.equal(template.node.kind, 'element');
  const observerId = globalId('element', {namespace, local: name});
  const observer = {...template.node, id: observerId, identity: {kind: 'global' as const, role: 'element' as const, name: {namespace, local: name}},
    name: {namespace, local: name}, abstract: false, type: local(readerId)};
  const additions = [...staged.delta.additions!, observer];
  const delta = {...staged.delta, key: 'd2-observed-reader', additions, active: [...actual.members, ...additions.map(n => n.id)],
    rawElements: [...staged.delta.rawElements!, {element: observerId, type: local(readerId), final: [], block: []}]};
  const observed = forkSemanticCandidate(actual, delta); assert.equal(observed.kind, 'prepared', json(observed));
  // RootD's BODY/BASE have no edge to this reader. It is nevertheless a FULL
  // root, and a separate fresh GLOBAL root now requires its exact TYPE identity.
  const completed = completeSeededRe01Evidence(actual, staged.target, {...rootHypothesis(staged), context: observed.context});
  assert.equal(completed.kind, 'checked-witness', json(completed)); expect(completed.evidence.nodes).toHaveLength(2);
  expect(completed.receipt.proof[0]!.components.map(n => n.component)).toContain(observerId);
  const prunedAdditions = additions.filter(n => n.id !== readerId);
  const pruned = forkSemanticCandidate(actual, {...delta, key: 'd2-invalid-local-prune', additions: prunedAdditions,
    active: [...actual.members, ...prunedAdditions.map(n => n.id)], rawTypes: delta.rawTypes!.filter(row => row.type !== readerId)});
  expect(pruned).toMatchObject({kind: 'candidate-rejected', code: 'missing', component: readerId});
  // Joint omission is a different birth recipe, with new children and receipts.
  // The GLOBAL and its RAW row disappear together with the private reader.
  const jointAdditions = additions.filter(n => n.id !== readerId && n.id !== observerId);
  const joint = forkSemanticCandidate(actual, {...delta, key: 'e1-joint-birth-omission', additions: jointAdditions,
    active: [...actual.members, ...jointAdditions.map(n => n.id)], rawTypes: delta.rawTypes!.filter(row => row.type !== readerId),
    rawElements: delta.rawElements!.filter(row => row.element !== observerId)});
  assert.equal(joint.kind, 'prepared', json(joint));
  const rebuilt = completeSeededRe01Evidence(actual, staged.target, {...rootHypothesis(staged), context: joint.context});
  assert.equal(rebuilt.kind, 'checked-witness', json(rebuilt));
  expect(rebuilt.evidence.nodes).toHaveLength(2);
  for (const step of rebuilt.receipt.proof) {
    expect(step.components.map(n => n.component)).not.toContain(readerId);
    expect(step.components.map(n => n.component)).not.toContain(observerId);
  }
  expect(storedRe01Rank(actual, joint.context)).toEqual(storedRe01Rank(actual, observed.context));
  // Replacing only the root context leaves the old child's genuine parent.
  const transplanted = {...completed.evidence, nodes: completed.evidence.nodes.map(node =>
    node.context === observed.context ? {...node, context: joint.context} : node)};
  expect(verifyFiniteRe01Evidence(actual, staged.target, transplanted))
    .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: target});
  // This rejects one fixed mutation. It is not a counterexample to existence of
  // some other bounded successful representative for the original source input.
});

it('E1 distinguishes stored inactivity, retained ownership and reverse affiliation from physical birth omission', async () => {
  const {actual, target, readerId, hypothesis} = await inherited('A', '', 2, undefined, true, true);
  const prepared = preparePrivateStagedRootAssignments(actual, hypothesis.context, target);
  assert.equal(prepared.kind, 'prepared-anchored-list-assignments'); const staged = prepared.assignments[0]; assert.ok(staged);
  const full = completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged));
  assert.equal(full.kind, 'checked-witness', json(full));
  const reader = staged.context.lookup(readerId); assert.equal(reader.kind, 'found'); assert.equal(reader.node.kind, 'complexType');
  expect(forkSemanticCandidate(staged.context, {key: 'e1-raw-owner-cannot-disappear', active: staged.context.members.filter(n => n !== readerId)}))
    .toMatchObject({kind: 'candidate-rejected', code: 'outside-context', component: readerId});
  const reservationId = hypotheticalScopedId(id('A'), '/inactive-reservation', 'particle');
  const reservation = {...reader.node, kind: 'particle' as const, id: reservationId,
    identity: {kind: 'scoped' as const, owner: id('A'), path: '/inactive-reservation', role: 'particle'},
    occurs: {min: '1', max: '1'}, term: {kind: 'sequence' as const, children: []}};
  const reserved = forkSemanticCandidate(staged.context, {key: 'e1-reservation-birth', active: [...staged.context.members, reservationId], additions: [reservation]});
  assert.equal(reserved.kind, 'prepared', json(reserved));
  const inactive = forkSemanticCandidate(reserved.context, {key: 'e1-inactive-is-stored', active: staged.context.members});
  assert.equal(inactive.kind, 'prepared', json(inactive));
  expect(inactive.context.lookup(reservationId).kind).toBe('outside-context');
  expect(storedIdentityOccupant(inactive.context, reservation.identity)).toBe(reservationId);
  expect(storedRe01Rank(actual, inactive.context)).toMatchObject({kind: 'unresolved', rule: 'builder-rank-membership'});
  expect(forkSemanticCandidate(inactive.context, {key: 'e1-cannot-rebirth-stored', active: reserved.context.members,
    additions: [reservation]})).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: reservationId});
  const reactivated = forkSemanticCandidate(inactive.context, {key: 'e1-reactivate', active: reserved.context.members});
  assert.equal(reactivated.kind, 'prepared', json(reactivated));
  expect(reactivated.context.lookup(reservationId)).toEqual(reserved.context.lookup(reservationId));
  // A retained scoped declaration needs its owner even when TYPE is unrelated.
  const template = actual.lookup(globalId('element', {namespace, local: 'h1'}));
  assert.equal(template.kind, 'found'); assert.equal(template.node.kind, 'element');
  const ownedId = hypotheticalScopedId(readerId, '/owned', 'element');
  const owned = {...template.node, id: ownedId, identity: {kind: 'scoped' as const, owner: readerId, path: '/owned', role: 'element'}};
  const ownedAdditions = [...staged.delta.additions!, owned];
  const ownedDelta = {...staged.delta, key: 'e1-retained-owner', additions: ownedAdditions,
    active: [...actual.members, ...ownedAdditions.map(n => n.id)], rawElements: [...staged.delta.rawElements!, {element: ownedId, final: [], block: []}]};
  const withOwner = forkSemanticCandidate(actual, ownedDelta); assert.equal(withOwner.kind, 'prepared', json(withOwner));
  expect(withOwner.context.owner(ownedId)).toBe(readerId);
  const withoutOwner = ownedAdditions.filter(n => n.id !== readerId);
  expect(forkSemanticCandidate(actual, {...ownedDelta, key: 'e1-dangling-owner', additions: withoutOwner,
    active: [...actual.members, ...withoutOwner.map(n => n.id)], rawTypes: staged.delta.rawTypes!.filter(row => row.type !== readerId)}))
    .toMatchObject({kind: 'candidate-rejected', code: 'missing', component: readerId});
  // h1's forward record is unchanged; its reverse affiliate query changes.
  const memberId = globalId('element', {namespace, local: 'reverseObserver'});
  const member = {...template.node, id: memberId, identity: {kind: 'global' as const, role: 'element' as const,
    name: {namespace, local: 'reverseObserver'}}, name: {namespace, local: 'reverseObserver'}, abstract: false,
    substitutionGroup: local(template.node.id)};
  const members = [...staged.delta.additions!, member];
  const reverse = forkSemanticCandidate(actual, {...staged.delta, key: 'e1-reverse-observer', additions: members,
    active: [...actual.members, ...members.map(n => n.id)], rawElements: [...staged.delta.rawElements!, {element: memberId, final: [], block: []}]});
  assert.equal(reverse.kind, 'prepared', json(reverse));
  expect(reverse.context.lookup(template.node.id)).toEqual(staged.context.lookup(template.node.id));
  expect(reverse.context.incomingAffiliates(template.node.id)).toContain(memberId);
  expect(staged.context.incomingAffiliates(template.node.id)).not.toContain(memberId);
  const beforePool = effectiveSubstitutionMembers(staged.context, template.node.id);
  const afterPool = effectiveSubstitutionMembers(reverse.context, template.node.id);
  assert.equal(beforePool.kind, 'checked', json(beforePool)); assert.equal(afterPool.kind, 'checked', json(afterPool));
  expect(beforePool.value).not.toContain(memberId); expect(afterPool.value).toContain(memberId);
  expect(staged.context.lookup(memberId).kind).toBe('missing');
  expect(reverse.context.lookup(memberId).kind).toBe('found');
  // The same request's terminal budget failure prevents reconstruction success.
  actual.budget.guard(() => actual.budget.chargeWork(DEFAULT_MAX_WORK));
  const exhausted = completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged));
  expect(exhausted).toBe(actual.budget.failure()); expect(exhausted?.kind).toBe('resource-limit');
  const usage = actual.budget.usage().work;
  expect(completeSeededRe01Evidence(actual, staged.target, rootHypothesis(staged))).toBe(exhausted);
  expect(actual.budget.usage().work).toBe(usage);
});
