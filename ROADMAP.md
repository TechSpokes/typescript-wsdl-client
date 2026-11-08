# TypeScript WSDL Client Roadmap

Product direction for the WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway and application scaffold. See the root [README](README.md) for usage and the documentation index.

## Product delivery

Deliver working integrations for declared WSDL profiles, with typed generated artifacts, independently expected XML/HTTP exchanges and useful refusals where support is missing. Legacy remains the default; [checked generation](docs/checked-generation.md) is opt-in and retains its separate native validation requirements.

The [public corpus](docs/corpus.md) connects representative source inputs to executable evidence. Successful generation and intentional refusal are separate outcomes; neither a growing example count nor a round trip alone establishes general XSD coverage.

Product changes do not wait for unrelated universal research completion. Each change must still establish the source, scalar, mapping, protocol and security duties it actually consumes; [ADR-003](docs/decisions/003-content-model-contracts.md) and [ADR-004](docs/decisions/004-product-research-boundary.md) retain that boundary.

## Next deliveries

Release the already implemented capabilities recorded in [Unreleased](CHANGELOG.md#unreleased) through the existing release process. Package preparation, validated release candidates and maintainer publication remain distinct steps.

Use the existing [working-gateway coverage register](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) and [product outcome](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) to choose bounded additions by the integrations they unlock. Extend the existing conformance corpus with rights-cleared sources and independent positive, invalid-input and refusal expectations.

Broader work includes protocol and message forms, required authentication/security combinations, source encoding/bootstrap, contextual and dynamic values, and checked streaming. These are separate delivery packets; no single public fixture is required to own cross-cutting security or maintenance work.

Keep consumer guides concise, package contents explicit and validation responsibilities visible. Measure package growth and lane duration before setting budgets or moving coverage between PR and release checks.

## Major-release readiness

A future default or public-shape activation requires its existing separately approved major-release decision, migration guidance and compatibility evidence. Define the intended supported profile and platform/security requirements explicitly before announcing readiness.

Use representative corpus exchanges alongside independent native checks, installed consumers, invalid-response tests and migration coverage. Do not equate a finite corpus with universal standards conformance or retire unresolved research by renaming its status.

## Available in the development tree

Checked generation supports explicit nil with attributes, native facets and primitive-string unions, keyed mixed/namespaced/open values, and opt-in application groups with configured names in their documented domains. The [checked gateway guide](docs/checked-gateway.md) and [mapping contract](docs/mapping-contract.md) describe their actual public representation and limits.

The current package version is 1.1.7; [release notes](docs/releases/README.md) and [published releases](https://github.com/TechSpokes/typescript-wsdl-client/releases) establish release availability. Development-tree capabilities and successful tests do not by themselves mean a package has been published.

## Research and historical coordination

The [research program](research/README.md) remains available in this repository, with separate commands and optional automation. Universal derivability, whole-forest erasure and finite-catalogue completeness remain unresolved; product separation changes neither those proof states nor accepted semantic guarantees.

The [content-model epic](https://github.com/TechSpokes/typescript-wsdl-client/issues/147) retains historical ownership and full-profile requirements. The [completed 1.0 plan](docs/roadmap/README.md), [changelog](CHANGELOG.md) and research investigation records preserve the previous execution history without making its chronological session order a blanket product prerequisite.
