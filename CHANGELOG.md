# Changelog

> Entry style: one-line, no file lists, no vague phrasing.
> (@agents see .github/copilot-instructions.md for details)

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.11.6] - 2026-02-18

- chore: suppress unused-parameter IDE warnings in test emitters and replace `as any` casts with typed alternatives in tests
- fix(test): include XML attribute fields in generated mock payloads via `attrType` catalog metadata
- fix(test): flatten array-wrapper request payloads to match OpenAPI schema format
- fix(test): detect enum types and generate valid mock values in `generateMockPrimitive()`
- fix(test): use `defineProject()` from vitest/config in generated vitest.config.ts
- fix(gateway): recurse into array items in generated `unwrapArrayWrappers()` runtime function
- fix(gateway): skip response schema when `$ref` graph exceeds fast-json-stringify depth limit (150 unique refs)
- refactor(util): extract shared `detectArrayWrappers()`, `detectChildrenTypes()`, and `flattenMockPayload()` to `src/util/catalogMeta.ts`
- chore(deps): update soap lower bound to 1.7.1 in generated app scaffold

## [0.11.5] - 2026-02-18

- fix(test): ensure `tmp/` directory exists before `mkdtempSync` in integration test (fixes CI ENOENT)

## [0.11.2] - 2026-02-18

- feat(cli): add `--test-dir` and `--force-test` flags to generate Vitest test suite for gateway artifacts
- feat(test): generate mock client, test app helper, route/error/envelope/validation/runtime tests from catalog metadata
- feat(test): skip-if-exists for generated test files with `--force-test` override
- refactor(util): extract shared `computeRelativeImport()` and `getImportExtension()` to `src/util/imports.ts`
- docs: add generated test suite section to testing guide and CLI reference

## [0.11.1] - 2026-02-18

- fix(gateway): wrap classifyError() details as object for 400/503/504 to fix FST_ERR_FAILED_ERROR_SERIALIZATION
- docs: add Vitest verification step and package-lock.json bump to release workflow in copilot-instructions.md

## [0.11.0] - 2026-02-18

- feat: add Vitest test infrastructure with unit, snapshot, and integration test suites (200 tests)
- feat(client): extract typed operations interface (`operations.ts`) for mock-friendly dependency injection
- feat(gateway): generate `unwrapArrayWrappers()` in runtime.ts to bridge flattened OpenAPI array schemas with SOAP wrapper objects
- feat(cli): add `--openapi-flatten-array-wrappers` flag on openapi, gateway, and pipeline subcommands (default true)
- feat: add structured `WsdlCompilationError` with element/namespace context and `toUserMessage()` formatting
- test: add unit tests for casing, primitives, tools, errors, and schema-type alignment
- test: add snapshot tests capturing full pipeline output as baselines
- test: add integration tests for gateway routes via Fastify inject with mock SOAP clients
- test: add integration tests for both `flattenArrayWrappers: true` and `false` modes
- docs: add testing guide, update CLI reference, concepts, and generated-code documentation
- docs: align instruction file hierarchy and add `.github/instructions` reference to copilot-instructions.md

## [0.10.4] - 2026-02-18
- fix(app): use host option in OpenAPI servers URL rewrite instead of hardcoding localhost
- feat(cli): add --app-host, --app-port, --app-prefix flags to pipeline command
- docs: add App Scaffold Flags section to CLI reference and clarify --openapi-servers default
- test: add --port 8080 to smoke:app to exercise URL rewrite with non-default port
- fix(app): rewrite OpenAPI servers array in app scaffold to match configured localhost port
- test: remove explicit --openapi-servers from smoke:pipeline to exercise --init-app default
- docs: add typed route handler examples to generated-code.md and update gateway-guide.md
- docs: update ROADMAP.md to reflect 0.10.x series as current

## [0.10.3] - 2026-02-18
- feat(app): generate TypeScript scaffold (server.ts, config.ts) instead of JavaScript for full type safety
- feat(app): generate package.json and tsconfig.json for immediate out-of-box usage
- feat(app): add skip-if-exists overwrite protection for scaffold files (use --force-init to override)
- feat(app): add OPENAPI_SERVER_URL env var for runtime OpenAPI server URL override
- feat(app): resolve WSDL_SOURCE path relative to app directory; URL sources get fallback defaults
- feat(cli): add --init-app and --force-init flags; deprecate --generate-app as hidden alias
- feat(cli): default --openapi-servers to http://localhost:3000 when scaffolding with --init-app
- docs(examples): rename examples/openapi/ to examples/config/; add typescript-project, fastify-gateway, and ci-cd examples
- docs: update CLI reference, gateway guide, README, and architecture docs for new app scaffold
- chore(deps): bump dependency lower bounds to current latest (fastify 5.7.4, soap 1.6.5, typescript 5.9.3)

