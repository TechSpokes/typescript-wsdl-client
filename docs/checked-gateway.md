# Installed checked gateway preview

The unreleased opt-in `checked-direct-v1` pipeline generates a complete runnable project from an explicitly selected, qualified local WSDL operation. The default pipeline remains legacy. This preview reuses `checkedDirectRuntimeV1` from the package root and the existing native contract, mapping, XML codec and SOAP adapter; diagnostic JSON and OpenAPI never authorize execution.

## Supported scope

Source must be a single safe UTF-8 local WSDL with a qualified whole-source direct schema. The supported value grammar comprises string, int32 and Boolean scalar roots or flat sequence messages, optional scalar fields and required arrays for repeated scalar fields. The binding must be document/literal SOAP 1.1; execution requires an explicitly authorized owned IPv4-loopback HTTP SOAP endpoint.

Native source eligibility, dated-XSD correspondence, operation/service/port/binding selection, capsule/runtime compatibility and request/response/fault validation remain mandatory. Reserved dependency names, imports, nested records, attributes, nil, general derivation, RPC/encoded, SOAP 1.2, streaming, arbitrary remote endpoints, authentication and TLS are outside this preview. `admitted:false` remains the full-profile admission marker; this bounded preview does not claim the whole faithful profile.

## Generate through the installed CLI

Until publication is separately authorized, build and pack the candidate checkout, then install that tarball in an independent tooling directory:

```bash
npm run build
npm pack --pack-destination /absolute/path/to/tooling
```

In the independent tooling directory:

```bash
npm init -y
npm install /absolute/path/to/tooling/techspokes-typescript-wsdl-client-1.1.5.tgz
```

Use the bundled [synthetic Forecast source](examples/checked-forecast.wsdl), installed at `node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl`. Its WSDL address authorizes no endpoint and must never be contacted. This is the unchanged Forecast seed used by the independent wire fixtures, not real-provider coverage.

Create `generation.json` in the tooling directory; `fileRoots` resolve from the invocation working directory. Replace the example root with the absolute directory containing the supplied WSDL:

```json
{
  "selector": {
    "portType": {"namespace": "urn:checked:forecast", "local": "ForecastPortType"},
    "binding": {"namespace": "urn:checked:forecast", "local": "ForecastBinding"},
    "operation": "GetForecast"
  },
  "service": {"namespace": "urn:checked:forecast", "local": "ForecastService"},
  "port": "ForecastPort",
  "fileRoots": ["/absolute/path/to/tooling/node_modules/@techspokes/typescript-wsdl-client/docs/examples"]
}
```

Run the existing pipeline with explicit project paths:

```bash
npx wsdl-tsc pipeline --model checked-direct-v1 --checked-config generation.json --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast/client --openapi-file .generated/forecast/openapi.json --gateway-dir .generated/forecast/gateway --gateway-version-prefix v1 --gateway-service-name forecast --init-app --app-dir .generated/forecast --test-dir .generated/forecast/test
```

The checked model accepts these output, scaffold and selection controls only; unsupported legacy compiler, catalog, security, serializer or streaming flags refuse explicitly. Exactly one operation is requested through `selector`. A requested unsupported operation fails generation rather than disappearing from a successful whole-WSDL claim.

## Install and start the generated project

Run from `.generated/forecast`. For an unreleased candidate, the first install must supply the candidate tarball so the runtime matches the generator:

```bash
npm install /absolute/path/to/tooling/techspokes-typescript-wsdl-client-1.1.5.tgz
npm run typecheck
npm test
npm run build
```

Copy `checked-gateway.example.json` to `checked-gateway.local.json`. Set `endpoint` to your owned loopback SOAP test service and add that exact URL to `allowedEndpoints`; an empty list authorizes no requests. The generated copied WSDL is selected by `localSource`, and `fileRoots` must explicitly authorize its directory. Runtime paths resolve relative to this configuration file.

```json
{
  "localSource": "./client/source.wsdl",
  "fileRoots": ["./client"],
  "endpoint": "http://127.0.0.1:8081/soap",
  "allowedEndpoints": ["http://127.0.0.1:8081/soap"],
  "host": "127.0.0.1",
  "port": 3000
}
```

Start in POSIX shells:

```bash
CHECKED_GATEWAY_CONFIG=checked-gateway.local.json npm start
```

Start in PowerShell:

```powershell
$env:CHECKED_GATEWAY_CONFIG = 'checked-gateway.local.json'
npm start
```

The separate process serves `GET /health`, `GET /openapi.json` and `POST /v1/forecast/GetForecast`. A normal request is `{"city":"Paris","days":2}`; a response is `{"city":"Paris","temperature":[18,-2],"complete":true}`. These are independent synthetic fixture values, not business values implied by WSDL. A validated declared SOAP fault returns HTTP 502 with `{fault,value}`; invalid upstream data cannot produce HTTP success.

## Public API and controls

The equivalent package-root API uses the same pipeline model:

```typescript
import {runGenerationPipeline, type CheckedDirectOptions} from '@techspokes/typescript-wsdl-client';

declare const checkedDirect: CheckedDirectOptions;
await runGenerationPipeline({
  model: 'checked-direct-v1', wsdl: '/authorized/forecast.wsdl', checkedDirect,
  clientOutDir: '.generated/forecast/client',
  openapi: {outFile: '.generated/forecast/openapi.json'},
  gateway: {outDir: '.generated/forecast/gateway', versionSlug: 'v1', serviceSlug: 'forecast'},
  app: {appDir: '.generated/forecast'}, test: {testDir: '.generated/forecast/test'},
});
```

`checkedDirect.signal` supports generation cancellation. Generated `buildServer` accepts an explicit runtime `AbortSignal`, `timeoutMs` and XML `limits`; disconnects also cancel the operation. Ordinary execution has no implicit profiling quota or execution deadline. Generated client callers retain explicit endpoint, source-root, capability, cancellation and XML-limit controls through their `Options` contract.

All project outputs must be within `appDir`, with nonoverlapping artifact directories. Generator-owned client, copied source, capsule, inventory, OpenAPI and gateway are replaced on regeneration. Consumer server, package/configuration, README and test scaffolds remain unchanged unless `--force-init` or `--force-test` is explicitly selected.

## Validation and coverage evidence

OpenAPI documentation uses 3.1.1 with separate draft-07 HTTP runtime plans. Route-local Ajv disables coercion, default insertion and property removal, and preserves unrelated host policy. The native runtime explicitly converts validated HTTP values through the issued mapping, performs actual SOAP execution and independently validates response/fault XML. HTTP response validation also runs independently of serializer selection; JSON serialization preserves the validated values.

`client/inventory.json` and the API result's `checked` field list every discovered portType operation, selected service/port/binding, requested/generated operation and unselected operations. Generation records `executed:false`; it does not claim a SOAP call occurred. Refused selection diagnostics name the requested operation and zero generated/executed operations. Unselected operations remain unassessed.

Generated tests check scaffolding and invalid HTTP refusal without authorizing upstream transactions. The repository's `checked-gateway-installed.test.ts` separately packs and installs the candidate outside the checkout, invokes installed CLI/API, typechecks/tests/builds the projects and starts a separate process with checkout filesystem access denied. Independent XML and JSON expectations check normal exchanges, SOAPAction, namespaces, order, optional/repeated values, declared faults and invalid input/upstream/artifact/permission cases.

Synthetic success establishes this delivery only. Positive representative real-service qualification and measured operation/family expansion remain under [#397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397); production endpoint/security qualification remains under #190/#191. The broader [#401](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) outcome and full-profile owners remain open.
