import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../src/loader/schemaInput.js';
import {buildCanonicalGraph} from '../../src/compiler/buildCanonicalGraph.js';
import {resolveCanonicalGraph} from '../../src/compiler/resolveCanonicalGraph.js';
import {globalId, scopedId} from '../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, ParticleNode, Reference, SimpleTypeNode} from '../../src/compiler/canonicalGraph.js';
import {prepareSemanticRequest} from '../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../src/compiler/semanticBudget.js';
import {compareComponentProperties} from '../../src/compiler/schemaComponentEquality.js';
import type {RawComplexTypeProperties} from '../../src/compiler/re01TypeProperties.js';

// Independent recursive equality scope and discriminators precede these tests:
// https://github.com/TechSpokes/typescript-wsdl-client/issues/270#issuecomment-6112352726
const fixtures = path.resolve('test/conformance/fixtures');
const namespace = 'urn:recovery:component-equality';
const named = (local: string) => globalId('type', {namespace, local});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
async function setup() {
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/component-equality-independent.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error('Expected actual source context');
  const request = prepared.request;
  const get = (id: string): GraphNode => {
    const found = request.actual.lookup(id);
    if (found.kind !== 'found') throw new Error('Expected actual component');
    return found.node;
  };
  const owner = get(named('Owner'));
  if (owner.kind !== 'complexType' || !owner.content) throw new Error('Expected owner content');
  const root = get(owner.content);
  if (root.kind !== 'particle' || root.term.kind !== 'sequence') throw new Error('Expected owner sequence');
  const anonymous = root.term.children.map(id => {
    const particle = get(id);
    if (particle.kind !== 'particle' || particle.term.kind !== 'element') throw new Error('Expected local element');
    const element = request.actual.resolve(particle.term.declaration);
    if (element.kind !== 'found' || element.node.kind !== 'element') throw new Error('Expected declaration');
    const type = request.actual.resolve(element.node.type);
    if (type.kind !== 'found' || type.node.kind !== 'complexType') throw new Error('Expected anonymous complex type');
    return type.node;
  });
  return {request, get, owner, root, anonymous};
}

