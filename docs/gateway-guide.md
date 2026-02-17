# Gateway Guide

Guide to integrating the generated Fastify REST gateway with your application.

See [README](../README.md) for quick start and [CLI Reference](cli-reference.md) for gateway command flags.

## Prerequisites

Your host application needs these dependencies:

```bash
npm install fastify fastify-plugin
```

## Using the Generated Plugin (Recommended)

```typescript
import Fastify from 'fastify';
import weatherGateway from './gateway/plugin.js';
import { Weather } from './client/client.js';

const app = Fastify({ logger: true });

const weatherClient = new Weather({
  source: 'https://example.com/weather.wsdl',
});

await app.register(weatherGateway, {
  client: weatherClient,
});

await app.listen({ port: 3000 });
```

The plugin automatically decorates Fastify with the SOAP client, registers JSON schemas, installs a centralized error handler, and registers all routes.

Route paths are determined by --openapi-base-path during generation. The prefix option adds an additional runtime prefix on top of generated paths.

## Using Individual Components (Advanced)

```typescript
import Fastify from 'fastify';
import { registerSchemas_v1_weather } from './gateway/schemas.js';
import { registerRoutes_v1_weather } from './gateway/routes.js';
import { createGatewayErrorHandler_v1_weather } from './gateway/runtime.js';
import { Weather } from './client/client.js';

const app = Fastify({ logger: true });

const weatherClient = new Weather({ source: 'weather.wsdl' });
app.decorate('weatherClient', weatherClient);

await registerSchemas_v1_weather(app);
app.setErrorHandler(createGatewayErrorHandler_v1_weather());
await registerRoutes_v1_weather(app);

await app.listen({ port: 3000 });
```

## Generated Handler Implementation

Route handlers call the SOAP client automatically:

```typescript
import type { FastifyInstance } from "fastify";
import schema from "../schemas/operations/getcityforecastbyzip.json" with { type: "json" };
import { buildSuccessEnvelope } from "../runtime.js";

export async function registerRoute_v1_weather_getcityforecastbyzip(fastify: FastifyInstance) {
  fastify.route({
    method: "POST",
    url: "/get-city-forecast-by-zip",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetCityForecastByZIP(request.body);
      return buildSuccessEnvelope(result.response);
    },
  });
}
```

## Error Handling

The centralized error handler (runtime.ts) automatically classifies errors:

| Error Type | HTTP Status | Error Code |
|------------|-------------|------------|
| Validation errors | 400 | VALIDATION_ERROR |
| SOAP faults | 502 | SOAP_FAULT |
| Connection refused | 503 | SERVICE_UNAVAILABLE |
| Timeout | 504 | GATEWAY_TIMEOUT |
| Other errors | 500 | INTERNAL_ERROR |

All errors are wrapped in the standard envelope format. See [Concepts](concepts.md) for the envelope structure.

## Stub Handler Mode

For custom transformation logic beyond the standard SOAP-to-REST mapping, use stub mode:

```bash
npx wsdl-tsc gateway \
  --openapi-file ./docs/weather-api.json \
  --client-dir ./src/services/weather \
  --gateway-dir ./src/gateway/weather \
  --gateway-service-name weather \
  --gateway-version-prefix v1 \
  --gateway-stub-handlers
```

This generates minimal handler stubs that throw "Not implemented" errors.

## URN-Based Schema IDs

All generated JSON Schemas use deterministic URN identifiers:
`urn:services:{serviceSlug}:{versionSlug}:schemas:{models|operations}:{schemaSlug}`

Example: `urn:services:weather:v1:schemas:models:getcityweatherbyzipresponse`

## Contract Assumptions

- All request/response bodies must use $ref to components.schemas
- Every operation must have a default response with application/json content
- All referenced schemas must exist in components.schemas
