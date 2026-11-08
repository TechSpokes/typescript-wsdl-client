/** Authentic generated SOURCE scalar, complex R facade, and fixed BOOLEAN RP. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {createSchemaScalarKernel, checkOriginalGeneratedScalar} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkSubstitution, checkTypeDerivation, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {checkCandidateCorrespondence, re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const folder = path.resolve('test/conformance/fixtures'), namespace = 'urn:scalar:rooted-sc-guard';
const id = (name: string) => globalId('type', {namespace, local: name}), eid = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const generated = (name: string) => ({kind: 'original-generated' as const, owner: id(name)});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at, 2);

async function control(mode: 'guarded' | 'exact-sigma' | 'r-sigma' | 'bad-content-ancestry' | 'missing-pattern') {
  const loaded = await loadSemanticSchemaInput(path.join(folder, 'xsd/recovery/scalar-sc-fixed-value-dispatch.xsd'), {policy: {fileRoots: [folder]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, before = JSON.stringify(request.graph);
  const get = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const a = get('A'), tau = get('Tau'), sigma = get('Sigma'), t = get('t');
  const on = {...a.context, namespaces: {...a.context.namespaces, '': 'urn:scalar:on'}},
    off = {...a.context, namespaces: {...a.context.namespaces, '': 'urn:scalar:off'}};
  const common = {context: on, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const scalar = (name: string, base: Reference): SimpleTypeNode => ({...common, kind: 'simpleType', id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety: {kind: 'restriction', base, facets: []}});
  const guard = scalar('Guard', builtin('QName')), u = scalar('U', builtin('anySimpleType'));
  const rows: RawSimpleTypeProperties[] = [
    {type: guard.id, base: builtin('QName'), targetNamespace: namespace, final: [], variety: {kind: 'atomic'}, facetComponentSet: [{annotation: 'absent', facets: [{
      name: 'enumeration', fixed: false, lexical: {value: 'true', context: on}, operand: {context: 'active', type: builtin('QName'), owner: a.id}}]}],
      provenance: {kind: 'hypothetical-abstract', originals: []}},
    {type: u.id, base: generated(mode === 'bad-content-ancestry' ? 'Tau' : 'Sigma'), targetNamespace: namespace, final: [], variety: {kind: 'union', members: [local(guard.id), builtin('boolean')]},
      facetComponentSet: mode === 'missing-pattern' ? [] : mode === 'bad-content-ancestry'
        ? [{annotation: 'absent', facets: [{name: 'pattern', fixed: false, lexical: {value: 'true', context: on}}]}] : [{baseComponent: 0}],
      provenance: {kind: 'hypothetical-abstract', originals: []}},
  ];
  const complex = (name: string, base: ComplexTypeNode, method: 'extension' | 'restriction', simple = false): ComplexTypeNode => ({...common,
    kind: 'complexType', id: id(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, abstract: false, mixed: false, attributes: [],
    derivation: {kind: method, contentKind: simple ? 'simple' : 'complex', base: local(base.id), facets: []}});
  const q = complex('q', a, 'extension'), c = complex('C', sigma, 'restriction', true), r = complex('RSigma', sigma, 'restriction', true);
  const members: ElementNode[] = ['1', '2'].map(index => ({...common, context: off, kind: 'element', id: eid('y' + index),
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'y' + index}}, name: {namespace, local: 'y' + index},
    type: local(mode === 'exact-sigma' ? sigma.id : mode === 'r-sigma' ? r.id : c.id), abstract: false, nillable: false, substitutionGroup: local(eid('h' + index)),
    value: {kind: 'fixed', lexical: {value: 'true', context: off}}}));
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
    abstract: false, final: [], block: [], attributeUses: [], content, provenance: {kind: 'hypothetical-abstract', originals: actual.members.includes(node.id) ? [node.id] : []}});
  const originals = ['Z', 'Tau', 'Sigma', 'A', 'I', 't'].map(name => {
    const node = get(name), mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    const whole = 'particle' in mapped.view.content ? deriveOriginalComplexParticle(actual, node.id) : undefined;
    if (whole) assert.equal(whole.kind, 'checked'); return raw(node, whole?.kind === 'checked' ? whole.content : mapped.view.content);
  });
  const wholeA = deriveOriginalComplexParticle(actual, a.id); assert.equal(wholeA.kind, 'checked');
  const endpoint: ComplexTypeNode = {...t, derivation: {kind: 'restriction', contentKind: 'complex', base: local(q.id), facets: []}};
  const full = (context: SemanticContext) => context.members.map(type => ({type, result: checkComponentConstruction(context, type)}));
  const retainDebts = (items: readonly {rule: string; component: string; contextId?: string}[]) => {for (const item of items) {
    assert.equal(item.rule, 'simple-content-base-mixed-emptiable'); assert.equal(item.component, id('Z')); assert.equal(item.contextId, actual.contextId);
  }};
  const requireFull = (facts: ReturnType<typeof full>) => {for (const {type, result} of facts) {assert.equal(result.kind, 'checked', json({type, result})); retainDebts(result.obligations);}};
  const actualFull = full(actual); requireFull(actualFull);
  const generatedFacts = ['Tau', 'Sigma'].map(name => {const slot = actual.lookupScalarSlot(generated(name)); assert.equal(slot.kind, 'found');
    const result = checkOriginalGeneratedScalar(actual, slot.slot); assert.equal(result.kind, 'checked'); retainDebts(result.obligations); return result;});
  const additions: GraphNode[] = [guard, u, q, c, r, ...members];
  const built = request.candidate({key: mode, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawSimpleTypes: rows, rawElements: members.map(member => ({element: member.id, type: member.type, final: [], block: []})),
    rawTypes: [...originals.map(row => row.type === t.id ? {...row, derivation: {method: 'restriction' as const, base: local(q.id)}} : row),
      raw(q, wholeA.content), raw(c, {kind: 'simple', type: local(u.id)}), raw(r, {kind: 'simple', type: generated('Sigma')})]}); assert.equal(built.kind, 'prepared');
  const context = built.context, current = full(context);
  const views = [t.id, q.id].map(type => {const mapped = deriveRawComplexContent(context, type); assert.equal(mapped.kind, 'checked');
    const view = prepareSemanticParticleView(context, mapped.view, 'restriction'); assert.equal(view.kind, 'checked'); return view.view;});
  // Dropping Sigma's P1 widens U's selected image. This is an actual F2
  // rejection before aggregate deferral, rather than an undischarged debt.
  if (mode === 'missing-pattern') {
    for (const result of [checkParticleRestriction(context, views[0], views[1]),
      checkParticleRestriction(context, views[0], views[1], {deferScalarObligations: true})]) {
      assert.equal(result.kind, 'invalid-schema', json(result)); assert.equal(result.rule, 'scalar-value-space-restriction'); assert.equal(result.component, u.id);
    }
    const failed = verifyFiniteRe01Evidence(actual, t.id, {root: mode, nodes: [{id: mode, parent: actual, context,
      target: t.id, intermediate: q.id, ancestor: local(a.id), premises: []}]});
    assert.equal(failed.kind, 'candidate-rejected', json(failed)); assert.equal(failed.rule, 'scalar-value-space-restriction');
    assert.ok(members.some(member => member.id === failed.component));
    assert.equal(JSON.stringify(request.graph), before); assert.ok(actual.budget.usage().work < 125_000_000); return;
  }
  const directRp = checkParticleRestriction(context, views[0], views[1]); assert.equal(directRp.kind, 'unresolved', json(directRp));
  const rp = checkParticleRestriction(context, views[0], views[1], {deferScalarObligations: true}); assert.equal(rp.kind, 'checked', json(rp));
  assert.ok(rp.scalarObligations.some(at => at.rule === 'simple-content-base-mixed-emptiable' && at.component === id('Z') && at.contextId === actual.contextId));
  assert.ok(Object.isFrozen(rp.scalarObligations)); assert.ok(rp.scalarObligations.every(Object.isFrozen));
  const correspondence = checkCandidateCorrespondence(actual, actual, context, t.id, q.id, local(a.id)); assert.equal(correspondence.kind, 'checked', json(correspondence));
  const forest = verifyFiniteRe01Evidence(actual, t.id, {root: mode, nodes: [{id: mode, parent: actual, context,
    target: t.id, intermediate: q.id, ancestor: local(a.id), premises: []}]});
  const kernel = createSchemaScalarKernel(context), assess = (type: SemanticTypeReference, word: string, map = off) => {
    const at = kernel.assess(type, {value: word, context: map}, a.id); assert.equal(at.kind, 'checked', json(at));
    return {family: at.value.operand.family, canonical: at.value.operand.canonical, obligations: at.obligations};
  };
  const observations = {tau1: assess(local(tau.id), '1'), sigmaTrue: assess(local(sigma.id), 'true'), uOn: assess(local(u.id), 'true', on),
    uOff: assess(local(u.id), 'true'), cTrue: assess(local(c.id), 'true'), rTrue: assess(local(r.id), 'true')};
  assert.equal(observations.tau1.family, 'boolean'); assert.equal(observations.tau1.canonical, 'true');
  assert.equal(observations.sigmaTrue.family, 'QName'); assert.equal(observations.uOn.family, 'QName'); assert.equal(observations.uOff.family, 'boolean');
  assert.equal(observations.cTrue.family, 'boolean'); assert.equal(observations.rTrue.family, 'QName');
  const nominal = members.map(member => checkTypeDerivation(context, member.type, local(tau.id), ['extension', 'list', 'union']));
  const affiliation = members.map((member, index) => checkSubstitution(context, member.id, eid('h' + (index + 1)), {mode: 'affiliation'}));
  const pools = ['1', '2'].map(index => effectiveSubstitutionMembers(context, eid('h' + index)));
  for (const at of [...nominal, ...affiliation]) {assert.equal(at.kind, 'checked'); assert.equal(at.value, true);}
  for (const [index, at] of pools.entries()) {assert.equal(at.kind, 'checked'); assert.deepEqual(at.value, [members[index].id]);}
  const ancestor = re01Ancestor(actual, t.id); assert.equal(ancestor.kind, 'checked');
  assert.equal(JSON.stringify(request.graph), before); assert.ok(actual.budget.usage().work < 125_000_000);
  if (mode === 'guarded') {requireFull(current); assert.equal(rp.value, true); assert.equal(forest.kind, 'checked-candidate', json(forest)); assert.equal(forest.proof.length, 1);
    assert.ok(rp.scalarObligations.some(at => at.rule === 'raw-simple-content-derivation-validity' && at.component === c.id && at.contextId === context.contextId));
    const fullC = forest.proof[0].components.find(at => at.component === c.id); assert.ok(fullC);
    assert.ok(fullC.discharged.some(at => at.rule === 'raw-simple-content-derivation-validity' && at.component === c.id && at.contextId === context.contextId));
    assert.ok(forest.actualScalarSlots.some(at => at.slot.owner === sigma.id));}
  else if (mode === 'exact-sigma' || mode === 'r-sigma') {requireFull(current.filter(at => at.type !== t.id)); assert.equal(rp.value, false); assert.equal(forest.kind, 'candidate-rejected');
    assert.equal(forest.component, t.id); assert.equal(forest.rule, 'derivation-ok-restriction.5.4');}
  else if (mode === 'bad-content-ancestry') {assert.equal(rp.value, true); assert.equal(forest.kind, 'candidate-rejected', json(forest));
    assert.equal(forest.component, c.id); assert.equal(forest.rule, 'derivation-ok-restriction.5.2');}
}

it.each(['guarded', 'exact-sigma', 'r-sigma', 'bad-content-ancestry', 'missing-pattern'] as const)(
  'checks actual SC fixed-value evidence with %s', async mode => {await control(mode);});
