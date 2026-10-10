# S06 RE01: Reordered Derivation Research

Formal component witnesses, a finite particle construction and the remaining full-domain proof. See the root [README](../README.md).

## Delivery status and scope

Issue [#234](https://github.com/TechSpokes/typescript-wsdl-client/issues/234) remains open for complete decision-procedure acceptance. This record recommends the numbered existential rule and supplies executable positive feasibility evidence, including the counterexamples that defeat suffix copying. It does not certify a complete negative procedure over the approved profile.

The research owner is the RE01 agent in epic #232; substantive review belongs to the separately assigned epic reviewer. The coordinator records the exact reviewed revision and findings in the joint handoff. No production assessment guard, profile exclusion, catalog format or legacy default changes here.

The baseline is accepted main `5876065b00d4eeb6d2324eaa63ff9b70e2279198`. The unaccepted assessment draft is inspected at `460f5b8379c68ffef79917284e445b5ab046429e`, without importing its assessment modules. [Composition](content-model-composition.md), [analysis](content-model-analysis.md) and [ADR-003](decisions/003-content-model-contracts.md) retain their existing owners and contracts.

## Primary rule and interpretation

The dated [XSD 1.0 second-edition Extension constraint](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-ct-extends), clause 1.5, states:

> It must in principle be possible to derive the complex type definition in two steps, the first an extension and the second a restriction (possibly vacuous), from that type definition among its ancestors whose {base type definition} is the ur-type definition.

Its explanatory note states:

> This requirement ensures that nothing removed by a restriction is subsequently added back by an extension.

The recommended interpretation applies the numbered existential component constraint. The explanatory claim and its recipe of collecting original extension suffixes cannot impose an additional prohibition when a legal two-step witness exists. Optional original string content, removed and then restored as string or token, has a vacuous first extension and a valid final restriction.

An intermediate witness is a hypothetical schema component, not necessarily an already declared type or the concatenation of the original extension suffixes. The final comparison preserves the final type's assessed component properties and original constraints; its derivation edge is hypothetical for this check. Requiring the original derivation edge to remain identical would make the two-step requirement meaningless for a longer chain.

The ancestor is the type on the actual immutable derivation chain whose base is `anyType`, rather than an arbitrary earlier type. Follow original resolved edges, honor each original derivation's legality, and reject forbidden base cycles in the existing S05 stage. A first extension must also honor that ancestor's `final` exclusion of extension; reordering must not erase it.

### Source authority and corrections

The complete [pinned structures source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/structures.xml) identifies the 28 October 2004 Recommendation and matches SHA-256 `e496af408b14853e6169ac7c1fca09d55a81bd73771758ad6be020960e1317ba`. Deleted editorial text is excluded when reading final clauses. The [published second-edition errata](https://www.w3.org/2004/03/xmlschema-errata) do not supply a replacement RE01 rule or a completeness proof for witness construction.

[PW01](content-model-s06-pw-01.md) separately records WG issue 2232's proposed occurrence adjustment; it is not an adopted XSD 1.0 correction. The universal wildcards used below have exactly `0..unbounded` bounds, where the competing occurrence readings agree. Subsequent maintainer selections are AU C1 with universal checking for source replacements, PW B and DT A; the joint handoff pins their reviewed records.

Those local selections do not settle RE01's hypothetical witness equivalence or source-incidence theorem. A selected scalar relation or source-replacement predicate is parameterized below without reopening its local decision.

## Component mapping and payload languages

[Particle Valid Extension](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-particle-extend) permits the same particle or a sequence with outer bounds `1..1` whose first member recursively preserves all base particle properties except annotations. [Particle Valid Restriction](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-particle-restrict) defines component mappings and its own pointless-compositor normalization. It does not ask an independent language-inclusion algorithm to override those mappings.

[Recurse](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-Recurse) requires a complete order-preserving mapping and requires each unmapped base member to be formally emptiable. [Particle Emptiable](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-group-emptiable) includes a group whose formal effective total range has minimum zero. The [choice range](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-choice-range) gives an empty choice a zero range.

A required empty choice therefore has `schemaEmptiable=true`, `nullable=false` and no accepted particle sequence. It is not a pointless optional empty choice. These different predicates are already separate in accepted #178 and must remain separate in the reordered witness check.

The controls `re-dead-wildcard-intermediate.xsd` and `re-dead-wildcard-final-restriction.xsd` have explicitly limited primary scope: normative component mapping only. A formally valid restriction can have a nonempty accepted language while its dead intermediate has none. That exposes a defect in the explanatory subset claim; adding a language-inclusion check would change the contract under investigation.

## Independent contrasts

The [fixed research manifest](../test/conformance/fixtures/xsd/re01/expectations.json) keeps primary recommendations, historical primary scope and each reference engine's observations separate. Eight original fixtures are copied byte-for-byte from the pinned draft with source revision, original directory and per-file SHA-256. Three additional fixtures independently contrast normalization and hypothetical AU incidence.

| Contrast | Formal result or remaining condition | XMLSchema 4.2.0 | libxml2 2.14.6 |
|---|---|---|---|
| Optional particle string restored as string | Vacuous witness | Accept | Accept |
| Optional particle string restored as token | Vacuous witness | Accept | Accept |
| Optional particle string restored as int | Dead separator and wildcard witness | Accept | Accept |
| Optional attribute string restored as string | Vacuous witness | Reject | Accept |
| Optional attribute string restored as token | Vacuous witness | Reject | Accept |
| Optional attribute string restored as int | Violates original attribute type preservation | Reject | Accept |
| Dead wildcard intermediate | Component mapping only | Reject | Accept |
| Restriction of dead wildcard intermediate | Component mapping only | Reject | Accept |
| Empty ancestor and repeated final sequence | Universal wildcard with no separator | Accept | Accept |
| Original chain with surviving fixed 1 and added fixed 2 AUs | RE equality/source-incidence gate | Reject | Reject |
| Hypothetical source with the same two AU predicates inherited | RE equality/source-incidence gate | Reject | Reject |

The particle-int row's pinned historical primary outcome remains `unresolved`; the new recommendation is explicitly identified as conditional on adopting the numbered-rule reading. This record does not silently rewrite that historical manifest or turn agreement among engines into authority.

### Particle integer restoration

Let `A` contain optional local `a:xs:string`, let a restriction remove it, and let the final extension restore required `a:xs:int`. A vacuous intermediate cannot satisfy `NameAndTypeOK`, and an intermediate containing both named declarations fails element-declaration consistency.

Instead construct `E=sequence(A, choice(), any[0..unbounded, ##any, skip])`. The first member preserves `A` exactly; the separator remains required and has no realization; the wildcard introduces no second named `a` declaration. The final `a:xs:int` maps to the wildcard through `NSCompat`, while `A` and the required empty choice are formally emptiable unmapped base members.

The wildcard cannot be reached after the required empty choice, so it introduces no competing reachable attribution position. The intermediate preserves the original `A` attribution behavior; no new named declaration introduces an EDC conflict. This is precisely the component-mapping witness preserved by the two pinned controls, not a payload subset proof.

### Attribute integer restoration

Every valid intermediate extension retains an attribute declaration with the original QName and original simple type, by `cos-ct-extends` 1.2. Distinct declarations with that QName are forbidden by `ct-props-correct` 4. An added attribute wildcard does not make an existing matching declaration disappear from the restriction rule.

The final integer attribute cannot be validly derived from the retained original string type under [complex restriction](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#derivation-ok-restriction) 2.1.2. This negative proof uses type preservation and QName uniqueness, rather than exhausting a candidate list. String and token restrictions satisfy the corresponding original type requirement; their optional-use and fixed/default constraints must still be checked independently.

### Pointless-prefix contrast

[The new schema](../test/conformance/fixtures/xsd/re01/pointless-prefix-repeated-final.xsd) starts with empty `A`, extends to a repeating choice, restricts to exactly seventeen `a,b` pairs, and performs a vacuous final extension. It independently exercises `MapAndSum`, repeated composite bounds and the reordered ancestor selection.

Appending a required empty choice plus wildcard preserves an outer `1..1` sequence, which cannot absorb the final repeated root through the sequence occurrence rule. A genuinely absent/pointless prefix instead permits a single `0..unbounded` wildcard without a separator, so normalization yields that wildcard as the complete intermediate particle. Every final group can restrict it under the agreed universal-wildcard case.

An empty accepted language is not enough to take this branch. A required empty choice remains a meaningful particle and must never be converted to an absent prefix merely because it has no realizations or no terminal positions.

## Proposed finite particle family

The following is a conditional particle lemma over certified component views. It is not yet the complete complex-type decision procedure required for #234 closure. Its preconditions identify exactly which obligations remain outside the executable probe.

The owning component checker supplies source-valid schema operands, restriction-normalized views, the formal emptiability of the actual corresponding normalized members, and a complete restriction predicate for each original pair used by the mapping. It separately certifies the generated intermediate's `final`, mixed-content parity, all-group placement, source mapping and other component constraints.

### Candidates

| Ancestor component view | Candidate family |
|---|---|
| Any existing particle | Vacuous extension followed by checked restriction of the original pair |
| Actually absent or pointless prefix | One `##any/skip` wildcard with `0..unbounded` bounds |
| Meaningful prefix, legal nonvacuous extension | Original prefix, required empty choice, one universal wildcard per unmatched final direct member |

The meaningful-prefix candidate applies to a final normalized element or a normalized sequence whose root bounds are `1..1`. A final element uses `RecurseAsIfGroup`; a sequence uses `Recurse`. All members matched to the ancestor retain original identity and bounds; each unmatched tail member maps to its own wildcard.

One wildcard is insufficient for several remaining direct sequence members: the order-preserving mapping must send successive restricted members to successive base members. The construction therefore uses at most the number of final direct members, instead of expanding repetitions or guessing an arbitrary candidate-length cutoff.

An ancestor with a non-pointless all group cannot simply be embedded in the sequence candidate. `cos-all-limited` still applies before approval; vacuous witnesses remain possible. The executable probe makes the nonvacuous extension predicate an explicit caller input instead of declaring all such types outside the approved profile.

### Mapping and termination

Use states `(i,j)` for the counts of final direct members and original prefix members already considered. Skip prefix member `j` only if it is formally emptiable; match final member `i` only if the owning component-restriction predicate proves it restricts prefix member `j`. Both transitions increase `j`, and matching also increases `i`.

Reaching the end of the prefix yields a witness with one wildcard for each remaining final member. Cache each state and its predecessor once; there are at most `(r+1)(b+1)` states and no fixed-point iteration across element type references. Legal recursive element/type edges remain atomic IDs; forbidden containment/group cycles belong to S05.

The direct restriction predicate terminates according to its owning contract. Given that contract, the finite mapping search terminates with a witness, a failed family or an unresolved predicate. The probe's failed family result is `unresolved`, never `invalid-schema`.

### Conditional completeness argument

For a meaningful prefix, `cos-particle-extend` fixes every nonvacuous intermediate's outer sequence and original first member. Pointless normalization preserves the remaining meaningful original prefix; any valid final sequence mapping first consumes a prefix of final direct members in that original prefix. Each remaining final member mapped into an arbitrary suffix can instead map to its own universal wildcard.

The required empty choice makes every added wildcard unreachable without adding a named declaration. Its formal emptiability permits skipping it during `Recurse`; each universal wildcard can absorb any restricted leaf or group under the agreed `0..unbounded` rule. Thus a valid ordered prefix mapping supplies a constructive witness independent of the original extension suffixes.

For a genuinely absent/pointless prefix, no original meaningful particle must remain before the suffix. A single universal wildcard suffices after normalization and admits all finite or unbounded original repetitions in the group-to-wildcard rule. This separate branch is required by the repeated-root contrast above.

This argument is a useful finite particle construction, not a published or accepted full-domain theorem. Before using failed family search as a negative proof, independent review must establish that every source-valid normalization path, all placement and component identity case falls into these branches and that the full type's AU/scalar constraints can be synthesized consistently. The prototype intentionally refuses to infer that theorem from its positive tests.

## Pure input and output contract

The proposed production input is immutable accepted analysis plus a specific extension type and its original ancestor chain. It retains original particles/group uses, local and group-use bounds, original attribute uses/declarations, wildcard namespace/process contexts, scalar and element fixed/default operands, `final`/`block`, content mode and all source/QName/chameleon context. An effective interval or flattened attribute object is insufficient.

The research [probe](../test/research/re01/witness_probe.py) accepts small prepared `View` records with original source IDs, exact decimal occurrence strings and atomic original type references. A certified preparation stage is an explicit precondition; it performs no schema loading, normalization, occurrence arithmetic, datatype interpretation or payload matching. The pair predicate is supplied separately and charges the same budget.

| Result | Meaning |
|---|---|
| `particle-witness` | Constructive particle candidate under stated preparation/predicate preconditions |
| `unresolved` | Missing predicate authority, uncertified normalization or failed finite family without a full negative theorem |
| `resource-limit` | Request cannot finish within budget; no candidate or partial mapping survives |
| Production `invalid-schema` | Requires a proved rule violation, such as the unrelated original attribute type contrast |

Production #179 must check the complete intermediate and final restriction before emitting a type-level witness. A particle result alone cannot mark an operation supported. Rule interpretation, witness proof, production implementation support and payload validity remain separate claims.

## Parameterized sibling predicates

### AU01

[AU01](content-model-s06-au-01.md) supplies the original deduplicated AU-ID set, declaration identities, requiredness, effective value constraints and source provenance. Extension preserves all original AUs and unions local sets; QName/declaration uniqueness is checked before restriction. It does not replace inherited uses with a scalar keyed by QName.

For a single unambiguous base use, restriction preserves requiredness, checks valid simple-type derivation and retains applicable fixed constraints. The selected multi-use contract checks each actual source replacement against every matching original base use; omission retains the original use set unchanged. It does not cross-check every retained inherited fixed use against every other retained use.

Adding an intermediate `##any/skip` attribute wildcard appears sufficient for final QNames absent from the preserved base AU set. A complete finite AU witness theorem must additionally specify hypothetical source incidence and final component equivalence, as detailed below. A wildcard cannot bypass the selected checks for an actual replacement of a matching QName.

### PW01

[PW01](content-model-s06-pw-01.md) supplies normalized particle-to-wildcard restriction, namespace subset/compatibility and process strength, with exact formal total range and original wildcard declaration contexts. The universal `0..unbounded` member is unaffected by the alternative member-minimum interpretations: every nonnegative local bound is contained, with unbounded maximum preserved.

Pass formal ranges of the actual operand at the point where the restriction rule invokes them. Do not blindly reuse a pre-normalization group's total range after that group collapsed to an element or wildcard; conversely, do not apply pointless schema normalization to payload languages.

### DT01 and scalar relations

[DT01](content-model-s06-dt-01.md) supplies exact typed value equality and a separate ordered comparison returning less, equal, greater or indeterminate under the selected calendar contract. Original type, lexical value, QName context, list items, declared union-member order and facet layers accompany each operand. An unavailable or exhausted scalar implementation, or legitimate indeterminate ordering, must never become a false equality/type-restriction result.

The initial fixtures use string/token/int without calendar operands. Full-domain RE01 proofs depend on the reviewed selected scalar predicates where original element or attribute fixed/default constraints invoke them. No local Date-based or approximate scalar engine is introduced.

## Follow-up: finite AU synthesis and witness identity

The selected source-replacement contract gives a finite conditional AU synthesis direction. It also exposes a specific missing RE01 theorem about the final hypothetical type's identity and representation. This gap belongs to reordered witnesses, rather than reopening AU01's selected predicate for real source declarations.

### Why the minimal intermediate is insufficient

Let `A` contain an optional AU to global declaration `g:xs:int`, with use-fixed value `1` and no declaration-fixed constraint. Let the final type retain that original AU and add a second optional AU to the same global declaration, use-fixed `2`. The selected C1 rule admits those individually valid schema components and preserves both predicates, even though no instance satisfies them.

If a hypothetical intermediate contains only the original AU plus an attribute wildcard, declaring both final uses as source replacements forces fixed `2` to be checked against the original fixed `1`, so the replacement fails. Instead, an intermediate can extend with the second use and a vacuous final restriction can inherit both unchanged. Thus source replacement and source omission must remain distinct during witness synthesis.

[The original-source fixture](../test/conformance/fixtures/xsd/re01/au-source-original.xsd) combines that AU contrast with removal/restoration of optional particle `a`, restored as integer. [The hypothetical-source fixture](../test/conformance/fixtures/xsd/re01/au-source-witness.xsd) supplies the required empty-choice/wildcard intermediate and puts fixed `2` in the intermediate extension, while the final restriction omits attribute `g`. Both reference engines reject both schemas; those observations do not decide the selected C1 or RE equality question.

The final AU predicates and global declaration reference have the same values and incidence pattern in the two sources. The new direct AU occurs under original `D` in one source and intermediate `E` in the other, however, so these are different newly mapped AU components. The committed reference check explicitly verifies the changed source contribution and does not label the new component as the original inherited ID.

### Conditional finite AU criterion

Assume that final witness equality and source representation have been specified and proved for the following construction. Partition original ancestor and final AU sets by expanded QName, preserving distinct AU identities, declaration identity, original scalar references and original typed constraints. Every intermediate retains the ancestor's original AU set.

For an ancestor QName whose original AU set is contained in the intended final set, add the extra final uses in the first extension and omit that QName in the final restriction. For any other ancestor QName, keep only its original uses in the intermediate and construct the final set as source replacement; each replacement must pass every original matching base-use predicate. An empty final set instead needs a legal prohibition of every original optional use; an original required use makes that branch impossible.

For QNames absent from the ancestor, a universal intermediate attribute wildcard admits the final source declarations. The wildcard's `##any/skip` namespace/process combination is an expressible XSD 1.0 extension union and supports every legal final wildcard restriction. It adds no second ID-derived declaration to the intermediate.

Necessity of the replacement/prohibition branches follows from preservation: arbitrary additional intermediate uses cannot remove an original base use. Omission can only inherit a final set containing all originals; actual source replacement must check every original match under the selected contract. Additional uses cannot rescue a replacement that fails an original predicate.

The remaining sufficiency obligation is not a search bound. It is to prove that adding the final extra uses in the intermediate and inheriting them produces the same permissible final type definition, with the required AU identity/sharing and declaration-scope incidence, under the chosen RE equality rule. Direct attribute syntax creates fresh AU components; group references can reuse existing members but cannot automatically reference an arbitrary direct use owned by `D`.

### Primary evidence about component identity

[Components and Properties](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#scIntro) models a schema as a labeled directed graph and states:

> Equality of components for the purposes of this specification is always defined as equality of names (including target namespaces) within symbol spaces.

The added [component-identity note](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#no-identity) under Type Derivation OK expressly qualifies the identity relation:

> The wording of clause 2.1 above appeals to a notion of component identity which is only incompletely defined by this version of this specification.

It identifies named top-level components, necessarily identical types and identity by construction, including inherited attribute declarations, as settled cases. It then states:

> In other cases two conforming implementations may disagree as to whether components are identical.

[Attribute Use properties](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#AU_details) are requiredness, attribute declaration and value constraint. They contain no intrinsic original-source owner or source-replacement flag; those arise from representation mapping. [Attribute declaration scope](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#Attribute_Declaration_details) does carry a global or owning-complex-type scope, with separate treatment for group declarations.

[Schema Information](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#sic-schema) defines an information item isomorphic to a component for PSVI contributions. It supplies useful graph vocabulary, but does not by itself adopt isomorphic unnamed components as identical reordered witnesses. The abstract-model description likewise does not automatically discharge source-representability.

### Concrete equality options

| RE witness equality option | Benefit | Missing obligation or compatibility effect |
|---|---|---|
| Literal original component identities | Strong operand retention | Arbitrary direct AU sharing may lack an XML source representation |
| Abstract component sharing without source reconstruction | Finite AU set construction | Must justify this as the numbered rule's intended witness domain |
| Source-representable final type with incidence-preserving bijection | Represents fresh intermediate AUs honestly | Must define permitted renaming and preservation of local scopes and scalar identities |
| Property-only AU or QName equality | Simple comparison | Loses duplicate-use sharing and can erase original constraints |

The recommended research direction is an explicit property-and-incidence-preserving bijection for hypothetical artifacts, with all real original operands immutable and provenance retained. It must fix named/global declaration references, distinguish distinct versus shared AU members, preserve requiredness and original typed fixed/default constraints, respect local declaration scopes and anonymous scalar derivation identity, and identify which hypothetical source determines replacement versus omission. This is a concrete proposal awaiting proof and independent review, rather than an accepted replacement for literal original identities.

The original real `D` source and its AU plan never change. A hypothetical restriction uses its own declared local/group contributions to classify replacement; it cannot reuse the real original `D` contribution flags while pretending freshly constructed intermediate uses were already inherited. A witness-to-original correspondence would retain original source operands as diagnostic/provenance targets instead of rewriting their IDs or context.

### Other finite full-type obligations

Content categories give further necessary cases. A simple-content ancestor can only extend with the same scalar component; its final scalar restriction therefore needs the original scalar derivation predicate. An ancestor with particle content cannot make its formal minimum smaller by appending a suffix; a final empty-content restriction or mixed-to-simple restriction consequently requires the ancestor's formal emptiability.

A meaningful all-group ancestor allows the vacuous particle candidate but cannot be embedded in a new sequence that violates `cos-all-limited`. A genuinely absent/pointless particle uses the separate universal-wildcard branch. Mixed parity, original ancestor `final` exclusion of extension and the final type's local/scalar component incidence remain explicit inputs to the complete theorem; element/type recursion stays atomic and no finite repetition is expanded.

These observations reduce the missing proof to finite component categories and the witness equality/representation theorem above. They do not yet prove a complete terminating negative criterion for every source-valid normalization, anonymous scalar identity and AU incidence case. No additional incomplete search or diagnostic-only profile is approved as a substitute.

## Resource accounting and reproducibility

The narrow probe independently uses inclusive defaults of 100,000 indexed view nodes and 1,000,000 work steps, with positive safe-integer overrides. Nodes, edge/stack references, source/bound/type-reference text, pending state records, predecessor records, mapping output and synthetic prefix/separator/suffix construction are charged before allocation. A failed charge never increments usage past the configured bound.

The input already belongs to the caller; measurements cover probe indexing and copying, rather than charging construction of the caller's fixture. Shared DAG references are indexed once and never expanded into trees. Source occurrence strings are retained exactly; the probe neither converts them to machine numbers nor allocates repeated events.

The production preparation stage must separately charge original graph indexing, pointless normalization and normalized-view copying before allocation, using the existing semantic budget. The prototype does not claim that omitted stage implemented. S03/S04 limits, conservative cyclic depth and D09's later payload/matcher/output owners remain unchanged.

### Commands

The coordinator's fresh `npm run reference:setup` provides the pinned reference runtime. On a fresh delivery checkout, use the declared setup and the existing full discovery lane:

```bash
npm run reference:setup
npm run test:reference:full
tmp/conformance/reference-venv/bin/python test/research/re01/measure.py
```

The last command uses the setup environment's POSIX Python path explicitly; setup does not activate the caller's `PATH`. On Windows, substitute `tmp/conformance/reference-venv/Scripts/python.exe`. A focused POSIX command is `tmp/conformance/reference-venv/bin/python -m unittest discover -s test/conformance/reference -p 's06_re01_contract_test.py' -v`.

The reference runner's `*_test.py` discovery includes this filename; a zero-match run is not acceptance. The development leaf used the coordinator's declared freshly installed reference runtime for those focused commands.

### Recorded development evidence

The focused probe uses Python 3.12.14, XMLSchema 4.2.0, lxml 6.1.0 and libxml2 2.14.6. Eighteen focused test methods cover eleven schemas, fixed engine observations, instance and hypothetical-incidence contrasts, explicit premise tables, conditional witnesses, failed-family classification and budget boundaries. The pair-premise tables and asserted expected witnesses are written independently in the test; no production helper or prototype result generates those expectations.

The premise-table tests validate finite construction control flow and accounting, rather than proving the original pair premises themselves. The fixture/reference contrasts independently support the selected simple cases; full source normalization, type legality and AU/scalar premises remain external and unresolved where this record says so.

| Input | Result | Nodes | Charged work |
|---|---|---|---|
| Dead/wildcard particle witness, work limit 29 | Conditional particle witness | 2 | 29 |
| Same witness, work limit 28 | Resource limit | 2 | 28 |
| Two hundred-digit exact finite maximum | Conditional particle witness | 2 | 228 |
| Shared binary DAG, depth 20 | Conditional particle witness | 21 | 218 |
| Default node limit at 100,000 | Conditional particle witness | 100,000 | 600,007 |
| Default node limit with 100,001 inputs | Resource limit | 100,000 indexed | 600,006 |
| Adversarial prefix state search | Resource limit | 1,603 | 1,000,000 |

[The measurement program](../test/research/re01/measure.py) reproduces those deterministic counts without ignored logs. The shared-DAG terminal retains a recursive type-reference ID; this measures nonexpansion of legal element/type recursion, not an implementation of recursive payload validity. The adversarial exhaustion reports no partial successful witness and no invalidity.

The coordinator owns the final `ci`, full reference, conformance, installed-consumer and documentation/support-matrix checks on the integrated tree. Those results and the exact reviewed commit are recorded in the joint handoff; the old #231 results do not substitute. IDE inspections are unavailable in this environment; repository-local checks and independent review supply verification.

## Missing proof, options and recommendation

The unresolved implementation obligation is precise: prove a terminating negative criterion for every approved complex type, including source-valid pointless normalization/all placement, mixed-to-simple and simple-content restrictions, original final/block/type identity, and AU witness equality/representation. Selected sibling predicates discharge their own interpretation questions; they do not supply that RE theorem. The finite particle family demonstrates useful constructive progress; its failure cannot yet establish that no full type witness exists.

| Option | Consequence | Recommendation |
|---|---|---|
| Formal existential component rule with complete proof | Preserves legal restorations and dead/wildcard controls | Continue this direction |
| Explanatory no-addback prohibition | Rejects known vacuous witnesses and narrows profile | Reject |
| Copy original extension suffixes only | Misses integer wildcard and pointless-prefix witnesses | Reject |
| Add payload-language inclusion to component legality | Changes the approved rule and downstream ownership | Requires explicit contract decision |
| Treat bounded failed search as invalid | Unsound negative result | Reject |
| Approve only an easier derivation profile | New permanent exclusion, not authorized here | Reject |

No maintainer preference among those alternatives can manufacture the missing completeness proof. If a rule change is considered, present its concrete compatibility effect separately; keep the affected qualification open while continuing the already valid positive evidence and sibling research.

## Exact #179 integration handoff

Keep `checkReorderedDerivation` guarded until the full proof and sibling predicate assumptions are reviewed. Then replace its ancestor-scan refusal with a pure complete witness decision fed by the existing `prepareResolvedCompilationInput` and the single accepted occurrence analysis. Validate every original derivation and retain all original operands before attempting reordering.

Integrate the reviewed component normalization/prefix extraction and certified candidate construction into `particleSchemaAssessment`, rather than creating another occurrence or payload engine. Feed original AU sets and exact typed fixed/default predicates through the existing attribute/scalar owners; validate hypothetical intermediate component constraints and the final complete restriction. Charge every preparation, pair state and copy before allocation.

Add regressions for all eleven fixture contrasts, required empty choice versus optional/absent choice, multiple unrelated suffix members, all-root vacuity and nonvacuous limitations, mixed/simple transitions, final/block preservation, fixed/default alias contexts and multiple matching original AUs. Include recursive type references, shared DAGs, huge exact repetitions and at/beyond-budget request-wide failure without partial operations.

Only a complete reviewed type-level result can discharge `S06-RE-01` for an affected operation. Complete RE01 acceptance, full production #179 tests and combined #153 acceptance remain distinct gates; this research record changes no public support claim.
