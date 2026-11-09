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

Route paths are determined by `--openapi-base-path` during generation. The prefix option adds a runtime prefix on top of generated paths.

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
      const controller = new AbortController();
      const disconnected = () => { if (!reply.raw.writableEnded) controller.abort(); };
      request.raw.once("aborted", disconnected);
      reply.raw.once("close", disconnected);
      if (request.raw.aborted || reply.raw.destroyed) controller.abort();
      try {
        const result = await client.GetWeatherInformation(request.body as GetWeatherInformation, {signal: controller.signal});
        reply.type("application/x-ndjson");
        return await reply.send(toNdjson(result.records));
      } finally {
        request.raw.removeListener("aborted", disconnected);
        reply.raw.removeListener("close", disconnected);
      }
    },
  });
}
```

For `format: "json-array"`, the same handler imports `toJsonArray`, sets `reply.type("application/json")`, and sends `reply.send(toJsonArray(result.records))`.

The client method returns `StreamOperationResponse<RecordType>` with a single-pass `records` iterable. Failures before response commitment can use the error envelope; errors after commitment truncate the response. Treat an incomplete HTTP response or JSON array as a failed stream, even if earlier records were valid.

Each completed record passes through the legacy client's `fromSoapResult` mapper before delivery. Public DTOs flatten XML attributes, convert boolean/numeric lexical values according to projected types, preserve configured string-first decimal/integer policies, map typed `$value` content, tokenize XML lists and retain repeated-element arrays. Empty complex types without child fields become `{}`; empty primitive strings remain strings. The low-level `streamXml.ts` parser retains lexical values and attribute bags, and checked mapping conventions are unchanged.

For buffered responses, node-soap's `null` empty-object recovery requires a declared non-nillable child of a known complex type without child fields. Nullable and unknown values keep their existing behavior; empty containers with declared optional children are outside this bounded recovery.

When array-wrapper flattening is enabled, the gateway unwraps each mapped record using the same wrapper convention as buffered routes. Both NDJSON and JSON-array delivery stay incremental. A consumer disconnect aborts the upstream request even before SOAP response headers arrive, and remains connected to cancellation throughout record delivery.

### Streaming transport settings

Stream calls use `soap.HttpClient.requestStream` or the configured `options.httpClient.requestStream`, with the configured `options.request` adapter. They honor the current `soapClient().setEndpoint(...)`, static SOAP/HTTP headers, and the current security object's `addHeaders`, `addOptions`, `toXML` and `postProcess` hooks. A custom HTTP client must implement `requestStream`.

Requests pass through `toSoapArgs` and node-soap's WSDL document serializer, preserving unqualified local children and foreign namespace references. The initialized client's `envelopeKey` also governs SOAP headers and security `postProcess`. Stream calls require a compatible live document/literal binding matching the generated operation name and SOAP action; missing or ambiguous incompatible bindings are refused before I/O.

Only clients with stream-configured operations expose constructor `streamRequestOptions`, using node-soap's `IExOptions` HTTP options. Use it for stream-specific HTTP timeouts or an HTTPS agent with trusted CA/client certificates; WSDL-fetch settings remain separate. TLS verification stays enabled by default and uses Node's configured trust; no certificate bypass is added.

Generated stream operations also accept `{signal, timeoutMs}` as an optional second argument. `timeoutMs` covers the upstream HTTP request and record consumption, starting after SOAP metadata initialization. Exhaust the records or return their iterator to release the connection; a per-call signal already aborted rejects before metadata initialization. See the [generated stream client API](api-reference.md#generated-stream-client-contract).

Streaming supports SOAP 1.1 document/literal requests. SOAP 1.2/custom envelope namespaces, functional SOAP headers, SOAP body attributes, MTOM attachments and NTLM transport are explicitly refused. Other node-soap serializer/security combinations require separate qualification; date mappings remain type-level, and `bigint` values retain normal JSON serialization limitations.

## Error Handling

The centralized error handler (runtime.ts) automatically classifies errors:

| Error Type         | HTTP Status | Error Code          |
|--------------------|-------------|---------------------|
| Validation errors  | 400         | VALIDATION_ERROR    |
| Buffered node-soap faults | 502   | SOAP_FAULT          |
| Connection refused | 503         | SERVICE_UNAVAILABLE |
| Timeout            | 504         | GATEWAY_TIMEOUT     |
| Other errors       | 500         | INTERNAL_ERROR      |

Legacy errors handled before response commitment use the standard envelope. After stream output begins, errors truncate the response. Checked component values and faults follow their separate [checked contract](checked-gateway.md).

Stream parser faults fail the iterator instead of producing an empty successful result. Before output begins they use the generic error classification; after output begins the response is truncated.

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

Native legacy composition generates independent service clients and routers, one aggregate Fastify plugin, and one combined OpenAPI document. Save a configuration such as `services.json` beside your `sources/` directory:

```json
{
  "services": [
    {
      "key": "main",
      "generation": {
        "wsdl": "./sources/main.wsdl",
        "catalogOut": "./.generated/main/client/catalog.json",
        "clientOutDir": "./.generated/main/client",
        "compiler": {"imports": "js"},
        "openapi": {"outFile": "./.generated/main/openapi.json", "basePath": "/main"},
        "gateway": {"outDir": "./.generated/main/gateway", "serviceSlug": "main", "versionSlug": "v1"}
      }
    },
    {
      "key": "content",
      "generation": {
        "wsdl": "./sources/content.wsdl",
        "catalogOut": "./.generated/content/client/catalog.json",
        "clientOutDir": "./.generated/content/client",
        "compiler": {"imports": "js"},
        "openapi": {"outFile": "./.generated/content/openapi.json", "basePath": "/content"},
        "gateway": {"outDir": "./.generated/content/gateway", "serviceSlug": "content", "versionSlug": "v1"}
      }
    }
  ],
  "openapi": {"outFile": "./.generated/aggregate/openapi.json", "title": "Combined SOAP Gateway", "version": "1.0.0"},
  "gateway": {"outDir": "./.generated/aggregate/gateway", "imports": "js"}
}
```

```bash
npx wsdl-tsc pipeline --services-config ./services.json
```

Relative paths resolve against `services.json`; companion paths in `streamConfigFile` resolve against that stream file. Each `generation` uses `PipelineOptions` property names. Every service requires explicit outputs and its own static `basePath`; prefixes are baked into routes once. Keys, normalized service slugs, decorators and prefixes must be unique; output ownership must not overlap across services, and source metadata must remain outside outputs.

### Runtime clients

The aggregate plugin exports a typed `createClients` helper. Its registry requires exactly the configured keys, and each value is that service client's constructor options:

```typescript
import Fastify from "fastify";
import gateway, {createClients} from "./.generated/aggregate/gateway/plugin.js";
import type {IOptions, ISecurity} from "soap";

