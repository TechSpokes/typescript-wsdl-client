# Examples

Sample files and generated output for `@techspokes/typescript-wsdl-client`.

## Directory Contents

| Directory | Description |
|-----------|-------------|
| [minimal/](minimal/) | Source WSDL file used for smoke tests and examples |
| [generated-output/](generated-output/) | Pre-generated output from weather.wsdl for inspection |
| [openapi/](openapi/) | Configuration file examples for OpenAPI generation |

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

## Configuration Files

The `openapi/` directory contains example configuration files:

- `security.json` for security scheme configuration (pass via `--openapi-security-config-file`)
- `tags.json` for operation-to-tag mapping (pass via `--openapi-tags-file`)
- `ops.json` for per-operation overrides (pass via `--openapi-ops-file`)

See [Configuration](../docs/configuration.md) for details on each file format.

## Using the WSDL Example

Generate a complete stack from the included weather service:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir ./tmp/client \
  --openapi-file ./tmp/openapi.json \
  --gateway-dir ./tmp/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1
```

See the [README](../README.md) for quick start instructions.
