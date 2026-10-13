/** Finite field-boundary images of exact DT A calendar values. */
import {parseCalendar, parseReduced, showInstant} from './schemaExactCalendar.js';
import type {CalendarBudget, CalendarFamily} from './schemaExactCalendar.js';
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import {schemaCalendarLanguages} from './schemaCalendarLanguage.js';
import {schemaIntegerImages} from './schemaIntegerImages.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

export function schemaCalendarImages<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  expression: (text: string, owner: Owner) => RegularLanguage) {
  const calendars = schemaCalendarLanguages(c, regular, expression), integers = schemaIntegerImages(c, regular, expression);
  const quote = (text: string, owner: Owner) => {c.text(text, owner); c.step(owner, text.length * 2 + 1); return expression(text.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&'), owner);};
  const padded = (language: RegularLanguage, owner: Owner) => {
    c.step(owner, 3); const choices = [regular.intersect([language, expression('[1-9][0-9]{3,}', owner)], owner)];
    for (let size = 1; size < 4; size++) {c.step(owner, 16); choices.push(regular.concatenate([expression('0'.repeat(4 - size), owner),
      regular.intersect([language, expression('[0-9]{' + size + '}', owner)], owner)], owner));}
    return regular.union(choices, owner);
  };
  const image = (source: RegularLanguage, family: CalendarFamily, owner: Owner): RegularLanguage => {
    const b: CalendarBudget = {charge: count => c.step(owner, count), arithmetic: digits => c.step(owner, (digits + 4) ** 2), text: value => {c.text(value, owner);}};
    c.step(owner, 4); const images: RegularLanguage[] = [], epsilon = quote('', owner), yearPresent = ['date', 'dateTime', 'gYear', 'gYearMonth'].includes(family);
    const sourceProgram = regular.automaton(source, owner), suffixCache = new Map<string, readonly number[]>();
    c.step(owner, sourceProgram.states.length * 3 + 2);
    const finals = sourceProgram.states.flatMap((state, index) => state.accepting ? [index] : []);
    const prefixFor = (suffix: string): RegularLanguage | undefined => {
      c.text(suffix, owner); let current: readonly number[] = finals;
      for (let offset = suffix.length - 1; offset >= 0; offset--) {
        c.step(owner, current.length * 16 + 8); const key = suffix.charCodeAt(offset) + ':' + JSON.stringify(current), known = suffixCache.get(key);
        if (known) {current = known; continue;}
        c.step(owner, current.length * 2 + 3); const accepted = new Set(current), previous: number[] = [];
        for (let state = 0; state < sourceProgram.states.length; state++) for (const edge of sourceProgram.states[state].transitions) {
          c.step(owner); if (edge.lo <= suffix.charCodeAt(offset) && edge.hi >= suffix.charCodeAt(offset) && accepted.has(edge.to)) {c.step(owner); previous.push(state); break;}
        }
        c.step(owner, key.length + previous.length + 2); suffixCache.set(key, previous); current = previous; if (!current.length) return undefined;
      }
      if (!current.length) return undefined;
      return regular.paths(sourceProgram, [sourceProgram.start], new Set(current), owner);
    };
    for (let offset = -841; offset <= 840; offset++) {
      c.step(owner, 16); const zoned = offset !== -841, minutes = zoned ? offset : 0;
      const zones = !zoned ? [''] : !minutes ? ['Z', '+00:00', '-00:00']
        : [(minutes < 0 ? '-' : '+') + Math.floor(Math.abs(minutes) / 60).toString().padStart(2, '0') + ':' + (Math.abs(minutes) % 60).toString().padStart(2, '0')];
      for (const zone of zones) {
        const prefix = prefixFor(zone); if (!prefix) continue;
        for (const negative of yearPresent ? [false, true] : [false]) {
          const unsigned = negative ? regular.quotient(prefix, quote('-', owner), epsilon, owner) : prefix, program = regular.automaton(unsigned, owner);
          c.step(owner, program.states.length * 3 + 4); const incoming: number[][] = program.states.map(() => []), productive = new Set<number>(), pending: number[] = [];
          for (let from = 0; from < program.states.length; from++) {
            if (program.states[from].accepting) {c.step(owner, 2); productive.add(from); pending.push(from);}
            for (const edge of program.states[from].transitions) {c.step(owner); incoming[edge.to].push(from);}
          }
          while (pending.length) {c.step(owner); const state = pending.pop()!; for (const from of incoming[state]) {
            c.step(owner); if (!productive.has(from)) {c.step(owner, 2); productive.add(from); pending.push(from);}
          }}
          type Frame = {at: number; year: RegularLanguage; fields: readonly number[]};
          c.step(owner, 3); let frames: Frame[] = [];
          if (!yearPresent) frames.push({at: program.start, year: quote('2000', owner), fields: []});
          else for (let end = 0; end < program.states.length; end++) {
            const year = regular.intersect([regular.paths(program, [program.start], new Set([end]), owner), calendars.year(false, owner)], owner);
            if (regular.witness(year, owner) !== undefined) frames.push({at: end, year, fields: []});
          }
          const walk = (from: number, text: string): number | undefined => {
            c.text(text, owner); let state = from;
            for (const character of text) {
              c.step(owner, program.states[state].transitions.length + 1); const cp = character.charCodeAt(0), edge = program.states[state].transitions.find(edge => edge.lo <= cp && edge.hi >= cp);
              if (!edge || !productive.has(edge.to)) return undefined; state = edge.to;
            }
            return state;
          };
          const clock = family === 'dateTime' || family === 'time';
          const descriptors = [
            {present: !['gYear', 'gDay', 'time'].includes(family), separator: family === 'gMonthDay' || family === 'gMonth' ? '--' : '-', min: 1, max: 12, fixed: 1},
            {present: ['date', 'dateTime', 'gMonthDay', 'gDay'].includes(family), separator: family === 'gDay' ? '---' : '-', min: 1, max: 31, fixed: 1},
            {present: clock, separator: family === 'dateTime' ? 'T' : '', min: 0, max: 24, fixed: 0},
            {present: clock, separator: ':', min: 0, max: 59, fixed: 0},
            {present: clock, separator: ':', min: 0, max: 60, fixed: 0},
          ];
          for (const descriptor of descriptors) {
            c.step(owner, 3); const next: Frame[] = [];
            for (const frame of frames) {
              if (!descriptor.present) {c.step(owner, frame.fields.length + 4); next.push({...frame, fields: [...frame.fields, descriptor.fixed]}); continue;}
              for (let value = descriptor.min; value <= descriptor.max; value++) {
                c.step(owner, 12); const at = walk(frame.at, descriptor.separator + value.toString().padStart(2, '0'));
                if (at !== undefined) {c.step(owner, frame.fields.length + 4); next.push({...frame, at, fields: [...frame.fields, value]});}
              }
            }
            frames = next;
          }
          c.step(owner, program.states.length * 4 + 3); const accepted = new Set(program.states.flatMap((state, index) => state.accepting ? [index] : []));
          for (const frame of frames) {
            c.step(owner, 3); const fractions: (RegularLanguage | undefined)[] = [];
            if (accepted.has(frame.at)) fractions.push(undefined);
            const dot = clock ? walk(frame.at, '.') : undefined;
            if (dot !== undefined) {
              const tail = regular.intersect([regular.paths(program, [dot], accepted, owner), expression('[0-9]+', owner)], owner);
              if (regular.witness(regular.intersect([tail, expression('0+', owner)], owner), owner) !== undefined) fractions.push(undefined);
              const trimmed = regular.intersect([regular.quotient(tail, epsilon, expression('0*', owner), owner), expression('[0-9]*[1-9]', owner)], owner);
              if (regular.witness(trimmed, owner) !== undefined) fractions.push(trimmed);
            }
            if (!fractions.length) continue;
            for (const leap of yearPresent ? [false, true] : [true]) {
              const rawYear = !yearPresent ? frame.year : regular.intersect([frame.year, leap ? calendars.year(true, owner) : regular.negate(calendars.year(true, owner), owner)], owner);
              if (regular.witness(rawYear, owner) === undefined) continue;
              const representative = !yearPresent ? '2000' : negative ? leap ? '-0004' : '-0001' : leap ? '2000' : '2001';
              c.step(owner, 96); const [month, day, hour, minute, second] = frame.fields, two = (n: number) => n.toString().padStart(2, '0');
              const date = representative + '-' + two(month) + '-' + two(day), time = two(hour) + ':' + two(minute) + ':' + two(second);
              const lexical = family === 'dateTime' ? date + 'T' + time + zone : family === 'date' ? date + zone : family === 'time' ? time + zone
                : family === 'gYear' ? representative + zone : family === 'gYearMonth' ? representative + '-' + two(month) + zone
                  : family === 'gMonthDay' ? '--' + two(month) + '-' + two(day) + zone : family === 'gDay' ? '---' + two(day) + zone : '--' + two(month) + zone;
              const value = family === 'date' || family === 'dateTime' ? parseCalendar(family, lexical, b) : parseReduced(family, lexical, b), coordinate = showInstant(value.seconds, b);
              c.step(owner, coordinate.length * 3 + 8); const split = /^(-?[0-9]+)(-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2})Z$/.exec(coordinate)!;
              let years: RegularLanguage;
              if (!yearPresent) years = quote(split[1], owner);
              else {
                const continuous = (year: bigint) => year > 0n ? year - 1n : year;
                c.step(owner, 64); const change = Number(continuous(BigInt(split[1])) - continuous(BigInt(representative))), magnitudeChange = negative ? -change : change;
                const absolute = regular.intersect([regular.quotient(rawYear, expression('0*', owner), epsilon, owner), expression('[1-9][0-9]*', owner)], owner);
                const one = quote('1', owner), parts: RegularLanguage[] = [];
                if (magnitudeChange === -1 && regular.witness(regular.intersect([absolute, one], owner), owner) !== undefined)
                  parts.push(quote(negative ? '0001' : '-0001', owner));
                const remaining = magnitudeChange === -1 ? regular.intersect([absolute, regular.negate(one, owner)], owner) : absolute;
                const shifted = integers.sum([{language: remaining, weight: 1}], owner, magnitudeChange);
                parts.push(regular.concatenate([quote(negative ? '-' : '', owner), padded(shifted, owner)], owner)); years = regular.union(parts, owner);
              }
              for (const fraction of fractions) {
                c.step(owner, 2); images.push(regular.concatenate([years, quote(split[2], owner),
                  fraction ? regular.concatenate([quote('.', owner), fraction], owner) : epsilon, quote(zoned ? 'Z' : '', owner)], owner));
              }
            }
          }
        }
      }
    }
    return regular.union(images, owner);
  };
  return {image};
}
