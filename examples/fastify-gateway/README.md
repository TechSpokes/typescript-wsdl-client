# Fastify Gateway Example

Multi-service gateway setup using generated Fastify plugins.

## Overview

When integrating multiple SOAP services, each service gets its own generated client, gateway plugin, and OpenAPI spec. This example shows how to compose them into a single Fastify application using encapsulation scopes.

## Generating Multiple Services

```bash
# Service 1: Weather
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/weather?wsdl \
  --client-dir ./generated/weather/client \
  --openapi-file ./generated/weather/openapi.json \
  --gateway-dir ./generated/weather/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1

# Service 2: Inventory
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/inventory?wsdl \
  --client-dir ./generated/inventory/client \
  --openapi-file ./generated/inventory/openapi.json \
  --gateway-dir ./generated/inventory/gateway \
  --gateway-service-name inventory \
  --gateway-version-prefix v1
```

## Multi-Service Application

```typescript
import Fastify from "fastify";
import weatherPlugin from "./generated/weather/gateway/plugin.js";
import inventoryPlugin from "./generated/inventory/gateway/plugin.js";
import { Weather } from "./generated/weather/client/client.js";
import { Inventory } from "./generated/inventory/client/client.js";

const app = Fastify({ logger: true });

const weatherClient = new Weather({
  source: "https://example.com/weather?wsdl",
});

const inventoryClient = new Inventory({
  source: "https://example.com/inventory?wsdl",
});

// Each service is registered in its own encapsulation scope
// to prevent decorator name collisions
await app.register(async (scope) => {
  await scope.register(weatherPlugin, {
    client: weatherClient,
    prefix: "/api/weather",
  });
});

await app.register(async (scope) => {
  await scope.register(inventoryPlugin, {
    client: inventoryClient,
    prefix: "/api/inventory",
  });
});

await app.listen({ port: 3000 });
```

## Why Encapsulation Scopes?

Each gateway plugin registers a Fastify decorator with the SOAP client instance. Without encapsulation scopes, the second plugin would overwrite the first plugin's decorator. Wrapping each plugin in `async (scope) => { ... }` creates an isolated context.

## Scaffolded App Alternative

For a single service, use `--init-app` to scaffold a complete runnable application:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/weather?wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1 \
  --init-app
```
