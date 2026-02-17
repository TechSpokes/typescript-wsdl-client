# CLI Reference

The `wsdl-tsc` tool generates TypeScript SOAP clients, OpenAPI specifications, and Fastify gateways from WSDL files.

## Commands Overview

The tool provides six commands for different integration scenarios.

| Command | Purpose | Typical Use Case |
|---------|---------|------------------|
| pipeline | Full pipeline: client + OpenAPI + gateway + app | CI/CD automation, complete stack generation |
| client | TypeScript SOAP client from WSDL or catalog | Standard SOAP integration |
| openapi | OpenAPI 3.1 spec from WSDL or catalog | Documentation, REST proxies, API gateways |
| gateway | Fastify gateway from OpenAPI spec | Production REST gateway with SOAP backend |
| app | Runnable Fastify app from client + gateway + OpenAPI | Local testing, demos |
| compile | Parse WSDL to catalog.json only | Debugging, multi-stage builds |

## pipeline

Run the complete generation pipeline in one pass: WSDL parsing, TypeScript client, OpenAPI spec, Fastify gateway, and optional app. This is the recommended command for most use cases.

### Usage

```bash
npx wsdl-tsc pipeline \
  --wsdl-source <file|url> \
  [--catalog-file <path>] \
  [--client-dir <path>] \
  [--openapi-file <path>] \
  [--gateway-dir <path>] \
  [options]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--wsdl-source` | Path or URL to WSDL file |

At least one of `--client-dir`, `--openapi-file`, or `--gateway-dir` must be provided.

### Output Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--catalog-file` | Co-located with first output | Output path for catalog.json |

The catalog is auto-placed alongside the first available output directory: `{client-dir}`, `{openapi-file-dir}`, or `{gateway-dir}`.

### Generation Control Flags

| Flag | Description |
|------|-------------|
| `--client-dir` | Generate TypeScript client in this directory |
| `--openapi-file` | Generate OpenAPI spec at this path |
| `--gateway-dir` | Generate Fastify gateway in this directory |
| `--generate-app` | Generate runnable app (requires gateway) |

### Client Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--import-extensions` | `js` | Import style: js, ts, or bare |
| `--client-attributes-key` | `$attributes` | Attribute bag key |
| `--client-class-name` | (derived) | Override client class name |
| `--client-int64-as` | `string` | Map 64-bit integers |
| `--client-bigint-as` | `string` | Map arbitrary-size integers |
| `--client-decimal-as` | `string` | Map xs:decimal |
| `--client-date-as` | `string` | Map date/time types |
| `--client-choice-mode` | `all-optional` | Choice element strategy |
| `--client-fail-on-unresolved` | `false` | Fail on unresolved references |
| `--client-nillable-as-optional` | `false` | Treat nillable as optional |

### OpenAPI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--openapi-format` | `json` | Output format: json, yaml, or both |
| `--openapi-title` | (derived) | API title |
| `--openapi-version` | `0.0.0` | API version |
| `--openapi-description` | (empty) | API description |
| `--openapi-servers` | `/` | Comma-separated server URLs |
| `--openapi-base-path` | (empty) | Base path prefix |
| `--openapi-path-style` | `kebab` | Path transform: kebab, asis, or lower |
| `--openapi-method` | `post` | Default HTTP method |
| `--openapi-tag-style` | `default` | Tag inference: default, service, or first |
| `--openapi-closed-schemas` | `false` | Add additionalProperties: false |
| `--openapi-prune-unused-schemas` | `false` | Emit only referenced schemas |
| `--openapi-envelope-namespace` | `ResponseEnvelope` | Envelope component name suffix |
| `--openapi-error-namespace` | `ErrorObject` | Error object name suffix |
| `--openapi-validate` | `true` | Validate spec with swagger-parser |
| `--openapi-security-config-file` | | Path to security.json |
| `--openapi-tags-file` | | Path to tags.json |
| `--openapi-ops-file` | | Path to ops.json |

### Gateway Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--gateway-service-name` | (required if --gateway-dir) | Service identifier for URN |
| `--gateway-version-prefix` | (required if --gateway-dir) | Version prefix for URN |
| `--gateway-default-status-codes` | 200,400,401,403,404,409,422,429,500,502,503,504 | Status codes to backfill |
| `--gateway-stub-handlers` | `false` | Generate stubs instead of full handlers |
| `--gateway-client-class-name` | (auto-detected) | Override SOAP client class name |
| `--gateway-decorator-name` | {serviceSlug}Client | Fastify decorator name |
| `--gateway-skip-plugin` | `false` | Skip plugin.ts generation |
| `--gateway-skip-runtime` | `false` | Skip runtime.ts generation |

### Pipeline Workflow

Steps execute in order:

1. Parse WSDL and validate
2. Compile catalog (intermediate representation)
3. Write catalog.json (always)
4. Generate client (if --client-dir)
5. Generate OpenAPI (if --openapi-file)
6. Generate gateway (if --gateway-dir)
7. Generate app (if --generate-app)

All steps share the same parsed WSDL and compiled catalog.

### Examples

Complete stack:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir tmp/client \
  --openapi-file tmp/openapi.json \
  --gateway-dir tmp/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

