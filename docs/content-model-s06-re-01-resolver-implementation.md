# S06 RE01 Research Resolver Implementation

Research implementation scope, verification and the future production seam. See the root [README](../README.md).

## Implementation contract

The [reviewed resolver specification](content-model-s06-re-01-resolver.md) defines R1–R7 and behavioral cases B01–B23.
Its selected domain is one supplied abstract two-step construction over immutable actual component records.
The research modules do not construct or search the complete RE01 witness family.

All executable resolver material lives under `test/research/re01/` and consumes independently prepared records.
It imports no production assessment module or unaccepted #231 implementation.
The [RE01 proof record](content-model-s06-re-01.md) and [joint research handoff](content-model-s06-research-handoff.md) retain their acceptance gates.

| Leaf | Module | Independently prepared controls |
|---|---|---|
| R1 | `resolver-context.ts`, `resolver-types.ts` | Identity, ownership, outgoing closure, legal recursion, forbidden cycles, source records and deterministic diagnostics |
| R2 | `resolver-resolution.ts`, `resolver-comparison.ts` | Caller-context slots, authenticated handles and anchored effective-property correspondence |
| R3 | `resolver-relations.ts` | Dated complex/simple derivation, final exclusions, affiliation and retained substitution groups |
| R4 | `resolver-validation.ts` | All-member inventory, source AU/group roles, direct owner requests and honest missing-authority results |
| R5 | `resolver-budget.ts` | Request isolation, cache options, cumulative inclusive limits and the separate numeric work ledger |
| R6 | `resolver-integration.test.ts` | Combined lookup, correspondence, conditional owner checks and retained/omitted substitution contrasts |

The files are under `test/research/re01/`; [`resolver-types.ts`](../test/research/re01/resolver-types.ts) defines their shared record contract.
Their adjacent literal tests cover specification cases B01–B23, including B17a's anchored particle policy.
The existing endpoint, group, particle and substitution reference controls remain independent evidence.
The S06 research manifest pins executable records, tests and documentation without rewriting its historical 147-artifact checkpoint.

## Guarantees and qualification

Context preparation certifies structural consistency and explicit outgoing closure.
Reference resolution certifies one declared slot's target in the caller's context.
Endpoint comparison certifies only a supplied identity correspondence over the specified finite effective-property projection.

Named predicate receipts identify their context, operands, rule and authority.
A checked-candidate receipt requires all applicable inventory entries and endpoint correspondence to pass under qualified authorities.
It applies only to the explicitly listed component schema and reports excluded incoming relationships.

An unimplemented or unqualified semantic owner returns a named `unresolved` result.
A rejected candidate or correspondence proves nothing about other candidates.
Resource exhaustion returns no partial successful receipt and proves no schema-invalidity or witness-nonexistence conclusion.

The relation authority is the dated rule control flow over supplied facts and a fixed seven-entry builtin ancestry table:
`anyType`, `anySimpleType`, `string`, `decimal`, `integer`, `long` and `int`.
Other builtin identity queries may pass by identity; a query requiring an absent builtin relation premise is unresolved.
The table supplies ancestry only, with no scalar assessment or facet evaluator.
Immediate derivation final checks remain separate from full type construction and simple list/union formation legality.

The validation module has six fixed predicate owners: type construction, attributes, particle restriction, attribution, declarations and scalar operands.
Each receives the caller context, shared budget and original operands, and must return a matching context/rule/ordered-operand/authority receipt.
The implemented AU role checks preserve original identity sets, universal replacement matches, requiredness and fixed-kind obligations.
Complete fixed-value equality, wildcard admission, UPA, EDC, particle normalization and unrepresented constraints retain their named owning checks.
Accepted AU01 C1, PW01 R-240 and DT01 A remain the selected contracts for any such invoked predicate; a missing qualified implementation stays unresolved.

Conditional owners in tests only attest captured requests.
Their positive result tests receipt combination and never supplies a complete XSD predicate authority.

