# TypeScript WSDL Client

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![npm downloads](https://img.shields.io/npm/dm/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)

Turn legacy WSDL/SOAP services into typed TypeScript clients and optional REST APIs without hand-maintaining XML mappings.

Created from production integration work at [TechSpokes](https://www.techspokes.com); built for teams modernizing real enterprise SOAP integrations.

## Pick Your Path

| Goal | Command | What you get |
|------|---------|-------------|
| Typed SOAP client | `npx wsdl-tsc client` | TypeScript types, typed operations, mockable interface |
| OpenAPI 3.1 spec | `npx wsdl-tsc openapi` | OpenAPI JSON/YAML generated from WSDL |
| Full SOAP-to-REST bridge | `npx wsdl-tsc pipeline` | Client + OpenAPI + Fastify gateway + runnable app |

See [Start Here](docs/start-here.md) for detailed guidance on choosing a path.

## Why Choose This

Most tools in this space stop at one layer: a SOAP runtime, type generation, or spec conversion. This package generates the full stack from a single WSDL source.

- Typed client, OpenAPI spec, REST gateway, and runnable app from one command
- Deterministic output safe for CI regeneration and version control
- Handles complex inheritance, `xs:attribute`, namespace collisions, nested XSD imports, and choice elements
- Generated `operations.ts` interface enables testing without importing `soap` or calling a live service
- OpenAPI is a first-class output, not an afterthought; types, schemas, and descriptions stay aligned
- Opt-in NDJSON streaming for large SOAP responses: client emits `AsyncIterable<RecordType>`, gateway flushes records incrementally, OpenAPI advertises the record schema via `x-wsdl-tsc-stream`
- MIT licensed; generated code is yours with no attribution required

## Installation

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap
```

Requirements: Node.js 20+ and the `soap` package as a runtime dependency.

## Quick Start

### Generate a typed client

```bash
npx wsdl-tsc client \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir ./generated/client
```

This produces `types.ts`, `client.ts`, `operations.ts`, and `utils.ts` in the output directory.

### Generate an OpenAPI spec

```bash
npx wsdl-tsc openapi \
  --wsdl-source examples/minimal/weather.wsdl \
  --openapi-file ./generated/openapi.json
```

### Generate the full stack

```bash
npx wsdl-tsc pipeline \
  --wsdl-source examples/minimal/weather.wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name weather \
  --gateway-version-prefix v1 \
  --init-app
```

### Run and test

```bash
cd generated/app && npm install && cp .env.example .env && npm start
```

```bash
curl http://localhost:3000/health
curl http://localhost:3000/openapi.json | jq .
curl -X POST http://localhost:3000/get-weather-information \
  -H "Content-Type: application/json" -d '{}'
```

## What Gets Generated

| Output | Files | Purpose |
|--------|-------|---------|
| TypeScript Client | client.ts, types.ts, utils.ts, operations.ts | Typed SOAP operations and mockable interface |
| OpenAPI 3.1 Spec | openapi.json or .yaml | REST API documentation aligned with TypeScript types |
| Fastify Gateway | plugin.ts, routes/, schemas/ | Production REST handlers with request/response transform |
| Catalog | catalog.json | Compiled WSDL metadata, debuggable and cacheable |

See [Output Anatomy](docs/output-anatomy.md) for a detailed walkthrough of each file.

## When to Use This

- You have a WSDL and need typed TypeScript access to its operations
- You are building a REST API in front of a SOAP backend
- You want OpenAPI documentation that stays in sync with WSDL changes
- You need deterministic codegen output safe for CI/CD regeneration
- You are modernizing a legacy SOAP integration incrementally
- You have SOAP operations that return large payloads and need to stream records incrementally instead of buffering

## When NOT to Use This

- You need a generic SOAP server implementation: use `soap` directly
- You need multi-language SDK generation: use a platform like APIMatic
- You need API management, rate limiting, or policy enforcement: use an API gateway platform
- Your SOAP service relies on WS-* standards beyond WS-Security hints (partial support)

## Compared to Alternatives

### Why not just use soap (node-soap) directly?

`soap` is a runtime SOAP client. It gives you dynamic access to WSDL operations but no generated types, no compile-time safety, and no path to REST or OpenAPI. This package generates typed artifacts you can commit, review, and test; then optionally bridges to REST.

### Why not use wsdl-tsclient?

wsdl-tsclient generates a typed SOAP client. If that is all you need, it is a solid choice. This package goes further: OpenAPI generation, Fastify gateway scaffolding, deterministic CI-friendly output, and a mockable operations interface. Choose wsdl-tsclient for simplicity; choose this package for modernization projects.

### Why not use a commercial API gateway?

Platform API gateways solve governance, policy, and multi-language SDK generation. This package solves a different problem: developer-owned, code-first modernization of a specific SOAP backend into typed TypeScript and REST. Lower complexity, lower cost, full code ownership.

### Comparison matrix

| Capability | soap | wsdl-tsclient | wsdl-to-ts | this package |
|---|---|---|---|---|
| Actively maintained | yes | stalled | abandoned | yes |
| Call SOAP from Node | yes | yes | indirect | yes |
| Generated TypeScript types | limited | yes | yes | yes |
| Deterministic CI-safe output | no | partial | partial | yes |
| WSDL to OpenAPI 3.1 | no | no | no | yes |
| REST gateway generation | no | no | no | yes |
| Runnable app scaffolding | no | no | no | yes |
| Mockable operations interface | no | no | no | yes |
| Streaming large responses (NDJSON) | no | no | no | yes |

Data as of April 2026.

## Built for Messy WSDLs

Real-world WSDL/XSD files are rarely clean. This generator handles patterns that simpler tools skip.

- Complex type inheritance with `<xs:extension>` and `<xs:restriction>`, including proper attribute and element merging
- `xs:attribute` on complex types, flattened into peer properties alongside elements
- Namespace collisions across multiple XSD imports, resolved deterministically
- Deep import chains across multiple schema files
- Configurable strategies for `<xs:choice>` element modeling
- Correct optionality for nillable fields in both TypeScript and OpenAPI output
- The `$value` pattern for simple content with attributes, preserving text content alongside attribute properties
- `ArrayOf*` wrapper types, unwrapped automatically in OpenAPI with runtime bridging
- `xs:any` wildcard payloads mapped to concrete record shapes from a companion WSDL, enabling streaming over responses that the primary WSDL describes only as opaque wrappers

See [Core Concepts](docs/concepts.md) and [Supported Patterns](docs/supported-patterns.md) for details.

## Testing With Generated Code

The generated `operations.ts` provides a typed interface for mocking the SOAP client without importing the concrete class or the `soap` package:

```typescript
import type { WeatherOperations } from "./generated/client/operations.js";

const mockClient: WeatherOperations = {
  GetCityWeatherByZIP: async (args) => ({
    response: { GetCityWeatherByZIPResult: { Success: true, City: "Test" } },
    headers: {},
  }),
};

import Fastify from "fastify";
import { weatherGateway } from "./generated/gateway/plugin.js";

const app = Fastify();
await app.register(weatherGateway, { client: mockClient, prefix: "/v1/weather" });
```

See [Testing Guide](docs/testing.md) for integration test patterns and mock examples.

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

### Evaluate

| Guide | Description |
|-------|-------------|
| [Start Here](docs/start-here.md) | What this is, who it is for, choose your path |
| [Supported Patterns](docs/supported-patterns.md) | WSDL/XSD features handled and current limitations |
| [Output Anatomy](docs/output-anatomy.md) | What gets generated and how to use it |

### Adopt

| Guide | Description |
|-------|-------------|
| [CLI Reference](docs/cli-reference.md) | All commands with flags and examples |
| [Working With Generated Code](docs/generated-code.md) | Using clients, types, and operations |
| [Configuration](docs/configuration.md) | Security schemes, tags, operation overrides |
| [Migration Playbook](docs/migration-playbook.md) | End-to-end SOAP modernization guide |

### Operate

| Guide | Description |
|-------|-------------|
| [Gateway Guide](docs/gateway-guide.md) | Fastify integration and error handling |
| [Testing Guide](docs/testing.md) | Testing patterns and mock client examples |
| [Production Guide](docs/production.md) | CI/CD, validation, logging |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and debugging |

### Extend

| Guide | Description |
|-------|-------------|
| [Programmatic API](docs/api-reference.md) | TypeScript functions for build tools |
| [Core Concepts](docs/concepts.md) | Flattening, $value, primitives, determinism |
| [Architecture](docs/architecture.md) | Internal pipeline for contributors |
| [Streamable Responses (ADR-002)](docs/decisions/002-streamable-responses.md) | Opt-in streaming: client `AsyncIterable`, gateway NDJSON, `x-wsdl-tsc-stream` |
| [Version Migration](docs/migration.md) | Upgrading between package versions |

## Why This Exists

This package was created while modernizing production SOAP integrations at [TechSpokes](https://www.techspokes.com). The existing options were: hand-write hundreds of TypeScript DTOs and XML mappings, use untyped runtime SOAP calls, or adopt an enterprise platform we did not need.

We built a generator that reads the WSDL contract and produces everything needed to go from legacy SOAP to typed TypeScript and REST, with deterministic output safe for version control and CI.

If you are wrapping a vendor SOAP API in a modern service layer, this is the tool we wished existed when we started.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and guidelines.

## License

MIT. See [LICENSE](LICENSE) for full text. Generated artifacts are fully yours with no restrictions or attribution required.

## Links

- [npm](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
- [Changelog](CHANGELOG.md)
- [Roadmap](ROADMAP.md)
- [Security](SECURITY.md)
- [Sponsor](https://github.com/sponsors/TechSpokes)

Built and maintained by [TechSpokes](https://www.techspokes.com). Created by [Serge Liatko](https://github.com/sergeliatko).

- Community help: [GitHub Discussions](https://github.com/techspokes/typescript-wsdl-client/discussions)
- Bug reports: [GitHub Issues](https://github.com/techspokes/typescript-wsdl-client/issues)
- Commercial support and integration consulting: [techspokes.com/contact](https://www.techspokes.com/contact/)
