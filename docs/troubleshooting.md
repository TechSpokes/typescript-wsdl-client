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
| Stream config references unknown operation | Operation name must match the WSDL exactly; check spelling and casing |
| Stream record type not found | `recordType` must exist in the main catalog or a companion `shapeCatalog` must supply it; confirm the companion WSDL compiles cleanly in isolation |
| Structural collision between main and companion catalog | Two types share a name but differ structurally; rename in the companion source or point `recordType` at a distinct subtree |
| NDJSON response ends abruptly | Mid-stream upstream error per the terminal-error policy; check gateway logs for the classified error |
| Stream recordPath does not match | SAX matching is positional and case-sensitive; verify duplicate local-name segments are spelled exactly |
| Stream client throws "stream request failed" | The upstream SOAP endpoint rejected the hand-built envelope; check `requestRaw` on the response and verify SOAP action and namespaces match the WSDL binding |

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

## Streaming Debug

Inspect stream metadata on the compiled catalog to confirm the config was parsed and applied:

```bash
cat ./src/services/hotel/catalog.json | jq '.operations[] | select(.stream) | {name, stream}'
```

Each entry shows the normalized `OperationStreamMetadata` (mode, format, mediaType, recordPath, recordTypeName, and any `shapeCatalogName`). If an expected operation is missing, the config either did not match the WSDL operation name or was not passed to the generation command.

For record-path and chunk-boundary issues, the reference integration test pattern lives in `test/integration/stream-end-to-end.test.ts` and the SAX record matcher is exercised by `test/unit/stream-xml.test.ts`. Running them against a local fixture isolates whether the issue is in the config, the parser, or the upstream SOAP server.
