import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {GraphNode, Reference, ComplexTypeNode, ElementNode} from '../../src/compiler/canonicalGraph.js';
import {XSD_NAMESPACE} from '../../src/loader/orderedSyntax.js';
import {prepareResolvedCompilationInput} from '../../src/compiler/semanticCatalog.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkTypeDerivation, checkImmediateTypeFinal, checkSubstitution, effectiveSubstitutionMembers} from '../../src/compiler/schemaTypeRelations.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {checkDeclaration} from '../../src/compiler/schemaDeclarationPrimitives.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../src/compiler/schemaSimpleTypeProperties.js';
import type {RawElementProperties} from '../../src/compiler/schemaElementProperties.js';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';

const root = path.resolve('test/conformance/fixtures/xsd/graph');
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: XSD_NAMESPACE, local}});
const local = (target: string): Reference => ({kind: 'local', target});
async function fixture() {
  const input = await prepareResolvedCompilationInput({kind: 'source', source: path.join(root, 'shared-recursive.xsd')}, {loading: {policy: {fileRoots: [root]}}});
  if (input.kind !== 'semantic') throw Error('semantic fixture required'); return input;
}
async function context() {
  const input = await fixture(), prepared = prepareSemanticRequest(input.resolved, {budget: createSemanticBudget({maxWork: 50_000_000})});
  if (prepared.kind !== 'prepared') throw Error(prepared.kind); return prepared.request;
}
function type(seed: GraphNode, name: string, base?: Reference, method: 'restriction' | 'extension' = 'restriction', properties: Record<string, string> = {}): ComplexTypeNode {
  const identity = {kind: 'global', role: 'type', name: {namespace: 'urn:relations', local: name}} as const;
  return {...seed, kind: 'complexType', id: globalId(identity.role, identity.name), identity, mixed: false, abstract: false, attributes: [], content: undefined,
    declaredAttributes: Object.entries(properties).map(([local, value]) => ({name: {namespace: '', local}, lexicalName: local, value})),
    derivation: base ? {kind: method, contentKind: 'complex', base, facets: []} : undefined};
}
function element(seed: GraphNode, name: string, type: Reference, head?: string, properties: Record<string, string> = {}): ElementNode {
  const identity = {kind: 'global', role: 'element', name: {namespace: 'urn:relations', local: name}} as const;
  return {...seed, kind: 'element', id: globalId(identity.role, identity.name), identity, name: identity.name, type, nillable: false, abstract: false, value: undefined,
    substitutionGroup: head ? local(head) : undefined, declaredAttributes: Object.entries(properties).map(([local, value]) => ({name: {namespace: '', local}, lexicalName: local, value}))};
}
const checked = (c: SemanticContext, d: Reference, b: Reference, excluded: ('restriction' | 'extension')[] = []) => checkTypeDerivation(c, d, b, excluded);
// Fixture properties are supplied explicitly to the abstract component API.
const flags = (node: GraphNode, property: string): string[] => node.declaredAttributes.find(a => a.name.local === property)?.value.split(' ') ?? [];
const rawType = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, derivation: {base: node.derivation?.base ?? builtin('anyType'), method: node.derivation?.kind ?? 'restriction'}, abstract: node.abstract,
  final: flags(node, 'final') as RawComplexTypeProperties['final'], block: flags(node, 'block') as RawComplexTypeProperties['block'], content: {kind: 'empty'}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
const rawElement = (node: ElementNode): RawElementProperties => ({element: node.id, final: flags(node, 'final') as RawElementProperties['final'], block: flags(node, 'block') as RawElementProperties['block']});

