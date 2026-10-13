/** Exact regular preimages of DT A calendar validity and bound predicates. */
import {showInstant, ordinal} from './schemaExactCalendar.js';
import type {Calendar, CalendarBudget, CalendarFamily, Decimal} from './schemaExactCalendar.js';
import type {RegularAutomaton, RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import {schemaDecimalLanguages} from './schemaDecimalLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

type Field = {language: RegularLanguage; fixed?: number; shift?: number; separator: string};
export function schemaCalendarLanguages<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  expression: (text: string, owner: Owner) => RegularLanguage) {
  const decimals = schemaDecimalLanguages(c), yearLanguages = new Map<boolean, RegularLanguage>();
  const empty = (owner: Owner) => regular.union([], owner);
  const literal = (text: string, owner: Owner) => {
    c.text(text, owner); c.step(owner, text.length * 2 + 1);
    return expression(text.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&'), owner);
  };
  const calendarBudget = (owner: Owner): CalendarBudget => ({charge: work => c.step(owner, work),
    arithmetic: digits => c.step(owner, (digits + 4) ** 2), text: text => {c.text(text, owner);}});
  const year = (leap: boolean, owner: Owner): RegularLanguage => {
    const cached = yearLanguages.get(leap); if (cached) return cached;
    const grammar = regular.intersect([expression('\\-?([0-9]{4}|[1-9][0-9]{4,})', owner), regular.negate(expression('\\-?0000', owner), owner)], owner);
    if (!leap) {c.step(owner); yearLanguages.set(false, grammar); return grammar;}
    // 10^4 is divisible by 400. Noncentury leap years have a nonzero
    // two-digit suffix divisible by four; centuries require their preceding
    // two digits (the last four digits overall) to be divisible by four.
    const suffix = '\\-?[0-9]*(([02468][48]|[13579][26]|[2468]0)|([02468][048]|[13579][26])00)';
    c.step(owner, suffix.length + 2);
    const language = regular.intersect([grammar, expression(suffix, owner)], owner);
    c.step(owner); yearLanguages.set(true, language); return language;
  };
  const validDate = (family: CalendarFamily, owner: Owner): RegularLanguage => {
    const epsilon = literal('', owner);
    if (family === 'time') return epsilon;
    if (family === 'gYear') return year(false, owner);
    if (family === 'gYearMonth') return regular.concatenate([year(false, owner), expression('\\-(0[1-9]|1[0-2])', owner)], owner);
    if (family === 'gMonth') return expression('\\-\\-(0[1-9]|1[0-2])', owner);
    if (family === 'gDay') return expression('\\-\\-\\-(0[1-9]|[12][0-9]|3[01])', owner);
    const monthDay = '((01|03|05|07|08|10|12)\\-(0[1-9]|[12][0-9]|3[01])|(04|06|09|11)\\-(0[1-9]|[12][0-9]|30)|02\\-(0[1-9]|1[0-9]|2[0-8]))';
    if (family === 'gMonthDay') return expression('\\-\\-(' + monthDay + '|02\\-29)', owner);
    return regular.union([regular.concatenate([year(false, owner), literal('-', owner), expression(monthDay, owner)], owner),
      regular.concatenate([year(true, owner), literal('-02-29', owner)], owner)], owner);
  };
  const fields = (family: CalendarFamily, style: 'normal' | '60' | '24', owner: Owner): Field[] => {
    c.step(owner, 48); const epsilon = literal('', owner), digits = expression('[0-9]{2}', owner);
    const y: Field = ['time', 'gMonthDay', 'gDay', 'gMonth'].includes(family)
      ? {language: epsilon, fixed: 2000, separator: ''} : {language: year(false, owner), separator: ''};
    const m: Field = family === 'gYear' || family === 'gDay' || family === 'time'
      ? {language: epsilon, fixed: 1, separator: ''} : {language: digits, separator: family === 'gMonthDay' || family === 'gMonth' ? '--' : '-'};
    const d: Field = family === 'gYear' || family === 'gYearMonth' || family === 'gMonth' || family === 'time'
      ? {language: epsilon, fixed: 1, separator: ''} : {language: digits, separator: family === 'gDay' ? '---' : '-'};
    const clock = family === 'dateTime' || family === 'time';
    const h: Field = !clock ? {language: epsilon, fixed: 0, separator: ''}
      : style === '24' ? {language: literal('24', owner), fixed: 0, separator: family === 'dateTime' ? 'T' : ''}
        : {language: expression('([01][0-9]|2[0-3])', owner), separator: family === 'dateTime' ? 'T' : ''};
    const minute: Field = !clock ? {language: epsilon, fixed: 0, separator: ''}
      : style === '24' ? {language: literal('00', owner), fixed: 0, separator: ':'} : {language: expression('[0-5][0-9]', owner), separator: ':'};
    const second: Field = !clock ? {language: epsilon, fixed: 0, separator: ''}
      : style === '24' ? {language: expression('00([.]0+)?', owner), fixed: 0, separator: ':'}
        : {language: expression(style === '60' ? '60([.][0-9]+)?' : '[0-5][0-9]([.][0-9]+)?', owner), shift: style === '60' ? 60 : undefined, separator: ':'};
    return [y, m, d, h, minute, second];
  };
  const joinFields = (parts: readonly RegularLanguage[], descriptor: readonly Field[], owner: Owner): RegularLanguage => {
    c.step(owner, parts.length * 2 + 2); const result: RegularLanguage[] = [];
    for (let index = 0; index < parts.length; index++) {c.step(owner, 2); result.push(literal(descriptor[index].separator, owner), parts[index]);}
    return regular.concatenate(result, owner);
  };
  const compareFields = (descriptor: readonly Field[], threshold: Decimal, greater: boolean, inclusive: boolean, owner: Owner): RegularLanguage => {
    const budget = calendarBudget(owner), text = showInstant(threshold, budget);
    c.step(owner, text.length * 3 + 8);
    const match = /^(-?[0-9]+)-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2}(?:\.[0-9]+)?)Z$/.exec(text)!;
    const targets = match.slice(1), equals: RegularLanguage[] = [], alternatives: RegularLanguage[] = [];
    for (let index = 0; index < descriptor.length; index++) {
      c.step(owner, targets[index].length * 2 + 4);
      const field = descriptor[index], target = targets[index].replace(/^(-?)0+(?=[0-9])/, '$1');
      let unequal: RegularLanguage, equal: RegularLanguage;
      if (field.fixed !== undefined) {
        c.step(owner, target.length ** 2 + 4);
        const order = field.fixed === 0 ? /[1-9]/.test(target) ? -1 : 0
          : BigInt(field.fixed) < BigInt(target) ? -1 : BigInt(field.fixed) > BigInt(target) ? 1 : 0;
        unequal = (greater ? order > 0 : order < 0) ? field.language : empty(owner);
        equal = order === 0 ? field.language : empty(owner);
      } else {
        c.text(target, owner); let compared = target;
        if (field.shift) {c.step(owner, target.length + 16); const [whole, fraction] = target.split('.'); compared = String(Number(whole) + field.shift) + (fraction ? '.' + fraction : '');}
        const relation = decimals.relation(compared, greater, owner);
        unequal = relation === undefined ? empty(owner) : regular.intersect([field.language, expression(relation, owner)], owner);
        const negative = compared.startsWith('-'), unsigned = negative ? compared.slice(1) : compared;
        const [whole, fraction] = unsigned.split('.'); c.step(owner, compared.length * 3 + 32);
        const inverse = compared.replace(/^[-+]?0+(?=[0-9])/, '') === '0' ? '[+\\-]?(0+([.]0*)?|[.]0+)'
          : (negative ? '\\-' : '[+]?') + (fraction ? '0*' + whole + '[.]' + fraction + '0*' : '0*' + whole + '([.]0*)?');
        equal = regular.intersect([field.language, expression(inverse, owner)], owner);
      }
      c.step(owner, descriptor.length * 2 + equals.length + 4);
      alternatives.push(joinFields([...equals, unequal, ...descriptor.slice(index + 1).map(field => field.language)], descriptor, owner));
      equals.push(equal);
    }
    if (inclusive) alternatives.push(joinFields(equals, descriptor, owner));
    return regular.union(alternatives, owner);
  };
  const suffixChecker = (source: RegularLanguage, owner: Owner) => {
    const program: RegularAutomaton = regular.automaton(source, owner), cache = new Map<string, readonly number[]>();
    c.step(owner, program.states.length + 4); const final = program.states.flatMap((state, index) => state.accepting ? [index] : []);
    return (text: string): RegularLanguage | undefined => {
      c.text(text, owner); let current = final;
      for (let offset = text.length - 1; offset >= 0; offset--) {
        c.step(owner, current.length * 16 + 8); const identity = text.charCodeAt(offset) + ':' + JSON.stringify(current), known = cache.get(identity);
        if (known) {current = known as number[]; continue;}
        c.step(owner, current.length * 2 + 3); const accepted = new Set(current), previous: number[] = [], cp = text.charCodeAt(offset);
        for (let state = 0; state < program.states.length; state++) for (const edge of program.states[state].transitions) {
          c.step(owner, 2); if (cp >= edge.lo && cp <= edge.hi && accepted.has(edge.to)) {c.step(owner); previous.push(state); break;}
        }
        c.step(owner, identity.length + previous.length + 2); cache.set(identity, previous); current = previous;
        if (!current.length) return undefined;
      }
      if (!current.length) return undefined;
      c.step(owner, current.length * 2 + program.states.length * 3 + 4);
      const accepted = new Set(current);
      return regular.fromAutomaton({start: program.start, states: program.states.map((state, index) =>
        ({transitions: state.transitions, accepting: accepted.has(index)}))}, owner);
    };
  };
  const bound = (source: RegularLanguage, endpoint: Calendar, name: 'minInclusive' | 'minExclusive' | 'maxInclusive' | 'maxExclusive', owner: Owner): RegularLanguage => {
    const family = endpoint.family, budget = calendarBudget(owner), possibleSuffix = suffixChecker(source, owner);
    c.step(owner, 4); const choices: RegularLanguage[] = [], greater = name.startsWith('min'), inclusive = name.endsWith('Inclusive');
    budget.arithmetic(endpoint.seconds.digits + endpoint.seconds.scale + 8);
    const power = 10n ** BigInt(endpoint.seconds.scale);
    const shifted = (seconds: number): Decimal => {
      budget.arithmetic(endpoint.seconds.digits + endpoint.seconds.scale + 8); c.step(owner, 4);
      return {...endpoint.seconds, coefficient: endpoint.seconds.coefficient + BigInt(seconds) * power};
    };
    c.step(owner, 4); const date = validDate(family, owner);
    for (let index = -841; index <= 840; index++) {
      c.step(owner, 16); const zoned = index !== -841, offset = zoned ? index : 0;
      const suffixes = !zoned ? [''] : !offset ? ['Z', '+00:00', '-00:00']
        : [(offset < 0 ? '-' : '+') + Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0') + ':' + (Math.abs(offset) % 60).toString().padStart(2, '0')];
      for (const zone of suffixes) {
        const prefix = possibleSuffix(zone); if (!prefix) continue;
        if (!zone && regular.witness(regular.intersect([source, expression('.*[0-9]', owner)], owner), owner) === undefined) continue;
        const crossTimeline = zoned !== endpoint.zoned;
        const uncertainty = crossTimeline ? (greater ? 50400 : -50400) : 0;
        for (const style of family === 'dateTime' || family === 'time' ? ['normal', '60', '24'] as const : ['normal'] as const) {
          const descriptor = fields(family, style, owner), rendered = joinFields(descriptor.map(field => field.language), descriptor, owner);
          const validity = regular.concatenate([regular.intersect([prefix, rendered,
            family === 'dateTime' ? regular.concatenate([date, expression('T.*', owner)], owner)
              : family === 'time' ? rendered : date], owner), literal(zone, owner)], owner);
          if (regular.witness(regular.intersect([source, validity], owner), owner) === undefined) continue;
          const adjustment = style === '60' ? 60 : style === '24' ? 86400 : 0;
          if (family !== 'time') {
            const predicate = compareFields(descriptor, shifted(offset * 60 + uncertainty - adjustment), greater, inclusive && !crossTimeline, owner);
            choices.push(regular.intersect([validity, regular.concatenate([predicate, literal(zone, owner)], owner)], owner));
          } else {
            // Raw clocks occupy one reference day. Four carries cover every
            // allowed offset and the two overflow styles under DT A modulo.
            const baseDay = ordinal(2000n, 1, 1, budget, 4) * 86400n;
            for (let carry = -1; carry <= 2; carry++) {
              const main = shifted(offset * 60 + uncertainty - adjustment + carry * 86400);
              budget.arithmetic(endpoint.seconds.digits + endpoint.seconds.scale + 16); c.step(owner, 8);
              const begin: Decimal = {coefficient: (baseDay + BigInt(offset * 60 - adjustment + carry * 86400)) * power, scale: endpoint.seconds.scale, digits: endpoint.seconds.digits + 16};
              const end: Decimal = {...begin, coefficient: begin.coefficient + 86400n * power};
              const predicate = regular.intersect([compareFields(descriptor, main, greater, inclusive && !crossTimeline, owner),
                compareFields(descriptor, begin, true, true, owner), compareFields(descriptor, end, false, false, owner)], owner);
              choices.push(regular.intersect([validity, regular.concatenate([predicate, literal(zone, owner)], owner)], owner));
            }
          }
        }
      }
    }
    return regular.union(choices, owner);
  };
  const valid = (family: CalendarFamily, owner: Owner): RegularLanguage => {
    const zone = expression('(Z|[+\\-]((0[0-9]|1[0-3]):[0-5][0-9]|14:00))?', owner);
    const clock = expression('(([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)([.][0-9]+)?|24:00:00([.]0+)?)', owner);
    const value = family === 'time' ? clock : family === 'dateTime'
      ? regular.concatenate([validDate(family, owner), literal('T', owner), clock], owner) : validDate(family, owner);
    return regular.concatenate([value, zone], owner);
  };
  return {bound, validDate, valid, year};
}
