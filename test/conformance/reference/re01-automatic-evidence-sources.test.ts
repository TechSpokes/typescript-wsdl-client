/** Source premises are independent of the hypothetical evidence builder. */
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {localFixture, validateFixture} from './adapter.js';
import {attribute, children, expandedQName, parseXml} from './syntax.js';

describe('automatic RE01 evidence source premises', () => {
  it('pins the separate original extension duty in the multiple-obligation source', () => {
    const fixture = 'xsd/recovery/shared-inherited-list-multiple.xsd';
    const schema = parseXml(readFileSync(localFixture(fixture), 'utf8'), fixture);
    expect(attribute(children(schema, 'include')[0], 'schemaLocation')).toBe('shared-inherited-list.xsd');
    const owner = children(schema, 'complexType')[0];
    expect(attribute(owner, 'name')).toBe('D2');
    const extension = children(children(owner, 'complexContent')[0], 'extension')[0];
    expect(expandedQName(extension, attribute(extension, 'base')!))
      .toEqual({uri: 'urn:re01:shared-inherited-list', local: 'R'});
    const value = children(children(extension, 'sequence')[0], 'element')[0];
    expect(attribute(value, 'fixed')).toBe('foo');
    expect(expandedQName(value, attribute(value, 'type')!))
      .toEqual({uri: 'urn:re01:shared-inherited-list', local: 'Enum'});
  });

  it('independently accepts the source with both original obligations', async () => {
    expect(await validateFixture('xsd/recovery/shared-inherited-list-multiple.xsd', [],
      {resources: ['xsd/recovery/shared-inherited-list.xsd']}))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });

  it('independently accepts the anchored source before its seeded hypothetical continuation', async () => {
    expect(await validateFixture('xsd/recovery/anchored-inherited-list.xsd', []))
      .toMatchObject({phase: 'schema', outcome: 'accepted', instances: []});
  });
});
