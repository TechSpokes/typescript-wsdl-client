# S06 AU01 Repeated Attribute Uses

Research rule tables, original-operand interfaces and independently reproducible evidence for #233. See the root [README](../README.md).

## Disposition and delivery boundary

`S06-AU-01` remains open: the XSD 1.0 component identity rules settle which uses survive, but do not settle selection among differing matching uses or conflicting absent-attribute augmentation. This record supplies complete conditional outcomes, concrete alternatives and their compatibility effects; it does not certify the affected schemas or production support.

The base requiring global integer `a`, fixed to `1`, and the extension repeating it as optional without a constraint retains both original AUs by component mapping. Absence violates the independently quantified requiredness rule; for a present attribute, whether the base fixed check must also apply is the unresolved selection question.

The coordinator integrates this main-based research leaf with #232, assigns substantive independent review at its exact revision and records aggregate checks. #179 owns eventual schema assessment; #184 owns later scalar payload enforcement; RE01 consumes the predicates below conditionally until the semantic gate is accepted.

Accepted main is `5876065b00d4eeb6d2324eaa63ff9b70e2279198`. The inspected, unaccepted #231 draft is `460f5b8379c68ffef79917284e445b5ab046429e`, tree `56830b28d1006b019918a364aa62f1ed9d7d8817`; its implementation is neither imported nor merged into this research runtime.

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

This table is candidate C, not an accepted normative all-use rule. Each cell gives present-value requirement and absent result for two optional AUs of the same global declaration; `T` is the declared type's admitted value space, `D(v)` an effective default, `F(v)` an effective fixed value and `A(v)` a single augmentation to `v`.

`E` means conflicting augmentation candidates remain unresolved; it is not an invalid-schema proof or a declared invalid-payload result. `empty` means no present value satisfies candidate C's conjunction; an empty accepted-instance set alone does not violate a stated schema component constraint.

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

For any number of same-declaration AUs, C uses requiredness OR, intersection of fixed-value predicates, and the set of eligible optional augmentation values. Zero candidates preserves absence; one value-equivalence class proposes one augmentation; multiple classes produces `E`; this generalization terminates without enumerating possible payload values.

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

Recommendation: retain all original AUs and use C as the concrete proposed contract for maintainer review, with competing augmentations exposed and no invalid-schema inference from unsatisfiable present fixed constraints. C respects inherited obligations and source-order independence, but adopting it for differing matching uses and PSVI coalescing requires an explicit reviewed interpretation; research evidence alone does not close this gate.

### Total proposed interpretation C1

For a concrete decision, C1 completes C's augmentation rule: required absence is invalid; optional absence with no augmentation candidates is accepted unchanged; optional absence with one equivalent candidate class is accepted with one augmented attribute; optional absence with different candidate classes is rejected as `invalid-value`. Present input requires the original datatype and every fixed predicate, while defaults impose no present-value constraint.

This is the proposed tuple `(union by AU identity, requiredness OR, all-fixed present intersection, one equivalent absent augmentation, reject conflicting absent augmentation)`. It never rejects a schema merely because fixed predicates have no common value: two optional conflicting fixed AUs can therefore have an empty accepted-instance language under C1, while no stated component rule has proved the schema invalid.

Conflicting defaults alone under C1 admit every otherwise valid present value and reject only the unaugmentable absent input. Conflicting default/fixed values admit the fixed present value and reject absence; requiredness independently rejects every missing input, so this rule is total for all table entries and both orderings.

C1's rejection of conflicting absent augmentation is a proposed additional instance interpretation, not text already supplied by an adopted XSD 1.0 erratum. The executable summary labels it `proposed_C1_absent`; its `augmentation-conflict` field preserves the unqualified authority gap instead of substituting a normative invalid-value proof.

A concrete total S1 alternative retains requiredness OR but chooses the most-local source AU for present fixed checking and the most-local optional constrained AU for absent augmentation, with stable declared source order resolving same-level duplicates. S1 accepts absence with differing defaults using the selected value and can admit present `2` beside inherited fixed `1`; source-order precedence is an explicitly chosen interpretation, not a property of an unordered set.

Recommendation is C1 because it retains inherited checks and gives deterministic single-attribute normalization without a new schema-invalidity condition. Approving C1's conflicting-absence rejection or choosing S1 requires maintainer review of this concrete compatibility change; until then, affected assessment returns `unsupported-capability` with `S06-AU-01`, preserving independently proven invalid-schema and resource-limit results.

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

