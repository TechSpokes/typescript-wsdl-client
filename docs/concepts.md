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

Operations opted into streaming with `--stream-config` bypass the success envelope on the `200` response path. The OpenAPI response content is declared as the configured stream media type (default `application/x-ndjson`) and the gateway writes raw NDJSON lines straight to the response body. Error responses (400, 502, and the rest) still use the normal envelope so clients always see structured failures before the first record. See [ADR-002](decisions/002-streamable-responses.md) for the full rationale.

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

The current strategy is all-optional. All choice branches are emitted as
optional properties on a single interface.

```typescript
// WSDL: <xs:choice>
interface MyType {
  optionA?: string;
  optionB?: number;
}
```

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

Disable with `--openapi-validate false` or `validate: false` in the
programmatic API.

## Streaming vs Buffered Responses

The generator produces two response execution models. Buffered is the default and only path for operations not listed in a stream config. Streaming is opt-in and operation-scoped; it changes the emitted client method signature, the OpenAPI response description, and the Fastify route shape for that operation only.

### Execution Model Contrast

Buffered operations call `node-soap`, wait for the full response to materialize, and return `{ response, headers, responseRaw, requestRaw }`. Streaming operations bypass `node-soap`, POST a hand-built SOAP envelope via `fetch`, and return `StreamOperationResponse<RecordType>` with `records: AsyncIterable<RecordType>`. The SAX parser in `runtime/streamXml.ts` walks the configured `recordPath` and yields each record as its closing tag arrives.

The catalog is the source of truth for stream metadata. Each opted-in operation carries an `OperationStreamMetadata` entry, and downstream emitters (client, OpenAPI, gateway, tests) all read from the catalog. OpenAPI carries a derived view via the `x-wsdl-tsc-stream` extension.

### Terminal-Error Policy

Errors before the first record use the normal gateway error envelope because the response headers and status have not been committed yet. Errors mid-stream truncate the chunked response without a terminating zero-chunk; consumers detect this as an incomplete HTTP response and must treat it as a failure. NDJSON has no native error frame, and emitting a fake one would conflict with the item schema. This behavior is documented for operators in the [Production Guide](production.md#terminal-error-policy).

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
