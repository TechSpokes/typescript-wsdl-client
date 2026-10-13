/** Regular images of schema-normalized scalar spellings, with typed families. */
import type {RegularLanguage} from './schemaRegularLanguage.js';
import {schemaRegularLanguages} from './schemaRegularLanguage.js';
import type {SchemaPatternContext} from './schemaValueContext.js';
import {schemaIntegerImages} from './schemaIntegerImages.js';

export function schemaValueImages<Owner>(c: SchemaPatternContext<Owner>, regular: ReturnType<typeof schemaRegularLanguages<Owner>>,
  expression: (text: string, owner: Owner) => RegularLanguage) {
  const integers = schemaIntegerImages(c, regular, expression);
  const decimal = (source: RegularLanguage, owner: Owner): RegularLanguage => {
    c.step(owner, 4); const choices: RegularLanguage[] = [], epsilon = expression('', owner), digits = expression('[0-9]*', owner);
    const positiveInteger = expression('[1-9][0-9]*', owner), fractional = expression('[0-9]*[1-9]', owner);
    const zero = expression('0', owner), zeroes = expression('0*', owner);
    if (regular.witness(regular.intersect([source, expression('[+\\-]?(0+([.]0*)?|[.]0+)', owner)], owner), owner) !== undefined) choices.push(zero);
    for (const negative of [false, true]) {
      const unsigned = regular.quotient(source, expression(negative ? '\\-' : '[+]?', owner), epsilon, owner);
      const integral = regular.intersect([regular.quotient(unsigned, zeroes, expression('([.]0*)?', owner), owner), positiveInteger], owner);
      choices.push(regular.concatenate([expression(negative ? '\\-' : '', owner), integral], owner));
      const program = regular.automaton(unsigned, owner);
      c.step(owner, program.states.length * 4 + 4);
      const accepting = new Set(program.states.flatMap((state, index) => state.accepting ? [index] : []));
      for (let before = 0; before < program.states.length; before++) for (const edge of program.states[before].transitions) {
        c.step(owner); if (edge.lo > 46 || edge.hi < 46) continue;
        const whole = regular.intersect([regular.paths(program, [program.start], new Set([before]), owner), digits], owner);
        const canonicalWhole = regular.intersect([regular.quotient(whole, zeroes, epsilon, owner), positiveInteger], owner);
        const integralChoices = [canonicalWhole];
        if (regular.witness(regular.intersect([whole, zeroes], owner), owner) !== undefined) integralChoices.push(zero);
        const tail = regular.intersect([regular.paths(program, [edge.to], accepting, owner), digits], owner);
        const canonicalTail = regular.intersect([regular.quotient(tail, epsilon, zeroes, owner), fractional], owner);
        choices.push(regular.concatenate([expression(negative ? '\\-' : '', owner), regular.union(integralChoices, owner),
          expression('[.]', owner), canonicalTail], owner));
      }
    }
    return regular.union(choices, owner);
  };
  const duration = (source: RegularLanguage, owner: Owner): RegularLanguage => {
    c.step(owner, 4); const images: RegularLanguage[] = [], epsilon = expression('', owner), zero = expression('0', owner), digits = expression('[0-9]+', owner);
    const signed = (language: RegularLanguage, negative: boolean) => !negative ? language : regular.union([
      regular.intersect([language, zero], owner), regular.concatenate([expression('\\-', owner), regular.intersect([language, regular.negate(zero, owner)], owner)], owner)], owner);
    for (const negative of [false, true]) {
      const unsigned = regular.quotient(source, expression(negative ? '\\-P' : 'P', owner), epsilon, owner), program = regular.automaton(unsigned, owner);
      c.step(owner, program.states.length * 2 + 4); const accepted = new Set(program.states.flatMap((state, index) => state.accepting ? [index] : []));
      type Option = {at: number; value: RegularLanguage};
      const cache = new Map<string, readonly Option[]>();
      const fields = (start: number, unit: string): readonly Option[] => {
        c.step(owner, 24); const key = start + ':' + unit, known = cache.get(key); if (known) return known;
        c.step(owner, 3); const options: Option[] = [{at: start, value: zero}], cp = unit.charCodeAt(0);
        for (let end = 0; end < program.states.length; end++) for (const edge of program.states[end].transitions) {
          c.step(owner); if (edge.lo > cp || edge.hi < cp) continue;
          const value = regular.intersect([regular.paths(program, [start], new Set([end]), owner), digits], owner);
          if (regular.witness(value, owner) !== undefined) {c.step(owner, 3); options.push({at: edge.to, value});}
        }
        c.step(owner, 2); cache.set(key, options); return options;
      };
      const next = (from: number, cp: number): readonly number[] => {
        c.step(owner, program.states[from].transitions.length + 2);
        return program.states[from].transitions.flatMap(edge => edge.lo <= cp && edge.hi >= cp ? [edge.to] : []);
      };
      const publish = (month: RegularLanguage, whole: RegularLanguage, fraction?: RegularLanguage) => {
        const seconds = fraction ? regular.concatenate([whole, expression('[.]', owner), fraction], owner) : whole;
        c.step(owner, 2); images.push(regular.concatenate([signed(month, negative), expression('/', owner), signed(seconds, negative)], owner));
      };
      for (const year of fields(program.start, 'Y')) for (const month of fields(year.at, 'M')) {
        const months = integers.sum([{language: year.value, weight: 12}, {language: month.value, weight: 1}], owner);
        for (const day of fields(month.at, 'D')) {
          if (accepted.has(day.at)) publish(months, integers.sum([{language: day.value, weight: 86400}], owner));
          for (const clock of next(day.at, 84)) for (const hour of fields(clock, 'H')) for (const minute of fields(hour.at, 'M')) {
            const input = [{language: day.value, weight: 86400}, {language: hour.value, weight: 3600}, {language: minute.value, weight: 60}];
            if (accepted.has(minute.at)) publish(months, integers.sum(input, owner));
            for (let end = 0; end < program.states.length; end++) {
              c.step(owner); if (!next(end, 83).some(state => accepted.has(state))) continue;
              const whole = regular.intersect([regular.paths(program, [minute.at], new Set([end]), owner), digits], owner);
              if (regular.witness(whole, owner) !== undefined) publish(months, integers.sum([...input, {language: whole, weight: 1}], owner));
              for (let before = 0; before < program.states.length; before++) for (const after of next(before, 46)) {
                const integral = regular.intersect([regular.paths(program, [minute.at], new Set([before]), owner), digits], owner);
                if (regular.witness(integral, owner) === undefined) continue;
                const fractional = regular.intersect([regular.paths(program, [after], new Set([end]), owner), digits], owner);
                if (regular.witness(fractional, owner) === undefined) continue;
                const sum = integers.sum([...input, {language: integral, weight: 1}], owner);
                if (regular.witness(regular.intersect([fractional, expression('0+', owner)], owner), owner) !== undefined) publish(months, sum);
                const canonical = regular.intersect([regular.quotient(fractional, epsilon, expression('0*', owner), owner), expression('[0-9]*[1-9]', owner)], owner);
                if (regular.witness(canonical, owner) !== undefined) publish(months, sum, canonical);
              }
            }
          }
        }
      }
    }
    return regular.union(images, owner);
  };
  const simple = (source: RegularLanguage, family: string, owner: Owner): RegularLanguage | undefined => {
    if (family === 'string' || family === 'anyURI') return source;
    if (family === 'decimal') return decimal(source, owner);
    if (family === 'duration') return duration(source, owner);
    if (family === 'hexBinary') return regular.characterImage(source, [{lo: 65, hi: 70, shift: 32}], owner);
    if (family === 'base64Binary') return regular.characterImage(source, [{lo: 32, hi: 32, remove: true}], owner);
    if (family === 'boolean') {
      c.step(owner, 3); const choices: RegularLanguage[] = [];
      for (const [syntax, canonical] of [['true|1', 'true'], ['false|0', 'false']])
        if (regular.witness(regular.intersect([source, expression(syntax, owner)], owner), owner) !== undefined) choices.push(expression(canonical, owner));
      return regular.union(choices, owner);
    }
    return undefined;
  };
  return {decimal, duration, simple};
}
