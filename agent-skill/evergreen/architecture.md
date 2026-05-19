# Agent Skill Architecture

This reference describes the stable model agents should use when applying `@techspokes/typescript-wsdl-client` inside consumer projects.

## Inputs

The source of truth is a WSDL URL or file path. A compiled `catalog.json` can become the local source of truth for later stages when a project wants repeatable generation without reloading the WSDL.

Configuration files refine generation behavior. Common examples include security configuration, tag configuration, operation overrides, and stream configuration.

## Catalog

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

Regenerate the app from configuration instead of patching scaffold internals when the change belongs to generated structure.

## Tests

Generated tests use the operations interface to avoid live SOAP calls. Consumer tests should mock SOAP responses at the operation boundary and assert HTTP behavior through Fastify injection or the project's HTTP test stack.

## Regeneration Boundary

Never treat generated `client/`, `gateway/`, or `app/` files as the durable customization layer. Durable changes belong in WSDL inputs, generator configuration, wrapper code, middleware, or tests.

