/** XSD 1.0 cos-element-consistent over explicit canonical particle roots. */
import type {ElementNode, GraphNode, NodeId, ParticleNode, Reference} from './canonicalGraph.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import {effectiveSubstitutionMembers} from './schemaTypeRelations.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {declaredType, resolveSemanticType} from './schemaTypeIdentity.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import type {SemanticTypeDependency} from './semanticTypeReference.js';
import {originalUrWildcardSource} from './complexTypeContent.js';

export type ElementConsistencyResult = Readonly<{
  kind: 'checked'; value: boolean; rule: 'cos-element-consistent'; contextId: string;
  scope: 'declared-particle-roots'; obligations: readonly ['component-validity'];
  typeDependencies: readonly SemanticTypeDependency[];
  conflict?: readonly [NodeId, NodeId];
}> | RelationFailure | ResourceLimitFailure;
type Entry = {declaration: NodeId; count: 1 | 2; namedType?: string};
type Summary = ReadonlyMap<string, Entry>;
class Incomplete extends Error {
  constructor(readonly result: RelationFailure | ResourceLimitFailure) {super('Incomplete EDC premise');}
}
class Conflict extends Error {
  constructor(readonly pair: readonly [NodeId, NodeId]) {super('Inconsistent element declaration particles');}
}

/**
 * Repeated group-use edges count distinct positions; numeric repetition does not.
 * The source mapper's max=0 components are omitted, without restriction-specific
 * pointless-compositor normalization. Summary sharing prevents DAG unfolding.
 * Type/declaration validity remains an explicit separately owned prerequisite.
 */
