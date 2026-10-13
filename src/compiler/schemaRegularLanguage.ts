/** Finite automata over XML code points. Empty search is a complete language result. */
import type {PatternAtom} from './schemaPattern.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

type Range = readonly [number, number];
type Edge = {to: number; ranges?: readonly Range[]};
type Machine = {edges: Edge[][]; start: number; end: number};
export type RegularLanguage = Readonly<{kind: 'private-regular-language'}>;
export type RegularAutomaton = Readonly<{states: readonly Readonly<{accepting: boolean;
  transitions: readonly Readonly<{to: number; lo: number; hi: number}>[]}>[]; start: number}>;
type Formula = {kind: 'leaf'; machine: Machine} | {kind: 'and' | 'or'; children: readonly Formula[]} |
  {kind: 'not'; child: Formula};
const XML: readonly Range[] = [[9, 10], [13, 13], [32, 0xd7ff], [0xe000, 0xfffd], [0x10000, 0x10ffff]];

export function schemaRegularLanguages<Owner>(c: SchemaPatternContext<Owner>) {
  const records = new WeakMap<RegularLanguage, Formula>();
  const materialized = new WeakMap<RegularLanguage, Machine>();
  const deterministic = new WeakMap<RegularLanguage, RegularAutomaton>();
  const witnesses = new WeakMap<RegularLanguage, Readonly<{word: string | undefined}>>();
  const classes = new Map<string, readonly Range[]>();
  const formulaLanguages = new WeakMap<Formula, RegularLanguage>(), formulaIds = new WeakMap<Formula, number>();
  const booleanLanguages = new Map<string, RegularLanguage>(), complements = new WeakMap<Formula, RegularLanguage>();
  let nextFormulaId = 0;
  const issue = (formula: Formula, owner: Owner): RegularLanguage => {
    c.step(owner); const known = formulaLanguages.get(formula); if (known) return known;
    c.step(owner, 3); const language = Object.freeze({kind: 'private-regular-language' as const});
    c.step(owner, 3); records.set(language, formula); formulaLanguages.set(formula, language); formulaIds.set(formula, nextFormulaId++); return language;
  };
  const read = (language: RegularLanguage): Formula => {
    const formula = records.get(language);
    if (!formula) throw new TypeError('Regular language must be issued by this request factory');
    return formula;
  };
  const normalize = (ranges: readonly Range[], owner: Owner): readonly Range[] => {
    c.step(owner, ranges.length * ranges.length + ranges.length * 4 + 1);
    const sorted = [...ranges].sort((a, b) => a[0] - b[0]), result: [number, number][] = [];
    for (const [lo, hi] of sorted) {
      c.step(owner, 3); const previous = result.at(-1);
      if (previous && lo <= previous[1] + 1) previous[1] = Math.max(previous[1], hi);
      else {c.step(owner, 3); result.push([lo, hi]);}
    }
    return result;
  };
  const complement = (ranges: readonly Range[], owner: Owner): readonly Range[] => {
    const sorted = normalize(ranges, owner), result: Range[] = [];
    for (const [lo, hi] of XML) {
      let cursor = lo;
      for (const [a, b] of sorted) {
        c.step(owner, 3);
        if (b < cursor || a > hi) continue;
        if (a > cursor) {c.step(owner, 3); result.push([cursor, Math.min(a - 1, hi)]);}
        cursor = Math.max(cursor, b + 1);
      }
      if (cursor <= hi) {c.step(owner, 3); result.push([cursor, hi]);}
    }
    return result;
  };
  const characterRanges = (expression: string, owner: Owner): readonly Range[] => {
    c.text(expression, owner); const cached = classes.get(expression); if (cached) return cached;
    // Literal/range classes avoid a Unicode sweep. Property escapes use the
    // same host Unicode authority as the admitted single-character assessor.
    let source = expression, removeColon = false;
    if (source.startsWith('(?!:)')) {source = source.slice('(?!:)'.length); removeColon = true;}
    let offset = 0;
    const point = (): {ranges: readonly Range[]; singleton?: number} => {
      c.step(owner, 3);
      if (source[offset] !== '\\') {
        const value = source.codePointAt(offset)!; offset += value > 0xffff ? 2 : 1;
        return {ranges: [[value, value]], singleton: value};
      }
      offset++; const escape = source[offset++];
      if (escape === 'u') {
        let raw: string;
        if (source[offset] === '{') {
          const start = ++offset;
          while (source[offset] !== '}') {c.step(owner); offset++;}
          c.step(owner, offset - start + 1); raw = source.slice(start, offset++);
        } else {c.step(owner, 4); raw = source.slice(offset, offset + 4); offset += 4;}
        c.text(raw, owner); const value = Number.parseInt(raw, 16);
        return {ranges: [[value, value]], singleton: value};
      }
      if (escape === 'p' || escape === 'P') {
        const start = offset - 2; offset++;
        while (source[offset] !== '}') {c.step(owner); offset++;}
        offset++; const key = source.slice(start, offset), known = classes.get(key);
        if (known) return {ranges: known};
        c.step(owner, key.length + 4); const regex = new RegExp(`^(?:${key})$`, 'u'), ranges: Range[] = [];
        for (const [lo, hi] of XML) {
          let begin: number | undefined;
          for (let cp = lo; cp <= hi; cp++) {
            c.step(owner, 3); const matches = regex.test(String.fromCodePoint(cp));
            if (matches && begin === undefined) begin = cp;
            if (!matches && begin !== undefined) {c.step(owner, 3); ranges.push([begin, cp - 1]); begin = undefined;}
          }
          if (begin !== undefined) {c.step(owner, 3); ranges.push([begin, hi]);}
        }
        c.step(owner, 2); classes.set(key, ranges); return {ranges};
      }
      const value = escape === 'n' ? 10 : escape === 'r' ? 13 : escape === 't' ? 9 : escape.codePointAt(0)!;
      return {ranges: [[value, value]], singleton: value};
    };
    const ranges: Range[] = []; let negative = false;
    if (source[0] === '[') {
      offset++; if (source[offset] === '^') {negative = true; offset++;}
      while (offset < source.length - 1) {
        const first = point();
        if (source[offset] === '-' && offset + 1 < source.length - 1) {
          offset++; const last = point();
          if (first.singleton === undefined || last.singleton === undefined) throw new TypeError('Invalid private character range');
          c.step(owner, 3); ranges.push([first.singleton, last.singleton]);
        } else {c.step(owner, first.ranges.length); ranges.push(...first.ranges);}
      }
    } else {const first = point(); c.step(owner, first.ranges.length); ranges.push(...first.ranges);}
    let result = negative ? complement(ranges, owner) : normalize(ranges, owner);
    if (removeColon) result = complement([...complement(result, owner), [58, 58]], owner);
    c.step(owner, 2); classes.set(expression, result); return result;
  };
  const fromPattern = (atoms: readonly PatternAtom[], root: number, owner: Owner): RegularLanguage => {
    c.step(owner, 4); const edges: Edge[][] = [];
    const state = () => {c.step(owner, 2); edges.push([]); return edges.length - 1;};
    const link = (from: number, to: number, ranges?: readonly Range[]) => {c.step(owner, 4); edges[from].push({to, ranges});};
    const start = state(), end = state();
    type Task = {node: number; start: number; end: number};
    c.step(owner, 4); const pending: Task[] = [{node: root, start, end}];
    while (pending.length) {
      c.step(owner); const task = pending.pop()!, atom = atoms[task.node];
      if (atom.kind === 'character') link(task.start, task.end, characterRanges(atom.expression, owner));
      else if (atom.kind === 'choice') {
        for (const node of atom.children) {c.step(owner, 4); pending.push({...task, node});}
      } else if (atom.kind === 'sequence') {
        let previous = task.start;
        if (!atom.children.length) link(previous, task.end);
        for (let i = 0; i < atom.children.length; i++) {
          const next = i === atom.children.length - 1 ? task.end : state();
          c.step(owner, 4); pending.push({node: atom.children[i], start: previous, end: next}); previous = next;
        }
      } else {
        c.text(atom.min, owner); c.text(atom.max, owner);
        c.step(owner, atom.min.length ** 2 + atom.max.length ** 2 + 2);
        const minimum = BigInt(atom.min), maximum = atom.max === 'unbounded' ? minimum : BigInt(atom.max);
        // A materialized Thompson construction needs these copies. Charging
        // first also prevents unsafe Number conversion or native allocations.
        c.step(owner, Number(maximum > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 16))
          ? BigInt(Number.MAX_SAFE_INTEGER) : maximum * 16n));
        let previous = task.start;
        for (let count = 0n; count < maximum; count++) {
          c.step(owner, atom.max.length + 2);
          if (count >= minimum) link(previous, task.end);
          const next = state(); c.step(owner, 4);
          pending.push({node: atom.child, start: previous, end: next}); previous = next;
        }
        link(previous, task.end);
        if (atom.max === 'unbounded') {
          const loop = state(); link(previous, loop); c.step(owner, 4);
          pending.push({node: atom.child, start: loop, end: previous});
        }
      }
    }
    return issue({kind: 'leaf', machine: {edges, start, end}}, owner);
  };
  const combine = (kind: 'and' | 'or', languages: readonly RegularLanguage[], owner: Owner): RegularLanguage => {
    c.step(owner, languages.length * 2 + 5); const pending = languages.map(read), children = new Set<Formula>();
    while (pending.length) {
      c.step(owner); const child = pending.pop()!;
      if (child.kind === kind) for (const nested of child.children) {c.step(owner); pending.push(nested);}
      else if (child.kind !== 'leaf' && child.kind !== 'not' && !child.children.length) return combine(child.kind, [], owner);
      else {c.step(owner); children.add(child);}
    }
    for (const child of children) {
      c.step(owner); if (child.kind === 'not' && children.has(child.child)) return combine(kind === 'and' ? 'or' : 'and', [], owner);
    }
    if (children.size === 1) return issue(children.values().next().value!, owner);
    c.step(owner, children.size ** 2 + children.size * 16 + 6); const ordered = [...children].sort((a, b) => formulaIds.get(a)! - formulaIds.get(b)!);
    const key = kind + ':' + ordered.map(child => formulaIds.get(child)).join(','); const known = booleanLanguages.get(key); if (known) return known;
    const language = issue({kind, children: ordered}, owner); c.step(owner, 2); booleanLanguages.set(key, language); return language;
  };
  const negate = (language: RegularLanguage, owner: Owner): RegularLanguage => {
    c.step(owner, 2); const child = read(language); if (child.kind === 'not') return issue(child.child, owner);
    const known = complements.get(child); if (known) return known;
    const result = issue({kind: 'not', child}, owner); c.step(owner, 2); complements.set(child, result); return result;
  };
  /** Breadth-first reachability on the finite product of subset machines. */
  const explore = (language: RegularLanguage, owner: Owner, firstOnly: boolean) => {
    const formula = read(language), machines: Machine[] = [], indices = new Map<Formula, number>();
    c.step(owner, 2); const pending = [formula], order: Formula[] = [], seenFormula = new Set<Formula>();
    while (pending.length) {
      c.step(owner, 3); const node = pending.pop()!;
      if (seenFormula.has(node)) continue;
      seenFormula.add(node); order.push(node);
      if (node.kind === 'leaf') {c.step(owner, 3); indices.set(node, machines.length); machines.push(node.machine);}
      else if (node.kind === 'not') {c.step(owner); pending.push(node.child);}
      else for (const child of node.children) {c.step(owner); pending.push(child);}
    }
    // Evaluate a formula by an explicit stack; shared subexpressions are
    // memoized per product state, independent of traversal order.
    const accepts = (sets: readonly (readonly number[])[]): boolean => {
      c.step(owner, 3); const results = new Map<Formula, boolean>(), stack = [{node: formula, ready: false}];
      while (stack.length) {
        c.step(owner, 3); const frame = stack.pop()!, node = frame.node;
        if (results.has(node)) continue;
        if (node.kind === 'leaf') {c.step(owner, sets[indices.get(node)!].length); results.set(node, sets[indices.get(node)!].includes(node.machine.end));}
        else if (!frame.ready) {
          c.step(owner, 3); stack.push({node, ready: true});
          const children = node.kind === 'not' ? [node.child] : node.children;
          for (const child of children) {c.step(owner, 3); stack.push({node: child, ready: false});}
        } else if (node.kind === 'not') results.set(node, !results.get(node.child)!);
        else {c.step(owner, node.children.length); results.set(node, node.kind === 'and'
          ? node.children.every(child => results.get(child)) : node.children.some(child => results.get(child)));}
      }
      return results.get(formula)!;
    };
    // An empty subset can never recover. Collapse products whose Boolean
    // formula is therefore permanently false into one rejecting sink. Other
    // machines must not keep generating unreachable combinations after an
    // obligatory lexical/pattern machine has already rejected every suffix.
    const impossible = (sets: readonly (readonly number[])[]): boolean => {
      c.step(owner, sets.length + 1); if (sets.every(set => set.length)) return false;
      c.step(owner, 3); const results = new Map<Formula, boolean | undefined>(), stack = [{node: formula, ready: false}];
      while (stack.length) {
        c.step(owner, 3); const frame = stack.pop()!, node = frame.node;
        if (results.has(node)) continue;
        if (node.kind === 'leaf') results.set(node, sets[indices.get(node)!].length ? undefined : false);
        else if (!frame.ready) {
          c.step(owner, 3); stack.push({node, ready: true});
          for (const child of node.kind === 'not' ? [node.child] : node.children) {c.step(owner, 3); stack.push({node: child, ready: false});}
        } else if (node.kind === 'not') {
          const value = results.get(node.child); results.set(node, value === undefined ? undefined : !value);
        } else {
          c.step(owner, node.children.length * 2 + 1); const values = node.children.map(child => results.get(child));
          results.set(node, node.kind === 'and' ? values.includes(false) ? false : values.every(value => value === true) ? true : undefined
            : values.includes(true) ? true : values.every(value => value === false) ? false : undefined);
        }
      }
      return results.get(formula) === false;
    };
    const productive = new WeakMap<Machine, ReadonlySet<number>>();
    const productiveStates = (machine: Machine): ReadonlySet<number> => {
      c.step(owner); const known = productive.get(machine); if (known) return known;
      c.step(owner, machine.edges.length * 2 + 5);
      const incoming: number[][] = machine.edges.map(() => []), result = new Set([machine.end]), pending = [machine.end];
      for (let from = 0; from < machine.edges.length; from++) for (const edge of machine.edges[from]) {
        c.step(owner, 2); if (edge.ranges === undefined || edge.ranges.length) incoming[edge.to].push(from);
      }
      while (pending.length) {
        c.step(owner); const state = pending.pop()!;
        for (const from of incoming[state]) {c.step(owner); if (!result.has(from)) {c.step(owner, 2); result.add(from); pending.push(from);}}
      }
      c.step(owner, 2); productive.set(machine, result); return result;
    };
    const closure = (machine: Machine, initial: readonly number[]): readonly number[] => {
      const useful = productiveStates(machine);
      c.step(owner, initial.length * 3 + 4); const starts = initial.filter(state => useful.has(state)), found = new Set(starts), pending = [...starts];
      while (pending.length) {
        c.step(owner); const current = pending.pop()!;
        for (const edge of machine.edges[current]) {
          c.step(owner, 2);
          if (!edge.ranges && useful.has(edge.to) && !found.has(edge.to)) {c.step(owner, 2); found.add(edge.to); pending.push(edge.to);}
        }
      }
      c.step(owner, found.size * found.size + found.size + 1); return [...found].sort((a, b) => a - b);
    };
    const key = (sets: readonly (readonly number[])[]) => {
      c.step(owner, sets.length * 3 + 1);
      for (const set of sets) c.step(owner, set.length * 16 + 1);
      return JSON.stringify(sets);
    };
    c.step(owner, machines.length * 2 + 4); const initial = machines.map(machine => closure(machine, [machine.start]));
    type State = {sets: readonly (readonly number[])[]; previous?: number; char?: string;
      accepting?: boolean; dead?: boolean; transitions: {to: number; lo: number; hi: number}[]};
    c.step(owner, 4); const states: State[] = [{sets: initial, transitions: []}], visited = new Map([[key(initial), 0]]);
    let dead: number | undefined;
    for (let cursor = 0; cursor < states.length; cursor++) {
      c.step(owner); const current = states[cursor];
      if (current.dead) continue;
      current.accepting = accepts(current.sets);
      if (current.accepting && firstOnly) {
        c.step(owner, 2); const characters: string[] = []; let index: number | undefined = cursor;
        while (index !== undefined) {
          c.step(owner, 3); const state: State = states[index]; if (state.char) characters.push(state.char); index = state.previous;
        }
        c.step(owner, characters.length * 3 + 1); return {word: characters.reverse().join(''), states};
      }
      c.step(owner, 2); const boundaries = new Set<number>();
      for (const [lo, hi] of XML) {c.step(owner, 2); boundaries.add(lo); boundaries.add(hi + 1);}
      for (let m = 0; m < machines.length; m++) for (const state of current.sets[m]) for (const edge of machines[m].edges[state]) {
        c.step(owner); for (const [lo, hi] of edge.ranges ?? []) {c.step(owner, 2); boundaries.add(lo); boundaries.add(hi + 1);}
      }
      c.step(owner, boundaries.size * boundaries.size + boundaries.size + 1);
      const points = [...boundaries].sort((a, b) => a - b);
      for (let p = 0; p < points.length - 1; p++) {
        const cp = points[p];
        c.step(owner, 5); if (!XML.some(([lo, hi]) => cp >= lo && cp <= hi)) continue;
        c.step(owner, machines.length * 2 + 1); const sets: (readonly number[])[] = [];
        for (let m = 0; m < machines.length; m++) {
          c.step(owner, 2); const next = new Set<number>();
          for (const state of current.sets[m]) for (const edge of machines[m].edges[state]) {
            c.step(owner);
            for (const [lo, hi] of edge.ranges ?? []) {
              c.step(owner, 2); if (cp >= lo && cp <= hi) {c.step(owner); next.add(edge.to); break;}
            }
          }
          c.step(owner, next.size); sets.push(closure(machines[m], [...next]));
        }
        if (impossible(sets)) {
          if (dead === undefined) {
            c.step(owner, XML.length * 4 + 5); dead = states.length;
            states.push({sets: [], accepting: false, dead: true, transitions: XML.map(([lo, hi]) => ({to: dead!, lo, hi}))});
          }
          c.step(owner, 4); current.transitions.push({to: dead, lo: cp, hi: points[p + 1] - 1}); continue;
        }
        const identity = key(sets);
        let target = visited.get(identity);
        if (target === undefined) {
          c.step(owner, identity.length + 8); target = states.length; visited.set(identity, target);
          states.push({sets, previous: cursor, char: String.fromCodePoint(cp), transitions: []});
        }
        c.step(owner, 4); current.transitions.push({to: target, lo: cp, hi: points[p + 1] - 1});
      }
    }
    return {word: undefined, states};
  };
  const witness = (language: RegularLanguage, owner: Owner): string | undefined => {
    read(language); c.step(owner); const known = witnesses.get(language);
    if (known) {if (known.word !== undefined) c.text(known.word, owner); return known.word;}
    const word = explore(language, owner, true).word;
    // An aborted exploration throws before this publication. Only a complete
    // finite emptiness result or an actual lexical witness enters the cache.
    c.step(owner, 3); witnesses.set(language, {word}); return word;
  };
  /** Finite Moore refinement. Canonical adjacent interval coalescing compares
   * transition functions without expanding the XML character alphabet. */
  const minimize = (program: RegularAutomaton, owner: Owner): RegularAutomaton => {
    c.step(owner, program.states.length * 3 + 4); let count = 0;
    const initial = new Map<boolean, number>(); let blocks = program.states.map(state => {
      let block = initial.get(state.accepting); if (block === undefined) {c.step(owner, 2); block = count++; initial.set(state.accepting, block);} return block;
    });
    const row = (index: number, partition: readonly number[]) => {
      c.step(owner, program.states[index].transitions.length * 4 + 3); const result: {to: number; lo: number; hi: number}[] = [];
      for (const edge of program.states[index].transitions) {
        c.step(owner, 2); const to = partition[edge.to], previous = result.at(-1);
        if (previous?.to === to && previous.hi + 1 === edge.lo) previous.hi = edge.hi;
        else {c.step(owner, 4); result.push({to, lo: edge.lo, hi: edge.hi});}
      }
      return result;
    };
    while (true) {
      c.step(owner, program.states.length + 4); const signatures = new Map<string, number>(), next: number[] = [];
      for (let index = 0; index < program.states.length; index++) {
        const transitions = row(index, blocks); c.step(owner, transitions.length * 64 + 16);
        const key = JSON.stringify([program.states[index].accepting, transitions]); let block = signatures.get(key);
        if (block === undefined) {c.step(owner, 2); block = signatures.size; signatures.set(key, block);} next.push(block);
      }
      const stable = signatures.size === count; blocks = next; count = signatures.size; if (stable) break;
    }
    c.step(owner, count * 3 + program.states.length + 4); const states: {accepting: boolean; transitions: {to: number; lo: number; hi: number}[]}[] = new Array(count);
    for (let index = 0; index < program.states.length; index++) if (!states[blocks[index]]) states[blocks[index]] = {accepting: program.states[index].accepting, transitions: row(index, blocks)};
    return {start: blocks[program.start], states};
  };
  const automaton = (language: RegularLanguage, owner: Owner): RegularAutomaton => {
    c.step(owner); let program = deterministic.get(language);
    if (!program) {
      const {states} = explore(language, owner, false);
      c.step(owner, states.length * 3 + 2);
      program = minimize({start: 0, states: states.map(state => ({accepting: state.accepting!, transitions: state.transitions}))}, owner);
      deterministic.set(language, program);
    }
    // Returned programs are snapshots. Mutating one cannot alter the private
    // cache or a subsequently composed proof.
    c.step(owner, program.states.length * 3 + 2);
    return {start: program.start, states: program.states.map(state => {
      c.step(owner, state.transitions.length * 4 + 2);
      return {accepting: state.accepting, transitions: state.transitions.map(edge => ({...edge}))};
    })};
  };
  const materialize = (language: RegularLanguage, owner: Owner): Machine => {
    c.step(owner); const known = materialized.get(language); if (known) return known;
    const formula = read(language);
    // Thompson machines are already composable. Determinizing a leaf before
    // every concatenation needlessly repeats the full subset construction.
    if (formula.kind === 'leaf') return formula.machine;
    const program = automaton(language, owner), edges: Edge[][] = [];
    c.step(owner, program.states.length * 2 + 4); const end = program.states.length;
    for (const state of program.states) {
      c.step(owner, state.transitions.length * 6 + 3);
      const row: Edge[] = state.transitions.map(edge => ({to: edge.to, ranges: [[edge.lo, edge.hi]]}));
      if (state.accepting) {c.step(owner, 2); row.push({to: end});}
      edges.push(row);
    }
    c.step(owner, 3); edges.push([]); const machine = {start: program.start, end, edges};
    materialized.set(language, machine); return machine;
  };
  const fromAutomaton = (program: RegularAutomaton, owner: Owner): RegularLanguage => {
    c.step(owner, program.states.length * 2 + 3); const edges: Edge[][] = [], end = program.states.length;
    for (const state of program.states) {
      c.step(owner, state.transitions.length * 6 + 3);
      const row: Edge[] = state.transitions.map(edge => ({to: edge.to, ranges: [[edge.lo, edge.hi]]}));
      if (state.accepting) {c.step(owner, 2); row.push({to: end});}
      edges.push(row);
    }
    c.step(owner); edges.push([]); return issue({kind: 'leaf', machine: {edges, start: program.start, end}}, owner);
  };
  const paths = (program: RegularAutomaton, starts: readonly number[], ends: ReadonlySet<number>, owner: Owner): RegularLanguage => {
    c.step(owner, program.states.length * 2 + starts.length * 2 + 5);
    const edges: Edge[][] = [], start = program.states.length, end = start + 1;
    for (let index = 0; index < program.states.length; index++) {
      const state = program.states[index]; c.step(owner, state.transitions.length * 6 + 3);
      const row: Edge[] = state.transitions.map(edge => ({to: edge.to, ranges: [[edge.lo, edge.hi]]}));
      if (ends.has(index)) {c.step(owner, 2); row.push({to: end});} edges.push(row);
    }
    edges.push(starts.map(to => ({to})), []); return issue({kind: 'leaf', machine: {edges, start, end}}, owner);
  };
  /** {x | there exist p in prefix and s in suffix with p x s in source}. */
  const quotient = (source: RegularLanguage, prefix: RegularLanguage, suffix: RegularLanguage, owner: Owner): RegularLanguage => {
    const a = automaton(source, owner), p = automaton(prefix, owner), s = automaton(suffix, owner);
    c.step(owner, a.states.length * s.states.length * 3 + 8);
    const pairs: number[][] = a.states.map(() => s.states.map(() => 0)), incoming: number[][] = [];
    for (let ai = 0; ai < a.states.length; ai++) for (let si = 0; si < s.states.length; si++) {
      c.step(owner, 2); pairs[ai][si] = incoming.length; incoming.push([]);
    }
    const useful = new Set<number>(), pending: number[] = [];
    for (let ai = 0; ai < a.states.length; ai++) for (let si = 0; si < s.states.length; si++) {
      c.step(owner); const id = pairs[ai][si];
      if (a.states[ai].accepting && s.states[si].accepting) {c.step(owner, 2); useful.add(id); pending.push(id);}
      for (const ae of a.states[ai].transitions) for (const se of s.states[si].transitions) {
        c.step(owner, 2); if (Math.max(ae.lo, se.lo) <= Math.min(ae.hi, se.hi)) incoming[pairs[ae.to][se.to]].push(id);
      }
    }
    while (pending.length) {
      c.step(owner); const id = pending.pop()!;
      for (const before of incoming[id]) {c.step(owner); if (!useful.has(before)) {c.step(owner, 2); useful.add(before); pending.push(before);}}
    }
    c.step(owner, a.states.length + 4); const ends = new Set<number>();
    for (let ai = 0; ai < a.states.length; ai++) {c.step(owner); if (useful.has(pairs[ai][s.start])) ends.add(ai);}
    c.step(owner, 5); const frontier = [[a.start, p.start]], seen = new Set([a.start + ':' + p.start]), starts = new Set<number>();
    for (let cursor = 0; cursor < frontier.length; cursor++) {
      c.step(owner); const [ai, pi] = frontier[cursor];
      if (p.states[pi].accepting) {c.step(owner); starts.add(ai);}
      for (const ae of a.states[ai].transitions) for (const pe of p.states[pi].transitions) {
        c.step(owner, 2); if (Math.max(ae.lo, pe.lo) > Math.min(ae.hi, pe.hi)) continue;
        c.step(owner, 32); const id = ae.to + ':' + pe.to;
        if (!seen.has(id)) {c.step(owner, 3); seen.add(id); frontier.push([ae.to, pe.to]);}
      }
    }
    c.step(owner, starts.size); return paths(a, [...starts], ends, owner);
  };
  const concatenate = (languages: readonly RegularLanguage[], owner: Owner): RegularLanguage => {
    c.step(owner, 4); const edges: Edge[][] = [[]]; let previous = 0;
    for (const language of languages) {
      const machine = materialize(language, owner), offset = edges.length;
      c.step(owner, 3); edges[previous].push({to: machine.start + offset});
      for (const row of machine.edges) {
        c.step(owner, row.length * 5 + 2); edges.push(row.map(edge => ({...edge, to: edge.to + offset})));
      }
      previous = machine.end + offset;
    }
    return issue({kind: 'leaf', machine: {edges, start: 0, end: previous}}, owner);
  };
  const repeat = (language: RegularLanguage, min: number, max: number | 'unbounded', owner: Owner): RegularLanguage => {
    const machine = materialize(language, owner); c.step(owner, 4); const edges: Edge[][] = [[], []];
    const clone = () => {
      const offset = edges.length;
      for (const row of machine.edges) {c.step(owner, row.length * 5 + 2); edges.push(row.map(edge => ({...edge, to: edge.to + offset})));}
      return {start: machine.start + offset, end: machine.end + offset};
    };
    let previous = 0;
    for (let count = 0; count < (max === 'unbounded' ? min : max); count++) {
      c.step(owner, 4); if (count >= min) edges[previous].push({to: 1});
      const next = clone(); c.step(owner, 2); edges[previous].push({to: next.start}); previous = next.end;
    }
    c.step(owner, 2); edges[previous].push({to: 1});
    if (max === 'unbounded') {const loop = clone(); c.step(owner, 4); edges[previous].push({to: loop.start}); edges[loop.end].push({to: previous});}
    return issue({kind: 'leaf', machine: {edges, start: 0, end: 1}}, owner);
  };
  /** Complete inverse of XML whitespace normalization on a normalized language. */
  const whitespacePreimage = (language: RegularLanguage, mode: 'preserve' | 'replace' | 'collapse', owner: Owner): RegularLanguage => {
    if (mode === 'preserve') return language;
    const program = automaton(language, owner), edges: Edge[][] = [];
    const ws: readonly Range[] = [[9, 10], [13, 13], [32, 32]];
    c.step(owner, program.states.length * 2 + 6);
    for (const _state of program.states) edges.push([]);
    const start = edges.length; edges.push([]); const end = edges.length; edges.push([]);
    const link = (from: number, to: number, ranges?: readonly Range[]) => {c.step(owner, 4); edges[from].push({to, ranges});};
    link(start, program.start);
    if (mode === 'collapse') link(start, start, ws);
    for (let from = 0; from < program.states.length; from++) {
      const state = program.states[from];
      if (state.accepting) link(from, end);
      for (const edge of state.transitions) {
        c.step(owner, 3);
        // Normalized languages exclude tab/LF/CR. Only output space has
        // extra raw forms; all remaining XML characters map identically.
        for (const [lo, hi] of complement([[9, 10], [13, 13], [32, 32]], owner)) {
          const a = Math.max(lo, edge.lo), b = Math.min(hi, edge.hi);
          if (a <= b) link(from, edge.to, [[a, b]]);
        }
        if (edge.lo <= 32 && edge.hi >= 32) {
          if (mode === 'replace') link(from, edge.to, ws);
          else {
            c.step(owner, 2); const middle = edges.length; edges.push([]);
            link(from, middle, ws); link(middle, middle, ws); link(middle, edge.to);
          }
        }
      }
    }
    if (mode === 'collapse') link(end, end, ws);
    return issue({kind: 'leaf', machine: {edges, start, end}}, owner);
  };
  /** Finite transducer image of raw XML whitespace normalization. */
  const whitespaceImage = (language: RegularLanguage, mode: 'preserve' | 'replace' | 'collapse', owner: Owner): RegularLanguage => {
    if (mode === 'preserve') return language;
    const program = automaton(language, owner), phases = mode === 'collapse' ? 3 : 1, edges: Edge[][] = [];
    c.step(owner, program.states.length * phases * 2 + 6);
    for (let index = 0; index < program.states.length * phases + 1; index++) edges.push([]);
    const end = edges.length - 1, state = (input: number, phase: number) => input * phases + phase;
    const ws: readonly Range[] = [[9, 10], [13, 13], [32, 32]], other = complement(ws, owner);
    const link = (from: number, to: number, ranges?: readonly Range[]) => {c.step(owner, 4); edges[from].push({to, ranges});};
    for (let input = 0; input < program.states.length; input++) for (let phase = 0; phase < phases; phase++) {
      const from = state(input, phase); if (program.states[input].accepting) link(from, end);
      for (const edge of program.states[input].transitions) {
        for (const [lo, hi] of ws) {
          c.step(owner, 3); if (Math.max(lo, edge.lo) > Math.min(hi, edge.hi)) continue;
          if (mode === 'replace') link(from, state(edge.to, 0), [[32, 32]]);
          else link(from, state(edge.to, phase === 0 ? 0 : 2));
        }
        for (const [lo, hi] of other) {
          c.step(owner, 3); const a = Math.max(lo, edge.lo), b = Math.min(hi, edge.hi); if (a > b) continue;
          const to = state(edge.to, mode === 'replace' ? 0 : 1);
          if (phase !== 2) link(from, to, [[a, b]]);
          else {c.step(owner, 2); const middle = edges.length; edges.push([]); link(from, middle, [[32, 32]]); link(middle, to, [[a, b]]);}
        }
      }
    }
    return issue({kind: 'leaf', machine: {edges, start: state(program.start, 0), end}}, owner);
  };
  const characterImage = (language: RegularLanguage, changes: readonly {lo: number; hi: number; shift?: number; remove?: boolean}[], owner: Owner): RegularLanguage => {
    const program = automaton(language, owner), edges: Edge[][] = [], end = program.states.length;
    c.step(owner, program.states.length * 2 + changes.length * 2 + 4);
    for (const state of program.states) {
      c.step(owner, state.transitions.length * 2 + 3); const row: Edge[] = [];
      if (state.accepting) row.push({to: end});
      for (const edge of state.transitions) {
        c.step(owner, changes.length * 4 + 4); const points = new Set([edge.lo, edge.hi + 1]);
        for (const change of changes) if (change.lo <= edge.hi && change.hi >= edge.lo) {points.add(Math.max(edge.lo, change.lo)); points.add(Math.min(edge.hi + 1, change.hi + 1));}
        c.step(owner, points.size ** 2 + points.size + 2); const ordered = [...points].sort((a, b) => a - b);
        for (let index = 0; index + 1 < ordered.length; index++) {
          c.step(owner, changes.length + 4); const lo = ordered[index], hi = ordered[index + 1] - 1, change = changes.find(change => lo >= change.lo && hi <= change.hi);
          row.push({to: edge.to, ranges: change?.remove ? undefined : [[lo + (change?.shift ?? 0), hi + (change?.shift ?? 0)]]});
        }
      }
      edges.push(row);
    }
    c.step(owner); edges.push([]); return issue({kind: 'leaf', machine: {edges, start: program.start, end}}, owner);
  };
  const reverse = (language: RegularLanguage, owner: Owner): RegularLanguage => {
    const machine = materialize(language, owner); c.step(owner, machine.edges.length * 2 + 3);
    const edges: Edge[][] = machine.edges.map(() => []);
    for (let from = 0; from < machine.edges.length; from++) for (const edge of machine.edges[from]) {
      c.step(owner, 4); edges[edge.to].push({to: from, ranges: edge.ranges});
    }
    return issue({kind: 'leaf', machine: {edges, start: machine.end, end: machine.start}}, owner);
  };
  const fromNfa = (program: Readonly<{edges: readonly (readonly Readonly<{to: number; ranges?: readonly Range[]}>[])[]; start: number; end: number}>, owner: Owner): RegularLanguage => {
    c.step(owner, program.edges.length * 2 + 3);
    const edges = program.edges.map(row => {
      c.step(owner, row.length * 4 + 2); return row.map(edge => {
        c.step(owner, (edge.ranges?.length ?? 0) * 3 + 2); return {to: edge.to, ranges: edge.ranges?.map(([lo, hi]) => [lo, hi] as const)};
      });
    });
    return issue({kind: 'leaf', machine: {edges, start: program.start, end: program.end}}, owner);
  };
  const substitutionGraph = (count: number, start: number, end: number, labels: readonly {from: number; to: number; language: RegularLanguage}[], owner: Owner): RegularLanguage => {
    c.step(owner, count * 2 + labels.length * 2 + 4); const edges: Edge[][] = [];
    for (let index = 0; index < count; index++) edges.push([]);
    for (const label of labels) {
      const machine = materialize(label.language, owner), offset = edges.length;
      c.step(owner, 4); edges[label.from].push({to: machine.start + offset});
      for (const row of machine.edges) {c.step(owner, row.length * 5 + 2); edges.push(row.map(edge => ({...edge, to: edge.to + offset})));}
      c.step(owner, 2); edges[machine.end + offset].push({to: label.to});
    }
    return issue({kind: 'leaf', machine: {edges, start, end}}, owner);
  };
  const jsonStringImage = (language: RegularLanguage, owner: Owner): RegularLanguage => {
    const program = automaton(language, owner), edges: Edge[][] = [], end = program.states.length;
    c.step(owner, program.states.length * 2 + 4); for (let index = 0; index <= end; index++) edges.push([]);
    for (let from = 0; from < program.states.length; from++) {
      if (program.states[from].accepting) {c.step(owner, 2); edges[from].push({to: end});}
      for (const edge of program.states[from].transitions) {
        c.step(owner, 14); const points = [edge.lo, edge.hi + 1];
        for (const cp of [9, 10, 13, 34, 92]) if (cp >= edge.lo && cp <= edge.hi) points.push(cp, cp + 1);
        c.step(owner, points.length ** 2 + 2); points.sort((a, b) => a - b);
        for (let index = 0; index + 1 < points.length; index++) {
          const lo = points[index], hi = points[index + 1] - 1; c.step(owner, 5); if (lo > hi) continue;
          const escaped = lo === hi && [9, 10, 13, 34, 92].includes(lo);
          if (!escaped) edges[from].push({to: edge.to, ranges: [[lo, hi]]});
          else {
            c.step(owner, 6); const middle = edges.length; edges.push([]); edges[from].push({to: middle, ranges: [[92, 92]]});
            const cp = lo === 9 ? 116 : lo === 10 ? 110 : lo === 13 ? 114 : lo; edges[middle].push({to: edge.to, ranges: [[cp, cp]]});
          }
        }
      }
    }
    return issue({kind: 'leaf', machine: {edges, start: program.start, end}}, owner);
  };
  /** Exhaustive words only when the productive deterministic graph is acyclic. */
  const finiteWords = (language: RegularLanguage, owner: Owner): {kind: 'infinite'} | {kind: 'finite'; words: Generator<string>} => {
    const {states} = explore(language, owner, false);
    c.step(owner, states.length * 3 + 3);
    const incoming: number[][] = states.map(() => []), productive = new Set<number>(), pending: number[] = [];
    for (let from = 0; from < states.length; from++) {
      c.step(owner, 2);
      if (states[from].accepting) {c.step(owner, 2); productive.add(from); pending.push(from);}
      for (const transition of states[from].transitions) {c.step(owner); incoming[transition.to].push(from);}
    }
    while (pending.length) {
      c.step(owner); const current = pending.pop()!;
      for (const from of incoming[current]) {
        c.step(owner); if (!productive.has(from)) {c.step(owner, 2); productive.add(from); pending.push(from);}
      }
    }
    c.step(owner, states.length * 2 + 2); const degrees = states.map(() => 0), queue: number[] = [];
    for (const from of productive) for (const transition of states[from].transitions) {
      c.step(owner); if (productive.has(transition.to)) degrees[transition.to]++;
    }
    for (const from of productive) {c.step(owner); if (degrees[from] === 0) queue.push(from);}
    let removed = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      c.step(owner); const from = queue[cursor]; removed++;
      for (const transition of states[from].transitions) {
        c.step(owner); if (productive.has(transition.to) && --degrees[transition.to] === 0) {c.step(owner); queue.push(transition.to);}
      }
    }
    if (removed !== productive.size) return {kind: 'infinite'};
    function* words(): Generator<string> {
      if (!productive.has(0)) return;
      type Frame = {state: number; word: string; transition: number; point?: number; entered: boolean};
      c.step(owner, 6); const stack: Frame[] = [{state: 0, word: '', transition: 0, entered: false}];
      while (stack.length) {
        c.step(owner); const frame = stack.at(-1)!;
        if (!frame.entered) {frame.entered = true; if (states[frame.state].accepting) {c.text(frame.word, owner); yield frame.word;}}
        const edge = states[frame.state].transitions[frame.transition];
        if (!edge) {stack.pop(); continue;}
        if (!productive.has(edge.to)) {frame.transition++; continue;}
        const cp = frame.point ?? edge.lo;
        if (cp === edge.hi) {frame.transition++; frame.point = undefined;} else frame.point = cp + 1;
        c.step(owner, frame.word.length + 8); stack.push({state: edge.to, word: frame.word + String.fromCodePoint(cp), transition: 0, entered: false});
      }
    }
    c.step(owner, 2); return {kind: 'finite', words: words()};
  };
  /** Fair exhaustive positive search; absence is never inferred from this. */
  const words = (language: RegularLanguage, owner: Owner): Generator<string> => {
    const program = automaton(language, owner);
    c.step(owner, program.states.length * 3 + 4); const incoming: number[][] = program.states.map(() => []), useful = new Set<number>(), pending: number[] = [];
    for (let from = 0; from < program.states.length; from++) {
      if (program.states[from].accepting) {c.step(owner, 2); useful.add(from); pending.push(from);}
      for (const edge of program.states[from].transitions) {c.step(owner); incoming[edge.to].push(from);}
    }
    while (pending.length) {c.step(owner); const state = pending.pop()!; for (const before of incoming[state]) {
      c.step(owner); if (!useful.has(before)) {c.step(owner, 2); useful.add(before); pending.push(before);}
    }}
    function* enumerate(): Generator<string> {
      if (!useful.has(program.start)) return;
      c.step(owner, 4); let frontier = [{state: program.start, word: ''}];
      while (frontier.length) {
        c.step(owner, 2); const next: typeof frontier = [];
        for (const {state, word} of frontier) {
          c.step(owner); if (program.states[state].accepting) {c.text(word, owner); yield word;}
          for (const edge of program.states[state].transitions) {
            c.step(owner); if (!useful.has(edge.to)) continue;
            c.step(owner, (edge.hi - edge.lo + 1) * (word.length + 6));
            for (let cp = edge.lo; cp <= edge.hi; cp++) next.push({state: edge.to, word: word + String.fromCodePoint(cp)});
          }
        }
        frontier = next;
      }
    }
    return enumerate();
  };
  return {fromPattern, intersect: (languages: readonly RegularLanguage[], owner: Owner) => combine('and', languages, owner),
    union: (languages: readonly RegularLanguage[], owner: Owner) => combine('or', languages, owner), negate, witness, finiteWords,
    automaton, fromAutomaton, fromNfa, substitutionGraph, jsonStringImage, paths, quotient, reverse, concatenate, repeat, whitespacePreimage, whitespaceImage, characterImage, words};
}
