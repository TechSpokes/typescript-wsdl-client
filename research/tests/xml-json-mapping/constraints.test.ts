import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {parseOrderedSyntax, resolveLexicalQName} from '../../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../../src/loader/orderedSyntax.js';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {matchDirectProjection} from '../../../src/compiler/directStructure.js';
import {assessProjectionScalars} from '../../../src/compiler/directValues.js';

const parse = (text: string) => parseOrderedSyntax(Buffer.from(text), 'urn:research:constraints').root;
const elements = (node: SyntaxElement) => node.children.filter((child): child is SyntaxElement => child.kind === 'element');
const text = (node: SyntaxElement) => node.children.map(child => child.kind === 'text' ? child.value : '').join('');

// @why Deliberately lossy projections supply counterexamples, not a proposed converter or native validator.
function groupedLeaves(node: SyntaxElement) {
  const result: Record<string, string[]> = Object.create(null);
  for (const child of elements(node)) (result[child.name.local] ??= []).push(text(child));
  return result;
}

describe('syntax-independent information constraints', () => {
  it('establishes a common native contract permitting two observably different child orders', async () => {
    const directory = path.resolve('test/conformance/fixtures/xsd/projection');
    const input = await loadSemanticSchemaInput(path.join(directory, 'ordered-particles.xsd'), {policy: {fileRoots: [directory]}});
    const prepared = prepareSourceSchemaRequest(input);
    if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
    const context = prepared.request.actual;
    const found = context.lookup(globalId('element', {namespace: 'urn:ordered-particles', local: 'All'}));
    if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('declaration missing');
    const first = parse('<All xmlns="urn:ordered-particles"><A>1</A><B>true</B></All>');
    const second = parse('<All xmlns="urn:ordered-particles"><B>true</B><A>1</A></All>');
    for (const xml of [first, second]) {
      const matched = matchDirectProjection(context, found.node, xml);
      if (matched.kind !== 'projection-match') throw new Error(matched.rule);
      expect(assessProjectionScalars(context, matched).kind).toBe('projection-value');
    }
    expect(elements(first).map(node => node.name.local)).toEqual(['A', 'B']);
    expect(elements(second).map(node => node.name.local)).toEqual(['B', 'A']);
    expect(groupedLeaves(first)).toEqual(groupedLeaves(second));
  });

  it('shows that per-name grouping loses an instance-selected sequence', () => {
    const first = parse('<r><a>1</a><b>2</b><a>3</a></r>');
    const second = parse('<r><a>1</a><a>3</a><b>2</b></r>');
    expect(elements(first).map(node => node.name.local)).toEqual(['a', 'b', 'a']);
    expect(elements(second).map(node => node.name.local)).toEqual(['a', 'a', 'b']);
    expect(groupedLeaves(first)).toEqual(groupedLeaves(second));
  });

  it('shows that separate text and child collections lose mixed positions', () => {
    const first = parse('<p>Hello <b>world</b>!</p>');
    const second = parse('<p>Hello !<b>world</b></p>');
    expect(text(first)).toBe(text(second));
    expect(groupedLeaves(first)).toEqual(groupedLeaves(second));
    expect(first.children.map(node => node.kind)).toEqual(['text', 'element', 'text']);
    expect(second.children.map(node => node.kind)).toEqual(['text', 'element']);
  });

  it('shows that a dynamic local name alone loses identity', () => {
    const first = elements(parse('<r><a:item xmlns:a="urn:one">x</a:item></r>'))[0]!;
    const second = elements(parse('<r><a:item xmlns:a="urn:two">x</a:item></r>'))[0]!;
    expect(first.name.local).toBe(second.name.local);
    expect(first.name.namespace).toBe('urn:one');
    expect(second.name.namespace).toBe('urn:two');
  });

  it('shows that flattening role or nil attributes can erase actual information', () => {
    const attribute = parse('<r id="7"/>'), child = parse('<r><id>7</id></r>');
    expect(attribute.attributes.map(item => [item.name.local, item.value])).toEqual([['id', '7']]);
    expect(elements(child).map(item => [item.name.local, text(item)])).toEqual([['id', '7']]);
    const nil = parse('<x xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true" id="7"/>');
    const otherNil = parse('<x xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true" id="9"/>');
    const nilOnly = (node: SyntaxElement) => node.attributes.some(item => item.name.local === 'nil' && item.value === 'true') ? null : text(node);
    expect(nilOnly(nil)).toBe(nilOnly(otherNil));
    expect(nil.attributes.find(item => item.name.local === 'id')?.value).toBe('7');
    expect(otherNil.attributes.find(item => item.name.local === 'id')?.value).toBe('9');
    expect(nil.children).toEqual([]);
  });

  it('shows context dependence without inferring QName semantics from colon strings', () => {
    const first = parse('<q xmlns:p="urn:one">p:T</q>');
    const second = parse('<q xmlns:p="urn:two">p:T</q>');
    expect(text(first)).toBe(text(second));
    expect(resolveLexicalQName(text(first), first)).toEqual({namespace: 'urn:one', local: 'T'});
    expect(resolveLexicalQName(text(second), second)).toEqual({namespace: 'urn:two', local: 'T'});
    expect(text(parse('<s>unbound:T</s>'))).toBe('unbound:T');
  });

  it('demonstrates that an ordered selection does not require name/value wrappers', () => {
    const wire = elements(parse('<r><a>1</a><b>2</b><a>3</a></r>'));
    const keyed: unknown = JSON.parse('[{"a":"1"},{"b":"2"},{"a":"3"}]');
    if (!Array.isArray(keyed)) throw new Error('independent JSON must be a sequence');
    const namesAndText = keyed.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') throw new Error('entry must be an object');
      const members = Object.entries(entry);
      if (members.length !== 1 || typeof members[0]![1] !== 'string') throw new Error('one string-valued member required');
      return members[0];
    });
    expect(namesAndText).toEqual([['a', '1'], ['b', '2'], ['a', '3']]);
    expect(wire.map(node => [node.name.local, text(node)])).toEqual(namesAndText);
  });
});
