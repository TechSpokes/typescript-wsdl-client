/** Exact regular preimages of decimal value bounds and precision facets. */
import type {SchemaPatternContext} from './schemaValueContext.js';

export function schemaDecimalLanguages<Owner>(c: SchemaPatternContext<Owner>) {
  const join = (branches: readonly string[], owner: Owner): string => {
    c.step(owner, branches.length * 3 + 4);
    for (const branch of branches) c.text(branch, owner);
    c.step(owner, branches.reduce((length, branch) => length + branch.length + 1, 2));
    if (!branches.length) throw new TypeError('Decimal branch union requires a nonempty private inventory');
    return '(' + branches.join('|') + ')';
  };
  const emit = (text: string, owner: Owner) => {c.text(text, owner); return text;};
  const fractional = (digits: string, greater: boolean, owner: Owner): string[] => {
    c.step(owner, digits.length * 4 + 4); const branches: string[] = [];
    for (let index = 0; index < digits.length; index++) {
      c.step(owner, index * 2 + 30); const digit = Number(digits[index]);
      if (greater ? digit < 9 : digit > 0) branches.push(emit(digits.slice(0, index)
        + (greater ? `[${digit + 1}-9]` : `[0-${digit - 1}]`) + '[0-9]*', owner));
      // Omitted digits are padded with zeros for value comparison.
      if (!greater) branches.push(emit(digits.slice(0, index), owner));
    }
    if (greater) branches.push(emit(digits + '0*[1-9][0-9]*', owner));
    return branches;
  };
  const magnitude = (canonical: string, greater: boolean, owner: Owner): string[] => {
    c.text(canonical, owner); const [integer, fraction = ''] = canonical.split('.'), branches: string[] = [];
    if (integer !== '0') {
      const length = integer.length;
      c.step(owner, length * 4 + 8);
      if (greater) branches.push(emit(`0*[1-9][0-9]{${length},}([.][0-9]*)?`, owner));
      else {
        branches.push('0+([.][0-9]*)?|[.][0-9]+');
        if (length > 1) branches.push(emit(`0*[1-9][0-9]{0,${length - 2}}([.][0-9]*)?`, owner));
      }
      for (let index = 0; index < length; index++) {
        c.step(owner, index * 2 + 32); const digit = Number(integer[index]), minimum = index === 0 ? 1 : 0;
        if (greater ? digit < 9 : digit > minimum) branches.push(emit('0*' + integer.slice(0, index)
          + (greater ? `[${digit + 1}-9]` : `[${minimum}-${digit - 1}]`)
          + `[0-9]{${length - index - 1}}([.][0-9]*)?`, owner));
      }
    } else if (greater) branches.push('0*[1-9][0-9]*([.][0-9]*)?');
    const fractions = fractional(fraction, greater, owner);
    const prefix = integer === '0' ? '0*' : '0*' + integer;
    if (fractions.length) {
      const suffix = join(fractions, owner); c.step(owner, prefix.length + suffix.length + 8);
      branches.push(prefix + '[.]' + suffix);
    }
    if (!greater && fraction.length) branches.push(emit(integer === '0' ? '0+' : prefix, owner));
    return branches;
  };
  const relation = (canonical: string, greater: boolean, owner: Owner): string | undefined => {
    c.text(canonical, owner); const negative = canonical.startsWith('-'), unsigned = negative ? canonical.slice(1) : canonical;
    if (unsigned === '0') return greater
      ? '[+]?(0*[1-9][0-9]*([.][0-9]*)?|0*[.]0*[1-9][0-9]*)'
      : '\\-(0*[1-9][0-9]*([.][0-9]*)?|0*[.]0*[1-9][0-9]*)';
    const positive = magnitude(unsigned, negative ? !greater : greater, owner);
    const own = positive.length ? join(positive, owner) : undefined;
    const branches: string[] = [];
    if (own) {c.step(owner, own.length + 8); branches.push((negative ? '\\-' : '[+]?') + own);}
    // Opposite signs (including either spelling of zero) need no rounding.
    if (negative && greater) branches.push('[+]?([0-9]+([.][0-9]*)?|[.][0-9]+)', '\\-(0+([.]0*)?|[.]0+)');
    if (!negative && !greater) branches.push('\\-([0-9]+([.][0-9]*)?|[.][0-9]+)');
    return branches.length ? join(branches, owner) : undefined;
  };
  const precision = (name: 'totalDigits' | 'fractionDigits', bound: string, owner: Owner): string => {
    c.text(bound, owner); c.step(owner, bound.length ** 2 + 4);
    if (name === 'fractionDigits') return emit(`[+\\-]?([0-9]+([.][0-9]{0,${bound}}0*)?|[.][0-9]{0,${bound}}0*)`, owner);
    const maximum = BigInt(bound), branches: string[] = ['0+([.]0*)?'];
    c.step(owner, 32 + bound.length * 2);
    branches.push(emit(`0*[.][0-9]{0,${bound}}0*`, owner));
    for (let count = 1n; count <= maximum; count++) {
      c.step(owner, bound.length * 8 + 40);
      branches.push(emit(`0*[1-9][0-9]{${count - 1n}}([.][0-9]{0,${maximum - count}}0*)?`, owner));
    }
    const expression = join(branches, owner); c.step(owner, expression.length + 10); return '[+\\-]?' + expression;
  };
  return {relation, precision};
}
