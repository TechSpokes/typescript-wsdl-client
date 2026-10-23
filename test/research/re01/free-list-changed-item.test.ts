/** Independent native contrasts: restore a later tagged branch before first tuple enumeration. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {it, expect} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveOriginalComplexParticle, deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawSimpleTypeProperties, RawFacetComponentEntry} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:re01:free-list-changed-item';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const json = (value: unknown) => JSON.stringify(value, (_key, at: unknown) => typeof at === 'bigint' ? String(at) : at);

async function setup(mode: 'wrong-first' | 'restored' | 'item-only-funding' | 'unfunded-restore') {
  const loaded = await loadSemanticSchemaInput(path.join(fixtures, 'xsd/recovery/free-list-changed-item.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(loaded); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  const get = (name: string): ComplexTypeNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); assert.equal(found.node.kind, 'complexType'); return found.node;};
  const a = get('A'), d = get('D'), r = get('R');
  const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const middle: ComplexTypeNode = {...common, kind: 'complexType', id: id('Middle'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'Middle'}},
    abstract: false, mixed: false, attributes: [], derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
  const scalars: SimpleTypeNode[] = [], rows: RawSimpleTypeProperties[] = [];
  const scalar = (name: string, base: Reference, variety: RawSimpleTypeProperties['variety'], facets: readonly RawFacetComponentEntry[]) => {
    const node: SimpleTypeNode = {...common, kind: 'simpleType', id: id(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
      variety: {kind: 'restriction', base, facets: []}};
    scalars.push(node); rows.push({type: node.id, targetNamespace: namespace, base, final: [], variety, facetComponentSet: facets,
      provenance: {kind: 'hypothetical-abstract', originals: []}}); return node;
  };
  const emptyPattern: RawFacetComponentEntry = {annotation: 'absent', facets: [{name: 'pattern', fixed: false, lexical: {value: 'z', context: a.context}}]};
  const killA = scalar('KillA', local(id('DecFirst')), {kind: 'atomic'}, [{baseComponent: 0}, emptyPattern]);
  // The alternate excludes the only decimal donor selected by Item1. Individual
  // member admission of decimal(1) cannot discharge UNION selected-image F2.
  const later = mode === 'unfunded-restore' ? scalar('NoDonor', local(id('DecLater')), {kind: 'atomic'}, [{baseComponent: 0},
    {annotation: 'absent', facets: [{name: 'pattern', fixed: false, lexical: {value: '1|01', context: a.context}}]}]).id : id('DecLater');
  const item1 = scalar('Item1', local(id('Item')), {kind: 'union', members: [local(killA.id), local(id('FloatZero')), local(id('FloatLater')), local(later)]}, []);
  const prior = scalar('Prior', local(id('Words')), {kind: 'list', item: local(item1.id)}, [{baseComponent: 0}, {baseComponent: 1}]);
  const killC = scalar('KillC', local(id('FloatLater')), {kind: 'atomic'}, [{baseComponent: 0}, emptyPattern]);
  const itemJ = scalar('ItemJ', local(item1.id), {kind: 'union', members: [local(killA.id), local(id('FloatZero')), local(killC.id), local(later)]}, []);
  const l0 = scalar('L0', local(prior.id), {kind: 'list', item: local(itemJ.id)}, [{baseComponent: 0}, {baseComponent: 1}]);
  const l1 = scalar('L1', local(l0.id), {kind: 'list', item: local(itemJ.id)}, [{baseComponent: 0}, {baseComponent: 1},
    {annotation: 'absent', facets: [{name: 'enumeration', fixed: false, lexical: {value: mode === 'item-only-funding' ? '1' : '1 1', context: a.context},
      operand: {context: 'active', type: local(l0.id), owner: middle.id}}]}]);
  const members: ElementNode[] = ['1', '2'].map(index => {const memberName = {namespace, local: 'value' + index};
    return {...common, kind: 'element', id: globalId('element', memberName), identity: {kind: 'global', role: 'element', name: memberName},
      name: memberName, type: local(mode === 'wrong-first' ? prior.id : l1.id), abstract: false, nillable: false,
      substitutionGroup: local(globalId('element', {namespace, local: 'head' + index})), value: {kind: 'fixed', lexical: {value: '1 1', context: a.context}}};});
  const wholeA = deriveOriginalComplexParticle(actual, a.id), wholeD = deriveOriginalComplexParticle(actual, d.id), rawR = deriveActualComplexContent(actual, r.id);
  assert.equal(wholeA.kind, 'checked'); assert.equal(wholeD.kind, 'checked'); assert.equal(rawR.kind, 'checked');
  const endpoint: ComplexTypeNode = {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}},
    abstract: false, final: [], block: [], content, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
  const additions = [middle, ...scalars, ...members];
  const built = request.candidate({key: mode, active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawTypes: [raw(a, wholeA.content), raw(r, rawR.view.content), raw(middle, wholeA.content), raw(endpoint, wholeD.content)], rawSimpleTypes: rows,
    rawElements: members.map(member => ({element: member.id, type: member.type, final: [], block: []}))});
  assert.equal(built.kind, 'prepared', json(built));
  const context = built.context, kernel = createSchemaScalarKernel(context);
  const assess = (name: string, value: string) => kernel.assess(local(id(name)), {value, context: a.context}, middle.id);
  const proof = () => verifyFiniteRe01Evidence(actual, d.id, {root: mode, nodes: [{id: mode, parent: actual, context,
    target: d.id, intermediate: middle.id, ancestor: local(a.id), premises: []}]});
  return {actual, context, assess, proof, l0, l1};
}

it('repairs the wrong inherited FIRST branch before genuine two-stage LIST enum funding', async () => {
  const s = await setup('restored');
  const families = (name: string) => {const result = s.assess(name, '1 1'); assert.equal(result.kind, 'checked', json(result));
    return result.value.operand.items!.map(item => item.family);};
  expect(families('Words')).toEqual(['decimal', 'decimal']);
  expect(families('Prior')).toEqual(['float', 'float']);
  expect(families('L0')).toEqual(['decimal', 'decimal']);
  expect(families('L1')).toEqual(['decimal', 'decimal']);
  const donor = s.assess('Item1', '001'), selected = s.assess('ItemJ', '1');
  assert.equal(donor.kind, 'checked'); assert.equal(selected.kind, 'checked');
  expect(donor.value.operand).toMatchObject({family: 'decimal', canonical: '1'});
  expect(selected.value.operand).toMatchObject({family: 'decimal', canonical: '1'});
  for (const node of [s.l0, s.l1]) expect(checkComponentConstruction(s.context, node.id).kind).toBe('checked');
  const proof = s.proof(); assert.equal(proof.kind, 'checked-candidate', json(proof));
  expect(proof.proof).toHaveLength(1);
  expect(proof.claims.universalCoverage).toBe(false);
});

it('rejects an ordinary fixed-value consumer despite individually admitted wrong-FIRST tuples', async () => {
  const s = await setup('wrong-first');
  expect(s.assess('Words', '1 1').kind).toBe('checked');
  expect(s.assess('Prior', '1 1').kind).toBe('checked');
  expect(s.proof()).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: id('D')});
});

it('rejects first enum funding from one ITEM when the immediate LIST BASE requires a whole tuple', async () => {
  const s = await setup('item-only-funding');
  expect(s.assess('ItemJ', '1').kind).toBe('checked');
  expect(s.assess('L0', '1').kind).not.toBe('checked');
  expect(checkComponentConstruction(s.context, s.l1.id)).toMatchObject({kind: 'candidate-rejected', rule: 'cvc-minLength-valid'});
  expect(s.proof()).toMatchObject({kind: 'candidate-rejected', rule: 'cvc-minLength-valid'});
});

it('rejects serial branch restoration when the BASE UNION has no genuine tagged-value donor', async () => {
  const s = await setup('unfunded-restore');
  expect(s.assess('NoDonor', '1').kind).toBe('checked');
  expect(s.assess('Item1', '1').kind).toBe('checked');
  expect(checkComponentConstruction(s.context, id('ItemJ'))).toMatchObject({kind: 'candidate-rejected', rule: 'scalar-value-space-restriction'});
  expect(s.proof()).toMatchObject({kind: 'candidate-rejected', rule: 'scalar-value-space-restriction'});
});
