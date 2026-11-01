import {describe, expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax, syntaxElements} from '../../src/loader/orderedSyntax.js';
import type {SyntaxElement} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection, inspectProjectionStructuralMatch} from '../../src/compiler/directStructure.js';
import type {DirectMatchedNode} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, inspectProjectionValue, expandProjectionValue, inspectProjectionExpandedValue} from '../../src/compiler/directValues.js';
import {DEFAULT_MAX_WORK} from '../../src/compiler/semanticBudget.js';
import {createApplicationBudget} from '../../src/compiler/semanticBudget.js';
import {qualifyDirectSource} from '../../src/compiler/checkedSourcePreparation.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
async function source() {
  const input = await loadSemanticSchemaInput(path.join(directory, 'scoped-records.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const root = context.lookup(globalId('element', {namespace: 'urn:scoped-records', local: 'Request'}));
  if (root.kind !== 'found' || root.node.kind !== 'element') throw new Error('Missing root');
  return {input, context, root: root.node, text: await readFile(path.join(directory, 'scoped-records.xml'), 'utf8')};
}
const xml = (text: string) => parseOrderedSyntax(Buffer.from(text), 'urn:synthetic:projection-payload').root;
// @why Independently authored synthetic JSON accompanies the handwritten XSD/XML fixtures.
function application() {
  return {
    Left: {Service: {Label: 'left'}}, Right: {Service: {Code: 7}}, Again: {Service: {Label: 'again'}},
    Tree: {Name: 'parent', Child: [
      {Name: 'first', Child: [{Name: 'leaf', Child: []}]},
      {Name: 'second', Child: []},
    ]},
    Global: {Flag: true},
  };
}
interface XmlShape {name: {namespace: string; local: string}; text?: string; children?: XmlShape[]}
function xmlShape(node: SyntaxElement): XmlShape {
  const children = syntaxElements(node);
  return children.length ? {name: node.name, children: children.map(xmlShape)}
    : {name: node.name, text: node.children.map(child => child.kind === 'text' ? child.value : '').join('')};
}
function items(node: DirectMatchedNode, local: string): readonly DirectMatchedNode[] {
  if (node.kind !== 'record') throw new Error('Expected record');
  const slot = node.slots.find(item => item.slot.element.name.local === local);
  if (!slot) throw new Error('Missing slot');
  return slot.items;
}

describe('native structured projection matching', () => {
  it('keeps the dated correspondence gate authoritative despite successful nested structural projection', async () => {
    const {input} = await source();
    const qualification = qualifyDirectSource(input, {budget: createApplicationBudget(), maxNodes: 100_000});
    expect(qualification.kind).toBe('qualified-source');
    if (qualification.kind !== 'qualified-source') throw new Error(qualification.kind);
    expect(qualification.localEstablished).toBe(true);
    expect(qualification.localDisproved).toBe(false);
    expect(qualification.closure.kind).toBe('checked-direct');
    expect(qualification.correspondence).toBe(false);
    expect(qualification.eligible).toBe(false);
  });

  it('retains nested record boundaries, scope and recursive repetition in document order', async () => {
    const {context, root, text} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(JSON.stringify(matched));
    expect(matched.admitted).toBe(false);
    expect(matched.scalarValidity).toBe('unassessed');
    expect(matched.occurrences.map(item => item.lexical)).toEqual(['left', '7', 'again', 'parent', 'first', 'leaf', 'second', 'true']);
    const tree = items(matched.tree, 'Tree')[0]!;
    expect(items(tree, 'Child')).toHaveLength(2);
    const first = items(tree, 'Child')[0]!;
    expect(items(first, 'Child')).toHaveLength(1);
    expect(items(items(tree, 'Child')[1]!, 'Child')).toHaveLength(0);
    const left = items(items(matched.tree, 'Left')[0]!, 'Service')[0]!;
    const right = items(items(matched.tree, 'Right')[0]!, 'Service')[0]!;
    expect(left.declaration.id).not.toBe(right.declaration.id);
    expect(items(left, 'Label')[0]).toMatchObject({kind: 'scalar', operand: 0});
    expect(items(right, 'Code')[0]).toMatchObject({kind: 'scalar', operand: 1});
    expect(Object.isFrozen(matched.tree)).toBe(true);
    expect(inspectProjectionStructuralMatch(matched, context)).toBe(matched);
    expect(() => inspectProjectionStructuralMatch({...matched}, context)).toThrow(TypeError);
    const other = await source();
    expect(() => inspectProjectionStructuralMatch(matched, other.context)).toThrow(TypeError);
    expect(matchDirectProjection(context, root, xml(text), {flatOnly: true})).toMatchObject({kind: 'unsupported', rule: 'native-direct-shape'});
  });

  it.each([
    ['scope', (text: string) => text.replace('<t:Code>7</t:Code>', '<t:Label>7</t:Label>')],
    ['namespace', (text: string) => text.replace('<t:Code>7</t:Code>', '<Code xmlns="urn:wrong">7</Code>')],
    ['order', (text: string) => text.replace('<t:Name>parent</t:Name>', '').replace('</t:Tree>', '<t:Name>parent</t:Name></t:Tree>')],
    ['singleton', (text: string) => text.replace('<t:Code>7</t:Code>', '<t:Code>7</t:Code><t:Code>8</t:Code>')],
    ['complex text', (text: string) => text.replace('<t:Tree>', '<t:Tree>unexpected')],
  ] as const)('rejects nested %s violations without a partial match', async (_name, alter) => {
    const {context, root, text} = await source();
    expect(matchDirectProjection(context, root, xml(alter(text)))).toMatchObject({kind: 'mismatch', schemaPath: expect.any(String), payloadPath: expect.any(String)});
  });

  it('refuses nested attributes, invalid tree sharing and cancellation without mutating input', async () => {
    const {context, root, text} = await source();
    expect(matchDirectProjection(context, root, xml(text.replace('<t:Code>', '<t:Code rescue="yes">')))).toMatchObject({kind: 'unsupported', rule: 'payload-attributes'});
    const payload = xml(text);
    const before = JSON.stringify(payload);
    const controller = new AbortController(); controller.abort();
    expect(matchDirectProjection(context, root, payload, {signal: controller.signal})).toMatchObject({kind: 'cancelled'});
    expect(JSON.stringify(payload)).toBe(before);
    const element = payload.children.find(child => child.kind === 'element');
    if (!element) throw new Error('Missing child');
    const shared = {...payload, children: [element, element]};
    expect(() => matchDirectProjection(context, root, shared)).toThrow(TypeError);
  });

  it('preserves actual nested values and typed scalars through JSON serialization', async () => {
    const {context, root, text} = await source();
    const match = matchDirectProjection(context, root, xml(text));
    if (match.kind !== 'projection-match') throw new Error(match.kind);
    const assessed = assessProjectionScalars(context, match);
    if (assessed.kind !== 'projection-value') throw new Error(JSON.stringify(assessed));
    expect(assessed.admitted).toBe(false);
    expect(JSON.parse(JSON.stringify(assessed.value))).toEqual(application());
    expect(inspectProjectionValue(assessed, context)).toBe(assessed);
    expect(() => inspectProjectionValue({...assessed}, context)).toThrow(TypeError);
    const other = await source();
    expect(() => inspectProjectionValue(assessed, other.context)).toThrow(TypeError);
    expect(() => assessProjectionScalars(context, {...match})).toThrow(TypeError);
    expect(Object.isFrozen(assessed.value)).toBe(true);
  });

  it.each([
    ['integer', '<t:Code>7</t:Code>', '<t:Code>7.5</t:Code>'],
    ['integer overflow', '<t:Code>7</t:Code>', '<t:Code>2147483648</t:Code>'],
    ['Boolean', '<t:Flag>true</t:Flag>', '<t:Flag>maybe</t:Flag>'],
  ])('rejects invalid nested %s before issuing a successful value', async (_name, before, after) => {
    const {context, root, text} = await source();
    const match = matchDirectProjection(context, root, xml(text.replace(before!, after!)));
    if (match.kind !== 'projection-match') throw new Error(match.kind);
    expect(assessProjectionScalars(context, match)).toMatchObject({kind: 'scalar-invalid', schemaPath: expect.any(String), payloadPath: expect.any(String)});
    const controller = new AbortController(); controller.abort();
    expect(assessProjectionScalars(context, match, {signal: controller.signal})).toMatchObject({kind: 'cancelled'});
  });

  it('returns a sticky explicit resource failure without issuing a partial structural match', async () => {
    const {context, root, text} = await source();
    context.budget.chargeWork(DEFAULT_MAX_WORK - context.budget.usage().work - 512);
    expect(matchDirectProjection(context, root, xml(text))).toMatchObject({kind: 'resource-limit'});
    expect(context.budget.exhausted()).toBe(true);
    expect(matchDirectProjection(context, root, xml(text))).toMatchObject({kind: 'resource-limit'});
  });

  it('constructs fresh ordered nested syntax, validates it and preserves independent JSON/XML expectations', async () => {
    const {context, root, text} = await source();
    const input = application();
    const before = JSON.stringify(input);
    const expanded = expandProjectionValue(context, root, input);
    if (expanded.kind !== 'projection-expanded') throw new Error(JSON.stringify(expanded));
    expect(expanded.admitted).toBe(false);
    expect(xmlShape(expanded.payload)).toEqual(xmlShape(xml(text)));
    expect(JSON.parse(JSON.stringify(expanded.validated.value))).toEqual(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(input.Tree.Child)).toBe(false);
    expect(Object.isFrozen(input.Left.Service)).toBe(false);
    expect(Object.isFrozen(expanded.payload)).toBe(true);
    expect(inspectProjectionExpandedValue(expanded, context)).toBe(expanded);
    expect(() => inspectProjectionExpandedValue({...expanded}, context)).toThrow(TypeError);
    const other = await source();
    expect(() => inspectProjectionExpandedValue(expanded, other.context)).toThrow(TypeError);
  });

  it.each([
    ['root array', () => []],
    ['string integer', () => ({...application(), Right: {Service: {Code: '7'}}})],
    ['string Boolean', () => ({...application(), Global: {Flag: 'true'}})],
    ['missing record', () => {const {Right: _right, ...rest} = application(); return rest;}],
    ['missing nested field', () => ({...application(), Right: {Service: {}}})],
    ['extra nested field', () => ({...application(), Right: {Service: {Code: 7, rescue: true}}})],
    ['nil record', () => ({...application(), Tree: null})],
    ['missing repetition', () => ({...application(), Tree: {Name: 'parent'}})],
    ['undefined repetition', () => ({...application(), Tree: {Name: 'parent', Child: undefined}})],
    ['sparse repetition', () => ({...application(), Tree: {Name: 'parent', Child: new Array(2)}})],
    ['extra array field', () => ({...application(), Tree: {Name: 'parent', Child: Object.assign([{Name: 'x', Child: []}], {extra: 1})}})],
    ['undefined repeated item', () => ({...application(), Tree: {Name: 'parent', Child: [undefined]}})],
    ['wrong repeated item', () => ({...application(), Tree: {Name: 'parent', Child: ['sample']}})],
    ['boxed scalar', () => ({...application(), Right: {Service: {Code: new Number(7)}}})],
    ['symbol field', () => ({...application(), Right: {Service: {Code: 7, [Symbol('extra')]: 1}}})],
  ] as const)('rejects %s without shape rescue', async (_name, create) => {
    const {context, root} = await source();
    const input = create();
    const result = expandProjectionValue(context, root, input);
    expect(result.kind).toBe('value-invalid');
    expect(result).not.toHaveProperty('payload');
    expect(result).not.toHaveProperty('validated');
    expect(Object.isFrozen(input)).toBe(false);
  });

  it('rejects nested accessors, coercion objects and proxies without executing application code', async () => {
    const {context, root} = await source();
    let calls = 0;
    const getter = application();
    Object.defineProperty(getter.Right.Service, 'Code', {get() {calls++; return 7;}});
    const accessorArray = [{Name: 'x', Child: []}];
    Object.defineProperty(accessorArray, '0', {get() {calls++; return {Name: 'x', Child: []};}});
    const coercion = {...application(), Right: {Service: {Code: {valueOf() {calls++; return 7;}}}}};
    const proxy = new Proxy(application().Tree, {getPrototypeOf() {calls++; return Object.prototype;}, ownKeys() {calls++; return [];}});
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    for (const input of [getter, coercion, {...application(), Tree: {Name: 'parent', Child: accessorArray}}, {...application(), Tree: proxy}, revoked.proxy]) {
      expect(expandProjectionValue(context, root, input).kind).toBe('value-invalid');
    }
    expect(calls).toBe(0);
  });

  it('rejects cycles while allowing shared acyclic values to represent separate XML occurrences', async () => {
    const {context, root} = await source();
    const cycle: Record<string, unknown> = {Name: 'loop', Child: []}; cycle.Child = [cycle];
    expect(expandProjectionValue(context, root, {...application(), Tree: cycle})).toMatchObject({kind: 'value-invalid', rule: 'cyclic-value'});
    const shared = application(); shared.Again = shared.Left;
    const expanded = expandProjectionValue(context, root, shared);
    if (expanded.kind !== 'projection-expanded') throw new Error(JSON.stringify(expanded));
    expect(JSON.parse(JSON.stringify(expanded.validated.value))).toEqual(shared);
    const [left, , again] = syntaxElements(expanded.payload);
    expect(left).not.toBe(again);
  });

  it('enforces aggregate member/text bounds and cancellation without publishing partial expansions', async () => {
    const {context, root} = await source();
    // @why Handwritten fixture has 19 member elements and 30 input-string UTF-16 units; the document record is excluded.
    expect(expandProjectionValue(context, root, application(), {maxItems: 19, maxText: 30}).kind).toBe('projection-expanded');
    for (const options of [{maxItems: 18}, {maxText: 29}]) {
      const result = expandProjectionValue(context, root, application(), options);
      expect(result.kind).toBe('resource-limit'); expect(result).not.toHaveProperty('payload');
    }
    const controller = new AbortController(); controller.abort();
    expect(expandProjectionValue(context, root, application(), {signal: controller.signal})).toMatchObject({kind: 'cancelled'});
  });

  it('rejects invalid explicit caps rather than silently ignoring them', async () => {
    const {context, root} = await source();
    for (const limit of [-1, NaN, Infinity, 1.5]) {
      expect(() => expandProjectionValue(context, root, application(), {maxItems: limit})).toThrow(RangeError);
      expect(() => expandProjectionValue(context, root, application(), {maxText: limit})).toThrow(RangeError);
    }
  });
});
