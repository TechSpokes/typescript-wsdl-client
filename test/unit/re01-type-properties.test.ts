/** Boundary controls specified independently in #266 issuecomment-6111931452. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {validateRawComplexTypeProperties} from '../../src/compiler/re01TypePropertyValidation.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';

const xml = readFileSync('test/conformance/fixtures/xsd/syntax/actual-source-controls.xsd', 'utf8')
  .replace('<xs:attribute name="local" type="xs:string"/>', '<xs:attribute ref="t:globalDefault"/>');
async function graph() {
  const uri = 'https://raw.test/actual.xsd', bytes = Buffer.from(xml);
  return resolveCanonicalGraph(buildCanonicalGraph(await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://raw.test']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])})));
}
function type(r: SemanticRequest, local: string): ComplexTypeNode {
  const n = r.graph.nodes.find(node => node.identity.kind === 'global' && node.identity.name.local === local);
  if (n?.kind !== 'complexType') throw new Error('Expected complex type');
  return n;
}
function raw(r: SemanticRequest): RawComplexTypeProperties {
  const d = type(r, 'Derived'), base = type(r, 'Base');
  return {type: d.id, derivation: {base: d.derivation!.base, method: 'extension'}, abstract: false,
    final: [], block: [], content: {kind: 'element-only', particle: base.content!},
    attributeUses: [...base.attributes, ...d.attributes], provenance: {kind: 'hypothetical-abstract', originals: [d.id]}};
}
function prepare(g: Awaited<ReturnType<typeof graph>>, maxWork = 1_000_000) {
  const result = prepareSemanticRequest(g, {budget: createSemanticBudget({maxWork})});
  if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
  return result.request;
}
function candidate(r: SemanticRequest, p = raw(r)) {
  const c = r.candidate({key: 'raw', active: r.actual.members, rawTypes: [p]});
  if (c.kind !== 'prepared') throw new Error(JSON.stringify(c));
  return c.context;
}

describe('raw complex type property structural boundary', () => {
  it('preserves inherited raw content and distinct same-QName AU identities without claiming effective mapping', async () => {
    const r = prepare(await graph()), p = raw(r), c = candidate(r, p);
    expect(type(r, 'Derived').content).toBeUndefined();
    expect(p.attributeUses).toHaveLength(2);
    expect(new Set(p.attributeUses).size).toBe(2);
    expect(validateRawComplexTypeProperties(c, p.type)).toMatchObject({kind: 'checked-structure', mappingAuthority: 'none',
      properties: {content: p.content, attributeUses: p.attributeUses},
      remaining: ['effective-property-mapping', 'complete-type-validity', 'endpoint-correspondence', 'all-original-property-correspondence']});
    expect(validateRawComplexTypeProperties(r.actual, p.type)).toMatchObject({kind: 'unresolved', rule: 'missing-raw-complex-type-properties'});
  });
  it('rejects incoherent derivation, reference roles and repeated AU IDs', async () => {
    const r = prepare(await graph()), p = raw(r);
    const cases: readonly [RawComplexTypeProperties, string][] = [
      [{...p, derivation: {...p.derivation, method: 'restriction'}}, 'raw-type-derivation'],
      [{...p, attributeUses: [p.attributeUses[0], p.attributeUses[0]]}, 'raw-type-attribute-uses'],
      [{...p, abstract: true}, 'raw-type-owner-properties'],
      [{...p, targetNamespace: 'urn:wrong'}, 'raw-type-target-namespace'],
    ];
    for (const [properties, rule] of cases) expect(validateRawComplexTypeProperties(candidate(r, properties), p.type))
      .toMatchObject({kind: 'invalid-input', rule});
    expect(r.candidate({key: 'wrong-particle-role', active: r.actual.members,
      rawTypes: [{...p, content: {kind: 'element-only', particle: p.type}}]}))
      .toMatchObject({kind: 'candidate-rejected', code: 'reference'});
  });
  it('keeps omitted effective properties and claimed actual mapping outside semantic authority', async () => {
    const r = prepare(await graph()), p = raw(r);
    const omitted = candidate(r, {...p, attributeUses: [], content: {kind: 'empty'}});
    expect(validateRawComplexTypeProperties(omitted, p.type)).toMatchObject({kind: 'checked-structure', mappingAuthority: 'none',
      remaining: expect.arrayContaining(['effective-property-mapping', 'endpoint-correspondence'])});
    const spoof = candidate(r, {...p, provenance: {kind: 'actual-mapped', original: p.type}});
    expect(validateRawComplexTypeProperties(spoof, p.type)).toMatchObject({kind: 'unresolved', rule: 'unauthenticated-actual-type-mapping'});
  });
  it('requires an explicit namespace property for fresh anonymous complex helpers', async () => {
    const r = prepare(await graph()), base = type(r, 'Base'), original = type(r, 'Derived'), path = '/fresh-anonymous';
    const id = scopedId(base.id, path, 'complexType');
    const helper: ComplexTypeNode = {...original, id, identity: {kind: 'scoped', owner: base.id, path, role: 'complexType'}};
    const properties = {...raw(r), type: id};
    for (const targetNamespace of [undefined, '']) {
      const result = r.candidate({key: targetNamespace === undefined ? 'missing-namespace' : 'absent-namespace',
        active: [...r.actual.members, id], additions: [helper], rawTypes: [{...properties, targetNamespace}]});
      if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
      expect(validateRawComplexTypeProperties(result.context, id)).toMatchObject(targetNamespace === undefined
        ? {kind: 'unresolved', rule: 'missing-raw-type-target-namespace'} : {kind: 'checked-structure'});
    }
  });
  it('rejects malformed raw data before consumers, without invoking caller accessors', async () => {
    const r = prepare(await graph()), p = raw(r);
    for (const properties of [{...p, final: 'restriction'}, {...p, derivation: {...p.derivation, method: 'other'}},
      {...p, content: {kind: 'simple', particle: p.type}}, {...p, attributeUses: [null]}])
      expect(r.candidate({key: 'malformed', active: r.actual.members, rawTypes: [properties as RawComplexTypeProperties]}))
        .toMatchObject({kind: 'candidate-rejected', code: 'representation'});
    let read = false;
    const accessor = {...p, get content() {read = true; return p.content;}};
    expect(r.candidate({key: 'accessor', active: r.actual.members, rawTypes: [accessor]})).toMatchObject({kind: 'candidate-rejected'});
    expect(read).toBe(false);
  });
  it('snapshots properties and rejects copied context handles', async () => {
    const r = prepare(await graph()), p = structuredClone(raw(r)), c = candidate(r, p);
    (p.attributeUses as string[]).length = 0;
    expect(c.rawTypeProperties(p.type)?.attributeUses).toHaveLength(2);
    expect(Object.isFrozen(c.rawTypeProperties(p.type)?.content)).toBe(true);
    expect(() => validateRawComplexTypeProperties({...c}, p.type)).toThrow('Unauthenticated semantic context');
  });
  it('checks cumulative inclusive limits with no result after sticky exhaustion', async () => {
    const g = await graph();
    const run = (maxWork = 1_000_000) => {
      const r = prepare(g, maxWork), p = raw(r), c = candidate(r, p);
      return {result: validateRawComplexTypeProperties(c, p.type), r, c, id: p.type};
    };
    const first = run(), work = first.r.budget.usage().work;
    expect(first.result.kind).toBe('checked-structure');
    expect(run(work).result.kind).toBe('checked-structure');
    const exhausted = run(work - 1);
    expect(exhausted.result.kind).toBe('resource-limit');
    expect(validateRawComplexTypeProperties(exhausted.c, exhausted.id).kind).toBe('resource-limit');
  });
});
