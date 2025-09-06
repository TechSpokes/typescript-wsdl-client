import type {PrimitiveOptions} from "./xsd/primitives.js";

/**
 * Options to control WSDL-to-TypeScript compilation behavior.
 */
export type CompilerOptions = {
  /** Path/URL of the source WSDL (from --wsdl) */
  wsdl: string;
  /** Output directory (from --out) */
  out: string;
  /** Import-extension mode (from --imports) */
  imports: "js" | "ts" | "bare";
  /** Emit catalog.json file with complied catalog object */
  catalog: boolean;
  /** Low-level mapping of XSD primitives (from --int64-as, --bigint-as, etc.) */
  primitive: PrimitiveOptions;
  /** How to represent XML <choice> elements: as all-optional props or a discriminated union. */
  choice?: "all-optional" | "union";
  /** Emit errors if any type references cannot be resolved in the WSDL schema. */
  failOnUnresolved?: boolean;
  /** Attribute bag key for the runtime mapper (from --attributes-key). */
  attributesKey?: string;
  /** Override the generated client class name (from --client-name). */
  clientName?: string;
  /** Emit nillable elements as optional properties in types. */
  nillableAsOptional?: boolean
};

/**
 * Default compiler options. Users may override selectively.
 */
export const TYPESCRIPT_WSDL_CLIENT_DEFAULT_COMPLIER_OPTIONS: CompilerOptions = {
  wsdl: "",                       // no default, required via CLI
  out: "",                        // no default, required via CLI
  imports: "js",                  // CLI default
  catalog: true,                  // CLI default
  primitive: {                    // CLI defaults
    int64As: "string",
    bigIntegerAs: "string",
    decimalAs: "string",
    dateAs: "string",
  },
  choice: "all-optional",         // CLI default
  failOnUnresolved: false,        // CLI default
  attributesKey: "$attributes",   // CLI default
  clientName: undefined,          // no default
  nillableAsOptional: false,      // CLI default
};
