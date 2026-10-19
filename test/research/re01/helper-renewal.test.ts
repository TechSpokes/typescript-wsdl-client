/** Locally productive contexts are not a semantic-success or cyclic-evidence rule. */
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {checkCandidateCorrespondence, re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import {checkSubstitution, effectiveSubstitutionMembers, immediateTypeBase} from '../../../src/compiler/schemaTypeRelations.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:helper-renewal';
const typeId = (name: string) => globalId('type', {namespace, local: name});
const elementId = (name: string) => globalId('element', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};
function complex(context: SemanticContext, id: string): ComplexTypeNode {
  const found = context.lookup(id);
  if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(id);
  return found.node;
}

async function seed(consumed = true) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/helper-renewal-' + (consumed ? 'consumed' : 'unconsumed') + '.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request, a = complex(request.actual, typeId('A')), b = complex(request.actual, typeId('B')),
    x = complex(request.actual, typeId('X'));
  if (!a.content || !x.content) throw new Error('Original anchored operands');
  const prefix = a.content;
  const helper = (index: number): ComplexTypeNode => ({...b, id: typeId('U' + index),
    identity: {kind: 'global', role: 'type', name: {namespace, local: 'U' + index}}, content: prefix,
    derivation: {kind: 'extension', contentKind: 'complex', base: local(b.id), facets: []}});
  const member = (index: number): ElementNode => ({kind: 'element', id: elementId('M' + index),
    identity: {kind: 'global', role: 'element', name: {namespace, local: 'M' + index}}, name: {namespace, local: 'M' + index},
    context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [], type: local(typeId('U' + index)),
    nillable: false, abstract: false, substitutionGroup: local(elementId('H'))});
  const raw = (type: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: type.id,
    derivation: {method: type.derivation?.kind ?? 'restriction', base: type.derivation?.base ?? anyType}, content,
    abstract: false, final: [], block: [], attributeUses: [], targetNamespace: namespace,
    provenance: {kind: 'hypothetical-abstract', originals: request.actual.lookup(type.id).kind === 'found' ? [type.id] : []}});
  const rawHelper = (type: ComplexTypeNode) => raw(type, {kind: 'element-only', particle: prefix});
  const originals = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const content = deriveActualComplexContent(request.actual, node.id);
    if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
    return [raw(node, content.view.content)];
  });
  const endpoint = {...x, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(b.id), facets: []}};
  const u = helper(0), m = member(0);
  const first = request.candidate({key: 'renewal-0', active: [...request.actual.members, u.id, m.id], additions: [u, m], endpoint,
    rawTypes: [...originals.filter(props => props.type !== x.id), raw(endpoint, {kind: 'element-only', particle: x.content}), rawHelper(u)],
    rawElements: [{element: m.id, type: m.type, final: [], block: []}]});
  if (first.kind !== 'prepared') throw new Error(JSON.stringify(first));
  const root: FiniteRe01EvidenceNode = {id: 'root', parent: request.actual, context: first.context,
    target: x.id, intermediate: b.id, ancestor: local(a.id), premises: []};
  const next = (parent: SemanticContext, index: number, renew = true, freshIntermediate = false): FiniteRe01EvidenceNode => {
    const current = complex(parent, typeId('U' + index)), freshBase = {...helper(index + 1),
      derivation: {kind: 'extension' as const, contentKind: 'complex' as const, base: local(a.id), facets: []}};
    const selected = freshIntermediate ? freshBase : b;
    const endpoint = {...current, derivation: {kind: 'restriction' as const, contentKind: 'complex' as const, base: local(selected.id), facets: []}};
    const u = helper(index + 1), m = member(index + 1);
    const additions = freshIntermediate ? [freshBase] : renew ? [u, m] : [];
    const child = forkSemanticCandidate(parent, {key: 'renewal-' + (index + 1) + (renew ? '' : '-no-new-member'),
      active: [...parent.members, ...additions.map(node => node.id)], additions, endpoint,
      rawTypes: [rawHelper(endpoint), ...(freshIntermediate ? [rawHelper(freshBase)] : renew ? [rawHelper(u)] : [])],
      rawElements: !freshIntermediate && renew ? [{element: m.id, type: m.type, final: [], block: []}] : []});
    if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
    return {id: 'child-' + index, parent, context: child.context, target: current.id,
      intermediate: selected.id, ancestor: local(a.id), premises: []};
  };
  return {request, a, b, x, root, next};
}

function link(nodes: readonly FiniteRe01EvidenceNode[]): FiniteRe01EvidenceNode[] {
  return nodes.map((node, index) => ({...node, premises: index + 1 < nodes.length ? [nodes[index + 1]!.id] : []}));
}

