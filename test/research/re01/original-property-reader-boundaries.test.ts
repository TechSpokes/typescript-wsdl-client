/** Exact request/context, budget and AU-origin boundaries of the partial reader. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {deriveOriginalComplexPropertyContent} from '../../../src/compiler/complexTypeContent.js';
import {readOriginalAttributeProperties} from '../../../src/compiler/schemaAttributeUses.js';

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
    expect(readOriginalAttributeProperties(good.context, owner).kind).toBe('checked');
  });

  it('supports empty retained content but leaves source simple content unresolved', async () => {
    const input = await loadSchemaInput(file('scalar-premise-forwarding-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
    const request = prepared.request, candidate = request.candidate({key: 'partial-reader', active: request.actual.members}); assert.equal(candidate.kind, 'prepared');
    expect(deriveOriginalComplexPropertyContent(candidate.context, id('urn:recovery:scalar-premise-forwarding', 'A')))
      .toMatchObject({kind: 'checked', view: {scope: 'original-property-projection', content: {kind: 'empty'}}});
    const simple = request.graph.nodes.find(node => node.kind === 'complexType' && node.derivation?.contentKind === 'simple'); assert.ok(simple);
    expect(deriveOriginalComplexPropertyContent(candidate.context, simple.id)).toMatchObject({kind: 'unresolved', rule: 'component-content-properties'});
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
