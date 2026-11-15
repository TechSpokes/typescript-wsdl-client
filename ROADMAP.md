# TypeScript WSDL Client Roadmap

Product direction for the WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway and application scaffold. See the root [README](README.md) for usage and the documentation index.

## Product delivery

Deliver working integrations for declared WSDL profiles, with typed generated artifacts, independently expected XML/HTTP exchanges and useful refusals where support is missing. Legacy remains the default; [checked generation](docs/checked-generation.md) is opt-in and retains its separate native validation requirements.

The [public corpus](docs/corpus.md) connects representative source inputs to executable evidence. Successful generation and intentional refusal are separate outcomes; neither a growing example count nor a round trip alone establishes general XSD coverage.

Product changes do not wait for unrelated universal research completion. Each change must still establish the source, scalar, mapping, protocol and security duties it actually consumes; [ADR-003](docs/decisions/003-content-model-contracts.md) and [ADR-004](docs/decisions/004-product-research-boundary.md) retain that boundary.

## Published baseline

Version [1.6.3](docs/releases/v1.6.3.md) is the current GitHub release. It adds checked SOAP 1.1/1.2 input-only document/literal operations and exact safe downstream HTTP metadata names, following bounded HTTP observation in 1.6.2 and independently validated application-error branches in 1.6.0. Checked composition and checked streaming remain deferred; a bounded release does not establish broader provider or standards coverage.

### Release availability and upgrade impact

