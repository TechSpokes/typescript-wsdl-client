/** Polynomial upper bound for cached resolution depth, including cycle closure. */
export type ResolutionArc = Readonly<{to: string; cost: 0 | 1}>;

export function resolutionDepthBound(root: string, graph: ReadonlyMap<string, readonly ResolutionArc[]>, terminals: ReadonlySet<string>): number {
  const arcs = (key: string) => terminals.has(key) ? [] : graph.get(key) ?? [];
  const seen = new Set<string>();
  const order: string[] = [];
  const stack = [{key: root, exit: false}];
  const reverse = new Map<string, string[]>();
  while (stack.length) {
    const {key, exit} = stack.pop()!;
    if (exit) { order.push(key); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    stack.push({key, exit: true});
    for (const edge of arcs(key)) {
      const incoming = reverse.get(edge.to) ?? [];
      incoming.push(key);
      reverse.set(edge.to, incoming);
      stack.push({key: edge.to, exit: false});
    }
  }
  const component = new Map<string, number>();
  const groups: string[][] = [];
  for (const rootKey of order.reverse()) {
    if (component.has(rootKey)) continue;
    const index = groups.length;
    const members: string[] = [];
    const pending = [rootKey];
    while (pending.length) {
      const key = pending.pop()!;
      if (component.has(key)) continue;
      component.set(key, index);
      members.push(key);
      for (const previous of reverse.get(key) ?? []) pending.push(previous);
    }
    groups.push(members);
  }
  const internal = new Map<string, number>();
  const weights = groups.map((members, index) => members.reduce((sum, key) => {
    const cost = arcs(key).reduce((max, edge) => component.get(edge.to) === index ? Math.max(max, edge.cost) : max, 0);
    internal.set(key, cost);
    return sum + cost;
  }, 0));
  // SCC indices follow source-to-sink order, so all exit heights are already known.
  const heights = groups.map(() => 0);
  for (let index = groups.length - 1; index >= 0; index--) {
    let height = weights[index];
    for (const key of groups[index]) {
      for (const edge of arcs(key)) {
        const target = component.get(edge.to)!;
        if (target !== index) {
          // An exit replaces that node's internal edge, rather than closing then exiting.
          height = Math.max(height, weights[index] - internal.get(key)! + edge.cost + heights[target]);
        }
      }
    }
    heights[index] = height;
  }
  return heights[component.get(root)!];
}
