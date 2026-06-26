# Version 1.0 Roadmap Plan

Detailed plan for moving `@techspokes/typescript-wsdl-client` from the released `0.30.x` line to a stable `1.0.0` release.

See the root [README.md](../../README.md) for project overview and the root [ROADMAP.md](../../ROADMAP.md) for the public roadmap summary.

## Purpose

This plan turns the 1.0 roadmap into implementation slices that can be picked up independently. Each slice has its own plan document with scope, testing strategy, acceptance gates, and release implications.

The plan is optimized for preserving quality. The contract and compatibility baselines now exist, choice union mode is shipped, JSON array streaming is shipped, and the conformance framework is wired into validation gates. The remaining readiness work is to resolve any explicit conformance deferrals and run the final release candidate gate pass.

## Route Summary

| Slice                 | Document                                                                     | Status            | Outcome                         |
|-----------------------|------------------------------------------------------------------------------|-------------------|---------------------------------|
| Contract audit        | [Contract Audit](v1.0-contract-audit.md)                                     | baseline complete | Public surfaces match behavior  |
| OpenAPI compatibility | [OpenAPI Fastify Compatibility](v1.0-openapi-fastify-compatibility.md)       | baseline complete | Schema strategy is proven       |
| Choice union mode     | [Choice Union Mode](v1.0-choice-union-mode.md)                               | complete          | Implemented in `0.26.0`         |
| JSON array streaming  | [JSON Array Streaming](v1.0-json-array-streaming.md)                         | complete          | Implemented in `0.28.0`         |
| Conformance framework | [Capability Conformance Framework](v1.0-capability-conformance-framework.md) | gate wired        | Pipeline claims are test-backed |
| WSDL coverage matrix  | [WSDL Coverage Matrix](v1.0-wsdl-coverage-matrix.md)                         | gate wired        | Feature support is test-backed |
| Release candidate     | [Release Candidate Gates](v1.0-release-candidate-gates.md)                   | next              | 1.0 release is repeatable       |

## Execution Order

### Slice 1: Contract Audit

The baseline contract audit is complete. Keep it active as release hygiene so CLI docs, API docs, configuration docs, examples, roadmap statements, and generated behavior stay aligned.

### Slice 2: OpenAPI Fastify Compatibility

Compatibility research is complete for choice union mode and JSON array streaming. Run the same local Fastify probes before any future schema output changes.

### Slice 3: Choice Union Mode

Choice union mode is complete in `0.26.0`. The default `all-optional` mode remains unchanged for backwards compatibility.

### Slice 4: JSON Array Streaming

JSON array streaming is complete in `0.28.0`. The default `ndjson` format remains unchanged, and `format: "json-array"` streams records incrementally without buffering the full SOAP response.

### Slice 5: Capability Conformance Framework

The registry, fixture strategy, compile runner, client evidence, OpenAPI evidence, gateway runtime evidence, generated-test evidence, app evidence, documentation drift check, generated support matrix, and validation-gate wiring are shipped. Keep `npm run test:conformance` as the focused local command while broad Vitest discovery covers conformance in `npm test`, `npm run ci`, and release preflight.

### Slice 6: WSDL Coverage Matrix

The first WSDL matrix rows now exist as conformance registry entries with compile, client, OpenAPI, gateway runtime, generated-test, app, documentation, and release-gate evidence. The next work is to keep those rows current while release candidate gates are prepared.

### Slice 7: Release Candidate Gates

Run the release candidate gates after feature work and documentation have converged. This slice validates docs, tests, generated examples, package contents, skill artifact, release notes, and provenance workflow readiness.

## Remaining Before 1.0

- Turn remaining unsupported, diagnostic, or partial matrix rows into diagnostics, documentation, or scoped fixes.
- Confirm `docs/supported-patterns.md` matches the matrix.
- Run the release-candidate gates.

## Quality Principles

- Keep default generated output stable unless a slice explicitly changes it.
- Add failing tests before generator changes.
- Prefer fixture-driven WSDL behavior over ad hoc string assertions.
- Keep OpenAPI output compatible with generated Fastify gateways.
- Preserve deterministic output ordering in catalogs, generated TypeScript, schemas, and route files.
- Keep unsupported behavior explicit in diagnostics and documentation.

## 1.0 Gates

### Contract Gate

- `--client-choice-mode union` is implemented and documented in `0.26.0`.
- `format: "json-array"` is implemented and documented.
- CLI docs, API docs, configuration docs, and generated behavior agree.

### Compatibility Gate

- Choice union schemas are validated against Fastify request handling.
- Gateway response schemas stay inside Fastify serialization limits.
- JSON array streams have documented terminal-error behavior.

### Coverage Gate

- A capability conformance matrix runs under broad Vitest test automation.
- Release preflight verifies the focused conformance command and CI wiring.
- Each matrix entry has a fixture, status, and stage expectations.
- Unsupported features fail loudly or are documented as deliberately unsupported.

### Release Gate

- `npm run docs:validate` passes.
- `npm test` passes.
- `npm run smoke:pipeline` passes.
- `npm run ci` passes.
- `npm run release:preflight -- v1.0.0` passes during release preparation.

## Changelog Strategy

Each implementation slice should add one concise `CHANGELOG.md` entry under `## [Unreleased]`. Release-only changes move those entries into the release section during normal release preparation.
