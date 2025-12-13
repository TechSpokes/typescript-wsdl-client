/**
 * Configuration Options for TypeScript WSDL Client Generator
 *
 * This module defines the configuration interface and default values for the WSDL-to-TypeScript
 * compilation process. It centralizes all compiler options that can be customized by users
 * through the CLI or programmatic API. These options control everything from output formatting
 * to type mapping strategies.
 *
 * The configuration follows a "safe defaults" philosophy, prioritizing correctness and
 * data integrity over convenience, while still allowing users to override when needed.
 */
import type {PrimitiveOptions} from "./xsd/primitives.js";

/**
 * Options to control WSDL-to-TypeScript compilation behavior.
 *
 * @interface CompilerOptions
 * @property {string} wsdl - Path/URL of the source WSDL (from --wsdl)
 * @property {string} out - Output directory (from --out)
 * @property {"js"|"ts"|"bare"} imports - Import-extension mode for generated imports (from --imports)
 * @property {boolean} catalog - Whether to emit catalog.json file with compiled catalog object
 * @property {PrimitiveOptions} primitive - Low-level mapping of XSD primitives
 * @property {"all-optional"|"union"} [choice] - How to represent XML <choice> elements
 * @property {boolean} [failOnUnresolved] - Whether to emit errors for unresolved type references
 * @property {string} [attributesKey] - Attribute bag key for the runtime mapper
 * @property {string} [clientName] - Override the generated client class name
 * @property {boolean} [nillableAsOptional] - Whether to emit nillable elements as optional properties
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

/**
 * Resolve full compiler options from partial input
 *
 * Merges defaults with user-provided options and required overrides.
 *
 * @param input - Partial compiler options from CLI or API
 * @param required - Required overrides (wsdl, out)
 * @returns Complete compiler options
 */
export function resolveCompilerOptions(
  input: Partial<CompilerOptions>,
  required: { wsdl: string; out: string }
): CompilerOptions {
  return {
    ...TYPESCRIPT_WSDL_CLIENT_DEFAULT_COMPLIER_OPTIONS,
    ...input,
    wsdl: required.wsdl,
    out: required.out,
  } as CompilerOptions;
}

