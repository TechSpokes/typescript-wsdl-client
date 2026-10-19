/** Independent source/clause controls; local primary acceptance is not RE01 success. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml, XSD} from './syntax.js';
import type {XmlNode} from './syntax.js';

const namespace = 'urn:recovery:helper-renewal';
function named(schema: XmlNode, kind: string, name: string): XmlNode {
  const node = children(schema, kind).find(node => attribute(node, 'name') === name);
  if (!node) throw new Error('Missing source ' + name);
  return node;
}
function body(schema: XmlNode, name: string): XmlNode {
  const type = named(schema, 'complexType', name);
  return children(type, 'complexContent')[0]?.children[0] ?? type;
}

describe('independent renewing-helper source and predicate premises', () => {
  it.each(['consumed', 'unconsumed'] as const)('pins the exact %s source, anchors and recursive-reference contrast', async mode => {
    const file = 'xsd/recovery/helper-renewal-' + mode + '.xsd';
    const text = readFileSync(localFixture(file), 'utf8');
    const schema = parseXml(text, file);
    if (mode === 'consumed') expect(text.replaceAll('name="z" type="t:X"', 'name="z" type="xs:string"'))
      .toBe(readFileSync(localFixture('xsd/recovery/helper-renewal-unconsumed.xsd'), 'utf8'));
    const a = children(body(schema, 'A'), 'sequence')[0], x = children(body(schema, 'X'), 'sequence')[0];
    expect([attribute(a, 'minOccurs'), attribute(x, 'minOccurs')]).toEqual(['0', '0']);
    const headUse = children(a, 'element')[0], repeated = children(x, 'sequence')[0];
    expect(expandedQName(headUse, attribute(headUse, 'ref')!)).toEqual({uri: namespace, local: 'H'});
    expect([attribute(headUse, 'minOccurs'), attribute(headUse, 'maxOccurs')]).toEqual(['4', '4']);
    expect([attribute(repeated, 'minOccurs'), attribute(repeated, 'maxOccurs')]).toEqual(['2', '2']);
    expect(children(repeated, 'element').map(node => attribute(node, 'name'))).toEqual(['H', 'H']);
    expect(children(a, 'choice')[0].children.map(node => attribute(node, 'name'))).toEqual(['Q', 'H']);
    for (const outer of [a, x]) {
      const z = children(outer, 'element').find(node => attribute(node, 'name') === 'z')!;
      expect(expandedQName(z, attribute(z, 'type')!)).toEqual(mode === 'consumed'
        ? {uri: namespace, local: 'X'} : {uri: XSD, local: 'string'});
    }
    const h = named(schema, 'element', 'H'), q = named(schema, 'element', 'Q');
    for (const declaration of [h, q]) {
      expect(expandedQName(declaration, attribute(declaration, 'type')!)).toEqual({uri: namespace, local: 'B'});
      expect(attribute(declaration, 'abstract')).toBeUndefined();
    }
    for (const declaration of [...children(repeated, 'element'), ...children(children(a, 'choice')[0], 'element')])
      expect(expandedQName(declaration, attribute(declaration, 'type')!)).toEqual({uri: namespace, local: 'B'});
    expect(children(repeated, 'element').map(node => attribute(node, 'block'))).toEqual(['restriction', 'restriction']);
    expect(children(children(a, 'choice')[0], 'element').find(node => attribute(node, 'name') === 'H')!.attributes)
      .toContainEqual({uri: '', local: 'block', value: 'restriction'});
    expect([attribute(h, 'block'), attribute(q, 'block')]).toEqual(['restriction', 'extension restriction']);
    expect(attribute(h, 'substitutionGroup')).toBe('t:Q');
    expect([attribute(h, 'final'), attribute(q, 'final')]).toEqual([undefined, undefined]);
    expect(expandedQName(body(schema, 'B'), attribute(body(schema, 'B'), 'base')!)).toEqual({uri: namespace, local: 'A'});
    expect(body(schema, 'B').local).toBe('extension');
    expect(children(body(schema, 'B'), 'sequence')).toEqual([]);
    expect((await validateFixture(file))).toMatchObject({phase: 'schema', outcome: 'accepted'});
    // libxml2 accepts local source construction and recursion; it does not
    // implement the missing full cos-ct-extends.1.5 evidence theorem.
  });

});
