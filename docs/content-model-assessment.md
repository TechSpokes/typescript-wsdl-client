# Schema and Capability Assessment

Internal S06 schema-only planning over the reviewed analysis interface. See the root [README](../README.md).

## Status and boundary

#178 is accepted through [PR #230](https://github.com/TechSpokes/typescript-wsdl-client/pull/230).
#179 is under independent substantive review; its combined S06 gate has **not** passed.
The qualifications below must be resolved before their affected models can be assessed.
The approved [ADR-003 profile and enforcement matrix](decisions/003-content-model-contracts.md#xsd-10-profile-and-enforcement-s02-d04), compatibility policy and provisional budgets remain authoritative.
This draft does not replace the approved profile with a smaller derivation profile.

[`assessSchemaProfile`](../src/compiler/assessSchemaProfile.ts) consumes the immutable result of [`analyzeOccurrences`](content-model-analysis.md), obtained through [the common source/catalog boundary](content-model-companions.md).
It takes explicit component roots or a selected WSDL binding/operation, with optional service/port and direction-name disambiguation.
An assessed request contains independent selected-operation results; an unrelated unsupported declaration does not automatically disable another operation.
Request-wide resource exhaustion returns a typed failure with no partial assessment.
Results distinguish `invalid-schema`, `unsupported-capability`, `resource-limit` and the existing `incompatible-artifact` boundary.
Diagnostics retain rule, component, original source path, related sources and affected operation IDs; a request-wide diagnostic names its scope without copying all caller IDs after exhaustion.

An operation's `supported` result means schema planning over its selected closure, within explicit scopes and required adapter qualifications.
It does not mean a payload passed validation or a SOAP adapter has been implemented/qualified.
Payload matching remains #180, independent enumeration remains #181, and scalar payload enforcement remains #184.
Legacy default behavior and public support rows retain their existing meanings.

## Original versus effective content

The canonical/resolved/composed inputs remain immutable and source-faithful.
S05's ordered contributions, source-local bounds, independent group-use bounds, lexical/chameleon context, namespace/role identity and original operands remain available.
Restriction replacement remains distinct from extension concatenation.

`AssessedType.original` retains the S05 plan; `effectiveContent` records XSD component mapping separately.
Direct empty sequence/all syntax and an empty optional choice map to empty effective content when not mixed.
A vacuous extension inherits the base's entire content type, including mixed or scalar identity; it does not wrap an inherited all group in an additional sequence.
An extension through `complexContent` can inherit a scalar-content complex base when effective content is empty.
A `simpleContent` restriction creates its own anonymous scalar component identity; an inline type must actually derive from the original base content definition, not merely have a similar interval or facet set.
Extensions retain scalar identity.

Schema legality uses the primary ur-type component (mixed sequence of lax `##any` 0..unbounded) to check extension parity and attribution.
#178's opaque builtin summaries remain declared-only; this bounded legality view does not certify concrete opaque payload content.
Lax/skip wildcard scopes remain explicit, and known declarations admitted by strict/lax wildcards join the selected closure.
Disabled particles and prohibited attribute uses correspond to no surviving component.
Their source syntax remains visible and S05's reference/cycle gates still apply; absent local scalar operands do not acquire runtime capability requirements.
An existing global declaration referenced through an absent use still receives schema-only legality checking, including its surviving local declarations, facets, fixed operands and particle constraints.
Derivation bases retain schema-only operand closure; only effective inherited/surviving elements, attributes and declared wildcards acquire runtime capability requirements.
Explicit prohibition removes an optional inherited attribute; simply omitting its declaration still inherits it.
Ordinary syntax, final/block domains and retained children are checked in schema-only operand closures; excluded identity rules remain explicitly unassessed there.
Runtime polymorphism exclusions apply to surviving runtime members, without rejecting a legal abstract type solely needed as a schema operand.

## Particle rules

Bounds use the single exact occurrence algebra; no finite repetition is expanded into events.
Group-use positions get distinct bounded legality identities without mutating shared definitions.
Legal recursive element/type edges remain graph references, not recursive expansion.
All-group restrictions, same-name element consistency, wildcard overlap and applicable UPA are checked separately.
Element consistency is structural and includes unrealizable alternatives.
Attribution includes initial validation attempts in dead alternatives, but does not invent reachable suffix positions after a required empty-language separator.

Restriction checking uses the XSD 1.0 component-mapping rules, not interval containment as a payload-language proof:

- NameAndTypeOK checks name, occurrence range, nillability, typed fixed values, block preservation and type derivation.
- Namespace compatibility/subset and processing strength retain original wildcard contexts.
- Recurse, RecurseLax, RecurseUnordered, RecurseAsIfGroup and MapAndSum use explicit bounded pair state; group-to-wildcard NSRecurseCheckCardinality remains qualified below.
- Pointless-compositor normalization belongs only to component restriction checking.
- Formal `schemaEmptiable` and effective total range are used only where the primary schema rule invokes them; language `nullable` remains separate.

The attribution path-separation implementation adapts the independently published XMLSchema model-check approach while retaining distinct use positions and the primary empty-language semantics.
The adaptation is from XMLSchema 4.2.0 `validators/models.py`, copyright 2016–2024 SISSA, authored by Davide Brunato; its [MIT notice](licenses/xmlschema-MIT.txt) is retained with this distribution. Independent counterexamples travel with the implementation.
No emitter or payload validator gets a second occurrence algorithm.

## Attributes, wildcards and fixed operands

Assessment recomputes uses and wildcard combinations from original group/type operands.
A prohibited local use contributes no AU, even during extension, and cannot delete an inherited base use.
Distinct declaration identities sharing an attribute QName violate component constraints.
Surviving attribute declarations require simple type definitions; scalar-content complex types remain complex definitions.
Complex types permit at most one distinct ID-derived attribute declaration, and attribute groups permit at most one distinct ID-derived AU member; prohibited local syntax contributes neither.
Attribute groups separately enforce QName uniqueness over distinct AU identities; repeated references to the same group contribute its existing AU members by set union.
Equivalent uses of the same global declaration retain original use constraints and provenance.
The unresolved differing-use case is qualified below.

Fixed-value comparisons interpret schema operands in their declared datatype/value space and lexical QName context.
Integer/decimal arithmetic remains exact; boolean aliases, binary values, QName prefixes, list tokens and declared union order are not compared by JavaScript coercion or raw spelling.
Scalar type derivation is checked independently of fixed equivalence.

Local attribute-wildcard processing follows c-awi1; without a local wildcard, c-awi2 selects the first non-absent group wildcard's mode.
Nested groups retain their own declaration contexts and mode selection.
Extension union retains the complete local wildcard's processing when present; restriction checks namespace subset and processing strength.
Every required intermediate intersection/union must be expressible in XSD 1.0; imported `##other` is interpreted in the declaring schema's effective namespace.

## Scalar enforcement plans

`ScalarSupportPlan` retains reference, variety, builtin/primitive, item/member references, ordered facet layers, original lexical values/context, whitespace mode and evidenced pattern plans.
Every plan names runtime owner **#184**, consumed by **#188/#189/#198**.
`OperationAssessment.elementValues` ties each reachable element default/fixed constraint to its original type, original lexical constraint, schema operand type, and `simple-content` or `mixed-text` scope.
The primary mixed/formally-emptiable rule also applies to `anyType` and its opaque mixed extensions: their schema operands are strings, while child content retains its opaque assessment scope.
Existing schema-only declarations, including surviving local descendants of a global type, still obey the primary prohibition on value constraints for ID-derived types or simple content; legal absent ID uses add no runtime ID capability.
The plan does not implement a separate payload scalar engine.
Schema-declared enumeration/default/fixed/bound operands are interpreted only to establish schema legality and value equivalence.

| Constraint | S06 schema responsibility | Payload owner |
|---|---|---|
| Lexical/value space | Validate schema operands, builtin restrictions and exact contexts | #184 |
| Enumeration | Interpret operands in the base type's value space; retain derivation layers | #184 |
| Pattern | Validate admitted grammar/equivalence and retain same-step alternatives versus inherited conjunction | #184 |
| Whitespace | XML whitespace only; check strengthening/fixed rules and retain normalization | #184 |
| Numeric bounds | Exact decimal/integer operands; datatype value-space ordering and facet legality | #184 |
| Precision | Exact normalized coefficient/scale and totalDigits/fractionDigits legality | #184 |
| Length | Preserve datatype units and QName's XSD 1.0 facet-valid exception | #184 |
| QName | Expanded name plus original lexical namespace context | #184 |
| Default/fixed | Typed operand validity/equivalence; retain original constraints and witnesses | #184 |
| List | Atomic-member qualification, token normalization, ordered item constraints | #184 |
| Union | Declared-order effective member choice; XSD 1.0 nested-union flattening, with original declarations retained separately | #184 |

Union whitespace is `member`: each member normalizes the original lexical input independently, and union pattern layers use the selected member's normalized value.
XSD 1.0 component mapping flattens nested union members, including restricted union members; an outer union therefore does not inherit the nested union's facets.
`declaredMembers` retains those source references while `members` and `unionMapping: "xsd10-flattened"` identify the effective component mapping.
[WG issue 2044](https://www.w3.org/Bugs/Public/show_bug.cgi?id=2044) corrected this by changing XSD **1.1**, not by an accepted XSD 1.0 erratum.
The independent payload contrast records primary acceptance of outer-union integer `2`, XMLSchema rejection and libxml2 acceptance separately.
[WG issue 3763](https://www.w3.org/Bugs/Public/show_bug.cgi?id=3763) remains an XSD 1.0 restriction/value-space defect; literal member derivation is not a proof of payload-language inclusion.

Float/double schema operands round directly from exact decimal rationals to their IEEE type, avoiding intermediate binary64 rounding of a binary32 operand.
`anyURI` schema operands use the generic [RFC2396](https://datatracker.ietf.org/doc/html/rfc2396), [RFC2732](https://datatracker.ietf.org/doc/html/rfc2732) and [RFC2373](https://datatracker.ietf.org/doc/html/rfc2373) grammar after XLink escaping; no protocol-specific URL check or dereference is imposed.
Unicode category pattern evidence records Node Unicode 17.0 / ICU 78.3; later portable consumers must qualify their own version/context rather than assume platform equivalence.

Selected binding assessment includes operation bodies, headers, header faults and declared faults, binding-wide required extensions and selected-port extensions.
String style/use enumerations retain exact spelling; NMTOKEN names/parts and anyURI transport/action values use their declared XML whitespace normalization while preserving source operands.
[WSDL 1.1](https://www.w3.org/TR/2001/NOTE-wsdl-20010315) sections 2.1.3, 3.4 and 3.6 require understood mandatory extensions, explicit SOAPAction for SOAP 1.1 HTTP (including an explicit empty value), and one fault-message part.
Other operation/port extension subtrees do not enlarge the selected capability claim.
Recognized SOAP extension local names must occur in their declared WSDL positions; a familiar namespace does not qualify an unknown mandatory local name.
Selected abstract/bound directions, names and faults must agree, without duplicate or surplus directions, competing protocols or addresses.
Omitted bound directions/faults are a capability-completeness qualification, not invented schema-invalidity; WSDL 1.1 section 2.5 permits their omission.
Both SOAP versions require the selected endpoint scheme to match the HTTP transport.
Notification/solicit-response binding capabilities remain unqualified under WSDL 1.1 section 2.4.
The [SOAP 1.2 WSDL submission](https://www.w3.org/submissions/wsdl11soap12/) sections 3.1–3.7 require first-child binding/operation/body/fault/address extensions, absolute action/namespace URIs and a transport-compatible endpoint.
`actionRequired` records the effective default-true boolean; an explicit false permits an absent action.
Its `tParts` list may be empty, unlike SOAP 1.1 `NMTOKENS`.
Absent body/fault `use` is legal but lacks explicit literal capability evidence and returns `unsupported-capability`; header/headerfault `use` is required.
Encoding/namespace checks retain the declared binding style and body use; forbidden hints are invalid, while legal encoded bodies remain unsupported.
Section 2.3 gives normative text precedence over outlines/schema, resolving fault-name `NMTOKEN` versus Appendix `NCName` and optional fault `use` without selecting a validator's interpretation.
SOAP 1.1/1.2 adapter qualification remains required before dispatch and belongs to #190/#192.

An enumeration on base `xs:string` with value `" a "` denotes that base string value.
A local collapse facet does not rewrite the enumeration component's value to `"a"`.
Consequently a schema default `"a"` is invalid for that restriction, independently of facet order.
Intervals and schema loads do not establish an admitted payload lexical witness.
The [S02 normalization laws](decisions/003-content-model-contracts.md#equivalence-and-normalization-s02-d03) still require later consumers to preserve or prove such witnesses.

## Primary-rule evidence and open gates

The complete original XSD 1.0 second-edition [structures XML source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/structures.xml) and [datatypes XML source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/datatypes.xml) were read independently.
The source identifies the October 28, 2004 Recommendation; editorial deletions are excluded when interpreting its final clauses.
Direct shell retrieval was unavailable in the managed network; the web connector also supplied official dated recommendations and WG records.
Pinned source SHA-256 values are `e496af408b14853e6169ac7c1fca09d55a81bd73771758ad6be020960e1317ba` and `430f010df8ed077a4ed11d9d5812ea5e5d62ba67e715f1bbeeaa8ee1765d84c7`, respectively.

The [fixed expectation manifest](../test/conformance/schema-assessment-manifest.json), its fixture paths and [pinned reference test](../test/conformance/reference/schema_assessment_contract_test.py) record primary outcomes separately from each validator's observations.
They preserve disagreements involving block constraints, malformed facet/range syntax, XML-only whitespace, absent uses, empty effective-content extensions, temporal aliases and reordered derivations.
An engine majority does not decide the primary rule.
The named-ID restriction/default contrast records libxml2 acceptance beside explicit primary invalidity and XMLSchema rejection; the source-only ID value law remains enforced.
Conversely, XMLSchema checks prohibited local ID/complex-type attribute syntax as a component and rejects it; the primary mapping creates no component, and libxml2 accepts both controls.
Those explicit disagreements preserve the absent-component boundary rather than adding a runtime exclusion.
Both engines also reject identical repeated group/declaration references that the primary set-union and distinct-declaration constraints permit; independent controls distinguish those cases from forbidden distinct group AUs.
The invalid disabled-global mixed/simple-content restriction also records XMLSchema 4.2.0's `AttributeError` separately from schema rejection; a validator crash is not a validity answer.
S01/#181 and [S05 disagreements](content-model-composition.md), plus [S02 platform/security qualifications](content-model-decisions.md), remain assigned to their existing owners.

| Qualification | Evidence and unresolved question | Owner and affected gate |
|---|---|---|
| S06-AU-01 Open | The primary extension mapping unions AU sets for the same global declaration; component uniqueness constrains declaration identity, while cvc-complex-type refers to “that attribute use” without resolving differing use/value constraints. Both pinned engines reject weakening/mismatched cases, but identical/equivalent cases and prohibited-use controls expose different rejection behavior. No validator answer or arbitrary merge policy is accepted. | #179 / S06 lead; affected models cannot be assessed; combined #153 gate remains open. |
| S06-RE-01 Open rule and implementation gate | cos-ct-extends1.5 requires an existential reordered extension/restriction witness. Vacuous witnesses prove restored string/token cases legal; restored unrelated attribute int violates primary type rules. A required empty-choice separator supplies another formally valid witness: primary restriction mappings use formal emptiability while its accepted language is empty. A wildcard suffix can even bypass the apparent particle string/int conflict without introducing an EDC conflict. This conflicts with explanatory subset/no-addback claims and disproves suffix-only witness search; particle-int's primary outcome therefore remains unresolved. No extra language-inclusion test or complete bounded witness algorithm has been accepted. | #179 / S06 lead; affected models cannot be assessed and approved derivation scope cannot silently shrink; combined #153 gate remains open. |
| S06-PW-01 Open | [WG R-240 / issue 2232](https://www.w3.org/Bugs/Public/show_bug.cgi?id=2232) records ambiguous per-member occurrence checking in NSRecurseCheckCardinality. Its proposed zero-minimum wildcard adjustment was not published as an XSD 1.0 erratum; XSD 1.1 removed the rule. Nested optional-group controls expose pinned-engine disagreement. | #179 / S06 lead; affected restrictions and combined #153 gate remain open. |
| S06-DT-01 Open | Appendix E computes leap years using the lexical negative year, while the informative no-year-zero discussion and cross-zero rollover imply incompatible treatment. Pinned engines disagree with the unshifted arithmetic for BCE leap operands. Negative-year schema operands and duration ordering whose reference additions cross year zero remain unassessed; exact duration months/seconds equality needs no calendar ordering. [WG issue 3256](https://www.w3.org/Bugs/Public/show_bug.cgi?id=3256) documents the later XSD 1.1 interpretation change, not an XSD 1.0 correction. | #179 / S06 lead for schema operands; #184 for later runtime calendar semantics; affected models and combined #153 gate remain open. |

For a base wildcard with exactly 0..unbounded bounds, all competing R-240 occurrence readings agree.
That case is discharged recursively with namespace/process checks intact; other group-to-wildcard cardinality cases remain qualified.

The official [second-edition errata](https://www.w3.org/2004/03/xmlschema-errata) were checked: the published default/PSVI correction does not settle these four questions.
These are explicit open gates, not additional permanent exclusions in the approved profile.

## Budgets and reproduction

Each assessment independently retains 100,000 graph nodes and 1,000,000 work steps, inclusive.
Indexes, exact arithmetic, pair/fixed-point work, use-position copying, operand normalization/pattern relations, selection copies and iterative result freezing are charged before potentially large allocations.
Resource failure is request-wide and returns no partial successful operation table.
Later matcher, payload lexical/digit, generated-output, streaming and production qualification limits retain their [D09 owners](decisions/003-content-model-contracts.md#provisional-resource-budgets-s02-d09).
S03/S04 limits and conservative cyclic-depth behavior remain unchanged.

`maxNodes` bounds the immutable input graph; expanded legality use positions are bounded by independently charged work before copying, not by a newly invented persisted graph count.
The [reproducible assessment measurement probe](../test/conformance/measure-schema-assessment.ts) writes ignored measurements under `tmp/conformance/assessment`.
Development measurements on Node 24.19.0: a 4-node recursive model passed at 668 steps (0.649 ms), failed at 667 (0.814 ms), passed at 4 nodes (0.405 ms) and failed at 3 (0.085 ms).
A 200-digit finite repetition passed without expansion in 1.574 ms / 2,190 steps.
A depth-20 shared binary group DAG with 87 input nodes exhausted the default work budget in 87.129 ms before full copying.
Synthetic immutable input-index probes passed at 100,000 nodes in 31.073 ms / 100,019 steps and failed at 100,001 before indexing in 0.213 ms; these are budget measurements, not source-validity or production #208 qualification claims.

```bash
npx vitest run test/unit/schema-assessment.test.ts test/conformance/schema-assessment.test.ts
npx tsc -p test/unit/tsconfig.json
npx tsc -p test/conformance/tsconfig.json
npx tsx test/conformance/measure-schema-assessment.ts
npm run reference:setup
npm run test:reference:full
npm run test:conformance
npm run ci
```

Final #179/combined acceptance must pin its actual reviewed/tested revision, measurements, tool versions and all local/hosted/consumer checks.
#178 and predecessor checks are baseline evidence, not substitutes.
Final artifact content precedes checksums/fingerprints; any hashed-content change requires regeneration.
No persisted format/model/profile change, package/tag publication, public faithful activation, projection, codec, transport rewrite or downstream emitter rewrite is delivered by this draft.
