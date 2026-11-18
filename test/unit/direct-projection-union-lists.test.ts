import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {expandProjectionValue, assessProjectionScalars} from '../../src/compiler/directValues.js';
import {matchDirectProjection, inspectDirectFixedOperand} from '../../src/compiler/directStructure.js';
import {planDirectProjection, inspectProjectionConstraintOperand} from '../../src/compiler/directStructurePlan.js';
import {describeProjectionScalar, assessProjectionScalarOperand} from '../../src/compiler/projectionScalar.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:atomic-union-lists';
const xml = (name: string, content: string, attributes = '') => parseOrderedSyntax(Buffer.from(
  `<t:${name} xmlns:t="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${attributes}>${content}</t:${name}>`), 'urn:owned:union-lists').root;
async function source(name: string) {
  const input = await loadSemanticSchemaInput(path.join(directory, 'atomic-union-lists.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual, found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing list root');
  return {context, root: found.node};
}
async function observed(name: string, content: string, attributes = '') {
  const {context, root} = await source(name);
  const matched = matchDirectProjection(context, root, xml(name, content, attributes));
  return matched.kind === 'projection-match' ? assessProjectionScalars(context, matched) : matched;
}

describe('lexical atomic union lists', () => {
  it.each([
    ['BooleanDecimal', '1', 'boolean', 'true'], ['DecimalBoolean', '1', 'decimal', '1'],
    ['Words', '1', 'string', '1'], ['Words', '+1', 'decimal', '1'],
    ['DecimalString', '1', 'decimal', '1'],
    ['Decimals', '+1', 'decimal', '1'], ['Decimals', '1.00', 'decimal', '1'],
    ['Booleans', 'true', 'string', 'true'], ['Booleans', '1', 'boolean', 'true'],
    ['Nested', 'false', 'boolean', 'false'], ['Inline', 'true', 'boolean', 'true'],
  ])('retains native effective order for %s %j', async (name, value, family, canonical) => {
    const {context, root} = await source(name);
    expect(assessProjectionScalarOperand(context, root, {value, context: {namespaces: {}, source: xml(name, '').source}}))
      .toMatchObject({kind: 'projection-scalar-operand', operand: {family: 'list', items: [{family, canonical}]}});
  });

  it.each([{value: []}, {value: ['1']}, {value: ['+007', '-000.1250', '900719925474099312345678901', '0.12345678901234567890123456789']}])
  ('keeps independent lexical array %j through two fresh inverses', async ({value}) => {
    const {context, root} = await source('Words'), before = JSON.stringify(value);
    const first = expandProjectionValue(context, root, value);
    expect(first).toMatchObject({kind: 'projection-expanded', validated: {value}});
    if (first.kind !== 'projection-expanded') throw new Error(first.kind);
    expect(expandProjectionValue(context, root, JSON.parse(JSON.stringify(first.validated.value))))
      .toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(await observed('Words', value.join(' '))).toMatchObject({kind: 'projection-value', value});
    expect(JSON.stringify(value)).toBe(before); expect(Object.isFrozen(value)).toBe(false);
    expect(first.validated.value).not.toBe(value);
  });

  it('tokenizes only XML whitespace and preserves non-XML whitespace inside string members', async () => {
    expect(await observed('Words', ' \t+007\r\n1\t-00.50 ')).toMatchObject({kind: 'projection-value', value: ['+007', '1', '-00.50']});
    const value = ['\u00a0', 'a\u2003b', '+01.00'];
    const {context, root} = await source('Strings');
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(await observed('Strings', '\u00a0 a\u2003b +01.00')).toMatchObject({kind: 'projection-value', value});
  });

  it.each([1, true, {member: 'decimal', value: '+1'}, '+1', [1], [true], [{value: '+1'}], [''], [' +1'], ['+1 '], ['1\t2'], ['1\r2'], ['1\n2'], ['1 2'], ['bad']].map(value => ({value})))
  ('refuses non-token application input %# without repair', async ({value}) => {
    const {context, root} = await source('Words');
    expect(expandProjectionValue(context, root, value).kind).not.toBe('projection-expanded');
  });

  it('refuses sparse, accessor and proxy arrays without invoking user code', async () => {
    const {context, root} = await source('Words'); let calls = 0;
    const accessor = ['1']; Object.defineProperty(accessor, '0', {get() {calls++; throw new Error('getter');}});
    const proxy = new Proxy(['1'], {get() {calls++; throw new Error('proxy');}});
    for (const value of [new Array(1), accessor, proxy, Object.assign(['1'], {extra: '1'})])
      expect(expandProjectionValue(context, root, value).kind).toBe('value-invalid');
    expect(calls).toBe(0);
  });

  it.each([
    ['FixedString', ['+1', '+1']], ['FixedString', ['1', '1']], ['FixedString', ['+1', '1']],
    ['FixedBoolean', ['1', '1']], ['FixedBoolean', ['true', 'true']],
    ['Ordered', ['+1', '+2']], ['Ordered', ['+2', '1']], ['Terminal', ['+1']],
    ['Bounded', []], ['Bounded', ['1', '1', '1', '1']],
  ])('refuses native family, order, facet or length mismatch for %s %j', async (name, value) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'scalar-invalid'});
    expect(await observed(name, value.join(' '))).toMatchObject({kind: 'scalar-invalid'});
  });

  it.each([
    ['FixedString', ['1', '+001.00']], ['FixedDecimal', ['001.0', '+02.00']],
    ['FixedBoolean', ['true', '1']], ['Ordered', ['1', '+02.00']],
    ['Bounded', ['1']], ['Bounded', ['+1', '1', '2']],
  ])('uses native ordered typed equality for %s %j', async (name, value) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(await observed(name, value.join(' '))).toMatchObject({kind: 'projection-value', value});
  });

  it('retains the existing whole-list pattern witness and source-derived refusals', async () => {
    const {context, root} = await source('Witness');
    expect(expandProjectionValue(context, root, '+01.00 1')).toMatchObject({kind: 'projection-expanded', validated: {value: '+01.00 1'}});
    expect(await observed('Witness', '+01.00 1')).toMatchObject({kind: 'projection-value', value: '+01.00 1'});
    for (const value of [['+01.00', '1'], '1 1', '+01.00 +1'])
      expect(expandProjectionValue(context, root, value).kind).not.toBe('projection-expanded');
  });

  it('retains default source witnesses, inherited attributes and absent/present-empty rules', async () => {
    expect(await observed('Default', '')).toMatchObject({kind: 'projection-value', value: ['+1', '1']});
    const defaults = {fixed: ['1', '+1'], default: ['+1', '1']};
    expect(await observed('Record', '')).toMatchObject({kind: 'projection-value', value: defaults});
    expect(await observed('Record', '<t:optional/>')).toMatchObject({kind: 'projection-value', value: {...defaults, optional: ['+1', '1']}});
    const {context, root} = await source('Record'), value = {optional: []};
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value: {...defaults, optional: ['+1', '1']}}});
    expect(value).toEqual({optional: []});
    expect(await observed('Record', '', 'fixed="+1 +1"')).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
    expect(await observed('Record', '', 'xsi:nil="true" fixed="+1 +1"')).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
  });

  it('retains simple-content and nil constraints', async () => {
    expect(await observed('Simple', '1 +01.00')).toMatchObject({kind: 'projection-value', value: {$value: ['1', '+01.00'], fixed: ['1', '+1']}});
    expect(await observed('Simple', '+1 +1')).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-element-value'});
    expect(await observed('NilSimple', '', 'xsi:nil="true"')).toMatchObject({kind: 'projection-value', value: {$nil: true, fixed: ['1', '+1']}});
    expect(await observed('FixedString', '', 'xsi:nil="true"')).toMatchObject({kind: 'mismatch', rule: 'nil-fixed-value'});
  });

  it('authenticates and deeply freezes list and selected-item constraint evidence', async () => {
    const {context, root} = await source('FixedDecimal');
    const plan = planDirectProjection(context, root, () => {}, () => {throw new Error('Unsupported fixture');});
    const constraint = plan.root.constraint!, typed = inspectProjectionConstraintOperand(context, constraint);
    expect(Object.keys(constraint).sort()).toEqual(['canonical', 'kind', 'lexical']);
    expect(Object.isFrozen(typed)).toBe(true); expect(Object.isFrozen(typed.items)).toBe(true);
    for (const item of typed.items!) {expect(Object.isFrozen(item)).toBe(true); expect(Object.isFrozen(item.decimal)).toBe(true);}
    expect(() => inspectProjectionConstraintOperand(context, {...constraint})).toThrow(TypeError);
    const other = await source('FixedDecimal');
    expect(() => inspectProjectionConstraintOperand(other.context, constraint)).toThrow(TypeError);
    const matched = matchDirectProjection(context, root, xml('FixedDecimal', '1.00 +2'));
    if (matched.kind !== 'projection-match') throw new Error(matched.kind);
    expect(Object.isFrozen(inspectDirectFixedOperand(context, matched.occurrences[0]!)?.items)).toBe(true);
  });

  it('bounds the complete list by application item and text capacities', async () => {
    const {context, root} = await source('Words');
    expect(expandProjectionValue(context, root, ['1', '+1'], {maxItems: 2}).kind).toBe('resource-limit');
    expect(expandProjectionValue(context, root, ['12345'], {maxText: 4}).kind).toBe('resource-limit');
  });

  it('cancels native item work and retains sticky exhaustion without a partial list', async () => {
    const {context, root} = await source('Words');
    expect(describeProjectionScalar(context, root).kind).toBe('projection-scalar-type');
    const lexical = {value: '+1 1 +2', context: {namespaces: {}, source: xml('Words', '').source}};
    let checks = 0; const stop = new Error('list-cancel');
    expect(() => assessProjectionScalarOperand(context, root, lexical, () => {if (++checks === 25) throw stop;})).toThrow(stop);
    expect(assessProjectionScalarOperand(context, root, lexical)).toMatchObject({kind: 'projection-scalar-operand', operand: {items: [{family: 'decimal'}, {family: 'string'}, {family: 'decimal'}]}});
    context.budget.guard(() => context.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(assessProjectionScalarOperand(context, root, lexical)).toBe(context.budget.failure());
  });
});
