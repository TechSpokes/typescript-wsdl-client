import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {measureMeaningfulPrefixBounds} from './meaningful-prefix-bound.js';

const fixtures = path.resolve('test/conformance/fixtures');
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
async function setup(file: string) {
  const input = await loadSchemaInput(path.join(fixtures, file), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  return prepared.request;
}

async function restoration(erase: boolean, consumer?: 'two-wildcards' | 'trimmed',
  sharedRequest?: Awaited<ReturnType<typeof setup>>) {
  const request = sharedRequest ?? await setup('xsd/re01/reordered-particle-int.xsd');
  const namespace = 'urn:review';
  const id = (name: string) => globalId('type', {namespace, local: name});
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(id(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const a = get('A'), d = get('D'), eId = id('FreshE');
  if (!a.content || !d.content) throw new Error('Expected original particles');
  const found = request.actual.lookup(a.content);
  if (found.kind !== 'found' || found.node.kind !== 'particle') throw new Error('Expected original prefix');
  const template = found.node;
  const particle = (name: string, term: ParticleNode['term'], occurs = {min: '1', max: '1'}): ParticleNode => ({
    ...template, id: scopedId(eId, '/' + name, 'particle'),
    identity: {kind: 'scoped', owner: eId, path: '/' + name, role: 'particle'}, term, occurs,
  });
  const separator = particle('separator', {kind: 'choice', children: []});
  const wildcard = particle('tail', {kind: 'any', wildcard: {
    namespace: {value: '##any', context: a.context}, processContents: 'skip',
  }}, {min: '0', max: 'unbounded'});
  const extra = particle('extra-tail', wildcard.term, wildcard.occurs);
  const wrapper = particle('content', {kind: 'sequence', children: [a.content, separator.id, wildcard.id,
    ...(consumer === 'two-wildcards' ? [extra.id] : [])]});
  const content = erase ? a.content : wrapper.id;
  const e: ComplexTypeNode = {...a, id: eId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshE'}},
    content, derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
  const properties = (type: string, base: Reference, method: 'extension' | 'restriction', root: string): RawComplexTypeProperties => ({
    type, derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'element-only', particle: root},
    attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: type === eId ? [] : [type]},
  });
  const fId = id('FreshF'), fRoot = particle('consumer', {kind: 'sequence', children: [d.content, d.content]});
  const f: ComplexTypeNode = {...e, id: fId, identity: {kind: 'global', role: 'type', name: {namespace, local: 'FreshF'}},
    content: fRoot.id, derivation: {kind: 'restriction', contentKind: 'complex', base: local(eId), facets: []}};
  const additions = erase ? [e] : [e, wrapper, separator, wildcard, ...(consumer ? [extra, f, fRoot] : [])];
  const candidate = request.candidate({key: consumer ?? (erase ? 'erased-tail' : 'live-tail'),
    active: [...request.actual.members, ...additions.map(node => node.id)], additions,
    endpoint: {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(eId), facets: []}},
    rawTypes: [properties(a.id, anyType, 'restriction', a.content),
      properties(eId, local(a.id), 'extension', content), properties(d.id, local(eId), 'restriction', d.content),
      ...(consumer ? [{...properties(fId, local(eId), 'restriction', fRoot.id),
        provenance: {kind: 'hypothetical-abstract' as const, originals: []}}] : [])],
  });
  if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
  return {request, context: candidate.context, a, d, eId, separator, wildcard, wrapper, fId};
}

describe('meaningful-prefix input capacities and complete live restoration', () => {
  it('derives capacities from immutable effective source composition, without repeated occurrence expansion', async () => {
    const request = await setup('xsd/recovery/content-independent.xsd');
    const named = (local: string) => globalId('type', {namespace: 'urn:recovery:content', local});
    expect(measureMeaningfulPrefixBounds(request.actual, named('B'), named('EmptyExtension'))).toMatchObject({
      kind: 'structural-bound', maxPrefixMembers: '1', maxFinalMembers: '2', maxMappingStates: '6', maxNewParticleRecords: '4',
    });
    const big = await setup('xsd/recovery/restriction-independent.xsd');
    const n = (local: string) => globalId('type', {namespace: 'urn:recovery:restriction', local});
    expect(measureMeaningfulPrefixBounds(big.actual, n('Big'), n('BigMinusOne'))).toMatchObject({
      kind: 'structural-bound', maxPrefixMembers: '1', maxFinalMembers: '1', maxMappingStates: '4',
    });
    expect(measureMeaningfulPrefixBounds(request.actual, named('Simple'), named('EmptyExtension'))).toMatchObject({kind: 'outside-slice'});
  });

  it('counts each shared group-use incidence while keeping virtual-choice alternatives outside the position bound', async () => {
    const request = await setup('xsd/s06-pw01/shared-group-uses.xsd');
    const id = (local: string) => globalId('type', {namespace: 'urn:pw01', local});
    expect(measureMeaningfulPrefixBounds(request.actual, id('B'), id('D'))).toMatchObject({
      kind: 'structural-bound', maxPrefixMembers: '1', maxFinalMembers: '4', maxMappingStates: '10',
    });
    const heads = await setup('xsd/recovery/restriction-independent.xsd');
    const head = globalId('type', {namespace: 'urn:recovery:restriction', local: 'HeadOnly'});
    expect(measureMeaningfulPrefixBounds(heads.actual, head, head)).toMatchObject({maxFinalMembers: '1'});
    const content = deriveActualComplexContent(heads.actual, head);
    if (content.kind !== 'checked') throw new Error(content.kind);
    const normalized = prepareSemanticParticleView(heads.actual, content.view, 'restriction');
    expect(normalized).toMatchObject({kind: 'checked', view: {root: {kind: 'choice', children: [{kind: 'element'}, {kind: 'element'}]}}});
    heads.budget.guard(() => heads.budget.chargeWork(125_000_000));
    expect(measureMeaningfulPrefixBounds(heads.actual, head, head)).toBe(heads.budget.failure());
  });

  it('rejects pointwise tail replacement through a retained fresh restriction that consumes E', async () => {
    const original = await restoration(false, 'two-wildcards');
    const trimmed = await restoration(false, 'trimmed', original.request);
    expect(trimmed.context.members).toEqual(original.context.members);
    for (const id of original.context.members) {
      if (id !== original.wrapper.id) expect(trimmed.context.lookup(id)).toEqual(original.context.lookup(id));
      expect(trimmed.context.rawTypeProperties(id)).toEqual(original.context.rawTypeProperties(id));
    }
    for (const subject of [original, trimmed]) {
      const {request, context, a, d, eId, fId} = subject;
      const view = (type: string) => {
        const content = deriveRawComplexContent(context, type);
        if (content.kind !== 'checked') throw new Error(content.kind);
        const result = prepareSemanticParticleView(context, content.view, 'restriction');
        if (result.kind !== 'checked') throw new Error(result.kind);
        return result.view;
      };
      expect(checkCandidateCorrespondence(request.actual, request.actual, context, d.id, eId, local(a.id))).toMatchObject({kind: 'checked'});
      expect(checkParticleRestriction(context, view(d.id), view(eId))).toMatchObject({kind: 'checked', value: true});
      expect(checkParticleRestriction(context, view(fId), view(eId))).toMatchObject({kind: 'checked', value: subject === original});
      const result = verifyFiniteRe01Evidence(request.actual, d.id, {root: 'root', nodes: [{id: 'root', parent: request.actual,
        context, target: d.id, intermediate: eId, ancestor: local(a.id), premises: []}]});
      if (subject === trimmed) expect(result).toMatchObject({kind: 'candidate-rejected', component: fId});
      else {
        expect(result).toMatchObject({kind: 'checked-candidate'});
        if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
        expect(result.proof[0].components.map(item => item.component)).toContain(fId);
      }
    }
  });

  it.each([false, true])('checks live intermediate content and exact endpoint correspondence; erased=%s', async erase => {
    // Existing original removes optional a:string, then restores required a:int.
    // NameAndTypeOK forbids using A's a for the restored declaration. The live
    // wildcard is consumed by D'; E itself is a primitive extension of A.
    const {request, context, a, d, eId, separator, wildcard, wrapper} = await restoration(erase);
    const before = JSON.stringify(request.graph);
    const content = (type: string) => {
      const result = deriveRawComplexContent(context, type);
      if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
      return result.view;
    };
    expect(checkCandidateCorrespondence(request.actual, request.actual, context, d.id, eId, local(a.id))).toMatchObject({kind: 'checked'});
    expect(checkRawParticleExtension(context, content(eId), content(a.id))).toMatchObject({kind: 'checked', value: true});
    const final = prepareSemanticParticleView(context, content(d.id), 'restriction');
    const base = prepareSemanticParticleView(context, content(eId), 'restriction');
    if (final.kind !== 'checked' || base.kind !== 'checked') throw new Error('Expected normalized original operands');
    expect(checkParticleRestriction(context, final.view, base.view)).toMatchObject({kind: 'checked', value: !erase});
    const evidence = {root: 'root', nodes: [{id: 'root', parent: request.actual, context, target: d.id,
      intermediate: eId, ancestor: local(a.id), premises: []}]};
    const result = verifyFiniteRe01Evidence(request.actual, d.id, evidence);
    if (erase) expect(result).toMatchObject({kind: 'candidate-rejected'});
    else {
      expect(result).toMatchObject({kind: 'checked-candidate', claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
      if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
      expect(() => assertFiniteCandidateReceipt(request.actual, result)).not.toThrow();
      expect(result.proof).toHaveLength(1);
      expect(result.proof[0].primitiveNoChange).toContain(eId);
      for (const id of [eId, wrapper.id, separator.id, wildcard.id]) {
        expect(result.proof[0].components.map(item => item.component)).toContain(id);
        expect(checkComponentConstruction(context, id)).toMatchObject({kind: 'checked', obligations: []});
      }
      expect(base.view.root.children.find(child => child.source === separator.id)?.summary).toMatchObject({schemaEmptiable: true});
    }
    expect(JSON.stringify(request.graph)).toBe(before);
    expect(deriveActualComplexContent(request.actual, d.id).kind).toBe('checked');
    expect(() => measureMeaningfulPrefixBounds(context, a.id, d.id)).toThrow(/immutable actual/);
  });
});
