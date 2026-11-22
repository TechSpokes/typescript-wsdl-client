import type {SchemaInput} from '../loader/schemaInput.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {globalId, type NodeId} from './canonicalGraph.js';
import {checkScopedComponentCorrespondence} from './componentCorrespondence.js';
import {assertFiniteRe01Frontier, verifyOperationSchemaRoots, type FiniteRe01Frontier} from './finiteRe01Verification.js';
import type {SemanticContext} from './semanticContext.js';

export const LAX_WILDCARD_OPERATION_SCOPE = 'lax-wildcard-operation-v1' as const;

const scopes = new WeakMap<SemanticContext, {source: SchemaInput; qualified: Set<NodeId>}>();

/** Retain the declarations already proved for one fresh scoped operation request. */
export function retainScopedLaxWildcardProof(context: SemanticContext, source: SchemaInput,
  frontier: FiniteRe01Frontier, check: () => void): void {
  assertFiniteRe01Frontier(context, frontier);
  const scope = scopes.get(context) ?? {source, qualified: new Set<NodeId>()};
  if (scope.source !== source) throw new TypeError('Foreign scoped wildcard source');
  for (const {component} of frontier.components) {
    check(); context.budget.chargeWork(32 + component.length * 4);
    scope.qualified.add(component);
  }
  scopes.set(context, scope);
}

export const hasScopedLaxWildcards = (context: SemanticContext): boolean => scopes.has(context);

/** Prove an encountered global wildcard declaration in the original pinned graph before using its value mapping. */
export function qualifyScopedWildcardDeclaration(context: SemanticContext, id: NodeId, check: () => void): boolean {
  const scope = scopes.get(context);
  if (!scope || scope.qualified.has(id)) return true;
  // @why A known declaration may depend on an unqualified part of the original graph. Refusal preserves lax lookup semantics.
  check();
  const frontier = verifyOperationSchemaRoots(context, [id]);
  check();
  if (frontier.kind !== 'inspected-frontier' || checkScopedComponentCorrespondence(scope.source, context, frontier, check, true)) return false;
  retainScopedLaxWildcardProof(context, scope.source, frontier, check);
  return true;
}

/** Limit lexical preservation to unknown names without dynamic schema or type assertions. */
export function permitsOpaqueWildcardName(context: SemanticContext, kind: 'element' | 'attribute', name: ExpandedName): boolean {
  if (!scopes.has(context)) return true;
  context.budget.chargeWork(64 + (name.namespace.length + name.local.length) * 8);
  return name.namespace !== 'http://www.w3.org/2001/XMLSchema-instance'
    && context.lookup(globalId(kind, name)).kind === 'missing';
}
