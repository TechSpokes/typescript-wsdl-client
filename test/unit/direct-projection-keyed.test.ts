import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
async function source(local = 'p') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'keyed-values.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace: 'urn:keyed-values', local}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('source-selected keyed mixed values', () => {
  it('derives same-local child namespaces from fixed source positions without redundant identity metadata', async () => {
    const {context, root} = await source('fixedNames');
    const value = {$content: [{code: 'first'}, {$value: ' between '}, {code: 'second'}]};
    const xml = '<m:fixedNames xmlns:m="urn:keyed-values" xmlns:k="urn:keyed-known"><m:code>first</m:code> between <k:code>second</k:code></m:fixedNames>';
    const matched = matchDirectProjection(context, root, parseOrderedSyntax(Buffer.from(xml), 'urn:hand-fixed-names').root);
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value});
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(expandProjectionValue(context, root, {$content: [{code: {$namespace: 'urn:keyed-values', $value: 'first'}}, {code: 'second'}]})).toMatchObject({kind: 'value-invalid'});
  });
  it('selects actual namespace identities only for colliding child names', async () => {
    const {context, root} = await source('names');
    const value = {$content: [{code: {$namespace: 'urn:keyed-values', $value: 'local'}}, {code: {$namespace: 'urn:keyed-known', $value: 'foreign'}}]};
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    const xml = '<m:names xmlns:m="urn:keyed-values" xmlns:k="urn:keyed-known"><m:code>local</m:code><k:code>foreign</k:code></m:names>';
    const matched = matchDirectProjection(context, root, parseOrderedSyntax(Buffer.from(xml), 'urn:hand-names').root);
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value});
    expect(expandProjectionValue(context, root, {$content: [{code: 'ambiguous'}]})).toMatchObject({kind: 'value-invalid'});
    const nil = {$content: [{code: {$namespace: 'urn:keyed-values', $nil: true}}]};
    expect(expandProjectionValue(context, root, nil)).toMatchObject({kind: 'projection-expanded', validated: {value: nil}});
  });

  it('normalizes text segmentation while refusing unknown metadata, getters, cycles and resource excess', async () => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {$content: [{$value: ''}, {$value: ' A'}, {$value: ' '}, {b: 'B'}, {$value: '!'}]}))
      .toMatchObject({kind: 'projection-expanded', validated: {value: {$content: [{$value: ' A '}, {b: 'B'}, {$value: '!'}]}}});
    for (const value of [{$content: [{b: 'B', $value: 'bad'}]}, {$content: [{$value: 7}]}, {$content: [{b: {$namespace: 'urn:keyed-values', $value: 'redundant'}}]},
      {$content: [{$kind: 'element'}]}, {$content: [], $value: 'conflict'}, {$content: [{$value: '\u0000'}]}]) {
      expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'value-invalid'});
    }
    let reads = 0;
    const entry = Object.defineProperty({}, 'b', {enumerable: true, get() {reads++; return 'B';}});
    expect(expandProjectionValue(context, root, {$content: [entry]})).toMatchObject({kind: 'value-invalid'});
    expect(reads).toBe(0);
    const cyclic: {$content: unknown[]} = {$content: []}; cyclic.$content.push({p: cyclic});
    expect(expandProjectionValue(context, root, cyclic)).toMatchObject({kind: 'value-invalid', rule: 'cyclic-value'});
    expect(expandProjectionValue(context, root, {$content: [{$value: 'long'}]}, {maxText: 3})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, {$content: [{b: 'B'}]}, {maxItems: 0})).toMatchObject({kind: 'resource-limit'});
    const abort = new AbortController(); abort.abort();
    expect(expandProjectionValue(context, root, {$content: []}, {signal: abort.signal})).toMatchObject({kind: 'cancelled'});
  });
  it.each(['open', 'strict', 'skip'])('enforces %s wildcard assessment independently of familiar payload names', async local => {
    const {context, root} = await source(local);
    const head = local === 'open' ? '<m:count>2</m:count>' : '';
    const parse = (child: string) => parseOrderedSyntax(Buffer.from(`<m:${local} xmlns:m="urn:keyed-values" xmlns:k="urn:keyed-known">${head}${child}</m:${local}>`), 'urn:hand-policy').root;
    const known = matchDirectProjection(context, root, parse('<k:number>not-an-int</k:number>'));
    expect(known.kind).toBe('projection-match');
    if (known.kind !== 'projection-match') throw new Error(known.rule);
    expect(assessProjectionScalars(context, known).kind).toBe(local === 'skip' ? 'projection-value' : 'scalar-invalid');
    expect(matchDirectProjection(context, root, parse('<k:unknown>lexical</k:unknown>')).kind).toBe(local === 'strict' ? 'mismatch' : 'projection-match');
    expect(matchDirectProjection(context, root, parse('')).kind).toBe('mismatch');
  });

  it('retains assessed complex wildcard fields and rejects extra scalar-holder metadata before construction', async () => {
    const {context, root} = await source('open');
    const value = {$namespaces: {'': '', m: 'urn:keyed-values', k: 'urn:keyed-known'}, $content: [{count: 2}, {box: {$namespace: 'urn:keyed-known', item: 'kept'}}]};
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    const nil = {...value, $content: [{count: 2}, {number: {$namespace: 'urn:keyed-known', $nil: true}}]};
    expect(expandProjectionValue(context, root, nil)).toMatchObject({kind: 'projection-expanded', validated: {value: nil}});
    for (const metadata of [{$unknown: true}, {$nil: true}, {$content: []}, {$namespaces: {}}]) {
      expect(expandProjectionValue(context, root, {...value, $content: [{count: 2}, {number: {$namespace: 'urn:keyed-known', $value: 7, ...metadata}}]})).toMatchObject({kind: 'value-invalid'});
    }
  });
  it('keeps fixed and wildcard-dispatched children distinct even when their local names match', async () => {
    const {context, root} = await source('open');
    const value = {$namespaces: {'': '', m: 'urn:keyed-values', k: 'urn:keyed-known'}, $content: [{count: 2}, {count: {$namespace: 'urn:keyed-known', $value: 3}}]};
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
  });
  it('derives a qualified colliding attribute identity and keeps the child role', async () => {
    const {context, root} = await source('collision');
    const xml = '<m:collision xmlns:m="urn:keyed-values" m:code="attribute"><m:code>child</m:code></m:collision>';
    const value = {$attributes: [{code: 'attribute'}], code: 'child'};
    const matched = matchDirectProjection(context, root, parseOrderedSyntax(Buffer.from(xml), 'urn:hand-collision').root);
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value});
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(expandProjectionValue(context, root, {$attributes: [{code: {$namespace: 'urn:keyed-values', $value: 'attribute'}}], code: 'child'})).toMatchObject({kind: 'value-invalid'});
  });

  it('keeps lax unknown lexical data, nested scopes and typed siblings without guessing xsi meaning', async () => {
    const {context, root} = await source('open');
    const xml = '<m:open xmlns:m="urn:keyed-values" xmlns:e="urn:extra" xmlns:p="urn:first" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><m:count>2</m:count><e:extra xsi:nil="not-a-boolean">p:Thing<e:inner xmlns:p="urn:second">p:Other</e:inner></e:extra></m:open>';
    const value = {$namespaces: {'': '', m: 'urn:keyed-values', e: 'urn:extra', p: 'urn:first', xsi: 'http://www.w3.org/2001/XMLSchema-instance'}, $content: [
      {count: 2}, {extra: {$namespace: 'urn:extra', $attributes: [{nil: {$namespace: 'http://www.w3.org/2001/XMLSchema-instance', $value: 'not-a-boolean'}}],
        $content: [{$value: 'p:Thing'}, {inner: {$namespace: 'urn:extra', $namespaces: {p: 'urn:second'}, $content: [{$value: 'p:Other'}]}}]}}]};
    const matched = matchDirectProjection(context, root, parseOrderedSyntax(Buffer.from(xml), 'urn:hand-open').root);
    expect(matched.kind).toBe('projection-match');
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value});
    expect(expandProjectionValue(context, root, JSON.parse(JSON.stringify(value)))).toMatchObject({kind: 'projection-expanded', validated: {value}});
  });
  it('preserves recursive mixed text and fresh hand JSON without changing its grammar for empty instances', async () => {
    const {context, root} = await source();
    const xml = '<p xmlns="urn:keyed-values" id="7">Hello <b>world</b>!<p> nested <b>B</b> </p><p/></p>';
    const value = {id: '7', $content: [{$value: 'Hello '}, {b: 'world'}, {$value: '!'},
      {p: {$content: [{$value: ' nested '}, {b: 'B'}, {$value: ' '}]}}, {p: {$content: []}}]};
    const matched = matchDirectProjection(context, root, parseOrderedSyntax(Buffer.from(xml), 'urn:hand-mixed').root);
    expect(matched.kind).toBe('projection-match');
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value});
    const hand: unknown = JSON.parse(JSON.stringify(value));
    expect(expandProjectionValue(context, root, hand)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(hand).toEqual(value);
    expect(Object.isFrozen(hand)).toBe(false);
  });
});
