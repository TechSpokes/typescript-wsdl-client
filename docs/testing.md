# Testing Guide

Guide to running and writing tests for wsdl-tsc development and for testing generated code in consumer projects.

See [README](../README.md) for quick start and [CONTRIBUTING](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) for development setup.

Generated test files receive an [editable scaffold preamble](generated-code.md#generated-preambles-and-eslint). Remove its ESLint suppression when adopting the tests as maintained source; existing files are preserved unless `--force-test` is used. Full local CI includes `package:smoke`, which installs a tarball outside the checkout and validates generation, consumer compilation, and generated tests.

## Test Architecture

Tests protect behavior at several scopes; their execution cost also determines how they run:

1. Unit tests: Pure function tests for utilities, parsers, and type mapping
2. Snapshot tests: Baseline comparisons for all generated pipeline output
3. Integration tests: End-to-end gateway tests using Fastify's `inject()` with mock clients

Tests use [Vitest](https://vitest.dev/). Full conformance and installed-consumer qualification launch nested builds and processes and can take several minutes.

The main Vitest configuration runs the fast project first with half the available workers and a 30-second safety allowance. The workflows project then runs integration, conformance and named expensive unit files with two workers and a two-minute default allowance; existing longer workflow allowances remain effective. Standalone capability stages use the same two-worker, two-minute policy. These are safety allowances, not product performance requirements.

Split independent behaviors when doing so improves diagnosis without duplicating expensive setup. Give irreducible workflows headroom for machine load and report slow execution separately from correctness. For interactive investigation use `npm test -- <file> --test-timeout=0 --no-file-parallelism`; normal verification retains bounded execution.

`npm test`, `npm run ci`, `npm run test:unit`, `npm run test:integration`, `npm run test:corpus`, `npm run test:installed` and `npm run test:conformance` refuse overlapping owners across worktrees of this repository. Their `:run` scripts are internal unguarded targets. Each guarded attempt records context, output and outcome below `tmp/conformance/verification/`; gateway and schema-loading reports use that attempt directory. A stopped owner leaves a diagnostic lock which must be inspected before removal.

## Running Tests

```bash
npm test              # All Vitest tests
npm run test:unit     # Unit tests only
npm run test:snap     # Snapshot tests only
npm run test:integration  # Integration tests only
npm run test:conformance  # WSDL capability conformance tests only
npm run test:watch    # Watch mode for development
```

For the full CI pipeline including smoke tests:

```bash
npm run ci
```

### Verification orchestration

Inspect the current scripts before choosing commands. `ci` runs the reference launcher, build/typechecks, package/docs validation, broad Vitest including conformance and installed tests, smoke generation and installed package smoke. `test:installed`, `test:corpus` and standalone conformance overlap parts of that coverage; hosted quick and compatibility jobs are narrower signals.

Use focused tests during development, then give one owner responsibility for final candidate verification and its evidence. When standalone conformance is required, finish it and its cleanup before starting final CI, or run the two in the opposite order. Preserve both required commands; an overlapping standalone installed run adds contention rather than independent evidence for work already running inside CI.

Read-only inspection and genuinely independent bounded checks may run in parallel when capacity permits. Coordinate expensive builds, package installs and qualification across agents and worktrees because they share CPU and memory. A worktree isolates its files but does not reserve machine resources.

Each evidence directory needs one active writer. For example, installed gateway qualification replaces `tmp/conformance/checked-gateway-installed/progress.ndjson`, and schema loading writes `tmp/conformance/schema-loading/measurements.json`. Preserve failed-run logs before another run reuses those paths; wait for owned process termination and cleanup before replacement, and remove only task-owned outputs after delivery.

#### Deadlines and failures

Keep the outer tool allowance long enough for the command and cleanup; polling a quiet command is not a new test attempt. The enclosing test or batch watchdog must account for its sequential work, while each child-stage deadline bounds that child. Cancellation must reach owned work and await cleanup; product byte, node, work and transport budgets enforce separate runtime contracts.

A test runner can mark a test failed even when the behavior it checked was correct. For example, loading 64 MiB successfully and rejecting one extra byte can both pass but take about 32 seconds together, exceeding a test runner's 30-second allowance. The verification attempt still failed; retain the command, candidate, competing work and measurements before deciding whether product behavior, test composition or orchestration needs correction.

Inspect active processes and progress before diagnosing a quiet run as stalled; incomplete execution establishes no passing gate. Explain failures using the concrete checks, expected and observed outcomes, delivery impact and next necessary action. If the explanation is unclear, investigate until you understand the result, then explain the facts and their meaning for the user's task; avoid redundant status messages while providing every necessary explanation.

Review how expensive tests group work, not just their subprocesses. Independent acceptance and refusal checks should have separate test cases when combining them makes one ordinary allowance cover two complete workloads. Preserve both checks, their expected outcomes and the product limits; a passing isolated run alone does not establish that every similar test has been audited or that shared-machine contention has been resolved.

Correct the identified cause before a deliberate rerun. Keep the failed attempt visible, rerun affected checks and any unfinished required gates after cleanup, and reuse unchanged evidence without claiming an uninterrupted full-gate pass. Avoid automatic retries, global timeout increases, assertion weakening or product-budget changes to obtain a pass. An independent reviewer assesses the candidate and its evidence; coordinate any additional expensive reproduction with the verification owner rather than duplicating a running gate.

## Node Support Policy

The package supports Node.js >= 24.0.0. CI runs the complete project check on Node 24 and Node 26 so the supported floor and current Node line are both covered.

## Temporary Workspaces

Repository test and release automation keeps disposable output classified under `tmp/`:

- `tmp/smoke/`: smoke-script client, OpenAPI, gateway, app, and catalog output
- `tmp/cache/npm/`: local npm cache used by package and dependency checks
- `tmp/preflight/examples/`: regenerated examples used by release preflight
- `tmp/conformance/`: conformance mini-projects that need repository-local module resolution
- `tmp/test-generation/`: generated-test integration spikes

Keep new repository-owned temporary writers under the closest existing subfolder. Public CLI examples use the git-ignored `.generated/` convention instead of repository `tmp/` paths.

## Unit Tests

Unit tests cover pure functions with no I/O or side effects:

- `tools.test.ts`: `pascal()`, `resolveQName()`, `explodePascal()`, `pascalToSnakeCase()`, `normalizeArray()`, `getChildrenWithLocalName()`, `getFirstWithLocalName()`
- `casing.test.ts`: `toPathSegment()` with kebab, asis, and lower styles
- `primitives.test.ts`: `xsdToTsPrimitive()` covering all XSD types (string-like, boolean, integers, decimals, floats, dates, any)
- `errors.test.ts`: `WsdlCompilationError` construction and `toUserMessage()` formatting
- `schema-alignment.test.ts`: Cross-validates TypeScript types, JSON schemas, and catalog.json for consistency
- `mock-data.test.ts`: `generateMockPrimitive()`, `generateMockData()`, `generateAllOperationMocks()` with cycle detection and array wrapping
- `wsdl-documentation.test.ts`: verifies doc flow to catalog `wsdlDocs`, generated TS comments, OpenAPI summary and description precedence, and gateway route comment propagation

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
- Gateway route comments: propagated summary and description metadata
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

## Conformance Tests

Conformance tests live under `test/conformance/` and prove WSDL capability claims through committed fixtures, registry rows, generated artifacts, diagnostics, and documentation alignment. Use the focused command when changing capability rows or fixture-backed behavior:

```bash
npm run test:conformance
```

`npm test` includes the conformance suite through normal Vitest discovery. `npm run ci` and release preflight cover conformance through that broad test command, while release preflight also checks that the focused command and broad CI discovery remain wired.

Examples under `examples/` are consumer-facing demos and smoke-test inputs. Reusable WSDL and XSD behavior that represents a public support claim belongs in `test/conformance/fixtures/` with a matching registry row.

## Known Issues

### ArrayOf* Schema-Type Mismatch (Resolved)

JSON schemas flatten SOAP `ArrayOf*` wrapper types to plain `type: "array"` (when `--openapi-flatten-array-wrappers` is `true`, the default), while TypeScript types preserve the wrapper structure (e.g., `ArrayOfForecast = { Forecast?: Forecast[] }`).

This mismatch is resolved by the generated `unwrapArrayWrappers()` function in `runtime.ts`. Route handlers call it automatically to strip wrapper objects before Fastify serialization. Mock clients should return the real SOAP wrapper structure — the unwrap function handles the conversion.

When `--openapi-flatten-array-wrappers false` is used, ArrayOf* types are emitted as `type: "object"` and no unwrap function is generated. In this mode, mock data should use the wrapper object shape matching both the TypeScript types and the JSON schemas.

### Error Details Serialization

Connection and timeout errors carry an object in `details`, matching the error schema. Generated gateway tests exercise the serialized 503/504 responses through Fastify; direct `classifyError()` tests additionally check classification. Keep both responsibilities covered rather than bypassing HTTP serialization when it exposes a mismatch.

## Generated Test Suite

The `--test-dir` flag generates a complete, runnable Vitest test suite that validates all generated gateway artifacts out of the box. This is the recommended way to verify generated code in consumer projects.

### Generating Tests

```bash
npx wsdl-tsc pipeline \
  --wsdl-source service.wsdl \
  --client-dir ./.generated/client \
  --openapi-file ./.generated/openapi.json \
  --gateway-dir ./.generated/gateway \
  --gateway-service-name myservice \
  --gateway-version-prefix v1 \
  --test-dir ./.generated/tests
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
npx vitest run --config ./.generated/tests/vitest.config.ts
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

For operations opted in via `--stream-config`, the mock returns `records: AsyncIterable<RecordType>` via a small `asyncIterableOf` helper. Generated happy-path tests assert on the configured content type; NDJSON tests parse record lines, and JSON array tests parse the response body once as an array. Override a stream op with a multi-record iterable to exercise downstream backpressure:

```typescript
const client = createMockClient({
  UnitDescriptiveInfoStream: async () => ({
    records: (async function* () {
      yield { Id: "1", Name: "Villa A" };
      yield { Id: "2", Name: "Villa B" };
    })(),
    headers: {},
  }),
});
```

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
