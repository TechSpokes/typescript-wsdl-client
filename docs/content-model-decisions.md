# Content Model Decision Register

Stable S02 decision IDs, evidence and downstream ownership. See the root [README](../README.md).

## Ownership and dispositions

The lead S02 implementation agent owns decision drafting/integration; independent review agents review semantic and integration domains. Maintainer approval is represented by the reviewed normal PR merge. Implementation ownership below means the named issue's assignee when taken up, not volunteering a contributor. The [ADR](decisions/003-content-model-contracts.md) owns the selected contracts.

`Resolved` means a selected contract with evidence sufficient for its decision boundary; it does not claim later production code is implemented. `Open/blocking` identifies a decision that must be settled before its listed consumer. The initial draft passed independent semantic and integration review at `2f88ec81f77f4fc5a06b78f2d507ae8e20fe7a7c`; executed SOAP and gateway evidence now reconcile the selected contracts. Final delivery remains subject to the independent joint gate and required checks.

## Register

| ID / disposition | Selected contract and artifact | Supporting evidence | Decision owner / implementation owner | Consumers / resolution gate |
|---|---|---|---|---|
| S02-D01 Resolved | Ordered input, immutable graph, contextual URI identity; ADR input section | S01 order/count fixtures; XSD structures/namespaces | S02 lead / #171-#180 | S03-S07; independent reviewed draft and final joint gate |
| S02-D02 Resolved | XML-value versus graph; reversible/normalized/lossy projections; ADR value section | S01 `sequence-order`, `empty-alternative`; epic CM-04/05/08 | S02 lead / #182/#183/#187 | S08/S10/S13; reviewed draft and final joint gate |
| S02-D03 Resolved | Non-mutating idempotent normalization and three laws; ADR equivalence examples | S01 invisible groups; XSD datatype normalization | S02 lead / #182/#184/#188/#189 | S08/S10/#198; reviewed draft and final joint gate |
| S02-D04 Resolved | XSD 1.0 profile and scalar/particle matrix; ADR profile section | S01 independent manifest; W3C XSD 1.0 | S02 lead / #179/#180/#184 | #187-#189/#198-#200; independent fixture gates |
| S02-D05 Resolved | Separate client/HTTP projections; portable formats and fingerprint; ADR bundle section | Flattened-catalog information loss; epic CM-11/17 | S02 lead / #183/#185/#186 | #195/#196/#201; reviewed draft and final joint gate |
| S02-D06 Resolved | OAS 3.1.1; separate draft-07 lowerings, validated fallback and shared checks; ADR dialect section | Independently reviewed #170 corpus and gateway evidence | S02 lead / #197/#198/#199/#200 | First consumers implement selected lowerings and independent validation |
| S02-D06-OpenAPI Resolved | OAS 3.1.1 documentation, separate lowerings; ADR dialect section | Gateway evidence: current emitter is OAS 3.1.0; primary OAS 3.1.1 | S02 lead / #197 | #198/#199/#200; selected dialect/completeness must be emitted |
| S02-D06-runtime Resolved | Strict non-mutating route-local draft-07 Ajv; gateway runtime section | Gateway 19-case corpus: mutation control, recursion, facets, keyword rejection | S02 lead / #198/#199 | #199/#200; missing supplemental plans fail closed |
| S02-D06-serializer Resolved | Separate draft-07 serializer plan, independent validation; gateway serializer section | Gateway byte preservation and facet counterexamples | S02 lead / #197/#200 | #200; serializer cannot certify response validity |
| S02-D06-fallback Resolved | Explicit validated JSON fallback; gateway complexity section | Imported current emitter at 149/150 refs; invalid response rejected by proposed boundary | S02 lead / #200 | #198/#200; retain validation schema when serializer schema is omitted |
| S02-D06-supplemental Resolved | Inject one #180/#184 owner at validation boundaries; ADR scalar/dialect sections | Gateway exact int64/fractionDigits callback; annotation-only failure | S02 lead / #180/#184/#198 | #199/#200; no complete plan without shared checks |
| S02-D06-closure Resolved | Graph-derived complete closure; no generic allOf merge; gateway composition section | Original closed composition rejects value accepted after current flattening | S02 lead / #197 | #198/#199/#200; each lowering must prove equivalence or diagnose |
| S02-D07 Resolved | Buffered raw body/event and retained dedicated stream; minimum matrix and verification-before-yield; ADR transport section | Executed #169 HTTP/TLS/signing and raw/fault/cancel seams | S02 lead / #190/#192/#193 | #190/#192/#193 gate all unqualified capabilities before dispatch |
| S02-D07-stream-qualification Open/consumer-blocking | Reject unqualified stream auth/TLS/version combinations; ADR transport and SOAP matrix | Executed current omissions; no qualified stream security claim | S02 lead / #192/#194 | #192/#194 resolve qualification; blocks affected #196/#200 dispatch, not S03's fixed graph/raw/capability contracts |
| S02-D07-incoming-verification Open/consumer-blocking | Verify before decoding/yield or reject; ADR security/completion sections | Outgoing signatures verified; incoming/combined security unverified | S02 lead / #190/#192/#193/#194 | Named owners resolve incoming qualification; blocks authenticated yielding, not S03's proven raw access and fixed ordering contract |
| S02-D08 Resolved | Consumption-driven success certifies declared response scope; ADR completion section | ADR-002 truncation policy; epic CM-13 | S02 lead / #185/#193/#194 | #196/#200/#202; reviewed draft and final joint gate |
| S02-D09 Resolved | Numeric provisional budgets and errors; ADR budget table | Epic CM-16 boundedness requirement | S02 lead / #171/#172/#179/#180/#184/#193 | All first consumers; #208 refines measured limits |
| S02-D10 Resolved | Legacy support, source regeneration, mixed rejection; 1.x default preserved; ADR compatibility section | S01 lost structure; current release v1.1.4 | S02 lead / #174/#185/#186/#195/#196/#201 | #204 qualification/#205 retirement; 2.0.0 release/default gate |
| S02-D11 Resolved | Reject bounds-only, flattening, parse DTOs, one dialect and security bypass; ADR alternatives section | S01 counterexamples; ADR-002 | S02 lead / all semantic and adapter owners | Architecture PRs; reviewed draft and final joint gate |