With app generation:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir tmp/client \
  --openapi-file tmp/openapi.json \
  --gateway-dir tmp/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1 \
  --generate-app
```

Client and OpenAPI only:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/Hotel.wsdl \
  --client-dir ./build/client \
  --openapi-file ./docs/hotel-api.json \
  --openapi-format both
```

## client

Generate strongly-typed TypeScript SOAP client code from WSDL or a pre-compiled catalog.

### Usage

```bash
npx wsdl-tsc client --wsdl-source <file|url> --client-dir <path> [options]
npx wsdl-tsc client --catalog-file <path> --client-dir <path> [options]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--wsdl-source` | Path or URL to WSDL file |
| `--client-dir` | Output directory for generated files |

Provide either `--wsdl-source` (compile from WSDL) or `--catalog-file` (use pre-compiled catalog). When using `--wsdl-source`, the catalog is auto-generated in the client directory unless overridden with `--catalog-file`.

### Generated Files

| File | Purpose |
|------|---------|
| `client.ts` | Typed SOAP client with one method per operation |
| `types.ts` | Flattened TypeScript interfaces, type aliases, enums |
| `utils.ts` | Runtime metadata for JSON-to-SOAP conversion |
| `catalog.json` | Generated in client directory when using --wsdl-source |

### Optional Flags

All flags from the compile command apply, plus the client-specific flags listed in the pipeline section.

### Key Modeling Rules

- Attributes and elements become peer properties (flattened)
- Text content becomes `$value` property
- Required: `use!="optional"` for attributes; `minOccurs>=1` for elements
- Arrays: `maxOccurs>1` or `unbounded` become arrays
- Nillable: `nillable="true"` preserved (optionally model as optional)
- Inheritance: extensions merged or emitted as extends

### Examples

Basic:

```bash
npx wsdl-tsc client \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir tmp/client
```

From catalog:

```bash
npx wsdl-tsc client \
  --catalog-file build/hotel-catalog.json \
  --client-dir ./src/services/hotel
```

## openapi

Generate OpenAPI 3.1 specification from WSDL or pre-compiled catalog.

### Usage

```bash
npx wsdl-tsc openapi --wsdl-source <file|url> --openapi-file <path> [options]
npx wsdl-tsc openapi --catalog-file <path> --openapi-file <path> [options]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--openapi-file` | Output path for OpenAPI specification |

### Input Source Flags

These flags are mutually exclusive.

| Flag | Default | Description |
|------|---------|-------------|
| `--wsdl-source` | (none) | Path or URL to WSDL |
| `--catalog-file` | {openapi-file-dir}/catalog.json | Pre-compiled catalog |

### Response Envelope

All responses are wrapped in a standard envelope (always-on since v0.7.1).

Base structure:

```typescript
{
  status: string;
  message: string | null;
  data: T | null;
  error: ErrorObject | null;
}
```

Error structure:

```typescript
{
  code: string;
  message: string;
  details: object | null;
}
```

The base envelope is named `${serviceName}ResponseEnvelope` (override with `--openapi-envelope-namespace`). The error object is named `${serviceName}ErrorObject` (override with `--openapi-error-namespace`). Per-operation envelopes are named `<PayloadType|OperationName><EnvelopeNamespace>`. If a payload type ends with the namespace prefix, an underscore is inserted to avoid collisions.

### Tag Inference Strategies

| Strategy | Behavior |
|----------|----------|
| `default` | Single tag = service name (fallback SOAP) |
| `service` | Always service name |
| `first` | First lexical CamelCase segment |

Use `--openapi-tags-file` for explicit mapping.

### Output Determinism

All specs have deterministic ordering. Paths, methods, schemas, security schemes, parameters, and tags are sorted alphabetically.

### Examples

Basic:

```bash
npx wsdl-tsc openapi \
  --wsdl-source examples/minimal/weather.wsdl \
  --openapi-file ./docs/weather-api.json
```

Multi-format:

```bash
npx wsdl-tsc openapi \
  --wsdl-source https://example.com/Hotel.wsdl \
  --openapi-file ./docs/hotel-api \
  --openapi-format both \
  --openapi-servers https://api.example.com/v1
```

## gateway

Generate production-ready Fastify gateway with route handlers from an OpenAPI specification.

### Usage

```bash
npx wsdl-tsc gateway \
  --openapi-file <path> \
  --client-dir <path> \
  --gateway-dir <path> \
  --gateway-service-name <slug> \
  --gateway-version-prefix <slug> \
  [options]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--openapi-file` | Path to OpenAPI 3.1 JSON or YAML file |
| `--client-dir` | Path to client directory |
| `--gateway-dir` | Output directory for gateway code |
| `--gateway-service-name` | Service identifier for URN generation |
| `--gateway-version-prefix` | Version prefix for URN generation |

Route URLs are derived from OpenAPI paths, which include any base path from `--openapi-base-path`.

### Generated Output Structure

