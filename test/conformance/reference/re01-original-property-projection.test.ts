/** Source/component premises, not a hypothetical RE01 truth oracle. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/original-property-projection-independent.xsd';
const namespace = 'urn:property-only-projection';

describe('independent source-property projection premises', () => {
  it('pins the exact original bases, distinct anonymous scopes, shared head and qualified local QName', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect([attribute(schema, 'targetNamespace'), attribute(schema, 'elementFormDefault'), attribute(schema, 'blockDefault'), attribute(schema, 'finalDefault')])
      .toEqual([namespace, 'qualified', undefined, undefined]);
    const types = children(schema, 'complexType'); expect(types.map(type => attribute(type, 'name')).sort()).toEqual(['A', 'A2', 'B', 'R', 'X']);
    const named = (name: string) => {const node = types.find(type => attribute(type, 'name') === name); if (!node) throw new Error(name); return node;};
    expect(named('A').children).toEqual([]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['X', 'extension', 'R']]) {
      const body = children(named(name), 'complexContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!), body.children]).toEqual([method, {uri: namespace, local: base}, []]);
    }
    const prefix = children(children(named('A2'), 'sequence')[0], 'element')[0];
    expect([attribute(prefix, 'name'), attribute(prefix, 'minOccurs'), expandedQName(prefix, attribute(prefix, 'type')!)])
      .toEqual(['p', '0', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}]);
    const globals = children(schema, 'element'); expect(globals.map(element => attribute(element, 'name'))).toEqual(['H', 'Left', 'Right']);
    for (const node of [...types, ...globals]) for (const field of ['abstract', 'final', 'mixed', 'nillable']) expect(attribute(node, field)).toBeUndefined();
    expect([expandedQName(globals[0], attribute(globals[0], 'type')!), attribute(globals[0], 'block')]).toEqual([{uri: namespace, local: 'A2'}, 'restriction']);
    for (const element of globals.slice(1)) {
      const scope = children(element, 'complexType')[0], extension = children(scope, 'complexContent')[0].children[0];
      expect([attribute(scope, 'name'), extension.local, expandedQName(extension, attribute(extension, 'base')!)])
        .toEqual([undefined, 'extension', {uri: namespace, local: 'A2'}]);
      for (const field of ['abstract', 'final', 'block', 'mixed']) expect(attribute(scope, field)).toBeUndefined();
      const [local, head] = children(children(extension, 'sequence')[0], 'element');
      expect([attribute(local, 'name'), expandedQName(local, attribute(local, 'type')!), expandedQName(head, attribute(head, 'ref')!)])
        .toEqual(['N', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}, {uri: namespace, local: 'H'}]);
      for (const use of [local, head]) expect([attribute(use, 'minOccurs'), attribute(use, 'maxOccurs')]).toEqual(['0', undefined]);
      const au = children(extension, 'attribute')[0];
      expect([attribute(au, 'name'), expandedQName(au, attribute(au, 'type')!), attribute(au, 'default'), attribute(au, 'fixed')])
        .toEqual(['a', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}, undefined, undefined]);
    }
    for (const kind of ['annotation', 'any', 'anyAttribute', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it('checks original source acceptance and independent order/namespace instance controls', async () => {
    const open = '<Left xmlns="' + namespace + '" a="kept">';
    expect(await validateFixture(file, [open + '</Left>', open + '<p>p</p><N>n</N><H/></Left>',
      open + '<N>n</N><p>p</p></Left>', open + '<N xmlns="">n</N></Left>']))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: [
        {outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}]});
  });
});
