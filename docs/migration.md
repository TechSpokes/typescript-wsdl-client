# Migration Guide

This guide covers package upgrades and generated-project compatibility for `@techspokes/typescript-wsdl-client`.

Versions are listed newest first. Find your current version and follow the steps for each version you need to cross.

See the root [README](../README.md). Historical version sections below describe their original releases; 1.2.0 compatibility guidance supersedes earlier unchanged-output statements for this upgrade.

## General Upgrade Steps

These steps apply to every version upgrade:

1. Read the migration section for the installed and intended versions before updating dependencies.
2. Preserve the working dependency lockfile, inputs, generation settings and application customizations.
3. Install an explicit target version in an upgrade branch.
4. Regenerate matched generator-owned artifacts using the existing generation script and options.
5. Review the generated diff and run the consumer project's TypeScript build and tests.

## From 1.3.x to 1.4.0

Package updates preserve existing SOAP 1.1 V1 and SOAP 1.2 V2 runtime contracts. Newly generated checked SOAP 1.1 clients use `checkedComponentRuntimeV3` and `checked-component-soap11-runtime-v1`; regenerate matched clients, capsules, OpenAPI and gateways together to adopt that binding. Legacy generation and direct preview remain unchanged.

A V3 `soap-fault` can carry protocol metadata without a declared application `value` or fault `name`. Check whether a typed value exists before accessing it. Declared details still undergo native validation, and protocol faults remain gateway HTTP 502 responses.

Checked projects can opt into `sourceCorrectionsFile` for digest-pinned consumer corrections. Preserve upstream originals, review source changes, and regenerate effective snapshots and dependent artifacts together. Runtime deployments need effective snapshots and capsules, not the correction recipe; see [contract correction maintenance](checked-gateway.md).

Offline inspection accepts the complete multi-operation checked configuration and a full operation selector. Correction pins cover every project companion even when only one operation is inspected. XML-only reports do not establish HTTP status or media conformance without supplied response metadata.

## From 1.2.x to 1.3.0

Version 1.3.0 adds checked SOAP 1.2 document/literal execution. Legacy generation remains the default. Existing SOAP 1.1 component clients keep `checkedComponentRuntimeV1` and `checked-component-runtime-v2`; the shipped direct runtime is unchanged. Updating the package alone does not adopt SOAP 1.2 or require regeneration of existing SOAP 1.1 clients.

To adopt SOAP 1.2, use `--model checked-components-v1` and the source-selected SOAP 1.2 service/port/binding. Ambiguous sources still require explicit checked configuration. Regenerate matched clients, capsules, OpenAPI and gateways with 1.3.0; the generated client uses `checkedComponentRuntimeV2` and `checked-component-soap12-runtime-v1`. Do not mix runtime handshakes or substitute artifacts across ports.

SOAP 1.2 `soap-fault` results can contain protocol metadata without a declared application `value` or fault `name`. Narrow the result before accessing typed detail. Declared detail retains native validation; gateway faults remain HTTP 502. Keep consumer-owned server/config/test files under the existing skip/force rules.

