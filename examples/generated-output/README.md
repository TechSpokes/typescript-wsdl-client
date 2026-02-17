# Generated Output Example

This directory contains the complete output from running `wsdl-tsc pipeline` on the weather.wsdl example. These files are committed so you can inspect them without installing the tool.

## Source

Generated from `examples/minimal/weather.wsdl` (CDYNE Weather service with 3 operations).

## Files

### TypeScript Client (client/)

| File | Description |
|------|-------------|
| `client.ts` | Typed SOAP client class with one method per operation |
| `types.ts` | TypeScript interfaces generated from XSD types |
| `utils.ts` | Runtime metadata for JSON-to-SOAP conversion |
| `catalog.json` | Compiled WSDL representation (intermediate format) |

### OpenAPI Specification

`openapi.json` contains the OpenAPI 3.1 spec with typed request/response schemas and standard envelope wrapping.

### Fastify Gateway (gateway/)

| File | Description |
|------|-------------|
| `plugin.ts` | Fastify plugin entry point (recommended integration) |
| `routes.ts` | Route aggregator module |
| `routes/` | Individual route handlers with SOAP client calls |
| `schemas.ts` | Schema registration module |
| `schemas/models/` | JSON Schema components with URN-based IDs |
| `schemas/operations/` | Fastify operation schemas for validation |
| `runtime.ts` | Envelope builders and centralized error handler |
| `_typecheck.ts` | Build-time type-check fixture |

## Regenerating

To regenerate these files after a code change:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir examples/generated-output/client \
  --openapi-file examples/generated-output/openapi.json \
  --gateway-dir examples/generated-output/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```
