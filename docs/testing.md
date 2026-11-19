# Testing Guide

Guide to running and writing tests for wsdl-tsc development and for testing generated code in consumer projects.

See [README](../README.md) for quick start and [CONTRIBUTING](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) for development setup.

Consumer projects should start at [For Consumer Projects](#for-consumer-projects), then choose the legacy [Generated Test Suite](#generated-test-suite) or checked scaffold workflow. The following repository commands require a clone and its development dependencies.

For checked one-way operations, independently assert completion of the owned HTTP exchange and empty downstream 202 without JSON Content-Type or a body schema. Treat acknowledgement as transport acceptance only; separately qualify business outcomes and never retry uncertain operations automatically. Generated scaffold tests remain offline by default. Include matching V6/V7 regeneration, native refusal/cancellation controls and actual upstream status/selected metadata names in consumer checks; see the [one-way contract](checked-gateway.md#one-way-operations).

## Test Architecture

Repository tests verify observable contracts and regressions, diagnose behavior and support confident changes. Choose the smallest meaningful check, retaining representative installed-package and independent SOAP wire/reference checks when those boundaries matter.

Scope and resource cost are separate. `test/unit/tools.test.ts` exercises small utility contracts, while `test/unit/client-choice-union-types.test.ts` launches TypeScript compilation and `test/unit/schema-loading-budgets.test.ts` exercises large inputs. A unit-folder label does not imply pure or inexpensive execution; snapshots are an assertion technique, used here to compare generated output baselines.

Tests use [Vitest](https://vitest.dev/). Mock gateway integration uses Fastify injection, while conformance builds consumer-style projects and installed qualification installs tarballs and runs generated projects. Independent reference tests check XML/schema and SOAP wire observations against separately specified expectations; mocks alone cannot establish those contracts.

The [main configuration](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/vitest.config.ts) runs `fast` first with half the available workers and a 30-second default test allowance; it leaves the fast hook allowance at Vitest's default (10 seconds). `workflows` follows with two workers and two-minute test/hook defaults for all integration, conformance and named expensive unit files. The [stage configuration](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/vitest.conformance.config.ts) uses two workers and two-minute test/hook defaults; explicit longer test and cleanup-hook overrides, such as installed checked-gateway qualification, remain effective.

These are safety cutoffs, not performance acceptance criteria. Report slow tests separately; legitimate expensive work needs measured headroom, potentially several times ordinary runtime under load. Split independent behaviors for diagnosis without multiplying costly installation or setup, and preserve product byte, I/O and SOAP limits as separate contracts.

## Running Tests

Run `npm ci` in a clone on Node 24 or newer. Choose a focused command while editing and run the delivery command on the final candidate.

| Command | Evidence |
| --- | --- |
| `npm test -- test/unit/tools.test.ts -t pascal` | One behavior with ordinary Vitest discovery |
| `npm run test:conformance:gateway` | One capability stage |
| `npm run test:conformance` | All capability stages and reference tests |
| `npm run smoke:pipeline` | Source CLI generation and TypeScript compilation of the Weather app |
| `npm run ci` | Full delivery gate |
| `npm run ci:platform` | Platform controls, audited reference and representative installed legacy and checked consumers |
| `npm run ci:platform:full` | Complete installed compatibility suite on the current OS and Node version |
| `npm run test:reference:full` | Explicit independent reference evidence, retained under `tmp/conformance/reference/` |

Plain `npm test` collects every product test. Run `npm run build` first when selecting installed or built-runtime tests outside the delivery gate. Research commands are separate. Use the command list in `package.json` for additional focused tasks.

### Verification orchestration

`npm run ci` builds the package once, validates one tarball, and runs the audited Node/WASM reference lane, broad Vitest discovery, docs and skill checks, and source and installed smoke checks. The broad Vitest run skips the already audited reference subtree. Installed tests reuse the tarball and perform isolated consumer installs for their distinct legacy, checked and relocated runtime paths.

GitHub runs the full delivery gate on Linux with Node 24. Ordinary pushes and PRs run the shorter compatibility command on Linux with Node 26 and on Windows with Node 24 and 26. Those jobs retain the audited reference and platform controls, install and run the packed legacy generator, and execute a relocated checked gateway over TLS.

Use the complete compatibility command or manually dispatch the CI workflow at the candidate branch when changes to Node, dependencies, runner behavior or verification tooling need the deeper installed matrix. Manually dispatched jobs run the full compatibility variants. Release preflight runs full delivery before packaging the release skill asset.

Run an affected capability stage while iterating. Full delivery already runs the capability suite. Use standalone conformance when you need just that evidence, or when the task explicitly requires a separate run.

A checkout has one owner for `dist/` during delivery, platform qualification, or corpus verification. Wait for that run before starting a manual build or any focused check that reads `dist/`. Use another checkout when both genuinely need to run at once.

### Before opening or updating a pull request

1. Finish and self-review the complete diff, including applicable tests, docs, examples and release metadata.
2. Run the focused local checks that cover the diff. Fix failures before handing the candidate to a reviewer.
3. Give a reviewer the local diff and check results. Use extra reviewers for distinct risks and batch the fixes.
4. Have one owner run the remaining local verification. For releases, review the final uncommitted tree and run release preflight once.
5. Open the PR or push the reviewed and verified candidate to the existing PR branch. Draft PRs also trigger CI.

Give reviewers the existing results so they can focus on the diff. Run checks that share build or packaging outputs in sequence. Record results in the PR summary and keep transient logs outside the candidate tree.

When a check needs hosted infrastructure, record which local checks passed and what GitHub still needs to verify. Reuse valid results when retrying a hosted failure on the same candidate. After a fix, repeat the affected checks and review material changes before pushing again.

### Temporary output and recovery

Ordinary verification prints its unique directory under `tmp/verification/`. Conformance, generated-test, smoke and package scratch stay in that workspace. The runner allocates and records a separate operating-system temporary directory for installs so Node cannot resolve checkout dependencies through their ancestors.

The runner waits for its command to finish, removes its workspace after success or ordinary failure, and restores the pre-existing `dist/` after a delivery build. npm and CI cache `tmp/cache/npm/` across runs. Release examples, explicit reference reports, consumer `.generated/` output, and existing evidence have their own lifecycles.

Use Ctrl+C for ordinary cancellation and wait for cleanup. If the runner is forcibly stopped, find the exact printed `run-*` directory, check its recorded `owner` and `child` PIDs, and confirm that their descendants have stopped. Recover from the same checkout with the same temporary-directory environment.

```bash
npm run clean:verification -- run-ABC123
```

Recovery reports a live PID or unexpected path and leaves the workspace available for inspection. It only cleans the named run and restores the build it owned. Keep manual builds, unrelated files, and links outside that cleanup. Use console output for the failing check, timing, and relevant diagnostics. CI retains the job log.

### Windows and certificates

Use Node system trust for ordinary HTTPS. Set `NODE_USE_SYSTEM_CA=1` (PowerShell below) when registry traffic passes through Windows certificate inspection such as Avast. Tests with owned TLS endpoints use their fixture CA and keep verification enabled. The tests use committed WSDL/XSD and owned endpoints. npm can contact its configured registry for dependencies when the cache is cold.

```powershell
$env:NODE_USE_SYSTEM_CA = '1'
npm run ci
```

In a Windows Codex sandbox that restricts owned loopback TCP/TLS or test junction creation, request scoped elevated execution before running the affected checks. A sandbox denial in one of those controls is an execution restriction. Run the same check with the needed access and retain certificate verification.

### Test deadlines

Allow at least six minutes for full conformance on Windows and allow more time for the delivery gate and cleanup. A quiet subprocess can be compiling or running generated tests. Check the running stage or owned process before starting a replacement and rerun the affected gate after correcting a failure.

## Node Support Policy

The package supports Node.js >= 24.0.0. GitHub tests Node 24 and 26 on Linux and Windows. Release workflows run on Node 24.

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

The retained snapshots cover checked nil-content and keyed component artifacts. A separate integration test generates the legacy Weather pipeline twice from clean output and compares the bytes. Conformance and runtime tests assert the generated interfaces and their behavior.

### Updating Snapshots

```bash
npm run test:snap -- -u
```

Always review the diff before committing updated snapshots.

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
