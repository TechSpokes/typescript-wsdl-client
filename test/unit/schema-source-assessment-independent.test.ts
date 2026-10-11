import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkSchemaDocumentSyntax, prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaSourceValues} from '../../src/compiler/schemaSourceValues.js';
import type {FixedSimpleTypeHandle} from '../../src/compiler/schemaSourceValues.js';

// Independent primary-based inventory, published BEFORE implementation:
// #271 comments 6113254427 and 6113549089. Payload S4S instance assessment
// does not construct the application's schema components or activate its profile.
const origin = 'https://independent-source.example';
const uri = origin + '/root.xsd';
const schema = (payload: string, attributes = '', declarations = '') =>
  `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:app="urn:inert:application" xmlns:p="urn:inert:bound" ${attributes}><xs:annotation><xs:documentation>${payload}</xs:documentation></xs:annotation>${declarations}</xs:schema>`;
async function source(payload: string, attributes = '', declarations = '') {
  const xml = schema(payload, attributes, declarations), bytes = Buffer.from(xml);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const input = await loadSemanticSchemaInput(uri, {policy: {allowedOrigins: [origin]},
    offlineResources: new Map([[uri, {bytes, digest}]])});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected original graph without constructing inert payload: ' + JSON.stringify(prepared));
  return {request: prepared.request, input, digest, result: checkSchemaDocumentSyntax(prepared.request.actual)};
}
const key = (name: string) => `<xs:key name="${name}"><xs:selector xpath="p:item"/><xs:field xpath="@id"/></xs:key>`;

