# Consumer Workflows

This reference gives stable workflows for agents using `@techspokes/typescript-wsdl-client` in consumer projects.

## Full SOAP-to-REST Adoption

Use `pipeline` when the project needs a typed SOAP client, OpenAPI contract, REST gateway, and optional runnable app from the same WSDL.

1. Install the package as a development dependency and install `soap` as a runtime dependency.
2. Choose generated output directories under the consumer project's source or generated-code area.
3. Run `npx wsdl-tsc pipeline` with the WSDL source, client directory, OpenAPI file, gateway directory, service name, and version prefix.
4. Add configuration files for security, tags, operation overrides, or streaming only when the integration needs them.
5. Run the consumer project's typecheck and tests.
6. Commit the WSDL reference, configuration files, generated output policy, and tests according to the consumer project's conventions.

## Typed SOAP Client Only

Use `client` when the project only needs TypeScript access to SOAP operations.

Generate the client into a stable directory and consume the exported operations interface in application code or tests. Keep wrapper code outside the generated client directory.

## OpenAPI Contract Only

Use `openapi` when the project needs a REST contract or API documentation without generated Fastify routes.

Prefer a catalog input when the project already generated and reviewed one. Keep the OpenAPI file path stable so downstream tools and gateway generation can reuse it.

## Gateway From Existing OpenAPI

Use `gateway` when a project already has a generated OpenAPI file and needs Fastify route handlers.

Generate the gateway from the OpenAPI file and point it at the generated client directory. Register the generated plugin from application-owned Fastify setup code.

## App Scaffold

Use `app` or `pipeline --init-app` when the project wants a runnable service wrapper quickly.

Treat the scaffold as generated output. Put long-lived service behavior in application-owned modules, middleware, configuration, and deployment files.

## Catalog Debugging

Use `compile` when the project needs to inspect WSDL compilation output or isolate generation problems.

Read the catalog to confirm service names, operations, type names, namespaces, and WSDL documentation before changing generator options.

## Streaming Adoption

Use stream configuration only for operations with large response payloads that should flush records incrementally.

Regenerate the client, OpenAPI, gateway, and tests together after changing stream configuration. Streaming changes affect TypeScript return types, OpenAPI content types, gateway behavior, and generated test expectations.

## Choice Modeling

Use the default `all-optional` choice mode when a project needs backward-compatible generated shapes for existing SOAP payload code.

Use `--client-choice-mode union` when a project wants stricter generated models for `xs:choice` groups. Regenerate the catalog, client, OpenAPI, gateway, and generated tests together because union mode affects TypeScript branch unions, OpenAPI validation constraints, generated mocks, and generated validation tests.

## Validation

After generation, run the consumer project's typecheck and tests. For gateway work, add route tests around the generated plugin with a typed mock operations implementation.
