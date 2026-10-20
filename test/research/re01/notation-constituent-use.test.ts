/** Datatypes enumeration-required-notation qualifies each constructor use, not its selected value branch. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, GraphNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import type {OriginalGeneratedScalarReference} from '../../../src/compiler/semanticTypeReference.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSchemaScalarKernel, checkOriginalGeneratedScalar} from '../../../src/compiler/schemaScalarKernel.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';

const namespace = 'urn:research:notation-constituent';
const directory = path.resolve('test/conformance/fixtures/xsd/recovery');
const id = (local: string) => globalId('type', {namespace, local});
const named = (name: string): Reference => ({kind: 'local', target: id(name)});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const slot = (name: string): OriginalGeneratedScalarReference => ({kind: 'original-generated', owner: id(name)});
const rejected = {kind: 'invalid-schema', rule: 'enumeration-required-notation'} as const;

async function subject(direct = false, rewrite: (source: string) => string = source => source) {
  const file = direct ? 'notation-constituent-direct-use.xsd' : 'notation-constituent-use.xsd';
  const bytes = Buffer.from(rewrite(readFileSync(path.join(directory, file), 'utf8'))), uri = 'https://notation-constituent.example/' + file;
  const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ['https://notation-constituent.example']},
    offlineResources: new Map([[uri, {bytes, digest: createHash('sha256').update(bytes).digest('hex')} ]])});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const request = prepared.request, actual = request.actual;
  const node = (name: string): GraphNode => {const found = actual.lookup(id(name)); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const result = node(name); assert.equal(result.kind, 'complexType'); return result;};
  const simple = (name: string): SimpleTypeNode => {const result = node(name); assert.equal(result.kind, 'simpleType'); return result;};
  const b = complex('B'), d = complex('D'), lexical = (value: string) => ({value, context: b.context});
  const prepare = (rawSimpleTypes: readonly RawSimpleTypeProperties[] = [], fresh: readonly SimpleTypeNode[] = []) => {
    const e: ComplexTypeNode = {...b, id: id('E'), identity: {kind: 'global', role: 'type', name: {namespace, local: 'E'}},
      derivation: {kind: 'extension', contentKind: 'simple', base: builtin('anySimpleType'), facets: []}};
    const row = (type: string, base: Reference, method: 'extension' | 'restriction', scalar: Reference): RawComplexTypeProperties => ({
      type, derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar}, attributeUses: [],
      provenance: {kind: 'hypothetical-abstract', originals: type === b.id || type === d.id ? [type] : []}});
    const result = request.candidate({key: 'notation-constituents', active: [...actual.members, e.id, ...fresh.map(item => item.id)], additions: [e, ...fresh], rawSimpleTypes,
      endpoint: {...d, derivation: {kind: 'restriction', contentKind: 'simple', base: named('E'), facets: []}},
      rawTypes: [row(b.id, builtin('string'), 'extension', builtin('string')), row(d.id, named('E'), 'restriction', builtin('string')),
        row(e.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType'))]});
    assert.equal(result.kind, 'prepared', JSON.stringify(result));
    const verify = () => verifyFiniteRe01Evidence(actual, d.id, {root: 'D', nodes: [
      {id: 'D', parent: actual, context: result.context, target: d.id, intermediate: e.id, ancestor: builtin('anySimpleType'), premises: []},
    ]});
    return {context: result.context, verify};
  };
  const fresh = (name: string, variety: SimpleTypeNode['variety']): SimpleTypeNode => ({...simple('L'), id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, variety});
  const raw = (name: string, variety: RawSimpleTypeProperties['variety']): RawSimpleTypeProperties => ({type: id(name), targetNamespace: namespace,
    base: builtin('anySimpleType'), final: [], variety, facetLayers: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
  return {actual, node, lexical, prepare, fresh, raw};
}

describe('NOTATION constructor constituent qualification', () => {
  it('checks the complete qualified source, nested constructors and both original-generated scalar slots', async () => {
    const s = await subject(), candidate = s.prepare(), kernel = createSchemaScalarKernel(candidate.context);
    expect(kernel.describe(named('Q'), id('D'))).toMatchObject({kind: 'checked'});
    for (const name of ['Q', 'U', 'L', 'NestedUnion', 'NestedList'])
      expect(kernel.assess(named(name), s.lexical('t:N'), id('D'))).toMatchObject({kind: 'checked'});
    for (const name of ['GeneratedList', 'GeneratedUnion']) {
      expect(checkOriginalGeneratedScalar(s.actual, slot(name))).toMatchObject({kind: 'checked', contextId: s.actual.contextId, obligations: []});
      expect(checkOriginalGeneratedScalar(candidate.context, slot(name))).toMatchObject({kind: 'checked', contextId: candidate.context.contextId, obligations: []});
      expect(kernel.assess(slot(name), s.lexical('t:N'), id('D'))).toMatchObject({kind: 'checked'});
    }
    const result = candidate.verify(); expect(result.kind).toBe('checked-candidate'); assert.equal(result.kind, 'checked-candidate');
    expect(result.proof).toHaveLength(1);
    expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
    expect(new Set(result.actualScalarSlots.map(item => item.slot.owner))).toEqual(new Set(s.actual.scalarSlots.map(item => item.owner)));
  });

  it.each(['U', 'L'] as const)('rejects the bare source %s constructor even for a value accepted by another union branch', async name => {
    const s = await subject(true), kernel = createSchemaScalarKernel(s.actual);
    expect(checkComponentConstruction(s.actual, id(name))).toMatchObject(rejected);
    expect(kernel.describe(named(name), id('D'))).toMatchObject(rejected);
    expect(kernel.assess(named(name), s.lexical(name === 'U' ? 'true' : 't:N'), id('D'))).toMatchObject(rejected);
    expect(s.prepare().verify()).toMatchObject(rejected);
  });

  it('rejects unused original constructors and an outer enumeration that cannot qualify their atomic constituents', async () => {
    const unused = await subject(true, source => source.replace(/  <xs:attribute[^>]*\/>\n/g, ''));
    for (const target of unused.actual.members) {
      const found = unused.actual.lookup(target); assert.equal(found.kind, 'found');
      expect(['element', 'attribute']).not.toContain(found.node.kind);
    }
    expect(unused.prepare().verify()).toMatchObject(rejected);
    const s = await subject(true, source => source.replace(/  <xs:attribute[^>]*\/>\n/g, '').replace('</xs:schema>',
      '  <xs:simpleType name="Outer"><xs:restriction base="t:U"><xs:enumeration value="true"/></xs:restriction></xs:simpleType>\n</xs:schema>'));
    expect(createSchemaScalarKernel(s.actual).describe(named('Outer'), id('D'))).toMatchObject(rejected);
    expect(s.prepare().verify()).toMatchObject(rejected);
  });

  it('does not hide a bare atomic constituent behind source nested unions or union-valued list items', async () => {
    const s = await subject(false, source => source.replace('memberTypes="t:Q xs:boolean"', 'memberTypes="xs:NOTATION xs:boolean"'));
    const kernel = createSchemaScalarKernel(s.actual);
    for (const name of ['NestedUnion', 'NestedList'])
      expect(kernel.assess(named(name), s.lexical('true'), id('D'))).toMatchObject(rejected);
  });

  it.each(['list', 'union'] as const)('checks fresh raw %s uses after Q has privately primed NOTATION in the same H', async variety => {
    const s = await subject(), refs = variety === 'list' ? {kind: 'list', item: builtin('NOTATION')} as const
      : {kind: 'union', members: [builtin('NOTATION'), builtin('boolean')]} as const;
    const fresh = s.fresh('Raw', refs), candidate = s.prepare([s.raw('Raw', refs)], [fresh]);
    const kernel = createSchemaScalarKernel(candidate.context);
    expect(kernel.assess(named('Q'), s.lexical('t:N'), id('Raw'))).toMatchObject({kind: 'checked'});
    expect(kernel.describe(named('Raw'), id('Raw'))).toMatchObject(rejected);
    expect(kernel.assess(named('Raw'), s.lexical(variety === 'union' ? 'true' : 't:N'), id('Raw'))).toMatchObject(rejected);
    expect(checkComponentConstruction(candidate.context, fresh.id)).toMatchObject({kind: 'candidate-rejected', rule: rejected.rule, component: fresh.id});
    expect(candidate.verify()).toMatchObject({kind: 'candidate-rejected', rule: rejected.rule});
  });

  it('retains complete fresh raw qualified constructors, including a nested atomic union item', async () => {
    const s = await subject(), union = {kind: 'union', members: [named('Q'), builtin('boolean')]} as const;
    const list = {kind: 'list', item: named('RawUnion')} as const;
    const candidate = s.prepare([s.raw('RawUnion', union), s.raw('RawList', list)], [s.fresh('RawUnion', union), s.fresh('RawList', list)]);
    const kernel = createSchemaScalarKernel(candidate.context);
    expect(kernel.assess(named('RawList'), s.lexical('t:N true'), id('RawList'))).toMatchObject({kind: 'checked'});
    const result = candidate.verify(); expect(result.kind).toBe('checked-candidate'); assert.equal(result.kind, 'checked-candidate');
    expect(result.proof).toHaveLength(1);
    expect(result.proof[0].components.map(item => item.component)).toEqual(expect.arrayContaining([id('RawUnion'), id('RawList')]));
    expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
  });

  it.each([['L', 'GeneratedList', 'itemType="t:Q"', 'itemType="xs:NOTATION"'],
    ['U', 'GeneratedUnion', 'memberTypes="t:Q xs:boolean"', 'memberTypes="xs:NOTATION xs:boolean"']] as const)
    ('retains original-context constituent formation for generated %s scalar properties', async (_base, generated, from, to) => {
      const s = await subject(false, source => source.replace(from, to)), candidate = s.prepare();
      expect(checkOriginalGeneratedScalar(s.actual, slot(generated))).toMatchObject(rejected);
      expect(checkOriginalGeneratedScalar(candidate.context, slot(generated))).toMatchObject({...rejected, contextId: s.actual.contextId});
      expect(candidate.verify()).toMatchObject(rejected);
    });

  it('keeps direct declared NOTATION and missing original notation values rejected after valid enum formation', async () => {
    const s = await subject(), kernel = createSchemaScalarKernel(s.actual);
    expect(kernel.assess(named('Q'), s.lexical('t:N'), id('D'))).toMatchObject({kind: 'checked'});
    expect(kernel.assess(builtin('NOTATION'), s.lexical('t:N'), id('D'))).toMatchObject(rejected);
    expect(kernel.assess(named('Q'), s.lexical('t:Missing'), id('D'))).toMatchObject({kind: 'invalid-schema'});
  });
});
