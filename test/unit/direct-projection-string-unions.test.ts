import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {expandProjectionValue, assessProjectionScalars} from '../../src/compiler/directValues.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {describeProjectionScalar, assessProjectionScalarOperand} from '../../src/compiler/projectionScalar.js';
import {qualifyComponentSource} from '../../src/compiler/checkedComponentSource.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:string-unions';
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:owned:union').root;
async function source(name = 'Value') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'string-unions.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing union root');
  return {context, root: found.node, input};
}
const lexical = (value: string) => ({value, context: {namespaces: {}, source: xml('<v/>').source}});

describe('native primitive-string union projection', () => {
  it('qualifies named, inline, aliased, inherited and flattened union components after whole construction', async () => {
    const {input} = await source();
    expect(qualifyComponentSource(input, {budget: createApplicationBudget(), maxNodes: 100_000}))
      .toMatchObject({kind: 'component-source', schemaEligible: true, construction: {nativeEstablished: true}});
  });

  it.each(['AB12', ' AB12 ', '\tAB12\n', 'Z9', 'X'])('retains complete lexical input %j across two fresh inverses', async value => {
    const {context, root} = await source();
    const first = expandProjectionValue(context, root, value);
    expect(first).toMatchObject({kind: 'projection-expanded', validated: {value}});
    if (first.kind !== 'projection-expanded') throw new Error(first.kind);
    expect(expandProjectionValue(context, root, JSON.parse(JSON.stringify(first.validated.value))))
      .toMatchObject({kind: 'projection-expanded', validated: {value}});
    const operand = assessProjectionScalarOperand(context, root, lexical(value));
    expect(operand.kind).toBe('projection-scalar-operand');
    if (operand.kind !== 'projection-scalar-operand') throw new Error(operand.kind);
    const member = value.includes('AB12') ? 'Collapsed' : value === 'Z9' ? 'Preserved' : undefined;
    if (member) expect(operand.operand.selectedMembers?.[0]).toMatchObject({name: {namespace, local: member}});
    const matched = matchDirectProjection(context, root, xml(`<t:Value xmlns:t="${namespace}">${value}</t:Value>`));
    if (matched.kind !== 'projection-match') throw new Error(matched.kind);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value});
  });

  it('keeps restriction predicates on the restricted union while XSD 1.0 flattens a nested union member', async () => {
    const {context, root} = await source('RestrictedValue');
    expect(expandProjectionValue(context, root, 'AB12')).toMatchObject({kind: 'scalar-invalid'});
    expect(expandProjectionValue(context, root, 'Z9')).toMatchObject({kind: 'projection-expanded'});
  });

  it('preserves ordered union-list tokens without trimming application strings or changing caller arrays', async () => {
    const {context, root} = await source('Items'), value = ['AB12', 'Z9'];
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(value).toEqual(['AB12', 'Z9']); expect(Object.isFrozen(value)).toBe(false);
    for (const bad of [[' AB12 ', 'Z9'], ['AB12'], ['bad', 'Z9'], 'AB12 Z9', ['AB12', {value: 'Z9'}]])
      expect(expandProjectionValue(context, root, bad).kind).not.toBe('projection-expanded');
  });

  it('refuses member tags, unknown fields, getters and proxies without executing traps', async () => {
    const {context, root} = await source('Items'); let traps = 0;
    const getter = Object.defineProperty([], '0', {get() {traps++; return 'AB12';}, enumerable: true});
    const proxy = new Proxy(['AB12', 'Z9'], {get() {traps++; throw new Error('trap');}});
    for (const value of [getter, proxy, Object.assign(['AB12', 'Z9'], {unknown: 'x'}), [{member: 'Collapsed', value: 'AB12'}, 'Z9']])
      expect(expandProjectionValue(context, root, value).kind).toBe('value-invalid');
    expect(traps).toBe(0);
  });

  it('propagates cancellation inside cached union member work and recovers on a legitimate request', async () => {
    const {context, root} = await source();
    expect(describeProjectionScalar(context, root).kind).toBe('projection-scalar-type');
    let calls = 0; const stop = new Error('owned-member-interruption');
    expect(() => assessProjectionScalarOperand(context, root, lexical('Z9'), () => {if (++calls === 15) throw stop;})).toThrow(stop);
    expect(assessProjectionScalarOperand(context, root, lexical('Z9')).kind).toBe('projection-scalar-operand');
  });

  it('enforces aggregate list/text limits and sticky native exhaustion even with cached descriptions', async () => {
    const {context, root} = await source('Items');
    expect(describeProjectionScalar(context, root).kind).toBe('projection-scalar-type');
    expect(expandProjectionValue(context, root, ['AB12', 'Z9'], {maxItems: 2})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, ['AB12', 'Z9'], {maxText: 4})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, ['AB12', 'Z9']).kind).toBe('projection-expanded');
    context.budget.guard(() => context.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(assessProjectionScalarOperand(context, root, lexical('AB12 Z9'))).toBe(context.budget.failure());
  });

  it('does not swallow native exhaustion as a rejected union branch or poison a separate legitimate context', async () => {
    const {context, root} = await source();
    expect(describeProjectionScalar(context, root).kind).toBe('projection-scalar-type');
    const original = context.budget.chargeWork; let charges = 0;
    context.budget.chargeWork = (amount = 1) => {if (++charges === 25) original(Number.MAX_SAFE_INTEGER); original(amount);};
    expect(assessProjectionScalarOperand(context, root, lexical('Z9')).kind).toBe('resource-limit');
    context.budget.chargeWork = original;
    expect(assessProjectionScalarOperand(context, root, lexical('AB12'))).toBe(context.budget.failure());
    const fresh = await source();
    expect(assessProjectionScalarOperand(fresh.context, fresh.root, lexical('Z9')).kind).toBe('projection-scalar-operand');
  });
});
