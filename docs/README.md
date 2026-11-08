# Documentation

Consumer and contributor guidance for `@techspokes/typescript-wsdl-client`. Use the root [README](../README.md#documentation) as the authoritative documentation index.

## Using the package

Start with [Start Here](start-here.md), then choose the [CLI reference](cli-reference.md) or the [checked generation guide](checked-generation.md). Consult [Supported Patterns](supported-patterns.md) and the checked guide's separate scope before selecting a generation mode.

Use [Troubleshooting](troubleshooting.md) for failures and [Migration](migration.md) when upgrading generated projects. The [agent skill guide](agent-skill.md) describes the separately distributed consumer-project skill.

Use [consumer testing guidance](testing.md#for-consumer-projects) for legacy mock-route tests, checked scaffold checks and your own integration tests.

## Contributing

Use the [contributor guide](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/CONTRIBUTING.md) for repository setup and validation. Contributor architecture, research and release archives remain in the repository rather than the npm package.

Use [repository testing](testing.md#test-architecture) for maintainer test selection and [verification orchestration](testing.md#verification-orchestration) for execution ownership and evidence.

Follow the [documentation conventions](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/AGENTS.md) when editing guides. Run `npm run docs:validate` to check documentation structure and links; inspect examples against their actual prerequisites and commands separately.

## Decisions

Read the [content-model contracts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/003-content-model-contracts.md) for correctness and compatibility requirements. The [streaming decision](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/docs/decisions/002-streamable-responses.md) records the opt-in streaming contract.
