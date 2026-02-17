# Contributing to TypeScript WSDL Client

Thank you for your interest in contributing to `typescript-wsdl-client`. This guide covers development setup, coding standards, and the pull request process.

## Quick Start

### Prerequisites

Node.js >= 20 and npm are required.

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

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Validate types without emit |
| `npm run dev` | Run CLI with tsx (no build needed) |
| `npm run watch` | Auto-reload during development |
| `npm run smoke:pipeline` | Full end-to-end generation test |

## Community and Discussions

Before contributing code, consider starting a discussion:

- [Feature Ideas](../../discussions/categories/ideas) for new features
- [Questions & Help](../../discussions/categories/q-a) for questions
- [Show and Tell](../../discussions/categories/show-and-tell) for sharing projects
- [General](../../discussions/categories/general) for open conversations

## Reporting Issues

Use [GitHub Issues](../../issues/new) for confirmed bugs with clear reproduction steps. Use [Discussions Q&A](../../discussions/categories/q-a) for questions. Follow our [Security Policy](./SECURITY.md) for vulnerabilities.

## Code Contributions

### Types of Contributions Welcome

- Bug fixes
- Documentation: README, examples, inline comments
- WSDL/XSD parsing: support for new schema patterns
- Code generation: better TypeScript output, ESM/CJS handling
- CLI improvements: new flags, better error messages
- Test coverage: examples, edge cases, smoke tests

### Before You Code

1. Search issues and discussions for existing work
2. Start small: bug fixes and documentation are great first contributions
3. For new features, start a [discussion](../../discussions/categories/ideas)

### Coding Standards

TypeScript strict mode with ESM/NodeNext modules. Node.js >= 20, no browser-specific code. Follow existing patterns, prefer explicit types. Use [Conventional Commits](https://conventionalcommits.org/) with the version prefix described below.

### Commit Message Format

```text
Version: 0.5.1 feat(scope): imperative summary

Optional body with more details, breaking changes,
and references like "Closes #123"
```

Examples:
- `Version: 0.5.1 fix(parser): handle empty choice elements`
- `Version: 0.5.1 docs: add complex inheritance example`
- `Version: 0.5.1 feat(cli): add --attribute-prefix flag`

### Pull Request Process

1. Fork the repository
2. Create a branch from `main`: `git checkout -b fix/my-bug-fix`
3. Make changes following our standards
4. Run `npm run ci` to test thoroughly
5. Update docs if behavior changes (README, help text)
6. Submit a PR with a clear description and link to related discussions or issues

## Development Guidelines

### Project Structure

```text
src/
├── cli.ts              # CLI entry point (wsdl-tsc binary)
├── config.ts           # Compiler options and defaults
├── index.ts            # Public API exports (4 functions)
├── pipeline.ts         # Full generation pipeline orchestrator
├── app/                # Runnable Fastify app generation
│   └── generateApp.ts
├── client/             # TypeScript SOAP client generation
│   ├── generateClient.ts
│   ├── generateTypes.ts
│   └── generateUtils.ts
├── compiler/           # WSDL/XSD schema compilation
│   ├── generateCatalog.ts
│   └── schemaCompiler.ts
├── gateway/            # Fastify REST gateway generation
│   ├── generateGateway.ts
│   ├── generators.ts
│   └── helpers.ts
├── loader/             # WSDL document fetching and parsing
│   ├── fetch.ts
│   └── wsdlLoader.ts
├── openapi/            # OpenAPI 3.1 specification generation
│   ├── casing.ts
│   ├── generateOpenAPI.ts
│   ├── generatePaths.ts
│   ├── generateSchemas.ts
│   └── security.ts
├── types/              # Type declarations and stubs
│   ├── soap.d.ts
│   └── yargs-helpers.d.ts
├── util/               # Shared utilities
│   ├── builder.ts      # Yargs option builders
│   ├── cli.ts          # Console output and error handling
│   └── tools.ts        # String helpers (pascal, kebab, QName)
└── xsd/                # XSD type system mapping
    └── primitives.ts
```

### Key Principles

- Generate fully-typed code with no `any` types
- Same WSDL must always generate the same output (deterministic)
- ESM-first, Node.js >= 20, latest TypeScript features
- Keep the dependency tree lean
- CLI flags and generated code should be stable across releases

### Testing Strategy

#### How Smoke Tests Work

Smoke tests are the primary test mechanism. The pipeline is: generate to `tmp/` from `examples/minimal/weather.wsdl`, then typecheck the generated output.

| Command | What It Tests |
|---------|---------------|
| `npm run smoke:compile` | WSDL parsing and catalog generation |
| `npm run smoke:client` | TypeScript client generation + typecheck |
| `npm run smoke:openapi` | OpenAPI 3.1 spec generation + typecheck |
| `npm run smoke:gateway` | Client + OpenAPI + gateway generation + typecheck |
| `npm run smoke:pipeline` | Full pipeline (client + OpenAPI + gateway + app) + typecheck |
| `npm run smoke:app` | Pipeline + standalone app generation + typecheck |

Each smoke test follows three steps:

1. Run `smoke:reset` to clear `tmp/`
2. Generate output using `tsx src/cli.ts <command> ...`
3. Run `tsc -p tsconfig.smoke.json` to verify the generated TypeScript compiles

The `tsconfig.smoke.json` extends the main `tsconfig.json` but includes `tmp/**/*.ts` in its scope. It maps the `soap` import to `src/types/soap.d.ts` (local type stubs) so generated client code compiles without the soap runtime.

The gateway also generates a `_typecheck.ts` fixture that catches plugin-client type divergence at build time.

#### CI Pipeline

`npm run ci` runs: clean, build, typecheck, smoke:pipeline.

This verifies the complete stack: the source compiles, the CLI works, the generated output compiles, and all types are consistent.

#### Adding Test Fixtures

1. Add the `.wsdl` file to `examples/`
2. Add a corresponding smoke test script to `package.json`
3. Include the generated output path in `tsconfig.smoke.json` if needed

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) for the full code of conduct.

### Getting Help

- [Discussions Q&A](../../discussions/categories/q-a) for questions
- Check if maintainers are available in discussions for real-time help
- [TechSpokes](https://www.techspokes.com) offers commercial support

## Project Priorities

See [ROADMAP.md](./ROADMAP.md) for current priorities and planned features.

## Recognition

Contributors are recognized in git commit history and GitHub contributors. Significant contributions are added to the `package.json` contributors field. Major features receive special mention in release notes.

Questions? Start a [discussion](../../discussions) or reach out to the maintainers.
