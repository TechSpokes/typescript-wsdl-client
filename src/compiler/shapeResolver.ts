/**
 * Companion-catalog shape resolver (phase-2 of ADR-002).
 *
 * For stream operations whose record types live in a different WSDL (e.g.
 * Escapia's main EVRN service provides the concrete UnitDescriptiveContentType
 * while the content-service WSDL only exposes an xs:any-wrapped envelope),
 * load the companion catalog and copy the reachable record-type graph into
 * the current catalog.
 *
 * Invariants:
 *   - A name collision against a type already in the current catalog is only
 *     allowed when the two types are *structurally identical* — otherwise we
 *     fail the build rather than silently rename public API types.
 *   - Existing buffered generation stays byte-for-byte identical when no
 *     streamConfig.shapeCatalogs entries are declared.
 */
import fs from "node:fs";
import path from "node:path";
import {compileCatalog, type CompiledAlias, type CompiledCatalog, type CompiledType} from "./schemaCompiler.js";
import {loadWsdl} from "../loader/wsdlLoader.js";
import {resolveCompilerOptions} from "../config.js";
import type {ShapeCatalogRef, StreamConfig} from "../util/streamConfig.js";
import {WsdlCompilationError} from "../util/errors.js";

export interface ApplyShapeCatalogsOptions {
  /** Directory against which relative `catalogFile`/`wsdlSource` paths resolve. Defaults to process.cwd(). */
  baseDir?: string;
}

/**
 * Apply a parsed StreamConfig to a compiled catalog:
 *   1. Verify every opted-in operation's record type is resolvable.
 *   2. For each operation that names a shapeCatalog, load the companion
 *      catalog (once, cached) and copy the reachable record-type graph.
 *
 * Mutates `compiled` in place. Safe to call with a StreamConfig that has
 * zero shapeCatalogs — it will still validate record-type presence against
 * the current catalog.
 */
export async function applyShapeCatalogs(
  compiled: CompiledCatalog,
  streamConfig: StreamConfig,
  options: ApplyShapeCatalogsOptions = {},
): Promise<void> {
  const baseDir = options.baseDir ?? process.cwd();

  // Load each declared shape catalog once, on-demand. Shape catalogs declared
  // but never referenced are harmless — we only load the ones an operation
  // actually uses.
  const referencedCatalogs = new Set<string>();
  for (const meta of Object.values(streamConfig.operations)) {
    if (meta.shapeCatalogName) referencedCatalogs.add(meta.shapeCatalogName);
  }

  const companionByName = new Map<string, CompiledCatalog>();
  for (const name of referencedCatalogs) {
    const ref = streamConfig.shapeCatalogs[name];
    if (!ref) {
      throw new WsdlCompilationError(
        `Stream config references shape catalog "${name}" that is not declared under "shapeCatalogs".`,
        {
          suggestion: `Add a "shapeCatalogs.${name}" entry pointing to a wsdlSource or catalogFile, or remove the reference.`,
        },
      );
    }
    companionByName.set(name, await loadCompanionCatalog(name, ref, baseDir, compiled));
  }

  for (const [opName, meta] of Object.entries(streamConfig.operations)) {
    if (meta.shapeCatalogName) {
      const companion = companionByName.get(meta.shapeCatalogName);
      if (!companion) {
        // Guarded by the loop above; this path is defensive.
        throw new WsdlCompilationError(
          `Stream config for "${opName}" references shape catalog "${meta.shapeCatalogName}" which failed to load.`,
        );
      }
      copyReachableGraph(compiled, companion, meta.recordTypeName, {
        opName,
        shapeCatalog: meta.shapeCatalogName,
      });
    } else {
      // No companion: the record type must already live in the main catalog.
      if (!hasNamedType(compiled, meta.recordTypeName)) {
        throw new WsdlCompilationError(
          `Stream config for operation "${opName}" references record type "${meta.recordTypeName}" which is not present in the compiled catalog.`,
          {
            element: meta.recordTypeName,
            suggestion:
              `Either declare a "shapeCatalogs.<name>" entry and set shapeCatalog on the operation, or correct the recordType to a type defined in the WSDL.`,
          },
        );
      }
    }
  }
}

