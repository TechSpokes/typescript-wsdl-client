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
Default inclusive limits are 100,000 nodes and 25,000,000 work units, with sticky exhaustion and pre-work/pre-allocation charging; the [capacity calibration](#successor-budget-calibration) records the measured scope and headroom.
The new request covers actual context preparation, candidate indexes and consuming kernels; inherited loading/catalog/resolution stage counters remain separate and are not relabeled one whole-pipeline budget.

Semantic consumers reuse the request's original indexes and access generated content through `particleContentNode`.
Occurrence analysis receives a compact graph containing only the transformed particle and its referenced declarations.
`ParticleContentView.graph` is a lazy, charged diagnostic projection; normal restriction, extension and endpoint correspondence do not materialize or reindex the whole context.
Independent scaling controls keep a fixed query unchanged while adding unrelated original components, and measure preparation separately.

Source scalar/type/declaration and original-AU kernels consume authenticated contexts; no production source imports research implementations.
Accepted DT01 A arithmetic and PW R-240 control flow have shared source owners with research compatibility adapters.
Their exact local premises, implementation coverage and remaining aggregate obligations are recorded in the companion AU/PW/DT records and GitHub leaf handoffs.

The private `SchemaValueContext<Owner>` boundary shares datatype, list and ordered-union evaluation between component operands and source syntax.
Its diagnostic owner is generic; source assessment does not fabricate graph nodes or borrow application-schema lookup authority.
The fixed schema-for-schemas pattern consumer shares XML name ranges with the loader, while application patterns retain their existing approved subset.

Attribute-use facts are retained only within the exact authenticated context, source/raw role and original use identity.
A completed fact includes its declaration dependencies and scalar obligations; later calls replay that complete evidence with positive request charges.
Container uniqueness, requiredness, restriction and wildcard checks still execute for each assessment, and failed or partial facts cannot become successful cache entries.

The [selected raw-AU contract](content-model-s06-re-01.md#selected-raw-matching-implicit-order-and-generated-scalar-properties) requires one compatible base use when matching same-name uses, retaining the prescribed wildcard allowance for unmatched raw uses.
It preserves required-base coverage and wildcard checks; source replacement retains universal C1.
Alternative raw matches can discharge a pending pair only with a fully checked compatible pair and its complete dependencies.

The canonical adapter retains source contributions.
Those contributions do not by themselves represent unrestricted abstract hypothetical AU sets or raw particle construction; source mapping must not be applied to every hypothetical candidate by assumption.
The concrete finite checker described below consumes qualified effective-property correspondence and all generated local obligations.
Remaining local algorithm/evidence qualifications and #234 witness/evidence adequacy stay open under the [domain checkpoint](content-model-s06-re-01.md#architecture-recovery-domain-and-proof-checkpoint).

### Concrete source verification APIs

`prepareSourceSchemaRequest` consumes a loader-authenticated `SchemaInput`, builds/resolves the actual graph once and binds the complete retained original source syntax to the new request.
Graph-only `prepareSemanticRequest` remains useful structurally, but cannot supply missing source-document qualification to complete verification.
`forkSemanticCandidate` constructs an authenticated direct child of the actual or hypothetical parent and preserves original source evidence separately from its active raw properties.

The internal `loadSemanticSchemaInput` entry shares the existing loader implementation and applies XML Schema whitespace mapping to XSD namespace and schema-location values before interpretation, comparison and cache keys.
It preserves original syntax, bytes, digests and namespace bindings; `loadSchemaInput`, WSDL transport behavior and the public defaults are unchanged.
Import referents must match both namespace presence and value, while an explicitly empty import namespace without a supplied referent is not itself forbidden.

Notation declarations use a private component table without adding a persisted canonical node kind.
`sourceSchemaBinding.ts` binds complete source interpretations to the exact resolved handle produced from one authenticated immutable input; copied handles cannot supply that authority.
The source-owned preparation path now freezes the authenticated loader handle under its shared budget and keeps its exact private binding. The resolved graph was already deeply frozen by canonical construction, so the same authenticated source path reuses it when constructing the semantic request. Generic catalog callers still receive an owned graph snapshot. The source handle becomes immutable before canonical construction, and no source or graph data escape as writable request state.
`schemaNotationProperties.ts` maps original XML values and checks complete abstract property tuples through one shared implementation.
Source representations with the same notation QName coalesce only when their complete public/system identifier properties agree, including absence versus an empty value.
Every original representation still receives its own source grammar, duplicate-root-key and annotation checks.

Schema source wildcards use the fixed schema-for-schemas assessment universe, independently of the application schema being constructed.
`schemaSourceGrammar.ts` owns global and parent-selected local declaration grammars; `schemaSourceValues.ts` evaluates their values through the shared scalar implementation and privately issued fixed type handles.
Known named types, contextual child declarations, schema-instance attributes, seven fixed schema keys and physical-root ID/IDREF obligations have concrete owners.
Unknown foreign declarations follow lax assessment against the complete fixed inventory, including the contemporaneous October 2004 XML import.
Typed payload IDs participate in the same physical validation-root ID set; an inert pattern payload's string value does not construct a schema regular expression.
The authenticated source loader forbids DTDs, so source ENTITY/ENTITIES declared-value assessment fails against its known empty unparsed-entity set; application scalar obligations remain separate.
XML `id` contributes typed ID facts to the same physical validation root; a missing IDREF target is rejected after complete assessment.
Schema-location hints are typechecked without fetching or extending the fixed assessment universe.
The dated assessment episode uses the contemporaneous October 2004 XML import's `xs:language` declaration, so literal empty and whitespace-only `xml:lang` values fail shared scalar assessment, including in payload subtrees.
The [immutable dated XML schema](https://www.w3.org/2004/10/xml.xsd), [October 2004 installation record](https://lists.w3.org/Archives/Public/public-xml-core-wg/2004Oct/0030.html) and [independent inventory review](https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6114584589) establish the complete imported inventory.
It declares `lang: xs:language`, `space` as an anonymous `xs:NCName` enumeration of `default` and `preserve`, `base: xs:anyURI` and `id: xs:ID`; `specialAttrs` references only base, lang and space.
There are no named types, global elements or further imports/includes, so other XML names follow known-absence rules in their respective symbol spaces.
The primary evidence is a complete rendered XML tree and contemporaneous approval/install linkage, not a raw-source byte attestation; runtime assessment fetches no schema.

The fixed grammar records ID-typed attribute uses independently of whether those attributes occur.
Under `cvc-complex-type` 5.2, a wildcard `xml:id` is invalid on a type with such a use, including schema and annotation types even when their ordinary `id` is absent.
Types without that use, including documentation and lax ur-type payloads, assess `xml:id` through the shared ID owner; duplicate values remain invalid across the physical root.

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
| Fixed assessment-schema declarations, values and XSI | `schemaSourceGrammar.ts`, `schemaSourceValues.ts`, `schemaSourceWildcards.ts` | Source and XML-inventory independent controls; contextual grammar, independent assessment universe, opaque handles, typed keys/IDs and complete dated import |
| Original and fresh notation component properties | `schemaNotationProperties.ts`, authenticated context notation table | `semantic-notation-independent.test.ts`; source authority, active membership, collision reservations, original operands and unused fresh obligations |
| Actual component XML grammar, attribute placement and ordered children | `schemaSyntaxAssessment.ts`: `checkActualSchemaSyntax` | Actual-source syntax controls; abstract helpers have no invented XML representation |
| Complete builtin/simple/complex derivation, exclusions and final | `schemaTypeRelations.ts`: `checkTypeDerivation`, `checkImmediateTypeFinal`, `immediateTypeBase` | `schema-type-relations.test.ts`; component validity remains a separate premise |
| Declaration type/value legality, affiliation versus effective substitution | `schemaDeclarationPrimitives.ts`: `checkDeclaration`; shared type-relation owner | Declaration controls and `particle-edc-independent.test.ts`; complete declared affiliation dependencies survive effective filtering |
| Lexical/value/facet/list/union semantics and exact DT01 A | `schemaScalarKernel.ts`, `scalarSchemaAssessment.ts`, `schemaDatatypeValues.ts`, `schemaExactCalendar.ts` | `schema-scalar-independent.test.ts`, shared DT01 suite; original datatype, lexical namespace, owner, selected union member and prerequisite context retained |
| Original generated scalar references and independent slot closure | `semanticTypeReference.ts`, `schemaTypeIdentity.ts`, `schemaGeneratedScalarShape.ts`, `checkOriginalGeneratedScalar` | `schema-original-generated-binding-independent.test.ts`; identity, all reference positions, suppressed source, exact context and private receipts |
| Original simple property and facet correspondence | `checkCandidateCorrespondence`, shared scalar cross-context comparison | `schema-simple-correspondence-independent.test.ts`, `schema-cross-context-facets-independent.test.ts`; original typed values, fixed and annotation properties |
| Exact supplied facet components and evaluation ownership | `scalarSchemaAssessment.ts`: `layer`, `readFacetProperties` | `schema-exact-facet-components-independent.test.ts`; fixed tuples, annotations, shared versus copied operands, evaluation order and inherited enumeration |
| Selected P1 expression correspondence and F2 scalar restriction | `scalarSchemaAssessment.ts`: `samePatternProperty`, `exactScalarRestriction`, `rawFacetCorrespondence` | `schema-scalar-policy-independent.test.ts`, `schema-scalar-inheritance-review.test.ts`; exact inventories, compatible matching, complete value containment, universal fixed duties, source inheritance and partial calendar order |
| Source AU C1 identity union, replacement, requiredness, fixed/default and augmentation | `schemaAttributeUses.ts`: `assessSourceAttributeUses`, `assessAttributeUse` | `schema-attribute-independent.test.ts`; omitted original identity versus explicit replacement, typed equality and absent-value conflicts |
| Context-local AU reuse with complete evidence replay | `schemaAttributeUses.ts` | `schema-attribute-reuse-independent.test.ts`; complete declaration/scalar closure, source/raw role separation, aggregate checks and inclusive warm-hit exhaustion |
| Scalar failure ownership through AU and aggregate consumers | `schemaAttributeUses.ts`, `schemaConstructionAssessment.ts` | `schema-attribute-origin-independent.test.ts`; original datatype invalidity versus a candidate bad value |
| Literal raw AU construction and namespace/process algebra | `assessRawAttributeUses`; `wildcardAlgebra.ts` | Raw and selected-AU independent controls; existential compatible matching, complete requiredness/wildcard checks and unchanged source C1 |
| Actual effective content versus explicit raw content | `complexTypeContent.ts`: `deriveActualComplexContent`, `deriveRawComplexContent` | `complex-content-independent.test.ts`; generated sequence identity, scalar identity, ordered source contribution and immutable source operands |
| Restriction normalization and exact formal ranges | `particleSemanticView.ts`; the single `occurrenceAnalysis.ts` | `particle-restriction-independent.test.ts`, existing occurrence suite; declared and normalized views remain separate |
| Particle restriction dispatch, ordered/unmatched mappings and R-240 | `particleRestriction.ts`, `particleWildcardRelation.ts` | Restriction, selected-order and wildcard controls; one coherent implicit-group enumeration per root query with explicit order preserved |
| Raw particle extension and full component-property equality | `particleExtension.ts`: `checkRawParticleExtension` | `particle-extension-independent.test.ts`; raw order and original/equal-property cases, without restriction normalization or assumed transitivity |
| All placement, UPA and EDC across particle positions | `particleLocalAssessment.ts`, `particleAttribution.ts`, `particleDeclarationConsistency.ts` | `particle-upa-independent.test.ts`, `particle-edc-independent.test.ts`; repeated group uses, original named types, effective substitutions and nested-repeat counterexamples |
| Aggregate simple/mixed/empty/particle construction and content-dependent defaults | `schemaConstructionAssessment.ts`: `checkComponentConstruction` | `component-construction-independent.test.ts`; concrete local scalar, final, emptiability, particle, declaration and AU premises with exact dependencies |
| Original syntax mapping to no semantic component | `isAbsentOriginalSourceComponent` | Prohibited/zero source descendants versus raw max-zero particles; referenced global declarations retain semantic obligations |
| Original effective endpoint correspondence | `re01CandidateCorrespondence.ts`: `checkCandidateCorrespondence` | `raw-type-properties-independent.test.ts`, `re01-candidate-independent.test.ts`; caller provenance labels and copied receipts have no authority |
| Complete finite nested obligations and primitive identity leaf | `finiteRe01Verification.ts`: `verifyFiniteRe01Evidence` | `re01-candidate-independent.test.ts`; actual obligations, complete supplied/nested evidence, missing/cyclic evidence and all universal claims false |

Every component receipt separates `obligations` from concretely `discharged` predicates by exact rule, component and context ID.
Original-context scalar prerequisites are discharged only against that actual closure; a candidate receipt for the same component ID cannot replace them.
Privately typed facet operands also require membership in the restriction's base value space; their original primitive family alone is insufficient.
Finite inherited enumeration components provide concrete positive or negative membership evidence.
Additional finite lexical aliases are reassessed against the exact base and compared through shared typed equality; a failed lexical witness alone does not prove a value-space negative.
The shared pattern owner can also enumerate its privately compiled finite literal fragment: literal code points and escapes, choices, sequences and bounded repetitions.
It proposes spellings without changing the application pattern subset or assigning pattern-component equality; every spelling still requires exact base assessment and typed equality.
Enumeration is iterative and charged before copying or repetition; resource exhaustion remains sticky, and fragments outside this producer retain their membership prerequisite.
For admitted explicit character classes, the positive producer tries operand spelling characters and printable ASCII that match the class, then scans remaining code points from U+007F for one match when needed.
Exact finite pattern words across all layers are checked before incomplete heuristic proposals, so a costly earlier pattern cannot starve a later finite witness.
Within a heuristic pattern, cheap class witnesses remain ahead of large literal branches, while paths needing no class search are tried before the fallback Unicode scan; the [independent starvation control](../test/unit/schema-pattern-starvation-independent.test.ts) exercises both orderings with an explicit 1,000,000-work allowance.
For admitted unbounded repetitions, it explores a finite prefix from the declared minimum through that minimum plus the expression and operand spelling lengths, using the same request budget.
These proposals are checked in the exact base context against the original typed operand; missing proposals retain an unresolved membership obligation, since the prefix and class choices do not exhaust either language.
The same value-facet evaluator can establish exact length, precision or bound exclusion without promoting one union member's failure to a union-wide negative.
Coexisting length and minimum/maximum-length facets require the specified proper restriction ancestor, including intrinsic builtin list bounds, in addition to numeric consistency.
Raw conjunct reduction retains a correspondence prerequisite when it cannot preserve fixed metadata or an inherited distinct facet property; it does not silently discard that property.
`schemaBuiltinFacets.ts` supplies the dated derived-builtin component tuples, including exact singleton pattern strings, fixed markers, token-list minimum length and integer bounds and precision.
Primitive facet sets remain empty; mandatory primitive whitespace behavior is distinct from a facet component, while list construction has its separately required whitespace component.
Raw helpers must supply their complete effective properties; local raw atomic values use the primitive plus those supplied properties, and derivation/correspondence legality is checked separately.
A complete exact raw facet inventory must retain every kind in a known, unqualified inherited inventory. The reviewed nonfixed same-side inclusive/exclusive normalization belongs only to the legacy `facetLayers` representation.
Supplied properties lost during reduction retain their prerequisite rather than being mistaken for absent input.
Verifier-matched exact inherited raw facet tuples remain inherited properties, with their fixed metadata and typed values checked through shared equality.
For exact scalar sets, changing any tuple of a kind replaces that whole kind in the reconstructed local set S. Every newly supplied bound must satisfy its local base-membership rule. Explicit source redeclarations undergo those same local rules, and source grammar still permits only one scalar facet of each kind per step.
Unused original model groups receive their own all/UPA/EDC checks, and every fresh component is a hypothetical root.
The approved pattern subset and schema-only NOTATION/identity/ENTITY obligations retain the distinctions required by ADR-003; runtime payload enforcement remains #184.

Implicit substitution choices use a finite search over coherent enumerations within one restriction query, with immutable blocks preserving explicit list positions through flattening.
Separate branches referencing the same implicit group cannot choose contradictory orders; distinct queries may choose independently.
Search and alternative mapping preserve unresolved premises, try fully checked alternatives, and charge before work or copying; incomplete search returns sticky resource exhaustion.

GSC1 assigns each source simple-content restriction slot its own anonymous scalar identity, including a restriction without facets; extension inherits that exact identity.
The shared scalar property owner supplies the containing type's mapped namespace, empty own final, absent own type annotation and complete inherited/base/facet properties.
Property equality traverses those properties with the same scalar equality owner and retains legality prerequisites; it does not equate anonymous identities or use synthetic graph nodes as scalar authority.
The content projection carries the authentic original scalar selector directly; it no longer fabricates a simple-type graph node.

`SemanticTypeReference` adds this private selector without changing canonical or persisted `Reference`.
The same selector is available in raw scalar bases, list items, ordered union members, complex simple bases and content, declaration types and typed facet operands.
One declared-type accessor honors the explicit raw declaration type; a canonical placeholder cannot override it.
One original shape mapper supplies immutable original identities and properties, while the scalar checker reassesses their legality in the selected active context.

Original generated slots have their own context membership, separate from the containing complex type's membership.
Syntax suppressed by a zero particle or prohibited attribute use creates no scalar slot; an otherwise real original slot cannot be invented or silently restored after omission.
Structural subsets may retain a real slot independently of its containing type, but full finite verification requires complete original slot availability.
Actual-schema checking covers every original slot; hypothetical checking covers slots consumed by E, D′, fresh components and their concrete dependencies.
Availability alone does not turn an unrelated original slot into a hypothetical legality root.

Finite receipts keep generated scalar construction evidence separate from graph-component evidence.
Type dependencies identify both their context and their component, builtin or generated-slot identity; each must have matching semantic construction evidence in that context.
Source-syntax-only evidence cannot discharge type validity, and a containing complex-type receipt cannot discharge its generated scalar's own rules.
Ordinary inline types suppressed by source mapping also remain diagnostic syntax rather than selectable semantic types.
Raw properties cannot turn such syntax into an original component or make its selection an actual-schema invalidity.

Complete raw properties for an original simple type are compared with its immutable source properties through the shared scalar owner.
The comparison preserves base, item and ordered member identities, typed facet values, fixed metadata and annotation properties or an exact original facet-component binding; an equal component ID alone does not prove correspondence.
An authenticated original facet binding preserves the exact original component set and its source operands, while active type and value legality remain separate obligations.
Missing annotation metadata is unresolved; explicit absence is data, and independently constructed multi-operand groups retain any unsettled mapping prerequisite.

Exact supplied facet components retain their typed values in the owning scalar description before effective constraint reduction.
Enumeration operands belong to their installed constraint layer, including when a descendant inherits that layer.
Reusing the same supplied facet object in another datatype cannot change earlier equality or membership results; independent controls cover both evaluation orders and copied-object contrasts at the unchanged request limits.

Failure ownership is also context-qualified.
An intrinsically invalid original datatype remains an actual-schema failure through scalar, AU and aggregate consumers.
A bad candidate lexical value assessed against a valid original datatype remains a candidate failure; the lookup context alone does not establish original invalidity.

The context privately owns sanitized immutable references and dependency records; ordinary caller objects are inspected and copied before reuse.
Private completed scalar property plans may share their frozen publication, while each use repeats active selection, legality prerequisites and dependency collection.
These copies and positively charged reuse paths preserve the shared request accounting and never transfer validity between contexts.

### Selected scalar comparison policies

The [authorized continuation](https://github.com/TechSpokes/typescript-wsdl-client/issues/232#issuecomment-6141810918) selects P1 for pattern properties and directs evidence-qualified F2 scalar restriction. The comparison asks which component property was constructed; accepted-language equality and legal derivation are separate judgments.

P1 preserves a singleton expression and joins complete expressions in supplied order with `|`. It adds no grouping, sorting or deduplication. Thus `['a', 'b']` constructs `a|b`, while `['b', 'a']` constructs a different property. A later language-equivalence operation can have its own authority without changing component correspondence. Pattern membership continues to use the compiled XSD expression semantics.

F2 requires each effective scalar facet to have a compatible same-kind base facet when that kind exists. It additionally checks every applicable fixed base value, inherited cross-kind restrictions, complete local S construction, typed bound membership and whole-value containment. Retaining exact `minLength` components 3 and 5 succeeds; retaining only 5 succeeds; retaining only 3 fails when the result admits a value of length 3. A retained enumeration containing only `abcdef` can prove containment even with minimum 3.

The dated primary rules are [Structures st-restrict-facets](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#st-restrict-facets) and [Datatypes constraining facets](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/datatypes.html#rf-facets). The bound restriction clauses prohibit specified mathematical relations; an indeterminate calendar comparison alone is not such a relation. Value assessment separately requires the value to satisfy each bound, and a sufficient implication proof needs a determinate order.

The checker proves scalar containment from complete retained scalar implications, complete finite enumeration, or a complete finite literal pattern language. An assessed result value outside the base proves widening. Cases whose general pattern implication remains unproved retain `raw-simple-facet-restriction-validity`; for example, a retained `[a-z]{5,}` pattern with a weaker scalar minimum is mathematically sufficient but remains qualified in the current checker.

Exact component inventories preserve repeated tuples and fixed metadata. Source descendants preserve all inherited components except scalar kinds explicitly replaced. The legacy `facetLayers` view denotes its proved normal form; comparing it with an exact inventory uses that normal form, preserving equality transitivity. An unproved normal form or missing annotation evidence retains its qualification.

The 43 independently specified policy controls and 14 additional reviewer controls cover these distinctions. Reviewer regressions include dropped inherited calendar constraints, fixed duties on an empty source restriction, hidden old constraints after replacement, whole-kind local reconstruction, erased inherited bound kinds, repeated exclusive endpoints and mixed-representation equality. Retained bound kinds compare annotation properties as well as value and fixed metadata; unknown metadata keeps a qualification when no valid local construction is proved. The lower inclusive/exclusive prohibition applies to the complete datatype, while the upper-pair prohibition applies to the local derivation step, following their distinct dated clauses.

### Remaining local qualifications

The integrated checker has meaningful fully checked particle/AU/wildcard/scalar and nested-evidence controls, but the complete recovery gate remains open.
The following named cases retain their precise prerequisites; a successful result on other inputs does not discharge them.

| Case | Current result and owning continuation |
| --- | --- |
| Effective raw facet groups outside proved correspondence | Finite typed enumeration membership and explicit lexical witnesses are checked; unresolved facet-component mapping retains `raw-simple-facet-restriction-validity` |
| Incomplete original facet or annotation correspondence | Exact cross-context properties and authentic original bindings are compared; missing metadata or unsettled independently constructed groups retain their precise prerequisite |
| General scalar value containment involving patterns | Selected P1 determines component expressions; cases beyond complete scalar, enumeration or finite-literal containment evidence retain `raw-simple-facet-restriction-validity` |
| Incomplete notation source availability or active membership | Context-qualified lookup retains its named prerequisite; complete source-bound original/fresh tables support concrete property checking |
| Legacy namespace normalization | The internal semantic loader supplies normalized XSD values; legacy-loaded spellings that disagree retain the source receipt's qualification |

Application identity constraints remain outside the approved profile; checking the fixed assessment schema's own keys does not add application key/keyref/unique support.
These qualifications are separate from #234's universal witness/evidence adequacy, complete negative answers and termination obligations.
The [inherited-root continuation](content-model-s06-re-01.md#inherited-fresh-roots-and-the-october-13-proof-continuation) repairs a nested finite-certificate false positive: every candidate rechecks all fresh additions relative to immutable actual Gamma, including additions inherited from its parent.
The permanent affiliation controls distinguish complete availability from complete legality roots and retain exact context-local assessment.
The same entry point accepts a discriminated primitive root and issues a separately authenticated `checked-primitive` receipt after checking every actual obligation, including supplied evidence for unrelated nonprimitive types.
This represents the existing no-change rule without inventing a restriction edge, which can itself invalidate a consumed affiliation; existing construction-root callers retain their input and receipt contracts.

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
The current source snapshot starts at main `9eb027cd144cdb2ac7e48e1d87990fea7b92342a`; its 112-entry source/harness/lock map is `9c4a9db5175739d9656ed4a2dbc58d63e2550a2ef9bdaa77d45929d99362b8c0`.
The recorded comparison's SHA-256 is `437b0074f22f78e4fc62d82752ff97e51cf933b77a458a41029aae42f88e8016`; [PR276 measurements](https://github.com/TechSpokes/typescript-wsdl-client/issues/272#issuecomment-6114655396) remain historical evidence for their exact source and URI.
The [PR274 measurement handoff](https://github.com/TechSpokes/typescript-wsdl-client/issues/272#issuecomment-6113569258) remains a separate historical delivery record.

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

Weather diagnostic actual-plus-delta work is 3,419,023 with reuse versus 9,599,863 with rebuilding, at active sizes 140, 28 and 140.
The three delta costs are 140,673, 36,346 and 151,505 work units, with original source evidence still available separately from active membership.
[Request controls](../test/research/re01/preparation-candidates.test.ts) verify actual/sibling isolation, exact inclusive allowance and sticky exhaustion after earlier successful deltas.

The separately named `source-owned-actual-preparation` workload measures the authenticated [source request factory](../src/compiler/schemaDocumentSyntax.ts) used by the finite checker.
Its loader stage has separate limits; its owned source snapshot and context share one request budget, while canonical construction and reference resolution retain their inherited stage limits.
The exact immutable resolved handle now binds the complete original source universe, whose notation properties are prepared through the shared property owner.
This workload reports source-input and request-graph allocation censuses and runs no schema-validity assessment.
Baseline main has no matching source-owned API, so these current preparation costs are reported separately from both the historical provenance comparison and the structural reuse controls.

| Complete input | Source-owned diagnostic work | Source-owned default outcome |
|---|---:|---|
| Weather WSDL | 5,473,160 | Resource limit at 1,000,000 work, before context nodes |
| Relative import closure | 690,163 | Prepared |
| Chameleon closure | 211,276 | Prepared |
| Shared-recursive XSD | 1,106,574 | Resource limit at 999,974 work, with 52 admitted nodes |

Synthetic source-owned diagnostic work is 417,561, 1,311,759, 4,890,194 and 9,667,888 at sizes 4, 16, 64 and 128 respectively.
Charged source work includes original source URI string lengths; the task paths are recorded in the issue handoff, and moving a checkout can change these counts.
The current source-owned samples use `/workspace/recovery-232-correspondence`; earlier PR276 samples used `/workspace/recovery-232-scalar-finite`, PR275 used `/workspace/recovery-232-finite` and PR274 used `/workspace/recovery-232-followup`.
Differences therefore include source URI lengths and source changes, without attributing them to one isolated optimization.

Default and diagnostic rows remain separate; diagnostic work uses an explicitly named 50,000,000 allowance while defaults remain unchanged.
At the post-277 baseline, Weather source/catalog preparation succeeds at defaults, but its new actual context exhausts the 1,000,000-work allowance before any candidate.
In the separate #278 matched-path continuation from post-277 main, Weather source-owned work falls from 5,461,538 to 988,098 and shared-recursive work from 1,103,022 to 214,199. Both now prepare under the unchanged 1,000,000-work default, with identical catalog fingerprints and request-graph census. The two checkouts have equal-length paths (`/workspace/recovery-278-baseline` and `/workspace/recovery-278-proposed`) and use identical fixture bytes. This measures structural source entry only: Weather's separate actual-plus-candidate context workload still exhausts the default allowance. Warm wall-time samples improved, but OS cache and GC are uncontrolled; logical work and identical graph facts are the primary comparison.
Default import and shared-recursive contexts finish with reuse while the rebuilding controls exhaust; synthetic16 exhausts its third delta after two successes, and synthetic128 exhausts source gathering at the legacy reported step 1,000,001.

The separate cold finite candidate accounting runs three unchanged constructions with fresh source requests and no prior cache warming; [PR276 accounting](https://github.com/TechSpokes/typescript-wsdl-client/issues/271#issuecomment-6114656155) remains historical evidence.
Its before/after baseline imports exact frozen `b443034e2aa93f92dc6ad70da7b75c5b98220249` source while using the same fixture bytes and `/workspace/recovery-232-correspondence` input URIs as the current source, so source-path length is matched for this comparison.
The current report's SHA-256 is `9a67d7d9f3c4de465e0bd77f7b0c3fe6a90c8e3a67f7e8b3d88ab40594a1d0ae`.

| Fixed construction | Baseline diagnostic work | Current diagnostic work | Current default outcome |
|---|---:|---:|---|
| Particle, AU and wildcard | 1,455,248 | 1,426,117 | Resource limit at 999,962 work |
| Nested helper | 1,437,731 | 1,556,788 | Resource limit at 999,959 work |
| Typed-attribute scalar | 953,192 | 974,151 | Checked candidate at 974,151 work |

Diagnostic allowance is 100,000,000 for these finite checks; the baseline scalar also passed the unchanged 1,000,000 default allowance while its two larger constructions exhausted it.
The current typed-attribute success preserves the full actual and candidate receipts and is an executed result, not subtraction of estimated cache savings.
The changes include new semantic dependency checks and safe owned-data reuse; this is not a general speedup claim, and the earlier PR275 AU reuse improvement remains scoped to its own matched baseline.
Candidate accounting is separate from structural preparation costs and does not establish universal witness coverage.
The [independent permanent regression](../test/unit/re01-candidate-independent.test.ts) uses the same fixture bytes at a fixed offline URI so its default-budget assertion does not depend on checkout-path length.
At that fixed URI, the matched scalar baseline uses 942,932 work and this source uses 966,375; both complete under defaults.

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

### Accepted #278 finite capacity qualification

The original [fixed-URI finite harness](../test/research/re01/finite-capacity-measure.ts) compared actual main `2a057d22a48bfe78a7af2deb368f86a4c762533f` (tree `845417705b22259f6ebf6ce93abb481d31dfedbc`) with the #278 change. Both checkouts used the same source bytes and `https://capacity.example/` offline URIs. Each workload used a fresh request for each of three samples, with separate then-default 1,000,000-work and diagnostic 100,000,000-work profiles; both allowed 100,000 nodes. The table preserves that accepted historical experiment; logical work and nodes were identical across its three repetitions.

| Complete finite workload | Main diagnostic work | Main default | #278 default work | #278 nodes | Remaining default work |
|---|---:|---|---:|---:|---:|
| Particle, AU and wildcard | 1,204,704 | Resource limit | 917,562 | 61 | 82,438 |
| Nested helper | 1,438,063 | Resource limit | 976,270 | 11 | 23,730 |
| Typed attribute | 857,115 | Checked | 593,138 | 7 | 406,862 |

The #278 diagnostic and default profiles produce the same complete checked receipts and totals. Their deterministic JSON receipt-projection SHA-256 values match current main's diagnostic receipts for all three workloads. Each retains checked actual obligations and the supplied candidate; universal coverage, complete negative answer and search termination remain false.

Main's diagnostic receipts and the #278 receipts retain the same particle object and string census; the nested and typed #278 receipts retain fewer objects and strings. This census traverses reachable receipt values and is a retained allocation proxy, not a V8 allocation counter.

| Checked receipt | Main objects | #278 objects | Main string values | #278 string values |
|---|---:|---:|---:|---:|
| Particle, AU and wildcard | 1,234 | 1,234 | 1,649 | 1,649 |
| Nested helper | 1,157 | 1,127 | 1,513 | 1,478 |
| Typed attribute | 690 | 684 | 908 | 901 |

Source preparation, actual lookups and candidate preparation retain the same logical work on main and #278. The particle stages use 46,257, 171 and 129,222 work; the nested stages use 24,846, 108, 103,325 and another 75,936 for its nested candidate; the typed stages use 24,846, 108 and 86,100. Complete finite verification changes from 1,028,747 to 741,605 for particle, 1,233,553 to 771,760 for nested and 745,982 to 482,005 for typed. The main default runs stop during verification, so their truncated verification counts are not comparable completed costs.

The retained source-owned structural controls remain 988,098 work and 140 nodes for Weather, and 214,043 work and 53 nodes for shared-recursive, under both main and #278. Weather's separate three-candidate structural reuse workload consumes 905,654 work and 55 nodes. These are source and context preparation controls, not complete finite proofs. The separate generic Weather actual-plus-candidate context path still exceeds the default; this qualification does not claim that path passes. Weather is the largest available redistributable complete real-service closure.

The finite harness reports loading separately with `null` shared-budget work because loading uses inherited limits. It separates source ownership, actual lookup and each candidate construction, but groups original local assessment, candidate local assessment, dependency discharge and evidence publication in the complete finite-verification stage. Earlier structural harnesses expose canonical construction and reference resolution independently. An exact per-rule allocation or verifier substage claim would require additional instrumentation. Wall time and process RSS are observed per stage; OS cache, JIT and garbage collection are uncontrolled, and process peak RSS is a lifetime high-water mark. The deterministic work, node and receipt observations support this bounded capacity result.

The archived comparison used the original #278 harness in equal-length checkouts. The expanded harness below measures the current default separately from the explicit former limit; its new imports and workloads must not be substituted into that archived experiment without a new matched measurement.

The optimization caches only positive direct relation and content-identity facts in their owning context. Every call re-owns references, charges cache lookup and publication, and replays the checked dependencies; finite builtin dependencies are checked once per exact context and identity. Typed attribute constraints use one scalar assessment. Candidate-specific and nested proof obligations still run for the supplied evidence. These historical controls qualify named workloads only. The later authorized continuation selects P1 and evidence-qualified F2; #234 proof and #232 full acceptance remain open.

### Successor budget calibration

The [authorized #232 continuation](https://github.com/TechSpokes/typescript-wsdl-client/issues/232#issuecomment-6141810918) treats request defaults as engineering choices. The shared request now defaults to 25,000,000 work units and retains 100,000 nodes. Callers can override either positive safe-integer limit, and both remain inclusive.

The [expanded harness](../test/research/re01/finite-capacity-measure.ts) and [recorded evidence](../test/research/re01/finite-capacity-evidence.json) measure complete named workloads on Node `v24.19.0`, Linux x64, Intel Xeon Platinum 8573C. The integrated evidence was freshly measured at source revision `024460832f975b57d2f8b57a35cf56a8f175e7a1` and records exact source/dependency hashes and the production diff hash. Earlier baseline measurements remain in the budget commits and linked issue record. Each workload/profile runs in a fresh child with one cold and two warm requests; fixed offline URIs remove checkout-path differences, and request identifiers keep equal lengths.

The three finite cases execute `verifyFiniteRe01Evidence` fully, including original and candidate obligations, dependency discharge and receipt publication. Weather and the shared-recursive cases execute one complete actual preparation and all three candidate deltas, including changed membership and endpoints. These structural cases do not perform complete semantic validation or search for a finite witness; their `structural-only` result is retained in every record.

| Workload | Generic actual plus three candidates | Source-owned actual plus three candidates | Request nodes |
|---|---:|---:|---:|
| Weather WSDL | 3,370,424 | 1,316,746 | 142 |
| Shared-recursive fixture | 885,542 | 408,819 | 55 |
| Synthetic 4 recursive types | 355,831 | 162,966 | 29 |
| Synthetic 16 recursive types | 1,076,816 | 451,882 | 89 |
| Synthetic 64 recursive types | 3,964,383 | 1,610,775 | 329 |
| Synthetic 128 recursive types | 7,820,612 | 3,158,811 | 649 |
| Synthetic 256 recursive types | 15,540,094 | 6,262,935 | 1,289 |

The synthetic inputs use the existing graded generator: every type shares one two-element group and independently recurses across an element boundary. Weather remains the largest available redistributable real-service closure; these synthetic sizes do not add evidence about larger real services. The generic path calls the structural adapter on a built and resolved graph, while the source-owned path retains #278's authenticated immutable sharing.

The replacement work limit targets at least 50 percent headroom above the largest measured completed request, rounded up to the next 5,000,000 units. The resulting 25,000,000 limit leaves 9,459,906 units, or 60.9 percent of the observed 15,540,094 cost, for input and workload variation. The largest measured request uses only 1,289 nodes, so this evidence gives no reason to raise the existing node guard.

| Default-profile workload | Cold wall ms | Two warm wall ms | Peak process RSS MiB | Maximum observed post-stage heap MiB |
|---|---:|---|---:|---:|
| Generic Weather sequence | 51.660 | 30.272, 26.300 | 76.9 | 27.2 |
| Generic synthetic 64 sequence | 48.786 | 34.264, 25.572 | 81.6 | 32.6 |
| Generic synthetic 128 sequence | 106.208 | 81.164, 55.500 | 98.2 | 32.5 |
| Generic synthetic 256 sequence | 147.151 | 108.520, 98.680 | 133.3 | 64.3 |
| Source-owned synthetic 256 sequence | 111.096 | 76.480, 52.233 | 108.3 | 39.1 |

Wall totals include loading and measured preparation stages but exclude process/module startup. RSS is a process-lifetime high-water observation including the loader and preceding requests; heap is observed at stage boundaries, not its allocation total or guaranteed peak. OS cache, JIT, GC and concurrent environment activity are uncontrolled, so these samples support practical calibration without promising throughput or a memory ceiling.

For generic Weather, actual preparation costs 3,041,697 units and the three deltas cost 140,673, 36,408 and 151,567; the initial terminal reservation adds 79. The 256-type generic case costs 12,971,156 for actual preparation and 1,269,596, 20,235 and 1,279,028 for its deltas, plus the same reservation.

The compact committed summary stores shared inputs and claims once, each profile's result and deterministic stage costs, and three total-wall, peak-RSS and maximum post-stage-heap samples. Full raw reports under `tmp/conformance/budget-calibration/` retain each stage's timing and before/after RSS and heap; the summary records their hashes and reproduction commands. The integrated summary comes from fresh execution of all three profiles; the compact representation retains the measured numerical evidence.

After the integrated scalar and proof repairs, the three complete finite cases cost 918,564 for particle/AU/wildcard, 977,067 for the nested helper and 593,453 for typed attributes. These are new measurements; the historical #278 totals remain in its preceding section. They complete under the explicit former 1,000,000 limit as well as the new default and diagnostic limits. Default and diagnostic runs have identical completed totals, graph hashes and checked receipt projections for corresponding samples; the [reducer](../test/research/re01/finite-capacity-summary.ts) checks these facts before emitting evidence.

The accounting schedule remains unchanged. Its text, descriptor, traversal and allocation precharges account for variable work at finer granularity than graph nodes or transitions; the large numerical totals coexist with modest observed time and memory in this corpus. Rescaling those units would obscure existing independent ledgers without demonstrating an operational benefit, and the provisional inherited stage budgets in ADR-003 concern separate stages and units.

The [capacity controls](../test/research/re01/finite-capacity.test.ts) pin the former allowance where it is the regression oracle. Generic Weather still returns `resource-limit` at 1,000,000, while an exact measured complete sequence succeeds and one unit less fails without a partial candidate. Starvation, source-ownership and symbolic-particle controls also use explicit former limits so a default increase cannot mask those defects.

Oversized text is rejected by its precharge before scanning or copying, repeated cyclic references retain sharing, and reserving 100,001 nodes fails at the inclusive 100,000 boundary. Failure stays terminal with the same envelope and unchanged counters, including subsequent attempted operations. Exhaustion provides no negative semantic answer; neither this numerical calibration nor a successful supplied finite check proves universal coverage or search termination.

Reproduce all profiles and reduce them only after completing a stable source tree:

```bash
mkdir -p tmp/conformance/budget-calibration
node --import tsx test/research/re01/finite-capacity-measure.ts --profile legacy > tmp/conformance/budget-calibration/legacy.json
node --import tsx test/research/re01/finite-capacity-measure.ts --profile default > tmp/conformance/budget-calibration/default.json
node --import tsx test/research/re01/finite-capacity-measure.ts --profile diagnostic > tmp/conformance/budget-calibration/diagnostic.json
node --import tsx test/research/re01/finite-capacity-summary.ts tmp/conformance/budget-calibration/legacy.json tmp/conformance/budget-calibration/default.json tmp/conformance/budget-calibration/diagnostic.json tmp/conformance/budget-calibration/summary.json
```

Loading, canonical construction and reference resolution retain their independent limits; their `null` shared-work counters are not zero-cost claims. The earlier preparation harness still measures inherited gathering/merge/resolution/composition stages separately, and its request-context profile now reads the actual semantic defaults instead of reusing inherited stage-step limits. A request that fits this work guard can still encounter a separate loader, graph or source-stage limit.