## Future production adapter

The production entry remains [`prepareResolvedCompilationInput`](../src/compiler/semanticCatalog.ts).
The future #179 adapter consumes `resolved.graph`, `resolved.links` and original source context from that entry.
It must qualify preparation authority for every actual record, including any constraint omitted from the narrow facts view.

Canonical IDs remain anchors with their global role/QName or original containing declaration and local path.
Group uses, particles, local declarations, anonymous scalar operands, original AU IDs and declaration IDs retain separate identities.
Candidate-local additions use disjoint identities; only the designated endpoint can have a proposed replacement definition.

Final/block values and defaults come from original declared and schema attributes with lexical namespace context retained.
Original prohibited attributes and empty/repeated attribute-group references stay source records and outgoing operands.
Unsupported syntax and unrepresented constraints become `unassessed` entries with a named rule and owner.

`composed.types` may supply effective content contribution roots.
Its QName-collapsed `attributes` cannot reconstruct original AU constraints or sharing.
The adapter obtains original AU/declaration/group contribution IDs and their fixed/default/type operands directly from `resolved.graph`.

The accepted AU01 C1 source-replacement predicate checks every original matching intermediate AU.
Retention preserves the entire original same-QName AU set, including separate fixed obligations.
The accepted PW01 R-240 and DT01 A predicates are invoked only for the obligations within their reviewed domains.

The single accepted [`OccurrenceAnalysis`](../src/compiler/occurrenceAnalysis.ts) supplies exact total range and `schemaEmptiable` to its requesting particle owner.
Changed particle inputs require a context-qualified view of that same contract.
Reusing an unchanged particle summary requires an identical content/occurrence closure; changed type composition is recomputed.

Type relations, normalized particle views, scalar descriptions and semantic caches must take explicit context and complete predicate options.
An actual assessment receipt cannot silently become a proposed-context receipt through an unchanged component.
Group attribution must retain use positions, while EDC includes the explicitly retained implicit substitution members.

## Remaining acceptance owners

#234 owns full-type witness soundness, complete candidate-family reduction and the negative-answer/termination theorem.
Its proof must discharge ambient-schema preservation, source-valid construction, identity/incidence and delegated semantic assumptions.
#232 owns joint independently reviewed research acceptance with the accepted AU01/PW01/DT01 contracts.

#179 owns the future production adapter, complete component assessment and review of the guarded paths in #231.
#153 owns combined S06 acceptance, and #184 retains payload scalar enforcement.
This research delivery does not change S07/S08 readiness, public support, catalog/profile contracts or the legacy default.

## Reproduction and delivery evidence

The linked implementation PR and issue handoff identify exact reviewed/head/merged commits and trees.
They record accountable implementing agents, independent findings and resolutions, final local commands, hosted results and measured budget evidence.
Historical observations remain separate from current reference observations and conditional supplied-predicate checks.

```bash
npm ci --cache tmp/cache/npm
npm run reference:setup
npm run check:toolchain
npm run typecheck:research
npm run typecheck:reference
npm run docs:validate
npm run test:research:ports
npm run ci
npm run test:reference:full
npm run test:conformance
git diff --check
```

The independently authored `resolver-work-ledger.test.ts` derives one complete finite preparation and lookup count from charged operations.
Its exact and one-below controls are separate from measured counts and historical witness-probe boundaries.
The two-actual-component fixture requires 44,683 preparation units and 271 lookup units, totaling 44,954.
At 44,953 units its final six-unit output reservation fails at 44,948, returning only the shared terminal result.
The node controls separately admit 100,000 distinct actual identities with sufficient work and reject 100,001 before index allocation.
All request operations share cumulative counters; an exhausted request returns its reserved terminal result on subsequent calls.
The final revision must pass substantive independent review after all semantic or resource changes.
Normal protected merges and merged-main verification complete delivery; an unmerged parent branch alone does not satisfy it.
