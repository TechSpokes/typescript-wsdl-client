import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../src/compiler/canonicalGraph.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01Evidence, FiniteRe01EvidenceNode} from '../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import {checkCandidateCorrespondence} from '../../src/compiler/re01CandidateCorrespondence.js';
import {assertComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';

// Expected concrete construction and rejection controls published before driver:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6112039450
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:finite-proof';
const named = (local: string) => globalId('type', {namespace, local});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const local = (target: string): Reference => ({kind: 'local', target});
type Variation = 'valid' | 'wrong-scalar' | 'lost-attribute' | 'unproved-helper' | 'invalid-original';
async function defaultFixtureInput(file: string) {
  // Identical fixture bytes and a platform-independent source URI: URI length
  // is legitimately charged, but a CI checkout path is not this test's input.
  const origin = 'https://capacity.example';
  const uri = origin + '/' + path.basename(file), bytes = readFileSync(file);
  return loadSchemaInput(uri, {policy: {allowedOrigins: [origin]}, offlineResources: new Map([[uri,
    {bytes, digest: createHash('sha256').update(bytes).digest('hex')} ]])});
}
async function setup(variation: Variation = 'valid', budgetMode: 'diagnostic' | 'default' = 'diagnostic') {
  const file = path.join(fixtures, 'xsd/recovery', variation === 'invalid-original'
    ? 'finite-proof-invalid-original.xsd' : 'finite-proof-independent.xsd');
  const input = budgetMode === 'default' ? await defaultFixtureInput(file)
    : await loadSchemaInput(file, {policy: {fileRoots: [fixtures]}});
  const prepared = budgetMode === 'default' ? prepareSourceSchemaRequest(input)
    : prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected source structural request: ${prepared.kind}`);
  const request = prepared.request;
  const node = (name: string): ComplexTypeNode => {
    const result = request.actual.lookup(named(name));
    if (result.kind !== 'found' || result.node.kind !== 'complexType') throw new Error(`Expected ${name}`);
    return result.node;
  };
  const b = node('B'), d = node('D'), eId = named('E'), fId = named('F');
  const helper = (name: 'E' | 'F', base: Reference): ComplexTypeNode => ({...b, id: named(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, attributes: [],
    derivation: {kind: 'extension', contentKind: 'simple', base, facets: []}});
  const e = helper('E', builtin('anySimpleType'));
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'simple', base: local(eId), facets: []}};
  const properties = (type: string, base: Reference, method: 'extension' | 'restriction', scalar: Reference,
    uses: readonly string[] = b.attributes): RawComplexTypeProperties => ({type, derivation: {base, method},
    abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar}, attributeUses: uses,
    provenance: {kind: 'hypothetical-abstract', originals: type === b.id || type === d.id ? [type] : []}});
  const additions = variation === 'unproved-helper' ? [e, helper('F', local(b.id))] : [e];
  const rawTypes = [properties(b.id, builtin('string'), 'extension', builtin('string')),
    properties(eId, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
    properties(d.id, local(eId), 'restriction', builtin(variation === 'wrong-scalar' ? 'token' : 'string'), variation === 'lost-attribute' ? [] : b.attributes),
    ...(variation === 'unproved-helper' ? [properties(fId, local(b.id), 'extension', builtin('string'))] : [])];
  const candidate = request.candidate({key: variation, active: [...request.actual.members, ...additions.map(item => item.id)], additions, endpoint, rawTypes});
  if (candidate.kind !== 'prepared') throw new Error(`Expected literal finite candidate: ${JSON.stringify(candidate)}`);
  const root: FiniteRe01EvidenceNode = {id: 'root', parent: request.actual, context: candidate.context,
    target: d.id, intermediate: eId, ancestor: builtin('anySimpleType'), premises: []};
  const evidence: FiniteRe01Evidence = {root: 'root', nodes: [root]};
  return {request, candidate: candidate.context, root, evidence, target: d.id};
}

describe('independent concrete finite RE01 proof checkpoint', () => {
  it('fully checks the unchanged typed-attribute scalar witness cold under the ordinary default request budget', async () => {
    // Observable pre-edit oracle: #271 comment 6113993503. Setup performs only
    // source preparation, necessary component lookups and candidate construction;
    // there is no semantic warm-up, prior verification or raised limit.
    const {request, evidence, target, candidate} = await setup('valid', 'default');
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'checked-candidate', authority: 'RE01-finite-evidence-v1',
      domain: 'RE01-derivation-B-v1', scope: 'supplied-construction-and-finite-evidence',
      actualContextId: request.actual.contextId, target, root: 'root', actualNotations: [],
      claims: {actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false,
        completeNegativeAnswer: false, searchTermination: false}});
    if (result.kind !== 'checked-candidate') throw new Error('Expected complete cold default-budget evidence');
    expect(new Set(result.actualComponents.map(component => component.component))).toEqual(new Set(request.actual.members));
    expect(result.proof).toHaveLength(1);
    const step = result.proof[0];
    expect(step).toMatchObject({evidence: 'root', parentContext: request.actual.contextId, contextId: candidate.contextId,
      target, premises: [], notations: [], correspondence: {kind: 'checked', target, intermediate: named('E'), scalarObligations: []}});
    // D/E and their original typed attribute declaration/use are the exact
    // candidate closure; B remains checked in the immutable actual environment.
    expect(new Set(step.components.map(component => component.component))).toEqual(
      new Set([...request.actual.members.filter(id => id !== named('B')), named('E')]));
    for (const [context, components] of [[request.actual, result.actualComponents], [candidate, step.components]] as const) {
      for (const component of components) {
        expect(component).toMatchObject({kind: 'checked', authority: 'XSD10-component-construction-v1',
          contextId: context.contextId, obligations: []});
        expect(component.receipts.length).toBeGreaterThan(0);
        expect(() => assertComponentConstruction(context, component)).not.toThrow();
      }
    }
    expect(() => assertFiniteCandidateReceipt(request.actual, result)).not.toThrow();
    expect(request.budget.exhausted()).toBe(false);
  });

  it.each(['valid', 'reversed-content', 'lost-wildcard'] as const)
    ('checks integrated particle, typed attribute and wildcard evidence: %s', async variation => {
      const file = path.join(fixtures, 'xsd/recovery/finite-particle-independent.xsd');
      const input = variation === 'valid' ? await defaultFixtureInput(file)
        : await loadSchemaInput(file, {policy: {fileRoots: [fixtures]}});
      const prepared = variation === 'valid' ? prepareSourceSchemaRequest(input)
        : prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
      if (prepared.kind !== 'prepared') throw new Error('Expected source request');
      const request = prepared.request, ns = 'urn:recovery:finite-particle';
      const id = (name: string) => globalId('type', {namespace: ns, local: name});
      const get = (name: string): ComplexTypeNode => {
        const result = request.actual.lookup(id(name));
        if (result.kind !== 'found' || result.node.kind !== 'complexType') throw new Error('Expected named source type');
        return result.node;
      };
      const a = get('A'), b = get('B'), d = get('D'), eId = id('E'), rootId = scopedId(eId, '/effective-sequence', 'particle');
      if (!b.content || !d.content) throw new Error('Expected original local sequence roots');
      const template = request.actual.lookup(b.content);
      if (template.kind !== 'found' || template.node.kind !== 'particle') throw new Error('Expected sequence template');
      const uses = b.attributes.filter(attribute => {
        const found = request.actual.lookup(attribute);
        return found.kind === 'found' && found.node.kind === 'attributeUse';
      });
      const wildcardSources = b.attributes.filter(attribute => !uses.includes(attribute));
      expect(uses).toHaveLength(1); expect(wildcardSources).toHaveLength(1);
      const wildcard = {namespace: {kind: 'set' as const, namespaces: ['urn:extras']}, processContents: 'lax' as const, sources: wildcardSources};
      const wrapper: ParticleNode = {...template.node, id: rootId,
        identity: {kind: 'scoped', owner: eId, path: '/effective-sequence', role: 'particle'}, occurs: {min: '1', max: '1'},
        term: {kind: 'sequence', children: variation === 'reversed-content' ? [d.content, b.content] : [b.content, d.content]}};
      const e: ComplexTypeNode = {...b, id: eId, identity: {kind: 'global', role: 'type', name: {namespace: ns, local: 'E'}},
        content: rootId, attributes: [], derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
      const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(eId), facets: []}};
      const properties = (type: string, base: Reference, method: 'extension' | 'restriction', particle?: string): RawComplexTypeProperties => ({
        type, derivation: {base, method}, abstract: false, final: [], block: [],
        content: particle ? {kind: 'element-only', particle} : {kind: 'empty'}, attributeUses: particle ? uses : [],
        ...(particle && !(type === d.id && variation === 'lost-wildcard') ? {wildcard} : {}),
        provenance: {kind: 'hypothetical-abstract', originals: type === eId ? [] : [type]},
      });
      const candidate = request.candidate({key: variation, active: [...request.actual.members, eId, rootId], additions: [e, wrapper], endpoint,
        rawTypes: [properties(a.id, builtin('anyType'), 'restriction'), properties(b.id, local(a.id), 'extension', b.content),
          properties(eId, local(a.id), 'extension', rootId), properties(d.id, local(eId), 'restriction', rootId)]});
      if (candidate.kind !== 'prepared') throw new Error(`Expected literal supplied construction: ${JSON.stringify(candidate)}`);
      const result = verifyFiniteRe01Evidence(request.actual, d.id, {root: 'particle', nodes: [{id: 'particle', parent: request.actual,
        context: candidate.context, target: d.id, intermediate: eId, ancestor: local(a.id), premises: []}]});
      if (variation !== 'valid') {
        expect(result).toMatchObject({kind: 'candidate-rejected'});
        return;
      }
      expect(result).toMatchObject({kind: 'checked-candidate'});
      if (result.kind !== 'checked-candidate') throw new Error(`Expected complete integrated evidence: ${JSON.stringify(result)}`);
      expect(result.actualComponents.map(component => component.component)).toEqual(expect.arrayContaining([a.id, b.id, d.id, b.content, d.content, uses[0], wildcardSources[0]]));
      expect(result.actualPrimitiveNoChange).toContain(b.id);
      expect(result.proof[0].primitiveNoChange).toContain(eId);
      expect(result.proof[0].components.map(component => component.component)).toEqual(expect.arrayContaining([d.id, eId, rootId]));
      expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
      expect(request.budget.usage().work).toBeLessThanOrEqual(950_000);
    });

  it('checks a genuine nested helper proof in its exact parent context and records dependency order', async () => {
    const {request, candidate, target, root} = await setup('unproved-helper', 'default');
    const f = candidate.lookup(named('F')), e = candidate.lookup(named('E'));
    if (f.kind !== 'found' || f.node.kind !== 'complexType' || e.kind !== 'found' || e.node.kind !== 'complexType') throw new Error('Expected parent helpers');
    const fRaw = candidate.rawTypeProperties(f.node.id), eRaw = candidate.rawTypeProperties(e.node.id);
    if (!fRaw || !eRaw) throw new Error('Expected parent raw properties');
    const e2Id = named('E2');
    const e2: ComplexTypeNode = {...e.node, id: e2Id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'E2'}}};
    const child = forkSemanticCandidate(candidate, {key: 'nested-helper-proof', active: [...candidate.members, e2Id], additions: [e2],
      endpoint: {...f.node, derivation: {kind: 'restriction', contentKind: 'simple', base: local(e2Id), facets: []}},
      rawTypes: [{...fRaw, derivation: {method: 'restriction', base: local(e2Id)}},
        {...eRaw, type: e2Id, provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (child.kind !== 'prepared') throw new Error(`Expected child candidate fork: ${JSON.stringify(child)}`);
    const evidence: FiniteRe01Evidence = {root: 'root', nodes: [{...root, premises: ['child']},
      {id: 'child', parent: candidate, context: child.context, target: f.node.id, intermediate: e2Id,
        ancestor: builtin('anySimpleType'), premises: []}]};
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'checked-candidate'});
    if (result.kind !== 'checked-candidate') throw new Error('Expected complete nested finite evidence');
    expect(result.proof.map(step => step.evidence)).toEqual(['child', 'root']);
    expect(result.proof[0]).toMatchObject({parentContext: candidate.contextId, contextId: child.context.contextId, target: f.node.id, premises: []});
    expect(result.proof[1]).toMatchObject({parentContext: request.actual.contextId, premises: ['child']});
    expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
    expect(candidate.rawTypeProperties(f.node.id)?.derivation.method).toBe('extension');
    expect(child.context.rawTypeProperties(f.node.id)?.derivation.method).toBe('restriction');
    expect(request.budget.usage().work).toBeLessThanOrEqual(990_000);
  });

  it('checks one typed-attribute scalar construction while keeping all universal claims false', async () => {
    const {request, evidence, target, candidate, root} = await setup();
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'checked-candidate', authority: 'RE01-finite-evidence-v1',
      domain: 'RE01-derivation-B-v1', target, actualContextId: request.actual.contextId,
      claims: {actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (result.kind !== 'checked-candidate') throw new Error('Expected independently specified finite witness');
    expect(result.actualComponents.map(component => component.component)).toEqual(expect.arrayContaining([...request.actual.members]));
    expect(result.proof).toHaveLength(1);
    expect(result.proof[0]).toMatchObject({evidence: 'root', parentContext: request.actual.contextId, contextId: candidate.contextId, premises: [], primitiveNoChange: []});
    expect(result.proof[0].components.map(component => component.component)).toEqual(expect.arrayContaining([named('D'), named('E')]));
    expect(() => assertFiniteCandidateReceipt(request.actual, result)).not.toThrow();
    expect(() => assertFiniteCandidateReceipt(request.actual, {...result})).toThrow(/Unauthenticated/);
    expect(checkCandidateCorrespondence(request.actual, request.actual, candidate, target, root.intermediate, root.ancestor)).toMatchObject({kind: 'checked'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkCandidateCorrespondence(request.actual, request.actual, candidate, target, root.intermediate, root.ancestor)).toBe(request.budget.failure());
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toBe(request.budget.failure());
  });

  it('checks unrelated original scalar obligations before certifying the supplied target', async () => {
    const {request, target, evidence} = await setup('invalid-original');
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toMatchObject({kind: 'invalid-schema',
      component: globalId('attribute', {namespace, local: 'Unused'})});
  });

  it.each(['wrong-scalar', 'lost-attribute'] as const)('rejects %s endpoint data despite an otherwise legal-looking two-step chain', async variation => {
    const {request, target, evidence} = await setup(variation);
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toMatchObject({kind: 'candidate-rejected'});
  });

  it('requires concrete proof of a generated fresh-helper obligation', async () => {
    const {request, target, evidence} = await setup('unproved-helper');
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
  });

  it('rejects a cycle, missing proof reference and wrong root parent without accepting their labels', async () => {
    const {request, target, root} = await setup();
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: [{...root, premises: ['root']}]}))
      .toMatchObject({kind: 'unresolved', rule: 'proof-cycle'});
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: [{...root, premises: ['missing']}]}))
      .toMatchObject({kind: 'invalid-evidence', rule: 'missing-proof-reference'});
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: [{...root, parent: root.context}]}))
      .toMatchObject({kind: 'invalid-evidence', rule: 'evidence-root'});
  });

  it('rejects foreign or copied context handles and getter-backed evidence without invoking getters', async () => {
    const {request, target, root} = await setup(), other = await setup();
    for (const context of [{...root.context}, other.candidate]) {
      expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: [{...root, context}]}))
        .toMatchObject({kind: 'invalid-evidence', rule: 'evidence-context'});
    }
    let invoked = false;
    const counterfeit = {...root, get premises(): readonly string[] {invoked = true; return [];}};
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: [counterfeit]}))
      .toMatchObject({kind: 'invalid-evidence', rule: 'evidence-syntax'});
    expect(invoked).toBe(false);
  });

  it('uses dense own-data evidence positions without invoking accessors or custom iterators', async () => {
    const {request, target, root} = await setup();
    let invoked = false;
    const getterNodes: FiniteRe01EvidenceNode[] = [];
    Object.defineProperty(getterNodes, '0', {enumerable: true, get() {invoked = true; return root;}});
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: getterNodes})).toMatchObject({kind: 'invalid-evidence'});
    expect(invoked).toBe(false);
    const hole: FiniteRe01EvidenceNode[] = [];
    hole.length = 1;
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: hole})).toMatchObject({kind: 'invalid-evidence'});
    const iteratorNodes = [root];
    Object.defineProperty(iteratorNodes, Symbol.iterator, {get() {invoked = true; throw new Error('must not invoke caller iterator');}});
    expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: iteratorNodes})).toMatchObject({kind: 'checked-candidate'});
    expect(invoked).toBe(false);
  });

  it('rejects malformed, cyclic and nested-accessor ancestor data as evidence rather than throwing', async () => {
    const {request, target, root} = await setup();
    let invoked = false;
    const cyclic: Record<string, unknown> = {kind: 'builtin'};
    cyclic.name = cyclic;
    const accessor = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema',
      get local() {invoked = true; return 'anySimpleType';}}};
    for (const ancestor of [{kind: 'unsupported'}, cyclic, accessor]) {
      expect(verifyFiniteRe01Evidence(request.actual, target, {root: 'root', nodes: [{...root, ancestor: ancestor as unknown as Reference}]}))
        .toMatchObject({kind: 'invalid-evidence', rule: 'evidence-syntax'});
    }
    expect(invoked).toBe(false);
  });
});
