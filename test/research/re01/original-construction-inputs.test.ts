import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent, deriveRawComplexContent, deriveOriginalComplexPropertyContent, particleContentNode} from '../../../src/compiler/complexTypeContent.js';
import type {ContentViewResult, ParticleContentView} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {declarationMethods} from '../../../src/compiler/schemaTypeRelations.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';

const baseDir=path.resolve('test/conformance/fixtures');
async function seed() {
  const ns = 'urn:recovery:consumed-wrapper';
  const id = (name: string) => globalId('type', {namespace: ns, local: name});
  const local = (target: string): Reference => ({kind: 'local', target});
  const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
  const input = await loadSchemaInput(path.join(baseDir, 'xsd/recovery/original-construction-inputs-independent.xsd'), {policy: {fileRoots: [baseDir]}});
  const prepared = prepareSourceSchemaRequest(input);
  assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  const source = checkSchemaDocumentSyntax(actual); assert.equal(source.kind, 'checked');
  const complex = (name: string): ComplexTypeNode => {
    const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
  };
  const view = (result: ContentViewResult): ParticleContentView => {assert.equal(result.kind, 'checked'); return result.view;};
  const actualChecks = actual.members.map(component => {
    const checked = checkComponentConstruction(actual, component); assert.equal(checked.kind, 'checked', JSON.stringify(checked));
    assert.deepEqual(checked.obligations, []); return checked;
  });
  const actualNP = actualChecks.flatMap(checked => checked.re01 && !checked.re01.primitive ? [checked.component] : []);
  assert.deepEqual(actualNP, [id('X')]);
  const originals = request.graph.nodes.filter((node): node is ComplexTypeNode => node.kind === 'complexType');
  const maps = new Map(originals.map(node => [node.id, view(deriveActualComplexContent(actual, node.id))]));
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => {
    const attrs = assessSourceAttributeUses(actual, node.id); assert.equal(attrs.kind, 'checked');
    return {type: node.id, targetNamespace: node.context.effectiveNamespace, abstract: node.abstract,
      final: declarationMethods(actual, node, 'final') as RawComplexTypeProperties['final'],
      block: declarationMethods(actual, node, 'block') as RawComplexTypeProperties['block'],
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType}, content,
      attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard,
      provenance: {kind: 'actual-mapped', original: node.id}};
  };
  const endpoint: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const rows = originals.map(node => raw(node.id === endpoint.id ? endpoint : node, maps.get(node.id)!.content));
  const coreRows = rows.filter(row => row.type !== id('Ur') && row.type !== id('D'));
  const core = request.candidate({key: 'whole-input-control', active: actual.members, endpoint, rawTypes: coreRows});
  assert.equal(core.kind, 'prepared');
  const proof = (context: SemanticContext) => verifyFiniteRe01Evidence(actual, id('X'), {root: 'X', nodes: [
    {id: 'X', parent: actual, context, target: id('X'), intermediate: id('B'), ancestor: local(id('A')), premises: []},
  ]});
  const complete = proof(core.context); assert.equal(complete.kind, 'checked-candidate', JSON.stringify(complete));
  const requiredName = {namespace: ns, local: 'RequiredD'};
  const required: ElementNode = {kind: 'element', id: globalId('element', requiredName),
    identity: {kind: 'global', role: 'element', name: requiredName}, name: requiredName, context: complex('D').context,
    type: local(id('D')), nillable: false, abstract: false, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const rawElements = [{element: required.id, type: required.type, final: [], block: []}];
  const sparse = request.candidate({key: 'sparse-genuine-D', active: [...actual.members, required.id], additions: [required],
    endpoint, rawTypes: coreRows, rawElements}); assert.equal(sparse.kind, 'prepared');
  const correspondence = (context: SemanticContext) => checkCandidateCorrespondence(actual, actual, context,
    id('X'), id('B'), local(id('A')));
  const sparseCorrespondence = correspondence(sparse.context); assert.equal(sparseCorrespondence.kind, 'checked');
  const relation = (context: SemanticContext, derived: ParticleContentView, base: ParticleContentView) => {
    const r = prepareSemanticParticleView(context, derived, 'restriction'), b = prepareSemanticParticleView(context, base, 'restriction');
    assert.equal(r.kind, 'checked'); assert.equal(b.kind, 'checked');
    const checked = checkParticleRestriction(context, r.view, b.view); assert.equal(checked.kind, 'checked');
    return {value: checked.value, derived: {kind: r.view.root.kind, occurs: r.view.root.occurs,
      process: r.view.root.wildcard?.processContents, ur: r.view.root.urTypeWildcard},
    base: {kind: b.view.root.kind, occurs: b.view.root.occurs,
      process: b.view.root.wildcard?.processContents, ur: b.view.root.urTypeWildcard}};
  };
  const sourceRelation = relation(actual, maps.get(id('D'))!, maps.get(id('Ur'))!); assert.equal(sourceRelation.value, true);
  const projectedD = view(deriveOriginalComplexPropertyContent(sparse.context, id('D')));
  const projectedUr = view(deriveOriginalComplexPropertyContent(sparse.context, id('Ur')));
  const sparseRelation = relation(sparse.context, projectedD, projectedUr); assert.equal(sparseRelation.value, true);
  const sourceUr = maps.get(id('Ur'))!;
  assert.ok(sourceUr.urTypeWildcards.length > 0);
  const origins = sourceUr.synthetic.map(origin => {
    const found = particleContentNode(actual, sourceUr, origin); assert.ok(found); assert.equal(found.kind, 'particle'); return found;
  });
  const renamed = new Map(origins.map((node, index) => {
    assert.equal(node.identity.kind, 'scoped'); return [node.id, scopedId(node.identity.owner, '/consumed-wrapper/' + index, 'particle')];
  }));
  const rewriteId = (old: string) => renamed.get(old) ?? old;
  const additions: ParticleNode[] = origins.map(node => {
    assert.equal(node.identity.kind, 'scoped'); const index = origins.indexOf(node);
    return {...node, id: rewriteId(node.id), identity: {kind: 'scoped', owner: node.identity.owner,
      path: '/consumed-wrapper/' + index, role: 'particle'}, term: 'children' in node.term
      ? {...node.term, children: node.term.children.map(rewriteId)} : node.term};
  });
  const urContent = sourceUr.content; assert.ok('particle' in urContent);
  const reifiedRows = rows.map(row => row.type === id('Ur') ? {...row, content: {...urContent, particle: rewriteId(urContent.particle)}} : row);
  const reified = request.candidate({key: 'reified-genuine-D', active: [...actual.members, required.id, ...additions.map(node => node.id)],
    additions: [required, ...additions], endpoint, rawTypes: reifiedRows, rawElements}); assert.equal(reified.kind, 'prepared');
  const reifiedCorrespondence = correspondence(reified.context); assert.equal(reifiedCorrespondence.kind, 'checked', JSON.stringify(reifiedCorrespondence));
  const reifiedRelation = relation(reified.context, view(deriveRawComplexContent(reified.context, id('D'))),
    view(deriveRawComplexContent(reified.context, id('Ur')))); assert.equal(reifiedRelation.value, false);
  const urChecked = checkComponentConstruction(reified.context, id('Ur'), {correspondence: reifiedCorrespondence});
  assert.equal(urChecked.kind, 'checked', JSON.stringify(urChecked)); assert.deepEqual(urChecked.obligations, []);
  const newRoots = additions.map(node => {
    const checked = checkComponentConstruction(reified.context, node.id, {correspondence: reifiedCorrespondence});
    assert.equal(checked.kind, 'checked', JSON.stringify(checked)); assert.deepEqual(checked.obligations, []); return checked;
  });
  const dChecked = checkComponentConstruction(reified.context, id('D'), {correspondence: reifiedCorrespondence});
  assert.equal(dChecked.kind, 'candidate-rejected'); assert.equal(dChecked.rule, 'derivation-ok-restriction.5.4');
  const aggregate = proof(reified.context);
  assert.equal(aggregate.kind, 'candidate-rejected', JSON.stringify(aggregate)); assert.equal(aggregate.rule, 'derivation-ok-restriction.5.4');

  return {anyType, request, actual, id, local, complex, raw, endpoint, coreRows, required, sparse:sparse.context, sparseCorrespondence, proof, maps, projectedUr, sparseRelation, additions, reified:reified.context, reifiedCorrespondence};
}

