import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteCandidateReceipt, FiniteRe01Evidence, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:reconstruction:equality-consumer';
const named = (name: string) => globalId('type', {namespace, local: name});
const element = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
function node(context: SemanticContext, id: string): GraphNode {
  const found = context.lookup(id);
  if (found.kind !== 'found') throw new Error(id);
  return found.node;
}
function complex(context: SemanticContext, id: string): ComplexTypeNode {
  const found = node(context, id);
  if (found.kind !== 'complexType') throw new Error(id);
  return found;
}

async function seed() {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/equality-anchor-reconstruction-independent.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request, actual = request.actual;
  const a = complex(actual, named('A')), b = complex(actual, named('B')), x = complex(actual, named('X'));
  const [p, q] = ['Left', 'Right'].map(name => {
    const declaration = node(actual, element(name));
    if (declaration.kind !== 'element' || declaration.type.kind !== 'local') throw new Error(name);
    return complex(actual, declaration.type.target);
  }) as [ComplexTypeNode, ComplexTypeNode];
  const pContent = p.content, qContent = q.content;
  if (!pContent || !qContent) throw new Error('Expected two nonempty original contents');
  const raw = (type: ComplexTypeNode): RawComplexTypeProperties => ({type: type.id, targetNamespace: namespace,
    derivation: {method: type.derivation?.kind ?? 'restriction', base: type.derivation?.base ?? anyType},
    content: type.content ? {kind: 'element-only', particle: type.content} : {kind: 'empty'},
    abstract: false, final: [], block: [], attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.sourceNode(type.id) ? [type.id] : []}});
  const originalRows = request.graph.nodes.flatMap(type => {
    if (type.kind !== 'complexType') return [];
    const content = deriveActualComplexContent(actual, type.id);
    if (content.kind !== 'checked' || content.view.synthetic.length) throw new Error(type.id);
    return [{...raw(type), content: content.view.content}];
  });
  const freshType = (name: string, base: string, content: string): ComplexTypeNode => ({...q,
    id: named(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, content,
    derivation: {kind: 'extension', contentKind: 'complex', base: local(base), facets: []}});
  const fa = freshType('FA', a.id, pContent), template = freshType('C', fa.id, qContent);
  const wrapper: ParticleNode = {kind: 'particle', id: scopedId(template.id, '/copy-prefix', 'particle'),
    identity: {kind: 'scoped', owner: template.id, path: '/copy-prefix', role: 'particle'}, context: q.context,
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], occurs: {min: '1', max: '1'},
    term: {kind: 'sequence', children: [qContent]}};
  const c = {...template, content: wrapper.id};
  const t: ComplexTypeNode = {...q, id: scopedId(x.id, '/copy-Q', 'complexType'),
    identity: {kind: 'scoped', owner: x.id, path: '/copy-Q', role: 'complexType'}};
  const n: ElementNode = {kind: 'element', id: element('N'), identity: {kind: 'global', role: 'element', name: {namespace, local: 'N'}},
    name: {namespace, local: 'N'}, type: local(t.id), nillable: false, abstract: false, context: q.context,
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const endpoint: ComplexTypeNode = {...x, derivation: {kind: 'restriction', contentKind: 'complex', base: local(b.id), facets: []}};
  const make = (mode: 'copy' | 'fold' | 'repair') => {
    const declaration = mode === 'copy' ? n : {...n, type: local(q.id)};
    const consumer = mode === 'repair' ? {...c, content: pContent,
      derivation: {...c.derivation!, kind: 'restriction' as const}} : c;
    const additions: GraphNode[] = [fa, consumer, wrapper, declaration, ...(mode === 'copy' ? [t] : [])];
    const result = request.candidate({key: mode, active: [...actual.members, ...additions.map(item => item.id)], additions, endpoint,
      rawTypes: [...originalRows.filter(row => row.type !== x.id), raw(endpoint), raw(fa), raw(consumer), ...(mode === 'copy' ? [raw(t)] : [])],
      rawElements: [{element: declaration.id, type: declaration.type, final: [], block: []}]});
    if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
    return result.context;
  };
  const child = (parent: SemanticContext, target: string, id: string): FiniteRe01EvidenceNode => {
    const type = complex(parent, target);
    if (!type.content) throw new Error(target);
    const middle = freshType('Middle-' + id, a.id, type.content);
    const end = {...type, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(middle.id), facets: []}};
    const result = forkSemanticCandidate(parent, {key: id, active: [...parent.members, middle.id], additions: [middle],
      endpoint: end, rawTypes: [raw(end), raw(middle)]});
    if (result.kind !== 'prepared') throw new Error(JSON.stringify(result));
    return {id, parent, context: result.context, target, intermediate: middle.id, ancestor: local(a.id), premises: []};
  };
  const actualNodes = [p.id, q.id].map((target, index) => child(actual, target, 'actual-' + index));
  const evidence = (context: SemanticContext, children: readonly FiniteRe01EvidenceNode[]): FiniteRe01Evidence => ({root: 'X',
    nodes: [...actualNodes, {id: 'X', parent: actual, context, target: x.id, intermediate: b.id, ancestor: local(a.id),
      premises: children.filter(item => item.parent === context).map(item => item.id)}, ...children]});
  const originalEvidence = (context: SemanticContext): FiniteRe01Evidence => evidence(context,
    [[t.id, c.id], [c.id, t.id]].flatMap(([first, second], index) => {
      const upper = child(context, first!, 'helper-' + index), lower = child(upper.context, second!, 'remaining-' + index);
      return [{...upper, premises: [lower.id]}, lower];
    }));
  return {request, actual, a, b, x, p, q, pContent, qContent, fa, c, t, n, wrapper, make, child, evidence, originalEvidence};
}

