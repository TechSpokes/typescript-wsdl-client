# Installed checked gateway preview

## Component service generation

The additive `checked-components-v1` mode uses the same command family and native owners for qualified structured operations, imported schema snapshots, attributes, recursive records, simple content and ordered values. It preserves the direct preview and legacy defaults. Source, mapping, artifact and transport checks remain authoritative; unsupported schema or security features refuse rather than disappearing from a successful service claim. This is a qualified component fragment, not universal XSD, streaming or provider acceptance.

Use `selectors` to request every intended operation explicitly. Each operation retains its own client and capsule; the service index and gateway compose them without merging service/binding identities. `basePath` can separate services on a shared host. If omitted, it defaults to the supplied version/service route prefix. Paths append the exact, URI-encoded operation name.

For the installed Forecast example below, a component configuration is:

```json
{
  "selectors": [{
    "portType": {"namespace": "urn:checked:forecast", "local": "ForecastPortType"},
    "binding": {"namespace": "urn:checked:forecast", "local": "ForecastBinding"},
    "operation": "GetForecast"
  }],
  "service": {"namespace": "urn:checked:forecast", "local": "ForecastService"},
  "port": "ForecastPort",
  "fileRoots": ["/absolute/path/to/tooling/node_modules/@techspokes/typescript-wsdl-client/docs/examples"],
  "sourceResources": [],
  "sourceOrigins": [],
  "basePath": "/api/v1/forecast"
}
```

Save it as `component-generation.json`, then use the same explicit outputs:

```bash
npx wsdl-tsc pipeline --model checked-components-v1 --checked-config component-generation.json --wsdl-source node_modules/@techspokes/typescript-wsdl-client/docs/examples/checked-forecast.wsdl --client-dir .generated/forecast/client --openapi-file .generated/forecast/openapi.json --gateway-dir .generated/forecast/gateway --gateway-version-prefix v1 --gateway-service-name forecast --init-app --app-dir .generated/forecast --test-dir .generated/forecast/test
```

For imports, each `sourceResources` entry has an original logical `uri` and an independently authorized physical snapshot `file`. HTTP metadata origins must be listed in `sourceOrigins` even though bytes are read from files. Missing snapshots refuse without network fallback. Optional `namespaceLocations` entries have `namespace` and `location` for imports without `schemaLocation`; explicit locations in source take precedence. Generation paths resolve from the invocation directory. Original source bytes are copied without modification and their provenance is recorded in `client/source-resources.json`.

Install/typecheck/test/build/start as described below. Runtime configuration adds explicit `sourceResources`, `sourceOrigins`, optional `namespaceLocations`, per-operation `capsuleFiles` and optional `caFile`. Runtime paths resolve from the configuration file. The generated example points to copied input bytes; its empty endpoint allowlist still authorizes no business request. Physical sources are rechecked independently of embedded capsule bytes, and mismatched artifacts refuse. Cross-volume local source relocation is outside this scaffold; callers can supply independently authorized runtime inputs explicitly.

The component transport requires explicit endpoint permission and verified HTTPS when required by source policy. An optional CA file does not disable verification. Client certificates, timestamps, required WS-Addressing, supporting tokens and security headers remain unsupported and refuse. Scalar facets, ordered particle languages and strict wildcard membership remain native supplemental checks, so OpenAPI marks JSON shape completeness false. `admitted:false` remains the full-profile marker. Generated scaffold tests are separate from independently specified HTTP/SOAP wire and provider/business evidence.

For [SOAP 1.1 response headers](https://www.w3.org/TR/2000/NOTE-SOAP-20000508/), qualified optional blocks for the default receiver may be ignored when `mustUnderstand` is absent or `0`. Unknown mandatory blocks and actor-directed processing refuse; malformed attributes and unqualified blocks fail protocol checks. This processing grants no header security semantics or outgoing header capability.

The copied-source scaffold refuses dependency retrieval aliases, including redirected imports and symlink aliases, before emission. Native loading can authorize such aliases, but the scaffold currently requires canonical dependency references so unchanged imports resolve after relocation. Directory names beginning with two dots are ordinary names, not parent segments.

### Explicit schema metadata and companion records

`standardLibraries: ["w3c-xsd10-schema-element-2004-v1"]` explicitly supplies the dated XSD 1.0 global `xs:schema` declaration. The declaring schema must still import its namespace. A reference to this element requires an actual schema element in the response; it supplies neither a default payload nor a companion service's record declarations. Runtime callers must independently permit the same library.

For a qualified schema-metadata-plus-strict-wildcard response, `recordProjections` can explicitly select a separate source contract for the payload. Each entry supplies the outer operation's full `selector`, physical companion `source`, companion `recordSelector`, and a closed `spec`:

```json
{
  "version": "component-record-scope-v1",
  "scope": "records-with-declared-wrapper-scope",
  "payloadPath": [{"namespace": "urn:owned:wrapper", "local": "Envelope"}],
  "recordPath": [
    {"namespace": "urn:owned:wrapper", "local": "Records"},
    {"namespace": "urn:owned:wrapper", "local": "Record"}
  ],
  "opaqueExclusions": [
    {"path": [{"namespace": "http://www.w3.org/2001/XMLSchema", "local": "schema"}], "reason": "standard-schema-metadata"},
    {"path": [{"namespace": "urn:owned:wrapper", "local": "Envelope"}], "reason": "wrapper-declaration-universe"}
  ]
}
```

The path is relative to the outer response element; `recordPath` is relative to the companion output element. Both contracts are qualified independently, including when their output QNames coincide. Configuration does not merge their declarations or contact the companion service. Native checks must establish the supported wrapper structure and unique repeated-record path. The response retains the complete companion payload, including nonrecord fields; schema metadata is validated and omitted from the HTTP value. The declared scope does not claim wildcard validity against the outer declaration universe.

Scoped artifacts use a distinct version from ordinary component artifacts. Generated runtime configuration adds explicit `recordSources`, each containing the outer full `selector` and independently authorized physical `source`. Both sources and their imported bytes are freshly checked on execution; embedded artifact bytes confer no permission. These responses are buffered under caller XML limits. No incremental delivery or streaming capability is claimed.

## Direct preview

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