## [0.10.2] - 2026-02-18
- docs: add docs/README.md and docs/AGENTS.md for documentation directory index and agent instructions
- docs: clarify instruction file hierarchy (copilot-instructions.md > AGENTS.md > vendor-specific files) across all agent instruction files

## [0.10.1] - 2026-02-17
- docs: update community docs, add migration guide, and fix package metadata
- docs: add AI agent instruction files (AGENTS.md) and llms.txt for LLM discovery
- docs: restructure README as gateway to docs/ directory with CLI reference, examples, and migration guide
- docs(examples): add generated output samples and directory guide
- docs: align agent instruction files with v0.10.0 gateway capabilities and markdown rules
- chore(deps): update glob and minimatch dependencies

## [0.10.0] - 2026-02-17
- fix(gateway): use concrete client class type in plugin options interface instead of generic index signature
- fix(gateway): consolidate PascalCase functions — replace gateway-local `pascalCase()` with canonical `pascal()` from tools.ts to preserve underscores per v0.2.3 design
- feat(gateway): generate named operations interface (`${ClassName}Operations`) for Fastify decorator type with method autocomplete
- feat(gateway): emit `_typecheck.ts` fixture to catch plugin-client type divergence at build time
- fix(gateway): add `pluginImportPath` to `ClientMeta` for correct import depth from plugin.ts to client module
- feat(gateway): add typed route handlers — `import type` for request types and `fastify.route<{ Body: T }>()` generics in generated route files
- feat(gateway): use concrete client class for Fastify decorator type augmentation instead of operations interface — enables fully typed method returns
- fix(gateway): remove `as any` cast from `fastify.decorate()` call — concrete class is directly assignable now
- docs(roadmap): rewrite ROADMAP.md to reflect 0.9.x shipped features and 0.10.x forward plan

## [0.9.9] - 2026-02-16
- build(deps): bump fast-xml-parser from 5.3.5 to 5.3.6
- build(deps-dev): bump rimraf from 6.1.2 to 6.1.3

## [0.9.8] - 2026-02-13
- build(deps-dev): bump @types/node from 25.2.0 to 25.2.2

## [0.9.7] - 2026-02-03
- build(deps): bump soap from 1.6.3 to 1.6.4
- build(deps): bump fast-xml-parser from 5.3.3 to 5.3.4
- build(deps-dev): bump @types/node from 25.0.10 to 25.2.0

## [0.9.6] - 2026-01-27
- build(deps): update Fastify to 5.7.2 and @types/node to 25.0.10

## [0.9.5] - 2026-01-25
- build(deps): bump lodash from 4.17.21 to 4.17.23

## [0.9.4] - 2026-01-20

- build: update Fastify and @types/node dev dependencies
- build: update esbuild, fast-json-stringify, fastq, find-my-way, pino, sax, thread-stream and related packages
- chore(scripts): refactor npm scripts for smoke tests to use a reset step and improve consistency
- test: expand tsconfig.smoke.json includes for better test coverage
- docs: document changes in CHANGELOG.md

## [0.9.3] - 2026-01-13

- version: bump versions of node and soap in package.json and package-lock.json
- docs(readme): reorganize README with developer-focused structure - pipeline-first commands, 60-second quick start, decision matrix, and production concerns

## [0.9.2] - 2026-01-11

- feat(app): add runnable Fastify application generator with client and gateway integration
- fix(openapi): remove top-level `required` when using `allOf` for type inheritance
- fix(gateway): flatten `allOf` compositions in gateway schemas for Fastify serialization compatibility

## [0.9.1] - 2026-01-10

- docs(readme): update mission statement to reflect production-ready gateway instead of scaffolding
- docs(readme): update feature table - change "Fastify Gateway Scaffolding" to "Fastify Gateway Generation" with production-ready description
- docs(readme): update commands overview table - gateway command now shows "Production REST gateway with SOAP integration"
- docs(readme): remove outdated v0.8.0 status note from gateway command documentation
- docs(readme): update gateway command purpose to emphasize production-ready handlers with automatic SOAP integration
- docs(readme): clarify generated output structure shows route files with full handler implementations
- docs(readme): update stub handler mode section to clarify it's for backward compatibility or custom transformation logic

