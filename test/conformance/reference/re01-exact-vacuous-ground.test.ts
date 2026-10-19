/** Independent source premises; primary source acceptance is not full RE01 authority. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';
import type {XmlNode} from './syntax.js';

const file = 'xsd/recovery/exact-vacuous-consumer.xsd';
const namespace = 'urn:recovery:exact-vacuous-consumer';
function named(schema: XmlNode, kind: string, name: string): XmlNode {
  const node = children(schema, kind).find(node => attribute(node, 'name') === name);
  if (!node) throw new Error('Missing source ' + name);
  return node;
}

describe('independent exact-vacuous consumer source premises', () => {
  it('pins the original exact-B head, empty extensions and legal property-reference recursion', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect([attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault')]).toEqual([undefined, undefined]);
    const a = named(schema, 'complexType', 'A'), sequence = children(a, 'sequence')[0];
    expect(sequence.children).toHaveLength(1);
    expect([attribute(sequence, 'minOccurs'), attribute(sequence, 'maxOccurs')]).toEqual([undefined, undefined]);
    const use = children(sequence, 'element')[0], h = named(schema, 'element', 'H');
    expect(expandedQName(use, attribute(use, 'ref')!)).toEqual({uri: namespace, local: 'H'});
    expect([attribute(use, 'minOccurs'), attribute(use, 'maxOccurs')]).toEqual(['0', undefined]);
    expect(expandedQName(h, attribute(h, 'type')!)).toEqual({uri: namespace, local: 'B'});
    expect([attribute(h, 'block'), attribute(h, 'final'), attribute(h, 'abstract')]).toEqual(['restriction', undefined, undefined]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['X', 'extension', 'R']]) {
      const type = named(schema, 'complexType', name), body = children(type, 'complexContent')[0].children[0];
      expect(body.local).toBe(method);
      expect(expandedQName(body, attribute(body, 'base')!)).toEqual({uri: namespace, local: base});
      expect(body.children).toEqual([]);
    }
    for (const type of children(schema, 'complexType'))
      expect([attribute(type, 'abstract'), attribute(type, 'final'), attribute(type, 'block')]).toEqual([undefined, undefined, undefined]);
    for (const kind of ['attribute', 'anyAttribute', 'choice', 'any']) expect(descendants(schema, kind)).toEqual([]);
    // H's type B reaches A's H reference, while the type BASE edges remain
    // acyclic. This is property recursion, not a generated witness context.
  });

  it('records source and recursive nonempty-instance acceptance separately from the semantic theorem', async () => {
    const result = await validateFixture(file, ['<H xmlns="' + namespace + '"/>', '<H xmlns="' + namespace + '"><H/></H>']);
    expect(result).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [{outcome: 'accepted'}, {outcome: 'accepted'}]});
    // No engine observation supplies full Q_B, universal child nonexistence
    // or the missing semantic inference for the separate renewal family.
  });
});
