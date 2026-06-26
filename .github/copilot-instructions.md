# Copilot Instructions for This Repository

> Guide for GitHub Copilot Chat when working on `techspokes/typescript-wsdl-client`.

## First interaction requirement

Before making any changes, read the file-pattern-specific instructions in `.github/instructions/`. These rules apply automatically to matching files and override general conventions. Currently: `markdown.instructions.md` governs all `**/*.md` files.

## Repository Information

- Owner/Repo: techspokes / typescript-wsdl-client
- Package: `@techspokes/typescript-wsdl-client`
- Default Branch: `main`
- CLI Binary: `wsdl-tsc` (`dist/cli.js`)
- Engine: Node.js >= 24
- Issues: https://github.com/techspokes/typescript-wsdl-client/issues
- Discussions: https://github.com/techspokes/typescript-wsdl-client/discussions
- CI Workflow: `.github/workflows/ci.yml`
- Version Policy: read `"version"` from `package.json` and derive the release target before commits or releases.

Machine-readable metadata (parse first for GitHub MCP operations):

```yaml
# repo-metadata
owner: techspokes
repo: typescript-wsdl-client
package: '@techspokes/typescript-wsdl-client'
# package version: always read from package.json
# release target: derive from changelog/latest release or explicit user target
defaultBranch: main
issues: 'https://github.com/techspokes/typescript-wsdl-client/issues'
discussions: 'https://github.com/techspokes/typescript-wsdl-client/discussions'
ciWorkflow: 'ci.yml'
cliBinary: wsdl-tsc
node: '>=24'
```

### GitHub MCP Usage Guidelines (minimal)

1. Use `owner` / `repo` from YAML; read `package.json` when you need the package version.
2. Commit/PR titles: prefix with `Version: <release-target-version>` (see commit format rules).
3. Default PR base: `main` unless explicitly overridden.
4. Prefer repo-scoped queries; avoid broad GitHub-wide searches for issues/PRs.
5. For releases, read `CHANGELOG.md`, `package.json`, and the matching `docs/releases/vX.Y.Z.md` release notes when present; follow the release workflow below.
6. Don't remote-fetch metadata already present in this file or `package.json`.
7. For any code or docs change, propose (and on confirmation add) a concise bullet under `## [Unreleased]` in `CHANGELOG.md` (omit the `Version: <'>` prefix).

## Project Context

Purpose: generate fully-typed TypeScript SOAP clients from WSDL/XSD, with optional OpenAPI 3.1 and Fastify REST gateway.

Key features: deterministic JSON/SOAP metadata with attribute and element flattening; `$value` convention for text content; inheritance resolution for complex and simple content; choice handling strategies; WS-Policy hints; string-first primitive mapping by default; catalog introspection via `catalog.json` reused across all generation stages.

Primary users: TypeScript developers integrating with SOAP services.

