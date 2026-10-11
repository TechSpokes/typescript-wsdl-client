# S06 RE01 Research Resolver Implementation

Research implementation scope, verification and the future production seam. See the root [README](../README.md).

## Implementation contract

### Architecture recovery source staging

The #232 recovery assignment permits reusable internal source owners before the complete existential theorem.
`src/compiler/semanticContext.ts` adapts the real canonical/resolved graph to one immutable request and isolated candidate deltas under `RE01-domain-boundary-v1`.
Its `structural-only` tag is explicit: this boundary implements the accepted B helper universe without certifying component/schema validity.

`prepareSemanticRequest` preserves original records, source contexts, AU/group/anonymous identities and legal element/type recursion.
The request's `actual` view and `candidate(delta)` share one budget; candidates have explicit membership, additions and an optional coherent endpoint replacement.
Original records remain available through `sourceNode`, while ordinary lookup returns `found`, `missing` or `outside-context` without silent actual fallback.

Opaque runtime context authentication rejects forged handles.
Reference, owner and incoming-affiliation access to an unavailable subject raises `SemanticContextAccessError`, rather than reporting a false empty collection.
Candidate collisions are checked against the entire original identity domain, including omitted original records.

`src/compiler/semanticBudget.ts` is the single implementation of the previously accepted request accounting; `resolver-budget.ts` is a compatibility re-export.
Default inclusive limits remain 100,000 nodes and 1,000,000 work units, with sticky exhaustion and pre-work/pre-allocation charging.
The new request covers actual context preparation, candidate indexes and consuming kernels; inherited loading/catalog/resolution stage counters remain separate and are not relabeled one whole-pipeline budget.

Semantic consumers reuse the request's original indexes and access generated content through `particleContentNode`.
Occurrence analysis receives a compact graph containing only the transformed particle and its referenced declarations.
`ParticleContentView.graph` is a lazy, charged diagnostic projection; normal restriction, extension and endpoint correspondence do not materialize or reindex the whole context.
Independent scaling controls keep a fixed query unchanged while adding unrelated original components, and measure preparation separately.

Source scalar/type/declaration and original-AU kernels consume authenticated contexts; no production source imports research implementations.
Accepted DT01 A arithmetic and PW R-240 control flow have shared source owners with research compatibility adapters.
Their exact local premises, implementation coverage and remaining aggregate obligations are recorded in the companion AU/PW/DT records and GitHub leaf handoffs.

The canonical adapter retains source contributions.
Those contributions do not by themselves represent unrestricted abstract hypothetical AU sets or raw particle construction; source mapping must not be applied to every hypothetical candidate by assumption.
The concrete finite checker described below consumes qualified effective-property correspondence and all generated local obligations.
Remaining local interpretation cases and #234 witness/evidence adequacy stay open under the [domain checkpoint](content-model-s06-re-01.md#architecture-recovery-domain-and-proof-checkpoint).

### Concrete source verification APIs

`prepareSourceSchemaRequest` consumes a loader-authenticated `SchemaInput`, builds/resolves the actual graph once and binds the complete retained original source syntax to the new request.
Graph-only `prepareSemanticRequest` remains useful structurally, but cannot supply missing source-document qualification to complete verification.
`forkSemanticCandidate` constructs an authenticated direct child of the actual or hypothetical parent and preserves original source evidence separately from its active raw properties.

The internal `loadSemanticSchemaInput` entry shares the existing loader implementation and applies XML Schema whitespace mapping to XSD namespace and schema-location values before interpretation, comparison and cache keys.
It preserves original syntax, bytes, digests and namespace bindings; `loadSchemaInput`, WSDL transport behavior and the public defaults are unchanged.
Import referents must match both namespace presence and value, while an explicitly empty import namespace without a supplied referent is not itself forbidden.

