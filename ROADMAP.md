# TypeScript WSDL Client Roadmap

Roadmap for the TypeScript WSDL/SOAP client generator, OpenAPI bridge, and Fastify gateway scaffolding.

## Current: 0.22.x Series

Focus: gateway integration documentation, repository health, dependency currency, production gateway fit, and security responsibility boundaries while keeping generated output deterministic and reviewable.

## Recently Shipped

### 0.22.0

- Refreshed root dependency minimums for `@types/node`, `soap`, `tsx`, and `vitest`
- Refreshed generated app scaffold dependency minimums for `@types/node`, `soap`, and `tsx`
- Improved draft release body rendering and consumer-facing release validation notes

### 0.21.0

- Added the standalone AI agent skill artifact for consumer projects
- Added release validation and packaging for the generated skill artifact

### 0.20.0

- Refreshed root dependency minimums for `@types/node`, `soap`, and `tsx`
- Refreshed generated app scaffold dependency minimums for `@types/node`, `soap`, and `tsx`

### 0.19.0

- Shared security configuration for OpenAPI gateway security and upstream SOAP runtime security
- Generated app scaffold support for upstream `node-soap` security profiles
- OpenAPI top-level and per-operation security output from `security.json`
- Runtime `.env.example` and app README entries for upstream SOAP secrets
- IDE-inspection cleanup for Markdown links, TypeScript docs snippets, and generated source templates

### 0.18.x

- Dependency maintenance script for root dependencies and generated app pins
- Refreshed generated app dependency minimums

### 0.17.x

- Opt-in streamable SOAP responses via ADR-002
- Client `StreamOperationResponse<T>` with `AsyncIterable<RecordType>`
- Gateway NDJSON streaming with backpressure
- OpenAPI `x-wsdl-tsc-stream` extension for record schema discovery
- Companion-catalog shape resolution for opaque `xs:any` wrappers
- SAX-driven streaming runtime and generated stream-aware tests

## Product Priorities

### Gateway Integration

- Keep documented extension points current for generated app authentication, authorization, logging, and request correlation.
- Keep examples current for verifying inbound JWT, API key, and mutual TLS signals outside generated route files.
- Keep gateway security responsibility boundaries explicit in configuration and gateway integration docs.

### WSDL Coverage

- Improve support for `xs:union`, abstract types, and substitution groups.
- Expand fixture coverage for multi-binding WSDLs, out-of-band policy references, and deeply composed schemas.
- Keep unsupported SOAP features explicit in [Supported Patterns](docs/supported-patterns.md).

### Streaming

- Evaluate `json-array` streaming as a complement to NDJSON.
- Investigate streaming request bodies for upload-style SOAP operations.
- Add more backpressure and terminal-error examples for generated gateways.

### Testing Experience

- Broaden generated consumer test utilities beyond the current gateway happy-path tests.
- Add examples for mock clients with authentication, custom headers, and upstream security.
- Keep snapshot inventory checks strict when generator output changes.

## Repository Health Priorities

- Add a portable documentation verification script for relative links and TypeScript fenced snippets.
- Keep roadmap, changelog, README, CLI help, examples, and docs configuration pages aligned before each release.
- Continue using packaged template files for generated source blocks that are too large for readable inline strings.
- Consider a release preflight script that runs CI, dependency maintenance, generated example checks, and documentation verification.
- Keep CI on the supported Node.js floor and periodically test the newest active Node.js version before 1.0.

## 1.0 Readiness Themes

- Stable CLI and programmatic API contracts
- Documented security responsibility boundaries for generated gateways
- Real-world WSDL fixture coverage across common enterprise schema patterns
- Clear upgrade guidance and deprecation policy
- Repeatable release workflow with package provenance and generated output verification

## Goals

### Technical

- Support most real-world WSDL files.
- Generate clean, strict TypeScript.
- Keep runtime dependencies minimal.
- Produce production-ready gateway scaffolds.
- Preserve end-to-end type safety from WSDL to HTTP response.

### Community

- Provide documentation and examples that match shipped behavior.
- Keep issues focused on reproducible bugs and discussions focused on design, adoption, and support.
- Make roadmap items specific enough for contributors to pick up.
