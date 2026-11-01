# Try opt-in checked generation

Version 1.1.6 adds an opt-in WSDL-to-checked-gateway workflow for early testing and feedback. Choose `pipeline --model checked-components-v1` to generate a typed SOAP client, OpenAPI, Fastify gateway, runnable app and scaffold tests for supported document/literal SOAP 1.1 contracts. Omitting `--model` keeps the existing legacy behavior.

This is a bounded preview, not general WSDL/XSD or production-provider qualification. It adds source-backed request, response, fault and artifact checks for the supported fragment. The narrower `checked-direct-v1` preview remains available with its own explicit selection and loopback endpoint requirements; see the [checked gateway reference](checked-gateway.md).

## Install and try the bundled contract

Use Node.js 24 or newer. Run these commands in a new trial directory:

```powershell
npm init -y
npm install --save-dev @techspokes/typescript-wsdl-client@1.1.6
npm install soap
npx wsdl-tsc pipeline --model checked-components-v1 --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast/client --openapi-file .generated/forecast/openapi.json --gateway-dir .generated/forecast/gateway --gateway-version-prefix v1 --gateway-service-name forecast --init-app --app-dir .generated/forecast --test-dir .generated/forecast/test --checked-report .generated/forecast-plan.json
```

The bundled [Forecast contract](examples/checked-forecast.wsdl) is synthetic and has no running SOAP backend. Generation selects its one unambiguous service/port/binding and `GetForecast` operation without a configuration file. Its placeholder SOAP address must be replaced with your owned test backend before invoking the operation.

The generated project includes `client/inventory.json`, copied WSDL/XSD sources and provenance, operation clients/contracts, OpenAPI, gateway routes, server configuration and scaffold tests. The planning report lists readiness and blockers; the inventory records discovered, selected and generated operations. Generation does not mean an operation was executed.

## Check and start the generated project

```powershell
Set-Location .generated/forecast
npm install
npm run typecheck
npm test
npm run build
Copy-Item checked-gateway.example.json checked-gateway.local.json
$env:CHECKED_GATEWAY_CONFIG = 'checked-gateway.local.json'
npm start
```

Generation, installation, startup and scaffold tests do not execute business SOAP operations. Startup loads configuration/artifacts and checks gateway/OpenAPI identity; physical source qualification and source/contract compatibility run when an operation is invoked. A healthy server alone does not prove SOAP readiness. In a second terminal, inspect the running gateway:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
Invoke-RestMethod http://127.0.0.1:3000/openapi.json
```

Stop the foreground server with Ctrl+C when finished. The npm and generation commands also work in POSIX shells; use `cp` for the configuration copy and `CHECKED_GATEWAY_CONFIG=checked-gateway.local.json npm start` to start there.

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

For a locationless import, `--checked-draft` can write `service-resolution.json` containing a `REQUIRED_SCHEMA_LOCATION` placeholder. Replace that value with the actual permitted schema location, then rerun with `--checked-config service-resolution.json`. This supplies missing source information; it does not waive native checks or reconstruct a type graph by hand.

Multiple service/port/binding candidates require an explicit choice. Partial configuration and operation subsets are supported; see [selection and recovery details](checked-gateway.md#planning-and-missing-schema-recovery). Reports and drafts are preserved by default; use `--force-checked-files` deliberately to replace them on a later run.

## Configure and invoke an owned SOAP backend

The component gateway normally uses the selected WSDL service/port address when a route is invoked. To use an owned test service, add an `endpoint` property to the copied `checked-gateway.local.json` (or change it if already present), preserving every generated source and artifact setting. For example, add the property shown here to the existing object; this excerpt is not a replacement configuration:

```json
{
  "endpoint": "http://127.0.0.1:8081/forecast"
}
```

An optional `allowedEndpoints` list narrows the permitted destinations; omitting it permits the selected/configured endpoint, and `[]` denies every call.

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

## Supported scope and direction

The qualified component fragment includes imported schemas, nested/repeated and inherited records, attributes, simple content, ordered values and supported scalar restrictions. Escapia qualification retains 15 Main operations and two Content operations against owned services. Content uses explicit companion configuration with scoped validation and buffered delivery; it is not automatic companion discovery or checked streaming.

General XSD, SOAP 1.2/RPC-encoded, broader authentication/security, arbitrary wildcard conversion and checked incremental streaming remain outside this preview. OpenAPI describes the JSON shape but does not express every native scalar/order/wildcard rule. Required declarations and strict wildcard failures cannot become successful unchecked replies.

The next work is representative unrelated contract qualification under [#397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397), characterization of existing opaque JSON and simpler optional companion associations under [#409](https://github.com/TechSpokes/typescript-wsdl-client/issues/409), and concrete JSON/OpenAPI documentation or translation fixes under [#410](https://github.com/TechSpokes/typescript-wsdl-client/issues/410). Broader security and streaming keep their existing owners; none of this changes the legacy default or activates the full profile. See the [roadmap](../ROADMAP.md) for direction and [development checkpoint](content-model-development-checkpoint.md) for detailed evidence.

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

Regenerate checked clients, contracts, copied sources, gateways and server scaffolds together with the matching installed runtime. Component runtime compatibility changed in this release, so do not mix older experimental artifacts with newly generated files. Consumer-owned server/config/test files are preserved unless their existing `--force-init` or `--force-test` option is selected; review customizations before deliberately refreshing them.

Legacy users need no model change. Refresh existing consumer dependency lockfiles separately to pick up transitive security fixes.
