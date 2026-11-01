# WSDL-first generation and guided reconciliation assessment

## Conclusion

The requested approach is feasible and aligned with the existing product roadmap. Current tooling supplies several necessary components, but does not yet deliver the complete WSDL-first, diagnose, propose, reconcile and regenerate experience. A normal supported contract should generate its client and default data types without examples or hand-authored descriptions of its schema. Additional configuration should express missing information, ambiguity or a deliberate application view.

This analysis inspected the checkout and live issue descriptions on November 1, 2026, at base `6ece8713d0ddfc1af648cb861206222328802737`. The expanded Escapia implementation was an uncommitted local candidate at analysis time and is preserved with this report on the development branch. Its installed proof does not establish published availability, universal WSDL coverage or completion of the broader roadmap. The analysis itself changes no implementation, roadmap priorities, issues or release policy; the [development checkpoint](content-model-development-checkpoint.md) records the branch handoff.

## Current support and gaps

| Capability | Current evidence | Gap for the requested workflow |
| --- | --- | --- |
| WSDL to generated artifacts | Existing `pipeline`, CLI/API and installed consumer proofs | Checked generation still requires explicit selection/configuration |
| Dependency loading | Native imports/includes, provenance and explicit source permissions | Guided missing-dependency resolution and minimal proposed configuration |
| Schema and capability diagnosis | `assess`, native obligations and capability registry | One coherent report covering the selected generation model and downstream stages |
| Structured types and serialization | Existing native mapping/codec and generators | Supported coverage is bounded; unsupported valid schemas remain engine gaps |
| JSON configuration | Checked, streaming, security, operation and tag configuration files | Discovery, editable suggestions and a small consistent user-facing resolution model |
| Opaque payload interpretation | Legacy companion catalogs and local checked companion projections | WSDL-first opaque representation and guided optional typed specialization |
| Generated tests | Mock/scaffold generation and independent repository wire fixtures | Broader native-plan-derived fixtures and unresolved-oracle guidance |
| Compatibility | Source pinning and scoped contract/artifact comparisons | Broad standalone migration and consumer acceptance remain open |

The legacy CLI defaults `client-fail-on-unresolved` to false; unresolved type references can become `any`. This is observable compatibility behavior, not the strict reporting experience requested here. The new workflow should expose such degradation and enforce its advertised mode without silently changing existing 1.x defaults.

The current public assessment uses `whole-actual-native-direct-v1` and the direct qualifier. The local component pipeline accepts a broader qualified fragment. Running the existing assessment as a universal front door would therefore produce misleadingly narrow readiness results. Inspection must consume the same selected-model owners as generation and explicitly identify its scope.

Current checked generation collects selection refusals for requested operations, but can still terminate later on a single projection/artifact refusal. It does not produce a complete causal report with source locations, affected operations, unresolved questions and proposed corrective configuration for every relevant stage.

## Required distinction between source facts and application choices

WSDL/XSD declarations should determine operations, messages, named and anonymous types, inheritance, attributes, ordering, occurrences, namespaces and declared faults. The generator should derive default TypeScript representations and wire mappings from those declarations. Requiring users to describe these structures again in JSON would duplicate the compiler's responsibility.

PHP-style class mapping selects an application representation for an already identified wire type. A TypeScript equivalent can support naming or application adapters, while generated data types remain the default. A class name alone cannot define missing XML structure or establish a serializer's correctness.

A wildcard or opaque type does not itself specify a concrete business-record class. A generic XML-preserving representation is a possible contract-level output for supported opaque content, without requiring examples to generate a client. Checked generation must still satisfy the validation guarantees it advertises; this is not permission to relax a strict wildcard or hide an unsupported schema feature.

Choosing a more specific companion-service payload model is a separate, optional association unless source declarations establish it. Supplied companion WSDLs/XSDs can be indexed and checked automatically. Names and matching samples can nominate candidates; they cannot silently establish an absent contract relationship. Samples should be optional evidence or test oracles, not a prerequisite for ordinary generation.

