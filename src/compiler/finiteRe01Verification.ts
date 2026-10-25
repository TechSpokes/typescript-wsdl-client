/** Complete verification of supplied finite evidence, never universal witness search. */
import type {NodeId} from './canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest, isSemanticCandidateOf, SemanticContextAccessError} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {checkSchemaDocumentSyntax} from './schemaDocumentSyntax.js';
import {checkComponentConstruction, assertComponentConstruction} from './schemaConstructionAssessment.js';
import type {ComponentConstructionReceipt, ConstructionObligation} from './schemaConstructionAssessment.js';
import {checkCandidateCorrespondence, assertCandidateCorrespondence, re01Ancestor} from './re01CandidateCorrespondence.js';
import type {CorrespondenceReceipt, CorrespondenceFailure} from './re01CandidateCorrespondence.js';
import {immediateTypeBase} from './schemaTypeRelations.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {RE01_DERIVATION_DOMAIN} from './re01TypeProperties.js';
import {checkNotationProperties} from './schemaNotationProperties.js';
import type {SchemaNotationProperties} from './schemaNotationProperties.js';
import {checkOriginalGeneratedScalar, assertOriginalGeneratedScalarReceipt} from './schemaScalarKernel.js';
import type {GeneratedScalarResult} from './schemaScalarKernel.js';
import {resolveSemanticType, semanticTypeKey} from './schemaTypeIdentity.js';
import type {OriginalGeneratedScalarReference, SemanticTypeDependency, SemanticTypeReference} from './semanticTypeReference.js';
import {checkIdentityConstraintFormation} from './schemaIdentityConstraints.js';
import type {IdentityConstraintDependency, IdentityConstraintReceipt} from './schemaIdentityConstraints.js';
import {deriveActualComplexContent, deriveOriginalComplexPropertyContent} from './complexTypeContent.js';
import {assertSemanticParticleView, prepareSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticleView} from './particleSemanticView.js';

export type FiniteScalarSlotReceipt = Extract<GeneratedScalarResult, {kind: 'checked'}>;

export type FiniteRe01EvidenceNode = Readonly<{
  id: string; parent: SemanticContext; context: SemanticContext;
  target: NodeId; intermediate: NodeId; ancestor: SemanticTypeReference;
  /** References to concrete evidence for generated hypothetical RE01 premises. */
  premises: readonly string[];
}>;
export type FiniteRe01Evidence = Readonly<{root: string; nodes: readonly FiniteRe01EvidenceNode[]}>;
/** The existing primitive identity rule needs no hypothetical endpoint. */
export type FiniteRe01PrimitiveEvidence = Readonly<{
  root: Readonly<{kind: 'primitive-no-change'}>;
  /** Supplied constructions for any other nonprimitive actual obligations. */
  nodes: readonly FiniteRe01EvidenceNode[];
}>;
export type FiniteVerificationFailure = CorrespondenceFailure & Readonly<{contextId?: string}>;
export type FiniteNotationReceipt = Readonly<{contextId: string; properties: SchemaNotationProperties;
  origin: 'original' | 'addition'}>;
export type FiniteProofStep = Readonly<{evidence: string; parentContext: string; contextId: string; target: NodeId;
  correspondence: CorrespondenceReceipt; components: readonly ComponentConstructionReceipt[];
  scalarSlots: readonly FiniteScalarSlotReceipt[];
  notations: readonly FiniteNotationReceipt[];
  identityConstraints: readonly IdentityConstraintReceipt[];
  premises: readonly string[]; primitiveNoChange: readonly NodeId[]}>;
export type FiniteCandidateReceipt = Readonly<{
  kind: 'checked-candidate'; authority: 'RE01-finite-evidence-v1'; domain: typeof RE01_DERIVATION_DOMAIN;
  scope: 'supplied-construction-and-finite-evidence'; actualContextId: string; target: NodeId; root: string;
  actualComponents: readonly ComponentConstructionReceipt[]; actualPrimitiveNoChange: readonly NodeId[];
  actualScalarSlots: readonly FiniteScalarSlotReceipt[];
  actualNotations: readonly FiniteNotationReceipt[];
  actualIdentityConstraints: readonly IdentityConstraintReceipt[];
  proof: readonly FiniteProofStep[];
  claims: Readonly<{actualObligations: 'checked'; suppliedCandidate: 'checked'; universalCoverage: false; completeNegativeAnswer: false; searchTermination: false}>;
}>;
export type FiniteVerificationResult = FiniteCandidateReceipt | FiniteVerificationFailure | ResourceLimitFailure;
export type FinitePrimitiveReceipt = Omit<FiniteCandidateReceipt, 'kind' | 'scope' | 'root' | 'claims'> & Readonly<{
  kind: 'checked-primitive'; scope: 'primitive-no-change-and-finite-evidence'; root: 'primitive-no-change';
  claims: Readonly<{actualObligations: 'checked'; primitiveTarget: 'checked'; universalCoverage: false;
    completeNegativeAnswer: false; searchTermination: false}>;
}>;
export type FinitePrimitiveVerificationResult = FinitePrimitiveReceipt | FiniteVerificationFailure | ResourceLimitFailure;
const issued = new WeakMap<object, SemanticContext>();
const issuedPrimitive = new WeakMap<object, SemanticContext>();
class VerificationAbort extends Error {constructor(readonly result: FiniteVerificationFailure | ResourceLimitFailure) {super(result.kind);}}
type Requirement = NonNullable<ComponentConstructionReceipt['re01']>;
type Closure = Readonly<{components: readonly ComponentConstructionReceipt[]; requirements: readonly Requirement[];
  byComponent: ReadonlyMap<NodeId, ComponentConstructionReceipt>; context: SemanticContext;
  scalarSlots: readonly FiniteScalarSlotReceipt[]; byScalarSlot: ReadonlyMap<NodeId, FiniteScalarSlotReceipt>;
  identityConstraints: readonly IdentityConstraintReceipt[]}>;

