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

// @why Issue #420 uses one choice key; source bounds determine object versus array, not pluralized aliases.
const choiceKey = '$choice';
type RequestChoiceAlternative1 = {a: number; b: string};
type RequestChoiceAlternative2 = {c: boolean; d: string};
type RequestChoice = RequestChoiceAlternative1 | RequestChoiceAlternative2;
type Request = {choice?: string; [choiceKey]: RequestChoice[]};
type SingleRequest = {[choiceKey]: RequestChoice};
const namespace = 'urn:application-groups';
const alternatives = {
  RequestChoiceAlternative1: {type: 'object', required: ['a', 'b'], additionalProperties: false, properties: {a: {type: 'integer', minimum: -2147483648, maximum: 2147483647}, b: {type: 'string'}}},
  RequestChoiceAlternative2: {type: 'object', required: ['c', 'd'], additionalProperties: false, properties: {c: {type: 'boolean'}, d: {type: 'string'}}},
};
const choiceSchema = (prefix: string) => ({oneOf: [
  {$ref: `${prefix}/RequestChoiceAlternative1`}, {$ref: `${prefix}/RequestChoiceAlternative2`},
]});
const definitions = {...alternatives, RequestChoice: choiceSchema('#/$defs')};
const reference = {$ref: '#/$defs/RequestChoice'};
const schema = {type: 'object', required: [choiceKey], additionalProperties: false, properties: {
  choice: {type: 'string'},
  [choiceKey]: {type: 'array', minItems: 1, maxItems: 3, items: reference},
}, $defs: definitions};
const ajv = new Ajv({strict: true, coerceTypes: false, removeAdditional: false, useDefaults: false, ownProperties: true});
const validate = ajv.compile<Request>(schema);
const singleSchema = {...schema, properties: {[choiceKey]: reference}};
const validateSingle = ajv.compile<SingleRequest>(singleSchema);
const validateOptionalSingle = ajv.compile({...singleSchema, required: []});
// @constraints This source-specific component sketch is not production OpenAPI generation or HTTP serialization evidence.
const openapiSchemas = {
  ...alternatives,
  RequestChoice: choiceSchema('#/components/schemas'),
  Request: {type: 'object', required: [choiceKey], additionalProperties: false, properties: {
    choice: {type: 'string'},
    [choiceKey]: {type: 'array', minItems: 1, maxItems: 3, items: {$ref: '#/components/schemas/RequestChoice'}},
  }},
  SingleRequest: {type: 'object', required: [choiceKey], additionalProperties: false,
    properties: {[choiceKey]: {$ref: '#/components/schemas/RequestChoice'}}},
};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:research:application-groups').root;
const text = '<Request xmlns="urn:application-groups"><A>1</A><B>first</B><C>true</C><D>last</D></Request>';
const entry = (local: string, value: unknown) => ({name: {namespace, local}, value});

