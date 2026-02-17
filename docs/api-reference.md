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
}): Promise<void>;
```

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
}
```
