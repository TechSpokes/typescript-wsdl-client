import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {AttributeNode, ComplexTypeNode, ElementNode, GraphNode, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {checkSchemaDocumentSyntax, prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import type {OriginalGeneratedScalarReference, SemanticTypeReference} from '../../src/compiler/semanticTypeReference.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import type {RawScalarFacetLayer, RawSimpleTypeProperties} from '../../src/compiler/schemaSimpleTypeProperties.js';
import {assertOriginalGeneratedScalarReceipt, checkOriginalGeneratedScalar, compareSchemaFacetProperties, createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import {resolveSemanticType, semanticTypeKey} from '../../src/compiler/schemaTypeIdentity.js';
import {checkCandidateCorrespondence} from '../../src/compiler/re01CandidateCorrespondence.js';
import {verifyFiniteRe01Evidence} from '../../src/compiler/finiteRe01Verification.js';
import {checkElementDeclarationsConsistent} from '../../src/compiler/particleDeclarationConsistency.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent, deriveModelGroupContent} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';
import {compareComponentProperties} from '../../src/compiler/schemaComponentEquality.js';
import {originalGeneratedShape, resolveOriginalScalarIdentity} from '../../src/compiler/schemaGeneratedScalarShape.js';
import {checkSubstitution, checkTypeDerivation, immediateTypeBase} from '../../src/compiler/schemaTypeRelations.js';

// Independent pre-code oracle: #271/6114913200 and #268/6114917591.
// Generated slots preserve original component data, never original legality.
const namespace = 'urn:recovery:original-generated-binding';
const id = (local: string) => globalId('type', {namespace, local});
const named = (name: string): SemanticTypeReference => ({kind: 'local', target: id(name)});
const builtin = (local: string): SemanticTypeReference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const slot = (name: string): OriginalGeneratedScalarReference => ({kind: 'original-generated', owner: id(name)});
const maxWork = 100_000_000;
async function setup(file = 'original-generated-binding-independent.xsd') {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected authentic source request: ${JSON.stringify(prepared)}`);
  const request = prepared.request;
  const node = (target: string, context = request.actual): GraphNode => {
    const found = context.lookup(target); if (found.kind !== 'found') throw new Error(`Missing ${target}`); return found.node;
  };
  const complex = (name: string): ComplexTypeNode => {const found = node(id(name)); if (found.kind !== 'complexType') throw new Error('Expected complex type'); return found;};
  const simple = (name: string): SimpleTypeNode => {const found = node(id(name)); if (found.kind !== 'simpleType') throw new Error('Expected simple type'); return found;};
  const lexical = (value: string) => ({value, context: node(id('Empty')).context});
  const properties = (type: string, base: SemanticTypeReference, method: 'extension' | 'restriction', scalar: SemanticTypeReference): RawComplexTypeProperties => ({
    type, derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar},
    attributeUses: complex('B').attributes, provenance: {kind: 'hypothetical-abstract', originals: request.actual.lookup(type).kind === 'found' ? [type] : []},
  });
  const candidate = (content: SemanticTypeReference = slot('R'), scalarSlots = request.actual.scalarSlots, rawSimpleTypes: readonly RawSimpleTypeProperties[] = [], fresh: readonly GraphNode[] = []): SemanticContext => {
    const b = complex('B'), d = complex('D');
    const e: ComplexTypeNode = {...b, id: id('E'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}}, attributes: [],
      derivation: {kind: 'extension', contentKind: 'simple', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}}, facets: []}};
    const result = request.candidate({key: 'generated-slot-independent', active: [...request.actual.members, e.id, ...fresh.map(node => node.id)], additions: [e, ...fresh], scalarSlots, rawSimpleTypes,
      endpoint: {...d, derivation: {kind: 'restriction', contentKind: 'simple', base: {kind: 'local', target: e.id}, facets: []}},
      rawTypes: [properties(b.id, builtin('string'), 'extension', builtin('string')),
        properties(e.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType')), properties(d.id, named('E'), 'restriction', content)]});
    if (result.kind !== 'prepared') throw new Error(`Expected structural generated candidate: ${JSON.stringify(result)}`);
    return result.context;
  };
  return {request, node, complex, simple, lexical, properties, candidate};
}

describe('independent original generated scalar identity and closure', () => {
  it('maps actual simple content directly to original slots without diagnostic simpleType components', async () => {
    const s = await setup();
    for (const [name, expected] of [['R', slot('R')], ['R2', slot('R2')], ['ZeroR', slot('ZeroR')], ['D', slot('R')], ['B', builtin('string')]] as const) {
      const result = deriveActualComplexContent(s.request.actual, id(name));
      expect(result).toMatchObject({kind: 'checked'}); if (result.kind !== 'checked') throw new Error('Expected source content mapping');
      expect(result.view.content).toMatchObject({kind: 'simple', type: expected});
      expect(result.view.synthetic).toEqual([]);
      expect(deriveActualComplexContent(s.request.actual, id(name))).toMatchObject({kind: 'checked', view: result.view});
    }
  });

  it('inventories restriction slots once; extension names cannot mint or alias selectors', async () => {
    const s = await setup();
    expect(s.request.actual.scalarSlotMembership).toBe('complete-original');
    expect(new Set(s.request.actual.scalarSlots.map(item => item.owner))).toEqual(new Set(['R', 'R2', 'ZeroR', 'U'].map(id)));
    expect(s.request.actual.lookupScalarSlot({...slot('R')})).toMatchObject({kind: 'found', slot: slot('R')});
    expect(s.request.actual.lookupScalarSlot(slot('D'))).toMatchObject({kind: 'missing'});
    expect(s.request.actual.lookupScalarSlot(slot('Fresh'))).toMatchObject({kind: 'missing'});
    expect(resolveSemanticType(s.request.actual, {...slot('R')})).toMatchObject({kind: 'original-generated', identity: slot('R')});
  });

  it('preserves zero-facet and separate restriction identities while extension inherits exactly R', async () => {
    const s = await setup(), kernel = createSchemaScalarKernel(s.request.actual);
    const r = kernel.contentIdentity(slot('R'), id('D')), r2 = kernel.contentIdentity(slot('R2'), id('D'));
    const zero = kernel.contentIdentity(slot('ZeroR'), id('D')), string = kernel.contentIdentity(builtin('string'), id('D'));
    expect(r).toMatchObject({kind: 'checked'}); expect(r2).toMatchObject({kind: 'checked'});
    expect(zero).toMatchObject({kind: 'checked'}); expect(string).toMatchObject({kind: 'checked'});
    if (r.kind !== 'checked' || r2.kind !== 'checked' || zero.kind !== 'checked' || string.kind !== 'checked') throw new Error('Expected scalar identities');
    expect(r.value).not.toEqual(r2.value); expect(zero.value).not.toEqual(string.value);
    expect(kernel.contentIdentity(named('D'), id('D'))).toMatchObject({kind: 'checked', value: r.value});
    expect(kernel.assess(slot('R'), s.lexical(''), id('D'))).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(slot('R'), s.lexical('x'), id('D'))).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each(['endpoint-only', 'with-fresh-consumer'] as const)('checks a genuine extension target retaining its original restriction slot after rebasing: %s', async mode => {
    const s = await setup();
    const fresh: SimpleTypeNode = {...s.simple('Empty'), id: id('FreshConsumer'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshConsumer'}}};
    const raw: RawSimpleTypeProperties = {type: fresh.id, base: slot('U'), final: [], variety: {kind: 'atomic'}, facetBinding: {kind: 'original', type: slot('U')},
      provenance: {kind: 'hypothetical-abstract', originals: []}};
    const context = mode === 'endpoint-only' ? s.candidate() : s.candidate(slot('R'), s.request.actual.scalarSlots, [raw], [fresh]);
    expect(s.complex('D').derivation?.kind).toBe('extension');
    const result = verifyFiniteRe01Evidence(s.request.actual, id('D'), {root: 'root', nodes: [{id: 'root', parent: s.request.actual,
      context, target: id('D'), intermediate: id('E'), ancestor: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}}, premises: []}]});
    expect(result).toMatchObject({kind: 'checked-candidate', claims: {actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false,
      completeNegativeAnswer: false, searchTermination: false}});
    if (result.kind !== 'checked-candidate') throw new Error(`Expected concrete finite generated-slot evidence: ${JSON.stringify(result)}`);
    expect(result.proof).toHaveLength(1);
    expect(result.proof[0]?.correspondence).toMatchObject({kind: 'checked', target: id('D'), scalarObligations: []});
    expect(new Set(result.actualScalarSlots.map(receipt => receipt.slot.owner))).toEqual(new Set(s.request.actual.scalarSlots.map(item => item.owner)));
    // Accepted B checks all original slots in Gamma; H checks E/D'/helpers and
    // consumed dependencies. Complete H availability is not a validity root.
    expect(new Set(result.proof[0].scalarSlots.map(receipt => receipt.slot.owner))).toEqual(new Set((mode === 'endpoint-only' ? ['R'] : ['R', 'U']).map(id)));
    if (mode === 'with-fresh-consumer') expect(result.proof[0].components.map(receipt => receipt.component)).toContain(fresh.id);
    for (const name of ['R2', 'ZeroR', 'U']) expect(context.lookupScalarSlot(slot(name))).toMatchObject({kind: 'found'});
    for (const [owner, receipts] of [[s.request.actual, result.actualScalarSlots], [context, result.proof[0].scalarSlots]] as const) {
      for (const receipt of receipts) {
        expect(receipt).toMatchObject({kind: 'checked', authority: 'XSD10-original-generated-scalar-v1', contextId: owner.contextId, obligations: []});
        expect(() => assertOriginalGeneratedScalarReceipt(owner, receipt)).not.toThrow();
      }
    }
  });

  it.each(['OutsideClass', 'OutsideInfinite'] as const)('checks a supplied finite candidate whose fresh scalar needs a positive %s witness', async base => {
    const s = await setup();
    const fresh: SimpleTypeNode = {...s.simple('Empty'), id: id('FreshPatternConsumer'),
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshPatternConsumer'}}};
    const pattern = base === 'OutsideClass' ? '[0]{4}1' : '0{4,}1';
    const raw: RawSimpleTypeProperties = {type: fresh.id, targetNamespace: namespace, base: named(base), final: [], variety: {kind: 'atomic'},
      facetLayers: [{facets: [
        {name: 'pattern', lexical: s.lexical(pattern), fixed: false},
        {name: 'enumeration', lexical: s.lexical('1'), fixed: false,
          operand: {type: builtin('decimal'), owner: id('D'), context: 'original'}},
      ]}], provenance: {kind: 'hypothetical-abstract', originals: []}};
    const context = s.candidate(slot('R'), s.request.actual.scalarSlots, [raw], [fresh]);
    const result = verifyFiniteRe01Evidence(s.request.actual, id('D'), {root: 'root', nodes: [{id: 'root', parent: s.request.actual,
      context, target: id('D'), intermediate: id('E'), ancestor: builtin('anySimpleType'), premises: []}]});
    expect(result).toMatchObject({kind: 'checked-candidate', claims: {actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false}});
    if (result.kind !== 'checked-candidate') throw new Error(`Expected integrated positive witness: ${JSON.stringify(result)}`);
    expect(result.proof[0]?.components).toEqual(expect.arrayContaining([expect.objectContaining({component: fresh.id, obligations: []})]));
  });

  it('rejects replacing the endpoint with another property-equal original slot', async () => {
    const s = await setup(), context = s.candidate(slot('R2'));
    const result = checkCandidateCorrespondence(s.request.actual, s.request.actual, context, id('D'), id('E'),
      {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}});
    expect(result, JSON.stringify(result)).toMatchObject({kind: 'candidate-rejected'});
  });

  it('rejects a fresh anonymous ordinary scalar impersonating the original generated endpoint identity', async () => {
    const s = await setup(), path = '/independent-fresh-scalar', target = scopedId(id('E'), path, 'simpleType');
    const fresh: SimpleTypeNode = {...s.simple('Empty'), id: target, identity: {kind: 'scoped', owner: id('E'), path, role: 'simpleType'}};
    const context = s.candidate({kind: 'local', target}, s.request.actual.scalarSlots, [{type: target, targetNamespace: namespace,
      base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetLayers: [{facets: [{name: 'minLength', fixed: false, annotation: 'absent', lexical: s.lexical('1')}]}],
      provenance: {kind: 'hypothetical-abstract', originals: []}}], [fresh]);
    expect(createSchemaScalarKernel(context).assess({kind: 'local', target}, s.lexical('x'), id('D'))).toMatchObject({kind: 'checked', obligations: []});
    expect(checkCandidateCorrespondence(s.request.actual, s.request.actual, context, id('D'), id('E'),
      {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}})).toMatchObject({kind: 'candidate-rejected'});
  });

  it('inherits slot membership across forks, preserving a deliberate omission instead of reactivating from source', async () => {
    const s = await setup();
    const selected = s.request.actual.scalarSlots.filter(item => item.owner !== id('R'));
    const first = s.request.candidate({key: 'omit-unreferenced-slot', active: s.request.actual.members, scalarSlots: selected});
    expect(first).toMatchObject({kind: 'prepared'}); if (first.kind !== 'prepared') throw new Error('Expected structural subset');
    expect(first.context.scalarSlotMembership).toBe('structural-subset');
    expect(first.context.lookupScalarSlot(slot('R'))).toMatchObject({kind: 'outside-context'});
    // Mapping immutable original properties is distinct from active resolution.
    expect(originalGeneratedShape(first.context, slot('R'))).toMatchObject({kind: 'checked', contextId: s.request.actual.contextId});
    const fork = forkSemanticCandidate(first.context, {key: 'inherit-slot-subset', active: first.context.members});
    expect(fork).toMatchObject({kind: 'prepared'}); if (fork.kind !== 'prepared') throw new Error('Expected structural fork');
    expect(fork.context.scalarSlotMembership).toBe('structural-subset');
    expect(fork.context.lookupScalarSlot(slot('R'))).toMatchObject({kind: 'outside-context'});
  });

  it('constructs an active original slot without requiring its inactive source container', async () => {
    const s = await setup();
    const excluded = new Set(['R', 'D', 'U'].map(id));
    const result = s.request.candidate({key: 'slot-without-source-container', active: s.request.actual.members.filter(member => !excluded.has(member)), scalarSlots: [slot('R')]});
    expect(result).toMatchObject({kind: 'prepared'}); if (result.kind !== 'prepared') throw new Error('Expected structural source-container subset');
    expect(result.context.lookup(id('R'))).toMatchObject({kind: 'outside-context'});
    const receipt = checkOriginalGeneratedScalar(result.context, {...slot('R')});
    expect(receipt).toMatchObject({kind: 'checked', authority: 'XSD10-original-generated-scalar-v1', slot: slot('R'), contextId: result.context.contextId, obligations: []});
    if (receipt.kind !== 'checked') throw new Error('Expected dedicated slot construction');
    expect(receipt.typeDependencies).toEqual(expect.arrayContaining([{contextId: result.context.contextId, type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}}]));
    expect(() => assertOriginalGeneratedScalarReceipt(result.context, receipt)).not.toThrow();
    expect(() => assertOriginalGeneratedScalarReceipt(result.context, {...receipt})).toThrow(TypeError);
    expect(() => assertOriginalGeneratedScalarReceipt(s.request.actual, receipt)).toThrow(TypeError);
  });

  it('retains the original base slot through an extension that is rebased in H', async () => {
    const s = await setup(), context = s.candidate();
    const receipt = checkOriginalGeneratedScalar(context, slot('U'));
    expect(receipt).toMatchObject({kind: 'checked', slot: slot('U'), contextId: context.contextId, obligations: []});
    if (receipt.kind !== 'checked') throw new Error('Expected mapped dependent original slot');
    expect(receipt.typeDependencies).toEqual(expect.arrayContaining([{contextId: context.contextId, type: slot('R')}]));
    expect(createSchemaScalarKernel(context).assess(slot('U'), s.lexical('x'), id('D'))).toMatchObject({kind: 'invalid-schema'});
    expect(createSchemaScalarKernel(context).assess(slot('U'), s.lexical('xy'), id('D'))).toMatchObject({kind: 'checked', obligations: []});
  });

  it('does not resolve a missing active ordinary slot dependency through the immutable original store', async () => {
    const s = await setup('original-generated-facets-independent.xsd');
    const prepared = s.request.candidate({key: 'missing-active-base', active: [id('Empty')], scalarSlots: [slot('DependentR')]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected lower structural subset');
    expect(prepared.context.lookup(id('NamedBase'))).toMatchObject({kind: 'outside-context'});
    expect(checkOriginalGeneratedScalar(prepared.context, slot('DependentR'))).toMatchObject({kind: 'unresolved'});
    expect(checkOriginalGeneratedScalar(s.request.actual, slot('DependentR'))).toMatchObject({kind: 'checked', obligations: []});
  });

  it('does not let whole-H finite closure infer complete original slots from complete GraphNode membership', async () => {
    const s = await setup(), context = s.candidate(slot('R'), s.request.actual.scalarSlots.filter(item => item.owner !== id('ZeroR')));
    expect(context.membership).toBe('complete-actual-plus-additions');
    expect(context.scalarSlotMembership).toBe('structural-subset');
    const result = verifyFiniteRe01Evidence(s.request.actual, id('D'), {root: 'root', nodes: [{id: 'root', parent: s.request.actual,
      context, target: id('D'), intermediate: id('E'), ancestor: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}}, premises: []}]});
    expect(result.kind).not.toBe('checked-candidate');
    expect(result).toMatchObject({kind: 'unresolved'});
  });

  it.each([{kind: 'original-generated', owner: 42}, {kind: 'original-generated'}, {kind: 'builtin', name: {namespace: '', local: 42}}])
    ('returns evidence-syntax for a malformed caller ancestor selector: %j', async ancestor => {
      const s = await setup(), context = s.candidate();
      const evidence = {root: 'root', nodes: [{id: 'root', parent: s.request.actual, context, target: id('D'), intermediate: id('E'),
        ancestor: ancestor as unknown as SemanticTypeReference, premises: []}]};
      expect(verifyFiniteRe01Evidence(s.request.actual, id('D'), evidence)).toMatchObject({kind: 'invalid-evidence', rule: 'evidence-syntax'});
    });

  it('never executes a caller selector getter and preserves sticky finite verification exhaustion', async () => {
    const s = await setup(), context = s.candidate(); let calls = 0;
    const ancestor = Object.defineProperty({kind: 'original-generated'}, 'owner', {enumerable: true, get() {calls++; return id('R');}}) as OriginalGeneratedScalarReference;
    const evidence = {root: 'root', nodes: [{id: 'root', parent: s.request.actual, context, target: id('D'), intermediate: id('E'), ancestor, premises: []}]};
    expect(verifyFiniteRe01Evidence(s.request.actual, id('D'), evidence)).toMatchObject({kind: 'invalid-evidence', rule: 'evidence-syntax'});
    expect(calls).toBe(0);
    s.request.budget.guard(() => s.request.budget.chargeWork(maxWork));
    expect(verifyFiniteRe01Evidence(s.request.actual, id('D'), evidence)).toBe(s.request.budget.failure());
    expect(calls).toBe(0);
  });

  it('rejects unauthenticated contexts and accessor selectors without invoking the accessor', async () => {
    const s = await setup(); let calls = 0;
    const forged = Object.defineProperty({}, 'kind', {get() {calls++; return 'original-generated';}}) as OriginalGeneratedScalarReference;
    expect(() => s.request.actual.lookupScalarSlot(forged)).toThrow(TypeError);
    expect(calls).toBe(0);
    expect(() => resolveSemanticType({...s.request.actual}, slot('R'))).toThrow(TypeError);
    s.request.budget.guard(() => s.request.budget.chargeWork(maxWork));
    expect(createSchemaScalarKernel(s.request.actual).describe(slot('R'), id('D'))).toMatchObject({kind: 'resource-limit'});
  });

  it('publishes stable immutable resolver facts independently of later caller selector mutation', async () => {
    const s = await setup();
    const missing = {kind: 'local' as const, target: id('Missing')};
    const missingResult = resolveSemanticType(s.request.actual, missing);
    expect(missingResult).toMatchObject({kind: 'missing', reference: {kind: 'local', target: id('Missing')}});
    missing.target = id('R');
    expect(missingResult).toMatchObject({kind: 'missing', reference: {kind: 'local', target: id('Missing')}});
    if (missingResult.kind !== 'missing') throw new Error('Expected absent type fact');
    expect(Object.isFrozen(missingResult.reference)).toBe(true);
    const reference = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}};
    const found = resolveSemanticType(s.request.actual, reference);
    reference.name.local = 'decimal';
    expect(found).toMatchObject({kind: 'builtin', name: {local: 'string'}, identity: {kind: 'builtin', name: {local: 'string'}}});
    const selected = {...slot('R')}, generated = resolveSemanticType(s.request.actual, selected);
    selected.owner = id('R2');
    expect(generated).toMatchObject({kind: 'original-generated', slot: slot('R'), identity: slot('R')});
  });

  it.each(['kind', 'owner', 'target', 'namespace', 'local'] as const)('does not execute a resolver selector %s accessor', async field => {
    const s = await setup(); let calls = 0;
    const getter = {enumerable: true, get() {calls++; return field === 'kind' ? 'local' : id('R');}};
    const reference = field === 'kind' ? Object.defineProperty({target: id('R')}, field, getter)
      : field === 'owner' ? Object.defineProperty({kind: 'original-generated'}, field, getter)
      : field === 'target' ? Object.defineProperty({kind: 'local'}, field, getter)
      : {kind: 'builtin', name: Object.defineProperty(field === 'namespace' ? {local: 'string'} : {namespace: 'http://www.w3.org/2001/XMLSchema'}, field, getter)};
    expect(() => resolveSemanticType(s.request.actual, reference as SemanticTypeReference)).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  it('uses a semantic identity key only as data, never as slot membership authority', async () => {
    const s = await setup();
    expect(typeof semanticTypeKey(s.request.actual, slot('Missing'))).toBe('string');
    expect(s.request.actual.lookupScalarSlot(slot('Missing'))).toMatchObject({kind: 'missing'});
    expect(() => semanticTypeKey({...s.request.actual}, slot('R'))).toThrow(TypeError);
    let calls = 0;
    const forged = Object.defineProperty({kind: 'original-generated'}, 'owner', {get() {calls++; return id('R');}}) as OriginalGeneratedScalarReference;
    expect(() => semanticTypeKey(s.request.actual, forged)).toThrow(TypeError);
    expect(calls).toBe(0);
  });

  // Independent ownership oracle: #267/6115262416. Issuance owns data, never
  // a membership or validity conclusion for the context that later consumes it.
  it('owns each mutable input anew while preserving earlier deeply immutable references', async () => {
    const s = await setup();
    const reference = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}};
    const first = s.request.actual.ownTypeReference(reference);
    expect(first).not.toBe(reference);
    expect(Object.isFrozen(first)).toBe(true);
    if (first.kind !== 'builtin') throw new Error('Expected owned builtin data');
    expect(Object.isFrozen(first.name)).toBe(true);
    reference.name.local = 'decimal';
    const second = s.request.actual.ownTypeReference(reference);
    expect(first.name.local).toBe('string');
    expect(second).toMatchObject({kind: 'builtin', name: {local: 'decimal'}});
    expect(s.request.actual.ownTypeReference(first)).toBe(first);
    expect(resolveSemanticType(s.request.actual, first)).toMatchObject({kind: 'builtin', name: {local: 'string'}});
    expect(resolveSemanticType(s.request.actual, second)).toMatchObject({kind: 'builtin', name: {local: 'decimal'}});
  });

  it('does not treat a caller-frozen outer reference as privately owned nested data', async () => {
    const s = await setup(), name = {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'};
    const reference = Object.freeze({kind: 'builtin' as const, name});
    const first = s.request.actual.ownTypeReference(reference);
    name.local = 'decimal';
    const second = s.request.actual.ownTypeReference(reference);
    expect(first).not.toBe(reference);
    expect(first).toMatchObject({kind: 'builtin', name: {local: 'string'}});
    expect(second).toMatchObject({kind: 'builtin', name: {local: 'decimal'}});
  });

  it('rejects frozen and mutable accessor references without invoking any getter', async () => {
    const s = await setup(); let calls = 0;
    for (const field of ['kind', 'owner', 'target', 'namespace', 'local'] as const) {
      const getter = {enumerable: true, get() {calls++; return field === 'kind' ? 'local' : id('R');}};
      const reference = field === 'kind' ? Object.defineProperty({target: id('R')}, field, getter)
        : field === 'owner' ? Object.defineProperty({kind: 'original-generated'}, field, getter)
        : field === 'target' ? Object.defineProperty({kind: 'local'}, field, getter)
        : {kind: 'builtin', name: Object.defineProperty(field === 'namespace' ? {local: 'string'} : {namespace: 'http://www.w3.org/2001/XMLSchema'}, field, getter)};
      expect(() => s.request.actual.ownTypeReference(reference as SemanticTypeReference)).toThrow(TypeError);
      Object.freeze(reference);
      expect(() => s.request.actual.ownTypeReference(reference as SemanticTypeReference)).toThrow(TypeError);
    }
    expect(calls).toBe(0);
  });

  it('does not admit a known canonical non-type symbol or cache a local target role', async () => {
    const s = await setup();
    const use = s.request.graph.nodes.find(node => node.kind === 'attributeUse');
    if (!use || use.kind !== 'attributeUse') throw new Error('Expected original attribute declaration reference');
    expect(use.declaration).toMatchObject({kind: 'symbol', role: 'attribute'});
    expect(() => s.request.actual.ownTypeReference(use.declaration)).toThrow(TypeError);
    const local = s.request.actual.ownTypeReference({kind: 'local', target: globalId('attribute', {namespace, local: 'q'})});
    expect(resolveSemanticType(s.request.actual, local)).toMatchObject({kind: 'wrong-role'});
  });

  it('rechecks issued slot references in each actual, sibling and nested membership', async () => {
    const s = await setup(), reference = s.request.actual.ownTypeReference(slot('R'));
    const included = s.request.candidate({key: 'owned-slot-included', active: s.request.actual.members});
    const omitted = s.request.candidate({key: 'owned-slot-omitted', active: s.request.actual.members,
      scalarSlots: s.request.actual.scalarSlots.filter(item => item.owner !== id('R'))});
    if (included.kind !== 'prepared' || omitted.kind !== 'prepared') throw new Error('Expected sibling slot memberships');
    const nested = forkSemanticCandidate(omitted.context, {key: 'owned-slot-nested', active: omitted.context.members});
    if (nested.kind !== 'prepared') throw new Error('Expected nested omitted slot context');
    for (const context of [s.request.actual, included.context, omitted.context, nested.context, included.context, s.request.actual]) {
      const owned = context.ownTypeReference(reference);
      expect(resolveSemanticType(context, owned)).toMatchObject({kind: context === omitted.context || context === nested.context ? 'outside-context' : 'original-generated'});
    }
    expect(() => resolveSemanticType({...included.context}, reference)).toThrow(TypeError);
  });

  it('charges successful owned-reference reuse and preserves sticky request exhaustion', async () => {
    const s = await setup(), reference = s.request.actual.ownTypeReference(slot('R')), lexical = s.lexical('x');
    const before = s.request.budget.usage().work;
    expect(s.request.actual.ownTypeReference(reference)).toBe(reference);
    expect(s.request.budget.usage().work).toBeGreaterThan(before);
    expect(createSchemaScalarKernel(s.request.actual).assess(reference, lexical, id('D'))).toMatchObject({kind: 'checked'});
    s.request.budget.guard(() => s.request.budget.chargeWork(maxWork));
    expect(s.request.budget.guard(() => s.request.actual.ownTypeReference(reference))).toBe(s.request.budget.failure());
    expect(createSchemaScalarKernel(s.request.actual).assess(reference, lexical, id('D'))).toBe(s.request.budget.failure());
  });

  it('keeps scalar results and lexical operands owned when privately owned references are reused', async () => {
    const s = await setup(), reference = s.request.actual.ownTypeReference(builtin('QName'));
    const lexical = {value: 'p:Item', context: {...s.simple('Empty').context, namespaces: {p: 'urn:original'}}};
    const kernel = createSchemaScalarKernel(s.request.actual), first = kernel.assess(reference, lexical, id('D'));
    expect(first).toMatchObject({kind: 'checked'});
    if (first.kind !== 'checked') throw new Error('Expected original QName operand');
    lexical.value = 'p:Other'; lexical.context.namespaces.p = 'urn:changed';
    expect(first.value.lexical).toMatchObject({value: 'p:Item', context: {namespaces: {p: 'urn:original'}}});
    expect(Object.isFrozen(first.value.lexical.context.namespaces)).toBe(true);
    const second = kernel.assess(reference, lexical, id('D'));
    expect(second).toMatchObject({kind: 'checked', value: {lexical: {value: 'p:Other', context: {namespaces: {p: 'urn:changed'}}}}});
    if (second.kind !== 'checked') throw new Error('Expected changed caller QName operand');
    expect(first.value.operand).not.toEqual(second.value.operand);
  });

  it.each(['assess', 'lookup', 'sourceNode'] as const)('rejects a malformed %s owner before reading its properties, including after exhaustion', async method => {
    const s = await setup(), kernel = createSchemaScalarKernel(s.request.actual), lexical = s.lexical('x'); let calls = 0;
    const owner = Object.defineProperty({}, 'length', {get() {calls++; return 1;}}) as string;
    const operation = () => method === 'assess' ? kernel.assess(builtin('string'), lexical, owner)
      : method === 'lookup' ? s.request.actual.lookup(owner) : s.request.actual.sourceNode(owner);
    expect(() => operation()).toThrow(TypeError);
    expect(calls).toBe(0);
    s.request.budget.guard(() => s.request.budget.chargeWork(maxWork));
    expect(s.request.budget.guard(operation)).toBe(s.request.budget.failure());
    expect(calls).toBe(0);
  });

  it('uses the slot in raw simple base, list item, ordered union and original typed facet operand positions', async () => {
    const s = await setup(), seed = s.simple('Empty');
    const names = ['Derived', 'List', 'Union', 'Typed'];
    const additions: SimpleTypeNode[] = names.map(name => ({...seed, id: id(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}}}));
    const raw = (name: string, base: SemanticTypeReference, variety: RawSimpleTypeProperties['variety'], facets: readonly RawScalarFacetLayer[]): RawSimpleTypeProperties => ({
      type: id(name), base, final: [], variety, facetLayers: facets, provenance: {kind: 'hypothetical-abstract', originals: []}});
    const min = {name: 'minLength', fixed: false, annotation: 'absent' as const, lexical: s.lexical('1')};
    const whitespace = {name: 'whiteSpace', fixed: true, annotation: 'absent' as const, lexical: s.lexical('collapse')};
    const prepared = s.request.candidate({key: 'all-simple-positions', active: [...s.request.actual.members, ...additions.map(node => node.id)], additions,
      rawSimpleTypes: [raw('Derived', slot('R'), {kind: 'atomic'}, [{facets: [min]}]),
        raw('List', builtin('anySimpleType'), {kind: 'list', item: slot('R')}, [{facets: [whitespace]}]),
        raw('Union', builtin('anySimpleType'), {kind: 'union', members: [slot('R'), builtin('decimal')]}, []),
        raw('Typed', slot('R'), {kind: 'atomic'}, [{facets: [min, {name: 'enumeration', fixed: false, annotation: 'absent', lexical: s.lexical('x'),
          operand: {type: slot('R'), owner: id('D'), context: 'original'}}]}])]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected typed structural candidate');
    const kernel = createSchemaScalarKernel(prepared.context);
    for (const [name, good, bad] of [['Derived', 'x', ''], ['List', 'x y', '\u0000'], ['Union', 'x', ''], ['Typed', 'x', 'y']] as const) {
      expect(kernel.assess(named(name), s.lexical(good), id(name))).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named(name), s.lexical(bad), id(name))).toMatchObject({kind: 'invalid-schema'});
    }
    // A list constructor alone has no minLength facet; zero items are allowed.
    expect(kernel.assess(named('List'), s.lexical(''), id('List'))).toMatchObject({kind: 'checked', obligations: []});
    const union = kernel.assess(named('Union'), s.lexical('1'), id('Union'));
    expect(union).toMatchObject({kind: 'checked', value: {operand: {family: 'string'}}});
  });

  it.each([['', 'candidate-rejected'], ['x', 'checked']] as const)('uses an explicit generated declaration type instead of a harmless canonical attribute placeholder: %j', async (value, expected) => {
    const s = await setup(), original = s.node(globalId('attribute', {namespace, local: 'q'}));
    if (original.kind !== 'attribute') throw new Error('Expected attribute seed');
    const attribute: AttributeNode = {...original, id: globalId('attribute', {namespace, local: 'FreshAttribute'}),
      identity: {kind: 'global', role: 'attribute', name: {namespace, local: 'FreshAttribute'}}, name: {namespace, local: 'FreshAttribute'},
      type: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}, value: {kind: 'fixed', lexical: s.lexical(value)}};
    const result = s.request.candidate({key: 'attribute-semantic-override', active: [...s.request.actual.members, attribute.id], additions: [attribute],
      rawAttributes: [{attribute: attribute.id, type: slot('R')}]});
    expect(result).toMatchObject({kind: 'prepared'}); if (result.kind !== 'prepared') throw new Error('Expected declaration candidate');
    const checked = checkComponentConstruction(result.context, attribute.id);
    expect(checked).toMatchObject({kind: expected});
    if (checked.kind === 'checked') expect(checked.typeDependencies).toEqual(expect.arrayContaining([{contextId: result.context.contextId, type: slot('R')}]));
  });

  it('admits the original slot as a raw complex simple base and content without consulting its canonical placeholder', async () => {
    const s = await setup(), b = s.complex('B');
    const fresh: ComplexTypeNode = {...b, id: id('FreshComplex'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshComplex'}}, attributes: [],
      derivation: {kind: 'extension', contentKind: 'simple', base: {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}}, facets: []}};
    const prepared = s.request.candidate({key: 'complex-simple-base', active: [...s.request.actual.members, fresh.id], additions: [fresh],
      rawTypes: [s.properties(fresh.id, slot('R'), 'extension', slot('R'))]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected raw semantic base');
    const result = checkComponentConstruction(prepared.context, fresh.id);
    expect(result).toMatchObject({kind: 'checked', obligations: []});
    if (result.kind !== 'checked') throw new Error('Expected simple-base extension construction');
    expect(result.typeDependencies).toEqual(expect.arrayContaining([{contextId: prepared.context.contextId, type: slot('R')}]));
    expect(result.re01).toBeUndefined();
  });

  it('keeps a generated scalar anonymous for EDC even when its source container is globally named', async () => {
    const s = await setup();
    const roots = ['PairA', 'PairB'].map(local => {
      const group = s.node(globalId('group', {namespace, local})); if (group.kind !== 'group' || !group.content) throw new Error('Expected source group'); return group.content;
    });
    const elements = s.request.actual.members.map(member => s.node(member)).filter(node => node.kind === 'element' && node.name?.local === 'shared');
    expect(elements).toHaveLength(2);
    expect(checkElementDeclarationsConsistent(s.request.actual, roots)).toMatchObject({kind: 'checked', value: true});
    const result = s.request.candidate({key: 'anonymous-slot-edc', active: s.request.actual.members,
      rawElements: elements.map(element => ({element: element.id, type: slot('R'), final: [], block: []}))});
    expect(result).toMatchObject({kind: 'prepared'}); if (result.kind !== 'prepared') throw new Error('Expected EDC candidate');
    expect(checkElementDeclarationsConsistent(result.context, roots)).toMatchObject({kind: 'checked', value: false});
  });

  it.each([['R', true], ['R2', false]] as const)('uses explicit slot declaration types for substitution affiliation: %s', async (memberType, expected) => {
    const s = await setup(), seed = s.node(globalId('element', {namespace, local: 'value'}));
    if (seed.kind !== 'element') throw new Error('Expected source declaration seed');
    const element = (local: string): ElementNode => ({...seed, id: globalId('element', {namespace, local}),
      identity: {kind: 'global', role: 'element', name: {namespace, local}}, name: {namespace, local}});
    const head = element('FreshHead'), member: ElementNode = {...element('FreshMember'), substitutionGroup: {kind: 'local', target: head.id}};
    const prepared = s.request.candidate({key: `slot-affiliation-${memberType}`, active: [...s.request.actual.members, head.id, member.id], additions: [head, member],
      rawElements: [{element: head.id, type: slot('R'), final: [], block: []}, {element: member.id, type: slot(memberType), final: [], block: []}]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected explicit element type overrides');
    const result = checkSubstitution(prepared.context, member.id, head.id, {mode: 'affiliation'});
    expect(result).toMatchObject({kind: 'checked', value: expected});
    if (result.kind !== 'checked') throw new Error('Expected local affiliation result');
    expect(result.typeDependencies).toEqual(expect.arrayContaining([{contextId: prepared.context.contextId, type: slot('R')}]));
  });

  it.each([['R', true, true], ['R2', false, true], ['U', false, false]] as const)
    ('uses semantic slot types for NameAndTypeOK while keeping recursive property equality distinct: %s', async (base, restriction, equal) => {
      const s = await setup();
      const elements = s.request.actual.members.map(member => s.node(member)).filter(node => node.kind === 'element' && node.name?.local === 'shared');
      expect(elements).toHaveLength(2);
      const groupA = globalId('group', {namespace, local: 'PairA'}), groupB = globalId('group', {namespace, local: 'PairB'});
      const belongsToA = (element: GraphNode): boolean => {
        let owner = s.request.actual.owner(element.id);
        while (owner && owner !== groupA && owner !== groupB) owner = s.request.actual.owner(owner);
        if (!owner) throw new Error('Expected original group-owned local declaration');
        return owner === groupA;
      };
      const prepared = s.request.candidate({key: `particle-slot-${base}`, active: s.request.actual.members,
        rawElements: elements.map(element => ({element: element.id, type: slot(belongsToA(element) ? 'R' : base), final: [], block: []}))});
      expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected particle type overrides');
      const context = prepared.context;
      const normalized = ['PairA', 'PairB'].map(local => {
        const content = deriveModelGroupContent(context, globalId('group', {namespace, local}));
        if (content.kind !== 'checked') throw new Error('Expected group content');
        const view = prepareSemanticParticleView(context, content.view, 'restriction');
        if (view.kind !== 'checked') throw new Error('Expected normalized group');
        return view.view;
      });
      const relation = checkParticleRestriction(context, normalized[0], normalized[1]);
      expect(relation).toMatchObject({kind: 'checked', value: restriction});
      if (relation.kind !== 'checked') throw new Error('Expected concrete slot relation');
      expect(relation.typeDependencies).toEqual(expect.arrayContaining([{contextId: context.contextId, type: slot('R')}]));
      const equality = compareComponentProperties(context, s.node(elements[0].id, context), s.node(elements[1].id, context));
      expect(equality).toMatchObject({kind: 'checked', value: equal});
      if (equality.kind !== 'checked') throw new Error('Expected recursive component property relation');
      expect(equality.typeDependencies).toEqual(expect.arrayContaining([{contextId: context.contextId, type: slot('R')}]));
    });

  it('accepts an original facet binding as component data while rejecting simultaneous independent layers', async () => {
    const s = await setup('original-generated-facets-independent.xsd');
    const raw: RawSimpleTypeProperties = {type: id('Annotated'), base: builtin('string'), final: [], variety: {kind: 'atomic'},
      facetBinding: {kind: 'original', type: named('Annotated')}, provenance: {kind: 'hypothetical-abstract', originals: [id('Annotated')]}};
    const prepared = s.request.candidate({key: 'exact-facet-component-binding', active: s.request.actual.members, rawSimpleTypes: [raw]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected facet binding');
    expect(createSchemaScalarKernel(prepared.context).assess(named('Annotated'), s.lexical('x'), id('Annotated'))).toMatchObject({kind: 'checked', obligations: []});
    expect(createSchemaScalarKernel(prepared.context).assess(named('Annotated'), s.lexical(''), id('Annotated'))).toMatchObject({kind: 'invalid-schema'});
    const candidate = s.candidate(slot('R'), s.request.actual.scalarSlots, [raw]);
    expect(checkCandidateCorrespondence(s.request.actual, s.request.actual, candidate, id('D'), id('E'),
      {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}})).toMatchObject({kind: 'checked', scalarObligations: []});
    expect(s.request.candidate({key: 'ambiguous-facet-data', active: s.request.actual.members,
      rawSimpleTypes: [{...raw, facetLayers: []} as unknown as RawSimpleTypeProperties]})).toMatchObject({kind: 'candidate-rejected', code: 'representation'});
  });

  it('preserves the adopted chameleon namespace in the generated component without assigning its source owner name', async () => {
    const s = await setup('original-generated-facets-independent.xsd');
    const result = createSchemaScalarKernel(s.request.actual).contentProperties(slot('ChameleonR'), id('D'));
    expect(result).toMatchObject({kind: 'checked', obligations: [], value: {targetNamespace: namespace, final: [], annotation: 'absent', generatedPolicy: 'GSC1'}});
    if (result.kind !== 'checked') throw new Error('Expected original scalar metadata');
    expect(result.value.name).toBeUndefined();
    expect(s.node(id('ChameleonR')).context.source.uri).toMatch(/original-generated-chameleon-independent\.xsd$/);
  });

  it('preserves a same original multioperand facet component without inventing its expression or annotation aggregation', async () => {
    const s = await setup('original-generated-facets-independent.xsd');
    const shared = {type: id('Multi'), base: builtin('string'), final: [], variety: {kind: 'atomic' as const},
      provenance: {kind: 'hypothetical-abstract' as const, originals: [id('Multi')]}};
    const bound = s.candidate(slot('R'), s.request.actual.scalarSlots, [{...shared, facetBinding: {kind: 'original', type: named('Multi')}}]);
    const ancestor = {kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}};
    expect(checkCandidateCorrespondence(s.request.actual, s.request.actual, bound, id('D'), id('E'), ancestor)).toMatchObject({kind: 'checked', scalarObligations: []});
    const independent = s.candidate(slot('R'), s.request.actual.scalarSlots, [{...shared, facetLayers: [{facets: ['a', 'b'].map(value => ({
      name: 'pattern', fixed: false, lexical: s.lexical(value)}))}]}]);
    expect(checkCandidateCorrespondence(s.request.actual, s.request.actual, independent, id('D'), id('E'), ancestor)).toMatchObject({kind: 'unresolved'});
  });

  it.each([['restriction', named('AnnotatedR'), 'equal'], ['extension-alias', named('AnnotatedD'), 'equal'],
    ['explicit-slot', slot('AnnotatedR'), 'equal'], ['independent-restriction', named('AnnotatedR2'), 'different']] as const)
    ('binds annotations by the original scalar identity selected through %s', async (_role, reference, annotationCorrespondence) => {
      const s = await setup('original-generated-facets-independent.xsd'), seed = s.simple('Empty');
      const fresh: SimpleTypeNode = {...seed, id: id('BoundAlias'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'BoundAlias'}}};
      const prepared = s.request.candidate({key: 'original-facet-alias', active: [...s.request.actual.members, fresh.id], additions: [fresh], rawSimpleTypes: [{
        type: fresh.id, base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetBinding: {kind: 'original', type: reference},
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
      expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected bound original facet data');
      const result = compareSchemaFacetProperties(s.request.actual, named('AnnotatedR'), id('AnnotatedR'), prepared.context, named('BoundAlias'), fresh.id);
      expect(result).toMatchObject({kind: 'checked', value: true, annotationCorrespondence,
        sourceFacetAnnotations: {left: 'present', right: 'present'}});
    });

  it('compares complete supplied annotation content with an original-generated scalar', async () => {
    const s=await setup('original-generated-facets-independent.xsd'),seed=s.simple('Empty');
    const fresh:SimpleTypeNode={...seed,id:id('ExactAlias'),identity:{kind:'global',role:'type',name:{namespace,local:'ExactAlias'}}};
    const namespaces={xml:'http://www.w3.org/XML/1998/namespace','':'',xs:'http://www.w3.org/2001/XMLSchema',
      t:namespace,p:'urn:recovery:bound-qname',q:'urn:recovery:bound-qname'};
    const payload={kind:'present' as const,content:{kind:'element' as const,
      name:{namespace:'http://www.w3.org/2001/XMLSchema',local:'annotation'},attributes:[],namespaces,
      children:[{kind:'element' as const,name:{namespace:'http://www.w3.org/2001/XMLSchema',local:'documentation'},
        attributes:[],namespaces,children:[{kind:'text' as const,value:'retained original facet'}]}]}};
    const prepared=s.request.candidate({key:'independent-generated-exact-annotation',active:[...s.request.actual.members,fresh.id],
      additions:[fresh],rawSimpleTypes:[{type:fresh.id,base:builtin('string'),final:[],variety:{kind:'atomic'},
        facetComponentSet:[{facets:[{name:'minLength',fixed:false,lexical:s.lexical('1')}],annotation:payload}],
        provenance:{kind:'hypothetical-abstract',originals:[]}}]});
    expect(prepared).toMatchObject({kind:'prepared'});if(prepared.kind!=='prepared')throw new Error('Expected exact alias');
    expect(compareSchemaFacetProperties(s.request.actual,slot('AnnotatedR'),id('D'),prepared.context,named('ExactAlias'),fresh.id))
      .toMatchObject({kind:'checked',value:true,annotationCorrespondence:'equal'});
  });

  it('retains original QName operands and namespace bindings through a facet-data binding', async () => {
    const s = await setup('original-generated-facets-independent.xsd');
    const prepared = s.request.candidate({key: 'bound-original-qname', active: s.request.actual.members, rawSimpleTypes: [{
      type: id('QNameValue'), base: builtin('QName'), final: [], variety: {kind: 'atomic'}, facetBinding: {kind: 'original', type: named('QNameValue')},
      provenance: {kind: 'hypothetical-abstract', originals: [id('QNameValue')]}}]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected QName data binding');
    const kernel = createSchemaScalarKernel(prepared.context), context = s.simple('QNameValue').context;
    expect(kernel.assess(named('QNameValue'), {value: 'q:Item', context}, id('QNameValue'))).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('QNameValue'), {value: 'q:Other', context}, id('QNameValue'))).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('QNameValue'), {value: 'q:Item', context: {...context, namespaces: {...context.namespaces, q: 'urn:wrong'}}}, id('QNameValue'))).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([['Name', 'α:β', '1bad'], ['NCName', 'αβ', 'α:β']] as const)
    ('preserves privately mapped intrinsic %s facets without widening the application regex profile', async (base, good, bad) => {
      const s = await setup(), seed = s.simple('Empty');
      const fresh: SimpleTypeNode = {...seed, id: id('BoundName'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'BoundName'}}};
      const prepared = s.request.candidate({key: `intrinsic-${base}`, active: [...s.request.actual.members, fresh.id], additions: [fresh], rawSimpleTypes: [{
        type: fresh.id, base: builtin(base), final: [], variety: {kind: 'atomic'}, facetBinding: {kind: 'original', type: builtin(base)},
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
      expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected intrinsic property binding');
      const kernel = createSchemaScalarKernel(prepared.context);
      expect(kernel.assess(named('BoundName'), s.lexical(good), fresh.id)).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named('BoundName'), s.lexical(bad), fresh.id)).toMatchObject({kind: 'invalid-schema'});
    });

  it('retains the application profile rejection for an independently supplied XML name regex', async () => {
    const s = await setup(), seed = s.simple('Empty');
    const fresh: SimpleTypeNode = {...seed, id: id('AppPattern'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'AppPattern'}}};
    const prepared = s.request.candidate({key: 'application-name-regex', active: [...s.request.actual.members, fresh.id], additions: [fresh], rawSimpleTypes: [{
      type: fresh.id, base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetLayers: [{facets: [{name: 'pattern', fixed: false, annotation: 'absent', lexical: s.lexical('\\i\\c*')}]}],
      provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected raw application pattern data');
    expect(createSchemaScalarKernel(prepared.context).assess(named('AppPattern'), s.lexical('αβ'), fresh.id)).toMatchObject({kind: 'unsupported-capability'});
  });

  it('treats an original facet binding as provenance data even when that source type is inactive', async () => {
    const s = await setup('original-generated-facets-independent.xsd'), seed = s.simple('Empty');
    const fresh: SimpleTypeNode = {...seed, id: id('BoundFresh'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'BoundFresh'}}};
    const prepared = s.request.candidate({key: 'inactive-binding-origin', active: [...s.request.actual.members.filter(member => member !== id('Annotated')), fresh.id], additions: [fresh],
      rawSimpleTypes: [{type: fresh.id, base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetBinding: {kind: 'original', type: named('Annotated')},
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected original data provenance binding');
    expect(prepared.context.lookup(id('Annotated'))).toMatchObject({kind: 'outside-context'});
    const kernel = createSchemaScalarKernel(prepared.context);
    expect(kernel.assess(named('BoundFresh'), s.lexical('x'), fresh.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(named('BoundFresh'), s.lexical(''), fresh.id)).toMatchObject({kind: 'invalid-schema'});
  });

  it('keeps original and active typed-slot operands separate when the candidate omits the active slot', async () => {
    const s = await setup(), seed = s.simple('Empty');
    const fresh: SimpleTypeNode = {...seed, id: id('TypedOriginal'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'TypedOriginal'}}};
    const raw = (context: 'original' | 'active'): RawSimpleTypeProperties => ({type: fresh.id, base: builtin('string'), final: [], variety: {kind: 'atomic'},
      facetLayers: [{facets: [{name: 'enumeration', fixed: false, annotation: 'absent', lexical: s.lexical('x'), operand: {type: slot('R'), owner: id('D'), context}}]}],
      provenance: {kind: 'hypothetical-abstract', originals: []}});
    const delta = {key: 'original-versus-active-slot', active: [...s.request.actual.members, fresh.id], additions: [fresh],
      scalarSlots: s.request.actual.scalarSlots.filter(item => item.owner !== id('R'))};
    const original = s.request.candidate({...delta, rawSimpleTypes: [raw('original')]});
    expect(original).toMatchObject({kind: 'prepared'}); if (original.kind !== 'prepared') throw new Error('Expected original typed operand');
    expect(original.context.lookupScalarSlot(slot('R'))).toMatchObject({kind: 'outside-context'});
    const assessed = createSchemaScalarKernel(original.context).assess(named('TypedOriginal'), s.lexical('x'), fresh.id);
    expect(assessed).toMatchObject({kind: 'checked', obligations: []});
    if (assessed.kind !== 'checked') throw new Error('Expected original operand without active slot lookup');
    expect(assessed.typeDependencies).toEqual(expect.arrayContaining([{contextId: s.request.actual.contextId, type: slot('R')}]));
    expect(s.request.candidate({...delta, rawSimpleTypes: [raw('active')]})).toMatchObject({kind: 'candidate-rejected', code: 'outside-context'});
  });

  it('rechecks slot legality in each sibling and nested context instead of transferring original or sibling success', async () => {
    const s = await setup('original-generated-facets-independent.xsd');
    expect(checkOriginalGeneratedScalar(s.request.actual, slot('DependentR'))).toMatchObject({kind: 'checked', obligations: []});
    const unchanged = s.request.candidate({key: 'unchanged-sibling', active: s.request.actual.members});
    const changed = s.request.candidate({key: 'changed-sibling', active: s.request.actual.members, rawSimpleTypes: [{type: id('NamedBase'), base: builtin('string'), final: [],
      variety: {kind: 'atomic'}, facetLayers: [{facets: [{name: 'minLength', fixed: false, annotation: 'absent', lexical: s.lexical('2')}]}],
      provenance: {kind: 'hypothetical-abstract', originals: [id('NamedBase')]}}]});
    expect(unchanged).toMatchObject({kind: 'prepared'}); expect(changed).toMatchObject({kind: 'prepared'});
    if (unchanged.kind !== 'prepared' || changed.kind !== 'prepared') throw new Error('Expected sibling structural contexts');
    expect(checkOriginalGeneratedScalar(unchanged.context, slot('DependentR'))).toMatchObject({kind: 'checked', obligations: []});
    expect(checkOriginalGeneratedScalar(changed.context, slot('DependentR'))).toMatchObject({kind: 'invalid-schema'});
    const child = forkSemanticCandidate(changed.context, {key: 'changed-child', active: changed.context.members});
    expect(child).toMatchObject({kind: 'prepared'}); if (child.kind !== 'prepared') throw new Error('Expected inherited raw base');
    expect(checkOriginalGeneratedScalar(child.context, slot('DependentR'))).toMatchObject({kind: 'invalid-schema'});
    expect(checkOriginalGeneratedScalar(unchanged.context, slot('DependentR'))).toMatchObject({kind: 'checked', obligations: []});
  });

  it.each(['ordinary-first', 'slot-first'] as const)('normalizes an ordinary unchanged source selector to the original zero-facet slot: %s', async order => {
    const s = await setup('original-generated-facets-independent.xsd');
    const changed = s.request.candidate({key: 'zero-source-selector', active: s.request.actual.members, rawSimpleTypes: [{type: id('NamedBase'), base: builtin('string'), final: [],
      variety: {kind: 'atomic'}, facetLayers: [{facets: [{name: 'minLength', fixed: false, annotation: 'absent', lexical: s.lexical('2')}]}],
      provenance: {kind: 'hypothetical-abstract', originals: [id('NamedBase')]}}]});
    expect(changed).toMatchObject({kind: 'prepared'}); if (changed.kind !== 'prepared') throw new Error('Expected changed active base');
    const kernel = createSchemaScalarKernel(changed.context);
    const operations = [() => kernel.describe(named('ZeroDependentR'), id('D')), () => checkOriginalGeneratedScalar(changed.context, slot('ZeroDependentR'))];
    if (order === 'slot-first') operations.reverse();
    for (const operation of operations) expect(operation()).toMatchObject({kind: 'invalid-schema'});
  });

  it('does not reserve a suppressed local slot, while a live local or global restriction remains an obligation', async () => {
    const s = await setup('original-generated-absent-independent.xsd');
    const anonymous = (elementName: string) => {
      const element = s.request.graph.nodes.find(node => node.kind === 'element' && node.name?.local === elementName);
      if (!element || element.kind !== 'element') throw new Error('Expected local declaration');
      const type = s.request.actual.resolve(element.type);
      if (type.kind !== 'found' || type.node.kind !== 'complexType') throw new Error('Expected anonymous complex source');
      return type.node;
    };
    const hidden = anonymous('hidden'), live = anonymous('live');
    expect(s.request.actual.lookupScalarSlot({kind: 'original-generated', owner: hidden.id})).toMatchObject({kind: 'missing'});
    expect(originalGeneratedShape(s.request.actual, {kind: 'original-generated', owner: hidden.id})).toMatchObject({kind: 'unresolved'});
    expect(resolveOriginalScalarIdentity(s.request.actual, {kind: 'local', target: hidden.id})).toMatchObject({kind: 'unresolved'});
    expect(s.request.actual.lookupScalarSlot({kind: 'original-generated', owner: live.id})).toMatchObject({kind: 'found'});
    expect(s.request.actual.lookupScalarSlot(slot('Global'))).toMatchObject({kind: 'found'});
    expect(checkComponentConstruction(s.request.actual, hidden.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(checkComponentConstruction(s.request.actual, live.id)).toMatchObject({kind: 'invalid-schema'});
    expect(checkComponentConstruction(s.request.actual, id('Global'))).toMatchObject({kind: 'invalid-schema'});
  });

  it('still rejects malformed source syntax in a subtree that reserves no generated scalar slot', async () => {
    const s = await setup('original-generated-absent-syntax-independent.xsd');
    expect(s.request.actual.scalarSlots).toEqual([]);
    expect(checkSchemaDocumentSyntax(s.request.actual)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([['hiddenScalar', 'original', 'candidate'], ['hiddenScalar', 'active', 'candidate'],
    ['visibleScalar', 'original', 'actual'], ['InvalidGlobal', 'original', 'actual']] as const)
    ('distinguishes absent source operand selection from intrinsic original invalidity: %s/%s', async (name, operandContext, origin) => {
      const s = await setup('original-generated-absent-operand-independent.xsd');
      let target = id(name);
      if (name !== 'InvalidGlobal') {
        const element = s.request.graph.nodes.find(node => node.kind === 'element' && node.name.local === name);
        if (!element || element.kind !== 'element') throw new Error('Expected source local element');
        const selected = s.request.actual.resolve(element.type);
        if (selected.kind !== 'found' || selected.node.kind !== 'simpleType') throw new Error('Expected source inline simple type');
        target = selected.node.id;
      }
      const originalConstruction = checkComponentConstruction(s.request.actual, target);
      expect(originalConstruction).toMatchObject(name === 'hiddenScalar' ? {kind: 'checked', scope: 'original-source-syntax-only', obligations: []} : {kind: 'invalid-schema'});
      const fresh: SimpleTypeNode = {...s.simple('Empty'), id: id('SelectedOperand'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'SelectedOperand'}}};
      const prepared = s.request.candidate({key: `absent-operand-${name}-${operandContext}`, active: [...s.request.actual.members, fresh.id], additions: [fresh], rawSimpleTypes: [{
        type: fresh.id, base: builtin('string'), final: [], variety: {kind: 'atomic'}, facetLayers: [{facets: [{name: 'enumeration', fixed: false, annotation: 'absent',
          lexical: s.lexical('xx'), operand: {type: {kind: 'local', target}, owner: id('D'), context: operandContext}}]}], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
      expect(prepared).toMatchObject({kind: 'prepared'}); if (prepared.kind !== 'prepared') throw new Error('Expected structural typed operand');
      const compared = compareSchemaFacetProperties(s.request.actual, named('Empty'), id('Empty'), prepared.context, named('SelectedOperand'), fresh.id);
      expect(compared).toMatchObject({kind: 'invalid-schema', side: 'right', contextId: origin === 'actual' ? s.request.actual.contextId : prepared.context.contextId});
      if (name === 'hiddenScalar') expect(compared).not.toMatchObject({rule: 'length-minLength-maxLength'});
      const construction = checkComponentConstruction(prepared.context, fresh.id);
      expect(construction).toMatchObject(origin === 'actual' ? {kind: 'invalid-schema', contextId: s.request.actual.contextId, component: target} : {kind: 'candidate-rejected'});
      if (name === 'hiddenScalar') expect(construction).not.toMatchObject({rule: 'length-minLength-maxLength'});
    });

  it('keeps source-only types structurally inspectable without publishing semantic type or relation receipts', async () => {
    const s = await setup('original-generated-absent-operand-independent.xsd');
    const hidden = s.request.graph.nodes.find(node => node.kind === 'simpleType' && s.request.actual.originalSourceComponentAbsent(node.id));
    if (!hidden) throw new Error('Expected hidden original simple type');
    const candidate = s.request.candidate({key: 'source-projection-roles', active: s.request.actual.members});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural context');
    const reference: SemanticTypeReference = {kind: 'local', target: hidden.id};
    for (const context of [s.request.actual, candidate.context]) {
      expect(context.lookup(hidden.id)).toMatchObject({kind: 'found'});
      expect(resolveSemanticType(context, reference)).toMatchObject({kind: 'wrong-role', component: hidden.id});
      expect(immediateTypeBase(context, reference)).toMatchObject({kind: 'unresolved', rule: 'src-resolve'});
      expect(checkTypeDerivation(context, reference, builtin('string'), [])).toMatchObject({kind: 'unresolved', rule: 'src-resolve'});
      expect(resolveSemanticType(context, named('InvalidGlobal'))).toMatchObject({kind: 'component', identity: {kind: 'component', id: id('InvalidGlobal')}});
    }
    expect(checkComponentConstruction(s.request.actual, hidden.id)).toMatchObject({kind: 'checked', scope: 'original-source-syntax-only'});
    expect(checkComponentConstruction(s.request.actual, id('InvalidGlobal'))).toMatchObject({kind: 'invalid-schema', rule: 'length-minLength-maxLength'});
  });

  it.each([false, true])('classifies an absent source raw property overlay as candidate-owned: overlay=%s', async overlay => {
    const s = await setup('original-generated-absent-operand-independent.xsd');
    const hidden = s.request.graph.nodes.find(node => node.kind === 'simpleType' && s.request.actual.originalSourceComponentAbsent(node.id));
    if (!hidden) throw new Error('Expected source-only simple type');
    const raw: RawSimpleTypeProperties = {type: hidden.id, targetNamespace: namespace, base: builtin('string'), final: [], variety: {kind: 'atomic'},
      facetLayers: [], provenance: {kind: 'hypothetical-abstract', originals: [hidden.id]}};
    const candidate = s.candidate(slot('R'), s.request.actual.scalarSlots, overlay ? [raw] : []);
    expect(checkComponentConstruction(s.request.actual, hidden.id)).toMatchObject({kind: 'checked', scope: 'original-source-syntax-only'});
    const result = checkCandidateCorrespondence(s.request.actual, s.request.actual, candidate, id('D'), id('E'), builtin('anySimpleType'));
    expect(result).toMatchObject(overlay ? {kind: 'candidate-rejected', rule: 'source-only-property-overlay', component: hidden.id}
      : {kind: 'checked', scalarObligations: []});
  });
});
