/** A source-specific application abstraction over the existing native projection.
 * @since Issue #420 reassessment
 * @constraints Research demonstration; no generic converter or production shape change.
 */
import path from 'node:path';
import {Ajv} from 'ajv';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {parseOrderedSyntax} from '../../../src/loader/orderedSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {matchDirectProjection} from '../../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../../src/compiler/directValues.js';
import {traceBackwardConstraints} from './backward-constraints.js';

type Request = {selections: ({a: number; b: string} | {c: boolean; d: string})[]};
const namespace = 'urn:application-groups';
const schema = {type: 'object', required: ['selections'], additionalProperties: false, properties: {
  selections: {type: 'array', minItems: 1, maxItems: 3, items: {oneOf: [
    {type: 'object', required: ['a', 'b'], additionalProperties: false, properties: {a: {type: 'integer', minimum: -2147483648, maximum: 2147483647}, b: {type: 'string'}}},
    {type: 'object', required: ['c', 'd'], additionalProperties: false, properties: {c: {type: 'boolean'}, d: {type: 'string'}}},
  ]}},
}};
const validate = new Ajv({strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false, ownProperties: true}).compile<Request>(schema);
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:research:application-groups').root;
const text = '<Request xmlns="urn:application-groups"><A>1</A><B>first</B><C>true</C><D>last</D></Request>';
const entry = (local: string, value: unknown) => ({name: {namespace, local}, value});

function nativeValue(input: unknown) {
  if (!validate(input)) throw new TypeError('Invalid application group structure');
  return {$content: input.selections.flatMap(selection => 'a' in selection
    ? [entry('A', selection.a), entry('B', selection.b)]
    : [entry('C', selection.c), entry('D', selection.d)])};
}
function applicationValue(input: unknown): Request {
  const {$content} = input as {readonly $content: readonly {name: {namespace: string; local: string}; value: unknown}[]};
  const selections: Request['selections'] = [];
  for (let index = 0; index < $content.length; index += 2) {
    const first = $content[index]!, second = $content[index + 1];
    if (!second || first.name.namespace !== namespace || second.name.namespace !== namespace) throw new TypeError('Unexpected native group');
    if (first.name.local === 'A' && second.name.local === 'B' && typeof first.value === 'number' && typeof second.value === 'string') {
      selections.push({a: first.value, b: second.value});
    } else if (first.name.local === 'C' && second.name.local === 'D' && typeof first.value === 'boolean' && typeof second.value === 'string') {
      selections.push({c: first.value, d: second.value});
    } else throw new TypeError('Unexpected native group');
  }
  const value = {selections};
  if (!validate(value)) throw new TypeError('Native value outside application grammar');
  return value;
}
async function source() {
  const directory = path.resolve('test/research/xml-json-mapping');
  const prepared = prepareSourceSchemaRequest(await loadSemanticSchemaInput(path.join(directory, 'application-groups.xsd'), {policy: {fileRoots: [directory]}}));
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual, found = context.lookup(globalId('element', {namespace, local: 'Request'}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('root missing');
  return {context, root: found.node};
}

describe('source-derived grouped application JSON', () => {
  it('keeps the source choice and sequence caps and exposes ordinary grouped objects', async () => {
    const {context, root} = await source();
    const trace = traceBackwardConstraints(context, globalId('type', {namespace, local: 'RequestType'}));
    expect(trace.groups[0]!.root).toMatchObject({occurs: {min: '1', max: '3'}, term: {kind: 'choice'}});
    const match = matchDirectProjection(context, root, xml(text));
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    const assessed = assessProjectionScalars(context, match);
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    expect(applicationValue(assessed.value)).toEqual({selections: [{a: 1, b: 'first'}, {c: true, d: 'last'}]});
    const fresh: unknown = JSON.parse(JSON.stringify(applicationValue(assessed.value)));
    const reconstructed = expandProjectionValue(context, root, nativeValue(fresh));
    if (reconstructed.kind !== 'projection-expanded') throw new Error(reconstructed.rule);
    expect(reconstructed.payload.children.filter(child => child.kind === 'element').map(child => child.name.local)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('constructs independent hand JSON in source order regardless of JSON property order, without XML group wrappers', async () => {
    const {context, root} = await source();
    const hand: unknown = JSON.parse('{"selections":[{"d":"last","c":true},{"b":"first","a":1}]}');
    const before = JSON.stringify(hand);
    const reconstructed = expandProjectionValue(context, root, nativeValue(hand));
    if (reconstructed.kind !== 'projection-expanded') throw new Error(reconstructed.rule);
    expect(reconstructed.payload.children.filter(child => child.kind === 'element').map(child => [child.name,
      child.children.map(part => part.kind === 'text' ? part.value : part.name)])).toEqual([
      [{namespace, local: 'C'}, ['true']], [{namespace, local: 'D'}, ['last']],
      [{namespace, local: 'A'}, ['1']], [{namespace, local: 'B'}, ['first']],
    ]);
    expect(JSON.stringify(hand)).toBe(before);
  });

  it.each([
    {selections: [{a: 1, d: 'crossed'}]}, {selections: [{a: 1}]},
    {selections: [{a: 1, b: 'x', c: true, d: 'y'}]}, {selections: []},
    {selections: Array.from({length: 4}, () => ({c: true, d: 'x'}))},
    {selections: [{c: 'true', d: 'x'}]}, {selections: [{a: 2147483648, b: 'x'}]},
  ])('rejects broken group constraints without mutating input %#', input => {
    const before = JSON.stringify(input);
    expect(() => nativeValue(input)).toThrow(TypeError);
    expect(JSON.stringify(input)).toBe(before);
  });
});
