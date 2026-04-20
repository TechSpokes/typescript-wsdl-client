/**
 * Stream-configuration parsing and validation.
 *
 * Backs the `--stream-config <file>` CLI flag on every generation command.
 * The file is a small JSON document that marks selected WSDL operations as
 * streamable and optionally declares companion catalogs that supply record
 * shapes not present in the main WSDL. See `docs/decisions/002-streamable-responses.md`.
 *
 * This module is parser-only: it reads the JSON, validates it, and returns a
 * normalized shape. It never loads companion catalogs or compiles WSDLs —
 * that is the shape-resolver's job in phase-2.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Per-operation stream metadata, normalized form. Exported so that the
 * compiler, emitters, and gateway all consume the same shape.
 */
export interface OperationStreamMetadata {
  mode: "stream";
  format: "ndjson" | "json-array";
  mediaType: string;
  recordPath: string[];
  recordTypeName: string;
  shapeCatalogName?: string;
  // Populated by the compiler when it resolves the operation against the
  // current WSDL. Left undefined at config-parse time.
  sourceOutputTypeName?: string;
}

/**
 * Reference to a companion catalog that supplies record shapes. Exactly one
 * of `wsdlSource` or `catalogFile` must be set.
 */
export interface ShapeCatalogRef {
  wsdlSource?: string;
  catalogFile?: string;
}

/**
 * Parsed and normalized stream configuration.
 */
export interface StreamConfig {
  shapeCatalogs: Record<string, ShapeCatalogRef>;
  operations: Record<string, OperationStreamMetadata>;
}

/**
 * Structured error thrown when a stream configuration cannot be parsed.
 * The CLI error handler prints `.toUserMessage()` verbatim.
 */
export class StreamConfigError extends Error {
  override readonly name = "StreamConfigError";

  constructor(
    message: string,
    public readonly context: {file?: string; pointer?: string; suggestion?: string} = {}
  ) {
    super(message);
  }

  toUserMessage(): string {
    const parts = [this.message];
    if (this.context.pointer) parts.push(`  At: ${this.context.pointer}`);
    if (this.context.file) parts.push(`  File: ${this.context.file}`);
    if (this.context.suggestion) parts.push(`  Suggestion: ${this.context.suggestion}`);
    return parts.join("\n");
  }
}

const SUPPORTED_FORMATS = new Set(["ndjson", "json-array"]);

const DEFAULT_MEDIA_TYPE_BY_FORMAT: Record<string, string> = {
  "ndjson": "application/x-ndjson",
  "json-array": "application/json",
};

/**
 * Parse a stream configuration from an in-memory JSON value. Used directly
 * by tests; the file-based variant below wraps this.
 */
export function parseStreamConfig(raw: unknown, opts: {file?: string} = {}): StreamConfig {
  const file = opts.file;

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StreamConfigError("Stream config must be a JSON object.", {
      file,
      pointer: "$",
      suggestion: `Expected an object with "shapeCatalogs" and "operations" keys.`,
    });
  }
  const obj = raw as Record<string, unknown>;

  const shapeCatalogs = parseShapeCatalogs(obj["shapeCatalogs"], file);
  const operations = parseOperations(obj["operations"], shapeCatalogs, file);

  if (Object.keys(operations).length === 0) {
    throw new StreamConfigError(`Stream config must declare at least one operation.`, {
      file,
      pointer: "$.operations",
      suggestion: `Add an entry under "operations" keyed by the WSDL operation name.`,
    });
  }

  return {shapeCatalogs, operations};
}

/**
 * Load and parse a stream configuration file. Relative paths are resolved
 * against the caller's cwd.
 */
export function loadStreamConfigFile(filePath: string): StreamConfig {
  const abs = path.resolve(filePath);
  let text: string;
  try {
    text = fs.readFileSync(abs, "utf-8");
  } catch (err) {
    throw new StreamConfigError(
      `Failed to read stream config file: ${(err as Error).message}`,
      {file: abs, suggestion: "Check that --stream-config points to an existing, readable file."},
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new StreamConfigError(
      `Stream config file is not valid JSON: ${(err as Error).message}`,
      {file: abs, suggestion: "Fix the JSON syntax and retry."},
    );
  }
  return parseStreamConfig(parsed, {file: abs});
}

function parseShapeCatalogs(raw: unknown, file?: string): Record<string, ShapeCatalogRef> {
  if (raw === undefined) return {};
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StreamConfigError(`"shapeCatalogs" must be an object.`, {
      file,
      pointer: "$.shapeCatalogs",
    });
  }
  const out: Record<string, ShapeCatalogRef> = {};
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!name) {
      throw new StreamConfigError(`"shapeCatalogs" keys must be non-empty strings.`, {
        file,
        pointer: `$.shapeCatalogs`,
      });
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new StreamConfigError(`Shape catalog "${name}" must be an object.`, {
        file,
        pointer: `$.shapeCatalogs.${name}`,
      });
    }
    const e = entry as Record<string, unknown>;
    const wsdlSource = e["wsdlSource"];
    const catalogFile = e["catalogFile"];
    if (wsdlSource !== undefined && catalogFile !== undefined) {
      throw new StreamConfigError(
        `Shape catalog "${name}" must set exactly one of "wsdlSource" or "catalogFile", not both.`,
        {file, pointer: `$.shapeCatalogs.${name}`},
      );
    }
    if (wsdlSource === undefined && catalogFile === undefined) {
      throw new StreamConfigError(
        `Shape catalog "${name}" must set one of "wsdlSource" or "catalogFile".`,
        {file, pointer: `$.shapeCatalogs.${name}`},
      );
    }
    if (wsdlSource !== undefined && (typeof wsdlSource !== "string" || !wsdlSource)) {
      throw new StreamConfigError(
        `Shape catalog "${name}".wsdlSource must be a non-empty string.`,
        {file, pointer: `$.shapeCatalogs.${name}.wsdlSource`},
      );
    }
    if (catalogFile !== undefined && (typeof catalogFile !== "string" || !catalogFile)) {
      throw new StreamConfigError(
        `Shape catalog "${name}".catalogFile must be a non-empty string.`,
        {file, pointer: `$.shapeCatalogs.${name}.catalogFile`},
      );
    }
    out[name] = {
      wsdlSource: wsdlSource as string | undefined,
      catalogFile: catalogFile as string | undefined,
    };
  }
  return out;
}