describe('guarded original inputs to full construction', () => {
  it('completes RequiredD whole-input evidence without installing the native ur representation', async () => {
    const s = await seed(), result = s.proof(s.sparse); assert.equal(result.kind, 'checked-candidate');
    expect(result.proof).toHaveLength(1); expect(s.actual.members).toHaveLength(8);
    expect(s.sparse.members).toEqual([...s.actual.members, s.required.id]);
    expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    const step = result.proof[0]; expect(step.primitiveNoChange).toEqual(expect.arrayContaining([s.id('Ur'), s.id('B')]));
    expect(step.components.map(item => item.component)).toEqual(expect.arrayContaining([s.required.id, s.id('D'), s.id('Ur')]));
    for (const name of ['D', 'Ur']) {
      expect(s.sparse.rawTypeProperties(s.id(name))).toBeUndefined();
      const receipt = step.components.find(item => item.component === s.id(name)); assert.ok(receipt);
      expect(receipt.obligations).toEqual([]);
      expect(receipt.receipts).toEqual(expect.arrayContaining([expect.objectContaining({kind: 'checked-original-input',
        authority: 'XSD10-original-complex-input-v1', contextId: s.sparse.contextId, originalContextId: s.actual.contextId,
        scope: 'guarded-original-particle-empty-input', remaining: ['actual-source-qualification', 'complete-type-validity']})]));
    }
    const actualD = s.maps.get(s.id('D'))!; assert.ok('particle' in actualD.content);
    expect(step.components.map(item => item.component)).toContain(actualD.content.particle);
    for (const synthetic of s.projectedUr.synthetic) {
      expect(s.sparse.lookup(synthetic).kind).toBe('missing');
      expect(step.components.map(item => item.component)).not.toContain(synthetic);
    }
    expect(s.sparseRelation).toMatchObject({value: true, base: {ur: true}, derived: {process: 'skip'}});
  });

  it('retains raw precedence and the valid-root reification origin failure', async () => {
    const s = await seed();
    expect(s.additions).toHaveLength(4);
    expect(s.proof(s.reified)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.id('D')});
    for (const particle of s.additions) expect(checkComponentConstruction(s.reified, particle.id, {correspondence: s.reifiedCorrespondence}))
      .toMatchObject({kind: 'checked', obligations: []});
    expect(checkComponentConstruction(s.reified, s.id('Ur'), {correspondence: s.reifiedCorrespondence}))
      .toMatchObject({kind: 'checked', obligations: []});
  });

  it('does not grant the native ur exception to an ordinary fresh lax wildcard', async () => {
    const s = await seed(), original = s.additions.find(node => node.term.kind === 'any'); assert.ok(original);
    const name = {namespace: 'urn:recovery:consumed-wrapper', local: 'Ordinary'};
    const base: ComplexTypeNode = {...s.complex('Ur'), id: globalId('type', name), identity: {kind: 'global', role: 'type', name},
      derivation: {kind: 'restriction', contentKind: 'complex', base: s.anyType, facets: []}, content: undefined,
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const particle: ParticleNode = {...original, id: scopedId(base.id, '/ordinary-wildcard', 'particle'),
      identity: {kind: 'scoped', owner: base.id, path: '/ordinary-wildcard', role: 'particle'}};
    const derivedName = {...name, local: 'FreshD'};
    const derived: ComplexTypeNode = {...s.complex('D'), id: globalId('type', derivedName), identity: {kind: 'global', role: 'type', name: derivedName},
      derivation: {kind: 'restriction', contentKind: 'complex', base: s.local(base.id), facets: []},
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const own = s.maps.get(s.id('D'))!.content;
    const candidate = s.request.candidate({key: 'ordinary-wildcard', active: [...s.actual.members, base.id, particle.id, derived.id],
      additions: [base, particle, derived], endpoint: s.endpoint, rawTypes: [...s.coreRows,
        {...s.raw(s.complex('Ur'), {kind: 'mixed', particle: particle.id}), type: base.id, derivation: {method: 'restriction', base: s.anyType}, provenance: {kind: 'hypothetical-abstract', originals: []}},
        {...s.raw(s.complex('D'), own), type: derived.id, derivation: {method: 'restriction', base: s.local(base.id)}, provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    assert.equal(candidate.kind, 'prepared');
    expect(s.proof(candidate.context)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: derived.id});
  });
});
