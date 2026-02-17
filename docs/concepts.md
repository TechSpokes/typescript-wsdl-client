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

| XSD Type | Default | Override Options | When to Override |
|----------|---------|-----------------|-----------------|
| xs:long | string | number, bigint | Use number if values fit JS range |
| xs:integer | string | number | Use string for arbitrary-size ints |
| xs:decimal | string | number | Use string for precise decimals |
| xs:dateTime | string | Date | Use Date if runtime parsing is okay |

Override with CLI flags:

- `--client-int64-as`
- `--client-decimal-as`
- `--client-date-as`

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

### Catalog Locations by Command

| Command | Location |
|---------|----------|
| client | `{client-dir}/catalog.json` |
| openapi | `{openapi-dir}/catalog.json` |
| pipeline | First available output directory |

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
collapses to an array schema in OpenAPI.

```xml
<xs:complexType name="ArrayOfForecast">
  <xs:sequence>
    <xs:element name="Forecast" type="tns:Forecast" maxOccurs="unbounded"/>
  </xs:sequence>
</xs:complexType>
```

The resulting OpenAPI schema:

```json
{
  "ArrayOfForecast": {
    "type": "array",
    "items": { "$ref": "#/components/schemas/Forecast" }
  }
}
```

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