/** A requirement inspection is not a successful finite witness. */
export type FiniteRe01Frontier = Readonly<{
  kind: 'inspected-frontier'; context: SemanticContext;
  requirements: readonly Readonly<{target: NodeId; ancestor: SemanticTypeReference; primitive: boolean}>[];
  components: readonly ComponentConstructionReceipt[];
  scalarSlots: readonly FiniteScalarSlotReceipt[];
  notations: readonly FiniteNotationReceipt[];
  identityConstraints: readonly IdentityConstraintReceipt[];
  correspondence?: CorrespondenceReceipt;
  deferred: readonly Readonly<{context: SemanticContext; obligation: ConstructionObligation}>[];
  typeDependencies: readonly Readonly<{from: SemanticContext; dependency: SemanticTypeDependency}>[];
}>;
export type FiniteRe01Hypothesis = Omit<FiniteRe01EvidenceNode, 'id' | 'premises'>;
export type FiniteRe01FrontierResult = FiniteRe01Frontier | FiniteVerificationFailure | ResourceLimitFailure;
export type FiniteRe01FrontierSession = Readonly<{
  kind: 'native-frontier-session'; actual: FiniteRe01Frontier;
  inspectCandidate(hypothesis: FiniteRe01Hypothesis): FiniteRe01FrontierResult;
}>;

const inspectedFrontiers = new WeakMap<object, SemanticContext>();
export function assertFiniteRe01Frontier(context: SemanticContext, frontier: FiniteRe01Frontier): void {
  assertSemanticContext(context);
  if (inspectedFrontiers.get(frontier) !== context) throw new TypeError('Unauthenticated native frontier');
}

