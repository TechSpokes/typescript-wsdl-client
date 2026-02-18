# TypeScript WSDL Client Roadmap

Simple roadmap for the TypeScript WSDL → SOAP client generator.

## Current: 0.11.x Series

**Focus: Stability and Testing**

Detailed plans: `scratches/plans/v011/`

**What's new in 0.11.0:**
- **Vitest test infrastructure** — ESM-native test runner with unit, snapshot, and integration test suites (200 tests, < 3s)
- **Snapshot testing** — full pipeline output captured as baselines, catches unintended generation changes
- **Client interface extraction** — typed `operations.ts` with concrete input/output types, enables mocking without SOAP dependencies
- **Integration tests** — gateway route handlers tested end-to-end via Fastify `.inject()` with mock SOAP clients
- **Schema-type alignment** — cross-validates TypeScript types, JSON schemas, and catalog entries
- **Error messages** — structured `WsdlCompilationError` with element/namespace context and `toUserMessage()` formatting
- **ArrayOf\* runtime unwrap** — `--openapi-flatten-array-wrappers` flag (default `true`): generates `unwrapArrayWrappers()` in runtime.ts to bridge the schema-type gap between flattened OpenAPI arrays and SOAP wrapper objects. Pass `false` to emit ArrayOf\* as `type: "object"` matching TypeScript types exactly.
- **Documentation** — testing guide, CLI reference updates, concepts documentation for array wrapper flattening

**What we have from 0.10.x:**
- Core WSDL/XSD parsing with proper TypeScript types
- CLI tool (`wsdl-tsc`) with six commands: `compile`, `client`, `openapi`, `gateway`, `app`, `pipeline`
- Programmatic API for all generation tasks
- Complex inheritance handling (`<extension>`, `<restriction>`)
- XML attribute marshaling with configurable keys
- Runtime metadata for JSON ⇄ SOAP conversion
- Choice element handling strategies
- WS-Policy security hints in generated code
- OpenAPI 3.1 generation with standard response envelopes
- Full Fastify gateway generation with working handlers (0.9.0)
- End-to-end type safety from WSDL to HTTP response (0.10.0)
- TypeScript app scaffold with overwrite protection (0.10.3)

**Still working on:**
- Edge cases in complex schema compositions

## Future: 1.0.x Series

**Focus: Production Readiness**

Ideas we're considering:
- Configuration files for complex setups
- Watch mode for development
- Testing utilities and mock generation for consumers
- More WSDL edge case support
- Custom handler hooks/middleware
- Typed response envelopes (`Reply: T` generics in route handlers)

## Goals

**Technical:**
- Support most real-world WSDL files
- Generate clean, strict TypeScript
- Keep runtime dependencies minimal
- Production-ready gateway generation
- End-to-end type safety from WSDL to HTTP response

**Community:**
- Good documentation and examples
- Responsive to user feedback and issues
