# Configuration Files

Optional JSON configuration files for customizing OpenAPI generation. Pass these via CLI flags to the `openapi` or `pipeline` commands.

See [CLI Reference](cli-reference.md) for flag details and [README](../README.md) for quick start.

## Security Configuration

Pass via `--openapi-security-config-file`.

Defines REST gateway security, request headers, and upstream SOAP security. The `gateway` section describes the generated REST API in OpenAPI and adds Fastify header validation. The `upstream` section is used by the generated app scaffold to build `node-soap` runtime options from environment variables.

```json
{
  "gateway": {
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
    "operations": {
      "CancelBooking": { "scheme": "apiKey" },
      "HealthCheck": { "scheme": "none" }
    }
  },
  "upstream": {
    "profile": "ws-security-username-token",
    "usernameEnv": "SOAP_USERNAME",
    "passwordEnv": "SOAP_PASSWORD",
    "endpointEnv": "SOAP_ENDPOINT"
  }
}
```

Gateway schemes: none, basic, bearer, apiKey, oauth2, mutualTLS, openIdConnect.

Upstream SOAP profiles: none, basic, bearer, ws-security-username-token, client-ssl, client-ssl-pfx, x509, ntlm, custom.

The older OpenAPI-only shape with top-level `global` and `overrides` is still accepted. New projects should use `gateway.global` and `gateway.operations`.

The generated app scaffold reads upstream secrets from environment variables. It does not embed secret values in generated source and does not implement production JWT, OAuth, or API-key verification for inbound gateway requests. Add that verification in app hooks or your platform gateway.

### Runtime Enforcement Boundaries

The `gateway` security settings describe the generated REST API and add request header schema validation. They do not authenticate callers or authorize access to operations.

The `upstream` security settings configure how the generated app creates `node-soap` runtime security for calls from the gateway to the SOAP service. They do not enforce inbound REST gateway access.

| Concern | Configured In | Generated Behavior | Consumer Responsibility |
|---------|---------------|--------------------|-------------------------|
| OpenAPI security schemes | `gateway.global` and `gateway.operations` | Emits OpenAPI security metadata | Keep API documentation aligned with runtime policy |
| Required inbound headers | `gateway.global.headers` | Adds Fastify schema validation | Verify header values in host app hooks |
| Inbound JWT verification | Host app or platform gateway | No generated verifier | Validate issuer, audience, signature, and claims |
| Inbound API key verification | Host app or platform gateway | No generated key lookup | Compare keys against a trusted secret store |
| Inbound mutual TLS | TLS terminator or host app | No generated certificate validation | Verify client certificate signals from trusted infrastructure |
| Upstream SOAP credentials | `upstream` | Builds `node-soap` security from environment variables | Provide secrets through deployment environment variables |

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

Example configuration files are available in the `examples/config/` directory:

- `examples/config/security.json` for gateway and upstream security configuration
- `examples/config/tags.json` for tag mapping
- `examples/config/ops.json` for operation overrides
