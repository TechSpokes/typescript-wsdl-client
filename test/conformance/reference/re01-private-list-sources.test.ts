/** Independent source validation corroborates syntax; it does not prove the hypothetical native construction. */
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, parseXml} from './syntax.js';

it.each(['anchored-list-cross-copy', 'private-list-false-three', 'private-list-inherited'])(
  'independently accepts the private LIST source %s', async name => {
    expect(await validateFixture('xsd/recovery/' + name + '.xsd', []))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });

it('pins a genuinely heterogeneous three-arm false portfolio and saved QName namespace', () => {
  const fixture = 'xsd/recovery/private-list-false-three.xsd';
  const schema = parseXml(readFileSync(localFixture(fixture), 'utf8'), fixture);
  const start = children(schema, 'complexType').find(at => attribute(at, 'name') === 'Start');
  assert.ok(start);
  const restriction = children(children(start, 'complexContent')[0], 'restriction')[0];
  const fields = children(children(restriction, 'choice')[0], 'element');
  expect(fields.map(at => attribute(at, 'fixed'))).toEqual(['0', 'false', '0']);
  expect(fields.map(at => attribute(at, 'name'))).toEqual(['alpha', 'beta', 'gamma']);
});
