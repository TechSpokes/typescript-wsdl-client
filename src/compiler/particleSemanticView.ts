/** Authenticated declared/restriction views; all summaries come from the single S06 occurrence owner. */
import type {ElementNode, GraphNode, NodeId, Occurs, ParticleNode, Wildcard} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import {semanticContextGraphMetadata} from './semanticContext.js';
import {assertParticleContentView, particleContentNode} from './complexTypeContent.js';
import type {ParticleContentView} from './complexTypeContent.js';
import {analyzeOccurrences, occurrenceAlgebra} from './occurrenceAnalysis.js';
import type {ParticleSummary} from './occurrenceAnalysis.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import {effectiveSubstitutionMembers} from './schemaTypeRelations.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {SemanticError} from './resolveCanonicalGraph.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import type {SemanticTypeDependency} from './semanticTypeReference.js';

type GroupKind = 'sequence' | 'choice' | 'all';
/** Explicit positions survive flattening; only each implicit block is a set. */
export type SemanticParticleOrderBlock = Readonly<{
  kind: 'explicit'; children: readonly SemanticParticle[];
} | {
  kind: 'implicit'; particle: NodeId; head: NodeId; children: readonly SemanticParticle[];
}>;
export type SemanticParticle = Readonly<{
  id: NodeId; source: NodeId; originalParticle?: NodeId; origins: readonly NodeId[];
  kind: GroupKind | 'element' | 'any'; occurs: Occurs;
  children: readonly SemanticParticle[]; orderBlocks: readonly SemanticParticleOrderBlock[]; element?: ElementNode; wildcard?: Wildcard;
  summary: ParticleSummary; urTypeWildcard: boolean; orderUnspecified: boolean;
}>;
export type SemanticParticleView = Readonly<{
  contextId: string; content: ParticleContentView; purpose: 'declared' | 'restriction'; root: SemanticParticle;
  typeDependencies: readonly SemanticTypeDependency[];
}>;
export type ParticleViewResult = Readonly<{kind: 'checked'; view: SemanticParticleView}> | RelationFailure | ResourceLimitFailure;
const authority = new WeakMap<object, SemanticContext>();
const cache = new WeakMap<object, Map<string, SemanticParticleView>>();
const ONE = Object.freeze({min: '1', max: '1'});
const EMPTY: readonly never[] = Object.freeze([]);
type Shape = {id: NodeId; source: NodeId; originalParticle?: NodeId; origins: readonly NodeId[]; kind: SemanticParticle['kind']; occurs: Occurs;
  children: readonly Shape[]; orderBlocks: readonly ShapeOrderBlock[]; element?: ElementNode; wildcard?: Wildcard; urTypeWildcard: boolean; orderUnspecified: boolean};
type ShapeOrderBlock = {kind: 'explicit'; children: readonly Shape[]} | {kind: 'implicit'; particle: NodeId; head: NodeId; children: readonly Shape[]};
class Incomplete extends Error {constructor(readonly result: RelationFailure | ResourceLimitFailure) {super(result.kind);}}
export function assertSemanticParticleView(context: SemanticContext, view: SemanticParticleView): void {
  const owner = authority.get(view);
  if (!owner || owner !== context) throw new TypeError('Unauthenticated or foreign semantic particle view');
  assertParticleContentView(context, view.content);
}

