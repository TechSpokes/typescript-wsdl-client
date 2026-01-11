/**
 * OpenAPI Schema Component Generator
 *
 * This module transforms the compiled TypeScript types from the WSDL catalog
 * into OpenAPI 3.1 schema components. It handles the conversion of complex types,
 * type aliases, arrays, and primitive types to their JSON Schema equivalents.
 *
 * Key features:
 * - Converts TypeScript interfaces to JSON Schema objects
 * - Handles type aliases and enumerations
 * - Supports array types with appropriate item definitions
 * - Manages property requirements based on XML schema constraints
 * - Optionally enforces closed schemas with additionalProperties:false
 * - Can prune schemas that aren't referenced by any operation
 */
import type {CompiledAlias, CompiledCatalog, CompiledType} from "../compiler/schemaCompiler.js";

/**
 * Options for generating OpenAPI schema components
 *
 * @interface GenerateSchemasOptions
 * @property {boolean} [closedSchemas] - Whether to add additionalProperties:false to object schemas
 * @property {boolean} [pruneUnusedSchemas] - Whether to exclude schemas not referenced by operations
 */
export interface GenerateSchemasOptions {
  closedSchemas?: boolean;
  pruneUnusedSchemas?: boolean;
}

export type ComponentsSchemas = Record<string, any>;

function isLiteralUnion(ts: string): string[] | null {
  // very naive: split by | and ensure each trimmed starts and ends with quotes
  const parts = ts.split("|").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.every(p => /^".*"$/.test(p))) {
    return parts.map(p => p.slice(1, -1));
  }
  return null;
}

function primitiveSchema(ts: string): any {
  switch (ts) {
    case "string":
      return {type: "string"};
    case "number":
      return {type: "number"};
    case "boolean":
      return {type: "boolean"};
    case "any":
      return {};
    default:
      if (ts.endsWith("[]")) {
        return {type: "array", items: primitiveSchema(ts.slice(0, -2))};
      }
      return {$ref: `#/components/schemas/${ts}`};
  }
}

function buildAliasSchema(a: CompiledAlias): any {
  const lit = isLiteralUnion(a.tsType);
  if (lit) {
    return {type: "string", enum: lit};
  }
  // If alias wraps primitive
  if (["string", "number", "boolean", "any"].includes(a.tsType) || a.tsType.endsWith("[]")) {
    return primitiveSchema(a.tsType);
  }
  // alias of another complex/alias type -> allOf wrapper preserves name
  return {allOf: [{$ref: `#/components/schemas/${a.tsType}`}]};
}

function isArrayWrapper(t: CompiledType): { itemType: string } | null {
  if (t.attrs.length !== 0) return null;
  if (t.elems.length !== 1) return null;
  const e = t.elems[0];
  if (e.max !== "unbounded" && !(e.max > 1)) return null;
  return {itemType: e.tsType};
}

