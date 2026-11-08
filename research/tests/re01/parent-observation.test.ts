import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:parent-observation';
const type = (local: string) => globalId('type', {namespace, local});
const element = (local: string) => globalId('element', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});

async function subject(addAffiliate: boolean) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/finite-proof-parent-observation.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const request = prepared.request;
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(type(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const a = get('A'), d = get('D'), s = get('S');
  if (!d.content) throw new Error('Expected original sequence');
  const helper = (name: string, base: Reference, simple: boolean): ComplexTypeNode => ({
    ...(simple ? s : a), id: type(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    attributes: [], content: undefined,
    derivation: {kind: 'extension', contentKind: simple ? 'simple' : 'complex', base, facets: []},
  });
  const raw = (id: string, base: Reference, method: 'extension' | 'restriction', content: RawComplexContent): RawComplexTypeProperties => ({
    type: id, targetNamespace: namespace, derivation: {base, method}, content, abstract: false, final: [], block: [],
    attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: id === d.id ? [id] : []},
  });
  const e = helper('E', local(a.id), false), f = helper('F', local(s.id), true);
  const wildcardId = scopedId(e.id, '/wildcard', 'particle');
  const wildcard: ParticleNode = {
    kind: 'particle', id: wildcardId, identity: {kind: 'scoped', owner: e.id, path: '/wildcard', role: 'particle'},
    context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    occurs: {min: '0', max: 'unbounded'}, term: {kind: 'any', wildcard: {
      namespace: {value: '##any', context: a.context}, processContents: 'skip',
    }},
  };
  const additions = [e, f, wildcard];
  const parent = request.candidate({key: 'parent-observation', active: [...request.actual.members, ...additions.map(x => x.id)], additions,
    endpoint: {...d, derivation: {kind: 'restriction', contentKind: 'complex', base: local(e.id), facets: []}},
    rawTypes: [raw(a.id, builtin('anyType'), 'restriction', {kind: 'empty'}),
      raw(s.id, builtin('string'), 'extension', {kind: 'simple', type: builtin('string')}),
      raw(e.id, local(a.id), 'extension', {kind: 'element-only', particle: wildcardId}),
      raw(d.id, local(e.id), 'restriction', {kind: 'element-only', particle: d.content}),
      raw(f.id, local(s.id), 'extension', {kind: 'simple', type: builtin('string')})],
  });
  if (parent.kind !== 'prepared') throw new Error(JSON.stringify(parent));
  const e2 = helper('E2', builtin('anySimpleType'), true);
  const affiliate: ElementNode = {
    kind: 'element', id: element('c'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'c'}},
    name: {namespace, local: 'c'}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: builtin('string'), abstract: false, nillable: false, substitutionGroup: local(element('H')),
  };
  const childAdditions = addAffiliate ? [e2, affiliate] : [e2];
  const child = forkSemanticCandidate(parent.context, {key: 'helper-observation',
    active: [...parent.context.members, ...childAdditions.map(x => x.id)], additions: childAdditions,
    endpoint: {...f, derivation: {kind: 'restriction', contentKind: 'simple', base: local(e2.id), facets: []}},
    rawTypes: [raw(f.id, local(e2.id), 'restriction', {kind: 'simple', type: builtin('string')}),
      raw(e2.id, builtin('anySimpleType'), 'extension', {kind: 'simple', type: builtin('anySimpleType')})],
    rawElements: addAffiliate ? [{element: affiliate.id, final: [], block: []}] : [],
  });
  if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  return {request, parent: parent.context, child: child.context, target: d.id, evidence: {root: 'root', nodes: [
    {id: 'root', parent: request.actual, context: parent.context, target: d.id, intermediate: e.id,
      ancestor: local(a.id), premises: ['helper']},
    {id: 'helper', parent: parent.context, context: child.context, target: f.id, intermediate: e2.id,
      ancestor: builtin('anySimpleType'), premises: []},
  ]}};
}

describe('child witnesses cannot automatically replace parent predicate contexts', () => {
  // Independent pre-implementation reviewer expectation: cos-nonambig gives
  // two possible c positions only after adding c to H's substitution universe.
  // PW R-240 admits the parent's 0..2 sequence under 0..unbounded ##any/skip.
  it.each([false, true])('checks finite evidence in its contexts with added affiliate=%s', async addAffiliate => {
    const {request, parent, child, target, evidence} = await subject(addAffiliate);
    const correspondence = checkCandidateCorrespondence(request.actual, request.actual, parent, target, type('E'), local(type('A')));
    expect(correspondence.kind).toBe('checked');
    if (correspondence.kind !== 'checked') throw new Error(JSON.stringify(correspondence));
    const parentCheck = checkComponentConstruction(parent, target, {correspondence});
    expect(parentCheck, JSON.stringify(parentCheck)).toMatchObject({kind: 'checked'});
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result, JSON.stringify(result)).toMatchObject({kind: 'checked-candidate', claims: {
      universalCoverage: false, completeNegativeAnswer: false, searchTermination: false,
    }});
    const childCheck = checkComponentConstruction(child, target);
    expect(childCheck, JSON.stringify(childCheck)).toMatchObject(addAffiliate
      ? {kind: 'candidate-rejected', rule: 'cos-nonambig'} : {kind: 'checked'});
  });
});
