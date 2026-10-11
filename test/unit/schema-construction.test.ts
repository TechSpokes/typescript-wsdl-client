/** Local aggregate controls specified in #271 issuecomment-6112039450. */
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkComponentConstruction, assertComponentConstruction, isAbsentOriginalSourceComponent} from '../../src/compiler/schemaConstructionAssessment.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {AttributeGroupNode, ComplexTypeNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import {assessRawAttributeUses} from '../../src/compiler/schemaAttributeUses.js';
import type {RawAttributeGroupProperties} from '../../src/compiler/schemaAttributeGroupProperties.js';
import {validateRawAttributeGroupShape} from '../../src/compiler/schemaAttributeGroupProperties.js';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
const NS = 'http://www.w3.org/2001/XMLSchema';
const schema = (body: string) => `<xs:schema xmlns:xs="${NS}" xmlns:t="urn:construction" targetNamespace="urn:construction">${body}</xs:schema>`;
const empty = '<xs:complexType name="A"/><xs:complexType name="B"><xs:complexContent><xs:restriction base="t:A"/></xs:complexContent></xs:complexType><xs:complexType name="D"><xs:complexContent><xs:extension base="t:B"/></xs:complexContent></xs:complexType><xs:complexType name="T"><xs:complexContent><xs:extension base="t:A"/></xs:complexContent></xs:complexType>';
const simple = '<xs:complexType name="S"><xs:simpleContent><xs:extension base="xs:string"/></xs:simpleContent></xs:complexType><xs:complexType name="Z"><xs:simpleContent><xs:extension base="t:S"/></xs:simpleContent></xs:complexType>';
async function load(body: string, maxWork = 10_000_000): Promise<SemanticRequest> {
  const uri = 'https://construction.test/source.xsd', bytes = Buffer.from(schema(body));
  const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://construction.test']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])});
  const result = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork})});
  if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
  return result.request;
}
function named(r: SemanticRequest, name: string) {
  return r.graph.nodes.find(n => n.identity.kind === 'global' && n.identity.name.local === name)!;
}
const check = (r: SemanticRequest, name: string) => checkComponentConstruction(r.actual, named(r, name).id);

