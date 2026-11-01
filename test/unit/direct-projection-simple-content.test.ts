import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {parseOrderedSyntax} from '../../src/loader/orderedSyntax.js';
import {matchDirectProjection} from '../../src/compiler/directStructure.js';
import {assessProjectionScalars, expandProjectionValue} from '../../src/compiler/directValues.js';

const directory = path.resolve('test/conformance/fixtures/xsd/projection');
const namespace = 'urn:simple-content-records';
const text = '<t:Request xmlns:t="urn:simple-content-records"><t:Item id="a" priority="2"> AB<![CDATA[12 ]]></t:Item><t:Item id="b" lang="fr">CD34</t:Item><t:Amount>0012.50</t:Amount></t:Request>';
const expected = {Item: [{id: 'a', priority: 2, lang: 'en', $value: 'AB12'}, {id: 'b', lang: 'fr', $value: 'CD34'}], Amount: {Currency: 'USD', $value: '12.5'}};
const xml = (value: string) => parseOrderedSyntax(Buffer.from(value), 'urn:synthetic-simple-content').root;
async function source(name = 'Request') {
  const input = await loadSemanticSchemaInput(path.join(directory, 'simple-content-records.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const context = prepared.request.actual;
  const found = context.lookup(globalId('element', {namespace, local: name}));
  if (found.kind !== 'found' || found.node.kind !== 'element') throw new Error('Missing root');
  return {context, root: found.node};
}

describe('native simple-content record projection', () => {
  it('preserves inherited typed text, attributes and record boundaries through JSON and inverse construction', async () => {
    const {context, root} = await source();
    const match = matchDirectProjection(context, root, xml(text));
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    const result = assessProjectionScalars(context, match);
    expect(result).toMatchObject({kind: 'projection-value', value: expected});
    if (result.kind === 'projection-value') expect(JSON.parse(JSON.stringify(result.value))).toEqual(expected);
    const application = structuredClone(expected), before = JSON.stringify(application);
    const inverse = expandProjectionValue(context, root, application);
    expect(inverse).toMatchObject({kind: 'projection-expanded', validated: {value: expected}});
    expect(JSON.stringify(application)).toBe(before); expect(Object.isFrozen(application)).toBe(false);
    expect(matchDirectProjection(context, root, xml(text), {flatOnly: true})).toMatchObject({kind: 'unsupported'});
  });

  it('refuses element children inside simple content and enforces inherited scalar facets', async () => {
    const {context, root} = await source();
    expect(matchDirectProjection(context, root, xml(text.replace(' AB<![CDATA[12 ]]>', '<t:Inner>AB12</t:Inner>')))).toMatchObject({kind: 'mismatch', rule: 'scalar-child'});
    const match = matchDirectProjection(context, root, xml(text.replace('CD34', 'invalid')));
    if (match.kind !== 'projection-match') throw new Error(match.rule);
    expect(assessProjectionScalars(context, match)).toMatchObject({kind: 'scalar-invalid'});
  });

  it('requires the explicit text member without coercion and counts the simple-content root once', async () => {
    const {context, root} = await source('Number');
    expect(expandProjectionValue(context, root, {})).toMatchObject({kind: 'value-invalid', rule: 'missing-simple-content'});
    expect(expandProjectionValue(context, root, {$value: 12.5})).toMatchObject({kind: 'value-invalid', rule: 'string-required'});
    expect(expandProjectionValue(context, root, {$value: '12.5'}, {maxItems: 0})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, {$value: '12.5'}, {maxItems: 1})).toMatchObject({kind: 'projection-expanded', validated: {value: {Currency: 'USD', $value: '12.5'}}});
    expect(expandProjectionValue(context, root, {$value: '12.5'}, {maxText: 3})).toMatchObject({kind: 'resource-limit'});
    expect(expandProjectionValue(context, root, {$value: '12.5', extra: true})).toMatchObject({kind: 'value-invalid'});
  });

  it('does not invoke application text getters and retains cancellation', async () => {
    const {context, root} = await source('Text');
    let getters = 0;
    const application = Object.defineProperty({}, '$value', {enumerable: true, get() {getters++; return 'AB12';}});
    expect(expandProjectionValue(context, root, application)).toMatchObject({kind: 'value-invalid', rule: 'own-data-property'});
    expect(getters).toBe(0);
    expect(expandProjectionValue(context, root, {$value: 'AB12'}, {signal: AbortSignal.abort()})).toMatchObject({kind: 'cancelled'});
  });
});
