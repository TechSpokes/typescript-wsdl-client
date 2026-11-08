---
name: typescript-wsdl-client
description: Use when working in a consumer project that depends on @techspokes/typescript-wsdl-client to generate typed SOAP clients, OpenAPI specs, Fastify gateways, apps, tests, or catalogs from WSDL or catalog inputs.
license: MIT
---

# TypeScript WSDL Client

Use this skill in a consumer project that depends on `@techspokes/typescript-wsdl-client`.

## Default Workflow

1. Confirm the consumer project uses Node.js 24 or newer.
2. Install `@techspokes/typescript-wsdl-client` as a development dependency.
3. Install `soap` as a runtime dependency.
4. Prefer `npx wsdl-tsc pipeline` for full SOAP-to-REST adoption.
5. Use `client`, `openapi`, `gateway`, `app`, or `compile` only when the task needs that narrower stage.
6. Regenerate generator-owned artifacts from the WSDL source or applicable legacy `catalog.json` instead of editing them by hand.
7. Validate generated output with the consumer project's TypeScript build and tests.

For testing setup, load `references/testing.md` and choose legacy mock-route tests or checked app scaffold checks. Use consumer scripts and configuration; this package does not install the generator repository's test commands, Vitest projects or verification lock. Generated checks do not replace independent SOAP wire and provider/business acceptance.

## Missing Input Discovery

Inspect the consumer project for WSDL files, XSD imports, existing `catalog.json` files, generator configuration, and established output paths before asking for input.

If no usable WSDL or catalog is available, ask only for the source location and the intended generation surface. Do not invent a service URL, input file, output path, or command scope.

## Dependency Commands

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap
```

## Generated Output Rule

Treat generator-owned client, gateway, OpenAPI and checked source/capsule artifacts as replaceable output; change their inputs or generator options and regenerate. App and test scaffolds are consumer-owned starting points: preserve adopted server, package/configuration and test customizations, and review them before deliberately selecting `--force-init` or `--force-test`. An app directory can contain both kinds of files; do not discard the whole directory to regenerate its artifacts.

## Reference Loading

Load `references/architecture.md` first when choosing how WSDL input, catalog files, clients, OpenAPI specs, gateways, apps, and tests relate to each other.

Load `references/consumer-workflows.md` first when deciding which command sequence to run for a consumer task.

Load fluid references only when details are needed:

- `references/cli-reference.md` for command flags, defaults, examples, and catalog path behavior.
- `references/checked-generation.md` for the opt-in component trial, matched artifacts, endpoint intent and feedback.
- `references/generated-code.md` for generated TypeScript, operation calls, stream calls, choice unions, and gateway integration details.
- `references/testing.md` for mock clients, generated tests, and consumer test setup.
- `references/troubleshooting.md` for installation, TypeScript, catalog, and streaming diagnostics.
- `references/streaming.md` for stream configuration and NDJSON or JSON array behavior.