Qualification uses owned HTTP services, generated gateways and isolated installed consumers. It does not establish live-provider acceptance. SOAP 1.2 streaming, RPC/encoded and broader authentication/header capabilities remain separate work; see the [checked gateway contract](checked-gateway.md#component-service-generation).

## From 1.1.x to 1.2.0

### Published starting points

Both 1.1.5 and 1.1.8 were published to npm. Versions 1.1.6 and 1.1.7 were unpublished candidates whose preview work was carried into 1.1.8; their GitHub tags and release-note files do not make them installable npm versions. This publication history was checked against the [npm registry metadata](https://registry.npmjs.org/@techspokes%2Ftypescript-wsdl-client) on 2026-11-10.

Use these instructions for either published starting point. A project upgrading from 1.1.5 also crosses the checked-generation preview and legacy conversion corrections already shipped in 1.1.8. Historical release notes remain a record of their original candidates, not additional required installation steps.

### Package installation versus regeneration

Publishing a package does not change a deployed gateway. Installing a newer generator does not itself rewrite existing generated files; a consumer's install/build scripts may run generation, and dependency resolution or package-runtime imports can change behavior without regeneration.

| Project action | Upgrade effect |
|---|---|
| Keep the installed package, lockfile and deployed build | No automatic switch to 1.2.0 |
| Update the package without running generation | Existing generated files remain; runtime dependencies still need verification |
| Run generation during a build or install | New output can appear in that next build |
| Regenerate using the existing legacy command | Legacy remains selected; compiler and mapper corrections take effect |
| Select checked generation or native composition | Deliberate adoption with separate contracts and configuration |

A dependency range of `^1.1.5` or `^1.1.8` permits 1.2.0 when npm resolves an update. An exact version pin or a `~1.1.x` range does not permit this minor upgrade. Commit the lockfile and use `npm ci` to reproduce its recorded dependency tree; updating or replacing that lockfile is a separate deliberate step. See [npm version ranges](https://docs.npmjs.com/about-semantic-versioning/) and [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/).

### Changes that can affect existing projects

The 1.2.0 compiler correction separates declarations that previously collapsed into one generated type. Distinct inline `Entry` declarations under `Left` and `Right` now receive separate owner-qualified names. Non-colliding exported names and XML/JSON member names are preserved; residual Pascal-case or namespace collisions receive deterministic suffixes.

This minor release includes corrective compatibility changes: affected exported DTO names can break source imports after regeneration, and stream records now use generated DTOs rather than lexical attribute bags. The 1.2.0 version number is not a guarantee of a drop-in regeneration upgrade; review the following impacts before deploying the regenerated project.

| Existing use | What to review |
|---|---|
| Buffered legacy gateway | Keep its model and envelope; inspect regenerated schemas and DTO conversion |
| Colliding declaration names | Update affected imports, type annotations and stream `recordType` references |
| Legacy streaming | Update consumers expecting lexical strings or nested attribute bags |
| Boolean attributes or simple content | Review corrected scalar conversion and `$value` objects |
| Adopted app or test scaffolds | Merge intended updates; existing files are preserved by default |
| Published 1.1.5 checked direct clients | Retain the versioned binding and its original execution restrictions |

Regeneration can also change OpenAPI model names and generated SDK names that depend on them. Preserving an XML/JSON member name does not preserve a previously incorrect value shape or scalar conversion. Do not mix a newly generated client with an older catalog, metadata helper, gateway or OpenAPI document to suppress these changes.

### Stream record migration

Configured stream methods still return `records: AsyncIterable<RecordType>`, but each completed XML record now passes through generated DTO mapping. Flattened attributes, typed `$value` content, configured scalar policies, XML lists and repeated fields follow the generated model. The gateway sends those mapped records as NDJSON or JSON-array items without a legacy success envelope.

For a record with Boolean `Enabled` and integer `Rank` attributes and an integer `Count` child, a previous parser-shaped record using the default output attribute key could look like this:

```json
{"attributes":{"Enabled":"1","Rank":"7"},"Count":"42"}
```

The corresponding mapped DTO fields are:

```json
{"Enabled":true,"Rank":7,"Count":42}
```

This is a field-level illustration, not a complete SOAP payload or a rule that all numbers become JavaScript numbers. Decimal and int64 policies remain configurable and string-first by default; JavaScript `bigint` still requires a consumer-owned JSON strategy. Update stream consumers and review their advertised OpenAPI schemas together.

Stream calls add optional `{signal, timeoutMs}` and supported node-soap serializer/transport hooks. Requests now use the WSDL serializer and supported client endpoint/security settings; verify those settings against the intended backend. SOAP 1.2, functional SOAP headers, SOAP body attributes, MTOM and NTLM remain refused stream combinations. See the [stream API](api-reference.md#generated-stream-client-contract) and [transport boundaries](gateway-guide.md#streaming-transport-settings).

### Buffered conversion corrections since 1.1.5

The intervening published 1.1.8 includes corrections for Boolean XML attributes and simple-content responses. Valid Boolean spellings become actual Booleans; invalid spellings reject instead of producing misleading successful values. Text-only complex simple content retains its `$value` object, including when optional attributes are absent. Review application code that compensated for the previous incorrect results.

The ordinary buffered legacy call still exposes its generated `.response` value, and its gateway retains the legacy success envelope. Omitting stream configuration does not promise byte-identical generated output: shared mapper and metadata corrections also apply to buffered clients.

### Upgrade an existing legacy gateway

Keep Node.js >= 24 and the existing ESM project setup. Keep the generator as a development dependency and `soap` as a runtime dependency; retain the gateway's other runtime dependencies. A separately maintained generated app has its own package and lockfile, so upgrading the generator in its parent project does not automatically refresh that app's dependencies.

After 1.2.0 is published, install the explicit target in the project that owns generation:

```bash
npm install --save-dev --save-exact @techspokes/typescript-wsdl-client@1.2.0
```

Before publication, use a locally packed candidate as described in [checked-generation installation guidance](checked-generation.md#install-and-try-the-bundled-contract), rather than requesting an unpublished registry version. Do not add a checked model flag just to upgrade a legacy project.

1. Preserve a known-working revision with its dependency lockfiles and generation inputs.
2. Run the existing generation script with the same profile, paths, naming and mapping options.
3. Regenerate matched catalog, client, metadata helpers, OpenAPI and gateway artifacts from original WSDL/XSD sources.
4. Review generated type/schema names, buffered values and any configured stream records.
5. Merge app/configuration/package and test scaffold updates deliberately.
6. Run the consumer project's TypeScript check with generated files included and its maintained tests.
7. Verify representative request, response and fault behavior against an authorized test backend before deployment.

Existing app and generated-test scaffold files are skipped by default. `pipeline --force-init` and `--force-test` explicitly replace their respective scaffolds; standalone `app --force` has the app replacement role. Preserve custom server, authentication, environment, package and test changes before selecting any force option. Do not delete an entire app directory merely to refresh the replaceable client/gateway files inside it.

The compiled catalog format remains unchanged. Old catalogs remain readable as stored, but cannot recover declarations lost through an earlier merge; loading one does not fetch its WSDL or reconstruct missing types. Companion catalogs retain their existing conservative same-name structural conflict checks.

### Optional adoption of new capabilities

| Capability | Adoption boundary |
|---|---|
| Native legacy multi-service gateway | Use `pipeline --services-config`; retain independent sources, clients and security |
| Checked document/literal or bounded RPC | Trial `pipeline --model checked-components-v1` in separate output paths |
| Existing manual gateway mounting | Continue registering single-source plugins in separate Fastify scopes |

Native composition emits one aggregate plugin and OpenAPI document for legacy services; it does not supply an aggregate app/test scaffold or compose checked routes. See the [multi-service guide](gateway-guide.md#multi-service-setup). Check downstream tooling when adopting service-qualified OpenAPI components and operation identifiers.

Checked generation is a bounded buffered preview, not an automatic replacement for a legacy gateway. Its JSON values, validation and fault contracts differ from legacy DTO/envelope behavior, and unsupported contracts refuse. Checked hosts import this package at runtime, so retain it as a production dependency according to the emitted app manifest; a generator-only development dependency is insufficient for that deployment. Keep runtime version, source snapshots and generated checked artifacts matched. Checked streaming remains outside this profile.

Existing published 1.1.5-issued direct clients retain `checkedDirectRuntimeV1` and its original owned-loopback restrictions; installed compatibility fixtures exercise that specific binding. A deployed host importing that retained binding also needs this package as a production dependency, even when its generator tooling lives elsewhere. The unchanged direct protocol allows those retained artifacts to use the newer compatible package binding; it does not grant component-runtime capabilities.

The unpublished `checked-direct-v1` generation choice is not a current generation mode. New checked generation uses components; moving an old direct client to components is deliberate regeneration and adoption, not a runtime capability upgrade. See [checked-generation upgrade guidance](checked-generation.md#upgrade-and-regenerate).

### Consumer verification and rollback

Release verification exercises representative generated/installed consumers, compatibility fixtures and owned SOAP exchanges. It cannot certify every existing consumer project or provider operation. Generated mock/scaffold tests do not replace maintained application tests, TypeScript checks or independent SOAP/provider acceptance; follow [consumer testing guidance](testing.md#for-consumer-projects).

Verify affected type imports, OpenAPI/SDK changes, scalar and `$value` conversions, stream item shapes and cancellation/error handling. Retain endpoint, credentials, TLS trust and array-wrapper settings explicitly. The published preview does not provide a universal migration checker or a guarantee of complete WSDL/XSD support.

For rollback, restore the known-working application revision, generator/app package manifests and lockfiles, matched generated artifacts and source/configuration inputs together, then reinstall with `npm ci` and rebuild. Projects that do not commit generated output should regenerate using the original pinned generator and inputs. Restoring only the generator version leaves newly generated code in place and is not a complete rollback.

## Version Compatibility

The 1.2.0 scaffold row records the current legacy app template pins, not an automatic rewrite of an existing consumer's package. Follow the emitted manifest for new apps and review separately maintained runtime dependencies when upgrading older ones.

| wsdl-tsc | Node.js | TypeScript | soap | Fastify | saxes |
|----------|---------|------------|------|---------|-------|
| 1.2.0 legacy scaffold | >= 24.0 | ^6.0.3 | ^1.14.0 | ^5.12.8 | ^6.0.0 |
| 1.0.x | >= 24.0 | >= 6.0 | >= 1.9 | >= 5.10 | >= 6.0 |
| 0.35.x and later | >= 24.0 | >= 6.0 | >= 1.9 | >= 5.8 | >= 6.0 |
| 0.17.x | >= 20.0 | >= 6.0 | >= 1.9 | >= 5.8 | >= 6.0 |
| 0.16.x | >= 20.0 | >= 6.0 | >= 1.9 | >= 5.8 | N/A |
| 0.15.x | >= 20.0 | >= 6.0 | >= 1.8 | >= 5.4 | N/A |
| 0.11.x to 0.14.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 | N/A |
| 0.10.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 | N/A |
| 0.9.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 | N/A |
| 0.8.x | >= 20.0 | >= 5.6 | >= 1.3 | >= 5.2 | N/A |
| 0.7.x | >= 20.0 | >= 5.6 | >= 1.3 | N/A | N/A |

Versions 0.11 through 0.16 are additive and non-breaking. See `CHANGELOG.md` for per-version detail rather than dedicated upgrade sections here.

## Upgrading to 1.0.0 from 0.40.1

Version `1.0.0` stabilizes the public behavior shipped through `0.40.1`. It does not intentionally change generated client, OpenAPI, gateway, app, or runtime contracts.

### Stable 1.0 Contract

- Node.js 24 is the supported runtime floor.
- The package and generated code remain ESM-only.
- `all-optional` remains the default `xs:choice` strategy.
- Choice union mode remains opt-in through `--client-choice-mode union`.
- NDJSON remains the default configured stream format.
- JSON array streaming remains opt-in per operation.
- Generated output remains replaceable and should be regenerated from WSDL or catalog inputs.

### Accepted 1.0 Limitations

- Multiple SOAP bindings use deterministic first SOAP binding selection.
- External `PolicyReference` documents are not fetched or resolved.
- Abstract complex types fail with a diagnostic.
- Substitution groups fail with a diagnostic.
- MTOM/XOP attachments fail with a diagnostic.

### Steps to Upgrade to 1.0.0

1. Upgrade the development dependency to `@techspokes/typescript-wsdl-client@^1.0.0`.
2. Confirm the project runs Node.js 24 or newer.
3. Keep `soap` installed as a runtime dependency.
4. Regenerate every owned client, OpenAPI, gateway, app, and generated-test artifact.
5. Review the generated diff and run the consumer TypeScript build and tests.

### Is 1.0.0 Breaking?

No intentional behavior break is introduced relative to `0.40.1`. The major version declares the documented surface stable, so future incompatible changes require a new major release.

## Upgrading to 0.17.x from 0.16.x

This upgrade adds opt-in streamable SOAP responses. No breaking changes; generated output is byte-for-byte unchanged when `--stream-config` is not provided.

### What Changed in 0.17.x

The CLI gains a `--stream-config <file>` flag on `compile`, `client`, and `pipeline`. Operations listed in that file emit a new client method signature returning `StreamOperationResponse<RecordType>` with `records: AsyncIterable<RecordType>`, an OpenAPI 200 response typed as `application/x-ndjson` by default with an `x-wsdl-tsc-stream` extension, and a Fastify route that streams records with backpressure. Set `format: "json-array"` for `application/json` array streaming. The compiler now retains `xs:any` wildcard particles on compiled types (previously dropped silently), enabling honest stream-candidate detection and companion-catalog shape resolution. `saxes ^6.0.0` is now a runtime dependency of the package and is pinned automatically into the generated app scaffold.

### Steps to Upgrade to 0.17.x

1. Update the package and regenerate; no flag or code changes are required for buffered operations
2. If consumers integrate the generated client directly (not via the app scaffold), install `saxes ^6.0.0` as a runtime dependency before using any stream operation
3. To opt into streaming for specific operations, author a stream-config file (see [Stream Configuration](configuration.md#stream-configuration)) and pass it via `--stream-config`
4. Review the new generated client method signatures for any opted-in operation; consumers must use `for await (const record of result.records)` instead of awaiting the full response

### Is 0.17.x Breaking?

No. Without `--stream-config`, generated output is byte-for-byte unchanged. Consumers only see new surfaces when they opt in.

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
| `--versionTag` | `--openapi-version-tag` |
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
