/** Recursive scope-property equality does not certify the scope's derivation. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:scope-properties';
const typeId = (local: string) => globalId('type', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const anyType: Reference = {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}};

async function seed() {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/scope-property-equality-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual;
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked'); assert.equal(actual.members.length, 31);
  const nonprimitive: string[] = [];
  for (const id of actual.members) {
    const result = checkComponentConstruction(actual, id); assert.equal(result.kind, 'checked');
    assert.deepEqual(result.obligations, []);
    if (result.re01 && !result.re01.primitive) nonprimitive.push(id);
  }
  assert.deepEqual(nonprimitive, [typeId('U')]);
  const get = (id: string): GraphNode => {const found = actual.lookup(id); assert.equal(found.kind, 'found'); return found.node;};
  const u = get(typeId('U')); assert.equal(u.kind, 'complexType');
  const endpoint: ComplexTypeNode = {...u, derivation: {kind: 'restriction', contentKind: 'complex', base: local(typeId('B')), facets: []}};
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? anyType},
    abstract: false, final: [], block: [], content, attributeUses: [],
    provenance: {kind: 'hypothetical-abstract', originals: actual.lookup(node.id).kind === 'found' ? [node.id] : []}});
  const originalRows = request.graph.nodes.flatMap(node => {
    if (node.kind !== 'complexType') return [];
    const mapped = deriveActualComplexContent(actual, node.id); assert.equal(mapped.kind, 'checked');
    assert.deepEqual(mapped.view.synthetic, []);
    return [raw(node.id === u.id ? endpoint : node, mapped.view.content)];
  });
  const declarations = request.graph.nodes.filter((node): node is ElementNode => node.kind === 'element' && node.name.local === 'l');
  assert.equal(declarations.length, 2);
  const particles = declarations.map(declaration => {
    const node = request.graph.nodes.find((node): node is ParticleNode => node.kind === 'particle' && node.term.kind === 'element'
      && node.term.declaration.kind === 'local' && node.term.declaration.target === declaration.id);
    assert.ok(node); return node;
  });
  const helper = (name: string, method: 'restriction' | 'extension', base: Reference, particle: string): ComplexTypeNode => ({...u,
    id: typeId(name), identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, content: particle, attributes: [],
    derivation: {kind: method, contentKind: 'complex', base, facets: []}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const fa = helper('FA', 'restriction', anyType, particles[1].id), fr = helper('FR', 'restriction', local(fa.id), particles[1].id);
  const ft = helper('FT', 'extension', local(fr.id), particles[1].id);
  const additions = [fa, fr, ft], content = {kind: 'element-only' as const, particle: particles[1].id};
  const supplied = request.candidate({key: 'scope-parent', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint,
    rawTypes: [...originalRows, ...additions.map(node => raw(node, content))]});
  assert.equal(supplied.kind, 'prepared'); const parent = supplied.context;
  const correspondence = checkCandidateCorrespondence(actual, actual, parent, u.id, typeId('B'), local(typeId('A')));
  assert.equal(correspondence.kind, 'checked');
  const parentChecked = new Set<string>(), queue = [u.id, typeId('B'), ...additions.map(node => node.id)], debts: string[] = [];
  while (queue.length) {
    const id = queue.pop()!; if (parentChecked.has(id)) continue;
    const receipt = checkComponentConstruction(parent, id, {correspondence}); assert.equal(receipt.kind, 'checked');
    assert.deepEqual(receipt.obligations, []); parentChecked.add(id); queue.push(...receipt.dependencies);
    if (receipt.re01 && !receipt.re01.primitive) debts.push(id);
    for (const required of receipt.typeDependencies) if (required.contextId === parent.contextId && required.type.kind === 'component') queue.push(required.type.id);
  }
  assert.deepEqual(debts, [ft.id]); assert.equal(parentChecked.has(typeId('T')), false);
  const child = (mode: 'identity' | 'property-equal' | 'consumed' | 'bad-wrapper') => {
    const prefix = mode === 'identity' ? particles[1] : particles[0];
    const fe = helper('FE', 'extension', local(fa.id), prefix.id);
    const wrapper: ParticleNode = {...particles[0], id: scopedId(fe.id, '/prefix', 'particle'),
      identity: {kind: 'scoped', owner: fe.id, path: '/prefix', role: 'particle'}, occurs: {min: mode === 'bad-wrapper' ? '0' : '1', max: '1'},
      term: {kind: 'sequence', children: [prefix.id]}, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const intermediate = {...fe, content: wrapper.id};
    const changed: ComplexTypeNode = {...ft, derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const fresh: GraphNode[] = [intermediate, wrapper];
    const required: ElementNode = {...declarations[0], id: globalId('element', {namespace, local: 'Required'}),
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'Required'}}, name: {namespace, local: 'Required'}, type: local(typeId('T'))};
    if (mode === 'consumed') fresh.push(required);
    const prepared = forkSemanticCandidate(parent, {key: mode, active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh, endpoint: changed,
      rawTypes: [raw(changed, content), raw(intermediate, {kind: 'element-only', particle: wrapper.id})],
      rawElements: mode === 'consumed' ? [{element: required.id, type: required.type, final: [], block: []}] : []});
    assert.equal(prepared.kind, 'prepared'); const context = prepared.context;
    const receipt = checkCandidateCorrespondence(actual, parent, context, ft.id, fe.id, local(fa.id)); assert.equal(receipt.kind, 'checked');
    const result = verifyFiniteRe01Evidence(actual, u.id, {root: 'U', nodes: [
      {id: 'U', parent: actual, context: parent, target: u.id, intermediate: typeId('B'), ancestor: local(typeId('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: fe.id, ancestor: local(fa.id), premises: []},
    ]});
    return {context, receipt, result, fe, required};
  };
  return {actual, parent, child, declarations};
}

describe('scope property comparison retains consumed validity boundaries', () => {
  it.each(['identity', 'property-equal'] as const)('checks a complete two-node %s prefix forest without an unrelated scope-base root', async mode => {
    const s = await seed(), c = s.child(mode);
    expect(c.result).toMatchObject({kind: 'checked-candidate', claims: {universalCoverage: false, completeNegativeAnswer: false, searchTermination: false}});
    assert.equal(c.result.kind, 'checked-candidate'); assertFiniteCandidateReceipt(s.actual, c.result);
    expect(new Set(c.result.actualComponents.map(receipt => receipt.component))).toEqual(new Set(s.actual.members));
    expect(c.result.proof).toHaveLength(2);
    const nested = c.result.proof.find(step => step.target === typeId('FT')); assert.ok(nested);
    for (const name of ['T', 'R_M']) expect(nested.components.some(receipt => receipt.component === typeId(name))).toBe(false);
    const [left, right] = s.declarations.map(node => {const found = c.context.lookup(node.id); assert.equal(found.kind, 'found'); return found.node;});
    expect(compareComponentProperties(c.context, left, right)).toMatchObject({kind: 'checked', value: true, obligations: ['component-validity']});
    expect(checkComponentConstruction(c.context, typeId('R_M'), {correspondence: c.receipt}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.5.4'});
  });

  it('still rejects a fresh mandatory declaration that genuinely consumes the failing base', async () => {
    const s = await seed(), c = s.child('consumed');
    expect(c.result).toMatchObject({kind: 'candidate-rejected', component: typeId('R_M'), rule: 'derivation-ok-restriction.5.4'});
    expect(c.receipt.fresh).toContain(c.required.id);
  });

  it('still checks the unit outer-sequence condition for the copied prefix', async () => {
    const s = await seed(), c = s.child('bad-wrapper');
    expect(c.result).toMatchObject({kind: 'candidate-rejected', component: c.fe.id, rule: 'cos-particle-extend'});
  });
});
