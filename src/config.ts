import type { PrimitiveOptions } from "./xsd/primitives.js";

export type CompilerOptions = {
    choice?: "all-optional" | "union";
    dateAs?: "string" | "date";
    intAs?: "number" | "string";
    failOnUnresolved?: boolean;
    /** Attribute bag key for the runtime mapper (node-soap). */
    attributesKey?: string;
    /** Controls how XSD primitives are mapped to TypeScript. Safe defaults apply. */
    primitive?: PrimitiveOptions;
};

export const defaultOptions: CompilerOptions = {
    choice: "all-optional",
    dateAs: "string",
    intAs: "number",
    failOnUnresolved: false,
    attributesKey: "$attributes",
};
