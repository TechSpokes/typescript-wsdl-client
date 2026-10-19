/** Independent source/ur-origin premises, not a hypothetical RE01 oracle. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/original-construction-inputs-independent.xsd';
const namespace = 'urn:recovery:consumed-wrapper';

describe('independent consumed original-input premises', () => {
  it('pins the original native-base extension and skip restriction without conflating their particles', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'B', 'R', 'X', 'Ur', 'D']);
    const named = (name: string) => {const type = types.find(type => attribute(type, 'name') === name); if (!type) throw new Error(name); return type;};
    expect(named('A').children).toEqual([]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['X', 'extension', 'R']]) {
      const body = children(named(name), 'complexContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!), body.children]).toEqual([method, {uri: namespace, local: base}, []]);
    }
    const ur = children(named('Ur'), 'complexContent')[0], extension = children(ur, 'extension')[0];
    expect([attribute(named('Ur'), 'mixed'), attribute(ur, 'mixed'), expandedQName(extension, attribute(extension, 'base')!), extension.children])
      .toEqual(['true', 'true', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}, []]);
    const d = children(named('D'), 'complexContent')[0], restriction = children(d, 'restriction')[0];
    expect([attribute(named('D'), 'mixed'), attribute(d, 'mixed'), expandedQName(restriction, attribute(restriction, 'base')!)])
      .toEqual(['true', 'true', {uri: namespace, local: 'Ur'}]);
    const sequence = children(restriction, 'sequence')[0], wildcard = children(sequence, 'any')[0];
    expect(sequence.children).toHaveLength(1);
    expect([attribute(sequence, 'minOccurs'), attribute(sequence, 'maxOccurs'), attribute(wildcard, 'namespace'), attribute(wildcard, 'processContents'),
      attribute(wildcard, 'minOccurs'), attribute(wildcard, 'maxOccurs')]).toEqual([undefined, undefined, '##any', 'skip', '0', 'unbounded']);
    for (const node of types) for (const field of ['abstract', 'final', 'block']) expect(attribute(node, field)).toBeUndefined();
    for (const kind of ['element', 'attribute', 'anyAttribute', 'annotation', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('checks original schema qualification independently of the hypothetical full-input reader', async () => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
