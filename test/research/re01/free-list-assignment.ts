/** Input-derived, exact-ITEM first-enumeration LIST cohort; no general catalogue claim. */
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, NodeId, Reference, SimpleTypeNode} from '../../../src/compiler/canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest, forkSemanticCandidate, storedIdentityOccupant} from '../../../src/compiler/semanticContext.js';
import type {ContextFailure, SemanticCandidateDelta, SemanticContext} from '../../../src/compiler/semanticContext.js';
import {allocateHypotheticalScopedIdentity, semanticIdentityTuple} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import type {CorrespondenceFailure} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {declarationMethods, immediateTypeBase} from '../../../src/compiler/schemaTypeRelations.js';
import type {RelationFailure} from '../../../src/compiler/schemaTypeRelations.js';
import {declaredType, resolveSemanticType, semanticTypeKey} from '../../../src/compiler/schemaTypeIdentity.js';
import {createSchemaScalarKernel} from '../../../src/compiler/schemaScalarKernel.js';
import {readElementIdentityConstraints} from '../../../src/compiler/schemaIdentityConstraints.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import {verifyFiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {FiniteCandidateReceipt, FiniteRe01Evidence} from '../../../src/compiler/finiteRe01Verification.js';
import type {RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawSimpleTypeProperties} from '../../../src/compiler/schemaSimpleTypeProperties.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';

export type FreeListAssignment = Readonly<{
  family: 'exact-item-free-list-v1'; actual: SemanticContext; parent: SemanticContext; target: NodeId;
  intermediate: NodeId; delta: SemanticCandidateDelta; context: SemanticContext;
  cohorts: readonly Readonly<{head: NodeId; field: NodeId; item: Reference; preparation: NodeId; enumeration: NodeId; member: NodeId}>[];
  forest: FiniteRe01Evidence; receipt: FiniteCandidateReceipt;
  /** Counted from every born complex row after preparation and native verification. */
  introducedStoredNonprimitive: number;
}>;
export type FreeListAssignments = Readonly<{kind: 'prepared-free-list-assignments'; assignments: readonly FreeListAssignment[];
  scope: 'exact-item-free-list-v1'; universalCoverage: false}>;
export type FreeListPreparation = FreeListAssignments | CorrespondenceFailure | ContextFailure | RelationFailure | ResourceLimitFailure;
const issued = new WeakSet<FreeListAssignment>();
class Outside extends Error {constructor(readonly failure: CorrespondenceFailure) {super(failure.rule);}}

export function assertFreeListAssignment(assignment: FreeListAssignment): void {
  if (!issued.has(assignment)) throw new TypeError('Unauthenticated free-LIST assignment');
}

/**
 * Recognizable initial sector: original parent; A R anyType with a flat CHOICE
 * of distinct optional LOCAL fixed LIST fields; empty R R A; target D E R
 * with a flat CHOICE of equally many unrelated empty abstract GLOBAL heads.
 * All heads and fields have the same original direct LIST constructor/ITEM.
 * No caller roster, successful forest, helper bound or scalar palette is input.
 * Unsupported shapes and failed native candidates never prove nonexistence.
 */
