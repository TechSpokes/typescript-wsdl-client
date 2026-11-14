/** #477: empty extension inherits the builtin particle; qualification remains separate. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {describe, expect, it} from 'vitest';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {constructNativeSource} from '../../src/compiler/checkedSourcePreparation.js';
import {qualifyComponentSource} from '../../src/compiler/checkedComponentSource.js';
import {assessSchemaSource, assessmentExitCode} from '../../src/compiler/checkedAssessment.js';
import {deriveActualComplexContent, deriveBuiltinAnyTypeContent, assertParticleContentView} from '../../src/compiler/complexTypeContent.js';
import {checkRawParticleExtension} from '../../src/compiler/particleExtension.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';

const uri = 'https://anytype-extension.test/source.xsd';
const type = globalId('type', {namespace: 'urn:review', local: 'D'});
const forms = ['vacuous', 'empty-sequence'] as const;
async function source(form: typeof forms[number], transform = (text: string) => text) {
  const text = await readFile(new URL(`../conformance/fixtures/xsd/s06-regressions/anytype-extension-${form}.xsd`, import.meta.url), 'utf8');
  const bytes = Buffer.from(transform(text));
  const loading = {policy: {allowedOrigins: ['https://anytype-extension.test']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])};
  return {input: await loadSemanticSchemaInput(uri, loading), loading};
}
const options = () => ({budget: createSemanticBudget({maxWork: 125_000_000, maxNodes: 100_000}), maxNodes: 100_000});

describe('empty anyType extension mapping', () => {
  it.each(forms)('inherits authentic builtin identity for %s without changing source', async form => {
    const {input} = await source(form), {budget} = options();
    const prepared = prepareSourceSchemaRequest(input, {budget, accountPreparation: true});
    if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
    const {request} = prepared, before = JSON.stringify(request.graph);
    const own = deriveActualComplexContent(request.actual, type), base = deriveBuiltinAnyTypeContent(request.actual, type);
    if (own.kind !== 'checked' || base.kind !== 'checked') throw new Error('Expected concrete content');
    expect(own.view.content).toEqual(base.view.content);
    expect(own.view.content.kind).toBe('mixed');
    expect(checkRawParticleExtension(request.actual, own.view, base.view)).toMatchObject({kind: 'checked', value: true});
    expect(JSON.stringify(request.graph)).toBe(before);
    expect(deriveActualComplexContent(request.actual, type)).toEqual(own);
    const foreign = prepareSourceSchemaRequest(input, {budget: options().budget, accountPreparation: true});
    if (foreign.kind !== 'prepared') throw new Error(foreign.kind);
    expect(() => assertParticleContentView(foreign.request.actual, own.view)).toThrow(TypeError);
    expect(() => assertParticleContentView(request.actual, {...own.view})).toThrow(TypeError);
  });

  it.each(forms)('establishes %s native assessment while retaining generation refusal', async form => {
    const {input, loading} = await source(form);
    expect(constructNativeSource(input, options())).toMatchObject({kind: 'constructed-source',
      nativeEstablished: true, localDisproved: false, closure: {kind: 'checked-direct'}, eligible: false});
    expect(qualifyComponentSource(input, options())).toMatchObject({kind: 'component-source', schemaEligible: false,
      admitted: false, construction: {nativeEstablished: true},
      correspondence: {kind: 'inconclusive-correspondence', rule: 'scalar-correspondence-scope'}});
    const report = await assessSchemaSource(uri, {loading});
    expect(report).toMatchObject({schema: 'established', execution: 'completed', correspondence: 'inconclusive',
      schemaEligible: false, admitted: false});
    expect(assessmentExitCode(report)).toBe(2);
  });

  it.each(forms)('retains the explicit mixed-content %s control', async form => {
    const {input} = await source(form, text => text.replace('<xs:complexContent>', '<xs:complexContent mixed="true">'));
    expect(constructNativeSource(input, options())).toMatchObject({kind: 'constructed-source', nativeEstablished: true,
      localDisproved: false, closure: {kind: 'checked-direct'}});
  });

  it.each([false, true])('still rejects an overlapping local element (mixed=%s)', async mixed => {
    const {input, loading} = await source('vacuous', text => text
      .replace('<xs:complexContent>', `<xs:complexContent mixed="${mixed}">`)
      .replace('<xs:extension base="xs:anyType"/>', '<xs:extension base="xs:anyType"><xs:sequence><xs:element name="a" type="xs:string"/></xs:sequence></xs:extension>'));
    expect(constructNativeSource(input, options())).toMatchObject({kind: 'constructed-source', nativeEstablished: false,
      localDisproved: true, closure: {kind: 'invalid-schema', rule: 'cos-nonambig'}});
    expect(await assessSchemaSource(uri, {loading})).toMatchObject({schema: 'disproved', schemaEligible: false, admitted: false});
  });

  it('keeps exhaustion inside builtin mapping sticky without publishing partial content', async () => {
    const {input} = await source('vacuous'), {budget} = options();
    const prepared = prepareSourceSchemaRequest(input, {budget, accountPreparation: true});
    if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
    budget.reserveNodes(100_000 - budget.usage().nodes - 1);
    const failure = deriveActualComplexContent(prepared.request.actual, type);
    expect(failure).toMatchObject({kind: 'resource-limit', limit: 'nodes'});
    const usage = {...budget.usage()};
    expect(deriveBuiltinAnyTypeContent(prepared.request.actual, type)).toBe(failure);
    expect(deriveActualComplexContent(prepared.request.actual, type)).toBe(failure);
    expect(budget.usage()).toEqual(usage);
  });
});
