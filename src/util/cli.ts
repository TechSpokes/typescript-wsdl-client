/**
 * Shared CLI Utilities
 *
 * This module provides common utilities for CLI argument parsing, validation, and path resolution.
 * It centralizes patterns that were previously duplicated across subcommands, improving
 * maintainability and consistency.
 */
import path from "node:path";
import fs from "node:fs";
import {WsdlCompilationError} from "./errors.js";


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
 * Standardized Console Logging Functions
 *
 * These functions provide consistent console output formatting across the codebase.
 * All messages follow a standard pattern:
 * - Errors: [ERROR] {message} (output to stderr)
 * - Warnings: [WARNING] {message} (output to stderr)
 * - Success: [SUCCESS] {message} (output to stdout)
 * - Info: {message} (output to stdout, no prefix for general logs)
 */

/**
 * Log an error message to stderr
 *
 * @param message - Error message to display
 */
export function error(message: string): void {
  console.error(`[ERROR] ${message}`);
}

/**
 * Log a warning message to stderr
 *
 * @param message - Warning message to display
 */
export function warn(message: string): void {
  console.warn(`[WARNING] ${message}`);
}

/**
 * Log a success message to stdout
 *
 * @param message - Success message to display
 */
export function success(message: string): void {
  console.log(`[SUCCESS] ${message}`);
}

/**
 * Log an informational message to stdout
 *
 * @param message - Info message to display (no prefix added)
 */
export function info(message: string): void {
  console.log(message);
}

/**
 * Handle CLI errors consistently
 *
 * Prints error message to stderr and exits with appropriate code.
 * This centralizes error handling for better consistency and testability.
 *
 * @param errorObj - Error object or string
 * @param exitCode - Process exit code (default: 1)
 */
export function handleCLIError(errorObj: unknown, exitCode: number = 1): never {
  if (errorObj instanceof WsdlCompilationError) {
    error(errorObj.toUserMessage());
  } else {
    const message = errorObj instanceof Error ? errorObj.message : String(errorObj);
    error(message);
  }
  process.exit(exitCode);
}

/**
 * Handle CLI errors consistently
 *
 *
 * @param result - Result from generateOpenAPI containing jsonPath and yamlPath
 */
export function reportOpenApiSuccess(result: {
  jsonPath?: string;
  yamlPath?: string;
}): void {
  const generatedFiles = [result.jsonPath, result.yamlPath].filter(Boolean);
  if (generatedFiles.length > 0) {
    const outputPath =
      generatedFiles.length === 1
        ? path.resolve(generatedFiles[0]!)
        : path.resolve(path.dirname(generatedFiles[0]!));
    success(`Generated OpenAPI specification in ${outputPath}`);
  }
}

/**
 * Report compilation statistics for user visibility
 *
 * @param wsdlCatalog - Loaded WSDL catalog with schemas
 * @param compiled - Compiled catalog with types and operations
 */
export function reportCompilationStats(
  wsdlCatalog: { schemas: any[] },
  compiled: { types: any[]; operations: any[] }
): void {
  info(`Schemas discovered: ${wsdlCatalog.schemas.length}`);
  info(`Compiled types: ${compiled.types.length}`);
  info(`Operations: ${compiled.operations.length}`);
}

/**
 * Emit TypeScript client artifacts (client.ts, types.ts, utils.ts, operations.ts)
 *
 * Note: catalog.json is NOT emitted by this function - it should be handled
 * separately by the caller using generateCatalog() with explicit --catalog-file path.
 *
 * @param outDir - Output directory for client artifacts
 * @param compiled - Compiled catalog
 * @param generateClient - Client generator function
 * @param generateTypes - Types generator function
 * @param generateUtils - Utils generator function
 * @param generateOperations - Operations interface generator function
 */
export function emitClientArtifacts(
  outDir: string,
  compiled: any,
  generateClient: (path: string, compiled: any) => void,
  generateTypes: (path: string, compiled: any) => void,
  generateUtils: (path: string, compiled: any) => void,
  generateOperations?: (path: string, compiled: any) => void
): void {
  fs.mkdirSync(outDir, {recursive: true});

  generateClient(path.join(outDir, "client.ts"), compiled);
  generateTypes(path.join(outDir, "types.ts"), compiled);
  generateUtils(path.join(outDir, "utils.ts"), compiled);
  if (generateOperations) {
    generateOperations(path.join(outDir, "operations.ts"), compiled);
  }

  success(`Generated TypeScript client in ${outDir}`);
}

/**
 * Validate gateway generation requirements
 *
 * @param gatewayDir - Gateway output directory (if provided)
 * @param openapiFile - OpenAPI output path (if provided)
 * @param gatewayServiceName - Gateway service name (if provided)
 * @param gatewayVersionPrefix - Gateway version prefix (if provided)
 * @throws Error if requirements are not met
 */
export function validateGatewayRequirements(
  gatewayDir: string | undefined,
  openapiFile: string | undefined,
  gatewayServiceName: string | undefined,
  gatewayVersionPrefix: string | undefined
): void {
  if (!gatewayDir) return; // Gateway not requested, no validation needed

  if (!openapiFile) {
    handleCLIError("Gateway generation requires OpenAPI generation. Provide --openapi-file.");
  }

  if (!gatewayServiceName || !gatewayVersionPrefix) {
    handleCLIError("When --gateway-dir is specified, both --gateway-service-name and --gateway-version-prefix must be provided.");
  }
}