Notation declarations use a private component table without adding a persisted canonical node kind.
`sourceSchemaBinding.ts` binds complete source interpretations to the exact resolved handle produced from one authenticated input snapshot; copied handles cannot supply that authority.
`schemaNotationProperties.ts` maps original XML values and checks complete abstract property tuples through one shared implementation.
Source representations with the same notation QName coalesce only when their complete public/system identifier properties agree, including absence versus an empty value.
Every original representation still receives its own source grammar, duplicate-root-key and annotation checks.

Schema source wildcards use the schema-for-schemas assessment universe, independently of the application schema being constructed.
Unknown foreign declarations follow lax assessment, while concrete annotation/appinfo/documentation and facet payload headers share the source representation owner.
Typed payload IDs participate in the same physical validation-root ID set; an inert pattern payload's string value does not construct a schema regular expression.
The document receipt retains exact source-qualified `wildcardObligations` for remaining imported-declaration, larger schema-for-schemas and XSI assessment clauses.
Literal empty `xml:lang` retains `schema-for-schemas-xml-import-version`: historical XML namespace schemas disagree, and the unversioned import does not establish which declaration governs that value.
Nonempty language tokens and whitespace-only invalid values retain their independently established results; this qualification does not choose a historical import or add a profile exclusion.

`checkCandidateCorrespondence(actual, parent, candidate, target, intermediate, ancestor)` computes the designated ancestor and verifies E extends A, D′ restricts E and every original effective property is preserved.
Original particle/AU identities are exact; only authenticated source-generated composition wrappers admit a bijection preserving kind, occurrence, child order and sharing.
Equal normalized languages do not establish raw property correspondence.
Original scalar operand type, owner and context remain explicit, and scalar prerequisites propagate into the final checker.

`verifyFiniteRe01Evidence(actual, target, evidence)` accepts a root ID and finite records containing exact parent/candidate contexts, target, intermediate, ancestor and child-evidence IDs.
The checker constructs the obligation inventory itself, checks every actual XSD component and required original source obligation, and closes hypothetical dependencies from E, D′ and all fresh components.
Every nonprimitive nested RE01 requirement must match supplied evidence in that exact parent context.
Missing children remain unresolved, active proof cycles cannot pass, unrelated extra proof nodes are invalid evidence and component scheduling does not prove a judgment.

Notation availability and active membership have separate completeness conditions.
The finite checker inventories the authenticated notation table, checks every fresh declaration including unused helpers, and records `actualNotations` and each proof step's `notations` in their exact context.
Pure property checks may transfer only through the same privately shared immutable property tuple; source syntax and active membership remain independently checked.

Successful privately authenticated `RE01-finite-evidence-v1` receipts report checked actual obligations and the supplied construction.
Their `universalCoverage`, `completeNegativeAnswer` and `searchTermination` fields are always false.
Candidate rejection, malformed evidence, unresolved local rules and sticky resource limits remain separate from a universal negative answer.
No public API, persisted format or activation guard consumes these internal receipts automatically.

### Local rule and evidence map

This map identifies the shared implementation and independent controls.
The leaf issues retain exact reviewed revisions and unresolved findings; a mapped function is not a claim that all applicable premises pass for every input.

