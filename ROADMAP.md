# TypeScript WSDL Client Roadmap

Product direction for the WSDL/SOAP client generator, OpenAPI bridge, Fastify gateway and application scaffold. See the root [README](README.md) for usage and the documentation index.

## Product delivery

Deliver working integrations for declared WSDL profiles, with typed generated artifacts, independently expected XML/HTTP exchanges and useful refusals where support is missing. Legacy remains the default; [checked generation](docs/checked-generation.md) is opt-in and retains its separate native validation requirements.

Prioritize completing checked generation as the replacement for the existing product before expanding the feature catalogue. Close gaps in the current approach, carry existing supported capabilities through the shared semantic core, then retire duplicated legacy semantics through tested migration. This preparation does not deprecate legacy, change defaults or establish implementation readiness.

The [public corpus](docs/corpus.md) connects representative source inputs to executable evidence. Successful generation and intentional refusal are separate outcomes; neither a growing example count nor a round trip alone establishes general XSD coverage.

Product changes do not wait for unrelated universal research completion. Each change must still establish the source, scalar, mapping, protocol and security duties it actually consumes; [ADR-003](docs/decisions/003-content-model-contracts.md) and [ADR-004](docs/decisions/004-product-research-boundary.md) retain that boundary.

## Published baseline

Version [1.7.0](docs/releases/v1.7.0.md) is published on GitHub and completes the agreed buffered SOAP work: queried endpoints, bounded compression, observed response bases, configured credentials, declared literal headers and portable metadata/bootstrap. Checked composition, checked streaming and the documented richer security/binding families remain incomplete; this release does not establish universal provider or standards coverage.

### Release availability and upgrade impact

