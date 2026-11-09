# Native composition example

Generate two independent legacy clients and one typed Fastify aggregate from committed generic fixtures. See the root [README](../../README.md).

## Generate and typecheck

Run from the repository root with dependencies installed:

```bash
npm run dev -- pipeline --services-config examples/native-composition/services.json
npx tsc -p examples/native-composition/tsconfig.json
```

All outputs are explicit `.generated/` paths relative to `services.json`. `registry.ts` supplies local runtime WSDL metadata separately to each generated client; generation and app construction do not execute SOAP. Before invoking routes, set each client's endpoint to your owned server and configure its own options/security. The fixture addresses are placeholders, not public providers.

## Observable contracts

The aggregate exposes `/main/read`, `/content/read` and `/openapi.json`, with distinct request models despite shared operation names. The repository's multi-service integration test executes both generated routes against independent owned SOAP servers, checks their HTTP bodies/action/namespaces, rejects crossed request shapes and typechecks the client registry. It also covers prefix and ownership refusals; no credentials or live-provider calls are required.

For an installed consumer, copy the generic WSDLs and config, adjust their explicit source paths, install a locally packed candidate plus `soap`, `fastify`, `fastify-plugin`, TypeScript and Node types, then use `npx wsdl-tsc pipeline --services-config services.json`. See [configuration and runtime security](../../docs/gateway-guide.md#multi-service-setup).
