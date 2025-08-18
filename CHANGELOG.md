# Changelog

> Entry style: one-line, no file lists, no vague phrasing. See .github/copilot-instructions.md for details.

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]

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