describe('independent contextual S4S instance grammar in inert payload', () => {
  it.each([
    ['parent selects local element with optional name/ref', '<xs:sequence><xs:element/></xs:sequence>'],
    ['local name/ref coexist without construction', '<xs:sequence><xs:element name="e" ref="p:Unknown"/></xs:sequence>'],
    ['local complex mixed is allowed', '<xs:element name="e"><xs:complexType mixed="true"/></xs:element>'],
    ['global restriction permits absent base', '<xs:restriction/>'],
    ['global restriction permits both base and inline simple type', '<xs:restriction base="xs:string"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:restriction>'],
    ['global list permits absent item type', '<xs:list/>'],
    ['global list permits both itemType and inline type', '<xs:list itemType="xs:string"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:list>'],
    ['empty union is instance grammar', '<xs:union memberTypes=""/>'],
    ['undeclared global extension stays lax', '<xs:extension arbitrary="value"><app:child/></xs:extension>'],
    ['complex restriction has contextual particle grammar', '<xs:complexContent><xs:restriction base="p:Unknown"><xs:sequence/></xs:restriction></xs:complexContent>'],
    ['simple extension permits attributes', '<xs:simpleContent><xs:extension base="p:Unknown"><xs:attribute name="a"/></xs:extension></xs:simpleContent>'],
    ['occurrence values do not imply construction range comparison', '<xs:sequence minOccurs="2" maxOccurs="1"/>'],
    ['numeric occurrence enumeration uses value equality', '<xs:all maxOccurs="+01"><xs:element maxOccurs="-0"/></xs:all>'],
    ['named group compositor has selected local role', '<xs:group name="g"><xs:sequence/></xs:group>'],
    ['attribute uses precede final wildcard', '<xs:complexType name="T"><xs:attribute name="a"/><xs:attributeGroup ref="p:Missing"/><xs:anyAttribute/></xs:complexType>'],
    ['notation component construction is separate', '<xs:notation name="N"/>'],
    ['pattern representation does not compile the expression', '<xs:pattern value="["/>'],
    ['bound component QName need not resolve in application', '<xs:element name="e" type="p:Unknown"/>'],
    ['derivation token list can repeat', '<xs:element name="e" block="extension extension"/>'],
    ['derivation token list can be empty', '<xs:element name="e" block=""/>'],
    ['inert include URI does not load', '<xs:include schemaLocation="https://forbidden.example/missing.xsd"/>'],
    ['inert redefine URI does not load', '<xs:redefine schemaLocation="file:///not-authorized.xsd"/>'],
    ['required anyURI admits explicit empty value', '<xs:include schemaLocation=""/>'],
    ['element-only content permits XML whitespace', '<xs:sequence> \n\t<xs:element/>\r</xs:sequence>'],
    ['inert identity constraint is not application activation', key('K')],
    ['separate direct key symbol tables', '<xs:schema><xs:element name="same"/><xs:attribute name="same"/></xs:schema>'],
    ['independent nested schema direct key scopes', '<xs:schema><xs:element name="e"/></xs:schema><xs:schema><xs:element name="e"/></xs:schema>'],
  ] as const)('checks %s', async (_label, payload) => {
    const {result, input, digest} = await source(payload);
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: [], remaining: ['child-component-syntax', 'semantic-construction']});
    expect(input.resources).toHaveLength(1);
    expect(input.schemas[0].digest).toBe(digest);
  });

  it.each([
    ['global element requires name', '<xs:element/>'],
    ['unbound QName prefix', '<xs:sequence><xs:element ref="unbound:Missing"/></xs:sequence>'],
    ['global complexType requires name', '<xs:complexType/>'],
    ['local complexType prohibits name', '<xs:element name="e"><xs:complexType name="Local"/></xs:element>'],
    ['local complexType prohibits abstract', '<xs:element name="e"><xs:complexType abstract="false"/></xs:element>'],
    ['complex restriction requires base', '<xs:complexContent><xs:restriction/></xs:complexContent>'],
    ['simple extension requires base', '<xs:simpleContent><xs:extension/></xs:simpleContent>'],
    ['simple extension prohibits particle', '<xs:simpleContent><xs:extension base="xs:string"><xs:sequence/></xs:extension></xs:simpleContent>'],
    ['simple extension prohibits facet', '<xs:simpleContent><xs:extension base="xs:string"><xs:length value="1"/></xs:extension></xs:simpleContent>'],
    ['sequence prohibits all child', '<xs:sequence><xs:all/></xs:sequence>'],
    ['all prohibits sequence child', '<xs:all><xs:sequence/></xs:all>'],
    ['all max is value-restricted', '<xs:all maxOccurs="2"/>'],
    ['group compositor bounds prohibited', '<xs:group name="g"><xs:sequence minOccurs="1"/></xs:group>'],
    ['attribute after wildcard', '<xs:complexType name="T"><xs:anyAttribute/><xs:attribute name="a"/></xs:complexType>'],
    ['duplicate wildcard', '<xs:complexType name="T"><xs:anyAttribute/><xs:anyAttribute/></xs:complexType>'],
    ['duplicate annotation wrapper', '<xs:sequence><xs:annotation/><xs:annotation/></xs:sequence>'],
    ['NBSP is significant element-only text', '<xs:sequence>\u00a0</xs:sequence>'],
    ['include required attribute absent', '<xs:include/>'],
    ['direct key compares assessed NCNames', '<xs:schema><xs:element name="e"/><xs:element name=" e "/></xs:schema>'],
    ['type key spans simple and complex declarations', '<xs:schema><xs:simpleType name="T"><xs:restriction/></xs:simpleType><xs:complexType name="T"/></xs:schema>'],
    ['outer key sees descendants through unknown wrappers', `<app:wrapper>${key('K')}</app:wrapper><app:wrapper>${key(' K ')}</app:wrapper>`],
    ['outer key sees keys in separate nested schemas', `<xs:schema><xs:element name="e">${key('K')}</xs:element></xs:schema><xs:schema><xs:element name="f">${key('K')}</xs:element></xs:schema>`],
  ] as const)('rejects %s by a concrete source clause', async (_label, payload) => {
    expect((await source(payload)).result).toMatchObject({kind: 'invalid-schema'});
  });

  it('validates against fixed S4S instead of the application attribute declaration', async () => {
    const {result} = await source('<app:node app:flag="not-int"/>', 'targetNamespace="urn:inert:application" app:flag="not-int"', '<xs:attribute name="flag" type="xs:int"/>');
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: []});
  });
});

