import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';
import {planDirectProjection, resolveProjectionWildcard} from '../../src/compiler/directStructurePlan.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:strict-wildcards', foreign = 'urn:foreign-wildcards';
const entry = (local: string, value: unknown, ns = namespace) => ({name: {namespace: ns, local}, value});
const payload = {id: 'synthetic', Flag: true, Count: 2};
const value = {$content: [entry('Payload', payload), entry('Payload', {Label: 'foreign record'}, foreign), entry('Request', {$content: [entry('Text', {$value: 'nested text', version: 1})]})]};
const text = '<t:Request xmlns:t="urn:strict-wildcards" xmlns:f="urn:foreign-wildcards"><t:Payload id="synthetic"><t:Flag>1</t:Flag><t:Count>2</t:Count></t:Payload><f:Payload><f:Label>foreign record</f:Label></f:Payload><t:Request><t:Text version="1">nested text</t:Text></t:Request></t:Request>';
const xml = (text: string) => parseOrderedSyntax(Buffer.from(text), 'urn:synthetic-strict-wildcard').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'strict-wildcards.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('native strict wildcard projection', () => {
  it('preserves imported and recursive declared records through XML, JSON and inverse construction', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const assessed = assessProjectionScalars(context, matched);
    expect(assessed).toMatchObject({kind: 'projection-value', value});
    if (assessed.kind !== 'projection-value') throw new Error(assessed.rule);
    const input: unknown = JSON.parse(JSON.stringify(assessed.value));
    expect(expandProjectionValue(context, root, input)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    expect(input).toEqual(value); expect(Object.isFrozen(input)).toBe(false);
    expect(matchDirectProjection(context, root, xml(text), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
  });

  it('uses the standards-derived strict default, accepting empty content but refusing unknown or merely local elements', async () => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {$content: []})).toMatchObject({kind: 'projection-expanded', validated: {value: {$content: []}}});
    for (const local of ['Unknown', 'Flag']) {
      expect(expandProjectionValue(context, root, {$content: [entry(local, 'sample')]})).toMatchObject({kind: 'value-invalid', rule: 'unknown-ordered-element'});
      expect(matchDirectProjection(context, root, xml('<t:Request xmlns:t="urn:strict-wildcards"><t:' + local + '>sample</t:' + local + '></t:Request>'))).toMatchObject({kind: 'mismatch', rule: 'ordered-particle-language'});
    }
  });

  it('enforces declared scalar and nested structural validity rather than accepting known names as success', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text.replace('<t:Flag>1', '<t:Flag>yes')));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
    expect(matchDirectProjection(context, root, xml(text.replace('<t:Count>2</t:Count>', '')))).toMatchObject({kind: 'mismatch', rule: 'missing-required'});
    expect(expandProjectionValue(context, root, {$content: [entry('Payload', {...payload, Flag: 'true'})]})).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, {$content: [entry('Payload', {...payload, Count: 2147483648})]})).toMatchObject({kind: 'scalar-invalid'});
    expect(expandProjectionValue(context, root, {$content: [entry('Payload', {Flag: true, Count: 2})]})).toMatchObject({kind: 'value-invalid', rule: 'missing-attribute'});
  });

  it('enforces namespace constraints, cardinality and disjoint wildcard choice selection', async () => {
    const bounded = await source('Bounded');
    expect(expandProjectionValue(bounded.context, bounded.root, {$content: [entry('Payload', payload)]})).toMatchObject({kind: 'projection-expanded'});
    for (const $content of [[], Array.from({length: 3}, () => entry('Payload', payload))]) {
      expect(expandProjectionValue(bounded.context, bounded.root, {$content})).toMatchObject({kind: 'value-invalid', rule: 'ordered-particle-language'});
    }
    expect(expandProjectionValue(bounded.context, bounded.root, {$content: [entry('Payload', {Label: 'excluded namespace'}, foreign)]})).toMatchObject({kind: 'value-invalid', rule: 'unknown-ordered-element'});
    const partitioned = await source('Partitioned');
    expect(expandProjectionValue(partitioned.context, partitioned.root, value)).toMatchObject({kind: 'projection-expanded', validated: {value}});
    const sequence = await source('Sequence');
    const application = {$content: [entry('Header', 'synthetic'), entry('Payload', {Label: 'foreign record'}, foreign)]};
    expect(expandProjectionValue(sequence.context, sequence.root, application)).toMatchObject({kind: 'projection-expanded', validated: {value: application}});
  });

  it('refuses copied/foreign wildcard metadata and excludes unsupported processing/overlap without schema-invalid claims', async () => {
    const {context, root} = await source();
    const plan = planDirectProjection(context, root, () => {}, () => {throw new Error('unsupported');});
    const record = plan.records[0]!;
    expect(resolveProjectionWildcard(context, record, {namespace, local: 'Payload'}, () => {})).toMatchObject({kind: 'element', name: {namespace, local: 'Payload'}});
    expect(() => resolveProjectionWildcard(context, {...record}, {namespace, local: 'Payload'}, () => {})).toThrow(TypeError);
    const other = await source();
    expect(() => resolveProjectionWildcard(other.context, record, {namespace, local: 'Payload'}, () => {})).toThrow(TypeError);
    for (const name of ['Overlap']) {
      const selected = await source(name);
      expect(expandProjectionValue(selected.context, selected.root, {$content: []})).toMatchObject({kind: 'unsupported'});
    }
    for (const name of ['Lax', 'Skip']) {
      const selected = await source(name);
      expect(expandProjectionValue(selected.context, selected.root, {$namespaces: {}, $content: []})).toMatchObject({kind: 'projection-expanded'});
    }
  });

  it('preserves explicit limits, cancellation and cycle refusal in dynamically selected records', async () => {
    const lax = await source('Lax');
    const child: {$namespace: string; $content: unknown[]} = {$namespace: namespace, $content: []};
    child.$content.push({Lax: child});
    expect(expandProjectionValue(lax.context, lax.root, {$namespaces: {t: namespace}, $content: [{Lax: child}]}, {maxItems: 8}))
      .toMatchObject({kind: 'value-invalid', rule: 'cyclic-value'});
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, value, {maxItems: 2})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, value, {maxText: 2})).toMatchObject({kind: 'resource-limit'});
    const cyclic: {$content: unknown[]} = {$content: []}; cyclic.$content.push(entry('Request', cyclic));
    expect(expandProjectionValue(context, root, cyclic)).toMatchObject({kind: 'value-invalid', rule: 'cyclic-value'});
    const abort = new AbortController(); abort.abort();
    expect(expandProjectionValue(context, root, value, {signal: abort.signal})).toMatchObject({kind: 'cancelled'});
  });

  it('retains repeated named-group wildcard incidences rather than collapsing their overlap', async () => {
    const {context, root} = await source('Reused');
    let rule: string | undefined;
    expect(() => planDirectProjection(context, root, () => {}, detail => {
      rule = detail?.rule; throw new Error('unsupported');
    })).toThrow('unsupported');
    expect(rule).toBe('ordered-wildcard-incidence-overlap');
  });
});
