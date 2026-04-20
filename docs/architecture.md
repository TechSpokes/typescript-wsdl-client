# Architecture

Internal architecture of the wsdl-tsc code generator for contributors.

See [CONTRIBUTING](../CONTRIBUTING.md) for development setup and [README](../README.md) for user documentation.

## Pipeline Overview

```text
WSDL Source       Stream Config (optional)
    |                    |
    v                    v
Loader (fetch.ts, wsdlLoader.ts)
    Fetches WSDL from URL or file
    Returns parsed XML document
    |
    v
Compiler (schemaCompiler.ts)
    Walks XSD types, resolves references
    Retains xs:any wildcard particles
    Produces CompiledCatalog
    |
    v
Shape Resolver (shapeResolver.ts, optional)
    Loads companion catalogs
    Copies reachable record-type graphs
    Fails on structural name collisions
    |
    v
Catalog Emitter (generateCatalog.ts)
    Serializes to catalog.json
    |
    +-------+--------+--------+
    |       |        |        |
    v       v        v        v
Client  OpenAPI  Gateway   App
Emitter  Gen      Gen     Gen
```

## Module Responsibilities

### loader/

fetch.ts handles HTTP/HTTPS/file fetching. wsdlLoader.ts handles XML parsing and import/include resolution.

### compiler/

schemaCompiler.ts is the core compiler. It walks XSD complex/simple types, resolves inheritance, handles choices, retains xs:any wildcard particles as catalog metadata, and builds the type graph. generateCatalog.ts serializes compiled types to catalog.json. shapeResolver.ts resolves companion catalogs: it loads each referenced `shapeCatalog` once, copies the reachable record-type graph into the current compilation, and enforces structural-equality collision checks. It mutates the compiled catalog in place and is invoked after schemaCompiler.ts whenever a stream config is present.

### client/

generateClient.ts emits the client class with one method per operation. generateTypes.ts emits interfaces, type aliases, and enums. generateUtils.ts emits runtime metadata for attribute maps and occurrence info.

### openapi/

generateOpenAPI.ts orchestrates the complete OpenAPI document. generateSchemas.ts converts compiled types to JSON Schema. generatePaths.ts generates path items from operations. security.ts processes security configuration files. casing.ts handles path style transformation.

### gateway/

generateGateway.ts orchestrates all gateway file generation. generators.ts contains template emitters for each file type (plugin, routes, schemas, runtime, _typecheck). helpers.ts resolves client metadata, computes paths, and builds URNs.

### app/

generateApp.ts scaffolds server.ts, config.ts, package.json, tsconfig.json, .env.example, and README.md.

### Top-level Modules

pipeline.ts orchestrates the full pipeline from compile through app generation. config.ts provides default compiler options and option merging. cli.ts defines the Yargs CLI and routes commands. index.ts exports the four public API functions.

### util/

tools.ts provides string helpers (pascal, kebab, QName resolution). cli.ts provides console output helpers and error handling. builder.ts provides shared Yargs option builders. streamConfig.ts parses and validates `--stream-config` input into a normalized `StreamConfig` shape; it is parser-only and never touches the filesystem beyond reading the config file itself. runtimeSource.ts reads template strings for the client stream transport.

### runtime/

Template sources embedded into generated clients and gateways. streamXml.ts implements a SAX-driven `parseRecords(stream, spec)` that tracks the configured `recordPath` positionally (duplicate local names allowed) and yields records as their closing tags arrive. ndjson.ts wraps an async iterable of records in a `Readable` that emits NDJSON lines with honored backpressure. clientStreamMethods.tpl.txt and operationsStreamHelper.tpl.txt are text templates emitted into the generated `client.ts` and `operations.ts` when stream operations are present; they encode the `callStream()` transport and the `StreamOperationResponse<T>` type.

### xsd/

primitives.ts maps XSD primitive types to TypeScript types.

## Central Data Structure

The CompiledCatalog is the central data structure:

```text
CompiledCatalog {
  wsdlUri: string
  targetNamespace: string
  serviceName: string
  types: CompiledType[]
  operations: Operation[]
  options: CompilerOptions
}
```

`CompiledType`, type aliases, and operations may include optional `doc` fields populated from WSDL/XSD documentation nodes. The catalog also carries optional `wsdlDocs` arrays for WSDL bindings, messages, parts, services, and ports. Client emitters consume operation and type docs to generate comments in `types.ts`, `operations.ts`, and `client.ts`. OpenAPI emitters consume the same fields for schema/property descriptions and operation summary and description values.

Data flow through the pipeline:

1. schemaCompiler produces CompiledCatalog from WSDL XML
2. generateCatalog serializes it to JSON
3. Client generators read types[] for TypeScript emission
4. OpenAPI generator reads types[] and operations[] for spec generation
5. Gateway generator reads the OpenAPI spec, then enriches operation metadata from catalog operation docs when available

## Extension Points

### Adding a New CLI Flag

1. Add option to builder in src/util/builder.ts
2. Wire it in the command handler in src/cli.ts
3. Pass it through to the relevant generator
4. Update smoke tests if the flag affects output

### Adding a New Generator

1. Create src/<name>/generate<Name>.ts
2. Export the function from src/index.ts
3. Add CLI command in src/cli.ts
4. Wire into pipeline in src/pipeline.ts
5. Add smoke test in package.json

### Adding a New XSD Type Mapping

1. Add mapping in src/xsd/primitives.ts
2. Handle in src/compiler/schemaCompiler.ts if needed
3. Update src/openapi/generateSchemas.ts for JSON Schema output

### Adding a Stream-Capable Operation Output

1. Add a `stream-config` JSON entry for the operation with `recordType` and `recordPath`
2. Declare a `shapeCatalog` entry when the record type lives in a companion WSDL
3. Run the compile command and verify `catalog.operations[].stream` carries normalized metadata
4. The client, OpenAPI, and gateway emitters consume that metadata automatically; no per-emitter code changes are required

## Client Stream Transport

Phase-0 research (see ADR-002) established that `node-soap` buffers the full response before invoking its operation callback. Stream operations cannot use that transport, so the generated client emits a parallel `callStream()` method that POSTs a hand-built SOAP envelope via global `fetch`, captures HTTP headers before the first record, and pipes the response body through `parseRecords`. Buffered operations continue to use `node-soap` unchanged. The two transports coexist on the same client class.