function createNativeFrontierOwner(actual: SemanticContext) {
  const b = actual.budget, charge = b.chargeWork;
  const fail = (rule: string, message: string, kind: FiniteVerificationFailure['kind'] = 'invalid-evidence', context = actual, component?: NodeId): never => {
    charge(16 + rule.length + message.length + (component?.length ?? 0));
    throw new VerificationAbort(Object.freeze({kind, rule, message, contextId: context.contextId, component}));
  };
  const refKey = (context: SemanticContext, reference: SemanticTypeReference): string => {
    const found = resolveSemanticType(context, reference);
    if (found.kind === 'component' || found.kind === 'builtin' || found.kind === 'original-generated')
      return semanticTypeKey(context, found.identity);
    return fail('evidence-reference', 'Proof reference is unavailable', 'unresolved', context);
  };
  charge(2); const deferred: {context: SemanticContext; obligation: ConstructionObligation}[] = [];
  if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions')
    return fail('actual-environment', 'A complete immutable original context is required');
  const source = checkSchemaDocumentSyntax(actual);
  if (source.kind !== 'checked') throw new VerificationAbort(source.kind === 'resource-limit' ? source : {
    ...source, message: 'Original schema-document qualification did not pass', contextId: actual.contextId});
  for (const remaining of source.remaining) {
    charge();
    if (remaining !== 'child-component-syntax' && remaining !== 'semantic-construction') return fail(remaining, 'Original source document has an outstanding assessment obligation', 'unresolved');
  }
  // Notations have a private component table rather than a persisted graph
  // role. Its own source and active-universe dimensions must both pass;
  // neither GraphNode membership nor scalar use inventories cover unused
  // fresh declarations. Source representation checks above remain separate.
  charge(4); const notationReceipts = new Map<SemanticContext, readonly FiniteNotationReceipt[]>();
  const checkedNotationProperties = new WeakSet<SchemaNotationProperties>();
  const checkNotations = (context: SemanticContext): readonly FiniteNotationReceipt[] => {
    charge(3);
    const prior = notationReceipts.get(context);
    if (prior) return prior;
    if (context.notationUniverse !== 'source-bound') return fail('notation-source-universe',
      'Complete original notation availability is required', 'unresolved', context);
    if (context.notationMembership !== 'complete-original-plus-additions') return fail('notation-active-membership',
      'The notation table must include every original and fresh declaration', 'unresolved', context);
    charge(2); const receipts: FiniteNotationReceipt[] = [];
    for (const name of context.notationMembers) {
      charge(); const found = context.lookupNotation(name);
      if (found.kind !== 'found') return fail(found.kind === 'unresolved' ? found.rule : 'notation-context-membership',
        'A generated notation obligation is unavailable in its context', 'unresolved', context);
      // This pure property rule depends only on the authenticated immutable
      // tuple. Reuse it by exact object identity; source syntax and active
      // membership are independently checked in their own contexts.
      charge();
      if (!checkedNotationProperties.has(found.properties)) {
        const result = checkNotationProperties(found.properties, b);
        if (result.kind !== 'checked') return fail(result.rule, result.message,
          context.kind === 'actual' ? 'invalid-schema' : 'candidate-rejected', context);
        charge(); checkedNotationProperties.add(found.properties);
      }
      charge(8 + context.contextId.length);
      receipts.push(Object.freeze({contextId: context.contextId, properties: found.properties, origin: found.origin}));
    }
    charge(2 + receipts.length); const frozen = Object.freeze(receipts);
    notationReceipts.set(context, frozen); return frozen;
  };
  const actualNotations = checkNotations(actual);
  charge(4); const closures = new Map<string, Closure>();
  charge(); const typedDependencies: {from: SemanticContext; dependency: SemanticTypeDependency}[] = [];
  charge(); const mixedFacts = new Map<SemanticContext, Map<NodeId, SemanticParticleView>>();
  const mixedRule = 'simple-content-base-mixed-emptiable';
  const mixedFact = (context: SemanticContext, component: NodeId): SemanticParticleView => {
    charge(5 + component.length);
    let facts = mixedFacts.get(context), view = facts?.get(component);
    if (!view) {
      const found = context.lookup(component);
      if (found.kind !== 'found' || found.node.kind !== 'complexType')
        return fail(mixedRule, 'Mixed base properties are unavailable', 'unresolved', context, component);
      const mapped = context.kind === 'actual' ? deriveActualComplexContent(context, component)
        : deriveOriginalComplexPropertyContent(context, component);
      if (mapped.kind !== 'checked') {
        if (mapped.kind === 'resource-limit') throw new VerificationAbort(mapped);
        return fail(mapped.rule, mapped.message, mapped.kind === 'unresolved' ? 'unresolved'
          : context.kind === 'actual' ? 'invalid-schema' : 'candidate-rejected', context, mapped.component ?? component);
      }
      if (mapped.view.content.kind !== 'mixed')
        return fail(mixedRule, 'Simple-content base must have mixed content', context.kind === 'actual' ? 'invalid-schema' : 'candidate-rejected', context, component);
      const prepared = prepareSemanticParticleView(context, mapped.view, 'restriction');
      if (prepared.kind !== 'checked') {
        if (prepared.kind === 'resource-limit') throw new VerificationAbort(prepared);
        return fail(prepared.rule, prepared.message, prepared.kind === 'unresolved' ? 'unresolved'
          : context.kind === 'actual' ? 'invalid-schema' : 'candidate-rejected', context, prepared.component ?? component);
      }
      view = prepared.view;
    }
    assertSemanticParticleView(context, view);
    if (view.content.type !== component || view.content.content.kind !== 'mixed' || view.purpose !== 'restriction')
      return fail(mixedRule, 'Mixed base fact has another semantic subject', 'invalid-evidence', context, component);
    if (!view.root.summary.schemaEmptiable)
      return fail(mixedRule, 'Mixed simple-content base is not formally emptiable', context.kind === 'actual' ? 'invalid-schema' : 'candidate-rejected', context, component);
    if (!facts) {charge(2); facts = new Map(); mixedFacts.set(context, facts);}
    charge(2); facts.set(component, view);
    return view;
  };
  const rejectPending = (context: SemanticContext, pending: ConstructionObligation,
    requireTypes: (dependencies: readonly SemanticTypeDependency[]) => void): void => {
    if (pending.contextId !== context.contextId) {
      charge(8); deferred.push(Object.freeze({context, obligation: Object.freeze({...pending})})); return;
    }
    if (pending.rule === mixedRule) {requireTypes(mixedFact(context, pending.component).typeDependencies); return;}
    if (pending.rule === 'complete-substitution-universe' && context.membership === 'complete-actual-plus-additions') return;
    fail(pending.rule, 'A generated local semantic prerequisite remains undischarged', 'unresolved', context, pending.component);
  };
  const close = (context: SemanticContext, roots: readonly NodeId[], correspondence?: CorrespondenceReceipt): Closure => {
    charge(8);
    const identityConstraints: IdentityConstraintReceipt[] = [], checkedICs = new Set<string>();
    const requireIdentityConstraints = (required: readonly IdentityConstraintDependency[]): void => {
      charge(3 + required.length); const pending = [...required];
      while (pending.length) {
        const dependency = pending.pop()!; charge(6 + dependency.identity.length);
        if (dependency.contextId !== context.contextId) return fail('identity-constraint-context',
          'Identity constraint dependency does not belong to this current context', 'unresolved', context);
        if (checkedICs.has(dependency.identity)) continue;
        const receipt = checkIdentityConstraintFormation(context, dependency.identity);
        if (receipt.kind !== 'checked') throw new VerificationAbort(receipt.kind === 'resource-limit' ? receipt : {
          ...receipt, contextId: receipt.contextId ?? context.contextId,
          kind: receipt.kind === 'invalid-schema' && context.kind === 'candidate' && receipt.contextId === context.contextId ? 'candidate-rejected' : receipt.kind});
        charge(5 + receipt.identityConstraintDependencies.length); checkedICs.add(dependency.identity); identityConstraints.push(receipt);
        pending.push(...receipt.identityConstraintDependencies);
      }
    };
    if (context.kind === 'actual') {
      const registry = context.originalIdentityConstraints();
      charge(3 + registry.identities.length * 4);
      requireIdentityConstraints(registry.identities.map(identity => ({contextId: context.contextId, identity})));
    }
    if (context.scalarSlotMembership !== 'complete-original') return fail('scalar-slot-active-membership',
      'Finite evidence requires every original generated scalar slot', 'unresolved', context);
    charge(12 + roots.length + (context.kind === 'actual' ? context.scalarSlots.length : 0));
    const queue = [...roots], byComponent = new Map<NodeId, ComponentConstructionReceipt>();
    // Availability is complete in H, but its legality roots are E, D′,
    // fresh components and consumed dependencies. Only Γ checks every
    // original scalar merely because it is part of the actual schema.
    const slotQueue: OriginalGeneratedScalarReference[] = context.kind === 'actual' ? [...context.scalarSlots] : [];
    const byScalarSlot = new Map<NodeId, FiniteScalarSlotReceipt>(), scalarSlots: FiniteScalarSlotReceipt[] = [];
    const components: ComponentConstructionReceipt[] = [], requirements: Requirement[] = [];
    const requireTypes = (required: readonly SemanticTypeDependency[]): void => {
      for (const dependency of required) {
        charge(4); typedDependencies.push(Object.freeze({from: context, dependency}));
        if (dependency.contextId !== context.contextId) continue;
        const type = dependency.type;
        if (type.kind === 'component') {charge(2); if (!byComponent.has(type.id)) queue.push(type.id);}
        else if (type.kind === 'original-generated') {charge(2); if (!byScalarSlot.has(type.owner)) slotQueue.push(type);}
      }
    };
    if (correspondence) requireTypes(correspondence.typeDependencies);
    while (queue.length || slotQueue.length) {
      if (!queue.length) {
        charge(3); const slot = slotQueue.pop()!;
        if (byScalarSlot.has(slot.owner)) continue;
        const result = checkOriginalGeneratedScalar(context, slot);
        if (result.kind !== 'checked') throw new VerificationAbort(result.kind === 'resource-limit' ? result : {
          ...result, contextId: result.contextId ?? context.contextId,
          kind: result.kind === 'invalid-schema' && context.kind === 'candidate'
            && (!result.contextId || result.contextId === context.contextId) ? 'candidate-rejected' : result.kind});
        assertOriginalGeneratedScalarReceipt(context, result);
        if (semanticTypeKey(context, result.slot) !== semanticTypeKey(context, slot))
          return fail('scalar-slot-receipt', 'Scalar construction receipt identifies another slot', 'invalid-evidence', context);
        // Dedicated slot checking must finish its own scalar rules. Only
        // genuine GraphNode-owned source premises can remain as debts;
        // the complex provenance owner cannot certify the scalar slot.
        for (const pending of result.obligations) {
          charge(4); rejectPending(context, {...pending, contextId: pending.contextId ?? context.contextId}, requireTypes);
        }
        charge(4 + slot.owner.length); byScalarSlot.set(slot.owner, result); scalarSlots.push(result);
        requireTypes(result.typeDependencies);
        continue;
      }
      charge(3); const id = queue.pop()!;
      if (byComponent.has(id)) continue;
      const found = context.lookup(id);
      if (found.kind !== 'found') return fail('obligation-membership', 'A generated obligation is outside its context', 'unresolved', context, id);
      // WSDL transport/capability interpretation remains at its existing
      // boundary; all XSD nodes in the actual input are still scheduled.
      if (found.node.kind === 'wsdl') {
        if (context.kind === 'actual') continue;
        return fail('hypothetical-component-domain', 'A hypothetical obligation is not an XSD component', 'invalid-evidence', context, id);
      }
      const result = checkComponentConstruction(context, id, {correspondence});
      if (result.kind !== 'checked') throw new VerificationAbort(result.kind === 'resource-limit' ? result
        : {...result, contextId: result.contextId ?? context.contextId});
      assertComponentConstruction(context, result);
      for (const pending of result.obligations) rejectPending(context, pending, requireTypes);
      charge(4 + id.length); byComponent.set(id, result); components.push(result);
      requireTypes(result.typeDependencies);
      requireIdentityConstraints(result.identityConstraintDependencies);
      if (result.re01) {charge(); requirements.push(result.re01);}
      for (const dependency of result.dependencies) {charge(2); if (!byComponent.has(dependency)) queue.push(dependency);}
    }
    charge(10 + components.length + requirements.length + scalarSlots.length);
    const closure = Object.freeze({context, components: Object.freeze(components), requirements: Object.freeze(requirements), byComponent,
      scalarSlots: Object.freeze(scalarSlots), byScalarSlot, identityConstraints: Object.freeze(identityConstraints)});
    charge(context.contextId.length + 1); closures.set(context.contextId, closure); return closure;
  };
  const actualClosure = close(actual, actual.members);
  const primitiveFacts = new Map<SemanticContext, Set<NodeId>>();
  const primitive = (context: SemanticContext, requirement: Requirement): boolean => {
    if (!requirement.primitive) return false;
    charge(2); if (primitiveFacts.get(context)?.has(requirement.target)) return true;
    const first = immediateTypeBase(context, {kind: 'local', target: requirement.target});
    const designated = re01Ancestor(context, requirement.target);
    if (first.kind === 'resource-limit') throw new VerificationAbort(first);
    if (designated.kind === 'resource-limit') throw new VerificationAbort(designated);
    if (first.kind !== 'checked' || !first.value || designated.kind !== 'checked') return fail('primitive-no-change', 'Primitive ancestry premises are missing', 'unresolved', context, requirement.target);
    for (const dependency of first.typeDependencies) {charge(4); typedDependencies.push(Object.freeze({from: context, dependency}));}
    for (const dependency of designated.typeDependencies) {charge(4); typedDependencies.push(Object.freeze({from: context, dependency}));}
    if (refKey(context, first.value) !== refKey(context, designated.ancestor) || refKey(context, requirement.ancestor) !== refKey(context, designated.ancestor)) return fail('primitive-no-change', 'Primitive proof is not a direct extension of the designated ancestor');
    const base = resolveSemanticType(context, designated.ancestor);
    if (!(base.kind === 'builtin' && base.name.namespace === XSD_NAMESPACE && base.name.local === 'anyType')) {
      const next = immediateTypeBase(context, designated.ancestor);
      if (next.kind === 'resource-limit') throw new VerificationAbort(next);
      if (next.kind !== 'checked' || !next.value || refKey(context, next.value) !== refKey(context, {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}}))
        return fail('primitive-no-change', 'Primitive ancestor lacks the ur-type base');
      for (const dependency of next.typeDependencies) {charge(4); typedDependencies.push(Object.freeze({from: context, dependency}));}
    }
    // All independently generated local/component premises were checked
    // by close(). This epsilon comparison creates no type or base edge.
    charge(4); let facts = primitiveFacts.get(context);
    if (!facts) {facts = new Set(); primitiveFacts.set(context, facts);}
    facts.add(requirement.target); return true;
  };

  const publish = (closure: Closure, correspondence?: CorrespondenceReceipt, deferredStart = 0, typedStart = 0): FiniteRe01Frontier => {
    charge(14 + closure.requirements.length * 5);
    const requirements = closure.requirements.map(requirement => Object.freeze({target: requirement.target,
      ancestor: requirement.ancestor, primitive: primitive(closure.context, requirement)}));
    charge(3 + deferred.length - deferredStart + typedDependencies.length - typedStart);
    const frontier: FiniteRe01Frontier = Object.freeze({kind: 'inspected-frontier', context: closure.context,
      requirements: Object.freeze(requirements), components: closure.components, scalarSlots: closure.scalarSlots,
      notations: notationReceipts.get(closure.context)!, identityConstraints: closure.identityConstraints,
      correspondence, deferred: Object.freeze(deferred.slice(deferredStart)), typeDependencies: Object.freeze(typedDependencies.slice(typedStart))});
    inspectedFrontiers.set(frontier, closure.context); return frontier;
  };
  const actualFrontier = publish(actualClosure);
  const inspect = (item: FiniteRe01Hypothesis): FiniteRe01Frontier => {
    try {assertSemanticContext(item.parent); assertSemanticContext(item.context);}
    catch {return fail('evidence-context', 'Candidate contains an unauthenticated context');}
    const deferredStart = deferred.length, typedStart = typedDependencies.length;
    const previousClosure = closures.get(item.context.contextId);
    try {
      if (!contextsShareRequest(actual, item.parent) || !contextsShareRequest(actual, item.context)
        || !isSemanticCandidateOf(item.parent, item.context))
        return fail('evidence-context', 'Candidate must be an authenticated direct child in this semantic request');
      checkNotations(item.context);
      const correspondence = checkCandidateCorrespondence(actual, item.parent, item.context, item.target, item.intermediate, item.ancestor);
      if (correspondence.kind !== 'checked') throw new VerificationAbort(correspondence);
      assertCandidateCorrespondence(item.context, correspondence);
      // Every Gamma-fresh inherited record remains a legality root. Storage of
      // original components alone does not make all of them hypothetical roots.
      charge(3); const roots = [item.target, item.intermediate];
      for (const id of item.context.members) {
        charge();
        if (actual.lookup(id).kind !== 'found') {charge(2); roots.push(id);}
      }
      return publish(close(item.context, roots, correspondence), correspondence, deferredStart, typedStart);
    } catch (error) {
      charge(4); deferred.length = deferredStart; typedDependencies.length = typedStart;
      primitiveFacts.delete(item.context);
      if (previousClosure) closures.set(item.context.contextId, previousClosure); else closures.delete(item.context.contextId);
      throw error;
    }
  };
  const validateAggregate = (proof: readonly FiniteProofStep[]): void => {
    // A research session can inspect rejected alternatives. Only the selected
    // forest contributes aggregate debts; context handles remain exact.
    charge(4 + proof.length * 3);
    const selected = new Set<string>([actual.contextId]);
    for (const step of proof) selected.add(step.contextId);
    const selectedClosure = (contextId: string): Closure | undefined => selected.has(contextId) ? closures.get(contextId) : undefined;

    // A late property-only fact cannot reopen a closed FULL frontier. Its
    // actual typed support must already be present in that exact context.
    const lateMixedFact = (contextId: string, component: NodeId, from: SemanticContext): void => {
      charge(4 + contextId.length); const closure = selectedClosure(contextId);
      if (!closure) return fail(mixedRule, 'Mixed base fact has no checked originating context', 'unresolved', from, component);
      const view = mixedFact(closure.context, component);
      for (const dependency of view.typeDependencies) {
        charge(5);
        if (dependency.contextId === contextId) {
          const type = dependency.type;
          if (type.kind === 'component' && !closure.byComponent.has(type.id)
            || type.kind === 'original-generated' && !closure.byScalarSlot.has(type.owner))
            return fail(mixedRule, 'Late mixed base fact lacks checked type support', 'unresolved', closure.context, component);
        }
        typedDependencies.push(Object.freeze({from: closure.context, dependency}));
      }
    };
    for (const pending of deferred) if (selected.has(pending.context.contextId) && pending.obligation.rule === mixedRule)
      lateMixedFact(pending.obligation.contextId, pending.obligation.component, pending.context);
    for (const step of proof) for (const pending of step.correspondence.scalarObligations) if (pending.obligation.rule === mixedRule)
      lateMixedFact(pending.contextId, pending.obligation.component, actual);
    // Dependency facts in checked component/slot/correspondence receipts are
    // privately owned and frozen. Resolve each exact builtin tuple once per
    // context; repeated uses still pay for the lookup and remain represented
    // in their originating receipts.
    charge(2);
    const checkedBuiltins = new Map<SemanticContext, Map<string, Set<string>>>();
    for (const {from, dependency} of typedDependencies) {
      charge(4 + dependency.contextId.length);
      if (!selected.has(from.contextId)) continue;
      const closure = selectedClosure(dependency.contextId), type = dependency.type;
      if (!closure) return fail('type-dependency-context', 'A semantic type dependency has no checked context closure', 'unresolved', from);
      if (type.kind === 'component') {
        const receipt = closure.byComponent.get(type.id), node = closure.context.lookup(type.id);
        if (!receipt || receipt.scope !== 'local-component-premises' || node.kind !== 'found'
          || node.node.kind !== 'simpleType' && node.node.kind !== 'complexType')
          return fail('type-component-validity', 'A type dependency lacks matching semantic component construction', 'unresolved', closure.context, type.id);
      } else if (type.kind === 'original-generated') {
        const receipt = closure.byScalarSlot.get(type.owner);
        if (!receipt) return fail('scalar-slot-validity', 'A type dependency lacks matching scalar-slot construction', 'unresolved', closure.context, type.owner);
        assertOriginalGeneratedScalarReceipt(closure.context, receipt);
      } else {
        const namespace=type.name.namespace,local=type.name.local;
        charge(4);let namespaces=checkedBuiltins.get(closure.context);
        if (!namespaces) {charge(4);namespaces=new Map();checkedBuiltins.set(closure.context,namespaces);}
        charge(4+namespace.length);let known=namespaces.get(namespace);
        if (!known) {charge(4);known=new Set();namespaces.set(namespace,known);}
        charge(4+local.length);
        if (!known.has(local)) {
          if (resolveSemanticType(closure.context, type).kind !== 'builtin')
            return fail('builtin-type-dependency', 'A builtin dependency lacks its exact builtin identity', 'unresolved', closure.context);
          charge(2+local.length);known.add(local);
        }
      }
    }
    // Correspondence computations retain exact scalar premises too. A local
    // type owner must have checked that same property in that same context.
    const discharged = (contextId: string, rule: string, component: NodeId): boolean => {
      charge(4 + contextId.length); const closure = selectedClosure(contextId);
      if (rule === mixedRule) return closure !== undefined && mixedFacts.get(closure.context)?.has(component) === true;
      const owner = closure?.byComponent.get(component);
      for (const checked of owner?.discharged ?? []) {
        charge(3 + checked.rule.length + checked.component.length + checked.contextId.length);
        if (checked.rule === rule && checked.component === component && checked.contextId === contextId) return true;
      }
      return false;
    };
    for (const pending of deferred) {
      charge(); if (!selected.has(pending.context.contextId)) continue;
      const obligation = pending.obligation;
      if (!discharged(obligation.contextId, obligation.rule, obligation.component))
        return fail(obligation.rule, 'An original-context scalar prerequisite lacks concrete aggregate discharge', 'unresolved', pending.context, obligation.component);
    }
    for (const step of proof) for (const pending of step.correspondence.scalarObligations) {
      if (!discharged(pending.contextId, pending.obligation.rule, pending.obligation.component))
        return fail(pending.obligation.rule, 'A correspondence scalar premise lacks concrete aggregate discharge', 'unresolved', actual, pending.obligation.component);
    }

  };
  return {actualClosure, actualNotations, actualFrontier, inspect, primitive, closures, notationReceipts, validateAggregate};
}
const frontierOwners = new WeakMap<FiniteRe01FrontierSession, ReturnType<typeof createNativeFrontierOwner>>();

