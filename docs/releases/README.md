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

Choose the PR path before final candidate review. A change the maintainer has approved to ship immediately can include its code and release metadata in one release-ready PR. Use a separate qualification or release PR when a change needs to merge independently, the release decision is pending, or a combined diff would make independent review or hosted qualification harder. Use a later release PR when it needs to collect multiple independently merged changes.

[v1.9.0 used one release-ready PR](https://github.com/TechSpokes/typescript-wsdl-client/pull/496). Its reviewed candidate included release metadata and passed preflight, PR CI and merged-main CI. For v1.10.0, the [standalone client feature](https://github.com/TechSpokes/typescript-wsdl-client/pull/497) merged first with its own review and delivery checks. The [release PR](https://github.com/TechSpokes/typescript-wsdl-client/pull/499) then validated the final versioned tree locally, in PR CI and on merged main.

Both paths follow the same release gates.

1. Prepare versions, changelog, release notes, and the documentation index before pushing the release PR.
2. Stage all candidate files. Confirm the index and working tree agree and record the staged tree with `git write-tree`.
3. Obtain independent review of that uncommitted tree, run complete preflight, and commit the validated tree.
4. Push the PR and require Node 24 and Node 26 checks for its final head. Verify the actual tested checkout and tree before merging.
5. Verify the merged main tree matches the validated tree and require CI on the merged commit.
6. Tag the validated merged main commit and push the tag to start the draft workflow.
7. Verify the draft, release notes, uploaded skill ZIP, checksum manifest, and artifact verification results.
8. Complete [release cleanup](#release-cleanup) and hand the draft to the maintainer.
9. The maintainer reviews the draft in their own browser and clicks Publish.
10. The guarded package workflow publishes to npmjs with provenance.

The agent stops after draft verification and cleanup. Agents must never access GitHub through a browser, publish a release, or dispatch package publication. Use authenticated git and GitHub CLI commands for preparation and verification. Preserve unrelated work, contributor-owned branches, immutable release tags, and abandonment markers during cleanup.

If the merged tree differs from the preflight-validated tree, stop before tagging and prepare a newly validated candidate. Do not rerun preflight for an unchanged validated tree.

Manual package dispatch is a recovery path after the GitHub Release is published. It enforces the same tag, marker, reachability, draft, and prerelease checks.

### Release cleanup

Keep the local preflight ZIP, checksum manifest, and any evidence still needed to verify the exact candidate through draft verification. Start final cleanup after the tag-triggered draft workflow succeeds and the draft, uploaded ZIP, checksum manifest, and uploaded-artifact install and smoke results have been verified. The hosted npm workflow builds its tarball from the released commit after the maintainer publishes.

Record the verified tag, draft URL, and workflow result in the handoff. Remove task-owned preflight examples, disposable verification projects and builds, local copies of the verified ZIP and checksum manifest, test tarballs, logs, checkout-local caches, and OS or WSL scratch. Remove disposable release worktrees and task-owned merged branches. Keep published and verified draft assets on GitHub, release tags, abandonment markers, and unrelated work.

Check the remaining checkout's `tmp/` with hidden entries included. Leave the directory present and follow the [task closeout verification](../testing.md#task-closeout). Complete these checks before handing the draft to the maintainer.

### npm tarball delivery

The package workflow builds and validates one npm tarball from the released commit. It uploads the archive and a record that identifies the producing repository, workflow attempt, tag, package, commit and digest. The publishing job checks the live release state independently and downloads by the successful build job's artifact ID. It verifies the archive against that job's SHA-256 output before passing the file to npm with provenance enabled. The standalone npm lifecycle still validates source-based publication.

Use the target tag as both the workflow ref and the `tag` input for manual recovery. Rerun all jobs if a release attempt needs a new tarball. A failed-job rerun that tries to use an archive from an earlier attempt will be refused. If a publish step may have succeeded, check npm for the version before retrying.

For the first maintainer-operated run of this path, record the successful `Node.js Package` run and the build and publish jobs. Compare the logged archive `integrity` with the version's npm `dist.integrity`. Verify that npm's provenance identifies the same repository, release commit and trusted workflow and that its subject digest matches the archive. The read-only qualification workflow verifies the file transfer and the pinned npm CLI's offline tarball selection. Live OIDC authorization and registry provenance come from publishing the approved release.

The normal path uses GitHub UI publication because a workflow publishing with its standard `GITHUB_TOKEN` does not trigger another workflow from the resulting event. Do not rely on recursive workflow delivery for package publication.

## Abandoned Candidates

Run the `Abandon Release Candidate` workflow before publishing a rejected draft. Supply the final-form tag, a permanent reason, and optional failed-validation evidence.

The workflow creates annotated marker `abandoned/vX.Y.Z` on the same commit as `vX.Y.Z`, verifies the remote marker, and then deletes only the draft release and its candidate assets. The marker preserves the durable reason and release identity. The operation is idempotent when the marker already matches and the draft is absent. A marker on another commit fails for maintainer review.

Once the marker is verified and the draft is absent, remove the abandoned candidate's task-owned local outputs and verify `tmp/` using the same checks as release cleanup.

Drafting, abandonment, and package publication are serialized per release tag so abandonment cannot race package delivery.

Never move, delete for reuse, or force-update either tag. The rejected version is consumed, and the correction uses the next version.

The marker cannot disable GitHub's Publish button before draft retirement. Draft and package automation enforce the marker, and abandonment removes the rejected draft after verifying the marker. Never use release deletion with tag cleanup.

## Tag Ruleset Proposal

Protect `v*` and `abandoned/v*` against updates and deletions. Consider restricted creation after testing the intended maintainer or GitHub App bypass identity. Repository settings remain a maintainer decision and are not changed by release automation.
