/** Boolean numeric guards carried through value-invariant lexical images. */
import type {IeeeInputInterval} from './schemaIeeeLanguage.js';
import {schemaIeeeLanguages} from './schemaIeeeLanguage.js';
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

export type NumericImageCondition = Readonly<{intervals: readonly IeeeInputInterval[]; literals: readonly string[]; nonNumeric: boolean}>;
export function schemaNumericImageConditions<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  ieee: ReturnType<typeof schemaIeeeLanguages<Owner>>, expression: (text: string, owner: Owner) => RegularLanguage) {
  const all = (): NumericImageCondition => ({intervals: [{negative: false}, {negative: true}], literals: ['INF', '-INF', 'NaN'], nonNumeric: true});
  const difference = (a: NumericImageCondition, b: NumericImageCondition, owner: Owner): NumericImageCondition => {
    c.step(owner, a.literals.length + b.literals.length + 4);
    return {intervals: ieee.subtractIntervals(a.intervals, b.intervals, owner), literals: a.literals.filter(value => !b.literals.includes(value)), nonNumeric: a.nonNumeric && !b.nonNumeric};
  };
  const intersection = (a: NumericImageCondition, b: NumericImageCondition, owner: Owner) => difference(a, difference(all(), b, owner), owner);
  const grammar = (owner: Owner) => expression('INF|\\-INF|NaN|[+\\-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+\\-]?[0-9]+)?', owner);
  const exists = (language: RegularLanguage, condition: NumericImageCondition, owner: Owner): boolean => {
    c.step(owner, condition.intervals.length + condition.literals.length + 4);
    if (condition.nonNumeric && ['INF', '-INF', 'NaN'].every(value => condition.literals.includes(value))
      && [false, true].every(negative => condition.intervals.some(interval => interval.negative === negative && !interval.lower && !interval.upper)))
      return regular.witness(language, owner) !== undefined;
    if (condition.nonNumeric && regular.witness(regular.intersect([language,
      regular.negate(regular.whitespacePreimage(grammar(owner), 'collapse', owner), owner)], owner), owner) !== undefined) return true;
    for (const literal of condition.literals) {
      const inverse = regular.whitespacePreimage(expression(literal === '-INF' ? '\\-INF' : literal, owner), 'collapse', owner);
      if (regular.witness(regular.intersect([language, inverse], owner), owner) !== undefined) return true;
    }
    const normalized = regular.whitespaceImage(language, 'collapse', owner);
    for (const interval of condition.intervals) if (ieee.intervalWitness(normalized, interval, owner) !== undefined) return true;
    return false;
  };
  const numericWitness = (language: RegularLanguage, condition: NumericImageCondition, owner: Owner): string | undefined => {
    const normalized = regular.whitespaceImage(language, 'collapse', owner);
    for (const literal of condition.literals) {
      const word = regular.witness(regular.intersect([normalized, expression(literal === '-INF' ? '\\-INF' : literal, owner)], owner), owner);
      if (word !== undefined) return word;
    }
    for (const interval of condition.intervals) {const word = ieee.intervalWitness(normalized, interval, owner); if (word !== undefined) return word;}
    return undefined;
  };
  const witness = (language: RegularLanguage, condition: NumericImageCondition, owner: Owner): string | undefined => {
    c.step(owner, condition.intervals.length + condition.literals.length + 4);
    if (condition.nonNumeric && ['INF', '-INF', 'NaN'].every(value => condition.literals.includes(value))
      && [false, true].every(negative => condition.intervals.some(interval => interval.negative === negative && !interval.lower && !interval.upper)))
      return regular.witness(language, owner);
    if (condition.nonNumeric) {
      const word = regular.witness(regular.intersect([language, regular.negate(regular.whitespacePreimage(grammar(owner), 'collapse', owner), owner)], owner), owner);
      if (word !== undefined) return word;
    }
    const normalized = numericWitness(language, condition, owner); if (normalized === undefined) return undefined;
    c.text(normalized, owner); c.step(owner, normalized.length * 3 + 4);
    const quoted = normalized.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&');
    const raw = regular.witness(regular.intersect([language, regular.whitespacePreimage(expression(quoted, owner), 'collapse', owner)], owner), owner);
    if (raw === undefined) throw new TypeError('A normalized numeric witness must have a raw preimage');
    return raw;
  };
  return {all, difference, intersection, exists, numericWitness, witness};
}
