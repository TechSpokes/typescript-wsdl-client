# S06 AU01 Repeated Attribute Uses

Research rule tables, original-operand interfaces and independently reproducible evidence for #233. See the root [README](../README.md).

## Disposition and delivery boundary

The maintainer selected C1 runtime/default interpretation and universal checks for source-declared restriction replacements. The primary-source gaps below explain those explicit project decisions; exact-revision review, combined delivery checks and #179 production implementation remain separate gates.

The base requiring global integer `a`, fixed to `1`, and the extension repeating it as optional without a constraint retains both original AUs by component mapping. Under selected C1, absence is invalid and present input must satisfy the inherited fixed value `1`; the optional repeated use does not weaken either obligation.

The coordinator integrates this main-based research leaf with #232, assigns substantive independent review at its exact revision and records aggregate checks. #179 owns eventual schema assessment; #184 owns later scalar payload enforcement; RE01 consumes the predicates below conditionally until the semantic gate is accepted.

Original research starting main is `5876065b00d4eeb6d2324eaa63ff9b70e2279198`. The inspected, unaccepted #231 draft is `460f5b8379c68ffef79917284e445b5ab046429e`, tree `56830b28d1006b019918a364aa62f1ed9d7d8817`; its implementation is neither imported nor merged into this research runtime.

### Recorded project selections

