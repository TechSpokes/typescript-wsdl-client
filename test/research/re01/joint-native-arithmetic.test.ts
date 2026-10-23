/** Native arithmetic controls; mandatory template synthesis is distinct from RE01 coverage. */
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {afterAll, describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkDeclaredParticleLegality} from '../../../src/compiler/particleLocalAssessment.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';

const namespace = 'urn:research:joint-native-arithmetic';
const generated: string[] = [];
type Maximum = number | 'unbounded';
const inner = (a: string, b: string) => `<xs:choice minOccurs="2" maxOccurs="2"><xs:element name="${a}" type="xs:string"/><xs:element name="${b}" type="xs:string"/></xs:choice>`;
const numeral = (value: number, prefix = '') => `<xs:choice minOccurs="${value}" maxOccurs="${value}">${inner(prefix + 'a', prefix + 'b')}${inner(prefix + 'c', prefix + 'd')}</xs:choice>`;
const any = (min: number, max: Maximum = min) => `<xs:any minOccurs="${min}" maxOccurs="${max}" processContents="skip"/>`;
const use = (group: string, min = 1, max: Maximum = min) => `<xs:group ref="t:${group}" minOccurs="${min}" maxOccurs="${max}"/>`;
const complex = (name: string, body: string) => `<xs:complexType name="${name}"><xs:complexContent><xs:restriction base="xs:anyType">${body}</xs:restriction></xs:complexContent></xs:complexType>`;

