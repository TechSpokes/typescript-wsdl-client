# Migration Playbook

A step-by-step guide for modernizing a SOAP API into a typed TypeScript client and REST gateway. This covers the full journey from WSDL to production REST service.

For CLI flag details, see [CLI Reference](cli-reference.md). For gateway integration, see [Gateway Guide](gateway-guide.md).

## Overview

The typical migration follows this sequence:

1. Generate a typed client and verify operations work
2. Generate an OpenAPI spec and review the API surface
3. Generate a REST gateway and test routes
4. Add authentication, headers, and middleware
5. Test with typed mocks
6. Deploy to production
7. Roll out incrementally

You can stop at any step. A typed client alone (step 1) is valuable even if you never build a gateway.

## Step 1: Generate and Validate the Client

Start by generating a typed client from your WSDL.

```bash
npx wsdl-tsc client \
  --wsdl-source https://your-service.example.com/service.svc?wsdl \
  --client-dir ./generated/client
```

Inspect the generated `types.ts` to confirm that your WSDL types are represented correctly. Check that operation signatures in `operations.ts` match your expectations.

Test a single operation to verify connectivity:

```typescript
import { YourService } from "./generated/client/client.js";

const client = new YourService({
  source: "https://your-service.example.com/service.svc?wsdl",
});
const result = await client.SomeOperation({ /* args */ });
console.log(result.response);
```

If the WSDL uses authentication, you may need to configure credentials on the underlying `soap` client. See the `soap` package documentation for authentication options.

## Step 2: Generate the OpenAPI Spec

Once the client types look correct, generate an OpenAPI 3.1 specification.

```bash
npx wsdl-tsc openapi \
  --wsdl-source https://your-service.example.com/service.svc?wsdl \
  --openapi-file ./generated/openapi.json
```

Open `openapi.json` and review the paths, request/response schemas, and descriptions. The spec is derived from the same compiled catalog as the TypeScript types, so they stay aligned.

Validate the spec with any OpenAPI tool. Built-in validation runs by default; disable with `--openapi-validate false` if you need to inspect an intermediate state.

## Step 3: Generate the REST Gateway

Generate Fastify route handlers that translate JSON HTTP requests into SOAP calls.

```bash
npx wsdl-tsc gateway \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name your-service \
  --gateway-version-prefix v1
```

Or run all stages at once with the `pipeline` command and `--init-app`:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://your-service.example.com/service.svc?wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name your-service \
  --gateway-version-prefix v1 \
  --init-app
```

The generated gateway plugin registers one POST route per WSDL operation. Each route validates the request body, calls the SOAP operation, and returns the response as JSON.

## Step 4: Add Authentication and Middleware

### Security schemes

Create a security configuration file to add authentication to the OpenAPI spec and generated routes.

```json
{
  "global": {
    "scheme": "bearer",
    "bearer": { "bearerFormat": "JWT" }
  }
}
```

Pass it during generation:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source your-service.wsdl \
  --openapi-security-config-file ./config/security.json \
  ...
```

See [Configuration](configuration.md) for all options including per-operation overrides and custom headers.

### Custom middleware

Add middleware in your application code, not in the generated gateway files. The generated app scaffold (`index.ts`) is the right place for auth verification, logging, CORS, and other cross-cutting concerns.

```typescript
import Fastify from "fastify";
import { yourServiceGateway } from "./generated/gateway/plugin.js";

const app = Fastify({ logger: true });

// Add your middleware here
app.addHook("onRequest", async (request) => {
  // Verify JWT, check API keys, etc.
});

await app.register(yourServiceGateway, { client, prefix: "/v1" });
await app.listen({ port: 3000 });
```

## Step 5: Test With Typed Mocks

The generated `operations.ts` interface lets you test gateway routes without a live SOAP connection.

```typescript
import type { YourServiceOperations } from "./generated/client/operations.js";

const mockClient: YourServiceOperations = {
  SomeOperation: async (args) => ({
    response: { SomeOperationResult: { Status: "OK" } },
    headers: {},
  }),
};
```

Use this mock client when registering the gateway plugin in tests:

```typescript
import Fastify from "fastify";
import { yourServiceGateway } from "./generated/gateway/plugin.js";

const app = Fastify();
await app.register(yourServiceGateway, { client: mockClient, prefix: "/v1" });
await app.ready();

const response = await app.inject({
  method: "POST",
  url: "/v1/some-operation",
  payload: { /* request body */ },
});

expect(response.statusCode).toBe(200);
```

See [Testing Guide](testing.md) for more patterns including generated test suites.

## Step 6: Production Deployment

### Environment variables

The generated app scaffold uses `.env` for configuration. Copy `.env.example` and set your values:

```bash
WSDL_SOURCE=https://your-service.example.com/service.svc?wsdl
PORT=3000
HOST=0.0.0.0
```

### SOAP wire logging

Enable request/response debugging with the `NODE_DEBUG` environment variable:

```bash
NODE_DEBUG=soap node app.js
```

### CI/CD regeneration

Add a regeneration step to your CI pipeline. Because output is deterministic, you can regenerate and check for unexpected diffs:

```bash
npx wsdl-tsc pipeline --wsdl-source $WSDL_URL ...
git diff --exit-code generated/
```

If the diff is non-empty, the WSDL contract has changed. Review and commit the updated files.

See [Production Guide](production.md) for validation, logging, and deployment details.

## Step 7: Incremental Rollout

You do not have to expose all WSDL operations at once.

### Route-by-route migration

Use the operations configuration file to control which operations are included in the OpenAPI spec and gateway. Generate only the operations you are ready to expose, then add more over time.

See [Configuration](configuration.md) for the operations config file format.

### Parallel running

Run the REST gateway alongside existing SOAP consumers. The gateway does not modify or proxy the SOAP service; it calls it as a client. Both access patterns can coexist safely.

### Monitoring

Track gateway health through Fastify's built-in logging and the `/health` endpoint generated in the app scaffold. For SOAP-level debugging, use `NODE_DEBUG=soap` to inspect wire traffic.

## Common Migration Patterns

### Wrapping a vendor SOAP API

When the WSDL comes from a third-party vendor, you cannot change it. Generate the full stack, add authentication and rate limiting in your app layer, and expose the subset of operations your consumers need. The generated gateway becomes your controlled API surface.

### Multiple WSDL services behind one gateway

Generate each WSDL into its own client and gateway directory. Register multiple gateway plugins in a single Fastify app with different prefixes:

```typescript
await app.register(serviceAGateway, { client: clientA, prefix: "/v1/service-a" });
await app.register(serviceBGateway, { client: clientB, prefix: "/v1/service-b" });
```

### Regenerating after WSDL changes

When the vendor updates their WSDL, regenerate with the same command. Review the diff in version control. TypeScript compilation will catch any breaking changes in your consumer code that depend on removed or renamed types.
