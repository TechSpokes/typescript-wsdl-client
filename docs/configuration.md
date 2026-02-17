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

## Example Files

Example configuration files are available in the `examples/openapi/` directory:

- `examples/openapi/security.json` for security scheme configuration
- `examples/openapi/tags.json` for tag mapping
- `examples/openapi/ops.json` for operation overrides
