# Supported WSDL/XSD Patterns

This document lists the WSDL and XSD features handled by the generator, along with current limitations. For modeling details, see [Core Concepts](concepts.md).

## Capability Evidence Matrix

The rows below are backed by committed conformance fixtures under `test/conformance/fixtures/`. Status means the current product contract, not the full standards surface.

<!-- support-matrix:start -->
| Capability ID | Status | Public contract |
|---|---|---|
| `weather-document-literal-soap` | supported | The canonical weather WSDL compiles through client, OpenAPI, gateway, generated-test, and app artifacts with document-literal SOAP operations. |
| `sequence-baseline-complex` | supported | Complex type sequences support nested complex references, repeated elements, optional fields, and all-optional request wrappers. |
| `simple-restriction-list` | supported | Named simple type restrictions, enumerations, and `xs:list` declarations emit aligned TypeScript aliases and OpenAPI schemas. |
| `same-name-simple-alias` | supported | A global element with the same local name as its named simple type reuses the scalar alias instead of emitting a duplicate wrapper interface. |
| `simple-content-attributes` | supported | Simple content emits text content through `$value` and flattens XML attributes as peer properties. |
| `documentation-propagation` | supported | WSDL and XSD documentation propagates into catalog metadata, generated TypeScript comments, OpenAPI descriptions, and gateway route comments. |
| `soap12-first-binding` | supported | SOAP 1.1 and SOAP 1.2 bindings are detected, and the first SOAP binding deterministically provides operation binding metadata. |
| `xsd-import-relative` | supported | Relative XSD imports are resolved and imported complex types participate in client, OpenAPI, gateway, generated-test, and app artifacts. |
| `choice-union-simple` | supported | `xs:choice` union mode retains choice metadata and drives generated TypeScript/OpenAPI constraints. |
| `xs-union-simple-type` | supported | Simple `xs:union` aliases compile to TypeScript unions and OpenAPI `oneOf` schemas. |
| `abstract-complex-type` | diagnostic | Abstract complex types are rejected with a diagnostic instead of being treated as concrete. |
| `substitution-group-element` | diagnostic | Substitution groups are rejected with a diagnostic instead of being silently omitted. |
| `multi-binding-first-soap` | partial | Multiple bindings are deterministic: the first SOAP binding is selected and all ports are documented. |
| `external-policy-reference` | partial | Inline policy hints are detected; external `PolicyReference` documents are not fetched or resolved. |
| `deep-composition-sequence` | supported | Deep nested sequences compile into deterministic type metadata. |
| `xs-anyattribute` | partial | `xs:anyAttribute` is retained as catalog metadata, but generated wildcard attributes are not emitted. |
| `mtom-xop-attachment` | unsupported | MTOM/XOP binary attachment metadata is rejected because attachment transport is outside the 1.0 typed SOAP-to-REST contract. |
<!-- support-matrix:end -->

## Fully Supported

These patterns are handled end-to-end: WSDL parsing, TypeScript type generation, OpenAPI schema output, and gateway code generation.

- Complex types with `<xs:sequence>`, `<xs:all>`, and `<xs:choice>` compositors, including recursive nesting
- Simple content with attributes using the `$value` pattern to preserve text content alongside attribute properties
- Named simple type restrictions and enumerations emitted as TypeScript aliases and OpenAPI scalar schemas
- Named `xs:union` simple types emitted as TypeScript alias unions and OpenAPI `oneOf` schemas
- Type inheritance through `<xs:extension>` and `<xs:restriction>` on both simple and complex content
- Nested XSD imports across multiple schema files with relative and absolute URI resolution
- Multiple namespaces with deterministic collision resolution via PascalCase uniqueness
- `<xs:choice>` elements modeled as parallel optional alternatives by default
- Opt-in `<xs:choice>` union mode with exclusive TypeScript branch unions and OpenAPI request constraints
- Optional and nillable fields using `minOccurs`, `maxOccurs`, and `nillable` attributes
- `ArrayOf*` wrapper types with automatic unwrapping in OpenAPI and runtime bridging in gateway code
- WSDL/XSD documentation annotations propagated into TypeScript JSDoc comments and OpenAPI descriptions
- Circular type references detected and broken with minimal stub types
- Multiple WSDL ports and bindings; the first SOAP binding is selected, all ports are documented in service metadata
- SOAP 1.1 and SOAP 1.2 binding detection
- Streamable SOAP responses, opt-in per operation via `--stream-config` (ADR-002): client exposes `AsyncIterable<RecordType>`, gateway emits NDJSON or JSON array streams with backpressure, OpenAPI advertises the record schema via `x-wsdl-tsc-stream`
- `xs:any` wildcard particles retained on compiled types for stream-candidate detection and companion-catalog shape resolution

