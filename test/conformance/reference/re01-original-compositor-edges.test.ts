/** Dated source/component incidence premises; engines do not decide RE01. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const edge = 'xsd/recovery/original-compositor-edge-independent.xsd';
const incidences = 'xsd/recovery/original-compositor-incidences-independent.xsd';

describe('independent original compositor source premises', () => {
  it('pins the anchored wildcard restriction with a syntax-only zero item and no additional components', () => {
    const schema = parseXml(readFileSync(localFixture(edge), 'utf8'), edge), namespace = 'urn:recovery:raw-original-edge';
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'B', 'R', 'X']);
    const sequence = children(types[0], 'sequence')[0], wildcard = children(sequence, 'any')[0];
    expect(sequence.children).toHaveLength(1);
    const wildcardFields = (node: typeof wildcard) => ['namespace', 'processContents', 'minOccurs', 'maxOccurs'].map(name => attribute(node, name));
    expect(wildcardFields(wildcard)).toEqual(['##any', 'lax', '0', 'unbounded']);
    for (const [index, method, base] of [[1, 'extension', 'A'], [2, 'restriction', 'A'], [3, 'extension', 'R']] as const) {
      const body = children(types[index], 'complexContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!)]).toEqual([method, {uri: namespace, local: base}]);
      if (method === 'restriction') {
        const original = children(body, 'sequence')[0]; expect(original.children.map(node => node.local)).toEqual(['any', 'element']);
        expect(wildcardFields(original.children[0])).toEqual(wildcardFields(wildcard));
        const zero = original.children[1];
        expect([attribute(zero, 'name'), expandedQName(zero, attribute(zero, 'type')!), attribute(zero, 'minOccurs'), attribute(zero, 'maxOccurs')])
          .toEqual(['ghost', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}, '0', '0']);
      } else expect(body.children).toEqual([]);
    }
    for (const type of types) for (const field of ['mixed', 'abstract', 'final', 'block']) expect(attribute(type, field)).toBeUndefined();
    for (const kind of ['attribute', 'anyAttribute', 'annotation', 'key', 'keyref', 'unique', 'include', 'import']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('pins live/zero/live source order, repeated group uses and distinct empty compositor kinds', () => {
    const schema = parseXml(readFileSync(localFixture(incidences), 'utf8'), incidences), namespace = 'urn:recovery:original-compositor';
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const group = children(schema, 'group')[0]; expect(attribute(group, 'name')).toBe('G');
    const types = children(schema, 'complexType');
    expect(types.map(type => attribute(type, 'name'))).toEqual(['Seq', 'Named', 'Repeated', 'All', 'EmptyChoice', 'EmptySequence', 'Absent']);
    const named = (name: string) => {const type = types.find(node => attribute(node, 'name') === name); if (!type) throw new Error(name); return type;};
    for (const parent of [children(group, 'sequence')[0], children(named('Seq'), 'sequence')[0], children(named('All'), 'all')[0]]) {
      expect(parent.children.map(node => attribute(node, 'name'))).toEqual(['first', 'ghost', 'last']);
      expect(parent.children.map(node => [attribute(node, 'minOccurs'), attribute(node, 'maxOccurs')]))
        .toEqual([[undefined, undefined], ['0', '0'], [undefined, undefined]]);
      for (const node of parent.children) expect(expandedQName(node, attribute(node, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    }
    for (const [name, count] of [['Named', 1], ['Repeated', 2]] as const) {
      const uses = children(children(named(name), 'sequence')[0], 'group'); expect(uses).toHaveLength(count);
      for (const use of uses) expect(expandedQName(use, attribute(use, 'ref')!)).toEqual({uri: namespace, local: 'G'});
    }
    for (const [name, kind] of [['EmptyChoice', 'choice'], ['EmptySequence', 'sequence']] as const) {
      const body = children(named(name), kind)[0]; expect(body.children).toHaveLength(1);
      expect([attribute(body.children[0], 'minOccurs'), attribute(body.children[0], 'maxOccurs')]).toEqual(['0', '0']);
    }
    const absent = children(named('Absent'), 'sequence')[0];
    expect([attribute(absent, 'minOccurs'), attribute(absent, 'maxOccurs')]).toEqual(['0', '0']);
    expect(children(absent, 'element')).toHaveLength(1);
  });

  it('records the primary engine UPA disagreement separately from the no-component mapping', async () => {
    // declare-element maps this exact local 0..0 item to no component;
    // declare-contentModel then supplies the one-wildcard semantic list.
    // This engine observation neither overrides that mapping nor decides RE01.
    const result = await validateFixture(edge, []);
    expect(result).toMatchObject({phase: 'schema', outcome: 'rejected'});
    expect(result.diagnostic).toContain("complex type 'R': The content model is not determinist");
    expect(result.diagnostic).toContain("complex type 'X': The content model is not determinist");
  });

  it('qualifies the independent incidence source without deciding a hypothetical construction', async () => {
    expect(await validateFixture(incidences, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
