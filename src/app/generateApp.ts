// noinspection HttpUrlsUsage

/**
 * Fastify App Scaffold Generator
 *
 * This module generates a runnable Fastify application that imports and uses
 * the generated gateway plugin and SOAP client. The app serves the OpenAPI spec,
 * health checks, and all gateway routes.
 *
 * The generated scaffold is intended as a one-time starting point. Developers
 * should customize it freely after generation. Use --force-init to overwrite
 * existing scaffold files.
 *
 * Core capabilities:
 * - Generates server.ts with Fastify setup and plugin registration
 * - Generates config.ts with environment-based configuration
 * - Generates package.json with required dependencies
 * - Generates tsconfig.json with NodeNext/ES2022 settings
 * - Generates .env.example with required/optional environment variables
 * - Generates README.md with instructions for running the app
 * - Optionally copies OpenAPI spec into app directory
 * - Validates required inputs (client-dir, gateway-dir, openapi-file, catalog-file)
 * - Skip-if-exists protection for scaffold files (override with force option)
 */
import fs from "node:fs";
import path from "node:path";
import {deriveClientName} from "../util/tools.js";
import {info, success} from "../util/cli.js";
import {computeRelativeImport, getImportExtension} from "../util/imports.js";

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
 * @property {boolean} [force] - Overwrite existing scaffold files (default: false)
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
  force?: boolean;
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
  return getImportExtension(imports);
}

/**
 * Returns the file extension for scaffold app files (server, config).
 * Always .ts — the scaffold is TypeScript for full type safety.
 *
 * @returns {string} - File extension with leading dot
 */
function getAppFileExtension(): string {
  return ".ts";
}

// computeRelativeImport is now imported from ../util/imports.js

/**
 * Checks if a string is a URL (http:// or https://)
 */
function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

/**
 * Normalizes a file path to POSIX separators
 */
function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

/**
 * Resolves a WSDL source path relative to the app directory.
 * URLs are returned as-is. File paths are computed relative to appDir.
 *
 * @param {string} wsdlSource - Original WSDL source from catalog
 * @param {string} appDir - Resolved app output directory
 * @returns {string} - WSDL source suitable for use from the app directory
 */
function resolveWsdlSourceForApp(wsdlSource: string, appDir: string): string {
  if (isUrl(wsdlSource)) return wsdlSource;
  return toPosix(path.relative(appDir, path.resolve(wsdlSource)));
}

/**
 * Checks whether a scaffold file should be written.
 * Returns true if the file does not exist or force is enabled.
 * Logs an info message and returns false if the file exists and force is disabled.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {boolean} force - Whether to overwrite existing files
 * @returns {boolean} - Whether the file should be written
 */
