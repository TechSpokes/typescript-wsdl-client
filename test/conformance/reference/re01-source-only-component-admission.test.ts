/** Source/component-existence premises, separate from hypothetical RE01. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/source-only-component-admission-independent.xsd';
const namespace = 'urn:recovery:absent-declaration';

describe('independent source-only component admission premises', () => {
  it('pins an absent local declaration, genuine empty reordered core and no declared fresh activation', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file), types = children(schema, 'complexType');
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'B', 'R', 'X', 'Dormant']);
    expect(types[0].children).toEqual([]);
    for (const [index, method, base] of [[1, 'extension', 'A'], [2, 'restriction', 'A'], [3, 'extension', 'R']] as const) {
      const body = children(types[index], 'complexContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!), body.children]).toEqual([method, {uri: namespace, local: base}, []]);
    }
    const sequence = children(types[4], 'sequence')[0], ghost = children(sequence, 'element')[0];
    expect(sequence.children).toHaveLength(1);
    expect([attribute(ghost, 'name'), attribute(ghost, 'minOccurs'), attribute(ghost, 'maxOccurs'), expandedQName(ghost, attribute(ghost, 'type')!)])
      .toEqual(['ghost', '0', '0', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}]);
    expect(children(schema, 'element')).toEqual([]);
    for (const type of types) for (const flag of ['abstract', 'final', 'block', 'mixed']) expect(attribute(type, flag)).toBeUndefined();
    for (const kind of ['attribute', 'anyAttribute', 'annotation', 'key', 'keyref', 'unique', 'include', 'import']) expect(descendants(schema, kind)).toEqual([]);
    // declare-element maps the exact local0..0 source item to no component;
    // a retained diagnostic record is not an additional Γ declaration.
  });

  it('qualifies the unchanged original source without treating the engine as an admission or RE01 oracle', async () => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});

describe('independent fresh-head observation premises', () => {
  const file = 'xsd/recovery/fresh-head-observation-independent.xsd';
  it('pins a local QName anchor without an original global head or a different declared type', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file), namespace = 'urn:recovery:fresh-head-observation';
    expect(attribute(schema, 'targetNamespace')).toBe(namespace); expect(attribute(schema, 'elementFormDefault')).toBe('qualified');
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['A', 'B', 'D']);
    expect(types[0].children).toEqual([]); expect(children(schema, 'element')).toEqual([]);
    for (const [index, base] of [[1, 'A'], [2, 'B']] as const) {
      const extension = children(children(types[index], 'complexContent')[0], 'extension')[0];
      expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: base});
      if (index === 1) expect(extension.children).toEqual([]);
    }
    const extension = children(children(types[2], 'complexContent')[0], 'extension')[0];
    const sequence = children(extension, 'sequence')[0]; expect(sequence.children).toHaveLength(2);
    for (const node of children(sequence, 'element')) {
      expect([attribute(node, 'name'), expandedQName(node, attribute(node, 'type')!), attribute(node, 'block'), attribute(node, 'minOccurs'), attribute(node, 'maxOccurs')])
        .toEqual(['k', {uri: namespace, local: 'B'}, 'restriction', undefined, undefined]);
    }
    for (const type of types) for (const flag of ['abstract', 'final', 'block', 'mixed']) expect(attribute(type, flag)).toBeUndefined();
    for (const kind of ['attribute', 'any', 'anyAttribute', 'annotation', 'key', 'keyref', 'unique', 'include', 'import']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('qualifies the original fresh-head source without asserting its hypothetical mapping theorem', async () => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
