/** Source component properties are independent of hypothetical proof closure. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/property-reference-nested-independent.xsd';
const namespace = 'urn:recovery:property-references';

describe('independent nested property-reference source premises', () => {
  it('pins separate anonymous outer and inner scopes with shared named base identities', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect([attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault')]).toEqual([undefined, undefined]);
    const types = children(schema, 'complexType');
    expect(types.map(node => attribute(node, 'name')).sort()).toEqual(['A', 'B', 'R', 'X']);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['X', 'extension', 'R']]) {
      const type = types.find(node => attribute(node, 'name') === name)!;
      const derivation = children(type, 'complexContent')[0].children[0];
      expect(derivation.local).toBe(method); expect(derivation.children).toEqual([]);
      expect(expandedQName(derivation, attribute(derivation, 'base')!)).toEqual({uri: namespace, local: base});
    }
    const globals = children(schema, 'element'); expect(globals.map(node => attribute(node, 'name')).sort()).toEqual(['Left', 'Right']);
    for (const global of globals) {
      const outer = children(global, 'complexType')[0], sequence = children(outer, 'sequence')[0], inner = children(sequence, 'element')[0];
      expect(attribute(outer, 'name')).toBeUndefined(); expect(sequence.children).toHaveLength(1);
      expect([attribute(inner, 'name'), attribute(inner, 'type'), attribute(inner, 'form')]).toEqual(['inner', undefined, undefined]);
      const type = children(inner, 'complexType')[0], extension = children(type, 'complexContent')[0].children[0];
      expect(attribute(type, 'name')).toBeUndefined(); expect(extension.local).toBe('extension'); expect(extension.children).toEqual([]);
      expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: 'R'});
      const use = children(outer, 'attribute')[0]; expect(attribute(use, 'name')).toBe('a');
      expect(expandedQName(use, attribute(use, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
      expect([attribute(use, 'use'), attribute(use, 'default'), attribute(use, 'fixed')]).toEqual([undefined, undefined, undefined]);
    }
    for (const kind of ['any', 'anyAttribute', 'choice', 'simpleContent', 'annotation', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('checks the original schema and nested local declarations with a live independent engine', async () => {
    expect(await validateFixture(file, [
      '<t:Left xmlns:t="' + namespace + '" a="kept"><inner/></t:Left>',
      '<t:Right xmlns:t="' + namespace + '"><inner/></t:Right>',
      '<t:Left xmlns:t="' + namespace + '"/>',
      '<t:Right xmlns:t="' + namespace + '"><t:inner/></t:Right>',
    ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [{outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}]});
  });
});
