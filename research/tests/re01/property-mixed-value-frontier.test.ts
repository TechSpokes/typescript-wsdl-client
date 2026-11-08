/** Mixed VALUE properties retain real facts without promoting their inspected TYPE to FULL. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {AttributeUseNode, ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkDeclaration, checkDeclarationValueProperty} from '../../../src/compiler/schemaDeclarationPrimitives.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:property-mixed-value-frontier';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
async function seed() {
  const directory = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/property-mixed-value-frontier.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, initialGraph = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const get = (target: string): GraphNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const node = get(id(name)); assert.equal(node.kind, 'complexType'); return node;};
  const providers = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType'
    && node.identity.kind === 'scoped' && node.mixed && node.derivation?.kind === 'extension');
  assert.equal(providers.length, 2);
  const actualNP: string[] = [];
  for (const target of actual.members) {
    const checked = checkComponentConstruction(actual, target); assert.equal(checked.kind, 'checked', JSON.stringify(checked));
    assert.deepEqual(checked.obligations, []);
    if (checked.re01 && !checked.re01.primitive) actualNP.push(target);
  }
  assert.deepEqual(new Set(actualNP), new Set([id('X'), ...providers.map(node => node.id)]));
  const rows: RawComplexTypeProperties[] = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id), attrs = assessSourceAttributeUses(actual, node.id);
    assert.equal(mapped.kind, 'checked'); assert.deepEqual(mapped.view.synthetic, []); assert.equal(attrs.kind, 'checked');
    return [{type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [], content: mapped.view.content,
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
      attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: node.id}}];
  });
  const row = (target: string) => {const value = rows.find(item => item.type === target); assert.ok(value); return value;};
  const helper = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...complex('R'), id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, derivation: {kind: method, contentKind: 'complex', base, facets: []},
    content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, abstract: node.abstract, final: [], block: [], derivation: {method: node.derivation!.kind, base: node.derivation!.base}, content,
    attributeUses: uses, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const scopes = ['Left', 'Right'].map(name => {
    const element = get(globalId('element', {namespace, local: name})); assert.equal(element.kind, 'element'); assert.equal(element.type.kind, 'local');
    const owner = get(element.type.target); assert.equal(owner.kind, 'complexType');
    const use = request.graph.nodes.find((node): node is AttributeUseNode => node.kind === 'attributeUse' && node.identity.kind === 'scoped' && node.identity.owner === owner.id);
    assert.ok(use); return {owner, use};
  });
  const fa = helper('FA', 'restriction', builtin('anyType')), fr = helper('FR', 'restriction', local(fa.id)), ft = helper('FT', 'extension', local(fr.id));
  const ds: ComplexTypeNode[] = ['D1', 'D2'].map(name => ({...helper(name, 'restriction', builtin('anyType')), id: scopedId(fa.id, '/' + name, 'complexType'),
    identity: {kind: 'scoped', owner: fa.id, path: '/' + name, role: 'complexType'}}));
  const elementSeed = get(globalId('element', {namespace, local: 'Left'})); assert.equal(elementSeed.kind, 'element');
  const elements: ElementNode[] = ds.map((node, index) => ({...elementSeed, id: scopedId(fa.id, '/l' + index, 'element'),
    identity: {kind: 'scoped', owner: fa.id, path: '/l' + index, role: 'element'}, name: {namespace: '', local: 'l'}, type: local(node.id),
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const particles: ParticleNode[] = elements.map((node, index) => ({kind: 'particle', context: node.context, id: scopedId(fa.id, '/p' + index, 'particle'),
    identity: {kind: 'scoped', owner: fa.id, path: '/p' + index, role: 'particle'}, occurs: {min: '0', max: '1'}, term: {kind: 'element', declaration: local(node.id)},
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const additions: GraphNode[] = [{...fa, content: particles[1].id}, fr, ft, ...ds, ...elements, ...particles];
  const x: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const supplied = request.candidate({key: 'parent', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint: x,
    rawTypes: [...rows.filter(item => item.type !== x.id), {...raw(x, {kind: 'empty'}), provenance: {kind: 'hypothetical-abstract', originals: [x.id]}},
      raw(fa, {kind: 'element-only', particle: particles[1].id}), raw(fr, {kind: 'empty'}), raw(ft, {kind: 'empty'}),
      ...ds.map((node, index) => raw(node, {kind: 'empty'}, [scopes[index].use.id]))],
    rawElements: elements.map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(supplied.kind, 'prepared'); const parent = supplied.context;
  const parentCorrespondence = checkCandidateCorrespondence(actual, actual, parent, x.id, id('B'), local(id('A'))); assert.equal(parentCorrespondence.kind, 'checked');
  const parentClosure = new Set<string>(), parentPending = [x.id, id('B'), ...additions.map(node => node.id)], parentNP: string[] = [];
  while (parentPending.length) {
    const target = parentPending.pop()!; if (parentClosure.has(target)) continue;
    const checked = checkComponentConstruction(parent, target, {correspondence: parentCorrespondence}); assert.equal(checked.kind, 'checked', JSON.stringify(checked));
    assert.deepEqual(checked.obligations, []); parentClosure.add(target); parentPending.push(...checked.dependencies);
    for (const dependency of checked.typeDependencies) if (dependency.contextId === parent.contextId && dependency.type.kind === 'component') parentPending.push(dependency.type.id);
    if (checked.re01 && !checked.re01.primitive) parentNP.push(target);
  }
  assert.deepEqual(parentNP, [ft.id]); for (const provider of providers) assert.equal(parentClosure.has(provider.id), false);
  const providerProof = (owner: SemanticContext, index: number, name: string): FiniteRe01EvidenceNode => {
    const provider = providers[index], whole = deriveOriginalComplexParticle(actual, provider.id); assert.equal(whole.kind, 'checked');
    const middle = {...helper('Q' + index, 'extension', local(id('A'))), mixed: true};
    const endpoint: ComplexTypeNode = {...provider, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
    const delta = {key: name, active: [...owner.members, middle.id], additions: [middle], endpoint,
      rawTypes: [{...row(provider.id), derivation: {method: 'restriction' as const, base: local(middle.id)}, provenance: {kind: 'hypothetical-abstract' as const, originals: [provider.id]}}, raw(middle, whole.content)]};
    const issued = owner.kind === 'actual' ? request.candidate(delta) : forkSemanticCandidate(owner, delta); assert.equal(issued.kind, 'prepared');
    const correspondence = checkCandidateCorrespondence(actual, owner, issued.context, provider.id, middle.id, local(id('A'))); assert.equal(correspondence.kind, 'checked');
    const full = checkComponentConstruction(issued.context, middle.id, {correspondence}); assert.equal(full.kind, 'checked', JSON.stringify(full)); assert.deepEqual(full.obligations, []);
    assert.equal(full.re01?.primitive, true);
    return {id: name, parent: owner, context: issued.context, target: provider.id, intermediate: middle.id, ancestor: local(id('A')), premises: []};
  };
  const originals = providers.map((_, index) => providerProof(actual, index, 'actual-' + index));
  const child = (identity: boolean, support = false, consume = false, badDefault = false) => {
    const prefix = particles[identity ? 1 : 0], fe = helper('FE', 'extension', local(fa.id));
    const outer: ParticleNode = {...prefix, id: scopedId(fe.id, '/outer', 'particle'), identity: {kind: 'scoped', owner: fe.id, path: '/outer', role: 'particle'},
      occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [prefix.id]}};
    const middle = {...fe, content: outer.id}, target: ComplexTypeNode = {...ft, derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const required: ElementNode = {...elementSeed, id: globalId('element', {namespace, local: 'Required'}), name: {namespace, local: 'Required'},
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'Required'}}, type: local(providers[0].id),
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const badType = {...helper('NonemptyMixed', 'restriction', builtin('anyType')), mixed: true};
    const payload: ElementNode = {...elementSeed, id: scopedId(badType.id, '/payload', 'element'), name: {namespace: '', local: 'payload'},
      identity: {kind: 'scoped', owner: badType.id, path: '/payload', role: 'element'}, type: builtin('string'),
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const payloadUse: ParticleNode = {...particles[0], id: scopedId(badType.id, '/payload-use', 'particle'),
      identity: {kind: 'scoped', owner: badType.id, path: '/payload-use', role: 'particle'}, occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: local(payload.id)}};
    const originalValue = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.value !== undefined); assert.ok(originalValue?.value);
    const badDeclaration: ElementNode = {...required, id: globalId('element', {namespace, local: 'BadDefault'}), name: {namespace, local: 'BadDefault'},
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'BadDefault'}}, type: local(badType.id), value: originalValue.value};
    const fresh: GraphNode[] = [middle, outer, ...(consume ? [required] : []), ...(badDefault ? [{...badType, content: payloadUse.id}, payload, payloadUse, badDeclaration] : [])];
    const issued = forkSemanticCandidate(parent, {key: identity ? 'identity' : 'copy', active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh, endpoint: target,
      rawTypes: [raw(target, {kind: 'empty'}), raw(middle, {kind: 'element-only', particle: outer.id}),
        ...(badDefault ? [raw(badType, {kind: 'mixed', particle: payloadUse.id})] : [])],
      rawElements: [...(consume ? [required] : []), ...(badDefault ? [payload, badDeclaration] : [])].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
    assert.equal(issued.kind, 'prepared'); const context = issued.context;
    const correspondence = checkCandidateCorrespondence(actual, parent, context, target.id, middle.id, local(fa.id)); assert.equal(correspondence.kind, 'checked');
    const own = deriveRawComplexContent(context, middle.id), base = deriveRawComplexContent(context, fa.id); assert.equal(own.kind, 'checked'); assert.equal(base.kind, 'checked');
    const extension = checkRawParticleExtension(context, own.view, base.view); assert.equal(extension.kind, 'checked'); assert.equal(extension.value, true);
    const extra = support ? [providerProof(context, 0, 'nested-0')] : [];
    const proof = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [
      {id: 'X', parent: actual, context: parent, target: x.id, intermediate: id('B'), ancestor: local(id('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: middle.id, ancestor: local(fa.id), premises: extra.map(node => node.id)}, ...originals, ...extra]});
    return {context, correspondence, middle, extension, proof, fresh, required, badType, badDeclaration};
  };
  return {actual, providers, child, providerProof, scopes, additions, ft, request, initialGraph};
}

describe('mixed VALUE property formation preserves the exact FULL frontier', () => {
  it.each([true, false])('completes identity prefix %s without hypothetical FULL of either property-only provider', async identity => {
    const s = await seed(), c = s.child(identity); assert.equal(c.proof.kind, 'checked-candidate', JSON.stringify(c.proof));
    assert.equal(c.proof.proof.length, 4); assert.equal(c.proof.actualComponents.length, s.actual.members.length);
    const step = c.proof.proof.find(item => item.target === s.ft.id); assert.ok(step);
    for (const node of [...s.additions, ...c.fresh]) assert.ok(step.components.some(item => item.component === node.id));
    for (const provider of s.providers) {
      assert.equal(step.components.some(item => item.component === provider.id), false);
      assert.deepEqual(c.proof.proof.filter(item => item.target === provider.id).map(item => item.parentContext), [s.actual.contextId]);
      const declaration = s.request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.type.kind === 'local' && node.type.target === provider.id); assert.ok(declaration);
      const property = checkDeclarationValueProperty(c.context, declaration.id), full = checkDeclaration(c.context, declaration.id);
      assert.equal(property.kind, 'checked'); assert.equal(full.kind, 'checked');
      assert.equal(property.constraint?.operand.family, 'string');
      assert.equal(property.typeDependencies.some(item => item.type.kind === 'component' && item.type.id === provider.id), false);
      assert.ok(full.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'component' && item.type.id === provider.id));
      assert.ok(property.obligations.includes('element-default-mixed-emptiable:' + provider.id));
      const mapped = deriveRawComplexContent(c.context, provider.id); assert.equal(mapped.kind, 'checked');
      const view = prepareSemanticParticleView(c.context, mapped.view, 'restriction'); assert.equal(view.kind, 'checked'); assert.equal(view.view.root.summary.schemaEmptiable, true);
    }
    if (!identity) {
      assert.deepEqual(new Set(c.extension.obligations), new Set(['component-validity', ...s.providers.map(node => 'element-default-mixed-emptiable:' + node.id)]));
      const nodes = s.scopes.map(item => {const found = c.context.lookup(item.owner.id); assert.equal(found.kind, 'found'); return found.node;}) as [GraphNode, GraphNode];
      const property = compareComponentProperties(c.context, ...nodes); assert.equal(property.kind, 'checked'); assert.equal(property.value, true);
    }
    assert.equal(JSON.stringify(s.request.graph), s.initialGraph); assert.equal(s.actual.budget.exhausted(), false);
  });

  it('retains the fixed-parent method obstruction when an inspected provider is independently retired', async () => {
    const s = await seed(), c = s.child(false), nested = s.providerProof(c.context, 0, 'independent-provider');
    const correspondence = checkCandidateCorrespondence(s.actual, c.context, nested.context, nested.target, nested.intermediate, nested.ancestor);
    assert.equal(correspondence.kind, 'checked');
    const receipt = checkComponentConstruction(nested.context, c.middle.id, {correspondence});
    assert.equal(receipt.kind, 'candidate-rejected'); assert.equal(receipt.rule, 'cos-particle-extend');
  });

  it('still demands an exact hypothetical proof for a fresh declaration genuinely typed by the provider', async () => {
    const s = await seed(), missing = s.child(true, false, true), complete = s.child(true, true, true);
    assert.equal(missing.proof.kind, 'unresolved'); assert.equal(missing.proof.rule, 'missing-nested-evidence'); assert.equal(missing.proof.component, s.providers[0].id);
    assert.equal(complete.proof.kind, 'checked-candidate', JSON.stringify(complete.proof)); assert.equal(complete.proof.proof.length, 5);
    assert.deepEqual(complete.proof.proof.filter(item => item.target === s.providers[0].id).map(item => item.parentContext).sort(), [s.actual.contextId, complete.context.contextId].sort());
  });

  it('still checks the actual mixed emptiability fact after reading a STRING property', async () => {
    const s = await seed(), c = s.child(false, false, false, true);
    const property = checkDeclarationValueProperty(c.context, c.badDeclaration.id); assert.equal(property.kind, 'checked');
    assert.equal(property.constraint?.operand.family, 'string');
    assert.ok(property.obligations.includes('element-default-mixed-emptiable:' + c.badType.id));
    assert.equal(property.typeDependencies.some(item => item.type.kind === 'component' && item.type.id === c.badType.id), false);
    assert.equal(c.proof.kind, 'candidate-rejected'); assert.equal(c.proof.rule, 'e-props-correct.2');
    const full = checkDeclaration(c.context, c.badDeclaration.id); assert.equal(full.kind, 'checked');
    assert.ok(full.typeDependencies.some(item => item.type.kind === 'component' && item.type.id === c.badType.id));
  });
});
