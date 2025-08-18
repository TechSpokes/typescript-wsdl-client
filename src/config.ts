import type { PrimitiveOptions } from "./xsd/primitives.js";

/**
 * Options to control WSDL-to-TypeScript compilation behavior.
 */
export type CompilerOptions = {
    /**
     * How to represent XML <choice> elements: as all-optional properties or a discriminated union.
     */
    choice?: "all-optional" | "union";
    /**
     * Legacy flag: map all date/time/duration types to string or Date. Superceded by primitive.dateAs if set.
     */
    dateAs?: "string" | "date";
    /**
     * Legacy flag: shorthand for int64As and bigIntegerAs. Maps integer types to number or string.
     */
    intAs?: "number" | "string";
    /**
     * Emit errors if any type references cannot be resolved in the WSDL schema.
     */
    failOnUnresolved?: boolean;
    /**
     * Attribute bag key for the runtime mapper (node-soap).
     */
    attributesKey?: string;
    /**
     * Optional override for the generated client class name.
     * If provided, the emitter will export this exact class name.
     */
    clientName?: string;
    /**
     * Controls low-level mapping of XSD primitives to TypeScript types. Safe defaults are provided.
     */
    primitive?: PrimitiveOptions;
};

/**
 * Default compiler options. Users may override selectively.
 */
export const defaultOptions: CompilerOptions = {
    choice: "all-optional",
    dateAs: "string",
    intAs: "number",
    failOnUnresolved: false,
    attributesKey: "$attributes",
};
