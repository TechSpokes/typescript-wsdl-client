# TypeScript WSDL Client Roadmap

Product direction for the WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway and application scaffold. See the root [README](README.md) for usage and the documentation index.

## Product delivery

Deliver working integrations for declared WSDL profiles, with typed generated artifacts, independently expected XML/HTTP exchanges and useful refusals where support is missing. Legacy remains the default; [checked generation](docs/checked-generation.md) is opt-in and retains its separate native validation requirements.

The [public corpus](docs/corpus.md) connects representative source inputs to executable evidence. Successful generation and intentional refusal are separate outcomes; neither a growing example count nor a round trip alone establishes general XSD coverage.

Product changes do not wait for unrelated universal research completion. Each change must still establish the source, scalar, mapping, protocol and security duties it actually consumes; [ADR-003](docs/decisions/003-content-model-contracts.md) and [ADR-004](docs/decisions/004-product-research-boundary.md) retain that boundary.

## Next deliveries

Complete review and maintainer release preparation for the [1.2.0 candidate](docs/releases/v1.2.0.md), tracked by [#463](https://github.com/TechSpokes/typescript-wsdl-client/issues/463) and [PR #464](https://github.com/TechSpokes/typescript-wsdl-client/pull/464). Native legacy composition is implemented; checked composition and checked streaming remain deferred. Candidate validation, GitHub draft creation and npm publication are distinct steps.

### Release availability and upgrade impact

At the 1.2.0 candidate preparation check on 2026-11-10, npm's latest published version was 1.1.8. Version 1.1.5 was also published; 1.1.6 and 1.1.7 were unpublished candidates whose preview work reached npm in 1.1.8. A tag or release-note file alone does not establish package availability; see the [version migration guide](docs/migration.md#from-11x-to-120).

| Delivery state | Scope |
|---|---|
| Published in 1.1.8 | Opt-in checked component preview and its documented structured mappings |
| Implemented for the 1.2.0 candidate | Scoped legacy declarations, native legacy composition, mapped streams and bounded checked RPC |
| Deferred | Checked composition, checked incremental decoding and broader protocol/security coverage |

Existing projects retain legacy generation unless they deliberately select a new profile. Regeneration can change colliding DTO/schema names, stream record shapes and corrected scalar/simple-content values; the candidate includes [consumer upgrade and rollback instructions](docs/migration.md#from-11x-to-120), not a guarantee of a drop-in migration for every project.

### Subsequent bounded deliveries

Use the existing [working-gateway coverage register](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) and [product outcome](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) to choose bounded additions by the integrations they unlock. Extend the existing conformance corpus with rights-cleared sources and independent positive, invalid-input and refusal expectations.

Broader work includes protocol and message forms, required authentication/security combinations, source encoding/bootstrap, contextual and dynamic values, and checked streaming. These are separate delivery packets; no single public fixture is required to own cross-cutting security or maintenance work.

Keep consumer guides concise, package contents explicit and validation responsibilities visible. Measure package growth and lane duration before setting budgets or moving coverage between PR and release checks.

## Major-release readiness

A future default or public-shape activation requires its existing separately approved major-release decision, migration guidance and compatibility evidence. Define the intended supported profile and platform/security requirements explicitly before announcing readiness.

Use representative corpus exchanges alongside independent native checks, installed consumers, invalid-response tests and migration coverage. Do not equate a finite corpus with universal standards conformance or retire unresolved research by renaming its status.

## Available in the development tree

Checked generation supports explicit nil with attributes, native facets and primitive-string unions, keyed mixed/namespaced/open values, and opt-in application groups with configured names in their documented domains. The [checked gateway guide](docs/checked-gateway.md) and [mapping contract](docs/mapping-contract.md) describe their actual public representation and limits.

The local candidate targets 1.2.0; [release notes](docs/releases/README.md) describe its scope, while [npm registry metadata](https://registry.npmjs.org/@techspokes%2Ftypescript-wsdl-client) establishes package availability. Development-tree capabilities and successful tests do not establish publication.

Provider evidence remains narrower than implementation coverage. All 12 NOAA operations have owned-server qualification, while the retained live retest has ten successes and two non-SOAP GML failures; Escapia evidence covers selected Test reads. These limitations remain explicit in the [NOAA qualification](docs/noaa-ndfd-qualification.md) and [composition status](docs/roadmap/multi-service-gateway.md), without closing the broader coverage work.

## Research and historical coordination

The [research program](research/README.md) remains available in this repository, with separate commands and optional automation. Universal derivability, whole-forest erasure and finite-catalogue completeness remain unresolved; product separation changes neither those proof states nor accepted semantic guarantees.

The [content-model epic](https://github.com/TechSpokes/typescript-wsdl-client/issues/147) retains historical ownership and full-profile requirements. The [completed 1.0 plan](docs/roadmap/README.md), [changelog](CHANGELOG.md) and research investigation records preserve the previous execution history without making its chronological session order a blanket product prerequisite.
