# Troubleshooting

Common issues and debugging guidance for wsdl-tsc.

See [README](../README.md) for quick start and [CLI Reference](cli-reference.md) for command details.

## Common Issues

| Symptom | Resolution |
|---------|------------|
| WSDL fetch fails | Curl the URL, check TLS/proxy settings, retry with local copy |
| Unresolved type references | Re-run with --client-fail-on-unresolved=false to inspect partial graph |
| Missing schema in OpenAPI | Ensure the global element exists (catalog shows compiled symbols) |
| Wrong array modeling | Check maxOccurs in WSDL; tool only arrays when maxOccurs>1 or unbounded |
| Authentication errors | Provide proper soap.ISecurity instance (WSSecurity, BasicAuthSecurity) |
| Date/time confusion | Use --client-date-as Date for runtime Date objects |
| TypeScript compilation errors | Check --import-extensions matches your tsconfig moduleResolution |
| Gateway validation failures | Ensure OpenAPI has valid $ref paths and all schemas in components.schemas |
| Catalog file not found | Catalog defaults to output directory; use --catalog-file to specify |

## SOAP Wire Logging

Enable SOAP request/response debugging:

```bash
NODE_DEBUG=soap node app.js
```

## Verify Installation

```bash
npx wsdl-tsc --help
npm run smoke:pipeline
```

## TypeScript Configuration

Ensure your tsconfig.json is compatible:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Catalog Inspection

Examine the compiled catalog to debug type resolution:

```bash
npx wsdl-tsc compile \
  --wsdl-source ./wsdl/Hotel.wsdl \
  --catalog-file build/hotel-catalog.json

cat build/hotel-catalog.json | jq '.types'
cat build/hotel-catalog.json | jq '.operations'
```

Or inspect catalog from client generation:

```bash
cat ./src/services/hotel/catalog.json | jq '.types'
```
