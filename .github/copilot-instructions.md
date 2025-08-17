# Copilot Instructions for This Repository

## Project context (read this first)
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
**Always prefix the title with the current version** from `package.json`:

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
- For each change:
  1) If interactive (local commit), **ask for confirmation** to append a concise bullet to **Unreleased** based on the commit title (without the `Version: <…>` prefix).
  2) If non-interactive (e.g., CI), append automatically.
- On release: promote **Unreleased** → `## [<version>] – YYYY-MM-DD`, then start a fresh **Unreleased**.

**Entry style**
- Aim for one-line bullets that mirror the commit title’s core intent.
- Avoid file lists; avoid vague phrasing like “update code”.


## What to generate (guidance for Copilot Chat & edits)
- When asked to **create a commit message**:
  1) Read version from `package.json`.
  2) Start title with `Version: <version>`.
  3) Produce a Conventional Commit style summary + (optional) body with context/risks/refs.
- When asked to **update the CHANGELOG**:
  - Propose a single bullet under **Unreleased** derived from the commit title (minus the version prefix), then request confirmation to insert it.
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
