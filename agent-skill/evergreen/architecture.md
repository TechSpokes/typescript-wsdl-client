# Agent Skill Architecture

This reference explains where product guidance comes from and which files the agent may regenerate.

## One Maintained Product Contract

Canonical product documentation lives in the repository's `docs/` files and is shipped with the npm package where listed in its package contents. The skill's fluid references are generated from selected sections by `agent-skill/reference-manifest.json`; `references/SOURCE-MAP.json` identifies their product version, release tag and sources. Do not maintain those extracts separately or copy their contract details into evergreen summaries.

Prefer documentation from the consumer's installed package. Use a bundled reference only for its recorded version, including deliberate target-version upgrade work; use a matching repository tag when a local guide is unavailable. Live `main` docs describe development state and do not establish what an older installed version supports.

The manually maintained skill files provide navigation, discovery and ownership guardrails. Constructors, mappings, generation profiles, transport/security limits and compatibility rules belong to the canonical guides selected by `references/consumer-workflows.md`.

## Artifact Ownership

Consult the installed `docs/generated-code.md` or its bundled `references/generated-code.md` extract before changing generated output. Regenerate generator-owned artifacts from their source/configuration inputs; preserve adopted application and test scaffolds according to the documented command's skip/force behavior.

For version changes, load the installed or target-version `docs/migration.md`, with `references/migration.md` as the matching snapshot. Keep the selected profile and artifact/runtime compatibility rules described there; do not infer them from npm version numbers alone.

## Validation Ownership

Use the installed `docs/testing.md` consumer sections or `references/testing.md` for checks appropriate to the selected profile. The consumer owns its TypeScript build, maintained tests and authorized backend acceptance; this skill does not supply repository CI infrastructure or certify an integration.
