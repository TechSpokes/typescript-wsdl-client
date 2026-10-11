import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import type {AttributeResult, SourceAttributePlan} from '../../src/compiler/schemaAttributeUses.js';
import {checkActualSchemaSyntax} from '../../src/compiler/schemaSyntaxAssessment.js';

// Independent pre-implementation contract and source-role expectations:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/269#issuecomment-6111697365
// https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6111769287
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:attributes';
const named = (local: string, role: 'type' | 'attributeGroup' = 'type') => globalId(role, {namespace, local});

async function setup() {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/au-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(loaded)), {
    budget: createSemanticBudget({maxWork: 100_000_000}),
  });
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation: ${prepared.kind}`);
  return prepared.request;
}

function checked(result: AttributeResult): SourceAttributePlan {
  if (result.kind !== 'checked') throw new Error(`Expected checked original-AU plan: ${JSON.stringify(result)}`);
  expect(result.authority).toBe('AU01-C1-source-v1');
  expect(result.obligations).toEqual(['aggregate-type-validity', 'source-representation-syntax']);
  return result.value;
}

describe('independent original attribute source-role controls', () => {
  it('assesses a prohibited global reference but creates no scalar obligation for a prohibited local declaration', async () => {
    const request = await setup();
    const global = assessSourceAttributeUses(request.actual, named('ProhibitedGlobal'));
    expect(global).toMatchObject({kind: 'invalid-schema', component: globalId('attribute', {namespace, local: 'Broken'})});
    const local = checked(assessSourceAttributeUses(request.actual, named('ProhibitedLocal')));
    expect(local.uses).toEqual([]);
    expect(local.schemaOperands).toEqual([]);
    expect(local.declarations).toEqual([]);
    // The invalid original global remains in the prepared actual input; a local
    // source plan is not a blanket whole-schema certificate.
    expect(request.actual.lookup(globalId('attribute', {namespace, local: 'Broken'})).kind).toBe('found');
  });

  it('distinguishes one reused group AU from distinct source uses and distinct local declarations', async () => {
    const request = await setup();
    const group = checked(assessSourceAttributeUses(request.actual, named('Shared', 'attributeGroup')));
    const twice = checked(assessSourceAttributeUses(request.actual, named('SharedTwice')));
    expect(twice.uses).toHaveLength(1);
    expect(twice.uses[0].id).toBe(group.uses[0].id);
    expect(twice.uses[0].declaration.id).toBe(group.uses[0].declaration.id);
    expect(assessSourceAttributeUses(request.actual, named('Distinct', 'attributeGroup'))).toMatchObject({kind: 'invalid-schema', rule: 'ag-props-correct.2'});
    expect(assessSourceAttributeUses(request.actual, named('ConflictingLocal'))).toMatchObject({kind: 'invalid-schema', rule: 'ct-props-correct.4'});
  });

  it('retains optional conflicting defaults as a conflict plan without fabricating schema invalidity', async () => {
    const request = await setup();
    const plan = checked(assessSourceAttributeUses(request.actual, named('ConflictingDefaults')));
    expect(plan.uses).toHaveLength(2);
    expect(new Set(plan.uses.map(use => use.id)).size).toBe(2);
    expect(new Set(plan.uses.map(use => use.declaration.id)).size).toBe(1);
    expect(plan.attributes).toMatchObject([{required: false, fixed: [], absent: {kind: 'conflict'}}]);
    expect(plan.uses.map(use => use.effective?.value.operand.canonical)).toEqual(['1', '2']);
  });

  it('preserves an original QName lexical witness and namespace environment for one equal augmentation class', async () => {
    const request = await setup();
    const plan = checked(assessSourceAttributeUses(request.actual, named('QNameAliases')));
    expect(plan.uses).toHaveLength(2);
    expect(plan.uses.map(use => use.effective?.value.lexical.value)).toEqual(['a:Name', 'b:Name']);
    const absent = plan.attributes[0].absent;
    expect(absent.kind).toBe('augment');
    if (absent.kind !== 'augment') throw new Error('Expected one QName augmentation class');
    const witness = absent.witness.value;
    const [prefix] = witness.lexical.value.split(':');
    expect(witness.lexical.context.namespaces[prefix]).toBe('urn:attribute:value');
    expect(witness.operand).toMatchObject({family: 'QName', canonical: '["urn:attribute:value","Name"]'});
    const original = plan.uses.find(use => use.id === witness.owner);
    expect(original?.effective?.value.lexical).toEqual(witness.lexical);
    expect(witness.lexical.context.source).toEqual(original?.source.context.source);
  });

  it('distinguishes an inherited global default from an explicit required-use default', async () => {
    const request = await setup();
    const inherited = checked(assessSourceAttributeUses(request.actual, named('RequiredGlobalDefault')));
    expect(inherited.uses[0]).toMatchObject({required: true, declared: {kind: 'default', origin: 'declaration'}});
    expect(inherited.uses[0].own).toBeUndefined();
    expect(inherited.attributes[0].absent).toEqual({kind: 'required'});
    expect(assessSourceAttributeUses(request.actual, named('RequiredOwnDefault'))).toMatchObject({kind: 'invalid-schema', rule: 'src-attribute.2'});
  });

  it('retains removed source operands and refuses to apply actual source grammar to a candidate', async () => {
    const request = await setup();
    const removed = checked(assessSourceAttributeUses(request.actual, named('Removed')));
    expect(removed.uses).toEqual([]);
    expect(removed.schemaOperands).toHaveLength(1);
    expect(removed.schemaOperands[0].effective?.value.lexical.value).toBe('1');
    const candidate = request.candidate({key: 'same-records-hypothetical-role', active: request.actual.members});
    if (candidate.kind !== 'prepared') throw new Error('Expected candidate');
    expect(assessSourceAttributeUses(candidate.context, named('Removed'))).toMatchObject({kind: 'unresolved', rule: 'source-construction-role'});
    expect(checkActualSchemaSyntax(candidate.context, named('Removed'))).toMatchObject({kind: 'unresolved', rule: 'actual-source-only'});
  });

  it('does not return cached or partial plans after request exhaustion', async () => {
    const request = await setup();
    checked(assessSourceAttributeUses(request.actual, named('QNameAliases')));
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    const terminal = request.budget.failure();
    expect(assessSourceAttributeUses(request.actual, named('QNameAliases'))).toBe(terminal);
    expect(assessSourceAttributeUses(request.actual, named('ConflictingDefaults'))).toBe(terminal);
    expect(checkActualSchemaSyntax(request.actual, named('Removed'))).toBe(terminal);
  });
});
