/** Independent original scalar properties, not hypothetical RE01 truth. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/scalar-content-property-independent.xsd';
const namespace = 'urn:recovery:scalar-content-properties';

describe('independent scalar content-property source premises', () => {
  it('pins the shared simple-content ancestry and distinct anonymous restriction properties', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect([attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault')]).toEqual([undefined, undefined]);
    const types = children(schema, 'complexType'), globals = children(schema, 'element');
    expect(types.map(type => attribute(type, 'name')).sort()).toEqual(['A', 'B', 'R', 'S', 'T', 'X']);
    expect(globals.map(node => attribute(node, 'name')).sort()).toEqual(['Left', 'Narrow', 'Right']);
    const body = (name: string) => {
      const type = types.find(node => attribute(node, 'name') === name); if (!type) throw new Error(name);
      return children(type, 'simpleContent')[0].children[0];
    };
    expect([body('S').local, expandedQName(body('S'), attribute(body('S'), 'base')!)]).toEqual(['extension', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}]);
    const wildcard = children(body('S'), 'anyAttribute')[0];
    expect([attribute(wildcard, 'namespace'), attribute(wildcard, 'processContents')]).toEqual(['##any', 'lax']);
    expect([body('T').local, expandedQName(body('T'), attribute(body('T'), 'base')!), body('T').children]).toEqual(['extension', {uri: namespace, local: 'S'}, []]);
    for (const global of globals) {
      const anonymous = children(global, 'complexType')[0], restriction = children(anonymous, 'simpleContent')[0].children[0];
      expect(attribute(anonymous, 'name')).toBeUndefined(); expect(restriction.local).toBe('restriction');
      expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({uri: namespace, local: 'T'});
      const use = children(restriction, 'attribute')[0]; expect(attribute(use, 'name')).toBe('a');
      expect(expandedQName(use, attribute(use, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
      expect([attribute(use, 'use'), attribute(use, 'form'), attribute(use, 'default'), attribute(use, 'fixed')]).toEqual([undefined, undefined, undefined, undefined]);
      expect(children(restriction, 'anyAttribute')).toEqual([]);
      expect(children(restriction, 'minLength').map(facet => attribute(facet, 'value'))).toEqual(attribute(global, 'name') === 'Narrow' ? ['1'] : []);
    }
    for (const kind of ['sequence', 'choice', 'annotation', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('checks the original schema and differing scalar restrictions with a live independent engine', async () => {
    expect(await validateFixture(file, [
      '<t:Left xmlns:t="' + namespace + '" a="kept">value</t:Left>',
      '<t:Right xmlns:t="' + namespace + '"/>',
      '<t:Narrow xmlns:t="' + namespace + '"/>',
      '<t:Narrow xmlns:t="' + namespace + '">x</t:Narrow>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [{outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'accepted'}]});
  });
});