describe('independent XSI selected type, fixed universe and root identity duties', () => {
  it.each(['false', '0', 'true', '1'])('rejects nil attribute presence on known non-nillable S4S declaration: %s', async value => {
    expect((await source(`<xs:length value="1" xsi:nil="${value}"/>`)).result).toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    ['same named declared type', '<xs:length xsi:type="xs:numFacet" value="1"/>'],
    ['unknown selects shared simple datatype', '<app:value xsi:type="xs:int">+001</app:value>'],
    ['ordinary string needs no entity declaration', '<app:value xsi:type="xs:string">unparsedName</app:value>'],
    ['known absent type on unknown item falls back lax', '<app:value xsi:type="xs:DefinitelyAbsent">text<app:child/></app:value>'],
    ['undeclared nil has no declaration-conditioned emptiness', '<app:value xsi:nil="true">text<app:child/></app:value>'],
    ['undeclared nil accepts boolean whitespace', '<app:value xsi:nil=" true ">text</app:value>'],
    ['openAttrs has empty content', '<app:value xsi:type="xs:openAttrs"/>'],
    ['annotated has element-only content', '<app:value xsi:type="xs:annotated"> \n<xs:annotation/> </app:value>'],
    ['arbitrary XSI attribute is absent under lax open wildcard', '<app:value xsi:type="xs:openAttrs" xsi:other="anything"/>'],
    ['odd schemaLocation list is valid in no-hint-use episode', '<app:value xsi:schemaLocation="urn:a https://forbidden.example/a.xsd urn:b"/>'],
    ['empty location values have no parity or fetch duty', '<app:value xsi:schemaLocation="" xsi:noNamespaceSchemaLocation=""/>'],
    ['forward IDREF bound in same source assessment root', '<app:value xsi:type="xs:IDREF">later</app:value><xs:annotation id="later"/>'],
    ['IDREFS uses shared list and root reference check', '<app:value xsi:type="xs:IDREFS">first later</app:value><xs:annotation id="first"/><xs:annotation id="later"/>'],
    ['unknown attributes named id are not typed IDs', '<app:value id="same" app:id="same"/><xs:annotation id="same"/>'],
  ] as const)('checks %s', async (_label, payload) => {
    expect((await source(payload)).result).toMatchObject({kind: 'checked', wildcardObligations: []});
  });

  it.each([
    ['numeric selected type value', '<xs:length xsi:type="xs:numFacet" value="-1"/>'],
    ['ancestor override blocked', '<xs:length xsi:type="xs:facet" value="1"/>'],
    ['known declaration cannot fallback on missing type', '<xs:length xsi:type="xs:DefinitelyAbsent" value="1"/>'],
    ['unbound type QName', '<app:value xsi:type="unbound:int">1</app:value>'],
    ['malformed type QName', '<app:value xsi:type="xs:int:bad">1</app:value>'],
    ['boolean nil lexical', '<app:value xsi:nil="TRUE"/>'],
    ['simple type text', '<app:value xsi:type="xs:int">bad</app:value>'],
    ['simple type child', '<app:value xsi:type="xs:int"><app:child/></app:value>'],
    ['simple type arbitrary foreign attribute', '<app:value xsi:type="xs:int" app:a="1">1</app:value>'],
    ['simple type XML attribute', '<app:value xsi:type="xs:int" xml:lang="en">1</app:value>'],
    ['simple type nonbuiltin XSI attribute', '<app:value xsi:type="xs:int" xsi:other="1">1</app:value>'],
    ['abstract selected complex type', '<app:value xsi:type="xs:complexType"/>'],
    ['EMPTY forbids even whitespace characters', '<app:value xsi:type="xs:openAttrs"> </app:value>'],
    ['missing IDREF target', '<app:value xsi:type="xs:IDREF">absent</app:value>'],
    ['intrinsic builtin list cannot be empty', '<app:value xsi:type="xs:IDREFS"> </app:value>'],
    ['typed payload IDs share root scope', '<xs:schema id="duplicate"/><xs:annotation id="duplicate"/>'],
    ['direct NOTATION requires usable declared datatype', '<app:value xsi:type="xs:NOTATION">xs:XMLSchema</app:value>'],
    ['ENTITY requires an actual unparsed entity', '<app:value xsi:type="xs:ENTITY">unparsedName</app:value>'],
    ['ENTITIES requires each actual unparsed entity', '<app:value xsi:type="xs:ENTITIES">first second</app:value>'],
    ['empty ENTITIES fails intrinsic minLength', '<app:value xsi:type="xs:ENTITIES"> </app:value>'],
  ] as const)('rejects %s', async (_label, payload) => {
    expect((await source(payload)).result).toMatchObject({kind: 'invalid-schema'});
  });

  it('retains exact imported XML version debt without inventing missing type authority', async () => {
    const {result} = await source('<app:value xsi:type="xml:UnpinnedType"/>');
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: expect.arrayContaining([
      expect.objectContaining({category: 'annotation-payload-assessment'}),
    ])});
    expect((await source('<xs:documentation xml:lang=""/>')).result).toMatchObject({kind: 'checked', wildcardObligations: expect.arrayContaining([
      expect.objectContaining({rule: 'schema-for-schemas-xml-import-version'}),
    ])});
  });

  // Nonauthor-reviewed inventory boundary, published before fix: #271 6113909173.
  it.each([
    '<app:value xsi:type="xml:Unknown"><xs:element/></app:value>',
    '<xml:Unknown><xs:element/></xml:Unknown>',
  ])('does not guess descendant assessment beneath an unresolved imported declaration/type: %s', async payload => {
    const {result} = await source(payload);
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: expect.arrayContaining([
      expect.objectContaining({category: 'annotation-payload-assessment'}),
    ])});
  });

  it('distinguishes known absent type fallback from blocked named type uncertainty on a known declaration', async () => {
    expect((await source('<app:value xsi:type="xs:DefinitelyAbsent"><xs:element/></app:value>')).result)
      .toMatchObject({kind: 'invalid-schema'});
    expect((await source('<xs:length xsi:type="xml:Unknown" value="1"/>')).result)
      .toMatchObject({kind: 'invalid-schema'});
  });

  it.each([
    '<app:value xml:id="X"/>',
    '<app:value xsi:type="xml:Unknown">X</app:value>',
    '<xml:Unknown id="X"/>',
  ])('retains cvc-id when an unassessed imported property could contribute identity facts: %s', async unknown => {
    const {result} = await source('<app:reference xsi:type="xs:IDREF">X</app:reference>' + unknown);
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: expect.arrayContaining([
      expect.objectContaining({rule: 'cvc-id', category: 'annotation-payload-assessment'}),
    ])});
  });

  it('does not let unrelated import uncertainty erase known duplicate IDs or create impossible language-typed IDs', async () => {
    expect((await source('<xs:annotation id="duplicate"/><xs:annotation id="duplicate"/><app:value xml:unknown="value"/>')).result)
      .toMatchObject({kind: 'invalid-schema'});
    expect((await source('<app:reference xsi:type="xs:IDREF">X</app:reference><app:value xml:lang=""/>')).result)
      .toMatchObject({kind: 'invalid-schema'});
  });

  it('retains fixed key assessment when an unknown imported type can change selected-field typing', async () => {
    const {result} = await source(`<app:value xsi:type="xml:Unknown">${key(' K ')}</app:value>${key('K')}`);
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: expect.arrayContaining([
      expect.objectContaining({rule: 'schema-for-schemas-identity-assessment'}),
    ])});
  });

  it('preserves one terminal request budget failure after a successful exact source check', async () => {
    const {request, result} = await source('<app:value xsi:type="xs:int">1</app:value>');
    expect(result).toMatchObject({kind: 'checked', wildcardObligations: []});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(checkSchemaDocumentSyntax(request.actual)).toBe(request.budget.failure());
  });
});

