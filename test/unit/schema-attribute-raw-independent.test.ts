import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {AttributeGroupNode, ComplexTypeNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assessRawAttributeUses, assessSourceAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';

// Independent raw/source discriminants authored before these tests:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/269#issuecomment-6111936970
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:raw-attributes';
const named = (local: string) => globalId('type', {namespace, local});
async function setup() {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/au-raw-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(loaded)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation: ${prepared.kind}`);
  return prepared.request;
}
function type(context: SemanticContext, local: string): ComplexTypeNode {
  const found = context.lookup(named(local));
  if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(`Missing literal fixture type ${local}`);
  return found.node;
}
function raw(context: SemanticContext, local: string, uses?: readonly string[]): RawComplexTypeProperties {
  const node = type(context, local);
  return {type: node.id, derivation: {method: node.derivation?.kind ?? 'restriction',
    base: node.derivation?.base ?? {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
  abstract: false, final: [], block: [], content: {kind: 'empty'}, attributeUses: uses ?? node.attributes,
  provenance: {kind: 'hypothetical-abstract', originals: [node.id]}};
}

describe('independent literal raw AU construction boundaries', () => {
  it.each(['alias', 'same-id', 'distinct-same-name', 'two-ids', 'prohibited', 'wrong-fixed'] as const)
    ('checks literal helper-group %s with group-specific set and scalar rules', async variant => {
      const request = await setup();
      const group = (name: string): AttributeGroupNode => {
        const found = request.actual.lookup(globalId('attributeGroup', {namespace, local: name}));
        if (found.kind !== 'found' || found.node.kind !== 'attributeGroup') throw new Error('Expected source group');
        return found.node;
      };
      const template = group('GoodGroup'), helperId = globalId('attributeGroup', {namespace, local: 'Helper'});
      const helper: AttributeGroupNode = {...template, id: helperId,
        identity: {kind: 'global', role: 'attributeGroup', name: {namespace, local: 'Helper'}}, attributes: []};
      const use = template.attributes[0];
      const uses = variant === 'same-id' ? [use, use] : variant === 'distinct-same-name'
        ? [type(request.actual, 'Seven').attributes[0], type(request.actual, 'AliasRestriction').attributes[0]]
        : variant === 'two-ids' ? group('TwoIds').attributes : variant === 'prohibited' ? group('ProhibitedGroup').attributes
        : variant === 'wrong-fixed' ? group('BadFixedGroup').attributes : [use];
      const candidate = request.candidate({key: variant, active: [...request.actual.members, helperId], additions: [helper],
        rawAttributeGroups: [{group: helperId, attributeUses: uses}]});
      if (candidate.kind !== 'prepared') throw new Error('Expected literal raw helper group');
      const result = assessRawAttributeUses(candidate.context, helperId);
      if (variant === 'alias' || variant === 'same-id') {
        expect(result).toMatchObject({kind: 'checked'});
        if (result.kind !== 'checked') throw new Error('Expected local group validity');
        expect(result.value.uses.map(item => item.id)).toEqual([use]);
        expect(result.value.uses[0].effective?.value.operand.canonical).toBe('7');
      } else expect(result).toMatchObject({kind: 'candidate-rejected',
        ...(variant === 'distinct-same-name' ? {rule: 'ag-props-correct.2'} : variant === 'two-ids' ? {rule: 'ag-props-correct.3'} : {})});
    });

  it('does not derive fresh raw group properties from source-looking contributions', async () => {
    const request = await setup(), template = request.actual.lookup(globalId('attributeGroup', {namespace, local: 'GoodGroup'}));
    if (template.kind !== 'found' || template.node.kind !== 'attributeGroup') throw new Error('Expected source group');
    const id = globalId('attributeGroup', {namespace, local: 'SourceLookingHelper'});
    const helper: AttributeGroupNode = {...template.node, id, identity: {kind: 'global', role: 'attributeGroup', name: {namespace, local: 'SourceLookingHelper'}}};
    const missing = request.candidate({key: 'missing-raw-group', active: [...request.actual.members, id], additions: [helper]});
    if (missing.kind !== 'prepared') throw new Error('Expected structural helper');
    expect(assessRawAttributeUses(missing.context, id)).toMatchObject({kind: 'unresolved'});
    const explicit = request.candidate({key: 'explicit-empty-raw-group', active: [...request.actual.members, id], additions: [helper],
      rawAttributeGroups: [{group: id, attributeUses: []}]});
    if (explicit.kind !== 'prepared') throw new Error('Expected empty literal group');
    const result = assessRawAttributeUses(explicit.context, id);
    expect(result).toMatchObject({kind: 'checked', value: {uses: []}});
    expect(() => assessRawAttributeUses({...explicit.context}, id)).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(assessRawAttributeUses(explicit.context, id)).toBe(request.budget.failure());
  });

  it('permits fixed7 to fixed8 extension through a distinct use with exact QName/type identity', async () => {
    const request = await setup();
    const base = raw(request.actual, 'Seven'), extension = raw(request.actual, 'Extension');
    expect(extension.attributeUses[0]).not.toBe(base.attributeUses[0]);
    const candidate = request.candidate({key: 'literal-extension', active: request.actual.members, rawTypes: [base, extension]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal candidate');
    const result = assessRawAttributeUses(candidate.context, extension.type);
    expect(result).toMatchObject({kind: 'checked', authority: 'AU01-C1-raw-v2',
      obligations: ['aggregate-type-validity', 'raw-type-property-correspondence']});
    if (result.kind !== 'checked') throw new Error('Expected local raw extension check');
    expect(result.value.uses.map(use => use.id)).toEqual(extension.attributeUses);
    expect(result.value.uses[0].effective?.value.operand.canonical).toBe('8');
  });

  it.each([
    ['AliasRestriction', 'Seven', 'checked'], ['BadRestriction', 'Seven', 'candidate-rejected'],
    ['OmitOptional', 'Seven', 'checked'], ['OmitRequired', 'RequiredSeven', 'candidate-rejected'],
    ['BadDouble', 'DoubleBase', 'candidate-rejected'], ['AliasDouble', 'AliasBase', 'checked'],
    ['AnonymousExtension', 'AnonymousBase', 'candidate-rejected'],
  ] as const)('checks literal %s using supplied final uses and exact type/value constraints', async (owner, base, expected) => {
    const request = await setup();
    const properties = [raw(request.actual, base), raw(request.actual, owner)];
    const candidate = request.candidate({key: owner, active: request.actual.members, rawTypes: properties});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal candidate');
    expect(assessRawAttributeUses(candidate.context, named(owner))).toMatchObject({kind: expected});
  });

  it('uses the selected existential raw matches without fabricating source inheritance roles', async () => {
    const request = await setup();
    const source = assessSourceAttributeUses(request.actual, named('VacuousDouble'));
    expect(source).toMatchObject({kind: 'checked'});
    const base = raw(request.actual, 'DoubleBase');
    const candidate = request.candidate({key: 'unproven-source-roles', active: request.actual.members,
      rawTypes: [base, raw(request.actual, 'VacuousDouble', base.attributeUses)]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal candidate');
    expect(assessRawAttributeUses(candidate.context, named('VacuousDouble'))).toMatchObject({kind: 'checked', authority: 'AU01-C1-raw-v2'});
  });

  it('separates abstract required/default properties from invalid explicit source grammar', async () => {
    const request = await setup();
    expect(assessSourceAttributeUses(request.actual, named('AbstractRequiredDefault'))).toMatchObject({kind: 'invalid-schema', rule: 'src-attribute.2'});
    const candidate = request.candidate({key: 'abstract-required-default', active: request.actual.members,
      rawTypes: [raw(request.actual, 'AbstractRequiredDefault')]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal candidate');
    expect(assessRawAttributeUses(candidate.context, named('AbstractRequiredDefault'))).toMatchObject({kind: 'checked'});
  });

  it('requires raw properties and refuses forged or exhausted request contexts', async () => {
    const request = await setup();
    expect(assessRawAttributeUses(request.actual, named('Seven'))).toMatchObject({kind: 'unresolved', rule: 'raw-type-properties'});
    expect(() => assessRawAttributeUses({...request.actual}, named('Seven'))).toThrow(/Unauthenticated/);
    const candidate = request.candidate({key: 'budget', active: request.actual.members, rawTypes: [raw(request.actual, 'Seven')]});
    if (candidate.kind !== 'prepared') throw new Error('Expected literal candidate');
    expect(assessRawAttributeUses(candidate.context, named('Seven'))).toMatchObject({kind: 'checked'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(assessRawAttributeUses(candidate.context, named('Seven'))).toBe(request.budget.failure());
  });
});
