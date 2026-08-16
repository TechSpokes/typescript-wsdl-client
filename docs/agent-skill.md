# Agent Skill Artifact

Standalone agent skill artifact for consumer projects using `@techspokes/typescript-wsdl-client`. See the root [README.md](../README.md) for the authoritative documentation index.

## Purpose

Release assets include `typescript-wsdl-client-agent-skill-vX.Y.Z.zip` and `SHA256SUMS`. GitHub artifact provenance attests the ZIP, which contains an installable `typescript-wsdl-client/` skill folder for consumer projects.

The skill is for consumer-project agents. It tells agents how to choose `wsdl-tsc` commands, handle generated output boundaries, load reference material, and validate generated code without treating generated files as hand-maintained source.

## Packaged Shape

```text
typescript-wsdl-client/
  LICENSE
  SKILL.md
  install.mjs
  references/
    architecture.md
    consumer-workflows.md
    cli-reference.md
    generated-code.md
    testing.md
    troubleshooting.md
    streaming.md
    SOURCE-MAP.json
```

## Evergreen Content

Evergreen content lives under `agent-skill/` and is reviewed as source code. Update evergreen files only when stable agent workflow, architecture guidance, dependency rules, or generated-output safety rules change.

The evergreen files are `agent-skill/SKILL.md`, `agent-skill/install.mjs`, `agent-skill/evergreen/architecture.md`, and `agent-skill/evergreen/consumer-workflows.md`.

## Fluid References

Fluid references are generated from maintained repository docs during validation and release packaging. Repository docs remain the single source of truth for command flags, generated-code details, testing guidance, troubleshooting steps, and streaming behavior.

Do not maintain `agent-skill/references/` by hand. The package scripts generate packaged references under `dist/`.

## Installation

Download the release ZIP from the GitHub draft or published release, extract it, and run the installer from the extracted skill folder:

```bash
node install.mjs --target ../skills
```

Use `--name <folder-name>` to choose a different installed folder name. The target must be outside the extracted skill directory.

An existing installation is preserved unless `--force` is present. Forced installation stages a complete candidate, swaps it into place, removes stale files from the previous copy, and restores the previous installation if the swap fails.

The installer copies only the skill folder. It does not edit Codex, Claude, IDE, MCP, shell, or global configuration files.

## Maintainer Workflow

Update `agent-skill/reference-manifest.json` when packaged references need new or different source sections. Each entry declares whether content is evergreen or fluid, where it comes from, where it is packaged, which headings or marker ranges are extracted, and whether links are rewritten.

Use exact reusable headings in docs when possible. Add marker ranges such as `<!-- agent-skill:start stream-configuration -->` only when heading extraction would be too broad.

## Validation

Run the validation script before release packaging:

```bash
npm run skill:validate
```

Validation checks skill frontmatter, manifest sources, extracted headings, packaged Markdown structure, packaged links, forbidden files, behavioral fixtures, exact `SOURCE-MAP.json` content, exact ZIP inventory, checksum output, and byte-identical complete builds.

## Packaging

Package the release skill with the exact release tag. For the `0.21.0` release:

```bash
npm run skill:package -- v0.21.0
```

The script requires the tag to match `package.json` and writes `dist/assets/typescript-wsdl-client-agent-skill-v0.21.0.zip` plus `dist/assets/SHA256SUMS`.

## Release Verification

The draft workflow attests the locally built ZIP, uploads the ZIP and `SHA256SUMS`, downloads both assets into an isolated runner directory, verifies their checksum and GitHub provenance, installs the extracted skill, and runs the representative weather WSDL pipeline fixture. A draft is ready only when that workflow succeeds.

Run the artifact verifier directly when diagnosing a downloaded candidate:

```bash
node scripts/verify-agent-skill-artifact.mjs --zip <zip-file> --checksums <SHA256SUMS-file> --work-dir <temporary-directory> --wsdl examples/minimal/weather.wsdl --expected-tag vX.Y.Z --previous-zip <previous-release-zip>
```

## GitHub CLI Applicability

`gh skill publish dist/agent-skill-stage --dry-run` validates the complete generated skill without committing generated references. Do not run this command without `--dry-run`; product release creation remains owned by the repository release workflows.

Direct `gh skill install` and `gh skill update` are not supported delivery paths for this repository. Those commands resolve skill files from the tagged Git tree, while the complete skill exists only after manifest-driven packaging, so the release ZIP remains the supported installation and replacement boundary.

## Drift Control

Changing an extracted docs section changes the packaged reference on the next package run. Renaming or removing an extracted heading fails validation. Packaged links must resolve after rewrite, and `references/SOURCE-MAP.json` records the source path, output path, and extracted sections for each packaged reference.
