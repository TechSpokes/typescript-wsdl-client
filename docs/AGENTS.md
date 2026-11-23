# Agent Instructions for docs/

## Summary

This directory contains human-maintained reference documentation for `@techspokes/typescript-wsdl-client`. Documents here are not generated; agents may edit them but must preserve cross-references, formatting conventions, and consistency with the root README.

## Must-follow rules

- Maintain cross-references between documents; when a doc mentions a related topic, link to the relevant file.
- Use relative links for packaged internal references (e.g. `[CLI Reference](cli-reference.md)`).
- Use canonical repository URLs when packaged consumer guides link to repository-only contributor or research material.
- Each document must open with an H1 title, a one-line description, and a cross-reference to the root [README.md](../README.md).
- Update the [documentation index](README.md) when adding, renaming, or removing a guide.
- Do not duplicate content from root-level files (README.md, CONTRIBUTING.md, CHANGELOG.md); link to them instead.

## Must-read documents

- [Root README.md](../README.md) for the project overview and first command
- [Documentation index](README.md) for the canonical guide listing
- [Root AGENTS.md](../AGENTS.md): project-wide agent instructions pointing to `.github/copilot-instructions.md` for full detail

## Agent guidelines

### Style conventions

- Use fenced code blocks for CLI examples and inline code for flag names (`` `--flag-name` ``).
- Keep language direct and task-oriented.
- `architecture.md` targets contributors; `testing.md` separates repository maintenance from consumer testing.
- Route consumers to `testing.md#for-consumer-projects`; keep maintainer commands out of consumer skill extraction.

### Adding a new document

1. Create the file in `docs/` with an H1 title and description.
2. Add the guide to the relevant section of `docs/README.md`.
3. Cross-reference from related existing documents where appropriate.

### Editing existing documents

- Preserve the H1 + description + cross-reference opening pattern.
- When renaming a file, update `docs/README.md` and repair affected relative links.

## Context

The `docs/` directory was introduced in v0.8.x to move detailed reference material out of the root README. `architecture.md` covers the internal pipeline for contributors; `testing.md` serves both maintainers and consumers through separate sections. Other guides declare their audience and should keep repository-only procedures distinct from consumer instructions.

## References

- [examples/README.md](../examples/README.md): folder README pattern example
- [Documentation index](README.md) for the guide listing
