/** #272 controls: baseline artifact compatibility and independently specified context-sensitive transformations. */
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {parseOrderedSyntax, XSD_NAMESPACE} from '../../../src/loader/orderedSyntax.js';
import type {SyntaxAttribute, SyntaxElement} from '../../../src/loader/orderedSyntax.js';
import {buildCanonicalGraph} from '../../../src/compiler/buildCanonicalGraph.js';
import {artifactGraph} from '../../../src/compiler/catalogProvenance.js';
import {canonicalJson} from '../../../src/compiler/catalogErrors.js';
import {createSemanticCatalog, readCatalog} from '../../../src/compiler/semanticCatalog.js';
import {COMMITTED_PREPARATION_CORPUS, digest, materializeSynthetic, verifyCorpus} from './preparation-corpus.js';
import {dataCensus} from './preparation-probe.js';

const root = path.resolve('.');
const graph = async (source: string) => buildCanonicalGraph(await loadSchemaInput(path.resolve(root, source), {policy: {fileRoots: [root]}}));
// Captured from unmodified main 7d652fea, before the provenance optimization.
const baseline = {
  weather: ['db5b50d13bbe8552bee834f55cdb38104b2de19f7efb5b935e44b213df0caa12', '978862c256123dbf7db8e9734e8159d9000ad406b7650d8b3d1d0a5dad2e53b7'],
  import: ['09d842f75954e1b5ce1699917307fae46a205e420b89e9a6acec60774c414727', '25873f7d362f3a2fcd58a83fa5f51119b03b82ad30875af2a7b66d5d612f3595'],
  chameleon: ['6e28858f77932eb5086002fb1cc39197218814ad512124941567196888b6eadc', '903af2b622b84de9dda681bed20c29bf8b26cc3c4a7c3bc515340e932efcc3a2'],
  'shared-recursive': ['c05b40d680a11887eba69336c0b81362247dcc2b0950571e6d3a2a41bf2ba548', 'be9f68e91a8d0ce2ad2cb7b134a8a97d1738c46331108faf4b52d2e19fa1d06f'],
} as const;

describe('preparation provenance compatibility and retained sharing', () => {
  for (const corpus of COMMITTED_PREPARATION_CORPUS) it(`preserves complete ${corpus.id} source, portable catalog bytes and fingerprints`, async () => {
    await verifyCorpus(corpus, root);
    const raw = await graph(corpus.source), portable = artifactGraph(raw), catalog = createSemanticCatalog(raw);
    const [artifactDigest, fingerprint] = baseline[corpus.id as keyof typeof baseline];
    expect(digest(canonicalJson(catalog))).toBe(artifactDigest);
    expect(catalog.semanticFingerprint).toBe(fingerprint);
    expect(readCatalog(canonicalJson(catalog), {mode: 'faithful'})).toMatchObject({kind: 'semantic', catalog});
    // The known baseline recursively duplicated shared records. A generous identity
    // bound protects against reintroducing that allocation while preserving all fields.
    expect(dataCensus(portable).uniqueObjects).toBeLessThanOrEqual(dataCensus(raw).uniqueObjects * 1.25);
    expect(dataCensus(portable).distinctSourceRecords).toBe(dataCensus(raw).distinctSourceRecords);
    expect(dataCensus(portable).distinctContextRecords).toBe(dataCensus(raw).distinctContextRecords);
    expect(canonicalJson(portable)).not.toContain('file://');
  });

  it('keeps chameleon namespaces and rebound QName/base interpretation distinct', async () => {
    const adopted = artifactGraph(await graph(COMMITTED_PREPARATION_CORPUS[2].source));
    const types = adopted.nodes.filter(node => node.kind === 'complexType');
    expect(new Set(types.map(node => node.context.effectiveNamespace))).toEqual(new Set(['urn:graph:a', 'urn:graph:b']));
    expect(new Set(types.map(node => node.context.source.digest)).size).toBe(1);
    const recursive = artifactGraph(await graph(COMMITTED_PREPARATION_CORPUS[3].source));
    const names = recursive.nodes.find(node => node.kind === 'simpleType' && node.identity.kind === 'global' && node.identity.name.local === 'Names');
    if (names?.kind !== 'simpleType' || names.variety.kind !== 'restriction') throw new Error('Names control missing');
    expect(names.variety.facets[0].lexical.context.namespaces.q).toBe('urn:rebound');
    expect(new Set(recursive.nodes.map(node => node.context.baseUri)).size).toBeGreaterThan(1);
  });

  // Independent expectations: issue #272 comment 6111724180. Parent namespace
  // and local name affect attribute rewriting and credential rejection.
  for (const reverse of [false, true]) it(`checks shared attributes in each parent context (reverse=${reverse})`, async () => {
    const raw = await graph(COMMITTED_PREPARATION_CORPUS[2].source);
    const syntax = parseOrderedSyntax(Buffer.from('<root/>'), 'file:///control.xsd').root;
    const element = (namespace: string, local: string, attribute: SyntaxAttribute): SyntaxElement => ({...syntax, name: {namespace, local}, attributes: [attribute]});
    const location: SyntaxAttribute = {name: {namespace: '', local: 'location'}, lexicalName: 'location', value: 'https://example.test/service?token=private'};
    const addresses = [element('urn:foreign', 'address', location), element('http://schemas.xmlsoap.org/wsdl/soap/', 'address', location)];
    if (reverse) addresses.reverse();
    expect(() => artifactGraph({...raw, schemaAnnotations: addresses})).toThrowError(expect.objectContaining({category: 'incompatible-artifact'}));
    const include: SyntaxAttribute = {...location, name: {namespace: '', local: 'schemaLocation'}, lexicalName: 'schemaLocation', value: 'common.xsd'};
    const includes = [element('urn:foreign', 'include', include), element(XSD_NAMESPACE, 'include', include)];
    if (reverse) includes.reverse();
    const output = artifactGraph({...raw, schemaAnnotations: includes});
    expect(output.schemaAnnotations.find(node => node.name.namespace === 'urn:foreign')?.attributes[0].value).toBe('common.xsd');
    expect(output.schemaAnnotations.find(node => node.name.namespace === XSD_NAMESPACE)?.attributes[0].value).toMatch(/^urn:base:sha256:/);
  });

  it('grows by unique declarations while preserving shared groups and legal element recursion', async () => {
    const sizes = [];
    for (const count of [4, 16, 64]) {
      const corpus = await materializeSynthetic(root, count), raw = await graph(corpus.source);
      expect(raw.nodes).toHaveLength(5 * count + 7);
      const portable = artifactGraph(raw);
      expect(portable.nodes.filter(node => node.kind === 'group')).toHaveLength(1);
      expect(portable.nodes.filter(node => node.kind === 'particle' && node.term.kind === 'group')).toHaveLength(count);
      sizes.push(dataCensus(portable).uniqueObjects);
    }
    expect(sizes[1]).toBeLessThan(sizes[0] * 5);
    expect(sizes[2]).toBeLessThan(sizes[1] * 5);
  });
});
