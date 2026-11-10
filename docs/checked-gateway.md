# Checked gateway reference

Generation offers legacy, the default, and opt-in checked components. Start with [Try Opt-in Checked Generation](checked-generation.md) for an installed trial and feedback instructions. This reference describes configuration, shipped direct-runtime compatibility and coverage boundaries.

## Component service generation

SOAP 1.2 document/literal operations use the selected binding's envelope namespace and `application/soap+xml` action parameter. Select service, port and binding through the existing checked configuration when multiple ports are available; a SOAP version flag is unnecessary. SOAP 1.2 artifacts have their own compatibility scope, so regenerate matched clients, capsules and gateways together. Existing SOAP 1.1 and direct-runtime artifacts retain their contracts.

Generated SOAP 1.2 clients use the additive `checkedComponentRuntimeV2` package-root binding with protocol `checked-component-soap12-runtime-v1`. Existing SOAP 1.1 clients keep `checkedComponentRuntimeV1` and `checked-component-runtime-v2`, including their TypeScript injection contract. The older binding refuses SOAP 1.2 artifacts before SOAP dispatch.

SOAP 1.2 faults retain code, nested subcodes, language-tagged reasons and optional Node/Role metadata. Declared application detail uses the existing native mapping and gateway fault validation. A valid protocol fault without declared application detail carries fault metadata without a typed application value; the client retains original response bytes. Gateways return HTTP 502 for upstream faults, including SOAP Sender faults received on HTTP 400. SOAP 1.2 protocol rules follow [the messaging framework](https://www.w3.org/TR/soap12-part1/#soapfault) and [HTTP binding](https://www.w3.org/TR/soap12-part2/#soapinhttp).

SOAP 1.2 header processing uses the default ultimate receiver and next roles. Unknown mandatory blocks targeted at this receiver refuse; other-role and optional blocks may be ignored. The `mustUnderstand` and `relay` attributes accept SOAP 1.2 Boolean lexical forms. This does not enable outgoing application headers, WS-Security, streaming or RPC/encoded SOAP 1.2.

The additive `checked-components-v1` mode uses the same command family and native owners for qualified structured operations, imported schema snapshots, attributes, recursive records, simple content and ordered values. It preserves the shipped direct runtime and legacy defaults. Source, mapping, artifact and transport checks remain authoritative; unsupported schema or security features refuse rather than disappearing from a successful service claim. This is a qualified component fragment, not universal XSD, streaming or provider acceptance.

The [bounded SOAP 1.1 RPC/encoded profile](supported-patterns.md#checked-soap-11-rpc-string-profile) adds source-owned scalar and flat Boolean record parts without document element roots. Component responses additionally accept exact Latin1 with encoding agreement. See the [NOAA qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/noaa-ndfd-qualification.md) for native restrictions, opaque string/reference results and separate owned-server/live evidence limits.

For a supported local WSDL or HTTP(S) root URL with one service/port/binding candidate, omit `--checked-config`. The planner selects all operations of that binding and derives supported mappings through the existing native owners. Local sources default to their containing directory; remote sources authorize their same-origin declared dependency graph. Canonical containment, redirect permission checks and native qualification still apply.

```bash
npx wsdl-tsc pipeline --model checked-components-v1 --wsdl-source source.wsdl --client-dir .generated/service/client --openapi-file .generated/service/openapi.json --gateway-dir .generated/service/gateway --gateway-version-prefix v1 --gateway-service-name service --init-app --app-dir .generated/service --test-dir .generated/service/test --checked-report .generated/planning.json --checked-draft resolution.json
```

Partial configuration may supply `service`, `port`, `selectors` or permissions. Only missing unambiguous facts are inferred. Multiple candidates require a choice, including unsupported bindings; conflicting choices refuse. Explicit `selectors` still request a subset, while shared whole-source prerequisites remain mandatory. Reports retain the complete discovered inventory and mark other operations unselected and unassessed.

Each operation retains its own client and capsule; the service index and gateway compose them without merging service/binding identities. `basePath` can separate services on a shared host. If omitted, it defaults to the supplied version/service route prefix. Paths append the exact, URI-encoded operation name.

### Application groups and configured names

Add `{"applicationGroups":{}}` to the existing `--checked-config` file, or set `checkedComponents: {applicationGroups: {}}` through the package-root API. This opts the generated contract into [source-derived groups](concepts.md#choice-groups-and-named-alternatives); leaving the option absent preserves existing component output and the frozen direct/legacy contracts.

For a reconstructible source choice between `(A:int,B:string)` and `(C:boolean,D:string)`, a repeated group accepts `{"$choice":[{"A":7,"B":"card"},{"C":true,"D":"bank"}]}`. A singleton takes one alternative object; optional groups can be omitted. Repeated sequences use arrays under `$sequence`, and nested, independent and recursive definitions retain their own source rules.

First generate defaults and copy the opaque `target` tokens from the client's `inventory.json`, under `applicationGroups.targets`. Each entry reports role, source owner/site, defaults and resolved names; the returned checked inventory exposes the same data. Then regenerate with this fragment inside the existing configuration:

```json
{
  "applicationGroups": {
    "names": [
      {"target":"<choice-site token>","propertyName":"$payment","typeName":"PaymentMethod"},
      {"target":"<first alternative token>","typeName":"CardPayment"},
      {"target":"<second alternative token>","typeName":"BankPayment"}
    ]
  }
}
```

The configured contract accepts only `$payment`; `$choice`, simultaneous spellings and payload-supplied configuration fail. Renaming the union does not rename alternatives. Defaults/configuration resolve once per authenticated definition; TypeScript, named OpenAPI components, HTTP validation and native forward/inverse mapping share that description across requests, success responses and declared faults.

Targets survive physical relocation, unrelated global declaration reorder and alias changes. Relevant particle edits require generating defaults again and copying new tokens; stale or unknown targets, invalid names, duplicate targets and scoped collisions refuse before artifacts are written. Targets and inventory confer no source or runtime authority; generated capsules reconstruct the presentation from authorized source and reject incompatible contracts.

The inventory's `applicationGroups.records` classifies each record as grouped, compact or retained-ordered with its reason. Empty-capable bodies, zero-width history and ambiguous partitions retain typed ordered values and ADR-003 normalization; `(N{1,2})*` cannot claim recoverable group boundaries for three `N` children. Optional repeated nonempty groups accept `[]` and normalize to omission without input mutation.

Mixed/open/keyed records keep their existing owner, and same-record overlapping alphabets retain the native refusal; this slice does not add a general ambiguity matcher or a combined mixed/group grammar.

### Nil values

Checked component generation represents a present nil element as `{"$nil":true}`, with its existing source-mapped attribute properties. Required attributes remain required: a nillable element with required string `id` uses `{"$nil":true,"id":"7"}`. Optional attributes retain their scalar encodings, including empty strings and qualified attribute identities derived from the source.

Omit an optional element to express absence. Empty non-nil content retains its ordinary representation; nil items occupy their own array positions, while a nil wrapper contains no items. Plain `null`, false/string nil markers, unknown metadata and all content fields on nil objects are rejected without coercion or field removal.

The native matcher checks nillability, no character/element content on nil, declared/required attributes and scalar/fixed constraints. Optional attribute defaults/fixed values are assessed explicitly even on nil; element defaults apply only to empty non-nil content, and an element fixed value prohibits nil. Generated TypeScript and closed HTTP schemas describe the same nil alternatives; native checks retain XML-only duties.

The [nil fixture](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/conformance/fixtures/assessment/nil.wsdl), [codec controls](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/unit/direct-projection-nil.test.ts) and [installed gateway qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/helpers/checkedGatewayInstalledProcess.ts) cover independently expected requests, responses and fault details through serialized HTTP JSON and an owned SOAP 1.1 service. This extends the existing qualified component domain; contextual scalar families and assessed dynamic types retain their existing capability refusals and owners. Legacy and shipped `checkedDirectRuntimeV1` contracts are unchanged.

### Mixed, namespaced and open values

Qualified component mappings use the [selected keyed contract](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/mapping-contract.md#selected-keyed-mapping-contract) for newly supported mixed and open content. Mixed records always have ordered `$content`, including empty and text-only instances. Entries contain one text `$value` or one child name; recursive children follow their own source-selected mapping.

```json
{"id":"7","$content":[{"$value":"Hello "},{"b":"world"},{"$value":"!"}]}
```

Adjacent text coalesces and empty text disappears; significant spaces, nesting and element order survive. Ordinary fixed records and already accepted ordered descendants retain their existing shapes. A same-name namespace choice needs `$namespace`; source-fixed positions derive identity and reject redundant holders. Metadata around a scalar retains its complete existing encoding under `$value`.

Unambiguous peer attributes stay peers. Attribute/child collisions use `$attributes` one-name entries, deriving fixed qualified identities from the source. Open or ambiguous identities use an unqualified scalar or a qualified `{"$namespace":"urn:attributes","$value":"lexical"}` holder. Duplicate expanded identities, duplicate channels and undeclared fields fail without mutation.

Strict wildcards require declarations and validation; lax validates available declarations and otherwise preserves unassessed data; skip preserves unassessed data. Unassessed elements always have `$namespace` and `$content`, with lexical attributes in `$attributes`. Raw xsi:type/xsi:nil remain lexical there, including unfamiliar values; assessed nil still uses `$nil`. Known invalid values and missing required children never become opaque success. Payload hints and namespace URIs acquire no schemas.

`$namespaces` records effective bindings at a source-selected retained-context boundary, then local deltas on known intermediates and open descendants. Default bindings, resets, rebinding and sibling isolation survive fresh encoding. `$namespace` identifies a node independently of the default binding. Protected scopes cannot be rebound to satisfy encoding; impossible default/identity combinations and missing attribute prefixes fail. Original prefix spelling, bytes and arbitrary extracted-subtree portability are outside the guarantee.

Generated TypeScript, OpenAPI and runtime schemas describe the actual fields and useful structural constraints; wildcard schemas can be structural supersets narrowed by native owners. Serialized success and fault values preserve all accepted metadata. The [production fixture](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/conformance/fixtures/assessment/keyed.wsdl), [namespace conformance](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/conformance/keyed-values.test.ts), [native controls](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/unit/direct-projection-keyed.test.ts) and installed gateway qualification cover fresh hand JSON and independent SOAP expectations. General group/naming, contextual scalar families, assessed dynamic types, wider source/protocol families and streaming remain separate work.

### URL intake and endpoint intent

Use the same command above with `--wsdl-source https://provider.example/service.wsdl`. Declared WSDL imports and XSD imports/includes are acquired recursively; users supply no resource records or selectors. Relative references resolve against the actual final referring URI. Query strings remain distinct, shared resources are pinned once, and authorized HTTP redirect aliases are saved without rewriting original bytes. Cycles retain discovery identity; unsupported native or SOAP bootstrap graphs refuse during preparation.

For a declared second origin, the reusable project decision is `{"sourceOrigins":["https://schemas.example"]}` in `--checked-config`. During URL acquisition a nonempty list adds to the supplied root origin; explicit `sourceOrigins: []` denies all HTTP metadata. Outside-root local inputs still require explicit `fileRoots`. Neither document references nor redirects permit remote-to-file transitions. Namespace names are never guessed as download locations. Missing locations use the existing draft/recovery workflow, and HTTP 401/403 identify metadata access failure rather than invalid schema.

Generation copies original bytes and writes digest/provenance inventory plus generated runtime source records. `sourceUri` preserves a remote logical root; optional resource `canonicalUri` preserves a retrieval alias. Physical files remain independently authorized by `fileRoots`; logical origins remain independently permitted by `sourceOrigins`. An explicit `sourceResources` set, including an empty set, is closed and never acquires missing metadata. Runtime calls read physical snapshots and never download metadata. Every new generation invocation reacquires remote inputs; saved reports are not a cache or grant of authority.

The component client and gateway use the selected WSDL service/port address when an operation is invoked. A runtime `endpoint` overrides that address. An omitted `allowEndpoint` client callback or `allowedEndpoints` gateway list permits that selected/configured destination; an explicit callback or list restricts it, and `allowedEndpoints: []` denies every call. An override cannot widen an explicit restriction. Destinations cannot come from HTTP request payloads, and SOAP redirects remain disabled. TLS, source policy, binding/action, typed input, response/fault and artifact checks remain mandatory.

Previously, ordinary setup authored `sourceResources`, selectors, `endpoint` and a duplicate `allowedEndpoints` entry. Now supported URL intake needs only WSDL/model/output options, plus one `sourceOrigins` decision for each additional origin; ordinary runtime configuration uses generated source records and the selected address. Optional overrides and restrictions remain explicit. Generation, startup and scaffold tests make no business SOAP calls.

This component injection change uses `checked-component-runtime-v2`; regenerate clients, capsules, gateways and server scaffolds together when upgrading. The exported binding name remains `checkedComponentRuntimeV1` for existing imports, and existing explicit endpoint callbacks remain valid after regeneration. Consumer server/config/test files retain skip/force ownership rules; use existing force options deliberately to refresh those scaffolds. The v1.1.5 direct runtime protocol and legacy defaults are unchanged.

### Planning and missing-schema recovery

`--checked-report` writes versioned `checked-component-plan-v1` JSON on native success or refusal. Human refusals identify the native reason, stage, dimension, affected full operation identities and configuration pointer. Source legality, correspondence, mapping/artifact readiness and runtime remain separate dimensions. Unsupported or inconclusive qualification does not establish invalid vendor schemas. Loading interruptions retain discovered counts plus explicit incomplete inventory; independent operation refusals are collected before generation writes project artifacts.

For an unresolved locationless import, `--checked-draft` writes the known selection/permission configuration with `namespaceLocations: [{"namespace":"the-imported-namespace","location":"REQUIRED_SCHEMA_LOCATION"}]`. Replace that one value with an authorized schema path, then rerun the same pipeline with `--checked-config resolution.json`. Empty values and the unresolved placeholder refuse before source reads. Paths in generation configuration resolve from the invocation working directory. The user supplies missing source information, not a replacement type graph.

Report and draft files use exclusive creation by default. `--force-checked-files` explicitly permits replacing those requested files; it is independent of scaffold `--force-init` and test `--force-test`. A draft is written only when a missing-schema resolution is available. Planning does not create a misleading partial project on semantic refusal. Filesystem write failures after emission starts remain operational failures; output is not claimed to be atomic.

The package-root API shares that preparation:

```typescript
import {planCheckedComponents, runGenerationPipeline} from '@techspokes/typescript-wsdl-client';

const report = await planCheckedComponents('/authorized/source.wsdl');
console.log(report.ready, report.blockers);
await runGenerationPipeline({
  model: 'checked-components-v1', wsdl: '/authorized/source.wsdl',
  clientOutDir: '.generated/service/client', openapi: {outFile: '.generated/service/openapi.json'},
  gateway: {outDir: '.generated/service/gateway', versionSlug: 'v1', serviceSlug: 'service'},
  app: {appDir: '.generated/service'}, test: {testDir: '.generated/service/test'},
});
```

`planCheckedComponents` accepts the same partial component choices as `runGenerationPipeline.checkedComponents`. `CheckedPlanningError.report` exposes refusals from generation. `formatCheckedComponentPlan` formats human diagnostics, and `writeCheckedPlanningFile(path, data, force)` writes explicit report/draft data with ownership protection. Reports use opaque resource labels, digests and XML declaration positions; they omit source bytes and transport error details. The editable resolution configuration necessarily retains supplied filesystem permissions.

Saved reports and copied plans grant no authority. Every separate invocation reloads authorized sources and reruns native qualification, selection, mapping and compatibility checks. Planning never dispatches SOAP, and generation readiness leaves runtime restrictions, credentials and provider acceptance unassessed. The old `checked-assessment-v1` and direct-preview scope are unchanged.

### Explicit component configuration

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

Local dependencies are discovered under authorized roots; callers need not author snapshot bookkeeping. With explicit `sourceResources`, each entry has an original logical `uri` and an independently authorized physical snapshot `file`; the supplied snapshot set remains closed. HTTP metadata origins must be listed in `sourceOrigins` even though bytes are read from files. Missing snapshots refuse without network fallback. Optional `namespaceLocations` entries have `namespace` and `location` for imports without `schemaLocation`; explicit locations in source take precedence. Generation paths resolve from the invocation directory. Original source bytes are copied without modification and their provenance is recorded in `client/source-resources.json`.

Install, typecheck, test, build and start using the trial guide. Generated `client/source-resources.json` uses `checked-source-resources-v2`: it retains the resource inventory and source/capsule defaults relative to its client-directory owner. Ordinary startup needs no authored graph configuration. The optional runtime JSON file contains endpoint, destination restrictions, host, port and trust choices; paths resolve relative to that file. Programmatic hosts can call `buildServer()` or pass equivalent overrides.

Complete explicit source configurations remain advanced inputs, including older hosts that use them. An explicit `localSource`, `sourceUri`, `namespaceLocations`, `recordSources` or `capsuleFiles` requires `localSource`, `fileRoots`, `sourceResources` and `sourceOrigins` together; incomplete combinations refuse. Omitted restrictions preserve generated decisions, while explicit empty origins, snapshots, libraries and endpoint lists retain denial semantics. Generated defaults resolve canonically within their owner and verify snapshot digests; native physical-source and artifact checks still run independently on invocation. Runtime metadata stays offline. Cross-volume source layouts remain outside this scaffold.

The component transport applies optional endpoint restrictions and requires verified HTTPS when required by source policy. An optional CA file does not disable verification. Client certificates, timestamps, required WS-Addressing, supporting tokens and security headers remain unsupported and refuse. Scalar facets, ordered particle languages and strict wildcard membership remain native supplemental checks, so OpenAPI marks JSON shape completeness false. `admitted:false` remains the full-profile marker. Generated scaffold tests are separate from independently specified HTTP/SOAP wire and provider/business evidence.

For [SOAP 1.1 response headers](https://www.w3.org/TR/2000/NOTE-SOAP-20000508/), qualified optional blocks for the default receiver may be ignored when `mustUnderstand` is absent or `0`. Unknown mandatory blocks and actor-directed processing refuse; malformed attributes and unqualified blocks fail protocol checks. This processing grants no header security semantics or outgoing header capability.

The copied-source scaffold records authorized HTTP redirect aliases for offline reconstruction. Local symlink aliases still refuse before emission; native loading authorization alone does not establish a relocatable local tree. Directory names beginning with two dots are ordinary names, not parent segments.

### Explicit schema metadata and companion records

`standardLibraries: ["w3c-xsd10-schema-element-2004-v1"]` explicitly supplies the dated XSD 1.0 global `xs:schema` declaration. The declaring schema must still import its namespace. A reference to this element requires an actual schema element in the response; it supplies neither a default payload nor a companion service's record declarations. Runtime callers must independently permit the same library.

For a qualified schema-metadata-plus-strict-wildcard response, `recordProjections` can explicitly select a separate source contract for the payload. Each entry supplies the outer operation's full `selector`, physical companion `source`, companion `recordSelector` and the existing `scope: "records-with-declared-wrapper-scope"`. Native mappings derive the payload path, wrapper exclusions and a unique repeated complex-record path. If several paths exist, supply `recordPath` explicitly; the planner identifies the missing choice. No source or companion is discovered automatically.

The complete older form remains supported. Instead of the concise `scope`/optional `recordPath`, supply a closed `spec`:

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

## Native facets, lists and primitive-string unions

Checked component requests, responses and declared faults support named, inline and inherited string length/whitespace restrictions, native-supported XSD patterns on strings and numeric families, and exact bounds/digit constraints on int32 and string-encoded integer/decimal values. Native scalar formation and membership remain authoritative, including Unicode character counts, inherited pattern layers, enumeration and default/fixed assessment. JSON schemas describe the actual representation; they do not translate XSD regex or put numeric keywords on exact decimal strings.

Ordinary lists remain ordered arrays of selected item values. Patterned int items such as `+007` retain item strings; list-level patterns can require a single whole-list lexical string. Repeated XML elements remain distinct from one list-valued scalar. A list in a scalar identity holder or attribute entry keeps its complete encoding under `$value`.

The bounded union subset has only effective atomic members with XSD primitive string and no contextual/document-wide obligations. JSON carries one complete lexical string before member-specific whitespace normalization. The native owner chooses the first successful effective member on every fresh inverse, including nested XSD 1.0 flattening; callers supply no branch tag. Lists of these unions contain lexical item strings, except when an existing whole-list witness is required. Whitespace-containing application items cannot be trimmed into legal tokens.

Invalid input refuses before SOAP dispatch; invalid upstream responses and declared faults return non-success without a value. Strict and lax known declarations retain their scalar constraints; skip data remains lexical even when a name resembles a declared constrained type. Existing nil, attribute, namespace, mixed/open and companion mappings retain their separate native duties.

`test/conformance/fixtures/assessment/facets.wsdl` and the installed gateway harness exercise these families through independent hand JSON and namespace-aware SOAP. `test/unit/direct-projection-string-unions.test.ts` checks native member order, pre-member witnesses, normalization, ownership, cancellation and limits. Heterogeneous unions, unions containing lists, contextual names/identity, dynamic types and wider source/protocol/security/streaming families remain outside this slice; their broad owners stay open.

## Existing direct-runtime clients

Generation supports legacy and `checked-components-v1`. The unpublished intermediate `checked-direct-v1` pipeline and `checkedDirect` option have been removed. For its former Forecast examples, select `checked-components-v1`, omit the old configuration or change `selector` to `selectors: [selector]`, and regenerate the complete project.

The shipped `checkedDirectRuntimeV1` binding remains available for clients issued by v1.1.5. Its protocol, flat string/int32/Boolean grammar, physical-source checks and explicit owned IPv4-loopback endpoint authorization remain unchanged. This compatibility binding does not provide another generation workflow. Frozen published-producer client/capsule fixtures exercise it against the installed candidate runtime.

Generated `buildServer` accepts runtime cancellation, timeout and XML limits. Ordinary execution has no implicit profiling quota or deadline. Project artifacts must be within `appDir` and nonoverlapping; generator-owned files regenerate together, while consumer scaffolds retain their skip/force rules.

## Validation and coverage evidence

OpenAPI documentation uses 3.1.1 with separate draft-07 HTTP runtime plans. Route-local Ajv disables coercion, default insertion and property removal, and preserves unrelated host policy. The native runtime explicitly converts validated HTTP values through the issued mapping, performs actual SOAP execution and independently validates response/fault XML. HTTP response validation also runs independently of serializer selection; JSON serialization preserves the validated values.

`client/inventory.json` and the API result's `checked` field list every discovered portType operation, selected service/port/binding, requested/generated operation and unselected operations. Generation records `executed:false`; it does not claim a SOAP call occurred. Refused selection diagnostics name the requested operation and zero generated/executed operations. Unselected operations remain unassessed.

Generated tests check scaffolding and invalid HTTP refusal without authorizing upstream transactions. The repository's `checked-gateway-installed.test.ts` separately packs and installs the candidate outside the checkout, invokes installed CLI/API, typechecks/tests/builds the projects and starts a separate process with checkout filesystem access denied. Independent XML and JSON expectations check normal exchanges, SOAPAction, namespaces, order, optional/repeated values, declared faults and invalid input/upstream/artifact/permission cases.

Synthetic success establishes this delivery only. Positive representative real-service qualification and measured operation/family expansion remain under [#397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397); production endpoint/security qualification remains under #190/#191. The broader [#401](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) outcome and full-profile owners remain open.
