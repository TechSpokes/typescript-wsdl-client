/** Independent source premises, not an oracle for contextual RE01 truth. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/scope-property-equality-independent.xsd';
const namespace = 'urn:recovery:scope-properties';

describe('independent scope-property source premises', () => {
  it('pins distinct anonymous scopes, their shared exact base and the disjoint optional consumer tail', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect(attribute(schema, 'elementFormDefault')).toBe('qualified');
    expect([attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault')]).toEqual([undefined, undefined]);
    const types = children(schema, 'complexType'), globals = children(schema, 'element');
    expect(types.map(node => attribute(node, 'name')).sort()).toEqual(['A', 'A2', 'B', 'R', 'R_H', 'R_M', 'T', 'U', 'X']);
    expect(globals.map(node => attribute(node, 'name')).sort()).toEqual(['H', 'Left', 'M', 'Right', 'Z']);
    const named = (name: string) => {const result = types.find(node => attribute(node, 'name') === name); if (!result) throw new Error(name); return result;};
    const a2 = children(named('A2'), 'sequence')[0], [wildcard, z] = a2.children;
    expect([wildcard.local, attribute(wildcard, 'namespace'), attribute(wildcard, 'processContents'), attribute(wildcard, 'minOccurs'), attribute(wildcard, 'maxOccurs')])
      .toEqual(['any', '##local', 'skip', '0', 'unbounded']);
    expect(expandedQName(z, attribute(z, 'ref')!)).toEqual({uri: namespace, local: 'Z'});
    expect(attribute(z, 'minOccurs')).toBe('0');
    const extension = children(named('T'), 'complexContent')[0].children[0];
    expect(extension.local).toBe('extension'); expect(extension.children).toEqual([]);
    expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: 'A2'});
    for (const name of ['Left', 'Right']) {
      const global = globals.find(node => attribute(node, 'name') === name)!;
      const anonymous = children(global, 'complexType')[0], body = children(anonymous, 'complexContent')[0].children[0];
      expect(attribute(anonymous, 'name')).toBeUndefined(); expect(body.local).toBe('restriction');
      expect(expandedQName(body, attribute(body, 'base')!)).toEqual({uri: namespace, local: 'T'});
      const sequence = children(body, 'sequence')[0], use = children(sequence, 'element')[0]; expect(sequence.children).toHaveLength(1);
      expect([attribute(use, 'name'), attribute(use, 'form')]).toEqual(['l', 'unqualified']);
      expect(expandedQName(use, attribute(use, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
      expect([attribute(use, 'minOccurs'), attribute(use, 'maxOccurs')]).toEqual([undefined, undefined]);
    }
    for (const [name, type, affiliation, block] of [['H', 'B', undefined, 'restriction'], ['M', 'U', 'H', undefined], ['Z', 'R_M', undefined, undefined]]) {
      const declaration = globals.find(node => attribute(node, 'name') === name)!;
      expect(expandedQName(declaration, attribute(declaration, 'type')!)).toEqual({uri: namespace, local: type});
      expect(attribute(declaration, 'block')).toBe(block);
      const head = attribute(declaration, 'substitutionGroup');
      expect(head ? expandedQName(declaration, head) : undefined).toEqual(affiliation ? {uri: namespace, local: affiliation} : undefined);
    }
    for (const kind of ['attribute', 'anyAttribute', 'choice', 'annotation', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('checks the original schema and unqualified local instances independently of copied-scope proof closure', async () => {
    expect(await validateFixture(file, [
      '<t:Left xmlns:t="' + namespace + '"><l>value</l></t:Left>',
      '<t:Right xmlns:t="' + namespace + '"><l>value</l></t:Right>',
      '<t:Left xmlns:t="' + namespace + '"><t:l>value</t:l></t:Left>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [{outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}]});
  });
});
