# TypeScript WSDL Client Roadmap

Roadmap for the TypeScript WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway generator, and runnable app scaffold.

## Current: Stable 1.1.4

As of October 9, 2026, [v1.1.4](https://github.com/TechSpokes/typescript-wsdl-client/releases/tag/v1.1.4) is the latest published release. Both v1.1.3 and v1.1.4 are published; their earlier draft status is historical. See the [release notes](docs/releases/v1.1.4.md) and [changelog](CHANGELOG.md) for delivered behavior.

Focus: preserve supported generated contracts while completing the evidence and architecture decisions for [content-model correctness, epic #147](https://github.com/TechSpokes/typescript-wsdl-client/issues/147). Its broader architecture remains planned work; merged changes and draft release preparation do not establish published availability.

The [Version 1.0 Roadmap Plan](docs/roadmap/README.md) records the completed 1.0 implementation and qualification work. Current work is organized in the issue tracker below.

## Active Backlog

The [execution index](https://github.com/TechSpokes/typescript-wsdl-client/issues/147#issuecomment-5778987910) owns the session-to-task map, prerequisites, acceptance gates, and handoffs. Epic #147 coordinates 18 sessions and 43 focused implementation tasks through native parent-child and blocking relationships.

### Next Work

[Imports maintenance #209](https://github.com/TechSpokes/typescript-wsdl-client/issues/209) is complete through [PR #218](https://github.com/TechSpokes/typescript-wsdl-client/pull/218) and published in v1.1.4. The roadmap refresh tracked by [#217](https://github.com/TechSpokes/typescript-wsdl-client/issues/217) is independent of architecture implementation.

Start the remaining architecture work with [S01 baseline evidence #166](https://github.com/TechSpokes/typescript-wsdl-client/issues/166), reusing the shipped fixtures and fixes. Then [#167](https://github.com/TechSpokes/typescript-wsdl-client/issues/167) records the delivered integration and remaining limits to complete [S01 #148](https://github.com/TechSpokes/typescript-wsdl-client/issues/148).

The S01 handoff unlocks [S02 #149](https://github.com/TechSpokes/typescript-wsdl-client/issues/149): architecture contracts and SOAP/gateway feasibility probes. S02 must establish compatibility policy, the architecture release version, and any public shape or default activation before downstream delivery commits to them.

### Delivery Clusters

| Milestone | Scope | Exit outcome |
|---|---|---|
| [Maintenance](https://github.com/TechSpokes/typescript-wsdl-client/milestone/1) | #209, #217 | Published imports fix and current roadmap |
| [Baseline and decisions](https://github.com/TechSpokes/typescript-wsdl-client/milestone/2) | S01-S02 | Independent evidence and approved contracts |
| [Canonical semantics](https://github.com/TechSpokes/typescript-wsdl-client/milestone/3) | S03-S07 | Ordered graph, exact analysis, verified matching |
| [Contracts and codec](https://github.com/TechSpokes/typescript-wsdl-client/milestone/4) | S08-S10 | Reversible projections, bundles, XML round trips |
| [Integration and consumers](https://github.com/TechSpokes/typescript-wsdl-client/milestone/5) | S11-S16 | SOAP, streaming, generators, installed consumers |
| [Migration and readiness](https://github.com/TechSpokes/typescript-wsdl-client/milestone/6) | S17-S18 | Compatibility, migration, release qualification |

Milestones group outcomes without scheduled dates or an assigned architecture release version. Session entry criteria determine readiness; S14 JSON/OpenAPI work can proceed from S09 contracts without waiting for streaming. A session closes only after its child tasks and combined acceptance gate pass.

### Architecture Boundaries

The planned shared schema model must preserve order, group and choice relationships, occurrence constraints, namespaces, and nil attributes across generated and runtime contracts. Independent reference evidence, XML round trips, real SOAP exchanges, gateway response bytes, and installed consumers must substantiate each applicable claim.

The focused [#141 occurrence fix](https://github.com/TechSpokes/typescript-wsdl-client/issues/141) shipped in v1.1.2; it does not complete epic #147. Current support remains defined by [Supported Patterns](docs/supported-patterns.md), and architecture migration documentation remains assigned to [#205](https://github.com/TechSpokes/typescript-wsdl-client/issues/205).

Existing public behavior stays in place until the S02 compatibility policy permits a change. Architecture completion, release preparation, and maintainer publication are separate steps.

## Recently Shipped

### 1.1.4

[Release notes](docs/releases/v1.1.4.md). Published October 9, 2026.

- Replaced generated SOAP namespace imports with named runtime and explicit type-only imports.
- Added aliases for generated client names that collide with SOAP imports.
- Typechecked integration tests and exercised compiled clients in Node 24 and Node 26 CI.

### 1.1.3

[Release notes](docs/releases/v1.1.3.md). Published October 9, 2026.

- Refreshed compatible dependencies to address upstream security advisories.
- Aligned generated app dependency ranges and the development Node pin with Node 24.
- Retained TypeScript 6 and existing generated API contracts.

### 1.1.2

[Release notes](docs/releases/v1.1.2.md). Published September 25, 2026.

- Corrected wrapping-sequence occurrence bounds in catalogs and generated types.
- Normalized singleton SOAP responses to their declared array shape for clients and gateways.
- Included the correction from the abandoned v1.1.1 candidate and credited the original contributor.

This focused fix adds no finite-array-length or sequence-order validation. Broader semantic evidence remains in S01.

### 1.1.0

[Release notes](docs/releases/v1.1.0.md). Published September 22, 2026.

- Added generated TypeScript ESLint preambles and consumer lint guidance.
- Preserved existing editable scaffolds unless explicitly regenerated.

## Historical Delivery

Earlier implementation milestones are retained below. The [changelog](CHANGELOG.md) records version history and abandoned candidates; the [published releases](https://github.com/TechSpokes/typescript-wsdl-client/releases) establish availability.

### 1.0.0

- Declared the documented client, OpenAPI, gateway, app, and programmatic surfaces stable.
- Published the 0.x-to-1.0 migration contract and accepted capability limitations.
- Aligned the packaged consumer agent skill with the Node 24 runtime floor.
- Completed the contract, compatibility, conformance, Node, package, and release gates.
- Added immutable abandonment markers that block rejected candidates before draft or package publication.

### 0.40.1

- Added stage-specific conformance commands while preserving the complete release-blocking suite.
- Documented realistic conformance duration, timeout, and stall-diagnosis expectations.
- Accepted the remaining partial and terminal capability boundaries for 1.0.
- Deferred the public WSDL inspector until after 1.0.

### 0.40.0

- Refreshed `fast-xml-parser`, Fastify, Vitest, and Node type dependency minimums while retaining TypeScript 6 compatibility.
- Updated generated app scaffold pins for Fastify and Node types.
- Kept the 1.0 roadmap focused on explicit capability decisions and release-candidate gates.

### 0.39.0

- Added scoped TypeScript ownership for tests and generated examples so IDE diagnostics match the NodeNext project layout.
- Deduplicated generated gateway runtime metadata without changing gateway response behavior.
- Cleaned release script helpers, inspection suppressions, and documentation wording that affected local IDE quality signals.

### 0.38.0

- Refreshed `js-yaml`, `fastify`, `@types/node`, and `tsx` dependency minimums.
- Updated generated app scaffold pins so new apps match the maintained dependency floor.
- Kept the 1.0 roadmap pointed at release-candidate gate work after the dependency refresh.

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

Choice union mode and JSON array streaming are implemented. The conformance registry gives baseline WSDL and XSD rows explicit supported, partial, diagnostic, or unsupported statuses. Keep docs, generated behavior, and examples aligned while epic #147 establishes and verifies the broader shared contract.

### OpenAPI And Fastify Compatibility

Compatibility research is complete for released choice union schemas and JSON array streaming behavior. S02 must test dialect, non-mutating validation, and serialization decisions before the architecture's schema and gateway changes.

### Streaming

`json-array` streaming is implemented and keeps NDJSON as the default format. JSON array clients receive streamed records as one JSON document; terminal upstream errors after streaming starts truncate the response and must be treated as failed streams. S12's shared codec, completion, cancellation, and buffered/streamed parity work remains planned.

### Capability Conformance

The conformance registry now proves compile, client, OpenAPI, gateway runtime, generated-test, app, and documentation surfaces for the current supported and partial WSDL rows. Diagnostic and unsupported rows stop with executable compiler errors. `npm test` and `npm run ci` cover conformance through broad Vitest discovery, and release preflight verifies that the focused conformance command and CI discovery remain wired.

Version `0.40.1` added stage-specific maintainer commands for faster feedback while keeping the complete suite release-blocking. The first-binding behavior, external policy limitation, abstract and substitution diagnostics, and MTOM/XOP rejection were accepted 1.0 boundaries. New architecture support claims require their own evidence and the approved S02 profile.

### WSDL Coverage

WSDL coverage is the first conformance domain and the public baseline support registry. The current matrix includes the canonical weather document-literal baseline, reusable sequence and simple-type behavior, simple content attributes, documentation propagation, SOAP binding selection, XSD imports, choice union mode, `xs:union`, abstract types, substitution groups, multi-binding WSDLs, out-of-band policy references, deeply composed schemas, `xs:anyAttribute`, and MTOM/XOP attachments.

### Gateway Integration

Generated gateway integration documentation must keep inbound authentication, authorization, logging, and request correlation outside generated route files. Security responsibility boundaries must remain explicit in configuration and gateway integration docs.

## Repository Health Priorities

- Keep documentation validation wired into CI and release preflight checks.
- Keep roadmap, changelog, README, CLI help, examples, and docs configuration pages aligned before each release.
- Keep generated output deterministic and reviewable through snapshot inventory checks.
- Keep package provenance and generated output verification in the release workflow.
- Test Node 24 as the supported Node.js floor and Node 26 as the current line while retaining TypeScript 6.

## Historical 1.0 Release Gates

These completed 1.0 qualification criteria are retained as historical context. Current implementation follows the epic's session gates and [contributor checks](CONTRIBUTING.md); release preparation follows the [current release workflow](.github/copilot-instructions.md#release-workflow) for its selected version.

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
