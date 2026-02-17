# Production Guide

Guidance for using wsdl-tsc generated code in production environments.

See [README](../README.md) for quick start and [Gateway Guide](gateway-guide.md) for integration patterns.

## Deterministic Output

All generated code and specifications have stable, deterministic ordering for version control:

- TypeScript files: sorted type declarations, imports, and exports
- OpenAPI specs: sorted paths, HTTP methods, schemas, parameters, security schemes, tags
- JSON Schemas: sorted property keys and component names
- Gateway routes: alphabetically organized route files
- Catalog JSON: consistent ordering of types and operations

Regenerate safely in CI/CD without spurious diffs.

## Validation

### OpenAPI Validation

Enabled by default using @apidevtools/swagger-parser. Validates schema structure, resolves all $ref references, catches missing schemas and circular dependencies. Disable with `--openapi-validate false`.

### Gateway Contract Validation

All request/response bodies must use $ref to components.schemas. Every operation must have a default response with application/json content. All referenced schemas must exist in components.schemas.

## SOAP Wire Logging

Enable SOAP request/response debugging:

```bash
NODE_DEBUG=soap node app.js
```

This logs full XML request/response payloads to console.

## CI/CD Tips

### Caching Strategy

```bash
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/Service.wsdl \
  --catalog-file ./build/catalog.json

npx wsdl-tsc client --catalog-file ./build/catalog.json --client-dir ./src/client
npx wsdl-tsc openapi --catalog-file ./build/catalog.json --openapi-file ./docs/api.json
```

### Recommended Build Script

```json
{
  "scripts": {
    "generate": "npx wsdl-tsc pipeline --wsdl-source ./wsdl/service.wsdl --client-dir ./src/client --openapi-file ./docs/api.json --gateway-dir ./src/gateway --gateway-service-name svc --gateway-version-prefix v1",
    "build": "npm run generate && tsc",
    "typecheck": "tsc --noEmit"
  }
}
```

## Known Limitations

### Choice Elements

Current strategy: all-optional (all branches optional). Discriminated union support is planned.

### Union Types

Experimental --client-choice-mode union available. May require manual refinement for complex patterns.

### WS-Policy

Security hints extracted from policies. Custom policies may require manual security configuration.

### Array Wrapper Flattening

Single-child sequences with maxOccurs>1 become array schemas. Sequences with multiple children preserve wrapper.
