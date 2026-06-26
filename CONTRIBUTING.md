# Contributing to TypeScript WSDL Client

Thank you for contributing to `typescript-wsdl-client`. This guide covers local setup, coding standards, testing, and release hygiene.

## Quick Start

### Prerequisites

Node.js >= 24 and npm are required.

### Clone and Install

```bash
git clone https://github.com/techspokes/typescript-wsdl-client.git
cd typescript-wsdl-client
npm install
```

### Verify Setup

```bash
npm run ci
```

### Development Commands

- `npm run build`: compile TypeScript to `dist/`
- `npm run typecheck`: validate types without emit
- `npm run docs:validate`: verify Markdown links and TypeScript fenced snippets
- `npm run skill:validate`: validate the standalone agent skill artifact
- `npm run package:validate`: validate npm package dry-run contents
- `npm run dev`: run CLI with tsx
- `npm run watch`: auto-reload during development
- `npm run smoke:pipeline`: full end-to-end generation test

## Community and Discussions

Before contributing code, consider starting a discussion:

- [Feature Ideas](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/ideas) for new features
- [Questions & Help](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/q-a) for questions
- [Show and Tell](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/show-and-tell) for sharing projects
- [General](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/general) for open conversations

## Reporting Issues

Use [GitHub Issues](https://github.com/TechSpokes/typescript-wsdl-client/issues/new) for confirmed bugs with clear reproduction steps. Use [Discussions Q&A](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/q-a) for questions. Follow our [Security Policy](./SECURITY.md) for vulnerabilities.

## Code Contributions

### Types of Contributions Welcome

- Bug fixes
- Documentation updates
- WSDL/XSD parsing improvements
- Code generation improvements
- CLI improvements
- Test coverage for examples and edge cases

### Before You Code

1. Search issues and discussions for existing work.
2. Start small when possible.
3. Start a [discussion](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/ideas) for new features.

### Coding Standards

TypeScript strict mode with ESM and NodeNext modules. Node.js >= 24, no browser-specific code. Follow existing patterns, prefer explicit types, and keep generated output deterministic.

### Commit Message Format

Use the intended release target version in commit titles. After `0.5.1` is released, patch work toward `0.5.2` uses `Version: 0.5.2` even before `package.json` is bumped.

```text
Version: 0.5.2 feat(scope): imperative summary

Optional body with rationale, risks, and references like "Closes #123".
```

Examples:

- `Version: 0.5.2 fix(parser): handle empty choice elements`
- `Version: 0.5.2 docs: add complex inheritance example`
- `Version: 0.6.0 feat(cli): add attribute prefix mode`

### Pull Request Process

1. Fork the repository.
2. Create a branch from `main`, for example `git checkout -b fix/my-bug-fix`.
3. Make focused changes following repository standards.
4. Run `npm run ci`.
5. Update docs if behavior changes.
6. Submit a PR with a clear description and related issue or discussion links.

## Development Guidelines

### Project Structure

```text
src/
  cli.ts              CLI entry point for the wsdl-tsc binary
  config.ts           Compiler options and defaults
  index.ts            Public programmatic API exports
  pipeline.ts         Full generation pipeline orchestrator
  app/                Runnable Fastify app generation
  client/             TypeScript SOAP client generation
  compiler/           WSDL/XSD schema compilation
  gateway/            Fastify REST gateway generation
  loader/             WSDL document fetching and parsing
  openapi/            OpenAPI 3.1 specification generation
  runtime/            Runtime modules and packaged templates embedded in generated output
  test/               Generated Vitest test scaffolding
  types/              Type declarations and stubs
  util/               Shared utilities, config parsers, imports, errors, and runtime source loading
  xsd/                XSD primitive type mapping
```

### Key Principles

- Generate fully typed code.
- The same WSDL must always generate the same output.
- Use ESM, Node.js >= 24, and strict TypeScript.
- Keep the dependency tree lean.
- Keep CLI flags and generated code stable across releases.

### Generated Artifacts

Do not hand-edit generated output in `client/`, `gateway/`, or `app/` directories. Update the generator or input configuration and regenerate output instead.

Large generated source blocks should live in packaged runtime templates, not in unreadable inline strings.

## Testing Strategy

The project uses [Vitest](https://vitest.dev/) for unit, snapshot, and integration tests, plus smoke tests for end-to-end CLI validation.

### Test Commands

- `npm test`: run all Vitest tests
- `npm run test:unit`: unit tests for utilities and parsers
- `npm run test:snap`: snapshot tests for generated code
- `npm run test:integration`: gateway handler integration tests
- `npm run test:conformance`: WSDL capability conformance tests
- `npm run test:watch`: watch mode during development
- `npm run smoke:pipeline`: full CLI smoke test

### Test Structure

```text
test/
  unit/                  Pure function tests
  snapshot/              Generated output baselines
  integration/           Gateway, streaming, and generated-test integration tests
  conformance/           Fixture-backed WSDL capability evidence
  research/              Exploratory probes kept out of the default test suite
  helpers/               Shared test utilities
```

### Updating Snapshots

When a generator change intentionally alters output:

```bash
npx vitest run test/snapshot -u
```

Review the snapshot diff before committing. The snapshot suite also checks the generated file inventory.

### Smoke Tests

Smoke tests generate output to `tmp/smoke/` from `examples/minimal/weather.wsdl`, then typecheck with `tsc -p tsconfig.smoke.json`.

- `npm run smoke:compile`: WSDL parsing and catalog generation
- `npm run smoke:client`: TypeScript client generation and typecheck
- `npm run smoke:openapi`: OpenAPI 3.1 generation and typecheck
- `npm run smoke:gateway`: client, OpenAPI, and gateway generation
- `npm run smoke:pipeline`: full pipeline with app scaffold and typecheck
- `npm run smoke:app`: standalone app generation and typecheck

The `tsconfig.smoke.json` file extends the main `tsconfig.json` and includes `tmp/smoke/**/*.ts`. It maps `soap` to local type stubs so generated client code compiles without a live SOAP runtime.

### Temporary Workspace Layout

Repository automation keeps disposable output classified under `tmp/` so smoke artifacts, caches, release checks, and generated-test spikes do not collide.

- `tmp/smoke/`: smoke-script client, OpenAPI, gateway, app, and catalog output
- `tmp/cache/npm/`: local npm cache used by package and dependency checks
- `tmp/preflight/examples/`: regenerated examples used by release preflight
- `tmp/conformance/`: conformance mini-projects that need repository-local module resolution
- `tmp/test-generation/`: generated-test integration spikes

### CI Pipeline

`npm run ci` runs clean, build, typecheck, agent skill validation, npm package validation, documentation validation, Vitest, and the smoke pipeline.

This verifies the source compiles, tests pass, conformance rows stay covered through broad Vitest discovery, the CLI works, generated output compiles, package contents are valid, Markdown links and TypeScript fenced snippets resolve, the agent skill packages cleanly, and type contracts stay aligned.

## Repository Health Checks

Before a release, run `npm run ci` and review the roadmap, changelog, README, CLI help, examples, configuration docs, and agent skill docs for drift.

For a minor release, verify the target version is the next minor after the latest release and that `package.json` has patch `0`.

Run `npm run maint:deps` when preparing a release so root dependency minimums and generated app pins stay aligned.

Every release commit must include `docs/releases/vX.Y.Z.md`. Before tagging, run `npm run skill:package -- vX.Y.Z` and confirm the release ZIP exists under `dist/assets/`.

Pushing the matching `vX.Y.Z` tag creates or updates a GitHub draft release from the release notes file after CI passes. The draft release workflow strips the release-note H1 for GitHub display, packages and uploads the agent skill ZIP, and refuses to mutate a published non-draft release.

When an IDE inspection tool is available, run it on touched Markdown files and generator files that embed generated source. Without IDE inspections, verify relative Markdown links target concrete files or headings and keep TypeScript fenced examples syntactically valid.

## Adding Test Fixtures

1. Add the `.wsdl` file to `examples/`.
2. Add a corresponding smoke test script to `package.json` if needed.
3. Include the generated output path in `tsconfig.smoke.json` if needed.

See [Testing Guide](docs/testing.md) for integration test architecture and mock client examples.

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for the full code of conduct.

### Getting Help

- [Discussions Q&A](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/q-a) for questions
- [TechSpokes](https://www.techspokes.com) for commercial support

## Project Priorities

See [ROADMAP.md](./ROADMAP.md) for current priorities and planned features.

## Recognition

Contributors are recognized in git commit history and GitHub contributors. Significant contributions are added to the `package.json` contributors field. Major features receive special mention in release notes.
