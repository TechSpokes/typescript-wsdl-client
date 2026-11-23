# TypeScript WSDL Client

[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![CI](https://github.com/TechSpokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/TechSpokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

Generate a typed SOAP client from a WSDL. Use it directly in Node.js or generate an OpenAPI 3.1 specification and a Fastify REST gateway from the same contract.

The generated operations interface lets you test your integration with a mock client. Deterministic output makes regeneration diffs reviewable when the WSDL changes.

## Quick start

In a Node.js 24+ project, save your WSDL as `service.wsdl` and keep its imports accessible. Install the generator as a development dependency and `soap` as a runtime dependency for the default client.

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap
npx wsdl-tsc client --wsdl-source ./service.wsdl --client-dir ./.generated/client
```

The client, types, and mockable operations interface are now in `.generated/client/`. [Use the generated client](docs/generated-code.md#client-construction)

## Choose what to generate

| Goal | Command | Guide |
| --- | --- | --- |
| Call SOAP from TypeScript | `wsdl-tsc client` | [Client setup](docs/start-here.md#i-need-a-typed-soap-client) |
| Describe the REST contract | `wsdl-tsc openapi` | [OpenAPI generation](docs/start-here.md#i-need-an-openapi-spec-from-a-wsdl) |
| Run a REST API over SOAP | `wsdl-tsc pipeline --init-app` | [Generate the full stack](docs/start-here.md#i-need-a-rest-gateway-over-soap) |
| Combine independent SOAP services | `wsdl-tsc pipeline --services-config ./services.json` | [Legacy multi-service gateway](docs/gateway-guide.md#multi-service-setup) |

Legacy generation is the default. Use `--model checked-components-v1` to validate requests and responses against supported WSDL and XSD contracts. Checked responses are buffered by default. Since v1.15.0, selected credential-free SOAP 1.1 document/literal operations can yield validated records before the response ends, with NDJSON or JSON-array output through the gateway. [Try checked generation](docs/checked-generation.md) · [Configure checked streaming](docs/checked-streaming.md)

## Documentation

| Task | Where to start |
| --- | --- |
| Evaluate your WSDL | [Start here](docs/start-here.md) · [Supported patterns](docs/supported-patterns.md) |
| Generate and configure | [CLI](docs/cli-reference.md) · [TypeScript API](docs/api-reference.md) · [Configuration](docs/configuration.md) |
| Run and test your integration | [Gateway](docs/gateway-guide.md) · [Consumer testing](docs/testing.md#for-consumer-projects) · [Production](docs/production.md) · [Troubleshooting](docs/troubleshooting.md) |
| Upgrade or migrate | [Version migration](docs/migration.md) · [Migration playbook](docs/migration-playbook.md) |
| Browse all guides | [Documentation index](docs/README.md) |

## Releases and support

[v1.15.0 release](https://github.com/TechSpokes/typescript-wsdl-client/releases/tag/v1.15.0) · [Changelog](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CHANGELOG.md) · [Roadmap](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/ROADMAP.md)

Built and maintained by TechSpokes. Created by Serge Liatko.

[Contributing](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) · [Discussions](https://github.com/TechSpokes/typescript-wsdl-client/discussions) · [Issues](https://github.com/TechSpokes/typescript-wsdl-client/issues) · [Security](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/SECURITY.md) · [Commercial support](https://www.techspokes.com/contact/) · [Sponsor](https://github.com/sponsors/TechSpokes)
