/** Full component admission is distinct from retained source/property evidence. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {buildCanonicalGraph} from '../../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkDeclaration} from '../../../src/compiler/schemaDeclarationPrimitives.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const load = (file: string) => loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
const namespace = 'urn:recovery:absent-declaration';
const id = (local: string) => globalId('type', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};

async function seed() {
  const input = await load('source-only-component-admission-independent.xsd'), prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const actualChecks = actual.members.map(component => {
    const checked = checkComponentConstruction(actual, component); assert.equal(checked.kind, 'checked'); assert.deepEqual(checked.obligations, []); return checked;
  });
  assert.equal(actual.members.length, 8);
  assert.deepEqual(actualChecks.flatMap(checked => checked.re01 && !checked.re01.primitive ? [checked.component] : []), [id('X')]);
  const complex = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const ghost = request.graph.nodes.find((node): node is ElementNode => node.kind === 'element' && node.name.local === 'ghost'); assert.ok(ghost);
  const zero = request.graph.nodes.find((node): node is ParticleNode => node.kind === 'particle' && node.occurs.max === '0'); assert.ok(zero);
  const endpoint: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const rows: RawComplexTypeProperties[] = ['A', 'B', 'R', 'X'].map(name => {
    const node = name === 'X' ? endpoint : complex(name), attrs = assessSourceAttributeUses(actual, node.id), content = deriveActualComplexContent(actual, node.id);
    assert.equal(attrs.kind, 'checked'); assert.equal(content.kind, 'checked'); assert.equal(content.view.content.kind, 'empty');
    return {type: node.id, targetNamespace: namespace, abstract: node.abstract, final: [], block: [],
      derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType}, content: content.view.content,
      attributeUses: attrs.value.uses.map(use => use.id), wildcard: attrs.value.wildcard, provenance: {kind: 'actual-mapped', original: node.id}};
  });
  const proof = (context: SemanticContext) => verifyFiniteRe01Evidence(actual, id('X'), {root: 'X', nodes: [
    {id: 'X', parent: actual, context, target: id('X'), intermediate: id('B'), ancestor: local(id('A')), premises: []},
  ]});
  const parent = request.candidate({key: 'empty-whole-control', active: actual.members, endpoint, rawTypes: rows}); assert.equal(parent.kind, 'prepared');
  assert.equal(proof(parent.context).kind, 'checked-candidate');
  const particle = (target: string): ParticleNode => ({kind: 'particle', id: scopedId(id('X'), '/fresh-live-use', 'particle'),
    identity: {kind: 'scoped', owner: id('X'), path: '/fresh-live-use', role: 'particle'}, context: complex('X').context,
    occurs: {min: '1', max: '1'}, term: {kind: 'element', declaration: local(target)}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  return {input, request, actual, actualChecks, ghost, zero, endpoint, rows, proof, parent: parent.context, particle};
}

describe('source-only original full-component admission', () => {
  it('rejects the complete ghost-reference candidate in exact H while preserving actual syntax duties', async () => {
    const s = await seed(), p = s.particle(s.ghost.id);
    const prepared = s.request.candidate({key: 'original-diagnostic-use', active: [...s.actual.members, p.id], additions: [p], endpoint: s.endpoint, rawTypes: s.rows}); assert.equal(prepared.kind, 'prepared');
    const context = prepared.context, correspondence = checkCandidateCorrespondence(s.actual, s.actual, context, id('X'), id('B'), local(id('A'))); assert.equal(correspondence.kind, 'checked');
    expect(context.members).toHaveLength(9); expect(correspondence.fresh).toEqual([p.id]);
    expect(checkComponentConstruction(context, p.id, {correspondence})).toMatchObject({kind: 'checked', dependencies: expect.arrayContaining([s.ghost.id])});
    expect(checkComponentConstruction(context, s.ghost.id)).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component', component: s.ghost.id, contextId: context.contextId});
    expect(s.proof(context)).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component', component: s.ghost.id, contextId: context.contextId});
    expect(s.actualChecks.find(item => item.component === s.ghost.id)).toMatchObject({kind: 'checked', scope: 'original-source-syntax-only'});
    // Property evidence/metadata do not independently request full admission.
    expect(context.lookup(s.ghost.id).kind).toBe('found'); expect(context.sourceNode(s.ghost.id)?.id).toBe(s.ghost.id);
    expect(checkDeclaration(context, s.ghost.id)).toMatchObject({kind: 'checked', authority: 'XSD10-declaration-properties-v1', obligations: ['declared-type-component-validity']});
  });

  it('accepts a disjoint fresh declaration and particle with copied source text and complete fresh inventory', async () => {
    const s = await seed(), path = '/fresh-declaration';
    const declaration: ElementNode = {...s.ghost, id: scopedId(id('X'), path, 'element'), identity: {kind: 'scoped', owner: id('X'), path, role: 'element'}};
    const p = s.particle(declaration.id), additions = [declaration, p];
    const prepared = s.request.candidate({key: 'fresh-semantic-declaration', active: [...s.actual.members, ...additions.map(node => node.id)], additions,
      endpoint: s.endpoint, rawTypes: s.rows, rawElements: [{element: declaration.id, type: declaration.type, final: [], block: []}]}); assert.equal(prepared.kind, 'prepared');
    const context = prepared.context; expect(context.members).toHaveLength(10);
    expect(context.originalSourceComponentAbsent(declaration.id)).toBe(false);
    expect(context.sourceNode(declaration.id)).toBeUndefined(); expect(declaration.context.source).toEqual(s.ghost.context.source);
    const result = s.proof(context); assert.equal(result.kind, 'checked-candidate', JSON.stringify(result));
    expect(result.proof).toHaveLength(1);
    expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    expect(new Set(result.proof[0].correspondence.fresh)).toEqual(new Set(additions.map(node => node.id)));
    expect(new Set(result.proof[0].components.map(item => item.component))).toEqual(new Set([id('X'), id('B'), id('A'), declaration.id, p.id]));
    expect(result.proof[0].components.every(item => item.scope === 'local-component-premises' && item.obligations.length === 0)).toBe(true);
    expect(s.request.candidate({key: 'reserved-original-identity', active: s.actual.members, additions: [s.ghost]})).toMatchObject({kind: 'candidate-rejected', code: 'identity'});
  });

  it('keeps source-bound nonabsent local declarations eligible for ordinary full checking', async () => {
    const prepared = prepareSourceSchemaRequest(await load('original-compositor-incidences-independent.xsd')); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, declaration = request.graph.nodes.find(node => node.kind === 'element' && node.name.local === 'first'); assert.ok(declaration);
    const candidate = request.candidate({key: 'genuine-original-declaration', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(candidate.context.originalSourceComponentAbsent(declaration.id)).toBe(false);
    expect(checkComponentConstruction(candidate.context, declaration.id)).toMatchObject({kind: 'checked', scope: 'local-component-premises', obligations: []});
  });

  it.each([
    ['original-compositor-incidences-independent.xsd', 'particle'],
    ['original-generated-absent-independent.xsd', 'complexType'],
    ['original-generated-absent-operand-independent.xsd', 'simpleType'],
    ['au-independent.xsd', 'attributeUse'],
    ['au-independent.xsd', 'attribute'],
  ] as const)('rejects genuine full use of a classified %s/%s without promoting unrelated bad-source claims', async (file, kind) => {
    const prepared = prepareSourceSchemaRequest(await load(file)); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, absent = request.graph.nodes.find(node => node.kind === kind && request.actual.originalSourceComponentAbsent(node.id)
      && (node.kind !== 'particle' || node.occurs.max !== '0')); assert.ok(absent);
    const candidate = request.candidate({key: 'classified-' + kind, active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(checkComponentConstruction(candidate.context, absent.id)).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component', contextId: candidate.context.contextId, component: absent.id});
    // Several reused fixtures deliberately contain unrelated invalid scalars;
    // these assertions qualify only this source classification/admission rule.
  });

  it('keeps retained-only membership uncertainty separate from unconditional max-zero structural failure', async () => {
    const s = await seed(), prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(s.input))); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, candidate = request.candidate({key: 'unqualified-source-carrier', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(candidate.context.notationUniverse).toBe('retained-only'); expect(candidate.context.originalSourceComponentAbsent(s.ghost.id)).toBe(true);
    expect(checkComponentConstruction(candidate.context, s.ghost.id)).toMatchObject({kind: 'unresolved', rule: 'original-source-component-admission', component: s.ghost.id, contextId: candidate.context.contextId});
    for (const context of [s.parent, candidate.context]) expect(checkComponentConstruction(context, s.zero.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
    const fresh = {...s.particle(s.ghost.id), occurs: {min: '0', max: '0'}};
    for (const source of [s.request, request]) {
      const zero = source.candidate({key: 'fresh-zero-priority', active: [...source.actual.members, fresh.id], additions: [fresh]}); assert.equal(zero.kind, 'prepared');
      expect(checkComponentConstruction(zero.context, fresh.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
    }
    expect(() => checkComponentConstruction({...s.parent}, s.ghost.id)).toThrow(/Unauthenticated/);
  });

  it('retains genuine globals and invalid suppressed-source syntax in actual Γ', async () => {
    const prepared = prepareSourceSchemaRequest(await load('au-independent.xsd')); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, number = globalId('attribute', {namespace: 'urn:recovery:attributes', local: 'Number'});
    const candidate = request.candidate({key: 'genuine-referenced-global', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(candidate.context.originalSourceComponentAbsent(number)).toBe(false);
    expect(checkComponentConstruction(candidate.context, number)).toMatchObject({kind: 'checked', obligations: []});
    const invalid = prepareSourceSchemaRequest(await load('original-generated-absent-syntax-independent.xsd')); assert.equal(invalid.kind, 'prepared');
    expect(checkSchemaDocumentSyntax(invalid.request.actual)).toMatchObject({kind: 'invalid-schema'});
  });

  it('charges repeated admission failures at inclusive work limits and preserves sticky exhaustion', async () => {
    const input = await load('source-only-component-admission-independent.xsd');
    const run = (maxWork?: number) => {
      const budget = createSemanticBudget(maxWork === undefined ? {} : {maxWork});
      const prepared = prepareSourceSchemaRequest(input, {budget}); assert.equal(prepared.kind, 'prepared');
      const request = prepared.request, ghost = request.graph.nodes.find(node => node.kind === 'element'); assert.ok(ghost);
      const candidate = request.candidate({key: 'admission-budget', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
      expect(checkComponentConstruction(candidate.context, ghost.id)).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component'});
      const before = budget.usage().work, result = checkComponentConstruction(candidate.context, ghost.id);
      expect(budget.usage().work).toBeGreaterThan(before); return {context: candidate.context, ghost, budget, result};
    };
    const broad = run(), exact = run(broad.budget.usage().work); expect(exact.result).toMatchObject({kind: 'candidate-rejected', rule: 'original-source-only-component'});
    const below = run(broad.budget.usage().work - 1); expect(below.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(checkComponentConstruction(below.context, below.ghost.id)).toBe(below.result);
  });
});
