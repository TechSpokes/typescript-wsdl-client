# Documentation

Find the guide for your stage of a SOAP integration. See the [repository README](../README.md) for installation and a first generation command.

## Evaluate and get started

| Guide | Use it to |
| --- | --- |
| [Start Here](start-here.md) | Choose and run your first generation workflow |
| [Supported Patterns](supported-patterns.md) | Check WSDL, XSD and SOAP coverage |
| [Product Corpus](corpus.md) | See representative inputs and maintained evidence |
| [Core Concepts](concepts.md) | Understand mappings, primitive types, and determinism |

## Generate and configure

| Guide | Use it to |
| --- | --- |
| [CLI Reference](cli-reference.md) | Find commands, flags and diagnostics |
| [Programmatic API](api-reference.md) | Generate or assess contracts from TypeScript |
| [Try Checked Generation](checked-generation.md) | Try the bundled contract or bring your own WSDL |
| [Configuration](configuration.md) | Configure security, operations, and stream selection |
| [Output Anatomy](output-anatomy.md) | Find client, catalog, OpenAPI, gateway and scaffold files |
| [Agent Skill](agent-skill.md) | Install the consumer-project agent guidance |

## Integrate, stream and operate

| Guide | Use it to |
| --- | --- |
| [Working With Generated Code](generated-code.md) | Call operations, use types and mock the client |
| [Gateway Guide](gateway-guide.md) | Integrate Fastify, handle errors and combine services |
| [Checked Gateway Reference](checked-gateway.md) | Configure checked SOAP, values, faults and credentials |
| [Checked Streaming](checked-streaming.md) | Select records, consume completion and choose an HTTP format |
| [Legacy Stream Configuration](configuration.md#stream-configuration) | Configure the legacy record path and media type |
| [XML/JSON Mapping Contract](mapping-contract.md) | Interpret checked nil, namespaces, attributes and groups |
| [Direct Scalar Values](direct-values.md) | Inspect the bounded scalar codec and compatibility runtime |
| [Consumer Testing](testing.md#for-consumer-projects) | Exercise generated code and owned SOAP exchanges |
| [Production](production.md) | Manage regeneration, validation and logging |
| [Troubleshooting](troubleshooting.md) | Diagnose generation, installation and streaming failures |

## Upgrade and migrate

| Guide | Use it to |
| --- | --- |
| [Version Migration](migration.md) | Upgrade the package and decide when to regenerate |
| [Migration Playbook](migration-playbook.md) | Plan a SOAP-to-REST migration |
| [Changelog](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CHANGELOG.md) | Read the version history |
| [v1.15.0 Release Notes](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/releases/v1.15.0.md) | Adopt checked SOAP streaming |
| [All Published Releases](https://github.com/TechSpokes/typescript-wsdl-client/releases) | Find release notes and assets by version |

## Contribute and verify

| Guide | Use it to |
| --- | --- |
| [Contributing](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) | Set up the repository and prepare a pull request |
| [Architecture](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/architecture.md) | Follow the generator pipeline and contracts |
| [Repository Testing](testing.md#test-architecture) | Select verification and inspect evidence |
| [Reference Validation](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/reference-validation.md) | Understand the independent evidence lane |
| [File Naming and Paths](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/file-naming-and-path-organization.md) | Place new source files and fixtures |
| [Release Delivery](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/releases/README.md) | Prepare and verify a release candidate |
| [Documentation Conventions](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/AGENTS.md) | Edit guides and maintain this index |

## Roadmap and qualification

| Record | Scope |
| --- | --- |
| [Current Roadmap](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/ROADMAP.md) | Product direction and remaining acceptance |
| [Version 1.0 Plan](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/README.md) | Completed 1.0 implementation slices |
| [Checked Part A Coverage](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/checked-part-a-coverage.md) | Paired legacy and checked contracts |
| [Checked Streaming Delivery](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/checked-streaming-execution.md) | Released scope, installed evidence and remaining parity |
| [Multi-Service Gateway Status](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/multi-service-gateway.md) | Native legacy composition and deferred checked composition |
| [Buffered SOAP Completion](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/v1.0-buffered-soap-completion.md) | Completed adapter and verification checklist |
| [Published Consumer Acceptance](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/v1.0-published-consumer-acceptance.md) | Accepted Escapia buffered upgrade |
| [Checked Atomic Unions](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/v1.0-checked-atomic-unions.md) | Lexical member selection and fixed equality |
| [Checked Lists of Atomic Unions](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/roadmap/v1.0-checked-atomic-union-lists.md) | Lexical token sequences and witnesses |
| [NOAA NDFD Qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/noaa-ndfd-qualification.md) | Owned RPC proof, live results and fixture provenance |
| [ONVIF Media Qualification](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/onvif-media-qualification.md) | Installed SOAP 1.2 proof and release scope |

## Design decisions and content-model evidence

| Record | Scope |
| --- | --- |
| [Streamable Responses](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/002-streamable-responses.md) | Stream formats and terminal behavior |
| [Content-Model Contracts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/003-content-model-contracts.md) | Fidelity, support profiles and compatibility |
| [Product and Research Boundary](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/004-product-research-boundary.md) | Separate package and research responsibilities |
| [Protocol Fault Compatibility](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/005-checked-protocol-fault-compatibility.md) | Runtime adoption and complete-source inspection |
| [Content-Model Baseline](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-baseline.md) | Reproducible reference evidence and limits |
| [Shipped Fix Reconciliation](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-shipped-fix.md) | Occurrence fixes and contributor attribution |
| [Content-Model Decision Register](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-decisions.md) | S02 decisions and prerequisites |
| [SOAP Feasibility](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-soap-feasibility.md) | Wire observations and transport capability boundaries |
| [Gateway Feasibility](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-gateway-feasibility.md) | Validation and serialization evidence |
| [Ordered Schema Loading](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-loading.md) | Syntax, provenance and resolution |
| [Canonical Schema Graph](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-graph.md) | Declarations, particles and lexical context |
| [Canonical Reference Resolution](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-resolution.md) | Namespace visibility, recursion and cycle diagnostics |
| [Canonical Derivation Composition](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-composition.md) | Extension, restriction, attributes and wildcard legality |
| [Structural Companion Catalogs](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-companions.md) | Source closures and structural equality |
| [Exact Particle Analysis](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-analysis.md) | Occurrence and emptiness analysis |
| [Semantic Catalog Format 2](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-catalog.md) | Deterministic persistence and compatibility routing |
| [Checked WSDL Readiness](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-readiness.md) | Assessment corpus and bounded implementation evidence |
| [Direct Structural Matching](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/content-model-matching.md) | Structure-only matcher and scalar handoff |
| [Research Program](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/research/README.md) | Optional experiments and historical investigations |
