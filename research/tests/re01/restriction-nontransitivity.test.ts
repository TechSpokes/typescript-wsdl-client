/** A fully constructed same-context restriction chain is not a transitivity rule. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {expect, it} from 'vitest';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';

// Required CHOICE() maps vacuously to CHOICE(a,b); its formal range 0..0 fails a required ANY 1..1.
// All source roots are fully checked in one context; no SOME impossibility or dated correspondence follows.
const directory = path.resolve('test/conformance/fixtures'), namespace = 'urn:re01:restriction-transitivity';
const typeId = (name: string) => globalId('type', {namespace, local: name});

it('checks all twelve actual roots while adjacent restriction answers are true and the direct answer is false', async () => {
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/restriction-nontransitivity.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const actual = prepared.request.actual;
  expect(checkSchemaDocumentSyntax(actual).kind).toBe('checked');
  const full = verifyFiniteRe01Evidence(actual, typeId('A'), {root: {kind: 'primitive-no-change'}, nodes: []});
  assert.equal(full.kind, 'checked-primitive', JSON.stringify(full));
  expect(actual.members).toHaveLength(12);
  expect(new Set(full.actualComponents.map(row => row.component))).toEqual(new Set(actual.members));
  expect(full.proof).toHaveLength(0); expect(full.actualPrimitiveNoChange).toEqual([typeId('A')]);
  expect(full.actualComponents.filter(row => row.re01 && !row.re01.primitive)).toEqual([]);
  for (const row of full.actualComponents) expect(row.obligations).toEqual([]);
  const view = (name: string) => {
    const content = deriveActualComplexContent(actual, typeId(name)); assert.equal(content.kind, 'checked');
    const result = prepareSemanticParticleView(actual, content.view, 'restriction'); assert.equal(result.kind, 'checked');
    return result.view;
  };
  const d = view('D'), b = view('B'), a = view('A');
  expect(d.root).toMatchObject({kind: 'choice', children: [], occurs: {min: '1', max: '1'},
    summary: {effectiveTotalRange: {min: '0', max: '0'}, schemaEmptiable: true, nullable: false, hasRealization: false}});
  expect(b.root).toMatchObject({kind: 'choice', occurs: {min: '1', max: '1'},
    summary: {effectiveTotalRange: {min: '1', max: '1'}}});
  expect(b.root.children).toHaveLength(2);
  expect(b.root.children.map(child => child.element?.name)).toEqual([{namespace, local: 'a'}, {namespace, local: 'b'}]);
  expect(a.root).toMatchObject({kind: 'any', occurs: {min: '1', max: '1'},
    summary: {effectiveTotalRange: {min: '1', max: '1'}}});
  expect(a.root.urTypeWildcard).toBe(false);
  for (const [derived, base, expected] of [[d, b, true], [b, a, true], [d, a, false]] as const) {
    expect(derived.contextId).toBe(actual.contextId); expect(base.contextId).toBe(actual.contextId);
    expect(checkParticleRestriction(actual, derived, base)).toMatchObject({kind: 'checked', value: expected});
  }
});