The maintainer [selected C1 on October 10, 2026](https://github.com/TechSpokes/typescript-wsdl-client/issues/233#issuecomment-6095916709): preserve every surviving AU, conjoin present fixed predicates, and use one consistent absent augmentation; conflicting absent candidates reject that instance without adding a schema-invalidity rule.

The separate [restriction selection](https://github.com/TechSpokes/typescript-wsdl-client/issues/233#issuecomment-6095977338) requires every same-QName original base AU to pass for a source-declared local/group replacement. Omitted attributes retain their inherited original AU identities and obligations; they are not fabricated local replacements or subjected to the unselected final-AU/all-base alternative below.

These choices resolve the project interpretation questions. Final substantive review assesses the complete selected contract and scoped algorithms at exact revisions; research tests alone still do not certify #179 production support or close later acceptance gates.

The maintainer [accepted NT-CONT-01 for #239](https://github.com/TechSpokes/typescript-wsdl-client/issues/239#issuecomment-6098237195): the Node tooling uses one live libxml2 engine, independent scoped TypeScript checks and pinned historical xmlschema observations. The [reference-validation contract](reference-validation.md) distinguishes those evidence kinds and the remaining unqualified full-schema and PSVI capabilities; this tooling acceptance does not discharge RE01 or activate production assessment.

## Authority and qualification

The dated [XSD 1.0 structures second edition](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/) supplies the rules below. The complete original XML was inspected through the [pinned source mirror](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/structures.xml), ignoring editorial `diff="del"` text; its SHA-256 is `e496af408b14853e6169ac7c1fca09d55a81bd73771758ad6be020960e1317ba`.

The corresponding [datatypes source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/datatypes.xml) has SHA-256 `430f010df8ed077a4ed11d9d5812ea5e5d62ba67e715f1bbeeaa8ee1765d84c7`. Original source hashes agree with the immutable #231 evidence record; copied assessment code is unnecessary.

| Clause | Exact phrase or applicable rule | Consequence |
|---|---|---|
| [Complex-type mapping, 3.4.2](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#declare-type) | “A union of sets of attribute uses” | Extension retains base and local/group AU sets |
| [ct-props-correct 4](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#ct-props-correct) | “Two distinct attribute declarations” | Same declaration is distinct from same QName |
| [ag-props-correct 2](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#ag-props-correct) | Distinct AU members cannot share a declaration QName | Stronger group rule |
| [cos-ct-extends 1.2](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-ct-extends) | Base name, namespace and type must survive | Not a value/default selection rule |
| [cvc-complex-type 3.1](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cvc-complex-type) | “that attribute use” | Multiple matching uses are not quantified |
| [cvc-complex-type 4](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cvc-complex-type) | Each required use needs an attribute match | Any required surviving AU requires presence |
| [cvc-au](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cvc-au) | “canonical lexical representation” | Literal text differs from adopted value interpretation |
| [derivation-ok-restriction 2.1.3](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#derivation-ok-restriction) | “same string” | Do not misquote this as value equality |
| [au-props-correct 2](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#au-props-correct) | Own constraint must agree with declaration fixed value | One AU can already be invalid |
| [sic-attrDefault](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#sic-attrDefault) | Each eligible absent optional AU adds an attribute item | Differing augmentations lack one defined value |

The [published second-edition errata](https://www.w3.org/2004/03/xmlschema-errata), read on October 10, 2026, contain E1-56 and no datatype erratum. E1-56 revises PSVI/default and union-member contributions; it adds neither a uniqueness constraint for complex-type AU members nor a rule selecting among matching uses or competing attribute defaults.

The source mapping gives each default/fixed component an actual typed value. [ADR-003 D03/D04](decisions/003-content-model-contracts.md#equivalence-and-normalization-s02-d03) independently adopts fixed checks by scalar value, original QName context and declaration-order union member assessment; that accepted project interpretation must not be presented as a verbatim rewrite of `cvc-au` or the restriction rule.

No adopted erratum located in this investigation closes the repeated-use gap. Reference rejection, XSD 1.1 rules and hypothetical language inclusion are not substitutes for an XSD 1.0 interpretation decision.

## Declaration identity, use identity and source mapping

Global declaration identity is namespace, local name and symbol role; local declarations retain containing-component/source-path identity. A QName is an instance matching key, not an identity for declarations or AU components.

Each source `xs:attribute` with an admitted use creates its own AU, even when it references an existing global declaration. Reusing a group references its existing AU members; set union is idempotent only for those existing member identities, not for distinct source AUs with equal properties.

| Construction | Component result | Primary identity result |
|---|---|---|
| Direct repeated same-global references in a complex type | Two AUs, one declaration | Not forbidden by `ct-props-correct 4` |
| Base and extension references to same global | Both AUs survive | Differing constraints need AU01 interpretation |
| Repeated references to the same group | Same member identities once | Legal set union |
| Same group reached through nested paths | Same member identities once | Legal set union if other rules pass |
| Direct distinct AUs of same global in one group | Two distinct members | Invalid `ag-props-correct 2` |
| Group plus direct distinct AU of same QName inside a group | Two distinct members | Invalid `ag-props-correct 2` |
| Distinct groups with distinct AUs combined inside a group | Distinct members | Invalid when their QNames match |
| Distinct groups combined directly in a complex type | Distinct AUs | Same declaration allowed; distinct declarations invalid |
| Same-name local declarations in one complex type | Distinct declarations | Invalid `ct-props-correct 4` |
| Matching local restriction declaration replacing base | New AU and declaration | Check restriction type/value rules independently |
| Multiple ID-derived declarations in a complex type | Distinct declarations | Invalid `ct-props-correct 5` |
| Multiple ID-derived AU members in a group | Distinct AUs | Invalid `ag-props-correct 3` |

These identity results concern component constraints; they do not certify unrelated scalar, derivation or capability rules. Reachable ID-derived runtime rules retain the approved profile exclusion; schema-only identity checks still apply.

### Prohibited and omitted controls

[Attribute mapping 3.2.2](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#declare-attribute) maps `use="prohibited"` to no AU. Representation controls such as mutually exclusive `default`/`fixed`, `name`/`ref` and invalid lexical syntax still apply; absent use operands are not invented scalar components.

An explicit global declaration remains a schema operand even if a prohibited reference contributes no AU. Its declaration/type/fixed legality is assessed from its own source context, while a prohibited local declaration contributes no declaration or runtime scalar obligation.

| Source control | Effective result | Classification |
|---|---|---|
| Extension prohibition matching inherited required/optional use | Inherited use remains | Prohibition adds no AU; cannot delete base |
| Direct restriction prohibition matching optional base use | Matching base QName removed | Legal if remaining restriction rules pass |
| Direct restriction prohibition matching required base use | Required match missing | Invalid restriction |
| Prohibition inside an attribute group used by restriction | No group AU | Inherited uses remain |
| Omitted attribute in restriction | Base AUs inherited | Not a prohibition |
| Explicit `default` on required source AU | Representation violation | Invalid `src-attribute 2` |
| Required reference to globally defaulted declaration, no own default | Required AU; declaration default retained | Source default/use prohibition does not apply |

No tombstone becomes a wildcard QName exclusion. A retained wildcard may admit a QName with no explicit AU; wildcard rules and processing are assessed separately by the existing [S05 composition](content-model-composition.md) boundary.

## Complete conditional constraint table

This table gives selected C1's value predicates while keeping the primary-source qualification explicit. Each cell gives present-value requirement and absent result for two optional AUs of the same global declaration; `T` is the declared type's admitted value space, `D(v)` an effective default, `F(v)` an effective fixed value and `A(v)` a single augmentation to `v`.

`E` means conflicting augmentation candidates: selected C1 rejects that absent instance as `invalid-value`; it is not an invalid-schema proof. `empty` means no present value satisfies the fixed conjunction; an empty accepted-instance set alone does not violate a stated schema component constraint.

| Base / local | N | D(1) | D(2) | F(1) | F(2) |
|---|---|---|---|---|---|
| N | T / absent | T / A(1) | T / A(2) | 1 / A(1) | 2 / A(2) |
| D(1) | T / A(1) | T / A(1) | T / E | 1 / A(1) | 2 / E |
| D(2) | T / A(2) | T / E | T / A(2) | 1 / E | 2 / A(2) |
| F(1) | 1 / A(1) | 1 / A(1) | 1 / E | 1 / A(1) | empty / E |
| F(2) | 2 / A(2) | 2 / E | 2 / A(2) | empty / E | 2 / A(2) |

Rows and columns deliberately cover both source orderings. Equality classes use independent original-type value equivalence, so integer `+01` belongs to the `1` class while string `+01` does not become integer `1`.

| Requiredness combination | Presence rule | Present checks under C | Absent rule |
|---|---|---|---|
| Optional + optional | Presence optional | Every fixed AU | Table above |
| Required + optional | Presence required | Every fixed AU | Reject missing required attribute |
| Optional + required | Presence required | Every fixed AU | Reject missing required attribute |
| Required + required | Presence required | Every fixed AU | Reject missing required attribute |
| Required AU with explicit default | Not an admitted component input | Source invalid | Source invalid |

Requiredness is independently established by `cvc-complex-type 4`; defaults cannot satisfy missing required input by repair. When a required AU coexists with an optional default/fixed AU, the absent input remains invalid regardless of proposed PSVI augmentation order.

For any number of same-declaration AUs, selected C1 uses requiredness OR, intersection of fixed-value predicates, and the set of eligible optional augmentation values. Zero candidates preserves absence; one value-equivalence class creates one augmentation; multiple classes produce `E`; this generalization terminates without enumerating possible payload values.

The table assumes individual source operands are valid and declaration-fixed compatibility passes. A globally fixed declaration plus an explicit conflicting fixed value or a default is independently invalid under `au-props-correct 2`; conflicting fixed values on two AUs of a declaration with no global fixed constraint do not have that proof.

Own AU and declaration constraints remain separate. Effective fallback is the own constraint when present, otherwise the declaration constraint as defined in `derivation-ok-restriction`; a global default is not a fabricated own default on a required source AU.

### Alternatives and concrete consequences

| Alternative | Present same-QName rule | Absent/default rule | Compatibility effect |
|---|---|---|---|
| C: retain all-use conjunction | Every fixed surviving AU must pass | One equivalent augmentation; competing values gated | Preserves inherited fixed requirements |
| S: select one matching AU | Some matching AU governs `cvc-au` | Specify selection and augmentation separately | Optional unconstrained AU can admit `2` beside inherited fixed `1` |
| L: replace with local AU | Local required/type/fixed only | Local augmentation | Can remove inherited requiredness; conflicts with set union |
| U: reject all distinct duplicate AUs | No payload admitted | No augmentation | Rejects cases not banned by CT declaration identity |

S's set-valued present interpretation gives `T` whenever any matching AU has no fixed constraint, and the union of fixed singleton values otherwise. Requiredness still uses all surviving required AUs; an additional order/identity-based selection would give a different behavior and is not defined by the primary set model.

S gives absent optional attributes every candidate augmentation value unless a further rule chooses one; choosing the first or last source operand is observable in normalized output. Even C's coalescing of equal candidate defaults needs an explicit single-PSVI-item interpretation when distinct eligible AUs would each add an attribute item.

L is not a faithful interpretation of the extension mapping or requiredness rule. U adds a uniqueness rule the complex-type constraint does not state and would be a new permanent exclusion; neither is authorized by this research scope.

The research recommendation was to retain all original AUs and complete C with an explicit absent-instance rule, without inferring schema invalidity from unsatisfiable present fixed constraints. The maintainer selected that completion as C1. The primary-source gap remains visible; the recorded project interpretation and its substantive review, rather than research evidence alone, authorize removing the corresponding qualification.

### Selected total interpretation C1

C1 completes C's augmentation rule: required absence is invalid; optional absence with no augmentation candidates is accepted unchanged; optional absence with one equivalent candidate class is accepted with one augmented attribute; optional absence with different candidate classes is rejected as `invalid-value`. Present input requires the original datatype and every fixed predicate, while defaults impose no present-value constraint.

This is the selected tuple `(union by AU identity, requiredness OR, all-fixed present intersection, one equivalent absent augmentation, reject conflicting absent augmentation)`. It never rejects a schema merely because fixed predicates have no common value: two optional conflicting fixed AUs can therefore have an empty accepted-instance language under C1, while no stated component rule has proved the schema invalid.

Conflicting defaults alone under C1 admit every otherwise valid present value and reject only the unaugmentable absent input. Conflicting default/fixed values admit the fixed present value and reject absence; requiredness independently rejects every missing input, so this rule is total for all table entries and both orderings.

C1's rejection of conflicting absent augmentation is an explicitly selected project interpretation, not text supplied by an adopted XSD 1.0 erratum. The executable summary retains its historical field name `proposed_C1_absent`; its `augmentation-conflict` field records why the selected instance rejection applies without substituting a primary-source invalid-schema proof.

A concrete total S1 alternative retains requiredness OR but chooses the most-local source AU for present fixed checking and the most-local optional constrained AU for absent augmentation, with stable declared source order resolving same-level duplicates. S1 accepts absence with differing defaults using the selected value and can admit present `2` beside inherited fixed `1`; source-order precedence is an explicitly chosen interpretation, not a property of an unordered set.

The maintainer selected C1 because it retains inherited checks and gives deterministic single-attribute normalization without a new schema-invalidity condition. S1 and literal final-AU restriction matching remain documented alternatives, not selected behavior; #179 removes its qualifications only after the selected combined contract and owning implementation are reviewed.

## Original-type scalar predicate

`SameValue(typeA, lexicalA, contextA, typeB, lexicalB, contextB, budget)` first validates each operand in its original scalar plan, then compares exact typed values. It returns equal/distinct, an invalid-schema operand error, an unsupported semantic qualification, or resource-limit; a failed parse or exhausted calendar computation cannot become ordinary inequality.

| Contrast | Independently expected equality | Retained context |
|---|---|---|
| Integer `1`, `+0001` | Equal | Exact decimal value |
| Integers `9007199254740993`, `9007199254740992` | Distinct | No binary64 rounding |
| String ` a `, `a` | Distinct | Preserve whitespace |
| Token XML whitespace aliases of `a b` | Equal | XML whitespace normalization |
| QName `p:item`, `q:item` with same namespace | Equal | Each original binding |
| Same QName spelling with different namespace bindings | Distinct | Source-local rebinding |
| Unprefixed QName with default namespace, prefixed alias | Equal | QName default namespace applies |
| Integer lists `+01 2`, `1 02` | Equal | Ordered item values |
| Integer lists `1 2`, `2 1` | Distinct | List order |
| Union(integer,string) `+01`, integer `1` | Equal | First admitted member |
| Union(string,integer) `+01`, integer `1` | Distinct | String member identity/value |
| Union(string,integer) ` a `, string `a` | Distinct | Selected member preserves whitespace |
| Pattern-restricted fixed string `01`, replacement `1` | No rewrite authorized | Admitted lexical witness |

[XSD 1.0 whiteSpace](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#rf-whiteSpace) does not apply directly to union types; the selected member controls normalization. Passing raw original lexical data independently to each declared member preserves that rule; applying union-wide collapse would change the last union contrast.

The narrow probe implements exact integer/string/token/QName and flat list/union contrasts only; it is not a complete datatype or facet engine. Datatype derivation remains an independent predicate: equal values of unrelated types do not prove a legal attribute restriction.

The [DT01 shared scalar interface](content-model-s06-dt-01.md#shared-scalar-interface) supplies the selected candidate A calendar predicate. Explicit-zone aliases require exact normalized instants; absent-zone values retain timezone-presence semantics; duration equality compares exact signed months and seconds separately from anchor-based ordering, so `P1Y=P12M`, `P1D=PT24H` and `P1M!=P30D`.

Candidate A uses the lexical signed-year leap test with explicit skip-zero rollover, second-60 overflow normalization and normalized recurring-time clock comparison. The maintainer [selected those repairs](https://github.com/TechSpokes/typescript-wsdl-client/issues/236#issuecomment-6095933213); the selected interface is pinned at DT01 leaf `899106a3b7b0321043f4a570184de8b8408a76a5`, tree `db83ef379c15678be44c79526b35ed1a530e1a46`. Exact final dependent review confirmation is retained by the coordinator's joint ledger.

AU comparisons assess each operand in its original type/source/namespace/whitespace/facet context and then call that one reviewed DT predicate. No alternate calendar implementation or raw-string fallback exists here; before its exact semantic review gate passes the dependent predicate remains `unresolved`, not ordinary inequality or invalid-schema.

## Pure assessment and retained-constraint contract

Inputs come only from immutable canonical/resolved/composed graphs through `prepareResolvedCompilationInput` and accepted #178 analysis. The pure AU stage performs no network I/O, recompilation, payload validation, occurrence analysis or persisted-format mutation.

Each original AU record retains its component ID, owner ID, declaration ID, QName, original scalar type reference, required boolean, own constraint and declaration constraint separately. Every operand retains lexical text, source path/digest/location, namespace bindings, whitespace/facet layer and selected list/union type context; the effective constraint retains its origin.

Outputs separate `schemaOperands`, `effectiveRuntimeUses`, identity/derivation diagnostics, and the conditional repeated-use qualification. A matching restriction removes replaced base uses from runtime closure while preserving them as original schema/derivation operands; conjoining removed base defaults into the new runtime plan would be wrong.

C1 augmentation emits exactly one assessed attribute with its original global declaration/type, expanded QName, every contributing original AU and one already-admitted lexical witness with its original namespace context. Equivalent candidates authorize a single typed value; they do not authorize replacing a patterned lexical witness with canonical text or copying a QName prefix into a destination without its binding.

The narrow `conditional_c1_augmentation` plan borrows those immutable original records and keeps the typed value separate from its witness. Tests retain `p:item` and its original binding while preserving contributors with the equivalent `q:item`, and preserve integer `+01` rather than rewriting it to `1`; #184/#188 own facet-complete validation and namespace-safe encoding.

The #231 `AssessedAttribute.constraints` entry containing only owner/use/value relies on the outer attribute type and cannot express this full independent contract after replacing operands. #179 should retain original AU references or add the original declaration/type and own-versus-declaration constraint origin per entry, instead of synthesizing a merged fixed/default operand.

This is an internal assessed-plan change only; format 2 already preserves original declared graph data. Any later persisted-plan/version change remains an explicit #185/#186 review, not a side effect of AU research.

### Extension and restriction predicates for RE01

`ExtensionAttributes(B, local)` unions original AU identities and preserves every base AU; it checks complex-type declaration uniqueness, individual operand legality, final/type controls and wildcards independently. It does not decide differing same-global present/default semantics by selecting a last use.

`RestrictionAttributes(B, local)` performs the XSD replacement/omission/prohibition mapping first. For one matching base AU it requires requiredness preservation, valid scalar type derivation from the original base type, and the effective fixed constraint condition under the accepted S02 typed-value interpretation.

For a source-declared replacement AU, the selected predicate applies those checks against every matched original base AU and retains every original type/fixed operand. Requiredness cannot choose only an optional base member; fixed `1` cannot choose only the matching fixed `1` member when another base member fixes `2`; an attribute wildcard cannot bypass those named matches.

For an omitted QName, the original base AU identities are inherited unchanged with all C1 runtime obligations; no local replacement is invented. A prohibited member inside a group contributes no AU and therefore leaves this inheritance branch intact; direct prohibition masks inherited names and must still leave every required base name represented by an effective required AU.

The distinction uses source contribution provenance, not property equality or a convenient reclassification of AU identities. Even reusing a base group's original AU ID as an explicit local group contribution is a source replacement and invokes all matched base checks; omission is the branch that inherits without replacement.

### Complete selected matching table and unselected literal alternative

The following outcomes assume independently valid individual scalar operands and the other existing schema gates. A restriction failure here is a failure of the selected derivation predicate, not a proof that its base schema is invalid merely because its instance language is empty.

| Original base uses | Restriction source | Selected replacement-only | Literal final-AU/all-base |
|---|---|---|---|
| Required + optional, either order | Optional local replacement | Invalid requiredness | Invalid requiredness |
| Required + optional, either order | Required local replacement | Pass | Pass |
| Fixed 1 + fixed 2, either order | Local fixed 1 | Invalid fixed retention | Invalid fixed retention |
| Fixed 1 + equivalent fixed +01 | Local fixed 1 | Pass typed equality | Pass typed equality |
| Fixed 1 + fixed 2 | Omitted QName | Preserve both originals | Invalid pairwise fixed retention |
| Required + optional | Omitted QName | Preserve both originals | Invalid optional/required pair |
| Optional fixed 1 + optional fixed 2 | Direct prohibition | Both removed; pass | Both removed; pass |
| Required + optional | Direct prohibition without replacement | Invalid missing required name | Invalid missing required name |
| Fixed 1 + fixed 2 | Group-internal prohibition | Preserve both originals | Invalid pairwise fixed retention |
| Default 1 + default 2 | Local default 3 | Pass; defaults may change | Pass |
| Fixed 1 + unconstrained | Local fixed 1 | Pass | Pass |
| Fixed 1 + unconstrained | Unfixed local replacement | Invalid fixed retention | Invalid fixed retention |
| Original string type | Local token type | Pass original-type derivation | Pass |
| Original string type | Local integer type | Invalid unrelated type | Invalid unrelated type |
| QName fixed prefixes, same original expanded value | Local equivalent alias | Pass original contexts | Pass |
| Same QName fixed spelling, rebound namespace | Local distinct expanded value | Invalid fixed retention | Invalid fixed retention |

The literal alternative checks every final AU against every matched original base AU, including AUs inherited through omission. It would reject vacuous restriction of a base containing conflicting fixed AUs, and even a base containing required/optional AUs; those are material additional consequences absent from the maintainer's source-replacement question and were not selected.

Recommendation is the selected source partition: preserve existing inherited identities/obligations, and universally check only actual source replacements. RE01 must retain that provenance in a reordered witness and separately prove any synthetic intermediate's legal component/source construction; copying direct attribute syntax creates a new AU, while a group reference may reuse an existing group AU.

### Finite all-match procedure and budget guarantee

```text
reserve aggregate base/local/prohibition node count before indexing
deduplicate original base and local AUs by actual component identity
index every original base AU under its expanded QName
collect replacement names from local/group AUs and direct prohibitions
effective := local AUs plus bases whose names are not replaced
retain every original base as a schema operand and diagnostic source
for each actual local/group replacement R:
    matches := every indexed original base AU of R's QName
    if matches is empty: require admission by the original base wildcard
    for each original B in matches:
        require B.optional or R.required
        require R.originalType validly derived from B.originalType
        if B.effectiveConstraint is fixed:
            require R.effectiveConstraint fixed and original-context SameValue
for each required original B:
    require an effective required AU with B's QName
reserve output/provenance copies before allocation; return immutable views
```

Each loop consumes a finite input sequence; no candidate-type, payload-value or recursion enumeration occurs. With sufficient resources, the algorithm completely decides the chosen predicate over its explicitly narrow original-type/scalar domain; the production contract delegates complete scalar derivation and SameValue to their existing owning plans.

Work is linear for source mapping plus at most `local AUs * matching base AUs` comparisons and finite required-name checks; indexing, namespace keys, inherited-record copies and result containers are charged first. A matching-pair budget failure returns `resource-limit` without a partially accepted restriction or a negative derivation proof.

Restoration of unrelated scalar types cannot follow merely from equal values or merged QName properties. Original base types stay explicit; a reordered witness must satisfy whichever complete AU predicate is ultimately reviewed, and resource exhaustion cannot prove no witness exists.

### Bounded implementation plan

```text
reserve graph node/work limits before indexing or retaining input
resolve references and forbidden cycles through existing S05 contract
visit groups in iterative dependency order with active/done IDs
for each group: borrow immutable AU records, union by original AU ID
charge each edge, member insertion, key text and provenance copy first
check distinct-AU group QName and ID-member constraints
visit complex derivation bases in dependency order
for extension: union base IDs with local/group IDs
for restriction: map source replacement/prohibition; retain originals separately
check distinct-declaration complex-type QName and ID constraints
partition surviving AUs by QName/declaration identity
validate each original own/declaration operand with shared scalar predicate
record requiredness OR and all original fixed/default candidates
for each source-declared replacement: check every matching original base AU
for omitted names: inherit original AU IDs and all runtime obligations unchanged
for direct prohibition: mask inherited names, then check required base names
for present attributes: assess original type and every surviving fixed predicate
for absent attributes: reject required absence or conflicting augmentation values
for one augmentation class: retain one admitted witness and every AU provenance
for unsupported scalar plans: return unsupported-capability with original operands
charge result arrays/strings and diagnostics before allocation; freeze result
```

Group memoization shares existing immutable AU records and prevents exponential group re-expansion. Repeated references may add provenance routes, so route collection is also bounded before copying; a resource failure returns no partial assessed type/operation table.

Legal recursion through element/type boundaries remains a graph reference and does not enter AU expansion. Forbidden attribute-group/base/scalar cycles remain S05 invalid-schema diagnostics with related source paths, including components absent from runtime closure.

With valid acyclic group/base dependencies, finite input and sufficient resources, identity union and candidate C's constraint summary terminate. This is completeness for the stated AU/set/scalar probe domain, not completeness of XSD schema validation or of RE01 witness search.

Semantic defaults remain independently applied 100,000 nodes and 1,000,000 work units. String/namespace/member parsing, exact typed comparisons, inherited AU copying and diagnostic/provenance copying are charged before work/allocation; S03/S04 budgets and conservative cyclic-depth behavior stay unchanged.

## Independent reference observations

All 66 committed [AU01 fixtures](../test/conformance/fixtures/xsd/attributes/au01/extension-required-fixed-optional-none.xsd) are new minimal sources authored for this research. The pinned draft's differing-use/group/prohibited fixtures remain historical evidence; none is silently rewritten or imported by the executable probe.

[The scoped reference tests](../test/conformance/reference/s06-au01-contract.test.ts) separate current primary observations, selected project assertions and historical engine answers. [The bounded candidate](../test/research/s06-au01/probe.ts) and [its pure tests](../test/research/s06-au01/probe.test.ts) import no production compiler or unaccepted draft modules.

The fourteen original AU01 method obligations are traced across those two test files using the hash-verified [historical source snapshot](../test/conformance/reference/legacy-source-snapshot.json). They retain 25 optional pairs, both requiredness orderings, twenty original-source restriction contrasts and one-attribute augmentation provenance; the snapshot is non-executable data.

### Historical optional matrix: XMLSchema 4.2.0 schema observations

`A` means accepted by the historical engine run, `R` rejected; the table is not a normative verdict or a fresh Node result. Historical libxml2 2.14.6 rejected every one of these 25 extension pairs.

| Base / local | N | D(1) | D(2) | F(1) | F(2) |
|---|---|---|---|---|---|
| N | A | A | A | A | A |
| D(1) | A | A | A | A | A |
| D(2) | A | A | A | A | A |
| F(1) | R | R | R | A | R |
| F(2) | R | R | R | R | A |

Historical XMLSchema accepted conflicting defaults and augmented absence with the local value: base `D(1)`/local `D(2)` produced `2`, the reversed schema produced `1`; present integer `1`, `2` or `3` was accepted in both. Base default/local fixed `2` was accepted with fixed `2` behavior, whereas reversing to base fixed/local default was rejected.

These order-dependent results illustrate implementation policy, not primary selection authority. They refute a blanket claim that both engines reject every mismatched repeated-use combination; the original required-fixed/optional-none example is still rejected by both.

### Historical identity, source controls and scalar contrasts

| Fixture or contrast | Primary/project conclusion | Historical XMLSchema 4.2.0 | Historical libxml2 2.14.6 |
|---|---|---|---|
| Direct same-global repeated references | CT identity permits; equivalent unconstrained checks | R | R |
| Reused group AU | Legal member set union | R | R |
| Distinct same-QName local declarations | Invalid CT identity | R | R |
| Direct/nested distinct group AUs | Invalid group identity | R | R |
| Omitted inherited required attribute | Inherits required AU | A | A |
| Direct required prohibition in restriction | Invalid restriction | R | R |
| Extension required prohibition | Base remains required | R | A |
| Group required prohibition in restriction | Base remains required | A | A |
| Global fixed `1`, own fixed `+01` | S02 value-equivalent | R | A |
| Global fixed `1`, own fixed `2` | Invalid `au-props-correct` | R | A |
| Global fixed `1`, own default `1` | Invalid `au-props-correct` | A | R |
| Required explicit default | Invalid `src-attribute` | R | R |
| Global default, required reference without own default | Legal; presence required | A | A |
| Base optional none/local required fixed | Selected C1 requires presence and fixed value | A | R |
| Base required fixed/local optional none | Selected C1 retains requiredness and fixed value | R | R |
| QName fixed `p:item`, input `q:item`, same binding | S02 value-equivalent | Reject input | Accept input |

The valid inherited-required controls each accepted presence and rejected absence in historical libxml2. The single-AU typed fixture supplies 14 present-value contrasts for integer, string, token, QName, list, union and pattern; the historical QName alias disagreement remains recorded rather than changing the independent S02 expected value.

The twenty new `restriction-matches-*` fixtures independently contrast the selected source partition against literal final-AU matching. Pinned engines reject many complete schemas before reaching the derived restriction because they reject the repeated base AU sets; these observations cannot prove the selected restriction predicate wrong.

Historical XMLSchema accepted the required-second/required-replacement and changed-default replacement schemas while libxml2 rejected their repeated bases. Both accepted string-to-token and rejected unrelated string-to-integer; XMLSchema rejected equivalent QName fixed aliases while libxml2 accepted them, and both accepted the same fixed spelling with a different original namespace binding even though selected typed equality distinguishes it.

## Executed checks and limits

The current reproduction uses normal npm installation on Node 24 or Node 26. The scoped tests construct the original supported schemas with `libxml2-wasm` 0.7.2/libxml2 2.15.1 and independently execute the selected AU01 rules; unavailable complete-schema results do not become payload rejection or selected-rule authority.

```bash
npm ci
npm run typecheck:research
npm run typecheck:reference
npm run test:research:ports
npx vitest run test/conformance/reference/s06-au01-contract.test.ts
npm run test:reference:full
```

The historical research installation used Python 3.12.14, xmlschema 4.2.0, lxml 6.1.0/libxml2 2.14.6 and elementpath 5.0.4. Its original focused run passed nine methods, followed by all fourteen after the selected restriction/augmentation work; those recorded runs are preserved as historical evidence and are not repeated by the current Node commands.

Aggregate full-reference, CI, conformance and documentation/support-matrix results belong to the coordinator's exact final integration record; they are not inferred from these scoped checks or old #231 results.

The historical leaf delivery passed `npm run docs:validate`, including the support-matrix check. Its selected-contract follow-up passed the fourteen focused methods and diff checks; current cross-leaf links and complete documentation/support-matrix checks belong to the coordinator's integrated final revision.

| Boundary probe | Measured outcome |
|---|---|
| 100,000 borrowed repeated AU input nodes | Succeeds; 2,500,005 work units with explicit 5,000,000 override |
| 100,001 input nodes | `resource-limit` before indexing |
| Singleton fixed summary at 94 work units | Succeeds |
| Same summary with 93 work units | `resource-limit`; counter never exceeds budget |
| Two exact 83,331-digit operands plus two operand visits | Succeeds at exactly 1,000,000 work units |
| Two 83,332-digit operands plus two operand visits | `resource-limit`; no inequality/acceptance result |
| 10,000-digit integer alternate spelling | Exact equality succeeds |
| 10,000-character namespace URI aliases | Exact equality succeeds; lower work budget fails |
| Two base matches and one local fixed/required replacement | Pass at 384 work units; 383 returns resource-limit |
| Same restriction at three input nodes / two-node override | Pass / resource-limit before indexing; zero work retained |
| 4,000 original base matches and one local replacement | Pass within default; 327,001 work units |
| 4,000 bases and 4,000 replacements | Default work exhaustion; no partial result or invalidity proof |

The node and work limits are independent: reaching the node limit does not grant extra work, and the documented override isolates that boundary. Input fixture allocation is caller-owned; the candidate bounds its own indexing, normalized buffers, list outputs and comparisons before allocation/work.

The probe intentionally does not import later #184 payload digit/byte limits into schema research. It does not qualify arbitrary facets, Unicode QName grammar, full scalar calendars, production performance or platform maxima; unsupported probe datatypes return unsupported-capability and never silently succeed.

IDE inspections are unavailable; repository checks and reference XML parsing provide verification. Hosted CI, protected merge, complete semantic interpretation, exact-revision independent acceptance and production guards remain explicit coordinator/downstream gates.

## Handoff and open acceptance obligations

#179 receives original-AU set identity, independently established requiredness and source mapping, scalar context obligations, conditional C and alternative S predicates, and the exact guards still required. #184 receives every surviving runtime AU operand and its origin, plus removed/schema-only operands kept separately for diagnostics; no payload scalar implementation is delivered here.

The accepted path remains canonical/resolved/composed graph, accepted #178 occurrence analysis and #179 assessment. Legacy default generation, format 2, `xsd10-faithful-v1`, companion regeneration policy, D07 qualifications, S01/S05 disagreements and later production activation remain unchanged.

The maintainer's recorded C1 and source-replacement all-match selections provide the project answers for present/absent behavior and multiple-base restriction matching. Local acceptance still requires the complete selected contract's substantive exact-revision review, the pinned reviewed DT01 predicate and final coordinator delivery checks/normal merge; production implementation and joint RE01 witness acceptance remain separate downstream gates.
