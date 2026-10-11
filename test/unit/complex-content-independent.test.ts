import path from 'node:path';
import {createHash} from 'node:crypto';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {globalId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {assertParticleContentView, deriveActualComplexContent, deriveRawComplexContent, particleContentNode} from '../../src/compiler/complexTypeContent.js';
import type {ContentViewResult, ParticleContentView} from '../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../src/compiler/particleRestriction.js';

// Independent mapping/source contrast, before this test or restriction owner:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6111969140
const fixtures = path.resolve('test/conformance/fixtures');
const named = (local: string) => globalId('type', {namespace: 'urn:recovery:content', local});
async function setup() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/content-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(`Expected structural preparation: ${prepared.kind}`);
  return prepared.request;
}
function type(context: SemanticContext, local: string): ComplexTypeNode {
  const result = context.lookup(named(local));
  if (result.kind !== 'found' || result.node.kind !== 'complexType') throw new Error(`Missing ${local}`);
  return result.node;
}
function view(result: ContentViewResult): ParticleContentView {
  if (result.kind !== 'checked') throw new Error(`Expected local mapping: ${JSON.stringify(result)}`);
  return result.view;
}
function particle(context: SemanticContext, mapped: ParticleContentView, id: string): ParticleNode {
  const result = particleContentNode(context, mapped, id);
  if (result?.kind !== 'particle') throw new Error('Expected mapped particle');
  return result;
}

