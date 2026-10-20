/** Original XML premises and engine observation, separately from RE01 truth. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {engine, localFixture, validateFixture} from './adapter.js';
import {attribute, children, descendants, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/equality-anchor-reconstruction-independent.xsd';
const namespace = 'urn:reconstruction:equality-consumer';

describe('independent original equality-anchor premises', () => {
  it('pins two genuine anonymous extension scopes with local x and empty A/B, then checks the original schema', async () => {
    // Structures (2004-10-28) element scope and complex-type representation:
    // https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file, 8192);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    expect([attribute(schema, 'elementFormDefault'), attribute(schema, 'finalDefault'), attribute(schema, 'blockDefault')])
      .toEqual([undefined, undefined, undefined]);
    const types = children(schema, 'complexType'), globals = children(schema, 'element');
    expect(types.map(type => attribute(type, 'name')).sort()).toEqual(['A', 'B', 'R', 'X']);
    expect(globals.map(declaration => attribute(declaration, 'name')).sort()).toEqual(['Left', 'Right']);
    const a = types.find(type => attribute(type, 'name') === 'A')!;
    expect(a.children).toEqual([]);
    for (const [name, method, base] of [['B', 'extension', 'A'], ['R', 'restriction', 'A'], ['X', 'extension', 'R']]) {
      const type = types.find(type => attribute(type, 'name') === name)!;
      const content = children(type, 'complexContent');
      expect(content).toHaveLength(1);
      expect(content[0]!.children).toHaveLength(1);
      const branch = content[0]!.children[0]!;
      expect(branch.local).toBe(method);
      expect(expandedQName(branch, attribute(branch, 'base')!)).toEqual({uri: namespace, local: base});
      expect(branch.children).toEqual([]);
    }
    for (const declaration of globals) {
      expect(attribute(declaration, 'type')).toBeUndefined();
      const anonymous = children(declaration, 'complexType');
      expect(anonymous).toHaveLength(1);
      expect(attribute(anonymous[0]!, 'name')).toBeUndefined();
      const branch = children(anonymous[0]!, 'complexContent')[0]!.children[0]!;
      expect(branch.local).toBe('extension');
      expect(expandedQName(branch, attribute(branch, 'base')!)).toEqual({uri: namespace, local: 'B'});
      const sequence = children(branch, 'sequence');
      expect(sequence).toHaveLength(1);
      expect(sequence[0]!.children).toHaveLength(1);
      const use = children(sequence[0]!, 'element')[0]!;
      expect([attribute(use, 'name'), attribute(use, 'minOccurs'), attribute(use, 'maxOccurs'), attribute(use, 'form')])
        .toEqual(['x', '0', undefined, undefined]);
      expect(expandedQName(use, attribute(use, 'type')!)).toEqual({uri: 'http://www.w3.org/2001/XMLSchema', local: 'string'});
    }
    for (const kind of ['attribute', 'anyAttribute', 'choice', 'annotation', 'key', 'keyref', 'unique'])
      expect(descendants(schema, kind)).toEqual([]);
    // This bounded current observation validates the original source only;
    // the engine does not decide clause 1.5 or contextual forest completeness.
    expect(engine).toMatchObject({package: 'libxml2-wasm', version: '0.7.2', engineVersion: '2.15.1'});
    expect(await validateFixture(file, [], {maxBytes: 8192, timeoutMs: 5000, expectedVersion: '0.7.2'}))
      .toMatchObject({phase: 'schema', outcome: 'accepted', undisposed: {}});
  });
});
