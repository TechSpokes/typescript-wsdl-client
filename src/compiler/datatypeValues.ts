/** Neutral datatype calculations. No schema or payload authority/receipt is conferred here. */
import type {SemanticTypeReference as Reference} from "./semanticTypeReference.js";
import type {DatatypeLexicalOperand, DatatypeValueContext} from "./schemaValueContext.js";
import type {SyntaxSource} from '../loader/orderedSyntax.js';
import {isXmlNCName, isXmlName, isXmlNmtoken} from "../loader/orderedSyntax.js";
import {parseCalendar, parseReduced, parseDuration, compareCalendar, compareDuration, ProbeFailure} from "./schemaExactCalendar.js";
import type {Calendar, Duration, ReducedFamily, CalendarBudget} from "./schemaExactCalendar.js";
import {schemaUri} from "./schemaUri.js";
import {normalizeWhitespace} from '../util/xmlWhitespace.js';

export type DecimalOperand = Readonly<{coefficient: bigint; scale: number; /** Conservative digit bound, charged before conversion/copying. */ digits?: number}>;
export type DatatypeOperand = Readonly<{
  family: string; canonical: string; length?: string; decimal?: DecimalOperand;
  ordered?: readonly DecimalOperand[]; zoned?: boolean;
  /** Successful datatype/member normalization, only for schema operand checks. */
  normalized?: string;
  calendar?: Calendar; duration?: Duration; items?: readonly DatatypeOperand[]; selectedMembers?: readonly Reference[];
}>;
export type DatatypeListTokens = Readonly<{normalized: string; tokens: readonly string[]; source: SyntaxSource}>;
export const builtinListItem = (name: string): 'NMTOKEN' | 'IDREF' | 'ENTITY' | undefined =>
  name === 'NMTOKENS' ? 'NMTOKEN' : name === 'IDREFS' ? 'IDREF' : name === 'ENTITIES' ? 'ENTITY' : undefined;
export const builtinParents: Readonly<Record<string, string>> = Object.freeze({
  normalizedString: "string", token: "normalizedString", language: "token", NMTOKEN: "token", Name: "token", NCName: "Name",
  ID: "NCName", IDREF: "NCName", ENTITY: "NCName", integer: "decimal", nonPositiveInteger: "integer", negativeInteger: "nonPositiveInteger",
  long: "integer", int: "long", short: "int", byte: "short", nonNegativeInteger: "integer", unsignedLong: "nonNegativeInteger",
  unsignedInt: "unsignedLong", unsignedShort: "unsignedInt", unsignedByte: "unsignedShort", positiveInteger: "nonNegativeInteger",
});
export const integerBounds: Readonly<Record<string, readonly [string | undefined, string | undefined]>> = Object.freeze({
  nonPositiveInteger: [undefined, "0"], negativeInteger: [undefined, "-1"], nonNegativeInteger: ["0", undefined], positiveInteger: ["1", undefined],
  long: ["-9223372036854775808", "9223372036854775807"], int: ["-2147483648", "2147483647"], short: ["-32768", "32767"], byte: ["-128", "127"],
  unsignedLong: ["0", "18446744073709551615"], unsignedInt: ["0", "4294967295"], unsignedShort: ["0", "65535"], unsignedByte: ["0", "255"],
});
export const builtinPrimitive = (name: string): string => {
  while (builtinParents[name]) name = builtinParents[name]; return name;
};
export const whitespaceFor = (name: string): "preserve" | "replace" | "collapse" => name === "string" || name === "anySimpleType" ? "preserve" : name === "normalizedString" ? "replace" : "collapse";
export {normalizeWhitespace} from '../util/xmlWhitespace.js';

