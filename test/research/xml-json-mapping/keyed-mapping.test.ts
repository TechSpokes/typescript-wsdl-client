import {describe, expect, it} from 'vitest';
import {parseOrderedSyntax, resolveLexicalQName} from '../../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../../src/loader/orderedSyntax.js';
import {projectKeyed, reconstructKeyed} from './keyed-mapping.js';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';

const root = {namespace: 'urn:msg', local: 'p'};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:research:keyed').root;
function observe(node: SyntaxElement): unknown {
  return {name: node.name, attributes: node.attributes.map(a => ({name: a.name, value: a.value}))
    .sort((a, b) => JSON.stringify(a.name).localeCompare(JSON.stringify(b.name))),
  children: node.children.map(child => child.kind === 'text' ? child.value : observe(child))};
}

describe('selected keyed research grammar', () => {
  it('derives a fixed qualified attribute identity independently from a same-name child', async () => {
    const name = {namespace: 'urn:vendor', local: 'fixedAttributes'};
    const directory = path.resolve('test/research/xml-json-mapping');
    const prepared = prepareSourceSchemaRequest(await loadSemanticSchemaInput(path.join(directory, 'keyed-attributes.xsd'), {policy: {fileRoots: [directory]}}));
    if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
    const context = prepared.request.actual, element = context.lookup(globalId('element', name));
    if (element.kind !== 'found' || element.node.kind !== 'element') throw new Error('Element missing');
    const type = context.resolve(element.node.type);
    if (type.kind !== 'found' || type.node.kind !== 'complexType') throw new Error('Type missing');
    const attributes = assessSourceAttributeUses(context, type.node.id);
    if (attributes.kind !== 'checked') throw new Error(attributes.kind);
    expect(attributes.value.attributes.map(a => a.name)).toEqual([{namespace: 'urn:vendor', local: 'code'}]);
    expect(attributes.value.wildcard).toBeUndefined();
    const source = xml('<v:fixedAttributes xmlns:v="urn:vendor" v:code="attribute"><v:code>child</v:code></v:fixedAttributes>');
    const hand: unknown = JSON.parse('{"$attributes":[{"code":"attribute"}],"code":"child"}');
    expect(projectKeyed(source)).toEqual(hand);
    const fresh = reconstructKeyed(name, hand);
    expect(observe(fresh)).toEqual({name, attributes: [{name: {namespace: 'urn:vendor', local: 'code'}, value: 'attribute'}],
      children: [{name: {namespace: 'urn:vendor', local: 'code'}, attributes: [], children: ['child']}]});
    expect(projectKeyed(fresh)).toEqual(hand);
    expect(() => reconstructKeyed(name, {$attributes: [{code: {$namespace: 'urn:vendor', $value: 'attribute'}}], code: 'child'})).toThrow();
  });
  it('does not promote unassessed data merely because its root matches a known fixture', () => {
    const name = {namespace: 'urn:vendor', local: 'fixedAttributes'};
    const source = xml('<fixedAttributes xmlns="urn:vendor" code="raw"><code>child</code></fixedAttributes>');
    const hand: unknown = JSON.parse('{"$namespaces":{"":"urn:vendor"},"$attributes":[{"code":"raw"}],"$content":[{"code":{"$namespace":"urn:vendor","$content":[{"$value":"child"}]}}]}');
    expect(projectKeyed(source, true)).toEqual(hand);
    const fresh = reconstructKeyed(name, hand, true);
    expect(fresh.attributes[0]!.name).toEqual({namespace: '', local: 'code'});
    expect(observe(fresh)).toEqual(observe(source));
    expect(projectKeyed(fresh, true)).toEqual(hand);
  });
  it('preserves independent mixed text, nesting and significant spaces', () => {
    const source = xml('<p xmlns="urn:msg" id="7">Hello <b>world</b>!</p>');
    const hand: unknown = JSON.parse('{"id":"7","$content":[{"$value":"Hello "},{"b":"world"},{"$value":"!"}]}');
    expect(projectKeyed(source)).toEqual(hand);
    expect(observe(reconstructKeyed(root, hand))).toEqual({name: root,
      attributes: [{name: {namespace: '', local: 'id'}, value: '7'}], children: ['Hello ',
        {name: {namespace: 'urn:msg', local: 'b'}, attributes: [], children: ['world']}, '!']});
    const nested = xml('<r xmlns="urn:msg"><b>very <i>bright</i> world</b></r>');
    const fresh: unknown = JSON.parse('{"$content":[{"b":{"$content":[{"$value":"very "},{"i":"bright"},{"$value":" world"}]}}]}');
    expect(projectKeyed(nested)).toEqual(fresh);
    expect(observe(reconstructKeyed({...root, local: 'r'}, fresh))).toEqual(observe(nested));
  });

  it('preserves one occurrence per ordered entry and colliding namespace identities', () => {
    const hand: unknown = JSON.parse('{"$content":[{"code":{"$namespace":"urn:vendor","$value":"A"}},{"$value":" "},{"code":{"$namespace":"urn:billing","$value":"B"}},{"code":{"$namespace":"urn:vendor","$value":"C"}}]}');
    const value = reconstructKeyed(root, hand);
    expect(observe(value)).toEqual({name: root, attributes: [], children: [
      {name: {namespace: 'urn:vendor', local: 'code'}, attributes: [], children: ['A']}, ' ',
      {name: {namespace: 'urn:billing', local: 'code'}, attributes: [], children: ['B']},
      {name: {namespace: 'urn:vendor', local: 'code'}, attributes: [], children: ['C']}]});
    expect(projectKeyed(value)).toEqual(hand);
  });

  it('keeps namespace identity separate from inherited prefix context and default namespace', () => {
    const name = {namespace: 'urn:open', local: 'extra'};
    const source = xml('<e:extra xmlns:e="urn:open" xmlns="urn:values" xmlns:p="urn:one" reference="p:Thing"><e:child xmlns:p="urn:two">p:Other</e:child><e:sibling>p:Again</e:sibling></e:extra>');
    const hand: unknown = JSON.parse('{"$namespaces":{"e":"urn:open","":"urn:values","p":"urn:one"},"$attributes":[{"reference":"p:Thing"}],"$content":[{"child":{"$namespace":"urn:open","$namespaces":{"p":"urn:two"},"$content":[{"$value":"p:Other"}]}},{"sibling":{"$namespace":"urn:open","$content":[{"$value":"p:Again"}]}}]}');
    expect(projectKeyed(source, true)).toEqual(hand);
    const reconstructed = reconstructKeyed(name, hand, true);
    const children = reconstructed.children.filter(c => c.kind === 'element');
    expect(children.map(c => c.name.namespace)).toEqual(['urn:open', 'urn:open']);
    expect(resolveLexicalQName('p:Other', children[0]!)).toEqual({namespace: 'urn:two', local: 'Other'});
    expect(resolveLexicalQName('p:Again', children[1]!)).toEqual({namespace: 'urn:one', local: 'Again'});
    expect(resolveLexicalQName('Thing', reconstructed)).toEqual({namespace: 'urn:values', local: 'Thing'});
    expect(observe(reconstructed)).toEqual(observe(source));
  });

  it('keeps unqualified and qualified same-name attributes, safe XML names and raw xsi data', () => {
    const name = {namespace: 'urn:open', local: 'extra'};
    const hand: unknown = JSON.parse('{"$namespaces":{"":"urn:open","v":"urn:vendor","xsi":"http://www.w3.org/2001/XMLSchema-instance"},"$attributes":[{"id":"local"},{"id":{"$namespace":"urn:vendor","$value":"external"}},{"xsiType":{"$namespace":"urn:vendor","$value":"p:Literal"}},{"nil":{"$namespace":"http://www.w3.org/2001/XMLSchema-instance","$value":"true"}}],"$content":[{"__proto__":{"$namespace":"urn:open","$content":[{"$value":"safe"}]}},{"constructor":{"$namespace":"urn:open","$content":[]}}]}');
    const before = JSON.stringify(hand);
    const value = reconstructKeyed(name, hand, true);
    expect(value.attributes.map(a => a.name)).toContainEqual({namespace: '', local: 'id'});
    expect(value.attributes.map(a => a.name)).toContainEqual({namespace: 'urn:vendor', local: 'id'});
    expect(value.children).toHaveLength(2);
    expect(JSON.stringify(hand)).toBe(before);
    expect(Object.prototype).not.toHaveProperty('$content');
    expect(projectKeyed(value, true)).toEqual({...hand as object, $attributes: [
      {id: 'local'}, {nil: {$namespace: 'http://www.w3.org/2001/XMLSchema-instance', $value: 'true'}},
      {id: {$namespace: 'urn:vendor', $value: 'external'}}, {xsiType: {$namespace: 'urn:vendor', $value: 'p:Literal'}},
    ]});
  });

  it('keeps explicit nil and source type identity separate from names and content', () => {
    const hand = {$nil: true, id: '7', $type: {$name: 'Special', $namespace: 'urn:types'}};
    expect(projectKeyed(reconstructKeyed(root, JSON.parse(JSON.stringify(hand))))).toEqual(hand);
    expect(projectKeyed(xml('<p xmlns="urn:msg" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/>'))).toEqual({$nil: true});
  });

  it('normalizes text idempotently and rejects accessors and sparse arrays before reading them', () => {
    const input = {$content: [{$value: 'a'}, {$value: ''}, {$value: ' b'}]};
    const once = projectKeyed(reconstructKeyed(root, input));
    expect(once).toEqual({$content: [{$value: 'a b'}]});
    expect(projectKeyed(reconstructKeyed(root, once))).toEqual(once);
    let called = false;
    const accessor = Object.defineProperty({}, '$content', {enumerable: true, get() {called = true; return [];}});
    expect(() => reconstructKeyed(root, accessor)).toThrow();
    const array = Object.defineProperty([], '0', {get() {called = true; return {$value: 'x'};}});
    expect(() => reconstructKeyed(root, {$content: array})).toThrow();
    expect(() => reconstructKeyed(root, {$content: new Array(1)})).toThrow();
    expect(called).toBe(false);
    const hooked = Object.setPrototypeOf([{$value: 'x'}], {get map() {called = true; throw new Error('hook');}});
    expect(projectKeyed(reconstructKeyed(root, {$content: hooked}))).toEqual({$content: [{$value: 'x'}]});
    expect(called).toBe(false);
    expect(projectKeyed(xml('<extra><child/></extra>'), true)).toEqual({$namespaces: {},
      $content: [{child: {$namespace: '', $content: []}}]});
  });

  it.each([null, {$nil: false}, {$nil: true, $content: []}, {$content: ['bare']},
    {$content: [{$value: 'x', b: 'y'}]}, {$content: [{a: 'x', b: 'y'}]},
    {$content: [{a: 'x', $namespace: 'urn:other'}]}, {$unknown: true},
    {$attributes: [{id: {$namespace: '', $value: 'x'}}], $content: []},
    {$attributes: [{id: 'a'}, {id: 'b'}], $content: []},
  ])('rejects malformed metadata and entries without mutation %#', input => {
    const before = JSON.stringify(input);
    expect(() => reconstructKeyed(root, input)).toThrow();
    expect(JSON.stringify(input)).toBe(before);
  });

  it('rejects unrealizable retained contexts and malformed typed/unassessed forms', () => {
    expect(() => reconstructKeyed({namespace: '', local: 'x'}, {$namespaces: {'': 'urn:other'}, $content: []}, true)).toThrow();
    expect(() => reconstructKeyed({namespace: 'urn:open', local: 'x'}, {$namespaces: {'': 'urn:open'},
      $attributes: [{id: {$namespace: 'urn:open', $value: 'x'}}], $content: []}, true)).toThrow();
    expect(() => reconstructKeyed(root, {$namespaces: {'': 'urn:msg'}, $content: [{x: {$content: []}}]}, true)).toThrow();
  });
});