## [0.9.0] - 2026-01-10

- feat(gateway): generate fully functional route handlers that call SOAP client and return envelope responses
- feat(gateway): add `runtime.ts` module with envelope builders (`buildSuccessEnvelope`, `buildErrorEnvelope`) and centralized error handling
- feat(gateway): add `plugin.ts` as Fastify plugin wrapper for simplified integration with decorator support
- feat(gateway): route URLs derived from OpenAPI paths (respects `--openapi-base-path` from OpenAPI generation)
- feat(cli): add `--gateway-stub-handlers` flag for backward-compatible stub generation
- feat(cli): add `--gateway-client-class-name` and `--gateway-decorator-name` override flags
- feat(cli): add `--catalog-file` option for gateway command to load operation metadata
- feat(cli): add `--gateway-skip-plugin` and `--gateway-skip-runtime` flags
- feat(cli): pipeline command now supports all gateway flags for full control
- feat(compiler): add `inputTypeName` and `outputTypeName` fields to operation metadata in catalog

## [0.8.19] - 2026-01-09

- fix(openapi): handle inline string literal unions in schema generation - types with attributes like `"Create" | "Read" | "Update" | "Delete"` now correctly emit as `{ type: "string", enum: [...] }` instead of failing with unknown referenced type error

## [0.8.18] - 2026-01-09

- fix(compiler): prevent stack overflow on circular type references by moving cycle detection before pascal() call in getOrCompileComplex(), fixes #44

## [0.8.17] - 2026-01-07

- Build(deps): bump soap from 1.6.1 to 1.6.2

## [0.8.16] - 2025-12-29

- Build(deps-dev): bump @types/node from 25.0.2 to 25.0.3

## [0.8.15] - 2025-12-16

- build(deps-dev): bump @types/node to 25.0.2 and update version in package.json
- deployment(ci): update release workflow to remove unnecessary environment config

## [0.8.14] - 2025-12-15

- feat(release): update version and fix repository URLs

## [0.8.11] - 2025-12-14

- feat(release): enhance release workflow and update versioning.

## [0.8.1] - 2025-12-14

- feat(release): enhance release workflow and update versioning.

## [0.8.0] - 2025-12-13

- BREAKING refactor(gateway): change URN format to service-first structure - URN IDs now use
`urn:services:{service}:{version}:schemas:{models|operations}:{slug}` instead of
`urn:schema:{version}:services:{service}:{models|operations}:{slug}` for better namespace hierarchy and service-based filtering
- BREAKING refactor(gateway): remove automatic version/service detection -
`--gateway-version-prefix` and
`--gateway-service-name` are now always required for gateway and pipeline commands
- docs(readme): remove all emojis and icon characters from body text (keeping only badges at top and sponsor icons at bottom)
- docs(readme): replace arrow symbols with simple text (becomes, to) for better readability and accessibility
- docs(readme): fix typo in Handler Implementation heading
- docs(readme): remove em dashes and AI-style emphasis for more natural, human-readable text
- docs(readme): simplify language and remove unnecessary formal phrasing throughout documentation
- docs(readme): clarify runtime vs development dependencies in Installation section
- docs(readme): clarify gateway command generates scaffolding (routes + schemas) with handler stubs, not fully functional gateway yet
- docs(readme): add version 0.8.0 status indicator explaining basic scaffolding with full handler generation planned for future
- docs(readme): update mission statement and feature table to accurately reflect current gateway scaffolding capabilities
- docs(readme): add workflow steps showing manual handler implementation is currently required
- docs(readme): add catalog file organization section with co-location patterns by command
- docs(readme): add complete gateway command documentation with Fastify integration patterns
- docs(readme): add programmatic API documentation for all 4 exported functions
- docs(readme): comprehensive rewrite to document all 5 CLI commands (compile, client, openapi, gateway, pipeline)
- docs(readme): expand troubleshooting section with catalog location guidance
- docs(readme): remove inline catalog comments from code blocks for cleaner copy-paste experience
- docs(readme): standardize all CLI flag names to hyphenated format throughout documentation
- docs(readme): update all examples to reflect catalog co-location behavior
- feat(catalog): implement intelligent catalog co-location - defaults to output directory instead of hardcoded tmp/ path
- feat(cli): client command now defaults catalog to {client-dir}/catalog.json for better organization
- feat(cli): openapi command now defaults catalog to {openapi-file-dir}/catalog.json for consistency
- feat(cli): pipeline command uses intelligent cascade for catalog location (client-dir > openapi-dir > gateway-dir > tmp/)
- feat(gateway): add YAML OpenAPI file support alongside JSON based on file extension (.yaml/.yml)
- feat(gateway): ensure gateway success messages always show absolute paths for consistency with other commands
- feat(openapi): improve success message to show actual generated file path instead of base directory
- feat(output): add consistent console output for gateway generation in pipeline and standalone gateway command
- feat(output): improve pipeline completion message to show which operations were generated (client + OpenAPI + gateway)
- feat(pipeline): add discovery info messages (schemas, types, operations) matching client command output
- feat(pipeline): add success messages with output paths for each generation step (client, OpenAPI, gateway)
- fix(cli): correct catalog-file option descriptions to match actual default behavior in client and openapi commands
- fix(cli): remove unreachable else branch in client command catalog loading logic
- fix(scripts): update all package.json smoke scripts to use correct CLI flag names (--wsdl-source, --catalog-file, --client-dir, --openapi-file, --gateway-dir, --gateway-service-name, --gateway-version-prefix, --openapi-format, --openapi-servers)
- refactor(ci): optimize CI to run only smoke:pipeline (complete workflow test covering all three operations: client + openapi + gateway)
- refactor(cli)!: standardize all CLI options to lowercase hyphenated format (BREAKING:
  `--versionTag`→
  `--version-tag`,
  `--basePath`→
  `--base-path`,
  `--pathStyle`→
  `--path-style`,
  `--closedSchemas`→
  `--closed-schemas`,
  `--pruneUnusedSchemas`→
  `--prune-unused-schemas`)
