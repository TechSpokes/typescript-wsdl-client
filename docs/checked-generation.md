# Try opt-in checked generation

Opt-in checked generation supports qualified SOAP 1.1 and SOAP 1.2 document/literal contracts and the bounded SOAP 1.1 RPC/encoded string profile. Choose `pipeline --model checked-components-v1`; omitting `--model` keeps legacy generation. SOAP 1.2 execution is available starting with 1.3.0; see the [binding and artifact contract](checked-gateway.md#component-service-generation). See the root [README](../README.md).

This is a bounded preview, not general WSDL/XSD or production-provider qualification. It adds source-backed request, response, fault and artifact checks for the supported fragment. Generation exposes legacy and components only; the shipped v1.1.5 direct runtime remains a compatibility binding for existing clients. See the [checked gateway reference](checked-gateway.md).

## Install and try the bundled contract

The examples use published 1.7.0 for the bundled contract, including buffered transport, credential/header and metadata fidelity. Install the exact registry version for a reproducible trial; earlier releases retain their documented contracts. The [published consumer acceptance plan](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/v1.0-published-consumer-acceptance.md) separately qualifies ordinary generated-app dependency installation.

Use Node.js 24 or newer. Run these commands in a new trial directory:

```powershell
npm init -y
npm install --save-dev --save-exact @techspokes/typescript-wsdl-client@1.7.0
npm install soap
npx wsdl-tsc pipeline --model checked-components-v1 --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast/client --openapi-file .generated/forecast/openapi.json --gateway-dir .generated/forecast/gateway --gateway-version-prefix v1 --gateway-service-name forecast --init-app --app-dir .generated/forecast --test-dir .generated/forecast/test --checked-report .generated/forecast-plan.json
```

The bundled [Forecast contract](examples/checked-forecast.wsdl) is synthetic and has no running SOAP backend. Generation selects its one unambiguous service/port/binding and `GetForecast` operation without a configuration file. Its placeholder SOAP address must be replaced with your owned test backend before invoking the operation.

The generated project includes `client/inventory.json`, copied WSDL/XSD sources and provenance, operation clients/contracts, OpenAPI, gateway routes, server configuration and scaffold tests. The planning report lists readiness and blockers; the inventory records discovered, selected and generated operations. Generation does not mean an operation was executed.

Input-only document/literal sources use the [one-way operation contract](checked-gateway.md#one-way-operations) on either SOAP version. A complete allowed empty exchange returns a transport-only acknowledgement and an empty gateway 202, not application success. Configure downstream metadata names in the existing checked object; selection, source/security validation and defaults stay explicit.

## Check and start the generated project

Services with independently authored application-error responses can opt into [pinned response branches](checked-gateway.md#independently-validated-application-error-branches). Each branch requires a complete independently validated error grammar and exact QName path; matching generated artifacts retain the full error value and return HTTP 502.

Run from the generated app directory below. Its package supplies test/typecheck dependencies and scripts; scaffold tests check health, selected OpenAPI and invalid-input refusal without upstream SOAP dispatch. See [consumer testing guidance](testing.md#for-consumer-projects) for emitted configuration, customization protection and independent verification boundaries.

```powershell
Set-Location .generated/forecast
npm install
npm run typecheck
npm test
npm run build
npm start
```

Generation, installation, startup and scaffold tests do not execute business SOAP operations. Startup loads generated bookkeeping, verifies its owned snapshot digests and checks gateway/OpenAPI identity. Native source qualification and source/contract compatibility run independently when an operation is invoked; a healthy server alone does not prove SOAP readiness. In a second terminal, inspect the running gateway:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/openapi.json
```

Stop the foreground server with Ctrl+C when finished. The npm and generation commands also work in POSIX shells. No runtime configuration file is required for ordinary startup.

## Try your WSDL file or URL

Run from the trial directory, using a fresh output directory for a different contract. Replace the source with your local WSDL or an HTTP(S) metadata URL you are permitted to access:

```powershell
npx wsdl-tsc pipeline --model checked-components-v1 --wsdl-source https://provider.example/service.wsdl --client-dir .generated/service/client --openapi-file .generated/service/openapi.json --gateway-dir .generated/service/gateway --gateway-version-prefix v1 --gateway-service-name service --init-app --app-dir .generated/service --test-dir .generated/service/test --checked-report .generated/service-plan.json --checked-draft service-resolution.json
```

The loader follows declared WSDL imports and XSD imports/includes recursively, including authorized redirects. Same-origin dependencies require no authored resource map or selectors. For local input, the containing directory is the default permitted root; authorize outside-root files explicitly through `fileRoots` in `--checked-config`.

For a declared dependency on another origin, save a reusable project configuration such as `intake.json` and add `--checked-config intake.json` to the command:

```json
{
  "sourceOrigins": ["https://schemas.example"]
}
```

During URL acquisition, nonempty `sourceOrigins` adds those exact origins to the root origin. Explicit `sourceOrigins: []` denies all HTTP metadata. An explicit `sourceResources` set is closed, including an empty set, so omit it for ordinary automatic acquisition. HTTP 401/403 are metadata-access failures; the preview does not supply a credential broker.

Generated configuration points runtime calls at copied physical snapshots. Keep the generated source/provenance/configuration files together when moving the project; runtime does not download metadata. Rerunning generation from a URL reacquires its sources.

## Resolve a missing schema or ambiguous selection

Read the planning report before editing anything. Unsupported source, mapping, binding or security cases refuse with a stage and reason; a refusal does not necessarily mean the vendor schema is invalid.

Checked planning refusals show the construct or source location, the reason and the next action, then exit nonzero without generating artifacts or invoking SOAP. Save the unchanged structured report with `--checked-report`; set the `DEBUG` environment variable to `wsdl-tsc` when you need the raw error, stack and report details.

For a locationless import whose referenced components are unavailable, `--checked-draft` can write `service-resolution.json` containing a `REQUIRED_SCHEMA_LOCATION` placeholder. Replace that value with the actual permitted schema location, then rerun with `--checked-config service-resolution.json`. Unused locationless imports need no fabricated schema; native qualification and reference resolution remain mandatory.

Multiple service/port/binding candidates require an explicit choice. A WSDL that declares a binding without a service port reports `missing-service-port` before schema qualification. Use a WSDL that declares a service port for that binding.

When native qualification identifies a failing schema rule, the report can include a `schema` diagnostic with the assessed profile, rule, and named declaration when available. Source coordinates use the report's resource labels.

Partial configuration and operation subsets are supported. Reports and drafts are preserved by default. Use `--force-checked-files` deliberately to replace them on a later run. [Selection and recovery details](checked-gateway.md#planning-and-missing-schema-recovery)

The Weather quick-start fixture has multiple ports even though it has one service. Set `service`, `port` and `selectors` in a JSON file supplied through `--checked-config`; the diagnostic lists actual service/port choices and the report lists operation candidates. Legacy mode is a separate generation path with its own support limits, not an automatic fallback after a checked refusal.

## Configure and invoke an owned SOAP backend

The component gateway normally uses the selected WSDL service/port address when a route is invoked. To use an owned test service, create `checked-gateway.local.json` with this complete concise override:

```json
{
  "endpoint": "http://127.0.0.1:8081/forecast"
}
```

An optional `allowedEndpoints` list narrows the permitted destinations; omitting it permits the selected/configured endpoint, and `[]` denies every call.

Select the optional file and start in PowerShell:

```powershell
$env:CHECKED_GATEWAY_CONFIG = 'checked-gateway.local.json'
npm start
```

In a POSIX shell, use `CHECKED_GATEWAY_CONFIG=checked-gateway.local.json npm start`. Optional `host`, `port` and `caFile` are separate caller choices. Generated `client/source-resources.json` owns source and capsule records; do not copy them into this file.

Restart the gateway after changing runtime configuration. Only after an owned SOAP backend implements the bundled Forecast contract, invoke its JSON route:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/v1/forecast/GetForecast -Method Post -ContentType 'application/json' -Body '{"city":"Paris","days":2}'
```

This POST executes a real SOAP operation. Supply independently chosen expected values and fault cases for your own service; WSDL and generated scaffold tests cannot establish business correctness. Component responses retain their checked JSON value/fault shapes, while legacy envelopes, raw client fields and streaming behavior remain unchanged.

TLS verification stays enabled. The optional `caFile` supplies a trusted CA; it does not disable verification. SOAP redirects remain disabled, and unsupported authentication or WS-Security requirements refuse. Check the [transport limits](checked-gateway.md#explicit-component-configuration) before trying a provider integration.

## Standalone checked client

Standalone checked generation is available in version 1.10.0 and later. Install `@techspokes/typescript-wsdl-client` as a runtime dependency in the consumer and run the [client command](cli-reference.md#checked-client) from the original WSDL.

```bash
npx wsdl-tsc client --model checked-components-v1 --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast-client
```

Keep the entire generated directory together when moving it. Compile the TypeScript with NodeNext module resolution and inject the package-root binding named in the generated operation client. For the bundled Forecast example, use the following code in a module adjacent to `.generated` and pass the URL of an owned SOAP endpoint.

```typescript
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {checkedComponentRuntimeV3} from '@techspokes/typescript-wsdl-client';
import {createClient} from './.generated/forecast-client/client.js';

export async function getForecast(endpoint: string) {
  const owner = new URL('./.generated/forecast-client/', import.meta.url);
  const client = createClient(checkedComponentRuntimeV3);
  return client.GetForecast({city: 'Paris', days: 2}, {
    localSource: fileURLToPath(new URL('source/files/checked-forecast.wsdl', owner)),
    fileRoots: [fileURLToPath(owner)],
    sourceResources: [],
    sourceOrigins: [],
    capsule: await readFile(new URL('operations/0/contract.json', owner)),
    soap: {
      service: {namespace: 'urn:checked:forecast', local: 'ForecastService'},
      port: 'ForecastPort',
      endpoint,
      allowEndpoint: url => url.href === new URL(endpoint).href,
    },
  });
}
```

If your build emits JavaScript into a separate directory, copy the generated capsules and snapshots there with the same relative layout or point `owner` at their deployment directory.

For services with imports, use the `runtime` block in `source-resources.json` as the owner-relative index. Resolve physical paths against the client directory, including `localSource`, `fileRoots`, snapshot `file` fields, `capsuleFiles`, `recordSources[].source` and `branchSources[].source`.

Resolve relative `uri`, `canonicalUri` and `namespaceLocations[].location` values from the client directory before converting them with `pathToFileURL`. Preserve absolute HTTP(S) identities, content types and any additional source options.

Pass the selected operation's capsule bytes and service/port to the generated method.

Runtime checks reconstruct the contract from the physical snapshots and compare it with the generated capsule before SOAP dispatch. Missing snapshots, changes to snapshot bytes and mismatched capsules require the matching artifacts or regeneration. See [runtime configuration](checked-gateway.md#explicit-component-configuration).

## Generate the checked stack in separate commands

Install generator v1.12.0 or later in an ESM project on Node.js 24 or later. Use the bundled Forecast WSDL to try the commands. For your own service, set `wsdl` to the original WSDL file or URL and keep its WSDL and XSD imports available.

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
wsdl=node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl
app=.generated/forecast
npx wsdl-tsc client --model checked-components-v1 --wsdl-source "$wsdl" --client-dir "$app/client"
npx wsdl-tsc openapi --model checked-components-v1 --wsdl-source "$wsdl" --openapi-file "$app/openapi.json" --gateway-version-prefix v1 --gateway-service-name forecast
npx wsdl-tsc gateway --model checked-components-v1 --wsdl-source "$wsdl" --client-dir "$app/client" --openapi-file "$app/openapi.json" --gateway-dir "$app/gateway" --gateway-version-prefix v1 --gateway-service-name forecast
npx wsdl-tsc app --model checked-components-v1 --wsdl-source "$wsdl" --client-dir "$app/client" --openapi-file "$app/openapi.json" --gateway-dir "$app/gateway" --gateway-version-prefix v1 --gateway-service-name forecast --app-dir "$app" --test-dir "$app/test"
cd "$app"
npm install
npm run typecheck
npm test
npm run build
npm start
```

Run these commands with the same generator version, source graph, and `--checked-config` choices, if needed. The HTTP stages use the same service and version segments. Relative CLI and API paths resolve from each invocation's working directory. Use explicit paths to the same sources and artifacts when running steps from different directories.

`openapi` writes only the JSON document and can run before `client`. `gateway` reads the client and OpenAPI and writes only the gateway. `app` reads all three and emits the app with optional Vitest scaffolds. Each stage qualifies the source afresh. Gateway and app compare the relevant generator-owned files against the expected output, including the portable source closure and capsule bytes. Keep those files as generated, including JSON formatting. If a file is missing, altered or mismatched, regenerate the matched artifacts from the original WSDL and imports.

Place client, OpenAPI, gateway and test outputs in distinct locations inside the app directory. Give diagnostic reports and drafts their own paths outside the artifact and scaffold locations. The app preserves existing files by default. Use `app --force` for app files or `app --force-test --test-dir <directory>` for test files. The generated tests exercise health, OpenAPI and invalid requests offline. Use independently specified request, response and fault fixtures for positive contract and provider checks.

Use literal filesystem names for artifact paths such as `gateway#edge` or `client%23edge`. When an artifact directory contains a URL delimiter, the generated scaffold test compiles to a temporary directory and removes it on completion. Run `npm test` as usual. To upgrade an affected app, regenerate the matched artifacts and refresh the host and scaffold test. Preserve custom host and test edits by copying the corresponding loader changes from a fresh scaffold into those copies.

After building, keep the generated OpenAPI, client snapshots, capsules and project-relative layout with `dist/`. Install production dependencies, including the checked runtime, and use [the same runtime and endpoint controls as the pipeline app](#configure-and-invoke-an-owned-soap-backend).

### Migrate a catalog-based workflow

| Workflow | Legacy CLI and package API | Checked input and result |
| --- | --- | --- |
| Compile or assess | `compile` emits `catalog.json`. `compileWsdlToProject` compiles and emits a client. | `assess` and `assessSchemaSource` diagnose narrow direct-schema obligations. `planCheckedComponents` describes component readiness from source. |
| Client | `client` or `compileWsdlToProject`. The CLI accepts WSDL or a legacy catalog. | `client` or `generateCheckedClient` qualifies original sources and emits typed operations, capsules, inventory and source snapshots. |
| OpenAPI | `openapi` or `generateOpenAPI` uses WSDL or a legacy catalog. | `openapi` or `generateCheckedOpenAPI` qualifies original sources and emits the selected JSON HTTP contract. |
| Gateway | `gateway` or `generateGateway` reads OpenAPI and optional catalog metadata. | `gateway` or `generateCheckedGateway` requalifies source and checks the matching client and OpenAPI before emitting Fastify code. |
| App | `app` or the app stage of `runGenerationPipeline` uses legacy artifacts. | `app` or `scaffoldCheckedApp` verifies the matched files with original source and emits an installable app. |
| Generated tests | `pipeline --test-dir` or `generateTests` uses the compiled legacy contract. | `app --test-dir` or `scaffoldCheckedApp` with `test` emits offline checked tests alongside the app. |

Start the checked workflow from the WSDL and its imports, with a fresh output directory separate from legacy files. A legacy catalog or diagnostic report cannot supply native qualification. Use `--checked-report` on a checked generation stage to retain its diagnostic plan. Keep client, OpenAPI and gateway together when updating the app.

## Programmatic planning and generation

The package-root API uses the same loader and native preparation as the CLI:

```typescript
import {planCheckedComponents, runGenerationPipeline} from '@techspokes/typescript-wsdl-client';

const source = './service.wsdl';
const report = await planCheckedComponents(source);
console.log(report.ready, report.blockers);
await runGenerationPipeline({
  model: 'checked-components-v1', wsdl: source,
  clientOutDir: '.generated/service/client',
  openapi: {outFile: '.generated/service/openapi.json'},
  gateway: {outDir: '.generated/service/gateway', versionSlug: 'v1', serviceSlug: 'service'},
  app: {appDir: '.generated/service'}, test: {testDir: '.generated/service/test'},
});
```

The package root also exposes the individual stages. The following example uses the same original source and route choices for each call.

```typescript
import {generateCheckedClient, generateCheckedOpenAPI, generateCheckedGateway, scaffoldCheckedApp} from '@techspokes/typescript-wsdl-client';

const wsdl = './service.wsdl';
const appDir = '.generated/service';
const clientOutDir = `${appDir}/client`;
const http = {wsdl, openapiFile: `${appDir}/openapi.json`, versionSlug: 'v1', serviceSlug: 'service'};
const artifacts = {...http, clientOutDir, gatewayDir: `${appDir}/gateway`};

await generateCheckedClient({wsdl, clientOutDir});
await generateCheckedOpenAPI(http);
await generateCheckedGateway(artifacts);
await scaffoldCheckedApp({...artifacts, appDir, test: {testDir: `${appDir}/test`}});
```

Partial choices and permissions go in `checkedComponents` for generation or the second argument to `planCheckedComponents`. Planning never invokes SOAP. Generation performs fresh checks even when an earlier planning report was ready.

The older `assessSchemaSource` API and `assess` command retain the narrow `checked-assessment-v1` direct-schema scope and exit codes. They do not assess component generation or provider readiness. Use the component planner and `--checked-report` for this workflow; saved reports are diagnostic data.

## Supported scope and direction

The qualified component fragment includes imported schemas, nested/repeated and inherited records, attributes, simple content, ordered values and supported scalar restrictions. [Lexical atomic unions](checked-gateway.md#native-facets-lists-and-lexical-atomic-unions) admit effective atomic string/decimal/boolean members as strings with native member selection and typed fixed/default semantics; lists of those unions use lexical string arrays or existing whole-list witnesses; RPC lists and heterogeneous RPC union parts stay excluded. [Keyed mixed/namespace/open values](checked-gateway.md#mixed-namespaced-and-open-values) additionally preserve source-permitted wildcard data with native strict/lax/skip checks.

The Escapia qualification exercised 15 Main and two Content operations against owned services. The Content trial used buffered delivery with an explicit companion WSDL and scoped validation. Published v1.16.0 also passed local checked-streaming acceptance for `UnitDescriptiveInfoStream` and `UnitCalendarAvailBatch`. [Escapia fixture evidence](https://github.com/TechSpokes/typescript-wsdl-client/issues/517)

The [bounded SOAP 1.1 RPC/encoded profile](supported-patterns.md#checked-soap-11-rpc-string-profile) supports typed scalar parts, native restrictions, one flat required Boolean record and one opaque string result. [NOAA qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/noaa-ndfd-qualification.md) covers all 12 operations against an owned server; ten live operations succeeded and two GML operations returned non-SOAP failures. There is no parsed DWML/GML or geographic correctness claim.

General XSD, general RPC encoding, broader authentication/security and arbitrary wildcard conversion remain outside this preview. [Checked streaming](checked-streaming.md) supports explicit SOAP 1.1 selections with qualified response grammar. SOAP 1.2 document/literal uses the separately versioned [buffered binding](checked-gateway.md#component-service-generation). OpenAPI describes the JSON shape while required declarations, scalar facets and strict wildcard membership remain native runtime duties.

[#409](https://github.com/TechSpokes/typescript-wsdl-client/issues/409) supplies the bounded mixed/namespace/open mapping and its schema/serialization slice of [#410](https://github.com/TechSpokes/typescript-wsdl-client/issues/410). Representative unrelated contract qualification remains under [#397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397); broader HTTP translation, source, scalar, group/naming, security and streaming work retains its existing owners. Legacy defaults and full-profile activation remain unchanged. See the [roadmap](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/ROADMAP.md) for direction and [development checkpoint](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/docs/content-model-development-checkpoint.md) for detailed evidence.

## Send useful feedback

Use [Issues](https://github.com/TechSpokes/typescript-wsdl-client/issues/new/choose) for reproducible defects and [Discussions](https://github.com/TechSpokes/typescript-wsdl-client/discussions) for questions or integration reports. Mention `checked-components-v1` in the title and include:

- Package version, Node version and operating system.
- The exact generation command, model and relevant configuration choices.
- WSDL/dependency sources you have permission to share, or a minimal reproducer.
- The affected service, port, binding and operation, plus the planning blocker or inventory entry.
- Expected and actual generated types, JSON, SOAP values or refusal behavior.
- Whether you tested generation, scaffold/startup checks, owned wire execution or provider business acceptance.

Remove credentials and private data from configurations, source URLs, reports and payloads before posting. Include a known expected request/response or fault when reporting wire behavior. Report an unsupported capability as such rather than requesting that typed validation be disabled; this helps prioritize the smallest useful expansion without losing existing guarantees.

## Upgrade and regenerate

Regenerate checked clients, contracts, copied sources, gateways and server scaffolds together with the matching installed runtime. The generated source record now uses the explicit `checked-source-resources-v2` format; it is separate from the component runtime protocol. Complete older runtime configurations remain supported as advanced inputs. Supplying `localSource`, `sourceUri`, `namespaceLocations`, `recordSources` or `capsuleFiles` selects that advanced form and requires all four source fields: `localSource`, `fileRoots`, `sourceResources` and `sourceOrigins`.

With generated defaults, omitted restrictions retain the generated choices; explicit `sourceOrigins: []`, `sourceResources: []`, `standardLibraries: []` and `allowedEndpoints: []` remain restrictive. Incomplete advanced configurations refuse instead of mixing incompatible sources with generated defaults. Runtime paths in the optional JSON file resolve relative to that file; programmatic paths remain caller-owned.

Consumer-owned server/config/test files are preserved unless their existing `--force-init` or `--force-test` option is selected. Review customizations before deliberately refreshing older host scaffolds. Existing v1.1.5-issued direct clients continue using `checkedDirectRuntimeV1` unchanged; new generation uses components.

Legacy users need no model change. Follow the [1.1.x-to-1.2.0 migration guide](migration.md#from-11x-to-120) for affected generated names, stream values, buffered conversion fixes and rollback. The preview reached npm in 1.1.8; the earlier 1.1.6/1.1.7 candidates were unpublished.

Checked hosts import `@techspokes/typescript-wsdl-client` at runtime. Retain it in production dependencies as emitted by the checked app manifest; do not omit it from a deployment that installs only production dependencies. Refresh separately maintained consumer package/lockfiles deliberately, and preserve adopted app/test customizations when regenerating.