### Named simple types and same-name elements

Named `xs:simpleType` declarations compile to TypeScript type aliases. Restriction enumerations compile to string literal unions in TypeScript and `enum` scalar schemas in OpenAPI.

When a global `xs:element` has the same local name as a referenced named simple type, the generator reuses the simple type alias. It does not emit a second wrapper interface with the same TypeScript name.

```xml
<xs:simpleType name="MyEnum">
  <xs:restriction base="xs:string">
    <xs:enumeration value="Red"/>
    <xs:enumeration value="Green"/>
  </xs:restriction>
</xs:simpleType>
<xs:element name="MyEnum" nillable="true" type="tns:MyEnum"/>
```

The generated TypeScript type is a scalar alias:

```typescript
export type MyEnum = "Red" | "Green";
```

If a message part uses `tns:MyEnum` as the operation root element, the generated client method uses `MyEnum` directly for the request or response payload type.

The compiler records this reuse as an informational catalog diagnostic. CLI commands print it as a `Note:` line, not as a warning.

## Partially Supported

These patterns work in common cases but have known limitations.

### WS-Policy and WS-Security hints

The compiler scans inline policies for UsernameToken, TransportBinding, and X509Token patterns and records them in `operation.security[]`. External `PolicyReference` elements pointing to out-of-band policy documents are not resolved.

### xs:group and xs:attributeGroup

Groups are inlined into the parent type during schema compilation. The group identity is not preserved as a separate named type in the output, but all elements and attributes from the group appear correctly in the containing type.

### xs:list

List types with an `itemType` attribute are detected and generate array types (`${itemType}[]`). Lists defined with inline simple types are not handled.

### xs:union

Union types with `memberTypes` or inline simple type members are detected and generate TypeScript alias unions. Mixed primitive and literal unions generate OpenAPI `oneOf` schemas.

### xs:anyAttribute

Attribute wildcards are retained as catalog metadata on the enclosing compiled type. They are not emitted as typed attribute properties in generated TypeScript or OpenAPI schemas.

## Not Yet Supported

These features are not currently handled. Contributions are welcome.

- Full `xs:any` serialization: arbitrary wildcard content is not emitted as a typed contract
- Abstract types: rejected with a diagnostic; no polymorphic instance handling
- Substitution groups: rejected with a diagnostic; no polymorphic element expansion
- MTOM/XOP binary attachments: rejected with a diagnostic; no binary part handling
- WS-ReliableMessaging, WS-Addressing beyond basic headers
- Custom serialization hooks for non-standard XML patterns

## Known Edge Cases

### Response schema complexity limit

Gateway generation measures the `$ref` graph depth for each operation response. When the number of unique `$ref` targets exceeds 150, the response serialization schema is skipped and the route falls back to `JSON.stringify`. This avoids a depth limit in `fast-json-stringify`. The threshold is controlled by `REF_COMPLEXITY_LIMIT` in `src/gateway/helpers.ts`.

### Circular references

Recursive type references are detected during compilation and broken with a minimal stub. The generated TypeScript types are correct for non-recursive paths, but deeply recursive structures may produce simplified types at the recursion boundary.

### First binding selection

When a WSDL defines multiple bindings, the compiler selects the first SOAP binding encountered. If your WSDL has multiple bindings for different protocols, the non-SOAP bindings are ignored. All ports are still recorded in service-level metadata.
