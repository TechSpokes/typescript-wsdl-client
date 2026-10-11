import {createHash} from 'node:crypto';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {createSchemaScalarKernel} from '../../src/compiler/schemaScalarKernel.js';
import type {RawSimpleTypeProperties} from '../../src/compiler/schemaSimpleTypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:scalars';
const named = (local: string) => globalId('type', {namespace, local});
const string: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}};

// Datatypes dc-defn facet union, dc-enumeration set-valued property, and
// Structures st-restrict-facets preserve inherited enum components. A smaller
// extensional value space cannot erase the distinct component-property duties.
describe('independent complete raw enumeration component properties', () => {
  it.each([
    {name: 'primitive intersection', inherited: false, groups: [['A', 'B'], ['B', 'C']], valid: true},
    {name: 'missing inherited component', inherited: true, groups: [['B']], valid: false},
    {name: 'new member outside base', inherited: true, groups: [['A', 'B'], ['B', 'C']], valid: false},
    {name: 'retained base and narrowing component', inherited: true, groups: [['A', 'B'], ['B']], valid: true},
  ])('$name', async ({inherited, groups, valid}) => {
    const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
    const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected original simple template');
    const seed = found.node, owner = named('Owner'), baseId = named('RawEnumBase'), childId = named('RawEnumChild');
    const baseRef: Reference = {kind: 'local', target: baseId};
    const node = (id: string, name: string, base: Reference): SimpleTypeNode => ({...seed, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety: {kind: 'restriction', base, facets: []}});
    const properties = (type: string, base: Reference, layers: string[][]): RawSimpleTypeProperties => ({
      type, base, final: [], variety: {kind: 'atomic'},
      facetLayers: layers.map(values => ({facets: values.map(value => ({name: 'enumeration',
        lexical: {value, context: seed.context}, fixed: false}))})),
      provenance: {kind: 'hypothetical-abstract', originals: []},
    });
    const childBase = inherited ? baseRef : string;
    const candidate = request.candidate({key: 'raw-enum-properties', active: [...request.actual.members, baseId, childId],
      additions: [node(baseId, 'RawEnumBase', string), node(childId, 'RawEnumChild', childBase)],
      rawSimpleTypes: [properties(baseId, string, [['A', 'B']]), properties(childId, childBase, groups)]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural candidate');
    const kernel = createSchemaScalarKernel(candidate.context), reference: Reference = {kind: 'local', target: childId};
    const described = kernel.describe(reference, owner);
    if (!valid) {expect(described).toMatchObject({kind: 'invalid-schema'}); return;}
    expect(described).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(reference, {value: 'B', context: seed.context}, owner)).toMatchObject({kind: 'checked', value: {operand: {canonical: 'B'}}});
    for (const value of ['A', 'C']) expect(kernel.assess(reference, {value, context: seed.context}, owner)).toMatchObject({kind: 'invalid-schema'});
  });
});

// Integer facet component properties contain typed nonNegativeInteger values,
// not their source lexical spellings. Fixed is an independent property.
describe('independent integer facet property identity', () => {
  it.each([
    {facet: 'minLength', primitive: 'string', literal: '+001', fixed: false, equal: true},
    {facet: 'totalDigits', primitive: 'decimal', literal: '+001', fixed: false, equal: true},
    {facet: 'minLength', primitive: 'string', literal: '2', fixed: false, equal: false},
    {facet: 'minLength', primitive: 'string', literal: '+001', fixed: true, equal: false},
  ])('$facet=$literal fixed=$fixed', async ({facet, primitive, literal, fixed, equal}) => {
    const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
    const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected simple template');
    const seed = found.node, base: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: primitive}};
    const ids = [named('RawIntegerLeft'), named('RawIntegerRight')];
    const additions: SimpleTypeNode[] = ids.map((id, i) => ({...seed, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: i === 0 ? 'RawIntegerLeft' : 'RawIntegerRight'}},
      variety: {kind: 'restriction', base, facets: []}}));
    const rawSimpleTypes: RawSimpleTypeProperties[] = ids.map((type, i) => ({type, base, final: [], variety: {kind: 'atomic'},
      facetLayers: [{facets: [{name: facet, lexical: {value: i === 0 ? '01' : literal, context: seed.context}, fixed: i === 0 ? false : fixed}]}],
      provenance: {kind: 'hypothetical-abstract', originals: []}}));
    const candidate = request.candidate({key: 'integer-property-identity', active: [...request.actual.members, ...ids], additions, rawSimpleTypes});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw candidate');
    const kernel = createSchemaScalarKernel(candidate.context);
    expect(kernel.facetPropertiesEquivalent({kind: 'local', target: ids[0]}, {kind: 'local', target: ids[1]}, named('Owner')))
      .toMatchObject({kind: 'checked', value: equal, obligations: []});
  });
});