/** Internal native collection authority shared by supplied verification and research construction. */
export function prepareFiniteRe01Frontier(actual: SemanticContext): FiniteRe01FrontierSession | FiniteVerificationFailure | ResourceLimitFailure {
  assertSemanticContext(actual);
  const b = actual.budget;
  return b.guard(() => {
    try {
      const owner = createNativeFrontierOwner(actual);
      b.chargeWork(6);
      const session: FiniteRe01FrontierSession = Object.freeze({kind: 'native-frontier-session', actual: owner.actualFrontier,
        inspectCandidate: (hypothesis: FiniteRe01Hypothesis): FiniteRe01FrontierResult => b.guard(() => {
          try {return owner.inspect(hypothesis);}
          catch (error) {if (error instanceof VerificationAbort) return error.result; throw error;}
        })});
      frontierOwners.set(session, owner); return session;
    } catch (error) {if (error instanceof VerificationAbort) return error.result; throw error;}
  });
}

export function assertFiniteCandidateReceipt(actual: SemanticContext, receipt: FiniteCandidateReceipt): void {
  assertSemanticContext(actual);
  if (issued.get(receipt) !== actual) throw new TypeError('Unauthenticated finite candidate receipt');
}

export function assertFinitePrimitiveReceipt(actual: SemanticContext, receipt: FinitePrimitiveReceipt): void {
  assertSemanticContext(actual);
  if (issuedPrimitive.get(receipt) !== actual) throw new TypeError('Unauthenticated finite primitive receipt');
}

