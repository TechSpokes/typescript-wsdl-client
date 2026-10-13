import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import type {SourceSchemaPreparation} from '../../../src/compiler/schemaDocumentSyntax.js';
import type {CandidatePreparation, SemanticContext, SemanticRequest} from '../../../src/compiler/semanticContext.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import type {ResolverLimits, ResolverUsage} from '../../../src/compiler/semanticBudget.js';
import {proveRe01FreshAffiliationObstruction} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {Re01FreshAffiliationResult} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:parent-observation';
const type = (local: string) => globalId('type', {namespace, local});
const element = (local: string) => globalId('element', {namespace, local});
const local = (target: string): Reference => ({kind: 'local', target});
const builtin = (name: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: name}});
type Variation = 'obstructed' | 'blocked-abstract' | 'ancestor-head' | 'existing-middle' | 'identity' | 'primitive'
  | 'simple-head' | 'union-head' | 'original-member' | 'subset';
type TestRun = {request?: SemanticRequest; parent?: SemanticContext; target?: string; usage: ResolverUsage;
  result: Re01FreshAffiliationResult | Exclude<SourceSchemaPreparation | CandidatePreparation, {kind: 'prepared'}>};

async function subject(variation: Variation = 'obstructed', limits?: ResolverLimits): Promise<TestRun> {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/finite-proof-parent-observation.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const budget = createSemanticBudget(limits);
  const prepared = prepareSourceSchemaRequest(input, {budget});
  if (prepared.kind !== 'prepared') return {result: prepared, usage: budget.usage()};
  const request = prepared.request;
  const built = budget.guard<TestRun>(() => {
  const found = request.actual.lookup(type('A'));
  if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error('Expected A');
  const a = found.node;
  const helper = (name: string, base: Reference): ComplexTypeNode => ({...a, id: type(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}},
    derivation: {kind: 'extension', contentKind: 'complex', base, facets: []}});
  const f = helper('F', local(type(variation === 'primitive' ? 'A' : 'R'))), e = helper('E', local(a.id));
  const declaration = (name: string, reference: Reference, head?: Reference): ElementNode => ({
    kind: 'element', id: element(name), identity: {kind: 'global', role: 'element', name: {namespace, local: name}},
    name: {namespace, local: name}, context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type: reference, nillable: false, abstract: false, substitutionGroup: head,
  });
  const headType = variation === 'ancestor-head' ? 'A' : variation === 'existing-middle' ? 'E'
    : variation === 'identity' ? 'F' : variation === 'union-head' ? 'U' : 'R';
  const head = declaration('K', variation === 'simple-head' ? builtin('string') : local(type(headType)));
  const member = {...declaration('M', local(f.id), local(head.id)), abstract: variation === 'blocked-abstract'};
  const additions = variation === 'original-member' ? [f, e] : [f, e, head, member];
  const raw = (node: ComplexTypeNode): RawComplexTypeProperties => ({type: node.id, targetNamespace: namespace,
    derivation: {method: 'extension', base: node.derivation!.base}, content: {kind: 'empty'}, abstract: false,
    final: [], block: [], attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}});
  const active = [...request.actual.members.filter(id => variation !== 'subset' || id !== type('S')), ...additions.map(x => x.id)];
  const parent = request.candidate({key: variation, active, additions, rawTypes: [raw(f), raw(e)],
    rawElements: variation === 'original-member' ? [] : [head, member].map(x => ({element: x.id, final: [],
      block: variation === 'blocked-abstract' ? ['substitution'] as const : []})),
  });
  if (parent.kind !== 'prepared') return {result: parent, usage: request.budget.usage()};
  // Original AnchorMember:D -> AnchorHead:R is available but not necessarily
  // a hypothetical legality root. It must not force this contextual negative.
  const target = variation === 'original-member' ? type('D') : f.id;
  const result = proveRe01FreshAffiliationObstruction(request.actual, parent.context, target);
  return {request, parent: parent.context, target, result, usage: request.budget.usage()};
  });
  return 'kind' in built ? {result: built, usage: budget.usage()} : built;
}

describe('reviewed mandatory fresh affiliation ancestry obstruction', () => {
  // Dated cos-ct-derived-ok: X -> E -> A can reach complex B only if B=X,
  // B=E, or B lies on A's immutable base chain. e-props-correct.4 is required
  // even for a fresh unused/abstract/blocked declaration in every child.
  it.each(['obstructed', 'blocked-abstract'] as const)('proves the exact contextual obstruction for %s', async variation => {
    const {parent, target, result} = await subject(variation);
    expect(result).toMatchObject({kind: 'proved-no-construction', domain: 'RE01-derivation-B-v1',
      scope: 'contextual-nonprimitive-two-step', criterion: 'mandatory-fresh-affiliate-fixed-complex-ancestry',
      contextId: parent?.contextId, target, ancestor: {target: type('A')}, affiliate: element('M'), head: element('K'), headType: type('R')});
  });

  it.each(['ancestor-head', 'existing-middle', 'identity', 'primitive', 'simple-head', 'union-head', 'original-member'] as const)
    ('does not establish a negative for %s', async variation => {
      expect((await subject(variation)).result).toMatchObject({kind: 'not-established'});
    });

  it('requires the complete domain and authenticated same-request contexts', async () => {
    expect((await subject('subset')).result).toMatchObject({kind: 'unresolved', rule: 'complete-domain-membership'});
    const current = await subject(), other = await subject();
    if (!current.request || !current.parent || !current.target || !other.parent) throw new Error('Expected contexts');
    const {request, parent, target} = current, foreign = other.parent;
    expect(() => proveRe01FreshAffiliationObstruction(request.actual, {...parent}, target)).toThrow();
    expect(() => proveRe01FreshAffiliationObstruction(request.actual, foreign, target)).toThrow();
  });

  it('precharges proof publication at inclusive limits and retains sticky exhaustion', async () => {
    const complete = await subject();
    expect(complete.result.kind).toBe('proved-no-construction');
    const exact = await subject('obstructed', {maxNodes: complete.usage.nodes, maxWork: complete.usage.work});
    expect(exact.result.kind).toBe('proved-no-construction');
    for (const limits of [{maxNodes: complete.usage.nodes, maxWork: complete.usage.work - 1},
      {maxNodes: complete.usage.nodes - 1, maxWork: complete.usage.work}]) {
      const limited = await subject('obstructed', limits);
      expect(limited.result.kind).toBe('resource-limit');
      if (limited.request && limited.parent && limited.target) {
        expect(proveRe01FreshAffiliationObstruction(limited.request.actual, limited.parent, limited.target)).toBe(limited.result);
      }
    }
  });
});
