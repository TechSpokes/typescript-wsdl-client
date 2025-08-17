# Contributing

Thanks for your interest in improving typescript-wsdl-client!

- Node.js: 20+ (LTS) — repo is ESM (NodeNext)
- Language: TypeScript (strict), target ES2022

## Getting started

1. Fork and clone the repo
2. Install deps
   - `npm ci`
3. Build and typecheck
   - `npm run build`
   - `npm run typecheck`
4. Optional smoke
   - `npm run smoke` (prints CLI help)

## Development workflow

- Edit src/**/*; build to dist/ with `npm run build`.
- Run the CLI directly with tsx:
  - `npx tsx src/cli.ts --help`
  - Or run against a local WSDL path/URL and `--out ./tmp`.
- Keep changes focused; prefer small PRs with clear motivation.

## Commit message format

Always prefix the title with the current version from package.json.
Use Conventional Commit style (type: summary, optional scope). Title ≤ 72 chars.
See .github/copilot-instructions.md for full details and examples.

## Commit and PR guidelines

- Include a minimal WSDL/XSD fixture (or link to a gist) that reproduces a bug.
- Add comments where parsing/merging logic is non-obvious.
- Update README/CLI help for user-visible changes.
- Mention breaking changes explicitly.

## Testing ideas

- A quick smoke test is often enough: run the CLI against a tiny WSDL and ensure generated TS compiles with `tsc --noEmit`.
- When adding new XSD features, include fixtures that demonstrate the shape.

## Security

Please report potential vulnerabilities privately — see SECURITY.md.

## Code of Conduct

Participating in this project means you agree to uphold our Code of Conduct (see CODE_OF_CONDUCT.md).
