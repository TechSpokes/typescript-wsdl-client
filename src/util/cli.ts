/**
 * Shared CLI Utilities
 *
 * This module provides common utilities for CLI argument parsing, validation, and path resolution.
 * It centralizes patterns that were previously duplicated across subcommands, improving
 * maintainability and consistency.
 */
import path from "node:path";

/**
 * Check if all required arguments for structured path generation are provided
 *
 * The tool can generate outputs in a structured directory hierarchy using:
 * - --out: Base output directory
 * - --service: Service slug for namespacing
 * - --version: Version slug for versioning
 *
 * This creates paths like: {out}/services/{service}/{version}/ or {out}/openapi/{service}/{version}/
 *
 * @param argv - Parsed arguments object
 * @returns True if all three path construction flags are present and are strings
 */
export function hasRequiredPathArgs(argv: {
  out?: unknown;
  service?: unknown;
  version?: unknown;
}): boolean {
  return (
    typeof argv.out === "string" &&
    typeof argv.service === "string" &&
    typeof argv.version === "string"
  );
}

/**
 * Resolve client output directory from CLI arguments
 *
 * Uses explicit --client-out if provided, otherwise constructs path from
 * standard layout flags (--out, --service, --version).
 *
 * @param argv - Parsed arguments object
 * @returns Absolute path to client output directory
 * @throws Error if neither explicit path nor complete standard layout flags are provided
 */
export function resolveClientOut(argv: {
  out?: unknown;
  service?: unknown;
  version?: unknown;
  clientOut?: unknown;
}): string {
  // Explicit client-out wins when provided
  if (typeof argv.clientOut === "string" && argv.clientOut.trim()) {
    return path.resolve(argv.clientOut);
  }

  if (!hasRequiredPathArgs(argv)) {
    throw new Error(
      "Missing required flags for structured paths: --out, --service, --version. " +
        "Either provide them or explicitly pass --client-out for the client output directory."
    );
  }

  const out = String(argv.out);
  const service = String(argv.service);
  const version = String(argv.version);
  return path.resolve(out, "services", service, version);
}

/**
 * Resolve OpenAPI output base directory from CLI arguments
 *
 * Uses explicit --openapi-out if provided, otherwise constructs path from
 * standard layout flags (--out, --service, --version).
 *
 * @param argv - Parsed arguments object
 * @returns Absolute path to OpenAPI output base
 * @throws Error if neither explicit path nor complete standard layout flags are provided
 */
export function resolveOpenApiOutBase(argv: {
  out?: unknown;
  service?: unknown;
  version?: unknown;
  openapiOut?: unknown;
}): string {
  if (typeof argv.openapiOut === "string" && argv.openapiOut.trim()) {
    return path.resolve(argv.openapiOut);
  }

  if (!hasRequiredPathArgs(argv)) {
    throw new Error(
      "Missing required flags for structured paths: --out, --service, --version. " +
        "Either provide them or explicitly pass --openapi-out for the OpenAPI output base."
    );
  }

  const out = String(argv.out);
  const service = String(argv.service);
  const version = String(argv.version);
  return path.resolve(out, "openapi", service, version, "openapi");
}

/**
 * Parse comma-separated status codes from CLI argument
 *
 * @param value - Comma-separated string of status codes
 * @param flagName - Name of the CLI flag (for error messages)
 * @returns Array of validated integer status codes
 * @throws Error if any value is not a valid integer
 */
export function parseStatusCodes(value: string, flagName: string): number[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const n = Number(v);
      if (!Number.isInteger(n)) {
        throw new Error(
          `Invalid status code in ${flagName}: '${v}' (must be an integer)`
        );
      }
      return n;
    });
}

/**
 * Parse comma-separated server URLs from CLI argument
 *
 * @param value - Comma-separated string of server URLs
 * @returns Array of trimmed, non-empty server URLs
 */
export function parseServers(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Handle CLI errors consistently
 *
 * Prints error message to stderr and exits with appropriate code.
 * This centralizes error handling for better consistency and testability.
 *
 * @param error - Error object or string
 * @param exitCode - Process exit code (default: 1)
 */
export function handleCLIError(error: unknown, exitCode: number = 1): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(exitCode);
}

/**
 * Warn about deprecated CLI flags
 *
 * @param flag - Deprecated flag name
 * @param replacement - Recommended replacement (optional)
 */
export function warnDeprecated(flag: string, replacement?: string): void {
  const message = replacement
    ? `[deprecation] ${flag} is deprecated; use ${replacement}`
    : `[deprecation] ${flag} is deprecated`;
  console.warn(message);
}

/**
 * Resolve format option, handling deprecated --yaml flag
 *
 * @param argv - Parsed arguments with format and/or yaml flags
 * @returns Resolved format: "json" | "yaml" | "both" | undefined
 */
export function resolveFormatOption(argv: {
  format?: string;
  yaml?: boolean;
}): "json" | "yaml" | "both" | undefined {
  if (argv.yaml && !argv.format) {
    warnDeprecated("--yaml", "--format yaml or --format both");
    return "yaml";
  }
  return argv.format as "json" | "yaml" | "both" | undefined;
}

/**
 * Resolve validation flag, handling --no-validate override
 *
 * @param argv - Parsed arguments with validate and/or no-validate flags
 * @returns True if validation should be performed
 */
export function resolveValidateOption(argv: {
  validate?: boolean;
  "no-validate"?: boolean;
}): boolean {
  if (argv["no-validate"]) {
    return false;
  }
  return argv.validate !== false;
}

