/** Research-only sufficient recognition. No child search or production negative branch. */
import type {ComplexTypeNode, ElementNode, GraphNode, NodeId, ParticleNode} from '../../../src/compiler/canonicalGraph.js';
import {assertSemanticContext, contextsShareRequest} from '../../../src/compiler/semanticContext.js';
import type {SemanticContext} from '../../../src/compiler/semanticContext.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';
import {RE01_DERIVATION_DOMAIN} from '../../../src/compiler/re01TypeProperties.js';
import {re01Ancestor} from '../../../src/compiler/re01CandidateCorrespondence.js';
import {checkComponentConstruction} from '../../../src/compiler/schemaConstructionAssessment.js';
import {declaredType, resolveSemanticType, semanticTypeKey} from '../../../src/compiler/schemaTypeIdentity.js';
import {declarationMethods, immediateTypeBase, RelationProblem} from '../../../src/compiler/schemaTypeRelations.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import {prepareSemanticParticleView} from '../../../src/compiler/particleSemanticView.js';
import type {SemanticParticle} from '../../../src/compiler/particleSemanticView.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';

export type ConsumerSelection = Readonly<{target: NodeId; head: NodeId; member: NodeId; consumer: NodeId}>;
type Failure = Readonly<{kind: 'not-established' | 'unresolved' | 'invalid-input'; rule: string; component?: NodeId; message: string}>;
export type InheritedConsumerResult = Failure | ResourceLimitFailure | Readonly<{
  kind: 'proved-no-construction'; domain: typeof RE01_DERIVATION_DOMAIN;
  scope: 'complete-child-of-exact-parent';
  actualContextId: string; parentContextId: string; target: NodeId; head: NodeId; member: NodeId;
  headType: NodeId; consumer: NodeId; baseConsumer: NodeId;
} & ({criterion: 'inherited-three-position-consumer-v1'}
  | {criterion: 'inherited-flat-prefix-consumer-v1'; prefixLength: number})>;
class Stop extends Error {constructor(readonly result: InheritedConsumerResult) {super(result.kind);}}

/** IDs select operands; every decisive premise is read from authenticated owners.
 * A proof concerns this parent's target obligation, never immutable Γ or all roots.
 */