DT01 supplies the shared calendar predicate. Explicit-zone aliases require exact normalized instants; absent-zone values retain timezone-presence semantics; duration equality compares exact signed months and seconds separately from anchor-based ordering, so `P1Y=P12M`, `P1D=PT24H` and `P1M!=P30D`.

The complete BCE/calendar-crossing equality interpretation is still qualified by DT01; no calendar equality result is invented here. Original lexical witnesses, namespaces, selected union type and ordered list item values remain necessary for #184, #188/#189 and #198.

## Pure assessment and retained-constraint contract

Inputs come only from immutable canonical/resolved/composed graphs through `prepareResolvedCompilationInput` and accepted #178 analysis. The pure AU stage performs no network I/O, recompilation, payload validation, occurrence analysis or persisted-format mutation.

Each original AU record retains its component ID, owner ID, declaration ID, QName, original scalar type reference, required boolean, own constraint and declaration constraint separately. Every operand retains lexical text, source path/digest/location, namespace bindings, whitespace/facet layer and selected list/union type context; the effective constraint retains its origin.

Outputs separate `schemaOperands`, `effectiveRuntimeUses`, identity/derivation diagnostics, and the conditional repeated-use qualification. A matching restriction removes replaced base uses from runtime closure while preserving them as original schema/derivation operands; conjoining removed base defaults into the new runtime plan would be wrong.

The #231 `AssessedAttribute.constraints` entry containing only owner/use/value relies on the outer attribute type and cannot express this full independent contract after replacing operands. #179 should retain original AU references or add the original declaration/type and own-versus-declaration constraint origin per entry, instead of synthesizing a merged fixed/default operand.

This is an internal assessed-plan change only; format 2 already preserves original declared graph data. Any later persisted-plan/version change remains an explicit #185/#186 review, not a side effect of AU research.

### Extension and restriction predicates for RE01

`ExtensionAttributes(B, local)` unions original AU identities and preserves every base AU; it checks complex-type declaration uniqueness, individual operand legality, final/type controls and wildcards independently. It does not decide differing same-global present/default semantics by selecting a last use.

`RestrictionAttributes(B, local)` performs the XSD replacement/omission/prohibition mapping first. For one matching base AU it requires requiredness preservation, valid scalar type derivation from the original base type, and the effective fixed constraint condition under the accepted S02 typed-value interpretation.