- refactor(cli): consolidate deprecation warnings with warnDeprecated helper
- refactor(cli): deduplicate status code parsing logic across pipeline and gateway commands
- refactor(cli): extract shared utilities to src/util/cli.ts for better code reuse
- refactor(cli): rename hasStandardLayoutArgs to hasRequiredPathArgs for clarity (checks path construction args, not layout)
- refactor(cli): standardize error handling with handleCLIError utility
- refactor(cli): standardize format and validation option resolution
- refactor(config): add resolveCompilerOptions helper for consistent option merging across CLI, pipeline, and API
- refactor(logging): eliminate redundant schema count messages between loader and CLI
- refactor(logging): reduce verbosity by removing individual file write messages, keeping only high-level progress and success indicators
- refactor(logging): remove inconsistent [wsdl] prefix from loader messages for unified output format
- refactor(logging): remove redundant OpenAPI validation success message (only report validation failures)
- refactor(logging): standardize console output with [ERROR], [WARNING], [SUCCESS] prefixes and remove emojis for better terminal compatibility
- refactor(scripts): optimize ci script to run only smoke:pipeline (eliminates redundant smoke test runs)
- refactor(scripts): simplify npm scripts to smoke:client, smoke:openapi, smoke:pipeline (3 functional smoke tests)
- refactor(scripts): update smoke:gateway to use co-located catalog from client generation

## [0.7.15] - 2025-12-10

- chore(gitignore): add rule to ignore all temp files
- Build(deps-dev): bump rimraf from 6.0.1 to 6.1.2
- Build(deps): bump fast-xml-parser from 5.3.0 to 5.3.2
- Build(deps-dev): bump @types/yargs from 17.0.33 to 17.0.35
- Build(deps): bump types/node from 24.9.1 to 24.10.1
- Build(deps): bump typescript from 5.9.2 to 5.9.3
- Build(deps): bump actions/checkout from 5 to 6

## [0.7.14] - 2025-11-19

- feat(docs): enhance README with additional flags and defaults
- Build(deps-dev): bump glob from 11.0.3 to 11.1.0 by @dependabot[bot]
- Build(deps): bump js-yaml from 4.1.0 to 4.1.1 by @dependabot[bot]

## [0.7.13] - 2025-11-14

- fix(version): correct the version number in package.json to 0.7.13 to keep up with tagging

## [0.7.12] - 2025-10-10

- fix(docs): improve README formatting and clarity (broken tables)

## [0.7.11] - 2025-10-01

