# Fastify Gateway Generation Example

This example demonstrates how to generate a production-ready Fastify REST API gateway from a WSDL file using the `wsdl-tsc` tool. The gateway provides a RESTful interface to SOAP services with full JSON Schema validation.

## Overview

The gateway generation feature creates:
- **JSON Schema models** with URN-based IDs for all types
- **Fastify-compatible operation schemas** with request/response validation
- **Route registration modules** with handler stubs
- **Schema registration modules** for Fastify integration

## Quick Start

### 1. Generate Gateway Code

Using the complete pipeline (recommended):

```bash
# Generate TypeScript client + OpenAPI + Gateway in one step
npx wsdl-tsc pipeline \
  --wsdl examples/minimal/weather.wsdl \
  --out generated \
  --format json \
  --gateway-out generated/gateway \
  --gateway-version v1 \
  --gateway-service weather
```

Or step-by-step:

```bash
# Step 1: Generate OpenAPI specification
npx wsdl-tsc openapi \
  --wsdl examples/minimal/weather.wsdl \
  --out generated/openapi.json

# Step 2: Generate Gateway from OpenAPI
npx wsdl-tsc gateway \
  --openapi generated/openapi.json \
  --out generated/gateway \
  --version v1 \
  --service weather
```

### 2. Install Dependencies

```bash
npm install fastify
```

### 2. Use the Generated Gateway

See `server.ts` for a complete example of integrating the generated gateway code with a Fastify server.

```bash
npx tsx examples/gateway/server.ts
```

**Note:** Route registration functions use the naming pattern:
- `registerRoute_{version}_{service}_{operation}()`
- Example: `registerRoute_v1_weather_getcityweatherbyzip()`

This ensures uniqueness when combining multiple services/versions in the same application.

## Generated Structure

```
generated/gateway/
├── schemas/
│   ├── models/              # JSON Schema files for all types
│   │   ├── forecast.json
│   │   ├── temp.json
│   │   └── ...
│   └── operations/          # Fastify operation schemas
│       ├── getcityforecastbyzip.json
│       ├── getcityweatherbyzip.json
│       └── ...
├── routes/                  # Individual route registration files
│   ├── getcityforecastbyzip.ts
│   ├── getcityweatherbyzip.ts
│   └── ...
├── schemas.ts              # Schema registration module
└── routes.ts               # Route registration module
```

## Schema Structure

### Model Schemas (schemas/models/)

Each component schema from the OpenAPI specification is converted to a standalone JSON Schema file with a URN-based `$id`:

```json
{
  "$id": "urn:v1.services.weather.schemas.models.forecast",
  "type": "object",
  "properties": {
    "Date": { "type": "string" },
    "Temperatures": {
      "$ref": "urn:v1.services.weather.schemas.models.temp#"
    }
  }
}
```

**Key features:**
- URN format: `urn:{version}.services.{service}.schemas.models.{schemaName}`
- All `$ref` rewritten from OpenAPI format to URN format
- Deterministic slugification for file names

### Operation Schemas (schemas/operations/)

Fastify-compatible schemas with request/response validation:

```json
{
  "$id": "urn:v1.services.weather.schemas.operations.getcityforecastbyzip",
  "body": {
    "$ref": "urn:v1.services.weather.schemas.models.getcityforecastbyzip#"
  },
  "response": {
    "200": { "$ref": "urn:v1.services.weather.schemas.models.getcityforecastbyzipresponse_responseenvelope#" },
    "400": { "$ref": "urn:v1.services.weather.schemas.models.weatherresponseenvelope#" },
    "500": { "$ref": "urn:v1.services.weather.schemas.models.weatherresponseenvelope#" }
  }
}
```

## Integration Guide

### Basic Server Setup

```typescript
import Fastify from 'fastify';
import { registerSchemas_v1_weather } from './generated/gateway/schemas.js';
import { registerRoutes_v1_weather } from './generated/gateway/routes.js';

const fastify = Fastify({ logger: true });

// Step 1: Register all JSON schemas
await registerSchemas_v1_weather(fastify);

// Step 2: Register all routes
await registerRoutes_v1_weather(fastify);

// Start server
await fastify.listen({ port: 3000 });
```

### Implementing Handlers

The generated route files contain stub handlers that throw "Not implemented" errors. You need to implement these handlers to call the actual SOAP service:

```typescript
// Before (generated stub):
handler: async (request, reply) => {
  throw new Error("Not implemented");
}

// After (with SOAP client integration):
import { WeatherClient } from '../client.js';

handler: async (request, reply) => {
  const client = new WeatherClient('http://soap-service-url');
  const result = await client.GetCityForecastByZIP(request.body);
  
  // Wrap in standard envelope
  return {
    status: 'SUCCESS',
    message: null,
    data: result,
    error: null
  };
}
```

