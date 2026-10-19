/** Sufficient recursive component-property equality for cos-particle-extend.
 * Paired recurrence closes equality only; component validity remains a premise.
 */
import type {GraphNode, NodeId, Reference, ElementNode, AttributeNode, ComplexTypeNode} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import {assertSemanticContext} from './semanticContext.js';
import {createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {ScalarFailure, ScalarResult} from './schemaScalarKernel.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import {declarationMethods, RelationProblem} from './schemaTypeRelations.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import {checkDeclaration} from './schemaDeclarationPrimitives.js';
import {readRawAttributeProperties, assessSourceAttributeUses} from './schemaAttributeUses.js';
import type {AttributeFailure, OriginalAttributeUse, AttributeWildcard} from './schemaAttributeUses.js';
import {deriveActualComplexContent, deriveRawComplexContent, deriveModelGroupContent} from './complexTypeContent.js';
import {prepareSemanticParticleView} from './particleSemanticView.js';
import type {SemanticParticle} from './particleSemanticView.js';
import {wildcardNamespaces} from './wildcardAlgebra.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {declaredType, resolveSemanticType} from './schemaTypeIdentity.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import type {SemanticTypeDependency, SemanticTypeReference} from './semanticTypeReference.js';

type Failure = RelationFailure | ScalarFailure | AttributeFailure | ResourceLimitFailure;
export type ComponentEqualityResult = Readonly<{kind: 'checked'; value: boolean; contextId: string;
  authority: 'XSD10-component-properties-v1'; obligations: readonly string[];
  scalarObligations: readonly ScalarObligation[];
  typeDependencies: readonly SemanticTypeDependency[];
  /** Concrete component operands whose property facts this comparison consumed. */
  dependencies: readonly NodeId[]}> | Failure;
class Incomplete extends Error {constructor(readonly result: Failure) {super(result.kind);}}
type NodeTask = {kind: 'node'; a: GraphNode; b: GraphNode};
type Task = NodeTask | {kind: 'particle'; a: SemanticParticle; b: SemanticParticle}
  | {kind: 'scalar'; a: SemanticTypeReference; b: SemanticTypeReference; owner: NodeId}
  | {kind: 'uses'; a: readonly OriginalAttributeUse[]; b: readonly OriginalAttributeUse[]}
  | {kind: 'use'; a: OriginalAttributeUse; b: OriginalAttributeUse};
type State = {tasks: Task[]; pairs: Map<NodeId, Set<NodeId>>; scalarPairs: Map<string, Set<string>>};

export function compareComponentProperties(context: SemanticContext, a: GraphNode, b: GraphNode): ComponentEqualityResult {
  assertSemanticContext(context);
  const budget = context.budget, charge = (n = 1) => budget.chargeWork(n);
  return budget.guard(() => {
    charge(3);
    for (const node of [a, b]) {
      charge(46);
      const field = node && typeof node === 'object' ? Object.getOwnPropertyDescriptor(node, 'id') : undefined;
      if (!field || !('value' in field) || typeof field.value !== 'string') throw new TypeError('Unauthenticated or foreign component equality operand');
      const found = context.lookup(field.value);
      if (found.kind !== 'found' || found.node !== node) throw new TypeError('Unauthenticated or foreign component equality operand');
    }
    const scalar = createSchemaScalarKernel(context);
    charge(12); const dependencies = new Set<NodeId>(), obligations = new Set<string>(['component-validity']), scalarObligations: ScalarObligation[] = [];
    const typeDependencies = collectSemanticTypeDependencies(context);
    const remember = (required: readonly ScalarObligation[]) => {
      for (const item of required) {charge(4 + scalarObligations.length); if (!scalarObligations.some(prior => prior.rule === item.rule && prior.component === item.component && (prior.contextId ?? context.contextId) === (item.contextId ?? context.contextId))) scalarObligations.push(item);}
    };
    const read = (node: GraphNode): void => {charge(2 + node.id.length); dependencies.add(node.id);};
    const unresolved = (node: NodeId, rule: string, message: string): never => {
      charge(12 + node.length + rule.length + message.length); throw new Incomplete(Object.freeze({kind: 'unresolved', component: node, rule, message}));
    };
    const unwrap = <T>(result: ScalarResult<T>): T => {
      if (result.kind !== 'checked') throw new Incomplete(result);
      typeDependencies.add(result.typeDependencies);
      remember(result.obligations); return result.value;
    };
    const get = (id: NodeId): GraphNode => {
      const selected = context.lookup(id);
      if (selected.kind !== 'found') return unresolved(id, 'component-property-reference', 'Required component property is unavailable');
      read(selected.node); return selected.node;
    };
    const textEqual = (x: string, y: string): boolean => budget.compareText(x, y) === 0;
    const methods = (x: GraphNode, y: GraphNode, property: 'final' | 'block'): boolean => {
      const left = declarationMethods(context, x, property), right = declarationMethods(context, y, property);
      charge(2 + left.length * (right.length + 1) + right.length * (left.length + 1));
      return left.every(value => right.includes(value)) && right.every(value => left.includes(value));
    };
    const enqueue = (state: State, task: Task): void => {charge(6); state.tasks.push(task);};
    const reference = (state: State, x: Reference, y: Reference): boolean => {
      const left = context.resolve(x), right = context.resolve(y);
      if (left.kind !== 'found' && left.kind !== 'builtin' || right.kind !== 'found' && right.kind !== 'builtin') return unresolved(a.id, 'component-property-reference', 'Referenced type or declaration is unavailable');
      if (left.kind === 'builtin' || right.kind === 'builtin') return left.kind === 'builtin' && right.kind === 'builtin'
        && textEqual(left.name.namespace, right.name.namespace) && textEqual(left.name.local, right.name.local);
      enqueue(state, {kind: 'node', a: left.node, b: right.node}); return true;
    };
    const typeIdentity = (selector: SemanticTypeReference) => {
      const selected = resolveSemanticType(context, selector);
      if (selected.kind !== 'component' && selected.kind !== 'builtin' && selected.kind !== 'original-generated')
        return unresolved(a.id, 'component-property-reference', 'Referenced semantic type is unavailable');
      if (selected.kind === 'component') read(selected.node);
      return selected;
    };
    const typeOperand = (selector: SemanticTypeReference) => {
      const selected = typeIdentity(selector);
      charge(3); typeDependencies.add([{contextId: context.contextId, type: selected.identity}]); return selected;
    };
    const typeReference = (state: State, x: SemanticTypeReference, y: SemanticTypeReference, owner: NodeId): boolean => {
      const left = typeIdentity(x), right = typeIdentity(y);
      // Exact complex identity is a property fact, not another full validity root.
      if (left.kind === 'component' && right.kind === 'component' && left.node === right.node && left.node.kind === 'complexType') return true;
      charge(6); typeDependencies.add([{contextId: context.contextId, type: left.identity}, {contextId: context.contextId, type: right.identity}]);
      if (left.kind === 'builtin' && right.kind === 'builtin')
        return textEqual(left.name.namespace, right.name.namespace) && textEqual(left.name.local, right.name.local);
      if (left.kind === 'builtin' && left.name.local === 'anyType' || right.kind === 'builtin' && right.name.local === 'anyType') return false;
      if (left.kind === 'component' && left.node.kind === 'complexType' || right.kind === 'component' && right.node.kind === 'complexType') {
        if (left.kind !== 'component' || right.kind !== 'component' || left.node.kind !== 'complexType' || right.node.kind !== 'complexType') return false;
        enqueue(state, {kind: 'node', a: left.node, b: right.node}); return true;
      }
      enqueue(state, {kind: 'scalar', a: x, b: y, owner}); return true;
    };
    const scope = (node: ElementNode | AttributeNode): GraphNode | 'global' | undefined => {
      if (node.identity.kind === 'global') return 'global';
      charge(2); const seen = new Set<NodeId>(); let current: GraphNode = node;
      while (current.identity.kind === 'scoped') {
        charge(4); if (seen.has(current.id)) return unresolved(node.id, 'component-property-scope', 'Scope containment has a cycle');
        seen.add(current.id); current = get(current.identity.owner);
        if (current.kind === 'complexType') return current;
        if (current.kind === 'group' || current.kind === 'attributeGroup') return undefined;
      }
      return undefined;
    };
    const namespace = (node: GraphNode): string => {
      if (node.identity.kind === 'global') return node.identity.name.namespace;
      const raw = context.rawTypeProperties(node.id) ?? context.rawSimpleTypeProperties(node.id);
      if (raw?.targetNamespace !== undefined) return raw.targetNamespace;
      const original = context.sourceNode(node.id);
      if (original) return original.context.effectiveNamespace;
      return unresolved(node.id, 'component-type-target-namespace', 'Anonymous helper requires an explicit target namespace property');
    };
    const wildcard = (x: AttributeWildcard | undefined, y: AttributeWildcard | undefined): boolean => {
      if (!x || !y) return x === y;
      if (x.processContents !== y.processContents || x.namespace.kind !== y.namespace.kind) return false;
      const left = budget.sorted(x.namespace.namespaces, budget.compareText), right = budget.sorted(y.namespace.namespaces, budget.compareText);
      charge(left.length + right.length + 1);
      return left.length === right.length && left.every((value, index) => textEqual(value, right[index]));
    };
    const values = (x: ElementNode | AttributeNode, y: ElementNode | AttributeNode): boolean => {
      if (x.value?.kind !== y.value?.kind) return false;
      if (!x.value || !y.value) return true;
      const left = checkDeclaration(context, x.id), right = checkDeclaration(context, y.id);
      if (left.kind !== 'checked') throw new Incomplete(left); if (right.kind !== 'checked') throw new Incomplete(right);
      typeDependencies.add(left.typeDependencies); typeDependencies.add(right.typeDependencies);
      remember(left.scalarObligations); remember(right.scalarObligations);
      for (const receipt of [left, right]) for (const required of receipt.obligations) {charge(); if (required !== 'declared-type-component-validity') obligations.add(required);}
      if (!left.constraint || !right.constraint) return unresolved(x.id, 'component-value-property', 'Typed declaration constraint is unavailable');
      return unwrap(scalar.equivalent(left.constraint.type, left.constraint.lexical, right.constraint.type, right.constraint.lexical, x.id));
    };
    const pair = (pairs: Map<string, Set<string>>, x: string, y: string): 'new' | 'seen' => {
      charge(6 + x.length + y.length);
      let row = pairs.get(x);
      if (row?.has(y)) return 'seen';
      if (!row) {charge(2); row = new Set(); pairs.set(x, row);}
      row.add(y); return 'new';
    };
    const scalarPair = (state: State, x: SemanticTypeReference, y: SemanticTypeReference, owner: NodeId): boolean => {
      charge(3);
      typeOperand(x); typeOperand(y);
      const left = unwrap(scalar.contentProperties(x, owner)), right = unwrap(scalar.contentProperties(y, owner));
      // GSC1 identities and ordinary scalar identities share one property owner.
      // Closing this separate pair recurrence proves property equality only.
      if (textEqual(left.definition, right.definition) || pair(state.scalarPairs, left.definition, right.definition) === 'seen') return true;
      if (!!left.name !== !!right.name || left.name && right.name && (!textEqual(left.name.namespace, right.name.namespace) || !textEqual(left.name.local, right.name.local))) return false;
      if (!textEqual(left.targetNamespace, right.targetNamespace) || left.variety !== right.variety || left.primitive !== right.primitive) return false;
      charge(2 + left.final.length * (right.final.length + 1) + right.final.length * (left.final.length + 1));
      if (!left.final.every(value => right.final.includes(value)) || !right.final.every(value => left.final.includes(value))) return false;
      // Annotation is excluded by cos-particle-extend. Equal complete base,
      // variety constituents and facet properties determine equal fundamental
      // properties; no unevaluated fundamental value is invented here.
      if (!unwrap(scalar.facetPropertiesEquivalent(x, y, owner))) return false;
      if (!!left.base !== !!right.base || !!left.item !== !!right.item || (left.members?.length ?? 0) !== (right.members?.length ?? 0)) return false;
      if (left.base && right.base) enqueue(state, {kind: 'scalar', a: left.base, b: right.base, owner});
      if (left.item && right.item) enqueue(state, {kind: 'scalar', a: left.item, b: right.item, owner});
      for (let index = 0; index < (left.members?.length ?? 0); index++) {
        charge(); enqueue(state, {kind: 'scalar', a: left.members![index], b: right.members![index], owner});
      }
      return true;
    };
    const content = (node: ComplexTypeNode) => {
      const mapped = context.kind === 'actual' ? deriveActualComplexContent(context, node.id) : deriveRawComplexContent(context, node.id);
      if (mapped.kind !== 'checked') throw new Incomplete(mapped); return mapped.view;
    };
    const particles = (state: State, x: ReturnType<typeof content>, y: ReturnType<typeof content>): boolean => {
      if (x.content.kind !== y.content.kind) return false;
      if (x.content.kind === 'empty') return true;
      if (x.content.kind === 'simple' && y.content.kind === 'simple') {
        charge(6);
        // Raw content selects its scalar property; actual projections can be diagnostic.
        const leftOperand = context.kind === 'candidate' ? x.content.type : {kind: 'local', target: x.type} as const;
        const rightOperand = context.kind === 'candidate' ? y.content.type : {kind: 'local', target: y.type} as const;
        enqueue(state, {kind: 'scalar', a: leftOperand, b: rightOperand, owner: x.type});
        return true;
      }
      if (!('particle' in x.content) || !('particle' in y.content)) return unresolved(x.type, 'component-content-properties', 'Opaque builtin content has no complete component property view');
      const left = prepareSemanticParticleView(context, x, 'declared'), right = prepareSemanticParticleView(context, y, 'declared');
      if (left.kind !== 'checked') throw new Incomplete(left); if (right.kind !== 'checked') throw new Incomplete(right);
      typeDependencies.add(left.view.typeDependencies); typeDependencies.add(right.view.typeDependencies);
      enqueue(state, {kind: 'particle', a: left.view.root, b: right.view.root}); return true;
    };
    const attributes = (node: ComplexTypeNode) => {
      const result = context.kind === 'actual' ? assessSourceAttributeUses(context, node.id) : readRawAttributeProperties(context, node.id);
      if (result.kind !== 'checked') throw new Incomplete(result);
      typeDependencies.add(result.typeDependencies);
      remember(result.scalarObligations);
      for (const item of result.value.schemaOperands) {read(item.source); read(item.declaration);}
      return result.value;
    };
    const nodePair = (state: State, x: GraphNode, y: GraphNode): boolean => {
      read(x); read(y);
      if (pair(state.pairs, x.id, y.id) === 'seen' || x === y) return true;
      if (x.kind !== y.kind) return false;
      if (x.identity.kind === 'global' || y.identity.kind === 'global') {
        if (x.identity.kind !== 'global' || y.identity.kind !== 'global') return false;
        if (x.identity.role !== y.identity.role || !textEqual(x.identity.name.namespace, y.identity.name.namespace) || !textEqual(x.identity.name.local, y.identity.name.local)) return false;
      }
      if ((x.kind === 'element' || x.kind === 'attribute') && (y.kind === 'element' || y.kind === 'attribute')) {
        if (!textEqual(x.name.namespace, y.name.namespace) || !textEqual(x.name.local, y.name.local)) return false;
        const left = scope(x), right = scope(y);
        if (typeof left === 'object' && typeof right === 'object') enqueue(state, {kind: 'node', a: left, b: right});
        else if (left !== right) return false;
        if (!typeReference(state, declaredType(context, x), declaredType(context, y), x.id) || !values(x, y)) return false;
        if (x.kind === 'element' && y.kind === 'element') {
          if (x.abstract !== y.abstract || x.nillable !== y.nillable || !methods(x, y, 'final') || !methods(x, y, 'block')) return false;
          if (!!x.substitutionGroup !== !!y.substitutionGroup) return false;
          if (x.substitutionGroup && y.substitutionGroup && !reference(state, x.substitutionGroup, y.substitutionGroup)) return false;
          for (const node of [x, y]) for (const syntax of node.retained) {
            charge(4 + syntax.name.namespace.length + syntax.name.local.length);
            if (syntax.name.namespace === XSD_NAMESPACE && ['key', 'keyref', 'unique'].includes(syntax.name.local)) return unresolved(node.id, 'component-identity-constraint-properties', 'Identity constraint components have no complete property view');
          }
        }
        return true;
      }
      if (x.kind === 'simpleType' && y.kind === 'simpleType') {
        charge(6); enqueue(state, {kind: 'scalar', a: {kind: 'local', target: x.id}, b: {kind: 'local', target: y.id}, owner: x.id});
        return true;
      }
      if (x.kind === 'complexType' && y.kind === 'complexType') {
        if (!textEqual(namespace(x), namespace(y)) || !methods(x, y, 'final') || !methods(x, y, 'block')) return false;
        const left = context.rawTypeProperties(x.id), right = context.rawTypeProperties(y.id);
        if (context.kind === 'candidate' && (!left || !right)) return unresolved(x.id, 'component-complex-properties', 'Candidate complex types require complete raw properties');
        const xm = left?.derivation.method ?? x.derivation?.kind ?? 'restriction', ym = right?.derivation.method ?? y.derivation?.kind ?? 'restriction';
        if (xm !== ym || (left?.abstract ?? x.abstract) !== (right?.abstract ?? y.abstract)) return false;
        const ur: Reference = {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}};
        if (!typeReference(state, left?.derivation.base ?? x.derivation?.base ?? ur, right?.derivation.base ?? y.derivation?.base ?? ur, x.id)) return false;
        const xa = attributes(x), ya = attributes(y);
        if (!wildcard(xa.wildcard, ya.wildcard) || xa.uses.length !== ya.uses.length) return false;
        enqueue(state, {kind: 'uses', a: xa.uses, b: ya.uses});
        return particles(state, content(x), content(y));
      }
      if ((x.kind === 'particle' || x.kind === 'group') && (y.kind === 'particle' || y.kind === 'group')) {
        const left = deriveModelGroupContent(context, x.id), right = deriveModelGroupContent(context, y.id);
        if (left.kind !== 'checked') throw new Incomplete(left); if (right.kind !== 'checked') throw new Incomplete(right);
        return particles(state, left.view, right.view);
      }
      return unresolved(x.id, 'component-properties', 'This component kind has no complete recursive property view');
    };
    const finish = (value: boolean): ComponentEqualityResult => {
      charge(dependencies.size + obligations.size + scalarObligations.length + 12);
      return budget.freeze(budget.snapshot({kind: 'checked' as const, value, contextId: context.contextId, authority: 'XSD10-component-properties-v1' as const,
        obligations: [...obligations], scalarObligations, dependencies: [...dependencies], typeDependencies: typeDependencies.snapshot()}));
    };
    charge(12); const states: State[] = [{tasks: [{kind: 'node', a, b}], pairs: new Map(), scalarPairs: new Map()}];
    let unknown: Failure | undefined;
    while (states.length) {
      charge(3); const state = states.pop()!; let valid = true;
      try {
        while (valid && state.tasks.length) {
          charge(4); const task = state.tasks.pop()!;
          if (task.kind === 'node') valid = nodePair(state, task.a, task.b);
          else if (task.kind === 'scalar') valid = scalarPair(state, task.a, task.b, task.owner);
          else if (task.kind === 'particle') {
            const x = task.a, y = task.b;
            if (x === y || x.originalParticle !== undefined && x.originalParticle === y.originalParticle) continue;
            if (x.kind !== y.kind || !textEqual(x.occurs.min, y.occurs.min) || !textEqual(x.occurs.max, y.occurs.max) || x.children.length !== y.children.length) {valid = false; continue;}
            if (x.originalParticle) {charge(2 + x.originalParticle.length); dependencies.add(x.originalParticle);}
            if (y.originalParticle) {charge(2 + y.originalParticle.length); dependencies.add(y.originalParticle);}
            if (x.element && y.element) enqueue(state, {kind: 'node', a: x.element, b: y.element});
            else if (x.wildcard && y.wildcard) {
              valid = wildcard({namespace: wildcardNamespaces(x.wildcard, charge), processContents: x.wildcard.processContents, sources: []}, {namespace: wildcardNamespaces(y.wildcard, charge), processContents: y.wildcard.processContents, sources: []});
            }
            for (let index = 0; index < x.children.length; index++) enqueue(state, {kind: 'particle', a: x.children[index], b: y.children[index]});
          } else if (task.kind === 'use') {
            const x = task.a, y = task.b; read(x.source); read(y.source);
            if (pair(state.pairs, x.id, y.id) === 'seen') continue;
            if (x.required !== y.required || x.own?.kind !== y.own?.kind) {valid = false; continue;}
            enqueue(state, {kind: 'node', a: x.declaration, b: y.declaration});
            if (x.own && y.own) valid = unwrap(scalar.equivalent(x.own.value.type, x.own.value.lexical, y.own.value.type, y.own.value.lexical, x.id));
          } else {
            if (!task.a.length) {valid = !task.b.length; continue;}
            if (task.a.length !== task.b.length) {valid = false; continue;}
            const first = task.a[0];
            for (let index = 0; index < task.b.length; index++) {
              charge(6); const other = task.b[index];
              if (!textEqual(first.declaration.name.namespace, other.declaration.name.namespace) || !textEqual(first.declaration.name.local, other.declaration.name.local)) continue;
              charge(state.tasks.length + (state.pairs.size + state.scalarPairs.size) * 2 + task.a.length + task.b.length + 14);
              const pairs = new Map<NodeId, Set<NodeId>>(), scalarPairs = new Map<string, Set<string>>();
              for (const [id, row] of state.pairs) {charge(row.size + 3); pairs.set(id, new Set(row));}
              for (const [id, row] of state.scalarPairs) {charge(row.size + 3); scalarPairs.set(id, new Set(row));}
              const fork: State = {tasks: [...state.tasks, {kind: 'uses', a: task.a.slice(1), b: task.b.filter((_, n) => n !== index)}, {kind: 'use', a: first, b: other}], pairs, scalarPairs};
              states.push(fork);
            }
            valid = false;
          }
        }
        if (valid) return finish(true);
      } catch (error) {
        if (error instanceof Incomplete || error instanceof RelationProblem) {unknown ??= error.result; continue;}
        throw error;
      }
    }
    return unknown ?? finish(false);
  });
}
