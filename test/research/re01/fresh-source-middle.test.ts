import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {loadSemanticSchemaInput} from '../../../src/loader/schemaInput.js';
import {prepareSourceSchemaRequest} from '../../../src/compiler/schemaDocumentSyntax.js';
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import {forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import {assertFiniteCandidateReceipt, verifyFiniteRe01Evidence, verifyDirectActualSchema} from '../../../src/compiler/finiteRe01Verification.js';
import {checkCandidateCorrespondence} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {prepareFreshMiddleAssignments, prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';
import {buildRe01Evidence} from './evidence-builder.js';

const directory = path.resolve('test/conformance/fixtures/xsd/recovery');
async function source(variant: 'empty' | 'simple' | 'particle') {
  const input = await loadSemanticSchemaInput(path.join(directory, `fresh-source-middle-${variant}.xsd`), {policy: {fileRoots: [directory]}});
  const prepared = prepareSourceSchemaRequest(input);
  if (prepared.kind !== 'prepared') throw new Error(prepared.kind);
  const actual = prepared.request.actual;
  const target = globalId('type', {namespace: `urn:fresh-source-middle:${variant}`, local: 'D'});
  return {actual, target};
}

describe('finite source-derived fresh middles', () => {
  it.each(['empty', 'simple', 'particle'] as const)('supplies a complete native finite witness for the %s ancestor fixture', async variant => {
    const {actual, target} = await source(variant);
    const prepared = prepareFreshMiddleAssignments(actual, actual, target);
    if (prepared.kind !== 'prepared-fresh-assignments') throw new Error(JSON.stringify(prepared));
    expect(prepared.universalCoverage).toBe(false);
    expect(prepared.assignments).toHaveLength(1);
    const assignment = prepared.assignments[0]!;
    const replay = replaySharedAssignment(assignment);
    if (replay.kind !== 'prepared-local-evidence') throw new Error(JSON.stringify(replay));
    const proof = verifyFiniteRe01Evidence(actual, target, {root: replay.evidence.id, nodes: [replay.evidence]});
    expect(proof.kind, 'rule' in proof ? proof.rule : proof.kind).toBe('checked-candidate');
    if (proof.kind === 'checked-candidate') {
      expect(() => assertFiniteCandidateReceipt(actual, proof)).not.toThrow();
      expect(proof.claims).toMatchObject({actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false, completeNegativeAnswer: false});
    }
    expect(() => replaySharedAssignment({...assignment})).toThrow(TypeError);
    expect(verifyDirectActualSchema(actual)).toMatchObject({kind: 'inconclusive-direct', unresolved: [target]});
    const automatic = buildRe01Evidence(actual, target);
    expect(automatic.kind, 'rule' in automatic ? automatic.rule : automatic.kind).toBe('checked-witness');
    if (automatic.kind === 'checked-witness') expect(automatic.claims).toEqual({universalCoverage: false, completeNegativeAnswer: false, otherCandidatesExhausted: false});
  });

  it('does not reuse a too-narrow retained middle or rescue a supplied middle with missing attributes', async () => {
    const {actual, target} = await source('empty');
    const inherited = prepareInheritedMiddleAssignments(actual, actual, target);
    if (inherited.kind !== 'prepared-inherited-assignments') throw new Error(JSON.stringify(inherited));
    expect(inherited.assignments).toHaveLength(1);
    const old = replaySharedAssignment(inherited.assignments[0]!);
    if (old.kind !== 'prepared-local-evidence') throw new Error(JSON.stringify(old));
    expect(verifyFiniteRe01Evidence(actual, target, {root: old.evidence.id, nodes: [old.evidence]}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.2.2', component: target});
    const prepared = prepareFreshMiddleAssignments(actual, actual, target);
    if (prepared.kind !== 'prepared-fresh-assignments') throw new Error(prepared.kind);
    const assignment = prepared.assignments[0]!;
    const uses = assessSourceAttributeUses(actual, target);
    if (uses.kind !== 'checked') throw new Error(uses.kind);
    const advance = uses.value.uses.find(use => use.declaration.name.local === 'advance');
    if (!advance) throw new Error('Missing independently specified attribute');
    const candidate = forkSemanticCandidate(actual, {...assignment.delta, key: 'missing-advance',
      rawTypes: assignment.delta.rawTypes!.map(row => row.type === assignment.intermediate ? {...row, attributeUses: row.attributeUses.filter(id => id !== advance.id)} : row)});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    const evidence = {id: 'broken', parent: actual, context: candidate.context, target, intermediate: assignment.intermediate, ancestor: assignment.ancestor, premises: []};
    expect(verifyFiniteRe01Evidence(actual, target, {root: evidence.id, nodes: [evidence]}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'derivation-ok-restriction.2.2', component: target});
  });

  it('keeps native extension-prefix checks authoritative for a particle ancestor', async () => {
    const {actual, target} = await source('particle');
    const prepared = prepareFreshMiddleAssignments(actual, actual, target);
    if (prepared.kind !== 'prepared-fresh-assignments') throw new Error(prepared.kind);
    const assignment = prepared.assignments[0]!;
    const b = actual.lookup(globalId('type', {namespace: 'urn:fresh-source-middle:particle', local: 'B'}));
    if (b.kind !== 'found' || b.node.kind !== 'complexType' || !b.node.content) throw new Error('Missing independent local second-element contribution');
    const localParticle = b.node.content;
    const candidate = forkSemanticCandidate(actual, {...assignment.delta, key: 'lost-prefix', rawTypes: assignment.delta.rawTypes!.map(row =>
      row.type === assignment.intermediate ? {...row, content: {kind: 'element-only' as const, particle: localParticle}} : row)});
    if (candidate.kind !== 'prepared') throw new Error(JSON.stringify(candidate));
    const correspondence = checkCandidateCorrespondence(actual, actual, candidate.context, target, assignment.intermediate, assignment.ancestor);
    if (correspondence.kind !== 'checked') throw new Error('rule' in correspondence ? correspondence.rule : correspondence.kind);
    expect(checkComponentConstruction(candidate.context, assignment.intermediate, {correspondence}))
      .toMatchObject({kind: 'candidate-rejected', rule: 'cos-particle-extend'});
  });

  it('rejects foreign requests and keeps explicit exhaustion sticky without partial assignments', async () => {
    const {actual, target} = await source('empty');
    const other = await source('empty');
    expect(() => prepareFreshMiddleAssignments(actual, other.actual, target)).toThrow(TypeError);
    actual.budget.guard(() => actual.budget.chargeWork(Number.MAX_SAFE_INTEGER));
    expect(prepareFreshMiddleAssignments(actual, actual, target)).toBe(actual.budget.failure());
  });
});
