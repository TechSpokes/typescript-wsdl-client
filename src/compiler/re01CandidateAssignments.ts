/** Input-derived finite middle recipes; neither a complete catalogue nor dated-XSD admission. */
import {createHash} from 'node:crypto';
import {globalId} from './canonicalGraph.js';
import type {ComplexTypeNode, NodeId, GraphNode, AttributeNode, AttributeUseNode} from './canonicalGraph.js';
import {allocateHypotheticalScopedIdentity, semanticIdentityTuple} from './hypotheticalScopedIdentity.js';
import {assertSemanticContext, contextsShareRequest, forkSemanticCandidate} from './semanticContext.js';
import type {CandidatePreparation, SemanticCandidateDelta, SemanticContext} from './semanticContext.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from './complexTypeContent.js';
import {assessSourceAttributeUses} from './schemaAttributeUses.js';
import {declarationMethods, immediateTypeBase} from './schemaTypeRelations.js';
import {resolveSemanticType, semanticTypeKey} from './schemaTypeIdentity.js';
import {re01Ancestor} from './re01CandidateCorrespondence.js';
import type {CorrespondenceFailure} from './re01CandidateCorrespondence.js';
import type {RawComplexTypeProperties} from './re01TypeProperties.js';
import type {SemanticTypeReference, SemanticTypeDependency} from './semanticTypeReference.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import type {FiniteRe01EvidenceNode} from './finiteRe01Verification.js';

/**
 * The retained context plus one native delta is the shared physical assignment.
 * BASE/TYPE/SCOPE/SG, BODY/CODE, scalar first modes, providers, WORD/maps and
 * VALUE slots retain their actual identities; no projected scalar palette is
 * copied into a second graph. New producers must assemble their choices into
 * this same native representation before replay, not supply independent receipts.
 */
