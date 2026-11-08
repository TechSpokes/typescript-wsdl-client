# Agent Skill Architecture

This reference describes the stable model agents should use when applying `@techspokes/typescript-wsdl-client` inside consumer projects.

## Inputs

The source of truth is a WSDL URL or file path. In legacy generation, a compiled `catalog.json` can become the local source of truth for later stages when a project wants repeatable generation without reloading the WSDL.

Configuration files refine generation behavior. Common examples include security configuration, tag configuration, operation overrides, and stream configuration.

## Checked Generation

`pipeline --model checked-components-v1` reuses native source, mapping, XML and SOAP owners for its qualified structured fragment. It loads declared dependencies, derives unambiguous selections and emits source snapshots, operation inventories, matched clients/contracts, OpenAPI, gateways and optional app/tests. Planning reports are diagnostics and grant no runtime authority; invocation rechecks authorized physical source files and artifact compatibility.

The checked path is buffered and separate from legacy catalog generation and streaming. Native checks may exceed the JSON shape expressed by OpenAPI. Optional companion projections carry explicit validation scope, and unsupported requirements remain refusals. Do not infer universal support, production security or provider acceptance from successful generation.

## Catalog

This catalog workflow describes the legacy model. Opt-in checked generation uses the source-backed workflow above.

The catalog is the intermediate representation shared by generation stages. Use it to inspect services, operations, schema types, WSDL documentation, and stream metadata.

Catalog paths matter. Keep the catalog co-located with generated output unless a project has an explicit build layout.

## Client

The client output provides TypeScript types, a SOAP client class, helper utilities, and an operations interface. Consumer code should depend on the operations interface for tests and dependency injection when possible.

The `soap` package is a runtime dependency because the generated client calls node-soap at runtime.

## OpenAPI

OpenAPI output mirrors the generated TypeScript model and SOAP operation shapes. Use it as the contract for REST gateway generation and downstream API tooling.

The OpenAPI spec can include security schemes, operation tags, envelope schemas, and streaming metadata when configured.

## Gateway

Gateway output turns OpenAPI operations into Fastify route handlers. The generated plugin accepts a typed operations implementation and translates HTTP requests into SOAP operation calls.

Gateway routes are generated artifacts. Customize authentication, authorization, observability, deployment, and business policy in surrounding Fastify code or middleware.

## App

The app scaffold is a runnable Fastify project that wires the generated client and gateway plugin together. Use it for quick adoption, smoke testing, or a starting point for a service wrapper.

App server, package/configuration and README files are editable scaffolds, preserved unless app force regeneration is selected. Adopt and maintain these files according to consumer conventions; keep them outside disposable or globally ignored output when they become maintained source.

## Tests

Legacy generated tests use the operations interface to avoid live SOAP calls. Checked app scaffold checks cover health, OpenAPI and invalid-input refusal without upstream dispatch. Consumer tests can mock operation responses and assert HTTP behavior through Fastify injection or their existing HTTP stack; independent SOAP wire and provider/business acceptance remain separate. Load `references/testing.md` for setup and run commands.

## Regeneration Boundary

Regenerate generator-owned client, gateway, OpenAPI and checked source/capsule artifacts from inputs and configuration instead of patching them. Preserve consumer-owned app/test scaffolds and deliberately merge changes when refreshing them. Classify files by ownership rather than their parent directory: a checked app contains both replaceable artifacts and maintained scaffolds.

