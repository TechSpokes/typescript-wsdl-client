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

When an abandoned major or minor candidate contains the complete launch narrative, carry that narrative into the next published corrective release. The corrective release notes must stand alone for users who never saw the abandoned draft.

## Candidate Publication

The supported release path keeps final-form tags immutable:

1. Prepare versions, changelog, release notes, and the documentation index before pushing the release PR.
2. Run release preflight on the final uncommitted tree and commit that exact validated tree.
3. Push the PR and require Node 24 and Node 26 checks on its final head before merging.
4. Verify the merged main tree matches the validated tree and require CI on the merged commit.
5. Tag the validated merged main commit and push the tag to start the draft workflow.
6. Verify the draft, release notes, uploaded skill ZIP, checksum manifest, and artifact verification results.
7. Clean up task-owned merged branches and temporary outputs, then hand the draft to the maintainer.
8. The maintainer reviews the draft in their own browser and clicks Publish.
9. The guarded package workflow publishes to npmjs with provenance.

The agent stops after draft verification and cleanup. Agents must never access GitHub through a browser, publish a release, or dispatch package publication. Use authenticated git and GitHub CLI commands for preparation and verification. Preserve unrelated work, contributor-owned branches, immutable release tags, and abandonment markers during cleanup.

If the merged tree differs from the preflight-validated tree, stop before tagging and prepare a newly validated candidate. Do not rerun preflight for an unchanged validated tree.

Manual package dispatch is a recovery path after the GitHub Release is published. It enforces the same tag, marker, reachability, draft, and prerelease checks.

The normal path uses GitHub UI publication because a workflow publishing with its standard `GITHUB_TOKEN` does not trigger another workflow from the resulting event. Do not rely on recursive workflow delivery for package publication.

## Abandoned Candidates

Run the `Abandon Release Candidate` workflow before publishing a rejected draft. Supply the final-form tag, a permanent reason, and optional failed-validation evidence.

The workflow creates annotated marker `abandoned/vX.Y.Z` on the same commit as `vX.Y.Z`, verifies the remote marker, and then deletes only the draft release and its candidate assets. The marker preserves the durable reason and release identity. The operation is idempotent when the marker already matches and the draft is absent. A marker on another commit fails for maintainer review.

Drafting, abandonment, and package publication are serialized per release tag so abandonment cannot race package delivery.

Never move, delete for reuse, or force-update either tag. The rejected version is consumed, and the correction uses the next version.

The marker cannot disable GitHub's Publish button before draft retirement. Draft and package automation enforce the marker, and abandonment removes the rejected draft after verifying the marker. Never use release deletion with tag cleanup.

## Tag Ruleset Proposal

Protect `v*` and `abandoned/v*` against updates and deletions. Consider restricted creation after testing the intended maintainer or GitHub App bypass identity. Repository settings remain a maintainer decision and are not changed by release automation.