export function prepareSemanticParticleView(context: SemanticContext, content: ParticleContentView, purpose: SemanticParticleView['purpose']): ParticleViewResult {
  assertParticleContentView(context, content);
  const budget = context.budget, charge = (n = 1) => budget.chargeWork(n);
  return budget.guard(() => {
    const fail = (component: NodeId, message: string): never => {
      charge(10 + component.length + message.length);
      throw new Incomplete(Object.freeze({kind: 'unresolved', rule: 'particle-view', component, message}));
    };
    try {
      charge(16);
      if (purpose !== 'declared' && purpose !== 'restriction') return fail(content.type, 'Unknown particle view purpose');
      let entries = cache.get(content);
      if (!entries) {charge(2); entries = new Map(); cache.set(content, entries);}
      const prior = entries.get(purpose);
      if (prior) {charge(3); return Object.freeze({kind: 'checked', view: prior});}
      if (content.content.kind === 'simple' || content.content.kind === 'opaque-builtin') return fail(content.type, 'Particle view requires empty or particle content');
      const typeDependencies = collectSemanticTypeDependencies(context);
      const memo = new Map<NodeId, Shape | undefined>(), active = new Set<NodeId>();
      const algebra = occurrenceAlgebra(charge);
      let serial = 0;
      const get = (id: NodeId): GraphNode => particleContentNode(context, content, id) ?? fail(id, 'Missing semantic view component');
      const target = (reference: Extract<ParticleNode['term'], {kind: 'element'}>['declaration'], owner: NodeId): GraphNode => {
        const found = context.resolve(reference);
        return found.kind === 'found' ? found.node : fail(owner, 'Particle target unavailable');
      };
      const shape = (source: NodeId, kind: Shape['kind'], occurs: Occurs, children: readonly Shape[], origins: readonly NodeId[] = [source]): Shape => {
        budget.reserveNodes(1); charge(20 + source.length + content.contextId.length + purpose.length);
        const id = `${content.contextId}/${purpose}/${++serial}/${source}`;
        charge(3); return {id, source, kind, occurs, children, orderBlocks: children.length ? [{kind: 'explicit', children}] : EMPTY,
          origins, urTypeWildcard: false, orderUnspecified: false};
      };
      type Frame = {node: ParticleNode; term: ParticleNode; children: readonly NodeId[]; index: number};
      const frame = (id: NodeId): Frame => {
        const node = get(id);
        if (node.kind !== 'particle') return fail(id, 'Particle child must be a particle');
        algebra.validate(node.occurs);
        let term = node;
        if (node.term.kind === 'group') {
          const group = target(node.term.reference, id);
          if (group.kind !== 'group') return fail(id, 'Group use must reference a model group');
          const groupTerm = get(group.content);
          if (groupTerm.kind !== 'particle' || !('children' in groupTerm.term)) return fail(id, 'Model-group definition requires a compositor');
          if (groupTerm.occurs.min !== '1' || groupTerm.occurs.max !== '1') return fail(id, 'Named model-group compositor must have occurrence 1..1');
          term = groupTerm;
        }
        charge(7); return {node, term, children: 'children' in term.term
          ? context.originalCompositorChildren(term.id) ?? term.term.children : EMPTY, index: 0};
      };
      const build = (f: Frame): Shape | undefined => {
        const {node, term} = f;
        if (node.occurs.max === '0') return undefined;
        if (term.term.kind === 'group') return fail(node.id, 'Unexpanded group reference');
        charge(2 + f.children.length); const children: Shape[] = [];
        for (const id of f.children) {charge(2 + id.length); const child = memo.get(id); if (child) children.push(child);}
        let p = shape(node.id, term.term.kind, node.occurs, children, node.id === term.id ? [node.id] : [node.id, term.id]);
        const original = context.lookup(node.id);
        charge(1 + content.synthetic.length);
        if (original.kind === 'found' && original.node === node && original.node.kind === 'particle'
          || content.synthetic.includes(node.id)) p.originalParticle = node.id;
        if (term.term.kind === 'element') {
          const declaration = target(term.term.declaration, node.id);
          if (declaration.kind !== 'element') return fail(node.id, 'Element particle requires an element declaration');
          p.element = declaration;
          if (purpose === 'restriction' && declaration.identity.kind === 'global') {
            if (context.membership !== 'complete-actual-plus-additions') return fail(node.id, 'Complete substitution universe required');
            const members = effectiveSubstitutionMembers(context, declaration.id);
            if (members.kind !== 'checked') throw new Incomplete(members);
            typeDependencies.add(members.typeDependencies);
            charge(1 + members.value.length);
            if (members.value.some(id => id !== declaration.id)) {
              charge(2); const virtual: Shape[] = [];
              for (const id of members.value) {
                const member = get(id); if (member.kind !== 'element') return fail(id, 'Substitution member is not an element');
                const leaf = shape(node.id, 'element', ONE, EMPTY); leaf.element = member; charge(); virtual.push(leaf);
              }
              p.kind = 'choice'; p.children = virtual; p.element = undefined; p.orderUnspecified = true;
              charge(4); p.orderBlocks = [{kind: 'implicit', particle: node.id, head: declaration.id, children: virtual}];
            }
          }
        } else if (term.term.kind === 'any') {p.wildcard = term.term.wildcard; p.urTypeWildcard = content.urTypeWildcards.includes(term.id);}
        if (purpose !== 'restriction' || !('children' in term.term)) return p;
        if (!children.length && (p.kind !== 'choice' || p.occurs.min === '0')) return undefined;
        charge(3); const flattened: Shape[] = [], blocks: ShapeOrderBlock[] = [];
        for (const child of children) {
          charge(4);
          if (child.kind === p.kind && p.kind !== 'all' && child.occurs.min === '1' && child.occurs.max === '1') {
            charge(child.children.length + child.orderBlocks.length); flattened.push(...child.children); blocks.push(...child.orderBlocks); p.orderUnspecified ||= child.orderUnspecified;
          } else {charge(4); flattened.push(child); blocks.push({kind: 'explicit', children: [child]});}
        }
        p.children = flattened; p.orderBlocks = blocks;
        if (flattened.length === 1 && (p.kind === 'all' || p.occurs.min === '1' && p.occurs.max === '1')) {
          const child = flattened[0]; charge(4 + p.origins.length + child.origins.length);
          p = {...child, id: p.id, originalParticle: p.originalParticle, occurs: p.kind === 'all' ? Object.freeze(algebra.product(p.occurs, child.occurs)) : child.occurs,
            origins: Object.freeze([...p.origins, ...child.origins])};
        }
        return p;
      };
      let root: Shape | undefined;
      if ('particle' in content.content) {
        charge(3); const stack: Frame[] = [frame(content.content.particle)]; active.add(content.content.particle);
        while (stack.length) {
          charge(4); const top = stack[stack.length - 1];
          if (top.index < top.children.length) {
            const id = top.children[top.index++]; charge(2 + id.length);
            if (active.has(id)) return fail(id, 'Particle containment cycle');
            if (!memo.has(id)) {charge(2); active.add(id); stack.push(frame(id));}
            continue;
          }
          const value = build(top); charge(3); memo.set(top.node.id, value); active.delete(top.node.id); stack.pop();
        }
        root = memo.get(content.content.particle);
      }
      root ??= shape(content.type, 'sequence', ONE, EMPTY);
      // Only the semantic particle view is analyzed. Declared source records
      // remain immutable outside this nonpersistent graph projection.
      charge(5); const shapes = new Map<NodeId, Shape>(), pending = [root];
      while (pending.length) {
        charge(3); const item = pending.pop()!;
        if (shapes.has(item.id)) continue;
        shapes.set(item.id, item); charge(item.children.length); pending.push(...item.children);
      }
      charge(3 + shapes.size * 2); const nodes: GraphNode[] = [], declarations = new Map<NodeId, ElementNode>();
      for (const p of shapes.values()) if (p.element) {charge(2 + p.element.id.length); declarations.set(p.element.id, p.element);}
      charge(declarations.size); nodes.push(...declarations.values());
      for (const p of shapes.values()) {
        const original = get(p.source);
        charge(20 + p.children.length);
        const term: ParticleNode['term'] = p.kind === 'element' ? Object.freeze({kind: 'element', declaration: Object.freeze({kind: 'local', target: p.element!.id})})
          : p.kind === 'any' ? Object.freeze({kind: 'any', wildcard: p.wildcard!})
          : Object.freeze({kind: p.kind, children: Object.freeze(p.children.map(child => child.id))});
        nodes.push(Object.freeze({...original, id: p.id, kind: 'particle', occurs: p.occurs, term} as ParticleNode));
      }
      charge(18); const graph = Object.freeze({...semanticContextGraphMetadata(context), nodes: Object.freeze(nodes), globals: EMPTY});
      const composed = Object.freeze({resolved: Object.freeze({graph, links: EMPTY, metrics: Object.freeze({steps: 0})}), types: EMPTY, metrics: Object.freeze({steps: 0})});
      const analysis = analyzeOccurrences(composed, {maxNodes: Number.MAX_SAFE_INTEGER, maxSteps: Number.MAX_SAFE_INTEGER}, {budget});
      if (analysis.kind === 'resource-limit') return analysis;
      if (analysis.kind === 'failure') return fail(analysis.diagnostic.component ?? content.type, analysis.diagnostic.message);
      charge(4 + analysis.analysis.particles.length * 2);
      const summaries = new Map(analysis.analysis.particles.map(row => [row.id, row]));
      const completed = new Map<NodeId, SemanticParticle>();
      charge(2); const stack = [{p: root, done: false}];
      while (stack.length) {
        charge(3); const current = stack.pop()!, p = current.p;
        if (completed.has(p.id)) continue;
        if (!current.done) {charge(2 + p.children.length * 2); stack.push({p, done: true}); for (const child of p.children) stack.push({p: child, done: false}); continue;}
        charge(16 + p.children.length + p.origins.length + p.orderBlocks.length);
        const orderBlocks = p.orderBlocks.map(block => {
          charge(5 + block.children.length);
          return Object.freeze({...block, children: Object.freeze(block.children.map(child => completed.get(child.id)!))});
        });
        completed.set(p.id, Object.freeze({...p, origins: Object.freeze([...p.origins]), children: Object.freeze(p.children.map(child => completed.get(child.id)!)),
          orderBlocks: Object.freeze(orderBlocks), summary: summaries.get(p.id)!}));
      }
      charge(8); const view = Object.freeze({contextId: context.contextId, content, purpose, root: completed.get(root.id)!, typeDependencies: typeDependencies.snapshot()});
      authority.set(view, context); entries.set(purpose, view);
      return Object.freeze({kind: 'checked', view});
    } catch (error: unknown) {if (error instanceof Incomplete) return error.result; if (error instanceof SemanticError) {budget.chargeWork(10 + error.message.length); return Object.freeze({kind: 'invalid-input', rule: 'particle-view', component: error.component, message: error.message});} throw error;}
  });
}
