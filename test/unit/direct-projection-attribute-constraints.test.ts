import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:attribute-constraints';
const text = '<t:Request xmlns:t="urn:attribute-constraints" Required="7"><t:Name>synthetic</t:Name></t:Request>';
const expected = {Name: 'synthetic', Required: 7, Summary: false, Amount: '1.25', Enabled: true,
  Instant: '2026-10-31T18:00:00Z', Binary: 'AQI=', Global: true, Note: 'kept'};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:synthetic-attribute-constraints').root;
async function source() {
  const input = await loadSemanticSchemaInput(path.join(directory, 'attribute-constraints.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: 'Request'}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('native explicit XML attribute assessment', () => {
  it('marks absent optional defaults/fixed values and projects native typed values through JSON', async () => {
    const {context, root} = await source();
    const payload = structuredClone(xml(text)), before = JSON.stringify(payload);
    const match = matchDirectProjection(context, root, payload);
    if (match.kind !== 'projection-match' || match.tree.kind !== 'record') throw new Error(match.kind);
    expect(match.tree.attributes.filter(attribute => attribute.origin === 'present')).toHaveLength(1);
    expect(match.tree.attributes.filter(attribute => attribute.origin === 'schema-default')).toHaveLength(4);
    expect(match.tree.attributes.filter(attribute => attribute.origin === 'schema-fixed')).toHaveLength(3);
    const result = assessProjectionScalars(context, match);
    expect(result).toMatchObject({kind: 'projection-value', value: expected});
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    expect(JSON.stringify(payload)).toBe(before); expect(Object.isFrozen(payload)).toBe(false);
  });

  it('does not insert defaults in application input or freshly constructed XML', async () => {
    const {context, root} = await source();
    const application = {Required: 7, Name: 'synthetic'};
    const result = expandProjectionValue(context, root, application);
    if (result.kind !== 'projection-expanded') throw new Error(result.rule);
    expect(result.validated.value).toEqual(expected);
    expect(result.payload.attributes.map(attribute => [attribute.name.local, attribute.value])).toEqual([['Required', '7']]);
    expect(application).toEqual({Required: 7, Name: 'synthetic'}); expect(Object.isFrozen(application)).toBe(false);
  });

  it('allows explicit valid alternatives to defaults and compares fixed values in value space', async () => {
    const {context, root} = await source();
    const match = matchDirectProjection(context, root, xml(text.replace('Required="7"',
      'Required="007" Summary="true" Amount="2.500" Enabled="1" Instant="2026-10-31T19:00:00+01:00" Binary="A Q I =" t:Global="0" Note=""')));
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    expect(assessProjectionScalars(context, match)).toMatchObject({kind: 'projection-value', value: {
      ...expected, Summary: true, Amount: '2.5', Instant: '2026-10-31T19:00:00+01:00', Global: false, Note: '',
    }});
  });

  it.each([
    ['Enabled', 'false'], ['Instant', '2026-10-31T18:01:00Z'], ['Binary', 'AwQ='], ['Required', '8'],
  ])('rejects a present fixed %s mismatch', async (name, value) => {
    const {context, root} = await source();
    const altered = name === 'Required' ? text.replace('Required="7"', `Required="${value}"`) : text.replace('Required="7"', `Required="7" ${name}="${value}"`);
    const match = matchDirectProjection(context, root, xml(altered));
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    expect(assessProjectionScalars(context, match)).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
  });

  it('never rescues missing required fields or invalid supplied values with defaults', async () => {
    const {context, root} = await source();
    expect(expandProjectionValue(context, root, {Name: 'synthetic'})).toMatchObject({kind: 'value-invalid', rule: 'missing-attribute'});
    expect(expandProjectionValue(context, root, {Required: 7})).toMatchObject({kind: 'value-invalid', rule: 'missing-member'});
    expect(expandProjectionValue(context, root, {Required: '7', Name: 'synthetic'})).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, {Required: 7, Name: 'synthetic', Summary: 'false'})).toMatchObject({kind: 'value-invalid'});
    expect(expandProjectionValue(context, root, {Required: 7, Name: 'synthetic', Enabled: false})).toMatchObject({kind: 'scalar-invalid', rule: 'fixed-attribute-value'});
    expect(matchDirectProjection(context, root, xml(text.replace(' Required="7"', '')))).toMatchObject({kind: 'mismatch', rule: 'missing-required-attribute'});
  });
});