- Build(deps-dev): bump tsx from 4.20.5 to 4.20.6 by @dependabot[bot] in #19
- Build(deps): bump fast-xml-parser from 5.2.5 to 5.3.0 by @dependabot[bot] in #21
- Build(deps): bump actions/setup-node from 5 to 6 by @dependabot[bot] in #25
- Build(deps): bump @apidevtools/swagger-parser from 10.1.1 to 12.1.0 by @dependabot[bot] in #26
- Build(deps-dev): bump @types/node from 24.5.2 to 24.9.1 by @dependabot[bot] in #27
- Build(deps): bump soap from 1.4.1 to 1.6.0 by @dependabot[bot] in #28

## [0.7.1] - 2025-09-23

- feat(openapi): introduce always-on standard response envelope (base + alphabetized extensions + error object) with customizable --envelope-namespace / --error-namespace and global alphabetical sorting of paths, methods, schemas, securitySchemes, and parameters
- fix(openapi): omit non-default jsonSchemaDialect to prevent IDE warnings; add deterministic default server '/' when none supplied via --servers; alphabetically sort component section keys & operation tag arrays; introduce underscore collision avoidance for envelope/error namespace concatenation (e.g. FooResponse_ResponseEnvelope)

## [0.7.0] - 2025-09-23

- feat(openapi): add fail-fast validation of unknown schema refs/base types in buildComplexSchema to prevent dangling $ref emissions
- feat(openapi): add OpenAPI 3.1 generation subcommand and programmatic API (generateOpenAPI) with schema/path/security support
- feat(openapi): support YAML output via --yaml flag or .yaml/.yml extension
- feat(openapi): add tag inference heuristics (--tag-style default|first|service)
- feat(openapi): add optional spec validation using swagger-parser (--validate)
- feat(pipeline): add one-shot generation subcommand (pipeline) and programmatic API runGenerationPipeline
- docs(readme): improve examples clarity with explicit references to examples/minimal/weather.wsdl
- feat(npm): add clean:tmp script for comprehensive temporary directory cleanup
- fix(openapi): replace flawed custom YAML serializer with js-yaml library for proper YAML formatting and IDE compatibility
- feat(ci): auto-cleanup validation test artifacts after successful CI completion for cleaner workspace
- chore(ci): consolidate pipeline artifacts (client, types, utils, catalog, openapi.{json,yaml}) into single output directory (no nested pipeline folder)

## [0.6.3] - 2025-09-22

- build(deps): update dependencies to version 0.25.10

## [0.6.2] - 2025-09-16

- chore(ci): update permissions for CI jobs

## [0.6.1] - 2025-09-16

- build(deps): bump soap from 1.3.0 to 1.4.1
- build(deps-dev): bump @types/node from 24.3.0 to 24.3.1 and 24.3.1 to 24.4.0
- build(deps): bump actions/setup-node from 4 to 5

## [0.6.0] - 2025-09-06

- docs: comprehensive documentation improvements with enhanced usage examples and API reference
- feat: enable GitHub Discussions for community feedback and feature requests
- docs: simplify ROADMAP.md to reflect realistic scope for small project with 2 contributors
- docs: clarify OpenAPI 3.1 generation goals for 0.7.x series to enable REST API gateways
- feat: add --nillable-as-optional CLI flag to treat nillable elements as optional properties (thanks @GerryWilko)
- fix: correct utils file generation in programmatic API - was generating as meta.ts instead of utils.ts (thanks @GerryWilko)

## [0.5.0] - 2025-08-21

- refactor(clientEmitter): properly pass operation input and output types to call() method

## [0.4.2] - 2025-08-21

- refactor(clientEmitter): update constructor logic and remove redundant source type check, fix semicolon usage

## [0.4.1] - 2025-08-21

- fix(docs): update README with correct package name and installation instructions
- docs(readme): elaborate Features section with detailed advanced feature list for SOAP pain points
- docs(readme): improve Introduction section with concise overview and key benefits
- docs(readme): enhance Troubleshooting section with clearer, example-driven guidance ith correct package name and installation instructions

## [0.4.0] - 2025-08-21

- Added
  `compileWsdlToProject` function for programmatic API usage
- Added
  `--catalog` flag and
  `catalogEmitter` for WSDL compilation introspection
- Refactored emitters: consolidated meta, ops, and runtime; introduced
  `utilsEmitter` for runtime metadata
- Updated
  `clientEmitter` to embed marshaling/unmarshalling logic and include
  `requestRaw` in response types
- Centralized utilities in
  `util/tools` (string, XML, and name‑derivation helpers)
