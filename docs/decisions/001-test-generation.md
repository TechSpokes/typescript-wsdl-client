# ADR 001: Generated Test Suite for Gateway Artifacts

## Status

Accepted

## Context

Users of generated Fastify gateways have no automated way to verify the generated code works. The only testing path is to manually write Vitest tests following the pattern in this project's own `test/integration/gateway-routes.test.ts`. The FST_ERR_FAILED_ERROR_SERIALIZATION bug (fixed in 0.11.1) proved that generated code can have subtle runtime issues that only surface under specific conditions. Generated tests would catch these immediately.

## Decision

Add an opt-in `--test-dir` flag to the pipeline command that generates a complete, runnable Vitest test suite validating all generated gateway artifacts.

### Why generated tests (not a test library)

A reusable test library would require users to configure imports, mock data, and test structure themselves. Generated tests are zero-config: they import the exact generated modules with correct relative paths, use mock data derived from the actual catalog types, and run immediately with `npx vitest run`.

### Why full mocks (not placeholders)

Placeholder mocks (empty objects, `TODO` comments) require manual effort before tests pass. Full mocks generated from catalog type metadata produce passing tests out of the box. Property names and types come from the compiled catalog's `meta.childType` map, so mock data matches the actual SOAP response shape.

### Why skip-if-exists

Test files are meant to be customized after generation. Re-running the pipeline should not overwrite user modifications. The `--force-test` flag provides an explicit override when regeneration is desired.

### Relationship to operations.ts interface

The generated `{ClassName}Operations` interface (from `operations.ts`) is the natural seam for mock injection. The mock client helper implements this interface with full default responses per operation. This matches the pattern established in `test/integration/gateway-routes.test.ts`.

## Consequences

- Users get immediate test coverage for generated gateway code
- Mock data stays in sync with WSDL schema changes (regenerate to update)
- Test files can be customized without risk of overwrite
- Additional CLI flag and pipeline step increase the surface area to maintain
