/** Complete duration-bound preimages for the four strict Appendix E anchors. */
import {addDuration, parseCalendar} from './schemaExactCalendar.js';
import type {CalendarBudget, Decimal, Duration} from './schemaExactCalendar.js';
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import {schemaDecimalLanguages} from './schemaDecimalLanguage.js';
import {durationAliasExpressions} from './schemaTemporalAliases.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

const ANCHORS = ['1696-09-01T00:00:00Z', '1697-02-01T00:00:00Z', '1903-03-01T00:00:00Z', '1903-07-01T00:00:00Z'];
export function schemaDurationLanguages<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  expression: (text: string, owner: Owner) => RegularLanguage) {
  const decimals = schemaDecimalLanguages(c);
  const integer = '[0-9]+', seconds = '[0-9]+([.][0-9]+)?';
  const rest = '([0-9]+D)?(T([0-9]+H)?([0-9]+M)?(' + seconds + 'S)?)?';
  const time = '(T([0-9]+H)?([0-9]+M)?(' + seconds + 'S)?)?';
  const budget = (owner: Owner): CalendarBudget => ({charge: count => c.step(owner, count),
    arithmetic: digits => c.step(owner, (digits + 4) ** 2), text: value => {c.text(value, owner);}});
  const text = (value: Decimal, owner: Owner): string => {
    c.step(owner, (value.digits + value.scale + 4) ** 2); c.step(owner, value.digits + value.scale + 4);
    const negative = value.coefficient < 0n, digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, '0');
    return (negative ? '-' : '') + (value.scale ? digits.slice(0, -value.scale) + '.' + digits.slice(-value.scale) : digits);
  };
  const field = (value: bigint, unit: string, owner: Owner, digits: number): string => {
    c.step(owner, (digits + 4) ** 2 + digits * 2 + 16);
    return value ? '0*' + value.toString() + unit : '(0+' + unit + ')?';
  };
  const relation = (value: Decimal, greater: boolean, owner: Owner): RegularLanguage => {
    const source = decimals.relation(text(value, owner), greater, owner);
    return source === undefined ? regular.union([], owner) : expression(source, owner);
  };
  const integers = (source: RegularLanguage, prefix: string, suffix: string, maximum: bigint, owner: Owner, digits: number): Generator<bigint> => {
    function* values(): Generator<bigint> {
      if (maximum < 0n) return;
      c.step(owner, prefix.length + suffix.length + 8);
      const p = expression(prefix, owner), s = expression(suffix, owner);
      const projected = regular.intersect([regular.quotient(source, p, s, owner), expression(integer, owner)], owner);
      const zero = regular.witness(regular.intersect([projected, expression('0+', owner)], owner), owner) !== undefined
        || regular.witness(regular.intersect([source, regular.concatenate([p, expression(suffix.slice(1), owner)], owner)], owner), owner) !== undefined;
      if (zero) yield 0n;
      // Removing leading zeroes preserves the numeric image, and the finite
      // upper bound makes the remaining canonical-word graph acyclic.
      const canonical = regular.intersect([regular.quotient(projected, expression('0*', owner), expression('', owner), owner),
        expression('[1-9][0-9]*', owner), regular.negate(relation({coefficient: maximum, scale: 0, digits}, true, owner), owner)], owner);
      const finite = regular.finiteWords(canonical, owner);
      if (finite.kind !== 'finite') throw new TypeError('A bounded canonical nonnegative integer language must be finite');
      for (const word of finite.words) {c.step(owner, (word.length + 4) ** 2); yield BigInt(word);}
    }
    return values();
  };
  const valid = (owner: Owner) => regular.intersect([expression('\\-?P([0-9]+Y)?([0-9]+M)?' + rest, owner),
    regular.negate(expression('\\-?P|\\-?P([0-9]+Y)?([0-9]+M)?([0-9]+D)?T', owner), owner)], owner);
  const bound = (input: RegularLanguage, endpoint: Duration, name: 'minInclusive' | 'minExclusive' | 'maxInclusive' | 'maxExclusive', owner: Owner): RegularLanguage => {
    const source = regular.intersect([input, valid(owner)], owner), greater = name.startsWith('min'), b = budget(owner);
    b.arithmetic(endpoint.digits + endpoint.seconds.scale + 16);
    const scale = endpoint.seconds.scale, power = 10n ** BigInt(scale), unit = 28n * 86400n * power;
    const digits = endpoint.digits + scale + 64;
    const integerText = (value: bigint): string => {c.step(owner, (digits + 4) ** 2 + digits + 2); return value.toString();};
    c.step(owner, 16); const starts = ANCHORS.map(anchor => parseCalendar('dateTime', anchor, b));
    const targets = starts.map(start => addDuration(start, endpoint, b));
    let largest = 0n;
    for (let index = 0; index < starts.length; index++) {
      b.arithmetic(endpoint.digits + starts[index].digits + scale + 16);
      const delta = targets[index].coefficient - starts[index].seconds.coefficient * power;
      const magnitude = delta < 0n ? -delta : delta; if (magnitude > largest) largest = magnitude;
    }
    b.arithmetic(endpoint.digits + scale + 16); const cutoff = largest / unit + 2n;
    c.step(owner, 4); const choices: RegularLanguage[] = [];
    const possible = (value: string): boolean => regular.witness(regular.intersect([source, expression(value, owner)], owner), owner) !== undefined;
    const append = (value: string) => {c.step(owner, value.length + 2); choices.push(regular.intersect([source, expression(value, owner)], owner));};
    const secondsPredicate = (prefix: string, threshold: Decimal, more: boolean) => {
      b.arithmetic(threshold.digits + threshold.scale + 16);
      const p = 10n ** BigInt(threshold.scale), coefficient = threshold.coefficient;
      if (coefficient < 0n) {if (more) append(prefix + rest); return;}
      const floorDay = coefficient / (86400n * p);
      const large = (limit: bigint): string => {
        const language = decimals.relation(integerText(limit), true, owner)!;
        c.step(owner, language.length + 8); return '(' + language + ')';
      };
      if (more) append(prefix + large(floorDay) + 'D' + time);
      for (const day of integers(source, prefix, 'D' + time, floorDay, owner, digits)) {
        b.arithmetic(threshold.digits + threshold.scale + 16);
        const afterDay = coefficient - day * 86400n * p, dayPrefix = prefix + field(day, 'D', owner, digits);
        // No T denotes exactly the integral day contribution.
        if (more ? afterDay < 0n : afterDay > 0n) append(dayPrefix);
        const hLimit = afterDay / (3600n * p);
        if (more) append(dayPrefix + 'T' + large(hLimit) + 'H([0-9]+M)?(' + seconds + 'S)?');
        for (const hour of integers(source, dayPrefix + 'T', 'H([0-9]+M)?(' + seconds + 'S)?', hLimit, owner, digits)) {
          b.arithmetic(threshold.digits + threshold.scale + 16);
          const afterHour = afterDay - hour * 3600n * p, hourPrefix = dayPrefix + 'T' + field(hour, 'H', owner, digits), minuteLimit = afterHour / (60n * p);
          if (more) append(hourPrefix + large(minuteLimit) + 'M(' + seconds + 'S)?');
          for (const minute of integers(source, hourPrefix, 'M(' + seconds + 'S)?', minuteLimit, owner, digits)) {
            b.arithmetic(threshold.digits + threshold.scale + 16);
            const remainder = afterHour - minute * 60n * p, minutePrefix = hourPrefix + field(minute, 'M', owner, digits);
            const predicate = relation({...threshold, coefficient: remainder}, more, owner);
            choices.push(regular.intersect([source, regular.concatenate([expression(minutePrefix, owner),
              regular.intersect([expression(seconds, owner), predicate], owner), expression('S', owner)], owner)], owner));
            if (!more && remainder > 0n) append(minutePrefix);
          }
          // An omitted minute is zero and is already represented above.
        }
        // Omitted hours/minutes are represented by the zero projections.
      }
    };
    for (const negative of [false, true]) {
      const prefix = (negative ? '\\-' : '') + 'P';
      const automatic = negative ? !greater : greater;
      const yearLimit = (cutoff - 1n) / 12n;
      if (automatic) {
        const y = decimals.relation(integerText(yearLimit), true, owner)!;
        append(prefix + '(' + y + ')Y([0-9]+M)?' + rest);
      }
      for (const year of integers(source, prefix, 'Y([0-9]+M)?' + rest, yearLimit, owner, digits)) {
        const yPrefix = prefix + field(year, 'Y', owner, digits), monthLimit = cutoff - 1n - year * 12n;
        if (automatic) {
          const m = decimals.relation(integerText(monthLimit), true, owner)!;
          append(yPrefix + '(' + m + ')M' + rest);
        }
        for (const month of integers(source, yPrefix, 'M' + rest, monthLimit, owner, digits)) {
          const mPrefix = yPrefix + field(month, 'M', owner, digits); if (!possible(mPrefix + rest)) continue;
          b.arithmetic(endpoint.digits + scale + 32); const magnitude = year * 12n + month;
          c.step(owner, 8); const duration: Duration = {months: negative ? -magnitude : magnitude,
            seconds: {coefficient: 0n, scale: 0, digits: 1}, digits: endpoint.digits + 32, lexical: ''};
          const deltas = starts.map((start, index) => {
            const at = addDuration(start, duration, b); b.arithmetic(endpoint.digits + at.digits + scale + 16);
            return negative ? at.coefficient * power - targets[index].coefficient : targets[index].coefficient - at.coefficient * power;
          });
          const more = negative ? !greater : greater;
          let threshold = deltas[0];
          for (const delta of deltas) {c.step(owner); if (more ? delta > threshold : delta < threshold) threshold = delta;}
          secondsPredicate(mPrefix, {coefficient: threshold, scale, digits: endpoint.digits + scale + 32}, more);
        }
      }
    }
    // Appendix E returns equality only for the same (months, seconds) pair.
    // Equality at all four anchors with a different pair is indeterminate.
    if (name.endsWith('Inclusive')) for (const alias of durationAliasExpressions(endpoint, owner, c, possible)) append(alias);
    c.step(owner, choices.length + 2); return regular.union(choices, owner);
  };
  return {bound, valid};
}