export function checkElementDeclarationsConsistent(context: SemanticContext, roots: readonly NodeId[]): ElementConsistencyResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    const typeDependencies = collectSemanticTypeDependencies(context);
    try {
      const requested = budget.freeze(budget.snapshot(roots));
      budget.chargeWork(5);
      const memo = new Map<NodeId, Summary>(), active = new Set<NodeId>();
      const unresolved = (component: string, message: string): never => {
        budget.chargeWork(8 + component.length + message.length);
        throw new Incomplete(Object.freeze({kind: 'unresolved', rule: 'cos-element-consistent', component, message}));
      };
      const get = (id: NodeId): GraphNode => {
        const result = context.lookup(id);
        if (result.kind === 'missing') {
          const borrowed = context.originalUrWildcard(id);
          if (borrowed) return originalUrWildcardSource(context.originalContext(), borrowed);
        }
        return result.kind === 'found' ? result.node : unresolved(id, `Required component is ${result.kind}`);
      };
      const target = (ref: Reference, owner: NodeId): GraphNode => {
        const result = context.resolve(ref);
        return result.kind === 'found' ? result.node : unresolved(owner, 'Declaration or group target is not an active component');
      };
      const namedType = (declaration: ElementNode): string | undefined => {
        const result = resolveSemanticType(context, declaredType(context, declaration));
        if (result.kind !== 'component' && result.kind !== 'builtin' && result.kind !== 'original-generated')
          return unresolved(declaration.id, 'Declared type is unavailable or not a type in the selected context');
        budget.chargeWork(3);
        typeDependencies.add([{contextId: context.contextId, type: result.identity}]);
        // A generated scalar has no name; its source container is provenance.
        if (result.kind === 'original-generated') return undefined;
        if (result.kind === 'builtin') {
          budget.chargeWork(32 + 6 * (result.name.namespace.length + result.name.local.length));
          return JSON.stringify(['type', result.name.namespace, result.name.local]);
        }
        if (result.node.identity.kind !== 'global') return undefined;
        const name = result.node.identity.name;
        budget.chargeWork(32 + 6 * (name.namespace.length + name.local.length));
        return JSON.stringify(['type', name.namespace, name.local]);
      };
      const merge = (into: Map<string, Entry>, summary: Summary): void => {
        for (const [name, entry] of summary) {
          budget.chargeWork(8 + name.length);
          const prior = into.get(name);
          budget.chargeWork((prior?.namedType?.length ?? 0) + (entry.namedType?.length ?? 0));
          if (prior && (!prior.namedType || !entry.namedType || prior.namedType !== entry.namedType)) {
            budget.chargeWork(4); throw new Conflict(Object.freeze([prior.declaration, entry.declaration]));
          }
          budget.chargeWork(5);
          into.set(name, {declaration: prior?.declaration ?? entry.declaration, count: prior ? 2 : entry.count, namedType: entry.namedType});
        }
      };
      const declared = (particle: ParticleNode): Summary => {
        if (particle.term.kind !== 'element') return new Map();
        const declaration = target(particle.term.declaration, particle.id);
        if (declaration.kind !== 'element') return unresolved(particle.id, 'Element particle does not reference an element declaration');
        budget.chargeWork(4);
        const declarations = new Set<NodeId>([declaration.id]);
        if (declaration.identity.kind === 'global') {
          if (context.membership === 'structural-subset') return unresolved(declaration.id, 'Complete original-plus-fresh substitution universe is required');
          const implicit = effectiveSubstitutionMembers(context, declaration.id);
          if (implicit.kind !== 'checked') throw new Incomplete(implicit);
          typeDependencies.add(implicit.typeDependencies);
          for (const id of implicit.value) {budget.chargeWork(1 + id.length); declarations.add(id);}
        }
        budget.chargeWork(); const result = new Map<string, Entry>();
        for (const id of declarations) {
          const member = get(id);
          if (member.kind !== 'element') return unresolved(id, 'Implicit member is not an element declaration');
          budget.chargeWork(48 + 6 * (member.name.namespace.length + member.name.local.length));
          const name = JSON.stringify([member.name.namespace, member.name.local]);
          const type = namedType(member), prior = result.get(name);
          budget.chargeWork((prior?.namedType?.length ?? 0) + (type?.length ?? 0));
          if (prior && (!prior.namedType || !type || prior.namedType !== type)) {
            budget.chargeWork(4); throw new Conflict(Object.freeze([prior.declaration, member.id]));
          }
          budget.chargeWork(5); result.set(name, {declaration: prior?.declaration ?? member.id, count: prior ? 2 : 1, namedType: type});
        }
        return result;
      };
      const frame = (id: NodeId) => {
        const node = get(id);
        if (node.kind !== 'particle') return unresolved(id, 'EDC roots and containment edges must reference particles');
        budget.chargeWork(7);
        let children: readonly NodeId[] = [];
        if (node.occurs.max !== '0') {
          if ('children' in node.term) children = node.term.children;
          else if (node.term.kind === 'group') {
            const group = target(node.term.reference, id);
            if (group.kind !== 'group') return unresolved(id, 'Model-group use does not reference a group');
            budget.chargeWork(2); children = [group.content];
          }
        }
        return {node, children, index: 0};
      };
      budget.chargeWork(); const combined = new Map<string, Entry>();
      for (const root of requested) {
        budget.chargeWork(3 + root.length);
        if (!memo.has(root)) {
          budget.chargeWork(2); const stack = [frame(root)]; active.add(root);
          while (stack.length) {
            budget.chargeWork(3); const current = stack[stack.length - 1];
            if (current.index < current.children.length) {
              const id = current.children[current.index++]; budget.chargeWork(3 + id.length);
              if (active.has(id)) return unresolved(id, 'Forbidden particle/group containment cycle');
              if (!memo.has(id)) {budget.chargeWork(2); active.add(id); stack.push(frame(id));}
              continue;
            }
            budget.chargeWork(); const summary = new Map<string, Entry>();
            if (current.node.occurs.max !== '0') {
              if (current.node.term.kind === 'element') merge(summary, declared(current.node));
              for (const id of current.children) {budget.chargeWork(1 + id.length); merge(summary, memo.get(id)!);}
            }
            budget.chargeWork(4); memo.set(current.node.id, summary); active.delete(current.node.id); stack.pop();
          }
        }
        merge(combined, memo.get(root)!);
      }
      budget.chargeWork(20 + context.contextId.length);
      return Object.freeze({kind: 'checked', value: true, rule: 'cos-element-consistent', contextId: context.contextId,
        scope: 'declared-particle-roots', obligations: Object.freeze(['component-validity'] as const), typeDependencies: typeDependencies.snapshot()});
    } catch (error: unknown) {
      if (error instanceof Incomplete) return error.result;
      if (!(error instanceof Conflict)) throw error;
      budget.chargeWork(24 + context.contextId.length);
      return Object.freeze({kind: 'checked', value: false, rule: 'cos-element-consistent', contextId: context.contextId,
        scope: 'declared-particle-roots', obligations: Object.freeze(['component-validity'] as const), conflict: error.pair, typeDependencies: typeDependencies.snapshot()});
    }
  });
}
