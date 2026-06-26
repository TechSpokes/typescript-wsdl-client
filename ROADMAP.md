# TypeScript WSDL Client Roadmap

Roadmap for the TypeScript WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway generator, and runnable app scaffold.

## Current: 1.0 Readiness After 0.37.0

Focus: keep the expanded conformance baseline aligned after the release workflow optimization, confirm the remaining documented partial and terminal capability decisions, and run the release candidate gates.

The detailed route to 1.0 lives in [Version 1.0 Roadmap Plan](docs/roadmap/README.md). That plan is the working breakdown for implementation slices, acceptance gates, and testing strategy.

## Recently Shipped

### 0.37.0

- Replaced post-release full CI in the package publishing workflow with a targeted publish check.
- Added a release preflight guard that keeps package publishing validation targeted.
- Aligned 1.0 roadmap status with the `0.36.0` wildcard-bag release.

### 0.36.0

- Added `xs:anyAttribute` wildcard-bag output across TypeScript, OpenAPI, gateway, generated-test, and app evidence.
- Split fast GitHub hosted checks from the full local release gate.
- Clarified single-pass release preflight usage.

### 0.35.0

- Expanded baseline WSDL and XSD conformance rows across compile, client, OpenAPI, gateway, generated-test, and app stages.
- Raised the supported Node.js floor to Node 24 with Node 26 CI coverage.
- Classified repository-owned temporary outputs under `tmp/` subfolders.

### 0.34.0

- Added release-preflight wiring checks for `test:conformance`, broad Vitest discovery, and CI conformance coverage.
- Documented focused conformance verification in the testing guide.
- Moved the conformance plan to release-candidate readiness.

### 0.33.0

- Added generated-test and app scaffold evidence for WSDL capability rows.
- Fixed generated app scaffold `tsconfig` roots for sibling generated artifacts.
- Fixed generated mock values for alias-backed request properties.

### 0.32.0

- Added generated gateway type-checking and Fastify runtime evidence for WSDL capability rows.
- Documented `tmp/conformance/` as the generated conformance project boundary.

### 0.31.0

- Added generated client and OpenAPI evidence for WSDL capability rows.
- Added diagnostics for abstract types, substitution groups, and MTOM/XOP attachment metadata.

### 0.30.0

- Refreshed dependency floors and generated app scaffold pins.
- Bumped CI checkout tooling.
- Shipped no behavioral or API changes.

### 0.29.0

- Refreshed the 1.0 roadmap after the JSON array streaming release.
- Defined the planned capability conformance framework.
- Refreshed dependency floors, lockfile security updates, and generated app scaffold pins.

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

Choice union mode and JSON array streaming are implemented. The conformance registry now gives baseline WSDL and XSD rows explicit supported, partial, diagnostic, or unsupported statuses. Remaining contract work is to keep docs, generated behavior, and examples aligned before the 1.0 release candidate.

### OpenAPI And Fastify Compatibility

Compatibility research is complete for released choice union schemas and JSON array streaming behavior. Any new schema output before 1.0 must get the same local Fastify probe coverage before generator output changes.

### Streaming

`json-array` streaming is implemented and keeps NDJSON as the default format. JSON array clients receive streamed records as one JSON document; terminal upstream errors after streaming starts truncate the response and must be treated as failed streams.

### Capability Conformance

The conformance registry now proves compile, client, OpenAPI, gateway runtime, generated-test, app, and documentation surfaces for the current supported and partial WSDL rows. Diagnostic and unsupported rows stop with executable compiler errors. `npm test` and `npm run ci` cover conformance through broad Vitest discovery, and release preflight verifies that the focused conformance command and CI discovery remain wired.

### WSDL Coverage

WSDL coverage is the first conformance domain and the public baseline support registry. The current matrix includes the canonical weather document-literal baseline, reusable sequence and simple-type behavior, simple content attributes, documentation propagation, SOAP binding selection, XSD imports, choice union mode, `xs:union`, abstract types, substitution groups, multi-binding WSDLs, out-of-band policy references, deeply composed schemas, `xs:anyAttribute`, and MTOM/XOP attachments.

### Gateway Integration

Generated gateway integration documentation must keep inbound authentication, authorization, logging, and request correlation outside generated route files. Security responsibility boundaries must remain explicit in configuration and gateway integration docs.

## Repository Health Priorities

- Keep documentation validation wired into CI and release preflight checks.
- Keep roadmap, changelog, README, CLI help, examples, and docs configuration pages aligned before each release.
- Keep generated output deterministic and reviewable through snapshot inventory checks.
- Keep package provenance and generated output verification in the release workflow.
- Test Node 24 as the supported Node.js floor and Node 26 as the current line before 1.0.

## 1.0 Release Gates

### Contract Gate

- `--client-choice-mode union` is implemented and documented.
- `format: "json-array"` has full test-backed behavior.
- Public CLI docs, API docs, examples, and generated output agree.

### Compatibility Gate

- Choice-union OpenAPI output is compatible with Fastify request validation.
- Response schemas remain compatible with Fastify serialization limits.
- Streaming JSON array output has clear media type, schema, and error semantics.

### Conformance Gate

- The automated capability conformance matrix runs through broad Vitest discovery in `npm test` and `npm run ci`.
- `npm run release:preflight -- v1.0.0` verifies that `test:conformance`, `npm test`, and `npm run ci` still cover conformance.
- `npm run release:preflight -- v1.0.0` verifies CI still covers Node 24 and Node 26 and release workflows run on Node 24.
- Every listed capability has a status, fixture, and expected stage behavior.
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
