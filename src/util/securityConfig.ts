import fs from "node:fs";
import {trimRepeatedEdgeChar} from "./tools.js";

export type GatewayAuthScheme = "none" | "basic" | "bearer" | "apiKey" | "oauth2" | "mutualTLS" | "openIdConnect";

export type SecurityHeaderConfig = {
  name: string;
  required?: boolean;
  schema?: any;
};

export type GatewaySecurityGlobal = {
  scheme?: GatewayAuthScheme;
  apiKey?: {in: "header" | "query" | "cookie"; name: string};
  bearer?: {bearerFormat?: string};
  basic?: Record<string, never>;
  oauth2?: {flows: Record<string, any>};
  openIdConnect?: {openIdConnectUrl: string};
  mutualTLS?: {description?: string};
  headers?: SecurityHeaderConfig[];
};

export type GatewaySecurityOperation = {
  scheme?: GatewayAuthScheme;
  headers?: SecurityHeaderConfig[];
};

export type UpstreamSecurityConfig = {
  profile?:
    | "none"
    | "basic"
    | "bearer"
    | "ws-security-username-token"
    | "client-ssl"
    | "client-ssl-pfx"
    | "x509"
    | "ntlm"
    | "custom";
  usernameEnv?: string;
  passwordEnv?: string;
  tokenEnv?: string;
  domainEnv?: string;
  workstationEnv?: string;
  keyFileEnv?: string;
  certFileEnv?: string;
  caFileEnv?: string;
  pfxFileEnv?: string;
  passphraseEnv?: string;
  endpointEnv?: string;
  wsdlHeaders?: Record<string, string>;
  wsdlHeaderEnv?: Record<string, string>;
  requestHeaders?: Record<string, string>;
  requestHeaderEnv?: Record<string, string>;
  wsSecurity?: {
    passwordType?: "PasswordText" | "PasswordDigest";
    hasTimeStamp?: boolean;
    hasTokenCreated?: boolean;
    hasNonce?: boolean;
    mustUnderstand?: boolean;
    actor?: string;
  };
};

export type SecurityConfig = {
  gateway?: {
    global?: GatewaySecurityGlobal;
    operations?: Record<string, GatewaySecurityOperation>;
    overrides?: Record<string, GatewaySecurityOperation>;
  };
  upstream?: UpstreamSecurityConfig;
  headers?: {
    passThrough?: string[];
    mappings?: Array<{from: string; to: string; required?: boolean}>;
  };
};

export type BuiltSecurity = {
  securitySchemes?: Record<string, any>;
  headerParameters: Record<string, any>;
  opSecurity: Record<string, any[] | undefined>;
  opHeaderParameters: Record<string, string[]>;
  globalSecurity?: any[];
};

export class SecurityConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecurityConfigError";
  }
}

/**
 * Loads and normalizes a JSON security configuration file.
 *
 * @param filePath - Optional path to the JSON config. Undefined returns undefined.
 * @returns Parsed security configuration, or undefined when no file is provided.
 * @throws SecurityConfigError when the parsed JSON shape is invalid.
 * @throws SyntaxError when the file is not valid JSON.
 */
export function loadSecurityConfigFile(filePath?: string): SecurityConfig | undefined {
  if (!filePath) return undefined;
  const raw = fs.readFileSync(filePath, "utf8");
  return parseSecurityConfig(JSON.parse(raw));
}

/**
 * Normalizes the shared gateway and upstream SOAP security config.
 *
 * @param input - Raw JSON value from a security config file or programmatic caller.
 * @returns Normalized security config with legacy OpenAPI-only shape mapped to `gateway`.
 * @throws SecurityConfigError when a section or scheme is malformed.
 */
export function parseSecurityConfig(input: unknown): SecurityConfig {
  if (!isRecord(input)) {
    throw new SecurityConfigError("Security config must be a JSON object.");
  }

  const root = input as Record<string, unknown>;
  const gatewaySource = isRecord(root.gateway)
    ? root.gateway as Record<string, unknown>
    : hasLegacyGatewayShape(root)
      ? {global: root.global, overrides: root.overrides}
      : undefined;

  const cfg: SecurityConfig = {};
  if (gatewaySource) {
    cfg.gateway = parseGatewaySecurity(gatewaySource);
  }
  if (root.upstream !== undefined) {
    cfg.upstream = parseUpstreamSecurity(root.upstream);
  }
  if (root.headers !== undefined) {
    cfg.headers = parseHeaderForwarding(root.headers);
  }
  return cfg;
}

/**
 * Builds the OpenAPI-facing security schemes, requirements, and header parameters.
 *
 * @param cfg - Normalized shared security config.
 * @returns Deterministic OpenAPI security fragments consumed by the OpenAPI generator.
 */
