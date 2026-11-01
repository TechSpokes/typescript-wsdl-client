import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';
import {describeProjectionScalar} from '../../src/compiler/projectionScalar.js';
import {assessProjectionScalarOperand} from '../../src/compiler/projectionScalar.js';
import {checkComponentConstruction} from '../../src/compiler/schemaConstructionAssessment.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:restricted-scalars';
const text = '<t:Request xmlns:t="urn:restricted-scalars"><t:Code>  AB12  </t:Code><t:Money>0012.50</t:Money><t:Count>2</t:Count></t:Request>';
const expected = {Target: 'Test', FixedCode: 'AB12', Code: 'AB12', Money: '12.5', Count: 2};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:synthetic-restricted-payload').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'restricted-scalars.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('native declared scalar payload enforcement', () => {
  it('retains aliases, inherited whitespace/patterns, numeric facets and attribute constraints through JSON', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const result = assessProjectionScalars(context, matched);
    expect(result).toMatchObject({kind: 'projection-value', value: expected});
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    expect(expandProjectionValue(context, root, {Code: ' AB12 ', Money: '12.50', Count: 2}))
      .toMatchObject({kind: 'projection-expanded', validated: {value: expected}});
  });

  it.each([
    ['pattern layer', 'AB12', 'AC12'], ['inherited pattern', 'AB12', 'ABxx'], ['length', 'AB12', 'AB123'],
    ['precision', '0012.50', '12.345'], ['minimum', '0012.50', '-1'], ['exclusive maximum', '0012.50', '1000'], ['integer range', '>2<', '>4<'],
  ])('rejects %s without changing source validity into a payload assertion', async (_label, before, after) => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text.replace(before, after)));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
    const valid = matchDirectProjection(context, root, xml(text));
    if (valid.kind !== 'projection-match') throw new Error(valid.rule);
    expect(assessProjectionScalars(context, valid).kind).toBe('projection-value');
  });

  it('checks named attribute enums and typed fixed values without rescue or coercion', async () => {
    const {context, root} = await source();
    for (const attributes of [' Target="Unknown"', ' FixedCode="AB13"']) {
      const matched = matchDirectProjection(context, root, xml(text.replace('xmlns:t="urn:restricted-scalars"', 'xmlns:t="urn:restricted-scalars"' + attributes)));
      if (matched.kind !== 'projection-match') throw new Error(matched.rule);
      expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
    }
    expect(expandProjectionValue(context, root, {...expected, Money: 12.5})).toMatchObject({kind: 'value-invalid', rule: 'string-required'});
    expect(expandProjectionValue(context, root, {...expected, Count: '2'})).toMatchObject({kind: 'value-invalid'});
  });

  it.each(['Scalar', 'FlatRecord'])('does not widen the flat operation grammar for %s', async name => {
    const {context, root} = await source(name);
    const payload = name === 'Scalar' ? '<t:Scalar xmlns:t="urn:restricted-scalars">AB12</t:Scalar>' : '<t:FlatRecord xmlns:t="urn:restricted-scalars"><t:Code>Test</t:Code></t:FlatRecord>';
    expect(matchDirectProjection(context, root, xml(payload), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
    expect(matchDirectProjection(context, root, xml(payload)).kind).toBe('projection-match');
  });

  it.each(['Union'])('refuses unimplemented %s representation rather than returning a string', async name => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, '1')).toMatchObject({kind: 'unsupported'});
  });

  it('represents a list explicitly as an array rather than a primitive string', async () => {
    const {context, root} = await source('List');
    expect(expandProjectionValue(context, root, ['one', 'two'])).toMatchObject({kind: 'projection-expanded', validated: {value: ['one', 'two']}});
    expect(expandProjectionValue(context, root, 'one two')).toMatchObject({kind: 'value-invalid'});
  });

  it('checks exact declaration identity before reading foreign/proxy fields and retains sticky exhaustion', async () => {
    const {context, root} = await source('Scalar');
    expect(() => describeProjectionScalar(context, {...root})).toThrow(TypeError);
    const other = await source('Scalar');
    expect(() => describeProjectionScalar(other.context, root)).toThrow(TypeError);
    let traps = 0;
    expect(() => describeProjectionScalar(context, new Proxy(root, {get() {traps++; throw new Error('trap');}}))).toThrow(TypeError);
    expect(traps).toBe(0);
    context.budget.guard(() => context.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(describeProjectionScalar(context, root)).toBe(context.budget.failure());
  });

  it('discards interrupted scalar preparation and succeeds on a later uncancelled request', async () => {
    const {context, root} = await source('Scalar');
    const controller = new AbortController();
    const original = context.budget.chargeWork;
    let charges = 0;
    context.budget.chargeWork = (amount = 1) => {if (++charges === 80) controller.abort(); original(amount);};
    expect(expandProjectionValue(context, root, 'AB12', {signal: controller.signal})).toMatchObject({kind: 'cancelled'});
    context.budget.chargeWork = original;
    expect(expandProjectionValue(context, root, 'AB12')).toMatchObject({kind: 'projection-expanded', validated: {value: 'AB12'}});
  });

  it('keeps invalid source formation distinct from invalid payload membership', async () => {
    const input = await loadSemanticSchemaInput(path.join(directory, 'invalid-scalar-formation.xsd'), {policy: {fileRoots: [directory]}});
    const prepared = prepareSourceSchemaRequest(input);
    if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
    const context = prepared.request.actual;
    const found = context.lookup(globalId('element', {namespace: 'urn:invalid-scalar-formation', local: 'Value'}));
    if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing invalid-source fixture root');
    const declaration = found.node;
    expect(describeProjectionScalar(context, declaration)).toMatchObject({kind: 'unavailable'});
    expect(expandProjectionValue(context, declaration, 'x')).toMatchObject({kind: 'unsupported'});
    expect(checkComponentConstruction(context, globalId('type', {namespace: 'urn:invalid-scalar-formation', local: 'Contradiction'}))).toMatchObject({kind: 'invalid-schema'});
  });

  it('checks cancellation inside cached-type operand work and permits a later valid operand', async () => {
    const {context, root} = await source('Scalar');
    expect(describeProjectionScalar(context, root).kind).toBe('projection-scalar-type');
    let checks = 0;
    const cancelled = new Error('owned operand cancellation');
    const lexical = {value: 'AB12'.repeat(5000), context: {namespaces: {}, source: xml('<v/>').source}};
    expect(() => assessProjectionScalarOperand(context, root, lexical, () => {if (++checks === 100) throw cancelled;})).toThrow(cancelled);
    expect(assessProjectionScalarOperand(context, root, {...lexical, value: 'AB12'})).toMatchObject({kind: 'projection-scalar-operand', operand: {canonical: 'AB12'}});
  });
});
