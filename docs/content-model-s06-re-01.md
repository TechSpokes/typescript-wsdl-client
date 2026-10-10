# S06 RE01: Reordered Derivation Research

Formal component witnesses, a finite particle construction and the remaining full-domain proof. See the root [README](../README.md).

## Delivery status and scope

Issue [#234](https://github.com/TechSpokes/typescript-wsdl-client/issues/234) remains open for complete decision-procedure acceptance. This record recommends the numbered existential rule and supplies executable positive feasibility evidence, including the counterexamples that defeat suffix copying. It does not certify a complete negative procedure over the approved profile.

The standalone [#256 resolver specification](content-model-s06-re-01-resolver.md) fixes the D1/E2 research context, identity, membership/comparison boundaries, predicate ownership and ordered implementation handoff. Its retained-substitution negative control qualifies an explicit context; neither the specification nor that control discharges the full witness theorem below.

The research owner is the RE01 agent in epic #232; substantive review belongs to the separately assigned epic reviewer. The coordinator records the exact reviewed revision and findings in the joint handoff. No production assessment guard, profile exclusion, catalog format or legacy default changes here.

The baseline is accepted main `5876065b00d4eeb6d2324eaa63ff9b70e2279198`. The unaccepted assessment draft is inspected at `460f5b8379c68ffef79917284e445b5ab046429e`, without importing its assessment modules. [Composition](content-model-composition.md), [analysis](content-model-analysis.md) and [ADR-003](decisions/003-content-model-contracts.md) retain their existing owners and contracts.

The maintainer [accepted NT-CONT-01 for #239](https://github.com/TechSpokes/typescript-wsdl-client/issues/239#issuecomment-6098237195), allowing Node tooling to combine one live libxml2 engine, independent scoped TypeScript checks and historical xmlschema observations. The [reference-validation contract](reference-validation.md) states the remaining unqualified capabilities; that tooling decision does not supply the missing RE01 witness-equivalence or completeness proof.

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

The [fixed research manifest](../test/conformance/fixtures/xsd/re01/expectations.json) keeps primary recommendations, historical primary scope and each historical reference engine's observations separate. Eight original fixtures are copied byte-for-byte from the pinned draft with source revision, original directory and per-file SHA-256. Three additional fixtures independently contrast normalization and hypothetical AU incidence.

| Contrast | Formal result or remaining condition | Historical XMLSchema 4.2.0 | Historical libxml2 2.14.6 |
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

[The current scoped reference tests](../test/conformance/reference/s06-re01-contract.test.ts) verify all eleven original fixture hashes and obtain fresh primary observations from `libxml2-wasm` 0.7.2/libxml2 2.15.1. Exact seventeen-pair payload checks and original versus hypothetical AU source-node identities remain separate selected assertions; fresh full-schema secondary validation remains unqualified.

### Particle integer restoration

Let `A` contain optional local `a:xs:string`, let a restriction remove it, and let the final extension restore required `a:xs:int`. A vacuous intermediate cannot satisfy `NameAndTypeOK`, and an intermediate containing both named declarations fails element-declaration consistency.

Instead construct `E=sequence(A, choice(), any[0..unbounded, ##any, skip])`. The first member preserves `A` exactly; the separator remains required and has no realization; the wildcard introduces no second named `a` declaration. The final `a:xs:int` maps to the wildcard through `NSCompat`, while `A` and the required empty choice are formally emptiable unmapped base members.

The wildcard cannot be reached after the required empty choice, so it introduces no competing reachable attribution position. The intermediate preserves the original `A` attribution behavior; no new named declaration introduces an EDC conflict. This is precisely the component-mapping witness preserved by the two pinned controls, not a payload subset proof.

### Attribute integer restoration

Every valid intermediate extension retains an attribute declaration with the original QName and original simple type, by `cos-ct-extends` 1.2. Distinct declarations with that QName are forbidden by `ct-props-correct` 4. An added attribute wildcard does not make an existing matching declaration disappear from the restriction rule.

The final integer attribute cannot be validly derived from the retained original string type under [complex restriction](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#derivation-ok-restriction) 2.1.2. This negative proof uses type preservation and QName uniqueness, rather than exhausting a candidate list. String and token restrictions satisfy the corresponding original type requirement; their optional-use and fixed/default constraints must still be checked independently.

### Pointless-prefix contrast

[The new schema](../test/conformance/fixtures/xsd/re01/pointless-prefix-repeated-final.xsd) starts with empty `A`, extends to a repeating choice, restricts to exactly seventeen `a,b` pairs, and performs a vacuous final extension. It independently exercises `MapAndSum`, repeated composite bounds and the reordered ancestor selection.

Appending a required empty choice plus wildcard preserves an outer `1..1` sequence, which cannot absorb the final repeated root through the sequence occurrence rule. A prefix absent after certified source mapping permits a single `0..unbounded` wildcard without a separator when the original raw extension checks pass, so normalization yields that wildcard as the complete intermediate particle. Every final group can restrict it under the agreed universal-wildcard case. Restriction-only pointlessness is insufficient for this branch.

An empty accepted language is not enough to take this branch. A required empty choice remains a meaningful particle and must never be converted to an absent prefix merely because it has no realizations or no terminal positions.

## Proposed finite particle family

The following is a conditional particle lemma over certified component views. It is not yet the complete complex-type decision procedure required for #234 closure. Its preconditions identify exactly which obligations remain outside the executable probe.

The owning component checker supplies source-valid schema operands, restriction-normalized views, the formal emptiability of the actual corresponding normalized members, and a complete restriction predicate for each original pair used by the mapping. It separately certifies the generated intermediate's `final`, mixed-content parity, all-group placement, source mapping and other component constraints.

### Candidates

| Ancestor component view | Candidate family |
|---|---|
| Any existing particle | Vacuous extension followed by checked restriction of the original pair |
| Source-mapped absence, with original raw extension legality certified | One `##any/skip` wildcard with `0..unbounded` bounds |
| Meaningful prefix, legal nonvacuous extension | Original prefix, required empty choice, one universal wildcard per unmatched final direct member |

The meaningful-prefix candidate applies to a final normalized element or a normalized sequence whose root bounds are `1..1`. A final element uses `RecurseAsIfGroup`; a sequence uses `Recurse`. All members matched to the ancestor retain original identity and bounds; each unmatched tail member maps to its own wildcard.

One wildcard is insufficient for several remaining direct sequence members: the order-preserving mapping must send successive restricted members to successive base members. The construction therefore uses at most the number of final direct members, instead of expanding repetitions or guessing an arbitrary candidate-length cutoff.

An ancestor whose original raw particle is an all group cannot simply be embedded in the sequence candidate, including a singleton all deemed pointless for restriction. `cos-all-limited` still applies before approval; vacuous witnesses remain possible. The executable probe makes the nonvacuous extension predicate an explicit caller input instead of declaring all such types outside the approved profile.

### Mapping and termination

Use states `(i,j)` for the counts of final direct members and original prefix members already considered. Skip prefix member `j` only if it is formally emptiable; match final member `i` only if the owning component-restriction predicate proves it restricts prefix member `j`. Both transitions increase `j`, and matching also increases `i`.

Reaching the end of the prefix yields a witness with one wildcard for each remaining final member. Cache each state and its predecessor once; there are at most `(r+1)(b+1)` states and no fixed-point iteration across element type references. Legal recursive element/type edges remain atomic IDs; forbidden containment/group cycles belong to S05.

The direct restriction predicate terminates according to its owning contract. Given that contract, the finite mapping search terminates with a witness, a failed family or an unresolved predicate. The probe's failed family result is `unresolved`, never `invalid-schema`.

### Conditional completeness argument

For a meaningful prefix, `cos-particle-extend` fixes every nonvacuous intermediate's outer sequence and original first member. Pointless normalization preserves the remaining meaningful original prefix; any valid final sequence mapping first consumes a prefix of final direct members in that original prefix. Each remaining final member mapped into an arbitrary suffix can instead map to its own universal wildcard.

The required empty choice makes every added wildcard unreachable without adding a named declaration. Its formal emptiability permits skipping it during `Recurse`; each universal wildcard can absorb any restricted leaf or group under the agreed `0..unbounded` rule. Thus a valid ordered prefix mapping supplies a constructive witness independent of the original extension suffixes.

For a prefix absent after certified source mapping, with original raw extension legality certified, no original meaningful particle must remain before the suffix. A single universal wildcard suffices after normalization and admits all finite or unbounded original repetitions in the group-to-wildcard rule. This separate branch is required by the repeated-root contrast above; restriction-only pointlessness cannot supply its premise.

This argument is a useful finite particle construction, not a published or accepted full-domain theorem. Before using failed family search as a negative proof, independent review must establish that every source-valid normalization path, all placement and component identity case falls into these branches and that the full type's AU/scalar constraints can be synthesized consistently. The prototype intentionally refuses to infer that theorem from its positive tests.

## Pure input and output contract

The proposed production input is immutable accepted analysis plus a specific extension type and its original ancestor chain. It retains original particles/group uses, local and group-use bounds, original attribute uses/declarations, wildcard namespace/process contexts, scalar and element fixed/default operands, `final`/`block`, content mode and all source/QName/chameleon context. An effective interval or flattened attribute object is insufficient.

The research [probe](../test/research/re01/witness-probe.ts) accepts small prepared `View` records with original source IDs, exact decimal occurrence strings and atomic original type references. A certified preparation stage is an explicit precondition; it performs no schema loading, normalization, occurrence arithmetic, datatype interpretation or payload matching. The pair predicate is supplied separately and charges the same budget.

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

[The original-source fixture](../test/conformance/fixtures/xsd/re01/au-source-original.xsd) combines that AU contrast with removal/restoration of optional particle `a`, restored as integer. [The hypothetical-source fixture](../test/conformance/fixtures/xsd/re01/au-source-witness.xsd) supplies the required empty-choice/wildcard intermediate and puts fixed `2` in the intermediate extension, while the final restriction omits attribute `g`. Both historical reference engines rejected both schemas; those observations do not decide the selected C1 or RE equality question.

The final AU predicates and global declaration reference have the same values and incidence pattern in the two sources. The new direct AU occurs under original `D` in one source and intermediate `E` in the other, however, so these are different newly mapped AU components. The committed reference check explicitly verifies the changed source contribution and does not label the new component as the original inherited ID.

### Shared finite AU set criterion

Partition original ancestor and final AU sets by expanded QName, preserving distinct AU identities, declaration identity, original scalar references and original typed constraints. Every intermediate retains the ancestor's original AU set. The displayed set criterion is shared by both representation proposals; the following source-construction discussion assumes `D2`'s final equality and representation obligations are specified and proved, rather than imposing those source obligations on `D1`.

For an ancestor QName whose original AU set is contained in the intended final set, add the extra final uses in the first extension and omit that QName in the final restriction. For any other ancestor QName, keep only its original uses in the intermediate and construct the final set as source replacement; each replacement must pass every original matching base-use predicate. An empty final set instead needs a legal prohibition of every original optional use; an original required use makes that branch impossible.

For QNames absent from the ancestor, a universal intermediate attribute wildcard admits the final source declarations. The wildcard's `##any/skip` namespace/process combination is an expressible XSD 1.0 extension union and supports every legal final wildcard restriction. It adds no second ID-derived declaration to the intermediate.

Necessity of the replacement/prohibition branches follows from preservation: arbitrary additional intermediate uses cannot remove an original base use. Omission can only inherit a final set containing all originals; actual source replacement must check every original match under the selected contract. Additional uses cannot rescue a replacement that fails an original predicate.

The remaining XML-source sufficiency obligation is not a search bound. It is to prove that adding the final extra uses in the intermediate and inheriting them produces the same permissible final type definition, with the required AU identity/sharing and declaration-scope incidence, under the proposed XML-domain equality rule. Direct attribute syntax creates fresh AU components; group references can reuse existing members but cannot automatically reference an arbitrary direct use owned by `D`.

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

An XML-source witness would need an explicit property-and-incidence-preserving bijection for hypothetical artifacts, with all real original operands immutable and provenance retained. It must fix named/global declaration references, distinguish distinct versus shared AU members, preserve requiredness and original typed fixed/default constraints, respect local declaration scopes and anonymous scalar derivation identity, and identify which hypothetical source determines replacement versus omission. This is a conditional proposal rather than an accepted replacement for literal original identities; the continuation below also examines an abstract-component domain.

That proposal must specify the exact comparison closure. A bijection over the final type's non-derivation component graph need not preserve the same cross-root sharing as a bijection that also anchors every original ancestor AU and every named attribute-group member. Omitting the original derivation edge is necessary for reordering, but does not by itself decide which other component identities remain anchored.

Source construction also cannot select an arbitrary subset of an existing group's AU members by referencing that group. A group reference imports its complete member set; extra members can introduce a declaration QName conflict with a use that every extension must retain from the ancestor. Copying just the desired member into direct syntax creates fresh AU/declaration components instead, so the sufficiency proof must cover complete group imports, conflicts, local scopes and any permitted bijection rather than treating group-owned uses as freely selectable references.

The original real `D` source and its AU plan never change. A hypothetical restriction uses its own declared local/group contributions to classify replacement; it cannot reuse the real original `D` contribution flags while pretending freshly constructed intermediate uses were already inherited. A witness-to-original correspondence would retain original source operands as diagnostic/provenance targets instead of rewriting their IDs or context.

### Executable named-group comparison contrast

The continuation starts from the exact unmerged [PR #254 candidate](https://github.com/TechSpokes/typescript-wsdl-client/pull/254), commit `ddd90663aa88670edcca4371f7a142d94a5d36da`, tree `f00f442b4306285c20e0f6524ae50c652e0e50b6`. Its accepted NT-CONT-01 evidence contract supplies one live Node primary, selected independent checks, pinned historical observations and explicit unqualified capabilities. None of those evidence kinds establishes RE01 completeness.

The new [original group source](../test/conformance/fixtures/xsd/re01/au-group-original.xsd) declares global `g:xs:int` and `h:xs:int`. Named group `G` contains a use of global `g` fixed to `2` and a use of global `h`; ancestor `A` instead has global `g` fixed to `1` and a distinct qualified local declaration `h:xs:int`.

Original restriction `B` prohibits optional local `A/h`, retaining `A/g`. Final extension `D` imports `G`, so its final AU set contains original `A/g`, `G/g` and `G/h`. The selected C1 rule retains both fixed `g` predicates; their empty accepted-instance set does not itself establish schema invalidity.

The [hypothetical source](../test/conformance/fixtures/xsd/re01/au-group-witness.xsd) keeps original `A`, `G` and both global declarations unchanged. Its intermediate `E` adds a fresh direct global `g` use fixed to `2`, while retaining original `A/g` and local `A/h`. A fresh one-member group `H` references global `h`; hypothetical `D` restricts `E` with `H` and omits `g`.

That final `H/h` contribution is an actual source replacement. It passes the requiredness, named scalar derivation and fixed-value predicates for the optional unconstrained original `A/h`; omitted `g` inherits original `A/g` and fresh `E/g` without turning them into replacements. Both final graphs refer to the same global declarations and named `xs:int`, avoiding an anonymous scalar or local final-scope ambiguity in this contrast.

The supplied final AU correspondence maps `A/g` to itself, `G/g` to fresh `E/g`, and `G/h` to fresh `H/h`. It preserves distinct versus shared nodes, declaration references, requiredness and exact fixed predicates. It fails if the comparison closure additionally anchors the original members of unrelated named group `G`: original `G/g` cannot simultaneously correspond to itself inside `G` and to fresh `E/g` inside hypothetical `D`.

Under an XML-source witness domain that anchors original `A`, `G` and every original group member, inherited original `G/g` requires importing all of `G` into `E`. This imports global `G/h` alongside retained local `A/h`, violating [declaration uniqueness](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#ct-props-correct), clause 4. Importing `G` in the final restriction instead checks fixed `2` against retained fixed `1` and fails the selected all-matches predicate.

Direct `ref` syntax creates a fresh AU; it cannot select an existing group's one member by its AU identity. This is a negative source-construction argument under the explicitly anchored XML domain, not a proof that the primary rule requires that domain or rules out every abstract-component witness. The primary identity qualification therefore still requires a concrete interpretation before promoting the conditional AU construction to a complete theorem.

### Supplied correspondence certificate

The bounded [incidence probe](../test/research/re01/incidence-probe.ts) checks a caller-supplied bijection over an explicitly rooted AU component projection. Its [prepared fixture views](../test/research/re01/incidence-case.ts) and [source-incidence tests](../test/conformance/reference/re01-source-incidence.test.ts) keep real source contributions separate from hypothetical copies. It does not search for a bijection, choose comparison roots, synthesize schema source, evaluate general scalar predicates or decide witness existence.

The checker preserves component kinds, supplied anchor identities, exact prepared property strings and edge multiplicities. A complete injective correspondence prevents collapsing distinct equal-predicate uses; shared declarations and local scope cycles remain references. Named/global anchor preservation and original ancestor retention depend on the caller's certified input and declared closure, rather than being established by this checker alone.

Its results are `correspondence`, `mismatch` and `resource-limit`. `Mismatch` rejects only the supplied certificate for the selected closure; it is neither schema invalidity nor a proof that no other witness exists. Malformed component graphs are input errors, and exhausted verification exposes no partial correspondence.

Work and copies are charged before allocation. Indexed entries across both input projections count against the 100,000-node default; text, edges, correspondence entries and comparison work count against 1,000,000 work steps. The [independent controls](../test/research/re01/incidence-probe.test.ts) cover equal-predicate distinct uses, fixed-value loss, named scalar/declaration anchors, changed local scope, shared cycles, exact large values, UTF-16 text and inclusive work/node boundaries.

### Witness domain and comparison decision

[Conformance](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#concepts-conformance) explicitly permits programmatically constructed component schemas without XML representation. [Layer 1](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#layer1) likewise operates at the abstract component level. Requiring XML reconstruction for every hypothetical witness is therefore an additional restriction, not a general primary component requirement.

Those clauses do not supply retain/replace/prohibit flags for an arbitrary component graph. Extending the selected actual-source replacement rule to hypothetical construction plans requires a separate RE01 interpretation. They also do not settle how recursive final-type references resolve in the reordered construction. Representation and endpoint resolution are separate obligations.

Non-XML construction must still satisfy every relevant [schema component constraint](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#conformance-schemaValidity), recursively; only representation constraints depend on XML-derived source. Layer 1 also requires established definitions and declarations to remain fixed. An abstract-domain selection cannot bypass placement, UPA, derivation or original component identity obligations.

Representation `D1` uses abstract component construction plans. The intermediate retains each original ancestor AU and may add references to individual original final AUs, without importing their whole source group. The final plan classifies each QName as retain, replace or prohibit; replacement checks every matching intermediate base use, while retention preserves its complete use set. These hypothetical flags never alter the real source contributions governed by AU01.

For the group contrast, `E` can share original `G/g` alone alongside original `A/g` and local `A/h`. The final plan retains both `g` uses and replaces `h` with original `G/h`. It preserves original group sharing and scalar identities without inventing a partial XML group import. This is a conditional AU construction, not a complete complex-type witness.

Representation `D2` requires XML-source witnesses and the final-root incidence correspondence below. It admits fresh `E/g` and `H/h` in the group contrast, retaining honest fresh provenance. It adds proof obligations for complete group imports, anonymous scalar reconstruction and local scopes. A stricter XML alternative anchors every original named-group member too, rejecting this contrast's construction.

Endpoint convention `E1` supplies hypothetical relation edges but answers recursive type queries from the immutable actual graph. Convention `E2` supplies a separate hypothetical graph overlay: recursive final-type references see the proposed endpoint's derivation, while original identities and actual ancestry remain available in the actual graph. Every relevant hypothetical component constraint must be checked in its declared context. Choosing abstract representation does not require freezing actual ancestry inside hypothetical queries.

The earlier combined `RE-M1` proposal meant `D1` with `E1`; `RE-M2` combined XML construction with an unresolved endpoint correspondence. The executable recursive contrast below shows why these bundles cannot be treated as equivalent choices of representation. Neither was accepted, and the continuation does not adopt a production interpretation.

The revised research recommendation is `D1` with `E2`: abstract construction plans plus an independently checked hypothetical overlay. It follows the primary component model, preserves original AU sharing, and can represent an existing named intermediate whose identity affects a required recursive comparison. This is a recommendation to prove and implement, not an established complete criterion. Endpoint correspondence, hypothetical contribution roles and all affected predicates remain proof obligations.

### Recursive endpoint and existing-intermediate contrast

The [original source](../test/conformance/fixtures/xsd/re01/endpoint-all-original.xsd) gives ancestor `A` a meaningful two-member all group: optional local `n:T` and optional local `m:xs:int`. Existing named `T` extends `A` vacuously. Original `B` restricts `A` to empty, and final `D` extends `B` with optional `n:D` and `m:xs:int`. Empty restriction is locally permitted because `A`'s formal minimum is zero; content recursion is distinct from a forbidden derivation cycle.

The [shadow source](../test/conformance/fixtures/xsd/re01/endpoint-all-shadow.xsd) leaves `A`, `T` and `B` unchanged and makes `D` restrict existing `T` with the same final body. It supplies a concrete two-step candidate: `A` to `T` by extension, then `T` to the hypothetical endpoint by restriction. Local `n` declarations invoke [NameAndTypeOK](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-NameAndTypeOK), clause 3.2.5, so its both-global shortcut does not apply.

The required type comparison excludes extension, list and union. Resolving `D` in the actual graph fails [TypeDerivationOK](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-ct-derived-ok), clause 1, because its final method is extension. Resolving the hypothetical endpoint passes: its method is restriction and its immediate base is exactly original `T`. Other local member properties and occurrence ranges agree, `m` uses identical `xs:int`, and the displayed derivation chains are acyclic.

The raw ancestor all has two members and neither has maximum zero. Restriction pointlessness cannot erase it. [Particle extension](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-particle-extend) must preserve it, while [all placement](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-all-limited) forbids the nested-sequence alternative. The mandatory final `n` can only map to original `n:T`. Under the actual-query convention this gives a conditional particle obstruction; the hypothetical convention admits the displayed candidate. This is not a generic negative-schema procedure or a claim that the primary text has settled endpoint correspondence.

Existing `T` is essential to this comparison. Replacing it with fresh `T-copy` having identical content and base `A` loses immediate-base equality with the anchored expected type `T`; traversal then reaches an excluded extension edge. A complete finite family must account for relevant original intermediate identities, or prove when freshness is harmless. Enumerating only a fresh type for each particle shape is insufficient without that proof.

The [endpoint controls](../test/conformance/reference/re01-endpoint-continuation.test.ts) retain sourced clause premises and conditional probe outcomes separately from live primary observations. Both sources and their empty root instances are accepted by the current primary. Those observations do not select the endpoint interpretation or establish full witness completeness, substitution-group invariance, anonymous identity or source normalization.

### Code-grounded implementation direction

The [canonical graph](../src/compiler/canonicalGraph.ts) already uses immutable nodes, named/global identity keys, owner-scoped local IDs and explicit derivation references. Its [semantic validator](../src/compiler/validateSemanticGraph.ts) checks those identities, owners, source contexts and all placement. A hypothetical overlay should preserve that actual graph and diagnostic provenance, supplying proposed derivation and component views through an explicit resolver rather than mutating a global node.

The [composition projection](../src/compiler/composeCanonicalGraph.ts) collapses effective attributes by expanded QName. It cannot serve as the original AU identity set for this theorem. Construction plans must read source-level use/declaration identities from the graph and retain every selected fixed/default obligation.

The inspected, unaccepted [#231 assessment context](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/src/compiler/schemaAssessmentContext.ts) resolves one actual node index. Its [scalar derivation helper](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/src/compiler/scalarSchemaAssessment.ts) follows that index, and its [particle assessment](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/src/compiler/particleSchemaAssessment.ts) invokes the restriction-only type predicate. Reusing those answers unchanged would bake the actual-query convention into a hypothetical witness. These are read-only architectural inputs, not imported runtime helpers.

The implementing owner should first specify actual versus hypothetical resolution and endpoint comparison closure, then implement a bounded research resolver with explicit context. Cache keys must include the context, compared identities and excluded methods; preparation and copies must charge before allocation. Content recursion remains references, and the hypothetical derivation graph must remain acyclic. Hypothetical checks must re-evaluate relevant component constraints, including substitution affiliation and UPA/EDC where changed ancestry affects them, rather than assuming actual-schema validity transfers.

Acceptance of that focused prerequisite requires the all-group contrast to distinguish actual and hypothetical queries, retain the original graph byte-for-byte, preserve named intermediate identity, and isolate cached results across contexts. It must also reject an explicitly illegal hypothetical context and return resource-limit at inclusive boundaries without a partial result. Passing that prerequisite would still leave candidate completeness, source-faithful normalization, full content/AU integration and the negative-answer theorem open.

### Conditional abstract AU theorem

Under `D1`'s plan algebra, the finite AU criterion above is necessary and sufficient for the AU projection. For each ancestor QName whose AU set is contained in the final set, choose that final set in the intermediate and retain it. Otherwise retain only the original ancestor set in the intermediate and replace it with the final set, or prohibit it when the final set is empty. New QNames are supplied in the final restriction through the intermediate universal wildcard.

Necessity follows because extension cannot discard an original ancestor use: retention must include it, replacement must pass every original matching use, and prohibition cannot discard an original required use. Adding more intermediate uses cannot repair a failed check against an original one.

Sufficiency follows from the displayed construction, conditional on validated original uses and the selected scalar/wildcard predicates. For each nonempty retained QName, final declaration uniqueness forces every extra use to reference that QName's original ancestor declaration, so adding uses introduces neither a new declaration nor an ID-derived declaration slot. A replacement branch keeps the ancestor unchanged until restriction. New-QName uses appear only in the final restriction, preserving the ancestor's intermediate declaration uniqueness and ID-derived declaration count.

The procedure is finite over original AU references and does not expand occurrence counts or copy scalar graphs. Missing authority remains unresolved and exhausted accounting remains resource-limit. This theorem does not discharge particle/content categories, complete component legality, endpoint reflection, or the full RE01 negative proof.

### Source correspondence and remaining obligations

For an otherwise certified XML two-step construction, the proposed final-root correspondence allows fresh hypothetical AUs while fixing named/global declaration and type references, retained original ancestor AUs and the final sharing pattern. Original unrelated group-member identities are not additional comparison roots merely because the real source originally imported that group. Fresh components retain fresh hypothetical provenance and a separate correspondence to immutable real operands.

The stricter alternative additionally anchors every original named-group member, rejecting the supplied construction in this contrast. Abstract component sharing is a separate witness-domain possibility; it cannot be silently equated with constructing XML source. The dated specification's unnamed-identity qualification does not settle these choices.

If the XML-source domain is selected, the recommendation within that domain is the explicit final property-and-incidence correspondence. A selection would admit this class of certified constructions; it would not prove complete source synthesis, permit arbitrary local-scope changes or settle copying anonymous scalar subgraphs. Those obligations, recursive named-type references and hypothetical derivation-query behavior remain part of the full RE01 theorem.

### Other finite full-type obligations

Content categories give further necessary cases. A simple-content ancestor can only extend with the same scalar component; its final scalar restriction therefore needs the original scalar derivation predicate. An ancestor with particle content cannot make its formal minimum smaller by appending a suffix; a final empty-content restriction or mixed-to-simple restriction consequently requires the ancestor's formal emptiability.

A meaningful all-group ancestor allows the vacuous particle candidate but cannot be embedded in a new sequence that violates `cos-all-limited`. The universal-wildcard branch requires certified particle absence and legality for the original raw extension operand; restriction-only pointlessness cannot authorize it. Mixed parity, original ancestor `final` exclusion of extension and the final type's local/scalar component incidence remain explicit inputs to the complete theorem; element/type recursion stays atomic and no finite repetition is expanded.

These observations identify finite component categories and the witness equality/representation theorem above. A complete candidate reduction must additionally account for original intermediate identities and context-sensitive endpoint predicates. They do not yet prove a complete terminating negative criterion for every source-valid normalization, anonymous scalar identity and AU incidence case. No additional incomplete search or diagnostic-only profile is approved as a substitute.

### Original particles and nontransitive restriction

The [particle continuation controls](../test/conformance/reference/re01-particle-continuation.test.ts) independently demonstrate why legal original edges cannot substitute for the proposed direct comparison. In [the chain](../test/conformance/fixtures/xsd/re01/particle-map-and-sum-chain.xsd), `A` is a choice repeated exactly twice over optional `a` and `b`, `B` is a sequence occurring exactly once over optional `a` and `b`, and `D` retains only optional `a`.

[MapAndSum](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-MapAndSum), clause 2, uses the restricted root's occurrence bounds multiplied by its direct member count, giving `2..2` for `B`. The optional matching members support `B` restricting `A`; [RecurseAsIfGroup](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-RecurseAsIfGroup) and [Recurse](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-Recurse) permit `D` restricting `B` while skipping optional `b`. Direct `D` against `A` instead has synthetic choice bounds `1..1`, failing `range-ok` against `2..2`.

This fixed component-relation contrast prevents assuming general particle-restriction transitivity from the original `A` to `B` to `D` path. It does not reject every reordered witness or replace a proof of complete complex-type derivation. The live primary accepts the separate step, chain and direct schemas; that observation does not establish the component relation's transitivity.

An [original singleton all](../test/conformance/fixtures/xsd/re01/particle-singleton-all-nested-extension.xsd) supplies another preparation obligation. An optional all group containing exactly one required `a` is called pointless by the restriction qualification, but its raw formal minimum is zero and its original all-group placement remains constrained. Particle extension preserves the original first member recursively, and `cos-all-limited` forbids embedding that all group in the new extension sequence.

Erasing the singleton wrapper and treating the resulting element as source-extendable loses both the original placement condition and its wrapper occurrence context. The probe's certified normalized restriction view must therefore remain distinct from its original extension operand and preparation certificate. Its [vacuous control](../test/conformance/fixtures/xsd/re01/particle-singleton-all-vacuous.xsd) is accepted, whereas the nested-all extension is rejected by the live primary.

The [final-exclusion control](../test/conformance/fixtures/xsd/re01/particle-final-extension-prohibited.xsd) additionally rejects an extension whose original base has `final="extension"`, even when the particle is unchanged. No vacuous particle witness can bypass that complete-type condition. Existing probe refusal remains `unresolved` until the owning full-type proof supplies authority for a negative answer.

The [ordinary simple-content chain](../test/conformance/fixtures/xsd/re01/particle-simple-content-original-chain.xsd) extends named `xs:string`. The designated ancestor can still be simple `anySimpleType`, whose base is `anyType`; ordinary simple-content chains cannot be excluded merely because the designated ancestor is a built-in component. The [inline anchor](../test/conformance/fixtures/xsd/re01/particle-simple-content-inline-anchor-witness.xsd) and [no-inline restriction](../test/conformance/fixtures/xsd/re01/particle-simple-content-no-inline-restriction.xsd) are accepted live observations, not complete identity proofs.

The no-inline mapping invokes [simple restriction](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#st-restrict-facets), which constrains variety and facets but does not establish that an empty-facet restriction must create a fresh anonymous scalar. The inline syntax supplies an unnamed source component; equality of the complete mapped scalar remains qualified. No source-impossibility conclusion rests on assumed fresh anonymous identity.

## Resource accounting and reproducibility

The narrow probe independently uses inclusive defaults of 100,000 indexed view nodes and 1,000,000 work steps, with positive safe-integer overrides. Nodes, edge/stack references, source/bound/type-reference text, pending state records, predecessor records, mapping output and synthetic prefix/separator/suffix construction are charged before allocation. A failed charge never increments usage past the configured bound.

The input already belongs to the caller; measurements cover probe indexing and copying, rather than charging construction of the caller's fixture. Shared DAG references are indexed once and never expanded into trees. Source occurrence strings are retained exactly; the probe neither converts them to machine numbers nor allocates repeated events.

The production preparation stage must separately charge original graph indexing, pointless normalization and normalized-view copying before allocation, using the existing semantic budget. The prototype does not claim that omitted stage implemented. S03/S04 limits, conservative cyclic depth and D09's later payload/matcher/output owners remain unchanged.

### Commands

On Node 24 or Node 26, reproduce the current pure research and scoped reference checks after normal npm installation:

```bash
npm ci
npm run typecheck:research
npm run typecheck:reference
npm run test:research:ports
npx vitest run test/conformance/reference/s06-re01-contract.test.ts test/conformance/reference/re01-source-incidence.test.ts test/conformance/reference/re01-particle-continuation.test.ts test/conformance/reference/re01-endpoint-continuation.test.ts test/research/re01/incidence-probe.test.ts
npm run research:re01:measure
npm run test:reference:full
```

These commands use the same TypeScript entrypoints on POSIX and Windows. [Pure witness tests](../test/research/re01/witness-probe.test.ts) retain the original predicate, identity and budget controls; the scoped reference files retain construction, payload, hypothetical-source and comparison-closure checks. New observations use only the live Node primary, with selected contract checks kept separate from historical secondary observations.

The full reference lane requires discovered TypeScript test files and rejects empty discovery. The [historical source snapshot](../test/conformance/reference/legacy-source-snapshot.json) retains the complete old method contracts as hash-verified, non-executable data; it does not execute an interpreter or depend on Git history.

### Historical development evidence

The historical focused probe used Python 3.12.14, XMLSchema 4.2.0, lxml 6.1.0 and libxml2 2.14.6. Eighteen original test methods covered eleven schemas, fixed engine observations, instance and hypothetical-incidence contrasts, explicit premise tables, conditional witnesses, failed-family classification and budget boundaries. The pair-premise tables and asserted expected witnesses were written independently in the test; no production helper or prototype result generated those expectations.

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

[The TypeScript measurement program](../test/research/re01/measure.ts) reproduces those deterministic counts without ignored logs. The shared-DAG terminal retains a recursive type-reference ID; this measures nonexpansion of legal element/type recursion, not an implementation of recursive payload validity. The adversarial exhaustion reports no partial successful witness and no invalidity.

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
