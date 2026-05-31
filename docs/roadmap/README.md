# Version 1.0 Roadmap Plan

Detailed plan for moving `@techspokes/typescript-wsdl-client` from `0.25.x` to a stable `1.0.0` release.

See the root [README.md](../../README.md) for project overview and the root [ROADMAP.md](../../ROADMAP.md) for the public roadmap summary.

## Purpose

This plan turns the 1.0 roadmap into implementation slices that can be picked up independently. Each slice has its own plan document with scope, testing strategy, acceptance gates, and release implications.

The plan is optimized for preserving quality. Contract mismatches are resolved before new capability work, compatibility research constrains schema changes, and WSDL coverage work turns unsupported behavior into explicit diagnostics.

## Route Summary

| Slice | Document | Outcome |
|-------|----------|---------|
| Contract audit | [Contract Audit](v1.0-contract-audit.md) | Public surfaces match behavior |
| OpenAPI compatibility | [OpenAPI Fastify Compatibility](v1.0-openapi-fastify-compatibility.md) | Schema strategy is proven |
| Choice union mode | [Choice Union Mode](v1.0-choice-union-mode.md) | `--client-choice-mode union` works |
| JSON array streaming | [JSON Array Streaming](v1.0-json-array-streaming.md) | `format: "json-array"` works |
| WSDL coverage matrix | [WSDL Coverage Matrix](v1.0-wsdl-coverage-matrix.md) | Feature support is test-backed |
| Release candidate | [Release Candidate Gates](v1.0-release-candidate-gates.md) | 1.0 release is repeatable |

## Execution Order

### Slice 1: Contract Audit

Start with contract audit because it defines the exact public promises that later slices must satisfy. This slice updates docs, identifies mismatched flags and options, and creates failing tests for the behavior that must become true.

### Slice 2: OpenAPI Fastify Compatibility

Run compatibility research before changing union schemas or streaming JSON schemas. This keeps schema design constrained by Fastify validation, Fastify serialization, and generated gateway behavior.

### Slice 3: Choice Union Mode

Implement full `xs:choice` union mode after compatibility constraints are known. The default `all-optional` mode remains unchanged for backwards compatibility.

### Slice 4: JSON Array Streaming

Implement streaming JSON array output after stream error behavior is researched. The result must stream records incrementally without buffering the full SOAP response.

### Slice 5: WSDL Coverage Matrix

Build the automated WSDL feature matrix once the two existing public contract gaps are handled. The matrix should then drive the remaining WSDL support and diagnostic decisions.

### Slice 6: Release Candidate Gates

Run the release candidate gates after feature work and documentation have converged. This slice validates docs, tests, generated examples, package contents, skill artifact, release notes, and provenance workflow readiness.

## Quality Principles

- Keep default generated output stable unless a slice explicitly changes it.
- Add failing tests before generator changes.
- Prefer fixture-driven WSDL behavior over ad hoc string assertions.
- Keep OpenAPI output compatible with generated Fastify gateways.
- Preserve deterministic output ordering in catalogs, generated TypeScript, schemas, and route files.
- Keep unsupported behavior explicit in diagnostics and documentation.

## 1.0 Gates

### Contract Gate

- `--client-choice-mode union` is implemented and documented.
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
