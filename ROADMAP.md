# TypeScript WSDL Client Roadmap

Simple roadmap for the TypeScript WSDL → SOAP client generator.

## Current: 0.10.x Series

**What we have now:**
- Core WSDL/XSD parsing with proper TypeScript types
- CLI tool (`wsdl-tsc`) with six commands: `compile`, `client`, `openapi`, `gateway`, `app`, `pipeline`
- Programmatic API for all generation tasks
- Complex inheritance handling (`<extension>`, `<restriction>`)
- XML attribute marshaling with configurable keys
- Runtime metadata for JSON ⇄ SOAP conversion
- Choice element handling strategies
- WS-Policy security hints in generated code
- OpenAPI 3.1 generation with standard response envelopes
- **Full Fastify gateway generation with working handlers** (0.9.0)
  - Automatic SOAP client integration via Fastify decorators
  - Centralized error handling with HTTP status mapping
  - Fastify plugin pattern for easy integration
  - Response envelope wrapping (SUCCESS/ERROR)
- **Runnable Fastify app generator** (0.9.2)
  - One-command full application with client, gateway, and server
- **End-to-end type safety** from WSDL to HTTP response (0.10.0):
  - Concrete client class type in plugin options and decorator
  - Typed `request.body` via Fastify route generics (`Body: T`)
  - Build-time type-check fixture (`_typecheck.ts`)
  - Named operations interface for mocking and autocomplete
- **TypeScript app scaffold with overwrite protection** (0.10.3)
  - Full TypeScript scaffold (server.ts, config.ts, package.json, tsconfig.json)
  - App scaffold rewrites OpenAPI servers array to match configured localhost port

**Still working on:**
- Better error messages when WSDL parsing fails
- Edge cases in complex schema compositions

## Next: 0.11.x Series

**Focus: Stability and Testing**

- Snapshot testing for generated code
- Integration tests for gateway handlers
- Generic client interface extraction (enables mocking without SOAP dependencies)
- Schema-type alignment verification (JSON Schema vs TypeScript types)
- Documentation improvements

## Future: 1.0.x Series

**Focus: Production Readiness**

Ideas we're considering:
- Configuration files for complex setups
- Watch mode for development
- Testing utilities and mock generation
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
