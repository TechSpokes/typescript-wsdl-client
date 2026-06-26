# Agent Instructions for typescript-wsdl-client

## First steps

Read `.github/copilot-instructions.md` for the authoritative, detailed instructions covering commit format, catalog co-location, CLI conventions, testing, changelog rules, and documentation conventions. Read `.github/instructions/` for file-pattern-specific rules (e.g., Markdown formatting for all `**/*.md` files). These two sources govern all agent behavior in this repository.

For routine tasks such as bug fixes and small feature additions, the summary and must-follow rules below are sufficient. For architectural changes, read the full copilot-instructions.md file and the project docs referenced there.

## Summary

This is a TypeScript code generator that transforms WSDL/XSD SOAP service definitions into typed SOAP clients, OpenAPI 3.1 specs, and production-ready Fastify REST gateways. The `pipeline` command runs the full generation stack in one pass. Source is in `src/` with modules for loading, compiling, client generation, OpenAPI generation, gateway generation, app scaffolding, and utilities. The pipeline orchestrator is `src/pipeline.ts`. Opt-in per-operation NDJSON streaming is available for large responses via `--stream-config` (ADR-002).

## Must-follow rules

- Do not edit files in generated output directories (client/, gateway/, app/); regenerate from WSDL sources instead.
- All generated output must be deterministic and diff-friendly with sorted types, paths, and schemas.
- Run `npm run smoke:pipeline` to verify changes end-to-end.
- Run `npm run test:conformance` for WSDL capability fixture, registry, runner, support-matrix, or generated artifact evidence changes.
- Commit messages must follow: `Version: <release-target-version> <type>(scope): <imperative summary>`.
- Post-release patch work uses the next patch version in commit titles even before `package.json` is bumped.
- A commit title target such as `Version: 0.30.3` does not mean the repository is ready for tag `v0.30.3`.
- Every release commit must include the matching `docs/releases/vX.Y.Z.md` release notes file.
- Node.js >= 20.0.0, ESM-only (`type: "module"`), strict TypeScript.
- CLI flag names are lowercase kebab-case such as `--wsdl-source` and `--init-app`.
- On release, verify `package.json` and `package-lock.json` match the target version before tagging.
- Before pushing a release tag, run `npm run release:preflight -- vX.Y.Z`; do not tag if it fails.
- On release, bump hardcoded dep versions in `src/app/generateApp.ts` (`generatePackageJson`) to current latest.
- The `soap` package is a runtime dependency; `wsdl-tsc` is a devDependency for consumers.
- IDE MCP tools such as PhpStorm MCP are optional accelerators for indexed search, inspections, run configurations, and symbol refactors; keep terminal commands as the portable fallback for contributors without the local IDE setup.

## Testing

Run `npm test` for all Vitest tests, including unit, snapshot, integration, and conformance suites. Run `npm run ci` for the complete CI pipeline. When modifying generators, update snapshot baselines with `npx vitest run test/snapshot -u` and review the diff. See `test/integration/gateway-routes.test.ts` for the mock client reference implementation.

Run `npm run test:conformance` when modifying WSDL capability rows, conformance fixtures, runner helpers, or public support claims. `npm test` and `npm run ci` must keep broad Vitest discovery so conformance remains covered, and release preflight verifies this script wiring.

## Must-read documents

- `.github/copilot-instructions.md`: authoritative agent instructions with full detail
- `.github/instructions/`: file-pattern-specific rules (read before editing matching files)
- `README.md`: project overview, installation, quick start, CLI command reference
- `CONTRIBUTING.md`: development setup, project structure, testing strategy

## References

- `docs/README.md`: documentation index (points to root README.md Documentation table)
- `examples/minimal/weather.wsdl`: test fixture used by all smoke tests and Vitest suites
- `CHANGELOG.md`: version history and breaking change entries
