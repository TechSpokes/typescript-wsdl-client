import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence, proveRe01FreshAffiliationObstruction} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkSubstitution, effectiveSubstitutionMembers} from '../../../src/compiler/schemaTypeRelations.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:helper-membership';
const type = (local: string) => globalId('type', {namespace, local});
const element = (local: string) => globalId('element', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
type Representative = 'nonprimitive-extension' | 'existing-head-type' | 'primitive-extension' | 'restriction';

async function subject(representative: Representative, eligibleHead = false) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/helper-membership-vector.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request;
  const get = (id: string): ComplexTypeNode => {
    const found = request.actual.lookup(id);
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(id);
    return found.node;
  };
  const a = get(type('A')), x = get(type('X'));
  const head = element(eligibleHead ? 'HP' : 'H'), outerHead = element(eligibleHead ? 'QP' : 'Q');
  const headType = get(type(eligibleHead ? 'P' : 'B'));
  const helper = (name: string, base: Reference, method: 'extension' | 'restriction' = 'extension'): ComplexTypeNode => ({
    ...a, id: type(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: method, contentKind: 'complex', base, facets: []},
  });
  const e = helper('E', local(a.id));
  const u = helper('U', local(representative === 'primitive-extension' ? a.id : headType.id),
    representative === 'restriction' ? 'restriction' : 'extension');
  const m: ElementNode = {kind: 'element', id: element('M'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'M'}},
    name: {namespace, local: 'M'}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(representative === 'existing-head-type' ? headType.id : u.id), nillable: false, abstract: false,
    substitutionGroup: local(head)};
  const additions = representative === 'existing-head-type' ? [e, m] : [e, u, m];
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType}, content: {kind: 'empty'},
    abstract: false, final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(e.id), facets: []}};
  const candidate = request.candidate({key: representative, active: [...request.actual.members, ...additions.map(node => node.id)],
    additions, endpoint, rawTypes: [raw(e), ...[a, get(type('B')), get(type('P')), get(type('R')), endpoint].map(node =>
      ({...raw(node), provenance: {kind: 'hypothetical-abstract' as const, originals: [node.id]}})),
      ...(representative === 'existing-head-type' ? [] : [raw(u)])], rawElements: [{element: m.id, final: [], block: []}]});
  if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
  const context = candidate.context;
  const correspondence = checkCandidateCorrespondence(request.actual, request.actual, context, x.id, e.id, local(a.id));
  expect(correspondence).toMatchObject({kind: 'checked'});
  return {request, context, x, e, u, m, head, outerHead, headType, raw, evidence: {root: 'root', nodes: [
    {id: 'root', parent: request.actual, context, target: x.id, intermediate: e.id, ancestor: local(a.id), premises: []},
  ]}};
}

describe('fresh helper membership observations and their exact nested obligations', () => {
  // Independent dated substitution reasoning: U extension B restriction A
  // passes H:block restriction but fails Q:block extension. Identity B and a
  // restriction-only helper change that vector; extension A cannot reach B.
  it.each([
    ['nonprimitive-extension', true, true, false], ['existing-head-type', true, true, true],
    ['primitive-extension', false, false, false], ['restriction', true, false, true],
  ] as const)('compares %s by affiliation=%s, H=%s, Q=%s', async (representative, affiliation, atH, atQ) => {
    const {context, m} = await subject(representative);
    expect(checkSubstitution(context, m.id, element('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: affiliation});
    for (const [head, expected] of [['H', atH], ['Q', atQ]] as const) {
      const result = effectiveSubstitutionMembers(context, element(head));
      expect(result.kind).toBe('checked');
      if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
      expect(result.value.includes(m.id)).toBe(expected);
    }
  });

  it('rejects the locally distinguishing helper at its mandatory inherited-affiliate obligation', async () => {
    const {request, context, u, m, x, evidence} = await subject('nonprimitive-extension');
    expect(checkComponentConstruction(context, m.id)).toMatchObject({kind: 'checked'});
    expect(proveRe01FreshAffiliationObstruction(request.actual, context, u.id)).toMatchObject({kind: 'proved-no-construction',
      criterion: 'mandatory-fresh-affiliate-fixed-complex-ancestry', target: u.id, affiliate: m.id, headType: type('B')});
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, evidence);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence'});
  });

  it.each(['existing-head-type', 'restriction'] as const)('checks a complete witness with %s despite a different vector', async representative => {
    const {request, x, evidence} = await subject(representative);
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, evidence);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate', claims: {
      universalCoverage: false, completeNegativeAnswer: false, searchTermination: false,
    }});
  });

  it('checks a complete nonprimitive-helper witness whose child changes the two-head vector', async () => {
    const {request, context, x, u, m, head, outerHead, headType, raw, evidence} = await subject('nonprimitive-extension', true);
    const endpoint = {...u, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(headType.id), facets: []}};
    const child = forkSemanticCandidate(context, {key: 'existing-primitive-intermediate', active: context.members,
      endpoint, rawTypes: [raw(endpoint)]});
    if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
    const proof = {root: evidence.root, nodes: [{...evidence.nodes[0], premises: ['helper']},
      {id: 'helper', parent: context, context: child.context, target: u.id, intermediate: headType.id, ancestor: local(type('A')), premises: []}]};
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, proof);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
    expect(proveRe01FreshAffiliationObstruction(request.actual, context, u.id)).toMatchObject({kind: 'not-established'});
    for (const [current, atH, atQ] of [[context, true, false], [child.context, false, true]] as const) {
      expect(checkComponentConstruction(current, m.id)).toMatchObject({kind: 'checked'});
      for (const [target, expected] of [[head, atH], [outerHead, atQ]] as const) {
        const result = effectiveSubstitutionMembers(current, target);
        expect(result.kind).toBe('checked');
        if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
        expect(result.value.includes(m.id)).toBe(expected);
      }
    }
  });

  it.each([
    ['existing-head-type', true, true, true], ['primitive-extension', false, false, false], ['restriction', true, false, true],
  ] as const)('tests %s against the successful helper vector', async (representative, affiliation, atH, atQ) => {
    const {context, m, head, outerHead} = await subject(representative, true);
    expect(checkSubstitution(context, m.id, head, {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: affiliation});
    for (const [target, expected] of [[head, atH], [outerHead, atQ]] as const) {
      const result = effectiveSubstitutionMembers(context, target);
      if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
      expect(result.value.includes(m.id)).toBe(expected);
    }
    if (affiliation) {
      const {request, x, evidence} = await subject(representative, true);
      const verified = verifyFiniteRe01Evidence(request.actual, x.id, evidence);
      expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
    }
  });
});
