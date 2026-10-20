/** Source premises only; an XML engine cannot certify the hypothetical EMPTY component or its forest. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/abstract-particle-wildcard-properties.xsd';
const namespace = 'urn:re01:abstract-particle-wildcard';
describe('independent abstract-particle source premises', () => {
  it('pins empty host derivations and the two disjoint required singleton namespace bases', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const types = children(schema, 'complexType');
    expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'B', 'R', 'D', 'B0', 'B1']);
    const named = (name: string) => {const found = types.find(type => attribute(type, 'name') === name); if (!found) throw new Error(name); return found;};
    expect(named('A').children).toEqual([]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['D', 'extension', 'R']]) {
      const body = children(named(name), 'complexContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!), body.children])
        .toEqual([method, {uri: namespace, local: base}, []]);
    }
    for (const [name, allowed] of [['B0', 'urn:left'], ['B1', 'urn:right']]) {
      const extension = children(children(named(name), 'complexContent')[0], 'extension')[0];
      expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: 'A'});
      const sequence = children(extension, 'sequence')[0], wildcard = children(sequence, 'any')[0];
      expect(sequence.children).toHaveLength(1);
      expect([attribute(sequence, 'minOccurs'), attribute(sequence, 'maxOccurs'), attribute(wildcard, 'minOccurs'), attribute(wildcard, 'maxOccurs')])
        .toEqual([undefined, undefined, undefined, undefined]);
      expect([attribute(wildcard, 'namespace'), attribute(wildcard, 'processContents')]).toEqual([allowed, 'strict']);
    }
    const head = children(schema, 'element')[0];
    expect([attribute(head, 'name'), attribute(head, 'abstract'), expandedQName(head, attribute(head, 'type')!)])
      .toEqual(['h', 'true', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}]);
    for (const name of ['attribute', 'anyAttribute', 'key', 'keyref', 'unique', 'annotation']) expect(descendants(schema, name)).toEqual([]);
  });

  it('qualifies the original schema without treating the engine as an abstract EMPTY oracle', async () => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
