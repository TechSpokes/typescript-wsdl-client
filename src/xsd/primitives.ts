// Centralized XSD → TypeScript primitive mapping with safe defaults.
// Rationale:
// - 64-bit integers (long/unsignedLong) can overflow JS number → default to string
// - Arbitrary-precision decimal (money) may lose precision in JS number → default to string
// - Dates/times stay as string by default (no runtime Date parsing in a generator)

export type PrimitiveOptions = {
    int64As?: "string" | "number" | "bigint";    // default: "string"
    bigIntegerAs?: "string" | "number";          // default: "string" (e.g., xs:integer, positive/negative, non*Integer)
    decimalAs?: "string" | "number";             // default: "string"
    dateAs?: "string" | "Date";                  // default: "string"
};

const DEFAULTS: Required<PrimitiveOptions> = {
    int64As: "string",
    bigIntegerAs: "string",
    decimalAs: "string",
    dateAs: "string",
};

// Helper to choose ts type for integer families depending on magnitude
function intFamily(local: string, opts: Required<PrimitiveOptions>): string {
    // 64-bit or unbounded families → configurable
    const int64 = new Set(["long", "unsignedLong"]);
    const big   = new Set([
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
    const int8  = new Set(["byte", "unsignedByte"]);
    if (int32.has(local) || int16.has(local) || int8.has(local)) return "number";
    return "number";
}

function decimalFamily(local: string, opts: Required<PrimitiveOptions>): string {
    // xs:decimal and derived decimals (if any) → configurable
    if (local === "decimal") return opts.decimalAs;
    return "number";
}

function dateFamily(local: string, opts: Required<PrimitiveOptions>): string {
    // You can choose "Date", but generator won’t parse at runtime; it’s just type-level.
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

export function xsdToTsPrimitive(xsdQName: string, options?: PrimitiveOptions): string {
    const opts = { ...DEFAULTS, ...(options || {}) };
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
