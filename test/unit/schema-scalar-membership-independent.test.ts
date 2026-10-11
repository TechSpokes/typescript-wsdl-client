import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawScalarFacetLayer, RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';

// Independently specified before implementation: #268 comments 6113274622,
// 6113774192. Search success requires exact reassessment and typed equality;
// failure to find a lexical witness is not a negative value-space proof.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalar-membership';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-membership-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected source request');
  const request = prepared.request, found = request.actual.lookup(id('Template'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected scalar template');
  const seed = found.node;
  const lexical = (value: string): LexicalValue => ({value, context: seed.context});
  const facet = (name: string, value: string, operandType?: Reference): ScalarFacet => ({name, lexical: lexical(value), fixed: false,
    ...(operandType ? {operand: {type: operandType, owner, context: 'original' as const}} : {})});
  const candidate = (base: Reference, facets: readonly ScalarFacet[], variety: RawSimpleTypeProperties['variety'] = {kind: 'atomic'}) => {
    const freshId = id('RawMember');
    const fresh: SimpleTypeNode = {...seed, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawMember'}}, variety: {kind: 'restriction', base, facets: []}};
    const facetLayers: readonly RawScalarFacetLayer[] = facets.map(value => ({facets: [value]}));
    const result = request.candidate({key: 'finite-membership', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base, final: [], variety, facetLayers, provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (result.kind !== 'prepared') throw new Error('Expected represented raw candidate');
    return {kernel: createSchemaScalarKernel(result.context), reference: named('RawMember')};
  };
  return {request, lexical, facet, candidate, actual: createSchemaScalarKernel(request.actual)};
}

describe('independent finite scalar membership and value exclusion', () => {
  it.each([
    ['PlusDecimal', '[+]1', 'decimal', '1', '+1'],
    ['ZeroDecimal', '01', 'decimal', '1', '01'],
    ['FractionDecimal', '1[.]0', 'decimal', '1', '1.0'],
    ['OneBoolean', '1', 'boolean', 'true', '1'],
    ['LowerHex', 'ff', 'hexBinary', 'FF', 'ff'],
    ['CompactBase64', '/w==', 'base64Binary', '/ w = =', '/w=='],
  ] as const)('reassesses a finite alias against %s with exact typed equality', async (base, pattern, type, original, witness) => {
    const {candidate, facet, actual, lexical} = await setup();
    expect(actual.assess(named(base), lexical(original), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(actual.equivalent(named(base), lexical(witness), builtin(type), lexical(original), owner)).toMatchObject({kind: 'checked', value: true});
    const raw = candidate(named(base), [facet('pattern', pattern), facet('enumeration', original, builtin(type))]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(raw.kernel.assess(raw.reference, lexical(witness), owner)).toMatchObject({kind: 'checked'});
  });

  it('uses finite witnesses for a new typed bound as well as enumeration members', async () => {
    const {request, candidate, facet} = await setup();
    const raw = candidate(named('PlusDecimal'), [facet('pattern', '[+]1'), facet('minInclusive', '1', builtin('decimal'))]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(raw.kernel.describe(raw.reference, owner)).toBe(request.budget.failure());
  });

  it('keeps the inherited exclusive-endpoint exception separate from ordinary membership', async () => {
    const {candidate, facet} = await setup();
    const retained = candidate(named('OverFive'), [facet('minExclusive', '5', builtin('decimal'))]);
    expect(retained.kernel.describe(retained.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    const newInclusive = candidate(named('OverFive'), [facet('minInclusive', '5', builtin('decimal'))]);
    expect(newInclusive.kernel.describe(newInclusive.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('closes the distant decimal spelling through the independently reviewed finite literal-language producer', async () => {
    // Generic producer oracle #268 6114185022; outside-fragment misses retain
    // debt in schema-pattern-witness-independent, without a negative verdict.
    const {candidate, facet, actual, lexical} = await setup();
    expect(actual.assess(named('DistantDecimal'), lexical('0000000001'), owner)).toMatchObject({kind: 'checked'});
    const raw = candidate(named('DistantDecimal'), [facet('pattern', '0000000001'), facet('enumeration', '1', builtin('decimal'))]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(raw.kernel.assess(raw.reference, lexical('0000000001'), owner))
      .toMatchObject({kind: 'checked', value: {operand: {family: 'decimal', canonical: '1'}}});
  });

  it.each([
    ['ThreeDigits', 'totalDigits', '3', 'decimal', '123.40'],
    ['ThreeDigits', 'totalDigits', '3', 'decimal', '+000123.400'],
    ['AtLeastTen', 'minInclusive', '10', 'decimal', '9'],
    ['AtLeastTen', 'minInclusive', '10', 'decimal', '+0009.000'],
    ['OneCharacter', 'length', '1', 'string', 'AB'],
    ['OneOctet', 'length', '1', 'hexBinary', 'FFFF'],
    ['DateLower', 'minInclusive', '2000-01-01T00:00:00', 'dateTime', '2000-01-01T00:00:00Z'],
  ] as const)('proves exact value exclusion for %s / %s', async (base, constraint, value, type, excluded) => {
    const {candidate, facet} = await setup();
    const raw = candidate(named(base), [facet(constraint, value), facet('enumeration', excluded, builtin(type))]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('counts list items rather than characters when proving exclusion', async () => {
    const {candidate, facet} = await setup();
    const raw = candidate(named('OneItem'), [facet('length', '1'), facet('enumeration', '1 2', named('DecimalList'))], {kind: 'list', item: builtin('decimal')});
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    ['OneCharacter', 'length', '1', 'string', '😀'],
    ['OneOctet', 'length', '1', 'hexBinary', 'FF'],
    ['QNameLength', 'length', '1', 'QName', 'p:LongName'],
    ['OneFractionDigit', 'fractionDigits', '1', 'decimal', '+000123.400'],
  ] as const)('uses datatype units and minimal decimal precision for %s', async (base, constraint, value, type, accepted) => {
    const {candidate, facet} = await setup();
    const raw = candidate(named(base), [facet(constraint, value), facet('enumeration', accepted, builtin(type))]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('does not promote one union member exclusion into a union exclusion', async () => {
    const {candidate, facet} = await setup();
    const raw = candidate(named('FallbackDecimal'), [facet('enumeration', '9', builtin('decimal'))],
      {kind: 'union', members: [named('AtLeastTen'), builtin('decimal')]});
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
  });

  it('keeps binary primitive value spaces disjoint even when the octets agree', async () => {
    const {candidate, facet} = await setup();
    const raw = candidate(named('LowerHex'), [facet('pattern', 'ff'), facet('enumeration', '/w==', builtin('base64Binary'))]);
    expect(raw.kernel.describe(raw.reference, owner)).toMatchObject({kind: 'invalid-schema'});
  });
});
