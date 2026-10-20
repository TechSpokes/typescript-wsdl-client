/** Independent source geometry; the engine is not a hypothetical-frontier oracle. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const namespace = 'urn:research:endpoint-origin-frontier';
const cases = [
  {file: 'xsd/recovery/original-particle-handles-independent.xsd', tail: 'H'},
  {file: 'xsd/recovery/original-particle-self-reference-independent.xsd', tail: 'Self'},
] as const;

describe('independent original-particle selection premises', () => {
  it.each(cases)('pins original base/content/reference identity for $tail', ({file, tail}) => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect(attribute(schema, 'elementFormDefault')).toBeUndefined();
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'B', 'D', 'A0', 'B0']);
    const a = types[0], b = children(children(types[1], 'complexContent')[0], 'restriction')[0];
    const d = children(children(types[2], 'complexContent')[0], 'extension')[0];
    expect(expandedQName(b, attribute(b, 'base')!)).toEqual({uri: namespace, local: 'A'});
    expect(expandedQName(d, attribute(d, 'base')!)).toEqual({uri: namespace, local: 'B'});
    for (const owner of [a, b]) {
      const sequence = children(owner, 'sequence')[0], p = children(sequence, 'element')[0];
      expect(sequence.children).toHaveLength(1);
      expect([attribute(p, 'name'), attribute(p, 'minOccurs'), attribute(p, 'maxOccurs')]).toEqual(['p', '0', undefined]);
      expect(expandedQName(p, attribute(p, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    }
    const sequence = children(d, 'sequence')[0], use = children(sequence, 'element')[0];
    expect(sequence.children).toHaveLength(1); expect(attribute(use, 'minOccurs')).toBe('0');
    expect(expandedQName(use, attribute(use, 'ref')!)).toEqual({uri: namespace, local: tail});
    const globals = children(schema, 'element'), h = globals.find(element => attribute(element, 'name') === 'H');
    expect(h).toBeDefined(); expect(expandedQName(h!, attribute(h!, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    if (tail === 'Self') {
      const self = globals.find(element => attribute(element, 'name') === 'Self'); expect(self).toBeDefined();
      expect(expandedQName(self!, attribute(self!, 'type')!)).toEqual({uri: namespace, local: 'D'});
    }
    for (const kind of ['any', 'attribute', 'anyAttribute', 'annotation', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it.each(cases)('qualifies the original $tail schema without deciding hypothetical component origin', async ({file}) => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });

  it('pins a real original compositor with one mapped use and one suppressed source use', () => {
    const file = 'xsd/recovery/original-particle-suppressed-child-independent.xsd';
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file), types = children(schema, 'complexType');
    expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'R', 'D']); expect(types[0].children).toEqual([]);
    const ns = 'urn:research:handle-suppressed-child'; expect(attribute(schema, 'targetNamespace')).toBe(ns);
    const restriction = children(children(types[1], 'complexContent')[0], 'restriction')[0];
    expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({uri: ns, local: 'A'});
    const extension = children(children(types[2], 'complexContent')[0], 'extension')[0];
    expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: ns, local: 'R'});
    const sequence = children(extension, 'sequence')[0], uses = children(sequence, 'element');
    expect(uses.map(use => [attribute(use, 'name'), attribute(use, 'minOccurs'), attribute(use, 'maxOccurs')]))
      .toEqual([['p', '0', undefined], ['z', '0', '0']]);
    for (const use of uses) expect(expandedQName(use, attribute(use, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
  });

  it('qualifies the suppressed-child source independently of either raw selector', async () => {
    expect(await validateFixture('xsd/recovery/original-particle-suppressed-child-independent.xsd', []))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
