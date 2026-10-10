# S06 Research Contracts and Handoff

Joint research evidence for #232 and its four leaves, with explicit decision and production gates. See the root [README](../README.md).

## Disposition and delivery boundary

This delivery records executable research and the maintainer's selected AU01, PW01 and DT01 contracts.
Each selected leaf requires complete independent semantic review and exact delivery gates; its issue handoff records final acceptance.
AU01/#233, PW01/#235 and DT01/#236 have completed their local acceptance and are closed; their selected contracts remain the continuation predicates.
RE01's full-type completeness proof, #232's joint gate and the production assessment draft #179/#231 remain open, so S06/#153 and S07/S08 readiness remain blocked.

The approved [ADR-003](decisions/003-content-model-contracts.md), [decision register](content-model-decisions.md), catalog format 2 and `xsd10-faithful-v1` remain unchanged.
Original-source regeneration for flattened catalogs, structural companions and the legacy public default retain their existing contracts.
#180 owns production matching, #181 owns independent model enumeration, and #184 owns payload scalar enforcement.

## Checkpoints and source authority

The research branch starts from accepted main `5876065b00d4eeb6d2324eaa63ff9b70e2279198`, tree `b647d9b0343d421426a539fc008c3cffa82c7875`.
The TypeScript continuation starts from [PR #254](https://github.com/TechSpokes/typescript-wsdl-client/pull/254), commit `ddd90663aa88670edcca4371f7a142d94a5d36da`, tree `f00f442b4306285c20e0f6524ae50c652e0e50b6`.
That migration candidate is unmerged at this checkpoint; #239's normal review, protected merge and closure remain separate from permission to continue isolated research.
Its [NT-CONT-01 handoff](https://github.com/TechSpokes/typescript-wsdl-client/issues/239#issuecomment-6099806801) distinguishes one live Node primary, selected independent contract checks, pinned historical secondary observations and explicitly unqualified capabilities.
The continuation preserves those evidence limits and introduces no Python execution or dependency.
[The exact #178 handoff](https://github.com/TechSpokes/typescript-wsdl-client/issues/178#issuecomment-6086062948) defines the single occurrence-analysis input.
The unaccepted #231 draft is inspected separately at `460f5b8379c68ffef79917284e445b5ab046429e`, tree `56830b28d1006b019918a364aa62f1ed9d7d8817`.

[Its tested blocked handoff](https://github.com/TechSpokes/typescript-wsdl-client/issues/179#issuecomment-6088537340) and [independent review](https://github.com/TechSpokes/typescript-wsdl-client/pull/231#issuecomment-6088474178) are historical inputs.
No assessment module is imported from that draft into the research runtime.
Copied fixtures identify that exact source revision; historical expected outcomes are not silently rewritten.

The complete October 28, 2004 [structures source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/structures.xml) has SHA-256 `e496af408b14853e6169ac7c1fca09d55a81bd73771758ad6be020960e1317ba`.
The corresponding [datatypes source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/datatypes.xml) has SHA-256 `430f010df8ed077a4ed11d9d5812ea5e5d62ba67e715f1bbeeaa8ee1765d84c7`.
Both were retrieved and their bytes independently checked in this session.

The official [second-edition errata](https://www.w3.org/2004/03/xmlschema-errata) contain the E1-56 PSVI correction and no Part 2 correction.
[WG 2232](https://www.w3.org/Bugs/Public/show_bug.cgi?id=2232) proposes the wildcard member-bound adjustment without adopting it as XSD 1.0 errata.
[WG 3256](https://www.w3.org/Bugs/Public/show_bug.cgi?id=3256) concerns the incompatible XSD 1.1 negative-year interpretation.

## Four-rule contract map

| Contract | Research record | Input and downstream owner | Acceptance status |
|---|---|---|---|
| AU01 C1 v1 | [Attribute uses](content-model-s06-au-01.md) | Original AU/declaration identities and typed constraints; #179/#184 | Locally accepted; #233 closed |
| RE01 candidate v1 | [Reordered derivation](content-model-s06-re-01.md) | Original derivation operands plus reviewed AU/PW/scalar predicates; #179 | Complete procedure/proof gate open |
| PW01 R-240 v1 | [Wildcard cardinality](content-model-s06-pw-01.md) | Original member/group ranges, wildcard namespace/process context; #179/RE01 | Locally accepted; #235 closed |
| DT01 A v1 | [Calendar semantics](content-model-s06-dt-01.md) | Original lexical/type context, exact years/fractions; #179/#184 | Locally accepted; #236 closed |

DT01 feeds AU01 only where compared operands use calendar semantics.
AU01 and PW01 feed RE01; DT01 feeds RE01 only where an actual proof invokes scalar predicates.
Selected interfaces count as accepted predicates only after their independent local review and delivery gates pass.

A leaf's own contract, evidence, independent review and protected delivery govern its acceptance.
No leaf waits for sibling or parent closure, and the epic separately assesses joint consistency.
The selected interpretations below are project decisions; successful probes alone do not establish their complete contracts.
The missing RE01 proof prevents joint acceptance even after sibling local acceptance.

## Selected interpretations and remaining proof

### AU01: Multiple uses and conflicting augmentation

The [selected C1 interpretation](https://github.com/TechSpokes/typescript-wsdl-client/issues/233#issuecomment-6095916709) retains the AU set, combines requiredness with logical OR and checks every present fixed constraint.
An absent optional attribute remains absent when unconstrained, receives one equivalent candidate value when augmentation is unambiguous, and fails that instance when candidates conflict.
Conflicting fixed values can produce an empty accepted-instance set without inventing schema invalidity.

C1's absent-instance rejection is an explicit project interpretation, not existing primary text established by this investigation.
The maintainer [also selected universal matching for source replacement](https://github.com/TechSpokes/typescript-wsdl-client/issues/233#issuecomment-6095977338): each replacement satisfies every matching original base AU, while omitted uses retain unchanged identities and obligations.
The local-most selection alternative can weaken inherited fixed constraints and changes default behavior according to source order.
Blanket duplicate-schema rejection would introduce an additional profile rule; the [complete AU01 table](content-model-s06-au-01.md) records the consequences and the C1 recommendation.

### PW01: Original versus adjusted member bounds

The literal 2004 alternative compares every member with the original wildcard minimum and maximum, then checks the group's original effective total range.
The [selected R-240 proposal](https://github.com/TechSpokes/typescript-wsdl-client/issues/235#issuecomment-6095922074) compares members recursively with `0..original-max` while checking the whole group against the original `min..max`.
The proposal admits optional-member and repeated-group controls rejected by the literal reading, retaining namespace, maximum and processing checks.

The [PW01 investigation](content-model-s06-pw-01.md) explains why neither reference engine's result establishes the interpretation.
R-240 is an explicitly selected project interpretation because the proposal was never adopted as XSD 1.0 errata.

### DT01: A closed calendar across the BCE boundary

[Selected option A](https://github.com/TechSpokes/typescript-wsdl-client/issues/236#issuecomment-6095933213) preserves the lexical negative-year leap calculation and supplies contiguous rollover that skips year zero.
Option B shifts BCE years into astronomical coordinates, changing which negative-year leap dates are valid.
Literal Appendix E option C can calculate forbidden year zero and fails closure; adopting XSD 1.1 changes the approved profile.

The [DT01 contract](content-model-s06-dt-01.md) provides the exact selected arithmetic, truth tables and conflicting original authority.
Option A is a concrete project repair decision and does not become W3C errata merely because its probe passes.
The record also distinguishes value-level addition and field-tuple arithmetic.
Second-60 overflow and recurring-time ordering were separately selected: a modulo-day clock comparison can reverse the written arbitrary-date ordering at an offset wraparound.
Candidate A includes those choices explicitly, with alias consistency and exact known/unknown-zone endpoints in the shared contract.

### RE01: A missing proof cannot be approved into existence

The recommended direction applies the numbered existential component rule, preserving known vacuous and dead/wildcard witnesses.
The [RE01 prototype](content-model-s06-re-01.md) supplies useful checked positive constructions, but lacks a complete full-type negative theorem.
The remaining theorem must cover normalization/all placement, mixed/simple content, source/final/block identity and AU witness synthesis with accepted scalar predicates.
The dated specification's component-identity note leaves some unnamed identities incompletely defined.
The [concrete RE01 equality options](content-model-s06-re-01.md#concrete-equality-options) therefore distinguish literal original IDs, abstract sharing and a source-representable incidence-preserving correspondence; fresh direct AUs cannot silently become inherited original uses.

The new [named-group contrast](content-model-s06-re-01.md#executable-named-group-comparison-contrast) supplies executable evidence for the witness-domain and comparison-closure distinction.
A bounded supplied-certificate checker verifies final AU incidence without claiming complete witness existence or general scalar equivalence.
Fresh Node observations are recorded separately from the selected component predicates; duplicate-use rejections do not decide the C1 or RE contracts.

The [revised recommendation](content-model-s06-re-01.md#witness-domain-and-comparison-decision) separates component representation from hypothetical endpoint resolution.
It recommends abstract construction plans with original AU sharing and a separately checked hypothetical graph overlay, preserving the immutable actual graph and diagnostic provenance.
Requiring XML reconstruction adds source-mapping obligations; freezing actual ancestry in hypothetical queries can exclude the supplied existing-intermediate construction.
The [recursive all-group contrast](content-model-s06-re-01.md#recursive-endpoint-and-existing-intermediate-contrast) demonstrates that concrete difference in an invoked NameAndTypeOK query and adds an original intermediate-identity completeness obligation.
This is a research recommendation, not an adopted production interpretation or a complete theorem; hypothetical roles, comparison closure and context-sensitive component checks remain open.

The particle controls separately expose nontransitive MapAndSum restriction, original singleton-all placement, base final exclusions and ordinary simple-content ancestors.
An empty-facet no-inline simple-content restriction is not proved to create a fresh anonymous scalar, so no source-impossibility claim relies on that assumption.
Keep #234 and #232 open until the complete procedure is justified and substantively reviewed; do not substitute a smaller permanent profile or a search cutoff.

## Joint consistency assessment

Every contract preserves original source-local operands and declaration/use identity.
Expanded QNames retain original namespace and chameleon/import context; lexical aliases are compared only after typed assessment.
Restrictions, extension concatenation, schema-only operands, absent components and effective runtime closure remain distinct.

Formal `schemaEmptiable` and effective total range remain separate from accepted-language nullability and realizability.
Required empty choices and wildcard intermediates cannot be erased from RE01 evidence.
PW01 intervals do not establish count-gap or payload-language inclusion.

All proposals distinguish invalid schema, unsupported capability, unresolved research interpretation and resource exhaustion.
An unresolved research result does not become a new permanent production error category or policy-switch framework.
#179 must retain actionable component/source/related/operation diagnostics at its existing boundary.

## Exactness and budgets

The independently applied semantic defaults remain 100,000 input nodes and 1,000,000 work steps, inclusive.
Exact finite operands retain arbitrary integers, `unbounded` remains distinct, and zero semantics are preserved.
Prototype preflight, indexing, fixed points, operand processing and copies must charge before their allocation or execution.

Configured exhaustion returns explicit `resource-limit` with no successful partial plan.
Exhaustion of an unproved or incomplete candidate family cannot prove existential invalidity, even when it terminates.
Research measurements establish the measured probe boundary only, not #208's later production or platform qualification.

S03/S04 loading and catalog limits and conservative cyclic-depth behavior remain unchanged.
Later matcher, payload lexical/digit, generated-output and streaming budgets retain their D09 first owners.
No prototype imports payload digit limits into schema-only assessment or expands huge occurrence counts into events.

## Required production continuation in #179

After each complete interpretation and proof passes its review gate, #179 must adapt the accepted contract into the existing immutable graph assessment path.
It must not merge #231 merely to obtain fixtures or activate its four guarded paths from prototype results alone.
The complete #179 integration then needs fresh combined review and validation at its actual final revision.

AU01 requires source-faithful set union of AU identities, correct declaration/group uniqueness and all retained use/default/fixed obligations.
Any approved augmentation rule must define absence, requiredness, conflicting constraints, typed value equivalence and deterministic lexical witnesses for #184.
Existing `AssessedAttribute.constraints` and `compatibleUses` need explicit review against that selected rule.

RE01 requires a complete implementable criterion covering approved normalized particles, repeated/composite and legal recursive types, content varieties and derivation flags.
It must prove positive witness soundness, complete negative answers and termination with sufficient resources, then return explicit resource-limit under configured exhaustion.
Its proof must pin accepted AU01/PW01/DT01 predicates actually used and discharge every precondition.

PW01 requires the selected member/whole-group interpretation using original occurrence operands and the single #178 occurrence analysis.
Namespace subset, imported `##other`, process strength and original declaration/use ranges remain independently enforced.
The existing discharged `0..unbounded` subset remains available, without narrowing the intended profile to that subset.

DT01 requires the selected complete calendar coordinate, lexical admission, rollover, normalization, equality and partial ordering shared with #184.
Correct the assessment documentation's BCE sentence: both pinned engines accept `-0004-02-29Z` and reject `-0001-02-29Z` in the date/dateTime controls.
That factual correction does not authorize removing negative-year or crossing-zero guards before the complete contract is accepted and implemented.

## Downstream qualifications and next ready work

The next ready work is completing the RE01 full-type criterion and negative-answer proof using locally accepted selected sibling contracts.
The implementing research owner should specify and test the recommended hypothetical resolver and endpoint comparison closure, then prove every ancestry-sensitive predicate before integrating the conditional AU criterion with particle/content cases.
The focused prerequisite must preserve actual graph identities, distinguish actual and hypothetical recursive queries, retain existing named intermediate identity, isolate caches by context and check hypothetical legality and inclusive budgets.
Its acceptance would not discharge full candidate completeness, original normalization or the negative-answer theorem.
The new incidence checker remains an evidence tool; it is not that integration or an approved negative-answer procedure.
#179 may inspect these research inputs while keeping affected assessment gates open; the full accepted research epic must precede production activation.
#153 remains the combined S06 acceptance owner and S07/S08 retain their existing dependencies.

S01/#181 oracle disagreements, S05 reference disagreements, D07 streaming/incoming-security gates and SOAP/gateway/platform qualifications remain owned and open where previously recorded.
No private production vendor, Windows platform, codec, adapter, payload scalar engine or public activation is qualified by these research probes.
No packages, release tags or releases are published in this delivery.

## Reproduction and acceptance ledger

Run from a clean checkout of the delivered revision with Node 24 or 26 and npm:

```bash
npm ci --cache tmp/cache/npm
npm run reference:setup
npm run check:toolchain
npm run typecheck:research
npm run typecheck:reference
npm run test:research:ports
npm run ci
npm run test:reference:full
npm run test:conformance
npx tsc -p test/conformance/tsconfig.json
npx tsc -p test/research/s06-pw01/tsconfig.json
npx tsc -p test/research/dt01/tsconfig.json
npm run research:re01:measure
npx tsx test/research/dt01/measure.ts
git diff --check
```

The [research manifest](../test/conformance/s06-research-manifest.json) identifies committed leaf records, prototypes, reference discovery files and fixture digests.
The [provenance audit](../test/conformance/s06-research.test.ts) verifies those hashes and discovery paths without adding product capability claims.
The linked delivery PR and issue handoff record exact reviewed/head/merged revisions and trees, actual commands/counts/versions, independent findings and hosted checks.
This external ledger avoids self-referential commit hashes and must be verified before treating any delivery revision as accepted.

IDE inspection tools are unavailable; repository documentation/support-matrix, TypeScript, executable reference/prototype, CI and installed-consumer checks provide portable verification.
Unrun or unpassed checks must be named in that ledger, including full semantic acceptance and all later production gates.
