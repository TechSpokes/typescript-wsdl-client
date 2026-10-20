/** Original qualification only; no engine claim about finite-forest flattening. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml} from './syntax.js';

const file = 'xsd/recovery/fresh-target-flattening.xsd';
const namespace = 'urn:re01:fresh-target-flattening';
describe('independent fresh-target flattening source', () => {
  it('pins the empty extension chain and original blocked head', () => {
    const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
    expect(attribute(schema, 'targetNamespace')).toBe(namespace);
    const types = children(schema, 'complexType'); expect(types.map(node => attribute(node, 'name'))).toEqual(['A', 'B', 'D']);
    expect(types[0].children).toEqual([]);
    for (const [index, base] of [[1, 'A'], [2, 'B']] as const) {
      const extension = children(children(types[index], 'complexContent')[0], 'extension')[0];
      expect(expandedQName(extension, attribute(extension, 'base')!)).toEqual({uri: namespace, local: base});
      expect(extension.children).toEqual([]);
    }
    const heads = children(schema, 'element'); expect(heads).toHaveLength(1);
    expect([attribute(heads[0], 'name'), attribute(heads[0], 'final'), attribute(heads[0], 'block')]).toEqual(['H', 'restriction', 'restriction']);
    expect(expandedQName(heads[0], attribute(heads[0], 'type')!)).toEqual({uri: namespace, local: 'B'});
  });
  it('checks original schema qualification separately from hypothetical target selection', async () => {
    expect(await validateFixture(file, [])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