export type SharedRe01Assignment = Readonly<{
  kind: 'prepared-local-assignment';
  family: 'inherited-primitive-middle-v1' | 'fresh-source-middle-v1';
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

/** Reconstruct only through native property owners; a producer cannot issue validity evidence. */
function mapSharedProperties(actual: SemanticContext, parent: SemanticContext, node: ComplexTypeNode,
  scalarObligations: ScalarObligation[], typeDependencies: SemanticTypeDependency[],
  outside: (rule: string, message: string) => CorrespondenceFailure): RawComplexTypeProperties | CorrespondenceFailure | ResourceLimitFailure {
  const b = parent.budget;
  const prior = parent.rawTypeProperties(node.id);
  if (prior) return prior;
  if (!(parent.kind === 'actual' ? parent.originalComplexContentSource(node.id) : parent.originalComplexPropertySource(node.id)))
    return outside('assignment-target-properties', 'Inherited fresh or changed types require native RAW properties');
  const content = deriveActualComplexContent(actual, node.id);
  if (content.kind !== 'checked') return content.kind === 'resource-limit' ? content : outside(content.rule, content.message);
  let body = content.view.content;
  if ('particle' in body) {
    const whole = deriveOriginalComplexParticle(actual, node.id);
    if (whole.kind !== 'checked') return whole.kind === 'resource-limit' ? whole : outside(whole.rule, whole.message);
    body = whole.content;
  }
  // @why Keep genuine named/builtin/inherited scalar references; only restrictions own registered GSC1 slots.
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
}

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
    const mapProperties = (node: ComplexTypeNode) => mapSharedProperties(actual, parent, node, scalarObligations, typeDependencies, outside);
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

export type FreshAssignments = Readonly<{kind: 'prepared-fresh-assignments'; assignments: readonly SharedRe01Assignment[]; universalCoverage: false}>;
/**
 * Propose one fresh E from native target properties over the designated ancestor.
 * @remarks E preserves target attribute identities; its body is supplied by native source properties,
 *   or the simple ancestor itself. For particle content, native extension checking must establish the retained prefix.
 *   Native correspondence and finite closure decide legality.
 *   Declining this limited family proves no nonexistence or dated-XSD eligibility.
 */
export function prepareFreshMiddleAssignments(actual: SemanticContext, parent: SemanticContext, target: NodeId): FreshAssignments | CorrespondenceFailure | ResourceLimitFailure {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget;
  return b.guard(() => {
    b.chargeWork(16 + target.length);
    if (!contextsShareRequest(actual, parent) || actual !== parent.originalContext()) throw new TypeError('Expected one actual native request');
    const outside = (rule: string, message: string): CorrespondenceFailure => Object.freeze({kind: 'unresolved', rule, message, component: target, contextId: parent.contextId});
    if (actual.kind !== 'actual' || actual.membership !== 'complete-actual-plus-additions' || parent.membership !== 'complete-actual-plus-additions')
      return outside('complete-domain-membership', 'Fresh construction requires complete actual and parent membership');
    const selected = parent.lookup(target);
    if (selected.kind !== 'found' || selected.node.kind !== 'complexType') return outside('assignment-target', 'An available complex extension is required');
    const scalarObligations: ScalarObligation[] = [], typeDependencies: SemanticTypeDependency[] = [];
    const properties = mapSharedProperties(actual, parent, selected.node, scalarObligations, typeDependencies, outside);
    if ('kind' in properties) return properties;
    if (properties.derivation.method !== 'extension') return outside('assignment-target', 'This family handles extension targets');
    const designated = re01Ancestor(parent, target);
    if (designated.kind !== 'checked') return designated;
    typeDependencies.push(...designated.typeDependencies);
    const ancestor = resolveSemanticType(parent, designated.ancestor);
    let body = properties.content;
    if (ancestor.kind === 'builtin' && ancestor.name.local !== 'anyType') body = {kind: 'simple', type: designated.ancestor};
    else if (ancestor.kind === 'component' && ancestor.node.kind === 'complexType') {
      const source = mapSharedProperties(actual, parent, ancestor.node, scalarObligations, typeDependencies, outside);
      if ('kind' in source) return source;
      if (source.content.kind === 'simple') body = source.content;
      else if (source.content.kind === 'opaque-builtin') return outside('fresh-middle-content-family', 'Opaque ancestor content is not represented');
    } else return outside('fresh-middle-content-family', 'The designated ancestor is outside this family');
    if (designated.ancestor.kind === 'original-generated') return outside('fresh-middle-base-family', 'A canonical carrier base is required');
    const namespace = properties.targetNamespace ?? selected.node.context.effectiveNamespace;
    let ordinal = 0, name: {namespace: string; local: string}, intermediate: string;
    do {
      b.chargeWork(128 + target.length);
      name = {namespace, local: 'Re01Middle_' + createHash('sha256').update(target + ':' + ordinal++).digest('hex').slice(0, 24)};
      intermediate = globalId('type', name);
    } while (parent.lookup(intermediate).kind !== 'missing');
    const middle: ComplexTypeNode = {...selected.node, id: intermediate, identity: {kind: 'global', role: 'type', name},
      context: {...selected.node.context, effectiveNamespace: namespace}, mixed: body.kind === 'mixed', abstract: false,
      content: undefined, attributes: [], declaredAttributes: [], annotations: [], retained: [], syntaxDetails: [],
      derivation: {kind: 'extension', contentKind: body.kind === 'simple' ? 'simple' : 'complex', base: designated.ancestor, facets: []}};
    const base = {kind: 'local' as const, target: intermediate};
    const endpoint: ComplexTypeNode = {...selected.node,
      derivation: {kind: 'restriction', contentKind: properties.content.kind === 'simple' ? 'simple' : 'complex', base, facets: []}};
    const rawMiddle: RawComplexTypeProperties = {type: intermediate, targetNamespace: namespace,
      derivation: {method: 'extension', base: designated.ancestor}, abstract: false, final: [], block: [], content: body,
      attributeUses: properties.attributeUses, wildcard: properties.wildcard,
      provenance: {kind: 'hypothetical-abstract', originals: [target]}};
    const delta = b.freeze({key: 'fresh-source-middle:' + target + ':' + intermediate, endpoint, additions: [middle],
      active: [...parent.members, intermediate], rawTypes: [{...properties, derivation: {method: 'restriction' as const, base}}, rawMiddle]});
    const assignment: SharedRe01Assignment = Object.freeze({kind: 'prepared-local-assignment', family: 'fresh-source-middle-v1',
      actual, parent, target, intermediate, ancestor: designated.ancestor, delta,
      scalarObligations: b.freeze(b.snapshot(scalarObligations)), typeDependencies: b.freeze(b.snapshot(typeDependencies)), introducedStoredNonprimitive: 0});
    issued.add(assignment);
    return Object.freeze({kind: 'prepared-fresh-assignments', assignments: Object.freeze([assignment]), universalCoverage: false});
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

export type AdditiveRestrictionPreparation = Readonly<{
  kind: 'prepared-additive-restriction'; actual: SemanticContext; context: SemanticContext;
  target: NodeId; intermediate: NodeId; representative: NodeId;
  scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[];
}>;

export type AdditiveMiddlePreparation = Readonly<{
  kind: 'prepared-additive-middle'; actual: SemanticContext; context: SemanticContext;
  target: NodeId; intermediate: NodeId; ancestor: SemanticTypeReference;
  scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[];
}>;

/** Propose only a fresh extension middle; the actual target is never replaced or represented by another type.
 * @remarks Native local construction, dependency closure and any paired restriction predicate remain separate checks.
 * @returns An additive native context or explicit unavailability/resource result.
 * @throws TypeError For a non-actual context.
 */
export function prepareAdditiveExtensionMiddle(actual: SemanticContext, target: NodeId):
  AdditiveMiddlePreparation | CorrespondenceFailure | ResourceLimitFailure | Exclude<CandidatePreparation, {kind: 'prepared'}> {
  assertSemanticContext(actual);
  if (actual.kind !== 'actual') throw new TypeError('Actual source context required');
  const b = actual.budget;
  return b.guard(() => {
    const proposed = prepareFreshMiddleAssignments(actual, actual, target);
    if (proposed.kind !== 'prepared-fresh-assignments') return proposed;
    const assignment = proposed.assignments[0];
    if (!assignment) return Object.freeze({kind: 'unresolved', rule: 'additive-middle-family', component: target,
      message: 'The limited fresh-middle family supplied no assignment'});
    const source = assessSourceAttributeUses(actual, target);
    if (source.kind !== 'checked') return source;
    const middle = assignment.delta.additions![0]!;
    if (middle.kind !== 'complexType') throw new TypeError('Fresh complex middle required');
    const raw = assignment.delta.rawTypes!.find(properties => properties.type === assignment.intermediate)!;
    b.chargeWork(16); const additions: GraphNode[] = [], uses: NodeId[] = [];
    const forbiddenIds = new Set<string>(), forbiddenTuples = new Set<string>();
    const allocate = (role: string) => {
      const allocated = allocateHypotheticalScopedIdentity(middle.id, role, forbiddenIds, forbiddenTuples, b.chargeWork);
      b.chargeWork(4 + allocated.id.length);
      forbiddenIds.add(allocated.id); forbiddenTuples.add(semanticIdentityTuple(allocated.identity, b.chargeWork));
      return allocated;
    };
    for (const use of source.value.uses) {
      b.chargeWork(32);
      let declaration = use.declaration;
      if (declaration.identity.kind !== 'global') {
        // @why A fresh middle must own its local declarations; a reference to a D-scoped declaration is not an E scope.
        if (declaration.name.namespace !== '' && declaration.name.namespace !== raw.targetNamespace) return Object.freeze({kind: 'unresolved',
          rule: 'additive-owned-attribute-namespace', component: target, message: 'A foreign qualified local attribute is outside this fresh-owned family'});
        const slot = allocate('attribute');
        const copied: AttributeNode = {...declaration, id: slot.id, identity: slot.identity, value: undefined,
          declaredAttributes: [], syntaxDetails: [], retained: []};
        declaration = copied; additions.push(copied);
      }
      const slot = allocate('attributeUse');
      const copied: AttributeUseNode = {...use.source, id: slot.id, identity: slot.identity,
        declaration: {kind: 'local', target: declaration.id}, use: use.required ? 'required' : 'optional',
        value: use.effective ? {kind: use.effective.kind, lexical: use.effective.value.lexical} : undefined,
        declaredAttributes: [], syntaxDetails: [], retained: []};
      b.chargeWork(24); additions.push(copied); uses.push(copied.id);
    }
    const delta = b.freeze({key: 'additive-middle-owned-attributes:' + assignment.delta.key,
      additions: [{...middle, attributes: uses}, ...additions], active: [...actual.members, middle.id, ...additions.map(node => node.id)],
      rawTypes: [{...raw, attributeUses: uses}]});
    const built = forkSemanticCandidate(actual, delta);
    if (built.kind !== 'prepared') return built;
    b.chargeWork(128);
    return Object.freeze({kind: 'prepared-additive-middle', actual, context: built.context, target,
      intermediate: assignment.intermediate, ancestor: assignment.ancestor,
      scalarObligations: b.freeze([...assignment.scalarObligations, ...source.scalarObligations]),
      typeDependencies: b.freeze([...assignment.typeDependencies, ...source.typeDependencies])});
  });
}

/** Propose fresh extension and restriction representatives without replacing any actual component.
 * @remarks The restriction representative has the target's effective properties with a fresh identity and base.
 *   This is construction input, not a derivation or correspondence certificate. Native checking, dependency closure
 *   and the relation between the representative and the original target remain separate obligations.
 * @returns A native prepared additive context or an explicit unavailable/resource result.
 * @throws TypeError For a non-actual context.
 */
export function prepareAdditiveRestrictionRepresentative(actual: SemanticContext, target: NodeId):
  AdditiveRestrictionPreparation | CorrespondenceFailure | ResourceLimitFailure | Exclude<CandidatePreparation, {kind: 'prepared'}> {
  assertSemanticContext(actual);
  if (actual.kind !== 'actual') throw new TypeError('Actual source context required');
  const b = actual.budget;
  return b.guard(() => {
    const proposed = prepareFreshMiddleAssignments(actual, actual, target);
    if (proposed.kind !== 'prepared-fresh-assignments') return proposed;
    const assignment = proposed.assignments[0];
    if (!assignment) return Object.freeze({kind: 'unresolved', rule: 'additive-restriction-family', component: target,
      message: 'The limited fresh-middle family supplied no assignment'});
    const endpoint = assignment.delta.endpoint!;
    const properties = assignment.delta.rawTypes!.find(properties => properties.type === target)!;
    const namespace = properties.targetNamespace ?? endpoint.context.effectiveNamespace;
    let ordinal = 0, name: {namespace: string; local: string}, representative: NodeId;
    do {
      b.chargeWork(128 + target.length);
      name = {namespace, local: 'Re01Restriction_' + createHash('sha256').update(target + ':' + ordinal++).digest('hex').slice(0, 24)};
      representative = globalId('type', name);
    } while (representative === assignment.intermediate || actual.lookup(representative).kind !== 'missing');
    const node: ComplexTypeNode = {...endpoint, id: representative, identity: {kind: 'global', role: 'type', name}};
    const delta = b.freeze({key: 'additive-restriction:' + assignment.delta.key,
      additions: [...assignment.delta.additions!, node], active: [...assignment.delta.active, representative],
      rawTypes: [...assignment.delta.rawTypes!.filter(properties => properties.type !== target),
        {...properties, type: representative, provenance: {kind: 'hypothetical-abstract' as const, originals: [target]}}]});
    const built = forkSemanticCandidate(actual, delta);
    if (built.kind !== 'prepared') return built;
    b.chargeWork(128);
    return Object.freeze({kind: 'prepared-additive-restriction', actual, context: built.context,
      target, intermediate: assignment.intermediate, representative,
      scalarObligations: assignment.scalarObligations, typeDependencies: assignment.typeDependencies});
  });
}
