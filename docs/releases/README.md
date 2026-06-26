# Release Notes

Add one Markdown file per release tag. The draft release workflow requires this file before it creates or updates a GitHub draft release.

## File Naming

Use the Git tag as the filename:

```text
vX.Y.Z.md
```

For example, release `0.20.1` uses tag `v0.20.1` and release notes file `docs/releases/v0.20.1.md`.

## File Structure

Each release notes file must use this structure:

```markdown
# TypeScript WSDL Client vX.Y.Z

## Short agent-generated subtitle

A concise summary paragraph.

## What This Improves

Explain the practical developer impact of the release. Focus on what becomes easier, safer, clearer, more reliable, or more complete for developers using or maintaining this package.

## Highlights

- User-facing release highlight.

## Upgrade Notes

No special upgrade steps.

## Validation

- CI passed.
- NPM package contents were validated.
- Agent skill artifact was validated and packaged.
- Release preflight passed against the target tag.

## Notes

Release tag: `vX.Y.Z`.
```

Keep the H1 in the repository file so each release note remains a complete source document. The draft release workflow strips only that H1 when generating the GitHub release body, so the GitHub page uses `TypeScript WSDL Client vX.Y.Z` as the release title and starts the body with the H2 subtitle.

Write validation as consumer-facing outcomes, not as maintainer command transcripts. Keep exact release operator commands in `.github/copilot-instructions.md` and workflow logs.

Write release notes for users and maintainers, not as a file-by-file change log. Use `CHANGELOG.md` for the canonical version history.