export function verifyFiniteRe01Evidence(actual: SemanticContext, target: NodeId, supplied: FiniteRe01Evidence): FiniteVerificationResult;
export function verifyFiniteRe01Evidence(actual: SemanticContext, target: NodeId, supplied: FiniteRe01PrimitiveEvidence): FinitePrimitiveVerificationResult;
export function verifyFiniteRe01Evidence(actual: SemanticContext, target: NodeId,
  supplied: FiniteRe01Evidence | FiniteRe01PrimitiveEvidence): FiniteVerificationResult | FinitePrimitiveVerificationResult;
export function verifyFiniteRe01Evidence(actual: SemanticContext, target: NodeId,
  supplied: FiniteRe01Evidence | FiniteRe01PrimitiveEvidence): FiniteVerificationResult | FinitePrimitiveVerificationResult {
  return verifyFiniteRe01EvidenceWithFrontier(actual, target, supplied);
}

/** Reuse native actual preparation within one authenticated research request. */
export function verifyFiniteRe01EvidenceWithFrontier(actual: SemanticContext, target: NodeId,
  supplied: FiniteRe01Evidence | FiniteRe01PrimitiveEvidence, prepared?: FiniteRe01FrontierSession): FiniteVerificationResult | FinitePrimitiveVerificationResult {
  assertSemanticContext(actual);
  const b = actual.budget, charge = b.chargeWork;
  return b.guard(() => {
    const fail = (rule: string, message: string, kind: FiniteVerificationFailure['kind'] = 'invalid-evidence', context = actual, component?: NodeId): never => {
      charge(16 + rule.length + message.length + (component?.length ?? 0));
      throw new VerificationAbort(Object.freeze({kind, rule, message, contextId: context.contextId, component}));
    };
    const record = (value: unknown, field: string): unknown => {
      charge(50 + field.length);
      if (!value || typeof value !== 'object') return fail('evidence-syntax', 'Expected a finite data record');
      const property = Object.getOwnPropertyDescriptor(value, field);
      if (!property || !('value' in property)) return fail('evidence-syntax', 'Evidence fields must be own data properties');
      return property.value;
    };
    try {
      if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions') return fail('actual-environment', 'A complete immutable original context is required');
      const rootId = record(supplied, 'root'), sourceNodes = record(supplied, 'nodes');
      const primitiveRoot = rootId !== null && typeof rootId === 'object' && record(rootId, 'kind') === 'primitive-no-change';
      if ((!primitiveRoot && (typeof rootId !== 'string' || !rootId)) || !Array.isArray(sourceNodes))
        return fail('evidence-syntax', 'Evidence requires a root ID or primitive marker and finite node array');
      b.reserveNodes(sourceNodes.length); charge(6 + (typeof rootId === 'string' ? rootId.length : 19));
      const nodes = new Map<string, FiniteRe01EvidenceNode>();
      const subjects = new Map<SemanticContext, Set<NodeId>>();
      for (let index = 0; index < sourceNodes.length; index++) {
        // Read the caller's array as bounded own data, never through its
        // iterator or an indexed getter. Context handles are authenticated
        // below and intentionally are not cloned as ordinary data.
        charge(24); const raw = record(sourceNodes, String(index));
        const parent = record(raw, 'parent') as SemanticContext, context = record(raw, 'context') as SemanticContext;
        try {assertSemanticContext(parent); assertSemanticContext(context);}
        catch {return fail('evidence-context', 'Evidence contains an unauthenticated context');}
        if (!contextsShareRequest(actual, parent) || !contextsShareRequest(actual, context)) return fail('evidence-context', 'Evidence belongs to another semantic request');
        const readData = () => {
          try {
            charge(12);
            return b.freeze(b.snapshot({id: record(raw, 'id'), target: record(raw, 'target'), intermediate: record(raw, 'intermediate'),
              ancestor: record(raw, 'ancestor'), premises: record(raw, 'premises')}));
          } catch (error) {
            if (error instanceof TypeError) return fail('evidence-syntax', 'Evidence must contain finite immutable data');
            throw error;
          }
        };
        const data = readData();
        if (typeof data.id !== 'string' || !data.id || typeof data.target !== 'string' || typeof data.intermediate !== 'string'
          || !data.ancestor || typeof data.ancestor !== 'object' || !Array.isArray(data.premises)) return fail('evidence-syntax', 'Malformed proof subject or premises');
        try {resolveSemanticType(parent, data.ancestor as SemanticTypeReference);}
        catch (error) {
          if (error instanceof SemanticContextAccessError || error instanceof TypeError)
            return fail('evidence-syntax', 'Malformed evidence ancestor reference');
          throw error;
        }
        for (const premise of data.premises) {charge(); if (typeof premise !== 'string') return fail('evidence-syntax', 'Proof references must be evidence IDs');}
        charge(6 + data.id.length + data.target.length);
        if (nodes.has(data.id)) return fail('duplicate-evidence-id', 'Evidence IDs must be unique');
        const claims = subjects.get(parent) ?? new Set<NodeId>();
        if (claims.has(data.target)) return fail('duplicate-proof-subject', 'A proof subject has multiple supplied certificates');
        claims.add(data.target); subjects.set(parent, claims);
        const item = Object.freeze({...data, parent, context}) as FiniteRe01EvidenceNode;
        nodes.set(item.id, item);
      }
      const root = typeof rootId === 'string' ? nodes.get(rootId) : undefined;
      if (!primitiveRoot && (!root || root.parent !== actual || root.target !== target))
        return fail('evidence-root', 'Root must prove the requested original target');
      for (const item of nodes.values()) {
        charge();
        if (!isSemanticCandidateOf(item.parent, item.context)) return fail('evidence-context', 'Candidate must be an authenticated direct child of its declared parent');
      }
      // Declared proof dependencies are a finite DAG; component recursion is
      // scheduled below and never substitutes for this proof check.
      charge(3); const colors = new Map<string, 'active' | 'done'>();
      for (const entry of nodes.values()) {
        if (colors.has(entry.id)) continue;
        charge(4); const stack: {id: string; index: number}[] = [{id: entry.id, index: 0}];
        while (stack.length) {
          charge(3); const frame = stack[stack.length - 1]!, item = nodes.get(frame.id)!;
          colors.set(frame.id, 'active');
          if (frame.index === item.premises.length) {colors.set(frame.id, 'done'); stack.pop(); continue;}
          const next = item.premises[frame.index++]!;
          if (!nodes.has(next)) return fail('missing-proof-reference', 'A declared proof reference has no evidence node');
          if (colors.get(next) === 'active') return fail('proof-cycle', 'An active proof node cannot justify its own premise', 'unresolved', item.context, item.target);
          if (!colors.has(next)) {charge(3); stack.push({id: next, index: 0});}
        }
      }
      const session = prepared ?? prepareFiniteRe01Frontier(actual);
      if (session.kind !== 'native-frontier-session') throw new VerificationAbort(session);
      const owner = frontierOwners.get(session);
      if (!owner || session.actual.context !== actual) return fail('evidence-context', 'Frontier session belongs to another actual context');
      const {actualClosure, actualNotations, primitive, notationReceipts} = owner;
      let targetRequirement: Requirement | undefined;
      for (const requirement of actualClosure.requirements) {charge(2 + requirement.target.length + target.length); if (requirement.target === target) targetRequirement = requirement;}
      if (!targetRequirement) return fail('target-rule', 'The selected original target has no RE01 extension obligation');
      charge(5); const completed = new Set<string>(), active = new Set<string>(), proof: FiniteProofStep[] = [];
      type Frame = {node: FiniteRe01EvidenceNode; closure?: Closure; correspondence?: CorrespondenceReceipt;
        index: number; used: string[]; primitive: NodeId[]};
      const execute = (start: FiniteRe01EvidenceNode): void => {
        charge(6); const stack: Frame[] = [{node: start, index: 0, used: [], primitive: []}];
        while (stack.length) {
          charge(3); const frame = stack[stack.length - 1]!, item = frame.node;
          if (completed.has(item.id)) {stack.pop(); continue;}
          if (!frame.closure) {
            if (active.has(item.id)) return fail('proof-cycle', 'An active proof premise cannot count as checked', 'unresolved', item.parent, item.target);
            charge(); active.add(item.id);
            const frontier = session.inspectCandidate(item);
            if (frontier.kind !== 'inspected-frontier') throw new VerificationAbort(frontier);
            frame.correspondence = frontier.correspondence!;
            frame.closure = owner.closures.get(item.context.contextId)!;
          }
          if (frame.index < frame.closure.requirements.length) {
            const requirement = frame.closure.requirements[frame.index++]!;
            if (primitive(item.context, requirement)) {charge(); frame.primitive.push(requirement.target); continue;}
            let child: FiniteRe01EvidenceNode | undefined;
            for (const id of item.premises) {
              charge(); const offered = nodes.get(id)!;
              if (offered.parent === item.context && offered.target === requirement.target) child = offered;
            }
            if (!child) return fail('missing-nested-evidence', 'A generated RE01 obligation lacks matching finite evidence', 'unresolved', item.context, requirement.target);
            charge(); frame.used.push(child.id);
            if (!completed.has(child.id)) {charge(6); stack.push({node: child, index: 0, used: [], primitive: []});}
            continue;
          }
          for (const id of item.premises) {
            charge(1 + frame.used.length * (1 + id.length));
            if (!frame.used.includes(id)) return fail('unused-proof-premise', 'A supplied premise does not match a generated nested obligation');
          }
          charge(12 + frame.used.length + frame.primitive.length);
          proof.push(Object.freeze({evidence: item.id, parentContext: item.parent.contextId, contextId: item.context.contextId, target: item.target,
            correspondence: frame.correspondence!, components: frame.closure.components,
            scalarSlots: frame.closure.scalarSlots,
            notations: notationReceipts.get(item.context)!,
            identityConstraints: frame.closure.identityConstraints,
            premises: Object.freeze(frame.used), primitiveNoChange: Object.freeze(frame.primitive)}));
          completed.add(item.id); active.delete(item.id); stack.pop();
        }
      };
      if (primitiveRoot && !primitive(actual, targetRequirement))
        return fail('primitive-no-change', 'The requested target is not a qualified primitive extension');
      if (root) execute(root);
      charge(); const actualPrimitiveNoChange: NodeId[] = [];
      for (const requirement of actualClosure.requirements) {
        if (primitive(actual, requirement)) {charge(); actualPrimitiveNoChange.push(requirement.target); continue;}
        let evidence: FiniteRe01EvidenceNode | undefined;
        for (const item of nodes.values()) {charge(); if (item.parent === actual && item.target === requirement.target) evidence = item;}
        if (!evidence) return fail('missing-actual-evidence', 'An original actual RE01 obligation lacks finite evidence', 'unresolved', actual, requirement.target);
        execute(evidence);
      }
      if (completed.size !== nodes.size) return fail('unused-proof-node', 'Every supplied proof node must match a required obligation');
      owner.validateAggregate(proof);
      charge(20 + proof.length + actualPrimitiveNoChange.length);
      charge(12);
      const common = {authority: 'RE01-finite-evidence-v1' as const, domain: RE01_DERIVATION_DOMAIN,
        actualContextId: actual.contextId, target,
        actualComponents: actualClosure.components, actualPrimitiveNoChange: Object.freeze(actualPrimitiveNoChange), proof: Object.freeze(proof),
        actualScalarSlots: actualClosure.scalarSlots,
        actualNotations, actualIdentityConstraints: actualClosure.identityConstraints};
      if (primitiveRoot) {
        charge(12);
        const result: FinitePrimitiveReceipt = Object.freeze({...common, kind: 'checked-primitive',
          scope: 'primitive-no-change-and-finite-evidence', root: 'primitive-no-change',
          claims: Object.freeze({actualObligations: 'checked', primitiveTarget: 'checked', universalCoverage: false,
            completeNegativeAnswer: false, searchTermination: false})});
        issuedPrimitive.set(result, actual); return result;
      }
      const result: FiniteCandidateReceipt = Object.freeze({...common, kind: 'checked-candidate',
        scope: 'supplied-construction-and-finite-evidence', root: root!.id,
        claims: Object.freeze({actualObligations: 'checked', suppliedCandidate: 'checked', universalCoverage: false, completeNegativeAnswer: false, searchTermination: false})});
      issued.set(result, actual); return result;
    } catch (error) {
      if (error instanceof VerificationAbort) return error.result;
      throw error;
    }
  });
}

/** Product direct strategy: no hypothetical candidates and no search-negative claim. */
export function verifyDirectActualSchema(actual: SemanticContext): Readonly<{
  kind: 'checked-direct' | 'inconclusive-direct'; frontier: FiniteRe01Frontier;
  unresolved: readonly NodeId[];
}> | FiniteVerificationFailure | ResourceLimitFailure {
  assertSemanticContext(actual);
  return actual.budget.guard(() => {
    try {
      const owner = createNativeFrontierOwner(actual);
      actual.budget.chargeWork(8 + owner.actualFrontier.requirements.length * 2);
      const unresolved = owner.actualFrontier.requirements.filter(item => !item.primitive).map(item => item.target);
      // Aggregate discharge is mandatory even when this strategy cannot prove RE01.
      owner.validateAggregate([]);
      return Object.freeze({kind: unresolved.length ? 'inconclusive-direct' : 'checked-direct',
        frontier: owner.actualFrontier, unresolved: Object.freeze(unresolved)});
    } catch (error) {
      if (error instanceof VerificationAbort) return error.result;
      throw error;
    }
  });
}
