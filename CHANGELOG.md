# Changelog

> Entry style: one-line, no file lists, no vague phrasing.
> (@agents see .github/copilot-instructions.md for details)

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

## [0.2.7] – 2025-08-18
- refactor(schemaCompiler): stop inlining element @type complex types; emit TS type aliases and add meta synonyms to avoid duplication and preserve element↔type mapping

## [0.2.6] – 2025-08-18
- fix(schemaCompiler): merge duplicate complexType definitions by consolidating attributes and elements

## [0.2.5] – 2025-08-18
- fix(schemaCompiler): recursively traverse nested `<sequence>`, `<choice>`, and `<all>` groups so inner `<element>` declarations (e.g., BookingChannels, Errors, Success, TPA_Extensions, Warnings) are correctly emitted in generated interfaces

## [0.2.4] – 2025-08-18
- fix(util/pascal): only prefix '_' when the whole identifier equals a reserved word; stop over-prefixing names that merely start with one (e.g., Aspect, AsyncJob).
- feat(emitter/types): add explanatory comments for attributes/elements and sort them for clarity in generated interfaces.

## [0.2.3] – 2025-08-18
- Preserve underscores and $ in generated TypeScript identifiers; sanitize others and ensure valid identifier start.
- Quote generated property names that are not valid TypeScript identifiers (e.g., containing hyphens).
- Emit client methods using computed property names to support operations with non-identifier names.
- Guard against reserved TypeScript keywords by prefixing an underscore when necessary.
- docs(README): fix malformed code fences and overlapping blocks; clarify XML mapping with $value/attributes and identifier tip examples.

## [0.2.2] – 2025-08-18
- Name generated client class after WSDL service (e.g., Weather → WeatherSoapClient); fallback to WSDL filename or GeneratedSoapClient.
- Add CLI flag --client-name to override the exported client class name.
- Document client naming behavior and --client-name in README (generation section).
- Update copilot-instructions to enforce capturing session edits under Unreleased and add release-prep workflow steps.
- Clarify and demonstrate the reserved `$value` key for literal XML content in README usage example.

## [0.2.1] – 2025-08-18
- Add WS-Policy parsing to detect security requirements (e.g., usernameToken, https) from WSDL bindings and operations.
- Include security hints in generated client JSDoc and runtime warnings if security is missing.
- Extend runtime factory to accept and apply a `security` option for node-soap clients.
- Update README with examples and documentation for security configuration and WS-Policy hints.
- Fix README install instructions to use correct package name (@techspokes/typescript-wsdl-client) to prevent 404 errors.

## [0.2.0] – 2025-08-18
- Enrich schemaCompiler operations by extracting SOAP action URIs from WSDL `<soap:operation>` bindings.

## [0.1.91] – 2025-08-17
- Update copilot-instructions to include best practices for naming and commenting.
- Improve variable naming and comments in index.ts and config.ts for clarity and maintainability.
- Add console logs for schema, type, and operation counts in CLI output.
- Document local CLI invocation methods in README (tsx, npm run dev, npm link).
- Enhance schemaCompiler.ts with detailed comments explaining the type compilation flow and SOAP binding operations extraction improvements.
- Enforce braces on all conditional statements in schemaCompiler.ts for consistent code style.

## [0.1.9] – 2025-08-17
- Replace email links in public markdown files with link to contact page.
- Initial community scaffolding: CI, issue/PR templates, docs.
