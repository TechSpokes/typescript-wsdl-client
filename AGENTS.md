# Agent Instructions for typescript-wsdl-client

## First steps

Read `.github/copilot-instructions.md` for the authoritative, detailed instructions covering commit format, catalog co-location, CLI conventions, testing, changelog rules, and documentation conventions. Read `.github/instructions/` for file-pattern-specific rules (e.g., Markdown formatting for all `**/*.md` files). These two sources govern all agent behavior in this repository.

For routine tasks such as bug fixes and small feature additions, the summary and must-follow rules below are sufficient. For architectural changes, read the full copilot-instructions.md file and the project docs referenced there.

## Summary

This is a TypeScript code generator that transforms WSDL/XSD SOAP service definitions into typed SOAP clients, OpenAPI 3.1 specs, and Fastify REST gateways. The `pipeline` command runs the full generation stack in one pass. Source is in `src/` with modules for loading, compiling, client generation, OpenAPI generation, gateway generation, app scaffolding, and utilities. The pipeline orchestrator is `src/pipeline.ts`. Select operations for NDJSON or JSON-array delivery using legacy `--stream-config` or the [checked stream configuration](docs/checked-streaming.md).

## Must-follow rules

- Keep product validation independent of exploratory research; follow [ADR-004](docs/decisions/004-product-research-boundary.md).
- Preserve product regressions and independent reference evidence regardless of research-derived filenames.
- Run `npm run research:ci` for research changes; it is separate from product CI and release gates.
- Keep current consumer contracts in `docs/` and exploratory or historical handoff material in `research/docs/`.
- Keep package contents explicit, retain generation resources, and review actual package-size changes by consumer value.
- Do not edit files in generated output directories (client/, gateway/, app/); regenerate from WSDL sources instead.
- Keep verification scratch in the owned `tmp/verification/run-*` directory. At task closeout, remove task-owned scratch, disposable verification output and checkouts, and local caches that no active run needs. Preserve requested deliverables and durable evidence at their designated locations. Verify that `tmp/` remains present and empty when no retained paths are needed. Follow [temporary output and recovery](docs/testing.md#temporary-output-and-recovery).
- Keep consumer output paths explicit and use the git-ignored `.generated/` convention in public examples.
- All generated output must be deterministic and diff-friendly with sorted types, paths, and schemas.
- Run `npm run smoke:pipeline` to verify changes end-to-end.
- Verify affected WSDL capabilities using a focused stage, standalone conformance, or the full delivery suite.
- Commit messages must follow: `Version: <release-target-version> <type>(scope): <imperative summary>`.
- Post-release patch work uses the next patch version in commit titles even before `package.json` is bumped.
- A commit title target such as `Version: 0.30.3` does not mean the repository is ready for tag `v0.30.3`.
- Every release commit must include the matching `docs/releases/vX.Y.Z.md` release notes file.
- Prepare release notes and metadata before pushing the release PR; tag the validated merged state of main.
- Verify the GitHub draft and uploaded artifacts, then complete [release cleanup](docs/releases/README.md#release-cleanup) before handing off. The maintainer publishes manually.
- Agents never access GitHub through a browser or publish releases or packages.
- Node.js >= 24.0.0, ESM-only (`type: "module"`), strict TypeScript.
- Repository-owned new implementation, tests, research and automation use strict TypeScript; run `npm run check:toolchain`.
- Python and other language toolchains require an explicit scope decision; #239 removed its legacy allowance.
- GitHub CI must test Node 24 as the supported floor and Node 26 as the current line.
- GitHub runs delivery and compatibility checks. Run release preflight once on the final release tree before committing and tagging.
- CLI flag names are lowercase kebab-case such as `--wsdl-source` and `--init-app`.
- On release, verify `package.json` and `package-lock.json` match the target version before tagging.
- Update the version before preflight; preflight verifies versions and must not update tracked files.
- Release preflight already runs full CI and packages the agent skill artifact; do not run those final gates separately.
- Commit the validated tree after preflight. Tag the merged main commit only after its tree and CI are verified.
- If another command changes tracked release files after preflight, rerun preflight on the new final candidate before committing.
- A rejected tagged candidate is permanently consumed; never move, delete for reuse, or force-update its release tag.
- Use the `Abandon Release Candidate` workflow to create `abandoned/vX.Y.Z` on the same commit and preserve the rejected draft.
- Draft and package workflows must reject matching abandonment markers before packaging or publication capability is available.
- On release, bump hardcoded dep versions in `src/app/generateApp.ts` (`generatePackageJson`) to current latest.
- The `soap` package is a runtime dependency; `wsdl-tsc` is a devDependency for consumers.
- IDE MCP tools such as PhpStorm MCP are optional accelerators for indexed search, inspections, run configurations, and symbol refactors; keep terminal commands as the portable fallback for contributors without the local IDE setup.
- Store 1.0 implementation plans under `docs/roadmap/` as `v1.0-<topic>.md`; never create `docs/superpowers/`.

## Testing

Run `npm test` for all Vitest tests, including unit, snapshot, integration, and conformance suites. Run `npm run ci` for the complete CI pipeline. When modifying generators, update snapshot baselines with `npx vitest run test/snapshot -u` and review the diff. See `test/integration/gateway-routes.test.ts` for the mock client reference implementation.

Choose the smallest meaningful check by behavior and cost: unit-folder tests can compile or load large inputs, and snapshots are an assertion technique. Vitest runs `fast` before bounded `workflows`; installed and independent reference checks qualify boundaries mocks do not. See [Test Architecture](docs/testing.md#test-architecture) for configuration and [Running Tests](docs/testing.md#running-tests) for focused/debug commands.

Use `npm test -- <path>` for targeted work and `npm run ci` for delivery. The delivery runner owns the checkout's `dist/` until it restores the previous build. Follow the [testing guide](docs/testing.md#temporary-output-and-recovery) to recover a named run after owned processes have stopped.

Keep broad Vitest discovery in `npm test` and `npm run ci`. GitHub runs `npm run ci` on Linux with Node 24 and `npm run ci:platform` for representative compatibility. Use `npm run ci:platform:full` when the complete installed matrix is needed on a given platform.

Assign one owner to final verification. Inspect script coverage before launching overlapping gates. Use full CI as capability evidence when it already runs the affected suite. Run explicitly required separate checks in sequence. Follow [verification orchestration](docs/testing.md#verification-orchestration) for evidence ownership, deadlines and failure classification.

Follow the [pre-push sequence](docs/testing.md#before-opening-or-updating-a-pull-request) before opening or updating a PR, including a draft.

Allow at least six minutes for full conformance on Windows. Use the narrowest capability stage while developing. Follow the [Windows setup](docs/testing.md#windows-and-certificates) for scoped elevation on affected controls and verified certificate trust. Consumer-project agents should use the [consumer testing guidance](docs/testing.md#for-consumer-projects).

## Must-read documents

- `.github/copilot-instructions.md`: authoritative agent instructions with full detail
- `.github/instructions/`: file-pattern-specific rules (read before editing matching files)
- `README.md`: project overview, installation, quick start, CLI command reference
- `CONTRIBUTING.md`: development setup, project structure, testing strategy

## References

- `docs/README.md`: canonical documentation index
- `examples/minimal/weather.wsdl`: test fixture used by all smoke tests and Vitest suites
- `CHANGELOG.md`: version history and breaking change entries
