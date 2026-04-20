# Configuration Files

Optional JSON configuration files for customizing OpenAPI generation. Pass these via CLI flags to the `openapi` or `pipeline` commands.

See [CLI Reference](cli-reference.md) for flag details and [README](../README.md) for quick start.

## Security Configuration

Pass via `--openapi-security-config-file`.

Defines security schemes, headers, and per-operation overrides.

```json
{
  "global": {
    "scheme": "bearer",
    "bearer": { "bearerFormat": "JWT" },
    "headers": [
      {
        "name": "X-Correlation-Id",
        "required": false,
        "schema": { "type": "string" }
      }
    ]
  },
  "overrides": {
    "CancelBooking": { "scheme": "apiKey" }
  }
}
```

Supported schemes: none, basic, bearer, apiKey, oauth2.

## Tags Configuration

Pass via `--openapi-tags-file`.

Explicit operation-to-tag mapping when heuristic tag inference is insufficient.

```json
{
  "GetCityWeatherByZIP": ["Weather", "Forecast"],
  "GetWeatherInformation": ["Weather", "Info"],
  "CancelBooking": ["Booking", "Cancellation"]
}
```

## Operations Configuration

Pass via `--openapi-ops-file`.

Per-operation overrides for method, summary, description, and deprecation.

```json
{
  "GetCityWeatherByZIP": {
    "method": "get",
    "summary": "Get weather forecast by ZIP code",
    "description": "Returns a detailed weather forecast for the specified US ZIP code",
    "deprecated": false
  },
  "LegacyOperation": {
    "deprecated": true
  }
}
```

## Stream Configuration

The `--stream-config <file>` flag (available on `compile`, `client`, `pipeline`)
opts selected WSDL operations into streaming. Buffered output is unchanged for
operations not listed in the file.

```json
{
  "shapeCatalogs": {
    "main": { "wsdlSource": "https://api.example.com/Main.svc?singleWsdl" }
  },
  "operations": {
    "UnitDescriptiveInfoStream": {
      "format": "ndjson",
      "mediaType": "application/x-ndjson",
      "recordType": "UnitDescriptiveContentType",
      "recordPath": [
        "UnitDescriptiveInfoStream",
        "EVRN_UnitDescriptiveInfoRS",
        "UnitDescriptiveContents",
        "UnitDescriptiveContent"
      ],
      "shapeCatalog": "main"
    }
  }
}
```

- `recordType` and `recordPath` are required; `format` defaults to `ndjson` and
  `mediaType` to `application/x-ndjson`.
- `shapeCatalog` references a `shapeCatalogs` entry and is only needed when
  the record type lives in a different WSDL than the one driving generation.
- Shape catalogs accept either `wsdlSource` (fetched and compiled on the fly)
  or `catalogFile` (path to a pre-compiled `catalog.json`).
- Structural name collisions across catalogs fail the build; structurally
  identical types dedupe silently.

See [ADR-002](decisions/002-streamable-responses.md) for rationale and the
terminal-error policy.

## Example Files

Example configuration files are available in the `examples/openapi/` directory:

- `examples/openapi/security.json` for security scheme configuration
- `examples/openapi/tags.json` for tag mapping
- `examples/openapi/ops.json` for operation overrides