export function buildSecurity(cfg?: SecurityConfig): BuiltSecurity {
  const securitySchemes: Record<string, any> = {};
  const headerParameters: Record<string, any> = {};
  const opSecurity: Record<string, any[] | undefined> = {};
  const opHeaderParameters: Record<string, string[]> = {};

  const gateway = cfg?.gateway;
  const global = gateway?.global;
  if (!global) {
    return {securitySchemes: undefined, headerParameters, opSecurity, opHeaderParameters};
  }

  const schemeName = "defaultAuth";
  const scheme = global.scheme || "none";
  const hasGlobal = scheme !== "none";
  if (hasGlobal) {
    securitySchemes[schemeName] = buildSecurityScheme(scheme, global);
  }

  for (const h of global.headers || []) {
    headerParameters[makeParamComponentName(h.name)] = buildHeaderParameter(h);
  }

  const operations = {
    ...(gateway.overrides || {}),
    ...(gateway.operations || {}),
  };
  for (const [opName, override] of Object.entries(operations)) {
    const oScheme = override.scheme ?? scheme;
    if (oScheme === "none") {
      opSecurity[opName] = [{}];
    } else if (oScheme === scheme) {
      opSecurity[opName] = hasGlobal ? [{[schemeName]: []}] : undefined;
    } else {
      const altName = `${schemeName}_${oScheme}`;
      if (!securitySchemes[altName]) {
        securitySchemes[altName] = buildSecurityScheme(oScheme, global);
      }
      opSecurity[opName] = [{[altName]: []}];
    }

    const headers = [...(global.headers || []), ...(override.headers || [])];
    opHeaderParameters[opName] = headers.map(h => makeParamComponentName(h.name));
    for (const h of override.headers || []) {
      const compName = makeParamComponentName(h.name);
      if (!headerParameters[compName]) {
        headerParameters[compName] = buildHeaderParameter(h);
      }
    }
  }

  return {
    securitySchemes: Object.keys(securitySchemes).length ? securitySchemes : undefined,
    headerParameters,
    opSecurity,
    opHeaderParameters,
    globalSecurity: hasGlobal ? [{[schemeName]: []}] : undefined,
  };
}

/**
 * Checks whether a generated app needs an upstream SOAP security helper.
 *
 * @param cfg - Normalized shared security config.
 * @returns True when `upstream.profile` is configured to anything other than `none`.
 */
export function hasUpstreamRuntimeSecurity(cfg?: SecurityConfig): boolean {
  return !!cfg?.upstream && (cfg.upstream.profile ?? "none") !== "none";
}

function parseGatewaySecurity(input: Record<string, unknown>): NonNullable<SecurityConfig["gateway"]> {
  const global = input.global === undefined ? undefined : parseGatewayGlobal(input.global);
  const operations = input.operations === undefined ? undefined : parseGatewayOperations(input.operations, "operations");
  const overrides = input.overrides === undefined ? undefined : parseGatewayOperations(input.overrides, "overrides");
  return {global, operations, overrides};
}

function parseGatewayGlobal(input: unknown): GatewaySecurityGlobal {
  if (!isRecord(input)) {
    throw new SecurityConfigError("gateway.global must be an object.");
  }
  const scheme = parseGatewayScheme(input.scheme, "gateway.global.scheme");
  return {
    ...(scheme ? {scheme} : {}),
    ...(isRecord(input.apiKey) ? {apiKey: parseApiKey(input.apiKey)} : {}),
    ...(isRecord(input.bearer) ? {bearer: input.bearer as {bearerFormat?: string}} : {}),
    ...(isRecord(input.basic) ? {basic: {}} : {}),
    ...(isRecord(input.oauth2) ? {oauth2: input.oauth2 as {flows: Record<string, any>}} : {}),
    ...(isRecord(input.openIdConnect) ? {openIdConnect: input.openIdConnect as {openIdConnectUrl: string}} : {}),
    ...(isRecord(input.mutualTLS) ? {mutualTLS: input.mutualTLS as {description?: string}} : {}),
    ...(input.headers !== undefined ? {headers: parseHeaders(input.headers, "gateway.global.headers")} : {}),
  };
}

function parseGatewayOperations(input: unknown, label: string): Record<string, GatewaySecurityOperation> {
  if (!isRecord(input)) {
    throw new SecurityConfigError(`gateway.${label} must be an object keyed by operation name.`);
  }
  const out: Record<string, GatewaySecurityOperation> = {};
  for (const [opName, value] of Object.entries(input)) {
    if (!isRecord(value)) {
      throw new SecurityConfigError(`gateway.${label}.${opName} must be an object.`);
    }
    const scheme = parseGatewayScheme(value.scheme, `gateway.${label}.${opName}.scheme`);
    out[opName] = {
      ...(scheme ? {scheme} : {}),
      ...(value.headers !== undefined ? {headers: parseHeaders(value.headers, `gateway.${label}.${opName}.headers`)} : {}),
    };
  }
  return out;
}

