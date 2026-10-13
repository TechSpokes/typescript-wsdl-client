/** Finite subset products over source-owned, decidable typed token predicates. */
import type {SchemaPatternContext} from './schemaValueContext.js';
export type SymbolicSequence<Label> = Readonly<{start: number; states: readonly Readonly<{
  accepting: boolean; edges: readonly Readonly<{to: number; label: Label}>[];
}>[]}>;
export function schemaSymbolicSequences<Owner, Label>(c: SchemaPatternContext<Owner>,
  satisfiable: (positive: readonly Label[], negative: readonly Label[], owner: Owner) => boolean,
  family?: (label: Label) => string) {
  const differenceExists = (a: SymbolicSequence<Label>, b: SymbolicSequence<Label>, owner: Owner): boolean => {
    type Pair = {a: readonly number[]; b: readonly number[]};
    const key = (pair: Pair) => {c.step(owner, (pair.a.length + pair.b.length) * 16 + 4); return JSON.stringify(pair);};
    c.step(owner, 6); const initial = {a: [a.start], b: [b.start]}, pending: Pair[] = [initial], seen = new Set([key(initial)]);
    for (let cursor = 0; cursor < pending.length; cursor++) {
      const pair = pending[cursor]; c.step(owner, pair.a.length + pair.b.length + 2);
      if (pair.a.some(state => a.states[state].accepting) && !pair.b.some(state => b.states[state].accepting)) return true;
      c.step(owner, 4); const labels: Label[] = [], indices = new Map<Label, number>();
      const index = (label: Label) => {
        c.step(owner); let value = indices.get(label);
        if (value === undefined) {c.step(owner, 3); value = labels.length; indices.set(label, value); labels.push(label);}
        return value;
      };
      c.step(owner, pair.a.length + pair.b.length + 3);
      const ae: {to: number; index: number}[] = [], be: typeof ae = [];
      for (const state of pair.a) for (const edge of a.states[state].edges) {c.step(owner, 3); ae.push({to: edge.to, index: index(edge.label)});}
      for (const state of pair.b) for (const edge of b.states[state].edges) {c.step(owner, 3); be.push({to: edge.to, index: index(edge.label)});}
      c.step(owner, ae.length + labels.length + 8); const anchors = [...new Set(ae.map(edge => edge.index))];
      const maskCost = Math.min(Number.MAX_SAFE_INTEGER, (labels.length + 4) ** 2);
      const masks = (operations = 1) => c.step(owner, Math.min(Number.MAX_SAFE_INTEGER, maskCost * operations));
      type Cell = {positive: readonly Label[]; negative: readonly Label[]; mask: bigint; at: number};
      for (let anchorAt = 0; anchorAt < anchors.length; anchorAt++) {
        const anchor = anchors[anchorAt], tag = family?.(labels[anchor]);
        c.step(owner, labels.length * 3 + anchors.length + 8); const forced = new Set(anchors.slice(0, anchorAt));
        if (family) for (let bit = 0; bit < labels.length; bit++) if (family(labels[bit]) !== tag) forced.add(bit);
        const remaining = labels.flatMap((_label, bit) => bit === anchor || forced.has(bit) ? [] : [bit]);
        const positive = [labels[anchor]], negative = [...forced].map(bit => labels[bit]);
        if (!satisfiable(positive, negative, owner)) continue;
        c.step(owner, 5); masks(); const cells: Cell[] = [{positive, negative, mask: 1n << BigInt(anchor), at: 0}];
        while (cells.length) {
          c.step(owner); const cell = cells.pop()!;
          if (cell.at < remaining.length) {
            const bit = remaining[cell.at], label = labels[bit]; c.step(owner, cell.positive.length + cell.negative.length + 8);
            const admitted = [...cell.positive, label], rejected = [...cell.negative, label];
            if (satisfiable(admitted, cell.negative, owner)) {c.step(owner, 5); masks(2); cells.push({...cell, positive: admitted, mask: cell.mask | (1n << BigInt(bit)), at: cell.at + 1});}
            if (satisfiable(cell.positive, rejected, owner)) {c.step(owner, 5); cells.push({...cell, negative: rejected, at: cell.at + 1});}
            continue;
          }
          const mask = cell.mask;
        c.step(owner, ae.length + be.length + 4); const aa = new Set<number>(), bb = new Set<number>();
        for (const edge of ae) {masks(2); if (mask & (1n << BigInt(edge.index))) aa.add(edge.to);}
        for (const edge of be) {masks(2); if (mask & (1n << BigInt(edge.index))) bb.add(edge.to);}
        c.step(owner, aa.size ** 2 + bb.size ** 2 + aa.size + bb.size + 5);
        const next = {a: [...aa].sort((x, y) => x - y), b: [...bb].sort((x, y) => x - y)}, identity = key(next);
        if (!seen.has(identity)) {c.step(owner, identity.length + 4); seen.add(identity); pending.push(next);}
        }
      }
    }
    return false;
  };
  return {differenceExists};
}
