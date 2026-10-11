/** Evidenced XSD regex subset for schema operands and #184's enforcement plan. */
import type {SchemaLexicalOperand, SchemaPatternContext} from "./schemaValueContext.js";
import {XML_NAME_RANGES} from '../loader/orderedSyntax.js';

export type PatternAtom = Readonly<{kind: "character"; expression: string} |
  {kind: "sequence"; children: readonly number[]} | {kind: "choice"; children: readonly number[]} |
  {kind: "repeat"; child: number; min: string; max: string | "unbounded"}>;
export type SchemaPattern = Readonly<{
  language: "xsd10-whole-string"; atoms: readonly PatternAtom[]; root: number;
  unicode: "code-points"; runtimeOwner: "#184";
}>;
type LiteralAtom = Readonly<{kind: 'literal'; value: string} | {kind: 'outside'} |
  {kind: 'sequence' | 'choice'; children: readonly number[]} |
  {kind: 'repeat'; child: number; min: string; max: string | 'unbounded'}>;
type LiteralProgram = Readonly<{atoms: readonly LiteralAtom[]; root: number}>;

export function schemaPatterns<Owner>(c: SchemaPatternContext<Owner>) {return createSchemaPatterns(c, false);}
/** Closed assessment-schema consumer; this does not widen the application profile. */
export function fixedS4SPatterns<Owner>(c: SchemaPatternContext<Owner>) {return createSchemaPatterns(c, true);}
function createSchemaPatterns<Owner>(c: SchemaPatternContext<Owner>, fixedSchemaNames: boolean) {
  // Separate privately captured records: mutating an exposed plan cannot
  // manufacture literal-language authority or alter these compiled facts.
  const literalPrograms = new WeakMap<SchemaPattern, LiteralProgram>();
  const compile = (lexical: SchemaLexicalOperand, owner: Owner): SchemaPattern => {
    c.text(lexical.value, owner); const source = lexical.value, atoms: PatternAtom[] = [], literals: LiteralAtom[] = [];
    const add = (atom: PatternAtom, literal?: string) => {
      c.step(owner, 3 + (atom.kind === 'sequence' || atom.kind === 'choice' ? atom.children.length : 0));
      atoms.push(atom);
      literals.push(atom.kind === 'character' ? literal === undefined ? {kind: 'outside'} : {kind: 'literal', value: literal}
        : atom.kind === 'repeat' ? {...atom} : {kind: atom.kind, children: [...atom.children]});
      return atoms.length - 1;
    };
    const invalid = (): never => c.fail(owner, "pattern-valid-restriction", "Malformed XSD regular expression", lexical.context.source);
    const unsupported = (): never => c.unsupported(owner, "pattern-subset", "XSD regex construct requires a separately evidenced equivalent implementation", lexical.context.source);
    let i = 0, escapedLiteral: string | undefined;
    const escaped = (): string => {
      escapedLiteral = undefined;
      i++; const char = source[i++]; if (char === undefined) return invalid();
      if (char === "n") {escapedLiteral = '\n'; return "\\n";}
      if (char === "r") {escapedLiteral = '\r'; return "\\r";}
      if (char === "t") {escapedLiteral = '\t'; return "\\t";}
      if ("\\|.-^?*+{}()[]".includes(char)) {escapedLiteral = char; return `\\${char}`;}
      if (char === "s") return "[ \\t\\n\\r]";
      if (char === "S") return "[^ \\t\\n\\r]";
      if (char === "d") return "\\p{Nd}";
      if (char === "D") return "\\P{Nd}";
      if (char === "p" || char === "P") {
        if (source[i++] !== "{") return invalid();
        const start = i; while (i < source.length && source[i] !== "}") {c.step(owner); i++;}
        if (source[i++] !== "}") return invalid();
        const category = source.slice(start, i - 1);
        if (category.startsWith("Is")) return unsupported();
        if (!/^(?:L[ultmo]?|M[nce]?|N[dlo]?|P[cdseifo]?|Z[slp]?|S[mcko]?|C[cfon]?)$/.test(category)) return invalid();
        return `\\${char}{${category}}`;
      }
      if ("iIcC".includes(char)) {
        if (!fixedSchemaNames) return unsupported();
        const range = char === 'i' || char === 'I' ? XML_NAME_RANGES.start : XML_NAME_RANGES.character;
        c.step(owner, range.length + 3);
        return `[${char === 'I' || char === 'C' ? '^' : ''}${range}]`;
      }
      if ("wW".includes(char)) return unsupported();
      return invalid();
    };
    const characterClass = (): string => {
      i++; let body = "", negative = false;
      if (source[i] === "^") {negative = true; i++;}
      let count = 0, canEndRange = false, rangeEnd = false;
      while (i < source.length && source[i] !== "]") {
        c.step(owner); const char = source[i];
        if (char === "[" || char === "-" && source[i + 1] === "[") return unsupported();
        if (char === "-") {
          if (count === 0 || source[i + 1] === "]") {body += "\\-"; i++; count++; canEndRange = false; continue;}
          if (!canEndRange || rangeEnd) return invalid();
          body += "-"; i++; canEndRange = false; rangeEnd = true; continue;
        }
        if (char === "\\") {
          const escape = escaped();
          // Nested character-class escapes need set algebra. Do not copy a
          // non-equivalent ECMAScript class into a verified plan.
          if (escape.startsWith("[")) return unsupported();
          if (rangeEnd && /\\[pP]\{/.test(escape)) return invalid();
          body += escape;
          canEndRange = !/\\[pP]\{/.test(escape) && !rangeEnd;
        } else {
          const point = source.codePointAt(i)!, literal = String.fromCodePoint(point);
          body += literal === "^" ? "\\^" : literal; i += point > 0xffff ? 2 : 1; canEndRange = !rangeEnd;
        }
        if (rangeEnd) {rangeEnd = false; canEndRange = false;}
        count++;
      }
      if (!count || source[i++] !== "]") return invalid();
      const result = `[${negative ? "^" : ""}${body}]`; c.text(result, owner);
      try {new RegExp(result, "u");} catch {return invalid();}
      return result;
    };
    type Frame = {branches: number[]; pieces: number[]};
    const frames: Frame[] = [{branches: [], pieces: []}];
    const closeBranch = (frame: Frame) => {c.step(owner, frame.pieces.length); frame.branches.push(add({kind: "sequence", children: frame.pieces})); frame.pieces = [];};
    const quantified = (atom: number) => {
      const char = source[i]; let min = "1", max: string | "unbounded" = "1";
      if (char === "?" || char === "*" || char === "+") {i++; min = char === "+" ? "1" : "0"; max = char === "?" ? "1" : "unbounded";}
      else if (char === "{") {
        i++; const start = i; while (/\d/.test(source[i] ?? "") && i < source.length) {c.step(owner); i++;}
        if (i === start) return invalid();
        min = source.slice(start, i).replace(/^0+(?=\d)/, ""); max = min;
        if (source[i] === ",") {
          i++; const next = i; while (/\d/.test(source[i] ?? "") && i < source.length) {c.step(owner); i++;}
          max = next === i ? "unbounded" : source.slice(next, i).replace(/^0+(?=\d)/, "");
        }
        if (source[i++] !== "}") return invalid();
        if (c.algebra.compare(min, max) > 0) return invalid();
      }
      return min === "1" && max === "1" ? atom : add({kind: "repeat", child: atom, min, max});
    };
    while (i < source.length) {
      c.step(owner); const frame = frames.at(-1)!, char = source[i];
      if (char === "(") {i++; c.step(owner); frames.push({branches: [], pieces: []}); continue;}
      if (char === "|") {i++; closeBranch(frame); continue;}
      if (char === ")") {
        if (frames.length === 1) return invalid();
        i++; closeBranch(frame); c.step(owner, frame.branches.length);
        const atom = add({kind: "choice", children: frame.branches}); frames.pop(); frames.at(-1)!.pieces.push(quantified(atom)); continue;
      }
      if ("?*+{}]".includes(char)) return invalid();
      let expression: string, literal: string | undefined;
      if (char === "[") expression = characterClass();
      else if (char === "\\") {expression = escaped(); literal = escapedLiteral;}
      else if (char === ".") {i++; expression = "[^\\r\\n]";}
      else {
        const point = source.codePointAt(i)!; i += point > 0xffff ? 2 : 1;
        literal = String.fromCodePoint(point); expression = literal.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      }
      c.text(expression, owner); frame.pieces.push(quantified(add({kind: "character", expression}, literal)));
    }
    if (frames.length !== 1) return invalid();
    closeBranch(frames[0]); c.step(owner, frames[0].branches.length);
    const root = add({kind: "choice", children: frames[0].branches});
    c.step(owner, 3);
    const pattern: SchemaPattern = {language: "xsd10-whole-string", atoms, root, unicode: "code-points", runtimeOwner: "#184"};
    literalPrograms.set(pattern, {atoms: literals, root});
    return pattern;
  };
  /** Exact finite literal fragment, used only to propose concretely checked operands. */
  const literalLanguage = (pattern: SchemaPattern, owner: Owner):
    {kind: 'finite-literal'; words: Generator<string>} | {kind: 'outside-fragment'} => {
    c.step(owner); const program = literalPrograms.get(pattern);
    if (!program) throw new TypeError('Literal language requires a pattern issued by this factory');
    c.step(owner, program.atoms.length * 2 + 2);
    const finite: boolean[] = [], emptyOnly: boolean[] = [];
    for (const atom of program.atoms) {
      c.step(owner, 3); let known = false, empty = false;
      if (atom.kind === 'literal') known = true;
      else if (atom.kind === 'sequence' || atom.kind === 'choice') {
        c.step(owner, atom.children.length * 2);
        known = atom.children.every(child => finite[child]);
        empty = atom.children.every(child => emptyOnly[child]);
      } else if (atom.kind === 'repeat') {
        c.text(atom.max, owner);
        empty = atom.max === '0' || emptyOnly[atom.child];
        known = empty || atom.max !== 'unbounded' && finite[atom.child];
      }
      finite.push(known); emptyOnly.push(empty);
    }
    if (!finite[program.root]) return {kind: 'outside-fragment'};
    type Task = {kind: 'node'; node: number} |
      {kind: 'repeat'; child: number; min: bigint; max: bigint; digits: number};
    type State = {pending: Task[]; word: string};
    function* words(): Generator<string> {
      c.step(owner, 4); const states: State[] = [{pending: [{kind: 'node', node: program!.root}], word: ''}];
      while (states.length) {
        c.step(owner); const state = states.pop()!;
        while (state.pending.length) {
          c.step(owner); const task = state.pending.pop()!;
          if (task.kind === 'repeat') {
            c.step(owner, task.digits * 4 + 6);
            if (task.max === 0n) continue;
            const next: Task = {...task, min: task.min > 0n ? task.min - 1n : 0n, max: task.max - 1n};
            if (task.min > 0n) state.pending.push(next, {kind: 'node', node: task.child});
            else {
              c.step(owner, state.pending.length + 4);
              states.push({word: state.word, pending: [...state.pending, next, {kind: 'node', node: task.child}]});
            }
            continue;
          }
          if (emptyOnly[task.node]) continue;
          const atom = program!.atoms[task.node];
          if (atom.kind === 'literal') {
            c.step(owner, state.word.length + atom.value.length + 1); state.word += atom.value;
          } else if (atom.kind === 'sequence') {
            c.step(owner, atom.children.length * 2);
            for (let index = atom.children.length - 1; index >= 0; index--) state.pending.push({kind: 'node', node: atom.children[index]});
          } else if (atom.kind === 'choice') {
            for (let index = atom.children.length - 1; index > 0; index--) {
              c.step(owner, state.pending.length + 4);
              states.push({word: state.word, pending: [...state.pending, {kind: 'node', node: atom.children[index]}]});
            }
            c.step(owner); state.pending.push({kind: 'node', node: atom.children[0]});
          } else if (atom.kind === 'repeat') {
            c.text(atom.min, owner); c.text(atom.max, owner);
            c.step(owner, atom.min.length * atom.min.length + atom.max.length * atom.max.length + 3);
            state.pending.push({kind: 'repeat', child: atom.child, min: BigInt(atom.min), max: BigInt(atom.max), digits: atom.max.length});
          } else throw new TypeError('Private finite literal program contains an outside-fragment atom');
        }
        c.text(state.word, owner); yield state.word;
      }
    }
    c.step(owner); return {kind: 'finite-literal', words: words()};
  };
  // Bounded relation evaluation only for schema-declared operand literals.
  // It never expands a finite repetition or runs an unbounded JS regex.
  const acceptsOperand = (pattern: SchemaPattern, value: string, owner: Owner): boolean => {
    c.text(value, owner); const chars: string[] = [];
    for (const char of value) {c.step(owner); chars.push(char);}
    type Relation = Set<number>[];
    const relations: Relation[] = [];
    const identity = (): Relation => {
      const result: Relation = [];
      for (let i = 0; i <= chars.length; i++) {c.step(owner); result.push(new Set([i]));} return result;
    };
    const compose = (a: Relation, b: Relation): Relation => {
      const result: Relation = [];
      for (let i = 0; i < a.length; i++) {
        c.step(owner); const row = new Set<number>();
        for (const middle of a[i]) for (const end of b[middle]) {c.step(owner); row.add(end);}
        result.push(row);
      }
      return result;
    };
    const union = (target: Relation, source: Relation) => {
      for (let i = 0; i < target.length; i++) for (const end of source[i]) {c.step(owner); target[i].add(end);}
    };
    for (const atom of pattern.atoms) {
      c.step(owner); let result: Relation;
      if (atom.kind === "character") {
        c.text(atom.expression, owner); const character = new RegExp(`^(?:${atom.expression})(?![\\s\\S])`, "u"); result = [];
        for (let i = 0; i <= chars.length; i++) {c.step(owner); result.push(new Set(i < chars.length && character.test(chars[i]) ? [i + 1] : []));}
      } else if (atom.kind === "sequence") {
        result = identity(); for (const child of atom.children) result = compose(result, relations[child]);
      } else if (atom.kind === "choice") {
        result = [];
        for (let i = 0; i <= chars.length; i++) {c.step(owner); result.push(new Set());}
        for (const child of atom.children) union(result, relations[child]);
      } else {
        const child = relations[atom.child], nullable = child[0].has(0); result = [];
        for (let i = 0; i <= chars.length; i++) {c.step(owner); result.push(new Set());}
        let repeated = identity();
        const cap = c.algebra.compare(atom.max, chars.length.toString()) < 0 ? Number(atom.max) : chars.length;
        for (let count = 0; count <= cap; count++) {
          c.step(owner);
          if (nullable || c.algebra.compare(count.toString(), atom.min) >= 0) union(result, repeated);
          if (count !== cap) repeated = compose(repeated, child);
        }
      }
      relations.push(result);
    }
    return relations[pattern.root][0].has(chars.length);
  };
  return {compile, acceptsOperand, literalLanguage};
}