| Rule or property | Shared owner and entry | Independent controls and scope |
| --- | --- | --- |
| Complete B availability, collision domains, source identity, original/fork isolation | `semanticContext.ts`: `prepareSemanticRequest`, `forkSemanticCandidate` | `semantic-context-independent.test.ts`, `derivation-domain.behavior.test.ts`; structural authority only |
| Inclusive request limits and immutable input/output | `semanticBudget.ts` | Context and finite-checker controls; sticky terminal result, charged snapshots and no getter/iterator invocation |
| Actual document grammar and retained source universe | `schemaDocumentSyntax.ts`: `prepareSourceSchemaRequest`, `checkSchemaDocumentSyntax` | `schema-document-independent.test.ts`; complete notation property reconciliation, separate source syntax and namespace-mapping prerequisites |
| Original and fresh notation component properties | `schemaNotationProperties.ts`, authenticated context notation table | `semantic-notation-independent.test.ts`; source authority, active membership, collision reservations, original operands and unused fresh obligations |
| Actual component XML grammar, attribute placement and ordered children | `schemaSyntaxAssessment.ts`: `checkActualSchemaSyntax` | Actual-source syntax controls; abstract helpers have no invented XML representation |
| Complete builtin/simple/complex derivation, exclusions and final | `schemaTypeRelations.ts`: `checkTypeDerivation`, `checkImmediateTypeFinal`, `immediateTypeBase` | `schema-type-relations.test.ts`; component validity remains a separate premise |
| Declaration type/value legality, affiliation versus effective substitution | `schemaDeclarationPrimitives.ts`: `checkDeclaration`; shared type-relation owner | Declaration controls and `particle-edc-independent.test.ts`; complete declared affiliation dependencies survive effective filtering |
| Lexical/value/facet/list/union semantics and exact DT01 A | `schemaScalarKernel.ts`, `scalarSchemaAssessment.ts`, `schemaDatatypeValues.ts`, `schemaExactCalendar.ts` | `schema-scalar-independent.test.ts`, shared DT01 suite; original datatype, lexical namespace, owner, selected union member and prerequisite context retained |
| Source AU C1 identity union, replacement, requiredness, fixed/default and augmentation | `schemaAttributeUses.ts`: `assessSourceAttributeUses`, `assessAttributeUse` | `schema-attribute-independent.test.ts`; omitted original identity versus explicit replacement, typed equality and absent-value conflicts |
| Literal raw AU construction and namespace/process algebra | `assessRawAttributeUses`; `wildcardAlgebra.ts` | `schema-attribute-raw-independent.test.ts`; source-only syntax restrictions do not migrate to raw properties; mixed duplicate-match outcomes retain the quantifier interpretation prerequisite |
| Actual effective content versus explicit raw content | `complexTypeContent.ts`: `deriveActualComplexContent`, `deriveRawComplexContent` | `complex-content-independent.test.ts`; generated sequence identity, scalar identity, ordered source contribution and immutable source operands |
| Restriction normalization and exact formal ranges | `particleSemanticView.ts`; the single `occurrenceAnalysis.ts` | `particle-restriction-independent.test.ts`, existing occurrence suite; declared and normalized views remain separate |
| Particle restriction dispatch, ordered/unmatched mappings and R-240 | `particleRestriction.ts`, `particleWildcardRelation.ts` | Restriction and wildcard controls; unspecified virtual substitution-set ordering remains explicit where an ordered rule depends on it |
| Raw particle extension and full component-property equality | `particleExtension.ts`: `checkRawParticleExtension` | `particle-extension-independent.test.ts`; raw order and original/equal-property cases, without restriction normalization or assumed transitivity |
| All placement, UPA and EDC across particle positions | `particleLocalAssessment.ts`, `particleAttribution.ts`, `particleDeclarationConsistency.ts` | `particle-upa-independent.test.ts`, `particle-edc-independent.test.ts`; repeated group uses, original named types, effective substitutions and nested-repeat counterexamples |
| Aggregate simple/mixed/empty/particle construction and content-dependent defaults | `schemaConstructionAssessment.ts`: `checkComponentConstruction` | `component-construction-independent.test.ts`; concrete local scalar, final, emptiability, particle, declaration and AU premises with exact dependencies |
| Original syntax mapping to no semantic component | `isAbsentOriginalSourceComponent` | Prohibited/zero source descendants versus raw max-zero particles; referenced global declarations retain semantic obligations |
| Original effective endpoint correspondence | `re01CandidateCorrespondence.ts`: `checkCandidateCorrespondence` | `raw-type-properties-independent.test.ts`, `re01-candidate-independent.test.ts`; caller provenance labels and copied receipts have no authority |
| Complete finite nested obligations and primitive identity leaf | `finiteRe01Verification.ts`: `verifyFiniteRe01Evidence` | `re01-candidate-independent.test.ts`; actual obligations, complete supplied/nested evidence, missing/cyclic evidence and all universal claims false |