function parseUpstreamSecurity(input: unknown): UpstreamSecurityConfig {
  if (!isRecord(input)) {
    throw new SecurityConfigError("upstream must be an object.");
  }
  const profile = input.profile === undefined ? undefined : String(input.profile);
  const allowed = new Set(["none", "basic", "bearer", "ws-security-username-token", "client-ssl", "client-ssl-pfx", "x509", "ntlm", "custom"]);
  if (profile && !allowed.has(profile)) {
    throw new SecurityConfigError(`Unsupported upstream.profile '${profile}'.`);
  }
  return input as UpstreamSecurityConfig;
}

function parseHeaderForwarding(input: unknown): NonNullable<SecurityConfig["headers"]> {
  if (!isRecord(input)) {
    throw new SecurityConfigError("headers must be an object.");
  }
  const passThrough = input.passThrough === undefined ? undefined : parseStringArray(input.passThrough, "headers.passThrough");
  const mappings = input.mappings === undefined ? undefined : parseMappings(input.mappings);
  return {
    ...(passThrough ? {passThrough} : {}),
    ...(mappings ? {mappings} : {}),
  };
}

function parseHeaders(input: unknown, label: string): SecurityHeaderConfig[] {
  if (!Array.isArray(input)) {
    throw new SecurityConfigError(`${label} must be an array.`);
  }
  return input.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.name !== "string" || !entry.name.trim()) {
      throw new SecurityConfigError(`${label}[${index}].name must be a non-empty string.`);
    }
    return {
      name: entry.name,
      ...(entry.required !== undefined ? {required: Boolean(entry.required)} : {}),
      ...(entry.schema !== undefined ? {schema: entry.schema} : {}),
    };
  });
}

function parseGatewayScheme(input: unknown, label: string): GatewayAuthScheme | undefined {
  if (input === undefined) return undefined;
  const scheme = String(input) as GatewayAuthScheme;
  if (!["none", "basic", "bearer", "apiKey", "oauth2", "mutualTLS", "openIdConnect"].includes(scheme)) {
    throw new SecurityConfigError(`Unsupported ${label} '${scheme}'.`);
  }
  return scheme;
}

function parseApiKey(input: Record<string, unknown>): {in: "header" | "query" | "cookie"; name: string} {
  const location = input.in === undefined ? "header" : String(input.in);
  if (!["header", "query", "cookie"].includes(location)) {
    throw new SecurityConfigError("apiKey.in must be header, query, or cookie.");
  }
  const name = input.name === undefined ? "X-API-Key" : String(input.name);
  if (!name) {
    throw new SecurityConfigError("apiKey.name must be a non-empty string.");
  }
  return {in: location as "header" | "query" | "cookie", name};
}

function parseStringArray(input: unknown, label: string): string[] {
  if (!Array.isArray(input) || input.some(v => typeof v !== "string" || !v)) {
    throw new SecurityConfigError(`${label} must be an array of non-empty strings.`);
  }
  return input;
}

function parseMappings(input: unknown): Array<{from: string; to: string; required?: boolean}> {
  if (!Array.isArray(input)) {
    throw new SecurityConfigError("headers.mappings must be an array.");
  }
  return input.map((entry, index) => {
    if (!isRecord(entry) || typeof entry.from !== "string" || typeof entry.to !== "string" || !entry.from || !entry.to) {
      throw new SecurityConfigError(`headers.mappings[${index}] must define non-empty from and to strings.`);
    }
    return {
      from: entry.from,
      to: entry.to,
      ...(entry.required !== undefined ? {required: Boolean(entry.required)} : {}),
    };
  });
}

function buildSecurityScheme(scheme: GatewayAuthScheme, global: GatewaySecurityGlobal): any {
  switch (scheme) {
    case "basic":
      return {type: "http", scheme: "basic"};
    case "bearer":
      return {type: "http", scheme: "bearer", ...(global.bearer || {})};
    case "apiKey":
      return {type: "apiKey", ...(global.apiKey || {in: "header", name: "X-API-Key"})};
    case "oauth2":
      return {type: "oauth2", ...(global.oauth2 || {flows: {}})};
    case "mutualTLS":
      return {type: "mutualTLS", ...(global.mutualTLS || {})};
    case "openIdConnect":
      return {type: "openIdConnect", ...(global.openIdConnect || {openIdConnectUrl: ""})};
    case "none":
      return undefined;
  }
}

function buildHeaderParameter(h: SecurityHeaderConfig): any {
  return {
    name: h.name,
    in: "header",
    required: !!h.required,
    schema: h.schema || {type: "string"},
  };
}

function makeParamComponentName(headerName: string): string {
  return trimRepeatedEdgeChar(
    headerName.replace(/[^A-Za-z0-9]+/g, "_"),
    "_",
  )
    || "X_Header";
}

function hasLegacyGatewayShape(root: Record<string, unknown>): boolean {
  return root.global !== undefined || root.overrides !== undefined;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
