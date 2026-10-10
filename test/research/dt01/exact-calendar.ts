/** DT01 option A research probe; not a production or payload scalar engine. */
export type Decimal = Readonly<{coefficient: bigint; scale: number; digits: number}>;
export type Calendar = Readonly<{
  family: "date" | "dateTime"; year: bigint; month: number; day: number;
  seconds: Decimal; zoned: boolean; lexical: string; digits: number;
}>;
export type Duration = Readonly<{months: bigint; seconds: Decimal; digits: number; lexical: string}>;
export type Order = "less" | "equal" | "greater" | "indeterminate";

export class ProbeFailure extends Error {
  constructor(readonly kind: "invalid-schema" | "resource-limit", message: string) {super(message);}
}

/** Inclusive limits; failures happen before the charged work or allocation. */
export class Budget {
  used = 0;
  constructor(readonly maxWork = 1_000_000, readonly maxNodes = 100_000) {
    if (!Number.isSafeInteger(maxWork) || maxWork < 1 || !Number.isSafeInteger(maxNodes) || maxNodes < 1) {
      throw new Error("Budget limits must be positive exact safe integers");
    }
  }
  nodes(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > this.maxNodes) {
      throw new ProbeFailure("resource-limit", "Input graph node budget exhausted");
    }
    this.charge(count);
  }
  charge(work: number): void {
    if (!Number.isSafeInteger(work) || work < 0 || work > this.maxWork - this.used) {
      throw new ProbeFailure("resource-limit", "Exact calendar work budget exhausted");
    }
    this.used += work;
  }
  arithmetic(digits: number): void {this.charge((digits + 2) ** 2);}
  text(value: string): void {this.charge(value.length * 4 + 8);}
}

