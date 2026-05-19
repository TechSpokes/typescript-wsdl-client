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

Short summary paragraph.

## Highlights

- User-facing release highlight.

## Upgrade Notes

No special upgrade steps.

## Validation

- `npm run maint:deps`
- `npm run ci`

## Notes

Release tag: `vX.Y.Z`.
```

Write release notes for users and maintainers, not as a file-by-file change log. Use `CHANGELOG.md` for the canonical version history.
