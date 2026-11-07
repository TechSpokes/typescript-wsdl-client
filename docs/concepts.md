# Core Concepts and Advanced Topics

This document covers the design principles and modeling strategies used by
TypeScript WSDL Client. For installation, quick-start, and CLI usage see the
[README](../README.md).

## Flattening and $value

Attributes and elements become peer properties with no nested wrapper noise.

Given a WSDL complex type with simple content:

```xml
<xs:complexType name="Price">
  <xs:simpleContent>
    <xs:extension base="xs:decimal">
      <xs:attribute name="currency" type="xs:string"/>
    </xs:extension>
  </xs:simpleContent>
</xs:complexType>
```

The generator produces a flat interface:

```typescript
interface Price {
  currency?: string;  // attribute
  $value: string;     // text content (decimal mapped to string by default)
}
```

## Mapping terminology and naming

Use one term for one concept across source analysis, internal code, generated types, application JSON, OpenAPI descriptions and documentation. Different concepts must not share a convenient label merely because their current representations look alike. This section owns the conceptual vocabulary; the reserved-key inventory below owns mapping-property spellings and their implementation status.

| Term | Meaning |
|---|---|
| Element | An XML element declaration or instance, distinguished explicitly by context |
| Attribute | An XML attribute; its identity and rules are distinct from a child element |
| Sequence | A source constraint requiring its members in order |
| Choice | A source constraint permitting alternatives |
| Alternative | One permitted member of a choice; it can itself contain several fields |
| All group | The XSD `all` compositor, with its own rules; not a synonym for sequence |
| Application group | A generated object keeping related values and constraints together; it need not be an XML wrapper |
| Occurrence bounds | The allowed minimum and maximum repetitions of the particular source particle |
| Content | An element's ordered text and child elements; attributes are separate |
| Value | Data assessed under the selected type; use text, scalar value or structured value when specificity matters |
| Projection | The mapping between source-defined XML values and application values |
| Expanded name | Namespace URI plus local name, independently of the chosen prefix |
| Namespace binding | A prefix-to-namespace association in the applicable scope |
| Nil | Explicit absence of content on a present element, distinct from a missing element or empty non-nil value |

A choice is a rule, an alternative is a permitted branch, and a selection is an instance's use of a branch. They are not interchangeable glossary terms. The research now uses `$choice` for a choice site; source occurrence bounds determine whether its value is one object or an array, just as they do for other items.

Keep the canonical word stem when deriving related names: normal TypeScript casing for internal identifiers and type names, and `$` plus lower camel case for mapper-owned application properties. Source-derived XML data names and established profile mappings retain their declared spellings. The bounded allocator below names opt-in checked groups without renaming ordinary business fields.

Private source-graph and configuration objects do not need `$` prefixes merely to follow the payload namespace rule, but their names and descriptions must use the same concepts. Standards-owned names such as XSD `minOccurs`, existing graph `occurs`, and JSON Schema `oneOf` have explicit semantic mappings rather than mechanical renames. Choose `oneOf`, `anyOf` or other schema operators for their actual validation meaning, not because their names resemble a source term.

An OpenAPI property must use the exact JSON key accepted by the mapper, validator and serializer; titles and descriptions must explain that same concept. Schema definition and TypeScript type names derive deterministically from the source identity and role, with collision handling; human-readable names alone are not component identity.

Reuse a shared name constant or source-owned mapping description where code and schemas need the same key. Keep independently authored test inputs literal so they can expose drift instead of reproducing the implementation's mistake. When terminology or a key changes, update its inventory entry, code, schemas, examples, errors and tests together; record any compatibility handling explicitly rather than silently accepting a synonym.

This convention does not create another architecture layer, public mode or mandatory vocabulary migration. Existing mismatches remain visible review work, not templates for introducing more synonyms. File and directory names continue to follow [file naming and path organization](file-naming-and-path-organization.md).

### Choice groups and named alternatives