describe('independent shared fixed-source value authority', () => {
  async function values() {
    const {request, input} = await source('');
    const owner = input.schemas[0].syntax;
    const factory = createSchemaSourceValues(request.budget);
    const type = (local: string) => {
      const lookup = factory.lookup({namespace: 'http://www.w3.org/2001/XMLSchema', local});
      if (lookup.kind !== 'found') throw new Error('Expected fixed declared datatype ' + local);
      return lookup.type;
    };
    const lexical = (value: string) => ({value, context: {namespaces: owner.namespaces, source: owner.source}});
    return {request, owner, factory, type, lexical};
  }

  it('rejects copied, foreign and getter-bearing type handles before inspecting their fields', async () => {
    const {factory, request, owner, type, lexical} = await values();
    const integer = type('int'), other = createSchemaSourceValues(request.budget);
    const foreign = other.lookup({namespace: 'http://www.w3.org/2001/XMLSchema', local: 'int'});
    if (foreign.kind !== 'found') throw new Error('Expected foreign issued handle');
    let calls = 0;
    const forged = {get name() {calls++; return 'int';}, get kind() {calls++; return 'builtin';}} as unknown as FixedSimpleTypeHandle;
    for (const invalid of [{...integer}, foreign.type, forged]) {
      expect(() => factory.assess(invalid, lexical('1'), owner)).toThrow(TypeError);
    }
    expect(calls).toBe(0);
    expect(factory.assess(integer, lexical('+001'), owner)).toMatchObject({kind: 'checked', type: integer,
      value: {family: 'decimal', canonical: '1'}, identityFacts: [], obligations: []});
  });

  it('distinguishes complete fixed absence from the unpinned XML import', async () => {
    const {factory} = await values();
    expect(factory.lookup({namespace: 'http://www.w3.org/2001/XMLSchema', local: 'DefinitelyAbsent'})).toEqual({kind: 'missing'});
    expect(factory.lookup({namespace: 'urn:inert:application', local: 'int'})).toEqual({kind: 'missing'});
    expect(factory.lookup({namespace: 'http://www.w3.org/XML/1998/namespace', local: 'UnpinnedType'}))
      .toEqual({kind: 'unresolved', rule: 'schema-for-schemas-xml-import-version'});
  });

  it('shares list value assembly but retains builtin nonempty versus utility empty-list rules', async () => {
    const {factory, owner, type, lexical} = await values();
    expect(factory.assess(type('NMTOKENS'), lexical(' a\t b\n'), owner)).toMatchObject({kind: 'checked',
      value: {family: 'list', length: '2', items: [{family: 'string', canonical: 'a'}, {family: 'string', canonical: 'b'}]}});
    expect(factory.assess(type('NMTOKENS'), lexical(' \t'), owner)).toMatchObject({kind: 'invalid-schema'});
    const empty = factory.assess(type('derivationSet'), lexical(''), owner);
    expect(empty).toMatchObject({kind: 'checked', value: {family: 'list', length: '0', items: []}, obligations: []});
    if (empty.kind !== 'checked') throw new Error('Expected selected empty utility list');
    expect(empty.selectedMembers).toHaveLength(1);
    expect(factory.assess(empty.selectedMembers[0], lexical(''), owner)).toMatchObject({kind: 'checked', value: {family: 'list', length: '0'}});
  });

  it('preserves ordered fixed union selection as privately issued member handles', async () => {
    const {factory, owner, type, lexical} = await values();
    const named = type('allNNI');
    const numeric = factory.assess(named, lexical('+001'), owner), unbounded = factory.assess(named, lexical('unbounded'), owner);
    expect(numeric).toMatchObject({kind: 'checked', value: {family: 'decimal', canonical: '1'}});
    expect(unbounded).toMatchObject({kind: 'checked', value: {family: 'string', canonical: 'unbounded'}});
    if (numeric.kind !== 'checked' || unbounded.kind !== 'checked') throw new Error('Expected exact fixed union members');
    expect(numeric.selectedMembers).toHaveLength(1); expect(unbounded.selectedMembers).toHaveLength(1);
    expect(numeric.selectedMembers[0]).not.toBe(unbounded.selectedMembers[0]);
    expect(factory.assess(numeric.selectedMembers[0], lexical('-1'), owner)).toMatchObject({kind: 'invalid-schema'});
  });

  it('returns typed ID and IDREF facts tied to original source without claiming root validity', async () => {
    const {factory, owner, type, lexical} = await values();
    expect(factory.assess(type('ID'), lexical(' name '), owner)).toMatchObject({kind: 'checked', identityFacts: [
      {kind: 'ID', value: 'name', source: owner.source},
    ]});
    expect(factory.assess(type('IDREFS'), lexical('first\tsecond'), owner)).toMatchObject({kind: 'checked', identityFacts: [
      {kind: 'IDREF', value: 'first', source: owner.source}, {kind: 'IDREF', value: 'second', source: owner.source},
    ]});
    expect(factory.assess(type('NOTATION'), lexical('xs:XMLSchema'), owner)).toMatchObject({kind: 'invalid-schema', rule: 'enumeration-required-notation'});
  });

  it('does not let a cached issued handle or union branch bypass sticky exhaustion', async () => {
    const {factory, request, owner, type, lexical} = await values();
    const selected = type('allNNI');
    expect(factory.assess(selected, lexical('1'), owner)).toMatchObject({kind: 'checked'});
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(factory.assess(selected, lexical('unbounded'), owner)).toBe(request.budget.failure());
    expect(factory.lookup({namespace: 'http://www.w3.org/2001/XMLSchema', local: 'int'})).toBe(request.budget.failure());
  });

  it('uses fixed-source XML name escapes for selector values without application XPath construction', async () => {
    expect((await source('<xs:key name="Names"><xs:selector xpath="p:élément"/><xs:field xpath="@p:clé"/></xs:key>')).result)
      .toMatchObject({kind: 'checked', wildcardObligations: []});
    expect((await source('<xs:key name="Bad"><xs:selector xpath="p:item[1]"/><xs:field xpath="@id"/></xs:key>')).result)
      .toMatchObject({kind: 'invalid-schema'});
  });
});
