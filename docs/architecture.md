# Architecture

Internal architecture of the wsdl-tsc code generator for contributors.

See [CONTRIBUTING](../CONTRIBUTING.md) for development setup and [README](../README.md) for user documentation.

## Pipeline Overview

```text
WSDL Source
    |
    v
Loader (fetch.ts, wsdlLoader.ts)
    Fetches WSDL from URL or file
    Returns parsed XML document
    |
    v
Compiler (schemaCompiler.ts)
    Walks XSD types, resolves references
    Produces CompiledCatalog
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

schemaCompiler.ts is the core compiler. It walks XSD complex/simple types, resolves inheritance, handles choices, and builds the type graph. generateCatalog.ts serializes compiled types to catalog.json.

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

tools.ts provides string helpers (pascal, kebab, QName resolution). cli.ts provides console output helpers and error handling. builder.ts provides shared Yargs option builders.

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

Data flow through the pipeline:

1. schemaCompiler produces CompiledCatalog from WSDL XML
2. generateCatalog serializes it to JSON
3. Client generators read types[] for TypeScript emission
4. OpenAPI generator reads types[] and operations[] for spec generation
5. Gateway generator reads the OpenAPI spec (not the catalog directly)

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
