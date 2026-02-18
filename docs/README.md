# Documentation

Human-maintained reference documents for `@techspokes/typescript-wsdl-client`. The root [README.md](../README.md) Documentation table is the authoritative index with descriptions; the list below is a quick local reference.

## Contents

- [api-reference.md](api-reference.md) – Programmatic TypeScript API
- [architecture.md](architecture.md) – Internal pipeline for contributors
- [cli-reference.md](cli-reference.md) – All 6 commands with flags and examples
- [concepts.md](concepts.md) – Flattening, `$value`, primitives, determinism
- [configuration.md](configuration.md) – Security, tags, operations config files
- [gateway-guide.md](gateway-guide.md) – Fastify integration and error handling
- [generated-code.md](generated-code.md) – Using clients and types
- [migration.md](migration.md) – Upgrade paths between versions
- [production.md](production.md) – CI/CD, validation, logging, limitations
- [testing.md](testing.md) – Testing patterns and mock client examples
- [troubleshooting.md](troubleshooting.md) – Common issues and debugging

## Conventions

- Each document opens with an H1 title and a one-line description.
- Cross-reference related documents and the root README where relevant.
- Use fenced code blocks for CLI examples; format flags as inline code (`` `--flag-name` ``).
- Keep language direct and task-oriented; architecture.md targets contributors, all others target users.

## Related

- [Root README](../README.md) – project overview, quick start, and authoritative Documentation table
- [CONTRIBUTING.md](../CONTRIBUTING.md) – development setup and workflow
- [CHANGELOG.md](../CHANGELOG.md) – version history
- [examples/](../examples/) – sample WSDL files and generated output

## Not Here

- Generated code samples live in `examples/generated-output/`, not in `docs/`.
- Installation and dev setup belong in the root README and CONTRIBUTING.md respectively.
