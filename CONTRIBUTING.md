# Contributing to TypeScript WSDL Client

Thank you for contributing to `typescript-wsdl-client`. This guide covers local setup, coding standards, testing, and release hygiene.

## Quick Start

### Prerequisites

Node.js >= 24 and npm are required.

The release archive tests and read-only handoff rehearsal use `tar` to inspect the packed contents.

The offline reference lane uses the pinned test-only Node/WASM dependency installed by npm. Run `npm run reference:setup` to check it; see [Reference Validation](docs/reference-validation.md) for the accepted evidence contract, limits and platform qualification.

### Clone and Install

```bash
git clone https://github.com/techspokes/typescript-wsdl-client.git
cd typescript-wsdl-client
npm ci
```

### Verify Setup

```bash
npm test -- test/unit/tools.test.ts
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

Use [GitHub Issues](https://github.com/TechSpokes/typescript-wsdl-client/issues/new) for confirmed bugs with clear reproduction steps. Use [Discussions Q&A](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/q-a) for questions. Follow our [Security Policy](SECURITY.md) for vulnerabilities.

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

Use `npm test -- <path> -t <name>` for targeted work. Use `npm run test:conformance:<stage>` for one capability stage, and `npm run smoke:pipeline` for source CLI generation and app compilation.

Run `npm run ci` for full verification. It covers the independent reference suite, broad product tests, a single build and packed candidate, isolated npm consumers, docs and the release skill. GitHub runs that gate on Linux with Node 24 and runs platform controls and representative installed consumers on the other compatibility jobs.

See the [Testing Guide](docs/testing.md#running-tests) for prerequisites, the Windows sandbox and certificate setup, output ownership, and recovery. The ordinary delivery gate restores any build present before it started and cleans its own scratch after success or failure. Release preflight owns the final release gate and preserves its release artifacts.

Follow the [pre-push sequence](docs/testing.md#before-opening-or-updating-a-pull-request) when opening a PR or pushing a new head to an existing PR.

### Test Structure

```text
test/
  unit/          Utility, compiler, filesystem and resource checks
  snapshot/      Focused generated output baselines
  integration/   Runtime, consumer and generated-test integration
  conformance/   Fixture-backed capability and independent reference checks
  tooling/       Repository automation contracts
  helpers/       Shared test utilities
```

### Updating Snapshots

When a generator change intentionally alters a retained snapshot:

```bash
npm run test:snap -- -u
```

Review the diff alongside the source change.

## Repository Health Checks

Before a release, review the roadmap, changelog, README, CLI help, examples, configuration docs, and agent skill docs for drift. Use targeted checks while editing; the final release preflight owns the single full CI pass.

For a minor release, verify the target version is the next minor after the latest release and that `package.json` has patch `0`.

Run `npm run maint:deps` when preparing a release so root dependency minimums and generated app pins stay aligned.

Every release commit must include `docs/releases/vX.Y.Z.md`. Run `npm run release:preflight -- vX.Y.Z` once on the final uncommitted release tree and confirm the release ZIP exists under `dist/assets/`.

Changes approved to ship immediately can carry their release metadata in the same PR. Use a separate PR when qualification, review or release sequencing needs a separate candidate. Both paths require independent review and release verification.

Include release notes, versions, changelog, and the root documentation link before pushing the release PR. After merging, verify that main's tree matches the preflight-validated tree before tagging the merged commit. Follow the [release delivery procedure](docs/releases/README.md#candidate-publication).

Set the release version before preflight. Preflight verifies release metadata, writes only ignored build and temporary outputs, and fails if it changes tracked content.

After preflight passes, commit the exact validated tree and push the release PR. Tag the merged main commit after its CI passes and its tree matches preflight. If tracked release files change, validate the new candidate before delivery.

Pushing the matching `vX.Y.Z` tag creates or updates a GitHub draft release from the release notes file after CI passes. The draft release workflow strips the release-note H1 for GitHub display, packages and uploads the agent skill ZIP, and refuses to mutate a published non-draft release.

The agent verifies the draft and artifacts, cleans up task-owned local and remote branches and temporary outputs, and stops. The maintainer publishes through their own browser. Agents never access GitHub through a browser or publish releases or packages.

When an IDE inspection tool is available, run it on touched Markdown files and generator files that embed generated source. Without IDE inspections, verify relative Markdown links target concrete files or headings and keep TypeScript fenced examples syntactically valid.

## Adding Test Fixtures

1. Add the `.wsdl` file to `examples/`.
2. Register the fixture with the capability suite or exercise its distinct behavior in a focused test.

See [Testing Guide](docs/testing.md) for integration test architecture and mock client examples.

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for the full code of conduct.

### Getting Help

- [Discussions Q&A](https://github.com/TechSpokes/typescript-wsdl-client/discussions/categories/q-a) for questions
- [TechSpokes](https://www.techspokes.com) for commercial support

## Project Priorities

See [ROADMAP.md](ROADMAP.md) for current priorities and planned features.

## Recognition

Contributors are recognized in git commit history and GitHub contributors. Significant contributions are added to the `package.json` contributors field. Major features receive special mention in release notes.