describe('renewed helper duties and the finite-evidence boundary', () => {
  it.each([1, 3, 5])('checks every local component in %s renewing contexts while the last child remains owed', async count => {
    const s = await seed(), nodes = [s.root];
    expect(checkSchemaDocumentSyntax(s.request.actual)).toMatchObject({kind: 'checked'});
    const actualDuties: string[] = [];
    for (const id of s.request.actual.members) {
      const result = checkComponentConstruction(s.request.actual, id);
      expect(result).toMatchObject({kind: 'checked', obligations: []});
      if (result.kind === 'checked' && result.re01 && !result.re01.primitive) actualDuties.push(id);
    }
    expect(actualDuties).toEqual([s.x.id]); // Count the original duty, never assume it.
    for (let index = 0; index < count; index++) {
      const current = nodes[index]!, context = current.context, duties: string[] = [];
      expect(checkCandidateCorrespondence(s.request.actual, current.parent, context, current.target, current.intermediate, current.ancestor))
        .toMatchObject({kind: 'checked'});
      for (const id of context.members) {
        const result = checkComponentConstruction(context, id);
        expect(result).toMatchObject({kind: 'checked', obligations: []});
        if (result.kind === 'checked' && result.re01 && !result.re01.primitive) duties.push(id);
      }
      expect(duties).toEqual([typeId('U' + index)]);
      expect(checkComponentConstruction(context, s.b.id)).toMatchObject({kind: 'checked', re01: {primitive: true}});
      expect(re01Ancestor(context, typeId('U' + index))).toMatchObject({kind: 'checked', ancestor: expect.objectContaining({target: s.a.id})});
      expect(immediateTypeBase(context, local(typeId('U' + index)))).toMatchObject({kind: 'checked', value: local(s.b.id)});
      const h = effectiveSubstitutionMembers(context, elementId('H')), q = effectiveSubstitutionMembers(context, elementId('Q'));
      if (h.kind !== 'checked' || q.kind !== 'checked') throw new Error('Qualified groups');
      expect(new Set(h.value)).toEqual(new Set([elementId('H'), elementId('M' + index)]));
      expect(new Set(q.value)).toEqual(new Set([elementId('H'), elementId('Q')]));
      for (let inherited = 0; inherited <= index; inherited++) {
        const m = elementId('M' + inherited), u = typeId('U' + inherited);
        expect(checkSubstitution(context, m, elementId('H'), {mode: 'affiliation'})).toMatchObject({kind: 'checked', value: true});
        expect(checkSubstitution(context, m, elementId('H'), {mode: 'substitutability'})).toMatchObject({kind: 'checked', value: inherited === index});
        const receipt = checkComponentConstruction(context, u);
        expect(receipt).toMatchObject({kind: 'checked', obligations: [], typeDependencies: expect.arrayContaining([
          {contextId: context.contextId, type: {kind: 'component', id: s.x.id}},
        ])});
        expect(context.lookup(m)).toMatchObject({kind: 'found'});
      }
      if (index + 1 < count) nodes.push(s.next(context, index));
    }
    expect(verifyFiniteRe01Evidence(s.request.actual, s.x.id, {root: 'root', nodes: link(nodes)}))
      .toMatchObject({kind: 'unresolved', rule: 'missing-nested-evidence', component: typeId('U' + (count - 1))});
  });

  it('distinguishes missing renewal from a fresh intermediate that loses the exact B affiliation', async () => {
    const s = await seed();
    const loss = s.next(s.root.context, 0, false);
    expect(checkComponentConstruction(loss.context, s.x.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    expect(verifyFiniteRe01Evidence(s.request.actual, s.x.id, {root: 'root', nodes: link([s.root, loss])}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4', component: s.x.id});
    const fresh = s.next(s.root.context, 0, false, true);
    expect(checkSubstitution(fresh.context, elementId('M0'), elementId('H'), {mode: 'affiliation'}))
      .toMatchObject({kind: 'checked', value: false});
    expect(checkComponentConstruction(fresh.context, elementId('M0')))
      .toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
    expect(verifyFiniteRe01Evidence(s.request.actual, s.x.id, {root: 'root', nodes: link([s.root, fresh])}))
      .toMatchObject({kind: 'candidate-rejected'});
  });

  it('retains a complete finite contrast when z no longer consumes the earlier endpoint', async () => {
    const s = await seed(false), child = s.next(s.root.context, 0, false);
    expect(checkComponentConstruction(child.context, s.x.id)).toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
    const result = verifyFiniteRe01Evidence(s.request.actual, s.x.id, {root: 'root', nodes: link([s.root, child])});
    expect(result).toMatchObject({kind: 'checked-candidate', claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    if (result.kind !== 'checked-candidate') throw new Error(result.kind);
    expect(() => assertFiniteCandidateReceipt(s.request.actual, result)).not.toThrow();
    expect(new Set(result.actualComponents.map(component => component.component))).toEqual(new Set(s.request.actual.members));
    expect(result.proof).toHaveLength(2);
    const closedChild = result.proof.find(step => step.evidence === child.id)!;
    expect(closedChild.components.map(component => component.component)).toEqual(expect.arrayContaining([typeId('U0'), elementId('M0'), s.a.id, s.b.id]));
    expect(closedChild.components.map(component => component.component)).not.toContain(s.x.id);
  });
});
