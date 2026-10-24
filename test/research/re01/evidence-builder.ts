/** Qualified automatic completion over repository-owned finite candidate grammars. */
import type {NodeId} from '../../../src/compiler/canonicalGraph.js';
import {assertSemanticContext, SemanticContextAccessError} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import {immediateTypeBase} from '../../../src/compiler/schemaTypeRelations.js';
import {re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {resolveSemanticType, semanticTypeKey} from '../../../src/compiler/schemaTypeIdentity.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';
import {prepareFiniteRe01Frontier, verifyFiniteRe01EvidenceWithFrontier} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteRe01Evidence, FiniteRe01PrimitiveEvidence, FiniteRe01EvidenceNode,
  FiniteRe01Hypothesis, FiniteRe01Frontier, FiniteVerificationFailure,
  FiniteCandidateReceipt, FinitePrimitiveReceipt} from '../../../src/compiler/finiteRe01Verification.js';
import {prepareInheritedMiddleAssignments, replaySharedAssignment} from './shared-assignment.js';
import {prepareAnchoredListAssignments} from './anchored-list-assignment.js';
import type {AnchoredListFailure} from './anchored-list-assignment.js';

export type EvidenceBuilderMode = 'input-only' | 'seeded-completion';
export type StoredRe01Rank = Readonly<{q: number; n: number}>;
export type EvidenceBuilderOutcome = Readonly<{parent: SemanticContext; target: NodeId;
  failure: FiniteVerificationFailure | Exclude<AnchoredListFailure, ResourceLimitFailure>}>;
export type EvidenceBuilderResult = Readonly<{
  kind: 'checked-witness'; mode: EvidenceBuilderMode;
  evidence: FiniteRe01Evidence | FiniteRe01PrimitiveEvidence;
  receipt: FiniteCandidateReceipt | FinitePrimitiveReceipt;
  outcomes: readonly EvidenceBuilderOutcome[];
  ranks: readonly Readonly<{parent: SemanticContext; context: SemanticContext; before: StoredRe01Rank; after: StoredRe01Rank}>[];
  claims: Readonly<{universalCoverage: false; completeNegativeAnswer: false; otherCandidatesExhausted: false}>;
}> | Readonly<{
  kind: 'no-witness-found'; mode: EvidenceBuilderMode; outcomes: readonly EvidenceBuilderOutcome[];
  universalCoverage: false; completeNegativeAnswer: false;
}> | FiniteVerificationFailure | ResourceLimitFailure;

/**
 * Storage census, not legality closure. Complete membership equates members and
 * stored records; each extension is classified from its exact native ancestry.
 * Unused original components are never required to be FULL-valid in H here.
 */
export function storedRe01Rank(actual: SemanticContext, context: SemanticContext):
  StoredRe01Rank | FiniteVerificationFailure | ResourceLimitFailure {
  assertSemanticContext(actual); assertSemanticContext(context);
  const b = context.budget;
  return b.guard(() => {
    b.chargeWork(12);
    if (actual !== context.originalContext() || context.membership !== 'complete-actual-plus-additions'
      || actual.membership !== 'complete-actual-plus-additions') return Object.freeze({kind: 'unresolved',
      rule: 'builder-rank-membership', message: 'Stored rank requires complete membership in the same request', contextId: context.contextId});
    let q = 0, n = 0;
    for (const id of context.members) {
      b.chargeWork(5 + id.length);
      const found = context.lookup(id);
      if (found.kind !== 'found') return Object.freeze({kind: 'unresolved', rule: 'builder-rank-availability',
        message: 'A stored rank subject is unavailable', contextId: context.contextId, component: id});
      if (found.node.kind !== 'complexType') continue;
      const raw = context.rawTypeProperties(id);
      if ((raw?.derivation.method ?? found.node.derivation?.kind ?? 'restriction') !== 'extension') continue;
      const first = immediateTypeBase(context, {kind: 'local', target: id});
      if (first.kind === 'resource-limit') return first;
      if (first.kind !== 'checked' || !first.value) return Object.freeze({kind: 'unresolved', rule: 'builder-rank-ancestry',
        message: 'The stored extension lacks its exact immediate base', contextId: context.contextId, component: id});
      const ancestor = re01Ancestor(context, id);
      if (ancestor.kind === 'resource-limit') return ancestor;
      if (ancestor.kind !== 'checked') {
        b.chargeWork(8); return Object.freeze({...ancestor, kind: 'unresolved', contextId: context.contextId});
      }
      const a = resolveSemanticType(context, first.value), z = resolveSemanticType(context, ancestor.ancestor);
      if (!('identity' in a) || !('identity' in z)) return Object.freeze({kind: 'unresolved', rule: 'builder-rank-ancestry',
        message: 'The stored extension ancestry is unavailable', contextId: context.contextId, component: id});
      if (b.compareText(semanticTypeKey(context, a.identity), semanticTypeKey(context, z.identity)) === 0) continue;
      b.chargeWork(2);
      if (actual.lookup(id).kind === 'found') q++; else n++;
    }
    b.chargeWork(4); return Object.freeze({q, n});
  });
}

