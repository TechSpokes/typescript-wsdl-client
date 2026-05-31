# Documentation

Human-maintained reference documents for `@techspokes/typescript-wsdl-client`. The root [README.md](../README.md) Documentation section is the authoritative index with descriptions; the list below is a quick local reference organized by reader intent.

## Evaluate

- [start-here.md](start-here.md): what this is, who it is for, choose your path
- [supported-patterns.md](supported-patterns.md): WSDL/XSD features handled and current limitations
- [output-anatomy.md](output-anatomy.md): what gets generated and how to use it

## Adopt

- [cli-reference.md](cli-reference.md): all 6 commands with flags and examples
- [generated-code.md](generated-code.md): using clients, types, and operations
- [configuration.md](configuration.md): gateway security, upstream SOAP security, tags, operations config files
- [migration-playbook.md](migration-playbook.md): end-to-end SOAP modernization guide

## Operate

- [gateway-guide.md](gateway-guide.md): Fastify integration and error handling
- [testing.md](testing.md): testing patterns and mock client examples
- [production.md](production.md): CI/CD, validation, logging
- [troubleshooting.md](troubleshooting.md): common issues and debugging
- [releases/README.md](releases/README.md): per-version GitHub release notes used by the draft release workflow

## Extend

- [api-reference.md](api-reference.md): programmatic TypeScript API
- [concepts.md](concepts.md): flattening, `$value`, primitives, determinism
- [architecture.md](architecture.md): internal pipeline for contributors
- [agent-skill.md](agent-skill.md): release ZIP for consumer-project AI agents
- [roadmap/README.md](roadmap/README.md): implementation slices and release gates for 1.0
- [decisions/002-streamable-responses.md](decisions/002-streamable-responses.md): opt-in streaming design (client `AsyncIterable`, gateway NDJSON, `x-wsdl-tsc-stream` OpenAPI extension); shipped in 0.17.0
- [migration.md](migration.md): upgrading between package versions

## Conventions

- Each document opens with an H1 title and a one-line description.
- Cross-reference related documents and the root README where relevant.
- Use fenced code blocks for CLI examples; format flags as inline code (`` `--flag-name` ``).
- Run `npm run docs:validate` to check local links and TypeScript fenced snippets.
- Keep language direct and task-oriented; architecture.md targets contributors, all others target users.

## Related

- [Root README](../README.md): project overview, quick start, and authoritative Documentation section
- [CONTRIBUTING.md](../CONTRIBUTING.md): development setup and workflow
- [CHANGELOG.md](../CHANGELOG.md): version history
- [examples](../examples/README.md): sample WSDL files and generated output

## Not Here

- Generated code samples live in `examples/generated-output/`, not in `docs/`.
- Installation and dev setup belong in the root README and CONTRIBUTING.md respectively.
