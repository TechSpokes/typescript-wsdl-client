import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';
import {planDirectProjection, flatDirectProjection} from '../../src/compiler/directStructurePlan.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:inherited-records';
const text = '<t:Request xmlns:t="urn:inherited-records" id="synthetic" note="kept"><t:BaseValue>7</t:BaseValue><t:Label>base</t:Label><t:Flag>1</t:Flag><t:Item count="2"><t:Text>first</t:Text></t:Item><t:Item count="3"><t:Text>second</t:Text></t:Item></t:Request>';
const expected = {id: 'synthetic', note: 'kept', BaseValue: 7, Label: 'base', Flag: true, Item: [{count: 2, Text: 'first'}, {count: 3, Text: 'second'}]};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:synthetic-inherited-payload').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'inherited-records.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing fixture root');
  return {context, root: found.node};
}

describe('native inherited record projection', () => {
  it('preserves multi-level inherited element order, attributes and repeated nested records', async () => {
    const {context, root} = await source();
    const plan = planDirectProjection(context, root, () => {}, () => {throw new Error('unsupported');});
    const record = plan.records.find(record => record.type.id === (plan.root.kind === 'record' ? plan.root.type : ''))!;
    expect(record.slots.map(slot => slot.element.name.local)).toEqual(['BaseValue', 'Label', 'Flag', 'Item']);
    expect(record.attributes.map(attribute => attribute.declaration.name.local).sort()).toEqual(['id', 'note']);
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const result = assessProjectionScalars(context, matched);
    expect(result).toMatchObject({kind: 'projection-value', value: expected});
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    const inverse = expandProjectionValue(context, root, structuredClone(expected));
    if (inverse.kind !== 'projection-expanded') throw new Error(inverse.rule);
    expect(inverse.payload.children.filter(node => node.kind === 'element').map(node => node.name.local)).toEqual(['BaseValue', 'Label', 'Flag', 'Item', 'Item']);
    expect(inverse.validated.value).toEqual(expected);
    expect(() => flatDirectProjection(plan, () => {}, () => {throw new Error('unsupported');})).toThrow('unsupported');
  });

  it.each([
    ['inherited order', text.replace('<t:BaseValue>7</t:BaseValue>', '').replace('<t:Flag>', '<t:BaseValue>7</t:BaseValue><t:Flag>')],
    ['inherited attribute', text.replace(' id="synthetic"', '')],
    ['inherited required element', text.replace('<t:Flag>1</t:Flag>', '')],
    ['nested required attribute', text.replace(' count="2"', '')],
  ])('rejects %s violations without a successful projection', async (_name, value) => {
    const {context, root} = await source();
    expect(matchDirectProjection(context, root, xml(value))).toMatchObject({kind: 'mismatch'});
  });

  it('maps restriction properties without retaining removed optional members or prohibited attributes', async () => {
    const {context, root} = await source('Restricted');
    const value = {id: 'synthetic', BaseValue: 7, Flag: true, Item: {count: 2, Text: 'first'}};
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(expandProjectionValue(context, root, {...value, Label: 'removed'})).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, {...value, note: 'prohibited'})).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, {...value, Item: [value.Item]})).toMatchObject({kind: 'value-invalid'});
  });

  it('uses inherited content when an extension has no local particle or attributes', async () => {
    const {context, root} = await source('InheritedOnly');
    const value = {id: 'synthetic', note: 'kept', BaseValue: 7, Flag: false};
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(expandProjectionValue(context, root, {BaseValue: 7, Flag: false})).toMatchObject({kind: 'value-invalid', rule: 'missing-attribute'});
  });

  it('retains truly empty inherited content and rejects whitespace children', async () => {
    const {context, root} = await source('EmptyLeaf');
    expect(expandProjectionValue(context, root, {})).toMatchObject({kind: 'projection-expanded', validated: {value: {}}});
    expect(matchDirectProjection(context, root, xml('<t:EmptyLeaf xmlns:t="urn:inherited-records"> </t:EmptyLeaf>'))).toMatchObject({kind: 'mismatch', rule: 'empty-content'});
  });

  it('does not distribute a correlated optional group into independently optional properties', async () => {
    const {context, root} = await source('Correlated');
    expect(expandProjectionValue(context, root, {A: 'alone'})).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, {$content: []})).toMatchObject({kind: 'projection-expanded'});
  });
});
