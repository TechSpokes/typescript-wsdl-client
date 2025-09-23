# Copilot Instructions for This Repository

> This file guides GitHub Copilot Chat on how to interact with the `typescript-wsdl-client` codebase, providing project context, conventions, and best practices.

## Repository Information
- Owner/Repo: techspokes / typescript-wsdl-client
- Package: `@techspokes/typescript-wsdl-client`
- Default Branch: main
- CLI Binary: `wsdl-tsc` (dist/cli.js)
- Engine: Node.js ≥ 20
- Issue Tracker: https://github.com/techspokes/typescript-wsdl-client/issues
- Discussions: https://github.com/techspokes/typescript-wsdl-client/discussions
- CI: `.github/workflows/ci.yml`
- Version Policy: Always read current version from `package.json`; never duplicate it here.

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

### GitHub MCP Usage Guidelines (minimal set)
1. Use `owner`/`repo` from YAML; read `package.json` each time you need the version (no caching).
2. Commit / PR titles: prefix with `Version: <version>` (see commit format section below).
3. Default PR base: `main` unless explicitly overridden.
4. Prefer repo-scoped queries; avoid broad searches when listing issues/PRs.
5. Release prep: read `CHANGELOG.md` + `package.json`; apply release rules section below.
6. Don’t remote-fetch metadata already present in YAML (owner/repo/branch/etc.).
7. For any code or docs change, propose (and on confirmation add) a concise bullet under `## [Unreleased]` (exclude the version prefix).


## Project context - Make sure to understand:
- Purpose: Generate fully-typed TypeScript SOAP clients from WSDL/XSD schemas, addressing common SOAP pain points.
- Key features: end-to-end type safety, deterministic JSON ⇄ SOAP metadata, flexible primitive mapping, automatic flattening of complex/simple content inheritance, choice handling strategies, WS-Policy security hints, pluggable ESM/CJS imports.
- Primary users: TypeScript developers needing SOAP clients.
- Maintainer: Serge Liatko (@sergeliatko). 
- Vendor: TechSpokes (https://www.techspokes.com).
- Runtime/tooling: **Node.js ≥ 20**, **TypeScript (strict)**, **ES2022**, **ESM/NodeNext**. 
- CLI binary: `wsdl-tsc` (exposed from `dist/cli.js`). Build artifacts live in `dist/`.
- Useful scripts:
  - `npm run build` → compile TS
  - `npm run typecheck` → `tsc --noEmit`
  - `npm run smoke` → CLI help
  - `npm run smoke:gen` → generate sample client + compile check
  - `npm run ci` → build + typecheck + both smokes
- When suggesting commands in terminal, do so a command-by-command basis, not as a single block (no && or ;). This helps users understand each step and allows them to run commands individually if needed.
- Docs to consult when answering or editing code:
  - **README.md** (CLI, workflow, mapping defaults) 
  - **CONTRIBUTING.md** (dev workflow & expectations)
  - **ROADMAP.md** (near-term priorities; don’t drift)
  - **CHANGELOG.md** (Keep a Changelog style with **Unreleased**)
  - **SECURITY.md** (Node 20+, private reporting)


## How to propose changes
- Prefer **scoped and focused** diffs. Update CLI help/README when user-visible behavior changes.
- Align with current emit/runtime conventions (ESM/NodeNext, strict TS).
- Preserve “string-first” primitive mapping defaults unless a flag explicitly opts out. (Examples in README.)


## Commit message format (required)
- **Always include the current version** from `package.json` in the title.
- **Always prefix the title with `Version: <version>`**.
- Check the CHANGELOG.md for the unreleased or current version changes for additional context (when available).
- When multiple items are changed in a single commit, provide a single summary that captures the essence of the changes.

```
Version: <version> <type>(<optional-scope>): <imperative summary>
```

- The version is **read-only**: never change it in commits (releases handle bumps).
- Conventional Commit `type` examples: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.
- Title ≤ 72 chars; put rationale/risks/refs (e.g., `Closes #123`) in the body.

**Examples**
- `Version: 0.1.6 feat(cli): add --flag to control attribute key`
- `Version: 0.1.6 fix(emitter): stabilize operation order in meta`
- `Version: 0.1.6 docs: clarify NodeNext setup and imports`

> The current project version source is `package.json` (`"version": "…"`).


## CHANGELOG rules
- Keep an **“Unreleased”** section at the top. New entries go there.
- All file modifications performed during a Copilot session or in code edits must be captured as bullets under **Unreleased** before concluding.
- For each change:
   1) If interactive (local commit), **ask for confirmation** to append a concise bullet to **Unreleased** based on the commit title (without the `Version: <…>` prefix).
   2) If non-interactive (e.g., CI), append automatically.
- On release:
   1) Read the current version from `package.json`.
   2) Decide the semver bump (patch/minor/major).
    3) Update the `"version"` field in `package.json` to the new release version.
   4) Promote **Unreleased** → `## [<version>] – YYYY-MM-DD` (today’s date) in CHANGELOG.md.
   5) Start a fresh **Unreleased** section at the top of CHANGELOG.md.

## What to generate (guidance for Copilot Chat & edits)
- When asked to **create a commit message**:
  1) Read version from `package.json`.
  2) Start title with `Version: <version>`.
  3) Produce a Conventional Commit style summary + (optional) body with context/risks/refs.
- When asked to **update the CHANGELOG**:
  - Propose a single bullet under **Unreleased** derived from the commit title (minus the version prefix), then request confirmation to insert it.
- When asked to **prepare a release**:
  - Bump the version in `package.json`, 
  - Promote **Unreleased** to a new version header with today’s date (`## [x.y.z] – YYYY-MM-DD`), 
  - Then reset an empty **Unreleased** at the top.
- When editing code:
  - Keep TypeScript strict and NodeNext module settings intact.
  - If changing CLI behavior or flags, update README’s CLI section/examples accordingly. 
  - Prefer minimal dependencies; stick to the existing toolchain (`tsc`, `tsx`, `rimraf`).


## Don’ts
- Don’t include “version bump” phrasing anywhere.
- Don’t alter the project version in commits.
- Don’t introduce breaking CLI flags without updating docs and smoke scripts. 


## Quick references

- Build: `npm run build` · Typecheck: `npm run typecheck` · Smoke: `npm run smoke` / `npm run smoke:gen`
- Readme (CLI & workflow details): see **README.md**.
- Contributing (dev workflow): see **CONTRIBUTING.md**.
- Changelog (format & Unreleased): see **CHANGELOG.md**.