## Findings traceability

S04's [immutable graph](content-model-graph.md) and [format 2 catalog boundary](content-model-catalog.md) implement the early D01/D04/D09/D10 consumers without changing the approved decisions or activating faithful generation.
The #151 final handoff records independently reviewed revisions, validation results and the unchanged downstream qualification gates.

| Finding | Decision and disposition | Implementation owner / evidence |
|---|---|---|
| CM-01/02/03 | D01/D02/D04 implement exact particles/projections | #178/#179/#180/#182/#198; S01 manifest |
| CM-04/05 | D02/D03/D07 implement ordered values, normalize invisible history | #171 [ordered input](content-model-loading.md); later #182/#188/#189/#190/#192; SOAP probe |
| CM-06/07 | D01/D04 implement namespace identity, references and derivation | #171/#172 [loading evidence](content-model-loading.md); #173 [graph contract](content-model-graph.md); later #175/#176/#179/#184 |
| CM-08 | D02/D04 retain absence/empty/nil/attributes | #182/#183/#184/#187/#189; committed SOAP/gateway probes |
| CM-09/10 | D06 non-mutating validation and independent serialization | #197/#198/#199/#200; committed gateway probe |
| CM-11/17 | D05/D10 version/fingerprint routing; explicit activation | #174/#185/#186/#195/#196/#201/#204 |
| CM-12 | D07 tested binding/security adapters, reject unverified combinations | #190/#192; committed SOAP probe |
| CM-13/14 | D08 completion scope, isolated decoding and bounded lifecycle | #185/#187/#193/#194/#200 |
| CM-15 | Independent evidence; preserve known oracle disagreement | #181/#207; S01 manifest, not altered by S02 |
| CM-16 | D09 measurable first-owner limits | #171/#172 [measured loading limits](content-model-loading.md#loading-budgets); later #179/#180/#184/#193/#208 |

## Probe and acceptance checkpoints

S05's [derivation evidence](content-model-composition.md) adds concrete #179 qualification inputs without changing the approved profile.
Duplicate extension uses, fixed-value equivalence, group/local wildcard processing and imported wildcard expressibility require independent reconciliation before affected plans are assessed.
S05 preserves these as typed obligations with original operands; this is not a new scalar checker or a declaration of verified arbitrary derivation support.

S06's [accepted exact analysis](content-model-analysis.md) is delivered through #178/PR #230.
The [schema-assessment draft and independent evidence](content-model-assessment.md) now investigate S05's original operands and additional primary-rule counterexamples.
S06-AU-01 remains a foundational qualification for differing uses/constraints of the same global attribute declaration; #179 owns its resolution before affected models and the combined #153 gate can pass.
S06-RE-01 records the normative/explanatory restriction conflict and incomplete bounded cos-ct-extends1.5 witness implementation; S06-PW-01 records unresolved WG R-240 cardinality; S06-DT-01 records negative-year calendar ambiguity.
All four qualifications retain evidence, owners and affected gates in the assessment contract; none narrows the approved profile or marks S07/S08 Ready.
Literal XSD 1.0 nested-union flattening is distinguished from the WG's XSD 1.1 correction, with original source member/facet relationships retained and independent payload contrast evidence.

The [S02 handoff](content-model-s02-handoff.md) and #149 acceptance record pin reviewed draft/probe revisions and final delivery review/checks/merge. The SOAP source probe at `4d1d3972fbb0f8170232a3bd143f0fcf0adc842d` passed independent integration review; the gateway source probe at `d826ff506a80437bca1b747f40b772727643a506` passed independent semantic/gateway review.

No foundational graph, projection, bundle/runtime, base transport or compatibility question remains open. The two open qualification entries block their affected transport/security consumers; their rejection and verification-order contracts are already resolved, so they do not change S03's input contract. Future shared scalar/particle, completion and compatibility implementations remain mandatory first-consumer gates, not already implemented features. S03 starts only after S02's joint gate closes.