function checked(s: Awaited<ReturnType<typeof seed>>, evidence: FiniteRe01Evidence): FiniteCandidateReceipt {
  const result = verifyFiniteRe01Evidence(s.actual, s.x.id, evidence);
  expect(result).toMatchObject({kind: 'checked-candidate'});
  if (result.kind !== 'checked-candidate') throw new Error(JSON.stringify(result));
  assertFiniteCandidateReceipt(s.actual, result);
  expect(new Set(result.actualComponents.map(item => item.component))).toEqual(new Set(s.actual.members));
  expect(result.actualComponents.every(item => item.contextId === s.actual.contextId)).toBe(true);
  expect(new Set(result.actualComponents.filter(item => item.re01 && !item.re01.primitive).map(item => item.component)))
    .toEqual(new Set([s.x.id, s.p.id, s.q.id]));
  expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  return result;
}

describe('genuine original equality anchors and joint first-birth reconstruction', () => {
  it('checks the complete copy forest before a reference-only fold exposes an inherited prefix failure', async () => {
    const s = await seed(), original = s.make('copy'), old = checked(s, s.originalEvidence(original));
    expect(old.proof).toHaveLength(7);
    expect(original.members).toHaveLength(19);
    expect(s.actual.members).toHaveLength(14);
    for (const type of [s.p, s.q]) {
      expect(type.identity.kind).toBe('scoped');
      expect(s.actual.originalSourceComponentAbsent(type.id)).toBe(false);
      expect(s.actual.sourceNode(type.id)).toEqual(type);
    }
    expect(s.p.id).not.toBe(s.q.id);
    expect(s.pContent).not.toBe(s.qContent);
    expect(s.t.identity).toMatchObject({kind: 'scoped', owner: s.x.id});
    expect(s.q.identity).toMatchObject({kind: 'scoped', owner: element('Right')});
    expect(original.members.filter(id => original.owner(id) === s.t.id)).toEqual([]);
    expect(compareComponentProperties(original, complex(original, s.t.id), complex(original, s.q.id)))
      .toMatchObject({kind: 'checked', value: true, typeDependencies: [], scalarObligations: []});
    const oldRoot = old.proof.find(step => step.target === s.x.id)!;
    expect(oldRoot.components.filter(item => [s.p.id, s.q.id].includes(item.component))).toEqual([]);

    const folded = s.make('fold'), qChild = s.child(folded, s.q.id, 'folded-Q');
    expect(folded.members).toEqual(original.members.filter(id => id !== s.t.id));
    for (const id of folded.members) {
      const before = node(original, id);
      expect(node(folded, id)).toEqual(id === s.n.id ? {...before, type: local(s.q.id)} : before);
      expect(folded.rawTypeProperties(id)).toEqual(original.rawTypeProperties(id));
      expect(folded.rawElementProperties(id)).toEqual(id === s.n.id
        ? {...original.rawElementProperties(id), type: local(s.q.id)} : original.rawElementProperties(id));
    }
    expect(checkCandidateCorrespondence(s.actual, s.actual, folded, s.x.id, s.b.id, local(s.a.id)))
      .toMatchObject({kind: 'checked'});
    expect(checkComponentConstruction(folded, s.n.id)).toMatchObject({kind: 'checked',
      typeDependencies: expect.arrayContaining([{contextId: folded.contextId, type: {kind: 'component', id: s.q.id}}])});
    expect(checkComponentConstruction(folded, s.q.id)).toMatchObject({kind: 'checked', re01: {primitive: false}});
    expect(qChild.parent).toBe(folded);
    expect(complex(qChild.context, s.q.id).derivation?.kind).toBe('restriction');
    expect(complex(qChild.context, s.p.id).derivation?.kind).toBe('extension');
    for (const fixed of [s.c.id, s.fa.id, s.wrapper.id, s.pContent, s.qContent])
      expect(qChild.context.lookup(fixed)).toEqual(folded.lookup(fixed));
    expect(checkComponentConstruction(folded, s.c.id)).toMatchObject({kind: 'checked'});
    expect(compareComponentProperties(folded, complex(folded, s.p.id), complex(folded, s.q.id)))
      .toMatchObject({kind: 'checked', value: true});
    expect(compareComponentProperties(qChild.context, complex(qChild.context, s.p.id), complex(qChild.context, s.q.id)))
      .toMatchObject({kind: 'checked', value: false});
    expect(checkComponentConstruction(qChild.context, s.c.id))
      .toMatchObject({kind: 'candidate-rejected', rule: 'cos-particle-extend', component: s.c.id});
    expect(verifyFiniteRe01Evidence(s.actual, s.x.id, s.evidence(folded, [qChild])))
      .toMatchObject({kind: 'candidate-rejected', rule: 'cos-particle-extend', component: s.c.id, contextId: qChild.context.contextId});
    // Every permitted Q child starts with restriction; inherited C's fixed
    // first member compares the original local x scopes Q and P. This one
    // executed child discriminates the obstruction, not arbitrary Γ witnesses.
  });

  it('repairs the consumer jointly while retaining the wrapper and the anchor forest in each required context', async () => {
    const s = await seed(), original = s.make('copy');
    checked(s, s.originalEvidence(original));
    const repaired = s.make('repair'), qChild = s.child(repaired, s.q.id, 'repaired-Q');
    expect(verifyFiniteRe01Evidence(s.actual, s.x.id, s.evidence(repaired, [])))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: s.q.id, contextId: repaired.contextId});
    const proof = s.evidence(repaired, [qChild]), result = checked(s, proof);
    expect(result.proof).toHaveLength(4);
    expect(repaired.members).toHaveLength(18);
    expect(repaired.members).toEqual(original.members.filter(id => id !== s.t.id));
    for (const id of repaired.members) {
      const before = node(original, id), row = original.rawTypeProperties(id);
      expect(node(repaired, id)).toEqual(id === s.c.id
        ? {...s.c, content: s.pContent, derivation: {...s.c.derivation!, kind: 'restriction'}}
        : id === s.n.id ? {...s.n, type: local(s.q.id)} : before);
      expect(repaired.rawTypeProperties(id)).toEqual(id === s.c.id
        ? {...row, derivation: {...row!.derivation, method: 'restriction'}, content: {kind: 'element-only', particle: s.pContent}} : row);
      expect(repaired.rawElementProperties(id)).toEqual(id === s.n.id
        ? {...original.rawElementProperties(id), type: local(s.q.id)} : original.rawElementProperties(id));
    }
    for (const context of [repaired, qChild.context]) {
      const step = result.proof.find(item => item.contextId === context.contextId)!;
      const fresh = context.members.filter(id => !s.actual.members.includes(id));
      expect(step.components.map(item => item.component)).toEqual(expect.arrayContaining(fresh));
      expect(step.components.every(item => item.contextId === context.contextId)).toBe(true);
      expect(context.lookup(s.wrapper.id)).toEqual(original.lookup(s.wrapper.id));
      expect(complex(context, s.c.id)).toMatchObject({content: s.pContent,
        derivation: {kind: 'restriction', base: local(s.fa.id)}});
      const consumer = step.components.find(item => item.component === s.c.id)!;
      expect(consumer.obligations).toEqual([]);
      expect(consumer.re01).toBeUndefined();
    }
    expect(proof.nodes.filter(item => item.parent === s.actual).map(item => item.target).sort())
      .toEqual([s.x.id, s.p.id, s.q.id].sort());
    expect(result.proof.find(item => item.contextId === repaired.contextId)?.premises).toEqual([qChild.id]);
    expect(qChild.parent).toBe(repaired);
    expect(result.proof.find(item => item.contextId === qChild.context.contextId)?.target).toBe(s.q.id);
    expect(complex(qChild.context, s.q.id).derivation?.kind).toBe('restriction');
    // Local common-content identity removes C's extension duty. Q's new H
    // duty remains and is proved here; its separate Γ receipt is not reused.
  });
});
