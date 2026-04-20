# ADR 002: Streamable SOAP Responses and JSON Gateway Output

Proposal for opt-in streamable SOAP response support, with Escapia EVRN Content Service as the concrete driver.

See the root [README](../../README.md) for the authoritative documentation index and [Architecture](../architecture.md) for the current generator pipeline.

## Status

Accepted (2026-04-20). Implementation shipped in 0.17.0 across five phases
(Phase 0 research → Phase 5 integration). See
`scratches/plans/v017/streamable-responses.plan.yaml` for phase-by-phase
notes and verification gates.

## Context

The current generator handles WSDL operations as buffered request and response calls. A generated client method awaits the SOAP runtime callback, receives a fully materialized result object, and returns `{ response, headers, responseRaw, requestRaw }`. The generated OpenAPI document describes each operation as `application/json`. The generated Fastify route calls the client method, optionally unwraps array wrapper types, and returns the standard response envelope.

Escapia exposes two related SOAP services:

- `EVRNService` contains the normal operation and type model.
- `EVRNContentService` contains content-oriented operations that are intended for large responses.

The Escapia content WSDL includes stream-like operations such as `UnitDescriptiveInfoStream` and `UnitCalendarAvailBatch`. Their output wrapper types contain schema and wildcard payload sections instead of clean concrete response members. The practical record shapes come from the main EVRN service WSDL, for example `UnitDescriptiveContentType` and `UnitCalendarAvailType`.

This means the current package has two gaps:

- It does not stream SOAP responses through generated clients or gateways.
- It does not let users map opaque WSDL response wrappers to concrete JSON record shapes from the same or a companion WSDL.

## Current Architecture Review

The compile stage produces `catalog.json`, which is the only artifact that understands WSDL types, operation input and output elements, attribute metadata, child type metadata, and primitive mapping options.

The client stage generates a `node-soap` wrapper. Every operation is generated as a promise-returning method. The public operations interface mirrors that buffered shape, which is useful for mocks but cannot currently express an `AsyncIterable` or stream response.

The OpenAPI stage generates paths from catalog operations. It assumes every operation has a JSON request body and a JSON response body. Since version 0.7.1, successful responses are always wrapped in the standard envelope schema.

The gateway stage reads the OpenAPI document first and enriches operation metadata from `catalog.json` when the catalog is available. This lets route generation stay OpenAPI-driven, but stream support needs metadata that OpenAPI alone cannot represent.

The app and test generators assume ordinary JSON route responses. Generated tests use mock clients that implement the buffered operations interface.

## Requirements

- Existing buffered generation must remain unchanged unless a user opts in.
- Stream support must be configurable per operation.
- Users must be able to map an opaque output wrapper to a concrete record type.
- Record types must be resolvable from the current catalog or from a companion catalog.
- Gateway output must be able to emit records before the full SOAP response has arrived.
- Generated routes must respect Node and Fastify backpressure.
- OpenAPI output must describe the wire media type without pretending that NDJSON is a single JSON object.
- Error handling must distinguish errors before the first byte from errors after streaming has started.
- The feature must be testable with a local chunked SOAP server, not only static XML fixtures.

## Proposed Configuration Model

Add a stream configuration file passed with `--stream-config`. The same option should be available on `compile`, `client`, `openapi`, `gateway`, and `pipeline` so each stage can be run independently.

```json
{
  "shapeCatalogs": {
    "evrn": {
      "wsdlSource": "https://api.escapia.com/EVRNService.svc?singleWsdl"
    }
  },
  "operations": {
    "UnitDescriptiveInfoStream": {
      "mode": "stream",
      "format": "ndjson",
      "mediaType": "application/x-ndjson",
      "recordType": "UnitDescriptiveContentType",
      "recordPath": [
        "UnitDescriptiveInfoStream",
        "EVRN_UnitDescriptiveInfoRS",
        "UnitDescriptiveContents",
        "UnitDescriptiveContent"
      ],
      "shapeCatalog": "evrn"
    },
    "UnitCalendarAvailBatch": {
      "mode": "stream",
      "format": "ndjson",
      "mediaType": "application/x-ndjson",
      "recordType": "UnitCalendarAvailType",
      "recordPath": [
        "EVRN_UnitCalendarAvailBatchRS",
        "EVRN_UnitCalendarAvailBatchRS",
        "UnitCalendarAvails",
        "UnitCalendarAvail"
      ],
      "shapeCatalog": "evrn"
    }
  }
}
```

`shapeCatalogs` names additional WSDL or catalog inputs used only to resolve stream record shapes.

`operations` marks specific WSDL operations as streamed. Operations not listed keep the existing buffered behavior.

`recordPath` is an ordered XML element path from the SOAP body payload to the repeated record element. Duplicate local names must be allowed because Escapia uses nested elements with the same name in at least one response.

`recordType` is the TypeScript and schema model to emit for each streamed record.

`format` should support `ndjson` first. `json-array` can be added later for clients that require a single JSON array response.