// Datatypes length-minLength-maxLength requires an actual proper restriction
// ancestor with the same min/max property and no length; numeric consistency
// alone does not discharge that component constraint.
describe('independent effective length ancestry', () => {
  it.each([
    {name: 'new minimum without ancestor', side: 'minLength', bound: '3', ancestor: undefined, split: false, valid: false},
    {name: 'new maximum without ancestor', side: 'maxLength', bound: '7', ancestor: undefined, split: false, valid: false},
    {name: 'minimum across effective layers', side: 'minLength', bound: '3', ancestor: undefined, split: true, valid: false},
    {name: 'same inherited minimum', side: 'minLength', bound: '3', ancestor: '3', split: false, valid: true},
    {name: 'same inherited maximum', side: 'maxLength', bound: '7', ancestor: '7', split: false, valid: true},
    {name: 'different inherited minimum', side: 'minLength', bound: '3', ancestor: '2', split: false, valid: false},
  ])('$name', async ({side, bound, ancestor, split, valid}) => {
    const loaded = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(loaded, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected authentic source context');
    const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected simple template');
    const seed = found.node, baseId = named('LengthAncestor'), childId = named('LengthChild');
    const facet = (name: string, value: string) => ({name, lexical: {value, context: seed.context}, fixed: false});
    const node = (id: string, local: string, base: Reference): SimpleTypeNode => ({...seed, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local}}, variety: {kind: 'restriction', base, facets: []}});
    const childBase: Reference = ancestor === undefined ? string : {kind: 'local', target: baseId};
    const childFacets = [facet('length', '5'), facet(side, bound)];
    const rawSimpleTypes: RawSimpleTypeProperties[] = [
      {type: baseId, base: string, final: [], variety: {kind: 'atomic'},
        facetLayers: ancestor === undefined ? [] : [{facets: [facet(side, ancestor)]}],
        provenance: {kind: 'hypothetical-abstract', originals: []}},
      {type: childId, base: childBase, final: [], variety: {kind: 'atomic'},
        facetLayers: split ? childFacets.map(value => ({facets: [value]})) : [{facets: childFacets}],
        provenance: {kind: 'hypothetical-abstract', originals: []}},
    ];
    const candidate = request.candidate({key: 'length-ancestry', active: [...request.actual.members, baseId, childId],
      additions: [node(baseId, 'LengthAncestor', string), node(childId, 'LengthChild', childBase)], rawSimpleTypes});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw candidate');
    const result = createSchemaScalarKernel(candidate.context).describe({kind: 'local', target: childId}, named('Owner'));
    expect(result).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema', rule: 'length-minLength-maxLength'});
  });

  it.each(['explicit-repeat', 'deeper-ancestor', 'builtin-list'] as const)
    ('permits the concrete source ancestor case: %s', async variant => {
      const uri = 'https://recovery-length.example/root.xsd';
      const declarations = variant === 'builtin-list'
        ? '<xs:simpleType name="Child"><xs:restriction base="xs:NMTOKENS"><xs:length value="2"/><xs:minLength value="1"/></xs:restriction></xs:simpleType>'
        : '<xs:simpleType name="Base"><xs:restriction base="xs:string"><xs:minLength value="3"/></xs:restriction></xs:simpleType>' +
          (variant === 'deeper-ancestor' ? '<xs:simpleType name="Mid"><xs:restriction base="t:Base"><xs:length value="5"/></xs:restriction></xs:simpleType>' : '') +
          '<xs:simpleType name="Child"><xs:restriction base="t:' + (variant === 'deeper-ancestor' ? 'Mid' : 'Base') + '"><xs:length value="5"/><xs:minLength value="3"/></xs:restriction></xs:simpleType>';
      const bytes = Buffer.from('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="urn:length-ancestor" targetNamespace="urn:length-ancestor">' + declarations + '</xs:schema>');
      const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://recovery-length.example']}, offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
      const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
      if (prepared.kind !== 'prepared') throw new Error('Expected original source context');
      const child = globalId('type', {namespace: 'urn:length-ancestor', local: 'Child'});
      const result = createSchemaScalarKernel(prepared.request.actual).describe({kind: 'local', target: child}, child);
      expect(result).toMatchObject({kind: 'checked', obligations: []});
    });
});

