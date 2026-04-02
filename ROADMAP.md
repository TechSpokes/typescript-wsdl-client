# TypeScript WSDL Client Roadmap

Roadmap for the TypeScript WSDL/SOAP client generator, OpenAPI bridge, and Fastify gateway scaffolding.

## Current: 0.15.x Series

Focus: stability, compatibility, and documentation quality.

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