declare const mainEndpoint: string, contentEndpoint: string;
declare const mainOptions: IOptions, contentOptions: IOptions;
declare const mainSecurity: ISecurity, contentSecurity: ISecurity;

const clients = createClients({
  main: {source: "./sources/main.wsdl", options: mainOptions, security: mainSecurity},
  content: {source: "./sources/content.wsdl", options: contentOptions, security: contentSecurity},
});
(await clients.main.soapClient()).setEndpoint(mainEndpoint);
(await clients.content.soapClient()).setEndpoint(contentEndpoint);

const app = Fastify({logger: true});
await app.register(gateway, {clients});
await app.listen({port: 3000});
```

Runtime `source` supplies WSDL metadata, while `setEndpoint` selects the SOAP destination. Keep source, credentials, trust, headers, stream settings and cancellation decisions scoped to their client; overlapping SOAP operation names still dispatch through their owning route. Alternatively, provide a `{clients}` registry of preconfigured instances or compatible operations mocks directly.

The aggregate serves the combined definition at `/openapi.json`; generation `gateway.openapiPath` can change or disable that route. Do not register the aggregate under a Fastify runtime prefix, including an inherited parent prefix; configure each service's generation-time `openapi.basePath` instead.

Components and operation identifiers are qualified by service key, including stream item schema references. Local references and security scheme names are rewritten, and service-local root security/server semantics are preserved at their applicable operations or paths. Composition rejects duplicate final paths, unresolved/relative references and unsupported schema resources or anchors. Compiler settings and optional stream configuration stay inside each `generation`; checked composition and aggregate app/test scaffolding remain deferred.

The aggregate specification is JSON only. Aggregate spec/plugin staging protects the previous pair on failure, but earlier service-generated dependencies can already have changed. This is not a whole-directory transaction; regenerate and verify matched artifacts after a failure.

Single-source plugins can still be mounted manually in separate Fastify scopes. See [`examples/fastify-gateway`](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/examples/fastify-gateway/README.md) for single-source application wiring and the [composition API](api-reference.md#runmultiservicepipeline) for its supported settings and limits.

The credential-free [native composition example](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/examples/native-composition/README.md) uses two committed generic sources, explicit `.generated/` outputs and a compileable typed registry.

## Contract Assumptions

The following assumptions describe buffered legacy gateway input. Stream responses use format-specific bodies without success envelopes; checked components use their own value/schema contract. Native composition retains those per-service legacy contracts.

- All request/response bodies must use $ref to components.schemas
- Every operation must have a default response with application/json content
- All referenced schemas must exist in components.schemas