// Reviewed normal-form contract is limited to nonfixed comparable facets.
// Extensional redundancy does not establish preservation of fixed metadata or
// a differently named inherited component property.
describe('independent raw facet correspondence qualifications', () => {
  it.each(['fixed-bound-cross-kind', 'equal-value-fixed-metadata', 'missing-inherited-bound-kind', 'missing-inherited-length-kind'] as const)
    ('retains a property-mapping obligation for %s', async variation => {
      const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
      const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
      if (prepared.kind !== 'prepared') throw new Error('Expected source context');
      const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
      if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected simple template');
      const seed = found.node, baseId = named('PropertyBase'), childId = named('PropertyChild');
      const builtin: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: variation === 'missing-inherited-length-kind' ? 'string' : 'decimal'}};
      const facet = (name: string, value: string, fixed = false) => ({name, lexical: {value, context: seed.context}, fixed});
      const base: Reference = variation.startsWith('missing-inherited') ? {kind: 'local', target: baseId} : builtin;
      const properties: RawSimpleTypeProperties[] = [
        {type: baseId, base: builtin, final: [], variety: {kind: 'atomic'},
          facetLayers: variation === 'missing-inherited-length-kind' ? [{facets: [facet('minLength', '3', true)]}]
            : variation === 'missing-inherited-bound-kind' ? [{facets: [facet('minInclusive', '0', true)]}] : [],
          provenance: {kind: 'hypothetical-abstract', originals: []}},
        {type: childId, base, final: [], variety: {kind: 'atomic'},
          facetLayers: variation === 'fixed-bound-cross-kind'
            ? [{facets: [facet('minInclusive', '0', true)]}, {facets: [facet('minExclusive', '1')]}]
            : variation === 'equal-value-fixed-metadata'
              ? [{facets: [facet('minInclusive', '0', true)]}, {facets: [facet('minInclusive', '00', false)]}]
              : variation === 'missing-inherited-bound-kind' ? [{facets: [facet('minExclusive', '1')]}]
                : [{facets: [facet('length', '5')]}],
          provenance: {kind: 'hypothetical-abstract', originals: []}},
      ];
      const node = (id: string, local: string, base: Reference): SimpleTypeNode => ({...seed, id,
        identity: {kind: 'global', role: 'type', name: {namespace, local}}, variety: {kind: 'restriction', base, facets: []}});
      const candidate = request.candidate({key: 'fixed-property-normalization', active: [...request.actual.members, baseId, childId],
        additions: [node(baseId, 'PropertyBase', builtin), node(childId, 'PropertyChild', base)], rawSimpleTypes: properties});
      if (candidate.kind !== 'prepared') throw new Error('Expected structural candidate');
      expect(createSchemaScalarKernel(candidate.context).describe({kind: 'local', target: childId}, named('Owner')))
        .toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
          expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: childId}),
        ])});
    });
});

