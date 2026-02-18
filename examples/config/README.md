# Configuration Examples

Example configuration files for customizing OpenAPI generation.

## Files

| File | CLI Flag | Purpose |
|------|----------|---------|
| `security.json` | `--openapi-security-file` | Define security schemes and global headers |
| `tags.json` | `--openapi-tags-file` | Map operations to OpenAPI tags |
| `ops.json` | `--openapi-ops-file` | Per-operation overrides (method, summary, description) |

## Usage

Pass these files to the pipeline command:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/service?wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name my-service \
  --gateway-version-prefix v1 \
  --openapi-security-file ./config/security.json \
  --openapi-tags-file ./config/tags.json \
  --openapi-ops-file ./config/ops.json
```

See [Configuration Guide](../../docs/configuration.md) for the full file format reference.
