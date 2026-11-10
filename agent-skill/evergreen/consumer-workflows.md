# Consumer Workflows

Use this task-to-document map instead of duplicating product contracts in agent instructions.

## Input Discovery

Inspect the consumer project for WSDL files, imported XSD files, existing `catalog.json` files, generator configuration, and established output paths before choosing a command.

If no usable WSDL or catalog is available, ask only for the source location and whether the task needs the full pipeline or a narrower generated surface. Never invent service URLs, input files, output paths, or generation scope.

## Select Version-Matched Documentation

Read the installed package version first. The canonical paths below are relative to `node_modules/@techspokes/typescript-wsdl-client/`; bundled extracts are relative to the skill folder. Prefer installed guides, then matching bundled extracts or the matching repository tag. Use live `main` only for development context or an explicitly selected future version.

| Task | Canonical package guide | Bundled fallback |
|---|---|---|
| Upgrade or roll back | `docs/migration.md` | `references/migration.md` |
| Choose commands and paths | `docs/cli-reference.md` | `references/cli-reference.md` |
| Construct clients and inspect DTOs | `docs/generated-code.md` | `references/generated-code.md` |
| Adopt checked generation | `docs/checked-generation.md` | `references/checked-generation.md` |
| Compose legacy services | `docs/gateway-guide.md` | `references/composition.md` |
| Configure streams | `docs/configuration.md` | `references/streaming.md` |
| Set up consumer tests | `docs/testing.md` consumer sections | `references/testing.md` |
| Diagnose failures | `docs/troubleshooting.md` | `references/troubleshooting.md` |

Bundled extracts contain selected sections, not every advanced guide. Follow their source links when more context is needed, choosing the installed-version tag instead of assuming a link to `main` applies. An older installed package may not contain a newer guide or feature; consult the target-version migration guide before adopting it.

## Full SOAP-to-REST Adoption

Use `pipeline` when the project needs a typed SOAP client, OpenAPI contract, REST gateway, and optional runnable app from the same WSDL.

Choose the profile and exact flags from its version-matched guide. Keep package upgrades separate from optional new-profile adoption, and keep consumer source, endpoint and credential choices explicit.

## Narrow Tasks

Use `compile` when the project needs to inspect WSDL compilation output or isolate generation problems.

For other individual stages, use the CLI reference to confirm the selected profile supports that command. Read the client/gateway or checked guide before choosing constructors, injection seams or host configuration; do not transfer one profile's integration pattern into another.

## Regeneration and Verification

Use the migration and generated-code guides for matched artifacts, app/test ownership, force options and rollback. Preserve application customizations and the working lockfile/input revision before an upgrade.

Use the consumer testing guide and existing project scripts for TypeScript and maintained checks. Generated mock/scaffold checks and successful generation do not establish independent SOAP wire, provider availability or business acceptance.
