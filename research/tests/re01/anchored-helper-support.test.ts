import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:anchored-helper';
const type = (local: string) => globalId('type', {namespace, local});
const element = (local: string) => globalId('element', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
type Variation = 'nonprimitive' | 'no-member' | 'existing-type' | 'restriction' | 'primitive' | 'live-suffix' | 'zero-suffix';

async function subject(variation: Variation) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/anchored-helper-support.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request;
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(type(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const a = get('A'), b = get('B'), r = get('R'), x = get('X');
  if (!a.content || !x.content) throw new Error('Expected anchored source particles');
  const helper = (name: string, base: Reference, method: 'extension' | 'restriction' = 'extension'): ComplexTypeNode => ({...b,
    id: type(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: method, contentKind: 'complex', base, facets: []},
  });
  const u = helper('U', local(variation === 'primitive' ? a.id : b.id), variation === 'restriction' ? 'restriction' : 'extension');
  const m: ElementNode = {kind: 'element', id: element('M'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'M'}},
    name: {namespace, local: 'M'}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: local(variation === 'existing-type' ? b.id : u.id), nillable: false, abstract: false, substitutionGroup: local(element('H'))};
  const additions: GraphNode[] = variation === 'no-member' ? [] : variation === 'existing-type' ? [m] : [u, m];
  const raw = (node: ComplexTypeNode, particle?: string): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    content: node.id === r.id ? {kind: 'empty'} : {kind: 'element-only', particle: particle ?? (node.id === x.id ? x.content! : a.content!)},
    abstract: false, final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: [a.id, b.id, r.id, x.id].includes(node.id) ? [node.id] : []}});
  let middle = b, middleParticle = a.content;
  if (variation === 'live-suffix' || variation === 'zero-suffix') {
    middle = helper('E', local(a.id));
    const suffixId = scopedId(middle.id, '/suffix', 'particle'), rootId = scopedId(middle.id, '/root', 'particle');
    const node = (id: string, nodePath: string, term: ParticleNode['term'], min: string, max: string): ParticleNode => ({
      kind: 'particle', id, identity: {kind: 'scoped', owner: middle.id, path: nodePath, role: 'particle'},
      context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], occurs: {min, max}, term});
    additions.push(middle, node(suffixId, '/suffix', {kind: 'any', wildcard: {
      namespace: {value: 'urn:recovery:disjoint-suffix', context: a.context}, processContents: 'skip'}}, '0', variation === 'zero-suffix' ? '0' : '1'),
      node(rootId, '/root', {kind: 'sequence', children: [a.content, suffixId]}, '1', '1'));
    middleParticle = rootId;
  }
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(middle.id), facets: []}};
  const parent = request.candidate({key: variation, active: [...request.actual.members, ...additions.map(node => node.id)], additions,
    endpoint, rawTypes: [raw(a), raw(b), raw(r), raw(endpoint),
      ...(variation === 'no-member' || variation === 'existing-type' ? [] : [raw(u)]),
      ...(middle.id === b.id ? [] : [raw(middle, middleParticle)])],
    rawElements: variation === 'no-member' ? [] : [{element: m.id, final: [], block: []}]});
  if (parent.kind !== 'prepared') throw new Error(JSON.stringify(parent));
  const correspondence = checkCandidateCorrespondence(request.actual, request.actual, parent.context, x.id, middle.id, local(a.id));
  expect(correspondence, JSON.stringify(correspondence)).toMatchObject({kind: 'checked'});
  const child = variation === 'nonprimitive' || variation === 'live-suffix' || variation === 'zero-suffix'
    ? forkSemanticCandidate(parent.context, {key: 'helper-proof', active: parent.context.members,
      endpoint: {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}},
      rawTypes: [raw({...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}})]}) : undefined;
  if (child && child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  const evidence = {root: 'root', nodes: [{id: 'root', parent: request.actual, context: parent.context,
    target: x.id, intermediate: middle.id, ancestor: local(a.id), premises: child ? ['helper'] : []},
  ...(child?.kind === 'prepared' ? [{id: 'helper', parent: parent.context, context: child.context,
    target: u.id, intermediate: b.id, ancestor: local(a.id), premises: []}] : [])]};
  return {request, parent: parent.context, child: child?.kind === 'prepared' ? child.context : undefined,
    x, a, b, middle, m, u, evidence};
}

function content(context: SemanticContext, id: string) {
  const result = deriveRawComplexContent(context, id);
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.view;
}
function view(context: SemanticContext, id: string) {
  const result = prepareSemanticParticleView(context, content(context, id), 'restriction');
  if (result.kind !== 'checked') throw new Error(JSON.stringify(result));
  return result.view;
}

describe('anchored raw mapping and fresh nonprimitive helper support', () => {
  // Reviewer-derived expectation: H's extra member enables MapAndSum for four
  // local H occurrences; Q must have only the original H/Q names to map to the
  // fixed local choice. New U extension B supplies exactly that membership.
  it('checks the complete two-node witness and every inherited fresh root', async () => {
    const {request, parent, child, x, m, u, evidence} = await subject('nonprimitive');
    if (!child) throw new Error('Expected helper context');
    const verified = verifyFiniteRe01Evidence(request.actual, x.id, evidence);
    expect(verified, JSON.stringify(verified)).toMatchObject({kind: 'checked-candidate'});
    if (verified.kind !== 'checked-candidate') throw new Error(verified.kind);
    expect(verified.proof.find(step => step.evidence === 'helper')?.components).toEqual(expect.arrayContaining([
      expect.objectContaining({component: m.id, contextId: child.contextId}),
      expect.objectContaining({component: u.id, contextId: child.contextId}),
    ]));
    expect(checkComponentConstruction(parent, x.id)).toMatchObject({kind: 'checked'});
    expect(checkComponentConstruction(child, x.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
  });

  it.each(['no-member', 'existing-type', 'restriction'] as const)('rejects the actual named mapping for %s', async variation => {
    const {parent, x, b} = await subject(variation);
    expect(checkParticleRestriction(parent, view(parent, x.id), view(parent, b.id))).toMatchObject({kind: 'checked', value: false});
  });

  it('rejects a primitive helper whose ancestry cannot reach the retained H type', async () => {
    const {parent, m} = await subject('primitive');
    expect(checkComponentConstruction(parent, m.id)).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
  });

  it.each(['live-suffix', 'zero-suffix'] as const)('keeps raw extension and normalized suffix outcomes separate for %s', async variation => {
    const {parent, x, a, middle} = await subject(variation);
    expect(checkRawParticleExtension(parent, content(parent, middle.id), content(parent, a.id))).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(parent, view(parent, x.id), view(parent, middle.id)))
      .toMatchObject({kind: 'checked', value: variation === 'zero-suffix'});
  });
});