For several matching base AUs, C proposes applying those checks against every matched original base AU and retaining every relevant original fixed operand. The primary rule names a matching `B` without settling multiple-match choice; RE01 must parameterize or return the AU01 qualification rather than claim this universal predicate has been accepted.

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
for qualified multiple matches: return S06-AU-01 with source operands
only after accepted interpretation: compute complete reviewed predicates
charge result arrays/strings and diagnostics before allocation; freeze result
```

Group memoization shares existing immutable AU records and prevents exponential group re-expansion. Repeated references may add provenance routes, so route collection is also bounded before copying; a resource failure returns no partial assessed type/operation table.

Legal recursion through element/type boundaries remains a graph reference and does not enter AU expansion. Forbidden attribute-group/base/scalar cycles remain S05 invalid-schema diagnostics with related source paths, including components absent from runtime closure.

With valid acyclic group/base dependencies, finite input and sufficient resources, identity union and candidate C's constraint summary terminate. This is completeness for the stated AU/set/scalar probe domain, not completeness of XSD schema validation or of RE01 witness search.

Semantic defaults remain independently applied 100,000 nodes and 1,000,000 work units. String/namespace/member parsing, exact typed comparisons, inherited AU copying and diagnostic/provenance copying are charged before work/allocation; S03/S04 budgets and conservative cyclic-depth behavior stay unchanged.

## Independent reference observations

All 45 committed [AU01 fixtures](../test/conformance/fixtures/xsd/attributes/au01/extension-required-fixed-optional-none.xsd) are new minimal sources authored for this research. The pinned draft's differing-use/group/prohibited fixtures remain historical evidence; none is silently rewritten or imported by the executable probe.

[The discovered test](../test/conformance/reference/s06_au01_contract_test.py) hand-authors conditional expectations and reference observations separately; [the bounded candidate](../test/conformance/reference/s06_au01_probe.py) imports no production compiler or unaccepted draft modules. The established `*_test.py` discovery executes nine AU01 test methods, including 25 optional pairs and both requiredness orderings.

### Optional matrix: XMLSchema 4.2.0 schema observations

`A` means accepted by this engine, `R` rejected; the table is not a normative verdict. libxml2 2.14.6 rejects every one of these 25 extension pairs.

| Base / local | N | D(1) | D(2) | F(1) | F(2) |
|---|---|---|---|---|---|
| N | A | A | A | A | A |
| D(1) | A | A | A | A | A |
| D(2) | A | A | A | A | A |
| F(1) | R | R | R | A | R |
| F(2) | R | R | R | R | A |

XMLSchema accepts conflicting defaults and augments absence with the local value: base `D(1)`/local `D(2)` produces `2`, the reversed schema produces `1`; present integer `1`, `2` or `3` is accepted in both. Base default/local fixed `2` is accepted with fixed `2` behavior, whereas reversing to base fixed/local default is rejected.

These order-dependent results illustrate implementation policy, not primary selection authority. They refute a blanket claim that both engines reject every mismatched repeated-use combination; the original required-fixed/optional-none example is still rejected by both.

### Identity, source controls and scalar contrasts

| Fixture or contrast | Primary/project conclusion | XMLSchema | libxml2 |
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
| Base optional none/local required fixed | AU01 present choice qualified | A | R |
| Base required fixed/local optional none | AU01 present choice qualified | R | R |
| QName fixed `p:item`, input `q:item`, same binding | S02 value-equivalent | Reject input | Accept input |

The valid inherited-required controls each accept presence and reject absence in libxml2. The single-AU typed fixture supplies 14 present-value contrasts for integer, string, token, QName, list, union and pattern; the QName alias disagreement remains recorded rather than changing the independent S02 expected value.

## Executed checks and limits

Fresh reference installation was performed by the coordinator with `npm run reference:setup` before leaf probes. Observed versions are Python 3.12.14, xmlschema 4.2.0, lxml 6.1.0/libxml2 2.14.6 and elementpath 5.0.4; no second installation route was introduced.

```bash
npm run reference:setup
python -m unittest discover -s test/conformance/reference -p 's06_au01*_test.py' -v
npm run test:reference:full
npm run ci
npm run test:conformance
git diff --check
```

The focused command used the coordinator's fresh reference environment via its Python executable and passed all nine test methods. Aggregate full-reference, CI, conformance and documentation/support-matrix results belong to the coordinator's exact final integration record; they are not inferred from these scoped checks or old #231 results.

Leaf `npm run docs:validate` and `git diff --check` also pass, including the support-matrix check. These portable checks supplement the XML/reference probes; the coordinator reruns required aggregate gates on the integrated final revision.

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

The node and work limits are independent: reaching the node limit does not grant extra work, and the documented override isolates that boundary. Input fixture allocation is caller-owned; the candidate bounds its own indexing, normalized buffers, list outputs and comparisons before allocation/work.

The probe intentionally does not import later #184 payload digit/byte limits into schema research. It does not qualify arbitrary facets, Unicode QName grammar, full scalar calendars, production performance or platform maxima; unsupported probe datatypes return unsupported-capability and never silently succeed.

IDE inspections are unavailable; repository checks and reference XML parsing provide verification. Hosted CI, protected merge, complete semantic interpretation, exact-revision independent acceptance and production guards remain explicit coordinator/downstream gates.

## Handoff and open acceptance obligations

#179 receives original-AU set identity, independently established requiredness and source mapping, scalar context obligations, conditional C and alternative S predicates, and the exact guards still required. #184 receives every surviving runtime AU operand and its origin, plus removed/schema-only operands kept separately for diagnostics; no payload scalar implementation is delivered here.

The accepted path remains canonical/resolved/composed graph, accepted #178 occurrence analysis and #179 assessment. Legacy default generation, format 2, `xsd10-faithful-v1`, companion regeneration policy, D07 qualifications, S01/S05 disagreements and later production activation remain unchanged.

The local acceptance gate requires an explicit reviewed answer for multiple present AU selection and absent/default/fixed augmentation, not just passing reference probes. It also requires pinning any dependent reviewed DT01 predicate, substantive independent review at an exact delivered revision and the coordinator's final delivery checks/normal merge; these obligations remain open until separately recorded.
