import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {parseOrderedSyntax, resolveLexicalQName} from '../../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../../src/loader/orderedSyntax.js';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {matchDirectProjection} from '../../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../../src/compiler/directValues.js';
import {forward, inverse, XSI} from './mapping.js';

const xml = (input: string) => parseOrderedSyntax(Buffer.from(input), 'urn:research:input').root;
const fresh = (input: unknown): unknown => JSON.parse(JSON.stringify(input));
const n = (local: string, namespace = 'urn:msg') => ({namespace, local});
const entry = (local: string, value: unknown) => ({name: n(local), value});
const fixture = (file: string) => readFile(new URL(file, import.meta.url), 'utf8');

// @why Independent observations never invoke the forward converter or compare syntax provenance.
function observe(node: SyntaxElement, context = false): unknown {
  const nil = node.attributes.find(a => a.name.namespace === XSI && a.name.local === 'nil');
  const type = node.attributes.find(a => a.name.namespace === XSI && a.name.local === 'type');
  return {
    name: node.name,
    nil: nil ? ['true', '1'].includes(nil.value.trim()) : false,
    attributes: node.attributes.filter(a => !(a.name.namespace === XSI && ['nil', 'type'].includes(a.name.local))).map(a => ({name: a.name, value: a.value}))
      .sort((a, b) => JSON.stringify(a.name).localeCompare(JSON.stringify(b.name), 'en')),
    ...(type ? {type: resolveLexicalQName(type.value, node)} : {}),
    ...(context ? {scope: Object.fromEntries(Object.entries(node.namespaces).filter(([prefix]) => prefix !== 'xml'))} : {}),
    content: node.children.map(child => child.kind === 'text' ? child.value : observe(child, context)),
  };
}
const leaf = (local: string, content: unknown[] = [], namespace = 'urn:msg') => ({name: n(local, namespace), nil: false, attributes: [], content});

