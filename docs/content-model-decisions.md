# Content Model Decision Register

Stable S02 decision IDs, evidence and downstream ownership. See the root [README](../README.md).

## Ownership and dispositions

The lead S02 implementation agent owns decision drafting/integration; independent review agents review semantic and integration domains. Maintainer approval is represented by the reviewed normal PR merge. Implementation ownership below means the named issue's assignee when taken up, not volunteering a contributor. The [ADR](decisions/003-content-model-contracts.md) owns the selected contracts.

`Resolved` means a selected contract with evidence sufficient for its decision boundary; it does not claim later production code is implemented. `Open/blocking` identifies a decision that must be settled before its listed consumer. Final foundational decisions must be resolved before S03; this initial register is a draft.

## Register

| ID / disposition | Selected contract and artifact | Supporting evidence | Decision owner / implementation owner | Consumers / resolution gate |
|---|---|---|---|---|
| S02-D01 Draft | Ordered input, immutable graph, contextual URI identity; ADR input section | S01 order/count fixtures; XSD structures/namespaces | S02 lead / #171-#180 | S03-S07; independent draft review |
| S02-D02 Draft | XML-value versus graph; reversible/normalized/lossy projections; ADR value section | S01 `sequence-order`, `empty-alternative`; epic CM-04/05/08 | S02 lead / #182/#183/#187 | S08/S10/S13; draft review |
| S02-D03 Draft | Non-mutating idempotent normalization and three laws; ADR equivalence examples | S01 invisible groups; XSD datatype normalization | S02 lead / #182/#184/#188/#189 | S08/S10/#198; draft review |
| S02-D04 Draft | XSD 1.0 profile with scalar/particle enforcement matrix | S01 independent manifest; W3C XSD 1.0 | S02 lead / #179/#180/#184 | #187-#189/#198-#200; independent fixture gates |
| S02-D05 Draft | Separate client/HTTP projections; portable formats and fingerprint; ADR bundle section | Flattened-catalog information loss; epic CM-11/17 | S02 lead / #183/#185/#186 | #195/#196/#201; draft review |
| S02-D06 Open/blocking | Candidate OAS 3.1.1; runtime and serializer draft-07 lowerings; shared supplemental validation | #170 execution pending | S02 lead / #197/#198/#199/#200 | #170 resolves dialect/fallback before S02 closes |
| S02-D07 Open/blocking | Candidate buffered raw seam plus retained dedicated stream adapter; one content encoder | ADR-002 prior buffering evidence; #169 pending | S02 lead / #190/#192 | #169 establishes base feasibility before S02 closes |
| S02-D08 Draft | Consumption-driven success certifies declared response scope; ADR completion section | ADR-002 truncation policy; epic CM-13 | S02 lead / #185/#193/#194 | #196/#200/#202; draft review |
| S02-D09 Draft | Numeric provisional budgets and errors; ADR budget table | Epic CM-16 boundedness requirement | S02 lead / #171/#172/#179/#180/#184/#193 | All first consumers; #208 refines measured limits |
| S02-D10 Draft | Legacy support, source regeneration, mixed rejection; 1.x default preserved; major default activation | S01 lost structure; current release v1.1.4 | S02 lead / #174/#185/#186/#195/#196/#201 | #204 qualification/#205 retirement; draft review |
| S02-D11 Draft | Reject bounds-only, flattening, parse DTOs, one dialect and security bypass | S01 counterexamples; ADR-002 | S02 lead / all semantic and adapter owners | Architecture PRs; draft review |

## Findings traceability

| Finding | Decision and disposition | Implementation owner / evidence |
|---|---|---|
| CM-01/02/03 | D01/D02/D04 implement exact particles/projections | #178/#179/#180/#182/#198; S01 manifest |
| CM-04/05 | D02/D03/D07 implement ordered values, normalize invisible history | #171/#182/#188/#189/#190/#192; #169 pending |
| CM-06/07 | D01/D04 implement namespace identity, references and derivation | #171/#172/#175/#176/#179/#184; independent fixture gates |
| CM-08 | D02/D04 retain absence/empty/nil/attributes | #182/#183/#184/#187/#189; #169/#170 pending |
| CM-09/10 | D06 non-mutating validation and independent serialization | #197/#198/#199/#200; #170 pending |
| CM-11/17 | D05/D10 version/fingerprint routing; explicit activation | #174/#185/#186/#195/#196/#201/#204 |
| CM-12 | D07 tested binding/security adapters, reject unverified combinations | #190/#192; #169 pending |
| CM-13/14 | D08 completion scope, isolated decoding and bounded lifecycle | #185/#187/#193/#194/#200 |
| CM-15 | Independent evidence; preserve known oracle disagreement | #181/#207; S01 manifest, not altered by S02 |
| CM-16 | D09 measurable first-owner limits | #171/#172/#179/#180/#184/#193/#208 |

## Probe and acceptance checkpoints

Record reviewed draft commit, independent reviews, final probe revisions and final delivery PR/merge in the S02 evidence/handoff document once those checkpoints exist. Do not convert pending execution into a verified-support claim. No S03 work starts from this draft alone.
