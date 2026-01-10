# TypeScript WSDL Client

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![npm downloads](https://img.shields.io/npm/dm/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![GitHub Stars](https://img.shields.io/github/stars/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/network/members)
[![TechSpokes Org](https://img.shields.io/badge/org-techspokes-181717?logo=github)](https://github.com/techspokes)
[![Sponsor](https://img.shields.io/badge/sponsor-GitHub-blue?logo=github-sponsors)](https://github.com/sponsors/TechSpokes)

> **Mission**: Transform complex WSDL/XSD definitions into ergonomic, type-safe TypeScript SOAP clients with optional OpenAPI 3.1 specs and Fastify REST gateway scaffolding — enabling confident integration with legacy enterprise services.

---

## Table of Contents

- [1. Why This Project](#1-why-this-project-what-sets-it-apart)
- [2. Installation](#2-installation)
- [3. Quick Start](#3-quick-start)
- [4. Commands Overview](#4-commands-overview)
- [5. Command: `compile`](#5-command-compile)
- [6. Command: `client`](#6-command-client)
- [7. Command: `openapi`](#7-command-openapi)
- [8. Command: `gateway`](#8-command-gateway)
- [9. Command: `pipeline`](#9-command-pipeline)
- [10. Working With Generated Clients](#10-working-with-generated-clients)
- [11. OpenAPI Configuration](#11-openapi-configuration)
- [12. Programmatic API](#12-programmatic-api)
- [13. Advanced Topics](#13-advanced-topics)
- [14. Troubleshooting](#14-troubleshooting)
- [15. Contributing](#15-contributing)
- [16. License](#16-license)
- [17. Sponsors](#17-sponsors)

---

## 1. Why This Project (What Sets It Apart)

Most WSDL generators produce loosely typed stubs or expose raw XML complexity to your application layer. This tool delivers **correct flattening, determinism, and multiple integration paths**:

| Core Differentiator                  | What You Get                                                                                         |
|--------------------------------------|------------------------------------------------------------------------------------------------------|
| **Attribute + Element Flattening**   | Attributes and child elements appear as peer properties (no nested wrapper noise).                   |
| **`$value` Text Content Convention** | Simple text & mixed content always represented as a `$value` property (collision-safe & documented). |
| **Inheritance Resolution**           | `complexContent` and `simpleContent` extensions are merged or extended consistently.                 |
| **Choice Strategy**                  | Predictable `all-optional` modeling today (future advanced discriminators planned).                  |
| **WS-Policy Security Hints**         | Inline scan of policies surfaces required auth hints (e.g. `usernameToken`, `https`).                |
| **Deterministic Output**             | Sorted declarations and stable alias resolution for diff-friendly regeneration.                      |
| **Primitive Mapping Controls**       | Explicit flags for long / big integer / decimal / temporal families (string-first safety).           |
| **Catalog Introspection**            | One JSON artifact (`catalog.json`) to drive further tooling (including OpenAPI & gateway).           |
| **OpenAPI 3.1 Bridge**               | Mirrors the exact TypeScript model with no divergence between runtime and spec.                      |
| **Standard Response Envelope**       | Always-on, debuggable envelope structure (status, message, data, error) for REST gateways.           |
| **Fastify Gateway Scaffolding**      | Route and schema generation with JSON Schema validation (handler implementation in progress).        |
| **Multi-format Output**              | `--openapi-format json\|yaml\|both` with always-on validation (unless disabled).                     |
| **One-Shot Pipeline**                | Single pass (parse to TS to OpenAPI to Gateway) for CI & automation.                                 |

**Vendor**: [TechSpokes](https://www.techspokes.com) · **Maintainer**: Serge Liatko ([@sergeliatko](https://github.com/sergeliatko))

---

## 2. Installation

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap   # Runtime dependency for SOAP calls
```

**Requirements**:
- Node.js 20.0.0 or later
- `soap` package (runtime dependency for generated clients)

---

## 3. Quick Start

### Generate TypeScript SOAP Client

```bash
npx wsdl-tsc client --wsdl-source ./wsdl/Weather.wsdl --client-dir ./src/services/weather
```

**Try with included example:**

```bash
npx wsdl-tsc client --wsdl-source examples/minimal/weather.wsdl --client-dir ./tmp/weather
```

### Generate Everything (Pipeline)

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir ./tmp/client \
  --openapi-file ./tmp/openapi.json \
  --gateway-dir ./tmp/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

**Output**: Generates client files in `tmp/client/`, OpenAPI spec at `tmp/openapi.json`, gateway code in `tmp/gateway/`, and catalog at `tmp/client/catalog.json`.

---

## 4. Commands Overview

The tool provides **five commands** for different integration scenarios:

| Command      | Purpose                                                        | Typical Use Case                                    |
|--------------|----------------------------------------------------------------|-----------------------------------------------------|
| `compile`    | Parse WSDL and emit `catalog.json` only                        | Debugging, inspection, or multi-stage builds        |
| `client`     | Generate TypeScript SOAP client from WSDL or catalog           | Standard SOAP integration (most common)             |
| `openapi`    | Generate OpenAPI 3.1 spec from WSDL or catalog                 | Documentation, REST proxies, API gateways           |
| `gateway`    | Generate Fastify gateway scaffolding from OpenAPI spec         | REST gateway foundation (handler stubs)             |
| `pipeline`   | Run full pipeline: client + OpenAPI + gateway in one pass      | CI/CD automation, complete stack generation         |

---

## 5. Command: `compile`

**Purpose**: Parse WSDL and generate only the intermediate `catalog.json` representation without TypeScript client code.

**When to use**: 
- Multi-stage builds where you want to cache the parsed WSDL
- Debugging or inspecting the compiled schema structure
- Sharing a compiled catalog across multiple generation targets

### Usage

```bash
npx wsdl-tsc compile --wsdl-source <file|url> --catalog-file <path> [options]
```

### Required Flags

| Flag                | Description                              |
|---------------------|------------------------------------------|
| `--wsdl-source`     | Path or URL to the WSDL file             |
| `--catalog-file`    | Output path for `catalog.json`           |

### Optional Flags

| Flag                               | Default        | Description                                                  |
|------------------------------------|----------------|--------------------------------------------------------------|
| `--import-extensions`              | `js`           | Import specifier style: `js`, `ts`, or `bare`                |
| `--client-attributes-key`          | `$attributes`  | Attribute bag key for runtime mapper                         |
| `--client-class-name`              | (derived)      | Override generated client class name                         |
| `--client-int64-as`                | `string`       | Map 64-bit integers: `string`, `number`, or `bigint`         |
| `--client-bigint-as`               | `string`       | Map arbitrary-size integers: `string` or `number`            |
| `--client-decimal-as`              | `string`       | Map `xs:decimal`: `string` or `number`                       |
| `--client-date-as`                 | `string`       | Map date/time types: `string` or `Date`                      |
| `--client-choice-mode`             | `all-optional` | Choice element strategy: `all-optional` or `union`           |
| `--client-fail-on-unresolved`      | `false`        | Fail build on unresolved type references                     |
| `--client-nillable-as-optional`    | `false`        | Treat nillable elements as optional properties               |

### Examples

#### Basic Compilation

```bash
npx wsdl-tsc compile \
  --wsdl-source examples/minimal/weather.wsdl \
  --catalog-file tmp/catalog.json
```

#### With Custom Output Path

```bash
npx wsdl-tsc compile \
  --wsdl-source https://example.com/Hotel.wsdl \
  --catalog-file ./build/hotel-catalog.json \
  --client-int64-as number \
  --client-decimal-as string
```

#### For Debugging

```bash
# Compile to inspect types and operations
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/ComplexService.wsdl \
  --catalog-file ./debug/catalog.json \
  --client-fail-on-unresolved false
```

### Output

- `catalog.json` - Compiled schema representation including types, operations, and metadata

### Catalog Structure

The catalog.json file contains the compiled WSDL representation:

```json
{
  "wsdlUri": "path/to/service.wsdl",
  "targetNamespace": "http://example.com/service",
  "serviceName": "WeatherService",
  "types": [
    {
      "name": "GetWeatherRequest",
      "properties": []
    }
  ],
  "operations": [
    {
      "name": "GetWeather",
      "input": "GetWeatherRequest",
      "output": "GetWeatherResponse"
    }
  ],
  "options": {
    "imports": "js",
    "catalog": true
  }
}
```

**Key sections**:
- `types` - All compiled type definitions with properties and inheritance
- `operations` - SOAP operations with input/output type references
- `options` - Compiler options used during generation

This catalog can be reused with the `client` and `openapi` commands via `--catalog-file`.

### Catalog File Organization

**Default behavior**: Catalog files are **co-located** with their primary output files for better organization and discoverability.

**Catalog Location by Command**:
- `compile`: Always requires explicit `--catalog-file` (no default)
- `client`: Defaults to `{client-dir}/catalog.json`
- `openapi`: Defaults to `{openapi-file-dir}/catalog.json`
- `pipeline`: Intelligent cascade - first available: `{client-dir}` > `{openapi-dir}` > `{gateway-dir}` > `tmp/`

**Common patterns**:

1. **Co-located with client** (recommended for most projects):
   ```bash
   npx wsdl-tsc client --wsdl-source service.wsdl --client-dir src/services/weather
   ```
   
   Creates `src/services/weather/catalog.json` automatically.
   
   Result:
   ```
   src/services/weather/
   ├── client.ts
   ├── types.ts
   ├── utils.ts
   └── catalog.json
   ```

2. **Pipeline with multiple outputs** (catalog in client directory):
   ```bash
   npx wsdl-tsc pipeline --wsdl-source service.wsdl --client-dir src/client --openapi-file docs/api.json
   ```
   
   Creates `src/client/catalog.json` (co-located with client).

3. **Shared catalog for multiple commands** (custom location):
   ```bash
   npx wsdl-tsc compile --wsdl-source service.wsdl --catalog-file build/shared-catalog.json
   npx wsdl-tsc client --catalog-file build/shared-catalog.json --client-dir src/client
   npx wsdl-tsc openapi --catalog-file build/shared-catalog.json --openapi-file docs/api.json
   ```

---

## 6. Command: `client`

**Purpose**: Generate strongly-typed TypeScript SOAP client code from WSDL or a pre-compiled catalog.

**When to use**: 
- Standard SOAP integration (most common use case)
- When you need TypeScript types and client methods for SOAP operations
- When building applications that consume SOAP services

### Usage

```bash
npx wsdl-tsc client --wsdl-source <file|url> --client-dir <path> [options]
# OR
npx wsdl-tsc client --catalog-file <path> --client-dir <path> [options]
```

### Required Flags

| Flag             | Description                                     |
|------------------|-------------------------------------------------|
| `--wsdl-source`  | Path or URL to WSDL file (see note below)       |
| `--client-dir`   | Output directory for generated TypeScript files |

### Optional Input Flags

| Flag             | Default                     | Description                                                          |
|------------------|-----------------------------|----------------------------------------------------------------------|
| `--catalog-file` | `{client-dir}/catalog.json` | Path to pre-compiled `catalog.json` (when not using `--wsdl-source`) |

**Note**: Provide **either** `--wsdl-source` (to compile from WSDL) **or** `--catalog-file` (to use pre-compiled catalog). When using `--wsdl-source`, the catalog is automatically generated in the client directory unless you override with `--catalog-file`.

### Generated Files

| File           | Purpose                                                                      |
|----------------|------------------------------------------------------------------------------|
| `client.ts`    | Strongly-typed SOAP client wrapper with one method per operation             |
| `types.ts`     | Flattened TypeScript interfaces, type aliases, and enums                     |
| `utils.ts`     | Runtime metadata for JSON to SOAP conversion (attribute mapping, occurrence) |
| `catalog.json` | (When using `--wsdl-source`) Generated in client directory by default        |

### Optional Flags

All flags from `compile` command, plus:

| Flag                            | Default        | Description                         |
|---------------------------------|----------------|-------------------------------------|
| `--import-extensions`           | `js`           | Import style: `js`, `ts`, or `bare` |
| `--client-attributes-key`       | `$attributes`  | Attribute bag key                   |
| `--client-class-name`           | (derived)      | Override client class name          |
| `--client-int64-as`             | `string`       | Map 64-bit integers                 |
| `--client-bigint-as`            | `string`       | Map arbitrary-size integers         |
| `--client-decimal-as`           | `string`       | Map `xs:decimal`                    |
| `--client-date-as`              | `string`       | Map date/time types                 |
| `--client-choice-mode`          | `all-optional` | Choice element strategy             |
| `--client-fail-on-unresolved`   | `false`        | Fail on unresolved references       |
| `--client-nillable-as-optional` | `false`        | Treat nillable as optional          |

### Examples

#### Basic Generation (Default Catalog Location)

```bash
npx wsdl-tsc client \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir tmp/client
```

**Output**: Generates client files and catalog at `tmp/client/catalog.json`.

#### With Custom Catalog Path

```bash
npx wsdl-tsc client \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir tmp/client \
  --catalog-file build/shared-catalog.json
```

#### With Custom Numeric Mappings

```bash
npx wsdl-tsc client \
  --wsdl-source https://example.com/Hotel.wsdl \
  --client-dir ./src/integrations/soap/hotel \
  --client-int64-as number \
  --client-decimal-as string \
  --client-date-as string
```

**Output**: Catalog generated at `./src/integrations/soap/hotel/catalog.json`.

#### From Pre-compiled Catalog

```bash
# First compile the catalog
npx wsdl-tsc compile --wsdl-source https://example.com/Hotel.wsdl --catalog-file build/hotel-catalog.json

# Then generate client from catalog
npx wsdl-tsc client \
  --catalog-file build/hotel-catalog.json \
  --client-dir ./src/services/hotel
```

### Key Modeling Rules

- **Attributes & elements** become peer properties (flattened)
- **Text content** becomes `$value` property
- **Required attributes**: `use!="optional"`; elements `minOccurs>=1`
- **Multiplicity**: `maxOccurs>1` or `unbounded` become arrays
- **Nillable**: `nillable="true"` preserved (optionally model as optional with `--client-nillable-as-optional`)
- **Inheritance**: extensions merged or emitted as `extends`; simpleContent base collapsed logically

---

## 7. Command: `openapi`

**Purpose**: Generate OpenAPI 3.1 specification from WSDL or a pre-compiled catalog, mirroring the exact TypeScript type structure.

**When to use**:
- Creating REST API documentation for SOAP services
- Building API gateways or proxies
- Enabling REST-style access to SOAP operations
- Generating client SDKs in other languages

### Usage

```bash
npx wsdl-tsc openapi --wsdl-source <file|url> --openapi-file <path> [options]
# OR
npx wsdl-tsc openapi --catalog-file <path> --openapi-file <path> [options]
```

### Required Flags

| Flag                | Description                                        |
|---------------------|----------------------------------------------------|
| `--openapi-file`    | Output path for OpenAPI specification              |

### Input Source Flags (Mutually Exclusive)

| Flag                | Default                              | Description                                        |
|---------------------|--------------------------------------|----------------------------------------------------|
| `--wsdl-source`     | (none)                               | Path or URL to WSDL file                           |
| `--catalog-file`    | `{openapi-file-dir}/catalog.json`    | Path to pre-compiled `catalog.json`                |

**Note**: Provide **either** `--wsdl-source` **or** `--catalog-file`. When neither is provided, defaults to reading from the OpenAPI output directory. When using `--wsdl-source`, the catalog is automatically written to the OpenAPI output directory unless overridden.

### Core Optional Flags

| Flag                          | Default   | Description                                              |
|-------------------------------|-----------|----------------------------------------------------------|
| `--openapi-format`            | `json`    | Output format: `json`, `yaml`, or `both`                 |
| `--openapi-title`             | (derived) | API title in `info` section                              |
| `--openapi-version`           | `0.0.0`   | API version in `info.version`                            |
| `--openapi-description`       | (empty)   | API description in `info` section                        |
| `--openapi-servers`           | `/`       | Comma-separated server URLs                              |
| `--openapi-base-path`         | (empty)   | Base path prefix (e.g., `/v1/soap`)                      |
| `--openapi-validate`          | `true`    | Validate spec with `swagger-parser`                      |

### Path & Schema Customization

| Flag                             | Default   | Description                                      |
|----------------------------------|-----------|--------------------------------------------------|
| `--openapi-path-style`           | `kebab`   | Path transformation: `kebab`, `asis`, or `lower` |
| `--openapi-method`               | `post`    | Default HTTP method for operations               |
| `--openapi-tag-style`            | `default` | Tag inference: `default`, `service`, or `first`  |
| `--openapi-closed-schemas`       | `false`   | Add `additionalProperties: false` to all schemas |
| `--openapi-prune-unused-schemas` | `false`   | Emit only schemas referenced by operations       |

### Response Envelope Customization

| Flag                           | Default            | Description                                 |
|--------------------------------|--------------------|---------------------------------------------|
| `--openapi-envelope-namespace` | `ResponseEnvelope` | Override envelope component name suffix     |
| `--openapi-error-namespace`    | `ErrorObject`      | Override error object component name suffix |

### Configuration Files

| Flag                              | Description                                           |
|-----------------------------------|-------------------------------------------------------|
| `--openapi-security-config-file`  | Path to `security.json` (schemes, headers, overrides) |
| `--openapi-tags-file`             | Path to `tags.json` (explicit operation → tag map)    |
| `--openapi-ops-file`              | Path to `ops.json` (per-operation overrides)          |

### Examples

#### Basic JSON Output

```bash
npx wsdl-tsc openapi \
  --wsdl-source examples/minimal/weather.wsdl \
  --openapi-file ./docs/weather-api.json
```

#### Multi-Format with Validation

```bash
npx wsdl-tsc openapi \
  --wsdl-source https://example.com/Hotel.wsdl \
  --openapi-file ./docs/hotel-api \
  --openapi-format both \
  --openapi-servers https://api.example.com/v1,https://api-staging.example.com/v1 \
  --openapi-base-path /soap
```

#### From Pre-compiled Catalog

```bash
npx wsdl-tsc openapi \
  --catalog-file ./artifacts/hotel-catalog.json \
  --openapi-file ./docs/hotel-api.json \
  --openapi-format json
```

#### With Custom Configuration

```bash
npx wsdl-tsc openapi \
  --wsdl-source ./wsdl/Booking.wsdl \
  --openapi-file ./docs/booking-api.yaml \
  --openapi-format yaml \
  --openapi-title "Hotel Booking API" \
  --openapi-version "1.2.0" \
  --openapi-description "REST API for hotel booking SOAP service" \
  --openapi-security-config-file ./config/security.json \
  --openapi-tags-file ./config/tags.json \
  --openapi-path-style kebab \
  --openapi-method post \
  --openapi-tag-style service
```

### Standard Response Envelope

All responses are wrapped in a **standard envelope** for consistency and debuggability (always-on since 0.7.1):

#### Base Envelope Structure

```typescript
{
  status: string;           // e.g., "SUCCESS", "FAILURE", "PENDING"
  message: string | null;   // diagnostic message (not for end-user UI)
  data: T | null;          // operation payload (typed per operation)
  error: ErrorObject | null; // populated on failures
}
```

#### Error Object Structure

```typescript
{
  code: string;              // stable machine error code
  message: string;           // brief description
  details: object | null;    // arbitrary extra info
}
```

#### Naming Rules

- **Base envelope**: `${serviceName}ResponseEnvelope` (override with `--openapi-envelope-namespace`)
- **Error object**: `${serviceName}ErrorObject` (override with `--openapi-error-namespace`)
- **Per-operation extension**: `<PayloadType|OperationName><EnvelopeNamespace>` (refines `data` field)

#### Collision Avoidance

If the payload type already ends with the namespace prefix, an underscore is inserted:

- Payload `WeatherResponse` + default `ResponseEnvelope` → `WeatherResponse_ResponseEnvelope`
- Payload `Booking` + default `ResponseEnvelope` → `BookingResponseEnvelope`

#### Example

```bash
npx wsdl-tsc openapi \
  --wsdl-source ./wsdl/Hotel.wsdl \
  --openapi-file ./docs/hotel-api.json \
  --openapi-envelope-namespace ApiEnvelope \
  --openapi-error-namespace ApiError
```

Produces components:
1. `HotelApiEnvelope` (base)
2. `<Payload>ApiEnvelope` extension schemas (alphabetically sorted)
3. `HotelApiError` (error object)
4. Domain schemas

### Tag Inference Strategies

| Strategy  | Behavior                                                                           |
|-----------|------------------------------------------------------------------------------------|
| `default` | Single tag = service name (fallback `SOAP`)                                        |
| `service` | Always service name (even if operation prefix differs)                             |
| `first`   | First lexical segment of CamelCase operation (e.g., `GetCityWeatherByZIP` → `Get`) |

Use `--openapi-tags-file` for explicit mapping when heuristics are insufficient.

### Output Determinism

All generated OpenAPI specs have **deterministic ordering**:
- Path keys (alphabetically sorted)
- HTTP methods within paths (alphabetically sorted)
- Component schema names (alphabetically sorted)
- Security schemes (alphabetically sorted)
- Parameters (alphabetically sorted)
- Operation tag arrays (alphabetically sorted)

This ensures diff-friendly output for version control.

---

## 8. Command: `gateway`

**Purpose**: Generate Fastify gateway scaffolding (routes and schemas) from an OpenAPI 3.1 specification. This provides the foundation for building a REST API layer over your SOAP client.

> **Current Status (v0.8.0)**: The gateway generator produces basic scaffolding including route registration, JSON Schema validation setup, and handler stubs. Full code generation with complete handler implementations is planned for future releases. You will need to implement the business logic that calls your SOAP client and transforms responses.

**When to use**:
- Building a REST API gateway for legacy SOAP services
- Creating a modern HTTP/JSON interface for SOAP operations
- Setting up request/response validation with JSON Schema
- Establishing Fastify routing structure for SOAP operations

**What it generates**:
- Fastify route registration files
- JSON Schema models with URN-based IDs
- Operation schemas (request/response validation)
- Schema and route registration modules
- Handler stubs (require manual implementation)
- Full handler implementations (coming in future versions)

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

| Flag                       | Description                                                              |
|----------------------------|--------------------------------------------------------------------------|
| `--openapi-file`           | Path to OpenAPI 3.1 JSON or YAML file                                    |
| `--client-dir`             | Path to client directory (where `client.ts` is located)                  |
| `--gateway-dir`            | Output directory for generated gateway code                              |
| `--gateway-service-name`   | Service identifier for URN generation (e.g., `weather`, `booking`)       |
| `--gateway-version-prefix` | Version prefix for URN generation (e.g., `v1`, `v2`, `urn:1.0.2:schema`) |

### Optional Flags

| Flag                             | Default                                           | Description                                                 |
|----------------------------------|---------------------------------------------------|-------------------------------------------------------------|
| `--import-extensions`            | `js`                                              | Import style: `js`, `ts`, or `bare`                         |
| `--gateway-default-status-codes` | `200,400,401,403,404,409,422,429,500,502,503,504` | Comma-separated status codes to backfill                    |
| `--catalog-file`                 | *(none)*                                          | Path to `catalog.json` for operation metadata               |
| `--gateway-client-class-name`    | *(auto-detected)*                                 | Override SOAP client class name                             |
| `--gateway-decorator-name`       | `{serviceSlug}Client`                             | Fastify decorator name for client instance                  |
| `--gateway-stub-handlers`        | `false`                                           | Generate stub handlers instead of full implementations      |
| `--gateway-skip-plugin`          | `false`                                           | Skip generating `plugin.ts` wrapper                         |
| `--gateway-skip-runtime`         | `false`                                           | Skip generating `runtime.ts` utilities                      |

### Generated Output Structure

```
{gateway-dir}/
├── schemas/
│   ├── models/              # JSON Schema components with URN IDs
│   │   ├── <schema1>.json
│   │   ├── <schema2>.json
│   │   └── ...
│   └── operations/          # Fastify operation schemas
│       ├── <operation1>.json
│       ├── <operation2>.json
│       └── ...
├── routes/                  # Individual route registration files
│   ├── <route1>.ts          # Full handler implementations
│   ├── <route2>.ts
│   └── ...
├── schemas.ts               # Schema registration module
├── routes.ts                # Route aggregator module
├── runtime.ts               # Envelope builders and error handler
└── plugin.ts                # Fastify plugin wrapper (recommended entry point)
```

### URN-Based Schema IDs

All generated JSON Schemas use deterministic URN identifiers:

```
urn:services:{serviceSlug}:{versionSlug}:schemas:{models|operations}:{schemaSlug}
```

**Example**: `urn:services:weather:v1:schemas:models:getcityweatherbyzipresponse`

### Contract Assumptions

The gateway generator enforces strict OpenAPI contract validation:

- All request/response bodies must use `$ref` to `components.schemas` (no inline schemas)
- Every operation must have a default response with `application/json` content
- All schemas referenced by operations must exist in `components.schemas`

### Examples

#### Basic Gateway Generation

```bash
npx wsdl-tsc gateway \
  --openapi-file ./docs/weather-api.json \
  --client-dir ./src/services/weather \
  --gateway-dir ./src/gateway/weather \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

#### With Custom Status Codes

```bash
npx wsdl-tsc gateway \
  --openapi-file ./docs/hotel-api.json \
  --client-dir ./src/services/hotel \
  --gateway-dir ./src/gateway/hotel \
  --gateway-service-name hotel \
  --gateway-version-prefix v2 \
  --gateway-default-status-codes 200,400,401,404,500
```

#### From YAML OpenAPI

```bash
npx wsdl-tsc gateway \
  --openapi-file ./docs/booking-api.yaml \
  --client-dir ./src/services/booking \
  --gateway-dir ./src/gateway/booking \
  --gateway-service-name booking \
  --gateway-version-prefix v1
```

### Integration Pattern

The generated gateway provides a Fastify plugin for simplified integration.

#### Prerequisites

Your host application needs these dependencies:

```bash
npm install fastify fastify-plugin
```

#### Using the Generated Plugin (Recommended)

```typescript
import Fastify from 'fastify';
import weatherGateway from './gateway/plugin.js';
import { Weather } from './client/client.js';

const app = Fastify({ logger: true });

// Create and configure SOAP client
const weatherClient = new Weather({
  source: 'https://example.com/weather.wsdl',
  // security: new soap.WSSecurity('user', 'pass'), // if needed
});

// Register gateway plugin with client
await app.register(weatherGateway, {
  client: weatherClient,
  prefix: '/api/v1',  // optional route prefix
});

await app.listen({ port: 3000 });
```

The plugin automatically:
- Decorates Fastify with the SOAP client (`fastify.weatherClient`)
- Registers all JSON schemas for validation
- Installs a centralized error handler
- Registers all routes with full handler implementations

#### Using Individual Components (Advanced)

For more control, you can use the individual modules:

```typescript
import Fastify from 'fastify';
import { registerSchemas_v1_weather } from './gateway/schemas.js';
import { registerRoutes_v1_weather } from './gateway/routes.js';
import { createGatewayErrorHandler_v1_weather } from './gateway/runtime.js';
import { Weather } from './client/client.js';

const app = Fastify({ logger: true });

// Manual setup
const weatherClient = new Weather({ source: 'weather.wsdl' });
app.decorate('weatherClient', weatherClient);

// Register schemas
await registerSchemas_v1_weather(app);

// Install error handler
app.setErrorHandler(createGatewayErrorHandler_v1_weather());

// Register routes with optional prefix
await registerRoutes_v1_weather(app, { prefix: '/api/v1' });

await app.listen({ port: 3000 });
```

### Generated Handler Implementation

Route handlers are fully implemented and call the SOAP client automatically:

```typescript
// Generated: routes/get-city-forecast-by-zip.ts
import type { FastifyInstance } from "fastify";
import schema from "../schemas/operations/getcityforecastbyzip.json" with { type: "json" };
import { buildSuccessEnvelope } from "../runtime.js";

export async function registerRoute_v1_weather_getcityforecastbyzip(fastify: FastifyInstance) {
  fastify.route({
    method: "POST",
    url: "/get-city-forecast-by-zip",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetCityForecastByZIP(request.body);
      return buildSuccessEnvelope(result.response);
    },
  });
}
```

### Response Envelope

All responses are wrapped in a standard envelope format:

**Success Response:**
```json
{
  "status": "SUCCESS",
  "message": null,
  "data": { /* SOAP response data */ },
  "error": null
}
```

**Error Response:**
```json
{
  "status": "ERROR",
  "message": "Request validation failed",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { /* validation errors */ }
  }
}
```

### Error Handling

The centralized error handler (`runtime.ts`) automatically classifies errors:

| Error Type            | HTTP Status | Error Code            |
|-----------------------|-------------|-----------------------|
| Validation errors     | 400         | `VALIDATION_ERROR`    |
| SOAP faults           | 502         | `SOAP_FAULT`          |
| Connection refused    | 503         | `SERVICE_UNAVAILABLE` |
| Timeout               | 504         | `GATEWAY_TIMEOUT`     |
| Other errors          | 500         | `INTERNAL_ERROR`      |

### Stub Handler Mode (Legacy)

For backward compatibility or manual handler implementation, use stub mode:

```bash
npx wsdl-tsc gateway \
  --openapi-file ./docs/weather-api.json \
  --client-dir ./src/services/weather \
  --gateway-dir ./src/gateway/weather \
  --gateway-service-name weather \
  --gateway-version-prefix v1 \
  --gateway-stub-handlers
```

This generates handler stubs that throw "Not implemented" errors, allowing you to implement custom logic.

---

## 9. Command: `pipeline`

**Purpose**: Run the complete generation pipeline in a single pass: WSDL parsing → TypeScript client → OpenAPI spec → Fastify gateway.

**When to use**:
- CI/CD automation
- Complete stack generation
- Ensuring all artifacts are generated from the same WSDL parse
- One-command development workflows

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

| Flag                | Description                                                          |
|---------------------|----------------------------------------------------------------------|
| `--wsdl-source`     | Path or URL to WSDL file                                             |

### Output Flags

| Flag                | Default                                     | Description                                       |
|---------------------|---------------------------------------------|---------------------------------------------------|
| `--catalog-file`    | Co-located with first output (see below)    | Output path for `catalog.json` (always generated) |

**Catalog Default Location**: The catalog is automatically placed alongside the first available output:
- With `--client-dir`: `{client-dir}/catalog.json`
- With `--openapi-file` only: `{openapi-file-dir}/catalog.json`
- With `--gateway-dir` only: `{gateway-dir}/catalog.json`

**Note**: At least one of `--client-dir`, `--openapi-file`, or `--gateway-dir` must be provided.

### Generation Control Flags

| Flag                    | Description                                    |
|-------------------------|------------------------------------------------|
| `--client-dir`          | Generate TypeScript client in this directory   |
| `--openapi-file`        | Generate OpenAPI spec at this path             |
| `--gateway-dir`         | Generate Fastify gateway in this directory     |

### Optional Flags

All flags from `client`, `openapi`, and `gateway` commands are supported. Key flags:

#### Client Flags
- `--import-extensions` (default: `js`)
- `--client-attributes-key` (default: `$attributes`)
- `--client-class-name`
- `--client-int64-as` (default: `string`)
- `--client-bigint-as` (default: `string`)
- `--client-decimal-as` (default: `string`)
- `--client-date-as` (default: `string`)
- `--client-choice-mode` (default: `all-optional`)
- `--client-fail-on-unresolved` (default: `false`)
- `--client-nillable-as-optional` (default: `false`)

#### OpenAPI Flags
- `--openapi-format` (default: `json`)
- `--openapi-title`
- `--openapi-version` (default: `0.0.0`)
- `--openapi-description`
- `--openapi-servers` (default: `/`)
- `--openapi-base-path`
- `--openapi-path-style` (default: `kebab`)
- `--openapi-method` (default: `post`)
- `--openapi-tag-style` (default: `default`)
- `--openapi-closed-schemas` (default: `false`)
- `--openapi-prune-unused-schemas` (default: `false`)
- `--openapi-envelope-namespace` (default: `ResponseEnvelope`)
- `--openapi-error-namespace` (default: `ErrorObject`)
- `--openapi-validate` (default: `true`)
- `--openapi-security-config-file`
- `--openapi-tags-file`
- `--openapi-ops-file`

#### Gateway Flags
- `--gateway-service-name` (required if `--gateway-dir` provided)
- `--gateway-version-prefix` (required if `--gateway-dir` provided)
- `--gateway-default-status-codes`

### Examples

#### Complete Stack Generation (Using Default Catalog Location)

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir tmp/client \
  --openapi-file tmp/openapi.json \
  --gateway-dir tmp/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

**Output**: Catalog at `tmp/client/catalog.json`.

#### Client + OpenAPI Only

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/Hotel.wsdl \
  --client-dir ./build/client \
  --openapi-file ./docs/hotel-api.json \
  --openapi-format both
```

**Output**: Catalog at `./build/client/catalog.json`.

#### OpenAPI + Gateway Only

```bash
npx wsdl-tsc pipeline \
  --wsdl-source ./wsdl/Booking.wsdl \
  --openapi-file ./docs/booking-api.json \
  --gateway-dir ./build/gateway \
  --gateway-service-name booking \
  --gateway-version-prefix v1
```

**Output**: Catalog at `./docs/catalog.json`.

#### With Custom Catalog Path

```bash
npx wsdl-tsc pipeline \
  --wsdl-source ./wsdl/Booking.wsdl \
  --catalog-file ./build/shared/catalog.json \
  --client-dir ./build/client \
  --openapi-file ./docs/booking-api.json \
  --gateway-dir ./build/gateway \
  --gateway-service-name booking \
  --gateway-version-prefix v1
```

#### With Full Configuration

```bash
npx wsdl-tsc pipeline \
  --wsdl-source ./wsdl/Booking.wsdl \
  --client-dir ./build/client \
  --openapi-file ./docs/booking-api \
  --gateway-dir ./build/gateway \
  --openapi-format both \
  --openapi-servers https://api.example.com/v1 \
  --openapi-base-path /booking \
  --openapi-security-config-file ./config/security.json \
  --gateway-service-name booking \
  --gateway-version-prefix v1 \
  --client-int64-as number \
  --client-decimal-as string
```

**Output**: Catalog at `./build/client/catalog.json`.

### Pipeline Workflow

The pipeline command executes these steps in order:

1. **Parse WSDL** → Load and validate WSDL document
2. **Compile Catalog** → Generate intermediate representation
3. **Emit Catalog** → Write `catalog.json` (always)
4. **Generate Client** → Emit TypeScript client files (if `--client-dir`)
5. **Generate OpenAPI** → Create OpenAPI spec (if `--openapi-file`)
6. **Generate Gateway** → Create Fastify gateway code (if `--gateway-dir`)

All steps share the same parsed WSDL and compiled catalog, ensuring consistency.

---

## 10. Working With Generated Clients

### Client Construction

```typescript
import soap from "soap";
import { Weather } from "./src/services/weather/client.js";

const client = new Weather({
  source: "https://example.com/WeatherService?wsdl",
  security: new soap.WSSecurity("username", "password")
});
```

### Calling Operations

```typescript
// Operation with input
const forecast = await client.GetCityForecastByZIP({
  ZIP: "10001"
});

console.log(forecast.GetCityForecastByZIPResult.Success);
console.log(forecast.GetCityForecastByZIPResult.ForecastResult);

// Operation without input
const info = await client.GetWeatherInformation({});
console.log(info.GetWeatherInformationResult.WeatherDescriptions);
```

### Attributes & Text Content

When an element has both attributes and text content, use the `$value` convention:

```typescript
const price = {
  currencyCode: "USD",  // attribute
  $value: "123.45"      // text content
};
```

### Working With Arrays

Repeated elements are automatically typed as arrays:

```typescript
interface ForecastReturn {
  Forecast: Forecast[];  // maxOccurs > 1
}
```

### Type Safety

All operations and types are fully typed:

```typescript
// TypeScript knows the exact shape
const result: GetCityWeatherByZIPResponse = await client.GetCityWeatherByZIP({
  ZIP: "10001"
});

// Autocomplete and type checking work
result.GetCityWeatherByZIPResult.Temperature;  // number | string (depends on mapping)
```

---

## 11. OpenAPI Configuration

### Security Configuration (`security.json`)

Define security schemes, headers, and per-operation overrides:

```json
{
  "global": {
    "scheme": "bearer",
    "bearer": { "bearerFormat": "JWT" },
    "headers": [
      {
        "name": "X-Correlation-Id",
        "required": false,
        "schema": { "type": "string" }
      }
    ]
  },
  "overrides": {
    "CancelBooking": { "scheme": "apiKey" }
  }
}
```

**Supported schemes**: `none`, `basic`, `bearer`, `apiKey`, `oauth2`

### Tags Configuration (`tags.json`)

Explicit operation → tag mapping:

```json
{
  "GetCityWeatherByZIP": ["Weather", "Forecast"],
  "GetWeatherInformation": ["Weather", "Info"],
  "CancelBooking": ["Booking", "Cancellation"]
}
```

### Operations Configuration (`ops.json`)

Per-operation overrides for method, summary, description, and deprecation:

```json
{
  "GetCityWeatherByZIP": {
    "method": "get",
    "summary": "Get weather forecast by ZIP code",
    "description": "Returns a detailed weather forecast for the specified US ZIP code",
    "deprecated": false
  },
  "LegacyOperation": {
    "deprecated": true
  }
}
```

---

## 12. Programmatic API

All CLI commands are available as TypeScript functions for programmatic usage.

### `compileWsdlToProject`

Generate TypeScript SOAP client from WSDL.

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

**Type Signature**:

```typescript
// noinspection JSAnnotator
function compileWsdlToProject(input: {
  wsdl: string;
  outDir: string;
  options?: Partial<CompilerOptions>;
}): Promise<void>;
```

**Options** (`CompilerOptions`):

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

### `generateOpenAPI`

Generate OpenAPI 3.1 specification from WSDL or catalog.

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

**Type Signature**:

```typescript
// noinspection JSAnnotator
function generateOpenAPI(opts: GenerateOpenAPIOptions): Promise<{
  doc: any;
  jsonPath?: string;
  yamlPath?: string;
}>;
```

**Options** (`GenerateOpenAPIOptions`):

```typescript
interface GenerateOpenAPIOptions {
  // Input sources (mutually exclusive)
  wsdl?: string;
  catalogFile?: string;
  compiledCatalog?: CompiledCatalog;
  
  // Output
  outFile?: string;
  format?: "json" | "yaml" | "both";
  
  // Metadata
  title?: string;
  version?: string;
  description?: string;
  servers?: string[];
  
  // Path configuration
  basePath?: string;
  pathStyle?: "kebab" | "asis" | "lower";
  defaultMethod?: string;
  
  // Schema configuration
  closedSchemas?: boolean;
  pruneUnusedSchemas?: boolean;
  
  // Tag configuration
  tagStyle?: "default" | "first" | "service";
  tagsFile?: string;
  
  // Security & operations
  securityConfigFile?: string;
  opsFile?: string;
  
  // Envelope customization
  envelopeNamespace?: string;
  errorNamespace?: string;
  
  // Validation
  validate?: boolean;
  skipValidate?: boolean;
  
  // Deprecated
  asYaml?: boolean;
}
```

### `generateGateway`

Generate Fastify gateway code from OpenAPI specification.

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

**Type Signature**:

```typescript
// noinspection JSAnnotator
function generateGateway(opts: GenerateGatewayOptions): Promise<void>;
```

**Options** (`GenerateGatewayOptions`):

```typescript
interface GenerateGatewayOptions {
  // Input sources (mutually exclusive)
  openapiFile?: string;
  openapiDocument?: any;
  
  // Output
  outDir: string;
  
  // Client integration
  clientDir?: string;
  
  // URN configuration
  versionSlug?: string;
  serviceSlug?: string;
  
  // Schema configuration
  defaultResponseStatusCodes?: number[];
  
  // Import style
  imports?: "js" | "ts" | "bare";
}
```

### `runGenerationPipeline`

Run complete pipeline: client + OpenAPI + gateway in one pass.

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

**Type Signature**:

```typescript
// noinspection JSAnnotator
function runGenerationPipeline(opts: PipelineOptions): Promise<{
  compiled: CompiledCatalog;
  openapiDoc?: any;
}>;
```

**Options** (`PipelineOptions`):

```typescript
interface PipelineOptions {
  // Input
  wsdl: string;
  
  // Catalog (always generated)
  catalogOut: string;
  
  // Client generation (optional)
  clientOutDir?: string;
  compiler?: Partial<CompilerOptions>;
  
  // OpenAPI generation (optional)
  openapi?: Omit<GenerateOpenAPIOptions, "wsdl" | "catalogFile" | "compiledCatalog"> & {
    outFile?: string;
  };
  
  // Gateway generation (optional, requires openapi)
  gateway?: Omit<GenerateGatewayOptions, "openapiFile" | "openapiDocument"> & {
    outDir?: string;
  };
}
```

---

## 13. Advanced Topics

### Primitive Mapping Philosophy

**Default: String-first safety** — Prevents precision loss and parsing errors at the cost of convenience.

| XSD Type      | Default  | Alternatives       | Recommendation                                  |
|---------------|----------|--------------------|-------------------------------------------------|
| `xs:long`     | `string` | `number`, `bigint` | Use `number` if values fit safely in JS range   |
| `xs:integer`  | `string` | `number`           | Use `string` for arbitrary-size integers        |
| `xs:decimal`  | `string` | `number`           | Use `string` for precise decimal representation |
| `xs:dateTime` | `string` | `Date`             | Use `Date` if runtime parsing is acceptable     |

### Choice Element Handling

**Current strategy**: `all-optional` — All choice branches are emitted as optional properties.

```typescript
// WSDL: <xs:choice>
interface MyType {
  optionA?: string;
  optionB?: number;
}
```

**Future**: Discriminated unions for type-safe choice validation.

### Array Wrapper Flattening

Single repeated child without attributes collapses to array schema in OpenAPI:

```xml
<xs:complexType name="ArrayOfForecast">
  <xs:sequence>
    <xs:element name="Forecast" type="tns:Forecast" maxOccurs="unbounded"/>
  </xs:sequence>
</xs:complexType>
```

**OpenAPI Schema**:

```json
{
  "ArrayOfForecast": {
    "type": "array",
    "items": { "$ref": "#/components/schemas/Forecast" }
  }
}
```

### Inheritance Flattening

**Extension (`xs:extension`)**:
- Base properties merged into derived type
- TypeScript: `extends` when possible

**Restriction (`xs:restriction`)**:
- Treated as base type with constraints

**SimpleContent**:
- Base value collapsed into `$value` property
- Attributes remain as peer properties

### Validation

OpenAPI validation uses `@apidevtools/swagger-parser`:
- Validates schema structure
- Resolves all `$ref` references
- Catches missing schemas
- Detects circular dependencies

Disable with `--openapi-validate false` or `validate: false` in API.

---

## 14. Troubleshooting

### Common Issues

| Symptom                           | Resolution                                                                                                                |
|-----------------------------------|---------------------------------------------------------------------------------------------------------------------------|
| **WSDL fetch fails**              | Curl the URL, check TLS/proxy settings, retry with local copy                                                             |
| **Unresolved type references**    | Re-run with `--client-fail-on-unresolved=false` to inspect partial graph                                                  |
| **Missing schema in OpenAPI**     | Ensure the global element exists (catalog shows compiled symbols)                                                         |
| **Wrong array modeling**          | Check `maxOccurs` in WSDL; tool only arrays when `maxOccurs>1` or `unbounded`                                             |
| **Authentication errors**         | Provide proper `soap.ISecurity` instance (`WSSecurity`, `BasicAuthSecurity`)                                              |
| **Date/time confusion**           | Use `--client-date-as Date` for runtime Date objects                                                                      |
| **TypeScript compilation errors** | Check `--import-extensions` matches your tsconfig `moduleResolution`                                                      |
| **Gateway validation failures**   | Ensure OpenAPI has valid `$ref` paths and all schemas in `components.schemas`                                             |
| **Catalog file not found**        | Catalog defaults to output directory (e.g., `{client-dir}/catalog.json`); use `--catalog-file` to specify custom location |

### Enable SOAP Wire Logging

Debug SOAP requests/responses:

```bash
NODE_DEBUG=soap node app.js
```

### Verify Installation

```bash
npx wsdl-tsc --help
npm run smoke:compile   # Test catalog generation
npm run smoke:client    # Test client generation
npm run smoke:openapi   # Test OpenAPI generation
npm run smoke:gateway   # Test gateway generation
npm run smoke:pipeline  # Test complete pipeline
```

### TypeScript Configuration

Ensure your `tsconfig.json` is compatible:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### Catalog Inspection

Examine the compiled catalog to understand type resolution:

```bash
# Compile to specific location
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/Hotel.wsdl \
  --catalog-file build/hotel-catalog.json

# Inspect types, operations, and metadata
cat build/hotel-catalog.json | jq '.types'
cat build/hotel-catalog.json | jq '.operations'
```

Or inspect catalog from client generation:

```bash
npx wsdl-tsc client \
  --wsdl-source ./wsdl/Hotel.wsdl \
  --client-dir ./src/services/hotel

cat ./src/services/hotel/catalog.json | jq '.types'
```

The catalog is automatically placed at `./src/services/hotel/catalog.json`.

---

## 15. Contributing

We welcome contributions! Here's how to get started:

### Development Setup

```bash
# Clone repository
git clone https://github.com/techspokes/typescript-wsdl-client.git
cd typescript-wsdl-client

# Install dependencies
npm install

# Build
npm run build

# Type check
npm run typecheck

# Run smoke tests
npm run smoke:compile
npm run smoke:client
npm run smoke:openapi
npm run smoke:gateway
npm run smoke:pipeline

# Run full CI suite
npm run ci
```

### Making Changes

1. **Fork & branch** — Create a feature branch from `main`
2. **Make changes** — Implement your feature or fix
3. **Test** — Run smoke tests and verify functionality
4. **Update CHANGELOG** — Add entry under `## [Unreleased]` section
5. **Commit** — Use conventional commit format: `feat:`, `fix:`, `docs:`, etc.
6. **Submit PR** — Create pull request with clear description

### Commit Message Format

```
Version: <version> <type>(<optional-scope>): <imperative summary>

[optional body with details, rationale, breaking changes]

[optional footer with refs: Closes #123]
```

**Types**: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

**Example**:
```
Version: 0.8.0 feat(gateway): add support for YAML OpenAPI input

Gateway command now accepts both JSON and YAML OpenAPI files,
determined by file extension (.json, .yaml, .yml).

Closes #456
```

### Guidelines

- Follow existing code style and conventions
- Keep PRs focused and scoped
- Update documentation for user-visible changes
- Add tests where applicable
- Ensure CI passes

See also: [CONTRIBUTING.md](CONTRIBUTING.md), [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

---

## 16. License

MIT © TechSpokes

Generated artifacts are fully yours with no restrictions or attribution required.

See [LICENSE](LICENSE) for full text.

---

## 17. Sponsors

Support ongoing development and maintenance:

**GitHub Sponsors**: https://github.com/sponsors/TechSpokes

### Current Sponsors

*Your organization could be featured here!*

### Why Sponsor?

- Priority support for issues and feature requests
- Early access to new features
- Recognition in README and release notes
- Direct influence on roadmap priorities
- Support open source sustainability

Thank you for considering sponsorship!

---

## Links

- **Documentation**: [README.md](README.md) (you are here)
- **Contributing Guide**: [CONTRIBUTING.md](CONTRIBUTING.md)
- **Roadmap**: [ROADMAP.md](ROADMAP.md)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Security Policy**: [SECURITY.md](SECURITY.md)
- **Support**: [SUPPORT.md](SUPPORT.md)
- **Issues**: https://github.com/techspokes/typescript-wsdl-client/issues
- **Discussions**: https://github.com/techspokes/typescript-wsdl-client/discussions
- **npm Package**: https://www.npmjs.com/package/@techspokes/typescript-wsdl-client