describe('research XML/JSON contract, without native admission', () => {
  it('proves mixed leading/trailing text from independent JSON and independent expected observations', async () => {
    const expectedJson: unknown = JSON.parse(await fixture('mixed.json'));
    const original = xml(await fixture('mixed.xml'));
    expect(forward(original)).toEqual(expectedJson);
    const expected = {...leaf('p', ['Hello ', leaf('b', ['world']), '!']), attributes: [{name: n('id', ''), value: '7'}]};
    expect(observe(inverse(n('p'), fresh(forward(original))))).toEqual(expected);
    const before = JSON.stringify(expectedJson);
    expect(observe(inverse(n('p'), expectedJson))).toEqual(expected);
    expect(JSON.stringify(expectedJson)).toBe(before);
  });

  it('preserves variable a,b,a and interstitial significant spaces, including nested content', () => {
    const input = {$content: [entry('a', '1'), '  ', entry('b', {$content: ['x', entry('i', 'y'), 'z']}), entry('a', '2')]};
    const expected = leaf('r', [leaf('a', ['1']), '  ', leaf('b', ['x', leaf('i', ['y']), 'z']), leaf('a', ['2'])]);
    expect(observe(inverse(n('r'), fresh(input)))).toEqual(expected);
    const parsed = xml('<r xmlns="urn:msg"><a>1</a>  <b>x<i>y</i>z</b><a>2</a></r>');
    expect(forward(parsed)).toEqual(input);
    expect(observe(inverse(n('r'), fresh(forward(parsed))))).toEqual(expected);
  });

  it('keeps absent, empty, nil attributes, nil items and nil wrappers distinct', () => {
    expect(observe(inverse(n('x'), ''))).toEqual(leaf('x'));
    const expectedNil = {...leaf('x'), nil: true};
    expect(observe(inverse(n('x'), null))).toEqual(expectedNil);
    const hand = {$nil: true, id: '7', $attributes: [{name: n('id', 'urn:attr'), value: 'qualified'}]};
    expect(observe(inverse(n('x'), fresh(hand)))).toEqual({...expectedNil, attributes: [
      {name: n('id', ''), value: '7'}, {name: n('id', 'urn:attr'), value: 'qualified'},
    ]});
    expect(forward(xml('<x xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:a="urn:attr" xsi:nil="1" id="7" a:id="qualified"/>'))).toEqual(hand);
    const items = inverse(n('items'), {$content: [entry('x', null), entry('x', ''), entry('x', hand)]});
    expect(items.children).toHaveLength(3);
    expect(observe(items)).toEqual(leaf('items', [expectedNil, leaf('x'), {...expectedNil, attributes: [
      {name: n('id', ''), value: '7'}, {name: n('id', 'urn:attr'), value: 'qualified'},
    ]}]));
    expect(observe(inverse(n('items'), null))).toEqual({...leaf('items'), nil: true});
    expect(inverse(n('r'), {$content: []}).children).toEqual([]);
    expect(forward(xml('<x xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="false"/>'))).toBe('');
  });

  it('preserves open names, child/attribute collisions and complete per-node rebinding from hand JSON', async () => {
    const hand: unknown = JSON.parse(await fixture('open.json'));
    const scope = {'': 'urn:open', p: 'urn:one', a: 'urn:attrs'};
    const expected = {...leaf('r', [
      'p:literal',
      {...leaf('id', [' p:T '], 'urn:attrs'), scope: {...scope, p: 'urn:two'}, attributes: [{name: n('constructor', 'urn:two'), value: 'p:T'}]},
      {...leaf('__proto__', ['safe'], 'urn:open'), scope},
      {...leaf('constructor', [], 'urn:open'), scope},
    ], 'urn:open'), scope, attributes: [{name: n('id', ''), value: 'plain'}, {name: n('id', 'urn:attrs'), value: 'qualified'}]};
    const original = xml(await fixture('open.xml'));
    expect(forward(original, true)).toEqual(hand);
    expect(observe(inverse(n('r', 'urn:open'), hand, true), true)).toEqual(expected);
    expect(observe(inverse(n('r', 'urn:open'), fresh(forward(original, true)), true), true)).toEqual(expected);
    expect(Object.prototype).not.toHaveProperty('safe');
  });

  it('uses declared QName meaning, never colon heuristics, and preserves dynamic type identity', () => {
    for (const prefix of ['p', 'alias']) {
      const parsed = xml(`<q xmlns="urn:typed" xmlns:${prefix}="urn:meaning">${prefix}:T</q>`);
      expect(forward(parsed)).toEqual(n('T', 'urn:meaning'));
    }
    const typed = inverse(n('q', 'urn:typed'), fresh(n('T', 'urn:meaning')));
    expect(resolveLexicalQName((typed.children[0] as {value: string}).value, typed)).toEqual(n('T', 'urn:meaning'));
    const rebound = xml('<r xmlns:p="urn:one"><q xmlns="urn:typed" xmlns:p="urn:two">p:T</q></r>');
    expect(forward(rebound)).toEqual({$content: [{name: n('q', 'urn:typed'), value: n('T', 'urn:two')}]});
    expect(forward(xml('<s>unbound:T</s>'))).toBe('unbound:T');
    const hand = {$type: n('Special', 'urn:types'), $content: []};
    expect(observe(inverse(n('r'), hand))).toEqual({...leaf('r'), type: n('Special', 'urn:types')});
    expect(forward(xml('<r xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:t="urn:types" xsi:type="t:Special"/>'))).toEqual(hand);
    expect(() => forward(xml('<q xmlns="urn:typed">unbound:T</q>'))).toThrow('Unbound QName prefix');
  });

  it('normalizes text segmentation and ignores agreed lexical boundaries', () => {
    const original = xml('<r xmlns="urn:msg">a<![CDATA[b]]><!--ignored--><?pi x?>c<i/>d</r>');
    expect(forward(original)).toEqual({$content: ['abc', entry('i', ''), 'd']});
    expect(forward(inverse(n('r'), {$content: ['', 'a', 'b', entry('i', ''), 'd']}))).toEqual({$content: ['ab', entry('i', ''), 'd']});
  });

  it('retains default undeclaration, prototype-like scope keys and avoids retained prefixes for typed values', () => {
    const hand: unknown = JSON.parse('{"$namespaces":{"":"","__proto__":"urn:opaque","q1":"urn:retained"},"$type":{"namespace":"urn:type","local":"T"},"$content":[]}');
    const rebuilt = inverse(n('r', ''), hand, true);
    expect(Object.hasOwn(rebuilt.namespaces, '__proto__')).toBe(true);
    expect(rebuilt.namespaces.__proto__).toBe('urn:opaque');
    expect(rebuilt.namespaces.q1).toBe('urn:retained');
    expect(rebuilt.namespaces.q2).toBe('urn:type');
    const type = rebuilt.attributes.find(a => a.name.local === 'type')!;
    expect(resolveLexicalQName(type.value, rebuilt)).toEqual(n('T', 'urn:type'));
    const sourceValue = xml('<r xmlns="urn:outer"><s xmlns=""/></r>');
    const observed = inverse(n('r', 'urn:outer'), fresh(forward(sourceValue, true)), true);
    expect((observed.children[0] as SyntaxElement).namespaces['']).toBe('');
  });

  it('rejects malformed metadata without mutation or invented XML', () => {
    const malformed: unknown[] = [
    {$nil: false}, {$nil: true, $content: []}, {$nil: true, $value: ''}, {$content: [], $unknown: true},
    {$content: [], constructor: 'not a source slot'}, {$content: [{$text: 'new vocabulary'}]},
    {$content: [{name: n('a')}]}, {$content: [{name: n('$bad'), value: ''}]},
    {$content: [], $attributes: [{name: n('id', ''), value: 'duplicate channel'}]},
    {$content: [], $attributes: [{name: n('nil', XSI), value: 'true'}]},
    {$content: [], $attributes: [{name: n('xmlns', ''), value: 'urn:bad'}]},
    {$content: [], $attributes: [{name: n('a'), value: '1'}, {name: n('a'), value: '2'}]},
    {$value: 'not QName'}, {$content: [42]}, {$content: [], $type: {namespace: 'urn:t'}},
    {$content: [], $namespaces: {}},
    ];
    for (const input of malformed) {
      const before = JSON.stringify(input);
      expect(() => inverse(n('x'), input)).toThrow(TypeError);
      expect(JSON.stringify(input)).toBe(before);
    }
  });

  it('rejects missing/illegal open scopes and data hooks without executing them', () => {
    expect(() => inverse(n('r'), {$content: []}, true)).toThrow();
    for (const scope of [{p: ''}, {xml: 'urn:wrong'}, {xmlns: 'urn:bad'}]) {
      expect(() => inverse(n('r'), {$namespaces: scope, $content: []}, true)).toThrow();
    }
    let reads = 0;
    const hook = Object.defineProperty({}, '$content', {enumerable: true, get() {reads++; return [];}});
    expect(() => inverse(n('r'), hook)).toThrow();
    expect(reads).toBe(0);
    expect(() => inverse(n('r'), {$content: new Array(1)})).toThrow();
    expect(() => forward(xml('<x xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true">text</x>')))
      .toThrow('native duty: nil forbids content');
  });
});

