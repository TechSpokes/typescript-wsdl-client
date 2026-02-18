# Claude Code Instructions

Read AGENTS.md first for project context, must-follow rules, and pointers to the authoritative instructions. AGENTS.md references `.github/copilot-instructions.md` (authoritative detailed rules) and `.github/instructions/` (file-pattern-specific rules such as markdown formatting). Follow the instruction file hierarchy described there.

When working on projects that use this package as a dependency:

- CLI binary: `wsdl-tsc` (installed via `@techspokes/typescript-wsdl-client`)
- Primary command: `npx wsdl-tsc pipeline` (generates the full stack from WSDL)
- Runtime dependency: `soap`
- Required tsconfig: module NodeNext, moduleResolution NodeNext, target ES2022
- Generated files must not be edited manually; regenerate from WSDL sources
