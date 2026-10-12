import {describe, expect, it} from 'vitest';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {AttributeNode, AttributeUseNode, ComplexTypeNode, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {assessAttributeUse, assessRawAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import {originalSimpleSetup, builtin, named, id, local, namespace, diagnosticWork} from './helpers/original-simple-correspondence.js';

// Independent receiving boundary: original datatype formation failure differs
// from invalid candidate operand data/role, even when evaluation uses Gamma.
type Variant = 'invalid-original-type' | 'invalid-candidate-value' | 'invalid-candidate-role' | 'valid';
async function setup(variant: Variant) {
  const s = await originalSimpleSetup('cross-context-facets-independent.xsd');
  const b = s.complex('B'), sourceUse = s.node(b.attributes[0]!);
  if (sourceUse.kind !== 'attributeUse') throw new Error('Expected independent source attribute use');
  const resolved = s.request.actual.resolve(sourceUse.declaration);
  if (resolved.kind !== 'found' || resolved.node.kind !== 'attribute') throw new Error('Expected original declaration');
  const sourceDeclaration = resolved.node;
  const type: SimpleTypeNode = {...s.seed, id: id('FreshScalar'),
    identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshScalar'}},
    variety: {kind: 'restriction', base: builtin('string'), facets: []}};
  const declarationId = globalId('attribute', {namespace, local: 'FreshAttribute'}), containerId = id('FreshContainer');
  const useId = scopedId(containerId, 'attribute[1]', 'attributeUse');
  const declaration: AttributeNode = {...sourceDeclaration, id: declarationId,
    identity: {kind: 'global', role: 'attribute', name: {namespace, local: 'FreshAttribute'}},
    name: {namespace, local: 'FreshAttribute'}, type: local(type.id)};
  const use: AttributeUseNode = {...sourceUse, id: useId,
    identity: {kind: 'scoped', owner: containerId, path: 'attribute[1]', role: 'attributeUse'}, declaration: local(declarationId),
    use: 'optional', value: {kind: 'fixed', lexical: {value: 'x', context: s.seed.context}}};
  const container: ComplexTypeNode = {...b, id: containerId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshContainer'}},
    attributes: [useId], derivation: {kind: 'restriction', contentKind: 'complex', base: builtin('anyType'), facets: []}};
  const operandType = variant === 'invalid-original-type' ? named('Bad') : variant === 'invalid-candidate-role' ? builtin('anyType') : named('MinOne');
  const operandOwner = variant === 'invalid-original-type' ? id('Bad') : id('MinOne');
  const facet = {...s.facet('enumeration', variant === 'invalid-candidate-value' ? '' : 'x'),
    operand: {type: operandType, owner: operandOwner, context: 'original' as const}};
  const additions = [type, declaration, use, container];
  const candidate = s.request.candidate({key: variant, active: [...s.request.actual.members, ...additions.map(node => node.id)], additions,
    rawSimpleTypes: [s.raw('FreshScalar', [facet], {provenance: {kind: 'hypothetical-abstract', originals: []}})],
    rawTypes: [{type: containerId, derivation: {method: 'restriction', base: builtin('anyType')}, abstract: false, final: [], block: [],
      content: {kind: 'empty'}, attributeUses: [useId], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
  if (candidate.kind !== 'prepared') throw new Error(`Expected structural AU candidate: ${JSON.stringify(candidate)}`);
  return {...s, context: candidate.context, useId, containerId};
}

describe('independent AU scalar prerequisite ownership', () => {
  it.each(['standalone-first', 'container-first'] as const)('preserves intrinsic original datatype failure through both AU paths: %s', async order => {
    const s = await setup('invalid-original-type');
    const operations = [() => assessAttributeUse(s.context, s.useId), () => assessRawAttributeUses(s.context, s.containerId)];
    if (order === 'container-first') operations.reverse();
    for (const operation of [...operations, ...operations]) {
      const result = operation();
      expect(result).toMatchObject({kind: 'invalid-schema', contextId: s.request.actual.contextId, component: id('Bad')});
      if (result.kind !== 'invalid-schema') throw new Error('Expected intrinsic original failure');
      expect(result.source?.uri).toMatch(/cross-context-facets-independent\.xsd$/);
    }
  });

  it.each(['invalid-candidate-value', 'invalid-candidate-role'] as const)('keeps %s owned by the candidate', async variant => {
    const s = await setup(variant);
    expect(assessAttributeUse(s.context, s.useId)).toMatchObject({kind: 'candidate-rejected'});
    expect(assessRawAttributeUses(s.context, s.containerId)).toMatchObject({kind: 'candidate-rejected'});
  });

  it('preserves successful typed constraints across both cache paths and sticky exhaustion', async () => {
    const s = await setup('valid');
    const standalone = assessAttributeUse(s.context, s.useId), container = assessRawAttributeUses(s.context, s.containerId);
    expect(standalone).toMatchObject({kind: 'checked', scalarObligations: []});
    expect(container).toMatchObject({kind: 'checked', scalarObligations: []});
    if (standalone.kind !== 'checked' || container.kind !== 'checked') throw new Error('Expected valid typed attribute constraint');
    expect(container.value.uses[0]?.effective).toEqual(standalone.value.uses[0]?.effective);
    expect(assessAttributeUse(s.context, s.useId)).toEqual(standalone);
    s.request.budget.guard(() => s.request.budget.chargeWork(diagnosticWork));
    expect(assessAttributeUse(s.context, s.useId)).toMatchObject({kind: 'resource-limit'});
    expect(assessRawAttributeUses(s.context, s.containerId)).toMatchObject({kind: 'resource-limit'});
  });
});