Enable checked groups with `applicationGroups: {}` in the existing checked generation configuration. Each record uses reconstructible structured groups or retains its existing ordered presentation, with its disposition/reason in `inventory.json`. Absence of this option preserves existing checked shapes and generated artifacts.

Use `$choice`, `$choice2` and subsequent numbers for independent choice sites in one containing application object, in retained source order. Repeated sequences use `$sequence`, `$sequence2` and subsequent numbers. Repeating a site uses one array without pluralizing its key or item type; JSON property order never controls XML order.

| Source bounds | Application value | Schema |
|---|---|---|
| `1..1` | One alternative object | Required property referencing the choice union |
| `0..1` | Omitted or one alternative object | Optional property referencing the choice union |
| `1..3` | Array, including for one occurrence | Required array with `minItems: 1`, `maxItems: 3` |
| `0..unbounded` | Optional array | Array with no finite maximum |

Optional repeated groups with nonempty bodies accept an empty array and canonically omit that property without mutating input. Required minima and finite maxima retain source bounds. Empty-capable bodies and ambiguous partitions retain ordered values and ADR-003 normalization; optional occurrence bounds alone do not make a body empty-capable.

Every structured alternative has a named object schema and TypeScript type, including singleton choices. For a source type `Request`, defaults are union `RequestChoice` and objects `RequestChoiceAlternative1` and `RequestChoiceAlternative2`. A repeated sequence references its named item object; recursive types remain finite references rather than unrolled combinations.

A single property references the union directly; an array references the same union in `items`, and TypeScript uses `RequestChoice[]`. Sharing application schema structure does not merge the distinct native source declarations used for reconstruction.

Default type stems use the owning named type's local name, or the anonymous type's containing element and scoped path digest, followed by `Choice` or `Sequence`. Nonalphanumeric source characters use injective `_u<hex>_` escaping; anonymous stems use `___Anonymous_<digest>`. Nested generated roles use `___` boundaries, which cannot occur in escaped source stems, and contribute once; alternatives append `Alternative1`, `Alternative2` and subsequent numbers in source order. Several source type namespaces with the same local name receive a namespace digest suffix.

Retain complete business names ending in `Choice`, `Choices` or `Sequence`; source type `PaymentChoice` therefore produces `PaymentChoiceChoice`. Default collisions append an underscore and the first twelve hexadecimal digits of the source-target digest. Ordinary fields and unrelated distinct declarations keep their names; explicit names never receive silent collision suffixes.

Several occurrences of one choice site use one array. Several independent choice sites need distinct reserved properties and distinct contextual schemas; merging them into one array would lose their separate rules. The source identity and structural position distinguish such sites even when the alternatives have identical field names; display names do not establish identity.

### Configured application names

The optional `applicationGroups.names` array configures the synthetic property, union/item type and structured alternative names independently. Generate with `applicationGroups: {}`, copy opaque tokens from `inventory.json` under `applicationGroups.targets`, and regenerate with entries containing `target`, optional `propertyName` and optional `typeName`. The same data works in `--checked-config` and `PipelineOptions.checkedComponents`; no additional command or flag is needed.

| Naming target | Prototype default | Example configured name |
|---|---|---|
| Synthetic group property | `$choice` | `$payment` |
| Union type and schema | `RequestChoice` | `PaymentMethod` |
| First alternative type and schema | `RequestChoiceAlternative1` | `CardPayment` |
| Second alternative type and schema | `RequestChoiceAlternative2` | `BankPayment` |

Such names change presentation, not the source definition: `$payment` can reference `PaymentMethod` or `PaymentMethod[]`, and the union references `CardPayment` and `BankPayment`. Group bounds, required fields, alternative membership, source XML names/namespaces and native validation remain governed by the same selected source contract. Renaming an alternative's schema does not add a discriminator or an XML wrapper.