async function nativeSource(file: string, namespace: string, local: string) {
  const directory = path.resolve('test/conformance/fixtures/xsd/projection');
  const loaded = await loadSemanticSchemaInput(path.join(directory, file), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(loaded);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual, found = context.lookup(globalId('element', {namespace, local}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('fixture declaration missing');
  return {context, root: found.node};
}

describe('accepted component controls use existing native owners', () => {
  it('preserves fixed-order records, repeated items, typed peer attributes and Boolean/int32 values', async () => {
    const {context, root} = await nativeSource('known-attributes.xsd', 'urn:known-attributes', 'Request');
    const hand = {id: '7', Item: [{count: 2, enabled: true, Text: 'a'}, {count: -1, Text: 'b'}]};
    const expanded = expandProjectionValue(context, root, fresh(hand));
    if (expanded.kind !== 'projection-expanded') throw new Error(expanded.rule);
    expect(expanded.payload.children.filter(child => child.kind === 'element').map(child => child.name.local)).toEqual(['Item', 'Item']);
    const matched = matchDirectProjection(context, root, expanded.payload);
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value: hand});
    const wire = xml('<t:Request xmlns:t="urn:known-attributes" id="7"><t:Item count="2" t:enabled="1"><t:Text>a</t:Text></t:Item><t:Item count="-1"><t:Text>b</t:Text></t:Item></t:Request>');
    const match = matchDirectProjection(context, root, wire);
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    expect(assessProjectionScalars(context, match)).toMatchObject({kind: 'projection-value', value: hand});
  });
  it('preserves exact decimal strings and existing simple $value records', async () => {
    const scalar = await nativeSource('scalar-records.xsd', 'urn:scalar-records', 'Decimal');
    expect(expandProjectionValue(scalar.context, scalar.root, fresh('9007199254740993.25')))
      .toMatchObject({kind: 'projection-expanded', validated: {value: '9007199254740993.25'}});
    const simple = await nativeSource('simple-content-records.xsd', 'urn:simple-content-records', 'Number');
    const hand = {Currency: 'USD', $value: '12.5'};
    expect(expandProjectionValue(simple.context, simple.root, fresh(hand))).toMatchObject({kind: 'projection-expanded', validated: {value: hand}});
  });
});