const invalid = (message: string): never => {throw new ProbeFailure("invalid-schema", message);};
const floor = (a: bigint, b: bigint): bigint => a >= 0n ? a / b : (a - b + 1n) / b;
const mod = (a: bigint, b: bigint): bigint => a - floor(a, b) * b;
export const isLeap = (year: bigint): boolean => year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
const monthLengths = (year: bigint): readonly number[] => [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Option A removes year zero; digits is a trusted, validated conservative bound. */
export function ordinal(year: bigint, month: number, day: number, budget: Budget, digits: number): bigint {
  if (year === 0n) return invalid("Option A has no year zero");
  budget.arithmetic(digits + 8);
  const y = year - 1n;
  const prior = 365n * y + floor(y, 4n) - floor(y, 100n) + floor(y, 400n) + (year < 0n ? 366n : 0n);
  const lengths = monthLengths(year);
  let before = 0;
  for (let m = 1; m < month; m++) {budget.charge(1); before += lengths[m - 1];}
  return prior + BigInt(before + day - 1);
}

/** Invert by cycles; digits is a trusted, validated conservative operand bound. */
export function fromOrdinal(dayNumber: bigint, budget: Budget, digits: number): Readonly<{year: bigint; month: number; day: number}> {
  budget.arithmetic(digits + 8);
  const astronomical = dayNumber < 0n ? dayNumber - 366n : dayNumber;
  const cycle = floor(astronomical, 146097n);
  let rest = astronomical - cycle * 146097n;
  const century = rest / 36524n > 3n ? 3n : rest / 36524n;
  rest -= century * 36524n;
  const quad = rest / 1461n;
  rest -= quad * 1461n;
  const single = rest / 365n > 3n ? 3n : rest / 365n;
  rest -= single * 365n;
  const year = cycle * 400n + century * 100n + quad * 4n + single + 1n;
  let month = 1;
  for (const length of monthLengths(year)) {
    budget.charge(1);
    if (rest < BigInt(length)) break;
    rest -= BigInt(length); month++;
  }
  return {year, month, day: Number(rest) + 1};
}

function decimal(value: string, budget: Budget): Decimal {
  budget.text(value);
  if (!/^[0-9]+(?:\.[0-9]+)?$/.test(value)) return invalid("Invalid decimal seconds");
  const dot = value.indexOf(".");
  let scale = dot < 0 ? 0 : value.length - dot - 1;
  budget.arithmetic(value.length);
  let coefficient = BigInt(value.replace(".", ""));
  while (scale && coefficient % 10n === 0n) {budget.charge(value.length); coefficient /= 10n; scale--;}
  return {coefficient, scale, digits: value.length};
}
function scaled(value: Decimal, target: number, budget: Budget): bigint {
  budget.arithmetic(value.digits + target - value.scale);
  return value.coefficient * 10n ** BigInt(target - value.scale);
}
function sum(a: Decimal, b: Decimal, budget: Budget): Decimal {
  const scale = Math.max(a.scale, b.scale);
  return {coefficient: scaled(a, scale, budget) + scaled(b, scale, budget), scale,
    digits: Math.max(a.digits + scale - a.scale, b.digits + scale - b.scale) + 1};
}
function integer(value: bigint, digits: number): Decimal {return {coefficient: value, scale: 0, digits};}
function compareDecimal(a: Decimal, b: Decimal, budget: Budget): Order {
  const scale = Math.max(a.scale, b.scale);
  const x = scaled(a, scale, budget), y = scaled(b, scale, budget);
  return x < y ? "less" : x > y ? "greater" : "equal";
}

export function parseCalendar(family: "date" | "dateTime", lexical: string, budget: Budget): Calendar {
  budget.text(lexical);
  const value = lexical.replace(/[\t\r\n ]+/g, " ").replace(/^ | $/g, "");
  const match = (family === "date" ? /^(-?[0-9]{4,})-([0-9]{2})-([0-9]{2})(Z|[+-][0-9]{2}:[0-9]{2})?$/
    : /^(-?[0-9]{4,})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2}(?:\.[0-9]+)?)(Z|[+-][0-9]{2}:[0-9]{2})?$/).exec(value);
  if (!match) return invalid("Calendar lexical form is invalid");
  const rawYear = match[1], unsigned = rawYear.replace(/^-/, "");
  if (unsigned.length > 4 && unsigned[0] === "0") return invalid("Extended years cannot have leading zeroes");
  budget.arithmetic(rawYear.length);
  const year = BigInt(rawYear), month = Number(match[2]), day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > monthLengths(year)[month - 1]) return invalid("Calendar date is invalid");
  const hour = family === "date" ? 0 : Number(match[4]), minute = family === "date" ? 0 : Number(match[5]);
  const second = decimal(family === "date" ? "0" : match[6], budget);
  // XSD 1.0 D.1 admits second 60; Appendix E treats it as overflow.
  if (hour > 24 || minute > 59 || compareDecimal(second, integer(61n, 2), budget) !== "less"
    || hour === 24 && (minute !== 0 || second.coefficient !== 0n)) return invalid("Calendar clock is invalid");
  const zone = match[family === "date" ? 4 : 7];
  let offset = 0;
  if (zone && zone !== "Z") {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 14 || minutes > 59 || hours === 14 && minutes !== 0) return invalid("Timezone is invalid");
    offset = (zone[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
  }
  const seconds = sum(integer(ordinal(year, month, day, budget, lexical.length) * 86400n + BigInt(hour * 3600 + minute * 60 - offset * 60), lexical.length + 8), second, budget);
  budget.arithmetic(seconds.digits + seconds.scale);
  // This API stores assessed value objects: section 3.2.7 places zoned values
  // in UTC. Appendix E's raw field-tuple timezone conversion is a separate use.
  const normalized = fromOrdinal(floor(seconds.coefficient, 86400n * 10n ** BigInt(seconds.scale)), budget, seconds.digits);
  return {family, ...normalized, seconds, zoned: zone !== undefined, lexical, digits: lexical.length + 8};
}

export function parseDuration(lexical: string, budget: Budget): Duration {
  budget.text(lexical);
  const value = lexical.replace(/[\t\r\n ]+/g, " ").replace(/^ | $/g, "");
  const match = /^(-)?P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+(?:\.[0-9]+)?)S)?)?$/.exec(value);
  if (!match || !match.slice(2).some(x => x !== undefined) || value.endsWith("T")) return invalid("Duration lexical form is invalid");
  budget.arithmetic(lexical.length + 8);
  const sign = match[1] ? -1n : 1n;
  const months = sign * (BigInt(match[2] ?? "0") * 12n + BigInt(match[3] ?? "0"));
  const whole = BigInt(match[4] ?? "0") * 86400n + BigInt(match[5] ?? "0") * 3600n + BigInt(match[6] ?? "0") * 60n;
  const seconds = sum(integer(whole, lexical.length + 8), decimal(match[7] ?? "0", budget), budget);
  return {months, seconds: {...seconds, coefficient: seconds.coefficient * sign}, digits: lexical.length + 8, lexical};
}

