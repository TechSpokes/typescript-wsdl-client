import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:scalar-records';
const text = '<t:Request xmlns:t="urn:scalar-records" Version="01.2500" TimeStamp="2026-10-31T18:00:00Z" Offset="P2DT3H" Counter="9007199254740993" Binary="A Q I =" Hex="0aff" Ratio="INF" Language="en-US"><t:Day>2026-10-31</t:Day><t:Code>synthetic</t:Code><t:Link>relative/path</t:Link></t:Request>';
const expected = {Version: '1.25', TimeStamp: '2026-10-31T18:00:00Z', Offset: 'P2DT3H', Counter: '9007199254740993', Binary: 'AQI=', Hex: '0AFF', Ratio: 'INF', Language: 'en-US', Day: '2026-10-31', Code: 'synthetic', Link: 'relative/path'};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:synthetic-scalar-record').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'scalar-records.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const root = context.lookup(globalId('element', {namespace, local: name}));
  if (root.kind !== 'found' || root.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: root.node};
}

describe('native projection builtin scalar families', () => {
  it('preserves exact and temporal lexical strings and canonical binary text through JSON', async () => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    const result = assessProjectionScalars(context, matched);
    expect(result).toMatchObject({kind: 'projection-value', value: expected});
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    const inverse = expandProjectionValue(context, root, structuredClone(expected));
    if (inverse.kind !== 'projection-expanded') throw new Error(inverse.rule);
    expect(inverse.validated.value).toEqual(expected);
    expect(Object.fromEntries(inverse.payload.attributes.map(attribute => [attribute.name.local, attribute.value])))
      .toEqual(Object.fromEntries(Object.entries(expected).filter(([key]) => !['Day', 'Code', 'Link'].includes(key))));
    expect(matchDirectProjection(context, root, xml(text), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
  });

  it.each([
    ['decimal', 'Version="01.2500"', 'Version="1e2"'],
    ['dateTime', 'TimeStamp="2026-10-31T18:00:00Z"', 'TimeStamp="2026-02-30T18:00:00Z"'],
    ['duration', 'Offset="P2DT3H"', 'Offset="P"'],
    ['long bound', 'Counter="9007199254740993"', 'Counter="9223372036854775808"'],
    ['base64 padding bits', 'Binary="A Q I ="', 'Binary="AR=="'],
    ['hex', 'Hex="0aff"', 'Hex="abc"'],
    ['float', 'Ratio="INF"', 'Ratio="Infinity"'],
    ['language', 'Language="en-US"', 'Language="en_US"'],
    ['NCName', '<t:Code>synthetic</t:Code>', '<t:Code>a:b</t:Code>'],
  ])('rejects invalid %s using the native neutral datatype core', async (_label, before, after) => {
    const {context, root} = await source();
    const matched = matchDirectProjection(context, root, xml(text.replace(before, after)));
    if (matched.kind !== 'projection-match') throw new Error(matched.rule);
    expect(assessProjectionScalars(context, matched)).toMatchObject({kind: 'scalar-invalid'});
  });

  it.each(['Version', 'Counter', 'Ratio', 'TimeStamp'] as const)('does not coerce application %s values into strings', async field => {
    const {context, root} = await source();
    const application = {...expected, [field]: field === 'TimeStamp' ? new Date('2026-10-31T18:00:00Z') : 1};
    expect(expandProjectionValue(context, root, application)).toMatchObject({kind: 'value-invalid', rule: 'string-required'});
    expect(application[field]).not.toBe(expected[field]);
  });

  it('supports exact scalar roots while retaining flat preview refusal and explicit text limits', async () => {
    const {context, root} = await source('Decimal');
    expect(expandProjectionValue(context, root, '9007199254740993.25')).toMatchObject({kind: 'projection-expanded', validated: {value: '9007199254740993.25'}});
    expect(expandProjectionValue(context, root, '1.25', {maxText: 3})).toMatchObject({kind: 'resource-limit'});
    expect(matchDirectProjection(context, root, xml('<t:Decimal xmlns:t="urn:scalar-records">1.25</t:Decimal>'), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
  });

  it.each(['QName', 'ID', 'IDREF', 'ENTITY'])('does not erase missing context semantics for %s', async name => {
    const {context, root} = await source(name);
    expect(expandProjectionValue(context, root, 'synthetic')).toMatchObject({kind: 'unsupported', rule: 'native-direct-shape'});
  });
});