describe('independent sufficient recursive component-property equality', () => {

  it('recognizes the same inherited implicit scalar definition without merging distinct restriction constructions', async () => {
    // Oracle precedes the narrow fix: #270 comment 6112779337; no-identity's
    // same-by-construction case establishes equality, not component validity.
    const ns = 'urn:recovery:inherited-scalar-equality';
    const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/inherited-scalar-equality-independent.xsd'), {policy: {fileRoots: [fixtures]}});
    const prepared = prepareSemanticRequest(resolveCanonicalGraph(buildCanonicalGraph(input)), {budget: createSemanticBudget({maxWork: 100_000_000})});
    if (prepared.kind !== 'prepared') throw new Error('Expected source request');
    const request = prepared.request;
    const owner = request.actual.lookup(globalId('type', {namespace: ns, local: 'Owner'}));
    if (owner.kind !== 'found' || owner.node.kind !== 'complexType' || !owner.node.content) throw new Error('Expected fixture owner');
    const sequence = request.actual.lookup(owner.node.content);
    if (sequence.kind !== 'found' || sequence.node.kind !== 'particle' || sequence.node.term.kind !== 'sequence') throw new Error('Expected fixture sequence');
    const types = new Map<string, ComplexTypeNode>();
    for (const id of sequence.node.term.children) {
      const particle = request.actual.lookup(id);
      if (particle.kind !== 'found' || particle.node.kind !== 'particle' || particle.node.term.kind !== 'element') throw new Error('Expected fixture element particle');
      const element = request.actual.resolve(particle.node.term.declaration);
      if (element.kind !== 'found' || element.node.kind !== 'element') throw new Error('Expected fixture declaration');
      const type = request.actual.resolve(element.node.type);
      if (type.kind !== 'found' || type.node.kind !== 'complexType') throw new Error('Expected anonymous source type');
      types.set(element.node.name.local, type.node);
    }
    const left = types.get('left')!, right = types.get('right')!;
    expect(left.id).not.toBe(right.id);
    const inherited = compareComponentProperties(request.actual, left, right);
    expect(inherited).toMatchObject({kind: 'checked', value: true, obligations: ['component-validity']});
    if (inherited.kind !== 'checked') throw new Error('Expected same inherited scalar identity');
    expect(inherited.dependencies).toEqual(expect.arrayContaining([left.id, right.id, globalId('type', {namespace: ns, local: 'R'})]));
    expect(compareComponentProperties(request.actual, left, types.get('changed')!)).toMatchObject({kind: 'checked', value: false});
    // GSC1 now supplies the selected complete generated metadata; distinct
    // restriction identities remain distinct but their properties can agree.
    expect(compareComponentProperties(request.actual, types.get('r1')!, types.get('r2')!)).toMatchObject({kind: 'checked', value: true,
      obligations: expect.arrayContaining(['component-validity'])});
    // Unequal scalar facet properties still disprove complete equality.
    expect(compareComponentProperties(request.actual, types.get('r1')!, types.get('r3')!)).toMatchObject({kind: 'checked', value: false});
    expect(compareComponentProperties(request.actual, types.get('mixedLeft')!, types.get('mixedRight')!)).toMatchObject({
      kind: 'checked', value: true, obligations: ['component-validity'],
      scalarObligations: [{rule: 'simple-content-base-mixed-emptiable', component: globalId('type', {namespace: ns, local: 'Mixed'})}],
    });
    expect(() => compareComponentProperties(request.actual, {...left}, right)).toThrow(/Unauthenticated/);
    request.budget.guard(() => request.budget.chargeWork(100_000_000));
    expect(compareComponentProperties(request.actual, left, right)).toBe(request.budget.failure());
  });

  it('ignores annotations and AU order while retaining named types, exact AU types and local scopes', async () => {
    const {request, anonymous, get} = await setup();
    expect(compareComponentProperties(request.actual, anonymous[0], anonymous[1])).toMatchObject({kind: 'checked', value: true,
      authority: 'XSD10-component-properties-v1', obligations: expect.arrayContaining(['component-validity'])});
    expect(compareComponentProperties(request.actual, anonymous[0], anonymous[2])).toMatchObject({kind: 'checked', value: false});
    expect(compareComponentProperties(request.actual, get(named('NamedA')), get(named('NamedB')))).toMatchObject({kind: 'checked', value: false});
  });

  it.each([['+001', true], ['2', false]] as const)('compares anonymous scalar facet operand %s by exact value', async (literal, equal) => {
    const {request, owner, get} = await setup(), template = get(named('ScalarTemplate'));
    if (template.kind !== 'simpleType') throw new Error('Expected scalar template');
    const ids = ['left', 'right'].map(side => scopedId(owner.id, '/scalar/' + side, 'simpleType'));
    const additions: SimpleTypeNode[] = ids.map((id, index) => ({...template, id,
      identity: {kind: 'scoped', owner: owner.id, path: '/scalar/' + (index === 0 ? 'left' : 'right'), role: 'simpleType'},
      variety: {kind: 'restriction', base: builtin('int'), facets: []}}));
    const candidate = request.candidate({key: 'scalar-properties', active: [...request.actual.members, ...ids], additions,
      rawSimpleTypes: ids.map((id, index) => ({type: id, targetNamespace: namespace, base: builtin('int'), final: [],
        // Complete effective int properties from the reviewed Appendix A map;
        // the tested local lower bound replaces int's inherited lower bound.
        variety: {kind: 'atomic'}, facetLayers: [{facets: [
          {name: 'minInclusive', fixed: false, lexical: {value: index === 0 ? '01' : literal, context: template.context}},
          {name: 'maxInclusive', fixed: false, lexical: {value: '2147483647', context: template.context}},
          {name: 'fractionDigits', fixed: true, lexical: {value: '0', context: template.context}},
          {name: 'pattern', fixed: false, lexical: {value: String.raw`[\-+]?[0-9]+`, context: template.context}},
        ]}], provenance: {kind: 'hypothetical-abstract', originals: []}}))});
    if (candidate.kind !== 'prepared') throw new Error('Expected represented scalar properties');
    const a = candidate.context.lookup(ids[0]), b = candidate.context.lookup(ids[1]);
    if (a.kind !== 'found' || b.kind !== 'found') throw new Error('Expected active anonymous scalars');
    expect(compareComponentProperties(candidate.context, a.node, b.node)).toMatchObject({kind: 'checked', value: equal,
      obligations: expect.arrayContaining(['component-validity'])});
  });

  it.each(['same', 'changed-fixed', 'changed-nillable', 'changed-sharing', 'missing-namespace'] as const)
    ('checks paired recursive graphs with %s and never promotes equality to validity', async variant => {
      const {request, owner, root, anonymous} = await setup();
      const sourceType = anonymous[0];
      if (!sourceType.content) throw new Error('Expected source anonymous content');
      const sourceRoot = request.actual.lookup(sourceType.content);
      if (sourceRoot.kind !== 'found' || sourceRoot.node.kind !== 'particle' || sourceRoot.node.term.kind !== 'sequence') throw new Error('Expected source sequence');
      const sourceLeaf = request.actual.lookup(sourceRoot.node.term.children[0]);
      if (sourceLeaf.kind !== 'found' || sourceLeaf.node.kind !== 'particle' || sourceLeaf.node.term.kind !== 'element') throw new Error('Expected leaf particle');
      const sourceElement = request.actual.resolve(sourceLeaf.node.term.declaration);
      if (sourceElement.kind !== 'found' || sourceElement.node.kind !== 'element') throw new Error('Expected source element');
      const additions: GraphNode[] = [], rawTypes: RawComplexTypeProperties[] = [], rawElements: {element: string; final: []; block: []}[] = [];
      const ids: string[] = [];
      for (const side of ['left', 'right'] as const) {
        const typeId = scopedId(owner.id, `/recursive/${side}`, 'complexType'), seqId = scopedId(typeId, '/sequence', 'particle');
        ids.push(typeId);
        const members: string[] = [];
        const declarationIds = new Map<string, string>();
        for (const role of ['marker', 'alias', 'next'] as const) {
          const shared = variant === 'changed-sharing' && side === 'left' && role === 'alias';
          const elementId = shared ? declarationIds.get('marker')! : scopedId(typeId, '/' + role, 'element');
          declarationIds.set(role, elementId);
          const particleId = scopedId(typeId, '/' + role, 'particle'); members.push(particleId);
          const next = role === 'next';
          if (!shared) {
            const element: ElementNode = {...sourceElement.node, id: elementId,
              identity: {kind: 'scoped', owner: typeId, path: '/' + role, role: 'element'},
              name: {namespace: '', local: next ? 'next' : 'marker'},
              nillable: variant === 'changed-nillable' && side === 'right' && next,
              type: next ? {kind: 'local', target: typeId} : builtin('int'),
              ...(!next ? {value: {kind: 'fixed' as const, lexical: {value: side === 'right' ? variant === 'changed-fixed' ? '2' : '+001' : '01', context: sourceElement.node.context}}} : {})};
            additions.push(element); rawElements.push({element: elementId, final: [], block: []});
          }
          const particle: ParticleNode = {...sourceLeaf.node, id: particleId,
            identity: {kind: 'scoped', owner: typeId, path: '/' + role, role: 'particle'},
            term: {kind: 'element', declaration: {kind: 'local', target: elementId}}};
          additions.push(particle);
        }
        const sequence: ParticleNode = {...root, id: seqId, identity: {kind: 'scoped', owner: typeId, path: '/sequence', role: 'particle'},
          term: {kind: 'sequence', children: members}};
        const type: ComplexTypeNode = {...sourceType, id: typeId, identity: {kind: 'scoped', owner: owner.id, path: `/recursive/${side}`, role: 'complexType'},
          content: seqId, attributes: []};
        additions.push(sequence, type);
        rawTypes.push({type: typeId, ...(variant === 'missing-namespace' && side === 'right' ? {} : {targetNamespace: namespace}),
          derivation: {method: 'restriction', base: builtin('anyType')}, abstract: false, final: [], block: [],
          content: {kind: 'element-only', particle: seqId}, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
      }
      const candidate = request.candidate({key: variant, active: [...request.actual.members, ...additions.map(node => node.id)], additions, rawTypes, rawElements});
      if (candidate.kind !== 'prepared') throw new Error(`Expected paired recursive property graph: ${JSON.stringify(candidate)}`);
      const a = candidate.context.lookup(ids[0]), b = candidate.context.lookup(ids[1]);
      if (a.kind !== 'found' || b.kind !== 'found') throw new Error('Expected active anonymous types');
      const result = compareComponentProperties(candidate.context, a.node, b.node);
      // Recursive all-property equality compares labelled component properties,
      // not backing-store alias topology; endpoint mapping is separately strict.
      if (variant === 'missing-namespace') expect(result).toMatchObject({kind: 'unresolved', rule: 'component-type-target-namespace'});
      else expect(result).toMatchObject({kind: 'checked', value: variant === 'same' || variant === 'changed-sharing', obligations: expect.arrayContaining(['component-validity'])});
      if (variant === 'same') {
        expect(() => compareComponentProperties(candidate.context, {...a.node}, b.node)).toThrow(/Unauthenticated/);
        expect(() => compareComponentProperties({...candidate.context}, a.node, b.node)).toThrow(/Unauthenticated/);
        let getterCalls = 0;
        const forged = {...a.node, get id() {getterCalls++; return a.node.id;}};
        expect(() => compareComponentProperties(candidate.context, forged, b.node)).toThrow(TypeError);
        expect(() => compareComponentProperties(candidate.context, a.node, forged)).toThrow(TypeError);
        expect(getterCalls).toBe(0);
        request.budget.guard(() => request.budget.chargeWork(100_000_000));
        expect(compareComponentProperties(candidate.context, a.node, b.node)).toBe(request.budget.failure());
      }
    });
});