Target overrides by exact scoped source identity and structural role, including the choice site and alternative, rather than only by a generated display name, field spelling or an occurrence in one value. Source order provides the prototype's alternative numbers but is not by itself a stable configuration selector across source revisions. Provide discoverable source selectors; unknown or ambiguous targets fail rather than silently doing nothing, and an alias never becomes another selector for an alias chain.

Resolve default and configured names before emission and use that one mapping for TypeScript declarations, OpenAPI components and references, JSON validation, adapters, serializers, diagnostics and examples. A synthetic property keeps the `$` prefix after renaming; type/schema aliases must be valid for their generated targets. Reject conflicting aliases in the relevant property/type/schema scopes, including collisions with other configured names, source-derived names and reserved mapping keys; do not silently overwrite or suffix an explicitly requested name.

A configured alias selects the emitted/accepted name for that generated contract, not additional runtime synonyms. For example, a contract configured with `$payment` does not also accept `$choice` by default. Changing published keys or type names needs an explicit compatibility disposition and regenerated matching artifacts; runtime callers cannot submit naming configuration or change the native source binding through the payload.

Choice and sequence targets accept either override; alternative targets accept only `typeName`. Properties must be `$` followed by a lower-camel ASCII identifier and cannot use reserved metadata keys; type names must be non-reserved ASCII TypeScript identifiers that are unchanged valid OpenAPI component keys. Unknown fields, duplicate targets, stale targets, accessors, proxies, malformed arrays and scoped collisions fail before artifact emission.

Tokens are `ag1:` plus a SHA-256 digest of scoped owning/source/use-site identities, structural role and a guard of the selected record's effective particle shape. They are independent of physical snapshot paths, unrelated global declaration order, display names and aliases. A relevant particle edit invalidates old tokens; regenerate defaults and copy new tokens rather than migrating by position.

Names are definition-scoped within the selected service, including recursive references and reuse across request, response and fault directions. Named-group uses in different owning records remain distinct targets. Inventory is diagnostic data only; capsules persist the selected options and reconstruction rederives them against authenticated authorized sources, while mismatched generated artifacts refuse.

## Reserved mapping keys

Keys introduced by the mapper into XML-derived application objects must start with `$`. XML element and attribute names remain source-derived data keys; generated grouping objects, text slots and interpretation metadata must not occupy that same unprefixed namespace. The XML name grammar excludes `$`, so an actual XML child `choice` and the synthetic `$choice` container remain distinct.

This convention applies recursively to synthetic mapping properties, including metadata descriptors if retained. It does not rename private TypeScript variables, source graph fields, artifact/configuration schemas or actual XML data keys. Entries inside data dictionaries, such as prefixes in `$namespaces` and XML names in an attribute bag, are data rather than additional synthetic property names.

### Mapping-key inventory and status

