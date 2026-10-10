# PW01: Group-to-Wildcard Restriction

Research contract, competing interpretations and independent evidence for S06-PW-01. See the root [README](../README.md).

## Disposition and decision request

[Issue #235](https://github.com/TechSpokes/typescript-wsdl-client/issues/235) has a complete research proposal and executable evidence, but its material interpretation gate remains open.
The published XSD 1.0 text and proposed R-240 correction yield different answers for 13 cases below.
Independent review can accept the accuracy of this report without selecting the correction or closing #235.

The recommended project interpretation is option B, the proposed R-240 zero member minimum.
Its authority is a documented WG proposal, not an adopted XSD 1.0 erratum.
The maintainer must choose between these concrete contracts after independent review; this report makes no such choice implicitly.

| Option | Member comparisons | Whole retained group | Compatibility consequence |
|---|---|---|---|
| A: Literal 2004 member bounds | Original wildcard minimum and maximum | Original wildcard range | Rejects optional/unit members even when the total fits |
| B: Proposed R-240 zero member minimum | Zero minimum; original maximum | Original wildcard range | Admits those contrasts; preserves namespace, maximum and processing checks |

Option B is monotone relative to A on the same normalized operands: lowering only member-view minima cannot turn a passing A comparison into a failure.
It preserves every result in the already discharged original `0..unbounded` subset and additionally settles finite and positive-minimum cases once selected.
It also admits the formally dead `dead-sequence` contrast; accepting B does not authorize a payload-language claim.

A term-only interpretation that drops both member bounds differs from the actual R-240 proposal and has no adopted wording here.
Adopting the XSD 1.1 restriction system changes the approved profile and is outside this decision.
No narrower permanent profile, persisted format change, public activation or removal of the #179 guard is delivered.

The [joint handoff](content-model-s06-research-handoff.md) owns exact delivery/review revisions and final combined validation.
Production implementation remains #179; [RE01 #234](https://github.com/TechSpokes/typescript-wsdl-client/issues/234) receives the parameterized predicate below.
#180/#181 retain payload matching, count gaps and independent model enumeration.

## Source authority and applicable clauses

The governing source is [XSD 1.0 Structures, Recommendation 28 October 2004](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/).
The complete XML source was read through the [pinned mirror](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/structures.xml), SHA-256 `e496af408b14853e6169ac7c1fca09d55a81bd73771758ad6be020960e1317ba`.
Editorial deletions in that source are excluded from the final clauses.

[NSRecurseCheckCardinality](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-NSRecurseCheckCardinality) invokes “Every member of the {particles} of the group” and separately the “effective total range of the group”.
Its first clause calls the member a “valid restriction” of the wildcard through `cos-particle-restrict`, although that relation compares particles.
This particle/term ambiguity is the specific defect recorded by R-240.

| Clause | Operand and required comparison |
|---|---|
| [NSCompat](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-NSCompat) | Element particle: namespace membership and local occurrence range |
| [NSSubset](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-NSSubset) | Wildcard particle: occurrence range, namespace subset and processing strength |
| [NSRecurseCheckCardinality](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-NSRecurseCheckCardinality) | Group particle: recursively valid members and effective total range |
| [Occurrence Range OK](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#range-ok) | Exact lower-bound and upper-bound containment |
| [Sequence/all range](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-seq-range) | Formal sum followed by the group's local repetition |
| [Choice range](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-choice-range) | Formal alternative extrema followed by local repetition |
| [Particle restriction](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-particle-restrict) | Component mapping and specified pointless-compositor rules precede dispatch |

The [published second-edition errata](https://www.w3.org/2004/03/xmlschema-errata), including E1-56, do not amend this restriction rule.
[WG issue 2232](https://www.w3.org/Bugs/Public/show_bug.cgi?id=2232), reported September 14, 2005, remains `ASSIGNED` and `1.0 only` in the archived tracker.
Its proposed constructed comparison particle has “min occurs: 0” and “max occurs: the same as the max occurs of the wildcard particle”.

The September 23, 2006 WG comment says the constraint was deleted from XSD 1.1.
That statement records a later-version change; it does not adopt either proposed correction into XSD 1.0.
Official errata and WG pages were independently retrieved through the web connector on October 10, 2026 after direct W3C shell retrieval returned HTTP 403.

## Pure predicate consumed by RE01 and #179

Let `P` be a restriction-normalized element, wildcard or group particle and `W` the original base wildcard particle.
`within(R, W)` means exact `R.min >= W.min` and `R.max <= W.max`, with `unbounded` a distinct maximum.
For a group, `ETR(P)` is the formal effective total range supplied by [#178](content-model-analysis.md), not its accepted-count interval.

```text
restrictToWildcard(P, W, interpretation):
  element:
    within(P.localOccurs, W) AND namespaceAllowed(P.elementNamespace, W.term)
  wildcard:
    within(P.localOccurs, W)
    AND namespaceSubset(P.term, W.term)
    AND (W is actual ur-type content wildcard OR P.process >= W.process)
  sequence / choice / legal all:
    within(ETR(P), W)
    AND every member C satisfies restrictToWildcard(C, memberView(W), interpretation)

memberView(W):
  option A: W
  option B: original term/context/max, minimum replaced by zero
```

Every nested group receives its current member-view wildcard for its own total comparison.
Under B, only the outer selected group checks the original positive minimum; nested totals and terminal members compare against `0..original W.max`.
Declared group/use-site/member bounds never change, and maximum checks are never omitted.
Under A, every recursive comparison retains the original minimum.

The complete preconditions are independently validated/resolved graphs, legal source-local ranges, UPA/EDC and legal `all` placement, cycle-free containment/group edges, and the owning derivation's other constraints.
Legal element/type recursion stops at the element terminal; this predicate never descends into its value type.
`inputNodes` must be the actual immutable accepted graph node count supplied by the input owner, rather than a guessed reachable count.

The caller supplies the restriction-normalized particle view, its #178 formal ranges, original operands/provenance, and exact namespace constraints.
The base wildcard's identity distinguishes the actual ur-type exception; neither `##any` spelling nor `lax` alone implies that exception.
A positive relation result certifies this particle relation only, not complete schema legality, runtime support, finite recursive payload existence or language inclusion.

The pure [prototype](../test/research/s06-pw01/predicate.ts) has no production imports.
Its [test adapter](../test/research/s06-pw01/predicate.test.ts) injects accepted main's occurrence arithmetic and namespace relations as the subject under test; all expected outcomes are independently authored in the fixture file.
Neither file imports the unaccepted #231 assessment code, recalculates effective ranges with a second algorithm, or creates the #181 enumeration harness.

The prototype returns `answer {validRestriction, steps}` or `failure {diagnostic, steps}`.
Malformed operand callbacks report `invalid-schema`; exhaustion reports `resource-limit` with original component/source and no relation result.
A consumer must retain `unsupported-capability` for material interpretation disagreement until A or B is selected; budget exhaustion must never become an invalidity answer.

## Normalization, emptiness and original operands

XSD component mapping removes zero-maximum particles before the particle relation, while their original syntax remains available for diagnostics and reference/cycle checks.
`zero-group` maps both contents to empty and is checked by the owning complex-content restriction rule, rather than by pretending an absent wildcard has members.
The fixed fixture adapter takes that route explicitly.

A required empty choice is not pointless: its formal `ETR=0..0` and `schemaEmptiable=true` coexist with `nullable=false` and `hasRealization=false`.
Against an original `0..unbounded` wildcard its universal member check is vacuous and its formal total fits, so both candidate relations pass.
Against a positive-minimum wildcard both fail the original total check.

An epsilon alternative built from a non-disabled optional element remains a real choice alternative.
`epsilon-choice-failure` therefore retains `ETR=0..1` and fails original minimum 1 under both candidates.
`nested-epsilon-choice` has outer total `1..2`; its nested `0..1` group fails A and passes B.

`removable-epsilon-control` uses an empty sequence plus a single element alternative.
The published pointless-compositor rules ignore that empty sequence and singleton choice for restriction, dispatching the surviving element through NSCompat.
Its original `ETR=0..1` and original epsilon payload alternative remain recorded; both candidate relations pass without inferring payload containment.

#179 must distinguish original grammar/ranges from any normalized comparison view.
If normalization retains a group but changes its formal range, obtain that view's range from the single #178 evaluator over a non-mutating comparison graph; do not reuse a stale original range or introduce another occurrence algorithm.
The fixed probe's retained groups have unchanged ranges; singleton dispatch is independently covered by `removable-epsilon-control` and `zero-disabled-choice`.

Named-group definition bounds stay `1..1`; a group reference supplies its own repetition and provenance.
`shared-group-uses` and `repeated-group-use` cover shared definitions and different use-site multiplicities without expanding finite repetitions.
Forbidden group cycles remain S05 invalid schemas even beneath zero bounds; element/type recursion stays legal.

## Namespace and processing requirements

The base wildcard is decoded using its original lexical/effective namespace context, including imports and chameleon inclusion.
`##other` excludes that effective namespace and the absent namespace; it is never rebound to the restricting schema's namespace.
Imported `##other` therefore accepts `urn:pw01`, excludes `urn:pw01:base` and excludes unqualified elements in the three imported controls.

The chameleon control binds `##other` to its included effective `urn:pw01` namespace and rejects the caller's qualified members.
Prefixes, declaration identity, source path and the original lexical wildcard are retained beside the decoded namespace constraint.
No flattened S05 attribute-wildcard processing plan is substituted for these particle operands.

NSCompat imposes namespace and occurrence comparisons on an element particle; it does not compare an element's nonexistent `processContents` property.
Nested wildcard members use NSSubset, with `strict > lax > skip` and the precise ur-type exception.
Optional members still require namespace and wildcard processing checks; their zero minimum does not excuse a disallowed namespace or weakened mode.

The existing [S05 imported/processing evidence](content-model-composition.md#independent-disagreements-and-remaining-obligations) remains separate, particularly attribute-group/local wildcard processing qualifications.
These PW01 particle controls do not settle those other obligations or change their owners.

## Independent fixtures and engine investigation

[The fixed fixture expectations](../test/conformance/fixtures/xsd/s06-pw01/expectations.json) separate `literal2004`, `proposed2232`, `primarySchema`, and observed engine answers.
`primarySchema=unresolved` means the candidate rules differ; neither engine observation fills that field.
Payload primary entries describe the original particle language independently of whether a validator accepted the derivation declaration.

The exact [pinned nested fixture](../test/conformance/fixtures/xsd/s06-pw01/pinned-nested-optional.xsd) was copied from #231 revision `460f5b8379c68ffef79917284e445b5ab046429e`, path `test/conformance/fixtures/xsd/assessment/nested-group-wildcard-cardinality.xsd`.
Its SHA-256 is `1795040f9bdb7b592f389340262167d56927e9ec4a5735b1955366e305ed93ca`.
All other fixtures in this family are independently authored research contrasts.

XMLSchema 4.2.0 accepts `direct-optional-member` but rejects the otherwise equivalent `nested-optional-member` and the pinned fixture.
Its [groups.py at v4.2.0](https://github.com/sissaschool/xmlschema/blob/v4.2.0/xmlschema/validators/groups.py) `XsdGroup.is_element_restriction`, lines 685-714, first checks group occurrence compatibility, then rejects a retained `XsdGroup` member at lines 697-698.
The nested fixture reaches that branch with direct members `[sequence 0..1, element 1..1, element 1..1]`; the rejection is not proof that the published rule requires each leaf minimum 2.

That same method bypasses member restriction checking for a zero-minimum terminal at line 699.
The optional namespace and wildcard-strength controls expose its resulting acceptance of primary-invalid comparisons.
Empty-group early success also explains acceptance of `empty-required-positive-min` despite its zero formal total.

libxml2 2.14.6 accepts the nested fixture and every ordinary negative particle restriction control here.
Its [versioned xmlschemas.c](https://github.com/GNOME/libxml2/blob/v2.14.6/xmlschemas.c), lines 16521-16528, leaves the owning derivation particle check as an urgent TODO.
The separate particle restriction code is guarded by `ENABLE_PARTICLE_RESTRICTION`; `xmlSchemaCheckRCaseNSRecurseCheckCardinality` is additionally under `#if 0` at lines 17026-17079.

The fetched libxml2 source SHA-256 is `a74cd24a7ab2835a27abd5a0da7ff9343301aa284d29ef5ecd0b725fd00f433c`.
Installed XMLSchema `groups.py` SHA-256 is `c49a47da49d3146bbfd692da02e138f084cd50b8d52212e24cd4b63d2de9e063`.
Source inspection and independently executed negative controls explain the disagreement without promoting either validator to semantic authority.

libxml2 rejects the huge exact fixture during `maxOccurs` parsing; the reference record calls this `parse-range-limit` rather than a validity verdict.
The source integer is legal and exact; the TypeScript predicate and accepted #178 arithmetic decide the proposed comparison without repetition expansion.
Reference engines' finite representations do not redefine the schema's allowed integer domain.

### Fixed schema truth table

`A/B` are relation outcomes after owning component mapping and restriction normalization.
`ETR` is the independently specified original formal range; the removable epsilon row deliberately dispatches a surviving element instead.
Engine columns are schema-load observations, including cases both candidates classify invalid.

| Case | Original ETR | A | B | XMLSchema 4.2.0 | libxml2 2.14.6 |
|---|---|---|---|---|---|
| `zero-min-control` | 2..3 | true | true | accepted | accepted |
| `direct-optional-member` | 2..3 | false | true | accepted | accepted |
| `nested-optional-member` | 2..3 | false | true | rejected | accepted |
| `literal-positive-control` | 4..4 | true | true | accepted | accepted |
| `whole-minimum-failure` | 1..2 | false | false | rejected | accepted |
| `whole-maximum-failure` | 4..4 | false | false | rejected | accepted |
| `choice-positive-control` | 2..3 | true | true | accepted | accepted |
| `repeated-choice` | 2..2 | false | true | accepted | accepted |
| `epsilon-choice-failure` | 0..1 | false | false | rejected | accepted |
| `nested-epsilon-choice` | 1..2 | false | true | rejected | accepted |
| `removable-epsilon-control` | 0..1 | true | true | accepted | accepted |
| `required-wildcard-strength-failure` | 2..2 | false | false | rejected | accepted |
| `optional-namespace-failure` | 1..2 | false | false | accepted | accepted |
| `all-optional-member` | 2..3 | false | true | accepted | accepted |
| `all-positive-control` | 2..2 | true | true | accepted | accepted |
| `repeated-sequence` | 4..6 | false | true | rejected | accepted |
| `shared-group-uses` | 4..4 | false | true | rejected | accepted |
| `count-gap` | 2..4 | false | true | accepted | accepted |
| `unbounded-control` | 1..unbounded | true | true | rejected | accepted |
| `unbounded-member-failure` | 1..unbounded | false | false | rejected | accepted |
| `empty-required-choice` | 0..0 | true | true | accepted | accepted |
| `empty-required-positive-min` | 0..0 | false | false | accepted | accepted |
| `dead-sequence` | 2..2 | false | true | accepted | accepted |
| `zero-disabled-choice` | 1..1 | true | true | rejected | accepted |
| `zero-group` | 0..0 | true | true | rejected | accepted |
| `wildcard-strength-valid` | 1..2 | true | true | accepted | accepted |
| `wildcard-strength-failure` | 1..2 | false | false | accepted | accepted |
| `namespace-failure` | 2..2 | false | false | rejected | accepted |
| `recursive-element-control` | 1..2 | true | true | accepted | accepted |
| `huge-exact-repetition` | 2H..2H | false | true | rejected | parse-range-limit |
| `imported-other-valid` | 2..2 | true | true | accepted | accepted |
| `imported-other-base-failure` | 2..2 | false | false | rejected | accepted |
| `imported-other-absent-failure` | 2..2 | false | false | rejected | accepted |
| `chameleon-other-failure` | 2..2 | false | false | rejected | accepted |
| `pinned-nested-optional` | 2..3 | false | true | rejected | accepted |
| `all-optional-root-failure` | 0..2 | false | false | rejected | accepted |
| `positive-unbounded-members` | 2..2 | false | true | accepted | accepted |
| `repeated-group-use` | 4..6 | false | true | rejected | accepted |

`H=900719925474099312345678901234567890`; `2H=1801439850948198624691357802469135780`.
The count-gap fixture admits counts 2 and 4 while rejecting count 3 despite its formal `2..4` range.
Its repeated sequence also retains order; no interval proves admission of `a,a,b,b`.

The eight fixed payload contrasts include the required empty choice, the dead sequence, zero content and recursive element values.
Both engines reject the isolated required empty choice payload, while XMLSchema accepts the dead sequence payload that the primary language rule and libxml2 reject.
XMLSchema cannot run the two zero-group payload checks because it rejects that schema; those two observations are explicitly `unavailable-schema`, not skipped passes.

## Bounded implementation and completeness

For either selected candidate, an iterative postorder traversal checks every retained member and uses supplied exact formal ranges.
Memoization keys are particle use identity, original base wildcard identity and member-view minimum; there are at most two minimum views per base pair.
The prototype fixes one original base per invocation and retains that identity implicitly; #179 must include it explicitly in any cross-call cache.

The prevalidated group/containment DAG is finite and acyclic, so each pair finishes after finitely many outgoing members.
Shared groups reuse established pair results; element/type recursion ends at a terminal.
Given sufficient resources this procedure exhaustively decides the stated relation for arbitrary legal sequence/choice/all operands, finite or unbounded counts, empty required groups and original namespace contexts.

Every frame push, memo insertion, member visit and exact arithmetic digit comparison is charged before allocation or operation.
The injected namespace adapter charges character scans, conservative membership work and shared-helper set copying before executing those operations.
The prototype consumes supplied views; bounded normalization/indexing/copying remains a separately charged #179 integration obligation, not hidden prototype work.

Inclusive defaults remain independently applied `100,000` input nodes and `1,000,000` work steps.
Exhaustion produces no relation answer and never proves invalidity, even when one candidate finished earlier.
S03/S04 loading/catalog limits, conservative cyclic depth, D09 owner boundaries, later matcher/payload/output budgets and #208 production qualification remain unchanged.

| Measurement | Result | Charged work | Observed elapsed |
|---|---|---|---|
| Exact huge fixture, 10 nodes / 726 allowed steps | B relation true | 726 | 0.041 ms |
| Same fixture, 725 allowed steps | resource-limit | 725 | 0.060 ms |
| Same fixture, 9 allowed nodes | resource-limit before traversal | 0 | 0.131 ms |
| Synthetic source array, 100,000 nodes | B relation true | 726 | 0.087 ms |
| Synthetic source array, 100,001 nodes | resource-limit before traversal | 0 | 0.096 ms |
| Synthetic padded callback at default work limit | B relation true | 1,000,000 | 1.700 ms |
| Supplied 500,000-digit operand beyond default work | resource-limit | 1,000,000 | 10.487 ms |

These are narrow development measurements, not production capacity claims.
The synthetic node and padded callback rows test the prototype's supplied-count/work contract; their input construction is outside the measured predicate.
The exact huge fixture is a useful nontrivial successful decision, unlike a probe that returns resource-limit for every difficult operand.

## Reproduction and handoff

Commands below run from a fresh delivery checkout after `npm install`; the joint handoff records the fresh `reference:setup` run and final complete gates.
The narrow tests are discovered by the existing Vitest pattern and established Python `*_test.py` reference discovery.
No ignored log is needed to know the fixed results.

```bash
npm run reference:setup
npx tsc -p test/research/s06-pw01/tsconfig.json --noEmit
npx vitest run test/research/s06-pw01/predicate.test.ts
npm run test:reference:full
npm run ci
npm run test:conformance
```

At the leaf checkpoint, scoped TypeScript passed and focused Vitest passed 40 tests in one file.
The focused reference discovery passed two tests with 76 schema-load observations and 16 recorded payload observations; two are explicit unavailable-schema results.
The shared freshly provisioned reference runtime was used by explicit path, without creating another installation route.

Observed tools: Node 24.19.0, npm 11.9.0, TypeScript 6.0.3, Vitest 5.0.3, Python 3.12.14, XMLSchema 4.2.0, lxml 6.1.0 and libxml2 2.14.6.
The exact final combined commands, versions, result counts and reviewer revision belong to the [joint execution record](content-model-s06-research-handoff.md).
IDE inspections were unavailable; terminal TypeScript, fixture/reference and repository documentation checks supply local verification.

The delivered research does not claim #179 production guard removal, approved interpretation selection, complete S06 acceptance, #180 matching, #181 enumeration, #184 payload enforcement, downstream activation, merged-main or hosted checks.
To resume #179, select and substantively review A or B, implement the bounded predicate in the existing assessment path, preserve original/normalized ranges, and requalify the affected selected-operation plans.
Keep #235 and the affected joint gate open until that interpretation and normal delivery acceptance are recorded.
