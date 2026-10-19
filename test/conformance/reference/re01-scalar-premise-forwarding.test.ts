/** Independent source/value premises; an engine does not decide hypothetical RE01 truth. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const variants = ['forwarding', 'nonprimitive', 'mixed'] as const;
const file = (variant: typeof variants[number]) => 'xsd/recovery/scalar-premise-' + variant + '-independent.xsd';
const namespace = (variant: typeof variants[number]) => 'urn:recovery:scalar-premise-' + variant;

describe('independent scalar premise-forwarding source controls', () => {
  it.each(variants)('pins the complete %s source and original default operands', variant => {
    const schema = parseXml(readFileSync(localFixture(file(variant)), 'utf8'), file(variant));
    expect(attribute(schema, 'targetNamespace')).toBe(namespace(variant));
    expect([attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault'), attribute(schema, 'elementFormDefault')]).toEqual([undefined, undefined, undefined]);
    const types = children(schema, 'complexType'), elements = children(schema, 'element');
    expect(types.map(node => attribute(node, 'name')).sort()).toEqual(variant === 'nonprimitive' ? ['A', 'B', 'R', 'RS', 'S', 'X'] : ['A', 'B', 'R', 'X']);
    expect(elements.map(node => attribute(node, 'name')).sort()).toEqual(['Left', 'Right']);
    const type = (name: string) => {const found = types.find(node => attribute(node, 'name') === name); if (!found) throw new Error(name); return found;};
    expect(type('A').children).toEqual([]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['X', 'extension', 'R']]) {
      const body = children(type(name), 'complexContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!), body.children]).toEqual([method, {uri: namespace(variant), local: base}, []]);
    }
    if (variant === 'nonprimitive') for (const [name, method, base] of [['S', 'extension', 'string'], ['RS', 'restriction', 'S']]) {
      const body = children(type(name), 'simpleContent')[0].children[0];
      expect([body.local, expandedQName(body, attribute(body, 'base')!), body.children]).toEqual([method,
        {uri: base === 'string' ? 'http://www.w3.org/2001/XMLSchema' : namespace(variant), local: base}, []]);
    }
    for (const element of elements) {
      const scope = children(element, 'complexType')[0], sequence = children(scope, 'sequence')[0];
      const inner = children(sequence, 'element')[0], facade = children(inner, 'complexType')[0];
      expect([attribute(inner, 'name'), attribute(inner, 'default'), attribute(inner, 'fixed'), attribute(inner, 'type')]).toEqual(['inner', 'same', undefined, undefined]);
      expect([attribute(inner, 'minOccurs'), attribute(inner, 'maxOccurs'), attribute(facade, 'name')]).toEqual([undefined, undefined, undefined]);
      if (variant === 'mixed') {
        expect(attribute(facade, 'mixed')).toBe('true'); expect(children(facade, 'simpleContent')).toEqual([]);
        const payload = children(children(facade, 'sequence')[0], 'element')[0];
        expect([attribute(payload, 'name'), attribute(payload, 'minOccurs'), attribute(payload, 'maxOccurs'), expandedQName(payload, attribute(payload, 'type')!)])
          .toEqual(['payload', '0', undefined, {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}]);
      } else {
        const extension = children(facade, 'simpleContent')[0].children[0];
        expect([extension.local, expandedQName(extension, attribute(extension, 'base')!), extension.children]).toEqual(['extension',
          variant === 'forwarding' ? {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'} : {uri: namespace(variant), local: 'RS'}, []]);
      }
      const use = children(scope, 'attribute')[0];
      expect([attribute(use, 'name'), expandedQName(use, attribute(use, 'type')!), attribute(use, 'default'), attribute(use, 'fixed')])
        .toEqual(['a', {uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'}, undefined, undefined]);
    }
    for (const kind of ['annotation', 'any', 'anyAttribute', 'key', 'keyref', 'unique']) expect(descendants(schema, kind)).toEqual([]);
  });

  it.each(variants)('checks the %s source/value premises with a live independent engine', async variant => {
    const prefix = '<t:Left xmlns:t="' + namespace(variant) + '" a="kept">';
    expect(await validateFixture(file(variant), [prefix + '<inner/></t:Left>', prefix + '<inner>value</inner></t:Left>',
      prefix + '</t:Left>', prefix + '<inner><nested/></inner></t:Left>']))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: [{outcome: 'accepted'}, {outcome: 'accepted'}, {outcome: 'rejected'}, {outcome: 'rejected'}]});
  });
});
