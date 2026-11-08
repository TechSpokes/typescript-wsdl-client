import {readFileSync} from 'node:fs';
import {expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, parseXml} from './syntax.js';

it('retains separate owned anonymous type sources and live original optional-prefix observations', async () => {
  const file = 'xsd/re01/copied-prefix-anonymous-types.xsd';
  const schema = parseXml(readFileSync(localFixture(file), 'utf8'), file);
  const groups = children(schema, 'group');
  expect(groups.map(group => attribute(group, 'name'))).toEqual(['G1', 'G2']);
  const leaves = groups.map(group => children(children(group, 'sequence')[0], 'element')[0]);
  expect(leaves.map(leaf => ({name: attribute(leaf, 'name'), bounds: {
    minimum: BigInt(attribute(leaf, 'minOccurs') ?? '1'), maximum: BigInt(attribute(leaf, 'maxOccurs') ?? '1'),
  }}))).toEqual(Array.from({length: 2}, () => ({name: 'a', bounds: {minimum: 0n, maximum: 1n}})));
  const types = leaves.map(leaf => children(leaf, 'complexType')[0]);
  expect(types[0]).not.toBe(types[1]);
  for (const type of types) {expect(type.children).toEqual([]); expect(attribute(type, 'name')).toBeUndefined();}
  expect(await validateFixture(file, [
    '<t:root xmlns:t="urn:re01-copied-prefix"/>',
    '<t:root xmlns:t="urn:re01-copied-prefix"><a/></t:root>',
  ])).toMatchObject({phase: 'schema', outcome: 'accepted', instances: [{outcome: 'accepted'}, {outcome: 'accepted'}]});
});
