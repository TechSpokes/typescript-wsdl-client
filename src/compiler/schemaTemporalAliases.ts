/** Complete fixed-value calendar aliases under the accepted DT A coordinates. */
import {showInstant} from './schemaExactCalendar.js';
import type {Calendar, CalendarBudget, Decimal, Duration} from './schemaExactCalendar.js';
import type {SchemaPatternContext} from './schemaValueContext.js';

export function* calendarAliasExpressions<Owner>(calendar: Calendar, owner: Owner, c: SchemaPatternContext<Owner>): Generator<string> {
  const budget: CalendarBudget = {charge: work => c.step(owner, work), text: text => {c.text(text, owner);},
    arithmetic: digits => c.step(owner, (digits + 2) ** 2)};
  const value = calendar.seconds;
  budget.arithmetic(value.digits + value.scale + 4); const power = 10n ** BigInt(value.scale);
  const shifted = (seconds: number): Decimal => {
    budget.arithmetic(value.digits + value.scale + 8); c.step(owner, 4);
    return {...value, coefficient: value.coefficient + BigInt(seconds) * power};
  };
  const quote = (text: string): string => {
    c.text(text, owner); c.step(owner, text.length * 2 + 1); return text.replace(/[\\.\-^?*+{}()\[\]|]/g, '\\$&');
  };
  const two = (value: number): string => {c.step(owner, 4); return value.toString().padStart(2, '0');};
  const offsets = function* (): Generator<number> {
    yield 0;
    if (calendar.zoned) for (let minute = 1; minute <= 840; minute++) {c.step(owner, 2); yield minute; yield -minute;}
  };
  const expression = (instant: string, zone: string, second60 = false, hour24 = false): string | undefined => {
    c.text(instant, owner); c.step(owner, instant.length * 3 + 12);
    const match = /^(-?[0-9]+)-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?Z$/.exec(instant)!;
    const [, year, month, day, h, m, s, fraction = ''] = match;
    const hour = hour24 ? '24' : h, second = second60 ? '60' : s;
    const suffix = fraction ? '[.]' + fraction + '0*' : '([.]0+)?';
    const clock = hour + ':' + m + ':' + second;
    const zeroClock = h === '00' && m === '00' && s === '00' && !fraction;
    let text: string;
    switch (calendar.family) {
      case 'dateTime': text = quote(year + '-' + month + '-' + day + 'T' + clock) + suffix; break;
      case 'time': text = quote(clock) + suffix; break;
      case 'date': if (!zeroClock) return undefined; text = quote(year + '-' + month + '-' + day); break;
      case 'gYear': if (!zeroClock || month !== '01' || day !== '01') return undefined; text = quote(year); break;
      case 'gYearMonth': if (!zeroClock || day !== '01') return undefined; text = quote(year + '-' + month); break;
      case 'gMonthDay': if (!zeroClock || year !== '2000') return undefined; text = quote('--' + month + '-' + day); break;
      case 'gDay': if (!zeroClock || year !== '2000' || month !== '01') return undefined; text = quote('---' + day); break;
      case 'gMonth': if (!zeroClock || year !== '2000' || day !== '01') return undefined; text = quote('--' + month); break;
    }
    c.step(owner, text.length + zone.length * 2 + 1); return text + quote(zone);
  };
  for (const offset of offsets()) {
    c.step(owner, 4); const local = shifted(offset * 60), instant = showInstant(local, budget);
    const zone = calendar.zoned ? (offset < 0 ? '-' : '+') + two(Math.floor(Math.abs(offset) / 60)) + ':' + two(Math.abs(offset) % 60) : '';
    c.step(owner, 4); const zones = calendar.zoned && offset === 0 ? ['Z', '+00:00', '-00:00'] : [zone];
    for (const zone of zones) {
      const normal = expression(instant, zone); if (normal !== undefined) yield normal;
      if (calendar.family !== 'dateTime' && calendar.family !== 'time') continue;
      // Second 60 is an overflow into the next minute, including fractions.
      if (/T[0-9]{2}:[0-9]{2}:00(?:\.[0-9]+)?Z$/.test(instant)) {
        budget.arithmetic(local.digits + local.scale + 8); c.step(owner, 4);
        const priorMinute = showInstant({...local, coefficient: local.coefficient - 60n * power}, budget);
        const overflow = expression(priorMinute, zone, true); if (overflow !== undefined) yield overflow;
      }
      if (/T00:00:00Z$/.test(instant)) {
        budget.arithmetic(local.digits + local.scale + 8); c.step(owner, 4);
        const priorDay = showInstant({...local, coefficient: local.coefficient - 86400n * power}, budget);
        const midnight = expression(priorDay, zone, false, true); if (midnight !== undefined) yield midnight;
      }
    }
  }
}

