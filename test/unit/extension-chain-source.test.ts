import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import {assertExtensionChainReceipt, verifyDirectActualSchema, verifyExtensionChainActualSchema,
  verifySimpleExtensionConstruction, assertSimpleExtensionConstruction} from '../../src/compiler/finiteRe01Verification.js';

const directory = path.resolve('test/conformance/fixtures/xsd');
async function prepare(file: string, limited = false) {
  const input = await loadSemanticSchemaInput(path.join(directory, file), {policy: {fileRoots: [directory]}});
  const result = prepareSourceSchemaRequest(input, limited ? {budget: createSemanticBudget({maxWork: 100_000, maxNodes: 100_000})} : undefined);
  if (result.kind !== 'prepared') throw new Error(result.kind);
  return result.request.actual;
}

describe('actual-only extension-chain closure', () => {
  it.each(['empty', 'particle'])('closes %s extension ancestry without changing the primitive preview', async variant => {
    const actual = await prepare(`recovery/fresh-source-middle-${variant}.xsd`);
    const old = verifyDirectActualSchema(actual);
    expect(old).toMatchObject({kind: 'inconclusive-direct'});
    const result = verifyExtensionChainActualSchema(actual);
    expect(result).toMatchObject({kind: 'checked-extension-chain', basis: 'XSD-2004-extension-only-ancestry', unresolved: []});
    if (result.kind !== 'checked-extension-chain') throw new Error(result.kind);
    expect(result.extensionOnly.length).toBeGreaterThan(0);
    expect(result.frontier.requirements.some(item => !item.primitive)).toBe(true);
    assertExtensionChainReceipt(actual, result);
    expect(() => assertExtensionChainReceipt(actual, {...result})).toThrow(TypeError);
    const other = await prepare(`recovery/fresh-source-middle-${variant}.xsd`);
    expect(() => assertExtensionChainReceipt(other, result)).toThrow(TypeError);
  });

  it('retains an intervening restriction as unresolved rather than declaring it invalid', async () => {
    const actual = await prepare('re01/consumer-five-prefix.xsd');
    const result = verifyExtensionChainActualSchema(actual);
    expect(result).toMatchObject({kind: 'inconclusive-extension-chain'});
    if (result.kind !== 'inconclusive-extension-chain') throw new Error(result.kind);
    expect(result.unresolved).toContain(globalId('type', {namespace: 'urn:review', local: 'D'}));
  });

  it('leaves simple-base ancestry outside this complex-only sufficient rule', async () => {
    expect(verifyExtensionChainActualSchema(await prepare('recovery/fresh-source-middle-simple.xsd')))
      .toMatchObject({kind: 'inconclusive-extension-chain'});
  });

  it('checks the simple extension spine and owned middle while preserving original identities and the preview', async () => {
    const actual = await prepare('recovery/fresh-source-middle-simple.xsd');
    const before = new Map(actual.members.map(member => [member, actual.lookup(member)]));
    const result = verifySimpleExtensionConstruction(actual);
    expect(result).toMatchObject({kind: 'checked-simple-extension-construction', unresolved: [],
      datedInterpretation: 'unassessed', admitted: false});
    if (!('simple' in result)) throw new Error(result.kind);
    expect(result.simple).toHaveLength(1);
    assertSimpleExtensionConstruction(actual, result);
    expect(() => assertSimpleExtensionConstruction(actual, {...result})).toThrow(TypeError);
    const other = await prepare('recovery/fresh-source-middle-simple.xsd');
    expect(() => assertSimpleExtensionConstruction(other, result)).toThrow(TypeError);
    for (const member of actual.members) {
      const prior = before.get(member), after = result.simple[0]!.frontier.context.lookup(member);
      if (prior?.kind !== 'found' || after.kind !== 'found') throw new Error('Missing unchanged source');
      expect(after.node).toBe(prior.node);
    }
    expect(verifyDirectActualSchema(actual)).toMatchObject({kind: 'inconclusive-direct'});
  });

  it.each(['empty', 'particle'])('retains existing %s complex extension closure', async variant => {
    expect(verifySimpleExtensionConstruction(await prepare(`recovery/fresh-source-middle-${variant}.xsd`)))
      .toMatchObject({kind: 'checked-simple-extension-construction', simple: [], unresolved: []});
  });

  it('refuses an intervening complex restriction and unrelated invalid declarations', async () => {
    expect(verifySimpleExtensionConstruction(await prepare('re01/consumer-five-prefix.xsd')))
      .toMatchObject({kind: 'inconclusive-simple-extension-construction'});
    expect(verifySimpleExtensionConstruction(await prepare('recovery/finite-proof-invalid-original.xsd')))
      .toMatchObject({kind: 'invalid-schema'});
    const limited = await prepare('recovery/fresh-source-middle-simple.xsd', true);
    expect(verifySimpleExtensionConstruction(limited)).toMatchObject({kind: 'resource-limit'});
    expect(verifySimpleExtensionConstruction(limited)).toMatchObject({kind: 'resource-limit'});
  });

  it('retains unrelated invalid actual components', async () => {
    const actual = await prepare('recovery/finite-proof-invalid-original.xsd');
    expect(verifyExtensionChainActualSchema(actual)).toMatchObject({kind: 'invalid-schema'});
  });

  it('retains sticky explicit request exhaustion', async () => {
    const limited = await prepare('recovery/fresh-source-middle-particle.xsd', true);
    expect(verifyExtensionChainActualSchema(limited)).toMatchObject({kind: 'resource-limit'});
    expect(verifyExtensionChainActualSchema(limited)).toMatchObject({kind: 'resource-limit'});
  });
});
