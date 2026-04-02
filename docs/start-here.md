# Start Here

This page helps you understand what this package does, decide if it fits your needs, and find the fastest path to your first result.

## What This Package Does

`@techspokes/typescript-wsdl-client` reads a WSDL/XSD definition and generates typed TypeScript code. Depending on the command you run, you get a typed SOAP client, an OpenAPI 3.1 specification, a Fastify REST gateway, or all of the above.

The generated output is deterministic: re-running the same command produces identical files, safe for version control and CI regeneration.

## Who It Is For

- TypeScript teams integrating with SOAP services who want type safety without hand-writing DTOs
- Teams modernizing legacy SOAP integrations into REST APIs
- Developers who need OpenAPI documentation derived from WSDL contracts
- Projects that require deterministic code generation under version control

## Choose Your Path

### I need a typed SOAP client

Run the `client` command. This generates TypeScript interfaces for all WSDL types and a typed client class with one method per SOAP operation.

```bash
npx wsdl-tsc client \
  --wsdl-source your-service.wsdl \
  --client-dir ./generated/client
```

You get `types.ts`, `client.ts`, `operations.ts`, and `utils.ts`. Import the client, call typed methods, and let TypeScript catch contract mismatches at compile time.

Next: [Working With Generated Code](generated-code.md)

### I need an OpenAPI spec from a WSDL

Run the `openapi` command. This generates an OpenAPI 3.1 specification with schemas derived from the same type system used for the TypeScript client.

```bash
npx wsdl-tsc openapi \
  --wsdl-source your-service.wsdl \
  --openapi-file ./generated/openapi.json
```

The spec includes paths for each SOAP operation, request/response schemas, and descriptions propagated from WSDL documentation annotations.

Next: [CLI Reference](cli-reference.md) for OpenAPI-specific flags

### I need a REST gateway over SOAP

Run the `pipeline` command with `--init-app`. This generates the typed client, OpenAPI spec, Fastify gateway handlers, and a runnable application in one step.

```bash
npx wsdl-tsc pipeline \
  --wsdl-source your-service.wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name my-service \
  --gateway-version-prefix v1 \
  --init-app
```

The gateway transforms JSON HTTP requests into SOAP calls and returns JSON responses. Each WSDL operation becomes a POST endpoint.

Next: [Gateway Guide](gateway-guide.md) for integration details, then [Migration Playbook](migration-playbook.md) for the full modernization workflow

## What NOT to Expect

This package does not replace a full API management platform. It does not provide rate limiting, policy enforcement, or multi-language SDK generation. It generates code; it does not run a proxy or manage deployments.

For more on scope boundaries, see the "When NOT to Use This" section of the [README](../README.md).

## Next Steps

| Goal | Read |
|------|------|
| Understand what files are generated | [Output Anatomy](output-anatomy.md) |
| See which WSDL patterns are supported | [Supported Patterns](supported-patterns.md) |
| Learn about type modeling decisions | [Core Concepts](concepts.md) |
| Plan a full SOAP-to-REST migration | [Migration Playbook](migration-playbook.md) |
| Set up testing for generated code | [Testing Guide](testing.md) |
| Review all CLI flags | [CLI Reference](cli-reference.md) |
