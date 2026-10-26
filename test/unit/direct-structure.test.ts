import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {DEFAULT_MAX_WORK} from '../../src/compiler/semanticBudget.js';
import {matchDirectOperation} from '../../src/compiler/directStructure.js';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';
import type {DirectOperationContract} from '../../src/compiler/directOperation.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../src/loader/orderedSyntax.js';

const namespace = 'urn:checked:forecast';
const fixture = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
async function select(limits?: {maxWork?: number; maxNodes?: number}) {
  const result = await selectDirectOperation(fixture, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [path.dirname(fixture)]}}, limits});
  if (result.kind !== 'selected') throw new Error(JSON.stringify(result));
  return result.contract;
}
const payload = () => parseOrderedSyntax(Buffer.from(`<f:GetForecast xmlns:f="${namespace}"><f:city> Paris </f:city><f:days>not-an-int</f:days></f:GetForecast>`), 'https://payload.invalid/message.xml').root;
const match = (contract: DirectOperationContract, tree = payload()) => matchDirectOperation(contract, {kind: 'input'}, tree);

describe('direct structure authority, ownership and request resources', () => {
  it('authenticates before using data and refuses diagnostic/copy authority', async () => {
    const c = await select();
    for (const forged of [{...c}, JSON.parse(JSON.stringify(c)), {kind: 'assessment-report'}]) expect(() => match(forged as DirectOperationContract)).toThrow(TypeError);
    const other = await select();
    expect(() => inspectDirectOperation(c, inspectDirectOperation(other).context)).toThrow(TypeError);
    expect(matchDirectOperation(c, {kind: 'other'} as never, payload())).toMatchObject({kind: 'unsupported', rule: 'unknown-direction'});
    expect(matchDirectOperation(c, {kind: 'fault', name: 'Other'}, payload())).toMatchObject({kind: 'unsupported', rule: 'unknown-fault'});
  });
  it('owns mutable lexical/maps/source without freezing the caller or changing source', async () => {
    const c = await select(), sourceBefore = JSON.stringify(c);
    const tree = structuredClone(payload());
    const callback = () => {};
    ((tree.children[0] as SyntaxElement).source as unknown as Record<string, unknown>).extra = callback;
    const before = JSON.stringify(tree);
    const result = match(c, tree);
    expect(JSON.stringify(tree)).toBe(before);
    expect(JSON.stringify(c)).toBe(sourceBefore);
    expect(Object.isFrozen(tree)).toBe(false);
    expect(result.kind).toBe('structural-match');
    if (result.kind !== 'structural-match') throw new Error(result.kind);
    expect(result.occurrences.map(o => o.lexical)).toEqual([' Paris ', 'not-an-int']);
    const day = result.occurrences[1]!;
    (tree.namespaces as Record<string, string>).f = 'urn:changed';
    const child = tree.children[1]! as SyntaxElement;
    (child.namespaces as Record<string, string>).f = 'urn:changed';
    (child.source as {path: string}).path = 'changed';
    (child.children[0] as {value: string}).value = '2';
    expect(day.lexical).toBe('not-an-int');
    expect(day.namespaces.f).toBe(namespace);
    expect(day.payloadSource.path).not.toBe('changed');
    expect(Object.isFrozen(day)).toBe(true);
    expect(Object.isFrozen(day.namespaces)).toBe(true);
    expect(Object.isFrozen(day.payloadSource)).toBe(true);
    expect(result.occurrences[0]!.payloadSource).not.toHaveProperty('extra');
    expect(Object.getPrototypeOf(day.namespaces)).toBe(null);
    expect(day.namespaces.toString).toBeUndefined();
    const directed = matchDirectOperation(c, {kind: 'input', extra: callback} as never, payload());
    expect(directed.kind).toBe('structural-match');
    if (directed.kind === 'structural-match') expect(directed.direction).toEqual({kind: 'input'});
    expect(Object.isFrozen(callback)).toBe(false);
    expect(result).toMatchObject({scope: 'structure-only', scalarValidity: 'unassessed', admitted: false});
    expect(c.admitted).toBe(false);
    expect(c.missingCapabilities).toContain('matcher');
  });
  it('rejects malformed, cyclic, shared and getter data without invoking getters', async () => {
    const c = await select();
    let calls = 0;
    const getter = structuredClone(payload());
    Object.defineProperty(getter, 'name', {enumerable: true, get() {calls++; throw new Error('getter invoked');}});
    expect(() => match(c, getter)).toThrow(TypeError);
    expect(calls).toBe(0);
    const cycle = structuredClone(payload());
    (cycle.children as unknown[]).push(cycle);
    expect(() => match(c, cycle)).toThrow(TypeError);
    const shared = structuredClone(payload());
    (shared.children as unknown[]).push(shared.children[0]);
    expect(() => match(c, shared)).toThrow(TypeError);
    expect(() => match(c, {kind: 'element', children: []} as unknown as SyntaxElement)).toThrow(TypeError);
    expect(() => match(c, {...payload(), kind: 'text', value: ''} as unknown as SyntaxElement)).toThrow(TypeError);
    const sparse = structuredClone(payload());
    delete (sparse.children as unknown[])[0];
    expect(() => match(c, sparse)).toThrow(TypeError);
  });
  it('rejects callable attribute entries and directions before inspecting their properties', async () => {
    const c = await select(), tree = structuredClone(payload());
    let calls = 0;
    const attribute = () => {};
    Object.defineProperty(attribute, 'name', {get() {calls++; throw new Error('attribute getter invoked');}});
    (tree.attributes as unknown[]).push(attribute);
    expect(() => match(c, tree)).toThrow(TypeError);
    expect(calls).toBe(0);
    const direction = () => {};
    Object.defineProperty(direction, 'kind', {get() {calls++; throw new Error('direction getter invoked');}});
    expect(() => matchDirectOperation(c, direction as never, payload())).toThrow(TypeError);
    expect(calls).toBe(0);
    expect(Object.isFrozen(attribute)).toBe(false);
    expect(Object.isFrozen(direction)).toBe(false);
  });
  it('cancels at the entry and cooperative visit boundaries without a receipt', async () => {
    const c = await select(), abort = new AbortController(); abort.abort();
    expect(matchDirectOperation(c, {kind: 'input'}, payload(), {signal: abort.signal})).toMatchObject({kind: 'cancelled'});
    // Deterministic synchronous signal observation; no claim of timer interruption.
    let checks = 0;
    const signal = {get aborted() {return ++checks > 15;}} as AbortSignal;
    const result = matchDirectOperation(c, {kind: 'input'}, payload(), {signal});
    expect(result.kind).toBe('cancelled'); expect(result).not.toHaveProperty('occurrences');
  });
  it('charges node limits inclusively after selection and keeps exhaustion sticky', async () => {
    const probe = await select(); const selectedNodes = inspectDirectOperation(probe).context.budget.usage().nodes;
    // root + two elements + two text nodes = five retained syntax nodes.
    expect(match(await select({maxNodes: selectedNodes + 5})).kind).toBe('structural-match');
    const short = await select({maxNodes: selectedNodes + 4});
    const failure = match(short);
    expect(failure.kind).toBe('resource-limit'); expect(failure).not.toHaveProperty('occurrences');
    expect(match(short).kind).toBe('resource-limit');
  });
  it('charges exact work boundaries including publication and shares repeat-call resources', async () => {
    for (const shortage of [0, 1]) {
      const c = await select(), budget = inspectDirectOperation(c).context.budget;
      const before = budget.usage().work;
      expect(match(c).kind).toBe('structural-match');
      const cost = budget.usage().work - before;
      // Calibrate on the same source-owned context: context identities can differ
      // in text length across independent selections, and are accounted too.
      budget.chargeWork(DEFAULT_MAX_WORK - budget.usage().work - cost + shortage);
      const result = match(c);
      expect(result.kind).toBe(shortage ? 'resource-limit' : 'structural-match');
      expect(match(c).kind).toBe('resource-limit');
      expect(match(c).kind).toBe('resource-limit');
    }
  });
});