// The primary fixed rule forbids a different facet VALUE, not changing the
// next component's own fixed flag while retaining that value.
describe('independent inherited fixed value versus local fixed metadata', () => {
  it.each([
    {baseFixed: false, ownFixed: false, value: '3', valid: true},
    {baseFixed: false, ownFixed: true, value: '3', valid: true},
    {baseFixed: true, ownFixed: false, value: '3', valid: true},
    {baseFixed: true, ownFixed: true, value: '3', valid: true},
    {baseFixed: false, ownFixed: false, value: '4', valid: true},
    {baseFixed: true, ownFixed: false, value: '4', valid: false},
  ])('base fixed=$baseFixed, own fixed=$ownFixed, value=$value', async ({baseFixed, ownFixed, value, valid}) => {
    const ns = 'urn:fixed-property-matrix', uri = 'https://recovery-fixed.example/root.xsd';
    const bytes = Buffer.from('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="' + ns + '" targetNamespace="' + ns + '">' +
      '<xs:simpleType name="Base"><xs:restriction base="xs:string"><xs:minLength value="3" fixed="' + baseFixed + '"/></xs:restriction></xs:simpleType>' +
      '<xs:simpleType name="Child"><xs:restriction base="t:Base"><xs:minLength value="' + value + '" fixed="' + ownFixed + '"/></xs:restriction></xs:simpleType></xs:schema>');
    const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://recovery-fixed.example']}, offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
    const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected source context');
    const request = prepared.request, baseId = globalId('type', {namespace: ns, local: 'Base'}), childId = globalId('type', {namespace: ns, local: 'Child'});
    const result = createSchemaScalarKernel(request.actual).describe({kind: 'local', target: childId}, childId);
    expect(result).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema', rule: 'facet-fixed'});
    const found = request.actual.lookup(baseId);
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected original base');
    const seed = found.node, rawId = globalId('type', {namespace: ns, local: 'RawChild'}), base: Reference = {kind: 'local', target: baseId};
    const addition: SimpleTypeNode = {...seed, id: rawId, identity: {kind: 'global', role: 'type', name: {namespace: ns, local: 'RawChild'}}, variety: {kind: 'restriction', base, facets: []}};
    const candidate = request.candidate({key: 'fixed-value-matrix', active: [...request.actual.members, rawId], additions: [addition],
      rawSimpleTypes: [{type: rawId, base, final: [], variety: {kind: 'atomic'},
        facetLayers: [{facets: [{name: 'minLength', lexical: {value, context: seed.context}, fixed: ownFixed}]}],
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural candidate');
    const rawResult = createSchemaScalarKernel(candidate.context).describe({kind: 'local', target: rawId}, childId);
    expect(rawResult).toMatchObject(valid ? {kind: 'checked', obligations: []} : {kind: 'invalid-schema', rule: 'facet-fixed'});
  });
});

// NMTOKENS / IDREFS / ENTITIES are nonempty builtin lists. Their intrinsic
// minLength=1 remains a distinct inherited property even when a raw view uses
// length=2; constructing a new list from anySimpleType is a separate operation.
describe('independent intrinsic builtin list properties', () => {
  const cases = [
    ['NMTOKENS', 'NMTOKEN'], ['IDREFS', 'IDREF'], ['ENTITIES', 'ENTITY'],
  ].flatMap(([base, item]) => ['omitted', 'length-only', 'explicit-minimum', 'zero-minimum', 'source-inherited'].map(variant => ({base, item, variant})));
  it.each(cases)('$base $variant', async ({base: baseName, item: itemName, variant}) => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected source context');
    const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected simple template');
    const seed = found.node, local = 'IntrinsicList', id = named(local);
    const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
    const base = builtin(baseName), item = builtin(itemName), reference: Reference = {kind: 'local', target: id};
    if (variant === 'source-inherited') {
      const uri = 'https://intrinsic-list.example/root.xsd';
      const bytes = Buffer.from('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:intrinsic-list"><xs:simpleType name="Child"><xs:restriction base="xs:' + baseName + '"/></xs:simpleType></xs:schema>');
      const sourceInput = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://intrinsic-list.example']},
        offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
      const sourcePrepared = prepareSourceSchemaRequest(sourceInput, {budget: createSemanticBudget({maxWork: 100_000_000})});
      if (sourcePrepared.kind !== 'prepared') throw new Error('Expected original source restriction');
      const child = globalId('type', {namespace: 'urn:intrinsic-list', local: 'Child'});
      expect(createSchemaScalarKernel(sourcePrepared.request.actual).assess({kind: 'local', target: child}, {value: '', context: seed.context}, child))
        .toMatchObject({kind: 'invalid-schema', rule: 'cvc-minLength-valid'});
      return;
    }
    const facets = variant === 'omitted' ? [] : [{name: variant === 'length-only' ? 'length' : 'minLength',
      lexical: {value: variant === 'length-only' ? '2' : variant === 'zero-minimum' ? '0' : '1', context: seed.context}, fixed: false}];
    const candidate = request.candidate({key: 'intrinsic-builtin-list', active: [...request.actual.members, id], additions: [{...seed, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local}}, variety: {kind: 'restriction', base, facets: []}}],
      rawSimpleTypes: [{type: id, base, final: [], variety: {kind: 'list', item}, facetLayers: [{facets}],
        provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural candidate');
    const kernel = createSchemaScalarKernel(candidate.context), result = kernel.describe(reference, named('Owner'));
    if (variant === 'zero-minimum') {expect(result).toMatchObject({kind: 'invalid-schema'}); return;}
    if (variant === 'omitted' || variant === 'length-only') {
      expect(result).toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
        expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: id}),
      ])});
      if (variant === 'omitted') expect(kernel.assess(reference, {value: '', context: seed.context}, named('Owner')))
        .toMatchObject({kind: 'checked', obligations: expect.arrayContaining([
          expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: id}),
        ])});
      return;
    }
    expect(result).toMatchObject({kind: 'checked', obligations: []});
    expect(kernel.assess(reference, {value: '', context: seed.context}, named('Owner')))
      .toMatchObject({kind: 'invalid-schema', rule: 'cvc-minLength-valid'});
  });

  it('permits an empty newly constructed list from anySimpleType', async () => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected source context');
    const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected template');
    const seed = found.node, id = named('FreshList'), base: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anySimpleType'}},
      item: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'NMTOKEN'}};
    const candidate = request.candidate({key: 'fresh-list', active: [...request.actual.members, id], additions: [{...seed, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshList'}}, variety: {kind: 'list', item}}],
      rawSimpleTypes: [{type: id, base, final: [], variety: {kind: 'list', item}, facetLayers: [], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected candidate');
    expect(createSchemaScalarKernel(candidate.context).assess({kind: 'local', target: id}, {value: '', context: seed.context}, named('Owner')))
      .toMatchObject({kind: 'checked', obligations: [], value: {operand: {family: 'list', length: '0'}}});
  });
});

// Facet property identity includes the builtin component facts that the lexical
// engine enforces intrinsically. An empty explicit Map is not their absence.
describe('independent effective builtin facet identity', () => {
  it.each([
    {name: 'NMTOKENS implicit minimum', base: 'NMTOKENS', rightBase: 'NMTOKENS', facets: '<xs:minLength value="1"/>', expected: true},
    {name: 'IDREFS implicit minimum', base: 'IDREFS', rightBase: 'IDREFS', facets: '<xs:minLength value="1"/>', expected: true},
    {name: 'ENTITIES implicit minimum', base: 'ENTITIES', rightBase: 'ENTITIES', facets: '<xs:minLength value="1"/>', expected: true},
    {name: 'changed minimum', base: 'NMTOKENS', rightBase: 'NMTOKENS', facets: '<xs:minLength value="2"/>', expected: false},
    {name: 'changed minimum fixed flag', base: 'NMTOKENS', rightBase: 'NMTOKENS', facets: '<xs:minLength value="1" fixed="true"/>', expected: false},
    {name: 'same typed upper bound', base: 'int', rightBase: 'int', facets: '<xs:maxInclusive value="+02147483647"/>', expected: true},
    {name: 'changed upper bound', base: 'int', rightBase: 'int', facets: '<xs:maxInclusive value="2147483646"/>', expected: false},
    {name: 'different intrinsic integer ranges', base: 'int', rightBase: 'byte', facets: '', expected: false},
    {name: 'same fixed integer precision', base: 'integer', rightBase: 'integer', facets: '<xs:fractionDigits value="00" fixed="true"/>', expected: true},
    {name: 'changed integer precision fixed flag', base: 'integer', rightBase: 'integer', facets: '<xs:fractionDigits value="0"/>', expected: false},
    {name: 'different opaque builtin patterns', base: 'Name', rightBase: 'NCName', facets: '', expected: 'unresolved'},
    {name: 'explicit component versus opaque inherited pattern', base: 'Name', rightBase: 'Name', facets: '<xs:pattern value=".+"/>', expected: 'unresolved'},
  ])('$name', async ({base, rightBase, facets, expected}) => {
    const uri = 'https://intrinsic-facets.example/root.xsd', ns = 'urn:intrinsic-facets';
    const bytes = Buffer.from('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="' + ns + '">' +
      '<xs:simpleType name="Left"><xs:restriction base="xs:' + base + '"/></xs:simpleType>' +
      '<xs:simpleType name="Right"><xs:restriction base="xs:' + rightBase + '">' + facets + '</xs:restriction></xs:simpleType></xs:schema>');
    const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://intrinsic-facets.example']},
      offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
    const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected original source context');
    const left = globalId('type', {namespace: ns, local: 'Left'}), right = globalId('type', {namespace: ns, local: 'Right'});
    const result = createSchemaScalarKernel(prepared.request.actual).facetPropertiesEquivalent({kind: 'local', target: left}, {kind: 'local', target: right}, left);
    expect(result).toMatchObject(expected === 'unresolved' ? {kind: 'unresolved', rule: 'builtin-facet-properties'} : {kind: 'checked', value: expected, obligations: []});
  });
});

// A derived builtin retained by the operand engine is not an authenticated
// replacement for omitted caller-supplied complete raw component properties.
describe('independent raw builtin property completeness', () => {
  it.each([
    {base: 'int', explicitWhitespace: undefined, complete: false},
    {base: 'token', explicitWhitespace: undefined, complete: false},
    {base: 'normalizedString', explicitWhitespace: undefined, complete: false},
    {base: 'Name', explicitWhitespace: undefined, complete: false},
    {base: 'token', explicitWhitespace: 'collapse', complete: true},
    {base: 'decimal', explicitWhitespace: undefined, complete: true},
    {base: 'string', explicitWhitespace: undefined, complete: true},
  ])('$base whitespace=$explicitWhitespace', async ({base: baseName, explicitWhitespace, complete}) => {
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scalar-primitives.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected original source');
    const request = prepared.request, found = request.actual.lookup(named('OnlyAB'));
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') throw new Error('Expected template');
    const seed = found.node, id = named('RawBuiltinProperties'), base: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: baseName}};
    const facets = explicitWhitespace === undefined ? [] : [{name: 'whiteSpace', lexical: {value: explicitWhitespace, context: seed.context}, fixed: false}];
    const candidate = request.candidate({key: 'raw-builtin-properties', active: [...request.actual.members, id], additions: [{...seed, id,
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'RawBuiltinProperties'}}, variety: {kind: 'restriction', base, facets: []}}],
      rawSimpleTypes: [{type: id, base, final: [], variety: {kind: 'atomic'}, facetLayers: [{facets}], provenance: {kind: 'hypothetical-abstract', originals: []}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected structural raw context');
    const kernel = createSchemaScalarKernel(candidate.context), reference: Reference = {kind: 'local', target: id};
    const described = kernel.describe(reference, named('Owner'));
    expect(described).toMatchObject({kind: 'checked', obligations: complete ? [] : expect.arrayContaining([
      expect.objectContaining({rule: 'raw-simple-facet-restriction-validity', component: id}),
    ])});
    if (baseName === 'decimal' || baseName === 'string') expect(kernel.assess(reference, {value: '1.5', context: seed.context}, named('Owner')))
      .toMatchObject({kind: 'checked', obligations: []});
  });
});
