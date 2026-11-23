# Start Here

This page helps you understand what this package does, decide if it fits your needs, and find the fastest path to your first result.

See the [README](../README.md#quick-start) for installation and the first client-generation command.

## Upgrade an existing project

Read the [migration guide for the intended version](migration.md) before regenerating an existing gateway. The [v1.15.0 upgrade](migration.md#from-114x-to-1150) explains how to adopt checked streaming. Installing the package does not itself rewrite generated code, but consumer build/install scripts can run generation. Legacy remains the default.

Use the existing generation command and preserve app/test customizations first. Adopt native composition or checked generation separately; successful representative release tests do not certify migration of every consumer project.

## What This Package Does

`@techspokes/typescript-wsdl-client` reads a WSDL/XSD definition and generates typed TypeScript code. Depending on the command you run, you get a typed SOAP client, an OpenAPI 3.1 specification, a Fastify REST gateway, or all of the above.

The generated output is deterministic: re-running the same command produces identical files, safe for version control and CI regeneration.

## Who It Is For

- TypeScript teams integrating with SOAP services who want type safety without hand-writing DTOs
- Teams modernizing legacy SOAP integrations into REST APIs
- Developers who need OpenAPI documentation derived from WSDL contracts
- Projects that require deterministic code generation under version control

## Choose Your Path

Use legacy generation for existing DTO and envelope integrations. Use `pipeline --services-config` to combine independent legacy SOAP services. Choose the checked model for source-backed validation, including supported document/literal operations and the bounded SOAP 1.1 RPC/encoded string profile. [Multi-service setup](gateway-guide.md#multi-service-setup) · [Try checked generation](checked-generation.md)

### I need a typed SOAP client

Run the `client` command. This generates TypeScript interfaces for all WSDL types and a typed client class with one method per SOAP operation.

```bash
npx wsdl-tsc client \
  --wsdl-source your-service.wsdl \
  --client-dir ./.generated/client
```

You get `types.ts`, `client.ts`, `operations.ts`, and `utils.ts`. Import the client, call typed methods, and let TypeScript catch contract mismatches at compile time.

Next: [Working With Generated Code](generated-code.md)

### I need an OpenAPI spec from a WSDL

Run the `openapi` command. This generates an OpenAPI 3.1 specification with schemas derived from the same type system used for the TypeScript client.

```bash
npx wsdl-tsc openapi \
  --wsdl-source your-service.wsdl \
  --openapi-file ./.generated/openapi.json
```

The spec includes paths for each SOAP operation, request/response schemas, and descriptions propagated from WSDL documentation annotations.

Next: [CLI Reference](cli-reference.md) for OpenAPI-specific flags

### I need a REST gateway over SOAP

Run the `pipeline` command with `--init-app`. This generates the typed client, OpenAPI spec, Fastify gateway handlers, and a runnable application in one step.

```bash
npx wsdl-tsc pipeline \
  --wsdl-source your-service.wsdl \
  --client-dir ./.generated/client \
  --openapi-file ./.generated/openapi.json \
  --gateway-dir ./.generated/gateway \
  --gateway-service-name my-service \
  --gateway-version-prefix v1 \
  --init-app
```

The gateway transforms JSON HTTP requests into SOAP calls and returns JSON responses. Each WSDL operation becomes a POST endpoint.

[Run the generated app](cli-reference.md#quick-start) · [Gateway integration](gateway-guide.md) · [Migration playbook](migration-playbook.md)

### I want to try source-backed checked generation

Run `pipeline --model checked-components-v1` to generate from the original WSDL and its declared dependencies. Supported contracts receive native request, response and fault checks. The checked planner reports unsupported and unresolved capabilities.

Try the bundled contract and learn how to set endpoints and resolve missing schemas. [Checked generation walkthrough](checked-generation.md)

### I need to stream large SOAP responses

Checked generation supports source-backed validation for supported contracts. It is buffered by default. Since v1.15.0, eligible SOAP 1.1 document/literal operations can opt into streaming through `checkedComponents.streams`. [Checked streaming](checked-streaming.md)

For a checked stream, consume typed records and observe terminal completion separately. Gateways can emit NDJSON or JSON arrays.

For legacy streams, select operations with `--stream-config`. The stream returns mapped DTO records directly. Unselected operations use the buffered contract.

```bash
npx wsdl-tsc pipeline \
  --wsdl-source your-service.wsdl \
  --client-dir ./.generated/client \
  --openapi-file ./.generated/openapi.json \
  --gateway-dir ./.generated/gateway \
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

Stream operations return `StreamOperationResponse<RecordType>` on the client (`records: AsyncIterable<RecordType>`), emit `application/x-ndjson` by default on the gateway, and advertise the record schema in OpenAPI via the `x-wsdl-tsc-stream` extension.

Set `"format": "json-array"` in the stream config when downstream clients need one `application/json` array document instead of NDJSON lines.

Next: [ADR-002: Streamable Responses](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/002-streamable-responses.md) for rationale and terminal-error policy, then [Stream Configuration](configuration.md#stream-configuration) for the full file reference.

### I want an AI agent to help in my project

Release assets include an optional `typescript-wsdl-client` agent skill ZIP for consumer-project AI agents. Install it when you want an agent to choose `wsdl-tsc` commands, respect generated-output boundaries, load package reference docs, and validate generated clients, OpenAPI specs, gateways, apps, tests, or catalogs in your repository.

Next: [Agent Skill Artifact](agent-skill.md) for package contents, installation, and maintainer validation details.

## What NOT to Expect

This package does not replace a full API management platform. It does not provide rate limiting, policy enforcement, or multi-language SDK generation. It generates code; it does not run a proxy or manage deployments.

Check the coverage of your WSDL and transport before adopting the generated integration. [Supported patterns](supported-patterns.md)

## Next Steps

| Goal | Read |
|------|------|
| Understand what files are generated | [Output Anatomy](output-anatomy.md) |
| See which WSDL patterns are supported | [Supported Patterns](supported-patterns.md) |
| Learn about type modeling decisions | [Core Concepts](concepts.md) |
| Plan a full SOAP-to-REST migration | [Migration Playbook](migration-playbook.md) |
| Set up testing for generated code | [Testing Guide](testing.md) |
| Review all CLI flags | [CLI Reference](cli-reference.md) |
| Opt specific operations into response streaming | [Checked streaming](checked-streaming.md) or [Legacy stream configuration](configuration.md#stream-configuration) |
| Install package-specific agent guidance | [Agent Skill Artifact](agent-skill.md) |
