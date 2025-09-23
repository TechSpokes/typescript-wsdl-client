/**
 * XSD to TypeScript Primitive Type Mapping
 *
 * This module defines how XML Schema (XSD) primitive types are mapped to TypeScript types.
 * It provides a configurable mapping system with safe defaults that prioritizes
 * data integrity over convenience:
 *
 * Key design decisions:
 * - 64-bit integers (long/unsignedLong) default to string to prevent overflow in JavaScript number
 * - Arbitrary-precision decimal types default to string to prevent loss of precision
 * - Date/time types default to string (no automatic Date parsing/conversion)
 * - Configurable options allow users to override defaults when appropriate for their use case
 */

/**
 * Configuration options for XSD primitive type mapping
 *
 * @interface PrimitiveOptions
 * @property {string} [int64As] - How to map xs:long/xs:unsignedLong (default: "string")
 * @property {string} [bigIntegerAs] - How to map xs:integer family (default: "string")
 * @property {string} [decimalAs] - How to map xs:decimal (default: "string")
 * @property {string} [dateAs] - How to map xs:date/xs:time family (default: "string")
 */
export type PrimitiveOptions = {
  int64As?: "string" | "number" | "bigint";    // default: "string"
  bigIntegerAs?: "string" | "number";          // default: "string" (e.g., xs:integer, positive/negative, non*Integer)
  decimalAs?: "string" | "number";             // default: "string"
  dateAs?: "string" | "Date";                  // default: "string"
};

/**
 * Default primitive mapping options that prioritize data integrity over convenience
 *
 * These defaults ensure that no data is lost in the TypeScript representation, even
 * for edge cases like very large integers or high-precision decimals.
 */
const DEFAULTS: Required<PrimitiveOptions> = {
  int64As: "string",
  bigIntegerAs: "string",
  decimalAs: "string",
  dateAs: "string",
};

/**
 * Determines the appropriate TypeScript type for XSD integer families
 *
 * This function categorizes integer types by their potential size range:
 * - 64-bit or arbitrary-precision integers use the configured type (default: string)
 * - 32-bit or smaller integers use the native number type
 *
 * @param {string} local - Local name of the XSD type (e.g., "int", "long", "integer")
 * @param {Required<PrimitiveOptions>} opts - Primitive mapping options
 * @returns {string} - Appropriate TypeScript type for the integer type
 */
function intFamily(local: string, opts: Required<PrimitiveOptions>): string {
  // 64-bit or unbounded families → configurable
  const int64 = new Set(["long", "unsignedLong"]);
  const big = new Set([
    "integer",
    "nonPositiveInteger",
    "negativeInteger",
    "nonNegativeInteger",
    "positiveInteger",
  ]);
  if (int64.has(local)) {
    return opts.int64As === "bigint" ? "bigint" : opts.int64As;
  }
  if (big.has(local)) {
    return opts.bigIntegerAs;
  }
  // Safe 32-bit families → number
  const int32 = new Set(["int", "unsignedInt"]);
  const int16 = new Set(["short", "unsignedShort"]);
  const int8 = new Set(["byte", "unsignedByte"]);
  if (int32.has(local) || int16.has(local) || int8.has(local)) return "number";
  return "number";
}

/**
 * Determines the appropriate TypeScript type for XSD decimal types
 *
 * @param {string} local - Local name of the XSD type (e.g., "decimal")
 * @param {Required<PrimitiveOptions>} opts - Primitive mapping options
 * @returns {string} - Appropriate TypeScript type for the decimal type
 */
function decimalFamily(local: string, opts: Required<PrimitiveOptions>): string {
  // xs:decimal and derived decimals (if any) → configurable
  if (local === "decimal") return opts.decimalAs;
  return "number";
}

/**
 * Determines the appropriate TypeScript type for XSD date/time types
 *
 * @param {string} local - Local name of the XSD type (e.g., "date", "dateTime")
 * @param {Required<PrimitiveOptions>} opts - Primitive mapping options
 * @returns {string} - Appropriate TypeScript type for the date/time type
 */
function dateFamily(local: string, opts: Required<PrimitiveOptions>): string {
  // You can choose "Date", but generator won't parse at runtime; it's just type-level.
  const s = opts.dateAs;
  switch (local) {
    case "date":
    case "dateTime":
    case "time":
    case "gYear":
    case "gYearMonth":
    case "gMonth":
    case "gMonthDay":
    case "gDay":
    case "dateTimeStamp": // XSD 1.1
    case "duration":
    case "dayTimeDuration":   // XSD 1.1
    case "yearMonthDuration": // XSD 1.1
      return s;
    default:
      return "string";
  }
}

/**
 * Set of XSD types that map to string in TypeScript
 */
const STRING_LIKE = new Set([
  "string",
  "normalizedString",
  "token",
  "language",
  "Name",
  "NCName",
  "NMTOKEN", "NMTOKENS",
  "ID", "IDREF", "IDREFS",
  "ENTITY", "ENTITIES",
  "anyURI",
  "QName",
  "NOTATION",
  "hexBinary",
  "base64Binary", // could be "string" or a branded type
]);

/**
 * Maps an XSD QName to the corresponding TypeScript primitive type
 *
 * This function is the main entry point for determining the TypeScript type
 * corresponding to an XSD primitive type. It uses the local part of the QName
 * and the configured mapping options to return the correct TypeScript type.
 *
 * @param {string} xsdQName - The XSD QName to map (e.g., "xs:int")
 * @param {PrimitiveOptions} [options] - Optional custom mapping options
 * @returns {string} - The corresponding TypeScript primitive type
 */
export function xsdToTsPrimitive(xsdQName: string, options?: PrimitiveOptions): string {
  const opts = {...DEFAULTS, ...(options || {})};

  // Expect formats like "xs:int". Fall back to string if unknown.
  const m = /^([a-zA-Z0-9_]+:)?([A-Za-z0-9_]+)$/.exec(xsdQName);
  const local = m ? m[2] : xsdQName;

  if (STRING_LIKE.has(local)) return "string";
  if (local === "boolean") return "boolean";

  // Numerics
  if (
    local === "byte" || local === "unsignedByte" ||
    local === "short" || local === "unsignedShort" ||
    local === "int" || local === "unsignedInt" ||
    local === "long" || local === "unsignedLong" ||
    local === "integer" ||
    local === "nonNegativeInteger" || local === "positiveInteger" ||
    local === "nonPositiveInteger" || local === "negativeInteger"
  ) {
    return intFamily(local, opts);
  }
  if (local === "decimal") return decimalFamily(local, opts);
  if (local === "float" || local === "double") return "number";

  // Dates/times & durations
  if (
    local === "date" || local === "dateTime" || local === "time" ||
    local === "gYear" || local === "gYearMonth" || local === "gMonth" ||
    local === "gMonthDay" || local === "gDay" ||
    local === "dateTimeStamp" || local === "duration" ||
    local === "dayTimeDuration" || local === "yearMonthDuration"
  ) {
    return dateFamily(local, opts);
  }

  // anyType/anySimpleType → unknown (or 'any' if you prefer)
  if (local === "anyType" || local === "anySimpleType") return "unknown";

  // Default fallback
  return "string";
}
