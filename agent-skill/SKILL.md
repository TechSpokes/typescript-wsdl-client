---
name: typescript-wsdl-client
description: Use when working in a consumer project that depends on @techspokes/typescript-wsdl-client to generate typed SOAP clients, OpenAPI specs, Fastify gateways, apps, tests, or catalogs from WSDL or catalog inputs.
license: MIT
---

# TypeScript WSDL Client

Use this skill in a consumer project that depends on `@techspokes/typescript-wsdl-client`.

## Documentation First

Read the installed package version and its documentation under `node_modules/@techspokes/typescript-wsdl-client/` before choosing commands. For an upgrade, read the migration guide for the target version before installing or regenerating; keep the existing generation profile unless adoption of another profile is requested.

Bundled `references/` files are generated extracts of canonical repository docs for this skill release, identified by `references/SOURCE-MAP.json`. Use them as version-matched fallbacks, or as target-version guidance during an explicit upgrade. If versions differ, consult the installed package docs or the repository tag matching that package; live `main` documentation may describe unreleased behavior.

Load `references/consumer-workflows.md` for the task-to-document map and `references/architecture.md` for documentation and artifact ownership. Load only the product references relevant to the task; do not treat this router as a second product specification.

## Default Workflow

1. Confirm the consumer project uses Node.js 24 or newer.
2. Install `@techspokes/typescript-wsdl-client` as a development dependency.
3. Install `soap` as a runtime dependency.
4. Prefer `npx wsdl-tsc pipeline` for full SOAP-to-REST adoption.
5. Use `client`, `openapi`, `gateway`, `app`, or `compile` only when the task needs that narrower stage.
6. Regenerate generator-owned artifacts from the WSDL source or applicable legacy `catalog.json` instead of editing them by hand.
7. Validate generated output with the consumer project's TypeScript build and tests.

The installation steps describe generation tooling. Retain any production package/runtime dependencies required by the selected host's emitted manifest and version-matched docs. Use those docs for profile-specific commands, constructors, response contracts and compatibility rules.

## Missing Input Discovery

Inspect the consumer project for WSDL files, XSD imports, existing `catalog.json` files, generator configuration, and established output paths before asking for input.

If no usable WSDL or catalog is available, ask only for the source location and the intended generation surface. Do not invent a service URL, input file, output path, or command scope.

## Generated Output Rule

Treat generator-owned client, gateway, OpenAPI and checked source/capsule artifacts as replaceable output; change inputs and regenerate. App and test scaffolds are consumer-owned starting points: preserve adopted customizations and consult the command's force/skip rules before replacement. An app directory can contain both kinds of files; do not discard the whole directory to regenerate its artifacts.

Use the consumer's own build/test configuration. The generator repository's CI commands and verification locks are not consumer tooling; generated checks do not establish provider or business acceptance.
