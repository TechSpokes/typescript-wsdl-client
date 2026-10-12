/** Original source projections suppressed by XSD mapping, not candidate validity. */
import type {GraphNode, NodeId} from './canonicalGraph.js';
import type {SemanticBudget} from './semanticBudget.js';

/** Called on the private immutable original graph inside the request guard. */
export function computeOriginalSourceAbsence(input: readonly GraphNode[], budget: SemanticBudget): ReadonlySet<NodeId> {
  budget.chargeWork(3);
  const roots: GraphNode[] = [], nodes: GraphNode[] = [], result = new Set<NodeId>();
  for (const original of input) {
    budget.chargeWork();
    if (original.identity.kind === 'global') continue;
    budget.chargeWork(); nodes.push(original);
    if (original.kind === 'attributeUse' && original.use === 'prohibited' ||
      original.kind === 'particle' && original.occurs.min === '0' && original.occurs.max === '0') {
      budget.chargeWork(); roots.push(original);
    }
  }
  for (const node of nodes) for (const root of roots) {
    const a = node.context, z = root.context, p = a.source.path, q = z.source.path;
    budget.chargeWork(10 + p.length + q.length + a.source.uri.length + z.source.uri.length + a.source.digest.length + z.source.digest.length
      + a.effectiveNamespace.length + z.effectiveNamespace.length + a.baseUri.length + z.baseUri.length);
    if (a.source.uri === z.source.uri && a.source.digest === z.source.digest && a.effectiveNamespace === z.effectiveNamespace &&
      a.baseUri === z.baseUri && a.chameleon === z.chameleon &&
      (p === q || p.startsWith(q + '/'))) {budget.chargeWork(); result.add(node.id); break;}
  }
  return result;
}
