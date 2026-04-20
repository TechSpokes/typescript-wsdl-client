# TypeScript WSDL Client Roadmap

Roadmap for the TypeScript WSDL/SOAP client generator, OpenAPI bridge, and Fastify gateway scaffolding.

## Current: 0.17.x Series

Focus: streaming large SOAP responses and schema-accuracy improvements while keeping buffered output byte-for-byte unchanged.

### Recent highlights (0.16 through 0.17)

- Opt-in streamable SOAP responses (ADR-002): per-operation `--stream-config`, client `StreamOperationResponse<T>` with `AsyncIterable<RecordType>`, gateway NDJSON with backpressure, OpenAPI `x-wsdl-tsc-stream` extension
- Companion-catalog shape resolution: map opaque `xs:any` wrappers to concrete record types from a second WSDL or pre-compiled catalog, with structural-equality collision checks
- Compiler now retains `xs:any` wildcard particles on compiled types instead of silently dropping them
- SAX-driven streaming runtime (`parseRecords`, `toNdjson`) with chunk-boundary fuzz-tested correctness
- Same-name simple-type element reuse avoids duplicate enum declarations; compiler records diagnostic notes for modeling decisions
- Generated mock clients yield async-iterable records for stream operations; generated happy-path tests assert NDJSON content-type and parseable records
- `saxes ^6.0.0` promoted from devDependency to runtime dependency and pinned into generated app scaffolds

### Recent highlights (0.12 through 0.15)

- WSDL/XSD documentation propagation into catalog metadata, TypeScript JSDoc comments, and OpenAPI descriptions
- OpenAPI operation summaries derived from WSDL documentation with configuration file override precedence
- Gateway route header comments propagated from OpenAPI summaries
- Generated Vitest test suite for gateway artifacts via `--test-dir` and `--force-test` flags
- TypeScript 6.0 compatibility (explicit `types: ["node"]`, typed callback parameters, relative tsconfig paths)
- Dependency updates: TypeScript 6.0.2, soap 1.8.0, fast-xml-parser 5.5.8, Vitest 4.1.0

### What we have from earlier releases

- Core WSDL/XSD parsing with proper TypeScript types
- CLI tool (`wsdl-tsc`) with six commands: `compile`, `client`, `openapi`, `gateway`, `app`, `pipeline`
- Programmatic API for all generation tasks
- Complex inheritance handling (`<extension>`, `<restriction>`)
- XML attribute marshaling with configurable keys
- Runtime metadata for JSON to SOAP conversion
- Choice element handling strategies
- WS-Policy security hints in generated code
- OpenAPI 3.1 generation with standard response envelopes
- Full Fastify gateway generation with working handlers
- End-to-end type safety from WSDL to HTTP response
- TypeScript app scaffold with overwrite protection
- Vitest test infrastructure with unit, snapshot, and integration suites
- Client interface extraction for mockable `operations.ts`
- Schema-type alignment cross-validation
- `ArrayOf*` runtime unwrap with `--openapi-flatten-array-wrappers` flag
- Optional JSON configuration files for security, tags, and per-operation overrides

### Still working on

- Edge cases in complex schema compositions
- Documentation and positioning improvements

## Future: 1.0.x Series

Focus: production readiness and remaining feature gaps.

Ideas we are considering:

- Watch mode for development
- Testing utilities and mock generation for consumers
- More WSDL edge case support (xs:union, abstract types, substitution groups)
- Custom handler hooks and middleware extension points
- Typed response envelopes with `Reply<T>` generics in route handlers
- `json-array` streaming format to complement the existing `ndjson` format
- Streaming request bodies for upload-style SOAP operations

## Goals

### Technical

- Support most real-world WSDL files
- Generate clean, strict TypeScript
- Keep runtime dependencies minimal
- Production-ready gateway generation
- End-to-end type safety from WSDL to HTTP response

### Community

- Good documentation and examples
- Responsive to user feedback and issues
