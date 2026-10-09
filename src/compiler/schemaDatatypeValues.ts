/** Schema operand values only: facets/defaults/fixed, never application payloads. */
import type {GraphNode, LexicalValue} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {isXmlNCName, isXmlName, isXmlNmtoken} from "../loader/orderedSyntax.js";

export type DecimalOperand = Readonly<{coefficient: bigint; scale: number; /** Conservative digit bound, charged before conversion/copying. */ digits?: number}>;
export type SchemaOperand = Readonly<{
  family: string; canonical: string; length?: string; decimal?: DecimalOperand;
  ordered?: readonly DecimalOperand[]; zoned?: boolean;
}>;
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
export function normalizeWhitespace(value: string, mode: "preserve" | "replace" | "collapse"): string {
  return mode === "preserve" ? value : mode === "replace" ? value.replace(/[\t\r\n]/g, " ") : value.replace(/[\t\r\n ]+/g, " ").replace(/^ | $/g, "");
}

export function schemaDatatypeValues(c: AssessmentContext) {
  const invalid = (owner: GraphNode, lexical: LexicalValue): never => c.fail(owner, "cvc-datatype-valid", "Schema operand is outside the datatype's lexical/value space", lexical.context.source);
  const decimal = (text: string, owner: GraphNode): DecimalOperand => {
    c.text(text, owner);
    if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)$/.test(text)) c.fail(owner, "cvc-datatype-valid", "Schema numeric operand must be an exact decimal");
    const dot = text.indexOf("."), scale = dot < 0 ? 0 : text.length - dot - 1;
    let coefficient = BigInt(text.replace(".", "")), resultScale = scale;
    while (resultScale && coefficient % 10n === 0n) {c.step(owner); coefficient /= 10n; resultScale--;}
    return {coefficient, scale: resultScale, digits: text.length};
  };
  const scaleTo = (value: DecimalOperand, scale: number, owner: GraphNode): bigint => {
    c.step(owner, scale - value.scale + (value.digits ?? 20));
    return value.coefficient * 10n ** BigInt(scale - value.scale);
  };
  const compareDecimal = (a: DecimalOperand, b: DecimalOperand, owner: GraphNode): number => {
    const scale = Math.max(a.scale, b.scale), x = scaleTo(a, scale, owner), y = scaleTo(b, scale, owner);
    return x === y ? 0 : x < y ? -1 : 1;
  };
  const decimalKey = (d: DecimalOperand, owner: GraphNode) => {
    c.step(owner, d.scale + (d.digits ?? 20) + 2);
    const raw = (d.coefficient < 0n ? -d.coefficient : d.coefficient).toString().padStart(d.scale + 1, "0");
    return `${d.coefficient < 0n ? "-" : ""}${d.scale ? raw.slice(0, -d.scale) + "." + raw.slice(-d.scale) : raw}`;
  };
  const addDecimal = (a: DecimalOperand, b: DecimalOperand, owner: GraphNode): DecimalOperand => {
    const scale = Math.max(a.scale, b.scale);
    return {coefficient: scaleTo(a, scale, owner) + scaleTo(b, scale, owner), scale, digits: Math.max((a.digits ?? 20) + scale - a.scale, (b.digits ?? 20) + scale - b.scale) + 1};
  };
  const floor = (a: bigint, b: bigint) => a >= 0n ? a / b : (a - b + 1n) / b;
  const leap = (year: bigint) => year % 4n === 0n && (year % 100n !== 0n || year % 400n === 0n);
  const days = (year: bigint, month: number, day: number, owner: GraphNode, digits = 20) => {
    c.step(owner, digits * 8 + 20);
    const y = year - 1n, prior = 365n * y + floor(y, 4n) - floor(y, 100n) + floor(y, 400n);
    const months = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    return prior + BigInt(months[month - 1] + day - 1 + (month > 2 && leap(year) ? 1 : 0));
  };
  const temporal = (name: string, value: string, lexical: LexicalValue, owner: GraphNode): SchemaOperand => {
    const patterns: Record<string, RegExp> = {
      dateTime: /^(-?[0-9]{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/,
      date: /^(-?[0-9]{4,})-(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/,
      time: /^(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/,
      gYearMonth: /^(-?[0-9]{4,})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/,
      gYear: /^(-?[0-9]{4,})(Z|[+-]\d{2}:\d{2})?$/,
      gMonthDay: /^--(\d{2})-(\d{2})(Z|[+-]\d{2}:\d{2})?$/,
      gDay: /^---(\d{2})(Z|[+-]\d{2}:\d{2})?$/,
      gMonth: /^--(\d{2})(?:--)?(Z|[+-]\d{2}:\d{2})?$/,
    };
    const match = patterns[name].exec(value); if (!match) return invalid(owner, lexical);
    const zone = match.at(-1), zoned = zone !== undefined;
    let offset = 0;
    if (zone && zone !== "Z") {
      const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
      if (hours > 14 || minutes > 59 || hours === 14 && minutes) return invalid(owner, lexical);
      offset = (zone[0] === "-" ? -1 : 1) * (hours * 60 + minutes);
    }
    let year = 2000n, month = 1, day = 1, hour = 0, minute = 0, second: DecimalOperand = {coefficient: 0n, scale: 0};
    if (["dateTime", "date", "gYearMonth", "gYear"].includes(name)) {
      c.text(match[1], owner); year = BigInt(match[1]);
      if (year === 0n || match[1].replace(/^-/, "").length > 4 && match[1].replace(/^-/, "")[0] === "0") return invalid(owner, lexical);
      if (year < 0n) year++; // XSD 1.0 has no year zero; arithmetic uses astronomical years.
    }
    if (["dateTime", "date", "gYearMonth"].includes(name)) month = Number(match[2]);
    if (["dateTime", "date"].includes(name)) day = Number(match[3]);
    if (name === "gMonthDay") {month = Number(match[1]); day = Number(match[2]);}
    if (name === "gMonth") month = Number(match[1]);
    if (name === "gDay") day = Number(match[1]);
    if (name === "dateTime" || name === "time") {
      const start = name === "time" ? 1 : 4;
      hour = Number(match[start]); minute = Number(match[start + 1]); second = decimal(match[start + 2], owner);
    }
    const monthDays = [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || minute > 59 || hour > 24 || compareDecimal(second, {coefficient: 60n, scale: 0}, owner) >= 0 || hour === 24 && (minute !== 0 || second.coefficient !== 0n)) return invalid(owner, lexical);
    let seconds = addDecimal({coefficient: days(year, month, day, owner, value.length) * 86400n + BigInt(hour * 3600 + minute * 60 - offset * 60), scale: 0, digits: value.length + 8}, second, owner);
    if (name === "time") {
      const period = scaleTo({coefficient: 86400n, scale: 0}, seconds.scale, owner);
      seconds = {...seconds, coefficient: (seconds.coefficient % period + period) % period};
    }
    // Recurring temporal families use the reference fields from the datatype's
    // comparison algorithm. Type tags prevent cross-family equality.
    return {family: name, canonical: `${zoned ? "zoned" : "local"}:${decimalKey(seconds, owner)}`, ordered: [seconds], zoned};
  };
  const atomic = (name: string, lexical: LexicalValue, owner: GraphNode, whitespace = whitespaceFor(name)): SchemaOperand => {
    c.text(lexical.value, owner); const value = normalizeWhitespace(lexical.value, whitespace), family = builtinPrimitive(name);
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
      // IEEE values are the declared datatype, not coercion of arbitrary JS input.
      const number = value === "INF" ? Infinity : value === "-INF" ? -Infinity : value === "NaN" ? NaN : Number(value);
      const typed = family === "float" ? Math.fround(number) : number;
      return {family, canonical: Number.isNaN(typed) ? "NaN" : typed === 0 ? "0" : String(typed)};
    }
    if (family === "QName") {
      const parts = value.split(":");
      if (parts.length > 2 || parts.some(p => !isXmlNCName(p))) return invalid(owner, lexical);
      const prefix = parts.length === 2 ? parts[0] : "", namespace = lexical.context.namespaces[prefix];
      if (prefix && namespace === undefined) return invalid(owner, lexical);
      c.text(namespace ?? "", owner); return {family, canonical: JSON.stringify([namespace ?? "", parts.at(-1)])};
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
      c.step(owner, bytes.length * 2); return {family: "binary", canonical: bytes.toString("hex"), length: bytes.length.toString()};
    }
    if (["dateTime", "date", "time", "gYearMonth", "gYear", "gMonthDay", "gDay", "gMonth"].includes(family)) return temporal(family, value, lexical, owner);
    if (family === "duration") {
      const match = /^(-)?P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value);
      if (!match || !match.slice(2).some(v => v !== undefined) || value.endsWith("T")) return invalid(owner, lexical);
      const sign = match[1] ? -1n : 1n, months = sign * (BigInt(match[2] ?? "0") * 12n + BigInt(match[3] ?? "0"));
      c.step(owner, value.length * 8 + 20);
      const seconds = addDecimal({coefficient: BigInt(match[4] ?? "0") * 86400n + BigInt(match[5] ?? "0") * 3600n + BigInt(match[6] ?? "0") * 60n, scale: 0, digits: value.length + 8}, decimal(match[7] ?? "0", owner), owner);
      const signed = {...seconds, coefficient: seconds.coefficient * sign};
      c.step(owner, value.length + 4);
      return {family, canonical: `${months}/${decimalKey(signed, owner)}`, ordered: [{coefficient: months, scale: 0, digits: value.length + 4}, signed]};
    }
    if (family === "string" || family === "anySimpleType" || family === "anyURI") {
      if (name === "language" && !/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(value)) return invalid(owner, lexical);
      if (["Name", "NCName", "NMTOKEN"].includes(name)) {
        if (!(name === "NMTOKEN" ? isXmlNmtoken(value) : name === "NCName" ? isXmlNCName(value) : isXmlName(value))) return invalid(owner, lexical);
      }
      // anyURI is an IRI reference after escaping; relative/empty values are legal.
      if (family === "anyURI" && /%(?![0-9a-fA-F]{2})/.test(value)) return invalid(owner, lexical);
      let length = 0; for (const ignored of value) {c.step(owner); length++;}
      return {family: family === "anySimpleType" ? "string" : family, canonical: value, length: length.toString()};
    }
    return c.unsupported(owner, `datatype:${name}`, "Datatype is outside the approved scalar profile", lexical.context.source);
  };
  const compare = (a: SchemaOperand, b: SchemaOperand, owner: GraphNode): number | undefined => {
    c.step(owner);
    if (a.family !== b.family) return undefined;
    if (a.decimal && b.decimal) return compareDecimal(a.decimal, b.decimal, owner);
    if (a.family === "float" || a.family === "double") {
      if (a.canonical === "NaN" || b.canonical === "NaN") return undefined;
      const x = Number(a.canonical), y = Number(b.canonical); return x === y ? 0 : x < y ? -1 : 1;
    }
    if (a.ordered && b.ordered) {
      if (a.zoned !== b.zoned) {
        // Unknown timezone is an interval of +/-14h; ordering is partial.
        const spread = {coefficient: 50400n, scale: 0}, x = a.ordered[0], y = b.ordered[0];
        if (compareDecimal(addDecimal(x, {...spread, coefficient: -spread.coefficient}, owner), y, owner) > 0) return 1;
        if (compareDecimal(addDecimal(x, spread, owner), y, owner) < 0) return -1;
        return undefined;
      }
      if (a.family === "duration") {
        // XSD duration order compares additions to four prescribed reference
        // dates. Equality is exact months+seconds; general order is partial.
        if (a.canonical === b.canonical) return 0;
        let direction: number | undefined;
        for (const [year, month] of [[1696, 9], [1697, 2], [1903, 3], [1903, 7]]) {
          const add = (operand: SchemaOperand) => {
            const monthIndex = BigInt(year) * 12n + BigInt(month - 1) + operand.ordered![0].coefficient;
            const y = floor(monthIndex, 12n), m = Number(monthIndex - y * 12n) + 1;
            const digits = (operand.ordered![0].digits ?? 20) + 8;
            return addDecimal({coefficient: days(y, m, 1, owner, digits) * 86400n, scale: 0, digits}, operand.ordered![1], owner);
          };
          const current = compareDecimal(add(a), add(b), owner);
          if (direction !== undefined && current !== direction) return undefined;
          direction = current;
        }
        return direction;
      }
      return compareDecimal(a.ordered[0], b.ordered[0], owner);
    }
    return a.canonical === b.canonical ? 0 : undefined;
  };
  return {atomic, decimal, decimalKey, compareDecimal, compare};
}
