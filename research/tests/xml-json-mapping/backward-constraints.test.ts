import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import type {ParticleNode} from '../../../src/compiler/canonicalGraph.js';
import {inspectActualSource, traceBackwardConstraints} from './backward-constraints.js';

const fixtures = path.resolve('test/conformance/fixtures');
async function source(relative: string) {
  const input = await loadSemanticSchemaInput(path.resolve(relative), {policy: {fileRoots: [fixtures, path.resolve('research/tests/xml-json-mapping')]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  return prepared.request.actual;
}
async function fixture(file: string) {return source(path.join(fixtures, file));}
const type = (namespace: string, local: string) => globalId('type', {namespace, local});

describe('backward source constraints remain grouped and contextual', () => {
  it('retains the complete choice cap, pair reference and local occurrence bounds', async () => {
    const context = await fixture('xsd/projection/ordered-particles.xsd');
    const result = traceBackwardConstraints(context, type('urn:ordered-particles', 'Choice'));
    const root = result.groups[0]!.root;
    expect(root.term.kind).toBe('sequence');
    if (root.term.kind !== 'sequence') throw new Error('sequence expected');
    const choice = context.lookup(root.term.children[1]!);
    if (choice.kind !== 'found' || choice.node.kind !== 'particle') throw new Error('choice missing');
    expect(choice.node).toMatchObject({occurs: {min: '1', max: '3'}, term: {kind: 'choice'}});
    if (choice.node.term.kind !== 'choice') throw new Error('choice expected');
    const pair = context.lookup(choice.node.term.children[1]!);
    if (pair.kind !== 'found') throw new Error('pair missing');
    expect(pair.node).toMatchObject({term: {kind: 'group', reference: {name: {local: 'Pair'}}}});
    const original = context.lookup(root.id);
    if (original.kind !== 'found') throw new Error('source missing');
    expect(root).toBe(original.node);
    expect(result.admission).toBe('not-established');
  });

  it('keeps restriction replacement while native attribute uses retain inheritance, types and defaults', async () => {
    const context = await source('research/tests/xml-json-mapping/derivation-chain.xsd');
    const result = traceBackwardConstraints(context, type('urn:backward', 'WithEmail'));
    expect(result.steps.map(step => step.definition.identity.kind === 'global' && step.definition.identity.name.local))
      .toEqual(['WithEmail', 'NoPhone', 'Customer']);
    expect(result.groups.map(group => group.owner.identity.kind === 'global' && group.owner.identity.name.local)).toEqual(['NoPhone', 'WithEmail']);
    if (result.attributes?.kind !== 'checked') throw new Error(result.attributes?.kind);
    expect(result.attributes.value.attributes.map(attribute => attribute.name.local).sort()).toEqual(['active', 'region']);
    const region = result.attributes.value.attributes.find(attribute => attribute.name.local === 'region')!;
    expect(region.absent.kind).toBe('augment');
    expect(region.uses[0]!.declaration.type).toMatchObject({name: {local: 'string'}});
  });

  it('distinguishes an empty required choice from an empty sequence without flattening either', async () => {
    const context = await fixture('xsd/recovery/restriction-nontransitivity.xsd');
    const emptyChoice = traceBackwardConstraints(context, type('urn:re01:restriction-transitivity', 'D'));
    expect(emptyChoice.groups[0]!.root).toMatchObject({occurs: {min: '1', max: '1'}, term: {kind: 'choice', children: []}});
    const own = await source('research/tests/xml-json-mapping/derivation-chain.xsd');
    expect(traceBackwardConstraints(own, type('urn:backward', 'Empty')).groups).toEqual([]);
    const emptySequence = traceBackwardConstraints(own, type('urn:backward', 'EmptySequence'));
    expect(emptySequence.groups[0]!.root).toMatchObject({term: {kind: 'sequence', children: []}});
    for (const [trace, current, nullable] of [[emptyChoice, context, false], [emptySequence, own, true]] as const) {
      if (trace.effective?.kind !== 'checked') throw new Error(trace.effective?.kind);
      const particles = prepareSemanticParticleView(current, trace.effective.view, 'declared');
      if (particles.kind !== 'checked') throw new Error(particles.kind);
      expect(particles.view.root.summary.nullable).toBe(nullable);
      expect(particles.view.root.summary.hasRealization).toBe(nullable);
    }
  });

  it('preserves raw all groups and recursive declaration targets without expanding recursive values', async () => {
    const context = await fixture('xsd/re01/endpoint-all-original.xsd');
    const result = traceBackwardConstraints(context, type('urn:re01:recursive-reflection', 'D'));
    expect(result.groups).toHaveLength(1);
    const all = result.groups[0]!.root;
    expect(all.term.kind).toBe('all');
    if (all.term.kind !== 'all') throw new Error('all expected');
    const child = context.lookup(all.term.children[0]!);
    if (child.kind !== 'found' || child.node.kind !== 'particle' || child.node.term.kind !== 'element') throw new Error('element expected');
    const declaration = context.resolve(child.node.term.declaration);
    if (declaration.kind !== 'found' || declaration.node.kind !== 'element') throw new Error('declaration expected');
    const recursive = context.resolve(declaration.node.type);
    if (recursive.kind !== 'found') throw new Error('type expected');
    expect(recursive.node).toBe(result.final);
    expect(result.steps).toHaveLength(3);
  });

  it('retains inherited scalar layers and union/list dependencies as source references', async () => {
    const context = await fixture('xsd/composition/derivations.xsd');
    const scalar = traceBackwardConstraints(context, type('urn:composition', 'ScalarRestricted'));
    expect(scalar.groups).toEqual([]);
    expect(scalar.steps.map(step => step.definition.identity.kind === 'global' && step.definition.identity.name.local))
      .toEqual(['ScalarRestricted', 'Scalar', 'Exact']);
    if (scalar.effective?.kind !== 'checked') throw new Error(scalar.effective?.kind);
    expect(scalar.effective.view.content.kind).toBe('simple');
    expect(scalar.steps[0]!.definition).toMatchObject({derivation: {facets: [{name: 'maxInclusive', lexical: {value: '10'}}]}});
    const union = traceBackwardConstraints(context, type('urn:composition', 'UnionContent'));
    expect(union.steps[1]!.definition).toMatchObject({kind: 'simpleType', variety: {kind: 'union', members: [
      {name: {local: 'List'}}, {name: {local: 'string'}},
    ]}});
  });

  it('preserves mixed text permission separately from repeated child-group bounds', async () => {
    const context = await fixture('xsd/re01/mixed-empty-prefix-original.xsd');
    const result = traceBackwardConstraints(context, type('urn:re01:mixed-empty', 'D'));
    expect(result.groups[0]!.root.occurs).toEqual({min: '17', max: '17'});
    if (result.effective?.kind !== 'checked') throw new Error(result.effective?.kind);
    expect(result.effective.view.content).toMatchObject({kind: 'mixed'});
  });

  it('reuses native wildcard combination and reports illegal restrictions separately from calculated groups', async () => {
    const context = await fixture('xsd/composition/derivations.xsd');
    const extended = traceBackwardConstraints(context, type('urn:composition', 'Extended'));
    if (extended.attributes?.kind !== 'checked') throw new Error(extended.attributes?.kind);
    expect(extended.attributes.value.wildcard).toMatchObject({namespace: {kind: 'set', namespaces: ['urn:external', 'urn:more']}, processContents: 'strict'});
    const invalid = await fixture('xsd/composition/required-prohibition.xsd');
    const result = traceBackwardConstraints(invalid, type('urn:composition', 'Derived'));
    expect(result.attributes?.kind).toBe('invalid-schema');
    expect(result.checks.some(check => check.result.kind === 'invalid-schema')).toBe(true);
    expect(result.admission).toBe('not-established');
  });

  it('keeps two uses of the same group separately capped instead of expanding or merging them', async () => {
    const context = await fixture('xsd/references/resolved.xsd');
    const result = traceBackwardConstraints(context, type('urn:references', 'Uses'));
    const root = result.groups[0]!.root;
    if (root.term.kind !== 'sequence') throw new Error('sequence expected');
    const uses = root.term.children.map(id => context.lookup(id)).flatMap(found => found.kind === 'found' && found.node.kind === 'particle'
      && found.node.term.kind === 'group' ? [found.node as ParticleNode] : []);
    expect(uses.map(use => use.occurs)).toEqual([{min: '0', max: '2'}, {min: '3', max: '4'}]);
    expect(uses[0]!.id).not.toBe(uses[1]!.id);
    expect(uses[0]!.term).toMatchObject({kind: 'group', reference: {name: {local: 'Pair'}}});
    expect(uses[1]!.term).toMatchObject({kind: 'group', reference: {name: {local: 'Pair'}}});
  });

  it('keeps substitution relationships in the unchanged source and inspects them beyond the base chain', async () => {
    const context = await fixture('xsd/re01/affiliation-actual.xsd');
    const trace = traceBackwardConstraints(context, type('urn:re01:independent-affiliation', 'D'));
    const report = inspectActualSource(context);
    const member = report.checks.find(check => check.definition.kind === 'element' && check.definition.name.local === 'M');
    expect(member?.definition).toMatchObject({substitutionGroup: {name: {local: 'H'}}});
    expect(member?.result.kind).toBe('checked');
    expect(trace.steps.map(step => step.definition.identity.kind === 'global' && step.definition.identity.name.local)).toEqual(['D', 'B', 'A']);
    expect(report.context).toBe(trace.context);
    expect(report.admission).toBe('not-established');
  });

  it('retains and checks an explicit prohibition against extending a base type', async () => {
    const context = await fixture('xsd/re01/particle-final-extension-prohibited.xsd');
    const trace = traceBackwardConstraints(context, type('urn:re01-particle', 'E'));
    expect(trace.steps[1]!.definition.declaredAttributes).toEqual(expect.arrayContaining([
      expect.objectContaining({name: {namespace: '', local: 'final'}, value: 'extension'}),
    ]));
    expect(trace.checks[0]!.result.kind).toBe('invalid-schema');
  });

  it('distinguishes identical child names through their containing declarations', async () => {
    const context = await fixture('xsd/projection/scoped-records.xsd');
    const child = (local: string) => {
      const trace = traceBackwardConstraints(context, type('urn:scoped-records', local));
      const sequence = trace.groups[0]!.root;
      if (sequence.term.kind !== 'sequence') throw new Error('sequence expected');
      const particle = context.lookup(sequence.term.children[0]!);
      if (particle.kind !== 'found' || particle.node.kind !== 'particle' || particle.node.term.kind !== 'element') throw new Error('element expected');
      const declaration = context.resolve(particle.node.term.declaration);
      if (declaration.kind !== 'found' || declaration.node.kind !== 'element') throw new Error('declaration expected');
      const childType = context.resolve(declaration.node.type);
      if (childType.kind !== 'found') throw new Error('child type expected');
      return {declaration: declaration.node, type: childType.node,
        trace: traceBackwardConstraints(context, childType.node.id)};
    };
    const left = child('Alpha'), right = child('Beta');
    expect(left.declaration.name).toEqual(right.declaration.name);
    expect(left.declaration.id).not.toBe(right.declaration.id);
    expect(left.type.id).not.toBe(right.type.id);
    expect(left.trace.final).toBe(left.type);
    expect(right.trace.final).toBe(right.type);
  });

  it('retains the builtin anyType boundary instead of equating an empty fragment list with empty content', async () => {
    const context = await fixture('xsd/composition/derivations.xsd');
    const trace = traceBackwardConstraints(context, type('urn:composition', 'OpaqueExtension'));
    expect(trace.groups).toEqual([]);
    expect(trace.terminal).toMatchObject({kind: 'builtin', name: {local: 'anyType'}});
    if (trace.effective?.kind !== 'checked') throw new Error(trace.effective?.kind);
    expect(trace.effective.view.content.kind).not.toBe('empty');
  });
});
