import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {assertFiniteCandidateReceipt, assertFinitePrimitiveReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteCandidateReceipt, FiniteRe01EvidenceNode, FiniteRe01PrimitiveEvidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:primitive-affiliation';
const typeId = (local: string) => globalId('type', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
const primitive: FiniteRe01PrimitiveEvidence = {root: {kind: 'primitive-no-change'}, nodes: []};

async function setup(file = 'xsd/recovery/finite-proof-primitive-affiliation.xsd', maxWork = 100_000_000) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork})});
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  return prepared.request;
}

function construction(request: Awaited<ReturnType<typeof setup>>, targetName = 'D'): FiniteRe01EvidenceNode {
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(typeId(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const d = get('D'), target = get(targetName), eId = typeId('E');
  if (!d.content) throw new Error('D content');
  const e: ComplexTypeNode = {...d, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}},
    derivation: {kind: 'extension', contentKind: 'complex', base: local(typeId('A')), facets: []}};
  const properties = (type: string, base: Reference, method: 'extension' | 'restriction', particle?: string): RawComplexTypeProperties => ({
    type, derivation: {base, method}, abstract: false, final: [], block: [],
    content: particle ? {kind: 'element-only', particle} : {kind: 'empty'}, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: type === eId ? [] : [type]},
  });
  const candidate = request.candidate({key: `nonvacuous-${targetName}`, active: [...request.actual.members, eId], additions: [e],
    endpoint: {...target, derivation: {kind: 'restriction', contentKind: 'complex', base: local(eId), facets: []}},
    rawTypes: [properties(typeId('A'), anyType, 'restriction'),
      properties(eId, local(typeId('A')), 'extension', d.content),
      ...(targetName === 'D' ? [] : [properties(d.id, local(typeId('A')), 'extension', d.content)]),
      properties(target.id, local(eId), 'restriction', d.content)],
  });
  if (candidate.kind !== 'prepared') throw new Error(candidate.kind);
  return {id: 'root', parent: request.actual, context: candidate.context, target: target.id,
    intermediate: eId, ancestor: local(typeId('A')), premises: []};
}

describe('primitive RE01 root with consumed recursive affiliation', () => {
  it('has a valid primitive no-change proof although every added restriction step is forbidden', async () => {
    const request = await setup();
    expect(checkSchemaDocumentSyntax(request.actual)).toMatchObject({kind: 'checked'});
    // D's only extension is directly from A, which has immediate anyType base.
    // Its no-change final step creates no restriction edge, so H.final does
    // not exclude actual D -> A. Component recursion through M is permitted.
    for (const id of request.actual.members) expect(checkComponentConstruction(request.actual, id)).toMatchObject({kind: 'checked', obligations: []});
    expect(checkComponentConstruction(request.actual, typeId('D'))).toMatchObject({kind: 'checked',
      re01: {target: typeId('D'), ancestor: expect.objectContaining({target: typeId('A')}), primitive: true}});
    const result = verifyFiniteRe01Evidence(request.actual, typeId('D'), primitive);
    expect(result).toMatchObject({kind: 'checked-primitive', authority: 'RE01-finite-evidence-v1',
      scope: 'primitive-no-change-and-finite-evidence', target: typeId('D'), root: 'primitive-no-change', proof: [],
      actualPrimitiveNoChange: [typeId('D')], claims: {actualObligations: 'checked', primitiveTarget: 'checked',
        universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (result.kind !== 'checked-primitive') throw new Error(result.kind);
    expect(new Set(result.actualComponents.map(x => x.component))).toEqual(new Set(request.actual.members));
    expect(() => assertFinitePrimitiveReceipt(request.actual, result)).not.toThrow();
    expect(() => assertFinitePrimitiveReceipt(request.actual, {...result})).toThrow(/Unauthenticated/);
    expect(() => assertFiniteCandidateReceipt(request.actual, result as unknown as FiniteCandidateReceipt)).toThrow(/Unauthenticated/);
    const root = construction(request);
    // The sampled intermediate demonstrates the general first-edge obstacle:
    // every nonvacuous D' -> E -> A path includes restriction, which original
    // H.final excludes. Preserved D.content always consumes original M.
    expect(checkComponentConstruction(root.context, globalId('element', {namespace, local: 'M'})))
      .toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
    expect(verifyFiniteRe01Evidence(request.actual, typeId('D'), {root: 'root', nodes: [root]}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
  });

  it('still requires and checks finite evidence for every nonprimitive actual obligation', async () => {
    const request = await setup('xsd/recovery/finite-proof-primitive-obligations.xsd');
    expect(verifyFiniteRe01Evidence(request.actual, typeId('D'), primitive))
      .toMatchObject({kind: 'unresolved', rule: 'missing-actual-evidence', component: typeId('U')});
    const root = construction(request, 'U');
    const result = verifyFiniteRe01Evidence(request.actual, typeId('D'), {...primitive, nodes: [root]});
    expect(result).toMatchObject({kind: 'checked-primitive', claims: {actualObligations: 'checked'}});
    if (result.kind !== 'checked-primitive') throw new Error(result.kind);
    expect(result.proof.map(step => step.target)).toEqual([typeId('U')]);
    expect(result.actualPrimitiveNoChange).toContain(typeId('D'));
    expect(verifyFiniteRe01Evidence(request.actual, typeId('U'), primitive))
      .toMatchObject({kind: 'invalid-evidence', rule: 'primitive-no-change'});
  });

  it('preserves invalid actual input and immediate-final failures for primitive requests', async () => {
    const invalid = await setup('xsd/recovery/finite-proof-primitive-invalid-original.xsd');
    expect(verifyFiniteRe01Evidence(invalid.actual, typeId('D'), primitive)).toMatchObject({kind: 'invalid-schema',
      component: globalId('attribute', {namespace, local: 'Unused'})});
    const prohibited = await setup('xsd/re01/particle-final-extension-prohibited.xsd');
    expect(verifyFiniteRe01Evidence(prohibited.actual, globalId('type', {namespace: 'urn:re01-particle', local: 'E'}), primitive))
      .toMatchObject({kind: 'invalid-schema', rule: 'ct-props-correct.final'});
  });

  it('does not execute a primitive discriminator accessor or accept a nonextension target', async () => {
    const request = await setup();
    let invoked = false;
    const getter = {root: {get kind() {invoked = true; return 'primitive-no-change' as const;}}, nodes: []};
    expect(verifyFiniteRe01Evidence(request.actual, typeId('D'), getter)).toMatchObject({kind: 'invalid-evidence', rule: 'evidence-syntax'});
    expect(invoked).toBe(false);
    expect(verifyFiniteRe01Evidence(request.actual, typeId('A'), primitive)).toMatchObject({kind: 'invalid-evidence', rule: 'target-rule'});
  });

  it('charges the complete primitive result at an inclusive sticky request boundary', async () => {
    const run = async (maxWork = 100_000_000) => {
      const request = await setup(undefined, maxWork);
      return {request, result: verifyFiniteRe01Evidence(request.actual, typeId('D'), primitive)};
    };
    const baseline = await run();
    expect(baseline.result).toMatchObject({kind: 'checked-primitive'});
    const boundary = baseline.request.budget.usage().work;
    expect((await run(boundary)).result).toMatchObject({kind: 'checked-primitive'});
    const exhausted = await run(boundary - 1);
    expect(exhausted.result).toMatchObject({kind: 'resource-limit', limit: 'work'});
    expect(verifyFiniteRe01Evidence(exhausted.request.actual, typeId('D'), primitive)).toBe(exhausted.request.budget.failure());
  });
});
