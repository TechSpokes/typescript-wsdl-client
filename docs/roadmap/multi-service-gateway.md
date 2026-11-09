# Multi-service gateway implementation status

Implemented legacy composition and deferred checked scope. See the root [README](../../README.md).

## Current boundary

Native legacy composition is implemented through `runMultiServicePipeline`, `loadMultiServiceConfig` and `pipeline --services-config`. Each independent WSDL retains its generated client, catalog, SOAP binding/action metadata and service router; the aggregate emits one Fastify plugin and one OpenAPI 3.1 JSON document.

The [gateway guide](../gateway-guide.md#multi-service-setup) defines the consumer configuration and runtime client registry. The [API reference](../api-reference.md#runmultiservicepipeline) documents exported types, and the [CLI reference](../cli-reference.md#multi-service-configuration) covers invocation. These are the current contracts; the configuration examples previously proposed here are superseded.

Checked composition remains deferred. Checked generation still selects one source/service/binding context; no legacy composition setting relaxes that authority or enables checked streaming.

## Implemented legacy generation

### Scoped declaration identity

Compiler-internal identity separates anonymous declarations by owner and declaration path. Noncolliding public TypeScript names remain stable; collisions receive deterministic qualified names, with references and metadata updated consistently. Existing catalogs remain readable, without reconstructing declaration identities they never stored.

This repair preserves distinct Main `Service` declarations and allows reachable Content record shapes to be copied from their companion catalog. Separate service catalogs and operation metadata remain isolated.

### Aggregate ownership

Each service entry supplies a stable key, its own `PipelineOptions`, explicit output paths and an OpenAPI `basePath`. Generated decorators and schema scopes remain distinct, including when source service/class names coincide. Configuration rejects conflicting output ownership, duplicate prefixes, normalized slug/decorator collisions and source WSDLs inside generated output ownership.

Route prefixes are baked into service paths exactly once. The aggregate registers each service router with its own client and refuses inherited or direct Fastify runtime prefixes, keeping the served API definition aligned. Its typed `createClients` helper requires exactly the configured keys, each with explicit runtime constructor options.

Components are qualified by service key, and supported local references, operation targets, discriminator mappings and security scheme names are rewritten. Root security/server defaults retain their effective operation semantics. Duplicate paths, lost operation routes, unresolved local references and unsupported reference/resource contexts are refused; literal example and extension payloads remain data.

Sources generate separately before the aggregate spec/plugin pair is published. A later source failure preserves the previous aggregate spec/plugin files, but earlier generated service dependencies are not rolled back. Aggregate app/test scaffolding is outside this interface.

### Stream mapping and transport

Use the [mapping vocabulary](../concepts.md#mapping-terminology-and-naming) and [selected mapping contract](../mapping-contract.md) for shared terminology. Public legacy records use the generated client's `fromSoapResult` mapper after each complete record is parsed; the low-level XML parser keeps lexical values and attribute bags.

Record mapping restores attribute fields, projected boolean/number/bigint values, configured string-first primitive values, typed `$value` content, XML list tokens and repeated-element arrays. Explicit repetition metadata distinguishes inline list values from repeated XML elements. Known empty complex values map to `{}`, while empty primitive strings and simple-content values preserve their respective shapes.

The gateway's `unwrapArrayWrappers` only applies the existing selected array-wrapper convention, per mapped record when enabled. NDJSON and JSON-array output remain incremental. This does not transplant checked namespace-aware attribute fallbacks or ordered content grammars into legacy DTOs.

The stream transport uses node-soap's public `requestStream` HTTP interface, honoring runtime endpoint overrides, configured HTTP adapters, static headers and the supported security hooks. Stream-specific HTTP options are explicit constructor settings; per-call cancellation and deadlines cover the upstream HTTP exchange and record consumption. Returning an iterator releases its connection, and gateway disconnects cancel upstream before response headers or during delivery.

TLS verification stays enabled by default with Node's configured trust. SOAP 1.2/custom envelope namespaces, functional SOAP headers, SOAP body attributes, MTOM and NTLM are refused; see the [stream transport contract](../gateway-guide.md#streaming-transport-settings). Date mappings remain type-level, and no new JSON representation for `bigint` is introduced.

## Acceptance evidence

Repository tests cover declaration identity, deterministic component qualification, references and literal extensions, duplicate ownership/path refusal, and service-specific dispatch for schemas that reuse names. Generated consumer checks use one local Fastify host and two owned SOAP servers, preserving each client's endpoint and SOAP action behind its route.

Streaming regressions cover nested attributes, scalar policies, simple content, singleton/repeated arrays, list values, empty complex values, nil, UTF-8 chunk boundaries and SOAP Fault failures. Owned HTTP and HTTPS tests check verified trust, explicit unsupported modes, iterator return, deadlines, pre-aborted calls and gateway disconnects. Handshake-based checks establish delivery of the first mapped NDJSON or JSON-array record before upstream EOF.

### Escapia qualification boundary

The local proof on 2026-11-09 downloaded the current Main and Content `.svc?wsdl` metadata and their imported schemas. The native pipeline generated independent clients and 17 routes under `/main` and `/content`, one aggregate plugin and one served API definition.

Owned replay verified the Main success response and two captured Content records, including delivery of the first mapped record before SOAP EOF. Each Content record validated against its qualified schema in the aggregate definition.

Six live read calls using the environment-provided `Test` target passed through the same native composition. These covered booking channels, companies `7007` (ABC Rentals) and `1273` (A Perfect Vacation Rental), two ABC unit descriptions, an 18-unit calendar batch and the `1273-214474` description; streamed records validated against the advertised schemas.

The local reports remain under `tmp/conformance/escapia-live-2026-11-09/native-proof/`. Credentials were consumed only inside the request script, TLS verification used system trust, and array-wrapper flattening was explicitly disabled for these vendor requests. This sample qualification does not establish production availability or every operation's compatibility; deterministic repository regressions and private provider evidence remain separate.

## Deferred checked composition

A future checked composition owner must coordinate independently qualified operation capsules without merging source, service, port or binding identity. The existing `inspectComponentSourceService` checks remain intact.

Checked component responses currently document buffered delivery. Incremental checked decoding requires its own runtime design and qualification; legacy streaming success does not establish that capability.

## Compatibility and service isolation

Existing single-source CLI/API entry points remain available when composition is not selected. Keep credentials, trust decisions, source permissions, cancellation signals and stream settings scoped to the runtime client that owns them.

A combined OpenAPI document describes REST paths. It does not make separate SOAP contracts or checked-generation assessments interchangeable.
