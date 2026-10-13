/** Finite token-boundary transducers with complete source-owned value labels. */
import type {SchemaPatternContext} from './schemaValueContext.js';
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {SymbolicSequence} from './schemaSymbolicSequences.js';

export function schemaTokenImages<Owner, Label>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  token: (owner: Owner) => RegularLanguage,
  labels: (paths: RegularLanguage, position: number, rejected: readonly number[], owner: Owner) => readonly Label[],
  whitespace: (codepoint: number, owner: Owner) => Label) {
  const image = (source: RegularLanguage, rejectedCount: number, maximumPosition: number, mode: 'list' | 'string', owner: Owner): SymbolicSequence<Label> => {
    const program = regular.automaton(source, owner), tokenDomain = token(owner);
    type State = {at: number; failed: bigint; position: number; after: boolean};
    const maskCost = Math.min(Number.MAX_SAFE_INTEGER, (rejectedCount + 4) ** 2);
    const masks = (operations = 1) => c.step(owner, Math.min(Number.MAX_SAFE_INTEGER, maskCost * operations));
    c.step(owner, rejectedCount + 16); masks(2); const all = (1n << BigInt(rejectedCount)) - 1n;
    const inputs: State[] = [], states: {accepting: boolean; edges: {to: number; label: Label}[]}[] = [], known = new Map<string, number>();
    const intern = (state: State) => {
      c.step(owner, 64); masks(2); const key = state.at + ':' + state.failed + ':' + state.position + ':' + state.after, before = known.get(key);
      if (before !== undefined) return before;
      c.step(owner, 6); const index = states.length; known.set(key, index); inputs.push(state);
      states.push({accepting: program.states[state.at].accepting && state.failed === all, edges: []}); return index;
    };
    const start = intern({at: program.start, failed: 0n, position: 0, after: false});
    const gaps = [9, 10, 13, 32];
    c.step(owner, program.states.length * 3 + 6); const pathCache = new Map<string, RegularLanguage>(), labelCache = new WeakMap<RegularLanguage, Map<string, readonly Label[]>>();
    const incoming: number[][] = program.states.map(() => []), productive = new Set<number>(), pending: number[] = [];
    for (let at = 0; at < program.states.length; at++) {
      if (program.states[at].accepting) {c.step(owner, 2); productive.add(at); pending.push(at);}
      for (const edge of program.states[at].transitions) {c.step(owner); incoming[edge.to].push(at);}
    }
    while (pending.length) for (const at of incoming[pending.pop()!]) {
      c.step(owner); if (!productive.has(at)) {c.step(owner, 2); productive.add(at); pending.push(at);}
    }
    for (let cursor = 0; cursor < inputs.length; cursor++) {
      const from = inputs[cursor]; c.step(owner);
      if (mode === 'string') for (const edge of program.states[from.at].transitions) for (const cp of gaps) {
        c.step(owner); if (cp < edge.lo || cp > edge.hi) continue;
        const to = intern({...from, at: edge.to, after: false}); c.step(owner, 3); states[cursor].edges.push({to, label: whitespace(cp, owner)});
      }
      if (from.after) continue;
      for (let end = 0; end < program.states.length; end++) {
        c.step(owner); const endpoint = program.states[end];
        if (!productive.has(end)) continue;
        if (!endpoint.accepting && !endpoint.transitions.some(edge => gaps.some(cp => edge.lo <= cp && edge.hi >= cp))) continue;
        c.step(owner, 32); const key = from.at + ':' + end; let paths = pathCache.get(key);
        if (!paths) {
          paths = regular.intersect([regular.paths(program, [from.at], new Set([end]), owner), tokenDomain], owner);
          c.step(owner, 2); pathCache.set(key, paths);
        }
        if (regular.witness(paths, owner) === undefined) continue;
        c.step(owner, rejectedCount * 3 + 6); const missing: number[] = [];
        for (let bit = 0; bit < rejectedCount; bit++) {masks(2); if (!(from.failed & (1n << BigInt(bit)))) missing.push(bit);}
        masks(); const limit = 1n << BigInt(missing.length);
        for (let mask = 0n; mask < limit;) {
          c.step(owner, missing.length * 3 + 6); const rejected: number[] = []; let failed = from.failed;
          for (let bit = 0; bit < missing.length; bit++) {masks(2); if (mask & (1n << BigInt(bit))) {rejected.push(missing[bit]); masks(2); failed |= 1n << BigInt(missing[bit]);}}
          masks(); mask++;
          c.step(owner, rejected.length * 16 + 6); const labelKey = from.position + ':' + JSON.stringify(rejected);
          let table = labelCache.get(paths); if (!table) {c.step(owner, 2); table = new Map(); labelCache.set(paths, table);}
          let selected = table.get(labelKey);
          if (!selected) {selected = labels(paths, from.position, rejected, owner); c.step(owner, 2); table.set(labelKey, selected);}
          if (!selected.length) continue;
          const position = Math.min(maximumPosition, from.position + 1), destinations: number[] = [];
          if (mode === 'string') destinations.push(intern({at: end, failed, position, after: true}));
          else {
            if (endpoint.accepting) destinations.push(intern({at: end, failed, position, after: true}));
            for (const edge of endpoint.transitions) {c.step(owner); if (edge.lo <= 32 && edge.hi >= 32) destinations.push(intern({at: edge.to, failed, position, after: false}));}
          }
          c.step(owner, destinations.length * selected.length * 3 + 2);
          for (const to of destinations) for (const label of selected) states[cursor].edges.push({to, label});
        }
      }
    }
    return {start, states};
  };
  return {image};
}
