# Version 1.0 Roadmap Plan

Detailed plan for moving `@techspokes/typescript-wsdl-client` from the released `0.28.x` line to a stable `1.0.0` release.

See the root [README.md](../../README.md) for project overview and the root [ROADMAP.md](../../ROADMAP.md) for the public roadmap summary.

## Purpose

This plan turns the 1.0 roadmap into implementation slices that can be picked up independently. Each slice has its own plan document with scope, testing strategy, acceptance gates, and release implications.

The plan is optimized for preserving quality. The contract and compatibility baselines now exist, choice union mode is shipped, and JSON array streaming is shipped. The remaining readiness work is WSDL coverage evidence and the final release candidate gate pass.

## Route Summary

| Slice                 | Document                                                               | Status            | Outcome                        |
|-----------------------|------------------------------------------------------------------------|-------------------|--------------------------------|
| Contract audit        | [Contract Audit](v1.0-contract-audit.md)                               | baseline complete | Public surfaces match behavior |
| OpenAPI compatibility | [OpenAPI Fastify Compatibility](v1.0-openapi-fastify-compatibility.md) | baseline complete | Schema strategy is proven      |
| Choice union mode     | [Choice Union Mode](v1.0-choice-union-mode.md)                         | complete          | Implemented in `0.26.0`        |
| JSON array streaming  | [JSON Array Streaming](v1.0-json-array-streaming.md)                   | complete          | Implemented in `0.28.0`        |
| WSDL coverage matrix  | [WSDL Coverage Matrix](v1.0-wsdl-coverage-matrix.md)                   | remaining         | Feature support is test-backed |
| Release candidate     | [Release Candidate Gates](v1.0-release-candidate-gates.md)             | remaining         | 1.0 release is repeatable      |

## Execution Order

### Slice 1: Contract Audit

The baseline contract audit is complete. Keep it active as release hygiene so CLI docs, API docs, configuration docs, examples, roadmap statements, and generated behavior stay aligned.

### Slice 2: OpenAPI Fastify Compatibility

Compatibility research is complete for choice union mode and JSON array streaming. Run the same local Fastify probes before any future schema output changes.

### Slice 3: Choice Union Mode

Choice union mode is complete in `0.26.0`. The default `all-optional` mode remains unchanged for backwards compatibility.

### Slice 4: JSON Array Streaming

JSON array streaming is complete in `0.28.0`. The default `ndjson` format remains unchanged, and `format: "json-array"` streams records incrementally without buffering the full SOAP response.

### Slice 5: WSDL Coverage Matrix

Build the automated WSDL feature matrix next. The matrix should drive the remaining WSDL support, diagnostic, and deferral decisions.

### Slice 6: Release Candidate Gates

Run the release candidate gates after feature work and documentation have converged. This slice validates docs, tests, generated examples, package contents, skill artifact, release notes, and provenance workflow readiness.

## Remaining Before 1.0

- Build and run the WSDL feature matrix.
- Turn unsupported or partial matrix rows into diagnostics, documentation, or scoped fixes.
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

- A WSDL feature matrix runs under test automation.
- Each matrix entry has a fixture and expected behavior.
- Unsupported features fail loudly or are documented as deliberately unsupported.

### Release Gate

- `npm run docs:validate` passes.
- `npm test` passes.
- `npm run smoke:pipeline` passes.
- `npm run ci` passes.
- `npm run release:preflight -- v1.0.0` passes during release preparation.

## Changelog Strategy

Each implementation slice should add one concise `CHANGELOG.md` entry under `## [Unreleased]`. Release-only changes move those entries into the release section during normal release preparation.
