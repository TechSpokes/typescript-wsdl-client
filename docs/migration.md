# Migration Guide

This guide covers upgrade steps between major versions of `@techspokes/typescript-wsdl-client`.

Versions are listed newest first. Find your current version and follow the steps for each version you need to cross.

## General Upgrade Steps

These steps apply to every version upgrade:

1. Update the package: `npm install --save-dev @techspokes/typescript-wsdl-client@latest`
2. Read the migration section for your version jump below
3. Regenerate all output by running your generation script or pipeline command
4. Run `tsc --noEmit` to verify the generated code compiles
5. Test your application

## Version Compatibility

| wsdl-tsc | Node.js | TypeScript | soap | Fastify |
|----------|---------|------------|------|---------|
| 0.10.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 |
| 0.9.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 |
| 0.8.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 |
| 0.7.x | >= 20.0 | >= 5.6 | >= 1.3 | N/A |

## Upgrading to 0.10.x from 0.9.x

This upgrade changes generated gateway code only. No CLI flags changed.

### What Changed in 0.10.x

The gateway plugin now uses the concrete client class type instead of a generic index signature. Route handlers are fully typed with `Body: T` generics. A new `_typecheck.ts` fixture is generated to catch plugin-client type divergence at build time.

### Steps to Upgrade to 0.10.x

1. Regenerate all gateway code: `npx wsdl-tsc pipeline ...`
2. Remove any `@ts-expect-error` comments you added for client type mismatches
3. Add `_typecheck.ts` to your TypeScript includes if you use a custom tsconfig

### Is 0.10.x Breaking?

No. These are generated code improvements only. Regenerating your output is sufficient.

## Upgrading to 0.9.x from 0.8.x

This upgrade changes how the gateway command generates route handlers.

### What Changed in 0.9.x

The gateway command now generates full handler implementations that call the SOAP client and return envelope responses. Previous versions generated stub handlers. New files `runtime.ts` and `plugin.ts` are generated. A new `app` command creates runnable Fastify applications.

### Steps to Upgrade to 0.9.x

1. Regenerate gateway code: `npx wsdl-tsc pipeline ...`
2. If you wrote custom handlers over the old stubs, use `--gateway-stub-handlers` to keep stub behavior
3. Alternatively, migrate custom logic into the gateway plugin lifecycle hooks
4. The new `plugin.ts` is the recommended entry point and replaces manual Fastify wiring

### New CLI Flags in 0.9.x

| Flag | Purpose |
|------|---------|
| `--gateway-stub-handlers` | Generate stub handlers instead of full implementations |
| `--gateway-client-class-name` | Override the client class name used in handlers |
| `--gateway-decorator-name` | Override the Fastify decorator name |
| `--gateway-skip-plugin` | Skip `plugin.ts` generation |
| `--gateway-skip-runtime` | Skip `runtime.ts` generation |
| `--catalog-file` | Specify catalog location for gateway command |

### Is 0.9.x Breaking?

Soft breaking. Regeneration changes the output, but the `--gateway-stub-handlers` flag preserves the old behavior.

## Upgrading to 0.8.x from 0.7.x

This upgrade changes CLI flag names, URN format, and adds required arguments. It is a breaking change.

### What Changed in 0.8.x

All CLI flags changed from camelCase to kebab-case. The URN format changed to a service-first structure. The `--gateway-version-prefix` and `--gateway-service-name` flags became required for gateway and pipeline commands. Catalog files now co-locate with their output directory by default.

### CLI Flag Renames in 0.8.x

| Old Flag (0.7.x) | New Flag (0.8.x) |
|-------------------|-------------------|
| `--versionTag` | `--openapi-version` |
| `--basePath` | `--openapi-base-path` |
| `--pathStyle` | `--openapi-path-style` |
| `--closedSchemas` | `--openapi-closed-schemas` |
| `--pruneUnusedSchemas` | `--openapi-prune-unused-schemas` |

### Steps to Upgrade to 0.8.x

1. Update all CLI commands in scripts and CI to use the new kebab-case flag names
2. Add `--gateway-service-name` and `--gateway-version-prefix` to all gateway and pipeline commands
3. Regenerate all output because the URN format in JSON schemas changed
4. Update any code that parses URN identifiers to use the new service-first format

### URN Format Change in 0.8.x

The old format was `urn:schema:{version}:services:{service}:{models|operations}:{slug}`.

The new format is `urn:services:{service}:{version}:schemas:{models|operations}:{slug}`.

### Is 0.8.x Breaking?

Yes. CLI flags, URN format, and required arguments all changed.
