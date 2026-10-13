/** Exact IEEE inverse images through finite significand/count/exponent products. */
import type {SchemaOperand} from './schemaDatatypeValues.js';
import type {RegularAutomaton, RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';
import {schemaDecimalLanguages} from './schemaDecimalLanguage.js';

type Decimal = {coefficient: bigint; scale: number; digits?: number};
type Endpoint = {value: Decimal; inclusive: boolean};
export type IeeeInputInterval = Readonly<{negative: boolean; lower?: Endpoint; upper?: Endpoint}>;
export type IeeeBound = Readonly<{name: 'minInclusive' | 'minExclusive' | 'maxInclusive' | 'maxExclusive'; value: SchemaOperand}>;
type WeightedEdge = {to: number; weight: 0 | 1; char: string};

export function schemaIeeeLanguages<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  expression: (expression: string, owner: Owner) => RegularLanguage) {
  const decimals = schemaDecimalLanguages(c);
  const charge = (owner: Owner, digits: number) => c.step(owner, (digits + 4) ** 2);
  const normalize = (value: Decimal, owner: Owner): Decimal => {
    c.step(owner); if (value.coefficient === 0n) return {coefficient: 0n, scale: 0, digits: 1};
    c.step(owner, (value.digits ?? value.scale + 330) + 4);
    const text = value.coefficient.toString(); let zeros = 0;
    while (zeros < value.scale) {
      c.step(owner, 3); if (text[text.length - zeros - 1] !== '0') break; zeros++;
    }
    if (!zeros) return {...value, digits: text.length};
    charge(owner, text.length + zeros); c.step(owner, 4);
    return {coefficient: value.coefficient / 10n ** BigInt(zeros), scale: value.scale - zeros, digits: text.length - zeros};
  };
  const key = (value: Decimal, owner: Owner): string => {
    charge(owner, value.digits ?? value.scale + 330); c.step(owner, value.scale + (value.digits ?? 330) + 2);
    const digits = value.coefficient.toString().padStart(value.scale + 1, '0');
    return value.scale ? digits.slice(0, -value.scale) + '.' + digits.slice(-value.scale) : digits;
  };
  const add = (a: Decimal, b: Decimal, owner: Owner): Decimal => {
    const scale = Math.max(a.scale, b.scale), digits = Math.max((a.digits ?? 330) + scale - a.scale, (b.digits ?? 330) + scale - b.scale) + 1; charge(owner, digits);
    return normalize({coefficient: a.coefficient * 10n ** BigInt(scale - a.scale) + b.coefficient * 10n ** BigInt(scale - b.scale), scale, digits}, owner);
  };
  const half = (a: Decimal, owner: Owner): Decimal => {
    charge(owner, a.digits ?? a.scale + 330); return normalize(a.coefficient % 2n === 0n
      ? {coefficient: a.coefficient / 2n, scale: a.scale, digits: a.digits} : {coefficient: a.coefficient * 5n, scale: a.scale + 1, digits: (a.digits ?? 330) + 1}, owner);
  };
  const binary = (significand: bigint, exponent: number, owner: Owner): Decimal => {
    const digits = exponent >= 0 ? Math.floor((exponent + 53) / 3) + 1 : -exponent + 18;
    charge(owner, digits);
    return normalize(exponent >= 0 ? {coefficient: significand << BigInt(exponent), scale: 0, digits}
      : {coefficient: significand * 5n ** BigInt(-exponent), scale: -exponent, digits}, owner);
  };
  const ieeeValue = (bits: bigint, single: boolean, owner: Owner): Decimal => {
    c.step(owner, 16); const precision = single ? 24 : 53, bias = single ? 127 : 1023;
    const mask = (1n << BigInt(precision - 1)) - 1n, fraction = bits & mask, exponent = Number(bits >> BigInt(precision - 1));
    return binary(fraction + (exponent ? 1n << BigInt(precision - 1) : 0n),
      (exponent ? exponent - bias : 1 - bias) - (precision - 1), owner);
  };
  const inverseCache = new Map<string, readonly IeeeInputInterval[]>();
  const copyIntervals = (input: readonly IeeeInputInterval[], owner: Owner): readonly IeeeInputInterval[] => {
    c.step(owner, input.length * 16 + 2);
    return input.map(interval => ({...interval,
      ...(interval.lower ? {lower: {...interval.lower, value: {...interval.lower.value}}} : {}),
      ...(interval.upper ? {upper: {...interval.upper, value: {...interval.upper.value}}} : {})}));
  };
  const inverseIntervals = (target: SchemaOperand, owner: Owner): readonly IeeeInputInterval[] => {
    c.text(target.family, owner); c.text(target.canonical, owner); c.step(owner, target.family.length + target.canonical.length + 4);
    const key = target.family + ':' + target.canonical, cached = inverseCache.get(key);
    if (cached) return copyIntervals(cached, owner);
    const result = computeInverseIntervals(target, owner);
    // Cache only a completed inverse, and keep its endpoints private. A caller
    // can never mutate a later inverse result or avoid a sticky budget failure.
    const retained = copyIntervals(result, owner); c.step(owner, 2); inverseCache.set(key, retained);
    return result;
  };
  const computeInverseIntervals = (target: SchemaOperand, owner: Owner): readonly IeeeInputInterval[] => {
    const single = target.family === 'float', p = single ? 24 : 53, minimum = single ? -126 : -1022, maximum = single ? 127 : 1023;
    if (target.canonical === 'NaN') return [];
    if (target.canonical === '0') {
      const threshold = binary(1n, minimum - p, owner);
      c.step(owner, 6); return [{negative: false, upper: {value: threshold, inclusive: true}}, {negative: true, upper: {value: threshold, inclusive: true}}];
    }
    const infinity = target.canonical === 'Infinity' || target.canonical === '-Infinity', negative = target.canonical.startsWith('-');
    // Overflow tie goes to the even carried significand (infinity).
    const overflow = binary((1n << BigInt(p + 1)) - 1n, maximum - p, owner);
    if (infinity) {c.step(owner, 4); return [{negative, lower: {value: overflow, inclusive: true}}];}
    c.step(owner, 24 + target.canonical.length);
    const bytes = new ArrayBuffer(8), view = new DataView(bytes), number = Math.abs(Number(target.canonical));
    let bits: bigint;
    if (single) {view.setFloat32(0, number); bits = BigInt(view.getUint32(0));}
    else {view.setFloat64(0, number); bits = view.getBigUint64(0);}
    const actual = ieeeValue(bits, single, owner), prior = ieeeValue(bits - 1n, single, owner);
    const last = single ? 0x7f7fffffn : 0x7fefffffffffffffn;
    const next = bits === last ? undefined : ieeeValue(bits + 1n, single, owner), even = bits % 2n === 0n;
    c.step(owner, 6); return [{negative, lower: {value: half(add(prior, actual, owner), owner), inclusive: even},
      upper: {value: next ? half(add(actual, next, owner), owner) : overflow, inclusive: even}}];
  };
  const order = (value: Decimal, owner: Owner): number => {
    charge(owner, value.digits ?? value.scale + 330); return value.coefficient.toString().length - value.scale - 1;
  };
  const scaled = (value: Decimal, exponent: number, owner: Owner): Decimal => {
    const scale = value.scale + exponent, digits = (value.digits ?? 330) + Math.max(0, -scale); charge(owner, digits);
    return normalize(scale >= 0 ? {coefficient: value.coefficient, scale, digits}
      : {coefficient: value.coefficient * 10n ** BigInt(-scale), scale: 0, digits}, owner);
  };
  const move = (program: RegularAutomaton, state: number, cp: number, owner: Owner): number | undefined => {
    for (const edge of program.states[state].transitions) {c.step(owner); if (cp >= edge.lo && cp <= edge.hi) return edge.to;}
    return undefined;
  };
  const suffix = (program: RegularAutomaton, start: number, owner: Owner): RegularLanguage => {
    c.step(owner, 2); return regular.fromAutomaton({states: program.states, start}, owner);
  };
  const integerInverse = (value: bigint, owner: Owner): RegularLanguage => {
    c.step(owner, 32); const negative = value < 0n, digits = (negative ? -value : value).toString(); c.text(digits, owner);
    c.step(owner, digits.length + 24);
    return expression(value === 0n ? '[+\\-]?0+' : (negative ? '\\-' : '[+]?') + '0*' + digits, owner);
  };
  const modulo = (period: number, residue: number, owner: Owner): RegularLanguage => {
    // Two signed remainder copies and a nonaccepting initial state.
    c.step(owner, period * 64 + 16);
    const states: {accepting: boolean; transitions: {to: number; lo: number; hi: number}[]}[] = [];
    const positive = 1, negative = period + 1, signPositive = period * 2 + 1, signNegative = signPositive + 1;
    for (let index = 0; index <= signNegative; index++) states.push({accepting: false, transitions: []});
    states[0].transitions.push({to: signPositive, lo: 43, hi: 43}, {to: signNegative, lo: 45, hi: 45});
    for (const [start, offset] of [[0, positive], [signPositive, positive], [signNegative, negative]]) for (let digit = 0; digit < 10; digit++) {
      c.step(owner, 4); states[start].transitions.push({to: offset + digit % period, lo: 48 + digit, hi: 48 + digit});
    }
    for (let remainder = 0; remainder < period; remainder++) for (const offset of [positive, negative]) {
      c.step(owner, 2); states[offset + remainder].accepting = remainder === (offset === positive ? residue : (period - residue) % period);
      for (let digit = 0; digit < 10; digit++) {c.step(owner, 4); states[offset + remainder].transitions.push({to: offset + (remainder * 10 + digit) % period, lo: 48 + digit, hi: 48 + digit});}
    }
    return regular.fromAutomaton({states, start: 0}, owner);
  };
  const search = (language: RegularLanguage, interval: IeeeInputInterval, exponentOrder: number, relation: 'equal' | 'less' | 'greater', owner: Owner): string | undefined => {
    const input = regular.automaton(language, owner);
    c.step(owner, input.states.length * 3 + 4); const incoming: number[][] = input.states.map(() => []), productive = new Set<number>(), pending: number[] = [];
    for (let from = 0; from < input.states.length; from++) {
      c.step(owner); if (input.states[from].accepting) {c.step(owner, 2); productive.add(from); pending.push(from);}
      for (const edge of input.states[from].transitions) {c.step(owner); incoming[edge.to].push(from);}
    }
    while (pending.length) for (const previous of incoming[pending.pop()!]) {
      c.step(owner); if (!productive.has(previous)) {c.step(owner, 2); productive.add(previous); pending.push(previous);}
    }
    if (!productive.has(input.start)) return undefined;
    c.step(owner, input.states.length * 3 + 2);
    const program: RegularAutomaton = {start: input.start, states: input.states.map(state => {
      c.step(owner, state.transitions.length + 2); return {...state, transitions: state.transitions.filter(edge => productive.has(edge.to))};
    })};
    const lower = relation === 'equal' && interval.lower ? scaled(interval.lower.value, exponentOrder, owner) : undefined;
    const upper = relation === 'equal' && interval.upper ? scaled(interval.upper.value, exponentOrder, owner) : undefined;
    const threshold = (value: Decimal | undefined): string | undefined => value ? key(value, owner).replace('.', '') : undefined;
    const low = threshold(lower), high = threshold(upper);
    // Bounds outside [1,10) either disappear or reject this whole order.
    const lowerText = lower ? key(lower, owner) : undefined, upperText = upper ? key(upper, owner) : undefined;
    if (lowerText && (lowerText.startsWith('0.') || lowerText === '0')) return search(language, {...interval, lower: undefined}, exponentOrder, relation, owner);
    if (lowerText && Number(lowerText.split('.')[0]) >= 10) return undefined;
    if (upperText && Number(upperText.split('.')[0]) >= 10) return search(language, {...interval, upper: undefined}, exponentOrder, relation, owner);
    if (upperText && (upperText.startsWith('0.') || upperText === '0')) return undefined;
    const compareDigit = (state: number, digits: string | undefined, digit: number): number => {
      if (digits === undefined || state < 0) return state;
      c.step(owner); const expected = state < digits.length ? Number(digits[state]) : 0;
      return digit < expected ? -1 : digit > expected ? -2 : Math.min(state + 1, digits.length);
    };
    const compareEnd = (state: number, digits: string | undefined): number => {
      if (digits === undefined) return 0;
      if (state === -1) return -1; if (state === -2) return 1;
      c.step(owner, digits.length - state + 1); return /[1-9]/.test(digits.slice(state)) ? -1 : 0;
    };
    type State = {source: number; dotted: boolean; nonzero: boolean; lo: number; hi: number};
    type Final = {node: number; exponent?: RegularLanguage; marker: string};
    for (const fractional of [false, true]) {
      c.step(owner, 6); const states: State[] = [], edges: WeightedEdge[][] = [[]], ids = new Map<string, number>(), finals: Final[] = [];
      const publish = (state: State): number => {
        c.step(owner, 32); const key = JSON.stringify(state), prior = ids.get(key); if (prior !== undefined) return prior;
        c.step(owner, key.length + 10); const id = states.length + 1; ids.set(key, id); states.push(state); edges.push([]); return id;
      };
      const first = (source: number, char: string) => {const id = publish({source, dotted: false, nonzero: false, lo: 0, hi: 0}); c.step(owner, 5); edges[0].push({to: id, weight: 0, char});};
      if (!interval.negative) {first(program.start, ''); const plus = move(program, program.start, 43, owner); if (plus !== undefined) first(plus, '+');}
      else {const minus = move(program, program.start, 45, owner); if (minus !== undefined) first(minus, '-');}
      for (let cursor = 0; cursor < states.length; cursor++) {
        c.step(owner, 4); const state = states[cursor], node = cursor + 1;
        const lowOrder = compareEnd(state.lo, low), highOrder = compareEnd(state.hi, high);
        const accepted = state.nonzero && (!low || lowOrder > 0 || lowOrder === 0 && interval.lower!.inclusive)
          && (!high || highOrder < 0 || highOrder === 0 && interval.upper!.inclusive);
        if (accepted) {
          if (program.states[state.source].accepting) {c.step(owner, 4); finals.push({node, marker: ''});}
          for (const marker of ['e', 'E']) {
            const next = move(program, state.source, marker.charCodeAt(0), owner);
            if (next !== undefined) {c.step(owner, 4); finals.push({node, marker, exponent: suffix(program, next, owner)});}
          }
        }
        if (!state.dotted) {
          const dot = move(program, state.source, 46, owner);
          if (dot !== undefined) {const next = publish({...state, source: dot, dotted: true}); c.step(owner, 5); edges[node].push({to: next, weight: 0, char: '.'});}
        }
        for (let digit = 0; digit < 10; digit++) {
          const nextSource = move(program, state.source, 48 + digit, owner); if (nextSource === undefined) continue;
          if (!state.nonzero && digit !== 0 && state.dotted !== fractional) continue;
          const nonzero = state.nonzero || digit !== 0;
          const next = publish({...state, source: nextSource, nonzero,
            lo: nonzero ? compareDigit(state.lo, low, digit) : state.lo,
            hi: nonzero ? compareDigit(state.hi, high, digit) : state.hi});
          const weight = fractional ? state.dotted && !state.nonzero ? 1 : 0 : state.nonzero && !state.dotted ? 1 : 0;
          c.step(owner, 5); edges[node].push({to: next, weight, char: String(digit)});
        }
      }
      if (!finals.length) continue;
      const closure = (input: readonly number[]): number[] => {
        c.step(owner, input.length * 2 + 4); const seen = new Set(input), pending = [...input];
        while (pending.length) for (const edge of edges[pending.pop()!]) {
          c.step(owner, 2); if (!edge.weight && !seen.has(edge.to)) {c.step(owner, 2); seen.add(edge.to); pending.push(edge.to);}
        }
        c.step(owner, seen.size ** 2 + seen.size + 1); return [...seen].sort((a, b) => a - b);
      };
      const path = (count: bigint, target: number): string => {
        c.step(owner, Number(count > BigInt(Math.floor(Number.MAX_SAFE_INTEGER / 16)) ? BigInt(Number.MAX_SAFE_INTEGER) : count * 16n));
        const wanted = Number(count); type Step = {node: number; count: number; prior?: number; char: string};
        c.step(owner, 8); const queue: Step[] = [{node: 0, count: 0, char: ''}], seen = new Set(['0:0']);
        for (let cursor = 0; cursor < queue.length; cursor++) {
          c.step(owner); const step = queue[cursor];
          if (step.node === target && step.count === wanted) {
            c.step(owner, 2); const chars: string[] = []; let index: number | undefined = cursor;
            while (index !== undefined) {c.step(owner, 2); const item: Step = queue[index]; chars.push(item.char); index = item.prior;}
            c.step(owner, chars.length * 2 + 1); return chars.reverse().join('');
          }
          for (const edge of edges[step.node]) {
            c.step(owner, 12); const next = step.count + edge.weight, identity = edge.to + ':' + next;
            if (next > wanted || seen.has(identity)) continue;
            c.step(owner, identity.length + 8); seen.add(identity); queue.push({node: edge.to, count: next, prior: cursor, char: edge.char});
          }
        }
        throw new TypeError('Accepted unary count must have a mantissa path');
      };
      const probe = (final: Final, count: bigint, exponent?: string): string | undefined => {
        const e = fractional ? BigInt(exponentOrder) + count : BigInt(exponentOrder) - count;
        if (!final.exponent) {
          if (relation === 'equal' ? e !== 0n : relation === 'less' ? e <= 0n : e >= 0n) return undefined;
          return path(count, final.node);
        }
        let word = exponent;
        if (word === undefined) {
          let candidate = integerInverse(e, owner);
          if (relation !== 'equal') {
            const text = decimals.relation(e.toString(), relation === 'greater', owner);
            candidate = text === undefined ? regular.union([], owner) : expression(text, owner);
          }
          word = regular.witness(regular.intersect([final.exponent, candidate], owner), owner);
        }
        if (word === undefined) return undefined;
        const mantissa = path(count, final.node); c.step(owner, mantissa.length + word.length + 2); return mantissa + final.marker + word;
      };
      c.step(owner, 6); const orbit: number[][] = [], known = new Map<string, number>(); let current = closure([0]), prefix = 0;
      while (true) {
        c.step(owner, current.length * 16 + 4); const identity = JSON.stringify(current), previous = known.get(identity);
        if (previous !== undefined) {prefix = previous; break;}
        c.step(owner, identity.length + current.length + 4); known.set(identity, orbit.length); orbit.push(current);
        for (const final of finals) {
          c.step(owner, current.length + 1); if (!current.includes(final.node)) continue;
          const word = probe(final, BigInt(orbit.length - 1)); if (word !== undefined) return word;
        }
        c.step(owner, 2); const next: number[] = [];
        for (const node of current) for (const edge of edges[node]) {c.step(owner); if (edge.weight) {c.step(owner); next.push(edge.to);}}
        current = closure(next);
      }
      const period = orbit.length - prefix;
      for (let index = prefix; index < orbit.length; index++) for (const final of finals) {
        c.step(owner, orbit[index].length + 2); if (!orbit[index].includes(final.node)) continue;
        if (!final.exponent) {
          const required = BigInt(fractional ? -exponentOrder : exponentOrder);
          let count: bigint | undefined;
          if (relation === 'equal' && required >= BigInt(index) && (required - BigInt(index)) % BigInt(period) === 0n) count = required;
          else if (fractional && relation === 'less' || !fractional && relation === 'greater') {
            const minimum = required >= BigInt(index) ? required + 1n : BigInt(index);
            count = BigInt(index) + ((minimum - BigInt(index) + BigInt(period) - 1n) / BigInt(period)) * BigInt(period);
          }
          if (count !== undefined) {const word = probe(final, count); if (word !== undefined) return word;}
          continue;
        }
        const initial = fractional ? BigInt(exponentOrder + index) : BigInt(exponentOrder - index);
        if (relation !== 'equal') {
          // For an unbounded available count the favorable half-line is
          // automatic; any accepted exponent supplies some large count.
          if (fractional && relation === 'less' || !fractional && relation === 'greater') {
            const word = regular.witness(final.exponent, owner); if (word === undefined) continue;
            charge(owner, word.length + 4); const exponent = BigInt(word), boundary = fractional ? exponent - BigInt(exponentOrder) : BigInt(exponentOrder) - exponent;
            const lowerCount = boundary >= BigInt(index) ? boundary + 1n : BigInt(index);
            c.step(owner, 32); const count = BigInt(index) + ((lowerCount - BigInt(index) + BigInt(period) - 1n) / BigInt(period)) * BigInt(period);
            const result = probe(final, count, word); if (result !== undefined) return result;
          }
          continue;
        }
        c.step(owner, 32); const residue = Number((initial % BigInt(period) + BigInt(period)) % BigInt(period));
        const comparison = decimals.relation(initial.toString(), fractional ? false : true, owner);
        const outside = comparison === undefined ? regular.union([], owner) : expression(comparison, owner);
        const allowed = regular.intersect([final.exponent, modulo(period, residue, owner), regular.negate(outside, owner)], owner);
        const word = regular.witness(allowed, owner); if (word === undefined) continue;
        charge(owner, word.length + 4); const exponent = BigInt(word), count = fractional ? exponent - BigInt(exponentOrder) : BigInt(exponentOrder) - exponent;
        const result = probe(final, count, word); if (result !== undefined) return result;
      }
    }
    return undefined;
  };
  const intervalWitness = (language: RegularLanguage, interval: IeeeInputInterval, owner: Owner): string | undefined => {
    if (!interval.lower && !interval.upper) return regular.witness(regular.intersect([language,
      expression((interval.negative ? '\\-' : '[+]?') + '([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+\\-]?[0-9]+)?', owner)], owner), owner);
    if (!interval.lower) {
      const zero = regular.witness(regular.intersect([language, expression((interval.negative ? '\\-' : '[+]?') + '(0+([.]0*)?|[.]0+)([eE][+\\-]?[0-9]+)?', owner)], owner), owner);
      if (zero !== undefined) return zero;
    }
    const first = interval.lower ? order(interval.lower.value, owner) : undefined, last = interval.upper ? order(interval.upper.value, owner) : undefined;
    if (first === undefined && last !== undefined) {const word = search(language, interval, last, 'less', owner); if (word !== undefined) return word;}
    if (last === undefined && first !== undefined) {const word = search(language, interval, first, 'greater', owner); if (word !== undefined) return word;}
    for (let exponent = first ?? last!; exponent <= (last ?? first!); exponent++) {
      c.step(owner); const word = search(language, interval, exponent, 'equal', owner); if (word !== undefined) return word;
    }
    return undefined;
  };
  const witness = (language: RegularLanguage, target: SchemaOperand, owner: Owner): string | undefined => {
    c.text(target.canonical, owner);
    if (target.canonical === 'NaN') return regular.witness(regular.intersect([language, expression('NaN', owner)], owner), owner);
    if (target.canonical === 'Infinity' || target.canonical === '-Infinity') {
      const literal = regular.witness(regular.intersect([language, expression(target.canonical[0] === '-' ? '\\-INF' : 'INF', owner)], owner), owner);
      if (literal !== undefined) return literal;
    }
    if (target.canonical === '0') {
      const zero = regular.witness(regular.intersect([language, expression('[+\\-]?(0+([.]0*)?|[.]0+)([eE][+\\-]?[0-9]+)?', owner)], owner), owner);
      if (zero !== undefined) return zero;
    }
    for (const interval of inverseIntervals(target, owner)) {
      const word = intervalWitness(language, interval, owner); if (word !== undefined) return word;
    }
    return undefined;
  };
  const rank = (value: SchemaOperand, owner: Owner): bigint => {
    c.text(value.canonical, owner); c.step(owner, 24);
    const bytes = new ArrayBuffer(8), view = new DataView(bytes), number = Number(value.canonical);
    let bits: bigint;
    if (value.family === 'float') {view.setFloat32(0, Math.abs(number)); bits = BigInt(view.getUint32(0));}
    else {view.setFloat64(0, Math.abs(number)); bits = view.getBigUint64(0);}
    return number < 0 ? -bits : bits;
  };
  const rankedValue = (bits: bigint, single: boolean, owner: Owner): SchemaOperand => {
    c.step(owner, 32); const bytes = new ArrayBuffer(8), view = new DataView(bytes);
    let number: number;
    if (single) {view.setUint32(0, Number(bits)); number = view.getFloat32(0);}
    else {view.setBigUint64(0, bits); number = view.getFloat64(0);}
    c.step(owner, 32); return {family: single ? 'float' : 'double', canonical: String(number)};
  };
  /** A complete predicate over IEEE ranks, converted to exact input intervals. */
  const wideningWitness = (language: RegularLanguage, family: 'float' | 'double', supplied: readonly IeeeBound[], prior: IeeeBound, owner: Owner): string | undefined => {
    const single = family === 'float', infinity = single ? 0x7f800000n : 0x7ff0000000000000n;
    let lo = -infinity, hi = infinity, ordinary = true, nan = true;
    for (const bound of supplied) {
      c.step(owner, 6);
      if (bound.value.canonical === 'NaN') {ordinary = false; if (bound.name.endsWith('Exclusive')) nan = false; continue;}
      nan = false; const value = rank(bound.value, owner);
      if (bound.name.startsWith('min')) {const minimum = value + (bound.name.endsWith('Exclusive') ? 1n : 0n); if (minimum > lo) lo = minimum;}
      else {const maximum = value - (bound.name.endsWith('Exclusive') ? 1n : 0n); if (maximum < hi) hi = maximum;}
    }
    if (prior.value.canonical === 'NaN') {if (!prior.name.endsWith('Exclusive')) nan = false;}
    else {
      const value = rank(prior.value, owner);
      if (prior.name.startsWith('min')) {const maximum = value - (prior.name.endsWith('Inclusive') ? 1n : 0n); if (maximum < hi) hi = maximum;}
      else {const minimum = value + (prior.name.endsWith('Inclusive') ? 1n : 0n); if (minimum > lo) lo = minimum;}
    }
    if (nan) {const word = regular.witness(regular.intersect([language, expression('NaN', owner)], owner), owner); if (word !== undefined) return word;}
    if (!ordinary || lo > hi) return undefined;
    for (const [negative, bits] of [[true, -infinity], [false, infinity]] as const) if (lo <= bits && hi >= bits) {
      const word = regular.witness(regular.intersect([language, expression(negative ? '\\-INF' : 'INF', owner)], owner), owner); if (word !== undefined) return word;
    }
    if (lo <= 0n && hi >= 0n) for (const interval of inverseIntervals({family, canonical: '0'}, owner)) {
      const word = intervalWitness(language, interval, owner); if (word !== undefined) return word;
    }
    for (const negative of [false, true]) {
      const minimum = negative ? hi < -1n ? -hi : 1n : lo > 1n ? lo : 1n;
      const maximum = negative ? -lo : hi;
      if (minimum > maximum) continue;
      const lower = inverseIntervals(rankedValue(minimum, single, owner), owner)[0].lower;
      const upper = inverseIntervals(rankedValue(maximum, single, owner), owner)[0].upper;
      const word = intervalWitness(language, {negative, lower, upper}, owner); if (word !== undefined) return word;
    }
    return undefined;
  };
  const boundIntervals = (family: 'float' | 'double', bounds: readonly IeeeBound[], owner: Owner) => {
    const single = family === 'float', infinity = single ? 0x7f800000n : 0x7ff0000000000000n;
    let lo = -infinity, hi = infinity, ordinary = true, nan = true;
    for (const bound of bounds) {
      c.step(owner, 6);
      if (bound.value.canonical === 'NaN') {ordinary = false; if (bound.name.endsWith('Exclusive')) nan = false; continue;}
      nan = false; const value = rank(bound.value, owner);
      if (bound.name.startsWith('min')) {const minimum = value + (bound.name.endsWith('Exclusive') ? 1n : 0n); if (minimum > lo) lo = minimum;}
      else {const maximum = value - (bound.name.endsWith('Exclusive') ? 1n : 0n); if (maximum < hi) hi = maximum;}
    }
    c.step(owner, 4); const intervals: IeeeInputInterval[] = [], literals: string[] = nan ? ['NaN'] : [];
    if (!ordinary || lo > hi) return {intervals, literals};
    for (const [negative, bits] of [[true, -infinity], [false, infinity]] as const)
      if (lo <= bits && hi >= bits) literals.push(negative ? '-INF' : 'INF');
    for (const negative of [false, true]) {
      const minimum = negative ? hi < 0n ? -hi : 0n : lo > 0n ? lo : 0n, maximum = negative ? -lo : hi;
      if (minimum > maximum) continue;
      const lower = minimum === 0n ? undefined : inverseIntervals(rankedValue(minimum, single, owner), owner)[0].lower;
      const upper = maximum === 0n ? inverseIntervals({family, canonical: '0'}, owner)[0].upper
        : inverseIntervals(rankedValue(maximum, single, owner), owner)[0].upper;
      intervals.push({negative, lower, upper});
    }
    return {intervals, literals};
  };
  const compareExact = (a: Decimal, b: Decimal, owner: Owner) => {
    const scale = Math.max(a.scale, b.scale);
    // Only the scale difference extends a coefficient: its existing fractional
    // digits are already included in digits. Charging the whole common scale
    // again greatly overstates subnormal endpoint comparisons.
    charge(owner, Math.max((a.digits ?? a.scale + 330) + scale - a.scale,
      (b.digits ?? b.scale + 330) + scale - b.scale));
    const x = a.coefficient * 10n ** BigInt(scale - a.scale), y = b.coefficient * 10n ** BigInt(scale - b.scale);
    return x < y ? -1 : x > y ? 1 : 0;
  };
  const subtractIntervals = (input: readonly IeeeInputInterval[], removed: readonly IeeeInputInterval[], owner: Owner): readonly IeeeInputInterval[] => {
    c.step(owner, input.length + 2); let result = [...input];
    for (const cut of removed) {
      c.step(owner, result.length + 2); const next: IeeeInputInterval[] = [];
      for (const original of result) {
        c.step(owner, 6); if (original.negative !== cut.negative) {next.push(original); continue;}
        const lower = !original.lower ? cut.lower : !cut.lower ? original.lower
          : compareExact(original.lower.value, cut.lower.value, owner) > 0 ? original.lower
            : compareExact(original.lower.value, cut.lower.value, owner) < 0 ? cut.lower
              : {...original.lower, inclusive: original.lower.inclusive && cut.lower.inclusive};
        const upper = !original.upper ? cut.upper : !cut.upper ? original.upper
          : compareExact(original.upper.value, cut.upper.value, owner) < 0 ? original.upper
            : compareExact(original.upper.value, cut.upper.value, owner) > 0 ? cut.upper
              : {...original.upper, inclusive: original.upper.inclusive && cut.upper.inclusive};
        const order = lower && upper ? compareExact(lower.value, upper.value, owner) : -1;
        if (order > 0 || order === 0 && !(lower!.inclusive && upper!.inclusive)) {next.push(original); continue;}
        if (lower && (!original.lower || compareExact(original.lower.value, lower.value, owner) < 0
          || compareExact(original.lower.value, lower.value, owner) === 0 && original.lower.inclusive && !lower.inclusive))
          next.push({...original, upper: {...lower, inclusive: !lower.inclusive}});
        if (upper && (!original.upper || compareExact(original.upper.value, upper.value, owner) > 0
          || compareExact(original.upper.value, upper.value, owner) === 0 && original.upper.inclusive && !upper.inclusive))
          next.push({...original, lower: {...upper, inclusive: !upper.inclusive}});
      }
      result = next;
    }
    return result;
  };
  function* formatValues(family: 'float' | 'double', owner: Owner): Generator<SchemaOperand> {
    const single = family === 'float', infinity = single ? 0x7f800000n : 0x7ff0000000000000n;
    c.step(owner, 64); yield {family, canonical: 'NaN'};
    for (let bits = -infinity; bits <= infinity; bits++) {
      c.step(owner, 64); const value = rankedValue(bits < 0n ? -bits : bits, single, owner);
      yield bits < 0n ? {...value, canonical: '-' + value.canonical} : value;
    }
  }
  const decimalInputLanguage = (intervals: readonly IeeeInputInterval[], literals: readonly string[], owner: Owner): RegularLanguage => {
    c.step(owner, intervals.length + literals.length + 3); const choices: RegularLanguage[] = literals.map(value => expression(value === '-INF' ? '\\-INF' : value, owner));
    for (const interval of intervals) {
      const predicates: RegularLanguage[] = [expression('([0-9]+([.][0-9]*)?|[.][0-9]+)', owner)];
      for (const [endpoint, lower] of [[interval.lower, true], [interval.upper, false]] as const) {
        if (!endpoint) continue;
        const greater = lower ? !endpoint.inclusive : endpoint.inclusive, source = decimals.relation(key(endpoint.value, owner), greater, owner);
        const language = source === undefined ? regular.union([], owner) : expression(source, owner);
        predicates.push(endpoint.inclusive ? regular.negate(language, owner) : language);
      }
      choices.push(regular.concatenate([expression(interval.negative ? '\\-' : '[+]?', owner), regular.intersect(predicates, owner)], owner));
    }
    return regular.union(choices, owner);
  };
  /** On unsigned integer mantissas and nonnegative exponents, only finitely
   * many exponents can straddle an interval endpoint. Above their decimal
   * orders every nonzero mantissa exceeds every finite endpoint; zero stays
   * zero. This covers the exponent syntax admitted inside binary alphabets. */
  const unsignedExponentialLanguage = (source: RegularLanguage, intervals: readonly IeeeInputInterval[], owner: Owner): RegularLanguage => {
    const exponentGrammar = expression('[+]?0*[0-9]+', owner), mantissa = expression('[+]?[0-9]+', owner), marker = expression('[eE]', owner);
    const positive = intervals.filter(interval => !interval.negative); c.step(owner, intervals.length + 4);
    let cutoff = 0;
    for (const interval of positive) for (const endpoint of [interval.lower, interval.upper]) if (endpoint) cutoff = Math.max(cutoff, order(endpoint.value, owner) + 1);
    c.step(owner, 2); const choices: RegularLanguage[] = [];
    for (let exponent = 0; exponent < cutoff; exponent++) {
      c.step(owner, 64); const suffix = regular.concatenate([marker, expression('[+]?0*' + exponent, owner)], owner);
      const token = regular.quotient(source, expression('', owner), suffix, owner);
      if (regular.witness(regular.intersect([token, mantissa], owner), owner) === undefined) continue;
      c.step(owner, positive.length * 8 + 3); const scaledIntervals = positive.map(interval => ({negative: false,
        lower: interval.lower && {...interval.lower, value: scaled(interval.lower.value, exponent, owner)},
        upper: interval.upper && {...interval.upper, value: scaled(interval.upper.value, exponent, owner)}}));
      choices.push(regular.concatenate([regular.intersect([mantissa, decimalInputLanguage(scaledIntervals, [], owner)], owner), suffix], owner));
    }
    const tail = regular.intersect([exponentGrammar, regular.negate(decimalInputLanguage([{negative: false, upper: {value: {coefficient: BigInt(cutoff), scale: 0}, inclusive: false}}], [], owner), owner)], owner);
    if (positive.some(interval => !interval.upper)) choices.push(regular.concatenate([expression('[+]?0*[1-9][0-9]*', owner), marker, tail], owner));
    if (positive.some(interval => (!interval.lower || interval.lower.value.coefficient === 0n && interval.lower.inclusive)
      && (!interval.upper || interval.upper.value.coefficient !== 0n || interval.upper.inclusive)))
      choices.push(regular.concatenate([expression('[+]?0+', owner), marker, exponentGrammar], owner));
    return regular.intersect([source, regular.union(choices, owner)], owner);
  };
  return {witness, inverseIntervals, intervalWitness, wideningWitness, boundIntervals, subtractIntervals, formatValues, decimalInputLanguage, unsignedExponentialLanguage};
}