export function datatypeValues<Owner>(c: DatatypeValueContext<Owner>) {
  const invalid = (owner: Owner, lexical: DatatypeLexicalOperand): never => c.fail(owner, "cvc-datatype-valid", "Schema operand is outside the datatype's lexical/value space", lexical.context.source);
  const decimal = (text: string, owner: Owner): DecimalOperand => {
    c.text(text, owner);
    if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(text)) c.fail(owner, "cvc-datatype-valid", "Schema numeric operand must be an exact decimal");
    const dot = text.indexOf("."), scale = dot < 0 ? 0 : text.length - dot - 1;
    c.step(owner, (text.length + 2) ** 2);
    let coefficient = BigInt(text.replace(".", "")), resultScale = scale;
    while (resultScale && coefficient % 10n === 0n) {c.step(owner, text.length + 1); coefficient /= 10n; resultScale--;}
    return {coefficient, scale: resultScale, digits: text.length};
  };
  const scaleTo = (value: DecimalOperand, scale: number, owner: Owner): bigint => {
    c.step(owner, (scale - value.scale + (value.digits ?? 20) + 2) ** 2);
    return value.coefficient * 10n ** BigInt(scale - value.scale);
  };
  const compareDecimal = (a: DecimalOperand, b: DecimalOperand, owner: Owner): number => {
    const scale = Math.max(a.scale, b.scale), x = scaleTo(a, scale, owner), y = scaleTo(b, scale, owner);
    return x === y ? 0 : x < y ? -1 : 1;
  };
  const decimalKey = (d: DecimalOperand, owner: Owner) => {
    c.step(owner, d.scale + (d.digits ?? 20) + 2);
    const raw = (d.coefficient < 0n ? -d.coefficient : d.coefficient).toString().padStart(d.scale + 1, "0");
    return `${d.coefficient < 0n ? "-" : ""}${d.scale ? raw.slice(0, -d.scale) + "." + raw.slice(-d.scale) : raw}`;
  };
  const addDecimal = (a: DecimalOperand, b: DecimalOperand, owner: Owner): DecimalOperand => {
    const scale = Math.max(a.scale, b.scale);
    return {coefficient: scaleTo(a, scale, owner) + scaleTo(b, scale, owner), scale, digits: Math.max((a.digits ?? 20) + scale - a.scale, (b.digits ?? 20) + scale - b.scale) + 1};
  };
  const calendarBudget = (owner: Owner): CalendarBudget => ({
    charge: work => c.step(owner, work), arithmetic: digits => c.step(owner, (digits + 2) ** 2), text: value => c.text(value, owner),
  });
  const temporal = (name: string, value: string, lexical: DatatypeLexicalOperand, owner: Owner): DatatypeOperand => {
    try {
      const budget = calendarBudget(owner);
      const calendar = name === "date" || name === "dateTime" ? parseCalendar(name, value, budget) : parseReduced(name as ReducedFamily, value, budget);
      return {family: name, canonical: (calendar.zoned ? "zoned:" : "local:") + decimalKey(calendar.seconds, owner), calendar};
    } catch (error) {
      if (error instanceof ProbeFailure && error.kind === "invalid-schema") return invalid(owner, lexical);
      throw error;
    }
  };
  /** Round the exact decimal rational directly to its declared IEEE format. */
  const ieee = (value: string, single: boolean, owner: Owner): number => {
    const negative = value[0] === "-", unsigned = value.replace(/^[+-]/, "");
    const [mantissa, rawExponent = "0"] = unsigned.split(/[eE]/), dot = mantissa.indexOf(".");
    const digits = mantissa.replace(".", "").replace(/^0+/, "");
    if (!digits) return 0;
    c.step(owner, (rawExponent.length + 2) ** 2);
    const exponent = BigInt(rawExponent) - BigInt(dot < 0 ? 0 : mantissa.length - dot - 1);
    const order = exponent + BigInt(digits.length - 1);
    // Outside these conservative thresholds, exact IEEE rounding is known
    // without constructing a power from an adversarial exponent literal.
    if (order > BigInt(single ? 39 : 309)) return negative ? -Infinity : Infinity;
    if (order < BigInt(single ? -47 : -326)) return 0;
    const magnitude = exponent < 0n ? -exponent : exponent;
    // The inequalities above bound magnitude by input length + 327. Charge
    // decimal powers and binary representations before constructing either.
    c.step(owner, (digits.length * 4 + Number(magnitude) * 4 + 32) ** 2);
    const power = 10n ** magnitude;
    let numerator = BigInt(digits), denominator = 1n;
    if (exponent >= 0n) numerator *= power; else denominator = power;
    const bits = (number: bigint) => number.toString(2).length;
    let binaryExponent = bits(numerator) - bits(denominator);
    const below = binaryExponent >= 0 ? numerator < denominator << BigInt(binaryExponent) : numerator << BigInt(-binaryExponent) < denominator;
    if (below) binaryExponent--;
    const precision = single ? 24 : 53, minimum = single ? -126 : -1022, maximum = single ? 127 : 1023;
    binaryExponent = Math.max(minimum, binaryExponent);
    const shift = precision - 1 - binaryExponent;
    c.step(owner, Math.abs(shift) + 1);
    if (shift >= 0) numerator <<= BigInt(shift); else denominator <<= BigInt(-shift);
    let significand = numerator / denominator;
    const twiceRemainder = numerator % denominator * 2n;
    if (twiceRemainder > denominator || twiceRemainder === denominator && significand % 2n !== 0n) significand++;
    if (significand === 1n << BigInt(precision)) {significand >>= 1n; binaryExponent++;}
    if (binaryExponent > maximum) return negative ? -Infinity : Infinity;
    const number = Number(significand) * 2 ** (binaryExponent - precision + 1);
    return negative ? -number : number;
  };
  const atomic = (name: string, lexical: DatatypeLexicalOperand, owner: Owner, whitespace = whitespaceFor(name)): DatatypeOperand => {
    c.text(lexical.value, owner);
    for (const character of lexical.value) {
      c.step(owner); const code = character.codePointAt(0)!;
      if (!(code === 9 || code === 10 || code === 13 || code >= 0x20 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff)) return invalid(owner, lexical);
    }
    const value = normalizeWhitespace(lexical.value, whitespace), family = builtinPrimitive(name);
    if (name === "ENTITY") c.unresolved(owner, "datatype:ENTITY", "A schema ENTITY operand requires a DTD declaration context excluded by the loading policy", lexical.context.source);
    if (family === "decimal") {
      if (name !== "decimal" && !/^[+-]?[0-9]+$/.test(value)) return invalid(owner, lexical);
      const d = decimal(value, owner), bound = integerBounds[name];
      if (bound && (bound[0] !== undefined && compareDecimal(d, decimal(bound[0], owner), owner) < 0 || bound[1] !== undefined && compareDecimal(d, decimal(bound[1], owner), owner) > 0)) return invalid(owner, lexical);
      return {family, canonical: decimalKey(d, owner), decimal: d};
    }
    if (family === "boolean") {
      if (!["true", "false", "1", "0"].includes(value)) return invalid(owner, lexical);
      return {family, canonical: value === "true" || value === "1" ? "true" : "false"};
    }
    if (family === "float" || family === "double") {
      if (!["INF", "-INF", "NaN"].includes(value) && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) return invalid(owner, lexical);
      const typed = value === "INF" ? Infinity : value === "-INF" ? -Infinity : value === "NaN" ? NaN : ieee(value, family === "float", owner);
      return {family, canonical: Number.isNaN(typed) ? "NaN" : typed === 0 ? "0" : String(typed)};
    }
    if (family === "QName" || family === "NOTATION") {
      const parts = value.split(":");
      if (parts.length > 2 || parts.some(p => !isXmlNCName(p))) return invalid(owner, lexical);
      const prefix = parts.length === 2 ? parts[0] : "", namespace = lexical.context.namespaces[prefix];
      if (prefix && namespace === undefined) return invalid(owner, lexical);
      c.text(namespace ?? "", owner);
      if (family === "NOTATION") c.notation(namespace ?? "", parts.at(-1)!, owner);
      return {family, canonical: JSON.stringify([namespace ?? "", parts.at(-1)])};
    }
    if (family === "hexBinary" || family === "base64Binary") {
      let bytes: Buffer;
      if (family === "hexBinary") {
        if (!/^(?:[0-9a-fA-F]{2})*$/.test(value)) return invalid(owner, lexical);
        c.step(owner, value.length); bytes = Buffer.from(value, "hex");
      } else {
        const compact = value.replace(/[\t\r\n ]/g, "");
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(compact)) return invalid(owner, lexical);
        c.step(owner, compact.length); bytes = Buffer.from(compact, "base64");
        if (bytes.toString("base64") !== compact) return invalid(owner, lexical);
      }
      c.step(owner, bytes.length * 2); return {family, canonical: bytes.toString("hex"), length: bytes.length.toString()};
    }
    if (["dateTime", "date", "time", "gYearMonth", "gYear", "gMonthDay", "gDay", "gMonth"].includes(family)) return temporal(family, value, lexical, owner);
    if (family === "duration") {
      try {
        const duration = parseDuration(value, calendarBudget(owner));
        return {family, canonical: duration.months + "/" + decimalKey(duration.seconds, owner), duration};
      } catch (error) {
        if (error instanceof ProbeFailure && error.kind === "invalid-schema") return invalid(owner, lexical);
        throw error;
      }
    }
    if (family === "string" || family === "anySimpleType" || family === "anyURI") {
      if (name === "language" && !/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value)) return invalid(owner, lexical);
      if (["Name", "NCName", "NMTOKEN", "ID", "IDREF", "ENTITY"].includes(name)) {
        if (!(name === "NMTOKEN" ? isXmlNmtoken(value) : name === "Name" ? isXmlName(value) : isXmlNCName(value))) return invalid(owner, lexical);
      }
      // anyURI is an IRI reference after escaping; relative/empty values are legal.
      if (family === "anyURI" && !schemaUri(value, owner, c)) return invalid(owner, lexical);
      let length = 0; for (const ignored of value) {c.step(owner); length++;}
      return {family: family === "anySimpleType" ? "string" : family, canonical: value, length: length.toString()};
    }
    return c.unsupported(owner, `datatype:${name}`, "Datatype is outside the approved scalar profile", lexical.context.source);
  };
  const sameValue = (a: DatatypeOperand, b: DatatypeOperand, owner: Owner): boolean => {
    c.text(a.canonical, owner); c.text(b.canonical, owner);
    return a.family === b.family && a.canonical === b.canonical;
  };
  const compare = (a: DatatypeOperand, b: DatatypeOperand, owner: Owner): number | undefined => {
    c.step(owner);
    if (a.family !== b.family) return undefined;
    if (a.decimal && b.decimal) return compareDecimal(a.decimal, b.decimal, owner);
    if (a.family === "float" || a.family === "double") {
      if (a.canonical === "NaN" || b.canonical === "NaN") return a.canonical === b.canonical ? 0 : undefined;
      const x = Number(a.canonical), y = Number(b.canonical); return x === y ? 0 : x < y ? -1 : 1;
    }
    if (a.calendar && b.calendar || a.duration && b.duration) {
      const order = a.calendar && b.calendar ? compareCalendar(a.calendar, b.calendar, calendarBudget(owner))
        : compareDuration(a.duration!, b.duration!, calendarBudget(owner));
      return order === "less" ? -1 : order === "greater" ? 1 : order === "equal" ? 0 : undefined;
    }
    return sameValue(a, b, owner) ? 0 : undefined;
  };
  const listTokens = (lexical: DatatypeLexicalOperand, owner: Owner): DatatypeListTokens => {
    c.text(lexical.value, owner);
    const normalized = normalizeWhitespace(lexical.value, 'collapse');
    c.step(owner, normalized.length + 3);
    return {normalized, tokens: normalized ? normalized.split(' ') : [], source: lexical.context.source};
  };
  const listOperand = (tokens: DatatypeListTokens, items: readonly DatatypeOperand[], owner: Owner, builtinName?: string): DatatypeOperand => {
    c.step(owner, items.length * 2 + 4);
    if (tokens.tokens.length !== items.length) throw new TypeError('Internally assessed list item count differs from token count');
    if (builtinName && builtinListItem(builtinName) && !items.length) c.fail(owner, 'cvc-minLength-valid', 'Builtin token list requires at least one item', tokens.source);
    const keys: string[] = [];
    for (const item of items) {
      c.step(owner, 8 * (item.family.length + item.canonical.length) + 16);
      keys.push(JSON.stringify([item.family, item.canonical]));
    }
    for (const key of keys) c.step(owner, key.length * 8 + 4);
    return {family: 'list', canonical: JSON.stringify(keys), length: items.length.toString(), normalized: tokens.normalized, items};
  };
  const builtin = (name: string, lexical: DatatypeLexicalOperand, owner: Owner): DatatypeOperand => {
    c.step(owner);
    const itemName = builtinListItem(name);
    if (!itemName) return atomic(name, lexical, owner);
    const tokens = listTokens(lexical, owner), items: DatatypeOperand[] = [];
    c.step(owner, tokens.tokens.length * 3);
    for (const value of tokens.tokens) items.push(atomic(itemName, {value, context: lexical.context}, owner));
    return listOperand(tokens, items, owner, name);
  };
  return {atomic, builtin, listTokens, listOperand, decimal, decimalKey, compareDecimal, sameValue, compare};
}
