/** Same-component source selection keeps source wrappers outside the fresh frontier. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate, prepareSemanticRequest} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle, deriveRawComplexContent, deriveOriginalContentSubtree, particleContentNode} from '../../../src/compiler/complexTypeContent.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {immediateTypeBase} from '../../../src/compiler/schemaTypeRelations.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:research:endpoint-origin-frontier';
const named = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
const fixtures = path.resolve('test/conformance/fixtures');
async function seed(selfReference = false) {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', selfReference
    ? 'original-particle-self-reference-independent.xsd' : 'original-particle-handles-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const actualChecks = actual.members.map(id => {
    const result = checkComponentConstruction(actual, id); assert.equal(result.kind, 'checked', JSON.stringify(result));
    assert.deepEqual(result.obligations, []); return result;
  });
  assert.deepEqual(actualChecks.flatMap(check => check.re01 && !check.re01.primitive ? [check.component] : []), [named('D')]);
  const get = (id: string): GraphNode => {const value = actual.lookup(id); assert.equal(value.kind, 'found'); return value.node;};
  const complex = (name: string): ComplexTypeNode => {const value = get(named(name)); assert.equal(value.kind, 'complexType'); return value;};
  const a = complex('A'), d = complex('D'), a0 = complex('A0'), b0 = complex('B0'); assert.ok(a.content);
  const mapped = deriveActualComplexContent(actual, d.id); assert.equal(mapped.kind, 'checked');
  assert.equal(mapped.view.synthetic.length, 1); assert.ok('particle' in mapped.view.content);
  const sourceOuter = particleContentNode(actual, mapped.view, mapped.view.content.particle); assert.ok(sourceOuter); assert.equal(sourceOuter.kind, 'particle');
  const original = deriveOriginalComplexParticle(actual, d.id); assert.equal(original.kind, 'checked');
  const helper = (name: string, base: Reference): ComplexTypeNode => ({...a0, id: named(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: 'complex', base, facets: []}});
  const e = helper('E', local(a.id)), f = helper('F', local(b0.id));
  const particle = (suffix: string, term: ParticleNode['term'], min = '1', max = '1'): ParticleNode => ({...sourceOuter,
    id: scopedId(e.id, suffix, 'particle'), identity: {kind: 'scoped', owner: e.id, path: suffix, role: 'particle'}, term, occurs: {min, max}});
  const wildcard = particle('/tail', {kind: 'any', wildcard: {namespace: {value: namespace, context: d.context}, processContents: 'skip'}}, '0', '1');
  const y = particle('/E-content', {kind: 'sequence', children: [a.content, wildcard.id]});
  const z = particle('/D-source-copy', sourceOuter.term);
  const row = (type: string, base: Reference, method: 'extension' | 'restriction', content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({
    type, derivation: {base, method}, abstract: false, final: [], block: [], content, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: type === d.id ? [type] : []}});
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
  const makeRoot = (copied = false, extras: readonly GraphNode[] = [], rows: readonly RawComplexTypeProperties[] = [],
    selected = original.content) => {
    const additions = [e, f, wildcard, y, ...(copied ? [z] : []), ...extras];
    return request.candidate({key: copied ? 'copy' : 'source', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [row(d.id, local(e.id), 'restriction', copied ? {kind: 'element-only', particle: z.id} : selected),
        row(e.id, local(a.id), 'extension', {kind: 'element-only', particle: y.id}), row(f.id, local(b0.id), 'extension', {kind: 'empty'}), ...rows]});
  };
  const makeChild = (parent: SemanticContext, affiliate = true) => {
    const e2 = helper('E2', local(a0.id));
    const h = get(globalId('element', {namespace, local: 'H'})); assert.equal(h.kind, 'element');
    const m: ElementNode = {...h, id: globalId('element', {namespace: '', local: 'p'}),
      identity: {kind: 'global', role: 'element', name: {namespace: '', local: 'p'}}, name: {namespace: '', local: 'p'},
      type: builtin('string'), substitutionGroup: local(h.id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const additions = [e2, ...(affiliate ? [m] : [])];
    const child = forkSemanticCandidate(parent, {key: affiliate ? 'affiliate' : 'no-affiliate',
      active: [...parent.members, ...additions.map(node => node.id)], additions,
      endpoint: {...f, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e2.id), facets: []}},
      rawTypes: [row(f.id, local(e2.id), 'restriction', {kind: 'empty'}), row(e2.id, local(a0.id), 'extension', {kind: 'empty'})],
      rawElements: affiliate ? [{element: m.id, type: m.type, final: [], block: []}] : []});
    assert.equal(child.kind, 'prepared');
    return {context: child.context, e2, m};
  };
  const proof = (root: SemanticContext, child: ReturnType<typeof makeChild>) => verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [
    {id: 'D', parent: actual, context: root, target: d.id, intermediate: e.id, ancestor: local(a.id), premises: ['F']},
    {id: 'F', parent: root, context: child.context, target: f.id, intermediate: child.e2.id, ancestor: local(a0.id), premises: []},
  ]});
  return {request, actual, d, a, e, f, z, row, original, mapped: mapped.view, sourceOuter, helper, endpoint, makeRoot, makeChild, proof};
}

describe('authentic original particle handles', () => {
  it('completes the affiliate forest without promoting the exact original wrapper', async () => {
    const s = await seed(), root = s.makeRoot(); assert.equal(root.kind, 'prepared');
    const child = s.makeChild(root.context), complete = s.proof(root.context, child);
    assert.equal(complete.kind, 'checked-candidate', JSON.stringify(complete)); expect(complete.proof).toHaveLength(2);
    expect(new Set(complete.actualComponents.map(row => row.component))).toEqual(new Set(s.actual.members));
    expect(root.context.rawTypeProperties(s.d.id)?.content).toMatchObject({original: s.original.content.original});
    const inherited = child.context.rawTypeProperties(s.d.id)?.content; assert.ok(inherited && 'particle' in inherited);
    expect(inherited.original).toBe(s.original.content.original);
    for (const context of [root.context, child.context]) {
      const view = deriveRawComplexContent(context, s.d.id); assert.equal(view.kind, 'checked');
      expect(view.view.type).toBe(s.d.id); expect(view.view.synthetic).toEqual(s.mapped.synthetic);
      expect(particleContentNode(context, view.view, s.sourceOuter.id)).toBe(s.sourceOuter);
      expect(context.lookup(s.sourceOuter.id).kind).toBe('missing');
      expect(deriveOriginalContentSubtree(context, view.view, s.sourceOuter.id).kind).toBe('checked');
      expect(() => deriveOriginalContentSubtree(context, {...view.view}, s.sourceOuter.id)).toThrow(/Unauthenticated/);
    }
    for (const step of complete.proof) expect(step.components.map(row => row.component)).not.toContain(s.sourceOuter.id);
    const childStep = complete.proof.find(step => step.target === s.f.id); assert.ok(childStep);
    expect(childStep.components.map(row => row.component)).not.toContain(s.d.id);
    const copied = s.makeRoot(true); assert.equal(copied.kind, 'prepared');
    const copiedView = deriveRawComplexContent(copied.context, s.d.id); assert.equal(copiedView.kind, 'checked');
    expect(deriveOriginalContentSubtree(copied.context, copiedView.view, s.z.id)).toMatchObject({kind: 'unresolved', rule: 'original-content-subtree'});
    const copiedChild = s.makeChild(copied.context), rejected = s.proof(copied.context, copiedChild);
    expect(rejected).toMatchObject({kind: 'candidate-rejected', rule: 'cos-nonambig', component: s.z.id});
    expect(s.proof(copied.context, s.makeChild(copied.context, false)).kind).toBe('checked-candidate');
  });

  it('borrows exact source content for an unrelated fresh type and rechecks genuine use in H', async () => {
    const s = await seed(), u: ComplexTypeNode = {...s.helper('U', builtin('anyType')),
      derivation: {kind: 'restriction', contentKind: 'complex', base: builtin('anyType'), facets: []}};
    const root = s.makeRoot(false, [u], [s.row(u.id, builtin('anyType'), 'restriction', s.original.content)]); assert.equal(root.kind, 'prepared');
    const good = s.proof(root.context, s.makeChild(root.context, false)); assert.equal(good.kind, 'checked-candidate', JSON.stringify(good));
    expect(good.proof[0].components.map(row => row.component)).toContain(u.id);
    const borrowed = deriveRawComplexContent(root.context, u.id); assert.equal(borrowed.kind, 'checked');
    expect(borrowed.view.type).toBe(u.id); expect(particleContentNode(root.context, borrowed.view, s.sourceOuter.id)).toBe(s.sourceOuter);
    expect(s.proof(root.context, s.makeChild(root.context))).toMatchObject({kind: 'candidate-rejected', rule: 'cos-nonambig', component: u.id});
  });

  it('retains aliasing when distinct original owners select the same composed particle', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/content-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, actual = request.actual, ns = 'urn:recovery:content';
    const id = (name: string) => globalId('type', {namespace: ns, local: name});
    const complex = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
    const d = deriveOriginalComplexParticle(actual, id('D')), target = deriveOriginalComplexParticle(actual, id('EmptyExtension'));
    assert.equal(d.kind, 'checked'); assert.equal(target.kind, 'checked');
    expect(d.content.particle).toBe(target.content.particle); expect(d.content.original).not.toBe(target.content.original);
    const fresh = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...complex('Empty'), id: id(name),
      identity: {kind: 'global', role: 'type', name: {namespace: ns, local: name}},
      derivation: {kind: method, contentKind: 'complex', base, facets: []}});
    const e = fresh('E', 'extension', local(id('B'))), u1 = fresh('U1', 'restriction', builtin('anyType')), u2 = fresh('U2', 'restriction', builtin('anyType'));
    const endpoint: ComplexTypeNode = {...complex('EmptyExtension'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}};
    const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
      targetNamespace: ns, derivation: {method: node.derivation!.kind, base: node.derivation!.base}, abstract: false, final: [], block: [], content, attributeUses: [],
      provenance: {kind: 'hypothetical-abstract', originals: node.id === endpoint.id ? [node.id] : []}});
    const candidate = request.candidate({key: 'aliased-source-particle', active: [...actual.members, e.id, u1.id, u2.id], additions: [e, u1, u2], endpoint,
      rawTypes: [raw(endpoint, target.content), raw(e, d.content), raw(u1, d.content), raw(u2, target.content)]});
    assert.equal(candidate.kind, 'prepared');
    const complete = verifyFiniteRe01Evidence(actual, endpoint.id, {root: 'target', nodes: [
      {id: 'target', parent: actual, context: candidate.context, target: endpoint.id, intermediate: e.id, ancestor: local(id('B')), premises: []},
    ]}); assert.equal(complete.kind, 'checked-candidate', JSON.stringify(complete));
    expect(complete.proof).toHaveLength(1);
    const views = [e.id, u1.id, u2.id, endpoint.id].map(type => {
      const content = deriveRawComplexContent(candidate.context, type); assert.equal(content.kind, 'checked');
      const semantic = prepareSemanticParticleView(candidate.context, content.view, 'restriction'); assert.equal(semantic.kind, 'checked'); return {content: content.view, semantic: semantic.view};
    });
    for (const view of views) {
      expect(view.content.synthetic).toEqual(views[0].content.synthetic);
      expect(view.semantic.root.originalParticle).toBe(d.content.particle);
      expect(particleContentNode(candidate.context, view.content, d.content.particle)?.identity)
        .toEqual(particleContentNode(candidate.context, views[0].content, d.content.particle)?.identity);
    }
    expect(candidate.context.members).toEqual([...actual.members, e.id, u1.id, u2.id]);
  });

  it('rejects forged, cloned, foreign and root-mismatched selectors before issuing a context', async () => {
    const s = await seed(), handle = s.original.content.original; assert.ok(handle);
    const foreign = await seed();
    expect(() => s.actual.originalComplexContentSource.call(foreign.actual, s.d.id)).toThrow(/Foreign original-content/);
    for (const original of [{...handle}, {...handle, owner: s.a.id}, foreign.original.content.original]) {
      assert.ok(original);
      expect(s.makeRoot(false, [], [], {...s.original.content, original})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    }
    expect(s.makeRoot(false, [], [], {...s.original.content, particle: s.a.content!})).toMatchObject({kind: 'candidate-rejected', code: 'reference'});
    expect(s.makeRoot(false, [], [], {kind: 'element-only', particle: s.sourceOuter.id}))
      .toMatchObject({kind: 'candidate-rejected', code: 'missing', component: s.sourceOuter.id});
    expect(deriveOriginalComplexParticle(s.actual, named('A0'))).toMatchObject({kind: 'unresolved'});
    const root = s.makeRoot(); assert.equal(root.kind, 'prepared');
    expect(deriveOriginalComplexParticle(root.context, s.d.id)).toMatchObject({kind: 'unresolved'});
    expect(() => deriveOriginalComplexParticle({...s.actual}, s.d.id)).toThrow(/Unauthenticated/);
    const wrongVariety = s.makeRoot(false, [], [], {...s.original.content, kind: 'mixed'}); assert.equal(wrongVariety.kind, 'prepared');
    expect(checkCandidateCorrespondence(s.actual, s.actual, wrongVariety.context, s.d.id, s.e.id, local(s.a.id)))
      .toMatchObject({kind: 'candidate-rejected', rule: 'endpoint-content-variety'});
  });

  it('resolves original recursive declarations to the rewritten current-H endpoint', async () => {
    const s = await seed(true), root = s.makeRoot(); assert.equal(root.kind, 'prepared');
    const result = s.proof(root.context, s.makeChild(root.context, false)); assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    const selfId = globalId('element', {namespace, local: 'Self'}), self = root.context.lookup(selfId);
    assert.equal(self.kind, 'found'); assert.equal(self.node.kind, 'element');
    const before = immediateTypeBase(s.actual, self.node.type), after = immediateTypeBase(root.context, self.node.type);
    assert.equal(before.kind, 'checked'); assert.equal(after.kind, 'checked');
    expect(after.value).toEqual(local(s.e.id)); expect(before.value).not.toEqual(after.value);
    const step = result.proof.find(item => item.target === s.d.id); assert.ok(step);
    const receipt = step.components.find(item => item.component === selfId); assert.ok(receipt);
    expect(receipt.dependencies).toContain(s.d.id);
    expect(step.components.find(item => item.component === s.d.id)?.obligations).toEqual([]);
  });

  it('rejects private-tag admission and active or inactive aliases of latent original identities', async () => {
    const s = await seed();
    expect(s.makeRoot(false, [s.sourceOuter])).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: s.sourceOuter.id});
    assert.equal(s.sourceOuter.identity.kind, 'scoped');
    const alias = {...s.sourceOuter, id: scopedId(s.sourceOuter.identity.owner, s.sourceOuter.identity.path, s.sourceOuter.identity.role)};
    expect(s.makeRoot(false, [alias])).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: alias.id});
    const sparse = s.request.candidate({key: 'collision-carrier', active: [...s.actual.members, alias.id], additions: [alias]});
    assert.equal(sparse.kind, 'prepared');
    const child = forkSemanticCandidate(sparse.context, {key: 'outside-collision', active: s.actual.members,
      endpoint: {...s.d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(s.a.id), facets: []}},
      rawTypes: [s.row(s.d.id, local(s.a.id), 'restriction', s.original.content)]});
    // The new private ID is disjoint; the complete stored-tuple gate retains the inactive reservation.
    expect(child).toMatchObject({kind: 'candidate-rejected', code: 'identity', component: alias.id});
  });

  it('does not execute row-content or original-selector accessors during the authenticated prescan', async () => {
    const s = await seed(); let calls = 0;
    const selected = Object.defineProperty({...s.original.content}, 'original', {enumerable: true, get() {calls++; return s.original.content.original;}});
    expect(s.makeRoot(false, [], [], selected)).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    const u = s.helper('AccessorU', local(named('A0')));
    const row = Object.defineProperty(s.row(u.id, local(named('A0')), 'extension', {kind: 'empty'}), 'content',
      {enumerable: true, get() {calls++; return {kind: 'empty'};}});
    expect(s.makeRoot(false, [u], [row])).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    expect(calls).toBe(0);
  });

  it('preserves shared nested backing and native ur origin while checking a complete RequiredD assessment', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-construction-inputs-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, actual = request.actual, ns = 'urn:recovery:consumed-wrapper';
    const id = (name: string) => globalId('type', {namespace: ns, local: name});
    assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
    const originals = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType');
    for (const target of actual.members) expect(checkComponentConstruction(actual, target)).toMatchObject({kind: 'checked', obligations: []});
    const x = originals.find(node => node.id === id('X')); assert.ok(x);
    const ur = originals.find(node => node.id === id('Ur')); assert.ok(ur);
    const d = originals.find(node => node.id === id('D')); assert.ok(d);
    const source = deriveOriginalComplexParticle(actual, ur.id); assert.equal(source.kind, 'checked');
    const again = deriveOriginalComplexParticle(actual, ur.id); assert.equal(again.kind, 'checked'); expect(again.content.original).toBe(source.content.original);
    const borrowedName = {namespace: ns, local: 'BorrowedUr'};
    const borrower: ComplexTypeNode = {...ur, id: globalId('type', borrowedName), identity: {kind: 'global', role: 'type', name: borrowedName}};
    const requiredName = {namespace: ns, local: 'RequiredD'};
    const required: ElementNode = {kind: 'element', id: globalId('element', requiredName), identity: {kind: 'global', role: 'element', name: requiredName},
      name: requiredName, type: local(d.id), context: d.context, abstract: false, nillable: false, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
    const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => {
      const attrs = assessSourceAttributeUses(actual, node.id === borrower.id ? ur.id : node.id); assert.equal(attrs.kind, 'checked');
      return {type: node.id, targetNamespace: ns, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? builtin('anyType')},
        abstract: false, final: [], block: [], content, attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard,
        provenance: {kind: 'hypothetical-abstract', originals: node.id === borrower.id ? [] : [node.id]}};
    };
    const rows = originals.filter(node => node.id !== d.id).map(node => raw(node.id === x.id ? endpoint : node,
      node.id === ur.id ? source.content : {kind: 'empty'}));
    const candidate = request.candidate({key: 'raw-native-origin', active: [...actual.members, borrower.id, required.id], additions: [borrower, required],
      endpoint, rawTypes: [...rows, raw(borrower, source.content)], rawElements: [{element: required.id, type: required.type, final: [], block: []}]});
    assert.equal(candidate.kind, 'prepared');
    const result = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [
      {id: 'X', parent: actual, context: candidate.context, target: x.id, intermediate: id('B'), ancestor: local(id('A')), premises: []},
    ]}); assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    expect(result.proof).toHaveLength(1);
    const sourceView = deriveActualComplexContent(actual, ur.id); assert.equal(sourceView.kind, 'checked');
    const sourceSemantic = prepareSemanticParticleView(actual, sourceView.view, 'restriction'); assert.equal(sourceSemantic.kind, 'checked');
    expect(sourceView.view.synthetic.length).toBeGreaterThan(1); expect(sourceView.view.urTypeWildcards).toHaveLength(1);
    const views = [ur.id, borrower.id].map(target => {const view = deriveRawComplexContent(candidate.context, target); assert.equal(view.kind, 'checked'); return view.view;});
    for (const view of views) {
      expect(view.synthetic).toEqual(sourceView.view.synthetic); expect(view.urTypeWildcards).toEqual(sourceView.view.urTypeWildcards);
      for (const synthetic of view.synthetic) {
        expect(candidate.context.lookup(synthetic).kind).toBe('missing');
        expect(particleContentNode(candidate.context, view, synthetic)).toBe(particleContentNode(actual, sourceView.view, synthetic));
        expect(result.proof[0].components.map(receipt => receipt.component)).not.toContain(synthetic);
      }
      const semantic = prepareSemanticParticleView(candidate.context, view, 'restriction'); assert.equal(semantic.kind, 'checked');
      expect(semantic.view.root.urTypeWildcard).toBe(true);
      expect(semantic.view.root.originalParticle).toBe(sourceSemantic.view.root.originalParticle);
    }
    expect(result.proof[0].components.map(receipt => receipt.component)).toEqual(expect.arrayContaining([ur.id, d.id, borrower.id, required.id]));
  });

  it('refuses retained-only/source-absent/simple sources and keeps handle work sticky', async () => {
    const s = await seed(), retained = prepareSemanticRequest(resolveCanonicalGraph(s.request.graph)); assert.equal(retained.kind, 'prepared');
    expect(deriveOriginalComplexParticle(retained.request.actual, s.d.id)).toMatchObject({kind: 'unresolved', rule: 'original-particle-source'});
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-generated-absent-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const actual = prepared.request.actual;
    const absent = prepared.request.graph.nodes.find(node => node.kind === 'complexType' && actual.originalSourceComponentAbsent(node.id)); assert.ok(absent);
    expect(deriveOriginalComplexParticle(actual, absent.id)).toMatchObject({kind: 'unresolved', rule: 'original-particle-source'});
    const simple = prepared.request.graph.nodes.find(node => node.kind === 'complexType' && !actual.originalSourceComponentAbsent(node.id)
      && node.derivation?.contentKind === 'simple'); assert.ok(simple);
    expect(deriveOriginalComplexParticle(actual, simple.id)).toMatchObject({kind: 'unresolved', rule: 'original-particle-source'});
    const before = s.request.budget.usage().work;
    expect(deriveOriginalComplexParticle(s.actual, s.d.id).kind).toBe('checked'); expect(s.request.budget.usage().work).toBeGreaterThan(before);
    const root = s.makeRoot(); assert.equal(root.kind, 'prepared');
    expect(deriveRawComplexContent(root.context, s.d.id).kind).toBe('checked');
    s.request.budget.guard(() => s.request.budget.chargeWork(125_000_000));
    const failure = s.request.budget.failure(); assert.ok(failure);
    expect(deriveOriginalComplexParticle(s.actual, s.d.id)).toBe(failure);
    expect(deriveRawComplexContent(root.context, s.d.id)).toBe(failure);
  });

  it('checks the same original semantic compositor through literal and authenticated selectors', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-particle-suppressed-child-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, actual = request.actual, ns = 'urn:research:handle-suppressed-child';
    const id = (name: string) => globalId('type', {namespace: ns, local: name});
    const complex = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
    const a = complex('A'), d = complex('D'), source = deriveActualComplexContent(actual, d.id), selected = deriveOriginalComplexParticle(actual, d.id);
    assert.equal(source.kind, 'checked'); assert.equal(selected.kind, 'checked'); assert.ok('particle' in source.view.content);
    expect(source.view.synthetic).toEqual([]); expect(selected.content.particle).toBe(source.view.content.particle);
    const e: ComplexTypeNode = {...a, id: id('E'), identity: {kind: 'global', role: 'type', name: {namespace: ns, local: 'E'}},
      derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
    const root = actual.lookup(source.view.content.particle); assert.equal(root.kind, 'found'); assert.equal(root.node.kind, 'particle'); assert.ok('children' in root.node.term);
    const absent = root.node.term.children.find(target => actual.originalSourceComponentAbsent(target)); assert.ok(absent);
    const ghost = request.graph.nodes.find(node => node.kind === 'element' && actual.originalSourceComponentAbsent(node.id)); assert.ok(ghost);
    for (const content of [source.view.content, selected.content]) {
      const row = (type: string, base: Reference, method: 'extension' | 'restriction'): RawComplexTypeProperties => ({type, targetNamespace: ns,
        derivation: {base, method}, abstract: false, final: [], block: [], content, attributeUses: [],
        provenance: {kind: 'hypothetical-abstract', originals: type === d.id ? [d.id] : []}});
      const built = request.candidate({key: 'same-semantic-edges', active: [...actual.members, e.id], additions: [e],
        endpoint: {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}},
        rawTypes: [row(d.id, local(e.id), 'restriction'), row(e.id, local(a.id), 'extension')]}); assert.equal(built.kind, 'prepared');
      const result = verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [
        {id: 'D', parent: actual, context: built.context, target: d.id, intermediate: e.id, ancestor: local(a.id), premises: []},
      ]}); assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
      expect(result.proof).toHaveLength(1); expect(built.context.members).toEqual([...actual.members, e.id]);
      expect(built.context.originalCompositorChildren(root.node.id)).toEqual(root.node.term.children.filter(target => target !== absent));
      expect(result.proof[0].components.map(item => item.component)).not.toContain(absent);
      expect(result.proof[0].components.map(item => item.component)).not.toContain(ghost.id);
      expect(checkComponentConstruction(built.context, absent)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
      expect(checkComponentConstruction(built.context, ghost.id)).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component'});
    }
  });
});
