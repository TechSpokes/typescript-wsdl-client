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

### I need to stream large SOAP responses

Some SOAP services return payloads that are too large or too slow to buffer in memory. Opt selected operations into streaming with a small JSON config and the `--stream-config` flag. Operations not listed keep their buffered behavior, so existing output stays byte-for-byte unchanged.

```bash
npx wsdl-tsc pipeline \
  --wsdl-source your-service.wsdl \
  --client-dir ./generated/client \
  --openapi-file ./generated/openapi.json \
  --gateway-dir ./generated/gateway \
  --gateway-service-name my-service \
  --gateway-version-prefix v1 \
  --stream-config ./stream.config.json
```

Minimal `stream.config.json`:

```json
{
  "operations": {
    "MyStreamOp": {
      "recordType": "MyRecordType",
      "recordPath": ["MyStreamOpResponse", "Records", "Record"]
    }
  }
}
```

Stream operations return `StreamOperationResponse<RecordType>` on the client (`records: AsyncIterable<RecordType>`), emit `application/x-ndjson` on the gateway, and advertise the record schema in OpenAPI via the `x-wsdl-tsc-stream` extension.

Next: [ADR-002: Streamable Responses](decisions/002-streamable-responses.md) for rationale and terminal-error policy, then [Stream Configuration](configuration.md#stream-configuration) for the full file reference.

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
| Opt specific operations into NDJSON streaming | [ADR-002](decisions/002-streamable-responses.md) and [Stream Configuration](configuration.md#stream-configuration) |
