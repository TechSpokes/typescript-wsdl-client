import {createHash} from 'node:crypto';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {loadSchemaInput, loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {syntaxAttribute} from '../../src/loader/orderedSyntax.js';
import type {LoadingLimits, OfflineSchemaResource} from '../../src/loader/schemaResources.js';
import {prepareSourceSchemaRequest} from '../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';

// Independent oracle and primary-review correction precede these tests:
// #271 comments 6112973761 and 6113003075 (empty import namespace presence).
const origin = 'https://semantic-source.example';
const uri = (file: string) => origin + '/' + file;
const schema = (body = '', namespace?: string) => '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"' +
  (namespace === undefined ? '' : ` targetNamespace="${namespace}"`) + '>' + body + '</xs:schema>';
const pinned = (text: string): OfflineSchemaResource => {
  const bytes = Buffer.from(text);
  return {bytes, digest: createHash('sha256').update(bytes).digest('hex')};
};
const resources = (entries: readonly (readonly [string, string])[]) => new Map(entries.map(([file, xml]) => [uri(file), pinned(xml)]));
const options = (entries: readonly (readonly [string, string])[], limits?: Partial<LoadingLimits>) =>
  ({policy: {allowedOrigins: [origin]}, offlineResources: resources(entries), limits});
afterEach(() => vi.unstubAllGlobals());

describe('independent semantic source namespace and URI values', () => {
  it('uses collapsed targetNamespace while preserving original bytes, syntax, digests and the legacy entry', async () => {
    const xml = schema('<xs:element name="item" type="xs:string"/>', ' &#9;urn:a&#10; ');
    const inputs = options([['root.xsd', xml]]);
    const input = await loadSemanticSchemaInput(uri('root.xsd'), inputs);
    const legacy = await loadSchemaInput(uri('root.xsd'), inputs);
    const raw = ' \turn:a\n ';
    expect(input.schemas[0].targetNamespace).toBe('urn:a');
    expect(syntaxAttribute(input.schemas[0].syntax, 'targetNamespace')).toBe(raw);
    expect(input.root).toEqual(legacy.root);
    expect(legacy.schemas[0].targetNamespace).toBe(raw);
    expect(input.resources).toEqual([{uri: uri('root.xsd'), digest: pinned(xml).digest, byteLength: Buffer.byteLength(xml)}]);
    expect(input.metrics.totalBytes).toBe(Buffer.byteLength(xml));
    expect(input.schemas[0].digest).toBe(pinned(xml).digest);
    expect(Buffer.from(inputs.offlineResources.get(uri('root.xsd'))!.bytes).toString()).toBe(xml);
    const bound = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (bound.kind !== 'prepared') throw new Error('Expected authentic normalized source preparation');
    expect(bound.request.actual.lookup(globalId('element', {namespace: 'urn:a', local: 'item'}))).toMatchObject({kind: 'found'});
  });

  it.each(['include', 'import'] as const)('compares normalized %s namespace values and resolves normalized schemaLocation', async kind => {
    const rootNs = kind === 'include' ? 'urn:a' : 'urn:root';
    const directive = `<xs:${kind}${kind === 'import' ? ' namespace=" &#9;urn:a&#13; "' : ''} schemaLocation=" &#9;child.xsd&#10; "/>`;
    const entries = [['root.xsd', schema(directive, rootNs)], ['child.xsd', schema('', ' &#10;urn:a&#9; ')]] as const;
    const input = await loadSemanticSchemaInput(uri('root.xsd'), options(entries));
    expect(input.schemas[1].targetNamespace).toBe('urn:a');
    expect(input.edges[0]).toMatchObject({kind, referenceUri: uri('child.xsd'), to: input.schemas[1].key});
    expect(syntaxAttribute(input.schemas[1].syntax, 'targetNamespace')).toBe(' \nurn:a\t ');
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([entries[0], ['child.xsd', schema('', 'urn:wrong')]])))
      .rejects.toMatchObject({category: 'invalid-schema'});
  });

  it('adopts the collapsed including namespace only for an absent chameleon targetNamespace', async () => {
    const parent = schema('<xs:include schemaLocation="child.xsd"/>', ' &#9;urn:a ');
    const input = await loadSemanticSchemaInput(uri('root.xsd'), options([['root.xsd', parent], ['child.xsd', schema()]]));
    expect(input.schemas.map(item => item.targetNamespace)).toEqual(['urn:a', 'urn:a']);
    expect(input.schemas[1].context).toEqual({kind: 'include', namespace: 'urn:a'});
    expect(syntaxAttribute(input.schemas[1].syntax, 'targetNamespace')).toBeUndefined();
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([['root.xsd', parent], ['child.xsd', schema('', ' &#9; ')]])))
      .rejects.toMatchObject({category: 'invalid-schema'});
  });

  it('does not strip non-XML Unicode whitespace from namespace identity', async () => {
    const namespace = '\u00a0urn:a\u00a0';
    const input = await loadSemanticSchemaInput(uri('root.xsd'), options([['root.xsd', schema('', namespace)]]));
    expect(input.schemas[0].targetNamespace).toBe(namespace);
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:include schemaLocation="child.xsd"/>', 'urn:a')], ['child.xsd', schema('', namespace)],
    ]))).rejects.toMatchObject({category: 'invalid-schema'});
  });

  it('allows an empty import namespace without a referent while preserving import/target presence when fetched', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const noReferent = await loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:import namespace=" &#9; "/>', 'urn:parent')],
    ]));
    expect(noReferent.resources).toHaveLength(1);
    expect(noReferent.edges[0]).toMatchObject({kind: 'import'});
    expect(noReferent.edges[0].to).toBeUndefined();
    expect(noReferent.edges[0].referenceUri).toBeUndefined();
    const absent = await loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:import schemaLocation="child.xsd"/>', 'urn:parent')], ['child.xsd', schema()],
    ]));
    expect(absent.schemas[1].targetNamespace).toBe('');
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:import namespace="" schemaLocation="child.xsd"/>', 'urn:parent')], ['child.xsd', schema()],
    ]))).rejects.toMatchObject({category: 'invalid-schema'});
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([['root.xsd', schema('', '')]])))
      .rejects.toMatchObject({category: 'invalid-schema'});
    expect(fetch).not.toHaveBeenCalled();
  });

  it('distinguishes absent locations from explicit empty URI references', async () => {
    const absent = await loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:import namespace="urn:other"/>', 'urn:a')],
    ]));
    expect(absent.edges[0].referenceUri).toBeUndefined();
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:import namespace="urn:other" schemaLocation=""/>', 'urn:a')],
    ]))).rejects.toMatchObject({category: 'invalid-schema'});
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options([['root.xsd', schema('<xs:include/>', 'urn:a')]])))
      .rejects.toMatchObject({category: 'invalid-schema'});
    const self = await loadSemanticSchemaInput(uri('root.xsd'), options([
      ['root.xsd', schema('<xs:include schemaLocation=" &#9; "/>', 'urn:a')],
    ]));
    expect(self.resources).toHaveLength(1);
    expect(self.edges.every(edge => edge.referenceUri === uri('root.xsd'))).toBe(true);
    expect(self.edges.some(edge => edge.cycle)).toBe(true);
  });

  it('keeps normalized cycles finite and retains resolution depth and resource byte limits', async () => {
    const entries = [
      ['root.xsd', schema('<xs:include schemaLocation=" child.xsd "/>', 'urn:a')],
      ['child.xsd', schema('<xs:include schemaLocation=" root.xsd "/>', ' &#9;urn:a ')],
    ] as const;
    const cycle = await loadSemanticSchemaInput(uri('root.xsd'), options(entries, {resolutionDepth: 8}));
    expect(cycle.resources).toHaveLength(2);
    expect(cycle.edges.some(edge => edge.cycle)).toBe(true);
    expect(cycle.edges.every(edge => cycle.schemas.some(item => item.key === edge.to))).toBe(true);
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options(entries, {resolutionDepth: 1})))
      .rejects.toMatchObject({category: 'resource-limit'});
    await expect(loadSemanticSchemaInput(uri('root.xsd'), options(entries, {resourceBytes: 20})))
      .rejects.toMatchObject({category: 'resource-limit'});
  });

  it('retains offline digest and origin authorization rather than normalizing arbitrary resource inputs', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const input = options([['root.xsd', schema()]]);
    input.offlineResources.get(uri('root.xsd'))!.bytes[0] = 0;
    await expect(loadSemanticSchemaInput(uri('root.xsd'), input)).rejects.toMatchObject({category: 'invalid-schema'});
    await expect(loadSemanticSchemaInput('https://forbidden.example/root.xsd', options([])))
      .rejects.toMatchObject({category: 'unsupported-capability'});
    expect(fetch).not.toHaveBeenCalled();
  });
});
