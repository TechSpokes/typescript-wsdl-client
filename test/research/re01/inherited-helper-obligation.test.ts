import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {loadSchemaInput} from '../../../src/loader/schemaInput.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {createSemanticBudget} from '../../../src/compiler/semanticBudget.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {proveRe01FreshAffiliationObstruction, re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {FiniteRe01Evidence, FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';

const namespace = 'urn:recovery:finite-proof';
const named = (name: string) => globalId('type', {namespace, local: name});
const builtin = (local: string): Reference => ({kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local}});
const local = (target: string): Reference => ({kind: 'local', target});

async function subject(headType: 'B' | 'anySimpleType' = 'B', padding: readonly string[] = []) {
  const fixtures = path.resolve('test/conformance/fixtures');
  const input = await loadSchemaInput(path.join(fixtures, 'xsd/recovery/finite-proof-independent.xsd'),
    {policy: {fileRoots: [fixtures]}});
  const prepared = prepareSourceSchemaRequest(input, {budget: createSemanticBudget({maxWork: 100_000_000})});
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const request = prepared.request;
  const get = (name: string): ComplexTypeNode => {
    const found = request.actual.lookup(named(name));
    if (found.kind !== 'found' || found.node.kind !== 'complexType') throw new Error(name);
    return found.node;
  };
  const b = get('B'), d = get('D');
  const helper = (name: string, base: Reference): ComplexTypeNode => ({...b, id: named(name),
    identity: {kind: 'global', role: 'type', name: {namespace, local: name}}, attributes: [],
    derivation: {kind: 'extension', contentKind: 'simple', base, facets: []}});
  const properties = (type: string, base: Reference, method: 'extension' | 'restriction', scalar: Reference): RawComplexTypeProperties => ({
    type, derivation: {base, method}, abstract: false, final: [], block: [], content: {kind: 'simple', type: scalar},
    attributeUses: b.attributes, provenance: {kind: 'hypothetical-abstract', originals: type === b.id || type === d.id ? [type] : []},
  });
  const e = helper('E', builtin('anySimpleType')), f = helper('F', local(b.id));
  const element = (name: string, type: Reference, head?: Reference): ElementNode => ({
    kind: 'element', id: globalId('element', {namespace, local: name}),
    identity: {kind: 'global', role: 'element', name: {namespace, local: name}}, name: {namespace, local: name},
    context: b.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
    type, nillable: false, abstract: false, substitutionGroup: head,
  });
  const h = element('H', headType === 'B' ? local(b.id) : builtin('anySimpleType'));
  const m = element('M', local(f.id), local(h.id));
  const additions = [e, f, h, m];
  const parent = request.candidate({key: 'inherited-affiliate', active: [...request.actual.members, ...additions.map(x => x.id)], additions,
    endpoint: {...d, derivation: {kind: 'restriction', contentKind: 'simple', base: local(e.id), facets: []}},
    rawTypes: [properties(b.id, builtin('string'), 'extension', builtin('string')),
      properties(e.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
      properties(d.id, local(e.id), 'restriction', builtin('string')), properties(f.id, local(b.id), 'extension', builtin('string'))],
    rawElements: [h, m].map(x => ({element: x.id, final: [], block: []})),
  });
  if (parent.kind !== 'prepared') throw new Error(JSON.stringify(parent));
  const e2 = helper('E2', builtin('anySimpleType'));
  const padded = padding.map(name => helper(name, local(b.id)));
  const childAdditions = [e2, ...padded];
  const child = forkSemanticCandidate(parent.context, {key: 'rebase-helper',
    active: [...parent.context.members, ...childAdditions.map(x => x.id)], additions: childAdditions,
    endpoint: {...f, derivation: {kind: 'restriction', contentKind: 'simple', base: local(e2.id), facets: []}},
    rawTypes: [properties(f.id, local(e2.id), 'restriction', builtin('string')),
      properties(e2.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType')),
      ...padded.map(x => properties(x.id, local(b.id), 'extension', builtin('string')))],
  });
  if (child.kind !== 'prepared') throw new Error(JSON.stringify(child));
  const nodes: FiniteRe01EvidenceNode[] = [];
  // Hand-specified finite continuation: every remaining string-content helper
  // is rebased once per branch, adding only a direct simple-base extension.
  // This builds subjects only; local authorities determine every verdict.
  const continuations = (context: SemanticContext, remaining: readonly ComplexTypeNode[], prefix: string): string[] => {
    const ids: string[] = [];
    for (let index = 0; index < remaining.length; index++) {
      const current = remaining[index]!, id = `${prefix}_${index}`, middle = helper(`E_${id}`, builtin('anySimpleType'));
      const next = forkSemanticCandidate(context, {key: id, active: [...context.members, middle.id], additions: [middle],
        endpoint: {...current, derivation: {kind: 'restriction', contentKind: 'simple', base: local(middle.id), facets: []}},
        rawTypes: [properties(current.id, local(middle.id), 'restriction', builtin('string')),
          properties(middle.id, builtin('anySimpleType'), 'extension', builtin('anySimpleType'))],
      });
      if (next.kind !== 'prepared') throw new Error(JSON.stringify(next));
      const premises = continuations(next.context, remaining.filter(x => x.id !== current.id), id);
      nodes.push({id, parent: context, context: next.context, target: current.id, intermediate: middle.id,
        ancestor: builtin('anySimpleType'), premises});
      ids.push(id);
    }
    return ids;
  };
  const childPremises = continuations(child.context, padded, 'padding');
  nodes.push(
    {id: 'root', parent: request.actual, context: parent.context, target: d.id, intermediate: e.id,
      ancestor: builtin('anySimpleType'), premises: ['child']},
    {id: 'child', parent: parent.context, context: child.context, target: f.id, intermediate: e2.id,
      ancestor: builtin('anySimpleType'), premises: childPremises},
  );
  const evidence: FiniteRe01Evidence = {root: 'root', nodes};
  return {request, parent: parent.context, child: child.context, target: d.id, helper: f.id, member: m.id, evidence};
}

describe('inherited fresh component obligations in nested RE01 evidence', () => {
  it('rechecks the inherited affiliate after rebasing its type', async () => {
    const {request, parent, child, target, helper, member, evidence} = await subject();
    // Independent ancestry: parent F -> B; child F -> E2 -> anySimpleType.
    // e-props-correct.4 requires M's type to derive from H's type B.
    expect(checkComponentConstruction(parent, member)).toMatchObject({kind: 'checked'});
    expect(checkComponentConstruction(child, member)).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
    // Universal obstruction premises, independent of E2's sampled properties:
    // every intermediate must extend anySimpleType directly, whereas anchored
    // B extends string. A fresh identity cannot replace B on F's ancestry.
    expect(re01Ancestor(parent, helper)).toMatchObject({kind: 'checked', ancestor: builtin('anySimpleType')});
    expect(parent.rawTypeProperties(named('B'))?.derivation).toEqual({method: 'extension', base: builtin('string')});
    expect(child.rawTypeProperties(named('B'))?.derivation).toEqual(parent.rawTypeProperties(named('B'))?.derivation);
    expect(proveRe01FreshAffiliationObstruction(request.actual, parent, helper)).toMatchObject({
      kind: 'proved-no-construction', scope: 'contextual-nonprimitive-two-step', target: helper, affiliate: member,
    });
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'candidate-rejected', rule: 'e-props-correct.4'});
  });

  it('accepts inherited fresh declarations when their exact child-context obligations hold', async () => {
    const {request, parent, child, target, member, evidence} = await subject('anySimpleType');
    // Both F -> B -> string -> anySimpleType and F -> E2 -> anySimpleType
    // reach H's immutable builtin type; no circular RE01 premise is needed.
    expect(checkComponentConstruction(parent, member)).toMatchObject({kind: 'checked'});
    expect(checkComponentConstruction(child, member)).toMatchObject({kind: 'checked'});
    expect(proveRe01FreshAffiliationObstruction(request.actual, parent, named('F'))).toMatchObject({kind: 'not-established'});
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'checked-candidate'});
    if (result.kind !== 'checked-candidate') throw new Error(result.kind);
    const childProof = result.proof.find(step => step.evidence === 'child');
    expect(childProof?.components).toEqual(expect.arrayContaining([
      expect.objectContaining({component: member, contextId: child.contextId}),
      expect.objectContaining({component: named('E'), contextId: child.contextId}),
    ]));
    expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });

  it('admits a successful padded step whose nonprimitive extension count increases', async () => {
    const {request, parent, child, target, helper, evidence} = await subject('anySimpleType', ['G1', 'G2']);
    // B has a simple base and no clause-1.5 debt. D is already a restriction.
    // In the parent only F has debt; in the child F is a restriction but G1
    // and G2 each extend complex B and therefore have separate RE01 debts.
    expect(checkComponentConstruction(parent, helper)).toMatchObject({kind: 'checked',
      re01: {target: helper, ancestor: builtin('anySimpleType'), primitive: false}});
    expect(checkComponentConstruction(child, helper)).toMatchObject({kind: 'checked', re01: undefined});
    for (const name of ['G1', 'G2']) expect(checkComponentConstruction(child, named(name))).toMatchObject({kind: 'checked',
      re01: {target: named(name), ancestor: builtin('anySimpleType'), primitive: false}});
    const result = verifyFiniteRe01Evidence(request.actual, target, evidence);
    expect(result).toMatchObject({kind: 'checked-candidate'});
    if (result.kind !== 'checked-candidate') throw new Error(result.kind);
    expect(result.proof).toHaveLength(6);
    expect(new Set(result.proof.map(step => step.contextId)).size).toBe(6);
    expect(result.claims).toMatchObject({universalCoverage: false, completeNegativeAnswer: false, searchTermination: false});
  });
});
