# Agent Instructions for docs/

## Summary

This directory contains human-maintained reference documentation for `@techspokes/typescript-wsdl-client`. Documents here are not generated; agents may edit them but must preserve cross-references, formatting conventions, and consistency with the root README.

## Must-follow rules

- Maintain cross-references between documents; when a doc mentions a related topic, link to the relevant file.
- Use relative links for all internal references (e.g. `[CLI Reference](cli-reference.md)`, `[root README](../README.md)`).
- Each document must open with an H1 title, a one-line description, and a cross-reference to the root [README.md](../README.md).
- When adding, renaming, or removing a document, update the Documentation table in the root [README.md](../README.md) — that table is the single source of truth for this directory's contents.
- Do not duplicate content from root-level files (README.md, CONTRIBUTING.md, CHANGELOG.md); link to them instead.

## Must-read documents

- [Root README.md](../README.md): authoritative Documentation table and project overview
- [Root AGENTS.md](../AGENTS.md): project-wide agent instructions pointing to `.github/copilot-instructions.md` for full detail

## Agent guidelines

### Style conventions

- Use fenced code blocks for CLI examples and inline code for flag names (`` `--flag-name` ``).
- Keep language direct and task-oriented.
- `architecture.md` targets contributors; all other documents target users.

### Adding a new document

1. Create the file in `docs/` with an H1 title and description.
2. Add a row to the Documentation table in the root README.md.
3. Add a bullet to the Contents list in `docs/README.md`.
4. Cross-reference from related existing documents where appropriate.

### Editing existing documents

- Preserve the H1 + description + cross-reference opening pattern.
- If renaming a file, update the root README.md Documentation table and fix any relative links in other docs.

## Context

The `docs/` directory was introduced in v0.8.x to move detailed reference material out of the root README. `architecture.md` covers the internal pipeline for contributors; the remaining documents serve end users integrating with or deploying generated code.

## References

- [examples/README.md](../examples/README.md): folder README pattern example
- [Root README.md Documentation table](../README.md#documentation): authoritative listing of all docs