async function loadCompanionCatalog(
  name: string,
  ref: ShapeCatalogRef,
  baseDir: string,
  compiled: CompiledCatalog,
): Promise<CompiledCatalog> {
  if (ref.catalogFile) {
    const abs = path.resolve(baseDir, ref.catalogFile);
    let text: string;
    try {
      text = fs.readFileSync(abs, "utf-8");
    } catch (err) {
      throw new WsdlCompilationError(
        `Failed to read companion catalog "${name}" at ${abs}: ${(err as Error).message}`,
        {suggestion: `Check that shapeCatalogs.${name}.catalogFile points to an existing catalog.json.`},
      );
    }
    try {
      return JSON.parse(text) as CompiledCatalog;
    } catch (err) {
      throw new WsdlCompilationError(
        `Companion catalog "${name}" at ${abs} is not valid JSON: ${(err as Error).message}`,
      );
    }
  }
  if (ref.wsdlSource) {
    // Relative paths resolve against baseDir; URLs pass through untouched.
    const src = isLikelyUrl(ref.wsdlSource) ? ref.wsdlSource : path.resolve(baseDir, ref.wsdlSource);
    const wsdlCatalog = await loadWsdl(src);
    // Reuse the current catalog's compiler options so primitives / attrs keys
    // / choice handling stay consistent with the main generation.
    const companionOptions = resolveCompilerOptions(
      {...compiled.options, catalog: false},
      {wsdl: src, out: baseDir},
    );
    return compileCatalog(wsdlCatalog, companionOptions);
  }
  throw new WsdlCompilationError(
    `Shape catalog "${name}" declares neither wsdlSource nor catalogFile.`,
  );
}

function isLikelyUrl(s: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
}

function hasNamedType(cat: CompiledCatalog, name: string): boolean {
  return cat.types.some((t) => t.name === name) || cat.aliases.some((a) => a.name === name);
}

/**
 * Walk the reachable type graph from `rootTypeName` within the companion
 * catalog and copy each reachable entry into `dst`. Types with the same name
 * already present in `dst` are checked for structural equality; any divergence
 * is fatal.
 */
function copyReachableGraph(
  dst: CompiledCatalog,
  src: CompiledCatalog,
  rootTypeName: string,
  context: {opName: string; shapeCatalog: string},
): void {
  const srcTypes = new Map(src.types.map((t) => [t.name, t] as const));
  const srcAliases = new Map(src.aliases.map((a) => [a.name, a] as const));

  if (!srcTypes.has(rootTypeName) && !srcAliases.has(rootTypeName)) {
    throw new WsdlCompilationError(
      `Stream config for operation "${context.opName}" references record type "${rootTypeName}" but it is not present in shape catalog "${context.shapeCatalog}".`,
      {
        element: rootTypeName,
        suggestion: `Check the companion catalog or correct the recordType.`,
      },
    );
  }

  const known = new Set<string>([...srcTypes.keys(), ...srcAliases.keys()]);
  const queue: string[] = [rootTypeName];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const typeName = queue.shift()!;
    if (visited.has(typeName)) continue;
    visited.add(typeName);

    const srcType = srcTypes.get(typeName);
    if (srcType) {
      mergeType(dst, src, srcType, context);
      // Enqueue referenced names from elems, attrs, base.
      for (const e of srcType.elems ?? []) {
        for (const ref of extractReferencedNames(e.tsType, known)) queue.push(ref);
      }
      for (const a of srcType.attrs ?? []) {
        for (const ref of extractReferencedNames(a.tsType, known)) queue.push(ref);
      }
      if (srcType.base && known.has(srcType.base)) queue.push(srcType.base);
      continue;
    }
    const srcAlias = srcAliases.get(typeName);
    if (srcAlias) {
      mergeAlias(dst, src, srcAlias, context);
      for (const ref of extractReferencedNames(srcAlias.tsType, known)) queue.push(ref);
    }
    // Not in companion; silently skip — either a primitive or a type that
    // the main catalog is expected to own.
  }
}

function mergeType(
  dst: CompiledCatalog,
  src: CompiledCatalog,
  srcType: CompiledType,
  context: {opName: string; shapeCatalog: string},
): void {
  const existingIdx = dst.types.findIndex((t) => t.name === srcType.name);
  if (existingIdx < 0) {
    dst.types.push({...srcType});
    copyTypeMeta(dst, src, srcType.name);
    return;
  }
  const existing = dst.types[existingIdx];
  if (!structurallyEqualType(existing, srcType)) {
    throw new WsdlCompilationError(
      `Companion catalog "${context.shapeCatalog}" declares type "${srcType.name}" that conflicts structurally with the current catalog.`,
      {
        element: srcType.name,
        suggestion: `Rename one of the conflicting types in the source WSDL, or resolve the conflict before streaming. wsdl-tsc refuses to silently rename public API types.`,
      },
    );
  }
  // Structurally identical — keep the existing entry (and its meta) as-is.
}

