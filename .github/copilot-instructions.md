# Copilot Instructions for This Repository

> Guide for GitHub Copilot Chat when working on `techspokes/typescript-wsdl-client`.

## Repository Information
- Owner/Repo: techspokes / typescript-wsdl-client
- Package: `@techspokes/typescript-wsdl-client`
- Default Branch: `main`
- CLI Binary: `wsdl-tsc` (`dist/cli.js`)
- Engine: Node.js >= 20
- Issues: https://github.com/techspokes/typescript-wsdl-client/issues
- Discussions: https://github.com/techspokes/typescript-wsdl-client/discussions
- CI Workflow: `.github/workflows/ci.yml`
- Version Policy: always read `"version"` from `package.json`; do not duplicate it here.

Machine-readable metadata (parse first for GitHub MCP operations):

```yaml
# repo-metadata
owner: techspokes
repo: typescript-wsdl-client
package: '@techspokes/typescript-wsdl-client'
# version: always read from package.json
defaultBranch: main
issues: 'https://github.com/techspokes/typescript-wsdl-client/issues'
discussions: 'https://github.com/techspokes/typescript-wsdl-client/discussions'
ciWorkflow: 'ci.yml'
cliBinary: wsdl-tsc
node: '>=20'
```

### GitHub MCP Usage Guidelines (minimal)
1. Use `owner` / `repo` from YAML; read `package.json` each time you need the version (no caching).
2. Commit/PR titles: prefix with `Version: <version>` (see commit format rules).
3. Default PR base: `main` unless explicitly overridden.
4. Prefer repo-scoped queries; avoid broad GitHub-wide searches for issues/PRs.
5. For releases, read `CHANGELOG.md` and `package.json` and follow the release workflow below.
6. Don't remote-fetch metadata already present in this file or `package.json`.
7. For any code or docs change, propose (and on confirmation add) a concise bullet under `## [Unreleased]` in `CHANGELOG.md` (omit the `Version: <'>` prefix).

## Project Context (what agents should know)
- Purpose: generate fully-typed TypeScript SOAP clients from WSDL/XSD, with optional OpenAPI 3.1 and Fastify REST gateway.
- Key features:
  - Deterministic JSON / SOAP metadata; attribute + element flattening.
  - `$value` convention for text content; inheritance resolution for complex/simple content.
  - Choice handling strategies; WS-Policy hints; string-first primitive mapping by default.
  - Catalog introspection via `catalog.json` reused by client/OpenAPI/gateway/pipeline.
