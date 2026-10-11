import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {LexicalValue, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {ScalarResult} from '../../src/compiler/schemaScalarKernel.js';

// Independently published before subject implementation, with values derived
// from the named primary/project contracts rather than scalar subject helpers:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/268#issuecomment-6111682659
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalars';
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: XSD_NAMESPACE, local}});
const named = (local: string): Reference => ({kind: 'local', target: globalId('type', {namespace, local})});

async function setup(file = 'scalar-primitives.xsd', sourceBound = false) {
  const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery', file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation, got ${prepared.kind}`);
  const request = prepared.request;
  const owner = globalId('type', {namespace, local: 'Owner'});
  const found = request.actual.lookup(owner);
  if (found.kind !== 'found') throw new Error('Missing owner');
  const source = found.node.context;
  const lexical = (value: string, bindings?: Readonly<Record<string, string>>): LexicalValue => ({
    value, context: bindings ? {...source, namespaces: bindings} : source,
  });
  return {request, owner, lexical, source, kernel: createSchemaScalarKernel(request.actual)};
}

function value<T>(result: ScalarResult<T>): T {
  if (result.kind !== 'checked') throw new Error(`Expected checked local operand, got ${JSON.stringify(result)}`);
  return result.value;
}

describe('independently specified schema scalar operands', () => {
  it('does not certify typed raw bound values outside the base value space', async () => {
    const {request, source, owner, kernel, lexical} = await setup('scalar-typed-bound-membership-independent.xsd');
    const original = request.actual.lookup(globalId('type', {namespace, local: 'ZeroOrTen'}));
    if (original.kind !== 'found' || original.node.kind !== 'simpleType') throw new Error('Expected original enumeration base');
    const seed = original.node;
    expect(kernel.assess(named('ZeroOrTen'), lexical('5'), owner))
      .toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
    const prepare = (base: string, facet: string, bound: string, copyEnumeration: boolean) => {
      const name = `RawBound-${base}-${facet}-${bound}`, id = globalId('type', {namespace, local: name});
      const fresh: SimpleTypeNode = {...seed, id,
        identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
        variety: {kind: 'restriction', base: named(base), facets: []}};
      const candidate = request.candidate({key: name, active: [...request.actual.members, id], additions: [fresh],
        rawSimpleTypes: [{type: id, base: named(base), final: [], variety: {kind: 'atomic'},
          facetLayers: [{facets: [
            ...(copyEnumeration ? ['0', '10'].map(value => ({name: 'enumeration', lexical: {value, context: source}, fixed: false})) : []),
            {name: facet, lexical: {value: bound, context: source}, fixed: false,
              operand: {type: builtin('int'), owner, context: 'original'}},
          ]}], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
      if (candidate.kind !== 'prepared') throw new Error('Expected structural raw bound context');
      return {id, context: candidate.context, result: createSchemaScalarKernel(candidate.context).describe({kind: 'local', target: id}, owner)};
    };
    // Abstract datatype bound property tableaux require membership in the
    // base value space. A privately assessed primitive value alone does not
    // establish that property, even when the inherited enum group is copied.
    for (const facet of ['minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive']) {
      // Complete base enumeration gives a finite value-space negative,
      // stronger than merely failing to find a lexical witness.
      expect(prepare('ZeroOrTen', facet, '5', true).result).toMatchObject({kind: 'invalid-schema'});
      const member = facet.startsWith('min') ? '0' : '10';
      const admitted = prepare('ZeroOrTen', facet, member, true);
      // Membership is established; the supplied tuple still omits the exact
      // inherited integer facet properties, so type correspondence stays open.
      expect(admitted.result).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
        expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: admitted.id}),
      ])});
    }
    // The exclusive bound property has the explicit same-kind inherited
    // endpoint exception; that endpoint need not be a member of the base.
    for (const [base, facet] of [['AboveFive', 'minExclusive'], ['BelowFive', 'maxExclusive']]) {
      expect(kernel.assess(named(base), lexical('5'), owner)).toMatchObject({kind: 'invalid-schema'});
      const admitted = prepare(base, facet, '5', false);
      expect(admitted.result).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
        expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: admitted.id}),
      ])});
    }
  });

  it('distinguishes facet component consistency from indeterminate value membership', async () => {
    const {kernel, owner, lexical} = await setup('scalar-facet-bounds-independent.xsd');
    // Datatypes component bodies minInclusive<=maxInclusive / minExclusive<=maxExclusive
    // prohibit >; mixed endpoint bodies prohibit >=. Incomparability satisfies
    // neither error predicate, though cvc facet membership requires an inequality.
    expect(value(kernel.compare(builtin('dateTime'), lexical('2000-01-01T00:00:00'),
      builtin('dateTime'), lexical('2000-01-01T00:00:00Z'), owner))).toBe('indeterminate');
    for (const name of ['InclusivePair', 'ExclusivePair', 'InclusiveExclusivePair', 'ExclusiveInclusivePair', 'DurationPair', 'EqualExclusivePair']) {
      expect(kernel.describe(named(name), owner)).toMatchObject({kind: 'checked', obligations: []});
    }
    expect(kernel.assess(named('LowerOnly'), lexical('2000-01-01T00:00:00'), owner)).toMatchObject({kind: 'checked'});
    expect(kernel.assess(named('LowerOnly'), lexical('2000-01-01T00:00:00Z'), owner))
      .toMatchObject({kind: 'invalid-schema', rule: 'cvc-minInclusive-valid'});
    expect(kernel.describe(named('InheritedOperandOutsideBase'), owner))
      .toMatchObject({kind: 'invalid-schema', rule: 'cvc-minInclusive-valid'});
    for (const name of ['CrossedPair', 'EqualMixedPair']) {
      expect(kernel.describe(named(name), owner)).toMatchObject({kind: 'invalid-schema', rule: 'facet-bound-order'});
    }
  });

  it('uses explicit effective raw facet layers conjunctively and cannot infer fresh source authority', async () => {
    const {request, source, lexical, owner} = await setup();
    const original = request.actual.lookup(globalId('type', {namespace, local: 'OnlyAB'}));
    if (original.kind !== 'found' || original.node.kind !== 'simpleType') throw new Error('Expected simple source template');
    const id = globalId('type', {namespace, local: 'RawIntersection'});
    const fresh: SimpleTypeNode = {...original.node, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawIntersection'}},
      variety: {kind: 'restriction', base: builtin('string'), facets: []}};
    const active = [...request.actual.members, id];
    const noProperties = request.candidate({key: 'fresh-source-label-only', active, additions: [fresh]});
    if (noProperties.kind !== 'prepared') throw new Error('Expected structurally represented fresh type');
    expect(createSchemaScalarKernel(noProperties.context).assess({kind: 'local', target: id}, lexical('B'), owner))
      .toMatchObject({kind: 'unresolved'});
    const enumeration = (literal: string) => ({name: 'enumeration', lexical: {value: literal, context: source}, fixed: false});
    const candidate = request.candidate({key: 'explicit-raw-layers', active, additions: [fresh], rawSimpleTypes: [{
      type: id, base: builtin('string'), final: [], variety: {kind: 'atomic'},
      facetLayers: [{facets: [enumeration('A'), enumeration('B')]}, {facets: [enumeration('B'), enumeration('C')]}],
      provenance: {kind: 'hypothetical-abstract', originals: []},
    }]});
    if (candidate.kind !== 'prepared') throw new Error('Expected explicit raw scalar properties');
    const kernel = createSchemaScalarKernel(candidate.context), ref: Reference = {kind: 'local', target: id};
    expect(value(kernel.assess(ref, lexical('B'), owner)).operand.canonical).toBe('B');
    for (const rejected of ['A', 'C']) expect(kernel.assess(ref, lexical(rejected), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('does not misread effective numeric facet conjunctions as sequential source restrictions', async () => {
    const {request, source, lexical, owner} = await setup();
    const original = request.actual.lookup(globalId('type', {namespace, local: 'MinThree'}));
    if (original.kind !== 'found' || original.node.kind !== 'simpleType') throw new Error('Expected minimum length base');
    const id = globalId('type', {namespace, local: 'RawMinIntersection'});
    const fresh: SimpleTypeNode = {...original.node, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawMinIntersection'}},
      variety: {kind: 'restriction', base: named('MinThree'), facets: []}};
    const candidate = request.candidate({key: 'explicit-effective-minimum', active: [...request.actual.members, id], additions: [fresh],
      rawSimpleTypes: [{type: id, base: named('MinThree'), final: [], variety: {kind: 'atomic'},
        facetLayers: ['0', '5'].map(literal => ({facets: [{name: 'minLength', lexical: {value: literal, context: source}, fixed: false}]})),
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected raw conjunction');
    const kernel = createSchemaScalarKernel(candidate.context), ref: Reference = {kind: 'local', target: id};
    const assessed = kernel.assess(ref, lexical('ABCDE'), owner);
    // The reviewed abstract normal form retains both operands but selects the
    // strongest comparable nonfixed effective minimum: max(0, 5) = 5 >= 3.
    expect(assessed).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(ref, lexical('AB'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('preserves original typed facet normalization and rejects a foreign primitive value space', async () => {
    const {request, source, lexical, owner} = await setup();
    const original = request.actual.lookup(globalId('type', {namespace, local: 'OnlyAB'}));
    if (original.kind !== 'found' || original.node.kind !== 'simpleType') throw new Error('Expected simple source template');
    for (const variant of ['typed-token', 'intrinsic-string', 'typed-boolean'] as const) {
      const id = globalId('type', {namespace, local: `Raw-${variant}`});
      const fresh: SimpleTypeNode = {...original.node, id,
        identity: {kind: 'global', role: 'type', name: {namespace, local: `Raw-${variant}`}},
        variety: {kind: 'restriction', base: builtin('string'), facets: []}};
      const candidate = request.candidate({key: variant, active: [...request.actual.members, id], additions: [fresh], rawSimpleTypes: [{
        type: id, base: builtin('string'), final: [], variety: {kind: 'atomic'},
        facetLayers: [{facets: [{name: 'enumeration', fixed: false,
          lexical: {value: variant === 'typed-boolean' ? 'true' : '\t a \t', context: source},
          ...(variant === 'intrinsic-string' ? {} : {operand: {type: builtin(variant === 'typed-token' ? 'token' : 'boolean'), owner, context: 'original' as const}}),
        }]}], provenance: {kind: 'hypothetical-abstract', originals: []},
      }]});
      if (candidate.kind !== 'prepared') throw new Error('Expected represented typed operand');
      const kernel = createSchemaScalarKernel(candidate.context), ref: Reference = {kind: 'local', target: id};
      if (variant === 'typed-boolean') {
        expect(kernel.assess(ref, lexical('true'), owner)).toMatchObject({kind: 'invalid-schema', rule: 'facet-value-type'});
      } else {
        const accepted = variant === 'typed-token' ? 'a' : '\t a \t';
        const rejected = variant === 'typed-token' ? '\t a \t' : 'a';
        expect(value(kernel.assess(ref, lexical(accepted), owner)).operand.canonical).toBe(accepted);
        expect(kernel.assess(ref, lexical(rejected), owner)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
      }
    }
  });

  it('enforces XML character value-space boundaries before accepting string operands', async () => {
    const {kernel, owner, lexical} = await setup();
    for (const invalid of ['\u0000', '\u000c', '\ud800', '\udc00', '\ufffe', '\uffff']) {
      expect(kernel.assess(builtin('string'), lexical(invalid), owner)).toMatchObject({kind: 'invalid-schema'});
    }
    for (const valid of ['\t\n\r', '\u{1f642}', '\u{10000}', '\u{10ffff}']) {
      expect(value(kernel.assess(builtin('string'), lexical(valid), owner)).operand.canonical).toBe(valid);
    }
  });

  it('compares exact decimal aliases and distinguishes adjacent integers beyond Number precision', async () => {
    const {kernel, owner, lexical} = await setup();
    expect(value(kernel.equivalent(builtin('decimal'), lexical('+01.00'), builtin('decimal'), lexical('1.0'), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('integer'), lexical('9007199254740992'), builtin('integer'), lexical('9007199254740993'), owner))).toBe(false);
    expect(value(kernel.compare(builtin('integer'), lexical('9007199254740992'), builtin('integer'), lexical('9007199254740993'), owner))).toBe('less');
    expect(kernel.assess(builtin('integer'), lexical('1.0'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(builtin('decimal'), lexical('1e2'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(value(kernel.equivalent(builtin('boolean'), lexical('true'), builtin('boolean'), lexical('1'), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('boolean'), lexical('false'), builtin('boolean'), lexical('1'), owner))).toBe(false);
  });

  it('uses XML whitespace and retains inherited facet constraints', async () => {
    const {kernel, owner, lexical} = await setup();
    const raw = ' \tA\n  B\r ';
    expect(value(kernel.assess(builtin('string'), lexical(raw), owner)).operand.canonical).toBe(raw);
    expect(value(kernel.assess(builtin('normalizedString'), lexical(raw), owner)).operand.canonical).toBe('  A   B  ');
    expect(value(kernel.assess(builtin('token'), lexical(raw), owner)).operand.canonical).toBe('A B');
    expect(value(kernel.assess(builtin('token'), lexical('\u00a0A\u00a0'), owner)).operand.canonical).toBe('\u00a0A\u00a0');
    expect(value(kernel.assess(named('OnlyAB'), lexical(raw), owner)).operand.canonical).toBe('A B');
    expect(kernel.assess(named('OnlyAB'), lexical('C'), owner)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
    expect(kernel.assess(named('ShortToken'), lexical('ABCD'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('resolves QName aliases in each original lexical namespace context', async () => {
    const {kernel, owner, lexical} = await setup();
    const allowed = {p: 'urn:scalar:allowed', q: 'urn:scalar:allowed'};
    expect(value(kernel.equivalent(builtin('QName'), lexical('p:Name', allowed), builtin('QName'), lexical('q:Name', allowed), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('QName'), lexical('p:Name', allowed), builtin('QName'), lexical('p:Name', {p: 'urn:scalar:other'}), owner))).toBe(false);
    expect(value(kernel.assess(named('QualifiedName'), lexical('p:Name', allowed), owner)).operand.family).toBe('QName');
    expect(kernel.assess(named('QualifiedName'), lexical('q:Name', {q: 'urn:scalar:other'}), owner)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-enumeration-valid'});
    expect(kernel.assess(builtin('QName'), lexical('missing:Name', {}), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('retains ordered union selection and typed list-item values', async () => {
    const {kernel, owner, lexical} = await setup();
    const boolean = value(kernel.assess(named('BooleanFirst'), lexical('1'), owner)).operand;
    const integer = value(kernel.assess(named('IntegerFirst'), lexical('1'), owner)).operand;
    expect(boolean).toMatchObject({family: 'boolean', canonical: 'true', selectedMembers: [builtin('boolean')]});
    expect(integer).toMatchObject({family: 'decimal', canonical: '1', selectedMembers: [builtin('integer')]});
    expect(value(kernel.equivalent(named('DecimalList'), lexical(' +01.0 \t2.00 '), named('DecimalList'), lexical('1 2'), owner))).toBe(true);
    expect(value(kernel.equivalent(named('DecimalList'), lexical('1 2'), named('DecimalList'), lexical('1'), owner))).toBe(false);
    expect(value(kernel.assess(named('DecimalList'), lexical('1 2'), owner)).operand.items).toMatchObject([
      {family: 'decimal', canonical: '1'}, {family: 'decimal', canonical: '2'},
    ]);
  });

  it('keeps disjoint binary primitive value spaces and ordered union member identity', async () => {
    const {kernel, owner, lexical} = await setup();
    expect(value(kernel.equivalent(builtin('hexBinary'), lexical('ab'), builtin('hexBinary'), lexical('AB'), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('base64Binary'), lexical('AA=='), builtin('base64Binary'), lexical(' A A = = '), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('hexBinary'), lexical('00'), builtin('base64Binary'), lexical('AA=='), owner))).toBe(false);
    const hex = value(kernel.assess(named('HexFirst'), lexical('0000'), owner)).operand;
    const base64 = value(kernel.assess(named('Base64First'), lexical('0000'), owner)).operand;
    expect(hex.family).toBe('hexBinary');
    expect(base64.family).toBe('base64Binary');
    expect(hex.selectedMembers).toMatchObject([builtin('hexBinary')]);
    expect(base64.selectedMembers).toMatchObject([builtin('base64Binary')]);
  });

  it('implements accepted DT01 A BCE boundaries, aliases and partial ordering', async () => {
    const {kernel, owner, lexical} = await setup();
    expect(kernel.assess(builtin('date'), lexical('-0004-02-29Z'), owner).kind).toBe('checked');
    expect(kernel.assess(builtin('date'), lexical('-0001-02-29Z'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(builtin('date'), lexical('0000-01-01Z'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(value(kernel.equivalent(builtin('dateTime'), lexical('-0001-12-31T24:00:00Z'), builtin('dateTime'), lexical('0001-01-01T00:00:00Z'), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('dateTime'), lexical('2000-12-31T23:59:60Z'), builtin('dateTime'), lexical('2001-01-01T00:00:00Z'), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('dateTime'), lexical('9007199254740993-01-01T00:00:00.000000000000000001+00:00'), builtin('dateTime'), lexical('9007199254740993-01-01T00:00:00.000000000000000001Z'), owner))).toBe(true);
    expect(value(kernel.equivalent(builtin('dateTime'), lexical('2001-01-01T00:00:00Z'), builtin('dateTime'), lexical('2001-01-01T00:00:00'), owner))).toBe(false);
    expect(value(kernel.compare(builtin('dateTime'), lexical('2001-01-01T00:00:00Z'), builtin('dateTime'), lexical('2001-01-01T00:00:00'), owner))).toBe('indeterminate');
    expect(value(kernel.equivalent(builtin('date'), lexical('2001-01-01Z'), builtin('dateTime'), lexical('2001-01-01T00:00:00Z'), owner))).toBe(false);
  });

  it('rejects forged contexts and preserves sticky exhaustion after a checked scalar', async () => {
    const {request, kernel, owner, lexical} = await setup();
    expect(() => createSchemaScalarKernel({...request.actual})).toThrow(/Unauthenticated/);
    expect(value(kernel.assess(builtin('boolean'), lexical('1'), owner)).operand.canonical).toBe('true');
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    const failure = request.budget.failure();
    expect(failure?.kind).toBe('resource-limit');
    expect(kernel.assess(builtin('boolean'), lexical('1'), owner)).toBe(failure);
    expect(kernel.equivalent(builtin('boolean'), lexical('true'), builtin('boolean'), lexical('1'), owner)).toBe(failure);
  });

  it('retains mixed-base content prerequisites through all local scalar APIs and cached child descriptors', async () => {
    const {kernel, owner, lexical} = await setup();
    const type = named('MixedScalar');
    const required = [{rule: 'simple-content-base-mixed-emptiable', component: globalId('type', {namespace, local: 'MixedBase'})}];
    const results = [
      kernel.describe(type, owner),
      kernel.assess(type, lexical('abc'), owner),
      kernel.checkValue(type, {kind: 'fixed', lexical: lexical('abc')}, owner),
      kernel.equivalent(type, lexical('abc'), builtin('string'), lexical('abc'), owner),
      kernel.compare(type, lexical('abc'), builtin('string'), lexical('abc'), owner),
      kernel.describe(named('MixedChild'), owner),
      kernel.assess(named('MixedChild'), lexical('ab'), owner),
    ];
    for (const result of results) expect(result).toMatchObject({kind: 'checked', obligations: required});
    expect(kernel.assess(type, lexical('abcd'), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('MixedChild'), lexical('abc'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('rejects incompatible inline restrictions and complex simple-type constructor operands', async () => {
    const {kernel, owner, lexical} = await setup();
    for (const name of ['IncompatibleInline', 'ComplexList', 'ComplexUnion', 'ComplexRestriction']) {
      expect(kernel.assess(named(name), lexical('1'), owner)).toMatchObject({kind: 'invalid-schema'});
    }
  });

  it('checks schema-only NOTATION enumeration and resolves absence in a complete source-bound domain', async () => {
    const {request, kernel, owner, lexical} = await setup();
    const alias = lexical('p:Picture', {p: namespace});
    expect(kernel.assess(named('PictureType'), alias, owner)).toMatchObject({kind: 'checked', value: {operand: {family: 'NOTATION'}}});
    expect(kernel.assess(named('PictureType'), lexical('p:Picture', {p: 'urn:other'}), owner)).toMatchObject({kind: 'invalid-schema'});
    expect(kernel.assess(named('UnboundedNotation'), alias, owner)).toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation'});
    expect(kernel.assess(builtin('NOTATION'), alias, owner)).toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation'});
    expect(kernel.checkValue(builtin('NOTATION'), {kind: 'fixed', lexical: alias}, owner)).toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation'});
    expect(kernel.assess(named('PictureType'), lexical('t:Missing'), owner)).toMatchObject({kind: 'invalid-schema'});
    const candidate = request.candidate({key: 'notation-original-facts', active: request.actual.members});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural full-membership candidate');
    const hypothetical = createSchemaScalarKernel(candidate.context);
    expect(hypothetical.assess(named('PictureType'), alias, owner)).toMatchObject({kind: 'checked'});
    expect(hypothetical.assess(named('PictureType'), lexical('t:Missing'), owner)).toMatchObject({kind: 'invalid-schema'});
  });
});