For Escapia, the current checked Content implementation requires a companion view to get its structured payload representation. That is a bounded engine limitation and explicit view choice. It should not be presented as proof that WSDL-first generic client generation inherently requires manually authored record mappings.

## Reconciliation should classify the obstacle first

| Finding | Tool action | Human input, if needed |
| --- | --- | --- |
| Missing imported schema | Show unresolved namespace/reference and affected operations | Authorized local schema or source catalog entry |
| Multiple service/binding choices | Enumerate concrete supported candidates and explain defaults | Selection when the intended target is ambiguous |
| Valid but unsupported construct | Name capability, location, stage and existing owner | Usually an engine enhancement, not a replacement schema authored by the user |
| Demonstrably invalid source | Explain violated rule and source location | Corrected source or an explicit, reviewed amendment |
| Inconclusive checking | Preserve known facts and explain the unresolved checking duty | Additional evidence only when it can resolve that duty |
| Interrupted or resource-limited work | Report execution outcome and unfinished inventory | Caller capacity choice; never label the source invalid |
| Opaque content with known wrapper | Derive the wrapper and describe the opaque boundary | Optional concrete model association or application view |
| Multiple compatible payload models | Present candidates and their evidence/conflicts | Select the intended association |
| Missing credentials or endpoint permission | Generate without dispatching and identify required runtime controls | Explicit runtime configuration |
| Provider response contradicts its contract | Diagnose the exact mismatch | Provider clarification or a deliberate compatibility policy |

A report should identify the source locator, qualified declaration, service/binding/operation impact, blocking stage, capability or rule, established versus unresolved evidence, and a concrete resolution action. One shared dependency failure should explain all affected operations rather than requiring repeated manual investigation.

Per-operation inventory must preserve whole-source prerequisites. A shared native legality failure cannot be bypassed merely because a selected operation does not appear to reference the failing component. Partial generation must be explicit and may proceed only where the native policy permits it.

## Configuration should be a small resolution layer

Reuse the established JSON-file convention and CLI/API family. Prefer generated configuration drafts with only unresolved fields left for the user. Keep resolved compiler metadata separate from the concise editable configuration.

Source resolution, type presentation, payload association, source amendment and runtime security are different concerns. They may share a project configuration entry point or reference existing files, but must not become interchangeable overrides. In particular, a naming map must not alter XML validity, and a payload view must not masquerade as a repaired vendor schema.

Current `recordProjections` exposes derivable details. Its payload QName is checked against the companion output declaration; wrapper obligations and exclusions are mechanically checked from the native contracts. Those details can be generated after selecting the relationship and validation mode. The user should review the resulting guarantees rather than manually assembling internal exclusion records.

For buffered Content decoding, `recordPath` establishes and counts repeated records; the decoder validates and returns the entire companion payload. A future user-facing model should separate whole-payload interpretation from optional record selection for counting or streaming.

An explicit source amendment, if introduced, needs a source/declaration precondition, bounded changes, original/effective provenance and fresh native qualification. Stale amendments must refuse. Original files should remain intact, and the report must state the effective contract used. The present investigation does not propose an executable transformation language or implement arbitrary schema repair.

No suggested JSON key or new CLI flag is finalized by this report. Current entry points include `--checked-config`, `--stream-config`, `--openapi-security-config-file`, `--openapi-ops-file` and `--openapi-tags-file`; their supported models and semantics differ and must remain explicit during migration.

## Tests and automation boundaries

The generator can derive structurally valid synthetic inputs, branch/occurrence cases and useful negative tests from supported native plans. Custom representations or amendments should produce proposed regression cases for the affected contract and serialization boundary.

WSDL does not specify production credentials or expected business results. Generated mock tests, round trips through the same codec and proposed wire fixtures must be labeled accordingly. Independent expected XML/JSON and optional provider acceptance remain separate proof. An unavailable oracle should remain an explicit unresolved test item, rather than becoming a successful generated test.

## Roadmap alignment