Every component receipt separates `obligations` from concretely `discharged` predicates by exact rule, component and context ID.
Original-context scalar prerequisites are discharged only against that actual closure; a candidate receipt for the same component ID cannot replace them.
Privately typed facet operands also require membership in the restriction's base value space; their original primitive family alone is insufficient.
Finite inherited enumeration components provide concrete positive or negative membership evidence, while a failed lexical witness alone does not prove a value-space negative.
Coexisting length and minimum/maximum-length facets require the specified proper restriction ancestor, including intrinsic builtin list bounds, in addition to numeric consistency.
Raw conjunct reduction retains a correspondence prerequisite when it cannot preserve fixed metadata or an inherited distinct facet property; it does not silently discard that property.
Known intrinsic builtin facets participate in property comparison, including token-list minimum length and integer bounds and precision.
Raw helpers must supply their complete effective properties; a retained builtin evaluator does not prove that omitted properties were supplied.
Unused original model groups receive their own all/UPA/EDC checks, and every fresh component is a hypothetical root.
The approved pattern subset and schema-only NOTATION/identity/ENTITY obligations retain the distinctions required by ADR-003; runtime payload enforcement remains #184.

### Remaining local qualifications

The integrated checker has meaningful fully checked particle/AU/wildcard/scalar and nested-evidence controls, but the complete recovery gate remains open.
The following named cases retain their precise prerequisites; a successful result on other inputs does not discharge them.

| Case | Current result and owning continuation |
| --- | --- |
| Mixed outcomes among duplicate matching raw AUs | `raw-au-match-quantifier`; #266/#269 need the governing raw-property quantifier or authenticated construction-role contract |
| Ordered mapping involving an implicit substitution set | `cos-particle-restrict` with the unspecified implicit-order reason; #266/#270 need the virtual enumeration contract while preserving explicit list order |
| Effective raw facet groups outside proved correspondence | Finite typed enumeration membership and explicit lexical witnesses are checked; unresolved facet-component mapping retains `raw-simple-facet-restriction-validity` |
| Incomplete intrinsic builtin facet properties | Known tuples establish differences or matching properties; opaque pattern and implicit whitespace metadata retain `builtin-facet-properties`, while incomplete raw correspondence retains its separate prerequisite |
| Independently supplied multi-pattern component values | Singleton expression strings and privately inherited multi-component identity are checked; unspecified construction mapping retains `pattern-property-equality` or `raw-simple-facet-restriction-validity` |
| Incomplete notation source availability or active membership | Context-qualified lookup retains its named prerequisite; complete source-bound original/fresh tables support concrete property checking |
| Anonymous simple-content components lacking a complete property view | Shared identity passes and known property differences prove inequality; equal incomplete views retain `component-simple-content-properties` pending the reviewed generated-property interpretation |
| Foreign schema attributes and annotation payload | The source-document owner checks its fixed schema-for-schemas assessment universe and retains exact unimplemented clause/source obligations |
| Legacy namespace normalization | The internal semantic loader supplies normalized XSD values; legacy-loaded spellings that disagree retain the source receipt's qualification |

Identity constraints remain outside the approved profile; recovery does not silently add key/keyref/unique support.
These qualifications are separate from #234's universal witness/evidence adequacy, complete negative answers and termination obligations.

### Historical research seam