describe('shared local XSD type and declaration relations', () => {
  it('covers every builtin family and complete independently specified ancestry chains', async () => {
    const {actual} = await context();
    const chains = [
      ['byte', 'short', 'int', 'long', 'integer', 'decimal', 'anySimpleType', 'anyType'],
      ['unsignedByte', 'unsignedShort', 'unsignedInt', 'unsignedLong', 'nonNegativeInteger', 'integer', 'decimal'],
      ['positiveInteger', 'nonNegativeInteger', 'integer'], ['negativeInteger', 'nonPositiveInteger', 'integer'],
      ['ID', 'NCName', 'Name', 'token', 'normalizedString', 'string'], ['IDREF', 'NCName'], ['ENTITY', 'NCName'],
      ['language', 'token'], ['NMTOKEN', 'token'],
    ];
    for (const chain of chains) for (let i = 0; i < chain.length - 1; i++) {
      expect(checked(actual, builtin(chain[i]), builtin(chain[i + 1]))).toMatchObject({kind: 'checked', value: true});
      expect(checked(actual, builtin(chain[i + 1]), builtin(chain[i]))).toMatchObject({kind: 'checked', value: false});
    }
    for (const name of ['boolean', 'float', 'double', 'duration', 'dateTime', 'time', 'date', 'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI', 'QName', 'NOTATION', 'NMTOKENS', 'IDREFS', 'ENTITIES']) {
      expect(checked(actual, builtin(name), builtin('anySimpleType'))).toMatchObject({kind: 'checked', value: true});
      expect(checked(actual, builtin(name), builtin(name), ['restriction', 'extension'])).toMatchObject({kind: 'checked', value: true});
    }
    expect(checked(actual, builtin('NMTOKENS'), builtin('NMTOKEN'))).toMatchObject({kind: 'checked', value: false});
    expect(checked(actual, builtin('int'), builtin('long'), ['restriction'])).toMatchObject({kind: 'checked', value: false});
    const first = checked(actual, builtin('int'), builtin('decimal'));
    checked(actual, builtin('NOTATION'), builtin('anyType'));
    const repeated = checked(actual, builtin('int'), builtin('decimal'));
    expect(repeated).toEqual(first);
    if (repeated.kind === 'checked') expect(repeated.dependencies).not.toContain('builtin:NOTATION');
  });

  it('separates type identity, immediate final, excluded methods and accumulated blocks', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const base = type(seed, 'Base', undefined, 'restriction', {final: 'extension'});
    const derived = type(seed, 'Derived', local(base.id), 'extension');
    const copy = type(seed, 'Copy');
    const blocker = type(seed, 'Blocker', local(derived.id), 'restriction', {block: 'extension'});
    const leaf = type(seed, 'Leaf', local(blocker.id), 'extension');
    const head = element(seed, 'Head', local(base.id), undefined, {block: 'substitution'});
    const member = element(seed, 'Member', local(derived.id), head.id);
    const head2 = element(seed, 'Head2', local(base.id));
    const member2 = element(seed, 'Member2', local(leaf.id), head2.id);
    const additions = [base, derived, copy, blocker, leaf, head, member, head2, member2];
    const candidate = request.candidate({key: 'relations', active: [...request.actual.members, ...additions.map(x => x.id)], additions,
      rawTypes: [base, derived, copy, blocker, leaf].map(rawType), rawElements: [head, member, head2, member2].map(rawElement)});
    if (candidate.kind !== 'prepared') throw Error(candidate.kind); const c = candidate.context;
    expect(checked(c, local(derived.id), local(base.id))).toMatchObject({kind: 'checked', value: true});
    expect(checkImmediateTypeFinal(c, local(derived.id))).toMatchObject({kind: 'checked', value: false});
    expect(checked(c, local(derived.id), local(base.id), ['extension'])).toMatchObject({kind: 'checked', value: false});
    expect(checked(c, local(copy.id), local(base.id))).toMatchObject({kind: 'checked', value: false});
    expect(checkSubstitution(c, member.id, head.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
    expect(checkSubstitution(c, member.id, head.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: false});
    expect(checkSubstitution(c, member2.id, head2.id, {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: false});
    expect(effectiveSubstitutionMembers(c, head.id)).toMatchObject({kind: 'checked', value: [head.id]});
    expect(checkDeclaration(c, member.id)).toMatchObject({kind: 'checked', obligations: ['declared-type-component-validity']});
  });

  it('does not transfer Type Derivation OK across contexts that retain IDs but change a base edge', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const base = type(seed, 'TransferBase');
    const derived = type(seed, 'TransferDerived', local(base.id), 'extension');
    const rebased = type(seed, 'TransferDerived', builtin('anyType'), 'restriction');
    const active = [...request.actual.members, base.id, derived.id];
    const first = request.candidate({key: 'transfer-first', active, additions: [base, derived], rawTypes: [base, derived].map(rawType)});
    const second = request.candidate({key: 'transfer-rebased', active, additions: [base, rebased], rawTypes: [base, rebased].map(rawType)});
    if (first.kind !== 'prepared' || second.kind !== 'prepared') throw new Error('Expected two authentic sibling contexts');
    const original = checked(first.context, local(derived.id), local(base.id));
    const changed = checked(second.context, local(derived.id), local(base.id));
    expect(original).toMatchObject({kind: 'checked', value: true});
    expect(changed).toMatchObject({kind: 'checked', value: false});
    if (original.kind !== 'checked' || changed.kind !== 'checked') throw new Error('Expected local relation receipts');
    expect(original.contextId).not.toBe(changed.contextId);
    expect(original.dependencies).toContain(derived.id);
    expect(original.dependencies).toContain(base.id);
    expect(changed.dependencies).toContain(derived.id);
    expect(changed.dependencies).toContain(base.id);
  });

  it('checks list/union formation final separately from restriction-based ancestry', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const restricted = (name: string, base: Reference, final = ''): SimpleTypeNode => {
      const identity = {kind: 'global', role: 'type', name: {namespace: 'urn:relations', local: name}} as const;
      return {...seed, kind: 'simpleType', identity, id: globalId(identity.role, identity.name),
        declaredAttributes: final ? [{name: {namespace: '', local: 'final'}, lexicalName: 'final', value: final}] : [],
        variety: {kind: 'restriction', base, facets: []}};
    };
    const item = restricted('Item', builtin('integer'), 'list');
    const list = {...restricted('List', builtin('integer')), variety: {kind: 'list', item: local(item.id)}} as SimpleTypeNode;
    const union = {...restricted('Union', builtin('integer')), variety: {kind: 'union', members: [builtin('boolean'), builtin('integer')]}} as SimpleTypeNode;
    const child = restricted('Child', local(union.id));
    const properties = (node: SimpleTypeNode, base: Reference, variety: RawSimpleTypeProperties['variety']): RawSimpleTypeProperties => ({type: node.id, base, variety, final: flags(node, 'final') as RawSimpleTypeProperties['final'], facetLayers: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
    const additions = [item, list, union, child], candidate = request.candidate({key: 'simple', active: [...request.actual.members, ...additions.map(x => x.id)], additions,
      rawSimpleTypes: [properties(item, builtin('integer'), {kind: 'atomic'}), properties(list, builtin('anySimpleType'), {kind: 'list', item: local(item.id)}), properties(union, builtin('anySimpleType'), {kind: 'union', members: [builtin('boolean'), builtin('integer')]}), properties(child, local(union.id), {kind: 'union', members: [builtin('boolean'), builtin('integer')]})]});
    if (candidate.kind !== 'prepared') throw Error(candidate.kind); const c = candidate.context;
    expect(checkImmediateTypeFinal(c, local(list.id))).toMatchObject({kind: 'checked', value: false});
    expect(checked(c, local(list.id), builtin('anySimpleType'))).toMatchObject({kind: 'checked', value: true});
    expect(checked(c, builtin('int'), local(union.id))).toMatchObject({kind: 'checked', value: true});
    expect(checked(c, builtin('string'), local(union.id))).toMatchObject({kind: 'checked', value: false});
    expect(checked(c, local(child.id), local(union.id))).toMatchObject({kind: 'checked', value: true});
    expect(checkDeclaration(c, 'missing')).toMatchObject({kind: 'unresolved', rule: 'declaration-operand', component: 'missing'});
    expect(createSchemaScalarKernel(c).describe(builtin('string'), 'missing')).toMatchObject({kind: 'unresolved', component: 'missing'});
    const declaration = request.graph.nodes.find((n): n is ElementNode => n.kind === 'element')!;
    expect(checkSubstitution(request.actual, declaration.id, declaration.id,
      {mode: 'substitutability', blocking: ['typo'] as never})).toMatchObject({kind: 'invalid-input', rule: 'substitution-blocking'});
  });

  it('checks declaration-local scalar/type/name constraints without assuming complete type validity', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const complex = type(seed, 'Complex');
    const attribute = (name: string, type: Reference, value?: string, namespace = 'urn:relations'): GraphNode => {
      const identity = {kind: 'global', role: 'attribute', name: {namespace, local: name}} as const;
      return {...seed, id: globalId(identity.role, identity.name), identity, kind: 'attribute', name: identity.name, type,
        declaredAttributes: [], value: value === undefined ? undefined : {kind: 'fixed', lexical: {value, context: seed.context}}};
    };
    const additions = [complex, attribute('Good', builtin('integer'), '+001'), attribute('BadInteger', builtin('integer'), 'one'),
      attribute('BadID', builtin('ID'), 'identifier'), attribute('ComplexAttribute', local(complex.id)), attribute('xmlns', builtin('string')),
      attribute('custom', builtin('string'), undefined, 'http://www.w3.org/2001/XMLSchema-instance')];
    const candidate = request.candidate({key: 'declarations', active: [...request.actual.members, ...additions.map(x => x.id)], additions});
    if (candidate.kind !== 'prepared') throw Error(candidate.kind);
    const c = candidate.context;
    const good = checkDeclaration(c, additions[1].id);
    expect(good).toMatchObject({kind: 'checked', constraint: {operand: {family: 'decimal', canonical: '1'}}});
    for (const invalid of additions.slice(2)) expect(checkDeclaration(c, invalid.id)).toMatchObject({kind: 'invalid-schema'});
    const unrelated = element(seed, 'Unrelated', builtin('integer'));
    const head = element(seed, 'FinalHead', builtin('decimal'), undefined, {final: 'restriction'});
    const member = element(seed, 'FinalMember', builtin('integer'), head.id);
    const next = request.candidate({key: 'final-affiliation', active: [...request.actual.members, unrelated.id, head.id, member.id], additions: [unrelated, head, member], rawElements: [unrelated, head, member].map(rawElement)});
    if (next.kind !== 'prepared') throw Error(next.kind);
    expect(checkDeclaration(next.context, member.id)).toMatchObject({kind: 'invalid-schema', rule: 'e-props-correct.4'});
    expect(checkSubstitution(next.context, unrelated.id, head.id, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: false});
  });

  it('does not traverse legal element value recursion and rejects forged contexts', async () => {
    const request = await context();
    for (const node of request.graph.nodes.filter(x => x.kind === 'complexType')) {
      expect(checked(request.actual, local(node.id), local(node.id))).toMatchObject({kind: 'checked', value: true});
    }
    expect(() => checked({...request.actual}, builtin('int'), builtin('long'))).toThrow('Unauthenticated');
  });

  it('uses explicit helper scalar properties and keeps facet restriction obligations visible', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const simple = (name: string): SimpleTypeNode => ({...seed, kind: 'simpleType', id: globalId('type', {namespace: 'urn:raw', local: name}),
      identity: {kind: 'global', role: 'type', name: {namespace: 'urn:raw', local: name}}, variety: {kind: 'restriction', base: builtin('string'), facets: []},
      declaredAttributes: [{name: {namespace: '', local: 'final'}, lexicalName: 'final', value: '#all'}]});
    const base = simple('nonnegative'), narrow = simple('positive'), wide = simple('wide'), union = simple('union'), invalidUnion = simple('nested'), patterned = simple('patterned');
    const f = (name: string, value: string) => ({name, lexical: {value, context: seed.context}, fixed: false});
    const properties = (node: SimpleTypeNode, reference: Reference, variety: RawSimpleTypeProperties['variety'], facetLayers: RawSimpleTypeProperties['facetLayers'] = []): RawSimpleTypeProperties =>
      ({type: node.id, base: reference, variety, final: [], facetLayers, provenance: {kind: 'hypothetical-abstract', originals: []}});
    const additions = [base, narrow, wide, union, invalidUnion, patterned];
    const prepared = request.candidate({key: 'raw-scalars', additions, active: [...request.actual.members, ...additions.map(node => node.id)], rawSimpleTypes: [
      properties(base, builtin('decimal'), {kind: 'atomic'}, [{facets: [f('minInclusive', '0')]}]),
      properties(narrow, local(base.id), {kind: 'atomic'}, [{facets: [f('minInclusive', '1')]}]),
      properties(wide, local(base.id), {kind: 'atomic'}, [{facets: [f('minInclusive', '-1')]}]),
      properties(union, builtin('anySimpleType'), {kind: 'union', members: [builtin('boolean'), builtin('integer')]}),
      properties(invalidUnion, builtin('anySimpleType'), {kind: 'union', members: [local(union.id)]}),
      properties(patterned, builtin('string'), {kind: 'atomic'}, [{facets: [f('pattern', 'a.*'), f('pattern', 'b.*')]}, {facets: [f('pattern', '.*z')]}]),
    ]});
    if (prepared.kind !== 'prepared') throw Error(prepared.kind);
    const scalar = createSchemaScalarKernel(prepared.context), lexical = (value: string) => ({value, context: seed.context});
    expect(scalar.assess(local(base.id), lexical('1.25'), base.id)).toMatchObject({kind: 'checked', value: {operand: {family: 'decimal'}}});
    expect(scalar.assess(local(narrow.id), lexical('2'), narrow.id)).toMatchObject({kind: 'checked', obligations: []});
    expect(scalar.assess(local(wide.id), lexical('2'), wide.id)).toMatchObject({kind: 'invalid-schema'});
    expect(scalar.assess(local(union.id), lexical('1'), union.id)).toMatchObject({kind: 'checked', value: {operand: {family: 'boolean', selectedMembers: [builtin('boolean')]}}});
    expect(scalar.describe(local(invalidUnion.id), invalidUnion.id)).toMatchObject({kind: 'invalid-schema', rule: 'cos-st-restricts'});
    for (const value of ['az', 'bz']) expect(scalar.assess(local(patterned.id), lexical(value), patterned.id)).toMatchObject({kind: 'checked'});
    for (const value of ['ay', 'cz']) expect(scalar.assess(local(patterned.id), lexical(value), patterned.id)).toMatchObject({kind: 'invalid-schema'});
    expect(checkImmediateTypeFinal(prepared.context, local(narrow.id))).toMatchObject({kind: 'checked', value: true});
  });

  it('separates raw simple content identity and helper declaration flags from diagnostic XML', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const complex = type(seed, 'RawScalar'), declaration = element(seed, 'AbstractDeclaration', local(complex.id), undefined, {type: 'xs:integer', ref: 'bad', name: 'also', abstract: 'typo', final: '#all'});
    const properties = {...rawType(complex), content: {kind: 'simple' as const, type: builtin('integer')}};
    const prepared = request.candidate({key: 'raw-content', additions: [complex, declaration], active: [...request.actual.members, complex.id, declaration.id], rawTypes: [properties], rawElements: [{element: declaration.id, final: [], block: []}]});
    if (prepared.kind !== 'prepared') throw Error(prepared.kind);
    const scalar = createSchemaScalarKernel(prepared.context);
    expect(scalar.contentIdentity(local(complex.id), declaration.id)).toMatchObject({kind: 'checked', value: {definition: 'builtin:integer', reference: builtin('integer')}, obligations: [{rule: 'raw-simple-content-derivation-validity', component: complex.id}]});
    expect(scalar.contentDerivation(local(complex.id), builtin('decimal'), declaration.id)).toMatchObject({kind: 'checked', value: true});
    expect(checkDeclaration(prepared.context, declaration.id)).toMatchObject({kind: 'checked'});
    const missing = request.candidate({key: 'missing-raw', additions: [complex], active: [...request.actual.members, complex.id]});
    if (missing.kind !== 'prepared') throw Error(missing.kind);
    expect(scalar.describe(builtin('string'), declaration.id)).toMatchObject({kind: 'checked'});
    expect(createSchemaScalarKernel(missing.context).describe(local(complex.id), complex.id)).toMatchObject({kind: 'unresolved', rule: 'missing-type-component-properties'});
  });

  it('checks each raw enumeration component against its base value space', async () => {
    const request = await context(), seed = request.graph.nodes[0];
    const simple = (name: string): SimpleTypeNode => ({...seed, kind: 'simpleType', id: globalId('type', {namespace: 'urn:raw', local: name}),
      identity: {kind: 'global', role: 'type', name: {namespace: 'urn:raw', local: name}}, variety: {kind: 'restriction', base: builtin('string'), facets: []}});
    const base = simple('RawEnumBase'), child = simple('RawEnumIntersection');
    const group = (values: string[]) => ({facets: values.map(value => ({name: 'enumeration', lexical: {value, context: seed.context}, fixed: false}))});
    const properties = (node: SimpleTypeNode, reference: Reference, groups: string[][]): RawSimpleTypeProperties => ({type: node.id, base: reference,
      variety: {kind: 'atomic'}, final: [], facetLayers: groups.map(group), provenance: {kind: 'hypothetical-abstract', originals: []}});
    const prepared = request.candidate({key: 'nested-raw-enum', additions: [base, child], active: [...request.actual.members, base.id, child.id],
      rawSimpleTypes: [properties(base, builtin('string'), [['A', 'B']]), properties(child, local(base.id), [['A', 'B'], ['B', 'C']])]});
    if (prepared.kind !== 'prepared') throw Error(prepared.kind);
    const kernel = createSchemaScalarKernel(prepared.context), lexical = (value: string) => ({value, context: seed.context});
    expect(kernel.assess(local(child.id), lexical('B'), child.id)).toMatchObject({kind: 'invalid-schema', rule: 'enumeration-valid-restriction'});
    for (const value of ['A', 'C']) expect(kernel.assess(local(child.id), lexical(value), child.id)).toMatchObject({kind: 'invalid-schema'});
  });

  it('shares inclusive sticky work limits with preparation and reserves relation output', async () => {
    const input = await fixture(), maxWork = 50_000_000, budget = createSemanticBudget({maxWork});
    const prepared = prepareSemanticRequest(input.resolved, {budget});
    if (prepared.kind !== 'prepared') throw Error(prepared.kind);
    const before = budget.usage().work;
    expect(checked(prepared.request.actual, builtin('unsignedByte'), builtin('decimal'))).toMatchObject({kind: 'checked', value: true});
    expect(budget.usage().work).toBeGreaterThan(before);
    expect(budget.guard(() => budget.chargeWork(maxWork - budget.usage().work))).toBeUndefined();
    expect(budget.usage().work).toBe(maxWork);
    expect(checked(prepared.request.actual, builtin('int'), builtin('decimal'))).toMatchObject({kind: 'resource-limit'});
    const used = {...budget.usage()};
    expect(budget.guard(() => budget.chargeWork())).toMatchObject({kind: 'resource-limit'});
    expect(budget.usage()).toEqual(used);
  });

  it('keeps partial-order facet component consistency separate from value membership', async () => {
    // Independent expectation: dated datatype bodies prohibit > for like
    // endpoints and >= for mixed endpoints. Incomparability is neither;
    // datatype value membership still requires its stated inequality.
    const unknown = '2000-01-01T00:00:00', known = unknown + 'Z';
    const cases = [
      ['II', 'minInclusive', unknown, 'maxInclusive', known, true],
      ['EE', 'minExclusive', unknown, 'maxExclusive', known, true],
      ['IE', 'minInclusive', unknown, 'maxExclusive', known, true],
      ['EI', 'minExclusive', unknown, 'maxInclusive', known, true],
      ['Crossed', 'minInclusive', '2000-01-02T00:00:00Z', 'maxInclusive', known, false],
      ['MixedEqual', 'minInclusive', known, 'maxExclusive', known, false],
      ['ExclusiveEqual', 'minExclusive', known, 'maxExclusive', known, true],
      ['InclusiveEqual', 'minInclusive', known, 'maxInclusive', known, true],
    ] as const;
    const uri = 'https://scalar-probe.invalid/partial-order.xsd', namespace = 'urn:partial-order';
    const xml = `<xs:schema xmlns:xs="${XSD_NAMESPACE}" targetNamespace="${namespace}">${cases.map(([name, lower, min, upper, max]) =>
      `<xs:simpleType name="${name}"><xs:restriction base="xs:dateTime"><xs:${lower} value="${min}"/><xs:${upper} value="${max}"/></xs:restriction></xs:simpleType>`).join('')}</xs:schema>`;
    const bytes = new TextEncoder().encode(xml);
    const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://scalar-probe.invalid']},
      offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
    const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 50_000_000})});
    if (prepared.kind !== 'prepared') throw Error(prepared.kind);
    const scalar = createSchemaScalarKernel(prepared.request.actual);
    for (const [name, , , , , valid] of cases) {
      const id = globalId('type', {namespace, local: name});
      expect(scalar.describe(local(id), id)).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema', rule: 'facet-bound-order'});
    }
    const id = globalId('type', {namespace, local: 'II'}), selected = prepared.request.actual.lookup(id);
    if (selected.kind !== 'found') throw Error('Expected interval');
    expect(scalar.compare(builtin('dateTime'), {value: unknown, context: selected.node.context}, builtin('dateTime'), {value: known, context: selected.node.context}, id)).toMatchObject({kind: 'checked', value: 'indeterminate'});
    expect(scalar.assess(local(id), {value: unknown, context: selected.node.context}, id)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-maxInclusive-valid'});
    expect(scalar.assess(local(id), {value: known, context: selected.node.context}, id)).toMatchObject({kind: 'invalid-schema', rule: 'cvc-minInclusive-valid'});
  });
});