export function prepareFreeListAssignments(actual: SemanticContext, parent: SemanticContext, target: NodeId): FreeListPreparation {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget;
  return b.guard(() => {
    const fail = (rule: string, message: string, component = target): never => {
      b.chargeWork(20 + rule.length + message.length + component.length);
      throw new Outside(Object.freeze({kind: 'unresolved', rule, message, component, contextId: parent.contextId}));
    };
    try {
      b.chargeWork(20 + target.length);
      if (!contextsShareRequest(actual, parent) || actual !== parent.originalContext()) throw new TypeError('Expected the actual context of this request');
      if (actual.kind !== 'actual' || parent !== actual || actual.membership !== 'complete-actual-plus-additions')
        return fail('free-list-sector', 'This initial free-LIST sector requires the complete original parent');
      const get = (id: NodeId): GraphNode => {
        b.chargeWork(2 + id.length); const found = parent.lookup(id);
        return found.kind === 'found' ? found.node : fail('free-list-availability', 'A required input component is unavailable', id);
      };
      const complex = (id: NodeId): ComplexTypeNode => {const node = get(id); return node.kind === 'complexType' ? node : fail('free-list-sector', 'Expected a complex type', id);};
      const local = (id: NodeId): Reference => {b.chargeWork(2 + id.length); return {kind: 'local', target: id};};
      const resolvedId = (reference: SemanticTypeReference): NodeId => {
        if (reference.kind === 'original-generated') return fail('free-list-sector', 'A generated scalar requires a separate nominal sector');
        const found = parent.resolve(reference); return found.kind === 'found' ? found.node.id : fail('free-list-sector', 'Expected a retained component reference');
      };
      const sameType = (left: SemanticTypeReference, right: SemanticTypeReference): boolean => {
        const a = resolveSemanticType(parent, left), z = resolveSemanticType(parent, right);
        return 'identity' in a && 'identity' in z && b.compareText(semanticTypeKey(parent, a.identity), semanticTypeKey(parent, z.identity)) === 0;
      };
      const endpointBefore = complex(target), designated = re01Ancestor(parent, target);
      if (designated.kind !== 'checked') return designated;
      const ancestor = resolveSemanticType(parent, designated.ancestor);
      if (ancestor.kind !== 'component' || ancestor.node.kind !== 'complexType') return fail('free-list-sector', 'Expected a retained complex ancestor');
      const a = ancestor.node, r = endpointBefore.derivation && parent.resolve(endpointBefore.derivation.base);
      const ur = a.derivation?.base;
      if (endpointBefore.derivation?.kind !== 'extension' || !r || r.kind !== 'found' || r.node.kind !== 'complexType'
        || r.node.derivation?.kind !== 'restriction' || resolvedId(r.node.derivation.base) !== a.id || r.node.content
        || a.derivation?.kind !== 'restriction' || ur?.kind !== 'builtin' || ur.name.local !== 'anyType'
        || ur.name.namespace !== 'http://www.w3.org/2001/XMLSchema') return fail('free-list-sector', 'Expected the A / empty restriction / extension nominal frame');
      for (const node of [a, r.node, endpointBefore]) {
        b.chargeWork(8 + node.attributes.length);
        if (node.mixed || node.attributes.length || declarationMethods(parent, node, 'final').length
          || declarationMethods(parent, node, 'block').length || parent.rawTypeProperties(node.id))
          return fail('free-list-sector', 'The initial ordinary frame has no mixed, AU, final/block or RAW overrides', node.id);
      }
      const arms = (owner: ComplexTypeNode): readonly ElementNode[] => {
        const root = owner.content && get(owner.content);
        if (!root || root.kind !== 'particle' || root.term.kind !== 'choice' || root.occurs.min !== '1' || root.occurs.max !== '1'
          || root.term.children.length < 2) return fail('free-list-sector', 'Expected a flat nontrivial unit CHOICE', owner.id);
        b.chargeWork(4 + root.term.children.length); const result: ElementNode[] = [];
        for (const child of root.term.children) {
          const p = get(child);
          if (p.kind !== 'particle' || p.term.kind !== 'element' || p.occurs.max !== '1'
            || p.occurs.min !== (owner === a ? '0' : '1')) return fail('free-list-sector', 'Unexpected ordinary arm shape', child);
          const e = get(resolvedId(p.term.declaration));
          if (e.kind !== 'element') return fail('free-list-sector', 'Expected an ELEMENT arm', child);
          b.chargeWork(); result.push(e);
        }
        return result;
      };
      const fields = arms(a), heads = arms(endpointBefore);
      if (fields.length !== heads.length) return fail('free-list-sector', 'The LOCAL and HEAD portfolios have different arities');
      const listId = resolvedId(declaredType(parent, fields[0]!)), list = get(listId);
      if (list.kind !== 'simpleType' || list.variety.kind !== 'list' || parent.rawSimpleTypeProperties(list.id)
        || declarationMethods(parent, list, 'final').length) return fail('free-list-sector', 'Expected one original direct enum-free LIST constructor');
      b.chargeWork(4); const names = new Set<string>(), headIds = new Set<string>();
      for (let i = 0; i < fields.length; i++) {
        b.chargeWork(16); const field = fields[i]!, head = heads[i]!;
        b.chargeWork(64 + 6 * (field.name.namespace.length + field.name.local.length)); const name = globalId('element', field.name);
        if (field.identity.kind !== 'scoped' || field.value?.kind !== 'fixed' || field.nillable
          || head.identity.kind !== 'global' || !head.abstract || head.nillable || head.value || head.substitutionGroup
          || parent.incomingAffiliates(head.id).length || names.has(name) || headIds.has(head.id)
          || storedIdentityOccupant(parent, {kind: 'global', role: 'element', name: field.name}) !== undefined
          || resolvedId(declaredType(parent, field)) !== list.id || resolvedId(declaredType(parent, head)) !== list.id
          || declarationMethods(parent, field, 'block').length || declarationMethods(parent, head, 'block').length
          || declarationMethods(parent, head, 'final').length)
          return fail('free-list-sector', 'The retained FIELD/HEAD ports do not satisfy the exact-ITEM sector');
        for (const element of [field, head]) {
          const constraints = readElementIdentityConstraints(parent, element.id);
          if (constraints.kind === 'resource-limit') return constraints;
          if (constraints.kind !== 'checked' || constraints.value.length) return fail('free-list-sector', 'IC ports require a separate transport', element.id);
        }
        b.chargeWork(name.length + head.id.length + 4); names.add(name); headIds.add(head.id);
      }
      // Derive every ordinary consumer of these heads; unrelated readers are a
      // protected boundary, not silently rewritten when new members are born.
      b.chargeWork(4); const headParticles = new Set<NodeId>();
      const targetRoot = get(endpointBefore.content!);
      if (targetRoot.kind !== 'particle' || targetRoot.term.kind !== 'choice') return fail('free-list-sector', 'Missing HEAD owner');
      for (const child of targetRoot.term.children) {b.chargeWork(); headParticles.add(child);}
      for (const id of parent.members) {
        const node = get(id);
        if (node.kind === 'particle' && node.term.kind === 'element' && headIds.has(resolvedId(node.term.declaration)) && !headParticles.has(id))
          return fail('free-list-sector', 'An additional ordinary HEAD consumer is protected', id);
        if (node.kind === 'complexType' && node.id !== target && node.derivation?.kind === 'extension') {
          const base = immediateTypeBase(parent, local(node.id)), anc = re01Ancestor(parent, node.id);
          if (base.kind === 'resource-limit') return base;
          if (anc.kind !== 'checked') return anc;
          if (base.kind !== 'checked' || !base.value || !sameType(base.value, anc.ancestor))
            return fail('free-list-sector', 'An additional nonprimitive original obligation requires a separate forest', id);
        }
      }
      const bodyA = deriveOriginalComplexParticle(actual, a.id), bodyD = deriveOriginalComplexParticle(actual, target);
      if (bodyA.kind !== 'checked') return bodyA;
      if (bodyD.kind !== 'checked') return bodyD;
      const inherited = deriveActualComplexContent(actual, r.node.id); if (inherited.kind !== 'checked') return inherited;
      const kernel = createSchemaScalarKernel(parent);
      for (const field of fields) {
        const value = kernel.assess(local(list.id), field.value!.lexical, field.id);
        if (value.kind === 'resource-limit') return value;
        if (value.kind !== 'checked') return fail('free-list-tuple-funding', 'A required complete tuple is not admitted by its retained LIST', field.id);
      }
      // Exact direct LIST constructors have just their genuine fixed collapse
      // component. No public property equality is used to alias hidden programs.
      b.chargeWork(8); const forbiddenIds = new Set<NodeId>(), forbiddenTuples = new Set<string>();
      const allocate = (owner: NodeId) => {
        for (;;) {
          const identity = allocateHypotheticalScopedIdentity(owner, 'type', forbiddenIds, forbiddenTuples, b.chargeWork);
          b.chargeWork(identity.id.length + 4); forbiddenIds.add(identity.id);
          const tuple = semanticIdentityTuple(identity.identity, b.chargeWork); b.chargeWork(tuple.length + 2); forbiddenTuples.add(tuple);
          if (parent.lookup(identity.id).kind === 'missing' && storedIdentityOccupant(parent, identity.identity) === undefined) return identity;
        }
      };
      const common = {context: a.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
      const middleIdentity = allocate(target);
      b.chargeWork(32); const middle: ComplexTypeNode = {...common, id: middleIdentity.id, identity: middleIdentity.identity, kind: 'complexType', abstract: false, mixed: false, attributes: [],
        derivation: {kind: 'extension', contentKind: 'complex', base: local(a.id), facets: []}};
      b.chargeWork(16 + fields.length * 6); const additions: GraphNode[] = [middle], rawSimpleTypes: RawSimpleTypeProperties[] = [],
        rawElements: NonNullable<SemanticCandidateDelta['rawElements']>[number][] = [], cohorts: FreeListAssignment['cohorts'][number][] = [];
      const scalar = (base: Reference, owner: NodeId) => {
        const allocated = allocate(owner); b.chargeWork(24);
        const node: SimpleTypeNode = {...common, id: allocated.id, identity: allocated.identity, kind: 'simpleType', variety: {kind: 'restriction', base, facets: []}};
        b.chargeWork(); additions.push(node); return node;
      };
      for (let i = 0; i < fields.length; i++) {
        b.chargeWork(64); const field = fields[i]!, head = heads[i]!, l0 = scalar(local(list.id), middle.id), l1 = scalar(local(l0.id), middle.id);
        rawSimpleTypes.push({type: l0.id, targetNamespace: a.context.effectiveNamespace, base: local(list.id), final: [],
          variety: {kind: 'list', item: list.variety.item}, facetComponentSet: [{baseComponent: 0}], provenance: {kind: 'hypothetical-abstract', originals: []}},
        {type: l1.id, targetNamespace: a.context.effectiveNamespace, base: local(l0.id), final: [], variety: {kind: 'list', item: list.variety.item},
          facetComponentSet: [{baseComponent: 0}, {annotation: 'absent', facets: [{name: 'enumeration', fixed: false, lexical: field.value!.lexical,
            operand: {context: 'active', type: local(l0.id), owner: middle.id}}]}], provenance: {kind: 'hypothetical-abstract', originals: []}});
        const name = field.name;
        b.chargeWork(64 + 6 * (name.namespace.length + name.local.length)); const id = globalId('element', name);
        const member: ElementNode = {...common, context: field.context, kind: 'element', id, identity: {kind: 'global', role: 'element', name}, name,
          type: local(l1.id), abstract: false, nillable: false, substitutionGroup: local(head.id), value: field.value};
        additions.push(member); rawElements.push({element: id, type: member.type, final: [], block: []});
        cohorts.push({head: head.id, field: field.id, item: list.variety.item, preparation: l0.id, enumeration: l1.id, member: id});
      }
      const raw = (node: ComplexTypeNode, content: RawComplexTypeProperties['content']): RawComplexTypeProperties => {
        b.chargeWork(24); return {type: node.id, targetNamespace: node.context.effectiveNamespace, derivation: {method: node.derivation!.kind, base: node.derivation!.base},
          abstract: node.abstract, final: [], block: [], content, attributeUses: [], provenance: {kind: 'hypothetical-abstract', originals: []}};
      };
      b.chargeWork(24); const endpoint: ComplexTypeNode = {...endpointBefore, derivation: {kind: 'restriction', contentKind: 'complex', base: local(middle.id), facets: []}};
      b.chargeWork(32 + parent.members.length + additions.length * 2 + target.length);
      const delta = b.freeze({key: 'free-list:' + target, active: [...parent.members, ...additions.map(node => node.id)], additions, endpoint,
        rawSimpleTypes, rawElements, rawTypes: [raw(a, bodyA.content), raw(r.node, inherited.view.content), raw(middle, bodyA.content), raw(endpoint, bodyD.content)]});
      const built = forkSemanticCandidate(parent, delta); if (built.kind !== 'prepared') return built;
      // A root with no nonprimitive descendants is complete only after the
      // native aggregate checks all roots, SOURCE, scalar and owner duties.
      b.chargeWork(32); const forest: FiniteRe01Evidence = Object.freeze({root: delta.key, nodes: Object.freeze([Object.freeze({id: delta.key, parent,
        context: built.context, target, intermediate: middle.id, ancestor: designated.ancestor, premises: Object.freeze([])})])});
      const receipt = verifyFiniteRe01Evidence(actual, target, forest); if (receipt.kind !== 'checked-candidate') return receipt;
      let introducedStoredNonprimitive = 0;
      for (const node of additions) {
        b.chargeWork(8);
        if (node.kind !== 'complexType' || node.derivation?.kind !== 'extension') continue;
        const constructed = receipt.proof[0]!.components.find(at => {b.chargeWork(2 + at.component.length + node.id.length); return at.component === node.id;});
        if (!constructed?.re01?.primitive) introducedStoredNonprimitive++;
      }
      b.chargeWork(40 + cohorts.length * 8);
      const assignment: FreeListAssignment = Object.freeze({family: 'exact-item-free-list-v1', actual, parent, target, intermediate: middle.id,
        delta, context: built.context, cohorts: b.freeze(b.snapshot(cohorts)), forest, receipt, introducedStoredNonprimitive});
      issued.add(assignment);
      return Object.freeze({kind: 'prepared-free-list-assignments', assignments: Object.freeze([assignment]), scope: 'exact-item-free-list-v1', universalCoverage: false});
    } catch (error) {if (error instanceof Outside) return error.failure; throw error;}
  });
}