Version 1.7.0 was published on [GitHub](https://github.com/TechSpokes/typescript-wsdl-client/releases/tag/v1.7.0) on November 17, 2026. Its [npm publication workflow](https://github.com/TechSpokes/typescript-wsdl-client/actions/runs/44135561064) passed, and the [exact npm version and integrity](https://registry.npmjs.org/@techspokes%2Ftypescript-wsdl-client/1.7.0) were verified the same day. Package-wide metadata and latest tags can lag the exact version; verify the pinned artifact independently before consumer acceptance. Versions 1.1.6 and 1.1.7 were unpublished candidates whose preview work reached npm in 1.1.8. See the [version migration guide](docs/migration.md#from-165-to-170).

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
| Published in 1.6.4 | Strict consumer compilation of HTTP publication pairs |
| Published on GitHub in 1.6.5 | Strict ASCII and explicitly labelled UTF-16 checked responses |
| Published on GitHub in 1.7.0 | Buffered transport, credentials, typed literal headers and metadata/source fidelity |
| Deferred | Checked composition, checked incremental decoding and broader protocol/security coverage |

Existing projects retain legacy generation unless they deliberately select a new profile. Regeneration can change colliding DTO/schema names, stream record shapes and corrected scalar/simple-content values when crossing 1.2.0. The [migration guide](docs/migration.md) retains those impacts and describes the separately adopted SOAP 1.2 runtime in 1.3.0.

One-way acknowledgement confirms a complete allowed HTTP exchange, not business processing. Adopt matching V6/V7 generated artifacts deliberately; existing request-response bindings and defaults remain unchanged. Version 1.7.0 adds configured authentication, typed literal SOAP headers and private bootstrap for supported legal names/cycles; wider source, policy and incoming cryptographic duties retain their owners.

## Next deliveries

### Buffered completion checkpoint, November 17, 2026

The [buffered SOAP completion checklist](docs/roadmap/v1.0-buffered-soap-completion.md) is complete through merged [PR #488](https://github.com/TechSpokes/typescript-wsdl-client/pull/488), implementation `a994859`, merged/tagged main `933d42b`. Reviewed, preflight and merged trees are identical. Final conformance, release preflight, PR/main platform checks and uploaded artifact/provenance/install verification passed; #424 and #426 are closed. Preserve those implementations and reuse their evidence.

The maintainer-selected [Escapia consumer upgrade](docs/roadmap/v1.0-published-consumer-acceptance.md) passed exact npm 1.7.0 generation, maintained tests, relocated production-only owned HTTPS execution, packaging/privacy and historical replay without an SDK workaround. #489 is complete for that revised real-consumer scope. The proposed fresh Forecast-app manifest exercise was not run and is not claimed as passing.

### Checked atomic unions and lists, November 18, 2026

[Checked lexical atomic unions](docs/roadmap/v1.0-checked-atomic-unions.md) and [lists of those unions](docs/roadmap/v1.0-checked-atomic-union-lists.md) are implemented in PRs [#491](https://github.com/TechSpokes/typescript-wsdl-client/pull/491) and [#493](https://github.com/TechSpokes/typescript-wsdl-client/pull/493). Ordinary union lists use ordered lexical tokens and retain existing whole-list pattern witnesses. Native validation owns member order, XML tokenization and typed sequence equality.

Both implementations passed independent review. The combined candidate has owned SOAP 1.1/1.2 and isolated installed gateway evidence. RPC lists, list-valued union members and wider or contextual atomic families remain outside the selected profile. #478 remains assessment-first, and streaming and incoming cryptographic security retain separate owners.

### Earlier routing context

Use this roadmap for product direction and release boundaries, the [working-gateway coverage register](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) for current feature gaps, and the [product outcome](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) for end-to-end acceptance. Issue [#379](https://github.com/TechSpokes/typescript-wsdl-client/issues/379) preserves earlier restart history; its dated dispatch instructions do not select the next task.

The combined [#425](https://github.com/TechSpokes/typescript-wsdl-client/issues/425)/[#482](https://github.com/TechSpokes/typescript-wsdl-client/issues/482) delivery completed through [PR #483](https://github.com/TechSpokes/typescript-wsdl-client/pull/483). Encoding/envelope work and bounded authentication/typed headers followed in v1.6.5/v1.7.0; their [completed checklist](docs/roadmap/v1.0-buffered-soap-completion.md) supersedes the earlier preparation sequence.

### Completion sequence

| Order | Outcome | Existing owners |
|---|---|---|
| 1 | Reuse delivered buffered and accepted Escapia consumer evidence | #401/#397/#207; completed #488/#424/#426/#489 |
| 2 | Deliver the verified atomic-union and union-list candidates together | #490/#491 and #492/#493 |
| 3 | Carry remaining existing capabilities through checked execution | #192-#194/#201-#203/#164; richer policy #429 |
| 4 | Retire duplicate semantics with installed migration evidence | #204/#205/#207/#208 |

Use [#397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) and [#207](https://github.com/TechSpokes/typescript-wsdl-client/issues/207) for a paired legacy/checked capability register. Each row identifies its source/profile, legacy promise, checked behavior, independently expected wire/HTTP result, remaining gap and owner. Distinguish working execution, valid unsupported input, unresolved qualification, invalid input and deliberate policy denial; refusal coverage does not prove replacement parity.

Prioritize existing supported behavior and the agreed WSDL 1.1/XSD 1.0/SOAP 1.1/1.2 HTTP(S) profile. Keep wider standards and optional modules visible under their existing owners; classify an exclusion as rare only with representative evidence. Whole-schema legality remains distinct from selected-operation runtime capability, so selecting fewer operations cannot bypass required source qualification.

### Encoding and envelope gap closure

The preparation below is retained history for the work delivered through v1.6.5 and v1.7.0. The completed [buffered checklist](docs/roadmap/v1.0-buffered-soap-completion.md) and [#488 ledger](https://github.com/TechSpokes/typescript-wsdl-client/pull/488#issuecomment-6950230376) own its actual acceptance; these earlier instructions do not dispatch it again. Wider charset policy remains #462 investigation.

#### Byte decoding contract

Specify metadata acquisition, SOAP responses and outgoing requests separately. Reuse the ordered parser and byte decoder; retain original bytes/digests, resource authority, malformed-byte rejection, cancellation and byte limits. Outgoing UTF-8 remains sufficient, and the frozen direct-runtime contract remains compatible.

Assess explicit US-ASCII, UTF-8, UTF-16 and UTF-16LE/BE labels, BOM presence, XML declarations and HTTP charset precedence against [XML 1.0](https://www.w3.org/TR/xml/#charencoding), [RFC 7303](https://www.rfc-editor.org/rfc/rfc7303.html#section-3) and [SOAP media rules](https://www.rfc-editor.org/rfc/rfc3902.html#section-2). Distinguish mandatory UTF-8/UTF-16 support from optional byte-order labels and other charsets. Decide whether to retain contradiction refusal or adopt specified precedence, recording compatibility consequences before implementation.

Before the standalone #190 response-encoding batch, checked responses refused explicit ASCII and unmarked UTF-16LE/BE. The [implemented response profile](docs/checked-gateway.md#checked-response-encoding) accepts strict ASCII and explicitly labelled BOM-less UTF-16LE/BE while retaining assertion agreement and exact ISO-8859-1. Metadata HTTP charset authority and portable context followed in v1.7.0 under closed #426; Windows-1252 is a distinct mapping, and broader charset ranking remains #462 work.

#### Envelope and processing contract

The earlier assessment covered namespace-qualified attributes on Envelope/Header/Body, SOAP 1.1 actor and SOAP 1.2 role/relay/mustUnderstand processing, and normal/protocol/declared fault selection against [SOAP 1.1](https://www.w3.org/TR/2000/NOTE-SOAP-20000508/) and [SOAP 1.2 Part 1](https://www.w3.org/TR/soap12-part1/). Before #487, shape checks rejected these attributes except a narrow encoding case; the delivered receiver and buffered completion now have independent positive/refusal evidence. Unknown mandatory blocks targeted at this receiver remain terminal unless their semantics are implemented.

The selected single-element document/literal body contract remains bounded. Multipart bodies and general SOAP encoding remain #427; accepting a legal envelope does not admit an unsupported application body. Typed literal headers and configured credentials were delivered under #424; source-required security and richer unimplemented policies retain their checks and owners.

Endpoint queries, bounded HTTP compression and observed response bases were delivered in v1.7.0. SOAP 1.2 GET SOAP-response and broader binding families remain #190/#429 work. The [standard HTTP binding](https://www.w3.org/TR/soap12-part2/#httpbind) covers more than the selected POST profile; the completed buffered packet does not certify universal binding support.

#### Acceptance and verification

- Every selected byte and envelope case has a normative expectation and an explicit compatibility disposition.
- Independent bytes and namespace-aware XML distinguish accepted, valid unsupported and malformed messages.
- Installed clients and gateways exercise SOAP 1.1/1.2 request-response, faults and one-way outcomes.
- Invalid inputs, incompatible artifacts and denied endpoints retain zero-dispatch evidence.
- Invalid upstream data cannot become successful JSON or an acknowledgement.
- Original-byte pins, exact scalars, mapping fidelity, limits, cancellation and cleanup retain regression coverage.
- Linux/Windows Node 24/26 evidence covers selected decoder availability and exact mappings.
- Consumer documentation and the paired capability register describe the implemented scope.

Assign one verification owner, inspect script coverage and reuse unchanged evidence. Run affected guarded checks during development, then required standalone conformance and full CI sequentially, including pipeline smoke and installed qualification through their existing gates. Require fresh independent review before delivery; a later release uses one final uncommitted release preflight instead of duplicating its included gates.

### Remaining coverage owners

| Remaining work | Current owner |
|---|---|
| Richer policy, type-part/encoded headers and incoming cryptographic security | Delivered bounded #424; remaining [#429](https://github.com/TechSpokes/typescript-wsdl-client/issues/429)/#190/#191 |
| Wider source semantics and charset policy beyond supported metadata/bootstrap | Delivered bounded #426; remaining [#179](https://github.com/TechSpokes/typescript-wsdl-client/issues/179)/#462 |
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

### Legacy retirement criteria

Use [#204](https://github.com/TechSpokes/typescript-wsdl-client/issues/204) for compatibility, [#205](https://github.com/TechSpokes/typescript-wsdl-client/issues/205) for semantic retirement and [#207](https://github.com/TechSpokes/typescript-wsdl-client/issues/207) for cross-layer evidence. Retirement requires all the following outcomes; preserving legacy bugs is not a parity requirement, but corrections need explicit migration consequences.

- Every existing supported capability has a checked replacement or an explicit maintainer-approved retirement decision.
- Streaming, composition, security and required CLI/API workflows have installed replacement or retirement evidence.
- One shared core owns schema, occurrence, choice, scalar, projection and XML rules across backends and transports.
- Legacy compatibility adapters preserve approved shapes without a second permanent semantic compiler.
- Insufficient old catalogs require source regeneration; mixed or stale artifacts fail before execution.
- Installed migrations verify types, validation, SOAP exchanges, HTTP values and scaffold ownership.
- Invalid responses, serializer fallback, stream finalization and concurrent cancellation preserve promised behavior.
- Platform, adversarial, determinism and documentation evidence covers the actual retirement candidate.
- Deprecation guidance identifies affected consumers, corrective changes, rollback and the removal boundary.

Internal semantic retirement, public deprecation and a default switch are separate milestones. Legacy remains supported and the 1.x default during this work; existing generated direct clients retain published compatibility. The separately approved 2.0.0 activation and S17/S18 gates remain required before changing public defaults or shapes.

### Activation evidence

A future default or public-shape activation requires its existing separately approved major-release decision, migration guidance and compatibility evidence. Define the intended supported profile and platform/security requirements explicitly before announcing readiness.

Use representative corpus exchanges alongside independent native checks, installed consumers, invalid-response tests and migration coverage. Do not equate a finite corpus with universal standards conformance or retire unresolved research by renaming its status.

## Available in the development tree

Checked generation supports explicit nil with attributes, native facets and primitive-string unions, keyed mixed/namespaced/open values, and opt-in application groups with configured names in their documented domains. The [checked gateway guide](docs/checked-gateway.md) and [mapping contract](docs/mapping-contract.md) describe their actual public representation and limits.

The development tree builds on tagged 1.7.0 and includes the reviewed atomic-union and union-list implementations. [Release notes](docs/releases/README.md) describe each version's scope, and [npm registry metadata](https://registry.npmjs.org/@techspokes%2Ftypescript-wsdl-client) establishes package availability.

Provider evidence remains narrower than implementation coverage. All 12 NOAA operations have owned-server qualification, while the retained live retest has ten successes and two non-SOAP GML failures; Escapia evidence covers selected Test reads. These limitations remain explicit in the [NOAA qualification](docs/noaa-ndfd-qualification.md) and [composition status](docs/roadmap/multi-service-gateway.md), without closing the broader coverage work.

## Research and historical coordination

The [research program](research/README.md) remains available in this repository, with separate commands and optional automation. Universal derivability, whole-forest erasure and finite-catalogue completeness remain unresolved; product separation changes neither those proof states nor accepted semantic guarantees.

The [content-model epic](https://github.com/TechSpokes/typescript-wsdl-client/issues/147) retains historical ownership and full-profile requirements. The [completed 1.0 plan](docs/roadmap/README.md), [changelog](CHANGELOG.md) and research investigation records preserve the previous execution history without making its chronological session order a blanket product prerequisite.
