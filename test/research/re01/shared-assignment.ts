/** Input-derived inherited-middle recipes. This is not the free-LIST constructor or a complete catalogue. */
import type {ComplexTypeNode, NodeId} from '../../../src/compiler/canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest, forkSemanticCandidate} from '../../../src/compiler/semanticContext.js';
import type {CandidatePreparation, SemanticCandidateDelta, SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {declarationMethods, immediateTypeBase} from '../../../src/compiler/schemaTypeRelations.js';
import {resolveSemanticType, semanticTypeKey} from '../../../src/compiler/schemaTypeIdentity.js';
import {re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {CorrespondenceFailure} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {SemanticTypeReference, SemanticTypeDependency} from '../../../src/compiler/semanticTypeReference.js';
import type {ScalarObligation} from '../../../src/compiler/scalarSchemaAssessment.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';
import type {FiniteRe01EvidenceNode} from '../../../src/compiler/finiteRe01Verification.js';

/**
 * The retained context plus one native delta is the shared physical assignment.
 * BASE/TYPE/SCOPE/SG, BODY/CODE, scalar first modes, providers, WORD/maps and
 * VALUE slots retain their actual identities; no projected scalar palette is
 * copied into a second graph. New producers must assemble their choices into
 * this same native representation before replay, not supply independent receipts.
 */
export type SharedRe01Assignment = Readonly<{
  kind: 'prepared-local-assignment';
  family: 'inherited-primitive-middle-v1';
  actual: SemanticContext;
  parent: SemanticContext;
  target: NodeId;
  intermediate: NodeId;
  ancestor: SemanticTypeReference;
  delta: SemanticCandidateDelta;
  /** Preparation duties remain pending until the complete native forest checks. */
  scalarObligations: readonly ScalarObligation[];
  typeDependencies: readonly SemanticTypeDependency[];
  introducedStoredNonprimitive: 0;
}>;
export type InheritedAssignments = Readonly<{
  kind: 'prepared-inherited-assignments';
  assignments: readonly SharedRe01Assignment[];
  /** Exhausting this subfamily cannot establish full nonexistence. */
  universalCoverage: false;
}>;
export type AssignmentPreparation = InheritedAssignments | CorrespondenceFailure | ResourceLimitFailure;
const issued = new WeakSet<SharedRe01Assignment>();

/** Derive every retained E-over-designated-ancestor middle, without a caller roster or old witness. */
export function prepareInheritedMiddleAssignments(actual: SemanticContext, parent: SemanticContext, target: NodeId): AssignmentPreparation {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget;
  return b.guard(() => {
    b.chargeWork(16 + target.length);
    if (!contextsShareRequest(actual, parent) || actual !== parent.originalContext()) throw new TypeError('Expected the actual context of this request');
    const outside = (rule: string, message: string): CorrespondenceFailure => {
      b.chargeWork(12 + rule.length + message.length);
      return Object.freeze({kind: 'unresolved', rule, message, component: target, contextId: parent.contextId});
    };
    if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions' || parent.membership !== 'complete-actual-plus-additions')
      return outside('complete-domain-membership', 'The assignment requires complete actual and inherited membership');
    const selected = parent.lookup(target);
    if (selected.kind !== 'found' || selected.node.kind !== 'complexType') return outside('assignment-target', 'An available complex target is required');
    const current = parent.rawTypeProperties(target);
    if ((current?.derivation.method ?? selected.node.derivation?.kind) !== 'extension')
      return outside('assignment-target', 'This recipe family handles complex extension targets');
    const designated = re01Ancestor(parent, target);
    if (designated.kind !== 'checked') return designated;
    const ancestor = resolveSemanticType(parent, designated.ancestor);
    if (!('identity' in ancestor)) return outside('ancestor-domain', 'The designated ancestor must be available');
    const ancestorKey = semanticTypeKey(parent, ancestor.identity);
    const scalarObligations: ScalarObligation[] = [];
    b.chargeWork(2); const typeDependencies: SemanticTypeDependency[] = [];
    for (const dependency of designated.typeDependencies) {b.chargeWork(); typeDependencies.push(dependency);}
    const mapProperties = (node: ComplexTypeNode): RawComplexTypeProperties | CorrespondenceFailure | ResourceLimitFailure => {
      const prior = parent.rawTypeProperties(node.id);
      if (prior) return prior;
      // SOURCE availability is used only to reconstruct properties; it is not FULL.
      if (!(parent.kind === 'actual' ? parent.originalComplexContentSource(node.id) : parent.originalComplexPropertySource(node.id)))
        return outside('assignment-target-properties', 'Inherited fresh or changed types require native RAW properties');
      const content = deriveActualComplexContent(actual, node.id);
      if (content.kind !== 'checked') return content.kind === 'resource-limit' ? content : outside(content.rule, content.message);
      let body = content.view.content;
      if ('particle' in body) {
        const whole = deriveOriginalComplexParticle(actual, node.id);
        if (whole.kind !== 'checked') return whole.kind === 'resource-limit' ? whole : outside(whole.rule, whole.message);
        body = whole.content;
      } else if (body.kind === 'simple') {
        // GSC1 names the genuine SOURCE scalar, never its diagnostic graph node.
        body = {kind: 'simple', type: {kind: 'original-generated', owner: node.id}};
      }
      const attributes = assessSourceAttributeUses(actual, node.id);
      if (attributes.kind !== 'checked') return attributes;
      for (const obligation of attributes.scalarObligations) {b.chargeWork(); scalarObligations.push(obligation);}
      for (const dependency of attributes.typeDependencies) {b.chargeWork(); typeDependencies.push(dependency);}
      b.chargeWork(24 + attributes.value.uses.length);
      return {type: node.id, targetNamespace: node.context.effectiveNamespace,
        derivation: {method: node.derivation?.kind ?? 'restriction', base: node.derivation?.base ?? {kind: 'builtin', name: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'anyType'}}}, abstract: node.abstract,
        final: declarationMethods(actual, node, 'final') as RawComplexTypeProperties['final'],
        block: declarationMethods(actual, node, 'block') as RawComplexTypeProperties['block'], content: body,
        attributeUses: attributes.value.uses.map(use => use.id), wildcard: attributes.value.wildcard,
        provenance: {kind: 'actual-mapped', original: node.id}};
    };
    const properties = mapProperties(selected.node);
    if ('kind' in properties) return properties;
    b.chargeWork(2); const assignments: SharedRe01Assignment[] = [];
    for (const middleId of parent.members) {
      b.chargeWork(8 + middleId.length);
      if (middleId === target) continue;
      const found = parent.lookup(middleId);
      if (found.kind !== 'found' || found.node.kind !== 'complexType') continue;
      const row = parent.rawTypeProperties(middleId);
      if ((row?.derivation.method ?? found.node.derivation?.kind) !== 'extension') continue;
      const base = immediateTypeBase(parent, {kind: 'local', target: middleId});
      if (base.kind !== 'checked') return base.kind === 'resource-limit' ? base : outside(base.rule, base.message);
      if (!base.value) continue;
      const resolved = resolveSemanticType(parent, base.value);
      if (!('identity' in resolved)) return outside('middle-base', 'An inherited middle has an unavailable BASE');
      if (b.compareText(semanticTypeKey(parent, resolved.identity), ancestorKey) !== 0) continue;
      const middle = mapProperties(found.node);
      if ('kind' in middle) return middle;
      b.chargeWork(24);
      const reference = {kind: 'local' as const, target: middleId};
      const endpoint: ComplexTypeNode = {...selected.node,
        derivation: {kind: 'restriction', contentKind: properties.content.kind === 'simple' ? 'simple' : 'complex', base: reference, facets: []}};
      // The inputs here are authenticated immutable records. Preserve opaque
      // SOURCE particle handles by identity; a generic snapshot loses authority.
      b.chargeWork('inherited-middle:'.length + target.length + 1 + middleId.length);
      const delta = b.freeze({key: 'inherited-middle:' + target + ':' + middleId, active: parent.members,
        endpoint, additions: [], rawTypes: [{...properties, derivation: {method: 'restriction' as const, base: reference}},
          ...(row ? [] : [middle])]});
      b.chargeWork(4 + typeDependencies.length + base.typeDependencies.length);
      const dependencies = b.freeze(b.snapshot([...typeDependencies, ...base.typeDependencies]));
      const obligations = b.freeze(b.snapshot(scalarObligations));
      b.chargeWork(20);
      const assignment: SharedRe01Assignment = Object.freeze({kind: 'prepared-local-assignment', family: 'inherited-primitive-middle-v1',
        actual, parent, target, intermediate: middleId, ancestor: designated.ancestor, delta,
        scalarObligations: obligations, typeDependencies: dependencies, introducedStoredNonprimitive: 0});
      issued.add(assignment); assignments.push(assignment);
    }
    b.chargeWork(4 + assignments.length);
    return Object.freeze({kind: 'prepared-inherited-assignments', assignments: Object.freeze(assignments), universalCoverage: false});
  });
}

/** Replay only. A local node must be placed in its enclosing actual-root forest. */
export function replaySharedAssignment(assignment: SharedRe01Assignment):
  Readonly<{kind: 'prepared-local-evidence'; evidence: FiniteRe01EvidenceNode}> | Exclude<CandidatePreparation, {kind: 'prepared'}> {
  if (!issued.has(assignment)) throw new TypeError('Unauthenticated shared assignment');
  const b = assignment.parent.budget;
  return b.guard(() => {
    const built = forkSemanticCandidate(assignment.parent, assignment.delta);
    if (built.kind !== 'prepared') return built;
    b.chargeWork(16);
    return Object.freeze({kind: 'prepared-local-evidence', evidence: Object.freeze({id: assignment.delta.key,
      parent: assignment.parent, context: built.context, target: assignment.target, intermediate: assignment.intermediate,
      ancestor: assignment.ancestor, premises: Object.freeze([])})});
  });
}
