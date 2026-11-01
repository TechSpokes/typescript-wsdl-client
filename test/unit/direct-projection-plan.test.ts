import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {ElementNode} from '../../src/compiler/canonicalGraph.js';
import {planDirectProjection, planDirectRoot} from '../../src/compiler/directStructurePlan.js';
import type {DirectProjectionRecord, DirectProjectionValue} from '../../src/compiler/directStructurePlan.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
async function source() {
  const input = await loadSemanticSchemaInput(path.join(directory, 'scoped-records.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const root = context.lookup(globalId('element', {namespace: 'urn:scoped-records', local: 'Request'}));
  if (root.kind !== 'found' || root.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: root.node};
}
const unsupported = (): never => {throw new Error('unsupported');};

describe('native structured projection planning', () => {
  it('keeps same-named anonymous records distinct, preserves order and shares only exact type identities', async () => {
    const {context, root} = await source();
    const plan = planDirectProjection(context, root, () => {}, unsupported);
    const record = (value: DirectProjectionValue): DirectProjectionRecord => {
      if (value.kind !== 'record') throw new Error('Not a record');
      const result = plan.records.find(item => item.type.id === value.type);
      if (!result) throw new Error('Missing record');
      return result;
    };
    expect(plan.records).toHaveLength(7);
    const envelope = record(plan.root);
    expect(envelope.slots.map(slot => slot.element.name.local)).toEqual(['Left', 'Right', 'Again', 'Tree', 'Global']);
    expect(envelope.slots[0]!.value).toEqual(envelope.slots[2]!.value);
    const left = record(record(envelope.slots[0]!.value).slots[0]!.value);
    const right = record(record(envelope.slots[1]!.value).slots[0]!.value);
    expect(left.type.identity.kind).toBe('scoped');
    expect(right.type.identity.kind).toBe('scoped');
    expect(left.type.id).not.toBe(right.type.id);
    expect(left.slots[0]!.element.name.local).toBe('Label');
    expect(right.slots[0]!.element.name.local).toBe('Code');
    expect(record(envelope.slots[4]!.value).slots[0]!.element.name.local).toBe('Flag');
    const tree = record(envelope.slots[3]!.value);
    expect(tree.slots[1]!.value).toEqual({kind: 'record', type: tree.type.id});
    expect(tree.slots[1]!.particle.occurs).toEqual({min: '0', max: 'unbounded'});
    expect(Object.isFrozen(plan.records)).toBe(true);
    expect(Object.isFrozen(left.slots)).toBe(true);
    expect(JSON.stringify(planDirectProjection(context, root, () => {}, unsupported))).toBe(JSON.stringify(plan));
  });

  it('keeps the checked-direct adapter flat-only and refuses copied roots and cancellation', async () => {
    const {context, root} = await source();
    expect(() => planDirectRoot(context, {element: root, type: root.type, message: root.name, part: 'body', source: root.context.source}, () => {}, unsupported)).toThrow('unsupported');
    expect(() => planDirectProjection(context, {...root} as ElementNode, () => {}, unsupported)).toThrow('unsupported');
    expect(() => planDirectProjection({...context}, root, () => {}, unsupported)).toThrow(TypeError);
    const other = await source();
    expect(() => planDirectProjection(other.context, root, () => {}, unsupported)).toThrow('unsupported');
    expect(() => planDirectProjection(context, root, () => {throw new Error('cancelled');}, unsupported)).toThrow('cancelled');
  });
});
