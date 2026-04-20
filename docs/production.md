# Production Guide

Guidance for using wsdl-tsc generated code in production environments.

See [README](../README.md) for quick start and [Gateway Guide](gateway-guide.md) for integration patterns.

## Deterministic Output

All generated code and specifications have stable, deterministic ordering for version control:

- TypeScript files: sorted type declarations, imports, and exports
- OpenAPI specs: sorted paths, HTTP methods, schemas, parameters, security schemes, tags
- JSON Schemas: sorted property keys and component names
- Gateway routes: alphabetically organized route files
- Catalog JSON: consistent ordering of types and operations

Regenerate safely in CI/CD without spurious diffs.

## Validation

### OpenAPI Validation

Enabled by default using @apidevtools/swagger-parser. Validates schema structure, resolves all $ref references, catches missing schemas and circular dependencies. Disable with `--openapi-validate false`.

### Gateway Contract Validation

All request/response bodies must use $ref to components.schemas. Every operation must have a default response with application/json content. All referenced schemas must exist in components.schemas.

## SOAP Wire Logging

Enable SOAP request/response debugging:

```bash
NODE_DEBUG=soap node app.js
```

This logs full XML request/response payloads to console.

## CI/CD Tips

### Caching Strategy

```bash
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/Service.wsdl \
  --catalog-file ./build/catalog.json

npx wsdl-tsc client --catalog-file ./build/catalog.json --client-dir ./src/client
npx wsdl-tsc openapi --catalog-file ./build/catalog.json --openapi-file ./docs/api.json
```

### Recommended Build Script

```json
{
  "scripts": {
    "generate": "npx wsdl-tsc pipeline --wsdl-source ./wsdl/service.wsdl --client-dir ./src/client --openapi-file ./docs/api.json --gateway-dir ./src/gateway --gateway-service-name svc --gateway-version-prefix v1",
    "build": "npm run generate && tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

## Streaming Operations

Operations opted into streaming with `--stream-config` change the production profile of the gateway. Plan for these characteristics before rolling out.

### Backpressure

Records flow through `Readable.from` in the generated `runtime.ts`. The iterator's `next()` is not called until the internal buffer has room, so a slow HTTP client propagates backpressure all the way to the upstream SOAP server. A client that opens a connection and stops reading will eventually stall the upstream SOAP socket; set idle timeouts on both the gateway and the SOAP endpoint accordingly.

### Connection Timeouts

Stream responses can stay open for the full duration of the upstream SOAP call. The Fastify `keepAliveTimeout`, `requestTimeout`, and any reverse proxy (nginx, ALB, CloudFront) must allow the maximum expected upstream duration. Default Fastify timeouts are shorter than typical long-running SOAP batch responses.

### Memory Profile

Memory stays bounded regardless of payload size because records are parsed and emitted one at a time. The SAX parser buffers only within the current record element. This is the primary reason to opt into streaming: buffered operations load the full response into memory before yielding.

### Observability

Log the time to first record, not just the time to response completion. First-record time is the most useful SLO signal because it measures the combined latency of upstream connect, first-byte, and parser spin-up. Track it separately from total stream duration.

### Terminal-Error Policy

Errors raised before the first record use the normal gateway error envelope (client sees a standard JSON error). Errors raised mid-stream truncate the chunked response without a terminating zero-chunk. Consumers detect this as an incomplete HTTP response. Document this behavior for downstream API consumers so they distinguish truncation from a legitimate empty stream.

## Known Limitations

### Choice Elements

Current strategy: all-optional (all branches optional). Discriminated union support is planned.

### Union Types

Experimental --client-choice-mode union available. May require manual refinement for complex patterns.

### WS-Policy

Security hints extracted from policies. Custom policies may require manual security configuration.

### Array Wrapper Flattening

Single-child sequences with maxOccurs>1 become array schemas. Sequences with multiple children preserve wrapper.

### Stream Format Coverage

Only `ndjson` is emitted today. `json-array` is reserved in the config schema but not yet implemented; opting in with `format: "json-array"` parses successfully but generates no routes for that operation.

### Stream Transport Bypasses node-soap

Stream operations bypass `node-soap` entirely and POST a hand-built SOAP envelope via `fetch`. Any `node-soap` middleware, interceptors, or custom security handlers that your buffered operations rely on will not apply to stream operations. Authentication headers, proxies, and TLS options must be configured on the stream transport path separately.
