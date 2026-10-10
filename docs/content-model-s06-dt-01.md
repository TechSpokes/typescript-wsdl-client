# S06 DT01: Exact XSD 1.0 calendar decision

Selected exact calendar contract and independent evidence for schema operands and the later shared scalar owner.

See the [root README](../README.md), [S02 contracts](decisions/003-content-model-contracts.md), and [research epic #232](https://github.com/TechSpokes/typescript-wsdl-client/issues/232).

## Disposition and ownership

No adopted XSD 1.0 correction establishes a complete year-zero rollover contract.
The maintainer [selected candidate A's three explicit repairs on October 10, 2026](https://github.com/TechSpokes/typescript-wsdl-client/issues/236#issuecomment-6095933213): preserve lexical BCE leap dates while skipping zero, normalize second 60 as overflow, and order normalized recurring-time clocks consistently with aliases.
Independent semantic review and final delivery govern local acceptance; passing the probes alone does not activate product support.

The selected project contract is candidate A, including its skip-zero repair, second-60 normalization and recurring-time comparison.
Its lexical-year leap calculation preserves the recorded BCE domain, but its rollover repair is an interpretation added to the written Appendix E algorithm.
Candidate B changes which BCE leap dates are legal, while literal Appendix E does not remain closed over the XSD 1.0 value domain.

[#179](https://github.com/TechSpokes/typescript-wsdl-client/issues/179) owns schema integration. [#184](https://github.com/TechSpokes/typescript-wsdl-client/issues/184) owns the later shared payload implementation; #188/#189/#198 consume it. This research imports no production scalar/assessment helper and supplies no payload validator, conversion policy, calendar feature switch or public encoding change.

The accepted baseline is main `5876065b00d4eeb6d2324eaa63ff9b70e2279198`, tree `b647d9b0343d421426a539fc008c3cffa82c7875`. The inspected draft is `460f5b8379c68ffef79917284e445b5ab046429e`, tree `56830b28d1006b019918a364aa62f1ed9d7d8817`; it remains unaccepted and unchanged.

## Authority and the historical correction

### Dated primary source

The governing source is [XSD 1.0 Part 2, Recommendation 28 October 2004](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/). The [pinned complete XML source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/datatypes.xml) has SHA-256 `430f010df8ed077a4ed11d9d5812ea5e5d62ba67e715f1bbeeaa8ee1765d84c7`; editorial `diff="del"` text is excluded.

| Clause | Exact applicable text or rule | Consequence |
|---|---|---|
| [3.2.7, value space](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dateTime) | “All timezoned times are Coordinated Universal Time” | Zoned assessed values use UTC fields |
| [3.2.7, year-zero note](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#year-zero) | “There is no year 0” | `-0001` precedes `0001` in the described calendar |
| [3.2.7.1, lexical rule](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dateTime-lexical-representation) | “'0000' is prohibited” | Zero cannot become a legal lexical output |
| [3.2.7.1, hour rule](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dateTime-lexical-representation) | Hour 24 with zero minutes/seconds denotes the following day | Rollover is required at the boundary |
| [Appendix E](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#adding-durations-to-dateTimes) | `E[year] := S[year] + D[year] + carry` | The literal algorithm can compute zero |
| [Appendix E](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#adding-durations-to-dateTimes) | Leap test applies modulo 400/100/4 to `Y` | Unshifted negative years have the stated leap pattern |
| [3.2.7.4, order](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#dateTime-order) | Cross-timeline differences of 14 hours or less are incomparable | Endpoint comparisons must remain strict |
| [3.2.6.2, duration order](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#duration-order) | Strict order must agree at all four prescribed anchors | Equality and anchor ordering are separate |

Appendix E also directly increments the year during month/day rollover and supplies no branch to skip zero. Thus `0001-01-01 + (-P1Y)` yields year zero under the literal year assignment, and subtracting a day from `0001-01-01` enters December of year zero under its literal loop. The informative year note does not specify a normative replacement for those assignments.

### Errata and WG scope

The official [second-edition errata](https://www.w3.org/2004/03/xmlschema-errata), checked October 10, 2026, lists no Part 2 errata. Its Part 1 E1-56 default/PSVI fix supplies no calendar correction. First-edition errata were incorporated in the dated second edition; neither an old correction nor an editorial deletion overrides its final text.

[WG issue 3256](https://www.w3.org/Bugs/Public/show_bug.cgi?id=3256), reported May 9, 2006 and resolved February 8, 2008, concerns XSD 1.1 compatibility wording. Comment 2 says the 1.1 text needs a more candid note and that the WG did not agree to revert the interpretation to the 1.0 form. The adopted wording explains an XSD 1.1 change; it is not an adopted XSD 1.0 rollover correction.

### Correction of the BCE engine sentence

The draft assessment says pinned engines disagree with unshifted BCE leap arithmetic. That sentence is factually wrong. Historical XMLSchema 4.2.0 and libxml2 2.14.6 observations accept the `-0004-02-29Z` date/dateTime schema defaults and reject the `-0001-02-29Z` counterparts, consistent with the unshifted leap test.

The five copied fixtures retain their exact bytes and original [pinned manifest](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/test/conformance/schema-assessment-manifest.json) provenance. The current [TypeScript reference suite](../test/conformance/reference/dt01-calendar-contract.test.ts) verifies their digests and records current primary observations beside selected contracts and historical answers. The historical document and observations are not rewritten; #179 must replace the incorrect sentence when updating its future accepted assessment evidence.

Agreement on four BCE schemas is no proof about month addition, day rollover, timezone normalization, 24:00, cross-zero duration anchors or exact equality. Both historical engines also accepted `duration-cross-year-zero.xsd`; this is schema-loading evidence, not proof that either supplies the required faithful ordering.

## Concrete contract alternatives

| Option | Lexical years and leap calculation | Rollover | Consequence |
|---|---|---|---|
| A, selected contract | Reject zero; leap test on lexical signed `y` | Continuous year/month coordinate skips zero | Preserves BCE observations; adds an explicit Appendix E repair |
| B, astronomical repair | Reject zero; use `a=y+1` for negative `y` | Ordinary Gregorian arithmetic on `a` | Makes `-0001` leap and `-0004` common; changes valid BCE schemas |
| C, literal Appendix E | Reject lexical zero; use arithmetic `y` | Ordinary integer addition, including zero | Produces values with forbidden year zero; not a complete closed contract |
| D, XSD 1.1 | Permit zero and reinterpret negative years | XSD 1.1 Gregorian coordinate | Changes the approved profile and is not authorized |

Candidate C cannot be completed merely by hiding zero as an internal year. A full internal zero year adds 366 days between `-0001` and `0001`, contradicting their described adjacency; folding zero into a neighbor changes month/day order or leap validity. Removing its days is candidate A's explicit repair; shifting negative year meanings is candidate B's explicit repair.

The alternatives record A's selected repairs and B's different compatibility consequences.
Production impacted schemas retain the existing `unsupported-capability` qualification until #179 implements and validates the accepted research contract; this is a temporary gate, not a permanent BCE exclusion.
Unaffected lexical, positive-year and duration-equality work continues.

Candidate B is fully specified by replacing A's leap/ordinal coordinate with `a(y)=y` for positive lexical years and `a(y)=y+1` for negative years. Apply the ordinary Gregorian leap test and `G(a)` ordinal, including internal astronomical zero; inverse conversion emits `y=a` when `a>0` and `y=a-1` otherwise. Month addition uses `12*(a-1)+(m-1)`, then all of A's exact clipping, fractions, timezone-presence, ordering and anchor procedures remain the same, including their separately stated second-60 and recurring-time choices.

## Shared scalar interface

### Inputs and retained context

Schema operand assessment takes the original resolved type identity, complete derivation/facet layers, original lexical text, source location, owner/operation path and QName namespace environment. It applies that type's XSD whitespace rule using only XML space characters, then validates its lexical/value space and every applicable facet. It retains both original text and the admitted normalized lexical witness.

List assessment retains per-item validated typed values in order. Union assessment tries members in declaration order under their original contexts and retains the selected member, including member-specific whitespace/facets. A union tag cannot claim an alternative history absent from the encoded lexical value; neither list nor union permits flattening away a context needed for equality or restrictions.

DT01 supplies the calendar/duration meaning used by the scalar owner; existing scalar contracts supply decimal, integer, QName and other primitive predicates. Exact decimal/integer values and expanded QName names remain exact. Fixed/default equivalence never compares raw spellings, invents an order relation, or uses a JavaScript coercion.

### Outputs and independent predicates

```typescript
type OperandContext = Readonly<{
  typeId: string; lexical: string; source: string;
  namespaces: Readonly<Record<string, string>>;
}>;
type SameValueResult = "equal" | "distinct" | "unresolved" | "resource-limit";
type CalendarOrder = "less" | "equal" | "greater" | "indeterminate";
type CalendarFamily = "dateTime" | "date" | "time" | "gYearMonth"
  | "gYear" | "gMonthDay" | "gDay" | "gMonth";
type ExactDecimal = Readonly<{coefficient: bigint; scale: number}>;
type CalendarValue = Readonly<{
  family: CalendarFamily; timezoned: boolean;
  representative: ExactDecimal; original: OperandContext;
}>;
type SemanticBudget = Readonly<{charge(work: number): void; admitNodes(count: number): void}>;
declare function assessCalendarOperand(
  family: CalendarFamily, context: OperandContext, budget: SemanticBudget
): CalendarValue;
declare function sameValue(
  a: OperandContext, b: OperandContext, budget: SemanticBudget
): SameValueResult;
declare function compareCalendarValue(
  a: CalendarValue, b: CalendarValue, budget: SemanticBudget
): CalendarOrder;
```

`sameValue` first assesses each operand against its own original type and context. Invalid schema operands retain their `invalid-schema` failure rather than becoming `distinct`. For compatible typed primitive values it uses that primitive's exact equality; lists compare corresponding item values and length, and unions preserve the selected member context before applying its value predicate.

The calendar output retains family, timezone presence, exact internal reference coordinate and original operand context. A reduced family's reference date supplies comparison fields only; it does not expose an invented date in the public scalar encoding. The research display makes its `zoned/local` timeline explicit and never uses its internal coordinate string as a replacement for the original lexical witness.

Calendar equality requires the same primitive calendar family and the same timezone-presence timeline, followed by exact normalized value equality. A date interval does not equal a dateTime instant merely because their starting instants coincide. Different timelines are distinct values even when their clock fields match; their ordering can remain indeterminate.

Duration equality compares exact signed total months and exact signed decimal seconds. `P1Y=P12M`, `P1D=PT24H`, `PT60.00S=PT1M`, and negative zero equals zero. `P1M` and `P30D` are distinct regardless of any particular anchor.

`compare` is a separate operation with `less/equal/greater/indeterminate`. An indeterminate comparison is a legitimate partial-order result, not failed parsing, resource exhaustion or equality. A facet whose primary rule requires a determinate inequality can reject a value after that result; an unresolved semantic qualification cannot be substituted for that rejection.

### Classification and normalization laws

`invalid-schema` means an independently established schema operand or facet constraint violation. `unsupported-capability` retains an open interpretation or an already excluded reachable scalar rule. `resource-limit` means the charge cannot be paid before work/allocation and returns no successful partial assessment table. Payload invalidity remains #184's later `invalid-value` responsibility.

Diagnostics retain operation, graph/type ID, expanded name, schema source and instance path where available, without copying operand values into messages. Semantic normalization returns fresh values, preserves timezone presence and never mutates caller data. Internal UTC coordinates do not authorize public UTC conversion or replacing the original pattern-admitted lexical witness; the [S02 normalization laws](decisions/003-content-model-contracts.md#equivalence-and-normalization-s02-d03) remain controlling.

For AU01/RE01, calendar equality uses selected A once its independent contract review passes; before that gate it returns `unresolved`.
Exact duration equality uses no reference calendar and can proceed independently.
Numeric/QName/string/list/union claims must invoke the established original-type predicates, not claim the entire scalar domain proved by this narrow calendar prototype.

## Selected candidate A arithmetic

### Lexical and value coordinates

A year is an exact signed integer `y`, written as at least four digits with optional minus, no plus, no zero and no extended leading zeros. Month/day fields are two digits and validated against the lexical-year leap test. All fractions are exact finite decimal rationals, represented by integer coefficient and decimal scale.

Define `floor(a/b)` mathematically, including negative operands; modulo is `a-floor(a/b)*b`. Define `leap(y)` as divisibility by 4 and either nondivisibility by 100 or divisibility by 400. The modulo test uses lexical `y`, not the contiguous month/year coordinate.

For month/year addition define `k(y)=y-1` for positive years and `k(y)=y` for negative years. Its inverse is `y(k)=k+1` when `k>=0`, otherwise `y(k)=k`. This maps adjacent years `-0001,0001` to adjacent coordinates `-1,0` while preserving lexical-year leap arithmetic.

Define the exact day ordinal with `0001-01-01` at zero:

```text
G(y) = 365*(y-1) + floor((y-1)/4) - floor((y-1)/100) + floor((y-1)/400)
O(y,m,d) = G(y) + (366 if y<0 else 0) + daysBeforeMonth(y,m) + d - 1
```

The added 366 removes the astronomical year-zero interval from negative-year coordinates. `O(-1,12,31)=-1` and `O(1,1,1)=0`; the lexical-year leap test remains unchanged. `O` is strictly increasing over all valid dates in this candidate and has one valid inverse date for each integer ordinal.

For inverse conversion, replace negative ordinals `o` with `o-366`, then decompose the Gregorian count into 400-year cycles of 146,097 days, at most three 100-year blocks, 4-year blocks and at most three individual years. Resolve at most twelve month lengths afterward. This is exact and does not enumerate huge years, months or duration days.

### Addition and timezone conversion

Month/year addition computes `i=12*k(y)+(m-1)+totalMonths`, then `k'=floor(i/12)` and `m'=modulo(i,12)+1`. Recover `y'` through the inverse coordinate and clip the original day to the target month's maximum. Add exact seconds to the clipped day's ordinal/time, then invert the resulting ordinal and clock remainder.

This keeps Appendix E's operation order: months/years, day clipping, then days/hours/minutes/seconds. Addition is neither associative nor commutative in general; for example January 31 plus one month then one day differs from some reversed or regrouped additions. The repair changes only the year coordinate assignments and their cross-zero consequences, not the clipping rule.

Timezone lexical offsets are exact integral minutes from -14:00 through +14:00, with minute zero required at magnitude 14. `Z`, `+00:00` and `-00:00` denote the same explicit UTC zone; an omitted zone remains omitted. Convert zoned dateTime clock fields to UTC by subtracting the offset exactly, including day/month/year rollover; normalize legal 24:00 before returning the assessed value.

`addDuration` in the narrow probe accepts assessed dateTime values, whose zoned fields are UTC under 3.2.7. Thus `2001-03-01T00:00:00+14:00` and `2001-02-28T10:00:00Z` receive the same one-month value addition, `2001-03-28T10:00:00Z`. Raw local field-tuple addition preserving +14:00 would give March 31 at 10:00 UTC; that is a different operation and is not this semantic API.

Raw field-tuple timezone normalization remains a use of Appendix E's field arithmetic, before the literal becomes its UTC value. The retained lexical offset supplies provenance and an admitted wire witness; it does not cause subsequent value-level addition to depend on spelling.

### Selected second 60 interpretation

[Appendix D.1](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#isoformats) admits whole seconds 0 through 60 with arbitrary fractions and discusses rolling an inappropriate leap-second operand into the following minute. Appendix E explicitly treats second 60 as overflow and thereafter uses sixty seconds per minute. Both historically pinned engines reject `23:59:60Z`; their rejection does not erase this XSD 1.0 text.

Candidate A accepts `0<=second<61` and uses that stable overflow interpretation, including for explicit UTC operands. The probe consequently maps `2001-12-31T23:59:60.25Z` to `2002-01-01T00:00:00.25Z`. It imports no contemporary leap-second table or host clock behavior.

This selected alias is an explicit project interpretation: 3.2.7's canonical paragraph says literals are one-to-one except fractional zeros, 24:00 and timezone, without a second-60 exception, while its order algorithm applies timezone conversion only to non-Z operands. The selected contract does not claim that the alias follows unambiguously from those clauses. #179's draft `second>=60` invalidity check must be reconciled with the selected interpretation; #184 consumes this resolved contract rather than an engine's rejection.

### Related calendar families

All approved families retain a distinct primitive family tag and timezone-presence flag. For schema comparisons the candidate uses these explicit starting fields; absent fields do not become observable public properties. The chosen reference year 2000 is a leap year, and January has 31 days.

| Family | Exact comparison representative | Additional lexical rule |
|---|---|---|
| `dateTime` | Its assessed instant | Complete date and clock |
| `date` | Start of its top-open one-day interval | No clock fields |
| `time` | Normalize clock modulo 86,400; use reference date 2000-01-01 | Legal 24:00 becomes midnight |
| `gYearMonth` | Given year/month, day 1 at midnight | No day or clock fields |
| `gYear` | Given year, January 1 at midnight | No month/day or clock fields |
| `gMonthDay` | Given month/day in leap year 2000 at midnight | February 29 is legal |
| `gDay` | Given day in January 2000 at midnight | Day 1 through 31 |
| `gMonth` | Given month in year 2000, day 1 at midnight | Second-edition `--MM`, without trailing `--` |

Date equality compares interval starts on the same timeline. It does not truncate the UTC start to midnight: `0001-01-01+14:00` and `-0001-12-31-10:00` denote the same interval under A. For a canonical date spelling, derive the date portion from the interval's UTC midpoint and retain the recoverable offset in -11:59 through +12:00 as 3.2.9 specifies.

The reduced Gregorian families use their type-specific reference fields and retain the exact timezone shift of their starting instant during comparison. Periodic-family ordering is the stated arbitrary reference-period ordering, not a circular order or an inferred BCE host-calendar recurrence. The research-only TS prototype now implements exact representatives, equality and ordering for all eight calendar families plus duration; #184's payload enforcement remains a later implementation.

The `time` modulo step is a third explicit candidate interpretation. [3.2.8](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#time) prescribes dateTime ordering with an arbitrary date while its canonical representation removes the date and uses UTC. Comparing `01:00:00+14:00` with `02:00:00Z` after normalization on a common arbitrary date gives previous-day 11:00 versus same-day 02:00, hence less; comparing their normalized modulo-day clocks gives 11:00 versus 02:00, hence greater.

A selects modulo-day value representatives consistently for equality and ordering, preserving canonical-alias substitutability. Zoned clocks are reduced modulo 86,400 seconds and rebased on 2000-01-01; unknown-zone clocks remain their unshifted clocks on that reference date. Legal 24:00 and selected second-60 overflow normalize to their midnight aliases on the same timeline.

The rejected date-lift alternative retains the shifted reference day and follows the literal arbitrary-date order, but cannot preserve `01:00:00+14:00 = 11:00:00Z` while assigning them different comparison days. The maintainer's recorded recurring-time choice resolves this project contract; it is not a new fourth circular-offset decision and it activates no production order here.

Same-family, same-timeline order compares exact representatives. For a known-zone representative `z` and unknown-zone representative `u`, known is less only when `z<u-50400`, greater only when `z>u+50400`, and otherwise indeterminate; reverse the direction when the unknown operand is first. At exactly either endpoint the result remains indeterminate.

The resulting time order is linear on the selected common reference date rather than circular. Thus `00:00:00Z < 23:00:00` and `23:00:00Z > 00:00:00`, while `23:00:00-14:00` becomes 13:00Z and is incomparable with unknown 23:00 because their representative difference is ten hours. These wrap consequences are intentional results of the selected model, not unresolved timezone inference.

### Duration equality and ordering

Parse duration fields into `months=sign*(12*years+months)` and `seconds=sign*(86400*days+3600*hours+60*minutes+seconds)`. Lexical fields are unsigned and only the leading sign applies; `P1M-1D` is invalid. Months and seconds may both be nonzero, but lexical duration syntax does not permit independently opposing component signs.

Equality is the exact ordered pair `(months,seconds)`. Ordering first checks that equality, then adds each operand independently to `1696-09-01`, `1697-02-01`, `1903-03-01` and `1903-07-01`, all at midnight Z, using the candidate's exact addition. Return strict less or strict greater only if every anchor gives that same strict result; otherwise return indeterminate.

An equality at one anchor mixed with strict comparisons at others is indeterminate. Even equality at every anchor does not prove exact pair equality: `P400Y` and `P146097D` produce identical positive-anchor additions but remain distinct duration values in this contract. Anchor additions that cross zero use the selected A coordinates and retain the production integration guard until #179 implements this contract.

## Independent truth tables

### Leap and rollover alternatives

| Operand | A, lexical leap and skip zero | B, astronomical BCE shift | C, literal arithmetic |
|---|---|---|---|
| `-0400-02-29` | Valid | Invalid | Valid |
| `-0100-02-29` | Invalid | Invalid | Invalid |
| `-0004-02-29` | Valid | Invalid | Valid |
| `-0001-02-29` | Invalid | Valid | Invalid |
| `0001-02-29` | Invalid | Invalid | Invalid |
| `0001-01-01 + (-P1D)` | `-0001-12-31` | `-0001-12-31` | Forbidden year `0000-12-31` |
| `-0001-12-31 + P1D` | `0001-01-01` | `0001-01-01` | Forbidden year `0000-01-01` |
| `0001-01-01 + (-P1Y)` | `-0001-01-01` | `-0001-01-01` | Forbidden year `0000-01-01` |
| `-0004-01-31 + P1M` | `-0004-02-29` | `-0004-02-28` | `-0004-02-29` |

### Candidate A comparisons and exact normalizations

| Inputs | Independent expected result | Status |
|---|---|---|
| `-0001-12-31T24:00:00Z` | `0001-01-01T00:00:00Z` | Candidate rollover |
| `0001-01-01T00:00:00+14:00` | `-0001-12-31T10:00:00Z` | Candidate cross-zero timezone |
| `-0001-12-31T23:59:59.999…-00:01` | `0001-01-01T00:00:59.999…Z` | Exact fraction and rollover |
| `0001-01-01T00:00:00` versus same clock Z | Distinct values; indeterminate order | Timezone presence retained |
| Known 14:00Z versus unknown midnight | Indeterminate | Inclusive uncertainty endpoint |
| Known 14:00Z plus 10^-30 seconds versus unknown midnight | Greater | Exact strict inequality |
| `P1Y` versus `P12M` | Equal | No calendar needed |
| `P1M` versus `P30D` | Distinct; indeterminate order | Four-anchor mixed outcomes |
| `P1Y` versus `P364D` / `P367D` | Greater / less | Useful determinate ordering |
| `-P1M` versus `-P27D` | Less | Negative duration ordering |
| `P1M1D` versus `P30D` | Distinct; indeterminate order | Mixed month/second components |
| `-P1700Y` versus `-P1600Y` | Less under A | Anchor additions cross zero |
| `P400Y` versus `P146097D` | Distinct; indeterminate order | Anchor agreement is not equality |

[Literal proposal cases](../test/research/dt01/dt01-cases.json) were authored independently of the prototype. They include invalid positive/negative zero, extended leading zero, plus year, XML-only whitespace, fractional boundary comparisons and illegal independently signed duration fields. Assertions read those literal expectations; neither production analysis nor prototype output manufactures them.

### Reduced-family exact value coverage

[Reduced-family expectations](../test/research/dt01/dt01-reduced-cases.json) are separately hand-authored under the recorded selection, including the independently checked leap-day and day-offset alias contrasts. Their [research tests](../test/research/dt01/reduced-calendar.test.ts) verify normalized internal representatives, retained lexical witnesses, exact equality, order reversal, alias substitution and refusal before work/copy budget exhaustion.

| Family/contrast | Independent selected result |
|---|---|
| `gYear 0001+14:00` | Zoned start `-0001-12-31T10:00:00` |
| `gYearMonth 0001-01+14:00` | Same coordinate, distinct family from `gYear` |
| `gYearMonth -0004-03+01:00` | Zoned start `-0004-02-29T23:00:00` |
| `gYearMonth -0001-03+01:00` | Zoned start `-0001-02-28T23:00:00` |
| `gMonthDay --02-29+14:00` versus `--02-28-10:00` | Equal at leap-year reference start |
| `gDay ---31+14:00` versus `---30-10:00` | Equal at January reference start |
| `gMonth --03+14:00` | Zoned start `2000-02-29T10:00:00` |
| `gMonthDay --01-01+14:00` versus `--12-31-10:00` | Less; shifted reference year remains significant |
| `time 01:00:00+14:00` versus `11:00:00Z` | Equal; both greater than `02:00:00Z` |
| `time 14:00:00Z` versus unknown midnight | Distinct values; indeterminate endpoint order |
| Known 14:00Z plus 10^-30 seconds versus unknown midnight | Greater by exact strict endpoint test |
| Known midnight versus unknown 14:00 plus 10^-30 seconds | Less by exact strict endpoint test |

The reduced fixture table contains 23 normalization cases, 29 equality/order pairs, four alias-substitution contrasts and ten invalid lexical operands. Its huge positive `gYear` and huge negative leap `gYearMonth` operands preserve years beyond Number precision exactly. Each pair also checks reverse ordering, and dedicated cases verify cross-family identity and the exact reduced-normalization work boundary.

These are executable evidence for every selected reduced-family rule, without claiming a separate payload implementation.

### Engine observations versus interpretation

| Fixture/payload comparison | Candidate A acceptance | XMLSchema 4.2.0 | libxml2 2.14.6 |
|---|---|---|---|
| BCE `-0004-02-29` schema defaults | Accept | Accept | Accept |
| BCE `-0001-02-29` schema defaults | Reject | Reject | Reject |
| Fixed `0001-01-01T00:00:00Z`, payload `-0001-12-31T24:00:00Z` | Accept | Reject | Reject |
| Fixed `-0001-12-31T10:00:00Z`, payload `0001-01-01T00:00:00+14:00` | Accept | Reject | Reject |
| Fixed BCE date interval, equivalent +14:00 CE interval | Accept | Reject | Reject |
| Fixed `P1Y`, payload `P12M` | Accept | Accept | Reject |
| Fixed `P1D`, payload `PT24H` | Accept | Accept | Reject |
| Fixed `P1M`, payload `P30D` | Reject | Reject | Reject |
| Fixed time midnight, payload `24:00:00Z` | Accept | Accept | Reject |
| Lexical time `23:59:60Z` | Admit under candidate second-60 rule | Reject | Reject |

The table preserves the original XMLSchema 4.2.0 and libxml2 2.14.6 observations.
The [calendar scalar fixture](../test/conformance/fixtures/xsd/research-dt01/calendar-scalars.xsd) tests instance lexical observations separately from [fixed-value equality observations](../test/conformance/fixtures/xsd/research-dt01/calendar-equivalence.xsd).
Validator disagreement or agreement is never relabeled schema invalidity or production assessment support; these contrasts explain compatibility consequences without making engine voting the decision authority.

### Current reference evidence

The accepted [NT-CONT-01 evidence policy](reference-validation.md) uses `libxml2-wasm@0.7.2` with libxml2 2.15.1 as the current primary and the existing exact-calendar prototype for scoped selected-contract assertions.
The TypeScript reference suite attempts all five copied schemas, validates all 28 lexical payloads and all seven fixed-value payloads, and verifies its literal tables against the hash-pinned [historical source snapshot](../test/conformance/reference/legacy-source-snapshot.json).
The current primary, selected candidate A, historical external answers and unqualified capabilities remain separately named.

The selected second-60 overflow assertion accepts the original time operand while the primary rejects it; selected fixed-value equality likewise remains distinct from the primary's seven rejections.
These finite checks preserve the accepted exact calendar domain without claiming general XSD datatype validity, full PSVI or a fresh second-engine construction/equality result.

## Bounded research procedure and measurements

The [exact TS probe](../test/research/dt01/exact-calendar.ts) implements selected A's schema comparison rules for all eight calendar families and duration. It uses BigInt year/month/day counts and exact decimal coefficient/scale arithmetic, with no JavaScript Date, floating approximation, production imports or pinned-draft runtime dependency. The procedure terminates for every valid finite operand given sufficient resources: fixed lexical scans, constant calendar cycle decomposition, at most twelve month steps and exactly four duration comparison anchors.

The independent S06 defaults remain 100,000 input graph nodes and 1,000,000 work steps, inclusive. The prototype's graph admission method is a synthetic budget boundary test; it does not reimplement graph indexing, replace S03/S04 limits or claim the matcher/payload/output stages are implemented. Existing conservative cyclic-depth handling remains with its owning stage.

Charge lexical scans/copies before regex matching, whitespace normalization, capture allocation and BigInt conversion. Charge conservative `(digits+2)^2` arithmetic work before exact products, powers, scaling and ordinal operations; charge month/cycle bookkeeping and fractional trimming separately. Stored digit bounds come from the validated lexical input and conservative carry/scale bounds; low-level ordinal helpers take trusted internal bounds and are not an untrusted operand API.

The precharged arithmetic envelope covers the small fixed month-length array and repeated modulo operations used by a calendar conversion. Copy/output estimates include signs, carries and fractional scale. Failure occurs before the refused charge, does not exceed either configured counter, and throws without returning a scalar/equality result; exhaustion is not a proof of inequality or invalidity.

Reduced-family parsing additionally charges seven fixed regex/lookup objects before creation, the reference-tuple copy before allocation, three fields for a copied modulo-clock decimal record, and ten fixed fields for each returned representative record. Representative display charges its string copy and three-field result container before allocation. These request-specific charges leave the original date/dateTime/duration measurements unchanged.

The probe does not import #184's later 4,096-digit scalar limit. A 5,000-digit schema year completes when enough work is supplied and returns resource-limit at the normal budget before BigInt conversion. A finite budget can prevent a decision but cannot redefine the approved scalar domain.

Measurements from [the committed measurement entry point](../test/research/dt01/measure.ts), Node 24.19.0, October 10, 2026:

| Case | Configured work | Charged work | Outcome | Time ms |
|---|---|---|---|---|
| `P1Y=P12M`, exact boundary | 1,451 | 1,451 | Complete equality | 0.141 |
| Same computation, one step less | 1,450 | 1,226 | Resource-limit before next charge | 0.118 |
| 100,000 graph nodes | 1,000,000 | 100,000 | Admitted | 0.027 |
| 100,001 graph nodes | 1,000,000 | 0 | Resource-limit before indexing | 0.010 |
| 200-digit positive year and 100 fraction digits | 10,000,000 | 1,339,331 | Exact round trip | 0.589 |
| 200-digit negative year and 100 fraction digits | 10,000,000 | 1,345,158 | Exact round trip | 0.135 |
| 5,000-digit year | 1,000,000 | 20,036 | Resource-limit before conversion | 0.159 |
| 5,000-digit year | 2,000,000,000 | 125,821,674 | Exact assessment | 0.166 |
| Reduced wrapped time, exact boundary | 15,487 | 15,487 | Exact representative returned | 0.088 |
| Same reduced computation, one step less | 15,486 | 15,486 | Resource-limit before final output | 0.066 |
| Reduced `gYear` offset crossing BCE | 1,000,000 | 11,641 | Exact representative returned | 0.100 |
| Reduced time strict endpoint plus 10^-30 seconds | 1,000,000 | 103,931 | Greater | 0.141 |

Times are observations and will vary; counters/outcomes are deterministic. The large year plus fraction round trips use an explicit increased work budget, not an assertion that they fit the default. Separate tests pay the full default 1,000,000 steps and reject the next step, and independently admit/reject the node boundary.

## Reproduction and handoff

Use Node 24 as the supported floor and Node 26 for current-line qualification from a fresh delivery checkout.
The current [reference setup and evidence contract](reference-validation.md) uses normal `npm ci` and strict TypeScript discovery.
Five historical source fixtures remain byte-identical to the pinned draft's `test/conformance/fixtures/xsd/assessment/`; the reference suite verifies each exact SHA-256 and the original commit.

```bash
npm ci
npm run typecheck:research
npm run typecheck:reference
npx vitest run test/conformance/reference/dt01-calendar-contract.test.ts test/research/dt01
npx tsx test/research/dt01/measure.ts
npm run test:reference:full
```

The same commands apply on Linux and Windows. Normal installation supplies the pinned Node primary; the four-lane qualification record owns actual execution evidence for each OS/Node combination.

Both `test:reference` and `test:reference:full` now discover the current TypeScript reference suite and retain all three original method families.
The historical leaf checkpoint passed 139 Vitest tests in two files, scoped TypeScript 6.0.3 and three retired reference methods with 5 schema/10 engine checks, 28 lexical/56 engine checks and 7 equality/14 engine checks.
Its archived environment used XMLSchema 4.2.0, lxml 6.1.0/libxml2 2.14.6 and elementpath 5.0.4; the 68 reduced-family tests supplement the original 71 exact calendar/duration tests.

IDE inspection tools were unavailable; repository TypeScript, fixture parsing and documentation checks supply the portable verification. The epic integration record owns final `npm run ci`, `npm run test:reference:full`, `npm run test:conformance`, documentation/support-matrix checks, installed-consumer coverage and the final reviewed delivery revision. These leaf results do not substitute for that combined final content gate.

Inspecting the pinned `schemaDatatypeValues.ts` identified two DT01 guards: every negative year returns `S06-DT-01`, and duration ordering returns it when anchor month addition reaches year<=0 or second addition reaches a negative timeline count. After accepted local review, #179 can replace both with the selected exact repaired operations; it must also correct its ordinary astronomical ordinal formula, distinguish value addition from lexical tuples, and apply selected second-60 and reduced-family rules. No guard is removed here.

The pinned `scalarSchemaAssessment.ts` retains facet layers and typed contexts, `attributeSchemaAssessment.ts` uses scalar equivalence for use/declaration fixed values, and `ElementValuePlan`/`ScalarSupportPlan` assign runtime scalar enforcement to #184. Their future integration must preserve that single owner, invalid/unsupported/resource distinctions, QName contexts, default/fixed augmentation and lexical witnesses.

Shared ADR/enforcement-matrix, evidence manifest, registry/traceability, indexes and changelog edits remain serialized under the epic coordinator. The required correction is a new current evidence statement; it does not change the historical pinned manifest, production support claims, catalog format 2, `xsd10-faithful-v1`, legacy routing, D07/platform/S01/S05 qualifications or later production gates.

The recorded maintainer selection settles the three project interpretation choices while preserving the primary conflicts and alternatives as evidence. Independent review must verify the complete selected local contract, all-family examples, original-context handoff and bounded accounting rather than merely rerun the prototype. #236's research gate requires that complete review, final delivery checks and merged artifacts; the separate #232 joint handoff and #179/#153 production integration gates remain with their owners.

No additional maintainer calendar choice remains pending in this delivery. No production support claim, payload implementation, profile narrowing or persisted-contract change is made by the research probe.
