# Testing Guide

Guide to running and writing tests for wsdl-tsc development and for testing generated code in consumer projects.

See [README](../README.md) for quick start and [CONTRIBUTING](../CONTRIBUTING.md) for development setup.

## Test Architecture

The project uses three layers of testing:

1. **Unit tests** — Pure function tests for utilities, parsers, and type mapping
2. **Snapshot tests** — Baseline comparisons for all generated pipeline output
3. **Integration tests** — End-to-end gateway tests using Fastify's `inject()` with mock clients

All tests use [Vitest](https://vitest.dev/) and run in under 3 seconds.

## Running Tests

```bash
npm test              # All Vitest tests
npm run test:unit     # Unit tests only
npm run test:snap     # Snapshot tests only
npm run test:integration  # Integration tests only
npm run test:watch    # Watch mode for development
```

For the full CI pipeline including smoke tests:

```bash
npm run ci
```

## Unit Tests

Unit tests cover pure functions with no I/O or side effects:

- **`tools.test.ts`** — `pascal()`, `resolveQName()`, `explodePascal()`, `pascalToSnakeCase()`, `normalizeArray()`, `getChildrenWithLocalName()`, `getFirstWithLocalName()`
- **`casing.test.ts`** — `toPathSegment()` with kebab, asis, and lower styles
- **`primitives.test.ts`** — `xsdToTsPrimitive()` covering all XSD types (string-like, boolean, integers, decimals, floats, dates, any)
- **`errors.test.ts`** — `WsdlCompilationError` construction and `toUserMessage()` formatting
- **`schema-alignment.test.ts`** — Cross-validates TypeScript types, JSON schemas, and catalog.json for consistency
- **`mock-data.test.ts`** — `generateMockPrimitive()`, `generateMockData()`, `generateAllOperationMocks()` with cycle detection and array wrapping

### Writing Unit Tests

```typescript
import { describe, it, expect } from "vitest";
import { pascal } from "../../src/util/tools.js";

describe("pascal", () => {
  it("converts kebab-case", () => {
    expect(pascal("get-weather")).toBe("GetWeather");
  });
});
```

## Snapshot Tests

Snapshot tests capture the complete output of the pipeline as baselines. When a generator change intentionally alters output, the snapshot diff shows exactly what changed.

### How It Works

1. The pipeline runs against `examples/minimal/weather.wsdl` into a temp directory
2. Each generated file is read and compared against the stored snapshot
3. A file inventory snapshot detects added or removed files

### Updating Snapshots

```bash
npx vitest run test/snapshot -u
```

Always review the diff before committing updated snapshots.

### What's Covered

- Client output: `client.ts`, `types.ts`, `utils.ts`, `operations.ts`, `catalog.json`
- OpenAPI: `openapi.json`
- Gateway core: `plugin.ts`, `routes.ts`, `schemas.ts`, `runtime.ts`, `_typecheck.ts`
- Gateway routes: one handler per WSDL operation
- Gateway schemas: all model and operation JSON schema files
- File inventory: complete listing of generated files

## Integration Tests

Integration tests verify the generated gateway works end-to-end by:

1. Running the pipeline in `beforeAll` to generate gateway code
2. Dynamically importing the generated plugin
3. Creating a Fastify instance with the plugin and a mock client
4. Using `fastify.inject()` to send HTTP requests and verify responses

### Mock Client Pattern

The generated `operations.ts` provides a typed interface for creating test doubles:

```typescript
import type { WeatherOperations } from "../client/operations.js";

function createMockClient(): WeatherOperations {
  return {
    GetCityWeatherByZIP: async (args) => ({
      response: {
        GetCityWeatherByZIPResult: {
          Success: true,
          ResponseText: "City Found",
          State: "NY",
          City: "New York",
          Temperature: "72",
        },
      },
      headers: {},
    }),
    GetCityForecastByZIP: async (args) => ({
      response: {
        GetCityForecastByZIPResult: {
          Success: true,
          ResponseText: "Forecast Found",
          // Use SOAP wrapper shape — unwrapArrayWrappers() handles conversion
          ForecastResult: { Forecast: [] },
        },
      },
      headers: {},
    }),
    GetWeatherInformation: async (args) => ({
      response: {
        // Use SOAP wrapper shape — unwrapArrayWrappers() handles conversion
        GetWeatherInformationResult: { WeatherDescription: [] },
      },
      headers: {},
    }),
  };
}
```

Each method returns the same `{ response, headers }` shape as the real SOAP client. Use the wrapper object structure matching TypeScript types — the generated `unwrapArrayWrappers()` function handles conversion to the flat array shape expected by JSON schemas.

### Using the Mock with Fastify

```typescript
import Fastify from "fastify";

const app = Fastify();
await app.register(weatherGateway, {
  client: createMockClient(),
  prefix: "/v1/weather",
});
await app.ready();

const res = await app.inject({
  method: "POST",
  url: "/v1/weather/get-city-weather-by-zip",
  payload: { ZIP: "10001" },
});

expect(res.statusCode).toBe(200);
expect(res.json().status).toBe("SUCCESS");
```

### Dynamic Import of Generated Code

Integration tests dynamically import generated `.ts` files from temp directories. This works because Vitest's Vite module resolution handles TypeScript imports, JSON import attributes, and bare specifiers from the project's `node_modules`:

```typescript
import { pathToFileURL } from "node:url";

const pluginModule = await import(pathToFileURL(join(outDir, "gateway", "plugin.ts")).href);
```

## Known Issues

### ArrayOf* Schema-Type Mismatch (Resolved)

JSON schemas flatten SOAP `ArrayOf*` wrapper types to plain `type: "array"` (when `--openapi-flatten-array-wrappers` is `true`, the default), while TypeScript types preserve the wrapper structure (e.g., `ArrayOfForecast = { Forecast?: Forecast[] }`).

This mismatch is resolved by the generated `unwrapArrayWrappers()` function in `runtime.ts`. Route handlers call it automatically to strip wrapper objects before Fastify serialization. Mock clients should return the real SOAP wrapper structure — the unwrap function handles the conversion.

When `--openapi-flatten-array-wrappers false` is used, ArrayOf* types are emitted as `type: "object"` and no unwrap function is generated. In this mode, mock data should use the wrapper object shape matching both the TypeScript types and the JSON schemas.

### Error Details Serialization

The `classifyError()` function puts `err.message` (a string) in the `details` field for connection and timeout errors, but the error JSON schema defines `details` as `object | null`. This causes Fastify serialization failures for 503/504 error responses. Test error classification directly via `classifyError()` rather than through Fastify's `inject()` for these error types.

## Generated Test Suite

The `--test-dir` flag generates a complete, runnable Vitest test suite that validates all generated gateway artifacts out of the box. This is the recommended way to verify generated code in consumer projects.

### Generating Tests

```bash
npx wsdl-tsc pipeline \
  --wsdl-source service.wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name myservice \
  --gateway-version-prefix v1 \
  --test-dir ./generated/tests
```

### Generated Structure

```text
{test-dir}/
  vitest.config.ts
  helpers/
    mock-client.ts            createMockClient() with full default responses per operation
    test-app.ts               createTestApp() Fastify bootstrap helper
  gateway/
    routes.test.ts            per-operation happy path (one test per route)
    errors.test.ts            400/500/502/503/504 through Fastify
    envelope.test.ts          SUCCESS/ERROR structure assertions
    validation.test.ts        invalid payloads rejected per route
  runtime/
    classify-error.test.ts    classifyError() unit tests
    envelope-builders.test.ts buildSuccessEnvelope/buildErrorEnvelope
    unwrap.test.ts            unwrapArrayWrappers (only when ArrayOf* wrappers exist)
```

### Running Generated Tests

```bash
npx vitest run --config ./generated/tests/vitest.config.ts
```

### Skip-if-Exists Behavior

Test files that already exist are skipped by default. This allows you to customize generated tests without losing changes on regeneration. Use `--force-test` to overwrite all test files.

### Mock Client

The generated `helpers/mock-client.ts` creates a fully typed mock client with default responses for every operation. Override individual methods for specific test scenarios:

```typescript
import { createMockClient } from "./helpers/mock-client.js";

const client = createMockClient({
  GetCityWeatherByZIP: async () => ({
    response: { GetCityWeatherByZIPResult: { Success: false, WeatherID: 0 } },
    headers: {},
  }),
});
```

Mock responses use the pre-unwrap SOAP wrapper shape. The generated `unwrapArrayWrappers()` function handles conversion at runtime.

## For Consumer Projects

If you're using wsdl-tsc as a dependency and want to test your integration:

1. Generate code with `npx wsdl-tsc pipeline --test-dir ./tests` to get a ready-to-run test suite
2. Run `npx vitest run --config ./tests/vitest.config.ts` to verify everything works
3. Customize generated tests as needed (they won't be overwritten on regeneration)

Alternatively, write tests manually:

1. Generate code with `npx wsdl-tsc pipeline`
2. Import the operations interface from `operations.ts`
3. Create a mock client implementing the interface
4. Register the generated gateway plugin with your mock client
5. Use Fastify's `inject()` to test routes without a running server

The operations interface is the recommended seam for dependency injection and testing. It's a pure TypeScript interface with no runtime dependencies on the `soap` package.
