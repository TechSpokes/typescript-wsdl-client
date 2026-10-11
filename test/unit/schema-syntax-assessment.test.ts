/** Expectations authored independently in #271 issuecomment-6111769287. */
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import type {CanonicalGraph, GraphNode} from '../../src/compiler/canonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import type {SemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {checkActualSchemaSyntax} from '../../src/compiler/schemaSyntaxAssessment.js';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';

const original = readFileSync('test/conformance/fixtures/xsd/syntax/actual-source-controls.xsd', 'utf8');
async function graph(xml = original): Promise<CanonicalGraph> {
  const uri = 'https://syntax.test/actual.xsd', bytes = Buffer.from(xml);
  return buildCanonicalGraph(await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://syntax.test']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')}]])}));
}
function request(g: CanonicalGraph, maxWork = 1_000_000): SemanticRequest {
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(g), {budget: createSemanticBudget({maxWork})});
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  return prepared.request;
}
const node = (r: SemanticRequest, local: string) => r.graph.nodes.find(n => n.identity.kind === 'global' && n.identity.name.local === local)!;
const checks = (r: SemanticRequest) => r.graph.nodes.map(n => checkActualSchemaSyntax(r.actual, n.id));

describe('original component source syntax owner', () => {
  it('checks a useful original graph without claiming aggregate or full representation validity', async () => {
    const r = request(await graph());
    for (const result of checks(r)) expect(result).toMatchObject({kind: 'checked',
      authority: 'XSD10-original-component-syntax-v1', scope: 'original-component-source-syntax',
      remaining: ['schema-document-syntax', 'child-component-syntax', 'semantic-construction']});
    const use = r.graph.nodes.find(n => n.kind === 'attributeUse' && n.declaration.kind === 'symbol')!;
    expect(checkActualSchemaSyntax(r.actual, use.id).kind).toBe('checked');
  });

  it('rejects forged contexts and leaves hypothetical source interpretation unresolved', async () => {
    const r = request(await graph());
    const d = node(r, 'Derived');
    expect(() => checkActualSchemaSyntax({...r.actual}, d.id)).toThrow('Unauthenticated semantic context');
    const candidate = r.candidate({key: 'unchanged-source', active: r.actual.members});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    expect(checkActualSchemaSyntax(candidate.context, d.id)).toMatchObject({kind: 'unresolved', rule: 'actual-source-only'});
    expect(checkActualSchemaSyntax(r.actual, 'absent')).toMatchObject({kind: 'unresolved', rule: 'src-resolve'});
  });

  it.each([
    ['duplicate wrapper annotations', '<xs:complexContent>', '<xs:complexContent><xs:annotation/>'],
    ['late wrapper annotation', '</xs:extension>', '</xs:extension><xs:annotation/>'],
    ['duplicate top annotation', '<xs:complexType name="Base">', '<xs:complexType name="Base"><xs:annotation/><xs:annotation/>'],
    ['attribute before particle', '<xs:complexType name="Base">', '<xs:complexType name="Base"><xs:attribute name="before" type="xs:string"/>'],
    ['namespaced XSD attribute', 'mixed="false"', 'mixed="false" xs:extra="bad"'],
    ['global use attribute', 'name="globalDefault" type="xs:string"', 'name="globalDefault" type="xs:string" use="optional"'],
    ['NBSP boolean', 'mixed="false"', 'mixed="&#160;false&#160;"'],
    ['invalid schema default set', 'elementFormDefault="qualified"', 'elementFormDefault="qualified" finalDefault="#all restriction"'],
    ['invalid explicit final', 'name="Scalar"', 'name="Scalar" final="extension"'],
    ['pattern fixed attribute', 'value="[a-z]+"', 'value="[a-z]+" fixed="true"'],
    ['required own default', 'name="local" type="xs:string"', 'name="local" type="xs:string" use="required" default="own"'],
  ])('diagnoses %s in the original source context', async (_name, before, after) => {
    const r = request(await graph(original.replace(before, after)));
    const failures = checks(r).filter(result => result.kind !== 'checked');
    expect(failures).toEqual(expect.arrayContaining([expect.objectContaining({kind: 'invalid-schema',
      source: expect.objectContaining({uri: 'https://syntax.test/actual.xsd'})})]));
  });

  it('preserves exact occurrence spelling checks on retained source even when canonical values are supplied separately', async () => {
    // Independently altered retained syntax probes the owner directly: structural
    // preparation does not assume source-semantic consistency for these records.
    const g = await graph();
    const particle = g.nodes.find(n => n.kind === 'particle' && n.declaredAttributes.some(a => a.name.local === 'minOccurs'))!;
    for (const spelling of ['-1', '1.0', 'unbounded', '\u00a01\u00a0']) {
      const changed: GraphNode = {...particle, declaredAttributes: particle.declaredAttributes.map(a => a.name.local === 'minOccurs' ? {...a, value: spelling} : a)};
      const r = request({...g, nodes: g.nodes.map(n => n.id === changed.id ? changed : n)});
      expect(checkActualSchemaSyntax(r.actual, changed.id)).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
    }
    const huge = request(await graph(original.replace('maxOccurs="+0001"', 'maxOccurs="900719925474099312345678901234567890"')));
    expect(checks(huge).every(result => result.kind === 'checked')).toBe(true);
  });

  it('diagnoses excluded retained syntax without erasing the actual source', async () => {
    const r = request(await graph(original.replace('<xs:complexType name="Base">', '<xs:complexType name="Base"><xs:assert test="true()"/>')));
    const b = node(r, 'Base');
    expect(checkActualSchemaSyntax(r.actual, b.id)).toMatchObject({kind: 'unsupported-capability', rule: 'xsd:assert',
      source: {uri: 'https://syntax.test/actual.xsd'}});
  });

  it('rejects an inline simple type in a simple-content extension while retaining restriction grammar', async () => {
    const extension = '<xs:complexType name="Simple"><xs:simpleContent><xs:extension base="xs:string"><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType></xs:extension></xs:simpleContent></xs:complexType>';
    const r = request(await graph(original.replace('</xs:schema>', extension + '</xs:schema>')));
    expect(checkActualSchemaSyntax(r.actual, node(r, 'Simple').id)).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
    const restriction = extension.replaceAll('xs:extension', 'xs:restriction');
    const s = request(await graph(original.replace('</xs:schema>', restriction + '</xs:schema>')));
    expect(checkActualSchemaSyntax(s.actual, node(s, 'Simple').id).kind).toBe('checked');
  });

  it('shares inclusive cumulative limits and never publishes a checked result after exhaustion', async () => {
    const g = await graph(), first = request(g);
    const root = node(first, 'Derived');
    expect(checkActualSchemaSyntax(first.actual, root.id).kind).toBe('checked');
    const used = first.budget.usage().work;
    const exact = request(g, used);
    expect(checkActualSchemaSyntax(exact.actual, root.id).kind).toBe('checked');
    const short = request(g, used - 1);
    const failure = checkActualSchemaSyntax(short.actual, root.id);
    expect(failure.kind).toBe('resource-limit');
    expect(checkActualSchemaSyntax(short.actual, root.id)).toBe(failure);
  });
});