/** Discover the root and every required child using only authentic Gamma/target. */
export function buildRe01Evidence(actual: SemanticContext, target: NodeId): EvidenceBuilderResult {
  return build(actual, target, 'input-only');
}

/** A seed is one original-root hypothesis, never a child list or answer forest. */
export function completeSeededRe01Evidence(actual: SemanticContext, target: NodeId,
  hypothesis: FiniteRe01Hypothesis): EvidenceBuilderResult {
  return build(actual, target, 'seeded-completion', hypothesis);
}

function build(actual: SemanticContext, target: NodeId, mode: EvidenceBuilderMode,
  seedInput?: FiniteRe01Hypothesis): EvidenceBuilderResult {
  assertSemanticContext(actual);
  const b = actual.budget, charge = b.chargeWork;
  return b.guard(() => {
    charge(18 + target.length);
    let seed: FiniteRe01Hypothesis | undefined;
    if (mode === 'seeded-completion' && seedInput === undefined)
      return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
        message: 'Seeded completion requires one concrete root hypothesis', contextId: actual.contextId, component: target});
    if (seedInput !== undefined) {
      // Own data fields only. Context handles retain their private authority;
      // the ancestor selector is copied through the bounded data owner.
      const data = new Map<string, unknown>();
      const allowed = ['parent', 'context', 'target', 'intermediate', 'ancestor'];
      for (const field in seedInput) {
        charge(8 + field.length);
        if (Object.hasOwn(seedInput, field) && !allowed.includes(field))
          return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
            message: 'A seed supplies only one root hypothesis, without child choices or evidence', contextId: actual.contextId, component: target});
      }
      for (const field of ['id', 'premises', 'nodes', 'children', 'childTargets']) {
        charge(50 + field.length);
        if (seedInput && typeof seedInput === 'object' && Object.hasOwn(seedInput, field))
          return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
            message: 'A seed supplies no child choices or completed evidence', contextId: actual.contextId, component: target});
      }
      for (const field of ['parent', 'context', 'target', 'intermediate', 'ancestor']) {
        charge(50 + field.length);
        const descriptor = seedInput && typeof seedInput === 'object' ? Object.getOwnPropertyDescriptor(seedInput, field) : undefined;
        if (!descriptor || !('value' in descriptor)) return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
          message: 'Seed fields must be own data properties', contextId: actual.contextId, component: target});
        data.set(field, descriptor.value);
      }
      const parent = data.get('parent') as SemanticContext, context = data.get('context') as SemanticContext;
      try {assertSemanticContext(parent); assertSemanticContext(context);}
      catch {return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-context',
        message: 'A seed must contain authentic contexts', contextId: actual.contextId, component: target});}
      if (typeof data.get('target') !== 'string' || typeof data.get('intermediate') !== 'string')
        return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
          message: 'A seed must identify its target and intermediate', contextId: actual.contextId, component: target});
      try {
        const selector = b.freeze(b.snapshot(data.get('ancestor'))) as FiniteRe01Hypothesis['ancestor'];
        if (!selector || typeof selector !== 'object') return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
          message: 'A seed ancestor must be a semantic type selector', contextId: actual.contextId, component: target});
        resolveSemanticType(parent, selector);
        charge(12); seed = Object.freeze({parent, context, target: data.get('target') as NodeId,
          intermediate: data.get('intermediate') as NodeId, ancestor: selector});
      } catch (error) {
        if (!(error instanceof TypeError) && !(error instanceof SemanticContextAccessError)) throw error;
        return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-syntax',
          message: 'A seed ancestor must be finite data', contextId: actual.contextId, component: target});
      }
    }
    const session = prepareFiniteRe01Frontier(actual);
    if (session.kind !== 'native-frontier-session') return session;
    let rootRequirement: FiniteRe01Frontier['requirements'][number] | undefined;
    for (const requirement of session.actual.requirements) {
      charge(2 + requirement.target.length + target.length);
      if (requirement.target === target) rootRequirement = requirement;
    }
    if (!rootRequirement) return Object.freeze({kind: 'invalid-evidence', rule: 'target-rule',
      message: 'The selected original target has no RE01 extension obligation', contextId: actual.contextId, component: target});
    if (seed && (seed.parent !== actual || seed.target !== target || rootRequirement.primitive))
      return Object.freeze({kind: 'invalid-evidence', rule: 'builder-seed-root',
        message: 'A seed must hypothesize the requested original nonprimitive root', contextId: actual.contextId, component: target});

    type RankStep = {parent: SemanticContext; context: SemanticContext; before: StoredRe01Rank; after: StoredRe01Rank};
    type Subject = {parent: SemanticContext; target: NodeId; owner?: string};
    type State = {pending: Subject[]; nodes: FiniteRe01EvidenceNode[]; ranks: RankStep[]};
    type Alternative = {hypothesis: FiniteRe01Hypothesis; frontier: FiniteRe01Frontier; rank: RankStep};
    charge(12);
    const outcomes: EvidenceBuilderOutcome[] = [];
    const alternatives = new Map<SemanticContext, Map<NodeId, readonly Alternative[]>>();
    const rankCache = new Map<SemanticContext, StoredRe01Rank>();
    const record = (parent: SemanticContext, at: NodeId, failure: EvidenceBuilderOutcome['failure']): void => {
      charge(8 + at.length); outcomes.push(Object.freeze({parent, target: at, failure}));
    };
    const rank = (context: SemanticContext): StoredRe01Rank | FiniteVerificationFailure | ResourceLimitFailure => {
      charge(2); const prior = rankCache.get(context); if (prior) return prior;
      const result = storedRe01Rank(actual, context);
      if (!('kind' in result)) {charge(2); rankCache.set(context, result);}
      return result;
    };
    const qualify = (hypothesis: FiniteRe01Hypothesis): Alternative | FiniteVerificationFailure | ResourceLimitFailure => {
      const frontier = session.inspectCandidate(hypothesis);
      if (frontier.kind !== 'inspected-frontier') return frontier;
      const before = rank(hypothesis.parent); if ('kind' in before) return before;
      const after = rank(hypothesis.context); if ('kind' in after) return after;
      charge(8 + hypothesis.target.length);
      const original = actual.lookup(hypothesis.target).kind === 'found';
      if (original ? after.q >= before.q : after.q !== before.q || after.n >= before.n)
        return Object.freeze({kind: 'unresolved', rule: 'builder-rank-progress',
          message: 'This branch lacks the qualified original/fresh stored-rank decrease',
          contextId: hypothesis.context.contextId, component: hypothesis.target});
      // At a fresh cut, inspect every newly stored identity, rather than infer
      // zero-new-NP from the producer delta or just a decreasing total census.
      if (!original) for (const id of hypothesis.context.members) {
        charge(4 + id.length);
        if (hypothesis.parent.lookup(id).kind === 'found') continue;
        const found = hypothesis.context.lookup(id);
        if (found.kind !== 'found' || found.node.kind !== 'complexType') continue;
        const raw = hypothesis.context.rawTypeProperties(id);
        if ((raw?.derivation.method ?? found.node.derivation?.kind ?? 'restriction') !== 'extension') continue;
        const first = immediateTypeBase(hypothesis.context, {kind: 'local', target: id});
        if (first.kind === 'resource-limit') return first;
        const ancestor = re01Ancestor(hypothesis.context, id); if (ancestor.kind !== 'checked') return ancestor;
        if (first.kind !== 'checked' || !first.value) return Object.freeze({kind: 'unresolved', rule: 'builder-rank-ancestry',
          message: 'A newly stored extension lacks its base', contextId: hypothesis.context.contextId, component: id});
        const a = resolveSemanticType(hypothesis.context, first.value), z = resolveSemanticType(hypothesis.context, ancestor.ancestor);
        if (!('identity' in a) || !('identity' in z)
          || b.compareText(semanticTypeKey(hypothesis.context, a.identity), semanticTypeKey(hypothesis.context, z.identity)) !== 0)
          return Object.freeze({kind: 'unresolved', rule: 'builder-fresh-np',
            message: 'A fresh cut introduced a stored nonprimitive identity', contextId: hypothesis.context.contextId, component: id});
      }
      charge(18); return {hypothesis: Object.freeze({parent: hypothesis.parent, context: hypothesis.context,
        target: hypothesis.target, intermediate: hypothesis.intermediate, ancestor: frontier.correspondence!.ancestor}), frontier,
        rank: Object.freeze({parent: hypothesis.parent, context: hypothesis.context, before, after})};
    };

    const choices = (subject: Subject): readonly Alternative[] | ResourceLimitFailure => {
      charge(4 + subject.target.length);
      let cache = alternatives.get(subject.parent);
      const prior = cache?.get(subject.target); if (prior) return prior;
      charge(4); const result: Alternative[] = [];
      const add = (hypothesis: FiniteRe01Hypothesis): ResourceLimitFailure | undefined => {
        const qualified = qualify(hypothesis);
        if ('kind' in qualified) {
          if (qualified.kind === 'resource-limit') return qualified;
          record(subject.parent, subject.target, qualified);
        } else {charge(2); result.push(qualified);}
        return undefined;
      };
      if (seed && subject.parent === actual && subject.target === target) {
        const failure = add(seed); if (failure) return failure;
      } else {
        const inherited = prepareInheritedMiddleAssignments(actual, subject.parent, subject.target);
        if (inherited.kind === 'resource-limit') return inherited;
        if (inherited.kind === 'prepared-inherited-assignments') {
          for (const assignment of inherited.assignments) {
            charge(2); const replay = replaySharedAssignment(assignment);
            if (replay.kind === 'resource-limit') return replay;
            if (replay.kind === 'prepared-local-evidence') {const failure = add(replay.evidence); if (failure) return failure;}
            else record(subject.parent, subject.target, replay);
          }
        } else record(subject.parent, subject.target, inherited);
        const anchored = prepareAnchoredListAssignments(actual, subject.parent, subject.target);
        if (anchored.kind === 'resource-limit') return anchored;
        if (anchored.kind === 'prepared-anchored-list-assignments') {
          for (const outcome of anchored.outcomes) {
            charge(2);
            if (outcome.result !== 'prepared-local-evidence') {
              if (outcome.result.kind === 'resource-limit') return outcome.result;
              record(subject.parent, subject.target, outcome.result);
            }
          }
          for (const assignment of anchored.assignments) {
            charge(2); const failure = add(assignment.evidence); if (failure) return failure;
          }
        } else record(subject.parent, subject.target, anchored);
      }
      if (!result.length) record(subject.parent, subject.target, Object.freeze({kind: 'unresolved',
        rule: 'builder-qualified-family-empty', message: 'No complete candidate was obtained in the delivered qualified families',
        contextId: subject.parent.contextId, component: subject.target}));
      charge(4 + result.length); const frozen = Object.freeze(result);
      if (!cache) {charge(3); cache = new Map(); alternatives.set(subject.parent, cache);}
      cache.set(subject.target, frozen); return frozen;
    };

    charge(6 + session.actual.requirements.length);
    const pending: Subject[] = [];
    for (const requirement of session.actual.requirements) {
      charge(3); if (!requirement.primitive) pending.push({parent: actual, target: requirement.target});
    }
    charge(3); const stack: State[] = [{pending, nodes: [], ranks: []}];
    let ordinal = 0;
    while (stack.length) {
      charge(4); const state = stack.pop()!;
      if (!state.pending.length) {
        let root: string | undefined;
        for (const node of state.nodes) {charge(2); if (node.parent === actual && node.target === target) root = node.id;}
        charge(8 + state.nodes.length);
        const evidence: FiniteRe01Evidence | FiniteRe01PrimitiveEvidence = rootRequirement.primitive
          ? Object.freeze({root: Object.freeze({kind: 'primitive-no-change' as const}), nodes: Object.freeze(state.nodes)})
          : Object.freeze({root: root!, nodes: Object.freeze(state.nodes)});
        const verified = verifyFiniteRe01EvidenceWithFrontier(actual, target, evidence, session);
        if (verified.kind === 'resource-limit') return verified;
        if (verified.kind !== 'checked-candidate' && verified.kind !== 'checked-primitive') {
          record(actual, target, verified); continue;
        }
        charge(24 + outcomes.length + state.ranks.length);
        return Object.freeze({kind: 'checked-witness', mode, evidence, receipt: verified,
          outcomes: Object.freeze(outcomes), ranks: Object.freeze(state.ranks),
          claims: Object.freeze({universalCoverage: false, completeNegativeAnswer: false, otherCandidatesExhausted: false})});
      }
      charge(2); const subject = state.pending.pop()!;
      let existing: FiniteRe01EvidenceNode | undefined;
      for (const node of state.nodes) {charge(3); if (node.parent === subject.parent && node.target === subject.target) existing = node;}
      // The subject's context ancestry strictly increases down proof edges,
      // while rank decreases; sharing is allowed only at the exact same pair.
      if (existing) {
        charge(4 + state.nodes.length);
        state.nodes = state.nodes.map(node => {
          if (node.id !== subject.owner) return node;
          charge(8 + node.premises.length);
          return Object.freeze({...node, premises: Object.freeze([...node.premises, existing!.id])});
        });
        stack.push(state); continue;
      }
      const generated = choices(subject); if ('kind' in generated) return generated;
      for (let index = generated.length - 1; index >= 0; index--) {
        charge(6); const alternative = generated[index]!;
        charge(8 + state.nodes.length + state.pending.length + state.ranks.length + alternative.frontier.requirements.length);
        b.reserveNodes(1);
        const digits = ordinal === 0 ? 1 : Math.floor(Math.log10(ordinal)) + 1;
        charge(20 + digits); const id = 'automatic-evidence-' + String(ordinal++);
        const node: FiniteRe01EvidenceNode = Object.freeze({...alternative.hypothesis, id, premises: Object.freeze([])});
        const nodes = state.nodes.map(at => {
          if (at.id !== subject.owner) return at;
          charge(8 + at.premises.length);
          return Object.freeze({...at, premises: Object.freeze([...at.premises, id])});
        });
        nodes.push(node);
        const next = [...state.pending];
        for (const requirement of alternative.frontier.requirements) {
          charge(3); if (!requirement.primitive) next.push({parent: node.context, target: requirement.target, owner: id});
        }
        stack.push({pending: next, nodes, ranks: [...state.ranks, alternative.rank]});
      }
    }
    charge(10 + outcomes.length);
    return Object.freeze({kind: 'no-witness-found', mode, outcomes: Object.freeze(outcomes),
      universalCoverage: false, completeNegativeAnswer: false});
  });
}