Version 1.6.3 is published on [GitHub](https://github.com/TechSpokes/typescript-wsdl-client/releases/tag/v1.6.3), and its [npm publication workflow](https://github.com/TechSpokes/typescript-wsdl-client/actions/runs/43716126755) completed successfully. Registry processing and availability are separate from workflow completion; verify the exact version in the [npm registry](https://registry.npmjs.org/@techspokes%2Ftypescript-wsdl-client) before installing it. Versions 1.1.6 and 1.1.7 were unpublished candidates whose preview work reached npm in 1.1.8. See the [version migration guide](docs/migration.md).

| Delivery state | Scope |
|---|---|
| Published in 1.1.8 | Opt-in checked component preview and its documented structured mappings |
| Released in 1.2.0 | Scoped legacy declarations, native legacy composition, mapped streams and bounded checked RPC |
| Published in 1.3.0 | Checked SOAP 1.2 document/literal with an additive runtime handshake |
| Published in 1.4.1 | Composable checked OpenAPI documentation with scoped schema references |
| Published in 1.5.0 | Scoped redacted diagnostics and pinned declared-type corrections |
| Published in 1.6.0 | Independently pinned application-error branches with typed HTTP 502 outcomes |
| Published in 1.6.2 | Bounded HTTP observation and separately selected gateway publication |
| Released in 1.6.3 | SOAP 1.1/1.2 input-only acknowledgements and exact safe downstream HTTP names |
| Deferred | Checked composition, checked incremental decoding and broader protocol/security coverage |

Existing projects retain legacy generation unless they deliberately select a new profile. Regeneration can change colliding DTO/schema names, stream record shapes and corrected scalar/simple-content values when crossing 1.2.0. The [migration guide](docs/migration.md) retains those impacts and describes the separately adopted SOAP 1.2 runtime in 1.3.0.

One-way acknowledgement confirms a complete allowed HTTP exchange, not business processing. Adopt matching V6/V7 generated artifacts deliberately; existing request-response bindings and defaults remain unchanged. HTTP publication names do not add authentication or typed SOAP headers, and safe generated data keys do not remove the SOAP dependency's reserved source-name restrictions.

## Next deliveries

Use this roadmap for product direction and release boundaries, the [working-gateway coverage register](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) for current feature gaps, and the [product outcome](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) for end-to-end acceptance. Issue [#379](https://github.com/TechSpokes/typescript-wsdl-client/issues/379) preserves earlier restart history; its dated dispatch instructions do not select the next task.

The combined [#425](https://github.com/TechSpokes/typescript-wsdl-client/issues/425)/[#482](https://github.com/TechSpokes/typescript-wsdl-client/issues/482) delivery is complete through [PR #483](https://github.com/TechSpokes/typescript-wsdl-client/pull/483). No next feature is dispatched by this reconciliation; choose a bounded addition by the integrations it unlocks and qualify its actual dependencies.

| Remaining work | Current owner |
|---|---|
| Configured authentication, TLS client credentials and typed SOAP headers | [#424](https://github.com/TechSpokes/typescript-wsdl-client/issues/424) |
| Metadata decoding, cyclic bootstrap and dependency-sensitive legal source names | [#426](https://github.com/TechSpokes/typescript-wsdl-client/issues/426) |
| RPC/literal, document multipart and broader encoded message graphs | [#427](https://github.com/TechSpokes/typescript-wsdl-client/issues/427) |
| MIME attachments and MTOM/XOP binary ownership | [#428](https://github.com/TechSpokes/typescript-wsdl-client/issues/428) |
| WSDL 2.0, XSD 1.1, other bindings and additional protocol adapters | [#429](https://github.com/TechSpokes/typescript-wsdl-client/issues/429) |
| Additional charset investigation and exact alias/platform policy | [#462](https://github.com/TechSpokes/typescript-wsdl-client/issues/462) |
| Scalar-base complex-content extension assessment | [#478](https://github.com/TechSpokes/typescript-wsdl-client/issues/478) |
| Contextual/dynamic values and wider source/value combinations | [#179](https://github.com/TechSpokes/typescript-wsdl-client/issues/179), [#184](https://github.com/TechSpokes/typescript-wsdl-client/issues/184) |
| Checked incremental encoding/decoding, completion and parity | [#192](https://github.com/TechSpokes/typescript-wsdl-client/issues/192), [#193](https://github.com/TechSpokes/typescript-wsdl-client/issues/193), [#194](https://github.com/TechSpokes/typescript-wsdl-client/issues/194) |

Checked composition remains [deferred](docs/roadmap/multi-service-gateway.md#deferred-checked-composition). Extend the existing corpus with rights-cleared sources and independent positive, invalid-input and refusal expectations; no single fixture must own cross-cutting security or maintenance work. HTTP schema integration retains its scoped [#410](https://github.com/TechSpokes/typescript-wsdl-client/issues/410) assessment and native ownership boundaries.

Keep consumer guides concise, package contents explicit and validation responsibilities visible. Measure package growth and lane duration before setting budgets or moving coverage between PR and release checks.

Maintain the CI tooling that retains timing records and diagnostic bundles for these qualification runs. Uploader upgrades preserve existing archive formats, source paths, retention and permissions. Required [product qualification](.github/workflows/node-reference.yml) stays separate from manually dispatched [research platform qualification](.github/workflows/research-platform.yml); shared tooling maintenance does not make research a product release gate.

## Major-release readiness

A future default or public-shape activation requires its existing separately approved major-release decision, migration guidance and compatibility evidence. Define the intended supported profile and platform/security requirements explicitly before announcing readiness.

Use representative corpus exchanges alongside independent native checks, installed consumers, invalid-response tests and migration coverage. Do not equate a finite corpus with universal standards conformance or retire unresolved research by renaming its status.

## Available in the development tree

Checked generation supports explicit nil with attributes, native facets and primitive-string unions, keyed mixed/namespaced/open values, and opt-in application groups with configured names in their documented domains. The [checked gateway guide](docs/checked-gateway.md) and [mapping contract](docs/mapping-contract.md) describe their actual public representation and limits.

The development tree includes the released 1.6.3 implementation. [Release notes](docs/releases/README.md) describe each version's scope, while [npm registry metadata](https://registry.npmjs.org/@techspokes%2Ftypescript-wsdl-client) establishes package availability. Later development-tree changes and successful tests do not establish publication.

Provider evidence remains narrower than implementation coverage. All 12 NOAA operations have owned-server qualification, while the retained live retest has ten successes and two non-SOAP GML failures; Escapia evidence covers selected Test reads. These limitations remain explicit in the [NOAA qualification](docs/noaa-ndfd-qualification.md) and [composition status](docs/roadmap/multi-service-gateway.md), without closing the broader coverage work.

## Research and historical coordination

The [research program](research/README.md) remains available in this repository, with separate commands and optional automation. Universal derivability, whole-forest erasure and finite-catalogue completeness remain unresolved; product separation changes neither those proof states nor accepted semantic guarantees.

The [content-model epic](https://github.com/TechSpokes/typescript-wsdl-client/issues/147) retains historical ownership and full-profile requirements. The [completed 1.0 plan](docs/roadmap/README.md), [changelog](CHANGELOG.md) and research investigation records preserve the previous execution history without making its chronological session order a blanket product prerequisite.
