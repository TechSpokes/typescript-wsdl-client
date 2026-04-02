# Supported WSDL/XSD Patterns

This document lists the WSDL and XSD features handled by the generator, along with current limitations. For modeling details, see [Core Concepts](concepts.md).

## Fully Supported

These patterns are handled end-to-end: WSDL parsing, TypeScript type generation, OpenAPI schema output, and gateway code generation.

- Complex types with `<xs:sequence>`, `<xs:all>`, and `<xs:choice>` compositors, including recursive nesting
- Simple content with attributes using the `$value` pattern to preserve text content alongside attribute properties
- Type inheritance through `<xs:extension>` and `<xs:restriction>` on both simple and complex content
- Nested XSD imports across multiple schema files with relative and absolute URI resolution
- Multiple namespaces with deterministic collision resolution via PascalCase uniqueness
- `<xs:choice>` elements modeled as parallel optional alternatives
- Optional and nillable fields using `minOccurs`, `maxOccurs`, and `nillable` attributes
- `ArrayOf*` wrapper types with automatic unwrapping in OpenAPI and runtime bridging in gateway code
- WSDL/XSD documentation annotations propagated into TypeScript JSDoc comments and OpenAPI descriptions
- Circular type references detected and broken with minimal stub types
- Multiple WSDL ports and bindings; the first SOAP binding is selected, all ports are documented in service metadata
- SOAP 1.1 and SOAP 1.2 binding detection

## Partially Supported

These patterns work in common cases but have known limitations.

### WS-Policy and WS-Security hints

The compiler scans inline policies for UsernameToken, TransportBinding, and X509Token patterns and records them in `operation.security[]`. External `PolicyReference` elements pointing to out-of-band policy documents are not resolved.

### xs:group and xs:attributeGroup

Groups are inlined into the parent type during schema compilation. The group identity is not preserved as a separate named type in the output, but all elements and attributes from the group appear correctly in the containing type.

### xs:list

List types with an `itemType` attribute are detected and generate array types (`${itemType}[]`). Lists defined with inline simple types are not handled.

## Not Yet Supported

These features are not currently handled. Contributions are welcome.

- `xs:any` and `xs:anyAttribute`: unrecognized elements fall through to an untyped representation
- `xs:union` types: only union members expressed as restriction enumerations are captured
- Abstract types: treated as regular concrete types without substitution logic
- Substitution groups: not resolved during schema compilation
- MTOM/XOP binary attachments: no support for binary part handling
- WS-ReliableMessaging, WS-Addressing beyond basic headers
- Custom serialization hooks for non-standard XML patterns

## Known Edge Cases

### Response schema complexity limit

Gateway generation measures the `$ref` graph depth for each operation response. When the number of unique `$ref` targets exceeds 150, the response serialization schema is skipped and the route falls back to `JSON.stringify`. This avoids a depth limit in `fast-json-stringify`. The threshold is controlled by `REF_COMPLEXITY_LIMIT` in `src/gateway/helpers.ts`.

### Circular references

Recursive type references are detected during compilation and broken with a minimal stub. The generated TypeScript types are correct for non-recursive paths, but deeply recursive structures may produce simplified types at the recursion boundary.

### First binding selection

When a WSDL defines multiple bindings, the compiler selects the first SOAP binding encountered. If your WSDL has multiple bindings for different protocols, the non-SOAP bindings are ignored. All ports are still recorded in service-level metadata.
