# TypeScript WSDL Client

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![npm downloads](https://img.shields.io/npm/dm/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)

Generate type-safe TypeScript SOAP clients, OpenAPI 3.1 specs, and production-ready Fastify REST gateways from WSDL/XSD definitions.

## Use This If You Need

- TypeScript-first SOAP clients with full type safety
- OpenAPI 3.1 specs that mirror your TypeScript types
- REST gateway over SOAP with automatic request/response transformation
- CI-friendly deterministic output for safe regeneration in version control

## Quick Start

### Installation

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap
```

Requirements: Node.js 20+ and the `soap` package as a runtime dependency.

### Generate a Complete Stack

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir ./tmp/client \
  --openapi-file ./tmp/openapi.json \
  --gateway-dir ./tmp/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1 \
  --generate-app
```

This parses the WSDL, generates a typed SOAP client, creates an OpenAPI 3.1 spec, builds Fastify gateway handlers, and creates a runnable application.

### Run and Test

```bash
cd tmp/app && cp .env.example .env && npx tsx server.js
```

```bash
curl http://localhost:3000/health
curl http://localhost:3000/openapi.json | jq .
curl -X POST http://localhost:3000/get-weather-information \
  -H "Content-Type: application/json" -d '{}'
```

## What You Get

| Output | Files | Purpose |
|--------|-------|---------|
| TypeScript Client | client.ts, types.ts, utils.ts | Typed SOAP operations |
| OpenAPI 3.1 Spec | openapi.json or .yaml | REST API documentation |
| Fastify Gateway | plugin.ts, routes/, schemas/ | Production REST handlers |
| Catalog | catalog.json | Compiled WSDL (debuggable, cacheable) |

## Commands

| Command | Purpose |
|---------|---------|
| `pipeline` | Full stack generation (recommended) |
| `client` | TypeScript SOAP client only |
| `openapi` | OpenAPI 3.1 spec only |
| `gateway` | Fastify REST gateway from OpenAPI |
| `app` | Runnable Fastify application |
| `compile` | Parse WSDL to catalog.json (advanced) |

See [CLI Reference](docs/cli-reference.md) for all flags and examples.

## Documentation

| Guide | Description |
|-------|-------------|
| [CLI Reference](docs/cli-reference.md) | All 6 commands with flags and examples |
| [Programmatic API](docs/api-reference.md) | TypeScript functions for build tools |
| [Core Concepts](docs/concepts.md) | Flattening, $value, primitives, determinism |
| [Gateway Guide](docs/gateway-guide.md) | Fastify integration and error handling |
| [Configuration](docs/configuration.md) | Security, tags, operations config files |
| [Production Guide](docs/production.md) | CI/CD, validation, logging, limitations |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and debugging |
| [Working With Generated Code](docs/generated-code.md) | Using clients and types |
| [Architecture](docs/architecture.md) | Internal pipeline for contributors |
| [Migration Guide](docs/migration.md) | Upgrading between versions |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and guidelines.

## License

MIT. See [LICENSE](LICENSE) for full text. Generated artifacts are fully yours with no restrictions or attribution required.

## Links

- [npm](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
- [Issues](https://github.com/techspokes/typescript-wsdl-client/issues)
- [Discussions](https://github.com/techspokes/typescript-wsdl-client/discussions)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Security](SECURITY.md)
- [Support](SUPPORT.md)
- [Sponsor](https://github.com/sponsors/TechSpokes)

Vendor: [TechSpokes](https://www.techspokes.com). Maintainer: Serge Liatko ([@sergeliatko](https://github.com/sergeliatko)).
