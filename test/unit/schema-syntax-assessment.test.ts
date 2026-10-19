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
const anonymous = readFileSync('test/conformance/fixtures/xsd/re01/copied-prefix-anonymous-types.xsd', 'utf8');
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
  it.each(['complex', 'simple'] as const)('delegates an exact local element inline %s type without erasing retained syntax', async kind => {
    const xml = kind === 'complex' ? anonymous : anonymous.replaceAll('<xs:complexType/>',
      '<xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType>');
    const r = request(await graph(xml));
    const particles = r.graph.nodes.filter(n => n.kind === 'particle' && n.term.kind === 'element');
    expect(particles).toHaveLength(2);
    for (const particle of particles) {
      expect(particle.retained).toEqual([expect.objectContaining({name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: kind + 'Type'}})]);
      expect(checkActualSchemaSyntax(r.actual, particle.id)).toMatchObject({kind: 'checked',
        remaining: ['schema-document-syntax', 'child-component-syntax', 'semantic-construction']});
    }
    expect(checks(r).every(result => result.kind === 'checked')).toBe(true);
  });

  it.each([
    ['stray child', '<xs:complexType/><xs:bogus/>'],
    ['late annotation', '<xs:complexType/><xs:annotation/>'],
    ['duplicate annotation', '<xs:annotation/><xs:annotation/><xs:complexType/>'],
  ])('retains local element and particle rejection of %s beside an inline type', async (_label, replacement) => {
    const r = request(await graph(anonymous.replace('<xs:complexType/>', replacement)));
    for (const kind of ['element', 'particle']) {
      const failed = r.graph.nodes.filter(n => n.kind === kind).map(n => checkActualSchemaSyntax(r.actual, n.id));
      expect(failed).toContainEqual(expect.objectContaining({kind: 'invalid-schema', rule: 'schema-for-schemas'}));
    }
  });

  it.each([
    ['duplicate types', '<xs:element name="a" minOccurs="0"><xs:complexType/>', '<xs:element name="a" minOccurs="0"><xs:complexType/><xs:simpleType><xs:restriction base="xs:string"/></xs:simpleType>'],
    ['named and inline types', '<xs:element name="a" minOccurs="0">', '<xs:element name="a" minOccurs="0" type="xs:string">'],
    ['reference and inline type', '<xs:element name="a" minOccurs="0">', '<xs:element ref="t:root" minOccurs="0">'],
  ])('keeps source construction rejection of %s', async (_label, before, after) => {
    await expect(graph(anonymous.replace(before, after))).rejects.toMatchObject({category: 'invalid-schema'});
  });

  it.each(['foreign-name', 'wrong-kind', 'wrong-path', 'wrong-span', 'duplicate-retained'] as const)
  ('does not delegate an unmatched retained inline child: %s', async change => {
    const g = await graph(anonymous), p = g.nodes.find(n => n.kind === 'particle' && n.retained.length)!;
    const inline = p.retained[0]!;
    const changed = change === 'foreign-name' ? {...inline, name: {...inline.name, namespace: 'urn:foreign'}}
      : change === 'wrong-kind' ? {...inline, name: {...inline.name, local: 'simpleType'}}
      : change === 'wrong-path' ? {...inline, source: {...inline.source, path: inline.source.path + '/0'}}
      : change === 'wrong-span' ? {...inline, source: {...inline.source, start: {...inline.source.start, offset: inline.source.start.offset + 1}}}
      : inline;
    const altered: GraphNode = {...p, retained: change === 'duplicate-retained' ? [inline, inline] : [changed]};
    const r = request({...g, nodes: g.nodes.map(n => n.id === p.id ? altered : n)});
    expect(checkActualSchemaSyntax(r.actual, p.id)).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
  });

  it('rejects an inline child at a compositor rather than a local element', async () => {
    const r = request(await graph(anonymous.replace('<xs:sequence>', '<xs:sequence><xs:complexType/>')));
    expect(checks(r)).toContainEqual(expect.objectContaining({kind: 'invalid-schema', rule: 'schema-for-schemas'}));
  });

  it.each(['declaration-source', 'type-source', 'named-type'] as const)
  ('requires the original same-source declaration and its owned anonymous type: %s', async change => {
    const g = await graph(anonymous), p = g.nodes.find(n => n.kind === 'particle' && n.term.kind === 'element')!;
    if (p.kind !== 'particle' || p.term.kind !== 'element' || p.term.declaration.kind !== 'local') throw new Error('Local element');
    const declarationId = p.term.declaration.target;
    const declaration = g.nodes.find(n => n.id === declarationId)!;
    if (declaration.kind !== 'element' || declaration.type.kind !== 'local') throw new Error('Inline type');
    const typeId = declaration.type.target;
    const anonymousType = g.nodes.find(n => n.id === typeId)!;
    const root = g.nodes.find(n => n.kind === 'element' && n.identity.kind === 'global');
    if (root?.kind !== 'element') throw new Error('Global root');
    const target = change === 'type-source' ? anonymousType : declaration;
    const altered: GraphNode = change === 'named-type' ? {...declaration, type: root.type}
      : {...target, context: {...target.context, source: {...target.context.source,
        start: {...target.context.source.start, offset: target.context.source.start.offset + 1}}}};
    const r = request({...g, nodes: g.nodes.map(n => n.id === target.id ? altered : n)});
    expect(checkActualSchemaSyntax(r.actual, p.id)).toMatchObject({kind: 'invalid-schema', rule: 'schema-for-schemas'});
  });

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

  it.each(['derived', 'inline'] as const)('shares inclusive cumulative limits and sticky exhaustion for %s syntax', async mode => {
    const g = await graph(mode === 'inline' ? anonymous : original), first = request(g);
    const root = mode === 'inline' ? first.graph.nodes.find(n => n.kind === 'particle' && n.retained.length)! : node(first, 'Derived');
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
