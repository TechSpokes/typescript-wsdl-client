# Agent Instructions for typescript-wsdl-client

## First steps

Read `.github/copilot-instructions.md` for the authoritative, detailed instructions covering commit format, catalog co-location, CLI conventions, testing, changelog rules, and documentation conventions. Read `.github/instructions/` for file-pattern-specific rules (e.g., Markdown formatting for all `**/*.md` files). These two sources govern all agent behavior in this repository.

For routine tasks such as bug fixes and small feature additions, the summary and must-follow rules below are sufficient. For architectural changes, read the full copilot-instructions.md file and the project docs referenced there.

## Summary

This is a TypeScript code generator that transforms WSDL/XSD SOAP service definitions into typed SOAP clients, OpenAPI 3.1 specs, and production-ready Fastify REST gateways. The `pipeline` command runs the full generation stack in one pass. Source is in `src/` with modules for loading, compiling, client generation, OpenAPI generation, gateway generation, app scaffolding, and utilities. The pipeline orchestrator is `src/pipeline.ts`. Opt-in per-operation NDJSON streaming is available for large responses via `--stream-config` (ADR-002).

## Must-follow rules

- Do not edit files in generated output directories (client/, gateway/, app/); regenerate from WSDL sources instead.
- Keep repository-owned temporary outputs classified under `tmp/`: smoke in `tmp/smoke/`, npm cache in `tmp/cache/npm/`, preflight examples in `tmp/preflight/examples/`, conformance in `tmp/conformance/`, and generated-test spikes in `tmp/test-generation/`.
- Keep consumer output paths explicit and use the git-ignored `.generated/` convention in public examples.
- All generated output must be deterministic and diff-friendly with sorted types, paths, and schemas.
- Run `npm run smoke:pipeline` to verify changes end-to-end.
- Run `npm run test:conformance` for WSDL capability fixture, registry, runner, support-matrix, or generated artifact evidence changes.
- Commit messages must follow: `Version: <release-target-version> <type>(scope): <imperative summary>`.
- Post-release patch work uses the next patch version in commit titles even before `package.json` is bumped.
- A commit title target such as `Version: 0.30.3` does not mean the repository is ready for tag `v0.30.3`.
- Every release commit must include the matching `docs/releases/vX.Y.Z.md` release notes file.
- Node.js >= 24.0.0, ESM-only (`type: "module"`), strict TypeScript.
- GitHub CI must test Node 24 as the supported floor and Node 26 as the current line.
- GitHub push and PR CI is a fast hosted signal; run `npm run release:preflight -- vX.Y.Z` once on the final uncommitted release tree before committing and tagging.
- CLI flag names are lowercase kebab-case such as `--wsdl-source` and `--init-app`.
- On release, verify `package.json` and `package-lock.json` match the target version before tagging.
- Update the version before preflight; preflight verifies versions and must not update tracked files.
- Release preflight already runs full CI and packages the agent skill artifact; do not run those final gates separately.
- After preflight passes, commit the exact validated tree and tag it without rerunning preflight.
- If another command changes tracked release files after preflight, rerun preflight on the new final candidate before committing.
- On release, bump hardcoded dep versions in `src/app/generateApp.ts` (`generatePackageJson`) to current latest.
- The `soap` package is a runtime dependency; `wsdl-tsc` is a devDependency for consumers.
- IDE MCP tools such as PhpStorm MCP are optional accelerators for indexed search, inspections, run configurations, and symbol refactors; keep terminal commands as the portable fallback for contributors without the local IDE setup.
- Store 1.0 implementation plans under `docs/roadmap/` as `v1.0-<topic>.md`; never create `docs/superpowers/`.

## Testing

Run `npm test` for all Vitest tests, including unit, snapshot, integration, and conformance suites. Run `npm run ci` for the complete CI pipeline. When modifying generators, update snapshot baselines with `npx vitest run test/snapshot -u` and review the diff. See `test/integration/gateway-routes.test.ts` for the mock client reference implementation.

Run `npm run test:conformance` when modifying WSDL capability rows, conformance fixtures, runner helpers, or public support claims. `npm test` and `npm run ci` must keep broad Vitest discovery so conformance remains covered. GitHub push and PR CI intentionally stays faster and does not replace local release preflight.

Full conformance generates and validates consumer-style client, OpenAPI, gateway, generated-test, and app projects. It takes about three to four minutes on the maintained Windows environment and may stay quiet while nested TypeScript or Vitest processes run. Use a command timeout of at least six minutes, check the active process before treating a quiet run as stalled, and use the narrowest `test:conformance:<stage>` script during development.

## Must-read documents

- `.github/copilot-instructions.md`: authoritative agent instructions with full detail
- `.github/instructions/`: file-pattern-specific rules (read before editing matching files)
- `README.md`: project overview, installation, quick start, CLI command reference
- `CONTRIBUTING.md`: development setup, project structure, testing strategy

## References

- `docs/README.md`: documentation index (points to root README.md Documentation table)
- `examples/minimal/weather.wsdl`: test fixture used by all smoke tests and Vitest suites
- `CHANGELOG.md`: version history and breaking change entries
