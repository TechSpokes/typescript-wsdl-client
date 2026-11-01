import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';
import {matchOrderedProjection, planDirectProjection} from '../../src/compiler/directStructurePlan.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:ordered-particles';
const entry = (local: string, value: unknown) => ({name: {namespace, local}, value});
const value = {id: 'synthetic', $content: [entry('Header', 'synthetic'), entry('Label', 'first'), entry('Count', 2), entry('Item', {Flag: true}), entry('Tail', 7)]};
const text = '<t:Request xmlns:t="urn:ordered-particles" id="synthetic"><t:Header>synthetic</t:Header><t:Label>first</t:Label><t:Count>2</t:Count><t:Item><t:Flag>1</t:Flag></t:Item><t:Tail>7</t:Tail></t:Request>';
const xml = (text: string) => parseOrderedSyntax(Buffer.from(text), 'urn:synthetic-ordered-payload').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, name === 'Huge' ? 'ordered-huge-bound.xsd' : 'ordered-particles.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('native ordered particle projection', () => {
  it('preserves choices, named repeated pairs, nested records and order through JSON and inverse construction', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    expect(matched.kind).toBe('projection-match');
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const assessed = assessProjectionScalars(context, matched);
    expect(assessed).toMatchObject({kind: 'projection-value', value});
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    const input: unknown = JSON.parse(JSON.stringify(assessed.value));
    expect(expandProjectionValue(context, root, input)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(input).toEqual(value); expect(Object.isFrozen(input)).toBe(false);
    expect(matchDirectProjection(context, root, xml(text), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
  });

  it.each([
    ['missing choice', [entry('Header', 'synthetic')]],
    ['incomplete pair', [entry('Header', 'synthetic'), entry('Label', 'first')]],
    ['wrong pair order', [entry('Header', 'synthetic'), entry('Count', 1), entry('Label', 'first')]],
    ['too many choices', [entry('Header', 'synthetic'), ...Array.from({length: 4}, () => entry('Item', {Flag: true}))]],
    ['duplicate tail', [...value.$content, entry('Tail', 8)]],
  ])('rejects %s as a caller value failure', async (_label, $content) => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {id: 'synthetic', $content})).toMatchObject({kind: 'value-invalid', rule: 'ordered-particle-language'});
  });

  it('keeps native scalar validation and exact expanded names authoritative', async () => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {id: 'synthetic', $content: [entry('Header', 'synthetic'), entry('Label', 'first'), entry('Count', 2147483648)]})).toMatchObject({kind: 'scalar-invalid'});
    const bad = structuredClone(value); bad.$content[1]!.name.namespace = 'urn:wrong';
    expect(expandProjectionValue(context, root, bad)).toMatchObject({kind: 'value-invalid', rule: 'unknown-ordered-element'});
    const matched = matchDirectProjection(context, root, xml(text.replace('<t:Count>2', '<t:Count>2147483648')));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
  });

  it('accepts all permutations while rejecting duplicate and missing required children', async () => {
    const {context, root} = await source('All');
    for (const $content of [[entry('A', 1), entry('B', true)], [entry('B', false), entry('A', 2)], [entry('A', 3)]]) {
      expect(expandProjectionValue(context, root, {$content})).toMatchObject({kind: 'projection-expanded', validated: {value: {$content}}});
    }
    for (const $content of [[], [entry('B', true)], [entry('A', 1), entry('A', 2)]]) {
      expect(expandProjectionValue(context, root, {$content})).toMatchObject({kind: 'value-invalid', rule: 'ordered-particle-language'});
    }
  });

  it('handles nullable group repetitions without empty loops or numeric bound truncation', async () => {
    const {context, root} = await source('Nullable');
    for (const $content of [[], [entry('B', 1), entry('A', 2), entry('B', 3)]]) {
      expect(expandProjectionValue(context, root, {$content})).toMatchObject({kind: 'projection-expanded'});
    }
    expect(expandProjectionValue(context, root, {$content: Array.from({length: 5}, () => entry('A', 1))})).toMatchObject({kind: 'value-invalid'});
    const huge = await source('Huge');
    expect(expandProjectionValue(huge.context, huge.root, {$content: [entry('A', 1)]})).toMatchObject({kind: 'value-invalid'});
  });

  it('rejects unauthenticated grammar metadata, malformed entries, mutation hooks and explicit resource excess', async () => {
    const {context, root} = await source();
    const plan = planDirectProjection(context, root, () => {}, () => {throw new Error('unsupported');});
    const record = plan.records.find(item => item.ordered)!;
    expect(() => matchOrderedProjection(context, {...record}, [], () => {})).toThrow(TypeError);
    const foreign = await source();
    expect(() => matchOrderedProjection(foreign.context, record, [], () => {})).toThrow(TypeError);
    for (const $content of [new Array(1), [{name: {namespace}, value: 1}], [{name: {namespace, local: 'Header'}, value: 'synthetic', extra: true}]]) {
      expect(expandProjectionValue(context, root, {id: 'synthetic', $content})).toMatchObject({kind: 'value-invalid'});
    }
    let reads = 0;
    const hook = Object.defineProperty({}, 'name', {enumerable: true, get() {reads++; return {};}});
    Object.defineProperty(hook, 'value', {enumerable: true, value: 'synthetic'});
    expect(expandProjectionValue(context, root, {id: 'synthetic', $content: [hook]})).toMatchObject({kind: 'value-invalid'});
    expect(reads).toBe(0);
    const proxy = new Proxy(value.$content, {ownKeys() {reads++; return [];}});
    expect(expandProjectionValue(context, root, {id: 'synthetic', $content: proxy})).toMatchObject({kind: 'value-invalid'});
    expect(reads).toBe(0);
    expect(expandProjectionValue(context, root, value, {maxItems: 4})).toMatchObject({kind: 'resource-limit'});
    const abort = new AbortController(); abort.abort();
    expect(expandProjectionValue(context, root, value, {signal: abort.signal})).toMatchObject({kind: 'cancelled'});
    const overlap = await source('Overlap');
    expect(expandProjectionValue(overlap.context, overlap.root, {$content: []})).toMatchObject({kind: 'unsupported'});
  });
});
