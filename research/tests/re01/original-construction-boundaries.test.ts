/** Full current-H formation remains distinct from original property qualification. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {AttributeNode, AttributeUseNode, ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {assessCandidateAttributeUses, readOriginalAttributeProperties} from '../../../src/compiler/schemaAttributeUses.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {deriveOriginalComplexPropertyContent, deriveOriginalContentSubtree} from '../../../src/compiler/complexTypeContent.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:property-only-projection';
const id = (local: string) => globalId('type', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
async function setup() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-property-projection-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  const complex = (target: string): ComplexTypeNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const left = actual.lookup(globalId('element', {namespace, local: 'Left'})); assert.equal(left.kind, 'found'); assert.equal(left.node.kind, 'element'); assert.equal(left.node.type.kind, 'local');
  const scope = complex(left.node.type.target), endpoint = {...complex(id('X')), derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(id('B')), facets: []}};
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace, abstract: false, final: [], block: [],
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType}, content: {kind: 'empty'}, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.sourceNode(node.id) ? [node.id] : []}});
  const rows = ['A', 'B', 'R'].map(name => raw(complex(id(name)))); rows.push(raw(endpoint));
  const requiredName = {namespace, local: 'RequiredC'}, required: ElementNode = {...left.node, id: globalId('element', requiredName),
    identity: {kind: 'global', role: 'element', name: requiredName}, name: requiredName,
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const candidate = request.candidate({key: 'nonempty-original-AUs', active: [...actual.members, required.id], additions: [required], endpoint, rawTypes: rows,
    rawElements: [{element: required.id, type: required.type, final: [], block: []}]}); assert.equal(candidate.kind, 'prepared');
  return {request, actual, complex, scope, endpoint, rows, raw, context: candidate.context, required};
}

describe('full original-input construction boundaries', () => {
  it('checks a complete nonempty-AU original scope and a full containing-derivation authority', async () => {
    const s = await setup(), full = assessCandidateAttributeUses(s.context, s.scope.id); assert.equal(full.kind, 'checked');
    expect(full.authority).toBe('AU01-C1-original-construction-v1'); expect(full.value.uses).toHaveLength(1);
    expect(readOriginalAttributeProperties(s.context, s.scope.id)).toMatchObject({kind: 'checked', authority: 'AU01-C1-original-properties-v1'});
    const result = verifyFiniteRe01Evidence(s.actual, id('X'), {root: 'X', nodes: [
      {id: 'X', parent: s.actual, context: s.context, target: id('X'), intermediate: id('B'), ancestor: local(id('A')), premises: []},
    ]}); assert.equal(result.kind, 'checked-candidate'); expect(result.proof).toHaveLength(1);
    const receipt = result.proof[0].components.find(item => item.component === s.scope.id); assert.ok(receipt);
    expect(receipt.dependencies).toContain(full.value.uses[0].id);
    expect(receipt.receipts).toEqual(expect.arrayContaining([expect.objectContaining({authority: 'AU01-C1-original-construction-v1'})]));
    expect(result.proof[0].primitiveNoChange).toContain(s.scope.id);
  });

  it.each(['final', 'attribute', 'wildcard'] as const)('observes current-H base %s rather than borrowing Γ derivation success', async variant => {
    const s = await setup(), base = s.complex(id('A2'));
    const useId = scopedId(base.id, '/required-extra', 'attributeUse'), declarationId = scopedId(base.id, '/extra', 'attribute');
    const declaration: AttributeNode = {kind: 'attribute', id: declarationId, identity: {kind: 'scoped', owner: base.id, path: '/extra', role: 'attribute'},
      name: {namespace: '', local: 'extra'}, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}, context: base.context,
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const use: AttributeUseNode = {kind: 'attributeUse', id: useId, identity: {kind: 'scoped', owner: base.id, path: '/required-extra', role: 'attributeUse'},
      declaration: local(declarationId), use: 'required', context: base.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const additions = variant === 'attribute' ? [declaration, use] : [];
    const mapped = deriveOriginalComplexPropertyContent(s.context, base.id); assert.equal(mapped.kind, 'checked');
    const row: RawComplexTypeProperties = {...s.raw(base), content: mapped.view.content,
      final: variant === 'final' ? ['extension'] : [], attributeUses: variant === 'attribute' ? [useId] : [],
      wildcard: variant === 'wildcard' ? {namespace: {kind: 'set', namespaces: ['urn:extra']}, processContents: 'strict', sources: []} : undefined};
    const candidate = s.request.candidate({key: 'bad-current-base-' + variant, active: [...s.actual.members, ...additions.map(node => node.id)],
      additions, endpoint: s.endpoint, rawTypes: [...s.rows, row]}); assert.equal(candidate.kind, 'prepared');
    expect(readOriginalAttributeProperties(candidate.context, s.scope.id).kind).toBe('checked');
    expect(assessCandidateAttributeUses(candidate.context, s.scope.id)).toMatchObject({kind: 'candidate-rejected',
      rule: variant === 'final' ? 'cos-ct-extends/derivation-ok-restriction' : variant === 'attribute' ? 'cos-ct-extends.1.2' : 'cos-ct-extends.1.3'});
    // Deliberately bad base rows are structural-only controls; no authentic
    // whole-input correspondence/validity is claimed for them.
  });

  it('uses original semantic incidences without admitting source-only diagnostic children', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-generated-absent-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, owner = globalId('type', {namespace: 'urn:recovery:original-generated-binding', local: 'Host'});
    const candidate = request.candidate({key: 'diagnostic-lookahead', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    const checked = checkComponentConstruction(candidate.context, owner); assert.equal(checked.kind, 'checked');
    const zero = request.graph.nodes.find(node => node.kind === 'particle' && node.occurs.max === '0'); assert.ok(zero);
    expect(checkComponentConstruction(candidate.context, zero.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
    expect(checked.dependencies).not.toContain(zero.id);
    // Live scalar failures elsewhere in this existing fixture are unrelated;
    // this test makes only the structural diagnostic/noncomponent distinction.
  });

  it('authenticates private subtree input and keeps repeated full-check exhaustion sticky', async () => {
    const s = await setup(), view = deriveOriginalComplexPropertyContent(s.context, s.scope.id); assert.equal(view.kind, 'checked');
    const root = view.view.synthetic[0]; assert.ok(root);
    expect(deriveOriginalContentSubtree(s.context, view.view, root)).toMatchObject({kind: 'checked'});
    expect(() => deriveOriginalContentSubtree(s.context, {...view.view}, root)).toThrow(/Unauthenticated or foreign/);
    expect(deriveOriginalContentSubtree(s.context, view.view, s.scope.content!)).toMatchObject({kind: 'unresolved', rule: 'original-content-subtree'});
    const before = s.request.budget.usage().work;
    expect(checkComponentConstruction(s.context, s.scope.id).kind).toBe('checked');
    expect(s.request.budget.usage().work).toBeGreaterThan(before);
    s.request.budget.guard(() => s.request.budget.chargeWork(125_000_000));
    expect(checkComponentConstruction(s.context, s.scope.id)).toBe(s.request.budget.failure());
    expect(assessCandidateAttributeUses(s.context, s.scope.id)).toBe(s.request.budget.failure());
  });
});

describe('full original-input inclusive request limit', () => {
  it('checks exact work and one-below without returning an earlier cached partial receipt', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/original-construction-inputs-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const run = (maxWork?: number) => {
      const budget = createSemanticBudget(maxWork === undefined ? {} : {maxWork});
      const prepared = prepareSourceSchemaRequest(input, {budget}); assert.equal(prepared.kind, 'prepared');
      const request = prepared.request, candidate = request.candidate({key: 'full-budget', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
      const owner = globalId('type', {namespace: 'urn:recovery:consumed-wrapper', local: 'Ur'});
      expect(checkComponentConstruction(candidate.context, owner).kind).toBe('checked');
      const result = checkComponentConstruction(candidate.context, owner);
      return {budget, context: candidate.context, owner, result};
    };
    const broad = run(), exact = run(broad.budget.usage().work); expect(exact.result.kind).toBe('checked');
    const below = run(broad.budget.usage().work - 1); expect(below.result.kind).toBe('resource-limit');
    expect(checkComponentConstruction(below.context, below.owner)).toBe(below.result);
    expect(assessCandidateAttributeUses(below.context, below.owner)).toBe(below.result);
  });
});
