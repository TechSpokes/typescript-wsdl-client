---
name: typescript-wsdl-client
description: Use when working in a consumer project that depends on @techspokes/typescript-wsdl-client to generate typed SOAP clients, OpenAPI specs, Fastify gateways, apps, tests, or catalogs from WSDL or catalog inputs.
---

# TypeScript WSDL Client

Use this skill in a consumer project that depends on `@techspokes/typescript-wsdl-client`.

## Default Workflow

1. Confirm the consumer project uses Node.js 20 or newer.
2. Install `@techspokes/typescript-wsdl-client` as a development dependency.
3. Install `soap` as a runtime dependency.
4. Prefer `npx wsdl-tsc pipeline` for full SOAP-to-REST adoption.
5. Use `client`, `openapi`, `gateway`, `app`, or `compile` only when the task needs that narrower stage.
6. Regenerate generated output from the WSDL source or `catalog.json` instead of editing generated files by hand.
7. Validate generated output with the consumer project's TypeScript build and tests.

## Dependency Commands

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap
```

## Generated Output Rule

Treat generated `client/`, `gateway/`, and `app/` output as replaceable artifacts. Make persistent changes in WSDL inputs, configuration files, wrapper code, middleware, tests, or generator options.

## Reference Loading

Load `references/architecture.md` first when choosing how WSDL input, catalog files, clients, OpenAPI specs, gateways, apps, and tests relate to each other.

Load `references/consumer-workflows.md` first when deciding which command sequence to run for a consumer task.

Load fluid references only when details are needed:

- `references/cli-reference.md` for command flags, defaults, examples, and catalog path behavior.
- `references/generated-code.md` for generated TypeScript, operation calls, stream calls, choice unions, and gateway integration details.
- `references/testing.md` for mock clients, generated tests, and consumer test setup.
- `references/troubleshooting.md` for installation, TypeScript, catalog, and streaming diagnostics.
- `references/streaming.md` for stream configuration and NDJSON or JSON array behavior.
