/** Decidable atomic value labels for finite symbolic list-image automata. */
import type {SchemaOperand} from './schemaDatatypeValues.js';
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {LexicalBranch} from './schemaLexicalPredicates.js';
import type {NumericImageCondition} from './schemaNumericImageConditions.js';
import {schemaNumericImageConditions} from './schemaNumericImageConditions.js';
import {schemaIeeeLanguages} from './schemaIeeeLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

export type ScalarValueSet = Readonly<{family: string; kind: 'regular'; language: RegularLanguage; numeric: NumericImageCondition}> |
  Readonly<{family: 'float' | 'double'; kind: 'ieee'; inputs: readonly LexicalBranch[]}> |
  Readonly<{family: string; kind: 'singleton'; value: SchemaOperand; encoded: string}>;
export function schemaSymbolicValueSets<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  numeric: ReturnType<typeof schemaNumericImageConditions<Owner>>, ieee: ReturnType<typeof schemaIeeeLanguages<Owner>>,
  expression: (text: string, owner: Owner) => RegularLanguage,
  parseIeee: (family: 'float' | 'double', spelling: string, owner: Owner) => SchemaOperand,
  encode: (value: SchemaOperand, owner: Owner) => string) {
  const quote = (text: string, owner: Owner) => {c.text(text, owner); c.step(owner, text.length * 2 + 1); return expression(text.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'), owner);};
  const inverse = (value: SchemaOperand, owner: Owner): NumericImageCondition => ({intervals: ieee.inverseIntervals(value, owner),
    literals: value.canonical === 'NaN' ? ['NaN'] : value.canonical === 'Infinity' ? ['INF'] : value.canonical === '-Infinity' ? ['-INF'] : [], nonNumeric: false});
  const includes = (set: ScalarValueSet, value: SchemaOperand, owner: Owner): boolean => {
    c.step(owner); if (set.family !== value.family) return false;
    if (set.kind === 'singleton') {c.text(set.value.canonical, owner); c.text(value.canonical, owner); return set.value.canonical === value.canonical;}
    if (set.kind === 'regular') return numeric.exists(regular.intersect([set.language, quote(encode(value, owner), owner)], owner), set.numeric, owner);
    const cell = inverse(value, owner);
    for (const input of set.inputs) if (numeric.exists(input.language, numeric.intersection(input.numeric, cell, owner), owner)) return true;
    return false;
  };
  const singleton = (set: Extract<ScalarValueSet, {kind: 'ieee'}>, owner: Owner): SchemaOperand | undefined => {
    let value: SchemaOperand | undefined;
    for (const branch of set.inputs) {
      const word = numeric.numericWitness(branch.language, branch.numeric, owner);
      if (word !== undefined) {value = parseIeee(set.family, word, owner); break;}
    }
    if (!value) return undefined;
    const cell = inverse(value, owner);
    for (const branch of set.inputs) if (numeric.exists(branch.language, numeric.difference(branch.numeric, cell, owner), owner)) return undefined;
    return value;
  };
  const satisfiable = (positive: readonly ScalarValueSet[], negative: readonly ScalarValueSet[], owner: Owner): boolean => {
    if (!positive.length) throw new TypeError('A typed token product needs a positive value-domain label');
    c.step(owner, positive.length + negative.length + 3); const family = positive[0].family;
    if (positive.some(set => set.family !== family)) return false;
    const excluded = negative.filter(set => set.family === family);
    if (positive.some(set => excluded.includes(set))) return false;
    if (family === 'float' || family === 'double') {
      for (const supplied of positive) if (supplied.kind === 'ieee') for (const inherited of excluded) if (inherited.kind === 'ieee') {
        let covered = true;
        for (const input of supplied.inputs) {
          c.step(owner, 3); let residual = [input];
          for (const prior of inherited.inputs) {
            c.step(owner, residual.length * 2 + 4); const next: LexicalBranch[] = [];
            for (const branch of residual) {
              next.push({language: regular.intersect([branch.language, regular.negate(prior.language, owner)], owner), numeric: branch.numeric});
              next.push({language: regular.intersect([branch.language, prior.language], owner), numeric: numeric.difference(branch.numeric, prior.numeric, owner)});
            }
            residual = next;
          }
          if (residual.some(branch => numeric.exists(branch.language, branch.numeric, owner))) {
            for (const branch of residual) {
              const word = numeric.numericWitness(branch.language, branch.numeric, owner);
              if (word !== undefined) {
                const value = parseIeee(supplied.family, word, owner);
                if (positive.every(set => includes(set, value, owner)) && excluded.every(set => !includes(set, value, owner))) return true;
              }
            }
            covered = false; break;
          }
        }
        if (covered) return false;
      }
    }
    const exact = positive.find(set => set.kind === 'singleton');
    const test = (value: SchemaOperand) => positive.every(set => includes(set, value, owner)) && excluded.every(set => !includes(set, value, owner));
    if (exact?.kind === 'singleton') return test(exact.value);
    if (family === 'float' || family === 'double') {
      for (const set of positive) if (set.kind === 'ieee') for (const branch of set.inputs) {
        const word = numeric.numericWitness(branch.language, branch.numeric, owner);
        if (word !== undefined && test(parseIeee(set.family, word, owner))) return true;
      }
      for (const set of positive) if (set.kind === 'ieee') {const point = singleton(set, owner); if (point) return test(point);}
      const domain = positive.find(set => set.kind === 'ieee');
      if (domain?.kind !== 'ieee') throw new TypeError('An infinite IEEE image requires an IEEE input authority');
      for (const branch of domain.inputs) {
        let remaining = branch.numeric;
        for (;;) {
          const word = numeric.numericWitness(branch.language, remaining, owner);
          if (word === undefined) break;
          const value = parseIeee(domain.family, word, owner);
          if (test(value)) return true;
          // A failed exact membership test excludes this whole rounding cell,
          // rather than only this spelling. Each step removes one actual IEEE
          // value; the finite format bounds termination. Only the complete
          // numeric witness authority can prove that no cells remain.
          remaining = numeric.difference(remaining, inverse(value, owner), owner);
        }
      }
      return false;
    }
    c.step(owner, 3); let candidates: {language: RegularLanguage; numeric: NumericImageCondition}[] = [{language: regular.intersect([], owner), numeric: numeric.all()}];
    for (const set of positive) {
      if (set.kind !== 'regular') throw new TypeError('A non-IEEE infinite image requires a regular canonical value authority');
      candidates = candidates.map(branch => ({language: regular.intersect([branch.language, set.language], owner), numeric: numeric.intersection(branch.numeric, set.numeric, owner)}));
    }
    for (const set of excluded) {
      c.step(owner, candidates.length * 2 + 3); const next: typeof candidates = [];
      for (const branch of candidates) {
        const language = set.kind === 'singleton' ? quote(set.encoded, owner) : set.kind === 'regular' ? set.language : undefined;
        if (!language) throw new TypeError('A non-IEEE image label has an incompatible authority');
        next.push({language: regular.intersect([branch.language, regular.negate(language, owner)], owner), numeric: branch.numeric});
        if (set.kind === 'regular') next.push({language: regular.intersect([branch.language, language], owner), numeric: numeric.difference(branch.numeric, set.numeric, owner)});
      }
      candidates = next;
    }
    return candidates.some(branch => numeric.exists(branch.language, branch.numeric, owner));
  };
  return {includes, singleton, satisfiable};
}
