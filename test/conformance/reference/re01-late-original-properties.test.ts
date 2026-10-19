/** Independent source premises, separate from hypothetical B construction. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/late-original-complex-properties.xsd';
const namespace = 'urn:recovery:late-original-properties';

describe('independent late-original property source premises', () => {
  it('pins exact bases, optional tail identities and a restriction-blocking original head', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect(attribute(schema, 'elementFormDefault')).toBe('qualified');
    expect([attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault')]).toEqual([undefined, undefined]);
    const types = children(schema, 'complexType');
    expect(types.map(node => attribute(node, 'name')).sort()).toEqual(['A', 'A2', 'B', 'B2', 'R', 'R2', 'X']);
    const named = (name: string) => {
      const node = types.find(node => attribute(node, 'name') === name);
      if (!node) throw new Error(name); return node;
    };
    expect(named('A').children).toEqual([]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'],
      ['X', 'extension', 'R'], ['R2', 'extension', 'A2'], ['B2', 'extension', 'A2']]) {
      const body = children(named(name), 'complexContent')[0].children[0];
      expect(body.local).toBe(method);
      expect(expandedQName(body, attribute(body, 'base')!)).toEqual({uri: namespace, local: base});
      if (name !== 'B2') expect(body.children).toEqual([]);
    }
    const prefix = children(named('A2'), 'sequence')[0], p = children(prefix, 'element')[0];
    expect(prefix.children).toHaveLength(1);
    expect(attribute(p, 'name')).toBe('p');
    expect(expandedQName(p, attribute(p, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    const body = children(named('B2'), 'complexContent')[0].children[0], tail = children(body, 'sequence')[0];
    const [n, use] = children(tail, 'element'); expect(tail.children).toHaveLength(2);
    expect(attribute(n, 'name')).toBe('N');
    expect(expandedQName(n, attribute(n, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    expect(expandedQName(use, attribute(use, 'ref')!)).toEqual({uri: namespace, local: 'H'});
    for (const node of [p, n, use]) expect([attribute(node, 'minOccurs'), attribute(node, 'maxOccurs')]).toEqual(['0', undefined]);
    for (const sequence of [prefix, tail]) expect([attribute(sequence, 'minOccurs'), attribute(sequence, 'maxOccurs')]).toEqual([undefined, undefined]);
    const globals = children(schema, 'element'); expect(globals).toHaveLength(1);
    const h = globals[0]; expect(attribute(h, 'name')).toBe('H');
    expect(expandedQName(h, attribute(h, 'type')!)).toEqual({uri: namespace, local: 'A2'});
    expect(attribute(h, 'block')).toBe('restriction');
    for (const node of [...types, h]) for (const field of ['abstract', 'final', 'mixed', 'nillable']) expect(attribute(node, field)).toBeUndefined();
    for (const kind of ['attribute', 'anyAttribute', 'any', 'choice', 'annotation', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('records original schema and prefix-instance acceptance without acting as a hypothetical RE01 oracle', async () => {
    expect(await validateFixture(file, ['<H xmlns="' + namespace + '"/>',
      '<H xmlns="' + namespace + '"><p>text</p></H>', '<H xmlns="' + namespace + '"><N>text</N></H>']))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
        {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'},
      ]});
  });
});
