import path from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate, prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {prepareBoundSourceGraph, sourceSchemasForResolvedGraph} from '../../src/compiler/sourceSchemaBinding.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01Evidence} from '../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import type {SchemaNotationProperties} from '../../src/compiler/schemaNotationProperties.js';

// Independent oracles published BEFORE notation context/verifier implementation:
// #267 https://github.com/TechSpokes/typescript-wsdl-client/issues/267#issuecomment-6112870872
// #271 https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6112871045
const fixtures = path.resolve('test/conformance/fixtures');
const fixture = path.join(fixtures, 'xsd/recovery/finite-notation-independent.xsd');
const namespace = 'urn:recovery:notation-context';
const named = (local: string) => globalId('type', {namespace, local});
const original = {namespace, local: 'Original'};
const fresh: SchemaNotationProperties = {name: {namespace, local: 'Fresh'}, publicIdentifier: 'image/fresh', systemIdentifier: undefined};
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const local = (target: string): Reference => ({kind: 'local', target});
async function input() {return loadSchemaInput(fixture, {policy: {fileRoots: [fixtures]}});}
async function setup(source?: string) {
  const origin = 'https://notation-independent.example', uri = origin + '/original.xsd';
  const bytes = source === undefined ? undefined : Buffer.from(source);
  const loaded = bytes === undefined ? await input() : await loadSchemaInput(uri, {policy: {allowedOrigins: [origin]},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')} ]])});
  const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected issued source context');
  return prepared.request;
}

describe('independent source-bound notation membership and candidate closure', () => {

  async function finiteCandidate(notations: Parameters<Awaited<ReturnType<typeof setup>>['candidate']>[0]['notations'], source?: string) {
    const request = await setup(source);
    const b = request.actual.lookup(named('B')), d = request.actual.lookup(named('D'));
    if (b.kind !== 'found' || b.node.kind !== 'complexType' || d.kind !== 'found' || d.node.kind !== 'complexType') throw new Error('Expected original finite target types');
    const baseType = b.node;
    const eId = named('E');
    const e: ComplexTypeNode = {...b.node, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}},
      attributes: [], derivation: {kind: 'extension', contentKind: 'simple', base: builtin('anySimpleType'), facets: []}};
    const endpoint: ComplexTypeNode = {...d.node, derivation: {kind: 'restriction', contentKind: 'simple', base: local(eId), facets: []}};
    const properties = (type: string, base: Reference, method: 'extension' | 'restriction', scalar: Reference): RawComplexTypeProperties => ({
      type, derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar}, attributeUses: baseType.attributes,
      provenance: {kind: 'hypothetical-abstract', originals: type === eId ? [] : [type]},
    });
    const candidate = request.candidate({key: 'finite-notation', active: [...request.actual.members, eId], additions: [e], endpoint, notations,
      rawTypes: [properties(b.node.id, builtin('string'), 'extension', builtin('string')),
        properties(eId, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
        properties(d.node.id, local(eId), 'restriction', builtin('string'))]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structurally represented notation candidate: ' + JSON.stringify(candidate));
    const evidence: FiniteRe01Evidence = {root: 'root', nodes: [{id: 'root', parent: request.actual, context: candidate.context,
      target: d.node.id, intermediate: eId, ancestor: builtin('anySimpleType'), premises: []}]};
    return {request, candidate: candidate.context, target: d.node.id, evidence};
  }

  it('checks a valid unused fresh notation through the finite proof and binds its receipt to the exact context', async () => {
    const {request, candidate, target, evidence} = await finiteCandidate({active: [original, fresh.name], additions: [fresh]});
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'checked-candidate', claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (result.kind !== 'checked-candidate') throw new Error('Expected finite notation closure');
    expect(result.actualNotations).toEqual([{contextId: request.actual.contextId, properties: {name: original, publicIdentifier: 'image/original', systemIdentifier: undefined}, origin: 'original'}]);
    expect(result.proof[0].notations).toEqual(expect.arrayContaining([{contextId: candidate.contextId, properties: fresh, origin: 'addition'}]));
    expect(result.proof[0].notations).toHaveLength(2);
    expect(() => assertFiniteCandidateReceipt(request.actual, result)).not.toThrow();
    expect(() => assertFiniteCandidateReceipt(request.actual, {...result})).toThrow(/Unauthenticated/);
  });

  it.each(['absent-identifiers', 'invalid-public'] as const)('rejects an unused fresh notation with %s instead of waiving its obligation', async variation => {
    const invalid = {...fresh, publicIdentifier: variation === 'invalid-public' ? '"' : undefined};
    const {request, target, evidence} = await finiteCandidate({active: [original, fresh.name], additions: [invalid]});
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toMatchObject({kind: 'candidate-rejected', rule: 'n-props-correct'});
  });


  it('retains an invalid original named tuple and rejects original schema validity before candidate success', async () => {
    const source = readFileSync(fixture, 'utf8').replace(' public="image/original"', '');
    const {request, target, evidence} = await finiteCandidate(undefined, source);
    expect(request.actual.lookupNotation(original)).toMatchObject({kind: 'found', origin: 'original', properties: {
      name: original, publicIdentifier: undefined, systemIdentifier: undefined,
    }});
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toMatchObject({kind: 'invalid-schema'});
  });

  it('keeps an omitted original notation from qualifying complete finite closure', async () => {
    const {request, target, evidence} = await finiteCandidate({active: []});
    expect(verifyFiniteRe01Evidence(request.actual, target, evidence)).toMatchObject({kind: 'unresolved'});
  });


  it.each(['active-fresh', 'original-fresh', 'original-retained-in-subset'] as const)
    ('keeps NOTATION typed operand interpretation in its declared context: %s', async variant => {
      const request = await setup();
      const template = request.actual.lookup(named('OriginalNotation'));
      if (template.kind !== 'found' || template.node.kind !== 'simpleType') throw new Error('Expected original NOTATION type');
      const id = named('FreshNotation'), originalOperand = variant !== 'active-fresh';
      const literal = variant === 'original-retained-in-subset' ? 't:Original' : 't:Fresh';
      const type: SimpleTypeNode = {...template.node, id, identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshNotation'}},
        variety: {kind: 'restriction', base: builtin('NOTATION'), facets: []}};
      const lexical = {value: literal, context: template.node.context};
      const candidate = request.candidate({key: variant, active: [...request.actual.members, id], additions: [type],
        notations: {active: variant === 'original-retained-in-subset' ? [fresh.name] : [original, fresh.name], additions: [fresh]},
        rawSimpleTypes: [{type: id, base: builtin('NOTATION'), final: [], variety: {kind: 'atomic'},
          facetLayers: [{facets: [{name: 'enumeration', lexical, fixed: false,
            ...(originalOperand ? {operand: {type: variant === 'original-fresh' ? builtin('NOTATION') : local(template.node.id), owner: template.node.id, context: 'original' as const}} : {}),
          }]}], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
      if (candidate.kind !== 'prepared') throw new Error('Expected notation scalar helper');
      const kernel = createSchemaScalarKernel(candidate.context);
      if (variant === 'original-fresh') {
        expect(kernel.describe(local(id), id)).toMatchObject({kind: 'invalid-schema'});
        return;
      }
      const described = kernel.describe(local(id), id);
      if (variant === 'original-retained-in-subset') {
        // Original operand interpretation is available, but the new enum still
        // owes membership in its ACTIVE base, whose notation is omitted here.
        expect(createSchemaScalarKernel(candidate.context.originalContext()).assess(local(template.node.id), lexical, template.node.id)).toMatchObject({kind: 'checked'});
        expect(described).toMatchObject({kind: 'unresolved', rule: 'notation-context-membership'});
        expect(kernel.assess(local(id), lexical, id)).toMatchObject({kind: 'unresolved', rule: 'notation-context-membership'});
      } else {
        expect(described, JSON.stringify(described)).toMatchObject({kind: 'checked'});
        expect(kernel.assess(local(id), lexical, id)).toMatchObject({kind: 'checked'});
        expect(kernel.assess(local(id), {...lexical, value: 't:Missing'}, id)).toMatchObject({kind: 'invalid-schema'});
      }
    });

  it('binds complete source inventory only to the privately issued resolved handle', async () => {
    const loaded = await input(), budget = createSemanticBudget({maxWork: 100_000_000});
    const bound = prepareBoundSourceGraph(loaded, {budget});
    if (bound.kind !== 'prepared') throw new Error('Expected issued resolved graph');
    const schemas = sourceSchemasForResolvedGraph(bound.resolved);
    expect(schemas).toHaveLength(1); expect(Object.isFrozen(schemas)).toBe(true);
    const copied = {...bound.resolved};
    expect(sourceSchemasForResolvedGraph(copied)).toBeUndefined();
    let called = false;
    const accessor = {...bound.resolved, get graph() {called = true; return bound.resolved.graph;}};
    expect(sourceSchemasForResolvedGraph(accessor)).toBeUndefined(); expect(called).toBe(false);
    expect(() => prepareBoundSourceGraph({...loaded}, {budget})).toThrow(/Unauthenticated/);
    const complete = prepareSemanticRequest(bound.resolved, {budget});
    const retainedOnly = prepareSemanticRequest(copied, {budget});
    if (complete.kind !== 'prepared' || retainedOnly.kind !== 'prepared') throw new Error('Expected structural contexts');
    expect(complete.request.actual.notationUniverse).toBe('source-bound');
    expect(complete.request.actual.lookupNotation(original)).toMatchObject({kind: 'found', origin: 'original', properties: {
      name: original, publicIdentifier: 'image/original', systemIdentifier: undefined,
    }});
    expect(complete.request.actual.lookupNotation(fresh.name)).toMatchObject({kind: 'missing'});
    expect(retainedOnly.request.actual.notationUniverse).toBe('retained-only');
    expect(retainedOnly.request.actual.lookupNotation(fresh.name)).toMatchObject({kind: 'unresolved', rule: 'notation-source-universe'});

    const retainedCandidate = retainedOnly.request.candidate({key: 'fresh-without-source-authority', active: retainedOnly.request.actual.members,
      notations: {active: [original, fresh.name], additions: [fresh]}});
    if (retainedCandidate.kind !== 'prepared') throw new Error('Expected structural addition without source authority');
    expect(retainedCandidate.context.lookupNotation(fresh.name)).toMatchObject({kind: 'unresolved', rule: 'notation-source-universe'});

  });

  it('owns frozen fresh tuples without letting active omission fall back to original storage', async () => {
    const request = await setup();
    const addition = {...fresh, name: {...fresh.name}};
    const candidate = request.candidate({key: 'fresh', active: request.actual.members,
      notations: {active: [original, fresh.name], additions: [addition]}});
    if (candidate.kind !== 'prepared') throw new Error('Expected represented fresh notation');
    addition.publicIdentifier = 'changed after preparation'; addition.name.local = 'Changed';
    expect(candidate.context.notationMembership).toBe('complete-original-plus-additions');
    const found = candidate.context.lookupNotation(fresh.name);
    expect(found).toMatchObject({kind: 'found', origin: 'addition', properties: fresh});
    if (found.kind !== 'found') throw new Error('Expected active fresh tuple');
    expect(Object.isFrozen(found.properties)).toBe(true); expect(Object.isFrozen(found.properties.name)).toBe(true);
    expect(request.actual.lookupNotation(fresh.name)).toMatchObject({kind: 'missing'});
    const subset = forkSemanticCandidate(candidate.context, {key: 'omit-original', active: candidate.context.members,
      notations: {active: [fresh.name]}});
    if (subset.kind !== 'prepared') throw new Error('Expected structural notation subset');
    expect(subset.context.notationMembership).toBe('structural-subset');
    expect(subset.context.lookupNotation(original)).toMatchObject({kind: 'outside-context'});
    expect(subset.context.originalContext().lookupNotation(original)).toMatchObject({kind: 'found', origin: 'original'});
    expect(subset.context.lookupNotation({namespace, local: 'Unknown'})).toMatchObject({kind: 'unresolved', rule: 'notation-active-membership'});
  });

  it('rejects collisions, unknown membership, inactive additions and duplicate names before semantic success', async () => {
    const request = await setup();
    const candidate = (notations: Parameters<typeof request.candidate>[0]['notations']) => request.candidate({key: 'bad-domain', active: request.actual.members, notations});
    expect(candidate({active: [original], additions: [{...fresh, name: original}]})).toMatchObject({kind: 'candidate-rejected', code: 'identity'});
    expect(candidate({active: [original, original]})).toMatchObject({code: 'identity'});
    expect(candidate({active: [original, fresh.name], additions: [fresh, fresh]})).toMatchObject({code: 'identity'});
    expect(candidate({active: [original, fresh.name]})).toMatchObject({code: 'missing'});
    expect(candidate({active: [original], additions: [fresh]})).toMatchObject({code: 'outside-context'});

    for (const missing of ['publicIdentifier', 'systemIdentifier'] as const) {
      const partial = {...fresh}; delete partial[missing];
      expect(candidate({active: [original, fresh.name], additions: [partial]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    }

    const subset = request.candidate({key: 'omit-all-original-notations', active: request.actual.members, notations: {active: []}});
    if (subset.kind !== 'prepared') throw new Error('Expected structural subset');
    expect(forkSemanticCandidate(subset.context, {key: 'collide-inactive-original', active: subset.context.members,
      notations: {active: [original], additions: [{...fresh, name: original}]}})).toMatchObject({kind: 'candidate-rejected', code: 'identity'});
  });

  it('inherits notation domains through forks and reserves inactive ancestor names under the same budget', async () => {
    const request = await setup();
    const parent = request.candidate({key: 'parent', active: request.actual.members, notations: {active: [original, fresh.name], additions: [fresh]}});
    if (parent.kind !== 'prepared') throw new Error('Expected parent');
    const child = forkSemanticCandidate(parent.context, {key: 'inherit', active: parent.context.members});
    if (child.kind !== 'prepared') throw new Error('Expected inherited child');
    expect(child.context.budget).toBe(request.budget);
    expect(child.context.notationMembers).toEqual(parent.context.notationMembers);
    expect(child.context.lookupNotation(fresh.name)).toMatchObject({kind: 'found', properties: fresh});
    const omitted = forkSemanticCandidate(child.context, {key: 'omit-fresh', active: child.context.members, notations: {active: [original]}});
    if (omitted.kind !== 'prepared') throw new Error('Expected structural omission');
    expect(omitted.context.lookupNotation(fresh.name)).toMatchObject({kind: 'outside-context'});
    expect(forkSemanticCandidate(omitted.context, {key: 'reserved-ancestor', active: omitted.context.members,
      notations: {active: [original, fresh.name], additions: [fresh]}})).toMatchObject({kind: 'candidate-rejected', code: 'identity'});
    expect(() => forkSemanticCandidate({...child.context}, {key: 'forged', active: child.context.members})).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(forkSemanticCandidate(child.context, {key: 'exhausted', active: child.context.members})).toBe(request.budget.failure());
  });

  it('rejects notation lookup and delta accessors without executing caller code', async () => {
    const request = await setup(); let called = false;
    const name = {namespace, get local() {called = true; return 'Original';}};
    expect(() => request.actual.lookupNotation(name)).toThrow(TypeError); expect(called).toBe(false);
    const properties = {...fresh, get publicIdentifier() {called = true; return 'image/fresh';}};
    expect(request.candidate({key: 'accessor', active: request.actual.members,
      notations: {active: [original, fresh.name], additions: [properties]}})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    expect(called).toBe(false);
    expect(() => createSchemaScalarKernel({...request.actual})).toThrow(/Unauthenticated/);
  });
});
