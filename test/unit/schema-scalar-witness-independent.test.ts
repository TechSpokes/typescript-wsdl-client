import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawScalarFacetLayer, RawSimpleTypeProperties} from '../../src/compiler/schemaSimpleTypeProperties.js';

// Independent finite candidate oracle, before producer implementation:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/268#issuecomment-6113016892
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:finite-scalar-witness';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-finite-witness-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
  const request = prepared.request;
  const found = request.actual.lookup(id('IntegerTemplate'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected independent scalar template');
  const seed = found.node;
  const lexical = (value: string): LexicalValue => ({value, context: seed.context});
  const candidate = (base: Reference, variety: RawSimpleTypeProperties['variety'], facetLayers: readonly RawScalarFacetLayer[]) => {
    const freshId = id('RawWitness');
    const fresh: SimpleTypeNode = {...seed, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawWitness'}},
      variety: {kind: 'restriction', base, facets: []}};
    const result = request.candidate({key: 'finite-witness', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base, variety, final: [], facetLayers,
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (result.kind !== 'prepared') throw new Error('Expected structural raw candidate: ' + JSON.stringify(result));
    return {context: result.context, kernel: createSchemaScalarKernel(result.context), reference: named('RawWitness')};
  };
  return {request, seed, lexical, candidate};
}

describe('independent finite lexical membership witnesses', () => {
  it('finds a decimal list spelling that avoids an earlier boolean union member and checks the exact typed value', async () => {
    const {request, lexical, candidate} = await setup();
    const actual = createSchemaScalarKernel(request.actual);
    expect(actual.assess(named('BaseList'), lexical('1 2'), owner)).toMatchObject({kind: 'checked', value: {operand: {items: [
      {family: 'boolean', canonical: 'true'}, {family: 'decimal', canonical: '2'},
    ]}}});
    expect(actual.equivalent(named('BaseList'), lexical('1 2'), named('DecimalList'), lexical('1 2'), owner))
      .toMatchObject({kind: 'checked', value: false});
    expect(actual.equivalent(named('BaseList'), lexical('+1 2'), named('DecimalList'), lexical('1 2'), owner))
      .toMatchObject({kind: 'checked', value: true});
    const raw = candidate(named('BaseList'), {kind: 'list', item: named('BooleanFirst')}, [{facets: [{
      name: 'enumeration', lexical: lexical('1 2'), fixed: false,
      operand: {type: named('DecimalList'), owner, context: 'original'},
    }]}]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(raw.kernel.assess(raw.reference, lexical('+1 2'), owner)).toMatchObject({kind: 'checked', value: {operand: {items: [
      {family: 'decimal', canonical: '1'}, {family: 'decimal', canonical: '2'},
    ]}}});
    expect(raw.kernel.assess(raw.reference, lexical('1 2'), owner)).toMatchObject({kind: 'invalid-schema'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(raw.kernel.describe(raw.reference, owner)).toBe(request.budget.failure());
  });

  it.each(['same-namespace', 'missing-alias', 'wrong-namespace'] as const)
    ('uses only existing exact QName namespace bindings: %s', async variant => {
      const {seed, lexical, candidate} = await setup();
      const namespaces = {...seed.context.namespaces};
      if (variant === 'missing-alias') delete namespaces.q;
      if (variant === 'wrong-namespace') namespaces.q = 'urn:different-name';
      const operand: LexicalValue = {value: 'p:Name', context: {...seed.context, namespaces}};
      const raw = candidate(named('QNamePattern'), {kind: 'atomic'}, [
        {facets: [{name: 'pattern', lexical: lexical('q:Name'), fixed: false}]},
        {facets: [{name: 'enumeration', lexical: operand, fixed: false,
          operand: {type: builtin('QName'), owner, context: 'original'}}]},
      ]);
      const description = raw.kernel.describe(raw.reference, owner);
      expect(description.kind).toBe('checked');
      if (description.kind !== 'checked') throw new Error('Expected represented raw plan');
      if (variant === 'same-namespace') {
        expect(description.obligations).toEqual([]);
        expect(raw.kernel.assess(raw.reference, lexical('q:Name'), owner)).toMatchObject({kind: 'checked', value: {operand: {
          family: 'QName', canonical: '["urn:shared-name","Name"]',
        }}});
      } else {
        expect(description.obligations).toEqual(expect.arrayContaining([expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'})]));
      }
    });

  it('never discharges primitive-disjoint membership because a boolean and integer share lexical spelling', async () => {
    const {lexical, candidate} = await setup();
    const raw = candidate(builtin('int'), {kind: 'atomic'}, [{facets: [{name: 'enumeration', lexical: lexical('1'), fixed: false,
      operand: {type: builtin('boolean'), owner, context: 'original'}}]}]);
    const description = raw.kernel.describe(raw.reference, owner);
    expect(description.kind).toBe('invalid-schema');
  });
});