Maintainer: Serge Liatko ([@sergeliatko](https://github.com/sergeliatko)). Vendor: TechSpokes (https://www.techspokes.com).

### Runtime and tooling

- Node.js `>= 24.0.0` (see `engines.node` in `package.json`).
- TypeScript strict, ES2022, `type: "module"` (ESM/NodeNext style).
- CLI binary: `wsdl-tsc` (entry: `dist/cli.js`), orchestrating the pipeline.
- The `soap` package is a runtime dependency for consumers. The `wsdl-tsc` CLI itself is a devDependency in consumer projects.

### Generated artifacts

- Client: `client.ts`, `types.ts`, `utils.ts`, `operations.ts`, co-located `catalog.json`.
- OpenAPI: 3.1 spec (`.json`/`.yaml`) mirroring the TS model.
- Gateway: Fastify route handlers with SOAP client calls, envelope wrapping, error handling, and runtime array unwrap (`plugin.ts`, `routes.ts`, `routes/`, `schemas.ts`, `schemas/`, `runtime.ts`, `_typecheck.ts`).

### Catalog co-location

Important for reasoning about paths:
- `compile`: explicit `--catalog-file` (no default).
- `client`: defaults to `{client-dir}/catalog.json`.
- `openapi`: defaults to `{dir-of-openapi-file}/catalog.json`.
- `pipeline`: cascade lookup: `{client-dir}` / `{openapi-dir}` / `{gateway-dir}` / `tmp/`.

Scratchpads: non-project notes may live under ad-hoc folders; treat them as scratchpads only, not as source of truth for behavior or docs.

### Temporary workspace layout

Repository-owned automation writes disposable output under classified `tmp/` subfolders. Keep smoke output under `tmp/smoke/`, npm cache under `tmp/cache/npm/`, release preflight regenerated examples under `tmp/preflight/examples/`, conformance mini-projects under `tmp/conformance/`, and generated-test integration spikes under `tmp/test-generation/`.

Do not move public CLI defaults only to satisfy this internal layout. The CLI may still use simple `tmp/...` defaults and examples when that is clearer for users.

### Project evolution

The project evolved from a simple WSDL parser (v0.1.x) to a full generation pipeline (v0.9.x through v0.10.x). The gateway generator reads OpenAPI specs, not the catalog directly, to produce Fastify route handlers. Since v0.10.0 the gateway has end-to-end type safety from WSDL definitions through to HTTP response types. Since v0.11.0 the project includes a full Vitest test suite, a typed operations interface for mocking, and runtime ArrayOf* unwrap.

## Project Structure

Source is in `src/` with these modules: `loader/` (WSDL fetching and parsing), `compiler/` (XSD to catalog compilation), `client/` (TypeScript client and operations interface generation), `openapi/` (OpenAPI 3.1 spec generation), `gateway/` (Fastify route handler and runtime generation), `app/` (standalone application scaffold), `util/` (shared helpers, CLI builder, errors), `xsd/` (XSD type definitions), and `types/` (shared TypeScript type definitions).

The pipeline orchestrator is `src/pipeline.ts`. Configuration defaults are in `src/config.ts`.

## CLI and Commands (align with README)

CLI entry: `wsdl-tsc` (via `npx wsdl-tsc` in README examples).

Commands (6 total; keep terminology consistent with README):
- `compile`: WSDL / `catalog.json` only (no TS code).
- `client`: WSDL or catalog / TS client (`client.ts`, `types.ts`, `utils.ts`, `operations.ts`, `catalog.json`).
- `openapi`: WSDL or catalog / OpenAPI 3.1 spec.
- `gateway`: OpenAPI / Fastify REST gateway (route handlers, schemas, runtime, type-check fixture).
- `app`: standalone Fastify application scaffold wiring the gateway plugin.
- `pipeline`: one-shot compile / client / OpenAPI / gateway (full stack).

When changing CLI behavior, keep flag names consistent with README (lowercase, hyphenated, e.g. `--wsdl-source`, `--openapi-file`). Update CLI sections in `README.md` (commands, examples, tables) and any relevant smoke/CI scripts in `package.json`. Ensure catalog co-location behavior remains aligned with README, or update docs and scripts together.

## Testing

The project uses Vitest for three layers of testing: unit tests (pure functions), snapshot tests (generated output baselines), and integration tests (gateway routes via Fastify inject with mock clients).

### Test commands

Inspect `"scripts"` in `package.json` for the full list. Key commands:
- `npm test`: all Vitest tests.
- `npm run test:unit`: unit tests only.
- `npm run test:snap`: snapshot tests only.
- `npm run test:integration`: integration tests only.
- `npm run test:conformance`: focused WSDL capability conformance tests.
- `npm run test:watch`: watch mode for development.
- `npm run ci`: build, typecheck, all Vitest tests, and smoke pipeline.

### Mock client pattern

Integration tests use a mock client implementing the `{Service}Operations` interface from the generated `operations.ts`. The mock returns SOAP wrapper-shaped data matching the real client structure. The generated `unwrapArrayWrappers()` function handles conversion to flat arrays for serialization. See `test/integration/gateway-routes.test.ts` for the reference implementation.

### Snapshot updates

When modifying generators, run snapshot tests and update baselines with `npx vitest run test/snapshot -u`. Always review the diff before committing updated snapshots.

### Test fixture

All tests and smoke scripts use `examples/minimal/weather.wsdl` as the canonical test fixture.

### Fixture and file organization

Use `docs/file-naming-and-path-organization.md` for reusable fixture paths and other repository file naming decisions. Prefer committed XML fixture files over inline WSDL or XSD strings when a test represents a reusable conformance case.

### Capability support matrix

When changing `test/conformance/registry.ts`, run `npm run docs:support-matrix` to regenerate the owned table in `docs/supported-patterns.md`. Run `npm run docs:support-matrix:check` or `npm run docs:validate` before finishing documentation work that changes capability rows.

Run `npm run test:conformance` when changing conformance fixtures, registry rows, runner helpers, WSDL capability support claims, or generated client/OpenAPI/gateway/app/test behavior for capability rows. `npm test` and `npm run ci` must keep broad Vitest discovery so `test/conformance` stays covered. Release preflight verifies those script contracts with its `conformance-gate` step; do not add a duplicate full conformance run there unless CI stops running broad Vitest discovery.

## Key Conventions

- String-first primitive mapping: `xs:long` and `xs:decimal` default to `string` to prevent precision loss.
- `$value` convention for XML text content alongside attributes.
- Flattened attributes as peer properties with no nested wrappers.
- `catalog.json` is the intermediate compiled WSDL representation, reused across all generation stages.
- URN format for gateway schemas: `urn:services:{service}:{version}:schemas:{models|operations}:{slug}`.
- All generated output must be deterministic and diff-friendly with sorted types, paths, and schemas.

## Scripts and Local Tooling (package.json as source of truth)

### Node and CLI entry

- Node engine: read from `engines.node` in `package.json` (currently `>=24.0.0`).
- Node CI policy: test the supported floor (`24`) and the current line (`26`); release workflows run on the supported floor.
- CLI binary mapping: read from `bin.wsdl-tsc` in `package.json` (currently `dist/cli.js`).

### Scripts

Do not hardcode script lists here. Inspect `"scripts"` in `package.json` for `build`, `typecheck`, `ci`, smoke scripts, and others. Infer behavior from script names and values instead of maintaining a separate canonical list.

- `build`: compile TypeScript to `dist/`.
- `typecheck`: run `tsc --noEmit`.
- `clean*`: remove `dist`/`tmp` or other temporary artifacts.
- `dev` / `watch`: run the CLI in dev/watch mode via `tsx`.
- `smoke:*`: end-to-end CLI checks (compile, client, openapi, gateway, pipeline) using `examples/minimal/weather.wsdl`.
- `skill:validate`: validate the standalone agent skill release artifact.
- `package:validate`: validate the exact npm package dry-run contents.
- `ci`: combine build, typecheck, agent skill validation, npm package validation, Vitest tests, and smoke pipeline.

### Terminal commands

- Use one command per line, no `&&` chaining (PowerShell-friendly).
- Prefer `npm run <script>` and `npx wsdl-tsc` patterns consistent with README and `package.json`.
- Use `bash` fences for portable command examples in docs and GitHub workflow notes.
- Use `powershell` fences only for commands that are intentionally Windows-specific.
- Prefer `rg` examples for portable file retrieval; write path regexes to tolerate `/` and `\` separators when possible.

### IDE MCP usage

This public repository may be cloned and developed on machines without PhpStorm, JetBrains MCP, or any IDE integration. Treat IDE MCP tools as optional accelerators, not as required project infrastructure.

When an IDE MCP server is available, prefer it for IDE-owned context such as indexed file discovery, inspections, quick fixes, run configurations, formatter settings, and symbol-aware refactors. Use terminal tools for exact command output, custom arguments, environment variables, process control, package scripts, git operations, and portable verification.

Never record local interpreter paths, private database connections, user-specific IDE settings, or machine-specific MCP setup details in reusable repository documentation. Keep shared instructions focused on capability routing and fallbacks that work for other contributors.

### File verification

- When an IDE inspection tool is available, run it on touched Markdown files and source files that embed generated code.
- Before committing, run available IDE file inspections on the files being committed. If an IDE inspection tool is unavailable, say so explicitly and rely on repository-local checks.
- Treat local IDE schema-registration warnings on committed WSDL or XML fixtures as environment configuration issues when repository tests and XML parsing pass. Do not add machine-specific schema mappings to shared docs or project files.
- When IDE inspections are unavailable, use repository-local checks: verify relative Markdown links target concrete files or headings, and keep TypeScript fenced examples syntactically valid as standalone snippets.
- When embedding generated source code inside TypeScript, prefer template helpers, string builders, or packaged template files over large raw template literals that IDEs may inspect as incomplete injected code.

### TypeScript test diagnostics

When PhpStorm reports TypeScript diagnostics on test files, first check whether the file belongs to any `tsconfig.json`. Tests are runtime-validated by Vitest, but they may not be part of the production `tsconfig.json` because that config has `rootDir: "src"`.

Do not add `test/**/*.ts` to the production config or broaden `rootDir` for a single test diagnostic. Add a scoped test `tsconfig.json` near the affected test when the test should be type-owned by the IDE.

When a test imports a repository `.mjs` script, add a matching `.d.mts` declaration next to the script before relying on imported types. This prevents `TS7016` and follow-on `TS7006` implicit-`any` callbacks.

Verify this class of fix with `npx tsc -p <scoped-tsconfig>`, focused Vitest tests, PhpStorm inspections, and a TypeScript service restart when diagnostics appear stale.

## How to Propose and Shape Changes

- Prefer small, focused diffs: one feature or bugfix per change.
- Update CLI help output and `README.md` when user-visible CLI behavior changes.
- Keep TypeScript strict and consistent with existing `tsconfig.json`.
- Maintain ESM/NodeNext style and `type: "module"` conventions.
- Avoid new dependencies unless clearly justified; prefer existing tools (`tsc`, `tsx`, `rimraf`).
- Preserve string-first primitive mapping defaults unless a flag explicitly requests another mapping (e.g. `--client-int64-as number`).
- Keep JSON / SOAP mapping and OpenAPI structure deterministic and stable for diff-friendly regeneration.

## Release Target Version

Determine the release target version before creating a commit title, release commit, PR title, or tag.

Read `package.json` and the latest dated `CHANGELOG.md` release section. The latest released version should match `package.json` immediately after release prep.

Rules:
- For normal post-release patch work, use the next patch after the latest released version.
- For a requested minor release train, use the next minor after the latest released version.
- For a requested major release train, use the next major after the latest released version.
- If the user gives an explicit target version, verify it matches the requested release train.
- Do not use an already released package version for new post-release development commits.
- A commit title target is not release readiness. A commit titled `Version: 0.30.3 ...` may still be normal post-release work while `package.json` remains at `0.30.2`.
- During release prep, `package.json`, `package-lock.json`, changelog, and release notes must match the target.
- Do not push or recommend a release tag until `npm run release:preflight -- v<version>` passes for that exact tag.

Examples:
- After `0.25.2` is released, patch work uses `Version: 0.25.3 ...`.
- After `0.25.2` is released, next-minor work uses `Version: 0.26.0 ...`.

## Commit Message Format (required)

Always derive the release target version and start commit titles with `Version: <release-target-version>`.

Format (Conventional Commits style):

```text
Version: <release-target-version> <type>(<optional-scope>): <imperative summary>
```

Rules:
- Treat `"version"` in `package.json` as read-only in normal work; releases handle bumps.
- Use the release target version in commit titles, not necessarily the current package version.
- Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.
- Title <= 72 characters.
- Place rationale, risks, and references (e.g. `Closes #123`) in the body.

Examples:
- `Version: 0.25.3 fix(emitter): stabilize operation order in meta`
- `Version: 0.25.3 docs: clarify NodeNext setup and imports`
- `Version: 0.26.0 feat(cli): add attribute prefix mode`

## CHANGELOG Rules (align with current file)

- Keep `## [Unreleased]` at the top; new entries go there.
- Style: one-line entries, no file lists, no vague phrasing.
- For each code/docs change, ensure a bullet under `## [Unreleased]` before concluding work.
- In interactive contexts, ask for confirmation to append a bullet derived from the commit title (strip `Version: <release-target-version>`).
- In non-interactive contexts (e.g. CI), append the bullet automatically.

### Release workflow

1. Read current package version from `package.json` and the latest dated release section in `CHANGELOG.md`.
2. Determine the target semver bump based on `Unreleased` changes or the user's explicit target.
3. For patch releases, verify the target is the next patch after the latest released version.
4. For minor releases, verify the target is the next minor after the latest released version and has patch `0`.
5. Update `"version"` in `package.json` and `package-lock.json` to the target release version.
6. Re-read `package.json` and `package-lock.json`; both must match the target before release notes are written.
7. In `CHANGELOG.md`: promote `## [Unreleased]` to `## [<version>] - YYYY-MM-DD` (today's date) and start a fresh, empty `## [Unreleased]` section at the top.
8. Run `npm run maint:deps` to update dependency minimums, lockfile entries, and app scaffold pins.
9. Review the completed changelog section and convert the user-facing changes into `docs/releases/v<version>.md`.
10. Run `npm run skill:validate` to verify the standalone agent skill source, manifest, extracted docs references, packaged links, and deterministic staging output.
11. Run `npm run ci` to verify the release. This runs build, typecheck, agent skill validation, npm package validation, all Vitest tests (unit, snapshot, integration), and the smoke pipeline in one pass. All steps must pass before committing the release.
12. Run `npm run skill:package -- v<version>` and confirm `dist/assets/typescript-wsdl-client-agent-skill-v<version>.zip` exists before drafting the release.
13. Run `npm run release:preflight -- v<version>` and require it to pass before tagging.
14. Commit the version, changelog, dependency, release notes, and agent skill changes before tagging `v<version>`.

### Release notes

Release notes are required for every release tag. The tag-triggered draft release workflow reads `docs/releases/v<version>.md`, validates the source file, and strips only the first H1 line when generating the GitHub release body.

The draft release workflow also packages and uploads `dist/assets/typescript-wsdl-client-agent-skill-v<version>.zip`. Continue refusing to mutate a published non-draft release.

Keep the H1 in repository release files. Do not remove it to avoid a duplicate title on GitHub; the workflow handles that display-only transformation.

Use this structure for release notes:

```markdown
# TypeScript WSDL Client vX.Y.Z

## Short agent-generated subtitle

A concise summary paragraph.

## What This Improves

Explain the practical developer impact of the release. Focus on what becomes easier, safer, clearer, more reliable, or more complete for developers using or maintaining this package.

## Highlights

- User-facing release highlight.

## Upgrade Notes

No special upgrade steps.

## Validation

- CI passed.
- NPM package contents were validated.
- Agent skill artifact was validated and packaged.

## Notes

Release tag: `vX.Y.Z`.
```

The H2 subtitle must be a concise phrase generated from the release content. Put `## What This Improves` before `## Highlights` and describe practical developer impact instead of broad promotional value.

Write `## Validation` as consumer-facing outcomes, not as maintainer command transcripts. The release operator commands remain in this instruction file and in workflow logs; release notes should say what was validated.

Keep `CHANGELOG.md` as the canonical version history. Write release notes as a concise user-facing summary of why the release matters, how to upgrade, and which release checks passed.

### Updating the CHANGELOG

- Propose a single bullet for `Unreleased` based on the described change.
- Match the tone and precision of existing entries (e.g. `feat(cli):`, `fix(openapi):`).

## What to Generate (for Copilot Chat)

### Creating a commit message

1. Read `package.json` and the latest dated `CHANGELOG.md` release section.
2. Determine the release target version for the current work.
3. Use the `Version: <release-target-version> <type>(scope): summary` format.
4. Provide an optional body with context, risks, or references.

### Updating CHANGELOG.md

- Draft a single bullet for `## [Unreleased]` derived from the commit summary (no `Version:` prefix).
- Ask for confirmation before editing the file in interactive contexts.

### Preparing a release

- Determine the target version before editing release files.
- For a minor release, verify the target is the next minor and has patch `0`.
- Bump the version in `package.json` and `package-lock.json` to the target.
- Re-read `package.json` and `package-lock.json` to verify both match the target.
- Promote `Unreleased` to a dated section `## [x.y.z] - YYYY-MM-DD`.
- Insert a new empty `## [Unreleased]` at the top.
- Run `npm run maint:deps` to update dependency minimums and generated app scaffold pins.
- Create `docs/releases/vX.Y.Z.md` from the completed changelog section.
- Run `npm run skill:package -- vX.Y.Z` to create the standalone agent skill ZIP.
- Run `npm run ci` to verify (build, typecheck, agent skill validation, npm package validation, Vitest tests, smoke pipeline).

### Editing code that affects CLI, OpenAPI, or gateway

- Keep TypeScript and NodeNext settings intact.
- Align flags, examples, and terminology with the current README and docs.
- Ensure catalog co-location behavior matches the docs.

## Don'ts

- Don't use `version bump` phrasing in commit messages or changelog entries.
- Don't alter the project version in regular feature/fix commits (only in release steps).
- Don't introduce breaking CLI flags or behavior without updating README CLI docs, examples, and relevant smoke/CI scripts in `package.json`.
- Don't treat scratchpad or non-project docs as authoritative for behavior; use README, CHANGELOG, `package.json`, and `src/` instead.
- Don't edit files in generated output directories (client/, gateway/, app/); regenerate from WSDL sources instead.

## Documentation Conventions

- Prefer pointers to the authoritative source over duplicating indexes across files.
- The root README.md Documentation table is the single source of truth for the docs/ directory listing.
- When adding, removing, or renaming documentation files, update only the root README.md Documentation table; other files should reference it rather than maintaining their own copies.
- Docs updates to sections listed in `agent-skill/reference-manifest.json` automatically affect packaged fluid skill references during validation and release packaging.
- Update evergreen files under `agent-skill/` only when stable agent workflow, architecture guidance, dependency rules, or generated-output safety rules change.
- Each folder may have its own README.md (folder index) and AGENTS.md (agent instructions) per their respective specifications; these should point upward rather than duplicating content.

### Instruction file hierarchy

This file (`.github/copilot-instructions.md`) is the authoritative source for all agent behavior. The `.github/instructions/` directory contains file-pattern-specific rules that augment this file (e.g., Markdown formatting rules for `**/*.md`). `AGENTS.md` is the tool-agnostic buffer pointing here. Vendor-specific files (`CLAUDE.md`, `llms.txt`) point to `AGENTS.md` and add only tool-specific details.

## Quick References

- Node: see `engines.node` in `package.json`.
- CLI: `wsdl-tsc` (entry `dist/cli.js`; used via `npx wsdl-tsc`).
- Scripts: inspect `"scripts"` in `package.json` for `build`, `typecheck`, `ci`, and smoke tests.
- Docs: `README.md` (gateway overview and quick start), `docs/README.md` (documentation index), `CONTRIBUTING.md` (dev workflow), `ROADMAP.md` (priorities), `CHANGELOG.md` (version history), `SECURITY.md` (reporting).
- Test fixture: `examples/minimal/weather.wsdl`.
- Instruction files: `.github/instructions/` for file-pattern-specific rules.