## CLI and Programmatic API

The CLI should add `--stream-config <file>` to all generation commands. The pipeline command should pass the parsed and normalized configuration to every stage.

The programmatic API should add optional stream configuration fields to:

```typescript
export interface PipelineOptions {
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}

export interface GenerateOpenAPIOptions {
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}

export interface GenerateGatewayOptions {
  streamConfigFile?: string;
  streamConfig?: StreamConfig;
}
```

The compiler options should accept normalized stream metadata only when compilation needs to persist it into the catalog.

## Catalog Model

The compiled catalog should carry normalized stream metadata beside operation metadata:

```typescript
export interface Operation {
  name: string;
  inputTypeName?: string;
  outputTypeName?: string;
  stream?: OperationStreamMetadata;
}

export interface OperationStreamMetadata {
  mode: "stream";
  format: "ndjson" | "json-array";
  mediaType: string;
  recordPath: string[];
  recordTypeName: string;
  shapeCatalogName?: string;
  sourceOutputTypeName?: string;
}
```

The compiler should also represent wildcard schema particles explicitly. Today Escapia stream wrappers compile into misleading `xs:schema` properties and drop the wildcard payload. A better model is to retain both the schema marker and a wildcard marker so diagnostics and stream candidate detection are honest.

## Shape Resolution

The first implementation should support companion catalogs in one of two forms:

- A `catalogFile` path for a catalog already produced by `wsdl-tsc compile`.
- A `wsdlSource` path or URL that the pipeline compiles before normalizing stream metadata.

For generated types, the MVP should copy the reachable record type graph from the companion catalog into the current generated output when there is no name collision. If a collision occurs, generation should fail with a clear diagnostic instead of silently renaming public API types.

A future version can support external type imports from another generated client directory.

## Client Runtime

Generated clients should keep the existing buffered method signatures for ordinary operations.

Stream operations should return a separate response type:

```typescript
export type StreamOperationResponse<RecordType, HeadersType = Record<string, unknown>> = {
  records: AsyncIterable<RecordType>;
  headers: HeadersType;
  requestRaw?: string;
};
```

The operations interface should use the same stream response type so generated gateway tests and user mocks can implement streaming behavior without importing the concrete SOAP client.

The transport layer should be proven by a chunked integration test. If `node-soap` with stream or SAX options can deliver records incrementally, it can be used for the MVP. If it buffers before yielding, the feature must use a dedicated SOAP HTTP transport for stream operations before release.

> **Phase 0 research outcome (2026-04-20):** `node-soap` **buffers** the full response before invoking the operation callback. Measured with `test/research/node-soap-streaming.test.ts` against a chunked HTTP fixture: first chunk flushed at ~48 ms, server closed at ~701 ms, node-soap callback fired at ~659 ms (~40 ms before close — that is parse time, not streaming). Generated stream operations therefore use a dedicated streaming HTTP transport emitted into the client runtime; `node-soap` remains the transport for buffered operations only. SAX streaming was validated with `saxes` 6.0.0; `test/research/sax-record-path.test.ts` chunk-fuzzes the Escapia-shaped XML (duplicate `EVRN_UnitDescriptiveInfoRS` wrappers) across every single-byte split and every byte-pair split and produces identical records each time. See `scratches/plans/v017/streamable-responses.plan.yaml` for the full findings.

## XML to JSON Streaming Conversion

The runtime needs a streaming XML parser. `fast-xml-parser` is suitable for buffered documents but not for this use case. A SAX-style parser should track the configured `recordPath`, build a record object as the target element closes, and yield each record immediately.

The converter must reuse catalog metadata for:

- XML attributes and the configured attributes key
- Child element type lookup
- Repeated elements
- Nillable elements
- Text content and `$value`
- Primitive mapping

The converter should collect SOAP faults, response errors, and warnings when they appear before the first record. After streaming starts, terminal errors cannot be represented as a normal JSON error envelope for NDJSON. The runtime should either emit a final error record with a documented extension shape or abort the stream and log the classified error.

## OpenAPI Output

Stream operations should not use the standard success envelope for `200` responses. The response content should use the configured stream media type.

```json
{
  "description": "Successful streamed SOAP operation response",
  "content": {
    "application/x-ndjson": {
      "schema": { "type": "string" },
      "x-wsdl-tsc-stream": {
        "format": "ndjson",
        "itemSchema": {
          "$ref": "#/components/schemas/UnitDescriptiveContentType"
        }
      }
    }
  }
}
```

OpenAPI 3.1 cannot fully describe an NDJSON sequence as a standard JSON Schema document. The `x-wsdl-tsc-stream` extension makes the item schema explicit for generated gateways, documentation tools, and future SDK generators.

## Gateway Output

Generated stream routes should call the stream operation and send a Node stream through Fastify.

