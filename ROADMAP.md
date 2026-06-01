# TypeScript WSDL Client Roadmap

Roadmap for the TypeScript WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway generator, and runnable app scaffold.

## Current: 1.0 Readiness After 0.28.0

Focus: build the automated WSDL coverage matrix, resolve discovered diagnostics or deferrals, and run the release candidate gates.

The detailed route to 1.0 lives in [Version 1.0 Roadmap Plan](docs/roadmap/README.md). That plan is the working breakdown for implementation slices, acceptance gates, and testing strategy.

## Recently Shipped

### 0.28.0

- Added `format: "json-array"` streaming for stream-configured operations.
- Added OpenAPI array schemas and generated Fastify routes for JSON array streams.
- Preserved NDJSON as the default stream format.

### 0.27.0

- Hardened Fastify schema compatibility probes to avoid reflected request bodies.
- Kept the 1.0 compatibility test suite suitable for CodeQL review.

### 0.26.0

- Completed opt-in `--client-choice-mode union` across compiler metadata, TypeScript output, OpenAPI constraints, generated mocks, and generated validation tests.
- Kept default `xs:choice` handling in `all-optional` mode for backward compatibility.

### 0.25.0

- Hardened generated gateway runtime array unwrapping against prototype-sensitive keys.
- Replaced release-preflight dynamic changelog header matching with literal version matching.
- Added regression coverage for the reported CodeQL findings.

### 0.24.0

- Added `npm run release:preflight -- vX.Y.Z` for local release verification.
- Checked release metadata, dependency freshness, generated example drift, CI, and skill packaging before tags.
- Normalized generated example comparisons to avoid false drift from temporary paths.
- Removed unused concrete client imports from generated gateway plugin wrappers.

### 0.23.0

- Added portable documentation validation for local Markdown links and TypeScript fenced snippets.
- Added inbound gateway enforcement documentation for authentication, authorization, logging, and request correlation extension points.

### 0.22.0

- Refreshed root dependency minimums for `@types/node`, `soap`, `tsx`, and `vitest`.
- Refreshed generated app scaffold dependency minimums for `@types/node`, `soap`, and `tsx`.
- Improved draft release body rendering and consumer-facing release validation notes.

### 0.21.0

- Added the standalone AI agent skill artifact for consumer projects.
- Added release validation and packaging for the generated skill artifact.

### 0.20.0

- Added the tag-driven GitHub draft release workflow.
- Refreshed root and generated app dependency minimums.

### 0.19.0

- Added shared security configuration for OpenAPI gateway security and upstream SOAP runtime security.
- Added generated app scaffold support for upstream `node-soap` security profiles.
- Added OpenAPI top-level and per-operation security output from `security.json`.
- Added runtime `.env.example` and app README entries for upstream SOAP secrets.
- Cleaned up Markdown links, TypeScript docs snippets, and generated source templates for IDE inspections.

### 0.17.x

- Added opt-in streamable SOAP responses via ADR-002.
- Added client `StreamOperationResponse<T>` with `AsyncIterable<RecordType>`.
- Added gateway NDJSON streaming with backpressure.
- Added OpenAPI `x-wsdl-tsc-stream` extension for record schema discovery.
- Added companion-catalog shape resolution for opaque `xs:any` wrappers.
- Added SAX-driven streaming runtime and generated stream-aware tests.

## Product Priorities

### Public Contract Alignment

Choice union mode and JSON array streaming are implemented. Remaining contract work is to keep docs, generated behavior, and examples aligned while the WSDL matrix turns coverage gaps into supported, diagnostic, or deferred statuses.

### OpenAPI And Fastify Compatibility

Compatibility research is complete for released choice union schemas and JSON array streaming behavior. Any new schema output before 1.0 must get the same local Fastify probe coverage before generator output changes.

### Streaming

`json-array` streaming is implemented and keeps NDJSON as the default format. JSON array clients receive streamed records as one JSON document; terminal upstream errors after streaming starts truncate the response and must be treated as failed streams.

### WSDL Coverage

The immediate 1.0 blocker is an automated WSDL feature matrix that proves what is supported, partially supported, or rejected with diagnostics. Priority gaps are `xs:union`, abstract types, substitution groups, multi-binding WSDLs, out-of-band policy references, and deeply composed schemas.

### Gateway Integration

Generated gateway integration documentation must keep inbound authentication, authorization, logging, and request correlation outside generated route files. Security responsibility boundaries must remain explicit in configuration and gateway integration docs.

## Repository Health Priorities

- Keep documentation validation wired into CI and release preflight checks.
- Keep roadmap, changelog, README, CLI help, examples, and docs configuration pages aligned before each release.
- Keep generated output deterministic and reviewable through snapshot inventory checks.
- Keep package provenance and generated output verification in the release workflow.
- Test the supported Node.js floor and the newest active Node.js line before 1.0.

## 1.0 Release Gates

### Contract Gate

- `--client-choice-mode union` is implemented and documented.
- `format: "json-array"` has full test-backed behavior.
- Public CLI docs, API docs, examples, and generated output agree.

### Compatibility Gate

- Choice-union OpenAPI output is compatible with Fastify request validation.
- Response schemas remain compatible with Fastify serialization limits.
- Streaming JSON array output has clear media type, schema, and error semantics.

### Coverage Gate

- The automated WSDL feature matrix runs in CI or preflight.
- Every listed feature has a status, fixture, and expected behavior.
- Unsupported features fail with useful diagnostics rather than silent miscompilation.

### Quality Gate

- `npm run docs:validate` passes.
- `npm test` passes.
- `npm run smoke:pipeline` passes.
- `npm run ci` passes.
- `npm run release:preflight -- v1.0.0` passes during release preparation.

## Goals

### Technical

- Support most real-world WSDL files.
- Generate clean, strict TypeScript.
- Keep runtime dependencies minimal.
- Produce production-ready gateway scaffolds.
- Preserve end-to-end type safety from WSDL to HTTP response.

### Community

- Provide documentation and examples that match shipped behavior.
- Keep issues focused on reproducible bugs and discussions focused on design, adoption, and support.
- Make roadmap items specific enough for contributors to pick up.