The [derivability continuation](content-model-s06-re-01.md#derivability-and-affiliation-continuation) adds a model-tagged research comparison boundary and an explicit reverse-affiliation dependency census.
The maintainer addendum supersedes universal hypothetical whole-schema preservation while retaining complete actual-schema assessment.
The historical resolver remains a supplied-candidate seam; its conditional owner ledger is not a complete semantic authority for the revised judgment.

The [reviewed resolver specification](content-model-s06-re-01-resolver.md) defines R1–R7 and behavioral cases B01–B23.
Its selected domain is one supplied abstract two-step construction over immutable actual component records.
The research modules do not construct or search the complete RE01 witness family.

The [literal continuation](content-model-s06-re-01.md#literal-preparation-and-fresh-attribute-helper-continuation) adds `prepareLiteralContexts` with whole-Γ and non-derivation preservation, plus a scoped fresh-AU synthesis theorem/prototype.
Its structural success does not supply literal semantic authorities; the D1 validation ledger reports that missing qualification explicitly.

The historical resolver material under `test/research/re01/` consumes independently prepared records.
It imports no unaccepted #231 checkout; shared source owners introduced by recovery are identified above.
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

## Historical resolver guarantees and qualification

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

#271 owns local component construction and every prerequisite needed by its admitted finite evidence.
#179 owns guarded whole-assessment orchestration, operation capabilities and integration of the complete RE01 decision.
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

## Preparation measurement evidence

The [strict TypeScript harness](../test/research/re01/preparation-measure.ts) measures complete local source inputs through the loader, canonical graph, portable provenance, fingerprints and resolved preparation entry.
The [corpus manifest](../test/research/re01/preparation-corpus.ts) pins original bytes and complete import/include closures; the [recorded comparison](../test/research/re01/preparation-evidence.json) contains 16 corpus/limit rows, each with one cold and two warmed samples.
These are structural preparation measurements, not schema-validity, witness-coverage or public activation receipts.

The four committed tiers are the complete 21,204-byte Weather WSDL, a relative-import WSDL/XSD closure, the chameleon include closure and the shared-recursive XSD control.
Synthetic sizes 4, 16, 64 and 128 add independently recursive types that share one two-element group; their scale results remain labeled synthetic.
No larger redistributable real-service snapshot with complete closure was available in the repository, so the real-service scale claim stops at Weather.

The baseline is archived main `7d652fea79fddce8fd407f5c18dc2645ad203cc5`.
Reports hash all measured source files, the harness and lockfile, record Node/platform/CPU details, and reject source changes during a run.
The [issue handoff](https://github.com/TechSpokes/typescript-wsdl-client/issues/272#issuecomment-6113569258) separates the measured follow-up source snapshot from the later reviewed delivery revision and preserves the first delivery's distinct evidence.

| Complete input | Portable objects before | After | Persisted boundary |
|---|---:|---:|---|
| Weather WSDL | 8,406 | 5,077 | Identical |
| Relative import closure | 1,025 | 634 | Identical |
| Chameleon closure | 372 | 205 | Identical |
| Shared-recursive XSD | 2,876 | 1,254 | Identical |

The [provenance transformer](../src/compiler/catalogProvenance.ts) preserves original object sharing, keyed by input identity and the complete parent expanded name.
It does not intern content-equal records from different semantic contexts.
Every before/after row preserves the same input closure/options, format-2 canonical JSON bytes, catalog digest and semantic fingerprint; the normal writer's trailing newline is outside the reported canonical JSON byte count.

[Independent transformation controls](../test/research/re01/preparation-provenance.test.ts) retain chameleon namespaces, rebound QNames, distinct inherited bases, original diagnostic/source locations and context-sensitive credential checks in both encounter orders.
The finite sharing series counts unique declarations and distinct group-use positions without unfolding legal element/type recursion.
Object/field counts are deterministic retained-allocation proxies, not measurements of V8 allocated bytes.

Stage wall time, lifetime process peak RSS, logical work, admitted nodes and serialized/provenance-table sizes remain separate quantities.
`process.resourceUsage().maxRSS` includes the TypeScript loader and all prior stages in that child; subtracting successive high-water values would not measure stage memory.
No forced garbage collection is used, OS file caching is uncontrolled, and cold means the first call after module loading rather than cold disk or process-start time.

Existing uninstrumented stage counters are recorded as `null`.
Weather's baseline gathering, merge, resolution and composition work is respectively 739,119, 183,415, 472 and 27 under their inherited independent stage budgets.
The separately delivered wildcard owner increases shared-recursive composition work from 87 to 141; that charge increase is not a provenance optimization.

The [candidate workload](../test/research/re01/preparation-candidates.ts) compares one reusable actual preparation with deliberately rebuilding the same new adapter under one cumulative budget per workload.
Baseline main has no equivalent real-graph request API, so this is not a historical semantic-API comparison.
Its three distinct deltas retain full membership, select the endpoint's closure with changed `mixed`, and restore full membership in a sibling with changed `abstract`.

Weather diagnostic actual-plus-delta work is 3,418,436 with reuse versus 9,598,786 with rebuilding, at active sizes 140, 28 and 140.
The three delta costs are 140,559, 36,232 and 151,391 work units, with original source evidence still available separately from active membership.
[Request controls](../test/research/re01/preparation-candidates.test.ts) verify actual/sibling isolation, exact inclusive allowance and sticky exhaustion after earlier successful deltas.

The separately named `source-owned-actual-preparation` workload measures the authenticated [source request factory](../src/compiler/schemaDocumentSyntax.ts) used by the finite checker.
Its loader stage has separate limits; its owned source snapshot and context share one request budget, while canonical construction and reference resolution retain their inherited stage limits.
The exact immutable resolved handle now binds the complete original source universe, whose notation properties are prepared through the shared property owner.
This workload reports source-input and request-graph allocation censuses and runs no schema-validity assessment.
Baseline main has no matching source-owned API, so these current preparation costs are reported separately from both the historical provenance comparison and the structural reuse controls.

| Complete input | Source-owned diagnostic work | Source-owned default outcome |
|---|---:|---|
| Weather WSDL | 5,461,293 | Resource limit at 999,983 work, before context nodes |
| Relative import closure | 688,469 | Prepared |
| Chameleon closure | 210,478 | Prepared |
| Shared-recursive XSD | 1,081,109 | Resource limit at 999,954 work, with 52 admitted nodes |

Synthetic source-owned diagnostic work is 416,485, 1,308,415, 4,877,778 and 9,643,376 at sizes 4, 16, 64 and 128 respectively.
Charged source work includes original source URI string lengths; the task paths are recorded in the issue handoff, and moving a checkout can change these counts.
Differences from the first delivery therefore combine source changes and the follow-up worktree location, without attributing them to one isolated optimization.

Default and diagnostic rows remain separate; diagnostic work uses an explicitly named 50,000,000 allowance while defaults remain unchanged.
Weather source/catalog preparation succeeds at defaults, but its new actual context exhausts the 1,000,000-work allowance before any candidate.
Default import and shared-recursive contexts finish with reuse while the rebuilding controls exhaust; synthetic16 exhausts its third delta after two successes, and synthetic128 exhausts source gathering at the legacy reported step 1,000,001.

### Reproduce and retain measurements

Run these commands from the repository root with installed dependencies.
The [baseline helper](../test/research/re01/preparation-baseline.ts) archives the pinned revision without changing any checkout and removes only its own temporary archive.
Add `--corpus weather` or `--corpus chameleon` to both measurement commands for a smaller matching comparison.

```bash
node --import tsx test/research/re01/preparation-baseline.ts --output tmp/conformance/preparation/baseline.json
node --import tsx test/research/re01/preparation-measure.ts --contexts --output tmp/conformance/preparation/candidate.json
node --import tsx test/research/re01/preparation-summary.ts tmp/conformance/preparation/baseline.json tmp/conformance/preparation/candidate.json tmp/conformance/preparation/evidence.json
```

The [summary generator](../test/research/re01/preparation-summary.ts) rejects changed input/output boundaries and nondeterministic stage or request work across repetitions.
Committed corpus identities and the reviewed evidence record are durable; raw reports and generated synthetic files under `tmp/conformance/preparation/` are disposable task outputs.
Full CI, independent review, protected merge and merged-main verification remain delivery requirements; these bounded observations do not close #232/#234 or activate #179/#153.
