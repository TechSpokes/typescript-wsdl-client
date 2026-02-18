/**
 * Builder Utilities for CLI Option Mapping
 *
 * This module provides helper functions to map CLI arguments to internal option structures,
 * reducing redundancy across different CLI subcommands.
 */
import type {CompilerOptions} from "../config.js";
import type {GenerateOpenAPIOptions} from "../openapi/generateOpenAPI.js";

/**
 * Build compiler options from parsed CLI arguments
 *
 * @param argv - Parsed yargs arguments containing compiler flags
 * @returns Partial compiler options ready for resolveCompilerOptions
 */
export function buildCompilerOptionsFromArgv(argv: any): Partial<CompilerOptions> {
  return {
    imports: argv["import-extensions"] as "js" | "ts" | "bare",
    catalog: argv.catalog as boolean,
    primitive: {
      int64As: argv["client-int64-as"],
      bigIntegerAs: argv["client-bigint-as"],
      decimalAs: argv["client-decimal-as"],
      dateAs: argv["client-date-as"],
    },
    choice: argv["client-choice-mode"],
    failOnUnresolved: argv["client-fail-on-unresolved"] as boolean,
    attributesKey: argv["client-attributes-key"] as string,
    clientName: argv["client-class-name"] as string | undefined,
    nillableAsOptional: argv["client-nillable-as-optional"] as boolean,
  };
}

/**
 * Build OpenAPI generation options from parsed CLI arguments
 *
 * @param argv - Parsed yargs arguments containing OpenAPI flags
 * @param format - Resolved format option
 * @param servers - Parsed server URLs (from parseServers)
 * @returns Partial OpenAPI options (excluding wsdl/catalogFile/compiledCatalog/outFile)
 */
export function buildOpenApiOptionsFromArgv(
  argv: any,
  format: "json" | "yaml" | "both" | undefined,
  servers: string[]
): Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog" | "outFile"> {
  return {
    basePath: argv["openapi-base-path"] as string | undefined,
    closedSchemas: argv["openapi-closed-schemas"] as boolean,
    defaultMethod: argv["openapi-default-method"] as string | undefined,
    envelopeNamespace: argv["openapi-envelope-namespace"] as string | undefined,
    errorNamespace: argv["openapi-error-namespace"] as string | undefined,
    format,
    opsFile: argv["openapi-ops-file"] as string | undefined,
    pathStyle: argv["openapi-path-style"],
    pruneUnusedSchemas: argv["openapi-prune-unused-schemas"] as boolean,
    securityConfigFile: argv["openapi-security-file"] as string | undefined,
    servers,
    skipValidate: false, // Always validate
    tagStyle: argv["openapi-tag-style"],
    tagsFile: argv["openapi-tags-file"] as string | undefined,
    title: argv["openapi-title"] as string | undefined,
    version: argv["openapi-version-tag"] as string | undefined,
    flattenArrayWrappers: argv["openapi-flatten-array-wrappers"] as boolean | undefined,
    asYaml: format === "yaml",
  };
}