export function recognizeInheritedConsumerObstruction(actual: SemanticContext, parent: SemanticContext,
  selection: ConsumerSelection): InheritedConsumerResult {
  assertSemanticContext(actual); assertSemanticContext(parent);
  const b = parent.budget;
  return b.guard(() => {
    const publish = <T>(value: T): T => b.freeze(b.snapshot(value));
    const stop = (kind: Failure['kind'], rule: string, message: string, component?: string): never => {
      b.chargeWork(8); throw new Stop(publish({kind, rule, message, component}));
    };
    const match = (yes: boolean, rule: string): void => {
      b.chargeWork(); if (!yes) stop('not-established', rule, 'The sufficient consumer criterion does not match');
    };
    const checked = <T extends {kind: string}>(result: T): Extract<T, {kind: 'checked'}> => {
      if (result.kind === 'checked') return result as Extract<T, {kind: 'checked'}>;
      if (result.kind === 'resource-limit') throw new Stop(result as unknown as ResourceLimitFailure);
      const failure = result as {kind: string; rule?: string; message?: string; component?: string};
      return stop(['invalid-input', 'invalid-schema', 'candidate-rejected', 'invalid-evidence'].includes(failure.kind)
        ? 'invalid-input' : 'unresolved', failure.rule ?? 'qualification', failure.message ?? 'Missing owner qualification', failure.component);
    };
    const node = (id: string): GraphNode => {
      const found = parent.lookup(id);
      if (found.kind !== 'found') return stop('invalid-input', 'selected-component', 'Selected component is unavailable', id);
      return found.node;
    };
    const equal = (left: string, right: string): boolean => b.compareText(left, right) === 0;
    const key = (reference: SemanticTypeReference): string => {
      const found = resolveSemanticType(parent, reference);
      if (!('identity' in found)) return stop('unresolved', 'type-identity', 'Exact type identity is unavailable');
      return semanticTypeKey(parent, found.identity);
    };
    const sameType = (left: SemanticTypeReference, right: SemanticTypeReference) => equal(key(left), key(right));
    const local = (id: string): SemanticTypeReference => {b.chargeWork(2); return {kind: 'local', target: id};};
    const fresh = (id: string): boolean => actual.lookup(id).kind !== 'found';
    const unit = (p: {occurs: {min: string; max: string}}): boolean => p.occurs.min === '1' && p.occurs.max === '1';
    const raw = (type: ComplexTypeNode) => {
      const props = parent.rawTypeProperties(type.id);
      if (!props) return stop('unresolved', 'raw-type-properties', 'Complete abstract type properties are required', type.id);
      match(!parent.rawSimpleTypeProperties(type.id) && props.content.kind === 'element-only'
        && type.derivation?.kind === props.derivation.method && sameType(type.derivation.base, props.derivation.base)
        && 'particle' in props.content && type.content === props.content.particle, 'raw-canonical-selectors');
      return props;
    };
    const particle = (id: string): ParticleNode => {
      const found = node(id); match(found.kind === 'particle', 'consumer-particle'); return found as ParticleNode;
    };
    const root = (type: ComplexTypeNode) => {
      const props = raw(type);
      match(props.derivation.method === 'restriction' && !props.abstract && !props.final.length && !props.block.length
        && !props.attributeUses.length && !props.wildcard && !type.attributes.length, 'consumer-properties');
      const p = particle(type.content!);
      match(fresh(p.id) && unit(p) && p.term.kind === 'sequence'
        && p.term.children.length === 3, 'raw-three-position-sequence');
      return p as ParticleNode & {term: {kind: 'sequence'; children: readonly NodeId[]}};
    };
    const view = (type: ComplexTypeNode): SemanticParticle => {
      const content = checked(deriveRawComplexContent(parent, type.id)).view;
      return checked(prepareSemanticParticleView(parent, content, 'restriction')).view.root;
    };
    try {
      b.chargeWork(12);
      if (!contextsShareRequest(parent, actual) || actual.kind !== 'actual' || parent.originalContext() !== actual)
        return stop('invalid-input', 'context-relationship', 'Expected the exact immutable actual context of this parent');
      if (parent.kind !== 'candidate') return stop('not-established', 'inherited-parent', 'Immutable actual Γ is not an inherited candidate parent');
      for (const context of [actual, parent]) {
        b.chargeWork(4);
        if (context.membership !== 'complete-actual-plus-additions' || context.scalarSlotMembership !== 'complete-original'
          || context.notationMembership !== 'complete-original-plus-additions' || context.notationUniverse !== 'source-bound')
          return stop('unresolved', 'complete-context', 'Complete source-bound actual and parent environments are required');
      }
      const hints = b.snapshot(selection);
      if (!hints || ['target', 'head', 'member', 'consumer'].some(field => {
        b.chargeWork(); const value = hints[field as keyof ConsumerSelection]; return typeof value !== 'string' || !value;
      })) return stop('invalid-input', 'selection', 'Expected four component ID hints');
      const t = node(hints.target), h = node(hints.head), m = node(hints.member), c = node(hints.consumer);
      match(t.kind === 'complexType' && c.kind === 'complexType' && h.kind === 'element' && m.kind === 'element', 'selected-roles');
      const target = t as ComplexTypeNode, head = h as ElementNode, member = m as ElementNode, consumer = c as ComplexTypeNode;
      match(target.identity.kind === 'global' && head.identity.kind === 'global' && member.identity.kind === 'global'
        && !head.abstract && !member.abstract && !equal(head.id, member.id)
        && (head.name.namespace !== member.name.namespace || head.name.local !== member.name.local), 'exact-declarations');
      const headType = resolveSemanticType(parent, declaredType(parent, head));
      match(headType.kind === 'component' && headType.node.kind === 'complexType', 'complex-head-type');
      if (headType.kind !== 'component' || headType.node.kind !== 'complexType') throw new Error('Unreachable matched role');
      const e = headType.node;
      match(e.identity.kind === 'global' && !equal(e.id, target.id)
        && sameType(declaredType(parent, member), local(target.id)), 'distinct-exact-types');
      const affiliation = member.substitutionGroup && parent.resolve(member.substitutionGroup);
      match(affiliation?.kind === 'found' && equal(affiliation.node.id, head.id), 'direct-affiliation');
      match(!declarationMethods(parent, head, 'final').length
        && declarationMethods(parent, head, 'block').includes('restriction'), 'restriction-blocking');
      const targetRaw = raw(target);
      match(targetRaw.derivation.method === 'extension' && sameType(targetRaw.derivation.base, local(e.id)), 'target-extension');
      const construction = checked(checkComponentConstruction(parent, target.id));
      if (construction.obligations.length) return stop('unresolved', 'target-local-premises', 'Local qualification is incomplete', target.id);
      match(construction.re01?.primitive === false, 'nonprimitive-target');
      const ancestor = checked(re01Ancestor(parent, target.id));
      const immediate = checked(immediateTypeBase(parent, local(target.id))).value;
      match(!!immediate && sameType(immediate, local(e.id)) && !sameType(ancestor.ancestor, local(e.id)), 'forced-first-restriction');
      raw(e);
      // These are local declaration checks only. Their declared-type validity
      // dependencies do not assume the target's pending existential judgment.
      for (const declaration of [head, member]) {
        const result = checked(checkComponentConstruction(parent, declaration.id));
        if (result.obligations.length) return stop('unresolved', 'declaration-local-premises', 'Local declaration qualification is incomplete', declaration.id);
      }
      const consumerRaw = raw(consumer), base = resolveSemanticType(parent, consumerRaw.derivation.base);
      match(base.kind === 'component' && base.node.kind === 'complexType', 'consumer-base');
      if (base.kind !== 'component' || base.node.kind !== 'complexType') throw new Error('Unreachable matched role');
      const baseConsumer = base.node;
      match(fresh(consumer.id) && fresh(baseConsumer.id) && !equal(consumer.id, baseConsumer.id)
        && !equal(consumer.id, target.id) && !equal(baseConsumer.id, target.id)
        && !equal(baseConsumer.id, e.id) && !equal(consumer.id, e.id), 'mandatory-inherited-consumers');
      const derivedRoot = root(consumer), baseRoot = root(baseConsumer);
      match(sameType(raw(baseConsumer).derivation.base, local(e.id)), 'base-consumer-edge');
      const [prefix, middle, last] = derivedRoot.term.children;
      match(equal(prefix!, baseRoot.term.children[0]!) && equal(last!, baseRoot.term.children[2]!)
        && !fresh(prefix!), 'shared-original-prefix');
      const end = particle(last!), derivedUse = particle(middle!), baseUse = particle(baseRoot.term.children[1]!);
      match(unit(end) && end.term.kind === 'choice' && !end.term.children.length, 'required-empty-choice');
      const prefixRoot = particle(prefix!);
      match(prefixRoot.term.kind === 'element' || unit(prefixRoot) && prefixRoot.term.kind === 'sequence'
        && prefixRoot.term.children.length > 0, 'nonempty-flat-original-prefix');
      b.chargeWork();
      const prefixLeaves = prefixRoot.term.kind === 'sequence' ? prefixRoot.term.children : [prefixRoot.id];
      // Count ordered incidences, including repeated references, never a set of IDs.
      for (const id of prefixLeaves) {
        b.chargeWork(); const leaf = particle(id);
        match(!fresh(id) && leaf.occurs.min === '0' && leaf.occurs.max === '1'
          && leaf.term.kind === 'element', 'optional-original-local-prefix');
        if (leaf.term.kind !== 'element') throw new Error('Unreachable matched prefix');
        const declaration = parent.resolve(leaf.term.declaration);
        match(declaration.kind === 'found' && declaration.node.kind === 'element'
          && declaration.node.identity.kind === 'scoped'
          && (declaration.node.name.namespace !== member.name.namespace || declaration.node.name.local !== member.name.local),
        'local-prefix-declaration');
      }
      // Four distinct inherited identities prohibit both root and middle identity shortcuts.
      b.chargeWork(10);
      match(new Set([derivedRoot.id, baseRoot.id, derivedUse.id, baseUse.id]).size === 4
        && fresh(derivedUse.id) && fresh(baseUse.id), 'distinct-inherited-particles');
      for (const [use, declaration] of [[derivedUse, member], [baseUse, head]] as const) {
        match(unit(use) && use.term.kind === 'element', 'required-declaration-use');
        if (use.term.kind !== 'element') throw new Error('Unreachable matched particle');
        const found = parent.resolve(use.term.declaration);
        match(found.kind === 'found' && equal(found.node.id, declaration.id), 'exact-middle-reference');
      }
      for (const type of [consumer, baseConsumer]) {
        const normalized = view(type);
        const positions = prefixLeaves.length + 2;
        match(unit(normalized) && normalized.kind === 'sequence' && normalized.children.length === positions
          && normalized.orderBlocks.length === positions && normalized.orderBlocks.every(block => {
            b.chargeWork(); return block.kind === 'explicit' && block.children.length === 1;
          }), 'flat-prefix-explicit-normalized-positions');
        for (let index = 0; index < prefixLeaves.length; index++) {
          b.chargeWork(); const first = normalized.children[index]!;
          match(first.kind === 'element' && first.element?.identity.kind === 'scoped'
            && first.occurs.min === '0' && first.occurs.max === '1' && !first.children.length
            && (first.element.name.namespace !== member.name.namespace || first.element.name.local !== member.name.local), 'local-prefix');
        }
        const mid = normalized.children[prefixLeaves.length], final = normalized.children[prefixLeaves.length + 1];
        match(final!.kind === 'choice' && unit(final!) && !final!.children.length && final!.originalParticle === end.id, 'retained-empty-choice');
        match(unit(mid!) && mid!.originalParticle === (type === consumer ? derivedUse.id : baseUse.id)
          && (mid!.kind === 'element' || mid!.kind === 'choice' && mid!.orderUnspecified
            && mid!.children.every(leaf => {b.chargeWork(); return leaf.kind === 'element' && !leaf.originalParticle;})), 'middle-view');
      }
      b.chargeWork(16);
      return publish({kind: 'proved-no-construction', domain: RE01_DERIVATION_DOMAIN,
        ...(prefixLeaves.length === 1 ? {criterion: 'inherited-three-position-consumer-v1'} as const
          : {criterion: 'inherited-flat-prefix-consumer-v1', prefixLength: prefixLeaves.length} as const),
        scope: 'complete-child-of-exact-parent',
        actualContextId: actual.contextId, parentContextId: parent.contextId, target: target.id,
        head: head.id, member: member.id, headType: e.id, consumer: consumer.id, baseConsumer: baseConsumer.id} as const);
    } catch (error) {
      if (error instanceof Stop) return error.result;
      if (error instanceof RelationProblem) return publish({kind: error.result.kind, rule: error.result.rule,
        message: error.message, component: error.result.component} as const);
      throw error;
    }
  });
}
