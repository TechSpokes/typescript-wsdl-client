import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:list-scalars';
const text = '<t:Request xmlns:t="urn:list-scalars"><t:Numbers> +01 2 </t:Numbers><t:Flags>1 false</t:Flags><t:Codes>+001 +002</t:Codes><t:Words>alpha beta</t:Words></t:Request>';
const expected = {Numbers: [1, 2], Flags: [true, false], Codes: ['+001', '+002'], Words: ['alpha', 'beta'], Tags: ['one', 'two']};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:synthetic-list-payload').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'list-scalars.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('native list scalar projection', () => {
  it('preserves ordered typed items, item witnesses and defaulted attribute lists through JSON and inverse construction', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const result = assessProjectionScalars(context, matched);
    expect(result).toMatchObject({kind: 'projection-value', value: expected});
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    const application = structuredClone(expected);
    expect(expandProjectionValue(context, root, application)).toMatchObject({kind: 'projection-expanded', validated: {value: expected}});
    expect(application).toEqual(expected); expect(Object.isFrozen(application.Numbers)).toBe(false);
  });

  it.each([
    ['empty bound', '<t:Numbers> +01 2 </t:Numbers>', '<t:Numbers/>'],
    ['maximum length', ' +01 2 ', '1 2 3 4'],
    ['integer bound', ' +01 2 ', '2147483648'],
    ['Boolean', '1 false', 'true yes'],
    ['item pattern', '+001 +002', '1 2'],
  ])('enforces %s with native declared datatype validation', async (_label, before, after) => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text.replace(before, after)));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
  });

  it('supports empty lists, builtin token lists and list-valued simple content without widening the flat preview', async () => {
    const strings = await source('Strings');
    expect(expandProjectionValue(strings.context, strings.root, [])).toMatchObject({kind: 'projection-expanded', validated: {value: []}});
    const tokens = await source('Tokens');
    expect(expandProjectionValue(tokens.context, tokens.root, ['alpha', 'beta'])).toMatchObject({kind: 'projection-expanded', validated: {value: ['alpha', 'beta']}});
    expect(expandProjectionValue(tokens.context, tokens.root, [])).toMatchObject({kind: 'scalar-invalid'});
    expect(matchDirectProjection(tokens.context, tokens.root, xml('<t:Tokens xmlns:t="urn:list-scalars">alpha beta</t:Tokens>'), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
    const simple = await source('Text');
    expect(expandProjectionValue(simple.context, simple.root, {id: 'synthetic', $value: [1, 2]})).toMatchObject({kind: 'projection-expanded', validated: {value: {id: 'synthetic', $value: [1, 2]}}});
  });

  it('retains whole-list lexical witnesses for list-level patterns', async () => {
    const {context, root} = await source('Patterned');
    expect(expandProjectionValue(context, root, '01 02')).toMatchObject({kind: 'projection-expanded', validated: {value: '01 02'}});
    expect(expandProjectionValue(context, root, '1 2')).toMatchObject({kind: 'scalar-invalid'});
    expect(expandProjectionValue(context, root, [1, 2])).toMatchObject({kind: 'value-invalid', rule: 'string-required'});
  });

  it('does not coerce scalar strings, item types or whitespace-containing string items into lists', async () => {
    const ints = await source('Ints');
    expect(expandProjectionValue(ints.context, ints.root, '1 2')).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(ints.context, ints.root, ['1', '2'])).toMatchObject({kind: 'value-invalid'});
    const strings = await source('Strings');
    expect(expandProjectionValue(strings.context, strings.root, ['a b'])).toMatchObject({kind: 'value-invalid', rule: 'list-item-token-required'});
    expect(expandProjectionValue(strings.context, strings.root, [''])).toMatchObject({kind: 'value-invalid', rule: 'list-item-token-required'});
  });

  it('rejects sparse/accessor/proxy arrays and enforces explicit input item/text limits', async () => {
    const {context, root} = await source('Strings');
    expect(expandProjectionValue(context, root, ['a', 'b'], {maxItems: 2})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, ['a', 'b'], {maxItems: 3})).toMatchObject({kind: 'projection-expanded'});
    expect(expandProjectionValue(context, root, ['aa'], {maxText: 1})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, new Array(2))).toMatchObject({kind: 'value-invalid'});
    let traps = 0;
    const getter = Object.defineProperty(['a'], '0', {get() {traps++; return 'a';}});
    expect(expandProjectionValue(context, root, getter)).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, new Proxy(['a'], {get() {traps++; return 'a';}}))).toMatchObject({kind: 'value-invalid'});
    expect(traps).toBe(0);
    expect(expandProjectionValue(context, root, ['a'], {signal: AbortSignal.abort()})).toMatchObject({kind: 'cancelled'});
  });
});
