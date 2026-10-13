import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId, scopedId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, ParticleNode, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import {checkParticleRestriction} from '../../../src/compiler/particleRestriction.js';
import {checkTypeDerivation} from '../../../src/compiler/schemaTypeRelations.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:fresh-name-type';
const type = (local: string) => globalId('type', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
type Options = Readonly<{simpleContent?: boolean; existingE?: boolean; missingProperties?: boolean}>;
const maxWork = 5_000_000;

async function subject(options: Options = {}) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/fresh-complex-name-type.xsd'), {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork})});
  if (prepared.kind !== 'prepared') throw new Error(JSON.stringify(prepared));
  const request = prepared.request;
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(type(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const a = get('A'), x = get(options.simpleContent ? 'SX' : 'X');
  const ancestor = options.simpleContent ? builtin('anySimpleType') : local(a.id);
  const helper = (name: string, base: Reference): ComplexTypeNode => ({...a, id: type(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: options.simpleContent ? 'simple' : 'complex', base, facets: []}});
  const e = options.existingE ? get('ExistingE') : helper('E', ancestor);
  const u = helper('U', options.simpleContent ? local(get('S').id) : local(get('R').id));
  const raw = (node: ComplexTypeNode, base: Reference, method: 'extension' | 'restriction', content: RawComplexContent): RawComplexTypeProperties => ({
    type: node.id, targetNamespace: namespace, derivation: {base, method}, content, abstract: false, final: [], block: [],
    attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: node.id === x.id || options.existingE && node.id === e.id ? [node.id] : []},
  });
  const union: SimpleTypeNode = {...a, kind: 'simpleType', id: type('Union'),
    identity: {kind: 'global', role: 'type', name: {namespace, local: 'Union'}},
    variety: {kind: 'union', members: [builtin('string'), builtin('int')]}};
  // Each comparison has distinct local declarations/particles, equal p QName,
  // 0..1 bounds and empty flags. No global or original-particle shortcut applies.
  const operands = ['X', 'RestrictedX', 'ExtendedX', 'R', 'SX', 'E', 'U', 'ExistingE', 'string', 'Union'] as const;
  const additions: (ComplexTypeNode | SimpleTypeNode | ElementNode | ParticleNode)[] = [u, union];
  if (!options.existingE) additions.push(e);
  const particles = new Map<string, string>();
  for (const operand of operands) {
    const declarationId = scopedId(e.id, '/compare/' + operand, 'element');
    const declaration: ElementNode = {kind: 'element', id: declarationId,
      identity: {kind: 'scoped', owner: e.id, path: '/compare/' + operand, role: 'element'},
      name: {namespace, local: 'p'}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      type: operand === 'string' ? builtin('string') : operand === 'E' ? local(e.id) : local(type(operand)),
      nillable: false, abstract: false};
    const particleId = scopedId(e.id, '/compare/' + operand, 'particle');
    additions.push(declaration, {kind: 'particle', id: particleId,
      identity: {kind: 'scoped', owner: e.id, path: '/compare/' + operand, role: 'particle'},
      context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      occurs: {min: '0', max: '1'}, term: {kind: 'element', declaration: local(declarationId)}});
    particles.set(operand, particleId);
  }
  // Separate raw content hosts exercise the actual particle owner without
  // changing any existing declaration or the endpoint's original particle.
  const hosts = operands.map(operand => helper('View' + operand, local(a.id)));
  additions.push(...hosts);
  const endpointContent: RawComplexContent = options.simpleContent ? {kind: 'simple', type: builtin('string')}
    : {kind: 'element-only', particle: x.content!};
  const eContent: RawComplexContent = options.simpleContent ? {kind: 'simple', type: builtin('anySimpleType')}
    : {kind: 'element-only', particle: options.existingE ? e.content! : particles.get('E')!};
  const candidate = request.candidate({key: 'fresh-name-type', active: [...request.actual.members, ...additions.map(node => node.id)],
    additions, endpoint: {...x, derivation: {kind: 'restriction', contentKind: options.simpleContent ? 'simple' : 'complex', base: local(e.id), facets: []}},
    rawTypes: [raw(x, local(e.id), 'restriction', endpointContent), raw(e, ancestor, 'extension', eContent),
      ...(options.missingProperties ? [] : [raw(u, u.derivation!.base, 'extension', options.simpleContent
        ? {kind: 'simple', type: builtin('string')} : {kind: 'empty'})]),
      ...hosts.map((host, index) => raw(host, local(a.id), 'extension', {kind: 'element-only', particle: particles.get(operands[index])!}))],
    rawElements: additions.filter((node): node is ElementNode => node.kind === 'element').map(node => ({element: node.id, final: [], block: []})),
    rawSimpleTypes: [{type: union.id, targetNamespace: namespace, final: [],
      variety: {kind: 'union', members: [builtin('string'), builtin('int')]}, base: builtin('anySimpleType'), facetComponentSet: [],
      provenance: {kind: 'hypothetical-abstract', originals: []}}],
  });
  if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
  const context = candidate.context;
  const correspondence = checkCandidateCorrespondence(request.actual, request.actual, context, x.id, e.id, ancestor);
  expect(correspondence, JSON.stringify(correspondence)).toMatchObject({kind: 'checked'});
  return {request, context, x, e, u};
}

function view(context: SemanticContext, name: string) {
  const content = deriveRawComplexContent(context, type('View' + name));
  if (content.kind !== 'checked') throw new Error(JSON.stringify(content));
  const prepared = prepareSemanticParticleView(context, content.view, 'restriction');
  if (prepared.kind !== 'checked') throw new Error(JSON.stringify(prepared));
  return prepared.view;
}

describe('fresh complex type necessary condition at NameAndTypeOK', () => {
  // Independently reviewed dated cos-ct-derived-ok and NameAndTypeOK reasoning:
  // X -> E -> A is the only new identity on an existing complex base path.
  // E is necessary, not sufficient: every preceding method must be restriction.
  it.each([
    ['X', 'E', true], ['RestrictedX', 'E', true], ['ExtendedX', 'E', false],
    ['X', 'U', false], ['RestrictedX', 'U', false], ['R', 'E', false], ['X', 'X', true],
  ] as const)('compares local p:%s to distinct local p:%s as %s', async (derived, base, expected) => {
    const {context} = await subject();
    const result = checkParticleRestriction(context, view(context, derived), view(context, base));
    expect(result, JSON.stringify(result)).toMatchObject({kind: 'checked', value: expected});
    if (result.kind === 'checked') expect(result.typeDependencies.some(dependency => dependency.contextId !== context.contextId)).toBe(false);
  });

  it('keeps existing intermediate and exact identity outside the freshness premise', async () => {
    const {context, e} = await subject({existingE: true});
    expect(e.id).toBe(type('ExistingE'));
    expect(checkParticleRestriction(context, view(context, 'X'), view(context, 'E'))).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(context, view(context, 'X'), view(context, 'U'))).toMatchObject({kind: 'checked', value: false});
  });

  it('uses complex simple-content base identities rather than equal scalar content', async () => {
    const {context} = await subject({simpleContent: true});
    expect(checkParticleRestriction(context, view(context, 'SX'), view(context, 'E'))).toMatchObject({kind: 'checked', value: true});
    expect(checkParticleRestriction(context, view(context, 'SX'), view(context, 'U'))).toMatchObject({kind: 'checked', value: false});
  });

  it('allows a new simple union target outside the complex-type lemma', async () => {
    const {context} = await subject();
    expect(checkParticleRestriction(context, view(context, 'string'), view(context, 'Union'))).toMatchObject({kind: 'checked', value: true});
  });

  it('does not infer the type-call condition from a particle-identity shortcut', async () => {
    const {context} = await subject();
    const particle = view(context, 'ExtendedX');
    expect(checkTypeDerivation(context, local(type('ExtendedX')), local(type('E')), ['extension', 'list', 'union']))
      .toMatchObject({kind: 'checked', value: false});
    expect(checkParticleRestriction(context, particle, particle)).toMatchObject({kind: 'checked', value: true});
  });

  it('returns missing qualification and sticky exhaustion separately from false', async () => {
    const {request, context} = await subject({missingProperties: true});
    expect(checkParticleRestriction(context, view(context, 'X'), view(context, 'U')))
      .toMatchObject({kind: 'unresolved', rule: 'missing-type-component-properties'});
    const derived = view(context, 'X'), base = view(context, 'E');
    request.budget.guard(() => request.budget.chargeWork(maxWork));
    expect(checkParticleRestriction(context, derived, base)).toBe(request.budget.failure());
  });
});