function mergeAlias(
  dst: CompiledCatalog,
  src: CompiledCatalog,
  srcAlias: CompiledAlias,
  context: {opName: string; shapeCatalog: string},
): void {
  const existingIdx = dst.aliases.findIndex((a) => a.name === srcAlias.name);
  if (existingIdx < 0) {
    dst.aliases.push({...srcAlias});
    // Aliases that point at a complex type get meta synonyms in compileCatalog;
    // the main catalog already owns that path for its own types, so we only
    // need to add meta if the companion aliases a complex type whose type we
    // also just copied.
    copyAliasSynonymMeta(dst, src, srcAlias.name);
    return;
  }
  const existing = dst.aliases[existingIdx];
  if (!structurallyEqualAlias(existing, srcAlias)) {
    throw new WsdlCompilationError(
      `Companion catalog "${context.shapeCatalog}" declares alias "${srcAlias.name}" that conflicts structurally with the current catalog.`,
      {
        element: srcAlias.name,
        suggestion: `Resolve the conflicting type name before streaming. wsdl-tsc refuses to silently rename public API types.`,
      },
    );
  }
}

function copyTypeMeta(dst: CompiledCatalog, src: CompiledCatalog, typeName: string): void {
  if (typeName in src.meta.attrSpec) dst.meta.attrSpec[typeName] = [...src.meta.attrSpec[typeName]];
  if (typeName in src.meta.attrType) dst.meta.attrType[typeName] = {...src.meta.attrType[typeName]};
  if (typeName in src.meta.childType) dst.meta.childType[typeName] = {...src.meta.childType[typeName]};
  if (typeName in src.meta.propMeta) dst.meta.propMeta[typeName] = {...src.meta.propMeta[typeName]};
}

function copyAliasSynonymMeta(dst: CompiledCatalog, src: CompiledCatalog, aliasName: string): void {
  // Phase-2 MVP: only copy meta for aliases whose name already keys into the
  // source's meta maps. Aliases that are just simple-type renames don't need
  // child/attr meta at all.
  copyTypeMeta(dst, src, aliasName);
}

const TS_BUILTINS = new Set([
  "string", "number", "boolean", "bigint", "null", "undefined", "void", "any", "unknown", "never",
  "Date", "Array", "Record", "Map", "Set", "Promise", "Buffer", "Object", "Function",
]);

/**
 * Extract PascalCase identifiers from a TypeScript type expression that are
 * known to the companion catalog. Deliberately cheap — matches identifiers
 * starting with an uppercase letter, skips TS built-ins and anything not
 * present in the companion's known-names set.
 */
function extractReferencedNames(tsType: string, known: Set<string>): string[] {
  if (!tsType) return [];
  const out: string[] = [];
  // Identifiers starting with an uppercase letter; bare word boundaries.
  for (const m of tsType.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
    const name = m[0];
    if (TS_BUILTINS.has(name)) continue;
    if (known.has(name)) out.push(name);
  }
  return out;
}

function structurallyEqualType(a: CompiledType, b: CompiledType): boolean {
  return canonicalizeType(a) === canonicalizeType(b);
}

function structurallyEqualAlias(a: CompiledAlias, b: CompiledAlias): boolean {
  return canonicalizeAlias(a) === canonicalizeAlias(b);
}

function canonicalizeType(t: CompiledType): string {
  // Drop fields that legitimately differ between catalogs (ns, docs) and
  // stabilize ordering. Stream metadata is on operations, not on types.
  return JSON.stringify({
    name: t.name,
    attrs: (t.attrs ?? []).map(canonicalizeAttr),
    elems: (t.elems ?? []).map(canonicalizeElem),
    base: t.base ?? null,
    wildcards: (t.wildcards ?? []).map((w) => ({
      min: w.min,
      max: w.max,
      namespace: w.namespace ?? null,
      processContents: w.processContents ?? null,
    })),
  });
}

function canonicalizeAlias(a: CompiledAlias): string {
  return JSON.stringify({
    name: a.name,
    tsType: a.tsType,
    declared: a.declared,
  });
}

function canonicalizeAttr(a: CompiledType["attrs"][number]): unknown {
  return {
    name: a.name,
    tsType: a.tsType,
    use: a.use ?? "optional",
    declaredType: a.declaredType,
  };
}

function canonicalizeElem(e: CompiledType["elems"][number]): unknown {
  return {
    name: e.name,
    tsType: e.tsType,
    min: e.min,
    max: e.max,
    nillable: !!e.nillable,
    declaredType: e.declaredType,
  };
}
