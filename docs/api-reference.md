# Programmatic API

This reference covers public generation, composition, stream and security APIs. Assessment and checked planning are separate diagnostic surfaces; see [checked generation](checked-generation.md#programmatic-planning-and-generation).

See the main [README](../README.md) for installation, CLI usage, and project overview.

## Captured checked SOAP responses

`inspectCheckedResponse(source, options)` returns versioned diagnostic data without generating files or dispatching SOAP. Supply an authorized local WSDL, closed snapshots in `checkedComponents`, a full operation selector, and `responseBytes`. Optional `responseMetadata` supplies the actual HTTP `status`, `contentType` and `contentEncoding`. Omission leaves HTTP duties unassessed. `signal` and `limits` retain cancellation and XML capacity controls.

```typescript
import {inspectCheckedResponse} from '@techspokes/typescript-wsdl-client';

const report = await inspectCheckedResponse('./sources/service.wsdl', {
  checkedComponents: configuration,
  selector: configuration.selectors[0],
  responseBytes: capturedBytes,
});
console.log(report.kind);
```

The report separates wrapper and companion outcomes and excludes raw XML and decoded values. Configuration can select a consumer-owned `sourceCorrectionsFile`; the same effective contract is used for planning, inspection and generation. A correction draft does not authorize execution until its semantic choices are completed. See [source corrections and offline inspection](checked-gateway.md#consumer-owned-source-corrections).

Optional `diagnostic` metadata uses `CheckedPayloadDiagnostic` and `checked-payload-diagnostic-v1` across inspection and newly generated runtime/gateway failures. It identifies native scoped declarations, effective types and bounded known-field locations without source locators or payload values. For explicit local authoring, `includeCorrectionTargets: true` adds `CheckedResponseCorrectionTarget` descriptors with original pinned selectors and original `declaredType`, or an unavailable reason; retain these trusted locators outside HTTP responses and logs. See [trusted original correction targets](checked-gateway.md#trusted-original-correction-targets) for compatibility and recovery rules.

Set `includeCorrectionDraft: true` to request an available correction draft. Its exact resource pins can contain local source URIs; default reports retain only diagnostic resource labels.

Pass the complete multi-operation checked configuration unchanged. Inspection authenticates the complete correction-source closure before selecting the requested operation and its projection; inactive companions retain their freshness checks.

## Checked runtime bindings

New SOAP 1.1 component clients inject package-root `checkedComponentRuntimeV3` with handshake `checked-component-soap11-runtime-v1`. SOAP 1.2 keeps `checkedComponentRuntimeV2`, and existing SOAP 1.1 artifacts keep their V1 binding. These injection contracts are separate from package and capsule versions.

A V3 protocol `soap-fault` exposes version `1.1`, expanded `code`, `string`, optional `actor`, response bytes and transport status without a declared application `value` or fault `name`. A uniquely declared fault detail retains native decoding; malformed declared content is refused. See [runtime compatibility](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/005-checked-protocol-fault-compatibility.md) and [migration](migration.md#from-13x-to-140).

All file-producing APIs automatically apply [TypeScript preambles](generated-code.md#generated-preambles-and-eslint). Adding a preamble does not change an API signature or option; existing scaffold skip/force behavior still applies. Resource and TypeScript file-write failures propagate to callers.

Generated-output compatibility is versioned separately from those preambles. Read the [migration guide for the intended version](migration.md), including [1.3.x-to-1.4.0 runtime adoption](migration.md#from-13x-to-140), before regenerating existing clients or changing their selected profile.

## compileWsdlToProject

Generate a TypeScript SOAP client from WSDL.

```typescript
import { compileWsdlToProject } from "@techspokes/typescript-wsdl-client";

await compileWsdlToProject({
  wsdl: "./wsdl/Hotel.wsdl",
  outDir: "./src/services/hotel",
  options: {
    wsdl: "./wsdl/Hotel.wsdl",
    out: "./src/services/hotel",
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
declare function compileWsdlToProject(input: {
  wsdl: string;
  outDir: string;
  options?: CompilerOptions;
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}): Promise<void>;
```

`streamConfigFile` points at raw JSON parsed by `loadStreamConfigFile`; `streamConfig` accepts normalized metadata from `parseStreamConfig`. The file takes precedence when both are set. Omitting both retains buffered API selection, without a byte-for-byte output guarantee across upgrades. See [Stream Configuration](configuration.md#stream-configuration).

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

`CompilerOptions.choice` defaults to `all-optional`. Set `choice: "union"` to model `xs:choice` groups as exclusive branch unions in generated client types and catalog-backed OpenAPI schemas.

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
declare function generateOpenAPI(opts: GenerateOpenAPIOptions): Promise<{
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
  flattenArrayWrappers?: boolean;
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

`securityConfigFile` accepts the shared security configuration documented in
[Configuration](configuration.md#security-configuration). The config can describe
gateway OpenAPI security and upstream SOAP runtime security for generated apps.

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
declare function generateGateway(opts: GenerateGatewayOptions): Promise<void>;
```

### GenerateGatewayOptions

```typescript
interface GenerateGatewayOptions {
  openapiFile?: string;
  openapiDocument?: any;
  outDir: string;
  clientDir?: string;
  versionSlug: string;
  serviceSlug: string;
  defaultResponseStatusCodes?: number[];
  imports?: "js" | "ts" | "bare";
  clientClassName?: string;
  clientDecoratorName?: string;
  catalogFile?: string;
  emitPlugin?: boolean;
  emitRuntime?: boolean;
  stubHandlers?: boolean;
  flattenArrayWrappers?: boolean;
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

Programmatic callers opt into choice union mode by passing `compiler: { choice: "union" }` to `runGenerationPipeline`:

```typescript
await runGenerationPipeline({
  wsdl: "./service.wsdl",
  catalogOut: "./.generated/catalog.json",
  clientOutDir: "./.generated/client",
  openapi: {
    outFile: "./.generated/openapi.json"
  },
  gateway: {
    outDir: "./.generated/gateway",
    serviceSlug: "service",
    versionSlug: "v1"
  },
  compiler: { choice: "union" }
});
```

### Type Signature

```typescript
declare function runGenerationPipeline(opts: PipelineOptions): Promise<{
  compiled: any;
  openapiDoc?: any;
  checked?: CheckedInventory;
  planning?: CheckedComponentPlan;
}>;
```

### PipelineOptions

```typescript
interface PipelineOptions {
  model?: "legacy" | "checked-components-v1";
  checkedComponents?: Partial<CheckedComponentOptions>;
  wsdl: string;
  catalogOut?: string;
  clientOutDir?: string;
  compiler?: Partial<CompilerOptions>;
  openapi?: Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog"> & {
    outFile?: string;
  };
  gateway?: Omit<GenerateGatewayOptions, "openapiFile" | "openapiDocument"> & {
    outDir?: string;
    versionSlug: string;
    serviceSlug: string;
  };
  app?: {
    appDir: string;
    openapiMode?: "copy" | "reference";
    force?: boolean;
    host?: string;
    port?: number;
    prefix?: string;
    securityConfigFile?: string;
  };
  test?: {testDir: string; force?: boolean; flattenArrayWrappers?: boolean};
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}
```

`streamConfigFile` and `streamConfig` are threaded through the compile step and into every downstream emitter via `catalog.json`. Relative paths in `shapeCatalogs` resolve against the stream-config file's directory when `streamConfigFile` is used, otherwise against the WSDL's directory.

Legacy calls require `catalogOut` at runtime. Checked component calls use `model: "checked-components-v1"` and optional `checkedComponents`; they return checked inventory/planning instead of a legacy catalog contract. See [the complete programmatic checked example](checked-generation.md#programmatic-planning-and-generation) for source policy and planning before generation. Checked RPC outputs remain opaque strings and buffered checked values; legacy stream configuration does not activate checked streaming.

## runMultiServicePipeline

Generate independent legacy clients and service routers, then publish one aggregate gateway plugin and combined OpenAPI JSON document. The [multi-service guide](gateway-guide.md#multi-service-setup) supplies a complete configuration with explicit, disjoint outputs:

```typescript
import {loadMultiServiceConfig, runMultiServicePipeline} from "@techspokes/typescript-wsdl-client";

const options = await loadMultiServiceConfig("./services.json");
const result = await runMultiServicePipeline(options);
```

```typescript
interface MultiServiceEntry {
  key: string;
  generation: PipelineOptions;
}

interface MultiServicePipelineOptions {
  services: readonly MultiServiceEntry[];
  openapi: OpenApiCompositionOptions & {outFile: string};
  gateway: {
    outDir: string;
    imports?: "js" | "ts" | "bare";
    openapiPath?: string | false;
  };
}

interface MultiServicePipelineResult {
  openapiDoc: ComposedOpenApiDocument;
  services: Record<string, {compiled: CompiledCatalog; clientDir: string; gatewayDir: string}>;
  pluginFile: string;
  openapiFile: string;
}

declare function runMultiServicePipeline(options: MultiServicePipelineOptions): Promise<MultiServicePipelineResult>;
declare function loadMultiServiceConfig(file: string): Promise<MultiServicePipelineOptions>;
```

`loadMultiServiceConfig` resolves filesystem paths against the JSON configuration file; direct API callers supply paths relative to their process working directory. Every service needs `wsdl`, `catalogOut`, `clientOutDir`, `openapi.outFile`, `openapi.basePath`, `gateway.outDir`, `gateway.serviceSlug` and `gateway.versionSlug`. Service keys use unique lowercase letters, digits and hyphens, starting with a letter; gateway service slugs and decorators must remain unique after normalization.

The API preserves each source's compiler and stream settings, generated client, catalog and SOAP dispatch. It refuses overlapping output ownership, duplicate final paths, lost operation routes, and unsupported app/test/checked settings. A failed later service can leave earlier service artifacts, while the previously published aggregate spec/plugin pair remains intact.

The generated aggregate plugin exports `createClients`, `MultiServiceClientOptions`, `MultiServiceClients` and `openapi`. `createClients` requires exactly the service keys, each with its generated client's constructor options, including an explicit runtime `source`; register the plugin with `{clients}`. Prefixes come from each service's `openapi.basePath`, and the aggregate refuses runtime Fastify prefixes.

## composeOpenApiDocuments

Compose existing OpenAPI 3.1 documents without generating clients or routers:

Checked documents regenerated with 1.4.1 or later support this API. Regeneration relocates generator-owned local schema resources while preserving configured names and native supplemental-validation metadata. Archived resource-bearing documents remain unsupported; composition does not replace native XML validation.

```typescript
interface OpenApiCompositionEntry {key: string; document: unknown}
interface OpenApiCompositionOptions {
  title?: string;
  version?: string;
  description?: string;
  servers?: readonly string[];
}

declare function composeOpenApiDocuments(
  entries: readonly OpenApiCompositionEntry[],
  options?: OpenApiCompositionOptions,
): ComposedOpenApiDocument;
```

Components become `serviceKey__ComponentName`, while operation IDs and tags become `serviceKey.originalName`. The merger rewrites supported reference-bearing positions, link operation targets, discriminator targets and security scheme names, preserving service-local security and server semantics. It also qualifies the known `x-wsdl-tsc-stream.itemSchema` reference so clients can discover the stream record contract.

Literal examples and unrelated extension payloads remain data. Duplicate paths, unresolved local references, relative external references and unsupported schema resource/anchor contexts are refused.

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

`format` selects the gateway wire format. `ndjson` emits one JSON document per line with the default `application/x-ndjson` media type, and `json-array` emits one JSON array document with the default `application/json` media type.

## Security Configuration Helpers

Parse and build the shared security configuration used by OpenAPI generation and
the app scaffold.

```typescript
import {
  buildSecurity,
  loadSecurityConfigFile,
  parseSecurityConfig,
} from "@techspokes/typescript-wsdl-client";

const config = loadSecurityConfigFile("./security.json");
const built = buildSecurity(config);
console.log(built.securitySchemes);
```

`parseSecurityConfig` accepts the same JSON shape as `loadSecurityConfigFile`.
`SecurityConfigError` is thrown for invalid schemes or malformed sections.

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
console.log(streamOp?.stream?.mediaType); // "application/x-ndjson" by default
```

### Generated stream client contract

Generated `operations.ts` exports `StreamOperationResponse<RecordType>` and `StreamCallOptions`; `client.ts` also re-exports `StreamCallOptions`. Each stream-configured operation accepts `(args, options?)` and returns `Promise<StreamOperationResponse<RecordType>>` with `records: AsyncIterable<RecordType>`:

```typescript
interface StreamCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

interface StreamOperationResponse<RecordType, HeadersType = Record<string, unknown>> {
  records: AsyncIterable<RecordType>;
  headers: HeadersType;
  requestRaw?: string;
}
```

Records use the public legacy DTO mapping: flattened attributes, projected scalar values, typed simple content, XML lists and declared repeated-element arrays. Each record is mapped after its closing XML tag; the low-level parser still returns lexical values and attribute bags. Gateway wrapper flattening applies per record when enabled, and checked value shapes are unchanged.

Only stream-enabled generated clients add constructor `streamRequestOptions?: IExOptions` from `soap`. These HTTP options are separate from WSDL loading and support a verified HTTPS agent, HTTP timeout and signal; `options.httpClient` must implement `requestStream`, or the standard node-soap HTTP client is used with `options.request`. Stream calls honor the current endpoint override, static headers and supported `ISecurity` hooks; see [transport support and refusals](gateway-guide.md#streaming-transport-settings).

Per-call `timeoutMs` is a positive integer deadline for the upstream HTTP exchange and record consumption, starting after metadata initialization. A per-call signal already aborted rejects before metadata initialization. Exhaust or return the iterator to release transport resources; generated gateways connect downstream disconnects to that signal before waiting for SOAP headers and throughout delivery. Dates retain the existing type-level mapping, and `bigint` has no additional JSON encoding convention.
