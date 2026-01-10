# TypeScript WSDL Client Roadmap

Simple roadmap for the TypeScript WSDL → SOAP client generator.

## Current: 0.8.x Series

**What we have now:**
- Core WSDL/XSD parsing with proper TypeScript types
- CLI tool (`wsdl-tsc`) with five commands: `compile`, `client`, `openapi`, `gateway`, `pipeline`
- Programmatic API for all generation tasks
- Complex inheritance handling (`<extension>`, `<restriction>`)
- XML attribute marshaling with configurable keys
- Runtime metadata for JSON ⇄ SOAP conversion
- Choice element handling strategies
- WS-Policy security hints in generated code
- OpenAPI 3.1 generation with standard response envelopes
- **Full Fastify gateway generation with working handlers** (NEW in 0.9.0)
  - Automatic SOAP client integration via Fastify decorators
  - Centralized error handling with HTTP status mapping
  - Fastify plugin pattern for easy integration
  - Response envelope wrapping (SUCCESS/ERROR)

**Still working on:**
- Better error messages when WSDL parsing fails
- Edge cases in schema parsing
- Code generation consistency
- More comprehensive testing

## Next: 0.9.x Series

**Focus: Stability and Polish**

- Snapshot testing for generated code
- Integration tests for gateway handlers
- Documentation improvements
- Performance optimizations

## Future: 1.0.x Series

**Focus: Production Readiness**

Ideas we're considering:
- Configuration files for complex setups
- Watch mode for development
- Testing utilities and mock generation
- More WSDL edge case support
- Custom handler hooks/middleware

## Goals

**Technical:**
- Support most real-world WSDL files
- Generate clean, strict TypeScript
- Keep runtime dependencies minimal
- Production-ready gateway generation

**Community:**
- Good documentation and examples
- Responsive to user feedback and issues
