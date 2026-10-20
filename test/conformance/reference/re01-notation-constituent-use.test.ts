/** Independent NOTATION source roles; engine observations do not certify hypothetical RE01 evidence. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml} from './syntax.js';

const qualified = 'xsd/recovery/notation-constituent-use.xsd';
const bare = 'xsd/recovery/notation-constituent-direct-use.xsd';
const namespace = 'urn:research:notation-constituent', xsd = 'http://www.w3.org/2001/XMLSchema';

describe('independent dated NOTATION constructor-use source premises', () => {
  it('pins enum-qualified atomic constituents, ordered nested constructors and generated scalar restrictions', () => {
    const schema = parseXml(readFileSync(localFixture(qualified), 'utf8'), qualified);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const notation = children(schema, 'notation')[0]; expect(attribute(notation, 'name')).toBe('N');
    expect(attribute(notation, 'public')).toBe('notation example');
    const types = children(schema, 'simpleType');
    expect(types.map(type => attribute(type, 'name'))).toEqual(['Q', 'U', 'L', 'NestedUnion', 'NestedList']);
    const restriction = children(types[0], 'restriction')[0], enumeration = children(restriction, 'enumeration')[0];
    expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({uri: xsd, local: 'NOTATION'});
    expect(expandedQName(enumeration, attribute(enumeration, 'value')!)).toEqual({uri: namespace, local: 'N'});
    expect(attribute(children(types[1], 'union')[0], 'memberTypes')).toBe('t:Q xs:boolean');
    expect(attribute(children(types[2], 'list')[0], 'itemType')).toBe('t:Q');
    expect(attribute(children(types[3], 'union')[0], 'memberTypes')).toBe('t:U xs:int');
    expect(attribute(children(types[4], 'list')[0], 'itemType')).toBe('t:U');
    const complex = children(schema, 'complexType');
    expect(complex.map(type => attribute(type, 'name'))).toEqual(['ListBase', 'GeneratedList', 'UnionBase', 'GeneratedUnion', 'B', 'D']);
    for (const [index, base] of [[1, 'ListBase'], [3, 'UnionBase']] as const) {
      const generated = children(children(complex[index], 'simpleContent')[0], 'restriction')[0];
      expect(expandedQName(generated, attribute(generated, 'base')!)).toEqual({uri: namespace, local: base});
    }
    const length = children(children(children(complex[1], 'simpleContent')[0], 'restriction')[0], 'length')[0];
    expect(attribute(length, 'value')).toBe('1');
  });

  it('pins direct builtin NOTATION use at both explicit constructor edges', () => {
    const schema = parseXml(readFileSync(localFixture(bare), 'utf8'), bare);
    const types = children(schema, 'simpleType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['U', 'L']);
    const union = children(types[0], 'union')[0], list = children(types[1], 'list')[0];
    expect(attribute(union, 'memberTypes')!.split(' ').map(value => expandedQName(union, value)))
      .toEqual([{uri: xsd, local: 'NOTATION'}, {uri: xsd, local: 'boolean'}]);
    expect(expandedQName(list, attribute(list, 'itemType')!)).toEqual({uri: xsd, local: 'NOTATION'});
    expect(children(schema, 'notation').map(notation => attribute(notation, 'name'))).toEqual(['N']);
    expect(children(schema, 'attribute').map(declaration => attribute(declaration, 'type'))).toEqual(['t:U', 't:L']);
  });

  it('records independent acceptance of the qualified source without deciding a hypothetical construction', async () => {
    expect(await validateFixture(qualified, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });

  it('records pinned engine acceptance of the bare source separately from the dated direct-use constraint', async () => {
    // Datatypes enumeration-required-notation supplies the constituent rule;
    // this contrary engine observation cannot qualify those bare use edges.
    expect(await validateFixture(bare, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