export function sameDuration(a: Duration, b: Duration, budget: Budget): boolean {
  budget.arithmetic(Math.max(a.digits, b.digits));
  return a.months === b.months && compareDecimal(a.seconds, b.seconds, budget) === "equal";
}

/** Calendar ordering and equality are distinct; different timelines never equal. */
export function sameCalendar(a: Calendar, b: Calendar, budget: Budget): boolean {
  return a.family === b.family && a.zoned === b.zoned && compareDecimal(a.seconds, b.seconds, budget) === "equal";
}
export function compareCalendar(a: Calendar, b: Calendar, budget: Budget): Order {
  if (a.family !== b.family) return "indeterminate";
  if (a.zoned === b.zoned) return compareDecimal(a.seconds, b.seconds, budget);
  const uncertain = a.zoned ? b : a, certain = a.zoned ? a : b;
  const lower = sum(uncertain.seconds, integer(-50400n, 5), budget);
  const upper = sum(uncertain.seconds, integer(50400n, 5), budget);
  if (compareDecimal(certain.seconds, lower, budget) === "less") return a.zoned ? "less" : "greater";
  if (compareDecimal(certain.seconds, upper, budget) === "greater") return a.zoned ? "greater" : "less";
  return "indeterminate";
}

export function addDuration(start: Calendar, duration: Duration, budget: Budget): Decimal {
  if (start.family !== "dateTime") return invalid("The narrow addition probe takes dateTime operands");
  budget.arithmetic(duration.digits + start.digits + 8);
  const continuousYear = start.year > 0n ? start.year - 1n : start.year;
  const index = continuousYear * 12n + BigInt(start.month - 1) + duration.months;
  const coordinate = floor(index, 12n), month = Number(mod(index, 12n)) + 1;
  const year = coordinate >= 0n ? coordinate + 1n : coordinate;
  const day = Math.min(start.day, monthLengths(year)[month - 1]);
  const sourceDay = ordinal(start.year, start.month, start.day, budget, start.digits);
  const targetDay = ordinal(year, month, day, budget, duration.digits + start.digits);
  const shifted = sum(start.seconds, integer((targetDay - sourceDay) * 86400n, duration.digits + start.digits + 16), budget);
  return sum(shifted, duration.seconds, budget);
}

const anchors = ["1696-09-01T00:00:00Z", "1697-02-01T00:00:00Z", "1903-03-01T00:00:00Z", "1903-07-01T00:00:00Z"] as const;
export function compareDuration(a: Duration, b: Duration, budget: Budget): Order {
  if (sameDuration(a, b, budget)) return "equal";
  let order: Order | undefined;
  for (const anchor of anchors) {
    const start = parseCalendar("dateTime", anchor, budget);
    const current = compareDecimal(addDuration(start, a, budget), addDuration(start, b, budget), budget);
    if (current === "equal" || order !== undefined && current !== order) return "indeterminate";
    order = current;
  }
  return order ?? "indeterminate";
}

/** Exact output for tests only; canonical strings never replace retained lexicals. */
export function showInstant(value: Decimal, budget: Budget): string {
  budget.arithmetic(value.digits + value.scale + 24);
  const power = 10n ** BigInt(value.scale);
  const whole = floor(value.coefficient, power), fraction = mod(value.coefficient, power);
  const date = fromOrdinal(floor(whole, 86400n), budget, value.digits), clock = Number(mod(whole, 86400n));
  const year = (date.year < 0n ? "-" : "") + (date.year < 0n ? -date.year : date.year).toString().padStart(4, "0");
  const two = (n: number): string => n.toString().padStart(2, "0");
  const suffix = value.scale && fraction ? "." + fraction.toString().padStart(value.scale, "0").replace(/0+$/, "") : "";
  return `${year}-${two(date.month)}-${two(date.day)}T${two(Math.floor(clock / 3600))}:${two(Math.floor(clock / 60) % 60)}:${two(clock % 60)}${suffix}Z`;
}