The inventory distinguishes existing behavior from the [selected mapping contract](roadmap/v1.0-xml-json-mapping.md#selected-keyed-mapping-contract). [Checked mixed/namespace/open mappings](checked-gateway.md#mixed-namespaced-and-open-values) implement the qualified keyed slice, and opt-in application groups implement the bounded reconstructible grammar above. Research-only dynamic-type forms remain handoffs rather than production capability claims.

| Key | Meaning and scope | Status |
|---|---|---|
| `$value` | Scalar text/simple content alongside attributes; exact scalar policy belongs to the selected mapping | Existing legacy/component convention |
| `$attributes` | Attribute channel; named entries derive unique source identities, otherwise distinguish unqualified scalars and namespaced holders | Existing legacy bags unchanged; qualified checked keyed fallback |
| `$content` | Ordered content; new entries are text objects or one named child occurrence | Existing ordered shapes unchanged; qualified checked keyed mixed/open grammar |
| `$choice`, `$choice2`, ... | Complete source choice; object or array from source bounds | Opt-in checked application groups |
| `$sequence`, `$sequence2`, ... | Source sequence item; array for repeated groups | Opt-in checked application groups |
| `$nil` | Explicit assessed nil marker, exactly `true`, alongside applicable source-mapped attributes | [Checked component nil values](checked-gateway.md#nil-values); no null shorthand |
| `$namespace` | Actual namespace URI of the element/attribute/type identity at this location | Qualified checked element/attribute metadata; type execution remains separate |
| `$namespaces` | Prefix bindings introduced/rebound here, inherited by descendants | Qualified checked snapshot-at-boundary plus local-delta contract |
| `$type` | Explicit assessed type identity with flat `$name`/`$namespace` strings | Selected research shape; native type checks remain required |
| `$name` | XML type name string within `$type` | Selected research shape; never a nested name object or child-name duplicate |

Configured group aliases allocate only their selected `$` property spelling. `$selection` and `$selections` were superseded research spellings; `$choices` is not a plural alias. `$text` and `$element` occur in comparison alternatives only and are not additional accepted spellings.

### Existing unprefixed descriptors requiring a deliberate correction

Existing checked ordered entries contain `name` and `value`, with `namespace` and `local` inside their identity descriptor. Those describe the mapping rather than XML business properties; their existing implementation is recorded compatibility work, not justification for using unprefixed metadata in new mappings.

| Existing descriptor property | Prefixed spelling if that descriptor is retained | Disposition |
|---|---|---|
| `name` | Named child entry key | New keyed entries remove the descriptor wrapper |
| `value` | `$value` | Reuse the existing reserved word where its role is explicitly defined |
| `namespace` | `$namespace` where needed | URI supplied only when source mapping cannot determine identity |
| `local` | Named entry key, or `$name` inside `$type` | No `$localName` alias is allocated |

This table describes the new research grammar, not aliases accepted by existing runtimes. Current accepted component/QName shapes and the shipped direct-runtime protocol retain their contracts, including reused descendants inside new mappings. A migration requires an explicit compatibility decision and fresh inverse/serializer tests. Ordinary XML properties actually named `name`, `value`, `namespace` or `local` remain ordinary data keys.

### Transport, schema and implementation namespaces

| Name | Actual role | Application-mapping disposition |
|---|---|---|
| `$xml`, `_xml` | Dependency-owned SOAP/XML serialization hooks | Not generic fields accepted by the application mapping |
| `attributes`, `$` | Existing configurable/dependency attribute containers and aliases | Existing adapter behavior, not new canonical metadata keys |
| `$schema`, `$id`, `$ref` | JSON Schema dialect/identity/reference keywords | Schema documents, not XML-derived payload properties |
| `$raw/...`, `/$hypothetical/...`, `$semantic-content/...`, `$semantic-builtin-anyType/...` | Internal source/candidate reference paths and generated component paths | Path strings, not public JSON mapping keys |
| `$env`, `$_` | Shell/documentation syntax encountered during the inventory | Not mapping keys |

A `$` prefix identifies a reserved namespace, not permission to submit arbitrary metadata. The selected mapping and HTTP schema must declare every accepted key, reject unknown/conflicting metadata without mutation, preserve accepted fields during serialization, and consume synthetic groups without inventing XML wrapper elements. Legacy configurable attribute-key overrides remain their existing separate contract.

## Primitive Mapping

All XSD numeric and date-time types map to `string` by default. This prevents
precision loss at the cost of convenience.

| XSD Type      | Default  | Override Options   | When to Override                      |
|---------------|----------|--------------------|---------------------------------------|
| `xs:long`     | `string` | `number`, `bigint` | Use `number` if values fit JS range   |
| `xs:integer`  | `string` | `number`           | Use `string` for arbitrary-size ints  |
| `xs:decimal`  | `string` | `number`           | Use `string` for precise decimals     |
| `xs:dateTime` | `string` | `Date`             | Use `Date` if runtime parsing is okay |

Override with CLI flags:

- `--client-int64-as`
- `--client-decimal-as`
- `--client-date-as`

## Simple Type Aliases

Named `xs:simpleType` declarations generate scalar TypeScript aliases. Enumerated restrictions generate string literal unions.

```xml
<xs:simpleType name="MyEnum">
  <xs:restriction base="xs:string">
    <xs:enumeration value="Red"/>
    <xs:enumeration value="Green"/>
  </xs:restriction>
</xs:simpleType>
```

The generated TypeScript type preserves the enum as a scalar alias:

```typescript
export type MyEnum = "Red" | "Green";
```

The generated OpenAPI schema uses the same component name with a scalar enum schema:

```json
{
  "MyEnum": {
    "type": "string",
    "enum": ["Red", "Green"]
  }
}
```

### Same-Name Global Elements

Some WSDLs declare a named simple type and a global element with the same local name. When the element references that simple type, the generator treats the element as the scalar alias rather than creating a wrapper interface.

```xml
<xs:simpleType name="MyEnum">
  <xs:restriction base="xs:string">
    <xs:enumeration value="Red"/>
    <xs:enumeration value="Green"/>
  </xs:restriction>
</xs:simpleType>
<xs:element name="MyEnum" nillable="true" type="tns:MyEnum"/>
```

The generated TypeScript remains a single declaration:

```typescript
export type MyEnum = "Red" | "Green";
```

Operation methods that use `tns:MyEnum` as their root element accept and return `MyEnum` directly:

```typescript
interface EnumServiceOperations {
  Echo(args: MyEnum): Promise<{ response: MyEnum; headers: unknown }>;
}
```

This avoids invalid duplicate declarations such as `type MyEnum` plus `interface MyEnum`. It also keeps OpenAPI request and response schemas pointed at the scalar `MyEnum` component.

The same-name scalar element does not create an object wrapper only to carry element metadata. A root element marked `nillable="true"` still uses the scalar alias as the operation type.

### Different-Name Simple Elements

When a global element has a different name from the named simple type it references, the element remains a wrapper surface type. The simple type alias is still generated separately.

```xml
<xs:simpleType name="MyEnum">
  <xs:restriction base="xs:string">
    <xs:enumeration value="Red"/>
    <xs:enumeration value="Green"/>
  </xs:restriction>
</xs:simpleType>
<xs:element name="FavoriteColor" type="tns:MyEnum"/>
```

The generated surface type keeps the element name and stores the scalar value in `$value`:

```typescript
export type MyEnum = "Red" | "Green";

export interface FavoriteColor {
  $value?: MyEnum;
}
```

## Deterministic Generation

All output is stable and diff-friendly for CI/CD pipelines.

- Sorted type declarations
- Sorted OpenAPI paths, schemas, and parameters
- Sorted JSON schema keys
- Stable alias resolution
- Consistent import ordering

Regenerate safely without spurious diffs in version control.

## Catalog as Intermediate Artifact

`catalog.json` is the compiled representation of your WSDL. It is debuggable,
cacheable, and reused across client, OpenAPI, and gateway generation.

Inspect types, operations, and metadata as plain JSON. The catalog is
automatically placed alongside generated output.

The catalog stores optional human-readable `doc` fields extracted from WSDL/XSD documentation nodes. These fields are additive metadata used by TypeScript, OpenAPI, gateway, and generated-test emitters and do not change runtime behavior.

The catalog may also store optional `diagnostics.notes` entries. These notes record non-error modeling decisions, such as reusing a same-name simple type alias instead of emitting a duplicate wrapper interface. CLI commands print these entries as `Note:` lines during compilation.

The catalog also stores optional `wsdlDocs` metadata for selected WSDL nodes:

- `bindings[]`
- `messages[]`
- `messages[].parts[]`
- `services[]`
- `services[].ports[]`

OpenAPI uses operation docs for both `description` and default `summary` values. `ops.json` keeps precedence when `summary` or `description` is explicitly provided.

### Catalog Locations by Command

| Command    | Location                         |
|------------|----------------------------------|
| `client`   | `{client-dir}/catalog.json`      |
| `openapi`  | `{openapi-dir}/catalog.json`     |
| `pipeline` | First available output directory |

## Response Envelope

All gateway responses follow a uniform envelope structure. This has been
always-on since v0.7.1.

### Success Response

```json
{
  "status": "SUCCESS",
  "message": null,
  "data": { },
  "error": null
}
```

### Error Response

```json
{
  "status": "ERROR",
  "message": "Request validation failed",
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { }
  }
}
```

### Envelope Shape

The base envelope is generic over the payload type `T`:

```typescript
{
  status: string;
  message: string | null;
  data: T | null;
  error: ErrorObject | null;
}
```

The error object carries a machine-readable code, a human message, and optional
details:

```typescript
{
  code: string;
  message: string;
  details: object | null;
}
```

### Streaming Bypass

Operations opted into streaming with `--stream-config` bypass the success envelope on the `200` response path. The OpenAPI response content is declared as the configured stream media type, and the gateway writes raw NDJSON lines or one streamed JSON array straight to the response body. Error responses (400, 502, and the rest) still use the normal envelope so clients always see structured failures before the first record. See [ADR-002](decisions/002-streamable-responses.md) for the full rationale.

### Envelope Naming

The base envelope is named `${serviceName}ResponseEnvelope`. Override with
`--openapi-envelope-namespace`.

The error type is named `${serviceName}ErrorObject`. Override with
`--openapi-error-namespace`.

Per-operation envelopes use the pattern
`<PayloadType|OperationName><EnvelopeNamespace>`.

### Collision Avoidance

When the payload type already ends with the namespace prefix, an underscore is
inserted. For example, `WeatherResponse` combined with `ResponseEnvelope`
produces `WeatherResponse_ResponseEnvelope`.

## Choice Element Handling

The default strategy is `all-optional`. Choice branches are emitted on a single interface using the occurrence metadata compiled from the WSDL.

```typescript
// WSDL: <xs:choice>
interface MyType {
  optionA?: string;
  optionB?: number;
}
```

`--client-choice-mode union` is opt-in. It emits a base object for non-choice fields and an exclusive generated branch union for choice fields. Peer branch properties use `?: never`, so TypeScript rejects payloads that include more than one branch.

```typescript
type MyType = MyTypeChoiceBase & MyTypeChoice1;

interface MyTypeChoiceBase {
  id: string;
}

type MyTypeChoice1 =
  | { optionA: string; optionB?: never }
  | { optionB: number; optionA?: never };
```

OpenAPI generation also consumes the same choice metadata in union mode. It keeps choice member properties on the containing object and adds `oneOf` branch constraints with peer `not` checks so generated request schemas reject payloads that send multiple branches.

## Array Wrapper Flattening

A complex type whose only child is a single repeated element with no attributes
collapses to an array schema in OpenAPI. Controlled by
`--openapi-flatten-array-wrappers` (default `true`).

```xml
<xs:complexType name="ArrayOfForecast">
  <xs:sequence>
    <xs:element name="Forecast" type="tns:Forecast" maxOccurs="unbounded"/>
  </xs:sequence>
</xs:complexType>
```

With flattening enabled (default), the OpenAPI schema becomes a plain array:

```json
{
  "ArrayOfForecast": {
    "type": "array",
    "items": { "$ref": "#/components/schemas/Forecast" }
  }
}
```

The TypeScript types preserve the wrapper structure:

```typescript
export interface ArrayOfForecast {
  Forecast?: Forecast[];
}
```

### Runtime Unwrap

Because the SOAP client returns wrapper-shaped objects (`{ Forecast: [...] }`)
while the OpenAPI schema expects flat arrays, the generated gateway includes an
`unwrapArrayWrappers()` function in `runtime.ts`. Route handlers call it
automatically before serialization. This bridges the TS-type/schema gap without
requiring consumers to transform responses manually.

### Disabling Flattening

Pass `--openapi-flatten-array-wrappers false` to preserve the wrapper object
structure in OpenAPI schemas. When disabled:

- ArrayOf* types emit as `type: "object"` with their inner element as a property
- No `unwrapArrayWrappers()` function is generated in `runtime.ts`
- Route handlers pass SOAP responses through unmodified
- The OpenAPI schema matches the TypeScript types exactly

## Inheritance Flattening

Three XSD inheritance patterns are supported.

### Extension

Base properties are merged into the derived type. TypeScript uses `extends`
when possible.

### Restriction

Treated as the base type with additional constraints applied.

### SimpleContent

The base value collapses into a `$value` property. Attributes remain as peer
properties on the same interface.

## Validation

OpenAPI output is validated with `@apidevtools/swagger-parser`. The validator
checks schema structure, resolves all `$ref` references, catches missing
schemas, and detects circular dependencies.

CLI OpenAPI generation always validates the generated spec. Programmatic callers can set `skipValidate: true` when they need to inspect an intermediate state.

## Streaming vs Buffered Responses

The generator produces two response execution models. Buffered is the default and only path for operations not listed in a stream config. Streaming is opt-in and operation-scoped; it changes the emitted client method signature, the OpenAPI response description, and the Fastify route shape for that operation only.

### Execution Model Contrast

Buffered operations call `node-soap`, wait for the full response to materialize, and return `{ response, headers, responseRaw, requestRaw }`. Streaming operations bypass `node-soap`, POST a hand-built SOAP envelope via `fetch`, and return `StreamOperationResponse<RecordType>` with `records: AsyncIterable<RecordType>`. The SAX parser in `runtime/streamXml.ts` walks the configured `recordPath` and yields each record as its closing tag arrives.

The catalog is the source of truth for stream metadata. Each opted-in operation carries an `OperationStreamMetadata` entry, and downstream emitters (client, OpenAPI, gateway, tests) all read from the catalog. OpenAPI carries a derived view via the `x-wsdl-tsc-stream` extension.

### Terminal-Error Policy

Errors before the first record use the normal gateway error envelope because the response headers and status have not been committed yet. Errors mid-stream truncate the response; NDJSON consumers detect this as an incomplete HTTP response, and JSON array consumers see an incomplete or invalid JSON document. Both cases must be treated as failed streams. This behavior is documented for operators in the [Production Guide](production.md#terminal-error-policy).

## Companion Catalogs and Shape Resolution

Some vendor WSDLs split their types across multiple services. The stream wrapper operation lives in one WSDL while the concrete record type lives in a companion WSDL. The stream config's `shapeCatalogs` section names additional WSDL or catalog inputs used only to resolve record shapes.

### How Resolution Works

When an operation names a `shapeCatalog`, the compiler loads the companion catalog once, copies the reachable record-type graph into the current compilation, and fails loudly on structural name collisions. Structurally identical types dedupe silently, so two catalogs that share a common base type do not conflict.

```json
{
  "shapeCatalogs": {
    "main": { "wsdlSource": "https://api.example.com/Main.svc?singleWsdl" }
  },
  "operations": {
    "StreamOp": {
      "recordType": "ConcreteRecordType",
      "recordPath": ["StreamOpResponse", "Records", "Record"],
      "shapeCatalog": "main"
    }
  }
}
```

### Collision Handling

A structural collision means two types share a name but differ in fields. The build fails with a diagnostic naming both source catalogs. Rename in the companion source or point `recordType` at a distinct subtree. Silent renames are intentionally disallowed because they would produce ambiguous public APIs.

## xs:any Wildcard Retention

XSD wildcards (`<xs:any>`) were silently dropped by earlier compiler versions. Since 0.17.0 the compiler retains them on the compiled type alongside any concrete children. This enables two downstream behaviors: honest stream-candidate detection (a wrapper that contains a wildcard is a likely streaming target) and accurate companion-catalog resolution (the compiler knows which elements are open for record types to slot into).

The retained wildcard is metadata only. It does not emit TypeScript `any` or loosen the generated types; concrete fields remain strictly typed.