describe('concrete local component construction', () => {
  it('checks empty local premises and emits exact primitive/nonprimitive RE01 obligations separately', async () => {
    const r = await load(empty);
    expect(check(r, 'A')).toMatchObject({kind: 'checked', obligations: [], re01: undefined});
    expect(check(r, 'B')).toMatchObject({kind: 'checked', obligations: [], dependencies: [named(r, 'A').id]});
    expect(check(r, 'T')).toMatchObject({kind: 'checked', obligations: [], re01: {target: named(r, 'T').id,
      ancestor: {target: named(r, 'A').id}, primitive: true}});
    expect(check(r, 'D')).toMatchObject({kind: 'checked', obligations: [], re01: {target: named(r, 'D').id,
      ancestor: {target: named(r, 'A').id}, primitive: false}});
  });
  it('uses exact effective scalar content for source extension and anonymous restriction facades', async () => {
    const r = await load(simple + '<xs:complexType name="R"><xs:simpleContent><xs:restriction base="t:S"><xs:minLength value="1"/></xs:restriction></xs:simpleContent></xs:complexType>');
    expect(check(r, 'S')).toMatchObject({kind: 'checked', obligations: [], re01: undefined,
      discharged: [{rule: 'raw-simple-content-derivation-validity', component: named(r, 'S').id}]});
    expect(check(r, 'Z')).toMatchObject({kind: 'checked', obligations: [], re01: {primitive: false}});
    expect(check(r, 'R')).toMatchObject({kind: 'checked', obligations: [], re01: undefined});
  });
  it('rejects simple-base restriction and extension blocked by immediate final', async () => {
    const r = await load('<xs:complexType name="Bad"><xs:simpleContent><xs:restriction base="xs:string"/></xs:simpleContent></xs:complexType>');
    expect(check(r, 'Bad').kind).toBe('invalid-schema');
    const blocked = await load(empty.replace('name="A"/>', 'name="A" final="extension"/>'));
    expect(check(blocked, 'T')).toMatchObject({kind: 'invalid-schema', rule: 'ct-props-correct.final'});
  });
  it('checks abstract scalar identity rather than accepting a merely different declared scalar', async () => {
    const r = await load(simple), nodes = r.graph.nodes.filter((n): n is ComplexTypeNode => n.kind === 'complexType');
    const raw: RawComplexTypeProperties[] = nodes.map(n => ({type: n.id,
      derivation: {base: n.derivation!.base, method: n.derivation!.kind}, abstract: false, final: [], block: [],
      content: {kind: 'simple', type: {kind: 'builtin', name: {namespace: NS, local: n.id === named(r, 'Z').id ? 'int' : 'string'}}},
      attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [n.id]}}));
    const prepared = r.candidate({key: 'different-content', active: r.actual.members, rawTypes: raw});
    if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
    expect(checkComponentConstruction(prepared.context, named(r, 'Z').id)).toMatchObject({kind: 'candidate-rejected', rule: 'cos-ct-extends.1.4.1'});
    const missing = r.candidate({key: 'no-raw', active: r.actual.members});
    if (missing.kind !== 'prepared') throw new Error(JSON.stringify(missing));
    expect(checkComponentConstruction(missing.context, named(r, 'Z').id)).toMatchObject({kind: 'unresolved', rule: 'missing-raw-complex-type-properties'});
  });
  it('checks absent local syntax but preserves semantic obligations for referenced globals', async () => {
    const r = await load('<xs:attribute name="badGlobal" type="xs:anyType"/><xs:complexType name="Hidden"><xs:sequence><xs:element name="ghost" type="xs:int" default="invalid" minOccurs="0" maxOccurs="0"/></xs:sequence><xs:attribute name="hidden" type="xs:anyType" use="prohibited"/><xs:attribute ref="t:badGlobal" use="prohibited"/></xs:complexType>');
    const hidden = r.graph.nodes.filter(n => n.identity.kind !== 'global' && isAbsentOriginalSourceComponent(r.actual, n.id));
    expect(hidden.length).toBeGreaterThanOrEqual(4);
    for (const n of hidden) expect(checkComponentConstruction(r.actual, n.id)).toMatchObject({kind: 'checked', scope: 'original-source-syntax-only'});
    expect(isAbsentOriginalSourceComponent(r.actual, named(r, 'badGlobal').id)).toBe(false);
    expect(check(r, 'badGlobal')).toMatchObject({kind: 'invalid-schema', rule: 'a-props-correct.2'});
    const candidate = r.candidate({key: 'zero-is-not-a-component', active: r.actual.members});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    const zero = r.graph.nodes.find(n => n.kind === 'particle' && n.occurs.max === '0')!;
    expect(checkComponentConstruction(candidate.context, zero.id)).toMatchObject({kind: 'candidate-rejected', rule: 'p-props-correct'});
  });
  it('uses formal particle emptiability and concrete local all/UPA/EDC owners', async () => {
    const body = '<xs:complexType name="A"><xs:sequence><xs:element name="a" type="xs:string" minOccurs="0"/></xs:sequence></xs:complexType><xs:complexType name="B"><xs:complexContent><xs:restriction base="t:A"/></xs:complexContent></xs:complexType>';
    expect(check(await load(body), 'B')).toMatchObject({kind: 'checked', obligations: []});
    expect(check(await load(body.replace('minOccurs="0"', 'minOccurs="1"')), 'B')).toMatchObject({kind: 'invalid-schema', rule: 'derivation-ok-restriction.5'});
    const pointless = await load('<xs:complexType name="Empty"/><xs:complexType name="Pointless"><xs:complexContent><xs:restriction base="t:Empty"><xs:sequence/></xs:restriction></xs:complexContent></xs:complexType>');
    expect(check(pointless, 'Pointless')).toMatchObject({kind: 'checked', obligations: []});
  });
  it('discharges mixed declaration value obligations with exact formal emptiability', async () => {
    const body = '<xs:complexType name="M" mixed="true"><xs:sequence><xs:element name="a" type="xs:string" minOccurs="0"/></xs:sequence></xs:complexType><xs:element name="value" type="t:M" default="text"/>';
    expect(check(await load(body), 'value')).toMatchObject({kind: 'checked', obligations: []});
    expect(check(await load(body.replace('minOccurs="0"', 'minOccurs="1"')), 'value')).toMatchObject({kind: 'invalid-schema', rule: 'e-props-correct.2'});
  });
  it('uses the qualified ur-type self-base instead of selecting the target as its own ancestor', async () => {
    const r = await load('<xs:complexType name="Ur"><xs:complexContent mixed="true"><xs:extension base="xs:anyType"/></xs:complexContent></xs:complexType>');
    expect(check(r, 'Ur')).toMatchObject({kind: 'checked', obligations: [], re01: {primitive: true,
      ancestor: {kind: 'builtin', name: {namespace: NS, local: 'anyType'}}}});
  });
  it('checks EDC and UPA on unused named model groups and their compositors', async () => {
    const body = '<xs:group name="Unused"><xs:choice><xs:element name="a" type="xs:string"/><xs:element name="a" type="xs:int"/></xs:choice></xs:group>';
    const edc = await load(body);
    expect(check(edc, 'Unused')).toMatchObject({kind: 'invalid-schema', rule: 'cos-element-consistent'});
    const compositor = edc.graph.nodes.find(n => n.kind === 'particle' && n.term.kind === 'choice')!;
    expect(checkComponentConstruction(edc.actual, compositor.id)).toMatchObject({kind: 'invalid-schema', rule: 'cos-element-consistent'});
    expect(check(await load(body.replace('type="xs:int"', 'type="xs:string"')), 'Unused'))
      .toMatchObject({kind: 'invalid-schema', rule: 'cos-nonambig'});
    expect(check(await load(body.replace('name="a" type="xs:int"', 'name="b" type="xs:int"')), 'Unused'))
      .toMatchObject({kind: 'checked', obligations: []});
  });
  it('checks fresh literal attribute groups using the supplied full set rather than source contributions', async () => {
    const r = await load('<xs:attribute name="a" type="xs:int" fixed="7"/><xs:attributeGroup name="G"><xs:attribute ref="t:a"/></xs:attributeGroup>');
    const original = named(r, 'G') as AttributeGroupNode;
    const name = {namespace: 'urn:construction', local: 'Fresh'};
    const helper: AttributeGroupNode = {...original, id: globalId('attributeGroup', name), identity: {kind: 'global', role: 'attributeGroup', name}, attributes: []};
    const properties: RawAttributeGroupProperties = {group: helper.id, attributeUses: [original.attributes[0], original.attributes[0]],
      wildcard: {namespace: {kind: 'set', namespaces: ['urn:allowed']}, processContents: 'strict', sources: []}};
    const result = r.candidate({key: 'raw-group', active: [...r.actual.members, helper.id], additions: [helper], rawAttributeGroups: [properties]});
    if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
    const assessed = assessRawAttributeUses(result.context, helper.id);
    expect(assessed).toMatchObject({kind: 'checked', value: {uses: [{id: original.attributes[0]}]}});
    expect(checkComponentConstruction(result.context, helper.id)).toMatchObject({kind: 'checked', obligations: [], dependencies: expect.arrayContaining([original.attributes[0]])});
    const missing = r.candidate({key: 'source-group-is-not-raw', active: [...r.actual.members, helper.id], additions: [helper]});
    if (missing.kind !== 'prepared') throw new Error(JSON.stringify(missing));
    expect(checkComponentConstruction(missing.context, helper.id)).toMatchObject({kind: 'unresolved', rule: 'raw-attribute-group-properties'});
  });
  it('retains group-specific QName and ID uniqueness across distinct AU identities', async () => {
    for (const idTyped of [false, true]) {
      const r = await load(`<xs:attribute name="a" type="xs:${idTyped ? 'ID' : 'string'}"/><xs:attribute name="b" type="xs:ID"/><xs:attributeGroup name="G"><xs:attribute ref="t:a"/></xs:attributeGroup><xs:attributeGroup name="H"><xs:attribute ref="t:${idTyped ? 'b' : 'a'}"/></xs:attributeGroup>`);
      const a = named(r, 'G') as AttributeGroupNode, z = named(r, 'H') as AttributeGroupNode;
      const prepared = r.candidate({key: 'distinct-group-members', active: r.actual.members,
        rawAttributeGroups: [{group: a.id, attributeUses: [a.attributes[0], z.attributes[0]]}]});
      if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
      expect(assessRawAttributeUses(prepared.context, a.id)).toMatchObject({kind: 'candidate-rejected', rule: idTyped ? 'ag-props-correct.3' : 'ag-props-correct.2'});
    }
  });
  it('rejects raw group accessors without reading their values', () => {
    let read = false;
    const raw = {group: 'group', get attributeUses() {read = true; return [];}};
    expect(() => validateRawAttributeGroupShape(raw, createSemanticBudget({maxWork: 10000}))).toThrow('Invalid raw attribute group properties');
    expect(read).toBe(false);
  });
  it('returns a semantic rejection rather than throwing for malformed raw occurrence properties', async () => {
    const r = await load('<xs:group name="G"><xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence></xs:group>');
    const original = r.graph.nodes.find((n): n is ParticleNode => n.kind === 'particle' && n.term.kind === 'element')!;
    const owner = named(r, 'G').id, path = '/raw-malformed';
    const helper: ParticleNode = {...original, id: scopedId(owner, path, 'particle'),
      identity: {kind: 'scoped', owner, path, role: 'particle'}, occurs: {min: '2', max: '1'}};
    const result = r.candidate({key: 'malformed-range', active: [...r.actual.members, helper.id], additions: [helper]});
    if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
    expect(checkComponentConstruction(result.context, helper.id)).toMatchObject({kind: 'candidate-rejected', message: 'Malformed occurrence range'});
  });
  it('authenticates local receipts, retains failures after exhaustion and never promotes copied evidence', async () => {
    const r = await load(empty), receipt = check(r, 'A');
    if (receipt.kind !== 'checked') throw new Error(JSON.stringify(receipt));
    expect(() => assertComponentConstruction(r.actual, receipt)).not.toThrow();
    expect(() => assertComponentConstruction(r.actual, {...receipt})).toThrow('Unauthenticated');
    const other = await load(empty);
    expect(() => assertComponentConstruction(other.actual, receipt)).toThrow('foreign');
    expect(() => checkComponentConstruction({...r.actual}, receipt.component)).toThrow('Unauthenticated');
    r.budget.guard(() => r.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(check(r, 'A').kind).toBe('resource-limit');
    expect(check(r, 'A').kind).toBe('resource-limit');
  });
});