| Existing roadmap owner | Relationship to this workflow |
| --- | --- |
| [Product #401](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) | Installed WSDL-to-working-gateway outcome and complete operation inventory |
| [Real-service qualification #397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) | Rank capabilities by useful operations and unrelated real contracts unlocked |
| [Source/mapping owners #179-#184](https://github.com/TechSpokes/typescript-wsdl-client/issues/179) | Native diagnosis, schema legality, representations and scalar behavior |
| [Contracts #185](https://github.com/TechSpokes/typescript-wsdl-client/issues/185) and [compatibility #186](https://github.com/TechSpokes/typescript-wsdl-client/issues/186) | Persist selected representations and refuse stale/mixed artifacts |
| [CLI/API #201](https://github.com/TechSpokes/typescript-wsdl-client/issues/201) | Shared options, actionable diagnostics and command/API parity |
| [Scaffolds/tests #202](https://github.com/TechSpokes/typescript-wsdl-client/issues/202) and [installed consumers #203](https://github.com/TechSpokes/typescript-wsdl-client/issues/203) | Contract-driven examples, generated tests and actual package verification |
| Migration/readiness #204-#208 | Integrated compatibility, evidence, documentation and release readiness |

The [post-1.0 inspector plan](roadmap/v1.0-capability-conformance-framework.md#post-10-wsdl-inspector) already calls for detected capability IDs, JSON output, human limitations/workarounds and links to conformance evidence. It explicitly starts with an API/internal CLI before freezing public command semantics. Automated repair/configuration authoring is an extension to that experience, not already delivered inspector functionality.

The [current roadmap](../ROADMAP.md) keeps published 1.1.5, unreleased direct preview and broader architecture delivery distinct. Live #401/#397 descriptions likewise retain broader acceptance as open. The local Escapia candidate adds scoped positive real-contract replay evidence; it does not close the full profile, research, standalone migration, streaming, security or release gates. The historical 1.0 plan is complete and is not the current implementation schedule.

ADR-003 P1-D01 permits useful scoped product delivery without completing universal research. Its diagnostic reports remain data rather than generation authority. S02 compatibility preserves 1.x legacy defaults; general default activation belongs to the 2.0/S17/S18 decision. An inspector or reconciliation layer must reuse the semantic owners and generators, not introduce a parallel compiler or silently activate a new default.

## Recommended bounded next delivery

Connect inspection and generation through one programmatic planning result for the selected model. Begin with missing dependencies, service/binding selection and exact supported/unsupported operation inventory. Produce human and JSON diagnostics and minimal editable configuration drafts. Keep it within #401/#201 and the existing inspector direction.

Then add optional payload-model candidate discovery from explicitly supplied source sets. Leave standard WSDL-derived structures automatic. Introduce source amendments or richer application adapters only for demonstrated unresolved cases and through the existing contracts/compatibility owners.

Measure generation duration, time to first actionable failure and required human-authored fields on the same corpus. The preceding long session was engine implementation and verification effort, not an acceptable ordinary integration procedure. No new latency benchmark or numerical service-level target is claimed here.

Acceptance for this next delivery should include a supported WSDL generating without semantic JSON, one missing import yielding one focused resolution request, unrelated invalid/unsupported/inconclusive cases remaining distinct, and a corrected configuration resuming deterministically. Multiple bindings, stale amendments, ambiguous companion models and missing test oracles need explicit negative cases. Installed CLI and root API must agree, and no production SOAP request should be initiated by inspection or generation.

## Sources checked

Inspection covered `src/cli.ts`, `src/config.ts`, `src/checkedPipeline.ts`, `src/compiler/checkedAssessment.ts`, `src/compiler/schemaCompiler.ts`, `src/compiler/componentRecordProjection.ts`, `src/compiler/shapeResolver.ts`, `src/util/streamConfig.ts` and `src/test/generateCheckedTests.ts`. Architecture sources were ADR-002, ADR-003, the decision register, configuration documentation, current ROADMAP and historical inspector/conformance plans. Live GitHub issue descriptions for #179, #185, #186, #201, #202, #203, #379, #397 and #401 were read without mutation.

The original analysis was read-only apart from its report. This durable copy is included in the user's requested development-branch checkpoint; no implementation or backlog changes were made to perform the analysis.
