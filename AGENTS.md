# Agent Instructions for typescript-wsdl-client: WSDL-to-TypeScript Code Generator

## Summary

This is a TypeScript code generator that transforms WSDL/XSD SOAP service definitions into typed SOAP clients, OpenAPI 3.1 specs, and production-ready Fastify REST gateways. Read the full file before making architectural changes. For routine tasks such as bug fixes and feature additions, the Summary and Must-follow rules sections are sufficient.

## Must-follow rules

- Do not edit files in generated output directories (client/, gateway/, app/); regenerate from WSDL sources instead
- All generated output must be deterministic and diff-friendly with sorted types, paths, and schemas
- Run `npm run smoke:pipeline` to verify changes end-to-end
- Commit messages must follow: `Version: <version> <type>(scope): <imperative summary>`
- Node.js >= 20.0.0, ESM-only (`type: "module"`), strict TypeScript
- CLI flag names are lowercase kebab-case such as `--wsdl-source` and `--client-dir`
- The `soap` package is a runtime dependency; `wsdl-tsc` is a devDependency for consumers

## Must-read documents

- README.md: project overview, installation, quick start, and CLI command reference
- CONTRIBUTING.md: development setup, project structure, and testing strategy
- docs/migration.md: upgrade paths and breaking changes between versions

## Agent guidelines

### CLI Commands

The tool provides 6 commands: compile, client, openapi, gateway, app, and pipeline. The `pipeline` command is recommended for most use cases because it runs the full generation stack in one pass.

### Project Structure

Source is in `src/` with these modules: `loader/`, `compiler/`, `client/`, `openapi/`, `gateway/`, `app/`, `util/`, `xsd/`, and `types/`. The pipeline orchestrator is `src/pipeline.ts`. Configuration defaults are in `src/config.ts`.

### Testing

Smoke tests generate output to `tmp/` from `examples/minimal/weather.wsdl`, then typecheck with `tsconfig.smoke.json`. Run `npm run smoke:pipeline` for the full test. Run `npm run ci` for the complete CI pipeline including build and typecheck.

### Key Conventions

- String-first primitive mapping: `xs:long` and `xs:decimal` default to `string`
- `$value` convention for XML text content alongside attributes
- Flattened attributes as peer properties with no nested wrappers
- `catalog.json` is the intermediate compiled WSDL representation
- URN format: `urn:services:{service}:{version}:schemas:{models|operations}:{slug}`

## Context

The project evolved from a simple WSDL parser (v0.1.x) to a full generation pipeline (v0.9.x through v0.10.x). The gateway generator reads OpenAPI specs, not the catalog directly, to produce Fastify route handlers. Since v0.10.0 the gateway has end-to-end type safety from WSDL definitions through to HTTP response types.

## References

- .github/copilot-instructions.md: GitHub Copilot instructions with additional detail on commit format, changelog rules, and catalog co-location
- examples/minimal/weather.wsdl: test fixture used by all smoke tests
- CHANGELOG.md: version history and breaking change entries
