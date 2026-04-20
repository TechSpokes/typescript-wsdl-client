# Programmatic API

All CLI commands are available as TypeScript functions. This document covers each exported function, its usage, and its type signatures.

See the main [README](../README.md) for installation, CLI usage, and project overview.

## compileWsdlToProject

Generate a TypeScript SOAP client from WSDL.

```typescript
import { compileWsdlToProject } from "@techspokes/typescript-wsdl-client";

await compileWsdlToProject({
  wsdl: "./wsdl/Hotel.wsdl",
  outDir: "./src/services/hotel",
  options: {
    imports: "js",
    catalog: true,
    primitive: {
      int64As: "number",
      bigIntegerAs: "string",
      decimalAs: "string",
      dateAs: "string"
    },
    choice: "all-optional",
    clientName: "HotelClient",
    nillableAsOptional: false
  }
});
```

### Type Signature

```typescript
function compileWsdlToProject(input: {
  wsdl: string;
  outDir: string;
  options?: Partial<CompilerOptions>;
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}): Promise<void>;
```

`streamConfigFile` points at a JSON file parsed by `loadStreamConfigFile`. `streamConfig` accepts an already-parsed value; `streamConfigFile` takes precedence when both are set. Buffered generation is unchanged when both are omitted. See [Stream Configuration](configuration.md#stream-configuration) for the file format and [ADR-002](decisions/002-streamable-responses.md) for rationale.

### CompilerOptions

```typescript
interface CompilerOptions {
  wsdl: string;
  out: string;
  imports: "js" | "ts" | "bare";
  catalog: boolean;
  primitive: PrimitiveOptions;
  choice?: "all-optional" | "union";
  failOnUnresolved?: boolean;
  attributesKey?: string;
  clientName?: string;
  nillableAsOptional?: boolean;
}

interface PrimitiveOptions {
  int64As?: "string" | "number" | "bigint";
  bigIntegerAs?: "string" | "number";
  decimalAs?: "string" | "number";
  dateAs?: "string" | "Date";
}
```

## generateOpenAPI

Generate an OpenAPI 3.1 specification from WSDL or catalog.

```typescript
import { generateOpenAPI } from "@techspokes/typescript-wsdl-client";

const { doc, jsonPath, yamlPath } = await generateOpenAPI({
  wsdl: "./wsdl/Hotel.wsdl",
  outFile: "./docs/hotel-api",
  format: "both",
  title: "Hotel Booking API",
  version: "1.0.0",
  servers: ["https://api.example.com/v1"],
  basePath: "/booking",
  pathStyle: "kebab",
  tagStyle: "service",
  validate: true
});
```

### Type Signature

```typescript
function generateOpenAPI(opts: GenerateOpenAPIOptions): Promise<{
  doc: any;
  jsonPath?: string;
  yamlPath?: string;
}>;
```

### GenerateOpenAPIOptions

```typescript
interface GenerateOpenAPIOptions {
  wsdl?: string;
  catalogFile?: string;
  compiledCatalog?: CompiledCatalog;
  outFile?: string;
  format?: "json" | "yaml" | "both";
  title?: string;
  version?: string;
  description?: string;
  servers?: string[];
  basePath?: string;
  pathStyle?: "kebab" | "asis" | "lower";
  defaultMethod?: string;
  closedSchemas?: boolean;
  pruneUnusedSchemas?: boolean;
  tagStyle?: "default" | "first" | "service";
  tagsFile?: string;
  securityConfigFile?: string;
  opsFile?: string;
  envelopeNamespace?: string;
  errorNamespace?: string;
  validate?: boolean;
  skipValidate?: boolean;
  asYaml?: boolean;  // deprecated
}
```

## generateGateway

Generate Fastify gateway code from an OpenAPI specification.

```typescript
import { generateGateway } from "@techspokes/typescript-wsdl-client";

await generateGateway({
  openapiFile: "./docs/hotel-api.json",
  outDir: "./src/gateway/hotel",
  clientDir: "./src/services/hotel",
  versionSlug: "v1",
  serviceSlug: "hotel",
  defaultResponseStatusCodes: [200, 400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504],
  imports: "js"
});
```

### Type Signature

```typescript
function generateGateway(opts: GenerateGatewayOptions): Promise<void>;
```

### GenerateGatewayOptions

```typescript
interface GenerateGatewayOptions {
  openapiFile?: string;
  openapiDocument?: any;
  outDir: string;
  clientDir?: string;
  versionSlug?: string;
  serviceSlug?: string;
  defaultResponseStatusCodes?: number[];
  imports?: "js" | "ts" | "bare";
}
```

## runGenerationPipeline

Run the complete pipeline: client, OpenAPI, and gateway in one pass.

```typescript
import { runGenerationPipeline } from "@techspokes/typescript-wsdl-client";

const { compiled, openapiDoc } = await runGenerationPipeline({
  wsdl: "./wsdl/Hotel.wsdl",
  catalogOut: "./build/hotel-catalog.json",
  clientOutDir: "./src/services/hotel",
  compiler: {
    imports: "js",
    primitive: {
      int64As: "number",
      decimalAs: "string"
    }
  },
  openapi: {
    outFile: "./docs/hotel-api.json",
    format: "both",
    servers: ["https://api.example.com/v1"],
    tagStyle: "service"
  },
  gateway: {
    outDir: "./src/gateway/hotel",
    versionSlug: "v1",
    serviceSlug: "hotel"
  }
});
```

### Type Signature

```typescript
function runGenerationPipeline(opts: PipelineOptions): Promise<{
  compiled: CompiledCatalog;
  openapiDoc?: any;
}>;
```

### PipelineOptions

```typescript
interface PipelineOptions {
  wsdl: string;
  catalogOut: string;
  clientOutDir?: string;
  compiler?: Partial<CompilerOptions>;
  openapi?: Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog"> & {
    outFile?: string;
  };
  gateway?: Omit<GenerateGatewayOptions, "openapiFile" | "openapiDocument"> & {
    outDir?: string;
  };
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}
```

`streamConfigFile` and `streamConfig` are threaded through the compile step and into every downstream emitter via `catalog.json`. Relative paths in `shapeCatalogs` resolve against the stream-config file's directory when `streamConfigFile` is used, otherwise against the WSDL's directory.

## Stream Configuration Helpers

These exports back the `--stream-config` CLI flag and are also usable directly in programmatic flows.

### loadStreamConfigFile

Read a stream-config JSON file from disk and return a parsed, validated `StreamConfig`. Throws `StreamConfigError` on missing files, invalid JSON, or schema violations.

```typescript
import { loadStreamConfigFile } from "@techspokes/typescript-wsdl-client";

const streamConfig = loadStreamConfigFile("./stream.config.json");
```

### parseStreamConfig

Parse and validate a stream configuration from an in-memory value. Useful when the config originates from a build tool or a remote source rather than a file.

```typescript
import { parseStreamConfig } from "@techspokes/typescript-wsdl-client";

const streamConfig = parseStreamConfig({
  operations: {
    MyStreamOp: {
      recordType: "MyRecordType",
      recordPath: ["MyStreamOpResponse", "Records", "Record"],
    },
  },
});
```

### StreamConfigError

Thrown by `loadStreamConfigFile` and `parseStreamConfig` when the configuration is invalid. Use `.toUserMessage()` to render a multi-line, human-readable error suitable for CLI output.

```typescript
import { StreamConfigError } from "@techspokes/typescript-wsdl-client";

try {
  loadStreamConfigFile("./stream.config.json");
} catch (err) {
  if (err instanceof StreamConfigError) {
    console.error(err.toUserMessage());
    process.exit(1);
  }
  throw err;
}
```

### applyShapeCatalogs

Resolve companion catalogs against a compiled catalog, copying reachable record-type graphs into place. `runGenerationPipeline` and `compileWsdlToProject` call this automatically when a stream config is present; it is exported for custom pipelines.

```typescript
import {
  applyShapeCatalogs,
  loadStreamConfigFile,
} from "@techspokes/typescript-wsdl-client";
import path from "node:path";

const streamConfig = loadStreamConfigFile("./stream.config.json");
await applyShapeCatalogs(compiled, streamConfig, {
  baseDir: path.dirname(path.resolve("./stream.config.json")),
});
```

### ApplyShapeCatalogsOptions

```typescript
interface ApplyShapeCatalogsOptions {
  baseDir?: string;
}
```

`baseDir` is the directory against which relative `catalogFile` and `wsdlSource` paths are resolved. Defaults to `process.cwd()`.

### StreamConfig

```typescript
interface StreamConfig {
  shapeCatalogs: Record<string, ShapeCatalogRef>;
  operations: Record<string, OperationStreamMetadata>;
}

interface ShapeCatalogRef {
  wsdlSource?: string;
  catalogFile?: string;
}

interface OperationStreamMetadata {
  mode: "stream";
  format: "ndjson" | "json-array";
  mediaType: string;
  recordPath: string[];
  recordTypeName: string;
  shapeCatalogName?: string;
  sourceOutputTypeName?: string;
}
```

Exactly one of `wsdlSource` or `catalogFile` must be set on each `ShapeCatalogRef`. `OperationStreamMetadata` is produced by the parser; `sourceOutputTypeName` is populated by the compiler when it binds the operation to the main WSDL.

## End-to-End Example

Compile with a stream config, verify the catalog carries the expected metadata, and run the full pipeline:

```typescript
import {
  loadStreamConfigFile,
  runGenerationPipeline,
} from "@techspokes/typescript-wsdl-client";

const streamConfig = loadStreamConfigFile("./stream.config.json");

const { compiled, openapiDoc } = await runGenerationPipeline({
  wsdl: "./wsdl/Service.wsdl",
  catalogOut: "./build/service-catalog.json",
  clientOutDir: "./src/services/service",
  compiler: { imports: "js" },
  openapi: {
    outFile: "./docs/service-api.json",
    format: "json",
    servers: ["https://api.example.com/v1"],
  },
  gateway: {
    outDir: "./src/gateway/service",
    versionSlug: "v1",
    serviceSlug: "service",
  },
  streamConfig,
});

const streamOp = compiled.operations.find((op) => op.stream);
console.log(streamOp?.stream?.mediaType); // "application/x-ndjson"
```

The generated client exports a `StreamOperationResponse<RecordType>` type; each stream-configured operation returns `Promise<StreamOperationResponse<RecordType>>` with `records: AsyncIterable<RecordType>`.
