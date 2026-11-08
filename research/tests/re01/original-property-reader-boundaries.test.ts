/** Exact request/context, budget and AU-origin boundaries of the partial reader. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {assessCandidateAttributeUses, readOriginalAttributeProperties} from '../../../src/compiler/schemaAttributeUses.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {resolveSemanticType} from '../../../src/compiler/schemaTypeIdentity.js';
import {checkOriginalGeneratedScalar} from '../../../src/compiler/schemaScalarKernel.js';

const fixtures = path.resolve('test/conformance/fixtures');
const file = (name: string) => path.join(fixtures, 'xsd/recovery', name);
const id = (namespace: string, local: string) => globalId('type', {namespace, local});
const builtin = (local: string) => ({kind: 'builtin' as const, name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});

describe('original property reader qualification boundaries', () => {
  it('keeps intrinsic Γ AU failures in Γ and rechecks good source data against H scalar properties', async () => {
    const input = await loadSchemaInput(file('au-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, actual = request.actual, namespace = 'urn:recovery:attributes';
    const good = request.candidate({key: 'good-properties', active: actual.members}); assert.equal(good.kind, 'prepared');
    expect(readOriginalAttributeProperties(good.context, id(namespace, 'ProhibitedGlobal')))
      .toMatchObject({kind: 'invalid-schema', contextId: actual.contextId});
    const owner = id(namespace, 'QNameAliases'), valid = readOriginalAttributeProperties(good.context, owner); assert.equal(valid.kind, 'checked');
    expect(valid.value.uses.map(use => use.effective?.value.operand.canonical)).toEqual(['["urn:attribute:value","Name"]', '["urn:attribute:value","Name"]']);
    const attributes = [...new Set(valid.value.uses.map(use => use.declaration.id))];
    const bad = request.candidate({key: 'bad-active-attribute-type', active: actual.members,
      rawAttributes: attributes.map(attribute => ({attribute, type: builtin('boolean')}))}); assert.equal(bad.kind, 'prepared');
    expect(readOriginalAttributeProperties(bad.context, owner)).toMatchObject({kind: 'candidate-rejected'});
    expect(assessCandidateAttributeUses(bad.context, owner)).toMatchObject({kind: 'candidate-rejected'});
    expect(assessCandidateAttributeUses(good.context, id(namespace, 'ProhibitedGlobal')))
      .toMatchObject({kind: 'invalid-schema', contextId: actual.contextId});
    expect(readOriginalAttributeProperties(good.context, owner).kind).toBe('checked');
  });

  it('preserves empty and genuine retained simple-content identities without granting full validity', async () => {
    const input = await loadSchemaInput(file('scalar-premise-forwarding-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, candidate = request.candidate({key: 'partial-reader', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(deriveOriginalComplexPropertyContent(candidate.context, id('urn:recovery:scalar-premise-forwarding', 'A')))
      .toMatchObject({kind: 'checked', view: {scope: 'original-property-projection', content: {kind: 'empty'}}});
    const simple = request.graph.nodes.find(node => node.kind === 'complexType' && node.derivation?.contentKind === 'simple'); assert.ok(simple);
    expect(deriveOriginalComplexPropertyContent(candidate.context, simple.id)).toMatchObject({kind: 'checked', view: {
      scope: 'original-property-projection', content: {kind: 'simple', type: builtin('string')},
    }});
  });

  it('preserves named and generated source scalar identities and detects changed hypothetical base content', async () => {
    const input = await loadSchemaInput(file('original-simple-content-properties.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const {request} = prepared, actual = request.actual, ns = 'urn:original-simple-properties';
    const type = (name: string) => id(ns, name);
    const candidate = request.candidate({key: 'original-simple-properties', active: actual.members}); assert.equal(candidate.kind, 'prepared');
    for (const name of ['Text', 'Restricted', 'Extended']) {
      const source = deriveActualComplexContent(actual, type(name)); assert.equal(source.kind, 'checked');
      const original = deriveOriginalComplexPropertyContent(candidate.context, type(name)); assert.equal(original.kind, 'checked');
      expect(original.view.content).toBe(source.view.content);
      assert.equal(original.view.content.kind, 'simple');
      if (name === 'Text') expect(resolveSemanticType(candidate.context, original.view.content.type))
        .toMatchObject({kind: 'component', identity: {kind: 'component', id: type('Named')}});
      else expect(original.view.content.type).toEqual({kind: 'original-generated', owner: type('Restricted')});
    }
    expect(candidate.context.lookupScalarSlot({kind: 'original-generated', owner: type('Text')}).kind).toBe('missing');
    expect(candidate.context.lookupScalarSlot({kind: 'original-generated', owner: type('Extended')}).kind).toBe('missing');
    expect(checkOriginalGeneratedScalar(candidate.context, {kind: 'original-generated', owner: type('Restricted')}).kind).toBe('checked');
    const text = checkComponentConstruction(candidate.context, type('Text')); assert.equal(text.kind, 'checked');
    expect(text.receipts).toContainEqual(expect.objectContaining({authority: 'XSD10-original-complex-simple-input-v1',
      scope: 'guarded-original-simple-input', remaining: ['actual-source-qualification', 'complete-type-validity']}));

    const changed = request.candidate({key: 'changed-base-scalar', active: actual.members, rawTypes: [{
      type: type('Restricted'), targetNamespace: ns, derivation: {method: 'restriction', base: {kind: 'local', target: type('Text')}},
      abstract: false, final: [], block: [], content: {kind: 'simple', type: builtin('boolean')}, attributeUses: [],
      provenance: {kind: 'actual-mapped', original: type('Restricted')},
    }]}); assert.equal(changed.kind, 'prepared');
    expect(deriveOriginalComplexPropertyContent(changed.context, type('Extended'))).toMatchObject({kind: 'checked', view: {
      content: {kind: 'simple', type: {kind: 'original-generated', owner: type('Restricted')}},
    }});
    expect(checkComponentConstruction(changed.context, type('Extended'))).toMatchObject({kind: 'candidate-rejected', rule: 'cos-ct-extends.1.4.1'});
  });

  it('charges cached reads and keeps exact/one-below exhaustion sticky', async () => {
    const input = await loadSchemaInput(file('original-property-projection-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const run = (maxWork?: number) => {
      const budget = createSemanticBudget(maxWork === undefined ? {} : {maxWork});
      const prepared = prepareSourceSchemaRequest(input, {budget}); assert.equal(prepared.kind, 'prepared');
      const actual = prepared.request.actual, element = actual.lookup(globalId('element', {namespace: 'urn:property-only-projection', local: 'Left'}));
      assert.equal(element.kind, 'found'); assert.equal(element.node.kind, 'element'); assert.equal(element.node.type.kind, 'local');
      const owner = element.node.type.target, candidate = prepared.request.candidate({key: 'budget', active: actual.members}); assert.equal(candidate.kind, 'prepared');
      const first = deriveOriginalComplexPropertyContent(candidate.context, owner); assert.equal(first.kind, 'checked');
      const before = budget.usage().work, second = deriveOriginalComplexPropertyContent(candidate.context, owner);
      if (second.kind === 'checked') {expect(second.view).toBe(first.view); expect(budget.usage().work).toBeGreaterThan(before);}
      return {budget, context: candidate.context, owner, second};
    };
    const broad = run(), exact = run(broad.budget.usage().work); expect(exact.second.kind).toBe('checked');
    const below = run(broad.budget.usage().work - 1); expect(below.second.kind).toBe('resource-limit');
    expect(deriveOriginalComplexPropertyContent(below.context, below.owner)).toBe(below.second);
    expect(readOriginalAttributeProperties(below.context, below.owner)).toBe(below.second);
  });
});
