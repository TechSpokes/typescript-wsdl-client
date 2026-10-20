/** Compatibility/authority controls for the reviewed optional fresh-only scoped spelling. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it, vi} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate, prepareSemanticRequest, storedIdentityOccupant} from '../../src/compiler/semanticContext.js';
import type {CandidatePreparation, SemanticCandidateDelta, SemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget, DEFAULT_MAX_WORK} from '../../src/compiler/semanticBudget.js';
import {deriveActualComplexContent, deriveBuiltinAnyTypeContent, deriveOriginalComplexParticle,
  deriveOriginalComplexPropertyContent, particleContentNode} from '../../src/compiler/complexTypeContent.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import {allocateHypotheticalScopedIdentity, hypotheticalScopedId, privateParticleId,
  semanticIdentityTuple} from '../../src/compiler/hypotheticalScopedIdentity.js';

// Expected admission/private-origin boundaries: reviewed proposal 7d062032/review 9c9c75cd.
// Structural preparation below does not assert full source or candidate validity.
const fixtures = path.resolve('test/conformance/fixtures');
const lateNamespace = 'urn:recovery:late-original-properties';
const encodings = [scopedId, hypotheticalScopedId] as const;
async function source(file = 'late-original-complex-properties.xsd') {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  return {loaded, request: prepared.request};
}
function complex(request: SemanticRequest, name: string): ComplexTypeNode {
  const found = request.actual.lookup(globalId('type', {namespace: lateNamespace, local: name}));
  assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;
}
function fresh(template: ComplexTypeNode, encode: typeof scopedId, pathValue = '/fresh/T'): ComplexTypeNode {
  const identity = {kind: 'scoped', owner: template.id, path: pathValue, role: 'type'} as const;
  return {...template, identity, id: encode(identity.owner, identity.path, identity.role)};
}
function delta(request: SemanticRequest, ...additions: GraphNode[]): SemanticCandidateDelta {
  return {key: 'identity-control', active: [...request.actual.members, ...additions.map(node => node.id)], additions};
}
function rejection(result: CandidatePreparation, code: 'identity' | 'endpoint' | 'representation' | 'outside-context'): void {
  expect(result).toMatchObject({kind: 'candidate-rejected', code});
}

describe('fresh-only scoped identity compatibility', () => {
  it('keeps every actual/source spelling legacy while accepting both exact fresh spellings', async () => {
    const {request} = await source(), before = JSON.stringify(request.graph), a = complex(request, 'A');
    for (const node of request.graph.nodes) if (node.identity.kind === 'scoped')
      expect(node.id).toBe(scopedId(node.identity.owner, node.identity.path, node.identity.role));
    for (const encode of encodings) {
      const helper = fresh(a, encode), parent = request.candidate(delta(request, helper));
      assert.equal(parent.kind, 'prepared');
      expect(parent.context.owner(helper.id)).toBe(a.id); expect(parent.context.sourceNode(helper.id)).toBeUndefined();
      for (const node of request.graph.nodes) expect(parent.context.lookup(node.id)).toEqual(request.actual.lookup(node.id));
    }
    expect(JSON.stringify(request.graph)).toBe(before);
  });

  it('keeps private families disjoint while preserving shared source roots and native wildcard origin', async () => {
    const {request} = await source('content-independent.xsd'), before = JSON.stringify(request.graph);
    const named = (name: string) => globalId('type', {namespace: 'urn:recovery:content', local: name});
    const d = deriveActualComplexContent(request.actual, named('D'));
    const inherited = deriveActualComplexContent(request.actual, named('EmptyExtension'));
    const ur = deriveActualComplexContent(request.actual, named('UrExtension'));
    const builtin = deriveBuiltinAnyTypeContent(request.actual, named('D'));
    for (const result of [d, inherited, ur, builtin]) assert.equal(result.kind, 'checked');
    assert.equal(d.kind, 'checked'); assert.equal(inherited.kind, 'checked');
    assert.equal(ur.kind, 'checked'); assert.equal(builtin.kind, 'checked');
    assert.ok('particle' in d.view.content && 'particle' in inherited.view.content);
    expect(d.view.content.particle).toBe(inherited.view.content.particle);
    // Separate actual mappings may allocate separate objects for the exact same component ID/tuple.
    expect(particleContentNode(request.actual, d.view, d.view.content.particle))
      .toEqual(particleContentNode(request.actual, inherited.view, inherited.view.content.particle));
    for (const [result, family] of [[d, 'effective'], [ur, 'effective'], [builtin, 'builtin-anyType']] as const)
      for (const id of result.view.synthetic) {
        const node = particleContentNode(request.actual, result.view, id); assert.ok(node); assert.equal(node.identity.kind, 'scoped');
        expect(JSON.parse(id)).toEqual(['semantic-private-particle-v1', family,
          node.identity.owner, node.identity.path, node.identity.role]);
        expect(request.actual.lookup(id).kind).toBe('missing');
        rejection(request.candidate(delta(request, node)), 'identity');
        // The full diagnostic projection includes private children, but is not an admissible source graph.
        expect(prepareSemanticRequest(resolveCanonicalGraph(result.view.graph)))
          .toMatchObject({kind: 'input-error', code: 'identity'});
      }
    for (const result of [ur, builtin]) {
      expect(result.view.urTypeWildcards).toHaveLength(1);
      expect(particleContentNode(request.actual, result.view, result.view.urTypeWildcards[0]))
        .toMatchObject({kind: 'particle', term: {kind: 'any', wildcard: {namespace: {value: '##any'}, processContents: 'lax'}}});
    }
    expect(JSON.stringify(request.graph)).toBe(before);
  });

  it('retains actual issuance tuple rejection even for a legacy-only structural input', async () => {
    const {request} = await source(), original = complex(request, 'B2');
    const requestNumber = Number(request.actual.contextId.split(':')[1]) + 1;
    const pathValue = `$semantic-content/semantic-request:${requestNumber}:actual:1/0`;
    const identity = {kind: 'scoped', owner: original.id, path: pathValue, role: 'particle'} as const;
    const alias: ParticleNode = {id: scopedId(identity.owner, identity.path, identity.role), identity,
      context: original.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      kind: 'particle', occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: []}};
    // This intentionally invented source path tests structural tuple reservation, not source qualification.
    const manual = prepareSemanticRequest(resolveCanonicalGraph({...request.graph, nodes: [...request.graph.nodes, alias]}));
    assert.equal(manual.kind, 'prepared');
    expect(deriveActualComplexContent(manual.request.actual, original.id)).toMatchObject({kind: 'unresolved', rule: 'effective-complex-content'});
  });

  it('retires an inherited fresh endpoint under its exact stored ID and tuple, never an alternate spelling', async () => {
    const {request} = await source(), a = complex(request, 'A'), d = complex(request, 'X');
    for (const encode of encodings) {
      const helper = fresh(a, encode), parent = request.candidate(delta(request, helper)); assert.equal(parent.kind, 'prepared');
      const child = forkSemanticCandidate(parent.context, {key: 'same-tuple', active: parent.context.members,
        endpoint: {...helper, abstract: true}}); assert.equal(child.kind, 'prepared');
      expect(child.context.lookup(helper.id)).toMatchObject({kind: 'found', node: {id: helper.id, identity: helper.identity}});
      expect(child.context.budget).toBe(parent.context.budget);
      assert.equal(helper.identity.kind, 'scoped');
      for (const identity of [{...helper.identity, path: '/changed'}, {...helper.identity, owner: d.id}, {...helper.identity, role: 'particle'}])
        rejection(forkSemanticCandidate(parent.context, {key: 'changed-tuple', active: parent.context.members,
          endpoint: {...helper, identity}}), 'endpoint');
      const other = encode === scopedId ? hypotheticalScopedId : scopedId;
      rejection(forkSemanticCandidate(parent.context, {key: 'rename-inherited', active: parent.context.members,
        endpoint: {...helper, id: other(helper.identity.owner, helper.identity.path, helper.identity.role)}}), 'endpoint');
    }
  });

  it('rejects forged IDs, mismatched tuples and simultaneous semantic aliases', async () => {
    const {request} = await source(), a = complex(request, 'A'), modern = fresh(a, hypotheticalScopedId), legacy = fresh(a, scopedId);
    assert.equal(modern.identity.kind, 'scoped');
    rejection(request.candidate(delta(request, {...modern, id: 'forged-id'})), 'identity');
    rejection(request.candidate(delta(request, {...modern, id: modern.id + ' '})), 'identity');
    rejection(request.candidate(delta(request, {...modern, identity: {...modern.identity, path: '/mismatch'}})), 'identity');
    rejection(request.candidate(delta(request, {...modern, identity: a.identity})), 'identity');
    rejection(request.candidate(delta(request, modern, legacy)), 'identity');
    const parent = request.candidate(delta(request, modern)); assert.equal(parent.kind, 'prepared');
    const inactive = forkSemanticCandidate(parent.context, {key: 'inactive-reservation', active: request.actual.members});
    assert.equal(inactive.kind, 'prepared'); expect(inactive.context.lookup(modern.id).kind).toBe('outside-context');
    rejection(forkSemanticCandidate(inactive.context, delta(request, legacy)), 'identity');
  });

  it('reserves immutable source-only tuples even when inactive and refuses their injective spelling as actual input', async () => {
    const {request} = await source('original-compositor-incidences-independent.xsd');
    const suppressed = request.graph.nodes.find(node => node.kind === 'element' && node.identity.kind === 'scoped'
      && request.actual.originalSourceComponentAbsent(node.id)); assert.ok(suppressed); assert.equal(suppressed.identity.kind, 'scoped');
    const alias: GraphNode = {...suppressed,
      id: hypotheticalScopedId(suppressed.identity.owner, suppressed.identity.path, suppressed.identity.role)};
    expect(alias.id).not.toBe(suppressed.id);
    rejection(request.candidate(delta(request, alias)), 'identity');
    rejection(request.candidate({...delta(request, alias),
      active: [...request.actual.members.filter(id => id !== suppressed.id), alias.id]}), 'identity');
    const spoof = prepareSemanticRequest({graph: {...request.graph,
      nodes: request.graph.nodes.map(node => node.id === suppressed.id ? alias : node)}, links: [], metrics: {steps: 0}});
    expect(spoof).toMatchObject({kind: 'input-error', code: 'identity'});
  });

  it('does not let either spelling impersonate original private content or bypass an inactive reservation', async () => {
    const {request} = await source(), original = complex(request, 'B2');
    const mapped = deriveActualComplexContent(request.actual, original.id); assert.equal(mapped.kind, 'checked');
    assert.ok('particle' in mapped.view.content);
    const privateId = mapped.view.content.particle; expect(mapped.view.synthetic).toContain(privateId);
    const backing = particleContentNode(request.actual, mapped.view, privateId); assert.ok(backing);
    assert.equal(backing.kind, 'particle'); assert.equal(backing.identity.kind, 'scoped');
    expect(request.actual.lookup(backing.id).kind).toBe('missing');
    const handle = deriveOriginalComplexParticle(request.actual, original.id); assert.equal(handle.kind, 'checked');
    const row: RawComplexTypeProperties = {type: original.id, targetNamespace: lateNamespace,
      derivation: {method: 'extension', base: original.derivation!.base}, content: handle.content,
      abstract: false, final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [original.id]}};
    for (const encode of encodings) {
      const alias: ParticleNode = {...backing,
        id: encode(backing.identity.owner, backing.identity.path, backing.identity.role)};
      const occupied = request.candidate(delta(request, alias)); assert.equal(occupied.kind, 'prepared');
      const inactive = forkSemanticCandidate(occupied.context, {key: 'private-alias-inactive', active: request.actual.members});
      assert.equal(inactive.kind, 'prepared');
      for (const context of [occupied.context, inactive.context])
        expect(deriveOriginalComplexPropertyContent(context, original.id)).toMatchObject({kind: 'unresolved', rule: 'original-property-synthetic-collision'});
      rejection(request.candidate({...delta(request, alias), rawTypes: [row]}), 'identity');
      // Tagged backing IDs use the full tuple gate for both stored spellings, including inactive rows.
      rejection(forkSemanticCandidate(inactive.context, {key: 'late-handle', active: request.actual.members, rawTypes: [row]}),
        'identity');
    }
    assert.ok('particle' in row.content && row.content.original);
    rejection(request.candidate({...delta(request),
      rawTypes: [{...row, content: {...row.content, original: {...row.content.original}}}]}), 'representation');
  });

  it('retains the builtin private-view active collision boundary for both spellings', async () => {
    for (const encode of encodings) {
      const {request} = await source(), a = complex(request, 'A');
      // This pins the existing context-qualified native ur backing path; no view is forged.
      const actualId = request.actual.contextId, separator = actualId.lastIndexOf(':');
      const next = actualId.slice(0, separator + 1).replace(':actual:', ':candidate:') + (Number(actualId.slice(separator + 1)) + 1);
      const identity = {kind: 'scoped', owner: a.id, path: '$semantic-builtin-anyType/' + next + '/any', role: 'particle'} as const;
      const alias: ParticleNode = {id: encode(identity.owner, identity.path, identity.role), identity, kind: 'particle',
        occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: []}, context: a.context,
        declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
      const candidate = request.candidate(delta(request, alias)); assert.equal(candidate.kind, 'prepared');
      expect(candidate.context.contextId).toBe(next);
      expect(deriveBuiltinAnyTypeContent(candidate.context, a.id)).toMatchObject({kind: 'unresolved', rule: 'builtin-anyType-content'});
      const inactiveContext = next.slice(0, next.lastIndexOf(':') + 1) + (Number(next.slice(next.lastIndexOf(':') + 1)) + 2);
      const inactiveIdentity = {...identity, path: '$semantic-builtin-anyType/' + inactiveContext + '/any'};
      const inactiveAlias = {...alias, identity: inactiveIdentity,
        id: encode(inactiveIdentity.owner, inactiveIdentity.path, inactiveIdentity.role)};
      const parent = request.candidate(delta(request, inactiveAlias)); assert.equal(parent.kind, 'prepared');
      const inactive = forkSemanticCandidate(parent.context, {key: 'inactive-builtin-alias', active: request.actual.members});
      assert.equal(inactive.kind, 'prepared'); expect(inactive.context.contextId).toBe(inactiveContext);
      expect(inactive.context.lookup(inactiveAlias.id).kind).toBe('outside-context');
      expect(deriveBuiltinAnyTypeContent(inactive.context, a.id).kind).toBe('checked');
    }
  });

  it('keeps full tuple caches isolated across forks and charges hits with sticky failure', async () => {
    const {request} = await source(), a = complex(request, 'A'), helper = fresh(a, hypotheticalScopedId);
    const parent = request.candidate(delta(request)); assert.equal(parent.kind, 'prepared');
    expect(storedIdentityOccupant(parent.context, helper.identity)).toBeUndefined();
    const child = forkSemanticCandidate(parent.context, {...delta(request, helper), key: 'occupant'}); assert.equal(child.kind, 'prepared');
    const sibling = forkSemanticCandidate(parent.context, {key: 'no-occupant', active: parent.context.members}); assert.equal(sibling.kind, 'prepared');
    expect(storedIdentityOccupant(child.context, helper.identity)).toBe(helper.id);
    expect(storedIdentityOccupant(sibling.context, helper.identity)).toBeUndefined();
    expect(storedIdentityOccupant(parent.context, helper.identity)).toBeUndefined();
    const before = request.budget.usage().work;
    expect(storedIdentityOccupant(child.context, helper.identity)).toBe(helper.id);
    expect(request.budget.usage().work).toBeGreaterThan(before);
    const unqueried = forkSemanticCandidate(child.context, {key: 'exhaust-unpublished', active: child.context.members}); assert.equal(unqueried.kind, 'prepared');
    request.budget.chargeWork(DEFAULT_MAX_WORK - request.budget.usage().work - 20);
    const failure = request.budget.guard(() => storedIdentityOccupant(unqueried.context, helper.identity));
    expect(failure).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(request.budget.guard(() => storedIdentityOccupant(unqueried.context, helper.identity))).toBe(failure);
    expect(request.budget.guard(() => storedIdentityOccupant(child.context, helper.identity))).toBe(failure);
  });

  it('allocates past finite forbidden IDs and tuples and preserves exact UTF-16 tuple distinctions', () => {
    const tuples = [['a', 'bc', 'd'], ['ab', 'c', 'd'], ['', '', ''], ['a"b', 'c\\d', '\u0000'],
      ['a', '\ud800', 'type'], ['a', '\\ud800', 'type'], ['global', '["a","b"]', 'particle']] as const;
    const selected = tuples.map(([owner, pathValue, role]) => hypotheticalScopedId(owner, pathValue, role));
    expect(new Set(selected).size).toBe(tuples.length);
    selected.forEach((id, index) => expect(JSON.parse(id).slice(1)).toEqual(tuples[index]));
    const owner = 'owner', role = 'type';
    const forbiddenIds = new Set([0, 1, 2].map(index => hypotheticalScopedId(owner, '/$hypothetical/' + index, role)));
    const forbiddenTuples = new Set([3, 4].map(index => semanticIdentityTuple({kind: 'scoped', owner, path: '/$hypothetical/' + index, role})));
    const next = allocateHypotheticalScopedIdentity(owner, role, forbiddenIds, forbiddenTuples);
    expect(next.identity.path).toBe('/$hypothetical/5'); expect(next.candidatesTried).toBe(6n);
    expect(forbiddenIds.has(next.id)).toBe(false); expect(forbiddenTuples.has(semanticIdentityTuple(next.identity))).toBe(false);
  });

  it('precharges full nested-owner encoding before serialization and retains sticky exhaustion', () => {
    let owner = 'a"b\\c\u0000';
    const initialLength = owner.length;
    for (let depth = 0; depth < 8; depth++) owner = hypotheticalScopedId(owner, '/nested', 'type');
    expect(owner.length).toBeGreaterThan(initialLength * 8);
    for (const family of ['hypothetical', 'effective', 'builtin-anyType'] as const) {
      const budget = createSemanticBudget({maxWork: 1_000}), stringify = vi.spyOn(JSON, 'stringify');
      let first: unknown, repeated: unknown, serialized = -1;
      try {
        first = budget.guard(() => family === 'hypothetical' ? hypotheticalScopedId(owner, '/child', 'type', budget.chargeWork)
          : privateParticleId(family, owner, '/child', 'particle', budget.chargeWork));
        repeated = budget.guard(() => allocateHypotheticalScopedIdentity(owner, 'type', new Set(), new Set(), budget.chargeWork));
        serialized = stringify.mock.calls.length;
      } finally {stringify.mockRestore();}
      expect(first).toMatchObject({kind: 'resource-limit', limit: 'work'});
      expect(repeated).toBe(first); expect(first).toBe(budget.failure()); expect(serialized).toBe(0);
    }
  });
});
