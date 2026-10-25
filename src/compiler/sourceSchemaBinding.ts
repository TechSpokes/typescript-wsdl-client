/** Exact source-built resolved handles; no caller-issued association or validity receipt. */
import {assertLoadedSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput, SchemaInterpretation} from '../loader/schemaInput.js';
import type {SyntaxSource} from '../loader/orderedSyntax.js';
import {buildCanonicalGraph} from './buildCanonicalGraph.js';
import {GraphError} from './canonicalGraph.js';
import {resolveCanonicalGraph, SemanticError} from './resolveCanonicalGraph.js';
import type {ResolvedGraph, SemanticLimits} from './resolveCanonicalGraph.js';
import type {ResourceLimitFailure, SemanticBudget} from './semanticBudget.js';

export type SourcePreparationFailure = Readonly<{kind: 'source-preparation-failed';
  stage: 'canonical-build' | 'reference-resolution'; category: GraphError['category'] | SemanticError['category'];
  message: string; source?: SyntaxSource}>;
export type BoundSourcePreparation = Readonly<{kind: 'prepared'; resolved: ResolvedGraph}> | SourcePreparationFailure | ResourceLimitFailure;
const sourceBindings = new WeakMap<ResolvedGraph, readonly SchemaInterpretation[]>();

/** Reads only private identity. A copied/forged resolved handle has no binding. */
export function sourceSchemasForResolvedGraph(resolved: ResolvedGraph): readonly SchemaInterpretation[] | undefined {
  return sourceBindings.get(resolved);
}

/** One issued source snapshot constructs both the immutable graph and its source universe. */
export function prepareBoundSourceGraph(input: SchemaInput, options: Readonly<{
  budget: SemanticBudget; sourceLimits?: SemanticLimits;
}>): BoundSourcePreparation {
  assertLoadedSchemaInput(input);
  const budget = options.budget;
  return budget.guard(() => {
    // The loader authenticates this exact input handle. Claim its complete
    // immutable source tree before any build or caller access can intervene.
    // The shared budget charges the freeze traversal before each field read.
    const owned = budget.freeze(input);
    let stage: SourcePreparationFailure['stage'] = 'canonical-build';
    try {
      const graph = buildCanonicalGraph(owned, {maxNodes: options.sourceLimits?.maxNodes, requestBudget: budget});
      stage = 'reference-resolution';
      // The fixed resolver deep-freezes its complete result before returning it.
      // No caller code receives this exact handle before the private association.
      const resolved = resolveCanonicalGraph(graph, {...options.sourceLimits, requestBudget: budget});
      budget.chargeWork(6);
      sourceBindings.set(resolved, owned.schemas);
      return Object.freeze({kind: 'prepared', resolved});
    } catch (error) {
      if (!(error instanceof GraphError || error instanceof SemanticError)) throw error;
      budget.chargeWork(200 + error.message.length);
      return Object.freeze({kind: 'source-preparation-failed', stage, category: error.category,
        message: error.message, ...(error.source ? {source: error.source} : {})});
    }
  });
}