- Enhanced
  `schemaCompiler` to handle complex/simpleContent inheritance and WS-Policy scanning
- Improved
  `typesEmitter` to support simpleContent extensions and consistent property ordering

## [0.3.0] - 2025-08-19

- fix(runtime): serialize XML attributes via attributes for node-soap; accept both $attributes/attributes on input; hoist attributes from responses; normalize boolean/number attribute values to strings (src/emit/runtimeEmitter.ts, generated runtime.ts).
- fix(runtime): remove import.meta/createRequire; add universal CJS/ESM loader for soap; resolve IDE “possibly uninitialized” warning by avoiding optional chaining on default export (src/emit/runtimeEmitter.ts).

## [0.2.72] - 2025-08-19

- fix(runtime): emit XML attributes via 'attributes' (node-soap) instead of '$attributes' elements; accept both '$attributes'/'attributes' on input; hoist attrs from 'attributes'/'$' on parse.
- refactor(runtime): load 'soap' dynamically for ESM/CJS interop (prefer import(), fallback to require()).

## [0.2.71] - 2025-08-18

- refactor(schemaCompiler): inclined redundant variable

## [0.2.7] - 2025-08-18

- refactor(schemaCompiler): stop inlining element @type complex types; emit TS type aliases and add meta synonyms to avoid duplication and preserve element↔type mapping

## [0.2.6] - 2025-08-18

- fix(schemaCompiler): merge duplicate complexType definitions by consolidating attributes and elements

## [0.2.5] - 2025-08-18

- fix(schemaCompiler): recursively traverse nested
  `<sequence>`,
  `<choice>`, and
  `<all>` groups so inner
  `<element>` declarations (e.g., BookingChannels, Errors, Success, TPA_Extensions, Warnings) are correctly emitted in generated interfaces

## [0.2.4] - 2025-08-18

- fix(util/pascal): only prefix '_' when the whole identifier equals a reserved word; stop over-prefixing names that merely start with one (e.g., Aspect, AsyncJob).
- feat(emitter/types): add explanatory comments for attributes/elements and sort them for clarity in generated interfaces.

## [0.2.3] - 2025-08-18

- Preserve underscores and $ in generated TypeScript identifiers; sanitize others and ensure valid identifier start.
- Quote generated property names that are not valid TypeScript identifiers (e.g., containing hyphens).
- Emit client methods using computed property names to support operations with non-identifier names.
- Guard against reserved TypeScript keywords by prefixing an underscore when necessary.
- docs(README): fix malformed code fences and overlapping blocks; clarify XML mapping with $value/attributes and identifier tip examples.

## [0.2.2] - 2025-08-18

- Name generated client class after WSDL service (e.g., Weather → WeatherSoapClient); fallback to WSDL filename or GeneratedSoapClient.
- Add CLI flag --client-name to override the exported client class name.
- Document client naming behavior and --client-name in README (generation section).
- Update copilot-instructions to enforce capturing session edits under Unreleased and add release-prep workflow steps.
- Clarify and demonstrate the reserved
  `$value` key for literal XML content in README usage example.

## [0.2.1] - 2025-08-18

- Add WS-Policy parsing to detect security requirements (e.g., usernameToken, https) from WSDL bindings and operations.
- Include security hints in generated client JSDoc and runtime warnings if security is missing.
- Extend runtime factory to accept and apply a
  `security` option for node-soap clients.
- Update README with examples and documentation for security configuration and WS-Policy hints.
- Fix README install instructions to use correct package name (@techspokes/typescript-wsdl-client) to prevent 404 errors.

## [0.2.0] - 2025-08-18

- Enrich schemaCompiler operations by extracting SOAP action URIs from WSDL
  `<soap:operation>` bindings.

## [0.1.91] - 2025-08-17

- Update copilot-instructions to include best practices for naming and commenting.
- Improve variable naming and comments in index.ts and config.ts for clarity and maintainability.
- Add console logs for schema, type, and operation counts in CLI output.
- Document local CLI invocation methods in README (tsx, npm run dev, npm link).
- Enhance schemaCompiler.ts with detailed comments explaining the type compilation flow and SOAP binding operations extraction improvements.
- Enforce braces on all conditional statements in schemaCompiler.ts for consistent code style.

## [0.1.9] - 2025-08-17

- Replace email links in public Markdown files with link to contact page.
- Initial community scaffolding: CI, issue/PR templates, docs.