/** Finite field decompositions, each with its complete infinite zero aliases. */
export function* durationAliasExpressions<Owner>(duration: Duration, owner: Owner, c: SchemaPatternContext<Owner>,
  canMatch: (expression: string) => boolean): Generator<string> {
  const digits = duration.digits + duration.seconds.scale + 8;
  const arithmetic = () => c.step(owner, (digits + 2) ** 2);
  arithmetic(); const months = duration.months < 0n ? -duration.months : duration.months;
  const seconds = duration.seconds.coefficient < 0n ? -duration.seconds.coefficient : duration.seconds.coefficient;
  const power = 10n ** BigInt(duration.seconds.scale), unit = 60n * power;
  const sign = duration.months < 0n || duration.seconds.coefficient < 0n ? '\\-' : '';
  const integer = (number: bigint): string => {arithmetic(); c.step(owner, digits + 4); return number === 0n ? '0+' : '0*' + number;};
  const field = (number: bigint, suffix: string): string => {
    const value = integer(number); c.step(owner, value.length + 8); return number === 0n ? '(' + value + suffix + ')?' : value + suffix;
  };
  const second = (coefficient: bigint): string => {
    arithmetic(); c.step(owner, digits * 4 + 8);
    const whole = coefficient / power, remainder = coefficient % power;
    const fraction = remainder === 0n ? '([.]0+)?' : '[.]' + remainder.toString().padStart(duration.seconds.scale, '0').replace(/0+$/, '') + '0*';
    return integer(whole) + fraction + 'S';
  };
  const zeroTime = (): string => {
    c.step(owner, 4); const choices: string[] = [];
    for (let mask = 1; mask < 8; mask++) {
      c.step(owner, 64); choices.push('T' + (mask & 1 ? '0+H' : '') + (mask & 2 ? '0+M' : '') + (mask & 4 ? '0+([.]0+)?S' : ''));
    }
    c.step(owner, 256); return '(' + choices.join('|') + ')?';
  };
  const branch = (y: bigint, m: bigint, d: bigint, h: bigint, minute: bigint, remainder: bigint): string => {
    const prefix = sign + 'P' + field(y, 'Y') + field(m, 'M') + field(d, 'D');
    c.step(owner, prefix.length + digits * 8 + 64);
    return h === 0n && minute === 0n && remainder === 0n ? prefix + zeroTime()
      : prefix + 'T' + field(h, 'H') + field(minute, 'M') + (remainder === 0n ? '(' + second(0n) + ')?' : second(remainder));
  };
  if (months === 0n && seconds === 0n) {
    for (let mask = 1; mask < 64; mask++) {
      c.step(owner, 96);
      const date = (mask & 1 ? '0+Y' : '') + (mask & 2 ? '0+M' : '') + (mask & 4 ? '0+D' : '');
      const time = (mask & 8 ? '0+H' : '') + (mask & 16 ? '0+M' : '') + (mask & 32 ? '0+([.]0+)?S' : '');
      yield '\\-?P' + date + (time ? 'T' + time : '');
    }
    return;
  }
  // A conventional decomposition supplies a cheap complete-language branch
  // before exhaustive finite alternatives; no failure of it proves absence.
  arithmetic(); const y = months / 12n, m = months % 12n, d = seconds / (86400n * power);
  const rest = seconds - d * 86400n * power, h = rest / (3600n * power), restHour = rest - h * 3600n * power;
  const minute = restHour / unit; yield branch(y, m, d, h, minute, restHour - minute * unit);
  for (let year = 0n; year * 12n <= months; year++) {
    arithmetic(); const month = months - year * 12n;
    const datePrefix = sign + 'P' + field(year, 'Y') + field(month, 'M');
    c.step(owner, datePrefix.length + 128);
    if (!canMatch(datePrefix + '([0-9]+D)?(T([0-9]+H)?([0-9]+M)?([0-9]+([.][0-9]+)?S)?)?')) continue;
    for (let day = 0n; day * 86400n * power <= seconds; day++) {
      arithmetic(); const remaining = seconds - day * 86400n * power, prefix = datePrefix + field(day, 'D');
      c.step(owner, prefix.length + 96);
      if (!canMatch(prefix + '(T([0-9]+H)?([0-9]+M)?([0-9]+([.][0-9]+)?S)?)?')) continue;
      for (let hour = 0n; hour * 3600n * power <= remaining; hour++) {
        arithmetic(); const afterHour = remaining - hour * 3600n * power;
        c.step(owner, prefix.length + digits * 4 + 96);
        if (!canMatch(prefix + 'T' + field(hour, 'H') + '([0-9]+M)?([0-9]+([.][0-9]+)?S)?')) {
          if (hour !== 0n || afterHour !== 0n) continue;
        }
        for (let min = 0n; min * unit <= afterHour; min++) {
          arithmetic(); const remainingSeconds = afterHour - min * unit;
          yield branch(year, month, day, hour, min, remainingSeconds);
        }
      }
    }
  }
}
