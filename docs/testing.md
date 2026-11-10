# Testing Guide

Guide to running and writing tests for wsdl-tsc development and for testing generated code in consumer projects.

See [README](../README.md) for quick start and [CONTRIBUTING](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) for development setup.

Consumer projects should start at [For Consumer Projects](#for-consumer-projects), then choose the legacy [Generated Test Suite](#generated-test-suite) or checked scaffold workflow. The repository-maintenance sections below require a clone and its development dependencies; installing the npm package does not install repository scripts, Vitest projects or the shared verification lock.

## Test Architecture

Repository tests verify observable contracts and regressions, diagnose behavior and support confident changes. Choose the smallest meaningful check, retaining representative installed-package and independent SOAP wire/reference checks when those boundaries matter.

Scope and resource cost are separate. `test/unit/tools.test.ts` exercises small utility contracts, while `test/unit/client-choice-union-types.test.ts` launches TypeScript compilation and `test/unit/schema-loading-budgets.test.ts` exercises large inputs. A unit-folder label does not imply pure or inexpensive execution; snapshots are an assertion technique, used here to compare generated output baselines.

Tests use [Vitest](https://vitest.dev/). Mock gateway integration uses Fastify injection, while conformance builds consumer-style projects and installed qualification installs tarballs and runs generated projects. Independent reference tests check XML/schema and SOAP wire observations against separately specified expectations; mocks alone cannot establish those contracts.

The [main configuration](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/vitest.config.ts) runs `fast` first with half the available workers and a 30-second default test allowance; it leaves the fast hook allowance at Vitest's default (10 seconds). `workflows` follows with two workers and two-minute test/hook defaults for all integration, conformance and named expensive unit files. The [stage configuration](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/vitest.conformance.config.ts) uses two workers and two-minute test/hook defaults; explicit longer test and cleanup-hook overrides, such as installed checked-gateway qualification, remain effective.

These are safety cutoffs, not performance acceptance criteria. Report slow tests separately; legitimate expensive work needs measured headroom, potentially several times ordinary runtime under load. Split independent behaviors for diagnosis without multiplying costly installation or setup, and preserve product byte, I/O and SOAP limits as separate contracts.

## Running Tests

```bash
npm test              # All Vitest tests
npm run test:unit     # Unit tests only
npm run test:snap     # Snapshot tests only
npm run test:integration  # Integration tests only
npm run test:conformance  # WSDL capability conformance tests only
npm run test:installed    # Installed consumer qualification
npm run test:watch    # Watch mode for development
```

For the full CI pipeline including smoke tests:

```bash
npm run ci
```

Use a file and test-name filter for a focused check, or select a delivered project:

```bash
npm test -- test/unit/tools.test.ts -t pascal
npm test -- --project fast
npm run test:conformance:gateway
```

For interactive debugging, disabling the individual test timeout does not disable hook deadlines or the guarded wrapper's 45-minute outer deadline:

```bash
npm test -- test/unit/tools.test.ts --test-timeout=0 --no-file-parallelism
```

Prefer the guarded public commands: `npm test`, `npm run ci`, `npm run test:unit`, `npm run test:integration`, `npm run test:corpus`, `npm run test:installed` and `npm run test:conformance`. Their corresponding `:run` targets are internal, unguarded implementation commands. Direct Vitest, `test:snap`, watch, capability-stage, reference, platform and hosted CI commands are not all wrapped; the guard is not a machine-wide scheduler.

### Verification orchestration

Inspect the current scripts before choosing commands. `ci` runs the reference launcher, build/typechecks, package/docs validation, broad Vitest including conformance and installed tests, smoke generation and installed package smoke. `test:installed`, `test:corpus` and standalone conformance overlap parts of that coverage; hosted quick and compatibility jobs are narrower signals.

Use focused tests during development, then give one owner responsibility for final candidate verification and its evidence. When standalone conformance is required, finish it and its cleanup before starting final CI, or run the two in the opposite order. Preserve both required commands; an overlapping standalone installed run adds contention rather than independent evidence for work already running inside CI.

Read-only inspection and genuinely independent bounded checks may run in parallel when capacity permits. Coordinate expensive builds, package installs and qualification across agents and worktrees because they share CPU and memory. A worktree isolates its files but does not reserve machine resources.

The [verification wrapper](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/scripts/run-verification.ts) shares an owner across worktrees through `tmp/conformance/verification/active.json` beneath the common Git directory's parent. A live owner causes refusal; wait for it or ask its coordinator to cancel and await owned-child cleanup. Quiet output or an expired tool wait does not authorize replacing a run.

Each guarded attempt prints its unique `attempt-*` directory and records `context.json`, `command.log` and `result.json`. Gateway qualification writes `checked-gateway-installed/progress.ndjson` there; schema loading writes `schema-loading/measurements.json` there. CI also copies a newly written `tmp/conformance/product-tests.json` into the attempt directory; interrupted runs may leave incomplete evidence.

Other writers and unguarded invocations can still use fixed paths, including gateway/schema-loading fallback paths under `tmp/conformance/` and the hosted `installed-tests.json` report. Do not assume all evidence is immutable. Preserve failed evidence before paths are reused, wait for termination and cleanup, and remove only task-owned outputs after delivery.

For a stale lock, read the specific `active.json` owner's PID, command and working directory, then inspect actual process state, including possible PID reuse and surviving owned children. Only after confirming the owner has stopped and cleanup is complete, remove that specific lock and start a deliberate replacement. There is no automatic stale-lock reclamation; never remove a live owner's lock, kill unrelated work or broadly clean `tmp/` to recover.

Record the candidate, command, environment and evidence limits when reusing matching results. A fresh independent reviewer reads the coherent diff and relevant results, then approves or returns actionable findings; coordinate additional expensive checks through the verification owner. Copied source snapshots, review-report files and repeated unchanged reviews are unnecessary.

#### Deadlines and failures

Keep the outer tool allowance long enough for the command and cleanup; polling a quiet command is not a new test attempt. The enclosing test or batch watchdog must account for its sequential work, while each child-stage deadline bounds that child. Cancellation must reach owned work and await cleanup; product byte, node, work and transport budgets enforce separate runtime contracts.

A test runner can mark a test failed even when the behavior it checked was correct. For example, loading 64 MiB successfully and rejecting one extra byte can both pass but take about 32 seconds together, exceeding a test runner's 30-second allowance. The verification attempt still failed; retain the command, candidate, competing work and measurements before deciding whether product behavior, test composition or orchestration needs correction.

Inspect active processes and progress before diagnosing a quiet run as stalled; incomplete execution establishes no passing gate. Explain failures using the concrete checks, expected and observed outcomes, delivery impact and next necessary action. If the explanation is unclear, investigate until you understand the result, then explain the facts and their meaning for the user's task; avoid redundant status messages while providing every necessary explanation.

Review how expensive tests group work, not just their subprocesses. Independent acceptance and refusal checks should have separate test cases when combining them makes one ordinary allowance cover two complete workloads. Preserve both checks, their expected outcomes and the product limits; a passing isolated run alone does not establish that every similar test has been audited or that shared-machine contention has been resolved.

Correct the identified cause before a deliberate rerun. Keep the failed attempt visible, rerun affected checks and any unfinished required gates after cleanup, and reuse unchanged evidence without claiming an uninterrupted full-gate pass. Avoid automatic retries, global timeout increases, assertion weakening or product-budget changes to obtain a pass. An independent reviewer assesses the candidate and its evidence; coordinate any additional expensive reproduction with the verification owner rather than duplicating a running gate.

## Node Support Policy

The package supports Node.js >= 24.0.0. Hosted CI runs quick checks on Node 24 and a narrower compatibility smoke on Node 26. Separate installed-product jobs cover Linux and Windows on both lines, with platform checks, Windows reference/feasibility checks and standalone Linux Node 24 conformance; these signals complement broad local CI and do not replace release preflight.

## Temporary Workspaces

Repository test and release automation keeps disposable output classified under `tmp/`:

- `tmp/smoke/`: smoke-script client, OpenAPI, gateway, app, and catalog output
- `tmp/cache/npm/`: local npm cache used by package and dependency checks
- `tmp/preflight/examples/`: regenerated examples used by release preflight
- `tmp/conformance/`: conformance mini-projects that need repository-local module resolution
- `tmp/test-generation/`: generated-test integration spikes

Keep new repository-owned temporary writers under the closest existing subfolder. Public CLI examples use the git-ignored `.generated/` convention instead of repository `tmp/` paths.

## Unit Tests

The unit directory includes small function checks, filesystem work, compilation and resource workflows. Select by the behavior and actual setup, not the folder name:

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

For manual legacy gateway tests, the mock pattern below checks HTTP route behavior without proving live SOAP interoperability:

1. Running the pipeline in `beforeAll` to generate gateway code
2. Dynamically importing the generated plugin
3. Creating a Fastify instance with the plugin and a mock client
4. Using `fastify.inject()` to send HTTP requests and verify responses

### Mock Client Pattern

The legacy generated `operations.ts` provides a typed interface for creating test doubles. The following fragments assume the Weather fixture's generated client and gateway; adapt imports and operation names to your consumer project:

```typescript
import type { WeatherOperations } from "../client/operations.js";

function createMockClient(): WeatherOperations {
  return {
    GetCityWeatherByZIP: async (args) => ({
      response: {
        GetCityWeatherByZIPResult: {
          Success: true,
          WeatherID: 0,
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
          // Use SOAP wrapper shape; unwrapArrayWrappers() handles conversion
          ForecastResult: { Forecast: [] },
        },
      },
      headers: {},
    }),
    GetWeatherInformation: async (args) => ({
      response: {
        // Use SOAP wrapper shape; unwrapArrayWrappers() handles conversion
        GetWeatherInformationResult: { WeatherDescription: [] },
      },
      headers: {},
    }),
  };
}
```

Each method returns the same `{ response, headers }` shape as the real SOAP client. Use the wrapper object structure matching TypeScript types; the generated `unwrapArrayWrappers()` function handles conversion to the flat array shape expected by JSON schemas.

### Using the Mock with Fastify

This fragment assumes your test imports `expect` and the generated `weatherGateway` plugin and defines `createMockClient()` above. Close the Fastify instance in test cleanup.

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

When generating into a temporary directory during a test, Vitest's Vite module resolution handles TypeScript imports, JSON import attributes and bare specifiers from the project's `node_modules`. This fragment assumes `join`, `outDir` and the generated gateway directory are already defined:

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

For legacy generation, `--test-dir` emits runnable Vitest mock-route and runtime checks. They verify generated HTTP behavior against generated fixtures, not all service semantics. For checked generation use the separate [consumer workflow](#for-consumer-projects).

### Generating Tests

Run from an ESM consumer project on Node.js >= 24 with an existing `package.json` and your local `service.wsdl` plus its schema dependencies. Install generator, test and runtime dependencies there; the package does not supply this repository's npm scripts:

```bash
npm install --save-dev @techspokes/typescript-wsdl-client typescript @types/node vitest
npm install soap fastify fastify-plugin saxes
```

Generate matched artifacts with explicit paths:

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

From the same consumer project root:

```bash
npx vitest run --config ./.generated/tests/vitest.config.ts
```

The emitted config roots discovery at the test directory, includes `gateway/**/*.test.ts` and `runtime/**/*.test.ts`, and sets a 30-second test timeout. It does not emit this repository's `fast`/`workflows` projects, worker bounds or lock. Adapt runner allowances to your workload, and run your project's TypeScript check with generated client/gateway files included; Vitest execution alone does not typecheck them.

An optional legacy app scaffold supplies `start` and `dev`, not `test` or `typecheck`, and does not add Vitest. Install test dependencies where the test files can resolve them and use the explicit config command above or your existing project scripts. See [TypeScript Configuration](troubleshooting.md#typescript-configuration) for consumer compiler setup.

### Skip-if-Exists Behavior

Test files that already exist are skipped by default. Customize them as consumer-owned scaffolds; `--force-test` deliberately overwrites existing emitted files. Preserve customizations before refreshing tests after contract changes; skipped files are not automatically updated to match regenerated artifacts.

Generated test files receive an [editable scaffold preamble](generated-code.md#generated-preambles-and-eslint). Remove its ESLint suppression when adopting the tests as maintained source, and keep maintained tests outside disposable or globally ignored output. Regenerate client/gateway artifacts from inputs and configuration; app scaffolds have separate `--force-init` protection.

### Mock Client

The generated `helpers/mock-client.ts` creates a fully typed mock client with default responses for every operation. Override individual methods for specific test scenarios:

```typescript
import { createMockClient } from "./helpers/mock-client.js";

const client = createMockClient({
  GetCityWeatherByZIP: async () => ({
    response: { GetCityWeatherByZIPResult: { Success: false, WeatherID: 0, ResponseText: "Not found" } },
    headers: {},
  }),
});
```

Mock responses use the pre-unwrap SOAP wrapper shape. The generated `unwrapArrayWrappers()` function handles conversion at runtime.

For operations opted in via `--stream-config`, the mock returns `records: AsyncIterable<RecordType>` via a small `asyncIterableOf` helper. Generated happy-path tests assert on the configured content type; NDJSON tests parse record lines, and JSON array tests parse the response body once as an array. The following contextual fragment assumes your generated helper has a `UnitDescriptiveInfoStream` operation with `Id`/`Name` records; a multi-record iterable exercises record handling, while backpressure needs a separate slow-consumer check:

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

When upgrading an existing project, use the [version migration guide](migration.md#from-11x-to-120) to identify changed names and record/value shapes before choosing checks. This package's release tests qualify representative generated consumers and compatibility fixtures; they do not certify every consumer's migration. Keep a known-working revision and verify the application's observable contracts with its own build, maintained tests and authorized backend acceptance.

Choose tests for your integration's observable contracts and regressions. Start with the smallest meaningful check in your project's existing runner; using this generator does not require adopting the generator repository's CI or test configuration. The npm-shipped guide contains maintainer sections for reference, but repository scripts, shared locks and release gates do not apply to consumer projects.

### Choose legacy or checked generation

Legacy is the default. Follow [Generated Test Suite](#generated-test-suite) for complete dependency, WSDL, output and run commands. For manual tests, generate the same client/gateway outputs, import the operations interface, inject a typed mock into the gateway plugin and assert HTTP responses with Fastify injection or your existing HTTP stack; see [Integration Tests](#integration-tests) for contextual Weather fragments.

The legacy operations interface is a TypeScript seam without a runtime `soap` import; executing the real client still needs `soap`. Keep useful mock response and streaming scenarios when integrating tests into another runner.

For opt-in `checked-components-v1`, use Node.js >= 24 and a consumer project with the generator installed as a development dependency. This complete example uses the bundled synthetic contract and places client, gateway, OpenAPI and tests inside the generated app:

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npx wsdl-tsc pipeline --model checked-components-v1 --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast/client --openapi-file .generated/forecast/openapi.json --gateway-dir .generated/forecast/gateway --gateway-service-name forecast --gateway-version-prefix v1 --init-app --app-dir .generated/forecast --test-dir .generated/forecast/test
cd .generated/forecast
npm install
npm run typecheck
npm test
```

Checked tests require app generation and emit `test/checked-scaffold.test.ts` at these paths, without a separate Vitest config. The checked app's package provides Vitest, TypeScript and runtime dependencies plus `typecheck`, `test`, `build` and `start` scripts; `npm test` runs `vitest run` with normal consumer discovery/defaults. It does not inherit this repository's project groups or lock. See [checked generation](checked-generation.md#check-and-start-the-generated-project) for build/start steps and how to substitute your source.

### What generated checks establish

Legacy mock checks exercise route validation, envelopes, error serialization and runtime helpers. Checked scaffold checks exercise health, selected OpenAPI and invalid-request refusal without upstream dispatch, using a loopback placeholder and empty endpoint restrictions. Neither proves independent SOAP wire compatibility, provider behavior or business acceptance, and neither authorizes production transactions.

Add independent expected request/response and fault fixtures for owned test services where SOAP interoperability matters, then obtain provider/business acceptance separately. Do not derive every expected answer from the same generated implementation. Choose authorized endpoints and operations before making real calls; the bundled checked contract has no running backend.

### Regeneration and customization

Keep generator/runtime versions, source snapshots, client, gateway and OpenAPI artifacts matched. Test and app scaffolds preserve existing files unless `--force-test` or `--force-init` respectively is selected; inspect and merge intended changes rather than bypassing protection. Remove the editable scaffold's ESLint suppression when adopting maintained source, and retain maintained tests outside disposable generated output.

Run the consumer project's typecheck and tests after regeneration. Reuse matching evidence with its source/artifact identity, command, environment and limits; a passing scaffold test is only evidence for the behavior it exercises.
