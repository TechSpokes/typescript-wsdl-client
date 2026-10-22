/** SOURCE SC VALUE properties retain the scalar's actual origin, without facade FULL. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {describe, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {AttributeUseNode, ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest, checkSchemaDocumentSyntax} from '../../../src/compiler/schemaDocumentSyntax.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {deriveActualComplexContent, deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {forkSemanticCandidate, prepareSemanticRequest} from '../../../src/compiler/semanticContext.js';
import {resolveCanonicalGraph} from '../../../src/compiler/resolveCanonicalGraph.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkRawParticleExtension} from '../../../src/compiler/particleExtension.js';
import {compareComponentProperties} from '../../../src/compiler/schemaComponentEquality.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkDeclaration, checkDeclarationValueProperty} from '../../../src/compiler/schemaDeclarationPrimitives.js';
import {createSchemaScalarKernel, checkOriginalGeneratedScalar} from '../../../src/compiler/schemaScalarKernel.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';

const namespace = 'urn:recovery:property-source-sc-value-frontier';
const id = (name: string) => globalId('type', {namespace, local: name});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
async function seed() {
  const directory = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(directory, 'xsd/recovery/property-source-sc-value-frontier.xsd'), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input); assert.equal(prepared.kind, 'prepared');
  const {request} = prepared, actual = request.actual, initialGraph = JSON.stringify(request.graph);
  assert.equal(checkSchemaDocumentSyntax(actual).kind, 'checked');
  const get = (target: string): GraphNode => {const found = actual.lookup(target); assert.equal(found.kind, 'found'); return found.node;};
  const complex = (name: string): ComplexTypeNode => {const node = get(id(name)); assert.equal(node.kind, 'complexType'); return node;};
  const head = get(globalId('element', {namespace, local: 'H'})); assert.equal(head.kind, 'element');
  const values = request.graph.nodes.filter((node): node is ElementNode => node.kind === 'element' && node.value?.lexical.value === 'same');
  assert.equal(values.length, 2); assert.equal(actual.members.length, 25);
  const actualNP: string[] = [];
  for (const target of actual.members) {
    const checked = checkComponentConstruction(actual, target); assert.equal(checked.kind, 'checked', JSON.stringify(checked));
    for (const pending of checked.obligations) assert.equal(pending.rule, 'simple-content-base-mixed-emptiable');
    if (checked.re01 && !checked.re01.primitive) actualNP.push(target);
  }
  assert.deepEqual(actualNP, [id('X')]);
  const helper = (name: string, method: 'extension' | 'restriction', base: Reference): ComplexTypeNode => ({...complex('R'), id: id(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, derivation: {kind: method, contentKind: 'complex', base, facets: []},
    content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []});
  const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content'], uses: readonly string[] = []): RawComplexTypeProperties => ({type: node.id,
    targetNamespace: namespace, abstract: node.abstract, final: [], block: [], derivation: {method: node.derivation!.kind, base: node.derivation!.base}, content,
    attributeUses: uses, provenance: {kind: 'hypothetical-abstract', originals: []}});
  const scopes = ['Left', 'Right'].map(name => {
    const element = get(globalId('element', {namespace, local: name})); assert.equal(element.kind, 'element'); assert.equal(element.type.kind, 'local');
    const owner = get(element.type.target); assert.equal(owner.kind, 'complexType');
    const use = request.graph.nodes.find((node): node is AttributeUseNode => node.kind === 'attributeUse' && node.identity.kind === 'scoped' && node.identity.owner === owner.id);
    assert.ok(use); return {owner, use};
  });
  const fa = helper('FA', 'restriction', builtin('anyType')), fr = helper('FR', 'restriction', local(fa.id)), ft = helper('FT', 'extension', local(fr.id));
  const ds: ComplexTypeNode[] = ['D1', 'D2'].map(name => ({...helper(name, 'restriction', builtin('anyType')), id: scopedId(fa.id, '/' + name, 'complexType'),
    identity: {kind: 'scoped', owner: fa.id, path: '/' + name, role: 'complexType'}}));
  const elementSeed = get(globalId('element', {namespace, local: 'Left'})); assert.equal(elementSeed.kind, 'element');
  const elements: ElementNode[] = ds.map((node, index) => ({...elementSeed, id: scopedId(fa.id, '/l' + index, 'element'),
    identity: {kind: 'scoped', owner: fa.id, path: '/l' + index, role: 'element'}, name: {namespace: '', local: 'l'}, type: local(node.id),
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const particles: ParticleNode[] = elements.map((node, index) => ({kind: 'particle', context: node.context, id: scopedId(fa.id, '/p' + index, 'particle'),
    identity: {kind: 'scoped', owner: fa.id, path: '/p' + index, role: 'particle'}, occurs: {min: '0', max: '1'}, term: {kind: 'element', declaration: local(node.id)},
    declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []}));
  const member: ElementNode = {...head, id: globalId('element', {namespace: '', local: 'intruder'}),
    identity: {kind: 'global', role: 'element', name: {namespace: '', local: 'intruder'}}, name: {namespace: '', local: 'intruder'},
    type: builtin('string'), abstract: false, substitutionGroup: local(head.id), declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
  const additions: GraphNode[] = [{...fa, content: particles[1].id}, fr, ft, ...ds, ...elements, ...particles, member];
  const x: ComplexTypeNode = {...complex('X'), derivation: {kind: 'restriction', contentKind: 'complex', base: local(id('B')), facets: []}};
  const supplied = request.candidate({key: 'parent', active: [...actual.members, ...additions.map(node => node.id)], additions, endpoint: x,
    rawTypes: [raw(x, {kind: 'empty'}), raw(complex('B'), {kind: 'empty'}), raw(fa, {kind: 'element-only', particle: particles[1].id}), raw(fr, {kind: 'empty'}), raw(ft, {kind: 'empty'}),
      ...ds.map((node, index) => raw(node, {kind: 'empty'}, [scopes[index].use.id]))],
    rawElements: [...elements, member].map(node => ({element: node.id, type: node.type, final: [], block: []}))});
  assert.equal(supplied.kind, 'prepared'); const parent = supplied.context;
  const parentCorrespondence = checkCandidateCorrespondence(actual, actual, parent, x.id, id('B'), local(id('A'))); assert.equal(parentCorrespondence.kind, 'checked');
  const parentClosure = new Set<string>(), queue = [x.id, id('B'), ...additions.map(node => node.id)];
  while (queue.length) {
    const target = queue.pop()!; if (parentClosure.has(target)) continue;
    const checked = checkComponentConstruction(parent, target, {correspondence: parentCorrespondence}); assert.equal(checked.kind, 'checked', JSON.stringify(checked));
    assert.deepEqual(checked.obligations, []); parentClosure.add(target); queue.push(...checked.dependencies);
    for (const dependency of checked.typeDependencies) if (dependency.contextId === parent.contextId && dependency.type.kind === 'component') queue.push(dependency.type.id);
  }
  for (const target of [id('F'), id('Z'), ...scopes.map(item => item.owner.id)]) assert.equal(parentClosure.has(target), false);
  const child = (same: boolean, options: Readonly<{consume?: boolean; rawFacade?: boolean; badValue?: boolean}> = {}) => {
    const prefix = particles[same ? 1 : 0], fe = helper('FE', 'extension', local(fa.id));
    const outer: ParticleNode = {...prefix, id: scopedId(fe.id, '/outer', 'particle'), identity: {kind: 'scoped', owner: fe.id, path: '/outer', role: 'particle'},
      occurs: {min: '1', max: '1'}, term: {kind: 'sequence', children: [prefix.id]}};
    const middle = {...fe, content: outer.id}, endpoint: ComplexTypeNode = {...ft, derivation: {kind: 'restriction', contentKind: 'complex', base: local(fe.id), facets: []}};
    const required: ElementNode = {...elementSeed, id: globalId('element', {namespace, local: 'Required'}), name: {namespace, local: 'Required'},
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'Required'}}, type: local(id('F')),
      value: options.badValue ? {...values[0].value!, lexical: {...values[0].value!.lexical, value: 'wrong'}} : undefined,
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const originalF = deriveActualComplexContent(actual, id('F')); assert.equal(originalF.kind, 'checked');
    const fresh: GraphNode[] = [middle, outer, ...(options.consume || options.badValue ? [required] : [])];
    const issued = forkSemanticCandidate(parent, {key: same ? 'identity' : 'copy', active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh, endpoint,
      rawTypes: [raw(endpoint, {kind: 'empty'}), raw(middle, {kind: 'element-only', particle: outer.id}),
        ...(options.rawFacade ? [raw(complex('F'), originalF.view.content)] : [])],
      rawElements: options.consume || options.badValue ? [{element: required.id, type: required.type, final: [], block: []}] : []});
    assert.equal(issued.kind, 'prepared'); const context = issued.context;
    const correspondence = checkCandidateCorrespondence(actual, parent, context, endpoint.id, middle.id, local(fa.id)); assert.equal(correspondence.kind, 'checked', JSON.stringify(correspondence));
    const own = deriveRawComplexContent(context, middle.id), base = deriveRawComplexContent(context, fa.id); assert.equal(own.kind, 'checked'); assert.equal(base.kind, 'checked');
    const extension = checkRawParticleExtension(context, own.view, base.view);
    const proof = verifyFiniteRe01Evidence(actual, x.id, {root: 'X', nodes: [
      {id: 'X', parent: actual, context: parent, target: x.id, intermediate: id('B'), ancestor: local(id('A')), premises: ['FT']},
      {id: 'FT', parent, context, target: ft.id, intermediate: middle.id, ancestor: local(fa.id), premises: []}]});
    return {context, correspondence, middle, fresh, extension, proof, required};
  };
  const port = (base: Reference, selector: SemanticTypeReference, extra: Readonly<{nodes?: readonly GraphNode[];
    types?: readonly RawComplexTypeProperties[]; simple?: readonly RawSimpleTypeProperties[]}> = {}) => {
    const carrier: ComplexTypeNode = {...helper('Port', 'extension', base), derivation: {kind: 'extension', contentKind: 'simple', base, facets: []}};
    const declaration: ElementNode = {...elementSeed, id: globalId('element', {namespace, local: 'PortValue'}), name: {namespace, local: 'PortValue'},
      identity: {kind: 'global', role: 'element', name: {namespace, local: 'PortValue'}}, type: local(carrier.id), value: values[0].value,
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const fresh: GraphNode[] = [carrier, declaration, ...(extra.nodes ?? [])];
    const issued = forkSemanticCandidate(parent, {key: 'literal-port', active: [...parent.members, ...fresh.map(node => node.id)], additions: fresh,
      rawTypes: [raw(carrier, {kind: 'simple', type: selector}), ...(extra.types ?? [])], rawSimpleTypes: extra.simple,
      rawElements: [{element: declaration.id, type: declaration.type, final: [], block: []}]});
    assert.equal(issued.kind, 'prepared'); return {context: issued.context, carrier, declaration};
  };
  return {request, actual, initialGraph, values, parent, parentCorrespondence, additions, scopes, ft, child, complex, port, raw};
}

describe('untouched SOURCE simple-content VALUE properties', () => {
  it.each([true, false])('completes identity prefix %s with exact GSC support and no facade FULL', async same => {
    const s = await seed(), c = s.child(same); assert.equal(c.proof.kind, 'checked-candidate', JSON.stringify(c.proof));
    assert.equal(c.proof.proof.length, 2); assert.equal(c.proof.actualComponents.length, 25);
    for (const step of c.proof.proof) for (const target of [id('F'), id('Z')]) assert.ok(!step.components.some(item => item.component === target));
    const step = c.proof.proof.find(item => item.target === s.ft.id); assert.ok(step);
    for (const node of [...s.additions, ...c.fresh]) assert.ok(step.components.some(item => item.component === node.id));
    assert.equal(c.context.rawTypeProperties(id('F')), undefined); assert.ok(c.context.originalComplexPropertySource(id('F')));
    const scalar = createSchemaScalarKernel(c.context), value = s.values[0];
    const identity = scalar.contentIdentity(local(id('F')), value.id); assert.equal(identity.kind, 'checked');
    assert.equal(identity.value.definition, 'content:' + id('F'));
    const generated = checkOriginalGeneratedScalar(c.context, {kind: 'original-generated', owner: id('F')}); assert.equal(generated.kind, 'checked');
    for (const declaration of s.values) {
      const property = checkDeclarationValueProperty(c.context, declaration.id), full = checkDeclaration(c.context, declaration.id);
      assert.equal(property.kind, 'checked'); assert.equal(full.kind, 'checked');
      assert.equal(property.authority, 'XSD10-source-simple-value-property-v1'); assert.equal(property.constraint?.operand.family, 'string');
      assert.deepEqual(property.obligations, []);
      assert.ok(full.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'component' && item.type.id === id('F')));
      for (const dependency of property.typeDependencies) if (dependency.contextId === c.context.contextId && dependency.type.kind === 'component')
        assert.ok(![id('F'), id('Z')].includes(dependency.type.id));
      assert.ok(property.scalarObligations.some(item => item.rule === 'simple-content-base-mixed-emptiable' && item.component === id('Z') && item.contextId === s.actual.contextId));
      assert.ok(!property.scalarObligations.some(item => item.rule === 'raw-simple-content-derivation-validity'));
    }
    assert.ok(generated.obligations.some(item => item.rule === 'simple-content-base-mixed-emptiable' && item.component === id('Z') && item.contextId === s.actual.contextId));
    const gammaZ = deriveActualComplexContent(s.actual, id('Z')); assert.equal(gammaZ.kind, 'checked'); assert.equal(gammaZ.view.content.kind, 'mixed');
    const view = prepareSemanticParticleView(s.actual, gammaZ.view, 'restriction'); assert.equal(view.kind, 'checked'); assert.equal(view.view.root.summary.schemaEmptiable, true);
    assert.equal(c.extension.kind, 'checked'); assert.equal(c.extension.value, true);
    if (!same) {
      assert.ok(!c.extension.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'component' && item.type.id === id('F')));
      const pair = compareComponentProperties(c.context, ...s.scopes.map(item => {const found = c.context.lookup(item.owner.id); assert.equal(found.kind, 'found'); return found.node;}) as [GraphNode, GraphNode]);
      assert.equal(pair.kind, 'checked'); assert.equal(pair.value, true);
    }
    const z = checkComponentConstruction(c.context, id('Z'), {correspondence: c.correspondence}); assert.equal(z.kind, 'candidate-rejected'); assert.equal(z.rule, 'cos-nonambig');
    assert.equal(JSON.stringify(s.request.graph), s.initialGraph); assert.equal(s.actual.budget.exhausted(), false);
  });

  it('retains genuine declared-TYPE consumption instead of importing a scalar receipt as FULL F', async () => {
    const s = await seed(), c = s.child(true, {consume: true});
    const full = checkDeclaration(c.context, c.required.id); assert.equal(full.kind, 'checked');
    assert.ok(full.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'component' && item.type.id === id('F')));
    assert.equal(c.proof.kind, 'unresolved'); assert.equal(c.proof.rule, 'component-content-properties'); assert.equal(c.proof.component, id('F'));
  });

  it.each([false, true])('rejects a VALUE violating the genuine scalar pattern with RAW facade %s', async rawFacade => {
    const s = await seed(), c = s.child(true, {badValue: true, rawFacade});
    const property = checkDeclarationValueProperty(c.context, c.required.id);
    assert.equal(property.kind, 'invalid-schema'); assert.equal(property.rule, 'cvc-pattern-valid');
    const full = checkDeclaration(c.context, c.required.id); assert.equal(full.kind, 'invalid-schema'); assert.equal(full.rule, 'cvc-pattern-valid');
    assert.equal(c.proof.kind, 'candidate-rejected'); assert.equal(c.proof.rule, 'cvc-pattern-valid');
  });

  it.each([true, false])('completes RAW identity prefix %s by selecting its actual GSC datatype', async same => {
    const s = await seed(), c = s.child(same, {rawFacade: true});
    assert.ok(c.context.rawTypeProperties(id('F'))); assert.equal(c.context.originalComplexPropertySource(id('F')), undefined);
    const property = checkDeclarationValueProperty(c.context, s.values[0].id); assert.equal(property.kind, 'checked');
    assert.equal(property.authority, 'XSD10-raw-simple-value-property-v1'); assert.equal(property.constraint?.operand.family, 'string');
    assert.ok(property.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'original-generated' && item.type.owner === id('F')));
    assert.ok(!property.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'component' && [id('F'), id('Z')].includes(item.type.id)));
    assert.ok(property.scalarObligations.some(item => item.rule === 'simple-content-base-mixed-emptiable' && item.component === id('Z') && item.contextId === s.actual.contextId));
    assert.ok(!property.scalarObligations.some(item => item.rule === 'raw-simple-content-derivation-validity' && item.component === id('F')));
    assert.equal(c.proof.kind, 'checked-candidate', JSON.stringify(c.proof)); assert.equal(c.proof.proof.length, 2); assert.equal(c.proof.actualComponents.length, 25);
    const step = c.proof.proof.find(item => item.target === s.ft.id); assert.ok(step);
    for (const node of [...s.additions, ...c.fresh]) assert.ok(step.components.some(item => item.component === node.id));
    for (const part of c.proof.proof) for (const target of [id('F'), id('Z')]) assert.ok(!part.components.some(item => item.component === target));
    assert.equal(JSON.stringify(s.request.graph), s.initialGraph); assert.equal(s.actual.budget.exhausted(), false);
  });

  it('retains generic RAW facade assessment and genuine declared TYPE formation', async () => {
    const s = await seed(), c = s.child(true, {rawFacade: true, consume: true});
    const full = checkDeclaration(c.context, s.values[0].id); assert.equal(full.kind, 'checked');
    assert.ok(full.typeDependencies.some(item => item.contextId === c.context.contextId && item.type.kind === 'component' && item.type.id === id('F')));
    const generic = createSchemaScalarKernel(c.context).assess(local(id('F')), s.values[0].value!.lexical, s.values[0].id); assert.equal(generic.kind, 'checked');
    for (const debts of [full.scalarObligations, generic.obligations])
      assert.ok(debts.some(item => item.rule === 'raw-simple-content-derivation-validity' && item.component === id('F') && (item.contextId ?? c.context.contextId) === c.context.contextId));
    assert.equal(c.proof.kind, 'candidate-rejected'); assert.equal(c.proof.rule, 'cos-nonambig');
  });

  it.each(['complex', 'anyType'] as const)('rejects the %s literal content role before facade normalization', async kind => {
    const s = await seed(), selector = kind === 'anyType' ? builtin('anyType') : local(id('F'));
    const p = s.port(builtin('string'), selector), property = checkDeclarationValueProperty(p.context, p.declaration.id);
    assert.equal(property.kind, 'invalid-schema'); assert.equal(property.rule, 'raw-type-content-role');
  });

  it('keeps self-content rejection at authentic context preparation', async () => {
    const s = await seed(), carrier: ComplexTypeNode = {...s.complex('R'), id: id('SelfPort'),
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'SelfPort'}},
      derivation: {kind: 'extension', contentKind: 'simple', base: builtin('string'), facets: []}};
    const issued = forkSemanticCandidate(s.parent, {key: 'self-content', active: [...s.parent.members, carrier.id], additions: [carrier],
      rawTypes: [s.raw(carrier, {kind: 'simple', type: local(carrier.id)})]});
    assert.equal(issued.kind, 'candidate-rejected'); assert.equal(issued.code, 'cycle');
  });

  it.each([['ID', 'e-props-correct'], ['NOTATION', 'enumeration-required-notation']] as const)('retains the actual %s VALUE gate', async (name, rule) => {
    const s = await seed(), p = s.port(builtin(name), builtin(name));
    const scalar = createSchemaScalarKernel(p.context).checkValue(builtin(name), p.declaration.value!, p.declaration.id);
    const property = checkDeclarationValueProperty(p.context, p.declaration.id);
    assert.equal(scalar.kind, 'invalid-schema'); assert.equal(scalar.rule, rule);
    assert.equal(property.kind, 'invalid-schema'); assert.equal(property.rule, rule);
  });

  it('forwards a genuine facade debt inside the selected SIMPLE support', async () => {
    const s = await seed(), source = s.complex('F'), mapped = deriveActualComplexContent(s.actual, source.id); assert.equal(mapped.kind, 'checked');
    const simple: SimpleTypeNode = {kind: 'simpleType', context: source.context, id: id('InnerScalar'),
      identity: {kind: 'global', role: 'type', name: {namespace, local: 'InnerScalar'}}, variety: {kind: 'restriction', base: builtin('string'), facets: []},
      declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
    const row: RawSimpleTypeProperties = {type: simple.id, targetNamespace: namespace, base: builtin('string'), final: [], variety: {kind: 'atomic'},
      facetComponentSet: [{annotation: 'absent', facets: [{name: 'enumeration', fixed: false, lexical: s.values[0].value!.lexical,
        operand: {context: 'active', type: local(source.id), owner: simple.id}}]}], provenance: {kind: 'hypothetical-abstract', originals: []}};
    const p = s.port(local(simple.id), local(simple.id), {nodes: [simple], simple: [row], types: [s.raw(source, mapped.view.content)]});
    const selected = createSchemaScalarKernel(p.context).describe(local(simple.id), p.declaration.id); assert.equal(selected.kind, 'checked');
    const property = checkDeclarationValueProperty(p.context, p.declaration.id); assert.equal(property.kind, 'checked');
    assert.equal(property.authority, 'XSD10-raw-simple-value-property-v1'); assert.equal(property.constraint?.operand.family, 'string');
    assert.ok(property.typeDependencies.some(item => item.contextId === p.context.contextId && item.type.kind === 'component' && item.type.id === simple.id));
    for (const debts of [selected.obligations, property.scalarObligations])
      assert.ok(debts.some(item => item.rule === 'raw-simple-content-derivation-validity' && item.component === source.id && (item.contextId ?? p.context.contextId) === p.context.contextId));
  });

  it('does not grant untouched SOURCE authority to a changed facade without a RAW row', async () => {
    const s = await seed(), changed = forkSemanticCandidate(s.parent, {key: 'changed-source', active: s.parent.members, additions: [], endpoint: {...s.complex('F'), abstract: true}});
    assert.equal(changed.kind, 'prepared'); assert.equal(changed.context.rawTypeProperties(id('F')), undefined);
    assert.equal(changed.context.originalComplexPropertySource(id('F')), undefined);
    const property = checkDeclarationValueProperty(changed.context, s.values[0].id); assert.equal(property.kind, 'checked');
    assert.equal(property.authority, 'XSD10-declaration-properties-v1');
    assert.ok(property.typeDependencies.some(item => item.contextId === changed.context.contextId && item.type.kind === 'component' && item.type.id === id('F')));
  });

  it('requires authentic SOURCE binding even for an actual context with the same original graph', async () => {
    const s = await seed(); assert.ok(s.actual.originalComplexContentSource(id('F')));
    const source = checkDeclarationValueProperty(s.actual, s.values[0].id); assert.equal(source.kind, 'checked');
    assert.equal(source.authority, 'XSD10-source-simple-value-property-v1');
    const retained = prepareSemanticRequest(resolveCanonicalGraph(s.request.graph)); assert.equal(retained.kind, 'prepared');
    const actual = retained.request.actual; assert.equal(actual.kind, 'actual'); assert.ok(actual.sourceNode(id('F')));
    assert.equal(actual.originalComplexContentSource(id('F')), undefined); assert.equal(actual.originalComplexPropertySource(id('F')), undefined);
    const property = checkDeclarationValueProperty(actual, s.values[0].id), full = checkDeclaration(actual, s.values[0].id);
    assert.deepEqual(property, full);
    if (property.kind === 'checked') assert.equal(property.authority, 'XSD10-declaration-properties-v1');
  });
});