function parseOperations(
  raw: unknown,
  shapeCatalogs: Record<string, ShapeCatalogRef>,
  file?: string,
): Record<string, OperationStreamMetadata> {
  if (raw === undefined) {
    throw new StreamConfigError(`"operations" is required.`, {
      file,
      pointer: "$.operations",
    });
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StreamConfigError(`"operations" must be an object.`, {
      file,
      pointer: "$.operations",
    });
  }
  const out: Record<string, OperationStreamMetadata> = {};
  for (const [opName, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!opName) {
      throw new StreamConfigError(`"operations" keys must be non-empty strings.`, {
        file,
        pointer: `$.operations`,
      });
    }
    out[opName] = parseOperationEntry(opName, entry, shapeCatalogs, file);
  }
  return out;
}

function parseOperationEntry(
  opName: string,
  raw: unknown,
  shapeCatalogs: Record<string, ShapeCatalogRef>,
  file?: string,
): OperationStreamMetadata {
  const pointer = `$.operations.${opName}`;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new StreamConfigError(`Operation "${opName}" must be an object.`, {file, pointer});
  }
  const e = raw as Record<string, unknown>;

  // mode
  const mode = e["mode"];
  if (mode !== undefined && mode !== "stream") {
    throw new StreamConfigError(
      `Operation "${opName}".mode must be "stream" (or omitted).`,
      {file, pointer: `${pointer}.mode`},
    );
  }

  // format
  const formatRaw = e["format"] ?? "ndjson";
  if (typeof formatRaw !== "string" || !SUPPORTED_FORMATS.has(formatRaw)) {
    throw new StreamConfigError(
      `Operation "${opName}".format must be one of: ${[...SUPPORTED_FORMATS].join(", ")}.`,
      {file, pointer: `${pointer}.format`},
    );
  }
  const format = formatRaw as OperationStreamMetadata["format"];

  // mediaType (optional; derived from format when absent)
  const mediaTypeRaw = e["mediaType"];
  let mediaType: string;
  if (mediaTypeRaw === undefined) {
    mediaType = DEFAULT_MEDIA_TYPE_BY_FORMAT[format];
  } else if (typeof mediaTypeRaw !== "string" || !mediaTypeRaw.includes("/")) {
    throw new StreamConfigError(
      `Operation "${opName}".mediaType must be a string of the form "type/subtype".`,
      {file, pointer: `${pointer}.mediaType`},
    );
  } else {
    mediaType = mediaTypeRaw;
  }

  // recordType
  const recordTypeRaw = e["recordType"];
  if (typeof recordTypeRaw !== "string" || !recordTypeRaw) {
    throw new StreamConfigError(
      `Operation "${opName}".recordType is required and must be a non-empty string.`,
      {file, pointer: `${pointer}.recordType`},
    );
  }
  const recordTypeName = recordTypeRaw;

  // recordPath
  const recordPathRaw = e["recordPath"];
  if (!Array.isArray(recordPathRaw) || recordPathRaw.length === 0) {
    throw new StreamConfigError(
      `Operation "${opName}".recordPath must be a non-empty array of element local names.`,
      {file, pointer: `${pointer}.recordPath`},
    );
  }
  const recordPath: string[] = [];
  recordPathRaw.forEach((seg, i) => {
    if (typeof seg !== "string" || !seg) {
      throw new StreamConfigError(
        `Operation "${opName}".recordPath[${i}] must be a non-empty string.`,
        {file, pointer: `${pointer}.recordPath[${i}]`},
      );
    }
    recordPath.push(seg);
  });

  // shapeCatalog (optional reference to shapeCatalogs entry)
  const shapeCatalogRaw = e["shapeCatalog"];
  let shapeCatalogName: string | undefined;
  if (shapeCatalogRaw !== undefined) {
    if (typeof shapeCatalogRaw !== "string" || !shapeCatalogRaw) {
      throw new StreamConfigError(
        `Operation "${opName}".shapeCatalog must be a non-empty string.`,
        {file, pointer: `${pointer}.shapeCatalog`},
      );
    }
    if (!(shapeCatalogRaw in shapeCatalogs)) {
      throw new StreamConfigError(
        `Operation "${opName}".shapeCatalog references "${shapeCatalogRaw}" which is not declared under "shapeCatalogs".`,
        {
          file,
          pointer: `${pointer}.shapeCatalog`,
          suggestion: `Add a "shapeCatalogs.${shapeCatalogRaw}" entry, or remove the reference.`,
        },
      );
    }
    shapeCatalogName = shapeCatalogRaw;
  }

  return {
    mode: "stream",
    format,
    mediaType,
    recordPath,
    recordTypeName,
    shapeCatalogName,
  };
}