function nativeValue(input: unknown) {
  if (!validate(input)) throw new TypeError('Invalid application group structure');
  return {$content: [...(input.choice === undefined ? [] : [entry('choice', input.choice)]), ...input[choiceKey].flatMap(alternative => 'a' in alternative
    ? [entry('A', alternative.a), entry('B', alternative.b)]
    : [entry('C', alternative.c), entry('D', alternative.d)])]};
}
function applicationValue(input: unknown): Request {
  const {$content} = input as {readonly $content: readonly {name: {namespace: string; local: string}; value: unknown}[]};
  const groups: Request[typeof choiceKey] = [];
  let choice: string | undefined;
  if ($content[0]?.name.local === 'choice') {
    if ($content[0].name.namespace !== namespace || typeof $content[0].value !== 'string') throw new TypeError('Unexpected XML choice value');
    choice = $content[0].value;
  }
  for (let index = choice === undefined ? 0 : 1; index < $content.length; index += 2) {
    const first = $content[index]!, second = $content[index + 1];
    if (!second || first.name.namespace !== namespace || second.name.namespace !== namespace) throw new TypeError('Unexpected native group');
    if (first.name.local === 'A' && second.name.local === 'B' && typeof first.value === 'number' && typeof second.value === 'string') {
      groups.push({a: first.value, b: second.value});
    } else if (first.name.local === 'C' && second.name.local === 'D' && typeof first.value === 'boolean' && typeof second.value === 'string') {
      groups.push({c: first.value, d: second.value});
    } else throw new TypeError('Unexpected native group');
  }
  const value: Request = {[choiceKey]: groups, ...(choice === undefined ? {} : {choice})};
  if (!validate(value)) throw new TypeError('Native value outside application grammar');
  return value;
}
function nativeSingleValue(input: unknown) {
  if (!validateSingle(input)) throw new TypeError('Invalid single choice structure');
  return nativeValue({...input, [choiceKey]: [input[choiceKey]]});
}
function applicationSingleValue(input: unknown): SingleRequest {
  const repeated = applicationValue(input);
  const value = {...repeated, [choiceKey]: repeated[choiceKey][0]};
  if (repeated[choiceKey].length !== 1 || !validateSingle(value)) throw new TypeError('Unexpected choice count');
  return value;
}
async function source(rootName = 'Request') {
  const directory = path.resolve('research/tests/xml-json-mapping');
  const prepared = prepareSourceSchemaRequest(await loadSemanticSchemaInput(path.join(directory, 'application-groups.xsd'), {policy: {fileRoots: [directory]}}));
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual, found = context.lookup(globalId('element', {namespace, local: rootName}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('root missing');
  return {context, root: found.node};
}

describe('source-derived grouped application JSON', () => {
  it('names the union and both object alternatives for single and repeated OpenAPI references', () => {
    expect(openapiSchemas.RequestChoice).toEqual({oneOf: [
      {$ref: '#/components/schemas/RequestChoiceAlternative1'},
      {$ref: '#/components/schemas/RequestChoiceAlternative2'},
    ]});
    expect(openapiSchemas.RequestChoiceAlternative1.required).toEqual(['a', 'b']);
    expect(openapiSchemas.RequestChoiceAlternative2.required).toEqual(['c', 'd']);
    expect(openapiSchemas.SingleRequest.properties.$choice).toEqual({$ref: '#/components/schemas/RequestChoice'});
    expect(openapiSchemas.Request.properties.$choice).toEqual({type: 'array', minItems: 1, maxItems: 3,
      items: {$ref: '#/components/schemas/RequestChoice'}});
  });
  it('keeps the source choice and sequence caps and exposes ordinary grouped objects', async () => {
    const {context, root} = await source();
    const trace = traceBackwardConstraints(context, globalId('type', {namespace, local: 'RequestType'}));
    const sequence = trace.groups[0]!.root;
    if (sequence.term.kind !== 'sequence') throw new Error('source sequence missing');
    const choice = context.lookup(sequence.term.children[1]!);
    if (choice.kind !== 'found') throw new Error('source choice missing');
    expect(choice.node).toMatchObject({occurs: {min: '1', max: '3'}, term: {kind: 'choice'}});
    const match = matchDirectProjection(context, root, xml(text));
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    const assessed = assessProjectionScalars(context, match);
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    expect(applicationValue(assessed.value)).toEqual({$choice: [{a: 1, b: 'first'}, {c: true, d: 'last'}]});
    const fresh: unknown = JSON.parse(JSON.stringify(applicationValue(assessed.value)));
    const reconstructed = expandProjectionValue(context, root, nativeValue(fresh));
    if (reconstructed.kind !== 'projection-expanded') throw new Error(reconstructed.rule);
    expect(reconstructed.payload.children.filter(child => child.kind === 'element').map(child => child.name.local)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('constructs independent hand JSON in source order regardless of JSON property order, without XML group wrappers', async () => {
    const {context, root} = await source();
    const hand: unknown = JSON.parse('{"$choice":[{"d":"last","c":true},{"b":"first","a":1}]}');
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

  it('keeps a real XML choice field distinct from the synthetic group and rejects unknown metadata', async () => {
    const {context, root} = await source();
    const hand: unknown = JSON.parse('{"choice":"XML data","$choice":[{"a":1,"b":"first"}]}');
    const expanded = expandProjectionValue(context, root, nativeValue(hand));
    if (expanded.kind !== 'projection-expanded') throw new Error(expanded.rule);
    expect(expanded.payload.children.filter(child => child.kind === 'element').map(child => child.name.local)).toEqual(['choice', 'A', 'B']);
    const match = matchDirectProjection(context, root, expanded.payload);
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    const assessed = assessProjectionScalars(context, match);
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    expect(applicationValue(assessed.value)).toEqual(hand);
    expect(() => nativeValue({choice: [{a: 1, b: 'first'}]})).toThrow(TypeError);
    expect(() => nativeValue({$choice: [{a: 1, b: 'first'}], $unknown: true})).toThrow(TypeError);
    expect(() => nativeValue({$choices: [{a: 1, b: 'first'}]})).toThrow(TypeError);
    expect(() => nativeValue({$selection: {a: 1, b: 'first'}})).toThrow(TypeError);
    expect(() => nativeValue({$selections: [{a: 1, b: 'first'}]})).toThrow(TypeError);
  });

  it('uses the same key for a source singleton and reconstructs fresh JSON without a group wrapper', async () => {
    const {context, root} = await source('SingleRequest');
    const hand: unknown = JSON.parse('{"$choice":{"b":"single","a":7}}');
    const before = JSON.stringify(hand);
    const expanded = expandProjectionValue(context, root, nativeSingleValue(hand));
    if (expanded.kind !== 'projection-expanded') throw new Error(expanded.rule);
    expect(expanded.payload.children.filter(child => child.kind === 'element').map(child => child.name.local)).toEqual(['A', 'B']);
    const match = matchDirectProjection(context, root, expanded.payload);
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    const assessed = assessProjectionScalars(context, match);
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    expect(applicationSingleValue(assessed.value)).toEqual(hand);
    expect(JSON.stringify(hand)).toBe(before);
    expect(() => nativeSingleValue({$choice: [{a: 7, b: 'single'}]})).toThrow(TypeError);
    expect(() => nativeValue(hand)).toThrow(TypeError);
  });

  it('keeps a repeatable group as an array even for one occurrence', async () => {
    const {context, root} = await source();
    const hand: unknown = JSON.parse('{"$choice":[{"a":1,"b":"only"}]}');
    const expanded = expandProjectionValue(context, root, nativeValue(hand));
    if (expanded.kind !== 'projection-expanded') throw new Error(expanded.rule);
    const match = matchDirectProjection(context, root, expanded.payload);
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    const assessed = assessProjectionScalars(context, match);
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    expect(applicationValue(assessed.value)).toEqual(hand);
  });

  it('expresses optional singleton presence in the schema without a second key or null alias', () => {
    expect(validateOptionalSingle({})).toBe(true);
    expect(validateSingle({})).toBe(false);
    expect(validateOptionalSingle({$choice: {c: false, d: 'chosen'}})).toBe(true);
    expect(validateOptionalSingle({$choice: []})).toBe(false);
    expect(validateOptionalSingle({$choice: null})).toBe(false);
  });

  it.each([
    {$choice: [{a: 1, d: 'crossed'}]}, {$choice: [{a: 1}]},
    {$choice: [{a: 1, b: 'x', c: true, d: 'y'}]}, {$choice: []},
    {$choice: Array.from({length: 4}, () => ({c: true, d: 'x'}))},
    {$choice: [{c: 'true', d: 'x'}]}, {$choice: [{a: 2147483648, b: 'x'}]},
  ])('rejects broken group constraints without mutating input %#', input => {
    const before = JSON.stringify(input);
    expect(() => nativeValue(input)).toThrow(TypeError);
    expect(JSON.stringify(input)).toBe(before);
  });
});
