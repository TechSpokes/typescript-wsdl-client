/**
 * OpenAPI Security Configuration
 *
 * This module handles security scheme generation for the OpenAPI specification.
 * It provides functionality to define authentication and authorization requirements
 * for the API, including:
 *
 * - Basic authentication
 * - Bearer token authentication
 * - API key authentication
 * - OAuth2 flows
 * - Custom security headers
 *
 * The module supports both global security requirements and operation-specific
 * security overrides through an external JSON configuration file.
 */
import fs from "node:fs";

/**
 * Authentication scheme types supported in the OpenAPI specification
 *
 * @property {"none"} string No authentication required
 * @property {"basic"} string HTTP Basic authentication
 * @property {"bearer"} string HTTP Bearer token authentication
 * @property {"apiKey"} string API key authentication
 * @property {"oauth2"} string OAuth 2.0 authentication
 */
export type AuthScheme = "none" | "basic" | "bearer" | "apiKey" | "oauth2";

/**
 * Security configuration schema for the OpenAPI generation
 *
 * @interface SecurityConfig
 * @property {Object} [global] - Global security settings applied to all operations by default
 * @property {AuthScheme} [global.scheme] - Default authentication scheme
 * @property {Object} [global.apiKey] - API key configuration (when scheme is "apiKey")
 * @property {Object} [global.bearer] - Bearer token configuration (when scheme is "bearer")
 * @property {Object} [global.basic] - Basic auth configuration (when scheme is "basic")
 * @property {Object} [global.oauth2] - OAuth2 configuration (when scheme is "oauth2")
 * @property {Array<Object>} [global.headers] - Global security headers
 * @property {Record<string, Object>} [overrides] - Operation-specific security overrides
 */
export type SecurityConfig = {
  global?: {
    scheme?: AuthScheme;
    apiKey?: { in: "header" | "query" | "cookie"; name: string };
    bearer?: { bearerFormat?: string };
    basic?: Record<string, never>;
    oauth2?: { flows: Record<string, any> };
    headers?: Array<{ name: string; required?: boolean; schema?: any }>;
  };
  overrides?: Record<string, {
    scheme?: AuthScheme;
    headers?: Array<{ name: string; required?: boolean; schema?: any }>
  }>;
};

/**
 * Built security components for OpenAPI generation
 *
 * @interface BuiltSecurity
 * @property {Record<string, any>} [securitySchemes] - Security schemes defined for the API
 * @property {Record<string, any>} headerParameters - Header parameters for security
 * @property {Record<string, any[]>} opSecurity - Operation security requirements
 * @property {Record<string, string[]>} opHeaderParameters - Operation-specific header parameters
 */
export type BuiltSecurity = {
  securitySchemes?: Record<string, any>;
  headerParameters: Record<string, any>; // key: canonical parameter name
  opSecurity: Record<string, any[] | undefined>; // opName -> security requirement array
  opHeaderParameters: Record<string, string[]>; // opName -> list of param component names
};

/**
 * Load security configuration from a JSON file
 *
 * @param {string} [filePath] - Path to the security configuration file
 * @returns {SecurityConfig|undefined} Parsed security configuration object or undefined if loading failed
 */
export function loadSecurityConfig(filePath?: string): SecurityConfig | undefined {
  if (!filePath) return undefined;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`⚠️ Failed to read security config '${filePath}': ${e instanceof Error ? e.message : String(e)}`);
    return undefined;
  }
}

/**
 * Generate a canonical parameter component name from a header name
 *
 * @param {string} headerName - Original header name
 * @returns {string} Canonicalized component name
 */
function makeParamComponentName(headerName: string): string {
  return headerName
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
    || "X_Header";
}

/**
 * Build security schemes and parameters for OpenAPI generation
 *
 * @param {SecurityConfig} [cfg] - Security configuration object
 * @returns {BuiltSecurity} Object containing built security schemes and parameters
 */
export function buildSecurity(cfg?: SecurityConfig): BuiltSecurity {
  const securitySchemes: Record<string, any> = {};
  const headerParameters: Record<string, any> = {};
  const opSecurity: Record<string, any[] | undefined> = {};
  const opHeaderParameters: Record<string, string[]> = {};

  if (!cfg || !cfg.global) {
    return {securitySchemes: undefined, headerParameters, opSecurity, opHeaderParameters};
  }

  const global = cfg.global;
  const schemeName = "defaultAuth";
  const scheme = global.scheme || "none";
  const hasGlobal = scheme !== "none";
  if (scheme !== "none") {
    switch (scheme) {
      case "basic":
        securitySchemes[schemeName] = {type: "http", scheme: "basic"};
        break;
      case "bearer":
        securitySchemes[schemeName] = {type: "http", scheme: "bearer", ...(global.bearer || {})};
        break;
      case "apiKey":
        securitySchemes[schemeName] = {type: "apiKey", ...(global.apiKey || {in: "header", name: "X-API-Key"})};
        break;
      case "oauth2":
        securitySchemes[schemeName] = {type: "oauth2", ...(global.oauth2 || {flows: {}})};
        break;
    }
  }

  // Global headers
  for (const h of global.headers || []) {
    const compName = makeParamComponentName(h.name);
    headerParameters[compName] = {
      name: h.name,
      in: "header",
      required: !!h.required,
      schema: h.schema || {type: "string"},
    };
  }

  // Default op security (inherit global scheme)
  // (If scheme is none we omit entirely)
  // Overrides can set scheme to none to remove security
  for (const [opName, override] of Object.entries(cfg.overrides || {})) {
    const oScheme = override.scheme ?? scheme;
    if (oScheme === "none") {
      opSecurity[opName] = undefined;
    } else if (oScheme === scheme) {
      opSecurity[opName] = hasGlobal ? [{[schemeName]: []}] : undefined;
    } else {
      // Different scheme per operation -> create ad-hoc component name
      const altName = `${schemeName}_${oScheme}`;
      if (!securitySchemes[altName]) {
        switch (oScheme) {
          case "basic":
            securitySchemes[altName] = {type: "http", scheme: "basic"};
            break;
          case "bearer":
            securitySchemes[altName] = {type: "http", scheme: "bearer"};
            break;
          case "apiKey":
            securitySchemes[altName] = {type: "apiKey", ...(global.apiKey || {in: "header", name: "X-API-Key"})};
            break;
          case "oauth2":
            securitySchemes[altName] = {type: "oauth2", ...(global.oauth2 || {flows: {}})};
            break;
        }
      }
      opSecurity[opName] = [{[altName]: []}];
    }

    // Per-op headers merge global + override specific headers
    const headers = [...(global.headers || []), ...(override.headers || [])];
    opHeaderParameters[opName] = headers.map(h => makeParamComponentName(h.name));
    for (const h of override.headers || []) {
      const compName = makeParamComponentName(h.name);
      if (!headerParameters[compName]) {
        headerParameters[compName] = {
          name: h.name,
          in: "header",
          required: !!h.required,
          schema: h.schema || {type: "string"},
        };
      }
    }
  }

  return {
    securitySchemes: Object.keys(securitySchemes).length ? securitySchemes : undefined,
    headerParameters,
    opSecurity,
    opHeaderParameters
  };
}
