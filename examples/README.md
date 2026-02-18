# Examples

Sample files, configuration, and generated output for `@techspokes/typescript-wsdl-client`.

## Directory Contents

| Directory | Description |
|-----------|-------------|
| [minimal/](minimal/) | Source WSDL file used for smoke tests and examples |
| [generated-output/](generated-output/) | Pre-generated output from weather.wsdl for inspection |
| [config/](config/) | Configuration file examples for OpenAPI generation |
| [typescript-project/](typescript-project/) | Minimal TypeScript project using the generated client |
| [fastify-gateway/](fastify-gateway/) | Multi-service Fastify gateway setup |
| [ci-cd/](ci-cd/) | CI/CD integration with GitHub Actions and shell scripts |

## Generated Output

The `generated-output/` directory contains the full output from running:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir examples/generated-output/client \
  --openapi-file examples/generated-output/openapi.json \
  --gateway-dir examples/generated-output/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

Inspect these files to see what the tool produces before installing it.

To regenerate from the repository root:

```bash
npm run examples:regenerate
```

## Configuration Files

The `config/` directory contains example configuration files:

- `security.json` for security scheme configuration (pass via `--openapi-security-file`)
- `tags.json` for operation-to-tag mapping (pass via `--openapi-tags-file`)
- `ops.json` for per-operation overrides (pass via `--openapi-ops-file`)

See [Configuration](../docs/configuration.md) for details on each file format.

## Using a Remote WSDL

Most real-world usage targets a remote WSDL URL:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/service?wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name my-service \
  --gateway-version-prefix v1 \
  --init-app
```

The `--init-app` flag scaffolds a runnable Fastify application with `package.json`, `tsconfig.json`, and environment-based configuration.

See the [README](../README.md) for quick start instructions.
