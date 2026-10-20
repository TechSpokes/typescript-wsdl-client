/** Source premises only; reference acceptance is not a finite-forest or retraction oracle. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const files = [
  'xsd/recovery/pointless-optional-choice.xsd',
  'xsd/recovery/one-entry-chain-erasure.xsd',
  'xsd/recovery/coherent-order-key-retraction.xsd',
  'xsd/recovery/private-observed-copy-erasure.xsd',
] as const;
const xsd = 'http://www.w3.org/2001/XMLSchema';

describe('independent source premises for local normalization and finite-forest transformations', () => {
  it('pins the nested optional and required empty choices before restriction pointlessness', () => {
    const file = files[0], schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe('urn:recovery:restriction');
    const types = children(schema, 'complexType');
    expect(types.map(type => attribute(type, 'name'))).toEqual(['Carrier', 'RequiredAfterFlatten', 'RequiredEmpty', 'NewlySingleton']);
    for (const [index, minimum] of [[0, '0'], [1, undefined]] as const) {
      const outer = children(types[index], 'choice')[0];
      expect(attribute(outer, 'minOccurs')).toBe(minimum);
      expect(attribute(outer, 'maxOccurs')).toBe(index === 0 ? '1' : undefined);
      const members = children(outer, 'choice'); expect(members).toHaveLength(2);
      for (const inner of members) {
        expect([attribute(inner, 'minOccurs'), attribute(inner, 'maxOccurs')]).toEqual([undefined, undefined]);
        expect(inner.children).toEqual([]);
      }
    }
    const required = children(types[2], 'choice')[0]; expect(required.children).toEqual([]);
    expect(attribute(required, 'minOccurs')).toBeUndefined();
    const singleton = children(types[3], 'choice')[0];
    expect(singleton.children.map(child => child.local)).toEqual(['sequence', 'element']);
    expect(children(singleton, 'sequence')[0].children).toEqual([]);
    expect(expandedQName(children(singleton, 'element')[0], attribute(children(singleton, 'element')[0], 'type')!))
      .toEqual({uri: xsd, local: 'string'});
    for (const name of ['any', 'attribute', 'anyAttribute', 'annotation']) expect(descendants(schema, name)).toEqual([]);
  });

  it('pins the exact empty-content chain and future-observer blocking heads', () => {
    const file = files[1], schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    const namespace = 'urn:re01:one-entry-chain-erasure';
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const types = children(schema, 'complexType');
    expect(types.map(type => attribute(type, 'name'))).toEqual(['B', 'C', 'D']); expect(types[0].children).toEqual([]);
    for (const [index, base] of [[1, 'B'], [2, 'C']] as const) {
      const extension = children(children(types[index], 'complexContent')[0], 'extension')[0];
      expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: base});
      expect(extension.children).toEqual([]);
    }
    const heads = children(schema, 'element'); expect(heads.map(head => attribute(head, 'name'))).toEqual(['H-R', 'H']);
    for (const head of heads) {
      expect(attribute(head, 'abstract')).toBe('true');
      expect(expandedQName(head, attribute(head, 'type')!)).toEqual({uri: namespace, local: 'B'});
    }
    expect(attribute(heads[0], 'block')).toBe('restriction');
    expect(expandedQName(heads[1], attribute(heads[1], 'substitutionGroup')!)).toEqual({uri: namespace, local: 'H-R'});
    for (const name of ['attribute', 'anyAttribute', 'any', 'annotation']) expect(descendants(schema, name)).toEqual([]);
  });

  it('pins the original head particle, distinct scoped consumer and exact local suffix order', () => {
    const file = files[2], schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    const namespace = 'urn:review:copy-order-key-collision';
    expect(attribute(schema, 'targetNamespace')).toBe(namespace); expect(attribute(schema, 'elementFormDefault')).toBe('qualified');
    const globals = children(schema, 'element'); expect(globals.map(element => attribute(element, 'name'))).toEqual(['H', 'M']);
    for (const declaration of globals)
      expect(expandedQName(declaration, attribute(declaration, 'type')!)).toEqual({uri: xsd, local: 'string'});
    expect(expandedQName(globals[1], attribute(globals[1], 'substitutionGroup')!)).toEqual({uri: namespace, local: 'H'});
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['P', 'A', 'B', 'D']);
    const prefix = children(children(types[0], 'sequence')[0], 'element')[0];
    expect(expandedQName(prefix, attribute(prefix, 'ref')!)).toEqual({uri: namespace, local: 'H'});
    expect([attribute(prefix, 'minOccurs'), attribute(prefix, 'maxOccurs')]).toEqual([undefined, undefined]);
    const group = children(schema, 'group')[0]; expect(attribute(group, 'name')).toBe('G');
    const outer = children(children(group, 'sequence')[0], 'element')[0];
    expect([attribute(outer, 'name'), attribute(outer, 'minOccurs')]).toEqual(['outer', '0']);
    const anonymous = children(outer, 'complexType')[0];
    const extension = children(children(anonymous, 'complexContent')[0], 'extension')[0];
    expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: 'P'});
    const suffix = children(children(extension, 'choice')[0], 'element');
    expect(suffix.map(element => attribute(element, 'name'))).toEqual(['M', 'H']);
    for (const declaration of suffix)
      expect(expandedQName(declaration, attribute(declaration, 'type')!)).toEqual({uri: xsd, local: 'string'});
    const groupUse = children(types[1], 'group')[0];
    expect(expandedQName(groupUse, attribute(groupUse, 'ref')!)).toEqual({uri: namespace, local: 'G'});
    const restriction = children(children(types[2], 'complexContent')[0], 'restriction')[0];
    expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({uri: namespace, local: 'A'});
    expect(restriction.children).toEqual([]);
    const final = children(children(types[3], 'complexContent')[0], 'extension')[0];
    expect(expandedQName(final, attribute(final, 'base')!)).toEqual({uri: namespace, local: 'B'}); expect(final.children).toEqual([]);
  });

  it('pins the recursive original template and actual head member separately from its observed-copy replacement', () => {
    const file = files[3], schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    const namespace = 'urn:re01:private-observed-copy-erasure';
    expect(attribute(schema, 'targetNamespace')).toBe(namespace); expect(attribute(schema, 'elementFormDefault')).toBe('qualified');
    const heads = children(schema, 'element'); expect(heads.map(head => attribute(head, 'name'))).toEqual(['H', 'M']);
    for (const head of heads) expect(expandedQName(head, attribute(head, 'type')!)).toEqual({uri: xsd, local: 'string'});
    expect(expandedQName(heads[1], attribute(heads[1], 'substitutionGroup')!)).toEqual({uri: namespace, local: 'H'});
    const group = children(schema, 'group')[0]; expect(attribute(group, 'name')).toBe('G');
    const members = children(children(group, 'sequence')[0], 'element'); expect(members).toHaveLength(3);
    expect(expandedQName(members[0], attribute(members[0], 'ref')!)).toEqual({uri: namespace, local: 'H'});
    expect([attribute(members[1], 'name'), attribute(members[1], 'minOccurs')]).toEqual(['next', '0']);
    const q = children(members[1], 'complexType')[0], extension = children(children(q, 'complexContent')[0], 'extension')[0];
    expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: 'P'});
    const suffix = children(children(extension, 'sequence')[0], 'element');
    expect(attribute(suffix[0], 'name')).toBe('z');
    expect(expandedQName(suffix[1], attribute(suffix[1], 'ref')!)).toEqual({uri: namespace, local: 'H'});
    expect(attribute(members[2], 'name')).toBe('end');
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name'))).toEqual(['P', 'R', 'D']);
    const pUse = children(types[0], 'group')[0];
    expect(expandedQName(pUse, attribute(pUse, 'ref')!)).toEqual({uri: namespace, local: 'G'});
    const restriction = children(children(types[1], 'complexContent')[0], 'restriction')[0];
    expect(expandedQName(restriction, attribute(restriction, 'base')!)).toEqual({uri: namespace, local: 'P'});
    const end = children(children(restriction, 'sequence')[0], 'element'); expect(end).toHaveLength(2);
    expect(expandedQName(end[0], attribute(end[0], 'ref')!)).toEqual({uri: namespace, local: 'H'}); expect(attribute(end[1], 'name')).toBe('end');
    const final = children(children(types[2], 'complexContent')[0], 'extension')[0];
    expect(expandedQName(final, attribute(final, 'base')!)).toEqual({uri: namespace, local: 'R'});
    const finalSuffix = children(children(final, 'sequence')[0], 'element'); expect(finalSuffix).toHaveLength(2);
    expect(attribute(finalSuffix[0], 'name')).toBe('z');
    expect(expandedQName(finalSuffix[1], attribute(finalSuffix[1], 'ref')!)).toEqual({uri: namespace, local: 'H'});
  });

  it.each(files)('qualifies source %s without deciding any hypothetical transformation', async file => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
