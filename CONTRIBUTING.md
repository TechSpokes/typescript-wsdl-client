# Contributing to TypeScript WSDL Client

Thank you for your interest in contributing to `typescript-wsdl-client`! This guide will help you get started and understand our development process.

## Quick Start

### Development Setup

1. **Prerequisites**: Node.js ≥ 20, npm
2. **Clone & Install**:
   ```bash
   git clone https://github.com/techspokes/typescript-wsdl-client.git
   cd typescript-wsdl-client
   npm install
   ```
3. **Verify Setup**:
   ```bash
   npm run ci
   ```

### Development Workflow

- **Build**: `npm run build` → Compile TypeScript to `dist/`
- **Type Check**: `npm run typecheck` → Validate types without emit
- **Dev CLI**: `npm run dev` → Run CLI with tsx (no build needed)
- **Watch Mode**: `npm run watch` → Auto-reload during development
- **Smoke Tests**: `npm run smoke` (help) and `npm run smoke:gen` (sample generation)

## Community & Discussions

Before contributing code, consider starting a discussion:

- [Feature Ideas](../../discussions/categories/ideas) - Share and discuss new features
- [Questions & Help](../../discussions/categories/q-a) - Get help and ask questions
- [Show and Tell](../../discussions/categories/show-and-tell) - Share your projects
- [General](../../discussions/categories/general) - Open conversations about the project

## Reporting Issues

- **Bugs**: Use [GitHub Issues](../../issues/new) with clear reproduction steps
- **Questions**: Use [Discussions Q&A](../../discussions/categories/q-a) instead of issues
- **Security**: Follow our [Security Policy](./SECURITY.md) for vulnerabilities

## Code Contributions

### Types of Contributions Welcome

- **Bug fixes** - Always appreciated!
- **Documentation** - README, examples, inline comments
- **WSDL/XSD parsing** - Support for new schema patterns
- **Code generation** - Better TypeScript output, ESM/CJS handling
- **CLI improvements** - New flags, better error messages
- **Test coverage** - Examples, edge cases, smoke tests

### Before You Code

1. **Check existing work**: Search issues and discussions
2. **Start small**: Bug fixes and documentation are great first contributions
3. **Discuss first**: For new features, start a [discussion](../../discussions/categories/ideas)

### Coding Standards

- **TypeScript**: Strict mode, ESM/NodeNext modules
- **Runtime**: Node.js ≥ 20, no browser-specific code
- **Style**: Follow existing patterns, prefer explicit types
- **Commits**: Use [Conventional Commits](https://conventionalcommits.org/) with version prefix

### Commit Message Format

```
Version: 0.5.1 feat(scope): imperative summary

Optional body with more details, breaking changes,
and references like "Closes #123"
```

**Examples**:
- `Version: 0.5.1 fix(parser): handle empty choice elements`
- `Version: 0.5.1 docs: add complex inheritance example`
- `Version: 0.5.1 feat(cli): add --attribute-prefix flag`

### Pull Request Process

1. **Fork** the repository
2. **Create branch** from `main`: `git checkout -b fix/my-bug-fix`
3. **Make changes** following our standards
4. **Test thoroughly**:
   ```bash
   npm run ci
   npm run smoke:gen
   ```
5. **Update docs** if behavior changes (README, help text)
6. **Submit PR** with clear description and link to related discussions/issues

## Development Guidelines

### Project Structure

```
src/
├── cli.ts              # CLI entry point
├── index.ts            # Library exports
├── compiler/           # WSDL/XSD parsing logic
├── emit/               # Code generation
├── loader/             # WSDL fetching and loading
└── util/               # Shared utilities
```

### Key Principles

- **Type Safety**: Generate fully-typed code, no `any` types
- **Deterministic**: Same WSDL should always generate same output
- **Modern**: ESM-first, Node.js ≥ 20, latest TypeScript features
- **Minimal Dependencies**: Keep the dependency tree lean
- **Backward Compatible**: CLI flags and generated code should be stable

### Testing Strategy

- **Smoke Tests**: Basic CLI functionality (`npm run smoke`)
- **Generation Tests**: End-to-end WSDL → TypeScript compilation
- **Real WSDLs**: Test with diverse, real-world WSDL files
- **Edge Cases**: Complex inheritance, namespaces, unusual patterns

## Community Guidelines

### Code of Conduct

We are committed to providing a welcoming and inclusive experience for everyone. Please:

- **Be respectful** and constructive in discussions
- **Stay on topic** and help others learn
- **Share knowledge** and be patient with newcomers
- **Report issues** following our guidelines

### Getting Help

- **Questions**: [Discussions Q&A](../../discussions/categories/q-a)
- **Real-time**: Check if maintainers are available in discussions
- **Commercial Support**: [TechSpokes](https://www.techspokes.com) offers professional support

## Project Priorities

See [ROADMAP.md](./ROADMAP.md) for current priorities and planned features.

**Current Focus Areas**:
- WSDL/XSD parsing completeness
- Generated code quality and types
- Developer experience (CLI, docs, examples)
- Community growth and feedback

## Recognition

Contributors are recognized in:
- Git commit history and GitHub contributors
- Package.json contributors field for significant contributions
- Special mention in release notes for major features

---

**Questions?** Start a [discussion](../../discussions) or reach out to the maintainers!
