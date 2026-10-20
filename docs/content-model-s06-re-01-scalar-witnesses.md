# S06 RE01: Scalar Witness Construction

Bounded scalar endpoint selection and the remaining full-construction obligations. See the root [README](../README.md).

## Status and ownership

The same sole nonauthor independently accepted this supplied fixed-anchor endpoint-tuple decision and witness theorem within the [RE01 continuation](content-model-s06-re-01.md).
It is not an implemented endpoint solver or a complete scalar/RE01 witness producer.
The existing [scalar owners and selected P1/F2 rules](content-model-s06-re-01-resolver-implementation.md#selected-scalar-comparison-policies) retain their contracts.
General helper coverage, native/evidence adequacy, complete negatives, mathematical termination and dated correspondence remain open.

The [enumeration-introduction correction](content-model-s06-re-01.md#enumeration-retention-and-new-introduction) separates equal value-set coverage from genuine component retention.
An enum producer must either establish same component/equal complete annotation or prove every newly introduced value belongs to its immediate base.
Unknown annotation equality cannot silently supply retention, and a failed new-introduction attempt cannot reject a still-possible retained component.
This owner correction does not establish the general enum lexical-map producer or a complete scalar materializer.

## Why a new endpoint operation is required

Literal complete-payload copying is not always a legal restriction under selected F2.
For an exact DECIMAL base with fixed minimum one, nonfixed minimum zero and enumeration one, a proper successor retaining only fixed minimum one and enumeration one forms, but the complete copied set violates the universal fixed duty.
Empty result patterns do not waive that duty.

Choosing only existing input facet components is also incomplete.
Take c with maximum-inclusive two, then a retaining that component and adding maximum-exclusive one.
A proper successor can retain exclusive one and replace inclusive two by inclusive zero, whose endpoint genuinely belongs to a.
Every subset of a that represents both inherited upper kinds retains inclusive two and fails its cross-base comparison to exclusive one.
A new admitted endpoint is required in this displayed case; it does not prove the absence of a finite endpoint producer.

Source binding is a separate representation.
For b with maximum-exclusive one and source a adding maximum-inclusive zero, the nonexact original-bound route normalizes its effective property view to inclusive zero.
The public facet comparison distinguishes that view from a's two-kind source property view even while both enforcement layers remain.
Native clearance of that normal form does not prove preservation of the same complete effective tuple set.
The earlier unconditional alias-completion premise is withdrawn; the original-bound full-tuple and finite flat-sector proposals remain held pending their precise semantic proof.
The [independently reproduced baseline](https://github.com/TechSpokes/typescript-wsdl-client/issues/234#issuecomment-6302941731) records complete forests and exact limitations.

## Supplied shared endpoint tuple theorem

The input supplies a finite number k of endpoint roles, at most four in the intended F2 application, one or finitely many exact fixed formed atomic descriptions a, and finitely many authentic constant operands.
The unbounded primitive families covered directly are decimal, duration and the eight selected DT A calendar families dateTime/date/time/gYear/gYearMonth/gMonthDay/gDay/gMonth.
Float/double have a separate finite-value case below.
Every effective pattern, facet, whitespace mode, base recipe and typed input constant is finite qualified input data, interpreted by the current scalar owners.
This does not synthesize an input scalar description or decide whether its source authority exists.

Each endpoint x_i must either belong to Image(a_i), meaning it has a genuinely admitted lexical representative in that exact a_i, or equal one of a specified finite list of inherited exclusive-endpoint constants.
The finite branch tag distinguishing those alternatives is retained for later facet formation.
The input constraint is any finite Boolean combination of actual sameValue/fixed-property equality and values.compare outcomes less/equal/greater/undefined, between the x_i and between them and fixed input constants.
Actual primitive-family, calendar timeline and native comparison conventions are retained; undefined is not silently replaced by inequality.

There is an effective TOTAL decision procedure for this supplied finite tuple problem.
On success it constructs one coherent tuple of exact values, a genuine lexical witness in a_i for each Image branch, and finite encodings of the exceptional constant branches.
It gives a computable encoded bound from the WHOLE supplied input, including patterns, constants, families, k and the formula.
No fresh bound is inferred from concrete pair-comparison APIs alone.
No F2 component-set constructor, type-count bound, current-H forest lift or source/materializer adequacy is concluded by the tuple decision.

### Unary membership is compiled, not asked of a new oracle

For every Image branch introduce one lexical-word recipe whose primitive assessment yields x_i.
Use the exact qualified input pattern-language conjunction, actual whitespace preimage and primitive lexical grammar.
For EACH layer/conjunct apply exactly the normalization and normalized operand string observed by that owner before pulling its pattern mask back to the common raw word.
Do not replace several owner-specific masks by one parser-trim condition or silently test a pattern on the final canonical value string.
Each input scalar value facet is also compiled: bound facets use the same order outcomes as the formula below, an enum is a finite disjunction of actual equalities, and applicable decimal precision facets have regular digit predicates.
Retained conjunct descriptions and inherited pattern layers are all included.
Formed input annotation, final, source and facet-property qualifications stay input facts; they are not inferred from this word test.

For calendar/duration, applicable value facets are patterns, enum and bounds, with their actual whitespace behavior; no unbounded value-length or precision predicate is invented.
For decimal, the existing exact fixed-bound and fixed-precision spelling languages give the corresponding regular unary tests.
Alternatively these regular predicates can be derived by a finite scan of sign/zero/significant-digit/trailing-zero classes and fixed input counters.
No IEEE lexical fiber is asserted regular by this step.

The field decomposition below can include regular outer-whitespace blocks whenever the actual selected normalization/parser permits them.
It never removes a raw whitespace distinction merely because a calendar parser internally trims a token.
The proper semantic numeric whitespace mode is collapse, but the construction uses the supplied qualified owner's actual language rather than a new whitespace policy.

The existing internal admissionLanguage/calendar/duration bound and temporal-alias owners can supply the same unary regular mask for these families.
The construction does not require their public API to expose an Image(a) oracle: their finite equations, or the direct word-and-value construction here, are sufficient.

### Finite field cases preserve whole-word pattern coupling

The actual decimal/calendar/duration lexical grammars have finitely many delimiter/presence/sign/fixed-field cases.
Calendar month/day/hour/minute/timezone and integral-second cases are finite; unbounded fields are the signed year magnitude and an optional finite fractional-second digit string.
Duration has one global sign and optional Y/M/D/H/M/S fields, with unbounded nonnegative integer digits and an optional seconds fraction.
Year-zero exclusion, extended-year leading-zero rules, valid dates, hour24/second60 overflow and legal timezone offsets use the exact source cases.
Reduced families use their actual fixed reference date and time normalization.

For one case write its lexical word as c0 u1 c1 ... ut ct, where the c_j are fixed separators/finite fields and the u_j are variable digit or whitespace blocks.
Take a complete DFA for ALL whole-word regular masks of that endpoint.
Guess its finitely many states before and after each u_j; check each fixed c_j by its literal transition.
Then u_j ranges over the regular path language between those states, intersected with its exact block grammar.
The union of these finite cases is EXACT in both directions.
This is a factorization of one whole-word DFA, not independent image-nonemptiness reasoning.

Thus each case has finitely many independent regular digit tracks and fixed sign/shape flags, while retaining every cross-field correlation encoded by the input regex through the chosen boundary states.
Zero-valued omitted fields are literal zero constants, not compulsory new lexical fields.
Leading and trailing zeros in actual fields are retained whenever the input masks require them.

### Exact value coordinates are piecewise affine

For decimal the coordinate is sign*(integer part + finite fractional part).
All values are terminating base10 rationals, without floating approximation.

For a calendar lexical field year y, write y-1=400q+r with 0<=r<400.
The actual ordinal source equation is

`ordinal(y,m,d)=146097q +365r+floor(r/4)-floor(r/100)+(y<0?366:0)+before(y,m)+d-1`.

The input year is nonzero, sign is a finite case and month/day are finite.
Leap status is determined by y mod400, so before(y,m) is constant in that case.
The exact timeline coordinate is then 86400*ordinal plus bounded clock/timezone constants plus the finite decimal fraction.
For reduced families insert the source's fixed reference fields.
For time, its final modulo-day normalization is split into finitely many bounded day-carry cases, imposed by linear inequalities.
The local/zoned flag is kept as a genuine finite value coordinate.

For duration the actual value is the PAIR (M,S), with one lexical sign:

`M=sign*(12*Y+month)` and `S=sign*(86400*D+3600*H+60*minute+secondsInteger+fraction)`.

Write M=4800q+r with 0<=r<4800.
For each of the four FIXED comparison anchors, its shifted continuous year is 400q+t_r for a computable integer t_r, and its target month is fixed by r.
Split further by the sign of that continuous year, because Option A converts it to year C>=0?C+1:C and omits year zero.
Month-length clipping of the fixed anchor day is then a finite residue/sign case.
The source ordinal equation therefore gives an anchor instant

`A_j(M,S)=12622780800q + S + c_(j,r,sign)`.

Here12622780800=146097*86400; all c values are computed exactly by the pinned calendar source law.
If needed the finite branch also records the target-year sign boundary explicitly by linear inequalities in q.
No literal infinity, approximate month length or assumption of a universal raw calendar identity is used.

Every parsing/coordinate condition is consequently a finite Boolean combination of linear equations, strict/non-strict inequalities and congruence cases on integers and finite decimals.
The quotient variables q are ordinary existential integer tracks, with their defining linear equations and finite residue cases.

### Actual equality and partial orders

For same-family decimal, equality and order use the exact decimal coordinate.
Different primitive families follow the actual values.compare/sameValue guards and can be evaluated as finite false/undefined cases rather than coerced.

For calendar values, sameValue requires the same family AND local/zoned flag AND timeline coordinate.
On equal flags values.compare compares the coordinate.
On different flags it compares the certain coordinate to the uncertain coordinate minus/plus50400seconds, with STRICT exterior inequalities.
The remaining interval, including endpoints, yields undefined; equal coordinates across different flags never become value equality.

For duration, sameValue and compare-equal mean BOTH M and S are equal.
Otherwise compare-less means all four A_j values are STRICTLY less, and compare-greater means all are strictly greater.
Every other case is undefined, including any equal sampled instant or opposed signs between samples.
In particular equality of the four sampled instants does not establish duration equality: P400Y and P146097D retain different(M,S).
These are finite Boolean linear formulas after the residue/sign split.

An inherited exclusive endpoint can remain outside Image(a) only through its explicitly selected allowed branch.
It is never manufactured by an unproved ordinary-membership shortcut.

### One common decimal-point track encoding

For a finite case encode ALL unsigned integer and fractional fields, quotient magnitudes, fixed constants and linear auxiliary values as one finite word of digit columns with one common decimal-point marker.
Signs are finite external flags, so negative quantities are signed linear combinations of unsigned tracks.
Integer field digits occupy the integer side and receive arbitrary LEFT padding with a distinguished padding symbol.
Fractional field digits occupy the fractional side and receive arbitrary RIGHT padding.
Padding has arithmetic value zero but is distinct from a raw digit0, so removing padding recovers the original field spelling, including leading/trailing zeros.
Missing fraction fields have only padding there.

All tracks have the SAME integer width and the SAME fractional width, chosen existentially large enough for their finite strings.
No assertion that independently chosen fractional lengths were originally equal is made.
Each field's padding discipline and unpadded regular language are regular constraints on this common word.
Integer-only auxiliary tracks are forced zero/padding to the right of the marker.
Fixed constants have their exact finite-decimal encodings modulo padding; fixed0 is treated explicitly.

Every actual finite collection of fields has such a common rectangular padding.
Conversely an admitted padded word decodes to exactly those finite raw fields and values.
The marker is a synchronization device, not a new field in any submitted lexical value.
Any nonnumeric variable whitespace block has its own regular word track with right padding and ignores the common marker.
Its characters have arithmetic contribution zero, and extra leading arithmetic padding columns provide enough total positions to hold that block.
Its exact unpadded word is still checked by the selected whole-word DFA path language.

### Finite carry automata for the whole conjunction

Consider one linear equation sum(c_j*v_j)=0 with integer coefficients; finite-decimal constants can be additional fixed tracks.
Read the padded digit columns RIGHT TO LEFT, ignoring the common point marker.
Start carry h=0, require h+sum(c_j*d_j) divisible by10 at each column, and update h to that quotient.
Accept exactly when h=0 at the far left.
Padding contributes digit0.

Let B=max(1,sum|c_j|).
Whenever |h|<=B, the updated magnitude is at most(B+9sum|c_j|)/10<=B.
Starting at0 therefore keeps the carry in the FINITE set[-B,B].
The standard base10 recurrence proves acceptance iff the represented finite rationals satisfy the equation; multiplying by the common10^fractionWidth gives the usual exact integer-column identity.

For sum(c_j*v_j)>=0 add an existential nonnegative finite-decimal result track z and the equation sum(c_j*v_j)-z=0.
Strict positivity additionally requires z's digit word nonzero; negativity reverses signs.
If the inequality is true, its finite-decimal difference has a finite padded encoding, so this translation is exact both ways.
The added integer width can always be enlarged by more left-padding columns.
No multiplication of two variable values or variable denominator bases occurs.

First expand the finite Boolean formula into finite cases of positive equations and strict/non-strict inequalities.
Negated equality becomes a less/greater split; each negated comparison outcome is replaced by the other explicitly defined outcomes, and finite residue/sign guards are split likewise.
Only THEN introduce fresh existential slack tracks for the inequalities in each positive conjunction.
Intersect those machines on the common tracks and union the finite cases; auxiliary tracks are existentially projected last.
Do not complement a language with a chosen slack witness and then existentially project it, which would not negate the original inequality.
All occurrences of x_i share the SAME lexical/value tracks, so equality/order constraints do not pick incompatible per-pair witnesses.
This is ONE synchronized finite-automaton product, not an arbitrary intersection of rational relations or independent unary state summaries.

### Decision, witnesses and a genuine encoded bound

Combine the finite field/residue/sign/Boolean cases, regular field masks, exact parsing/coordinate equations and carry automata.
The result is an effectively constructed finite automaton over a FINITE column alphabet, including all auxiliary tracks.
Finite graph reachability decides emptiness, hence both successful tuples and complete negatives for this LOCAL supplied problem.

Eliminate epsilon transitions, or take the exact epsilon-closure transition graph, before defining Q.
For an accepting epsilon-free case with Q states, a shortest accepted column word has at most Q-1 consuming columns, counting the point marker.
Decode its raw fields, separators, signs and finite whitespace blocks to obtain every lexical witness directly.
No fixed-value API is being used as an existential tuple oracle, and no positive-only unbounded search supplies a negative answer.
Each variable block has length at most Q-1; fixed separators and finite fixed-field text have an input-computable total length.
An input-computable bound on all raw words is therefore t*(Q-1)+fixedText for the finite number t of blocks, with the analogous finite tuple bound.
Computed coordinate records have finite decimal numerators/denominators and integer quotients of size bounded by these decoded digits and fixed coefficients.
Take the maximum of the explicit bounds over the finitely many compiled cases.

The actual primitive parser and scalar assessor can recheck each decoded value/word in its intended H.
The equations ensure those checks have the required semantic results; this recheck is not used as an unexplained completeness oracle.
Engineering work/node budgets remain finite resource policies and may require resource-limit results; the mathematical algorithm uses sufficiently large finite resources computed from the finite construction.

### Finite IEEE case and precise exceptions

For float/double, the actual value universe is finite after the owner's zero/NaN normalization.
Enumerate those exact value classes plus the finite exceptional input endpoints and evaluate their pair comparisons directly.
For each membership branch use the accepted ONE-WORD concrete-value inverse/admission construction, including exact IEEE numeric guards, to decide whether a lexical representative exists and to obtain one.
That existing total fixed-pair word procedure, not merely an assess/compare API or a claim that IEEE fibers are regular, is the explicit dependency.
The finite maximum over these finitely many word constructions is a computable bound.
If that accepted fixed-pair authority is unavailable for a selected pattern/profile, this IEEE extension remains conditional rather than narrowing the input silently.

No list/union selected-member synthesis, QName/NOTATION census, simultaneous unknown anchor properties, generic cross-family parse join, unbounded number of endpoints or new source-authority extractor is asserted.
The tuple may share actual VALUES; an extra requirement to reuse one literal lexical word in several different parsers must be added to the same word grammar and is outside the stated independent-witness interface.
The intended F2 application must separately prove its finite endpoint reduction, correct fixedness filters, enum/base membership and every component-property/annotation obligation.
Empty new patterns do not waive any of those duties.


## Relation to full F2 construction

The endpoint theorem supplies a local decision for at most four shared bound roles, not the entire new datatype.
A prospective strict alias may enumerate KEEP of each complete input bound kind versus REPLACE by one endpoint, subject to every fixed, inherited cross-kind, local-upper-pair, endpoint-membership and internal consistency duty.
Extracting this choice from an old successful restriction requires a genuinely formed immediate exact raw restriction, not a source/nonexact normal form or a locally productive candidate.
Any such extraction and whole-forest reconstruction must receive its own review.

KEEP of a component includes its annotation and authentic component authority where required.
An unknown annotation on an inherited immutable row must not be converted into an input-domain prohibition or inferred equal on a separately assembled alias.
Known property copying and an authenticated immediate-base component selector are different possible materializers; no new selector is implemented by this theorem.
Inherited pattern and enumeration components, proper-ancestor length witnesses, whitespace coverage, ordered members, NOTATION qualification and every current-context scalar/source duty remain separate.

After all earlier F2 construction duties are clear, two separate singleton pattern components a and b can provide the existing finite-pattern certificate for an empty value image.
Their emptiness does not clear a failed or unresolved formation duty.
This is not a general permission to omit inherited kinds, fixedness, endpoints, annotations or required child evidence.

## Source and proof boundaries

The elementary DFA factorization, padding and bounded-carry construction above is self-contained.
It uses the selected DT A calendar/duration laws and actual comparison conventions, rather than a different primary interpretation or an unspecified arithmetic solver.
The source baseline is main `77dad394c3fbff66fd1ab08855f8eabdfbf92407`; the subsequent inherited-facet identity repair does not change these numeric equations.

The concrete owners are [calendar arithmetic](../src/compiler/schemaExactCalendar.ts), [datatype values](../src/compiler/schemaDatatypeValues.ts), [scalar formation and F2](../src/compiler/scalarSchemaAssessment.ts), [finite regular languages](../src/compiler/schemaRegularLanguage.ts), [calendar images](../src/compiler/schemaCalendarImages.ts), [integer images](../src/compiler/schemaIntegerImages.ts) and [lexical predicates](../src/compiler/schemaLexicalPredicates.ts).
The already accepted concrete-forbidden one-word authority supplies only the qualified fixed-value IEEE membership subproblem; the shared variable tuple construction is new.

The dated sources are [Datatypes second edition](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/) and [Appendix E duration order](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/#adding-durations-to-dateTimes), interpreted through the accepted DT A decisions.
No external validator certifies an abstract forest or supplies the missing arbitrary-witness bound.
Engineering budgets can return resource-limit; neither that event nor exhaustion of a smaller candidate family establishes general nonexistence.
