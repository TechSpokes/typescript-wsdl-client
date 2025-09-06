# TypeScript WSDL Client Roadmap

Simple roadmap for the TypeScript WSDL → SOAP client generator.

## Current: 0.5.x Series

**What we have now:**
- Core WSDL/XSD parsing with proper TypeScript types
- CLI tool (`wsdl-tsc`) with essential flags
- Programmatic API (`compileWsdlToProject`)
- Complex inheritance handling (`<extension>`, `<restriction>`)
- XML attribute marshalling with configurable keys
- Runtime metadata for JSON ⇄ SOAP conversion
- Choice element handling strategies
- WS-Policy security hints in generated code

**Still working on:**
- Better error messages when WSDL parsing fails
- Edge cases in schema parsing
- Code generation consistency

## Next: 0.6.x Series

**Focus: Documentation**

We're currently working on comprehensive documentation:
- Complete usage examples and tutorials
- API reference documentation
- Integration guides for common frameworks
- Migration examples from other SOAP libraries
- Better CLI help and error messages

## Future: 0.7.x Series

**Focus: OpenAPI Integration**

Add OpenAPI 3.1 generation to make it easier to create REST API gateways for SOAP services:
- Generate OpenAPI 3.1 specs from WSDL files
- Map SOAP operations to RESTful endpoints
- JSON Schema generation for request/response types
- Integration patterns for API gateways

## Beyond 0.7

Ideas we're considering:
- Configuration files for complex setups
- Watch mode for development
- Testing utilities and mock generation
- Performance optimizations
- More WSDL edge case support

## Goals

**Technical:**
- Support most real-world WSDL files
- Generate clean, strict TypeScript
- Keep runtime dependencies minimal

**Community:**
- Good documentation and examples
- Responsive to user feedback and issues

---

*Have feedback or ideas? Open an [issue](/issues) or start a [discussion](/discussions).*
