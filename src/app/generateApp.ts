/**
 * Fastify App Generator
 *
 * This module generates a runnable Fastify application that imports and uses
 * the generated gateway plugin and SOAP client. The app serves the OpenAPI spec,
 * health checks, and all gateway routes.
 *
 * Core capabilities:
 * - Generates server.ts with Fastify setup and plugin registration
 * - Generates config.ts with environment-based configuration
 * - Generates .env.example with required/optional environment variables
 * - Generates README.md with instructions for running the app
 * - Optionally copies OpenAPI spec into app directory
 * - Validates required inputs (client-dir, gateway-dir, openapi-file, catalog-file)
 */
import fs from "node:fs";
import path from "node:path";
import {deriveClientName} from "../util/tools.js";
import {error, success} from "../util/cli.js";

/**
 * Options for app generation
 *
 * @interface GenerateAppOptions
 * @property {string} clientDir - Path to client directory (where client.ts is located)
 * @property {string} gatewayDir - Path to gateway directory (where plugin.ts is located)
 * @property {string} openapiFile - Path to OpenAPI spec file
 * @property {string} catalogFile - Path to catalog.json (required)
 * @property {string} appDir - Output directory for generated app
 * @property {"js"|"ts"|"bare"} [imports] - Import-extension mode (default: "js")
 * @property {string} [host] - Default server host (default: "127.0.0.1")
 * @property {number} [port] - Default server port (default: 3000)
 * @property {string} [prefix] - Route prefix (default: "")
 * @property {boolean} [logger] - Enable Fastify logger (default: true)
 * @property {"copy"|"reference"} [openapiMode] - How to handle OpenAPI file (default: "copy")
 */
export interface GenerateAppOptions {
  clientDir: string;
  gatewayDir: string;
  openapiFile: string;
  catalogFile: string;
  appDir: string;
  imports?: "js" | "ts" | "bare";
  host?: string;
  port?: number;
  prefix?: string;
  logger?: boolean;
  openapiMode?: "copy" | "reference";
}

/**
 * Validates that all required files and directories exist
 *
 * @param {GenerateAppOptions} opts - App generation options
 * @throws {Error} If any required file or directory doesn't exist
 */
function validateRequiredFiles(opts: GenerateAppOptions): void {
  const checks = [
    {path: opts.clientDir, type: "directory", label: "Client directory"},
    {path: opts.gatewayDir, type: "directory", label: "Gateway directory"},
    {path: opts.catalogFile, type: "file", label: "Catalog file"},
    {path: opts.openapiFile, type: "file", label: "OpenAPI file"},
  ];

  for (const check of checks) {
    const exists = fs.existsSync(check.path);
    if (!exists) {
      throw new Error(`${check.label} does not exist: ${check.path}`);
    }

    const stat = fs.statSync(check.path);
    if (check.type === "directory" && !stat.isDirectory()) {
      throw new Error(`${check.label} is not a directory: ${check.path}`);
    }
    if (check.type === "file" && !stat.isFile()) {
      throw new Error(`${check.label} is not a file: ${check.path}`);
    }
  }

  // Check for client entrypoint (try multiple extensions)
  const clientEntrypointFound = ["", ".ts", ".js"].some(ext => {
    return fs.existsSync(path.join(opts.clientDir, `client${ext}`));
  });
  if (!clientEntrypointFound) {
    throw new Error(`Client entrypoint does not exist in ${opts.clientDir} (tried client.ts, client.js, client)`);
  }

  // Check for gateway plugin entrypoint (try multiple extensions)
  const gatewayEntrypointFound = ["", ".ts", ".js"].some(ext => {
    return fs.existsSync(path.join(opts.gatewayDir, `plugin${ext}`));
  });
  if (!gatewayEntrypointFound) {
    throw new Error(`Gateway plugin entrypoint does not exist in ${opts.gatewayDir} (tried plugin.ts, plugin.js, plugin)`);
  }
}

/**
 * Returns the file extension for the import mode
 *
 * @param {string} imports - Import mode (js, ts, or bare)
 * @returns {string} - File extension with leading dot or empty string for bare
 */
function getExtension(imports: string): string {
  if (imports === "js") return ".js";
  if (imports === "ts") return ".ts";
  return "";
}

/**
 * Computes a relative import path from source to target
 *
 * @param {string} from - Source directory
 * @param {string} to - Target file or directory
 * @param {string} imports - Import mode (js, ts, or bare)
 * @returns {string} - Relative import specifier with proper extension
 */
