/** Finite decimal carry products for images of nonnegative integer fields. */
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

export function schemaIntegerImages<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  expression: (text: string, owner: Owner) => RegularLanguage) {
  const sum = (inputs: readonly {language: RegularLanguage; weight: number}[], owner: Owner, initialCarry = 0): RegularLanguage => {
    c.step(owner, inputs.length * 2 + 4);
    c.step(owner, inputs.length + 2);
    if (!Number.isSafeInteger(initialCarry) || inputs.some(input => !Number.isSafeInteger(input.weight) || input.weight < 0)
      || !Number.isSafeInteger(inputs.reduce((sum, input) => sum + input.weight * 9, Math.abs(initialCarry))))
      throw new TypeError('Integer image weights and carry must use exact safe arithmetic');
    const programs = inputs.map(input => regular.automaton(regular.reverse(input.language, owner), owner));
    c.step(owner, programs.length * 2 + 3); const productive = programs.map(program => {
      c.step(owner, program.states.length * 3 + 4); const incoming: number[][] = program.states.map(() => []), useful = new Set<number>(), pending: number[] = [];
      for (let from = 0; from < program.states.length; from++) {
        if (program.states[from].accepting) {c.step(owner, 2); useful.add(from); pending.push(from);}
        for (const edge of program.states[from].transitions) if (edge.lo <= 57 && edge.hi >= 48) {c.step(owner); incoming[edge.to].push(from);}
      }
      while (pending.length) {c.step(owner); const state = pending.pop()!; for (const from of incoming[state]) {
        c.step(owner); if (!useful.has(from)) {c.step(owner, 2); useful.add(from); pending.push(from);}
      }}
      return useful;
    });
    if (programs.some((program, index) => !productive[index].has(program.start))) return regular.union([], owner);
    type State = {positions: readonly number[]; carry: number};
    type Edge = {to: number; ranges?: readonly (readonly [number, number])[]};
    c.step(owner, programs.length + 6); const states: State[] = [{positions: programs.map(program => program.start), carry: initialCarry}], edges: Edge[][] = [[]];
    const identity = (state: State) => {c.step(owner, state.positions.length * 16 + 32); return JSON.stringify(state);};
    c.step(owner, 3); const seen = new Map([[identity(states[0]), 0]]), accepted: number[] = [];
    for (let cursor = 0; cursor < states.length; cursor++) {
      c.step(owner, inputs.length + 2); const state = states[cursor];
      if (state.carry === 0 && state.positions.every((position, index) => position === -1 || programs[index].states[position].accepting)) accepted.push(cursor);
      c.step(owner, inputs.length * 2 + 3); const choices: {digit: number; to: number}[][] = [];
      for (let index = 0; index < inputs.length; index++) {
        const position = state.positions[index]; c.step(owner, 2); const row: {digit: number; to: number}[] = [];
        if (position === -1 || programs[index].states[position].accepting) {c.step(owner, 2); row.push({digit: 0, to: -1});}
        if (position !== -1) for (const edge of programs[index].states[position].transitions) {
          c.step(owner); if (!productive[index].has(edge.to)) continue;
          for (let cp = Math.max(48, edge.lo); cp <= Math.min(57, edge.hi); cp++) {c.step(owner, 2); row.push({digit: cp - 48, to: edge.to});}
        }
        choices.push(row);
      }
      c.step(owner, 4); const frontier = [{index: 0, value: state.carry, positions: [] as number[]}];
      while (frontier.length) {
        c.step(owner); const frame = frontier.pop()!;
        if (frame.index !== inputs.length) {
          for (const option of choices[frame.index]) {
            c.step(owner, frame.positions.length + 5); frontier.push({index: frame.index + 1,
              value: frame.value + option.digit * inputs[frame.index].weight, positions: [...frame.positions, option.to]});
          }
          continue;
        }
        c.step(owner, 6); const digit = (frame.value % 10 + 10) % 10, next: State = {positions: frame.positions, carry: Math.floor(frame.value / 10)}, key = identity(next);
        let to = seen.get(key);
        if (to === undefined) {c.step(owner, key.length + 6); to = states.length; states.push(next); edges.push([]); seen.set(key, to);}
        c.step(owner, 4); edges[cursor].push({to, ranges: [[48 + digit, 48 + digit]]});
      }
    }
    c.step(owner, accepted.length * 3 + 3); const end = edges.length; edges.push([]);
    for (const state of accepted) edges[state].push({to: end});
    const raw = regular.reverse(regular.fromNfa({edges, start: 0, end}, owner), owner), choices: RegularLanguage[] = [];
    if (regular.witness(regular.intersect([raw, expression('0*', owner)], owner), owner) !== undefined) choices.push(expression('0', owner));
    choices.push(regular.intersect([regular.quotient(raw, expression('0*', owner), expression('', owner), owner), expression('[1-9][0-9]*', owner)], owner));
    return regular.union(choices, owner);
  };
  return {sum};
}
