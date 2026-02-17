# Claude Code Instructions

This project uses AGENTS.md as the primary agent instruction file. Read AGENTS.md for complete project context, constraints, and conventions.

For development of this package, also read .github/copilot-instructions.md which contains additional detail about commit format, catalog co-location rules, and CLI flag conventions.

When working on projects that use this package as a dependency:

- CLI binary: `wsdl-tsc` (installed via `@techspokes/typescript-wsdl-client`)
- Primary command: `npx wsdl-tsc pipeline` (generates the full stack from WSDL)
- Runtime dependency: `soap`
- Required tsconfig: module NodeNext, moduleResolution NodeNext, target ES2022
- Generated files must not be edited manually; regenerate from WSDL sources
