# Output Anatomy

This document describes each file produced by the generator, what it contains, and how to work with it. For CLI flags that control output, see [CLI Reference](cli-reference.md).

See the root [README](../README.md) for the documentation index. This catalog-based flow describes legacy output; [checked generation](checked-generation.md) emits source-backed artifacts with a separate value/validation contract.

## TypeScript File Preambles

All complete emitted TypeScript files receive one [generated preamble](generated-code.md#generated-preambles-and-eslint), including optional helpers and `_typecheck.ts`. App and generated-test scaffolds use editable-source wording and retain their existing skip/force behavior. Preambles do not alter data files or existing consumer source; regeneration compatibility follows the [version migration guide](migration.md#from-11x-to-120).

## Generation Flow

The pipeline follows this sequence: WSDL source is parsed and compiled into a catalog, then each emitter reads the catalog and produces its output.

```text
WSDL/XSD --> compile --> catalog.json --> emit client/
                                      --> emit openapi.json
                                      --> emit gateway/
                                      --> emit app/
```

Each stage can run independently. The `pipeline` command runs all stages in sequence.

## Client Output

Generated into the directory specified by `--client-dir`.

| File | Purpose |
|------|---------|
| types.ts | TypeScript models projected from WSDL/XSD types |
| client.ts | SOAP client class with one typed method per operation |
| operations.ts | Pure interface matching client methods, for mocking without importing `soap` |
| utils.ts | JSON/SOAP conversion metadata |
| catalog.json | Compiled WSDL data in JSON format, used by other generation stages |

### types.ts

Declares generated interfaces and aliases with flattened attribute and element properties. Inheritance can use TypeScript `extends`. Scalar types follow compiler policies: int64, arbitrary-size integers, decimal and date/time default to strings; ordinary numeric and Boolean types retain their projected types.

### client.ts

Exports a client class that wraps the `soap` package. Each WSDL operation becomes an async method with typed input and output. The class handles SOAP envelope construction and response parsing internally.

### operations.ts

Exports a TypeScript interface with the same method signatures as the client class but no implementation. Use this for dependency injection and testing. Your test code can implement this interface with mock data without importing the client or `soap`.

### utils.ts

Provides metadata used by the client's `toSoapArgs` and `fromSoapResult` methods. Optional array-wrapper flattening belongs to gateway `runtime.ts` and applies per record for streams.

### Stream Operations

When `--stream-config` opts an operation into streaming (see [ADR-002](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/002-streamable-responses.md)), the client emits additional surfaces alongside the buffered ones. Buffered operations in the same client are unaffected.

`operations.ts` gains a `StreamOperationResponse<RecordType>` type that stream methods return instead of the buffered `{ response, headers, responseRaw, requestRaw }` shape:

```typescript
export type StreamOperationResponse<RecordType, HeadersType = Record<string, unknown>> = {
  records: AsyncIterable<RecordType>;
  headers: HeadersType;
  requestRaw?: string;
};
```

`client.ts` gains a protected `callStream()` transport using node-soap's WSDL serializer and public HTTP `requestStream`. Completed parser records pass through the generated DTO mapper; iterator return, per-call abort/deadline and downstream disconnect release the upstream transport. See [stream transport settings](gateway-guide.md#streaming-transport-settings).

Generated imports required at runtime: `saxes` for SAX parsing. The generated app scaffold pins `saxes ^6.0.0` automatically; manual consumers must install it explicitly.

## OpenAPI Output

Generated at the path specified by `--openapi-file`.

| File | Purpose |
|------|---------|
| openapi.json (or .yaml) | Complete OpenAPI 3.1 specification |

The spec defaults to one POST path per WSDL operation, with request/response schemas in `components/schemas` and source documentation descriptions. Configured defaults and operation overrides can select other HTTP methods. Schemas and TypeScript models use the same catalog.

CLI OpenAPI generation always validates the generated spec using `@apidevtools/swagger-parser`.

### Stream Schema Extension

Stream operations do not use the standard success envelope for `200` responses. NDJSON streams declare the configured stream media type (default `application/x-ndjson`) with `schema: { "type": "string" }` and an `x-wsdl-tsc-stream` extension that carries the record schema reference:

```json
{
  "200": {
    "description": "Successful streamed SOAP operation response",
    "content": {
      "application/x-ndjson": {
        "schema": { "type": "string" },
        "x-wsdl-tsc-stream": {
          "format": "ndjson",
          "itemSchema": { "$ref": "#/components/schemas/UnitDescriptiveContentType" }
        }
      }
    }
  }
}
```

JSON array streams default to `application/json` and declare the record schema as the array item schema while keeping the same extension:

```json
{
  "200": {
    "description": "Successful streamed SOAP operation response",
    "content": {
      "application/json": {
        "schema": {
          "type": "array",
          "items": { "$ref": "#/components/schemas/UnitDescriptiveContentType" }
        },
        "x-wsdl-tsc-stream": {
          "format": "json-array",
          "itemSchema": { "$ref": "#/components/schemas/UnitDescriptiveContentType" }
        }
      }
    }
  }
}
```

OpenAPI 3.1 cannot fully describe an NDJSON sequence as a standard JSON Schema document, so the extension makes the item schema explicit. JSON-array streams use an array schema and retain the extension. Errors handled before response commitment can use the legacy error envelope; later failures truncate output.

## Gateway Output

Generated into the directory specified by `--gateway-dir`.

| File | Purpose |
|------|---------|
| plugin.ts | Fastify plugin entry point; registers routes and the SOAP client decorator |
| routes.ts | Route registration file that imports all individual route handlers |
| routes/*.ts | One file per WSDL operation with request validation, SOAP call, and response transform |
| schemas.ts | Schema registration file for JSON Schema validation |
| schemas/models/*.json | JSON Schema files for each type |
| schemas/operations/*.json | JSON Schema files for each operation request/response |
| runtime.ts | Runtime helpers for array unwrapping and type bridging |
| _typecheck.ts | Compile-time verification that types and schemas stay consistent |

### Route handler structure

Each route file in `routes/` follows the same pattern: validate the JSON request body against the operation schema, call the corresponding SOAP operation via the typed client, transform the SOAP response to JSON, and return it with the appropriate response schema.

### Stream Routes

Stream routes omit Fastify response serialization and deliver a `Readable` using `toNdjson` or `toJsonArray`. Completed records are mapped and optionally unwrapped per record; the route connects downstream disconnects to a per-call abort signal before waiting for upstream headers and throughout delivery. See [Streaming Handlers](gateway-guide.md#streaming-handlers) for the cancellable flow and pre-commit versus mid-stream failure policy.

### Generated Test Surface

When `--test-dir` is combined with `--stream-config`, the generated happy-path tests for stream operations assert on the configured content type. NDJSON tests parse each line as a separate JSON record, and JSON array tests parse the response body once as an array. Mock clients use async-generator overrides that yield records to drive those tests; see the [Testing Guide](testing.md) for the pattern.

### Plugin registration

The generated plugin exports a Fastify plugin function. Register it with your Fastify app and provide a client instance (real or mock) and a route prefix.

```typescript
import Fastify from "fastify";
import gateway from "./.generated/gateway/plugin.js";
import { Weather } from "./.generated/client/client.js";

const app = Fastify();
const client = new Weather({source: "./weather.wsdl"});
await app.register(gateway, { client, prefix: "/v1/weather" });
```

## App Output

Generated with `pipeline --init-app` or the `app` command. `--app-dir` selects the output location; the default is a sibling `app/` directory.

| File | Purpose |
|------|---------|
| server.ts | Application entry point with server startup |
| config.ts | Environment-based configuration loader |
| .env.example | Environment variable template for WSDL URL, port, host |
| package.json | Dependencies and npm scripts |
| tsconfig.json | TypeScript configuration for the app |

App scaffolds are preserved by default. Use `pipeline --force-init` or standalone `app --force` only for deliberate replacement after reviewing adopted customizations.

## What to Commit

All generated files are deterministic. Committing them to version control is safe and recommended. After WSDL changes, regenerate with the same command and review the diff to see exactly what changed.

## What to Customize

- Adopted app files (`server.ts`, `config.ts`, `.env`) are consumer-owned customization points.
- Gateway plugin, routes, and schemas: do not edit manually; they are overwritten on regeneration
- Add custom middleware, auth, logging, and error handling in your app code, not in generated gateway files
