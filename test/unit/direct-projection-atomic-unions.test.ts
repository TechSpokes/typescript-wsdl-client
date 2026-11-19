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
const namespace = 'urn:atomic-union-constraints';
const xml = (name: string, content: string, attributes = '') => parseOrderedSyntax(Buffer.from(
  `<t:${name} xmlns:t="${namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ${attributes}>${content}</t:${name}>`), 'urn:owned:atomic-union').root;
async function source(name: string) {
  const input = await loadSemanticSchemaInput(path.join(directory, 'atomic-union-constraints.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing atomic union root');
  return {context, root: found.node};
}
async function observed(name: string, content: string, attributes = '') {
  const {context, root} = await source(name);
  const matched = matchDirectProjection(context, root, xml(name, content, attributes));
  if (matched.kind !== 'projection-match') return matched;
  return assessProjectionScalars(context, matched);
}

describe('checked lexical atomic unions and typed constraints', () => {
  it.each([
    ['BooleanDecimal', '1', 'boolean', 'true'], ['DecimalBoolean', '1', 'decimal', '1'],
    ['StringDecimal', '1', 'string', '1'], ['StringDecimal', '+1', 'decimal', '1'],
    ['StringDecimal', ' 1 ', 'decimal', '1'], ['DecimalString', '1', 'decimal', '1'],
    ['Nested', 'true', 'boolean', 'true'], ['Nested', '1', 'string', '1'],
  ])('uses native first-success selection for %s %j', async (name, value, family, canonical) => {
    const {context, root} = await source(name);
    const operand = assessProjectionScalarOperand(context, root, {value, context: {namespaces: {}, source: xml(name, '').source}});
    expect(operand).toMatchObject({kind: 'projection-scalar-operand', operand: {family, canonical}});
  });

  it.each(['+007', '+01.00', ' 1 ', '900719925474099312345678901', '0.12345678901234567890123456789'])
  ('keeps hand JSON lexical %j through two fresh inverses and observed XML', async value => {
    const {context, root} = await source('StringDecimal');
    const first = expandProjectionValue(context, root, value);
    expect(first).toMatchObject({kind: 'projection-expanded', validated: {value}});
    if (first.kind !== 'projection-expanded') throw new Error(first.kind);
    expect(expandProjectionValue(context, root, JSON.parse(JSON.stringify(first.validated.value))))
      .toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(await observed('StringDecimal', value)).toMatchObject({kind: 'projection-value', value});
  });

  it.each([1, true, {member: 'decimal', value: '+1'}, 'no'])('refuses nonlexical or invalid application input %#', async value => {
    const {context, root} = await source('StringDecimal');
    expect(expandProjectionValue(context, root, value).kind).not.toBe('projection-expanded');
  });

  it.each([
    ['BoundedDecimalUnion', '+9007199254740993.000000000000000001'],
    ['BoundedDecimalUnion', '+9007199254740993.000000000000000002'],
    ['BoundedIntegerUnion', '+9007199254740993'], ['BoundedIntegerUnion', '+9007199254740994'],
  ])('keeps inherited exact bounds and the derived pattern witness for %s %j', async (name, value) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(await observed(name, value)).toMatchObject({kind: 'projection-value', value});
  });

  it.each([
    ['BoundedDecimalUnion', '+9007199254740993.000000000000000000'],
    ['BoundedDecimalUnion', '+9007199254740993.000000000000000003'],
    ['BoundedDecimalUnion', '9007199254740993.000000000000000002'],
    ['BoundedIntegerUnion', '+9007199254740992'], ['BoundedIntegerUnion', '+9007199254740995'],
    ['BoundedIntegerUnion', '9007199254740993'],
  ])('refuses an exact inherited bound or derived pattern failure for %s %j', async (name, value) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'scalar-invalid'});
    expect(await observed(name, value)).toMatchObject({kind: 'scalar-invalid'});
  });

  it.each([
    ['FixedString', '+1'], ['FixedString', ' 1 '], ['FixedBoolean', '1'], ['FixedBoolean', ' true '],
    ['OnlyStringOne', '+1'],
  ])('retains typed family distinctions for %s %j', async (name, value) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'scalar-invalid'});
    expect(await observed(name, value)).toMatchObject({kind: 'scalar-invalid'});
  });

  it.each([['FixedDecimal', '+01.00'], ['FixedDecimal', ' 1 '], ['OnlyDecimalOne', '001.0'], ['FixedString', '1'], ['FixedBoolean', 'true']])
  ('compares equal native values for %s %j', async (name, value) => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(await observed(name, value)).toMatchObject({kind: 'projection-value', value});
  });

  it('retains the original default witness and distinguishes absent optional from present empty', async () => {
    expect(await observed('Default', '')).toMatchObject({kind: 'projection-value', value: '+1'});
    const defaults = {fixedString: '1', fixedDecimal: '+1', fixedBoolean: 'true', defaultAlias: '+1'};
    expect(await observed('Record', '')).toMatchObject({kind: 'projection-value', value: defaults});
    expect(await observed('Record', '<t:optional/>')).toMatchObject({kind: 'projection-value', value: {...defaults, optional: '+1'}});
    const {context, root} = await source('Record'), input = {optional: '+01.00'};
    const before = JSON.stringify(input);
    expect(expandProjectionValue(context, root, input)).toMatchObject({kind: 'projection-expanded', validated: {value: {...defaults, optional: '+01.00'}}});
    expect(JSON.stringify(input)).toBe(before); expect(Object.isFrozen(input)).toBe(false);
  });

  it.each(['fixedString="+1"', 'fixedBoolean="1"'])('enforces inherited attribute family equality for %s', async attributes => {
    expect(await observed('Record', '', attributes)).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
    expect(await observed('Record', '', `xsi:nil="true" ${attributes}`)).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
  });

  it('keeps equal decimal aliases, simple-content fixed values and nil rules', async () => {
    expect(await observed('Record', '', 'fixedDecimal="+01.00"')).toMatchObject({kind: 'projection-value', value: {fixedDecimal: '+01.00'}});
    expect(await observed('Simple', '1')).toMatchObject({kind: 'projection-value', value: {$value: '1', fixedString: '1'}});
    expect(await observed('Simple', '+1')).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-element-value'});
    expect(await observed('NilSimple', '', 'xsi:nil="true"')).toMatchObject({kind: 'projection-value', value: {$nil: true, fixedString: '1'}});
    const {context, root} = await source('FixedString');
    expect(expandProjectionValue(context, root, {$nil: true})).toMatchObject({kind: 'value-invalid'});
    expect(await observed('FixedString', '', 'xsi:nil="true"')).toMatchObject({kind: 'mismatch', rule: 'nil-fixed-value'});
  });

  it('keeps token arrays for lists of unions and complete lexical strings for union list members', async () => {
    const kept = await source('RetainedList');
    expect(expandProjectionValue(kept.context, kept.root, ['1', 'true'])).toMatchObject({kind: 'projection-expanded', validated: {value: ['1', 'true']}});
    const composed = await source('StringDecimalList');
    expect(expandProjectionValue(composed.context, composed.root, ['1', '+01.00'])).toMatchObject({kind: 'projection-expanded', validated: {value: ['1', '+01.00']}});
    const {context, root} = await source('ListOrDecimal');
    expect(expandProjectionValue(context, root, 'one two')).toMatchObject({kind: 'projection-expanded', validated: {value: 'one two'}});
    expect(await observed('ListOrDecimal', 'one two')).toMatchObject({kind: 'projection-value', value: 'one two'});
    expect(expandProjectionValue(context, root, ['one', 'two'])).toMatchObject({kind: 'value-invalid', rule: 'string-required'});
  });

  it('does not turn cancellation or sticky exhaustion into failed-member fallthrough', async () => {
    const {context, root} = await source('StringDecimal');
    expect(describeProjectionScalar(context, root).kind).toBe('projection-scalar-type');
    const lexical = {value: '+1', context: {namespaces: {}, source: xml('StringDecimal', '').source}};
    let checks = 0; const stop = new Error('atomic-member-cancellation');
    expect(() => assessProjectionScalarOperand(context, root, lexical, () => {if (++checks === 15) throw stop;})).toThrow(stop);
    expect(assessProjectionScalarOperand(context, root, lexical)).toMatchObject({kind: 'projection-scalar-operand', operand: {family: 'decimal'}});
    context.budget.guard(() => context.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(assessProjectionScalarOperand(context, root, lexical)).toBe(context.budget.failure());
  });

  it('authenticates and deeply freezes transient fixed operands without serialized constraint fields', async () => {
    const {context, root} = await source('FixedDecimal');
    const plan = planDirectProjection(context, root, () => {}, () => {throw new Error('Unsupported fixture');});
    const constraint = plan.root.constraint!;
    expect(Object.keys(constraint).sort()).toEqual(['canonical', 'kind', 'lexical']);
    const typed = inspectProjectionConstraintOperand(context, constraint);
    expect(Object.isFrozen(typed)).toBe(true); expect(Object.isFrozen(typed.decimal)).toBe(true);
    expect(() => inspectProjectionConstraintOperand(context, {...constraint})).toThrow(TypeError);
    const other = await source('FixedDecimal');
    expect(() => inspectProjectionConstraintOperand(other.context, constraint)).toThrow(TypeError);
    const matched = matchDirectProjection(context, root, xml('FixedDecimal', '+01.00'));
    if (matched.kind !== 'projection-match') throw new Error(matched.kind);
    const fixed = inspectDirectFixedOperand(context, matched.occurrences[0]!);
    expect(Object.isFrozen(fixed)).toBe(true); expect(Object.isFrozen(fixed?.decimal)).toBe(true);
    expect(() => inspectDirectFixedOperand(other.context, matched.occurrences[0]!)).toThrow(TypeError);
  });

  it('charges native typed equality text work in addition to ordinary scalar assessment', async () => {
    const lexical = 'A'.repeat(1024);
    const cost = async (name: string) => {
      const {context, root} = await source(name);
      const matched = matchDirectProjection(context, root, xml(name, lexical));
      if (matched.kind !== 'projection-match') throw new Error(matched.kind);
      const before = context.budget.usage().work;
      expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'projection-value', value: lexical});
      return context.budget.usage().work - before;
    };
    // @why sameValue accounts for both canonical texts through the existing native text contract.
    expect(await cost('LongFixed') - await cost('LongOpen')).toBeGreaterThanOrEqual(8 * lexical.length + 2);
  });
});