```text
{gateway-dir}/
├── schemas/
│   ├── models/         # JSON Schema with URN IDs
│   └── operations/     # Fastify operation schemas
├── routes/             # Route handlers with full implementations
├── schemas.ts          # Schema registration module
├── routes.ts           # Route aggregator
├── runtime.ts          # Envelope builders, error handlers
└── plugin.ts           # Fastify plugin wrapper (recommended entry point)
```

### URN-Based Schema IDs

Format: `urn:services:{serviceSlug}:{versionSlug}:schemas:{models|operations}:{schemaSlug}`

### Contract Assumptions

- All request/response bodies must use `$ref` to `components.schemas`
- Every operation must have a default response with `application/json`
- All referenced schemas must exist in `components.schemas`

### Examples

Basic:

```bash
npx wsdl-tsc gateway \
  --openapi-file ./docs/weather-api.json \
  --client-dir ./src/services/weather \
  --gateway-dir ./src/gateway/weather \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

## app

Generate a runnable Fastify application integrating client, gateway, and OpenAPI spec.

### Usage

```bash
npx wsdl-tsc app \
  --client-dir <path> \
  --gateway-dir <path> \
  --openapi-file <path> \
  [--app-dir <path>] \
  [options]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--client-dir` | Path to client directory |
| `--gateway-dir` | Path to gateway directory |
| `--openapi-file` | Path to OpenAPI spec |

### Optional Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--catalog-file` | {client-dir}/catalog.json | Path to catalog.json |
| `--app-dir` | {gateway-dir}/../app | Output directory |
| `--import-extensions` | Inferred or js | Import style |
| `--host` | 127.0.0.1 | Default server host |
| `--port` | 3000 | Default server port |
| `--prefix` | (empty) | Route prefix |
| `--logger` | true | Enable Fastify logger |
| `--openapi-mode` | copy | copy or reference |

### Generated Structure

```text
app/
├── server.js        # Main entry point
├── config.js        # Configuration with env support
├── .env.example     # Environment template
├── README.md        # Usage instructions
└── openapi.json     # OpenAPI spec (when --openapi-mode=copy)
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `WSDL_SOURCE` | From catalog or required | WSDL URL or path |
| `HOST` | 127.0.0.1 | Server bind address |
| `PORT` | 3000 | Server listen port |
| `PREFIX` | (empty) | Route prefix |
| `LOGGER` | true | Fastify logger |

### Endpoints

- `GET /health` returns `{ "ok": true }`
- `GET /openapi.json` returns the OpenAPI specification
- All SOAP operations are exposed as REST endpoints

The app can also be generated via pipeline with `--generate-app`.

## compile

Parse WSDL and generate only the intermediate catalog.json representation. This is an advanced command for debugging and multi-stage builds.

### Usage

```bash
npx wsdl-tsc compile --wsdl-source <file|url> --catalog-file <path> [options]
```

### Required Flags

| Flag | Description |
|------|-------------|
| `--wsdl-source` | Path or URL to WSDL file |
| `--catalog-file` | Output path for catalog.json |

### Catalog Co-location

Default behavior varies by command:

| Command | Default catalog location |
|---------|--------------------------|
| compile | Always requires explicit `--catalog-file` |
| client | `{client-dir}/catalog.json` |
| openapi | `{openapi-file-dir}/catalog.json` |
| pipeline | Cascade: `{client-dir}` then `{openapi-dir}` then `{gateway-dir}` then `tmp/` |

## Common Workflows

### Choosing a Command

| Goal | Command | Example |
|------|---------|---------|
| Everything | pipeline | `npx wsdl-tsc pipeline --wsdl-source svc.wsdl --client-dir ./client --openapi-file ./api.json --gateway-dir ./gw --gateway-service-name svc --gateway-version-prefix v1` |
| TypeScript client only | client | `npx wsdl-tsc client --wsdl-source svc.wsdl --client-dir ./client` |
| OpenAPI spec only | openapi | `npx wsdl-tsc openapi --wsdl-source svc.wsdl --openapi-file ./api.json` |
| REST gateway only | gateway | `npx wsdl-tsc gateway --openapi-file ./api.json --client-dir ./client --gateway-dir ./gw --gateway-service-name svc --gateway-version-prefix v1` |
| Runnable server | app | `npx wsdl-tsc app --client-dir ./client --gateway-dir ./gw --openapi-file ./api.json` |
| Debug WSDL | compile | `npx wsdl-tsc compile --wsdl-source svc.wsdl --catalog-file ./catalog.json` |

### CI/CD Multi-Stage Build

Compile once and reuse the catalog across multiple generation steps:

```bash
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/Service.wsdl \
  --catalog-file ./build/service-catalog.json
```

```bash
npx wsdl-tsc client \
  --catalog-file ./build/service-catalog.json \
  --client-dir ./src/services/service
```

```bash
npx wsdl-tsc openapi \
  --catalog-file ./build/service-catalog.json \
  --openapi-file ./docs/service-api.json
```

### Debugging Complex WSDL

Compile to catalog and inspect the intermediate representation:

```bash
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/Complex.wsdl \
  --catalog-file ./debug/catalog.json
```

Inspect types and operations with `jq`:

```bash
cat ./debug/catalog.json | jq '.types'
```

```bash
cat ./debug/catalog.json | jq '.operations'
```
