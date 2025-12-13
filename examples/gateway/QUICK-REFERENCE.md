# Quick Reference: Gateway Generation

## Commands

### Generate Everything (Recommended)
```bash
wsdl-tsc pipeline \
  --wsdl my-service.wsdl \
  --out generated \
  --gateway-out generated/gateway \
  --gateway-version v1 \
  --gateway-service myservice
```

### Generate Gateway Only
```bash
wsdl-tsc gateway \
  --openapi openapi.json \
  --out gateway \
  --version v1 \
  --service myservice
```

## File Structure

```
gateway/
├── schemas/
│   ├── models/              # Component schemas
│   │   └── *.json          # One file per schema
│   └── operations/          # Route schemas
│       └── *.json          # One file per operation
├── routes/                  # Route handlers
│   └── *.ts                # One file per operation
├── schemas.ts              # Schema registration
└── routes.ts               # Route registration
```

## URN Format

- Models: `urn:schema:v1:services:weather:models:{name}`
- Operations: `urn:schema:v1:services:weather:operations:{name}`

## Integration Pattern

```typescript
import Fastify from 'fastify';
import { registerSchemas_v1_weather } from './gateway/schemas.js';
import { registerRoutes_v1_weather } from './gateway/routes.js';

const app = Fastify();
await registerSchemas_v1_weather(app);
await registerRoutes_v1_weather(app);
await app.listen({ port: 3000 });
```

## Standard Response Envelope

All responses use this format:

```typescript
{
  status: 'SUCCESS' | 'FAILURE' | 'PENDING',
  message: string | null,
  data: T | null,
  error: {
    code: string,
    message: string,
    details: any
  } | null
}
```

## Common Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--version` | Version slug | Auto-detect |
| `--service` | Service slug | Auto-detect |
| `--default-response-status-codes` | Status codes to backfill | 200,400,401,403,404,409,422,429,500,502,503,504 |
| `--gateway-out` | Output directory | Required |

## Tips

1. **Always specify version/service explicitly** in production
2. **Implement handlers** - generated handlers are stubs
3. **Use TypeScript types** from generated client
4. **Add error handling** - map SOAP errors to REST
5. **Enable validation** - Fastify validates automatically

## Example Handler

```typescript
handler: async (request, reply) => {
  try {
    const client = new SoapClient(url);
    const result = await client.Operation(request.body);
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
      message: error.message,
      data: null,
      error: { code: 'ERROR', message: error.message, details: null }
    };
  }
}
```

