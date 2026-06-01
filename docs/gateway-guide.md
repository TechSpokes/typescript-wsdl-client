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

Route paths are determined by `--openapi-base-path` during generation. The prefix option adds an additional runtime prefix on top of generated paths.

## Inbound Gateway Enforcement

Install inbound authentication, authorization, logging, and request correlation in the host Fastify app before registering the generated gateway plugin. Generated route files are safe to regenerate because custom policy stays outside the generated directory.

The example below accepts either a trusted API key or a bearer token. Replace `verifyJwt` and `principalCanCallWeather` with application-specific policy code.

```typescript
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import weatherGateway from "./gateway/plugin.js";
import { Weather } from "./client/client.js";

interface GatewayPrincipal {
  subject: string;
  scopes: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    correlationId: string;
    principal?: GatewayPrincipal;
  }
}

declare function verifyJwt(token: string): Promise<GatewayPrincipal>;
declare function principalCanCallWeather(principal: GatewayPrincipal): boolean;

const app = Fastify({ logger: true });

app.addHook("onRequest", async (request, reply) => {
  const header = request.headers["x-correlation-id"];
  request.correlationId = typeof header === "string" && header.length > 0 ? header : randomUUID();
  reply.header("x-correlation-id", request.correlationId);
  request.log.info({ correlationId: request.correlationId }, "gateway request started");
});

app.addHook("preHandler", async (request, reply) => {
  const expectedApiKey = process.env.GATEWAY_API_KEY;
  const apiKey = request.headers["x-api-key"];
  if (expectedApiKey && apiKey === expectedApiKey) return;

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing gateway credentials" });
  }

  const principal = await verifyJwt(authorization.slice("Bearer ".length));
  if (!principalCanCallWeather(principal)) {
    return reply.code(403).send({ error: "gateway access denied" });
  }

  request.principal = principal;
});

const weatherClient = new Weather({
  source: "https://example.com/weather.wsdl",
});

await app.register(weatherGateway, {
  client: weatherClient,
});
```

### Mutual TLS Signals

When Fastify terminates TLS directly, inspect the peer certificate before generated handlers run.

```typescript
import type { TLSSocket } from "node:tls";

app.addHook("preHandler", async (request, reply) => {
  const socket = request.raw.socket as TLSSocket;
  const cert = socket.getPeerCertificate();
  if (!cert || Object.keys(cert).length === 0) {
    return reply.code(401).send({ error: "client certificate required" });
  }

  request.log.info({ subject: cert.subject }, "client certificate accepted");
});
```

When TLS terminates at a load balancer or platform gateway, verify a trusted internal signal instead of reading the socket certificate. Strip public client-supplied certificate headers at ingress and inject trusted headers only after certificate validation succeeds.

```typescript
app.addHook("preHandler", async (request, reply) => {
  const subject = request.headers["x-client-cert-subject"];
  if (typeof subject !== "string" || subject.length === 0) {
    return reply.code(401).send({ error: "client certificate signal required" });
  }

  request.log.info({ subject }, "trusted client certificate signal accepted");
});
```

### Where To Put Custom Logic

Use host app hooks for authentication, authorization, logging, request correlation, and platform headers. Register hooks before `app.register(weatherGateway, ...)` so they run before generated route handlers.

Use Fastify encapsulation when different generated services need different policies. Do not edit generated route files because regeneration overwrites them.

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
import type { GetCityForecastByZIP } from "../../client/types.js";
import schema from "../schemas/operations/getcityforecastbyzip.json" with { type: "json" };
import { buildSuccessEnvelope } from "../runtime.js";

export async function registerRoute_v1_weather_getcityforecastbyzip(fastify: FastifyInstance) {
  fastify.route<{ Body: GetCityForecastByZIP }>({
    method: "POST",
    url: "/get-city-forecast-by-zip",
    schema,
    handler: async (request) => {
      const client = fastify.weatherClient;
      const result = await client.GetCityForecastByZIP(request.body as GetCityForecastByZIP);
      return buildSuccessEnvelope(result.response);
    },
  });
}
```

### Streaming Handlers

Operations opted in via `--stream-config` emit a stream response instead of the standard envelope. The generated handler streams records as they arrive, and the Fastify response is flushed with backpressure. The default format is NDJSON; `format: "json-array"` emits one JSON array document.

```typescript
import type { FastifyInstance } from "fastify";
import type { GetWeatherInformation } from "../../client/types.js";
import schema from "../schemas/operations/getweatherinformation.json" with { type: "json" };
import { toNdjson } from "../runtime.js";

// Response schema omitted: stream operations send a Readable directly
const { response: _response, ...routeSchema } = schema as Record<string, unknown>;

export async function registerRoute_v1_weather_getweatherinformation(fastify: FastifyInstance) {
  fastify.route<{ Body: GetWeatherInformation }>({
    method: "POST",
    url: "/get-weather-information",
    schema: routeSchema,
    handler: async (request, reply) => {
      const client = fastify.weatherClient;
      const result = await client.GetWeatherInformation(request.body as GetWeatherInformation);
      reply.type("application/x-ndjson");
      return reply.send(toNdjson(result.records));
    },
  });
}
```

For `format: "json-array"`, the same handler imports `toJsonArray`, sets `reply.type("application/json")`, and sends `reply.send(toJsonArray(result.records))`.

The client method returns `StreamOperationResponse<RecordType>` with a `records: AsyncIterable<RecordType>`. Errors raised before the first record use the normal error envelope. Errors raised mid-stream truncate the response; NDJSON clients see an incomplete HTTP response, and JSON array clients see an incomplete or invalid JSON document.

## Error Handling

The centralized error handler (runtime.ts) automatically classifies errors:

| Error Type         | HTTP Status | Error Code          |
|--------------------|-------------|---------------------|
| Validation errors  | 400         | VALIDATION_ERROR    |
| SOAP faults        | 502         | SOAP_FAULT          |
| Connection refused | 503         | SERVICE_UNAVAILABLE |
| Timeout            | 504         | GATEWAY_TIMEOUT     |
| Other errors       | 500         | INTERNAL_ERROR      |

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

## Multi-Service Setup

When integrating multiple SOAP services, each service gets its own client, gateway, and OpenAPI spec. Register each in its own Fastify encapsulation scope to prevent decorator collisions:

```typescript
import Fastify from "fastify";
import weatherPlugin from "./generated/weather/gateway/plugin.js";
import inventoryPlugin from "./generated/inventory/gateway/plugin.js";
import { Weather } from "./generated/weather/client/client.js";
import { Inventory } from "./generated/inventory/client/client.js";

const app = Fastify({ logger: true });

// Each plugin gets its own scope to isolate decorators
await app.register(async (scope) => {
  await scope.register(weatherPlugin, {
    client: new Weather({ source: "https://example.com/weather?wsdl" }),
    prefix: "/api/weather",
  });
});

await app.register(async (scope) => {
  await scope.register(inventoryPlugin, {
    client: new Inventory({ source: "https://example.com/inventory?wsdl" }),
    prefix: "/api/inventory",
  });
});

await app.listen({ port: 3000 });
```

See [`examples/fastify-gateway`](../examples/fastify-gateway/README.md) for a complete example.

## Contract Assumptions

- All request/response bodies must use $ref to components.schemas
- Every operation must have a default response with application/json content
- All referenced schemas must exist in components.schemas