```typescript
import { Readable } from "node:stream";

handler: async (request, reply) => {
  const client = fastify.escapiaContentClient;
  const result = await client.UnitDescriptiveInfoStream(request.body);

  reply.type("application/x-ndjson");
  return reply.send(Readable.from(toNdjson(result.records)));
}
```

The generated operation schema should keep request validation but omit the Fastify response serialization schema for streamed `200` responses. Fastify cannot serialize an unbounded stream with a normal JSON response schema.

The gateway runtime should add `toNdjson()` and, later, `toJsonArrayStream()` helpers. These helpers should be deterministic, backpressure-aware, and safe for large payloads.

## Test Strategy

Add unit tests for stream config parsing, operation matching, catalog normalization, wildcard compiler metadata, and record path matching.

Add converter tests that split XML chunks across element boundaries to prove the parser does not rely on convenient chunking.

Add a local Escapia-like WSDL fixture with `xs:any` output wrappers and a companion WSDL fixture with the concrete record types.

Add an integration test with a fake SOAP HTTP server that writes one record, waits, writes another record, and then closes the envelope. The test should assert that the gateway emits the first NDJSON line before the upstream response completes.

Add snapshot tests for generated `client.ts`, `operations.ts`, OpenAPI output, gateway route files, and gateway runtime helpers.

Run `npm run smoke:pipeline` after implementation to verify ordinary buffered generation is unchanged.

## Implementation Plan

1. Define `StreamConfig`, parser, validation errors, and normalized operation metadata.
2. Add `--stream-config` to the CLI and thread it through the programmatic API.
3. Update the compiler to preserve wildcard particles and emit stream candidate diagnostics.
4. Implement companion catalog loading and record type graph copying.
5. Generate stream method signatures in `client.ts` and `operations.ts`.
6. Add a streaming XML converter with catalog-aware JSON shape conversion.
7. Generate OpenAPI stream responses with `x-wsdl-tsc-stream` metadata.
8. Generate Fastify streaming handlers and runtime helpers.
9. Add unit, snapshot, and chunked integration tests.
10. Update README, CLI reference, configuration docs, gateway guide, testing guide, and supported patterns.

## Acceptance Criteria

- Existing generated output is unchanged when no stream config is provided.
- A stream-configured Escapia content WSDL generates typed stream client methods.
- The generated gateway emits `application/x-ndjson` records incrementally.
- The generated OpenAPI document identifies stream operations and record schemas.
- The converter maps XML attributes, arrays, text values, and nillable values consistently with buffered responses.
- The chunked integration test proves the first record is sent before the full SOAP response is available.
- Stream route errors before the first byte use the normal gateway error envelope.
- Stream route errors after the first byte follow a documented terminal error policy.

## Consequences

The generator gains a second response execution model. This increases complexity in the client, OpenAPI, gateway, and test generators, but keeps the complexity opt-in and operation-scoped.

The catalog becomes more important as the shared source of truth because OpenAPI alone cannot carry enough stream conversion metadata.

NDJSON becomes the recommended stream format because it is simple, broadly consumable, and does not require buffering a complete JSON array before sending data.

Companion catalogs are required for vendors that split stream wrappers and concrete record shapes across separate WSDLs.

## Implementation Notes

Captured after the 0.17.0 ship for future maintainers:

- `--stream-config` is wired onto the `compile`, `client`, and `pipeline` CLI commands. It is intentionally not accepted on `openapi`, `gateway`, or `app` because those commands consume a pre-compiled `catalog.json` that already carries the normalized `OperationStreamMetadata`. The original proposal text that listed the flag on every command reflected the design intent; the shipped surface is narrower for that reason.
- `GenerateOpenAPIOptions` and `GenerateGatewayOptions` in the programmatic API do not carry stream-config fields for the same reason. `compileWsdlToProject` and `runGenerationPipeline` (PipelineOptions) do.
- The client stream transport is emitted from two templates (`clientStreamMethods.tpl.txt`, `operationsStreamHelper.tpl.txt`). They embed the `StreamOperationResponse<T>` type and a `callStream()` method that POSTs a hand-built SOAP envelope via global `fetch`, bypassing `node-soap` as required by the phase-0 finding.
- `saxes ^6.0.0` was promoted from devDependency to runtime dependency on the package, and added as a pinned dependency in the generated app scaffold so stream-enabled consumers install it automatically.
- The `json-array` format is reserved in the config parser but not yet implemented by the emitters. Entries using `format: "json-array"` parse successfully and can be used to forward-declare intent; they do not currently generate routes or client methods.

## References

- Escapia EVRN API documentation: <https://eweb.escapia.com/distribution/api/evrn-api-documentation>
- Escapia EVRN service WSDL: <https://api.escapia.com/EVRNService.svc?WSDL>
- Escapia EVRN content service WSDL: <https://api.escapia.com/EVRNContentService.svc?WSDL>
- Escapia batch API support article: <https://support.escapia.com/articles/en_US/Article/HASW-Batch-API-Methods-EVRN?category=Website_Services>
