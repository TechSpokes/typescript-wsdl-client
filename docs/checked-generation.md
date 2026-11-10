# Try opt-in checked generation

Opt-in checked generation supports qualified SOAP 1.1 and SOAP 1.2 document/literal contracts and the bounded SOAP 1.1 RPC/encoded string profile. Choose `pipeline --model checked-components-v1`; omitting `--model` keeps legacy generation. SOAP 1.2 execution is available starting with 1.3.0; see the [binding and artifact contract](checked-gateway.md#component-service-generation). See the root [README](../README.md).

This is a bounded preview, not general WSDL/XSD or production-provider qualification. It adds source-backed request, response, fault and artifact checks for the supported fragment. Generation exposes legacy and components only; the shipped v1.1.5 direct runtime remains a compatibility binding for existing clients. See the [checked gateway reference](checked-gateway.md).

## Install and try the bundled contract

The examples target 1.3.0. Before that version is published, install a locally packed 1.3.0 tarball instead of requesting an unpublished registry version. After publication, use the explicit registry version below. Earlier releases retain their own documented contracts.

Use Node.js 24 or newer. Run these commands in a new trial directory:

```powershell
npm init -y
npm install --save-dev @techspokes/typescript-wsdl-client@1.3.0
npm install soap
npx wsdl-tsc pipeline --model checked-components-v1 --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast/client --openapi-file .generated/forecast/openapi.json --gateway-dir .generated/forecast/gateway --gateway-version-prefix v1 --gateway-service-name forecast --init-app --app-dir .generated/forecast --test-dir .generated/forecast/test --checked-report .generated/forecast-plan.json
```

The bundled [Forecast contract](examples/checked-forecast.wsdl) is synthetic and has no running SOAP backend. Generation selects its one unambiguous service/port/binding and `GetForecast` operation without a configuration file. Its placeholder SOAP address must be replaced with your owned test backend before invoking the operation.

The generated project includes `client/inventory.json`, copied WSDL/XSD sources and provenance, operation clients/contracts, OpenAPI, gateway routes, server configuration and scaffold tests. The planning report lists readiness and blockers; the inventory records discovered, selected and generated operations. Generation does not mean an operation was executed.

## Check and start the generated project

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

Multiple service/port/binding candidates require an explicit choice. Partial configuration and operation subsets are supported; see [selection and recovery details](checked-gateway.md#planning-and-missing-schema-recovery). Reports and drafts are preserved by default; use `--force-checked-files` deliberately to replace them on a later run.

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

Partial choices and permissions go in `checkedComponents` for generation or the second argument to `planCheckedComponents`. Planning never invokes SOAP. Generation performs fresh checks even when an earlier planning report was ready.

The older `assessSchemaSource` API and `assess` command retain the narrow `checked-assessment-v1` direct-schema scope and exit codes. They do not assess component generation or provider readiness. Use the component planner and `--checked-report` for this workflow; saved reports are diagnostic data.

## Supported scope and direction

The qualified component fragment includes imported schemas, nested/repeated and inherited records, attributes, simple content, ordered values and supported scalar restrictions. [Keyed mixed/namespace/open values](checked-gateway.md#mixed-namespaced-and-open-values) additionally preserve source-permitted wildcard data with native strict/lax/skip checks. Escapia qualification retains 15 Main operations and two Content operations against owned services. Content uses explicit companion configuration with scoped validation and buffered delivery; it is not automatic companion discovery or checked streaming.

The [bounded SOAP 1.1 RPC/encoded profile](supported-patterns.md#checked-soap-11-rpc-string-profile) supports typed scalar parts, native restrictions, one flat required Boolean record and one opaque string result. [NOAA qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/noaa-ndfd-qualification.md) covers all 12 operations against an owned server; ten live operations succeeded and two GML operations returned non-SOAP failures. There is no parsed DWML/GML or geographic correctness claim.

General XSD, general RPC encoding, broader authentication/security, arbitrary wildcard conversion and checked incremental streaming remain outside this preview. SOAP 1.2 document/literal uses the separately versioned binding described in the [checked gateway reference](checked-gateway.md#component-service-generation); live-provider acceptance is separate from owned-server protocol evidence. OpenAPI describes the JSON shape but does not express every native scalar/order/wildcard rule. Required declarations and strict wildcard failures cannot become successful unchecked replies.

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