### Error Handling

Implement proper error mapping from SOAP faults to REST responses:

```typescript
import { WeatherClient } from '../client.js';

handler: async (request, reply) => {
  try {
    const client = new WeatherClient('http://soap-service-url');
    const result = await client.GetCityForecastByZIP(request.body);
    
    return {
      status: 'SUCCESS',
      message: null,
      data: result,
      error: null
    };
  } catch (error) {
    reply.code(500);
    return {
      status: 'FAILURE',
      message: 'SOAP service error',
      data: null,
      error: {
        code: 'SOAP_ERROR',
        message: error.message,
        details: error
      }
    };
  }
}
```

## CLI Options

### Gateway Command

```bash
wsdl-tsc gateway --openapi <file> --out <dir> [options]
```

**Required:**
- `--openapi <file>` - Path to OpenAPI 3.1 JSON file
- `--out <dir>` - Output directory for gateway code

**Optional:**
- `--version <slug>` - Version identifier (e.g., v1, v2) - auto-detected from paths if omitted
- `--service <slug>` - Service identifier (e.g., weather, users) - auto-detected from paths if omitted
- `--default-response-status-codes <codes>` - Comma-separated status codes to backfill (default: 200,400,401,403,404,409,422,429,500,502,503,504)

### Pipeline Command with Gateway

```bash
wsdl-tsc pipeline --wsdl <file> --out <dir> [options]
```

**Gateway-specific options:**
- `--gateway-out <dir>` - Enables gateway generation, specifies output directory
- `--gateway-version <slug>` - Version slug for URN generation
- `--gateway-service <slug>` - Service slug for URN generation
- `--gateway-default-response-status-codes <codes>` - Status codes for gateway

## Auto-detection

If `--version` and `--service` are omitted, the generator attempts to infer them from OpenAPI paths:

```
Given paths like:
  /v1/weather/get-forecast
  /v1/weather/get-current
  
Auto-detected:
  version: v1
  service: weather
```

If paths don't follow this pattern, you must provide `--version` and `--service` explicitly.

## URN Naming Convention

All schema IDs follow a hierarchical URN format compliant with RFC 2141:

- **Model schemas:** `urn:schema:{version}:services:{service}:models:{schemaSlug}`
- **Operation schemas:** `urn:schema:{version}:services:{service}:operations:{operationSlug}`

Example:
```
{
  "$id": "urn:schema:v1:services:weather:models:forecast",
  "type": "object",
  "properties": { ... }
}
```

This provides:
- **Uniqueness** across services and versions
- **Discoverability** through consistent naming
- **Validation** without file path dependencies

## Best Practices

### 1. Version Management

Always specify explicit version and service slugs for production:

```bash
wsdl-tsc gateway \
  --openapi openapi.json \
  --out gateway \
  --version v1 \
  --service weather  # Explicit is better than auto-detection
```

### 2. Response Status Codes

Customize status codes based on your API needs:

```bash
wsdl-tsc gateway \
  --openapi openapi.json \
  --out gateway \
  --default-response-status-codes 200,400,500  # Minimal set
```

### 3. Directory Structure

Keep gateway code separate from client code:

```
generated/
├── client.ts           # SOAP client
├── types.ts            # TypeScript types
├── utils.ts            # Utilities
├── catalog.json        # Metadata
├── openapi.json        # OpenAPI spec
└── gateway/            # Gateway code (separate)
    ├── schemas/
    ├── routes/
    ├── schemas.ts
    └── routes.ts
```

### 4. Type Safety

Import types from the generated client for handler implementation:

```typescript
import type { GetCityForecastByZIP, GetCityForecastByZIPResponse } from '../types.js';

handler: async (request, reply) => {
  const input = request.body as GetCityForecastByZIP;
  const result: GetCityForecastByZIPResponse = await soapClient.GetCityForecastByZIP(input);
  // ...
}
```

## Troubleshooting

### "Unable to determine version/service from paths"

**Cause:** OpenAPI paths don't follow `/version/service/...` pattern  
**Solution:** Provide explicit `--version` and `--service` flags

### "Expected schema with $ref but got inline"

**Cause:** OpenAPI contains inline schemas instead of component references  
**Solution:** Regenerate OpenAPI with proper component schemas (the wsdl-tsc generator does this correctly)

### "Unknown schema reference"

**Cause:** Operation references a schema that doesn't exist in components  
**Solution:** Verify OpenAPI specification is complete and valid

## Examples

See the complete example in `server.ts` for:
- Full server setup
- Schema and route registration
- Handler implementation patterns
- Error handling
- Request/response validation

## Additional Resources

- [Fastify Documentation](https://fastify.dev)
- [JSON Schema Specification](https://json-schema.org)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)