- Primary users: TypeScript developers integrating with SOAP services.
- Maintainer: Serge Liatko ([@sergeliatko](https://github.com/sergeliatko)).
- Vendor: TechSpokes (https://www.techspokes.com).
- Runtime/tooling:
  - Node.js `>= 20.0.0` (see `engines.node` in `package.json`).
  - TypeScript strict, ES2022, `type: "module"` (ESM/NodeNext style).
  - CLI binary: `wsdl-tsc` (entry: `dist/cli.js`), orchestrating the pipeline.
- Generated artifacts:
  - Client: `client.ts`, `types.ts`, `utils.ts`, co-located `catalog.json`.
  - OpenAPI: 3.1 spec (`.json`/`.yaml`) mirroring the TS model.
  - Gateway: Fastify route handlers with SOAP client calls, envelope wrapping, and error handling (`plugin.ts`, `routes.ts`, `routes/`, `schemas.ts`, `schemas/`, `runtime.ts`, `_typecheck.ts`).
- Catalog co-location (important for reasoning about paths):
  - `compile`: explicit `--catalog-file` (no default).
  - `client`: defaults to `{client-dir}/catalog.json`.
  - `openapi`: defaults to `{dir-of-openapi-file}/catalog.json`.
  - `pipeline`: cascade lookup: `{client-dir}` / `{openapi-dir}` / `{gateway-dir}` / `tmp/`.
- Scratchpads: non-project notes may live under ad-hoc folders; treat them as scratchpads only, not as source of truth for behavior or docs.

## CLI and Commands (align with README)
- CLI entry: `wsdl-tsc` (via `npx wsdl-tsc` in README examples).
- Commands (6 total; keep terminology consistent with README):
  - `compile`: WSDL / `catalog.json` only (no TS code).
  - `client`: WSDL or catalog / TS client (`client.ts`, `types.ts`, `utils.ts`, `catalog.json`).
  - `openapi`: WSDL or catalog / OpenAPI 3.1 spec.
  - `gateway`: OpenAPI / Fastify REST gateway (route handlers, schemas, runtime, type-check fixture).
  - `app`: standalone Fastify application scaffold wiring the gateway plugin.
  - `pipeline`: one-shot compile / client / OpenAPI / gateway (full stack).
- When changing CLI behavior, keep flag names consistent with README (lowercase, hyphenated, e.g. `--wsdl-source`, `--openapi-file`).
- Update CLI sections in `README.md` (commands, examples, tables) and any relevant smoke/CI scripts in `package.json`.
- Ensure catalog co-location behavior remains aligned with README, or update docs and scripts together.

## Scripts and Local Tooling (package.json as source of truth)

### Node and CLI entry
- Node engine: read from `engines.node` in `package.json` (currently `>=20.0.0`).
- CLI binary mapping: read from `bin.wsdl-tsc` in `package.json` (currently `dist/cli.js`).

### Scripts
- Do not hardcode script lists here. Inspect `"scripts"` in `package.json` for `build`, `typecheck`, `ci`, smoke scripts, and others.
- Infer behavior from script names and values instead of maintaining a separate canonical list.
- `build`: compile TypeScript to `dist/`.
- `typecheck`: run `tsc --noEmit`.
- `clean*`: remove `dist`/`tmp` or other temporary artifacts.
- `dev` / `watch`: run the CLI in dev/watch mode via `tsx`.
- `smoke:*`: end-to-end CLI checks (compile, client, openapi, gateway, pipeline) using `examples/minimal/weather.wsdl`.
- `ci`: combine build/typecheck and at least one pipeline-style smoke test.

### Terminal commands
- Use one command per line, no `&&` chaining (PowerShell-friendly).
- Prefer `npm run <script>` and `npx wsdl-tsc` patterns consistent with README and `package.json`.

## How to Propose and Shape Changes
- Prefer small, focused diffs: one feature or bugfix per change.
- Update CLI help output and `README.md` when user-visible CLI behavior changes.
- Keep TypeScript strict and consistent with existing `tsconfig.json`.
- Maintain ESM/NodeNext style and `type: "module"` conventions.
- Avoid new dependencies unless clearly justified; prefer existing tools (`tsc`, `tsx`, `rimraf`).
- Preserve string-first primitive mapping defaults unless a flag explicitly requests another mapping (e.g. `--client-int64-as number`).
- Keep JSON / SOAP mapping and OpenAPI structure deterministic and stable for diff-friendly regeneration.

## Commit Message Format (required)
- Always:
  - Read current version from `package.json`.
  - Start commit titles with `Version: <version>`.
- Format (Conventional Commits style):

  ```
  Version: <version> <type>(<optional-scope>): <imperative summary>
  ```

- Rules:
  - Treat `"version"` in `package.json` as read-only in normal work; releases handle bumps.
  - Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, etc.
  - Title <= 72 characters.
  - Place rationale, risks, and references (e.g. `Closes #123`) in the body.
- Examples:
  - `Version: 0.8.0 feat(cli): add --flag to control attribute key`
  - `Version: 0.8.0 fix(emitter): stabilize operation order in meta`
  - `Version: 0.8.0 docs: clarify NodeNext setup and imports`

## CHANGELOG Rules (align with current file)
- Keep `## [Unreleased]` at the top; new entries go there.
- Style: one-line entries, no file lists, no vague phrasing.
- For each code/docs change, ensure a bullet under `## [Unreleased]` before concluding work.
- In interactive contexts, ask for confirmation to append a bullet derived from the commit title (strip `Version: <'>`).
- In non-interactive contexts (e.g. CI), append the bullet automatically.

### Release workflow
1. Read current version from `package.json`.
2. Determine semver bump (patch/minor/major) based on `Unreleased` changes.
3. Update `"version"` in `package.json` to the new release version.
4. In `CHANGELOG.md`: promote `## [Unreleased]` to `## [<version>] - YYYY-MM-DD` (today's date) and start a fresh, empty `## [Unreleased]` section at the top.

### Updating the CHANGELOG
- Propose a single bullet for `Unreleased` based on the described change.
- Match the tone and precision of existing entries (e.g. `feat(cli):`, `fix(openapi):`).

## What to Generate (for Copilot Chat)

### Creating a commit message
1. Read the version from `package.json`.
2. Use the `Version: <version> <type>(scope): summary` format.
3. Provide an optional body with context, risks, or references.

### Updating CHANGELOG.md
- Draft a single bullet for `## [Unreleased]` derived from the commit summary (no `Version:` prefix).
- Ask for confirmation before editing the file in interactive contexts.

### Preparing a release
- Bump the version in `package.json`.
- Promote `Unreleased` to a dated section `## [x.y.z] - YYYY-MM-DD`.
- Insert a new empty `## [Unreleased]` at the top.

### Editing code that affects CLI, OpenAPI, or gateway
- Keep TypeScript and NodeNext settings intact.
- Align flags, examples, and terminology with the current README and docs.
- Ensure catalog co-location behavior matches the docs.

## Don'ts
- Don't use `version bump` phrasing in commit messages or changelog entries.
- Don't alter the project version in regular feature/fix commits (only in release steps).
- Don't introduce breaking CLI flags or behavior without updating README CLI docs, examples, and relevant smoke/CI scripts in `package.json`.
- Don't treat scratchpad or non-project docs as authoritative for behavior; use README, CHANGELOG, `package.json`, and `src/` instead.

## Documentation Conventions
- Prefer pointers to the authoritative source over duplicating indexes across files.
- The root README.md Documentation table is the single source of truth for the docs/ directory listing.
- When adding, removing, or renaming documentation files, update only the root README.md Documentation table; other files should reference it rather than maintaining their own copies.
- Each folder may have its own README.md (folder index) and AGENTS.md (agent instructions) per their respective specifications; these should point upward rather than duplicating content.
- Instruction file hierarchy: this file (copilot-instructions.md) is the authoritative source; AGENTS.md is the tool-agnostic buffer pointing here; vendor-specific files (CLAUDE.md, llms.txt) point to AGENTS.md and add only tool-specific details.

## Quick References
- Node: see `engines.node` in `package.json`.
- CLI: `wsdl-tsc` (entry `dist/cli.js`; used via `npx wsdl-tsc`).
- Scripts: inspect `"scripts"` in `package.json` for `build`, `typecheck`, `ci`, and smoke tests.
- Docs: `README.md` (gateway overview and quick start), `docs/README.md` (documentation index), `CONTRIBUTING.md` (dev workflow), `ROADMAP.md` (priorities), `CHANGELOG.md` (version history), `SECURITY.md` (reporting).