function buildComplexSchema(t: CompiledType, closed: boolean, knownTypeNames: Set<string>, aliasNames: Set<string>): any {
  // Use knownTypeNames/aliasNames to validate $ref targets so we surface
  // compiler issues early instead of emitting dangling references in OpenAPI output.
  function refOrPrimitive(ts: string): any {
    switch (ts) {
      case "string":
        return {type: "string"};
      case "number":
        return {type: "number"};
      case "boolean":
        return {type: "boolean"};
      case "any":
        return {}; // intentionally permissive
      default:
        // Handle inline string literal unions (e.g. "Create" | "Read" | "Update" | "Delete")
        const lit = isLiteralUnion(ts);
        if (lit) {
          return {type: "string", enum: lit};
        }
        if (ts.endsWith("[]")) {
          const inner = ts.slice(0, -2);
          return {type: "array", items: refOrPrimitive(inner)};
        }
        if (!knownTypeNames.has(ts) && !aliasNames.has(ts)) {
          // Fail fast: this indicates a mismatch between schemaCompiler output and OpenAPI builder expectations.
          throw new Error(`[openapi] unknown referenced type '${ts}' while building schema '${t.name}'`);
        }
        return {$ref: `#/components/schemas/${ts}`};
    }
  }

  const arrayWrap = isArrayWrapper(t);
  if (arrayWrap) {
    const item = refOrPrimitive(String(arrayWrap.itemType));
    return {type: "array", items: item};
  }
  const properties: Record<string, any> = {};
  const required: string[] = [];

  // attributes
  for (const a of t.attrs) {
    properties[a.name] = refOrPrimitive(a.tsType);
    if (a.use === "required") required.push(a.name);
  }
  // elements
  for (const e of t.elems) {
    const baseSchema = refOrPrimitive(e.tsType);
    const isArray = e.max === "unbounded" || (e.max > 1);
    let schema = baseSchema;
    if (isArray) schema = {type: "array", items: baseSchema};
    if (e.nillable) {
      schema = {anyOf: [schema, {type: "null"}]};
    }
    properties[e.name] = schema;
    if (e.name === "$value") {
      // never required
    } else if (e.min >= 1) {
      required.push(e.name);
    }
  }

  const obj: any = {
    type: "object",
    properties,
  };
  if (required.length) obj.required = Array.from(new Set(required));
  if (closed) obj.additionalProperties = false;

  // inheritance via base => allOf
  if (t.base) {
    const baseName = t.base;
    // Validate base reference explicitly (using helper ensures error if unknown)
    if (!knownTypeNames.has(baseName) && !aliasNames.has(baseName)) {
      throw new Error(`[openapi] unknown base type '${baseName}' while building schema '${t.name}'`);
    }
    obj.allOf = [{$ref: `#/components/schemas/${baseName}`}, {...obj}];
    delete obj.type; // inner object part handled in allOf
    delete obj.properties;
    delete obj.required; // Always remove from top-level; it's already in the allOf member
    if (!closed) delete obj.additionalProperties; // put closed only on leaf part
  }

  return obj;
}

/**
 * Transforms the compiled WSDL catalog into OpenAPI schema components
 *
 * @function generateSchemas
 * @param {CompiledCatalog} compiled - The compiled WSDL catalog containing types, aliases, and operations
 * @param {GenerateSchemasOptions} opts - Options for schema generation
 * @returns {ComponentsSchemas} - A record of schema component names to their JSON Schema definitions
 *
 * @throws Will throw an error if there are unknown referenced types or bases while building schemas
 *
 * @example
 * // Example usage: generating schemas with closed schemas enforcement and unused schema pruning
 * const schemas = generateSchemas(compiledCatalog, { closedSchemas: true, pruneUnusedSchemas: true });
 */
export function generateSchemas(compiled: CompiledCatalog, opts: GenerateSchemasOptions): ComponentsSchemas {
  const closed = !!opts.closedSchemas;
  const schemas: ComponentsSchemas = {};
  const typeNames = new Set(compiled.types.map(t => t.name));
  const aliasNames = new Set(compiled.aliases.map(a => a.name));

  // Build alias schemas first so complex types can reference them
  for (const a of compiled.aliases) {
    schemas[a.name] = buildAliasSchema(a);
  }
  for (const t of compiled.types) {
    schemas[t.name] = buildComplexSchema(t, closed, typeNames, aliasNames);
  }

  if (opts.pruneUnusedSchemas) {
    // Root references: each operation's inputElement.local, outputElement.local
    const roots = new Set<string>();
    for (const op of compiled.operations) {
      if (op.inputElement?.local) roots.add(op.inputElement.local);
      if (op.outputElement?.local) roots.add(op.outputElement.local);
    }
    // BFS through $ref graph
    const reachable = new Set<string>();
    const queue: string[] = Array.from(roots);
    while (queue.length) {
      const cur = queue.shift()!;
      if (reachable.has(cur)) continue;
      if (!schemas[cur]) continue; // unknown
      reachable.add(cur);
      const scan = (node: any) => {
        if (!node || typeof node !== "object") return;
        if (node.$ref) {
          const name = node.$ref.split("/").pop();
          if (name && !reachable.has(name)) queue.push(name);
        }
        for (const v of Object.values(node)) scan(v);
      };
      scan(schemas[cur]);
    }
    // prune
    for (const k of Object.keys(schemas)) {
      if (!reachable.has(k)) delete schemas[k];
    }
  }

  return schemas;
}
