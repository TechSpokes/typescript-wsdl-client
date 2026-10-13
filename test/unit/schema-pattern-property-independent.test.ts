import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';

// Independent preimplementation singleton property oracle: #268 6113053033.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:pattern-properties';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const owner = globalId('element', {namespace, local: 'Owner'});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-pattern-property-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected source request');
  const request = prepared.request;
  const seed = request.actual.lookup(id('AB'));
  if (seed.kind !== 'found' || seed.node.kind !== 'simpleType') throw new Error('Expected singleton pattern source type');
  return {request, seed: seed.node, kernel: createSchemaScalarKernel(request.actual)};
}

describe('independent singleton regular-expression component properties', () => {
  it('compares singleton expression properties rather than only accepted languages', async () => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(named('AB'), named('ABCopy'), owner)).toMatchObject({kind: 'checked', value: true});
    expect(kernel.facetPropertiesEquivalent(named('AB'), named('BA'), owner)).toMatchObject({kind: 'checked', value: false});
  });

  it.each([false, true])('requires an inherited singleton component independently of equivalent language (retained=%s)', async retained => {
    const {request, seed} = await setup();
    const freshId = id('RawPattern');
    const fresh: SimpleTypeNode = {...seed, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawPattern'}},
      variety: {kind: 'restriction', base: named('AB'), facets: []}};
    const candidate = request.candidate({key: 'inherited-pattern', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base: named('AB'), final: [], variety: {kind: 'atomic'},
        facetLayers: (retained ? ['a|b', '[ab]'] : ['[ab]']).map(value => ({facets: [{name: 'pattern', fixed: false,
          lexical: {value, context: seed.context}}]})), provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw pattern candidate');
    const kernel = createSchemaScalarKernel(candidate.context);
    const result = kernel.describe(named('RawPattern'), owner);
    if (!retained) expect(result).toMatchObject({kind: 'invalid-schema'});
    else {
      expect(result).toMatchObject({kind: 'checked', obligations: []});
      expect(kernel.assess(named('RawPattern'), {value: 'a', context: seed.context}, owner)).toMatchObject({kind: 'checked'});
      expect(kernel.assess(named('RawPattern'), {value: 'c', context: seed.context}, owner)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('compares reordered multi-child expressions using selected P1 construction', async () => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(named('MultiAB'), named('MultiBA'), owner)).toMatchObject({kind: 'checked', value: false});
  });

  it('compares identical independent operand sequences by their P1 expression', async () => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(named('MultiAB'), named('MultiABCopy'), owner)).toMatchObject({kind: 'checked', value: true});
  });

  it('preserves a privately issued inherited multi-pattern component without reconstructing its expression', async () => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(named('MultiAB'), named('MultiABChild'), owner)).toMatchObject({kind: 'checked', value: true});
  });
});