describe('independent actual effective-content mapping', () => {
  it('prepares unrelated originals once without scanning them for a fixed local normalized query', async () => {
    const origin = 'https://recovery-query.example', uri = `${origin}/schema.xsd`, ns = 'urn:recovery:query';
    // Append unrelated declarations after the identical target subtree so its
    // IDs, local source positions and semantic dependencies do not change.
    const target = '<xs:complexType name="B"><xs:sequence><xs:element name="b" type="xs:string"/></xs:sequence></xs:complexType>'
      + '<xs:complexType name="D"><xs:complexContent><xs:extension base="t:B"><xs:sequence><xs:element name="d" type="xs:string"/></xs:sequence></xs:extension></xs:complexContent></xs:complexType>';
    const rows: {members: number; preparation: number; query: number}[] = [];
    for (const unrelated of [0, 2048]) {
      const extras = Array.from({length: unrelated}, (_, index) => `<xs:simpleType name="Unused${index}"><xs:restriction base="xs:string"/></xs:simpleType>`).join('');
      const bytes = Buffer.from(`<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:t="${ns}" targetNamespace="${ns}">${target}${extras}</xs:schema>`);
      const input = await loadSchemaInput(uri, {policy: {allowedOrigins: [origin]}, offlineResources: new Map([[uri,
        {bytes, digest: createHash('sha256').update(bytes).digest('hex')} ]])});
      const budget = createSemanticBudget({maxWork: 100_000_000});
      const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget});
      if (prepared.kind !== 'prepared') throw new Error('Expected full original preparation');
      const request = prepared.request, preparation = budget.usage().work;
      const mapped = view(deriveActualComplexContent(request.actual, globalId('type', {namespace: ns, local: 'D'})));
      const normalized = prepareSemanticParticleView(request.actual, mapped, 'restriction');
      if (normalized.kind !== 'checked') throw new Error('Expected fixed local normalized content');
      expect(normalized.view.root).toMatchObject({kind: 'sequence', children: [
        {kind: 'element', element: {name: {local: 'b'}}}, {kind: 'element', element: {name: {local: 'd'}}},
      ]});
      expect(checkParticleRestriction(request.actual, normalized.view, normalized.view)).toMatchObject({kind: 'checked', value: true});
      const query = budget.usage().work - preparation;
      const beforeCacheHit = budget.usage().work;
      expect(view(deriveActualComplexContent(request.actual, mapped.type))).toBe(mapped);
      const repeated = prepareSemanticParticleView(request.actual, mapped, 'restriction');
      if (repeated.kind !== 'checked') throw new Error('Expected cached normalized view');
      expect(repeated.view).toBe(normalized.view);
      expect(budget.usage().work - beforeCacheHit).toBeLessThan(query);
      rows.push({members: request.actual.members.length, preparation, query});
    }
    expect(rows[1].preparation).toBeGreaterThan(rows[0].preparation);
    // A charged full-store visit costs at least one work unit per additional
    // original. This structural bound catches a scan without locking exact
    // helper costs or small context-ID-length bookkeeping differences.
    expect(rows[1].query - rows[0].query).toBeLessThan(rows[1].members - rows[0].members);
  });

  it('maps inherited extension in base-first order without replacing source/catalog particles', async () => {
    const request = await setup();
    const b = type(request.actual, 'B'), d = type(request.actual, 'D');
    const before = JSON.stringify(request.graph);
    const mapped = view(deriveActualComplexContent(request.actual, d.id));
    expect(mapped).toMatchObject({scope: 'actual-source-mapping', content: {kind: 'element-only'}});
    if (!('particle' in mapped.content)) throw new Error('Expected effective particle');
    expect(particle(request.actual, mapped, mapped.content.particle)).toMatchObject({occurs: {min: '1', max: '1'},
      term: {kind: 'sequence', children: [b.content, d.content]}});
    expect(mapped.synthetic).toContain(mapped.content.particle);
    expect(request.actual.lookup(mapped.content.particle).kind).toBe('missing');
    expect(type(request.actual, 'D').content).toBe(d.content);
    expect(JSON.stringify(request.graph)).toBe(before);
    expect(view(deriveActualComplexContent(request.actual, d.id))).toBe(mapped);
  });

  it('preserves base content through an empty extension and preserves mixed versus empty versus scalar', async () => {
    const request = await setup();
    const extended = view(deriveActualComplexContent(request.actual, named('EmptyExtension')));
    if (!('particle' in extended.content)) throw new Error('Expected inherited content');
    expect(particle(request.actual, extended, extended.content.particle).term).toMatchObject({kind: 'sequence',
      children: [type(request.actual, 'B').content, type(request.actual, 'D').content]});
    const mixed = view(deriveActualComplexContent(request.actual, named('MixedEmpty')));
    expect(mixed.content.kind).toBe('mixed');
    if (!('particle' in mixed.content)) throw new Error('Expected mixed empty sequence');
    expect(particle(request.actual, mixed, mixed.content.particle)).toMatchObject({term: {kind: 'sequence', children: []}});
    expect(view(deriveActualComplexContent(request.actual, named('Empty'))).content).toEqual({kind: 'empty'});
    const simple = view(deriveActualComplexContent(request.actual, named('Simple'))).content;
    expect(simple).toMatchObject({kind: 'simple', type: {
      kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}}});
    if (simple.kind !== 'simple') throw new Error('Expected scalar content');
    expect(simple.type).toEqual(type(request.actual, 'Simple').derivation?.base);
  });

  it('privately identifies the true ur-type wildcard with its exact range and process mode', async () => {
    const request = await setup();
    const mapped = view(deriveActualComplexContent(request.actual, named('UrExtension')));
    expect(mapped.content.kind).toBe('mixed');
    expect(mapped.urTypeWildcards).toHaveLength(1);
    expect(particle(request.actual, mapped, mapped.urTypeWildcards[0])).toMatchObject({occurs: {min: '0', max: 'unbounded'},
      term: {kind: 'any', wildcard: {namespace: {value: '##any'}, processContents: 'lax'}}});
    assertParticleContentView(request.actual, mapped);
    expect(() => assertParticleContentView(request.actual, {...mapped})).toThrow(/Unauthenticated/);
  });

  it('keeps raw local-only candidate data distinct from complete actual inherited content', async () => {
    const request = await setup();
    const d = type(request.actual, 'D');
    if (!d.content || !d.derivation) throw new Error('Expected original extension source');
    const candidate = request.candidate({key: 'literal-local-only', active: request.actual.members, rawTypes: [{type: d.id,
      derivation: {base: d.derivation.base, method: d.derivation.kind}, abstract: false, final: [], block: [],
      content: {kind: 'element-only', particle: d.content}, attributeUses: [], provenance: {kind: 'actual-mapped', original: d.id}}]});
    if (candidate.kind !== 'prepared') throw new Error('Expected raw candidate data');
    const mapped = view(deriveRawComplexContent(candidate.context, d.id));
    expect(mapped.content).toEqual({kind: 'element-only', particle: d.content});
    expect(mapped.scope).toBe('candidate-raw-properties');
    expect(mapped.synthetic).toEqual([]);
    // The caller's label cannot make local c equal the actual b,c effective model.
    expect(view(deriveActualComplexContent(request.actual, d.id)).content).not.toEqual(mapped.content);
    expect(deriveActualComplexContent(candidate.context, d.id)).toMatchObject({kind: 'unresolved'});
    expect(() => assertParticleContentView(request.actual, mapped)).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(deriveRawComplexContent(candidate.context, d.id)).toBe(request.budget.failure());
    expect(deriveActualComplexContent(request.actual, d.id)).toBe(request.budget.failure());
  });
});