async function subject(body: string): Promise<SemanticContext> {
  const root = path.resolve('tmp/research/re01/joint-native-arithmetic');
  await mkdir(root, {recursive: true});
  const directory = await mkdtemp(path.join(root, 'case-')); generated.push(directory);
  const filename = path.join(directory, 'schema.xsd');
  await writeFile(filename, `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${namespace}" targetNamespace="${namespace}" elementFormDefault="qualified">${body}</xs:schema>`);
  const input = await loadSchemaInput(filename, {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  assert.equal(prepared.kind, 'prepared', JSON.stringify(prepared));
  const context = prepared.request.actual;
  assert.equal(checkSchemaDocumentSyntax(context).kind, 'checked');
  return context;
}

function view(context: SemanticContext, name: string, purpose: 'declared' | 'restriction' = 'restriction') {
  const content = deriveActualComplexContent(context, globalId('type', {namespace, local: name}));
  assert.equal(content.kind, 'checked', JSON.stringify(content));
  const prepared = prepareSemanticParticleView(context, content.view, purpose);
  assert.equal(prepared.kind, 'checked', JSON.stringify(prepared));
  return prepared.view;
}

function locallyComplete(context: SemanticContext): void {
  for (const id of context.members) {
    const checked = checkComponentConstruction(context, id);
    assert.equal(checked.kind, 'checked', JSON.stringify(checked));
    expect(checked.obligations).toEqual([]);
    expect(checked.re01).toBeUndefined();
  }
}

function restriction(context: SemanticContext, source: string, target: string): boolean {
  const result = checkParticleRestriction(context, view(context, source), view(context, target));
  assert.equal(result.kind, 'checked', JSON.stringify(result));
  return result.value;
}

afterAll(async () => {await Promise.all(generated.map(directory => rm(directory, {recursive: true, force: true})));});

describe('native arithmetic with explicit shared constructor templates', () => {
  it.each([
    {n: 2, m: 3, k: 6, product: true}, {n: 3, m: 2, k: 6, product: true},
    {n: 3, m: 3, k: 9, product: true}, {n: 2, m: 3, k: 5, product: false},
    {n: 2, m: 3, k: 7, product: false},
  ])('separates width $n times occurrence $m from effective range, against $k', async ({n, m, k, product}) => {
    const width = `<xs:group name="Width"><xs:sequence>${'<xs:choice minOccurs="2" maxOccurs="2"/>'.repeat(n - 1)}${inner('a', 'b')}</xs:sequence></xs:group>`;
    const context = await subject([
      width, complex('Unit', use('Width')), complex('Scaled', use('Width', m)),
      complex('WidthTarget', numeral(n)), complex('Product', numeral(k)),
      complex('MCarrier', `<xs:sequence>${any(2 * m)}</xs:sequence>`),
      complex('WrongMCarrier', `<xs:sequence>${any(2 * m + 1)}</xs:sequence>`),
      complex('KCarrier', `<xs:sequence>${any(2 * k)}</xs:sequence>`),
      complex('Sum', `<xs:sequence>${numeral(m, 'left')}${numeral(k, 'right')}</xs:sequence>`),
      complex('SumCarrier', `<xs:sequence>${any(2 * (m + k))}</xs:sequence>`),
      complex('WrongSumCarrier', `<xs:sequence>${any(2 * (m + k) + 1)}</xs:sequence>`),
    ].join('\n'));
    locallyComplete(context);
    const scaled = view(context, 'Scaled'), target = view(context, 'Product');
    expect(scaled.root.kind).toBe('sequence'); expect(scaled.root.children).toHaveLength(n);
    expect(scaled.root.summary.effectiveTotalRange).toEqual({min: String(2 * m), max: String(2 * m)});
    expect(target.root.kind).toBe('choice'); expect(target.root.children).toHaveLength(2);
    expect(restriction(context, 'Scaled', 'Product')).toBe(product);
    expect(restriction(context, 'Unit', 'WidthTarget')).toBe(true);
    expect(restriction(context, 'Scaled', 'MCarrier')).toBe(true);
    expect(restriction(context, 'Scaled', 'WrongMCarrier')).toBe(false);
    expect(restriction(context, 'Product', 'KCarrier')).toBe(true);
    expect(restriction(context, 'Sum', 'SumCarrier')).toBe(true);
    expect(restriction(context, 'Sum', 'WrongSumCarrier')).toBe(false);
  });

  it.each([
    {min: 0, max: 0, legal: true, floor: false}, {min: 1, max: 1, legal: true, floor: false},
    {min: 2, max: 2, legal: true, floor: false}, {min: 4, max: 4, legal: true, floor: true},
    {min: 2, max: 3, legal: false, floor: false}, {min: 2, max: 'unbounded', legal: false, floor: false},
    {min: 0, max: 1, legal: false, floor: false}, {min: 4, max: 5, legal: false, floor: true},
  ] satisfies readonly {min: number; max: Maximum; legal: boolean; floor: boolean}[])(
    'checks the shared carrier [$min,$max] guard and independent positive floor', async ({min, max, legal, floor}) => {
      const context = await subject([
        `<xs:group name="Carrier"><xs:sequence>${any(min, max)}</xs:sequence></xs:group>`,
        complex('Carrier', use('Carrier')),
        complex('Guard', `<xs:sequence>${use('Carrier')}${any(1)}</xs:sequence>`),
        complex('Floor', `<xs:sequence>${any(4, 'unbounded')}</xs:sequence>`),
      ].join('\n'));
      const checked = checkDeclaredParticleLegality(context, view(context, 'Guard', 'declared'));
      assert.equal(checked.kind, 'checked', JSON.stringify(checked));
      expect(checked.value).toBe(legal);
      if (!legal) expect(checked.failedRule).toBe('cos-nonambig');
      const full = checkComponentConstruction(context, globalId('type', {namespace, local: 'Guard'}));
      expect(full.kind).toBe(legal ? 'checked' : 'invalid-schema');
      expect(restriction(context, 'Carrier', 'Floor')).toBe(floor);
    });

  it.each([
    {min: 2, max: 2, carrier: 4, expected: true}, {min: 2, max: 3, carrier: 4, expected: false},
    {min: 2, max: 3, carrier: 5, expected: false}, {min: 2, max: 3, carrier: 6, expected: false},
  ])('propagates the exact live carrier $carrier into source [$min,$max]', async ({min, max, carrier, expected}) => {
    const context = await subject([
      `<xs:group name="Width"><xs:sequence><xs:choice minOccurs="2" maxOccurs="2"/>${inner('a', 'b')}</xs:sequence></xs:group>`,
      `<xs:group name="Carrier"><xs:sequence>${any(carrier)}</xs:sequence></xs:group>`,
      complex('Source', use('Width', min, max)), complex('Carrier', use('Carrier')),
      complex('Guard', `<xs:sequence>${use('Carrier')}${any(1)}</xs:sequence>`),
    ].join('\n'));
    locallyComplete(context);
    expect(view(context, 'Source').root.summary.hasRealization).toBe(false);
    expect(restriction(context, 'Source', 'Carrier')).toBe(expected);
  });
});