function computeRelativeImport(from: string, to: string, imports: string): string {
  const rel = path.relative(from, to);
  // Normalize to POSIX separators
  const posix = rel.split(path.sep).join("/");
  // Ensure it starts with ./ or ../
  const prefixed = posix.startsWith(".") ? posix : `./${posix}`;
  
  // Apply import extension rules
  const ext = getExtension(imports);
  if (ext) {
    return prefixed + ext;
  }
  return prefixed;
}

/**
 * Reads and parses the catalog file
 *
 * @param {string} catalogPath - Path to catalog.json
 * @returns {any} - Parsed catalog object
 */
function readCatalog(catalogPath: string): any {
  try {
    const content = fs.readFileSync(catalogPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to read or parse catalog file: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Derives default WSDL source from catalog if available
 *
 * @param {any} catalog - Parsed catalog object
 * @returns {string|undefined} - WSDL source from catalog or undefined
 */
function getCatalogWsdlSource(catalog: any): string | undefined {
  return catalog?.options?.wsdl || catalog?.wsdlUri;
}

/**
 * Generates server.ts file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {any} catalog - Parsed catalog object
 * @param {string} clientClassName - Derived client class name
 */
function generateServerFile(
  appDir: string,
  opts: GenerateAppOptions,
  catalog: any,
  clientClassName: string
): void {
  const imports = opts.imports || "js";
  const ext = getExtension(imports);
  
  const configImport = computeRelativeImport(appDir, path.join(appDir, "config"), imports);
  const gatewayPluginImport = computeRelativeImport(appDir, path.join(opts.gatewayDir, "plugin"), imports);
  const clientImport = computeRelativeImport(appDir, path.join(opts.clientDir, "client"), imports);
  
  const openapiPath = opts.openapiMode === "copy" 
    ? "./openapi.json"
    : computeRelativeImport(appDir, opts.openapiFile, "bare");

  const content = `/**
 * Generated Fastify Application
 *
 * This file bootstraps a Fastify server that:
 * - Loads configuration from environment variables
 * - Instantiates the SOAP client
 * - Registers the gateway plugin
 * - Serves the OpenAPI specification
 * - Provides health check endpoint
 *
 * Auto-generated - do not edit manually.
 */
import Fastify from "fastify";
import { loadConfig } from "${configImport}";
import gatewayPlugin from "${gatewayPluginImport}";
import { ${clientClassName} } from "${clientImport}";

/**
 * Main application entry point
 */
async function main() {
  // Load configuration from environment
  const config = loadConfig();

  // Create Fastify instance
  const fastify = Fastify({
    logger: config.logger,
  });

  // Instantiate SOAP client
  const client = new ${clientClassName}({
    source: config.wsdlSource,
  });

  // Register gateway plugin
  await fastify.register(gatewayPlugin, {
    client,
    prefix: config.prefix,
  });

  // Health check endpoint
  fastify.get("/health", async () => {
    return { ok: true };
  });

  // Serve OpenAPI specification
  fastify.get("/openapi.json", async () => {
    return fastify.sendFile ? await fastify.sendFile("${openapiPath}") : require("${openapiPath}");
  });

  // Start server
  try {
    await fastify.listen({
      host: config.host,
      port: config.port,
    });
    fastify.log.info(\`Server listening on http://\${config.host}:\${config.port}\`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("\\nReceived SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\\nReceived SIGTERM, shutting down gracefully...");
  process.exit(0);
});

// Run the application
main().catch((err) => {
  console.error("Failed to start application:", err);
  process.exit(1);
});
`;

  fs.writeFileSync(path.join(appDir, `server${ext}`), content, "utf-8");
}

/**
 * Generates config.ts file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {string|undefined} defaultWsdlSource - Default WSDL source from catalog
 */
function generateConfigFile(
  appDir: string,
  opts: GenerateAppOptions,
  defaultWsdlSource: string | undefined
): void {
  const imports = opts.imports || "js";
  const ext = getExtension(imports);
  
  const defaultHost = opts.host || "127.0.0.1";
  const defaultPort = opts.port || 3000;
  const defaultPrefix = opts.prefix || "";
  const defaultLogger = opts.logger !== false;

  const content = `/**
 * Application Configuration
 *
 * Loads configuration from environment variables with sensible defaults.
 * Configuration precedence:
 * 1. Environment variables (runtime overrides)
 * 2. Catalog defaults (generation-time recorded values)
 * 3. Hard defaults (defined in this file)
 *
 * Auto-generated - do not edit manually.
 */

/**
 * Application configuration interface
 */
export interface AppConfig {
  wsdlSource: string;
  host: string;
  port: number;
  prefix: string;
  logger: boolean;
}

/**
 * Loads configuration from environment variables
 *
 * @returns {AppConfig} - Application configuration
 * @throws {Error} If required configuration is missing
 */
export function loadConfig(): AppConfig {
  // WSDL source: required from env or catalog default
  const wsdlSource = process.env.WSDL_SOURCE${defaultWsdlSource ? ` || "${defaultWsdlSource}"` : ""};
  if (!wsdlSource) {
    throw new Error("WSDL_SOURCE environment variable is required");
  }

  // Host: default to ${defaultHost}
  const host = process.env.HOST || "${defaultHost}";

  // Port: default to ${defaultPort}
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : ${defaultPort};
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(\`Invalid PORT value: \${process.env.PORT}\`);
  }

  // Prefix: default to empty string
  const prefix = process.env.PREFIX || "${defaultPrefix}";

  // Logger: default to ${defaultLogger}
  const logger = process.env.LOGGER ? process.env.LOGGER === "true" : ${defaultLogger};

  return {
    wsdlSource,
    host,
    port,
    prefix,
    logger,
  };
}
`;

  fs.writeFileSync(path.join(appDir, `config${ext}`), content, "utf-8");
}

/**
 * Generates .env.example file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {string|undefined} defaultWsdlSource - Default WSDL source from catalog
 */
function generateEnvExample(
  appDir: string,
  opts: GenerateAppOptions,
  defaultWsdlSource: string | undefined
): void {
  const defaultHost = opts.host || "127.0.0.1";
  const defaultPort = opts.port || 3000;
  const defaultPrefix = opts.prefix || "";
  const defaultLogger = opts.logger !== false;

  const content = `# Generated Fastify Application Environment Variables
#
# Copy this file to .env and customize as needed.
# Configuration precedence:
# 1. Environment variables (runtime overrides)
# 2. Catalog defaults (generation-time recorded values)
# 3. Hard defaults (see config file)

# WSDL source (required unless provided in catalog)
${defaultWsdlSource ? `# Default from catalog: ${defaultWsdlSource}` : "# Required: specify the WSDL URL or local file path"}
${defaultWsdlSource ? `#WSDL_SOURCE=${defaultWsdlSource}` : `WSDL_SOURCE=`}

# Server host (default: ${defaultHost})
HOST=${defaultHost}

# Server port (default: ${defaultPort})
PORT=${defaultPort}

# Route prefix (default: empty)
PREFIX=${defaultPrefix}

# Enable Fastify logger (default: ${defaultLogger})
LOGGER=${defaultLogger}

# Optional: SOAP security settings (configure based on your client requirements)
# SOAP_USERNAME=
# SOAP_PASSWORD=
# SOAP_ENDPOINT=
`;

  fs.writeFileSync(path.join(appDir, ".env.example"), content, "utf-8");
}

/**
 * Generates README.md file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 */
function generateReadme(appDir: string, opts: GenerateAppOptions): void {
  const imports = opts.imports || "js";
  const ext = getExtension(imports);
  
  const runCommand = ext === ".ts" 
    ? "npx tsx server.ts"
    : "node server.js";

  const content = `# Generated Fastify Application

This application was auto-generated by \`wsdl-tsc app\`.

## Overview

This Fastify application provides a REST gateway to a SOAP service, automatically bridging between REST endpoints and SOAP operations.

## Structure

- \`server${ext}\` - Main application entry point
- \`config${ext}\` - Configuration loader (environment-based)
- \`.env.example\` - Example environment configuration
- \`openapi.json\` - OpenAPI specification${opts.openapiMode === "copy" ? " (copied)" : " (referenced)"}

## Prerequisites

- Node.js >= 20.0.0
- Dependencies installed (\`npm install\`)

## Quick Start

1. **Copy environment template**:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. **Configure environment**:
   Edit \`.env\` and set required variables (especially \`WSDL_SOURCE\` if not provided via catalog).

3. **Run the server**:
   \`\`\`bash
   ${runCommand}
   \`\`\`

## Endpoints

### Health Check
\`\`\`
GET /health
\`\`\`
Returns: \`{ ok: true }\`

### OpenAPI Specification
\`\`\`
GET /openapi.json
\`\`\`
Returns: OpenAPI 3.1 specification document

### Gateway Routes
All SOAP operations are exposed as REST endpoints. See \`openapi.json\` for complete API documentation.

## Configuration

Configuration is loaded from environment variables with the following precedence:

1. Environment variables (runtime overrides)
2. Catalog defaults (from generation-time)
3. Hard defaults (in config file)

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| \`WSDL_SOURCE\` | (from catalog) | WSDL URL or local file path (required) |
| \`HOST\` | ${opts.host || "127.0.0.1"} | Server bind address |
| \`PORT\` | ${opts.port || 3000} | Server listen port |
| \`PREFIX\` | ${opts.prefix || "(empty)"} | Route prefix |
| \`LOGGER\` | ${opts.logger !== false} | Enable Fastify logger |

## Development

### Running with watch mode
\`\`\`bash
npx tsx watch server${ext}
\`\`\`

### Testing endpoints
\`\`\`bash
# Health check
curl http://localhost:3000/health

# OpenAPI spec
curl http://localhost:3000/openapi.json
\`\`\`

## Troubleshooting

### WSDL_SOURCE missing
If you see "WSDL_SOURCE environment variable is required", set it in your \`.env\` file or export it:
\`\`\`bash
export WSDL_SOURCE=path/to/service.wsdl
${runCommand}
\`\`\`

### Port already in use
Change the \`PORT\` in your \`.env\` file or:
\`\`\`bash
PORT=8080 ${runCommand}
\`\`\`

## Notes

- This app uses the generated client from: \`${opts.clientDir}\`
- Gateway plugin from: \`${opts.gatewayDir}\`
- OpenAPI spec from: \`${opts.openapiFile}\`

## Generated By

- Tool: [@techspokes/typescript-wsdl-client](https://github.com/TechSpokes/typescript-wsdl-client)
- Command: \`wsdl-tsc app\`
`;

  fs.writeFileSync(path.join(appDir, "README.md"), content, "utf-8");
}

/**
 * Generates a runnable Fastify application
 *
 * This function orchestrates the complete app generation process:
 * 1. Validates all required inputs exist
 * 2. Reads catalog.json for metadata
 * 3. Creates app directory
 * 4. Generates server.ts with Fastify setup
 * 5. Generates config.ts with environment loading
 * 6. Generates .env.example with configuration template
 * 7. Generates README.md with usage instructions
 * 8. Optionally copies OpenAPI spec into app directory
 *
 * @param {GenerateAppOptions} opts - App generation options
 * @returns {Promise<void>}
 * @throws {Error} If validation fails or required files are missing
 */
export async function generateApp(opts: GenerateAppOptions): Promise<void> {
  // Resolve all paths to absolute
  const resolvedOpts: GenerateAppOptions = {
    ...opts,
    clientDir: path.resolve(opts.clientDir),
    gatewayDir: path.resolve(opts.gatewayDir),
    openapiFile: path.resolve(opts.openapiFile),
    catalogFile: path.resolve(opts.catalogFile),
    appDir: path.resolve(opts.appDir),
  };

  // Validate required files and directories
  validateRequiredFiles(resolvedOpts);

  // Read catalog for metadata
  const catalog = readCatalog(resolvedOpts.catalogFile);
  const clientClassName = deriveClientName(catalog);
  const defaultWsdlSource = getCatalogWsdlSource(catalog);

  // Create app directory
  fs.mkdirSync(resolvedOpts.appDir, {recursive: true});

  // Generate app files
  generateServerFile(resolvedOpts.appDir, resolvedOpts, catalog, clientClassName);
  generateConfigFile(resolvedOpts.appDir, resolvedOpts, defaultWsdlSource);
  generateEnvExample(resolvedOpts.appDir, resolvedOpts, defaultWsdlSource);
  generateReadme(resolvedOpts.appDir, resolvedOpts);

  // Handle OpenAPI file
  const openapiMode = resolvedOpts.openapiMode || "copy";
  if (openapiMode === "copy") {
    const destPath = path.join(resolvedOpts.appDir, "openapi.json");
    fs.copyFileSync(resolvedOpts.openapiFile, destPath);
    success(`Copied OpenAPI spec to ${destPath}`);
  }

  success(`Generated runnable Fastify app in ${resolvedOpts.appDir}`);
}
