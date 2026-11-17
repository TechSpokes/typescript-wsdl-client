import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {selectComponentOperation} from '../../src/compiler/directOperation.js';
import {createComponentValueMapping} from '../../src/compiler/directValues.js';
import {encodeComponentXml, decodeComponentXml} from '../../src/compiler/directCodec.js';

const file = path.resolve('test/conformance/fixtures/xsd/projection/rpc-atomic-unions.wsdl');
const namespace = 'urn:rpc:atomic-unions';
async function select(operation: string) {
  return selectComponentOperation(file, {operation, portType: {namespace, local: 'UnionPortType'}, binding: {namespace, local: 'UnionBinding'}},
    {loading: {policy: {fileRoots: [path.dirname(file)]}}});
}

describe('retained bounded RPC union contract', () => {
  it('keeps primitive-string union parameters lexical', async () => {
    const selected = await select('StringEcho');
    if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
    const mapping = createComponentValueMapping(selected.contract, {kind: 'input'});
    if (mapping.kind !== 'component-mapping') throw new Error(JSON.stringify(mapping));
    const encoded = encodeComponentXml(selected.contract, mapping, {value: ' OK '});
    if (encoded.kind !== 'component-encoded') throw new Error(JSON.stringify(encoded));
    expect(decodeComponentXml(selected.contract, mapping, encoded.bytes)).toMatchObject({kind: 'component-decoded', validated: {value: {value: ' OK '}}});
  });

  it('uses the actual native alias/union plan to refuse heterogeneous RPC parameters', async () => {
    const selected = await select('AtomicEcho');
    if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
    expect(createComponentValueMapping(selected.contract, {kind: 'input'})).toMatchObject({kind: 'unsupported', rule: 'rpc-scalar-union'});
  });
});