function shouldWriteScaffoldFile(filePath: string, force: boolean): boolean {
  if (!fs.existsSync(filePath)) return true;
  if (force) return true;
  info(`Skipping ${path.basename(filePath)} (already exists, use --force-init to overwrite)`);
  return false;
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
 * @param {string} clientClassName - Derived client class name
 * @param {boolean} force - Whether to overwrite existing files
 */
function generateServerFile(
  appDir: string,
  opts: GenerateAppOptions,
  clientClassName: string,
  force: boolean
): void {
  const imports = opts.imports || "js";
  const ext = getAppFileExtension();
  const filePath = path.join(appDir, `server${ext}`);

  if (!shouldWriteScaffoldFile(filePath, force)) return;

  const configImport = computeRelativeImport(appDir, path.join(appDir, "config"), imports);
  const gatewayPluginImport = computeRelativeImport(appDir, path.join(opts.gatewayDir, "plugin"), imports);
  const clientImport = computeRelativeImport(appDir, path.join(opts.clientDir, "client"), imports);

  // For OpenAPI serving, we need to read and parse the file at startup in ESM mode
  const openapiServeLogic = opts.openapiMode === "copy"
    ? `
  // Read and parse OpenAPI spec at startup
  const openapiSpecPath = path.join(__dirname, "openapi.json");
  const openapiSpec = JSON.parse(fs.readFileSync(openapiSpecPath, "utf-8"));

  // Override OpenAPI server URL at runtime if configured
  if (config.openapiServerUrl) {
    openapiSpec.servers = [{ url: config.openapiServerUrl }];
  }

  // Serve OpenAPI specification
  fastify.get("/openapi.json", async () => {
    return openapiSpec;
  });`
    : `
  // Serve OpenAPI specification from original file
  const openapiSpecPath = path.resolve(__dirname, "${computeRelativeImport(appDir, opts.openapiFile, "bare")}");
  const openapiSpec = JSON.parse(fs.readFileSync(openapiSpecPath, "utf-8"));

  // Override OpenAPI server URL at runtime if configured
  if (config.openapiServerUrl) {
    openapiSpec.servers = [{ url: config.openapiServerUrl }];
  }

  fastify.get("/openapi.json", async () => {
    return openapiSpec;
  });`;

  const content = `/**
 * Fastify Application
 *
 * This file bootstraps a Fastify server that:
 * - Loads configuration from environment variables
 * - Instantiates the SOAP client
 * - Registers the gateway plugin
 * - Serves the OpenAPI specification
 * - Provides health check endpoint
 *
 * Scaffolded by wsdl-tsc. Customize freely.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import Fastify from "fastify";
import { loadConfig } from "${configImport}";
import gatewayPlugin from "${gatewayPluginImport}";
import { ${clientClassName} } from "${clientImport}";

// ES module dirname/filename helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
${openapiServeLogic}

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

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Generates config.ts file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {string|undefined} defaultWsdlSource - Default WSDL source from catalog
 * @param {boolean} force - Whether to overwrite existing files
 */
function generateConfigFile(
  appDir: string,
  opts: GenerateAppOptions,
  defaultWsdlSource: string | undefined,
  force: boolean
): void {
  const ext = getAppFileExtension();
  const filePath = path.join(appDir, `config${ext}`);

  if (!shouldWriteScaffoldFile(filePath, force)) return;

  const defaultHost = opts.host || "127.0.0.1";
  const defaultPort = opts.port || 3000;
  const defaultPrefix = opts.prefix || "";
  const defaultLogger = opts.logger !== false;

  // Resolve WSDL source relative to app directory
  const resolvedWsdlSource = defaultWsdlSource
    ? resolveWsdlSourceForApp(defaultWsdlSource, appDir)
    : undefined;
  // For URL sources, use as fallback default. For file sources, require explicit WSDL_SOURCE.
  const wsdlIsUrl = resolvedWsdlSource && isUrl(resolvedWsdlSource);
  const wsdlFallback = wsdlIsUrl ? ` || "${resolvedWsdlSource}"` : "";

  const content = `/**
 * Application Configuration
 *
 * Loads configuration from environment variables with sensible defaults.
 * Configuration precedence:
 * 1. Environment variables (runtime overrides)
 * 2. Hard defaults (defined in this file)
 *
 * Scaffolded by wsdl-tsc. Customize freely.
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
  openapiServerUrl: string;
}

/**
 * Loads configuration from environment variables
 *
 * @returns {AppConfig} - Application configuration
 * @throws {Error} If required configuration is missing
 */
export function loadConfig(): AppConfig {
  // WSDL source: required from env${wsdlIsUrl ? " or URL default" : ""}
  const wsdlSource = process.env.WSDL_SOURCE${wsdlFallback};
  if (!wsdlSource) {
    throw new Error("WSDL_SOURCE environment variable is required${resolvedWsdlSource && !wsdlIsUrl ? ` (hint: ${resolvedWsdlSource})` : ""}");
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

  // OpenAPI server URL override (replaces servers in OpenAPI spec at runtime)
  const openapiServerUrl = process.env.OPENAPI_SERVER_URL || "";

  return {
    wsdlSource,
    host,
    port,
    prefix,
    logger,
    openapiServerUrl,
  };
}
`;

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Generates .env.example file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {string|undefined} defaultWsdlSource - Default WSDL source from catalog
 * @param {boolean} force - Whether to overwrite existing files
 */
function generateEnvExample(
  appDir: string,
  opts: GenerateAppOptions,
  defaultWsdlSource: string | undefined,
  force: boolean
): void {
  const filePath = path.join(appDir, ".env.example");

  if (!shouldWriteScaffoldFile(filePath, force)) return;

  const defaultHost = opts.host || "127.0.0.1";
  const defaultPort = opts.port || 3000;
  const defaultPrefix = opts.prefix || "";
  const defaultLogger = opts.logger !== false;

  // Resolve WSDL source relative to app directory
  const resolvedWsdlSource = defaultWsdlSource
    ? resolveWsdlSourceForApp(defaultWsdlSource, appDir)
    : undefined;
  const wsdlIsUrl = resolvedWsdlSource && isUrl(resolvedWsdlSource);

  let wsdlSection: string;
  if (wsdlIsUrl) {
    // URL source: show as commented default (it's the fallback in config.ts)
    wsdlSection = `# WSDL source URL (default: ${resolvedWsdlSource})
#WSDL_SOURCE=${resolvedWsdlSource}`;
  } else if (resolvedWsdlSource) {
    // File source: require explicit setting, show hint
    wsdlSection = `# WSDL source (required — set to URL or file path)
# Generation-time path: ${resolvedWsdlSource}
WSDL_SOURCE=`;
  } else {
    wsdlSection = `# WSDL source (required — set to URL or file path)
WSDL_SOURCE=`;
  }

  const content = `# Fastify Application Environment Variables
#
# Copy this file to .env and customize as needed.

${wsdlSection}

# Server host (default: ${defaultHost})
HOST=${defaultHost}

# Server port (default: ${defaultPort})
PORT=${defaultPort}

# Route prefix (default: empty)
PREFIX=${defaultPrefix}

# Enable Fastify logger (default: ${defaultLogger})
LOGGER=${defaultLogger}

# Override OpenAPI spec server URL at runtime (default: use generation-time value)
#OPENAPI_SERVER_URL=http://localhost:${defaultPort}

# Optional: SOAP security settings (configure based on your client requirements)
# SOAP_USERNAME=
# SOAP_PASSWORD=
# SOAP_ENDPOINT=
`;

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Generates package.json file (skipped if already exists)
 *
 * @param {string} appDir - App output directory
 * @param {boolean} force - Whether to overwrite existing files
 */
function generatePackageJson(appDir: string, force: boolean): void {
  const filePath = path.join(appDir, "package.json");

  if (!shouldWriteScaffoldFile(filePath, force)) return;

  const pkg = {
    name: "wsdl-gateway-app",
    version: "0.0.1",
    private: true,
    type: "module",
    scripts: {
      start: "tsx server.ts",
      dev: "tsx watch server.ts",
    },
    dependencies: {
      fastify: "^5.7.4",
      "fastify-plugin": "^5.1.0",
      soap: "^1.6.5",
    },
    devDependencies: {
      tsx: "^4.21.0",
      typescript: "^5.9.3",
    },
  };

  fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

/**
 * Generates tsconfig.json file (skipped if already exists)
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {boolean} force - Whether to overwrite existing files
 */
function generateTsConfig(appDir: string, opts: GenerateAppOptions, force: boolean): void {
  const filePath = path.join(appDir, "tsconfig.json");

  if (!shouldWriteScaffoldFile(filePath, force)) return;

  // Compute include paths relative to app directory
  const clientInclude = toPosix(path.relative(appDir, opts.clientDir)) + "/**/*.ts";
  const gatewayInclude = toPosix(path.relative(appDir, opts.gatewayDir)) + "/**/*.ts";

  const tsconfig = {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      outDir: "dist",
      rootDir: ".",
    },
    include: [
      "*.ts",
      clientInclude,
      gatewayInclude,
    ],
  };

  fs.writeFileSync(filePath, JSON.stringify(tsconfig, null, 2) + "\n", "utf-8");
}

/**
 * Generates README.md file
 *
 * @param {string} appDir - App output directory
 * @param {GenerateAppOptions} opts - App generation options
 * @param {boolean} force - Whether to overwrite existing files
 */
function generateReadme(appDir: string, opts: GenerateAppOptions, force: boolean): void {
  const filePath = path.join(appDir, "README.md");

  if (!shouldWriteScaffoldFile(filePath, force)) return;

  const content = `# Generated Fastify Application

This application was scaffolded by \`wsdl-tsc\`. Customize freely.

## Quick Start

\`\`\`bash
npm install
cp .env.example .env
# Edit .env — set WSDL_SOURCE to your WSDL URL or file path
npm start
\`\`\`

## Structure

- \`server.ts\` - Main application entry point
- \`config.ts\` - Configuration loader (environment-based)
- \`package.json\` - Dependencies and scripts
- \`tsconfig.json\` - TypeScript configuration
- \`.env.example\` - Example environment configuration
- \`openapi.json\` - OpenAPI specification${opts.openapiMode === "copy" ? " (copied)" : " (referenced)"}

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/health\` | GET | Health check — returns \`{ "ok": true }\` |
| \`/openapi.json\` | GET | OpenAPI 3.1 specification |
| All SOAP operations | POST | REST-to-SOAP gateway routes (see openapi.json) |

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| \`WSDL_SOURCE\` | (see .env.example) | WSDL URL or local file path (required) |
| \`HOST\` | ${opts.host || "127.0.0.1"} | Server bind address |
| \`PORT\` | ${opts.port || 3000} | Server listen port |
| \`PREFIX\` | (empty) | Route prefix |
| \`LOGGER\` | ${opts.logger !== false} | Enable Fastify logger |
| \`OPENAPI_SERVER_URL\` | (empty) | Override OpenAPI spec server URL at runtime |

## Development

\`\`\`bash
npm run dev          # Start with file watching
curl localhost:3000/health
curl localhost:3000/openapi.json
\`\`\`

## Generated By

[@techspokes/typescript-wsdl-client](https://github.com/TechSpokes/typescript-wsdl-client)
`;

  fs.writeFileSync(filePath, content, "utf-8");
}

/**
 * Generates a runnable Fastify application scaffold
 *
 * This function orchestrates the complete app scaffold process:
 * 1. Validates all required inputs exist
 * 2. Reads catalog.json for metadata
 * 3. Creates app directory
 * 4. Generates server.ts with Fastify setup
 * 5. Generates config.ts with environment loading
 * 6. Generates package.json with dependencies
 * 7. Generates tsconfig.json with TypeScript settings
 * 8. Generates .env.example with configuration template
 * 9. Generates README.md with usage instructions
 * 10. Optionally copies OpenAPI spec into app directory
 *
 * Files that already exist are skipped unless force is true.
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

  const force = resolvedOpts.force ?? false;

  // Validate required files and directories
  validateRequiredFiles(resolvedOpts);

  // Read catalog for metadata
  const catalog = readCatalog(resolvedOpts.catalogFile);
  const clientClassName = deriveClientName(catalog);
  const defaultWsdlSource = getCatalogWsdlSource(catalog);

  // Create app directory
  fs.mkdirSync(resolvedOpts.appDir, {recursive: true});

  // Generate scaffold files (each checks for existing files unless force is set)
  generateServerFile(resolvedOpts.appDir, resolvedOpts, clientClassName, force);
  generateConfigFile(resolvedOpts.appDir, resolvedOpts, defaultWsdlSource, force);
  generatePackageJson(resolvedOpts.appDir, force);
  generateTsConfig(resolvedOpts.appDir, resolvedOpts, force);
  generateEnvExample(resolvedOpts.appDir, resolvedOpts, defaultWsdlSource, force);
  generateReadme(resolvedOpts.appDir, resolvedOpts, force);

  // Handle OpenAPI file
  const openapiMode = resolvedOpts.openapiMode || "copy";
  if (openapiMode === "copy") {
    const destPath = path.join(resolvedOpts.appDir, "openapi.json");
    if (shouldWriteScaffoldFile(destPath, force)) {
      const spec = JSON.parse(fs.readFileSync(resolvedOpts.openapiFile, "utf-8"));
      const host = resolvedOpts.host || "127.0.0.1";
      const port = resolvedOpts.port || 3000;
      const prefix = resolvedOpts.prefix || "";
      const urlHost = ["0.0.0.0", "127.0.0.1", "::", "::1"].includes(host) ? "localhost" : host;
      spec.servers = [{ url: `http://${urlHost}:${port}${prefix}` }];
      fs.writeFileSync(destPath, JSON.stringify(spec, null, 2) + "\n", "utf-8");
      success(`Copied OpenAPI spec to ${destPath}`);
    }
  }

  success(`Scaffolded Fastify app in ${resolvedOpts.appDir}`);
}
