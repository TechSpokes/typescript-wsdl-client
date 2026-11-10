# Consumer Workflows

This reference gives stable workflows for agents using `@techspokes/typescript-wsdl-client` in consumer projects.

## Input Discovery

Inspect the consumer project for WSDL files, imported XSD files, existing `catalog.json` files, generator configuration, and established output paths before choosing a command.

If no usable WSDL or catalog is available, ask only for the source location and whether the task needs the full pipeline or a narrower generated surface. Never invent service URLs, input files, output paths, or generation scope.

## Full SOAP-to-REST Adoption

Use `pipeline` when the project needs a typed SOAP client, OpenAPI contract, REST gateway, and optional runnable app from the same WSDL.

1. Install the package as a development dependency and install `soap` as a runtime dependency.
2. Choose generated output directories under the consumer project's source or generated-code area.
3. Run `npx wsdl-tsc pipeline` with the WSDL source, client directory, OpenAPI file, gateway directory, service name, and version prefix.
4. Add configuration files for security, tags, operation overrides, or streaming only when the integration needs them.
5. Run the consumer project's typecheck and tests.
6. Commit the WSDL reference, configuration files, generated output policy, and tests according to the consumer project's conventions.

## Existing project upgrades

Load `references/migration.md` before changing an existing consumer's generator/runtime version. Inspect its installed version, lockfiles, build/install scripts, generation inputs and selected profile. Keep the existing generation profile during the package upgrade; do not add checked mode or native composition merely because the new version supports them.

Preserve a known-working revision, update an explicit package version and regenerate the matched generator-owned artifacts from their original inputs. Review changed DTO/schema names, stream `recordType` references, mapped record shapes and scalar/simple-content corrections. Preserve adopted app/test scaffolds; force replacement is deliberate, not an ordinary upgrade requirement.

Run the consumer's TypeScript check and maintained tests, and qualify representative backend behavior with appropriate authorization. Release fixtures and generated mock/scaffold checks do not establish that every application migrated. For rollback, restore manifests, lockfiles, matched artifacts and input/configuration revisions together; reinstalling an older generator alone does not revert new generated code.

## Native multi-service adoption

Use `pipeline --services-config services.json` alone, without single-source CLI flags. Each service's `generation` uses `PipelineOptions` property names and explicit client/catalog/OpenAPI/gateway paths. Keep keys, normalized slugs, decorators, prefixes and output ownership unique. Paths resolve against the config; companion paths in a stream file resolve against that stream file.

Import the aggregate plugin and its typed `createClients`. Supply each key's own `{source, options, security}`; `source` is runtime WSDL metadata, while `soapClient().setEndpoint(...)` selects the SOAP destination. Keep credentials, trust and stream transport settings with the owning client. Register `{clients}` without a runtime aggregate prefix; generation-time base paths already appear in the contract.

The aggregate serves JSON discovery at `/openapi.json` unless generation changes or disables it. There is no aggregate checked/app/test mode. Failure preserves the previous aggregate pair, but earlier service dependencies may already have changed; regenerate and verify the whole matched output. Load `references/composition.md` for the canonical configuration and API.

## Checked profile selection

Use `pipeline --model checked-components-v1` only when the consumer chooses the bounded checked preview. Start from WSDL sources, not a legacy catalog. Unambiguous sources need no authored selectors or resource maps; additional metadata origins and genuinely missing schema locations still require explicit input.

Generate client, OpenAPI, gateway, app and tests together with explicit output paths. Inspect the component planning report and operation inventory, then install, typecheck and test the generated project. Runtime configuration keeps generated source snapshots; the selected WSDL endpoint or explicit override supplies routing intent, while optional restrictions narrow it, including empty deny-all.

Checked hosts require `@techspokes/typescript-wsdl-client` as a production runtime dependency, as emitted by their app manifest. Keep that dependency when deployment omits development packages, even if generation tooling is installed separately in a parent project.

Generation, startup and scaffold tests do not execute business SOAP. Independently specified owned-service wire checks and provider acceptance remain separate work. Unsupported source, wildcard or required declaration cases must not be routed through legacy behavior to bypass checked validation. Preserve explicit companion configuration and buffered scope where used.

Keep generator, runtime, sources and checked artifacts matched when regenerating; preserve consumer-owned scaffold customizations unless replacement is deliberate. Generation offers legacy and `checked-components-v1`; v1.1.5 direct clients retain their shipped runtime contract. Generated source records supply ordinary host defaults, and an optional runtime file contains concise overrides. Load `references/checked-generation.md` for the installed trial, feedback path and boundaries.

## Typed SOAP Client Only

Use the legacy `client` command when the project only needs TypeScript access to SOAP operations. For the checked component path, use the full checked pipeline rather than a standalone legacy command.

Generate the client into a stable directory and consume the exported operations interface in application code or tests. Keep wrapper code outside the generated client directory.

## OpenAPI Contract Only

Use `openapi` when the project needs a REST contract or API documentation without generated Fastify routes.

Prefer a catalog input when the project already generated and reviewed one. Keep the OpenAPI file path stable so downstream tools and gateway generation can reuse it.

## Gateway From Existing OpenAPI

Use `gateway` when a project already has a generated OpenAPI file and needs Fastify route handlers.

Generate the gateway from the OpenAPI file and point it at the generated client directory. Register the generated plugin from application-owned Fastify setup code.

## App Scaffold

Use `app` or `pipeline --init-app` when the project wants a runnable service wrapper quickly.

App files are editable consumer-owned scaffolds, preserved on regeneration unless app force replacement is selected. Keep long-lived service behavior in maintained server modules, middleware, configuration and deployment files; preserve those customizations when refreshing the scaffold. Regenerate embedded client/gateway artifacts separately according to their ownership, without deleting the app directory.

## Catalog Debugging

Use `compile` when the project needs to inspect WSDL compilation output or isolate generation problems.

Read the catalog to confirm service names, operations, type names, namespaces, and WSDL documentation before changing generator options.

## Streaming Adoption

Use stream configuration only for operations with large response payloads that should flush records incrementally.

Use the default `ndjson` stream format unless downstream clients require one JSON document. Use `format: "json-array"` for clients that need an `application/json` array response.

Regenerate the client, OpenAPI, gateway, and tests together after changing stream configuration. Streaming changes affect TypeScript return types, OpenAPI content types, gateway behavior, and generated test expectations.

## Choice Modeling

Use the default `all-optional` choice mode when a project needs backward-compatible generated shapes for existing SOAP payload code.

Use `--client-choice-mode union` when a project wants stricter generated models for `xs:choice` groups. Regenerate the catalog, client, OpenAPI, gateway, and generated tests together because union mode affects TypeScript branch unions, OpenAPI validation constraints, generated mocks, and generated validation tests.

## Validation

After generation, run the consumer project's typecheck and tests. For gateway work, add route tests around the generated plugin with a typed mock operations' implementation.

Load `references/testing.md` for complete legacy and checked setup/run examples, emitted configuration and customization ownership. Legacy tests emit their own Vitest config but need consumer dependencies; the checked app supplies its own test/typecheck scripts and scaffold checks. Use existing project commands where appropriate, without adopting generator-repository locks or CI.

Keep independent SOAP wire expectations and provider/business acceptance separate from generated mock/scaffold checks. Preserve customized test/app scaffolds when regenerating; use their force options only for deliberate replacement after reviewing local changes.
