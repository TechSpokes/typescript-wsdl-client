# TypeScript WSDL Client

[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![Monthly npm downloads](https://img.shields.io/npm/dm/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![CI](https://github.com/TechSpokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/TechSpokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When a SOAP service changes, handwritten TypeScript types and XML mappings can drift from its WSDL. If you expose that service over REST, there are also HTTP schemas and handlers to keep in sync.

TypeScript WSDL Client generates a typed SOAP client for Node.js and, when you need them, an OpenAPI 3.1 specification and a Fastify REST gateway from the same WSDL. Deterministic output makes regeneration diffs reviewable, and the generated operations interface lets you test with a mock client.

## Quick start

Use Node.js 24 or later. Install the generator as a development dependency and `soap` as a runtime dependency for the default client.

```bash
npm install --save-dev @techspokes/typescript-wsdl-client
npm install soap
npx wsdl-tsc client --wsdl-source ./service.wsdl --client-dir ./.generated/client
```

Set `--wsdl-source` to a local file or an HTTP(S) WSDL URL such as `"https://provider.example/Service.svc?wsdl"`. Keep any imported WSDL and XSD files accessible.

For hosted WSDLs, the generator resolves relative XSD imports against the document URL on all supported platforms.

The generated client, types, and operations interface are in `.generated/client/`. [Use the generated client](docs/generated-code.md#client-construction)

## Choose what to generate

| Goal | Command to start with | Guide |
| --- | --- | --- |
| Call SOAP from TypeScript | `wsdl-tsc client` | [Client setup](docs/start-here.md#i-need-a-typed-soap-client) |
| Describe the REST contract | `wsdl-tsc openapi` | [OpenAPI generation](docs/start-here.md#i-need-an-openapi-spec-from-a-wsdl) |
| Generate a runnable REST gateway | `wsdl-tsc pipeline --init-app` | [Generate the stack and run the app](docs/start-here.md#i-need-a-rest-gateway-over-soap) |
| Combine independent SOAP services | `wsdl-tsc pipeline --services-config ./services.json` | [Multi-service gateway](docs/gateway-guide.md#multi-service-setup) |

The quick start and multi-service workflow use default generation, named `legacy` in the CLI and API. Choose `--model checked-components-v1` for runtime validation of requests and responses against supported WSDL and XSD contracts. Checked generation follows declared same-origin imports and requires permission for additional origins. [Try checked generation](docs/checked-generation.md)

Selected credential-free SOAP 1.1 document/literal operations can stream validated records before the upstream response ends. Checked clients report terminal completion separately, and Fastify gateways can emit NDJSON or JSON arrays. [Configure checked streaming](docs/checked-streaming.md)

## How it compares

| Approach | When it fits |
| --- | --- |
| Runtime SOAP client such as [node-soap](https://github.com/vpulim/node-soap) | Call a SOAP service from Node.js and define the application-facing interface yourself. The default client generated here also uses node-soap. |
| Typed SOAP client generator such as [wsdl-tsclient](https://github.com/dderevjanik/wsdl-tsclient) | Generate a TypeScript SOAP client or WSDL-derived types for direct integration. |
| TypeScript WSDL Client | Generate a typed client on its own, or generate the client, OpenAPI specification, Fastify routes, and runnable app from the same WSDL. |
| Managed API gateway such as [Amazon API Gateway](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-usage-plans.html) | Operate a deployed API with controls such as throttling and usage quotas. This can complement a generated Fastify app. |

## Documentation

| Task | Where to start |
| --- | --- |
| Evaluate your WSDL | [Start here](docs/start-here.md) · [Supported patterns](docs/supported-patterns.md) |
| Generate and configure | [CLI](docs/cli-reference.md) · [TypeScript API](docs/api-reference.md) · [Configuration](docs/configuration.md) |
| Run and test your integration | [Gateway](docs/gateway-guide.md) · [Consumer testing](docs/testing.md#for-consumer-projects) · [Production](docs/production.md) · [Troubleshooting](docs/troubleshooting.md) |
| Upgrade or migrate | [Version migration](docs/migration.md) · [Migration playbook](docs/migration-playbook.md) |
| Browse all guides | [Documentation index](docs/README.md) |

## Releases and support

[Latest release](https://github.com/TechSpokes/typescript-wsdl-client/releases/latest) · [Changelog](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CHANGELOG.md) · [Roadmap](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/ROADMAP.md)

Created by Serge Liatko at TechSpokes for production SOAP integrations. TechSpokes maintains the project.

[Contributing](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) · [Discussions](https://github.com/TechSpokes/typescript-wsdl-client/discussions) · [Issues](https://github.com/TechSpokes/typescript-wsdl-client/issues) · [Security](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/SECURITY.md) · [Commercial support](https://www.techspokes.com/contact/) · [Sponsor](https://github.com/sponsors/TechSpokes)
