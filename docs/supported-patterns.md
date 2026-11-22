# Supported WSDL/XSD Patterns

This document lists the WSDL and XSD features handled by the generator, along with current limitations. For modeling details, see [Core Concepts](concepts.md).

The matrix describes the existing legacy generator except where a row explicitly names the checked profile. Opt-in [checked generation](checked-gateway.md) has a separate source/value/binding contract and installed HTTP/SOAP evidence; legacy rows do not imply checked-model support. Synthetic success establishes no real-provider or general-XSD coverage.

The qualified checked domain includes [keyed mixed, namespace-collision and source-permitted open values](checked-gateway.md#mixed-namespaced-and-open-values), with production conformance and installed request/response/fault evidence. Native strict/lax/skip checks remain distinct from schema-source wildcard checks and from the legacy rows below.

The opt-in [scoped lax wildcard profile](checked-gateway.md#scoped-lax-wildcards) qualifies supported SOAP 1.2 document/literal operations from pinned graphs. Installed evidence covers ONVIF Media `GetSnapshotUri` and refuses the same operation under `closed-operation-v1`.

## Checked atomic unions

Checked document/literal unions represent qualified atomic values and list-valued members as complete lexical strings. Unions with a QName member carry the namespace bindings alongside that string. Native validation preserves member order, whitespace and typed fixed/default equality. The dual SOAP 1.1/1.2 `assessment/atomic-unions.wsdl` fixture and independent generated and installed tests cover requests, success and faults. Literal headers use the same scalar rules. See the [lexical union contract](checked-gateway.md#native-facets-lists-and-lexical-atomic-unions).

For migration from the legacy `xs-union-simple-type` row, supply the XML lexical string for each union. Use `"42"` for a numeric member and `"1 2"` for a list-valued member. A union containing a list member is one value with its own native member selection.

## Checked atomic union lists

Checked document/literal lists compose qualified non-contextual atomic union members. Ordinary values are dense ordered arrays of lexical strings. Existing list-level pattern witnesses remain single strings. Native XML-list tokenization, member order, constraints and sequence typed equality govern defaults, fixed values and every fresh inverse.

The synthetic dual-binding `assessment/atomic-union-lists.wsdl` family covers requests, success, declared faults, generated HTTP values and shared literal headers. The installed atomic-union mode adds representative collections and whole-list witnesses with production-only dependencies and no checkout access. A list item has to be atomic or select an atomic union member. RPC lists and contextual values remain outside the profile.

## Checked scalar-base extensions

Checked document/literal generation accepts a complex-content extension of a qualified scalar-content complex base when the derived type has empty effective local content. Both absent content and an empty sequence inherit the exact scalar datatype, including its value constraints. Generated clients and gateways expose text under `$value` and validate the inherited attributes.

The `xsd/simple-content/scalar-base-extension.wsdl` fixture exercises both source forms over SOAP 1.1/1.2. A nonempty particle, effective `mixed="true"` on that extension, or a prohibition on extension prevents checked generation. See the [checked gateway contract](checked-gateway.md#scalar-base-complex-content-extension).

## Checked QNames

Checked document/literal generation represents a QName as `{"namespace":"urn:example","local":"Item"}` and lists of QNames as ordered arrays of those objects. Use an empty namespace string for an unqualified QName. Unions containing QName values and lists of those unions use a lexical string with explicit namespace bindings. Native validation uses the instance bindings and resolves source defaults and fixed values in the declaration scope. See the [QName migration and validation contract](checked-gateway.md#expanded-qname-values).

## Checked migration from legacy generated shapes

Checked generation requires a service and port selection when compatible bindings are ambiguous. Select the same SOAP port as the legacy integration before comparing artifacts. The selected binding controls the SOAP version and action.

Checked JSON represents `ArrayOf*` wrappers using their declared record or ordered content shape. Read the generated schema before switching clients that consume flattened legacy REST arrays. Checked choice, nil and wildcard shapes use the [mapping contract](mapping-contract.md), including ordered content where the schema needs it.

Selected operation documentation and XSD record and field annotations appear in generated TypeScript and OpenAPI. Operation comments also appear in the generated route. The [Part A checkpoint](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/checked-part-a-coverage.md) links the paired artifact and wire evidence.

## Checked SOAP envelope receiver

Incoming checked component SOAP 1.1/1.2 document/literal responses accept foreign qualified wrapper attributes while retaining native payload and fault validation. The default receiver enforces exact actor/role targeting and version-specific boolean lexicals; unknown targeted mandatory headers refuse before success or fault publication. Unprocessed blocks confer no trust or forwarding semantics. See the [receiver contract](checked-gateway.md#incoming-documentliteral-receiver) for URI identity, supported anyURI escaping, actual HTTP/XML Base context and `response-base-unavailable` limitations.

Handwritten XML and expected outcomes qualify wrappers, structure, targeting, lexicals, namespace identity, URI/base and encoding inheritance/reset through the production assessor. Owned HTTP/verified HTTPS and installed generated clients/gateways cover both versions, success/refusal, native invalid payload/detail, application-error branches and declared/protocol/one-way faults. The receiver and selected buffered integration cases run in Linux/Windows Node 24/26 installed-product jobs. Frozen direct and bounded RPC profiles retain their earlier contracts; broader protocol coverage remains open.

## Checked buffered SOAP

Checked buffered execution reuses the established runtime credential schema for Basic/Bearer, PEM/PFX mutual TLS, UsernameToken, outbound X509 signing and bounded NTLM. Declared global-element literal headers use native typed mappings and exact declaration IDs. Mandatory processing requires implemented callbacks; header faults retain a distinct outcome after Body validation. Endpoint queries, bounded HTTP compression and observed HTTP/XML Base context preserve original evidence and endpoint authority.

Metadata HTTP charset context survives original-byte snapshots, capsule comparisons and relocated reconstruction. A private transport descriptor supports otherwise-qualified legal names and metadata cycles without dependency prototype exposure. See the [buffered contract](checked-gateway.md#buffered-transport-and-runtime-credentials) for the concrete combination table, decoding policy and remaining exclusions. This does not qualify general attachments, streaming, incoming cryptographic security or richer policy families.

## Checked streaming

The [checked streaming profile](checked-gateway.md#checked-streaming) qualifies explicit SOAP 1.1 record paths for native client iteration and gateway NDJSON or JSON arrays. The checked Read fixture and synthetic Fetch controls distinguish record validation from completion of the declared scope.

## Checked one-way document literal

The checked-components profile supports WSDL 1.1 input-only document/literal operations over SOAP 1.1 and SOAP 1.2 HTTP(S). Complete empty 200/202/204 responses produce transport acknowledgements and an empty downstream 202; nonempty acknowledgement bodies, other statuses and contradictory source patterns refuse. Native protocol-fault, source/security, cancellation and body limits remain authoritative. RPC and multipart one-way forms remain unsupported; legacy defaults do not adopt the new contract.

The owned dual-binding fixture and conformance wire tests cover both versions, HTTP/verified HTTPS, acknowledgement/refusal/fault outcomes and V6/V7 isolation. Relocated production-only installed consumers qualify generated clients, OpenAPI, gateways and app/tests without checkout fallback. See the [one-way contract](checked-gateway.md#one-way-operations) for policy and compatibility limits; this does not establish production-provider or universal SOAP conformance.

## Checked SOAP 1.2 document/literal

Checked component generation executes supported SOAP 1.2 document/literal operations through the existing buffered adapter. The selected service/port/binding determines version and action; mixed SOAP 1.1/1.2 ports remain independent. [The checked gateway reference](checked-gateway.md#component-service-generation) describes fault results, artifact compatibility and header processing. The legacy matrix below continues to describe binding detection rather than checked execution.

SOAP 1.2 RPC/encoded, streaming, authentication and outgoing application/security headers remain separate capabilities. Owned-server evidence establishes the exercised protocol combinations, not general provider qualification.

## Checked SOAP 1.1 RPC string profile

Checked component generation supports the bounded RPC/encoded profile below. The [NOAA qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/noaa-ndfd-qualification.md) distinguishes all-12 owned-server execution, offline provider-response replay and the 2026-11-09 live retest: ten operations succeeded, while two GML operations returned non-SOAP provider errors. No geographic correctness claim follows.

| Capability | Status | Bounded contract |
|---|---|---|
| Typed RPC/encoded parts | Partial | Required strings, Booleans, decimal/integer/date/dateTime strings and native restrictions |
| RPC Boolean record | Partial | One flat required Boolean record with native particle and fixed-value validation |
| RPC result | Partial | One opaque string result under the original output part name |
| Component SOAP response encodings | Partial | UTF-8, strict ASCII, explicit UTF-16LE/BE, BOM UTF-16 and exact Latin1 |
| SOAP string references | Partial | Same-Body string `id`/`href`, inline strings and unambiguous roots |
| Unused locationless imports | Supported | Native component qualification resolves actual required references |

Request accessors follow source declaration order and the WSDL body namespace, with resolved native type names. JSON record property order is immaterial; native all-group validation permits unordered children while canonical writing is deterministic. Response struct and return-accessor local names may vary; the generated JSON response retains the source-owned part name. RPC/literal, other primitives, encoded arrays/shared or cyclic graphs, multiple results, declared RPC faults, headers and `parameterOrder` remain unsupported by this profile.

The component response decoder requires all present header/declaration/BOM assertions to agree. The [exact response encoding profile](checked-gateway.md#checked-response-encoding) covers strict `US-ASCII`/`ASCII`, explicitly labelled BOM-less UTF-16LE/BE, generic BOM-required UTF-16 and the existing matching-BOM explicit-label compatibility allowance. Absent assertions default to UTF-8; invalid UTF-8 never triggers Latin1 guessing. ISO-8859-1 preserves byte-to-code-point identity, including C1 bytes; XML 1.0 legality and caller limits still apply. Source decoding and the shipped direct-runtime policy remain separate. Existing string-RPC artifacts retain their identity; typed inputs have a distinct interpretation and fresh source compatibility checks.

## Capability Evidence Matrix

The rows below are backed by committed conformance fixtures under `test/conformance/fixtures/`. Status means the current product contract, not the full standards surface.

The [S06 research handoff](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/docs/content-model-s06-research-handoff.md) records separate attribute, derivation, wildcard and calendar evidence.
Candidate interpretations and test-only prototypes do not certify production assessment or change these public capability rows.

<!-- support-matrix:start -->
| Capability ID | Status | Public contract |
|---|---|---|
| `checked-streaming` | partial | Explicit stream selection yields native records and verifies full-response or authenticated companion scope at completion. |
| `checked-atomic-union-lists` | partial | Checked document/literal lists of qualified non-contextual atomic unions use ordered lexical string arrays or existing whole-list pattern witnesses. |
| `checked-atomic-unions` | partial | Checked document/literal unions of qualified non-contextual atomic members or lists of atomic values use complete lexical strings. |
| `checked-qnames` | partial | Checked document/literal QName scalars expose expanded names and QName-bearing unions carry lexical strings with namespace bindings. |
| `checked-scalar-base-extension` | partial | Checked document/literal extensions of qualified scalar-content complex types preserve the base scalar when local content is absent or an empty sequence. |
| `checked-buffered-soap` | partial | Checked buffered SOAP reuses runtime credentials and declared literal headers, bounded HTTP entities and independently pinned metadata context. |
| `checked-soap-envelope-receiver` | partial | Checked SOAP 1.1/1.2 document/literal responses admit qualified wrapper extensions and enforce default-receiver targeting with bounded URI/base support. |
| `checked-one-way-document-literal` | partial | Checked document/literal input-only operations use V6/V7 bindings and empty 202 transport acknowledgements; legacy defaults remain unchanged. |
| `declared-derivation-boundaries` | research | Legacy compilation characterizes omitted groups, appended restriction content and named recursive references; faithful resolution/composition remain internal. |
| `content-model-boundaries` | research | Characterization records current projection limits; it does not claim faithful content-model support. |
| `content-model-invalid-all` | research | Legacy compiler acceptance is characterized separately from independent schema rejection. |
| `sequence-occurrence-wrappers` | supported | Wrapping sequences with nonzero maxima propagate element bounds and optionality without crossing choice or all boundaries. |
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
| `xs-anyattribute` | supported | `xs:anyAttribute` is retained as catalog metadata and emitted as an optional wildcard attribute bag named by the configured attributes key. |
| `mtom-xop-attachment` | unsupported | MTOM/XOP binary attachment metadata is rejected because attachment transport is outside the 1.0 typed SOAP-to-REST contract. |
<!-- support-matrix:end -->

## Fully Supported

These patterns are handled end-to-end: WSDL parsing, TypeScript type generation, OpenAPI schema output, and gateway code generation.

Wrapping sequence bounds propagate through uninterrupted sequence ancestry to element array types and optionality. Traversal through `xs:choice`, `xs:all`, or a sequence with `maxOccurs="0"` retains the previous flattened behavior; wildcard and disabled-element handling are unchanged. This does not enforce sequence ordering or finite array lengths at runtime.

Generated clients normalize present, non-null singleton responses into arrays for repeated element properties. Real SOAP transport regressions cover singleton and multiple items, omitted optional request fields, and gateway serialization with wrapper flattening enabled and disabled. Regenerate clients to receive this runtime correction; omitted optional response properties remain absent.

- Complex types with nested `<xs:sequence>`, `<xs:all>`, and `<xs:choice>` compositors, subject to the projection limits above
- Simple content with attributes using the `$value` pattern to preserve text content alongside attribute properties
- Named simple type restrictions and enumerations emitted as TypeScript aliases and OpenAPI scalar schemas
- Named `xs:union` simple types emitted as TypeScript alias unions and OpenAPI `oneOf` schemas
- Nested XSD imports across multiple schema files with relative and absolute URI resolution
- Multiple namespaces with deterministic collision resolution via PascalCase uniqueness
- `<xs:choice>` elements modeled as parallel optional alternatives by default
- Opt-in `<xs:choice>` union mode with exclusive TypeScript branch unions and OpenAPI request constraints
- Optional and nillable fields using `minOccurs`, `maxOccurs`, and `nillable` attributes
- `ArrayOf*` wrapper types with automatic unwrapping in OpenAPI and runtime bridging in gateway code
- WSDL/XSD documentation annotations propagated into TypeScript JSDoc comments and OpenAPI descriptions
- Multiple WSDL ports and bindings; the first SOAP binding is selected, all ports are documented in service metadata
- SOAP 1.1 and SOAP 1.2 binding detection
- Streamable SOAP responses, opt-in per operation via `--stream-config` (ADR-002): client exposes `AsyncIterable<RecordType>`, gateway emits NDJSON or JSON array streams with backpressure, OpenAPI advertises the record schema via `x-wsdl-tsc-stream`
- `xs:any` wildcard particles retained on compiled types for stream-candidate detection and companion-catalog shape resolution
- `xs:anyAttribute` wildcard attributes emitted as an optional configured attribute bag, defaulting to `$attributes`

### xs:anyAttribute

Attribute wildcards are retained as catalog metadata and emitted as an optional wildcard attribute bag on the enclosing generated type. The bag property uses the configured client attributes key, defaulting to `$attributes`, and maps arbitrary wildcard attribute names to string values.

Known XML attributes remain flattened as peer properties. Wildcard attributes stay inside the bag so unknown names do not collide with child elements or known attributes.

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

The `declared-derivation-boundaries` fixture characterizes the legacy default: its named group elements and attribute-group uses are omitted from the containing compiled type. General group support is therefore unqualified. Internal [reference resolution](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-resolution.md) preserves complete group definitions and separate use-site bounds; [companion reuse](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-companions.md) carries their required closures. These internal results do not establish public generation support.

### Extension and restriction

The same executable fixture distinguishes current legacy behavior: extension appends local properties, but restriction also appends them and empty restriction retains base content. A prohibited optional attribute remains in legacy metadata. Faithful restriction, attribute composition and immutable sibling behavior are covered by internal [derivation tests](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-composition.md), with full legality assessment assigned to #179. Public faithful derivation support remains unqualified.

### xs:list

List types with an `itemType` attribute are detected and generate array types (`${itemType}[]`). Lists defined with inline simple types are not handled.

### xs:union

Union types with `memberTypes` or inline simple type members are detected and generate TypeScript alias unions. Mixed primitive and literal unions generate OpenAPI `oneOf` schemas.

## Not Yet Supported

These features are not currently handled. Contributions are welcome.

- Full `xs:any` element serialization: arbitrary wildcard element content is not emitted as a typed contract
- Abstract types: rejected with a diagnostic; no polymorphic instance handling
- Substitution groups: rejected with a diagnostic; no polymorphic element expansion
- MTOM/XOP binary attachments: rejected with a diagnostic; no binary part handling
- WS-ReliableMessaging, WS-Addressing beyond basic headers
- Custom serialization hooks for non-standard XML patterns

## Known Edge Cases

### Response schema complexity limit

Gateway generation measures the `$ref` graph depth for each operation response. When the number of unique `$ref` targets exceeds 150, the response serialization schema is skipped and the route falls back to `JSON.stringify`. This avoids a depth limit in `fast-json-stringify`. The threshold is controlled by `REF_COMPLEXITY_LIMIT` in `src/gateway/helpers.ts`.

### Circular references

The S05 characterization fixture preserves named self and mutual recursive references in legacy metadata. This does not establish complete graph resolution, forbidden-cycle diagnostics or faithful runtime handling. Internal S05 resolution and companion traversal retain complete immutable declarations and terminate on recursive values; those guarantees are not yet activated in public emitters.

### First binding selection

When a WSDL defines multiple bindings, the compiler selects the first SOAP binding encountered. If your WSDL has multiple bindings for different protocols, the non-SOAP bindings are ignored. All ports are still recorded in service-level metadata.
