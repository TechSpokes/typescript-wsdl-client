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
const namespace = 'urn:known-attributes';
const text = '<t:Request xmlns:t="urn:known-attributes" id="synthetic"><t:Item count="7" t:enabled="1"><t:Text>first</t:Text></t:Item><t:Item count="-2"><t:Text>second</t:Text></t:Item></t:Request>';
const expected = {id: 'synthetic', Item: [{count: 7, enabled: true, Text: 'first'}, {count: -2, Text: 'second'}]};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:owned-synthetic-attributes').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'known-attributes.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing independent fixture root');
  return {context, root: found.node};
}

describe('native known-attribute projection', () => {
  it('preserves typed qualified/unqualified attributes in repeated records through JSON serialization', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const result = assessProjectionScalars(context, matched);
    expect(result.kind).toBe('projection-value');
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    expect(matchDirectProjection(context, root, xml(text), {flatOnly: true})).toMatchObject({kind: 'unsupported', rule: 'native-direct-shape'});
  });

  it('constructs fresh ordered XML with exact attribute identities and revalidates without changing the caller', async () => {
    const {context, root} = await source();
    const application = structuredClone(expected);
    const result = expandProjectionValue(context, root, application);
    if (result.kind !== 'projection-expanded') throw new Error(result.rule);
    expect(result.validated.value).toEqual(expected);
    expect(result.payload.attributes).toEqual([{name: {namespace: '', local: 'id'}, lexicalName: 'id', value: 'synthetic'}]);
    const first = result.payload.children[0]!;
    if (first.kind !== 'element') throw new Error('Missing Item');
    expect(first.name).toEqual({namespace, local: 'Item'});
    expect(first.attributes.map(attribute => [attribute.name, attribute.value])).toEqual([
      [{namespace: '', local: 'count'}, '7'], [{namespace, local: 'enabled'}, 'true'],
    ]);
    expect(application).toEqual(expected);
    expect(Object.isFrozen(application)).toBe(false);
  });

  it.each([
    ['required', text.replace(' count="7"', ''), 'missing-required-attribute'],
    ['qualified namespace', text.replace('t:enabled="1"', 'enabled="1"'), 'unknown-attribute'],
    ['unexpected', text.replace('id="synthetic"', 'id="synthetic" extra="x"'), 'unknown-attribute'],
  ])('rejects %s XML attributes before successful projection', async (_name, input, rule) => {
    const {context, root} = await source();
    expect(matchDirectProjection(context, root, xml(input))).toMatchObject({kind: 'mismatch', rule});
  });

  it.each(['yes', '2', 'TRUE'])('rejects invalid upstream Boolean attribute %s', async value => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text.replace('t:enabled="1"', `t:enabled="${value}"`)));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
  });

  it('rejects duplicate attribute identities in supplied syntax and integer overflow', async () => {
    const {context, root} = await source();
    const original = structuredClone(xml(text));
    const duplicate = {...original, attributes: [...original.attributes, original.attributes[0]!]};
    expect(matchDirectProjection(context, root, duplicate)).toMatchObject({kind: 'mismatch', rule: 'duplicate-attribute'});
    expect(Object.isFrozen(original)).toBe(false);
    const matched = matchDirectProjection(context, root, xml(text.replace('count="7"', 'count="2147483648"')));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
    expect(expandProjectionValue(context, root, {id: 'synthetic', Item: [{count: 2147483648, Text: 'first'}]})).toMatchObject({kind: 'scalar-invalid'});
  });

  it.each([
    {Item: []},
    {id: 'synthetic', Item: [{count: '7', Text: 'first'}]},
    {id: 'synthetic', Item: [{count: 7, enabled: 'true', Text: 'first'}]},
    {id: 'synthetic', Item: [{count: 7, Text: 'first', extra: true}]},
  ])('does not rescue invalid application attribute input %#', async application => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, application)).toMatchObject({kind: 'value-invalid'});
  });

  it('supports attribute-only records and keeps explicit bounds and cancellation', async () => {
    const {context, root} = await source('AttributesOnly');
    expect(expandProjectionValue(context, root, {id: 'x'})).toMatchObject({kind: 'projection-expanded', validated: {value: {id: 'x'}}});
    expect(expandProjectionValue(context, root, {id: 'x'}, {maxItems: 0})).toMatchObject({kind: 'resource-limit', rule: 'application item limit'});
    expect(expandProjectionValue(context, root, {id: 'xx'}, {maxText: 1})).toMatchObject({kind: 'resource-limit', rule: 'application text limit'});
    expect(expandProjectionValue(context, root, {id: 'x'}, {signal: AbortSignal.abort()})).toMatchObject({kind: 'cancelled'});
    const plan = planDirectProjection(context, root, () => {}, () => {throw new Error('unsupported');});
    expect(() => flatDirectProjection(plan, () => {}, () => {throw new Error('unsupported');})).toThrow('unsupported');
    expect(matchDirectProjection(context, root, xml('<t:AttributesOnly xmlns:t="urn:known-attributes" id="x"> </t:AttributesOnly>')))
      .toMatchObject({kind: 'mismatch', rule: 'empty-content'});
  });

  it.each(['Defaulted', 'Fixed'])('explicitly assesses optional %s XML attributes without changing application input', async name => {
    const {context, root} = await source(name);
    const application = {};
    const result = expandProjectionValue(context, root, application);
    if (result.kind !== 'projection-expanded') throw new Error(result.rule);
    expect(result.validated.value).toEqual({id: name === 'Fixed' ? 'fixed' : 'default'});
    expect(result.payload.attributes).toEqual([]);
    expect(application).toEqual({});
    expect(Object.isFrozen(application)).toBe(false);
    if (name === 'Fixed') expect(expandProjectionValue(context, root, {id: 'wrong'})).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
    else expect(expandProjectionValue(context, root, {id: ''})).toMatchObject({kind: 'projection-expanded', validated: {value: {id: ''}}});
  });

  it.each([
    ['Collision', {$attributes: [{id: 'attribute'}], id: 'child'}],
    ['NamespaceCollision', {$attributes: [{enabled: false}, {enabled: {$namespace: namespace, $value: true}}]}],
    ['Wildcard', {$namespaces: {}, $attributes: [{extra: 'lexical'}]}],
  ])('preserves source-permitted %s with its selected attribute channel', async (name, application) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, application)).toMatchObject({kind: 'projection-expanded', validated: {value: application}});
  });
});
