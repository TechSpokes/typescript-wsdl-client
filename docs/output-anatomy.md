# Output Anatomy

This document describes each file produced by the generator, what it contains, and how to work with it. For CLI flags that control output, see [CLI Reference](cli-reference.md).

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
| types.ts | All TypeScript interfaces derived from WSDL/XSD types |
| client.ts | SOAP client class with one typed method per operation |
| operations.ts | Pure interface matching client methods, for mocking without importing `soap` |
| utils.ts | Runtime helpers including array unwrapping and type metadata |
| catalog.json | Compiled WSDL data in JSON format, used by other generation stages |

### types.ts

Contains one interface per WSDL complex type. Attributes and elements are flattened into peer properties. Inheritance is expressed with TypeScript `extends`. All numeric and date-time types map to `string` by default to prevent precision loss.

### client.ts

Exports a client class that wraps the `soap` package. Each WSDL operation becomes an async method with typed input and output. The class handles SOAP envelope construction and response parsing internally.

### operations.ts

Exports a TypeScript interface with the same method signatures as the client class but no implementation. Use this for dependency injection and testing. Your test code can implement this interface with mock data without importing the client or `soap`.

### utils.ts

Contains runtime metadata and helper functions. Includes `unwrapArrayWrappers()` for bridging between SOAP array wrapper objects and flattened OpenAPI array schemas.

## OpenAPI Output

Generated at the path specified by `--openapi-file`.

| File | Purpose |
|------|---------|
| openapi.json (or .yaml) | Complete OpenAPI 3.1 specification |

The spec includes one POST path per WSDL operation, request and response schemas in `components/schemas`, and descriptions derived from WSDL documentation annotations. Schemas are generated from the same catalog used for TypeScript types, so the two outputs stay aligned.

OpenAPI validation runs by default using `@apidevtools/swagger-parser`. Disable with `--openapi-validate false`.

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

### Plugin registration

The generated plugin exports a Fastify plugin function. Register it with your Fastify app and provide a client instance (real or mock) and a route prefix.

```typescript
import Fastify from "fastify";
import { myServiceGateway } from "./generated/gateway/plugin.js";
import { createMyServiceClient } from "./generated/client/client.js";

const app = Fastify();
const client = await createMyServiceClient("https://soap-endpoint.example.com");
await app.register(myServiceGateway, { client, prefix: "/v1/my-service" });
```

## App Output

Generated when `--init-app` is passed. Creates a runnable Fastify application in a sibling `app/` directory.

| File | Purpose |
|------|---------|
| index.ts | Application entry point with server startup |
| .env.example | Environment variable template for WSDL URL, port, host |
| package.json | Dependencies and npm scripts |
| tsconfig.json | TypeScript configuration for the app |

App files have overwrite protection: they are written only if they do not already exist. This prevents regeneration from overwriting your customizations. Use `--force-app` to override this behavior.

## What to Commit

All generated files are deterministic. Committing them to version control is safe and recommended. After WSDL changes, regenerate with the same command and review the diff to see exactly what changed.

## What to Customize

- App files (`index.ts`, `.env`): these are your entry points; customize freely after first generation
- Gateway plugin, routes, and schemas: do not edit manually; they are overwritten on regeneration
- Add custom middleware, auth, logging, and error handling in your app code, not in generated gateway files
