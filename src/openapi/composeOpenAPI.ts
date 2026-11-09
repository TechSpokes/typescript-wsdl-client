import {types} from "node:util";

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export interface JsonObject { [key: string]: JsonValue }
export interface ComposedOpenApiDocument extends JsonObject {
  openapi: string;
  info: JsonObject;
  paths: Record<string, JsonObject>;
  components: Record<string, Record<string, JsonValue>>;
}
export interface OpenApiCompositionOptions {
  title?: string;
  version?: string;
  description?: string;
  servers?: readonly string[];
}
export interface OpenApiCompositionEntry {key: string; document: unknown}

const methods = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
const categories: Readonly<Record<string, Kind>> = {
  schemas: "schema", responses: "response", parameters: "parameter", examples: "example",
  requestBodies: "requestBody", headers: "header", securitySchemes: "securityScheme", links: "link",
  callbacks: "callback", pathItems: "pathItem",
};
type Kind = "schema" | "pathItem" | "operation" | "parameter" | "header" | "requestBody" |
  "response" | "mediaType" | "encoding" | "example" | "link" | "callback" | "securityScheme" | "data";
const dict = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;
const record = (value: JsonValue | undefined, context: string): JsonObject => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${context} must be an object`);
  return value;
};
const items = (value: JsonValue, context: string): JsonValue[] => {
  if (!Array.isArray(value)) throw new TypeError(`${context} must be an array`);
  return value;
};
const pointerToken = (value: string): string => value.replaceAll("~", "~0").replaceAll("/", "~1");

/** Copy JSON data without invoking accessors or sharing mutable source objects.
 * @throws For non-JSON values, accessors, proxies, sparse arrays or cycles.
 */
function copyJson(value: unknown, active = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object" || types.isProxy(value) || active.has(value)) throw new TypeError("Actual acyclic JSON data required");
  if (!Array.isArray(value) && ![null, Object.prototype].includes(Object.getPrototypeOf(value) as object | null)) throw new TypeError("Plain JSON objects required");
  active.add(value);
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) throw new TypeError("Dense JSON arrays required");
      return Array.from({length: value.length}, (_, index) => {
        const property = Object.getOwnPropertyDescriptor(value, String(index));
        if (!property || !Object.hasOwn(property, "value")) throw new TypeError("JSON array data properties required");
        return copyJson(property.value, active);
      });
    }
    const result = dict<JsonValue>();
    for (const key of Reflect.ownKeys(value)) {
      const property = Object.getOwnPropertyDescriptor(value, key)!;
      if (typeof key !== "string" || !property.enumerable || !Object.hasOwn(property, "value")) throw new TypeError("JSON object data properties required");
      result[key] = copyJson(property.value, active);
    }
    return result;
  } finally {active.delete(value);}
}

function stable(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

/** Compose service-scoped OpenAPI contracts without changing SOAP client ownership.
 * @param entries Self-contained OpenAPI 3.1 documents whose HTTP paths already contain their service prefixes.
 * @param options Combined API metadata and default gateway servers; custom source servers remain operation-local.
 * @returns A fresh deterministic document with qualified component names and operation identifiers.
 * @throws For invalid JSON, duplicate service keys/paths/operation IDs, unresolved local references or unsupported relative references/schema resources.
 * @constraints Only reference-bearing OpenAPI/JSON Schema positions are rewritten; examples, literal values and extensions remain data.
 * @see https://spec.openapis.org/oas/v3.1.0.html Reference, Link, Security Requirement and Schema objects govern distinct reference positions.
 */
export function composeOpenApiDocuments(entries: readonly OpenApiCompositionEntry[], options: OpenApiCompositionOptions = {}): ComposedOpenApiDocument {
  if (!Array.isArray(entries) || entries.length === 0) throw new TypeError("At least one service document is required");
  const input = items(copyJson(entries), "services");
  const keys = new Set<string>();
  const paths = dict<JsonObject>();
  const components = dict<Record<string, JsonValue>>();
  const webhooks = dict<JsonValue>();
  const tags = dict<JsonValue>();
  const services = dict<JsonValue>();
  const rootServers: JsonValue[] = options.servers?.map(url => ({url})) ?? [{url: "/"}];
  let dialect: string | undefined;

  for (const entry of input.map(value => record(value, "service")).sort((left, right) => String(left.key).localeCompare(String(right.key)))) {
    const key = entry.key;
    if (typeof key !== "string" || !/^[a-z][a-z0-9-]*$/.test(key) || keys.has(key)) throw new TypeError("Unique lowercase service keys required");
    keys.add(key);
    const source = record(entry.document, `service ${key}`);
    if (typeof source.openapi !== "string" || !/^3\.1\.\d+$/.test(source.openapi)) throw new TypeError("OpenAPI 3.1 documents required");
    record(source.info, "OpenAPI info");
    const sourcePaths = record(source.paths, "OpenAPI paths");
    const sourceComponents = source.components === undefined ? dict<JsonValue>() : record(source.components, "OpenAPI components");
    const sourceDialect = source.jsonSchemaDialect ?? "https://spec.openapis.org/oas/3.1/dialect/base";
    if (typeof sourceDialect !== "string" || dialect !== undefined && dialect !== sourceDialect) throw new TypeError("Source schema dialects must agree");
    dialect = sourceDialect;
    const qualified = (name: string) => `${key}__${name}`;
    const operationIds = new Map<string, JsonObject>();
    const operationNodes = new Set<JsonObject>();
    const sourceRootServers = source.servers === undefined ? undefined : items(source.servers, "servers");
    const defaultSourceServer = JSON.stringify(sourceRootServers) === '[{"url":"/"}]';
    const effectiveServers = options.servers && defaultSourceServer ? undefined : sourceRootServers;
    const defaultSecurity = source.security;

    function resolve(tokens: readonly string[], reference: string): JsonValue {
      let target: JsonValue = source;
      for (const token of tokens) {
        if (!target || typeof target !== "object" || !Object.hasOwn(target, token)) throw new TypeError(`Unresolved local reference ${reference} in ${key}`);
        target = (target as JsonObject)[token];
      }
      return target;
    }
    function reference(value: JsonValue, operation = false): string {
      if (typeof value !== "string" || value.length === 0) throw new TypeError("Reference must be a nonempty string");
      if (!value.startsWith("#")) {
        try {new URL(value);} catch {throw new TypeError(`Relative external references need resolution before composition: ${value}`);}
        return value;
      }
      let fragment: string;
      try {fragment = decodeURIComponent(value.slice(1));} catch {throw new TypeError(`Invalid reference ${value}`);}
      if (!fragment.startsWith("/") || /~(?![01])/u.test(fragment)) throw new TypeError(`Unsupported local reference ${value}`);
      const tokens = fragment.slice(1).split("/").map(token => token.replaceAll("~1", "/").replaceAll("~0", "~"));
      const target = resolve(tokens, value);
      if (operation && (!target || typeof target !== "object" || Array.isArray(target) || !operationNodes.has(target))) throw new TypeError(`operationRef does not resolve to an operation: ${value}`);
      if (tokens[0] === "components" && tokens.length >= 3) tokens[2] = qualified(tokens[2]);
      else if (tokens[0] === "webhooks" && tokens.length >= 2) tokens[1] = qualified(tokens[1]);
      else if (tokens[0] !== "paths") throw new TypeError(`Reference target cannot be retained during composition: ${value}`);
      return "#/" + tokens.map(token => encodeURIComponent(pointerToken(token))).join("/");
    }
    function security(value: JsonValue): JsonValue {
      return items(value, "security").map(requirement => Object.fromEntries(Object.entries(record(requirement, "security requirement")).map(([name, scopes]) => {
        if (!Object.hasOwn(record(sourceComponents.securitySchemes, "securitySchemes"), name)) throw new TypeError(`Missing security scheme ${name}`);
        if (!items(scopes, "security scopes").every(scope => typeof scope === "string")) throw new TypeError("Security scopes must be strings");
        return [qualified(name), scopes];
      })));
    }
    function map(value: JsonValue, kind: Kind, scan: boolean, extensions = false): JsonValue {
      return Object.fromEntries(Object.entries(record(value, `${kind} map`)).map(([name, child]) => [name,
        extensions && name.startsWith("x-") ? child : walk(child, kind, scan)]));
    }
    function walk(value: JsonValue, kind: Kind, scan: boolean, inheritedServers = effectiveServers): JsonValue {
      if (kind === "data") return value;
      if (kind === "schema" && typeof value === "boolean") return value;
      const node = record(value, kind);
      const out: JsonObject = {...node};
      if (kind === "operation" && scan) {
        operationNodes.add(node);
        if (node.operationId !== undefined) {
          if (typeof node.operationId !== "string" || !node.operationId || operationIds.has(node.operationId)) throw new TypeError(`Duplicate or invalid operationId in ${key}`);
          operationIds.set(node.operationId, node);
        }
      }
      if (Object.hasOwn(node, "$ref") && !scan) out.$ref = reference(node.$ref);
      const array = (name: string, childKind: Kind) => {if (node[name] !== undefined) out[name] = items(node[name], name).map(child => walk(child, childKind, scan));};
      const child = (name: string, childKind: Kind) => {if (node[name] !== undefined) out[name] = walk(node[name], childKind, scan);};
      const keyed = (name: string, childKind: Kind, extensions = false) => {if (node[name] !== undefined) out[name] = map(node[name], childKind, scan, extensions);};
      if (kind === "schema") {
        if (["$id", "$anchor", "$dynamicAnchor", "$vocabulary"].some(name => Object.hasOwn(node, name))) throw new TypeError("Resolve schema resources/anchors before OpenAPI composition");
        if (node.$dynamicRef !== undefined && !scan) out.$dynamicRef = reference(node.$dynamicRef);
        for (const name of ["properties", "patternProperties", "dependentSchemas", "$defs", "definitions"]) keyed(name, "schema");
        for (const name of ["allOf", "anyOf", "oneOf", "prefixItems"]) array(name, "schema");
        for (const name of ["items", "contains", "additionalProperties", "unevaluatedProperties", "unevaluatedItems", "propertyNames", "not", "if", "then", "else", "additionalItems"]) child(name, "schema");
        if (node.discriminator !== undefined && !scan) {
          const discriminator = record(node.discriminator, "discriminator");
          const mapping = discriminator.mapping;
          if (mapping !== undefined) out.discriminator = {...discriminator, mapping: Object.fromEntries(Object.entries(record(mapping, "discriminator mapping")).map(([name, target]) => {
            if (typeof target !== "string") throw new TypeError("Discriminator targets must be strings");
            const schemas = record(sourceComponents.schemas, "schemas");
            return [name, Object.hasOwn(schemas, target) ? qualified(target) : reference(target)];
          }))};
        }
      } else if (kind === "pathItem") {
        array("parameters", "parameter");
        const servers = node.servers === undefined ? inheritedServers : items(node.servers, "path servers");
        for (const method of methods) if (node[method] !== undefined) out[method] = walk(node[method], "operation", scan, servers);
      } else if (kind === "operation") {
        array("parameters", "parameter"); child("requestBody", "requestBody"); keyed("responses", "response", true); keyed("callbacks", "callback");
        if (!scan) {
          if (node.operationId !== undefined) out.operationId = `${key}.${node.operationId}`;
          if (node.security !== undefined || defaultSecurity !== undefined) out.security = security(node.security ?? defaultSecurity);
          if (node.servers === undefined && inheritedServers !== undefined && JSON.stringify(inheritedServers) !== JSON.stringify(rootServers)) out.servers = inheritedServers;
          if (node.tags !== undefined) out.tags = items(node.tags, "tags").map(tag => {if (typeof tag !== "string") throw new TypeError("Tags must be strings"); return `${key}.${tag}`;});
        }
      } else if (kind === "parameter" || kind === "header" || kind === "mediaType") {
        child("schema", "schema"); keyed("examples", "example"); keyed("content", "mediaType"); keyed("encoding", "encoding");
        if (kind === "mediaType" && node["x-wsdl-tsc-stream"] !== undefined) {
          // @why Generated stream consumers discover record schemas here; unrelated extension payloads may contain literal $ref data.
          const stream = record(node["x-wsdl-tsc-stream"], "stream metadata");
          out["x-wsdl-tsc-stream"] = {...stream,
            ...(stream.itemSchema === undefined ? {} : {itemSchema: walk(stream.itemSchema, "schema", scan)})};
        }
      } else if (kind === "encoding") keyed("headers", "header");
      else if (kind === "requestBody") keyed("content", "mediaType");
      else if (kind === "response") {keyed("headers", "header"); keyed("content", "mediaType"); keyed("links", "link");}
      else if (kind === "callback") {
        for (const [expression, pathItem] of Object.entries(node)) if (expression !== "$ref" && !expression.startsWith("x-")) out[expression] = walk(pathItem, "pathItem", scan);
      } else if (kind === "link" && !scan) {
        if (node.operationId !== undefined && node.operationRef !== undefined) throw new TypeError("A link cannot set both operationId and operationRef");
        if (node.operationId !== undefined) {
          if (typeof node.operationId !== "string" || !operationIds.has(node.operationId)) throw new TypeError(`Unresolved link operationId ${String(node.operationId)}`);
          out.operationId = `${key}.${node.operationId}`;
        }
        if (node.operationRef !== undefined) out.operationRef = reference(node.operationRef, true);
      }
      return out;
    }

    for (const [route, value] of Object.entries(sourcePaths)) if (!route.startsWith("x-")) walk(value, "pathItem", true);
    if (source.webhooks !== undefined) map(source.webhooks, "pathItem", true);
    for (const [category, values] of Object.entries(sourceComponents)) {
      if (category.startsWith("x-")) continue;
      if (!Object.hasOwn(categories, category)) throw new TypeError(`Unsupported OpenAPI component category ${category}`);
      map(values, categories[category], true);
    }
    for (const [route, value] of Object.entries(sourcePaths)) {
      if (route.startsWith("x-")) continue;
      if (!route.startsWith("/") || Object.hasOwn(paths, route)) throw new TypeError(`Duplicate or invalid final path ${route}`);
      paths[route] = record(walk(value, "pathItem", false), "path item");
    }
    if (source.webhooks !== undefined) for (const [name, value] of Object.entries(record(source.webhooks, "webhooks"))) webhooks[qualified(name)] = walk(value, "pathItem", false);
    for (const [category, values] of Object.entries(sourceComponents)) {
      if (category.startsWith("x-")) continue;
      const destination = components[category] ??= dict<JsonValue>();
      for (const [name, value] of Object.entries(record(values, "components"))) destination[qualified(name)] = walk(value, categories[category], false);
    }
    if (source.tags !== undefined) for (const value of items(source.tags, "tags")) {
      const tag = record(value, "tag");
      if (typeof tag.name !== "string") throw new TypeError("Tag name must be a string");
      tags[`${key}.${tag.name}`] = {...tag, name: `${key}.${tag.name}`};
    }
    services[key] = {info: source.info,
      extensions: Object.fromEntries(Object.entries(source).filter(([name]) => name.startsWith("x-"))),
      componentExtensions: Object.fromEntries(Object.entries(sourceComponents).filter(([name]) => name.startsWith("x-"))),
      pathExtensions: Object.fromEntries(Object.entries(sourcePaths).filter(([name]) => name.startsWith("x-")))};
  }
  const info: JsonObject = {title: options.title ?? "Composed SOAP API", version: options.version ?? "0.0.0"};
  if (options.description !== undefined) info.description = options.description;
  const result: JsonObject = {openapi: "3.1.0", info, servers: rootServers, paths, components, "x-wsdl-tsc-services": services};
  if (Object.keys(webhooks).length) result.webhooks = webhooks;
  if (Object.keys(tags).length) result.tags = Object.keys(tags).sort().map(name => tags[name]);
  if (dialect !== "https://spec.openapis.org/oas/3.1/dialect/base") result.jsonSchemaDialect = dialect!;
  return stable(result) as ComposedOpenApiDocument;
}
