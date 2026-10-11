import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawSimpleTypeProperties, ScalarFacet} from '../../src/compiler/schemaSimpleTypeProperties.js';

// Independent preimplementation oracle: #268 comment 6113773186.
// Structures 3.14.7 has primitive atomic facets EMPTY; Part 2 3.3 names
// Appendix A as the complete definitions of the derived built-in datatypes.
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalar-properties';
const id = (local: string) => globalId('type', {namespace, local});
const named = (local: string): Reference => ({kind: 'local', target: id(local)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const owner = globalId('element', {namespace, local: 'Owner'});
async function setup() {
  const input = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-properties-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
  const request = prepared.request;
  const found = request.actual.lookup(id('EmptyString'));
  if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected independent source type');
  const seed = found.node;
  const facet = (name: string, value: string, fixed = false): ScalarFacet => ({name, fixed, lexical: {value, context: seed.context}});
  const raw = (base: Reference, variety: RawSimpleTypeProperties['variety'], facets: readonly ScalarFacet[]) => {
    const freshId = id('RawProperties');
    const fresh: SimpleTypeNode = {...seed, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawProperties'}},
      variety: {kind: 'restriction', base, facets: []}};
    const candidate = request.candidate({key: 'raw-property-authority', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base, final: [], variety, facetLayers: [{facets}],
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw property view');
    return {kernel: createSchemaScalarKernel(candidate.context), reference: named('RawProperties')};
  };
  return {request, seed, facet, raw, kernel: createSchemaScalarKernel(request.actual)};
}

describe('independent exact intrinsic scalar facet properties', () => {
  it('does not extend application pattern support when fixed S4S gains XML name escapes', async () => {
    const {kernel, seed} = await setup();
    expect(kernel.assess(named('ApplicationNamePattern'), {value: 'validName', context: seed.context}, owner))
      .toMatchObject({kind: 'unsupported-capability'});
  });

  it('keeps application ENTITY context qualification separate from the DTD-free source owner', async () => {
    const {kernel, seed} = await setup();
    expect(kernel.assess(builtin('ENTITY'), {value: 'unparsedName', context: seed.context}, owner))
      .toMatchObject({kind: 'unresolved', rule: 'datatype:ENTITY'});
  });

  // Separate complete ur tableau, not an invented empty ordinary facet set:
  // Datatypes anySimpleType-component; independent oracle #268 6113950467.
  it('compares the same known simple ur-type property inventory identically', async () => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(builtin('anySimpleType'), builtin('anySimpleType'), owner))
      .toMatchObject({kind: 'checked', value: true});
  });

  it.each(['string', 'decimal', 'SourceList'] as const)('distinguishes absent ur facet applicability from ordinary %s facets', async ordinary => {
    const {kernel} = await setup();
    const reference = ordinary === 'SourceList' ? named(ordinary) : builtin(ordinary);
    expect(kernel.facetPropertiesEquivalent(builtin('anySimpleType'), reference, owner)).toMatchObject({kind: 'checked', value: false});
    expect(kernel.facetPropertiesEquivalent(reference, builtin('anySimpleType'), owner)).toMatchObject({kind: 'checked', value: false});
  });

  it.each([
    ['string', 'EmptyString', true], ['string', 'ExplicitPreserve', false],
    ['decimal', 'EmptyDecimal', true], ['decimal', 'ExplicitCollapse', false],
    ['normalizedString', 'NormalizedCopy', true], ['token', 'TokenCopy', true],
    ['integer', 'IntegerCopy', true], ['integer', 'IntegerWrongFixed', false],
    ['int', 'IntCopy', true], ['NMTOKENS', 'NmtokensCopy', true],
  ] as const)('compares builtin %s with mapped %s (equal=%s)', async (base, copy, equal) => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(builtin(base), named(copy), owner)).toMatchObject({kind: 'checked', value: equal});
  });

  it('keeps mandatory normalization separate from explicit facet presence', async () => {
    const {kernel, seed} = await setup();
    const lexical = {value: ' \t01\n ', context: seed.context};
    expect(kernel.equivalent(builtin('decimal'), lexical, named('ExplicitCollapse'), lexical, owner))
      .toMatchObject({kind: 'checked', value: true});
    expect(kernel.facetPropertiesEquivalent(builtin('decimal'), named('ExplicitCollapse'), owner))
      .toMatchObject({kind: 'checked', value: false});
  });

  it('retains Name and NCName distinct pattern components without merging type identities', async () => {
    const {kernel} = await setup();
    expect(kernel.facetPropertiesEquivalent(builtin('Name'), builtin('NCName'), owner)).toMatchObject({kind: 'checked', value: false});
    expect(kernel.facetPropertiesEquivalent(builtin('ID'), builtin('IDREF'), owner)).toMatchObject({kind: 'checked', value: true});
    const left = kernel.contentIdentity(builtin('ID'), owner), right = kernel.contentIdentity(builtin('IDREF'), owner);
    expect(left.kind).toBe('checked'); expect(right.kind).toBe('checked');
    if (left.kind !== 'checked' || right.kind !== 'checked') throw new Error('Expected distinct builtin identities');
    expect(left.value.definition).not.toBe(right.value.definition);
  });

  it.each([
    ['SourceList', 'ListImplicit', true], ['SourceList', 'ListTrue', true],
    ['SourceList', 'ListFalse', false], ['ListFalse', 'ListDefaultFalse', true],
  ] as const)('maps explicit list whitespace fixed metadata: %s / %s', async (a, b, equal) => {
    const {kernel, seed} = await setup();
    expect(kernel.facetPropertiesEquivalent(named(a), named(b), owner)).toMatchObject({kind: 'checked', value: equal});
    expect(kernel.assess(named(b), {value: '1\t2', context: seed.context}, owner)).toMatchObject({kind: 'checked'});
  });

  it('does not inject evaluator-only facets into a complete raw primitive-based tuple', async () => {
    const {request, seed} = await setup();
    const freshId = id('RawEmpty');
    const fresh: SimpleTypeNode = {...seed, id: freshId,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawEmpty'}},
      variety: {kind: 'restriction', base: builtin('string'), facets: []}};
    const candidate = request.candidate({key: 'raw-empty-facets', active: [...request.actual.members, freshId], additions: [fresh],
      rawSimpleTypes: [{type: freshId, base: builtin('string'), variety: {kind: 'atomic'}, final: [], facetLayers: [],
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw candidate');
    const kernel = createSchemaScalarKernel(candidate.context);
    expect(kernel.describe(named('RawEmpty'), owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.facetPropertiesEquivalent(named('RawEmpty'), builtin('string'), owner)).toMatchObject({kind: 'checked', value: true});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(kernel.facetPropertiesEquivalent(named('RawEmpty'), builtin('string'), owner)).toBe(request.budget.failure());
  });

  // Independent pre-code ordinary correction oracle: #268 comment 6113899093.
  it('assesses a raw tuple locally without silently supplying omitted int bounds, retaining its full correspondence debt', async () => {
    const {raw, facet, seed} = await setup();
    const supplied = raw(builtin('int'), {kind: 'atomic'}, [facet('pattern', String.raw`[\-+]?[0-9]+`)]);
    const description = supplied.kernel.describe(supplied.reference, owner);
    expect(description).toMatchObject({kind: 'checked', obligations: [expect.objectContaining({rule: 'raw-simple-facet-restriction-validity'})]});
    if (description.kind !== 'checked') throw new Error('Expected represented tuple with unresolved restriction authority');
    expect(supplied.kernel.assess(supplied.reference, {value: '2147483648', context: seed.context}, owner))
      .toMatchObject({kind: 'checked', value: {operand: {family: 'decimal', canonical: '2147483648'}}, obligations: description.obligations});
    expect(supplied.kernel.assess(supplied.reference, {value: '1.5', context: seed.context}, owner))
      .toMatchObject({kind: 'invalid-schema'});
  });

  it.each(['2147483647', '2147483648'] as const)('keeps raw supplied value clauses separate from restriction validity at maximum %s', async maximum => {
    const {raw, facet, seed} = await setup();
    const supplied = raw(builtin('int'), {kind: 'atomic'}, [
      facet('pattern', String.raw`[\-+]?[0-9]+`), facet('fractionDigits', '0', true),
      facet('minInclusive', '-2147483648'), facet('maxInclusive', maximum),
    ]);
    if (maximum === '2147483648') expect(supplied.kernel.describe(supplied.reference, owner)).toMatchObject({kind: 'invalid-schema'});
    else {
      expect(supplied.kernel.describe(supplied.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
      expect(supplied.kernel.assess(supplied.reference, {value: '2147483648', context: seed.context}, owner)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('distinguishes raw list-constructor fixed metadata from a later same-value restriction', async () => {
    const {raw, facet} = await setup();
    const constructor = raw(builtin('anySimpleType'), {kind: 'list', item: builtin('integer')}, [facet('whiteSpace', 'collapse', false)]);
    expect(constructor.kernel.describe(constructor.reference, owner)).toMatchObject({kind: 'invalid-schema'});
    const restriction = raw(named('SourceList'), {kind: 'list', item: builtin('integer')}, [facet('whiteSpace', 'collapse', false)]);
    expect(restriction.kernel.describe(restriction.reference, owner)).toMatchObject({kind: 'checked', obligations: []});
    expect(restriction.kernel.facetPropertiesEquivalent(restriction.reference, named('ListFalse'), owner)).toMatchObject({kind: 'checked', value: true});
  });
});
