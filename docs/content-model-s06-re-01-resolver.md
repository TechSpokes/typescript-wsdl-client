# S06 RE01 Hypothetical Resolver Specification

One candidate's component resolution, comparison boundary and research implementation plan. See the root [README](../README.md).

## Purpose and boundaries

This is the authoritative specification and issue-ready task plan for [#256](https://github.com/TechSpokes/typescript-wsdl-client/issues/256), supporting [RE01/#234](content-model-s06-re-01.md) within [#232](content-model-s06-research-handoff.md). The caller is the subsequent RE01 research candidate checker. It supplies one explicit two-step construction; this resolver never generates or searches candidates.

The selected research model is abstract component construction plans with a separate hypothetical context, the RE01 record's D1/E2 recommendation. A context contains an explicit component schema over immutable actual inputs. Reused components keep their identities, while every reference query, including a query through an unchanged component, uses its caller's declared context.

Preparation certifies structural consistency and a closed reference universe only. Resolution certifies the target of one declared reference only. Endpoint correspondence certifies the supplied correspondence over its declared projection only; none of these successes certifies complete candidate legality, payload validity or existence of any other witness.

The input precondition is a finite, immutable, resolved actual graph with source-level operands retained. Actual schema assessment, normalized restriction views and complete semantic predicates are separate inputs, each with a named authority and scope. Missing semantic authority returns `unresolved` at the checking boundary, rather than a successful legality claim.

The production entry remains [`prepareResolvedCompilationInput`](../src/compiler/semanticCatalog.ts), not a new loader or catalog format. Research execution uses independently prepared records and must not import `src/` or the unaccepted #231 assessment modules. No public result, profile, catalog, legacy default, occurrence algorithm or scalar engine changes in this specification.

### Verified inputs and primary authority

The verified base is #255 head `60937e4cfd5617eb39fcf49247e2e5c417790064`, tree `6c7c0a66cbbe1bc2baf0992c723a5fbef9591758`. At entry, main is `f4e39e819f2d9aa264cfdd14d16154c6443c9bac`; #254 remains open at `ddd90663aa88670edcca4371f7a142d94a5d36da` and #255 remains draft/unmerged. The specification branch targets `codex/research-232-continuation`; parent delivery is a merge dependency, not a resolver blocker.

The [dated 28 October 2004 structures source](https://github.com/jacoelho/xsd/blob/142f25ee187e17f041af87b6bfcfc82385254520/docs/spec/xml/structures.xml) was read with deleted editorial text excluded. Its SHA-256 is `e496af408b14853e6169ac7c1fca09d55a81bd73771758ad6be020960e1317ba`. Component construction is permitted by [conformance](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#concepts-conformance), but [schema validity](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#conformance-schemaValidity) still requires all relevant component constraints recursively.

The accepted sibling inputs are [AU01 C1 with universal source-replacement matching](content-model-s06-au-01.md), [PW01 R-240 v1](content-model-s06-pw-01.md) and [DT01 A v1](content-model-s06-dt-01.md). Their exact artifact hashes are pinned in the [S06 manifest](../test/conformance/s06-research-manifest.json). Invoke them only for the obligations described below; accepting these inputs does not settle RE01's complete theorem.

## Identity and context model

### Actual and proposed identity

An actual component ID is the immutable canonical ID, including symbol role, expanded QName, original local owner/path and chameleon/import interpretation. Equality is identity equality, never structural equality, a generated TypeScript name or a lexical QName spelling. Builtins occupy a separate immutable namespace keyed by XSD namespace and admitted builtin local name.

New components use candidate-local IDs disjoint from every actual and builtin ID. A fresh intermediate has a fresh identity even if its component properties equal original named `T`; it cannot claim `T`'s global QName. New anonymous components identify their candidate owner and stable plan-local path, with original sources recorded as provenance rather than adopted identity.

Exactly one actual definition can be replaced: the designated final endpoint complex type. Its proposed definition retains the actual endpoint identity, global/scoped identity and all properties required by endpoint comparison, except the declared derivation construction. The actual definition remains accessible only through the actual context; this is a second definition in another context, never mutation of an established actual component.

The intermediate is either an unchanged original type whose immediate actual base is the designated ancestor by extension, or a fresh constructed type whose immediate proposed base is that ancestor by extension. The proposed endpoint's immediate base is exactly that intermediate by restriction. Ancestor selection follows the actual chain to the definition whose base is `anyType`, including the simple builtin case described in the RE01 record; there is no arbitrary ancestor override.

Replacing another existing type, declaration, AU, group, particle or builtin is malformed plan input. Additional actual component identities may be shared individually, including an original group-owned AU; sharing does not reparent its original local declaration or rewrite its source contribution. Source-representability is not promised by an abstract plan.

### Membership, closure and permitted omissions

The candidate explicitly lists its retained actual IDs and its added components. Membership is authoritative and cannot grow silently during lookup. Required roots are ancestor, intermediate and endpoint; the ancestor's actual chain operands used for selecting it are also retained. The member set must contain every semantic target, containment child and local owner reachable from these roots or any other listed member, including references beneath zero occurrences and prohibited/source-only AU operands.

Closure follows type bases, list items, union members, element/attribute types, substitution heads, group uses, AU declarations, value/facet type operands and local owners. It also follows content and AU property edges and every retained original source contribution. Builtins require no user membership entry. An excluded outgoing target is `input-error: outside-context`, not fallback to the actual graph or permission to insert it.

Preparation indexes the entire supplied actual input once to record incoming relationships crossing the candidate boundary. The boundary manifest lists each excluded owner and its outgoing slot into an included component; it also lists excluded substitution affiliates of retained heads, including transitive affiliates. Ownership, references and affiliation are finite edges, so this census does not unfold content recursion.

Incoming owners are not automatically included. A smaller explicitly declared component schema may omit an unrelated global element, its substitution affiliation, a descendant type or an unused group. No in-context component may still refer to it, and no omitted component's actual assessment transfers to the proposed context. Schema-wide validity of excluded components and preservation of their payload languages are outside the returned guarantee.

For in-context substitution groups, potential members are computed from retained global elements only, then filtered by the in-context type/block predicates. Thus an excluded affiliate does not become an implicit particle member. The boundary manifest makes this reduced universe observable; a caller requiring preservation of an existing operation or head's full substitution set must explicitly include those affiliates and their outgoing closure before preparation.

The resolver does not choose whether a complete RE01 witness may use such a smaller schema. #234 owns that quantification and any stronger ambient-schema preservation theorem. This specification permits explicit smaller contexts and prevents their success from being misreported as whole-loaded-schema legality.

### Owners, sharing and provenance

Ownership and use are separate relations. A containment edge to a newly constructed local component must agree with its declared owner; a semantic reference can share an original AU or particle without changing that original owner. A fresh local declaration cannot substitute for an anchored declaration merely because its QName/type match.

All actual records are borrowed readonly; candidate additions and endpoint replacement records are validated and snapshotted under budget. Neither callers nor predicates may mutate them during a request. Public views contain readonly records/arrays; indexes and mutable caches remain private and are not exposed as mutable `Map` objects.

Provenance records distinguish `actual`, `constructed` and `endpoint-replacement`, retain original source URI/path, namespace bindings, effective namespace, chameleon interpretation and lexical operands, and record the actual operands motivating each constructed node. A diagnostic concerning proposed ancestry names both the proposed owner and related original operand sources.

## TypeScript contract

The following private research signatures are one standalone strict TypeScript example. `Id` is opaque text: the implementation validates its actual versus candidate namespace rather than trusting a cast. `Facts` is a small component view, not persisted canonical graph data or a replacement compiler.

```typescript
type Id = string;
type Method = "extension" | "restriction" | "list" | "union";
type Name = Readonly<{namespace: string; local: string}>;
type Kind = "type" | "element" | "attribute" | "particle" | "attributeUse"
  | "group" | "attributeGroup";
type Source = Readonly<{
  uri: string; digest: string; path: string; baseUri: string;
  start: Readonly<{line: number; column: number}>;
  end: Readonly<{line: number; column: number}>;
  namespaces: Readonly<Record<string, string>>;
  effectiveNamespace: string; interpretation: string; chameleon: boolean;
}>;
type Ref = Readonly<
  {kind: "symbol"; role: "type" | "element" | "attribute" | "group" | "attributeGroup";
    name: Name; target: Id; source: Source} |
  {kind: "local"; target: Id} |
  {kind: "builtin"; name: Name}
>;
type Operand = Readonly<{type: Ref; lexical: string; source: Source}>;
type Facet = Readonly<{id: Id; name: string; fixed: boolean; operand: Operand}>;
type Value = Readonly<{kind: "fixed" | "default"; operand: Operand}>;
type Occurs = Readonly<{min: string; max: string | "unbounded"}>;
type Wildcard = Readonly<{
  namespaces: Readonly<{kind: "set" | "not"; values: readonly string[]}>;
  process: "strict" | "lax" | "skip"; source: Source;
}>;
type Content = Readonly<
  {kind: "empty"} | {kind: "simple"; type: Ref} |
  {kind: "element-only" | "mixed"; roots: readonly Id[]} |
  {kind: "opaque-builtin"; type: Ref}
>;
type Facts = Readonly<
  {kind: "type"; variety: "complex" | "atomic" | "list" | "union";
    base: Ref; method: Method; final: readonly Method[];
    block: readonly ("extension" | "restriction")[]; abstract: boolean;
    content: Content; declaredContent: Content;
    attributeUses: readonly Id[]; wildcard?: Wildcard;
    items: readonly Ref[]; facets: readonly Facet[]} |
  {kind: "element"; name: Name; type: Ref; nillable: boolean; abstract: boolean;
    final: readonly Method[]; block: readonly (Method | "substitution")[];
    value?: Value; head?: Ref; identityConstraints: readonly string[]} |
  {kind: "attribute"; name: Name; type: Ref; value?: Value} |
  {kind: "attributeUse"; declaration: Ref; required: boolean; value?: Value} |
  {kind: "particle"; occurs: Occurs; term: "element" | "group" | "any"
    | "sequence" | "choice" | "all"; reference?: Ref;
    children: readonly Id[]; wildcard?: Wildcard} |
  {kind: "group"; root: Id} |
  {kind: "attributeGroup"; uses: readonly Id[]}
>;
type Identity = Readonly<
  {kind: "global"; role: Kind; name: Name} |
  {kind: "local"; owner: Id; path: string; role: Kind} |
  {kind: "fresh"; owner?: Id; path: string; role: Kind}
>;
type SourceUse = Readonly<{
  owner: Id; origin: Id; declaration: Ref;
  role: "local" | "group" | "direct-prohibition" | "group-prohibition";
  source: Source;
}>;
type Component = Readonly<{
  id: Id; identity: Identity; facts: Facts; owns: readonly Id[];
  source: Source; sourceUses: readonly SourceUse[];
  unassessed: readonly Readonly<{rule: string; owner: string; source: Source}>[];
  provenance: Readonly<{kind: "actual" | "constructed" | "endpoint-replacement";
    originals: readonly Id[]}>;
}>;
type ActualInput = Readonly<{key: string; components: readonly Component[]}>;
type AttributeAction = Readonly<
  {name: Name; role: "retain"} |
  {name: Name; role: "replace"; uses: readonly Id[]} |
  {name: Name; role: "prohibit"}
>;
type Candidate = Readonly<{
  key: string; ancestor: Ref; intermediate: Id; endpoint: Id;
  retained: readonly Id[]; additions: readonly Component[];
  endpointDefinition: Component; attributes: readonly AttributeAction[];
}>;
type Limits = Readonly<{maxNodes?: number; maxWork?: number}>;
type Usage = Readonly<{nodes: number; work: number}>;
type Diagnostic = Readonly<{
  code: string; rule: string; context: string; candidate?: string;
  component?: Id; slot?: string; source?: Source; related: readonly Source[];
}>;
type BoundaryEdge = Readonly<{owner: Id; slot: string; target: Id}>;
declare const contextBrand: unique symbol;
type Context = Readonly<{
  [contextBrand]: true; key: string; kind: "actual" | "proposed";
  members: readonly Id[]; excludedIncoming: readonly BoundaryEdge[];
}>;
type Result<T> = Readonly<
  {kind: "ok"; value: T; usage: Usage} |
  {kind: "input-error" | "candidate-rejected" | "unresolved";
    diagnostic: Diagnostic; usage: Usage} |
  {kind: "resource-limit"; limit: "nodes" | "work"; usage: Usage}
>;
type Target = Readonly<
  {kind: "component"; component: Component} | {kind: "builtin"; name: Name}
>;
type Prepared = Readonly<{actual: Context; proposed: Context}>;
type Pair = readonly [Id, Id];
type Correspondence = Readonly<{actualRoot: Id; proposedRoot: Id;
  pairs: readonly Pair[]}>;
type CorrespondenceReceipt = Readonly<{scope: "endpoint-properties-and-incidence";
  actualContext: string; proposedContext: string; pairs: readonly Pair[]}>;
declare function prepareContexts(input: ActualInput, candidate: Candidate,
  limits?: Limits): Result<Prepared>;
declare function resolveReference(context: Context, owner: Id, slot: string): Result<Target>;
declare function compareEndpoint(prepared: Prepared, certificate: Correspondence):
  Result<CorrespondenceReceipt>;
```

`prepareContexts` owns one request budget shared by its returned contexts, subsequent lookups, comparison and validation adapters. `usage` is cumulative for that request. A context is factory-issued and cannot be forged, used in another request or revived after exhaustion; a subsequent independent request starts fresh. Actual-only lookups use `prepared.actual`, whose membership is the full actual input, and cannot see additions.

### Facts and slot invariants

The type view carries prepared effective `content` and original raw `declaredContent` plus source uses; it does not derive them in the resolver. A complex type uses content, AU IDs and optional attribute wildcard; atomic/list/union types have empty complex content/AUs and use base/items/facets. `items` contains exactly one list item, declared union members in order, or no entries otherwise.

Facet operands retain their original ID, name, fixed flag, ordered layer position and type/lexical context. Identity-constraint strings are immutable canonical operand keys with original source records supplied by the semantic owner. The narrow resolver treats both as opaque obligations, never as value equality proven by matching text.

Particle `reference` is required only for element/group terms, `wildcard` only for `any`, and children only for compositors. Exact finite bounds are canonical nonnegative decimal strings; `unbounded` is admitted only for maximum. A group's root is a compositor; AU declaration references target attributes; element/attribute type references target types; head references target global elements.

`owns` lists original syntactic containment, preserving order; effective shared property edges are not additional ownership edges. Each local identity has its original containing declaration, not its immediate use position. `sourceUses` retains prohibited and otherwise nonsurviving original operands even when no effective AU exists.

`unassessed` carries every retained component constraint or unsupported syntax operand not represented by the narrow facts view. R4 must emit unresolved for each entry lacking a qualified owner receipt; an empty list is a preparation-authority assertion checked by the future production adapter, never inferred merely because the resolver recognizes the other fields.

Reference slots are fixed names: `base`, `items/<index>`, `content/type`, `declaredContent/type`, `type`, `head`, `declaration`, `value/operand/type`, `facets/<index>/operand/type`, `sourceUses/<index>/declaration` and `reference`. Nonreference edges use `content/roots/<index>`, `declaredContent/roots/<index>`, `attributeUses/<index>`, `children/<index>`, `root`, `uses/<index>`, `owns/<index>` and `identity/owner`. Unknown slots, wrong field combinations or mismatched kinds are input errors; consumers never provide a replacement arbitrary reference to bypass slot validation.

### Explicit semantic dependencies and receipts

The resolver hands prepared contexts and original operand IDs to direct owned functions: `checkTypeDerivation`, `checkSubstitution`, `checkTypeConstruction`, `checkAttributes`, `checkParticleRestriction`, `checkAttribution`, `checkDeclarations` and `checkScalarOperands`. These are separate adapters, not a configurable policy dispatcher. Their inputs and scopes are specified in the ownership table; none may consult a context-free global node index.

Each adapter returns `Result<Readonly<{context: string; rule: string; operands: readonly Id[]; authority: string}>>`. `ok` means exactly that named predicate passed for those operands in that context, under its declared accepted authority; `candidate-rejected` means that predicate fails for this candidate, not that all candidates fail. Missing predicate implementation, qualification or a violated preparation assumption returns `unresolved` with the precise owner/rule.

A checking caller may produce a `checked-candidate` receipt only after every required obligation and endpoint correspondence passes. Its receipt includes the explicit members, excluded-incoming manifest, complete obligation receipts and their authorities. Its scope is the listed component schema under those predicates, excluding source reconstruction, global witness completeness and production assessment acceptance; there is no bare `valid: true` result.

## Resolution rules

| Reference or edge | Actual context | Proposed context |
|---|---|---|
| Resolved symbol | Verify target role/QName; return actual target | Verify membership and role/QName; select endpoint override if targeted |
| Local reference | Return exact target; verify allowed original owner | Same identity; preserve original owner or validate fresh owner |
| Builtin | Validate XSD namespace and supported builtin name | Same immutable builtin handle; never overridden |
| Type/base/item/member | Follow actual facts in caller context | Follow selected facts in caller context |
| Particle/group/declaration | Follow original component IDs | Follow original or constructed IDs without structural copying |
| AU/group/value/facet operand | Preserve exact original operand identity/context | Preserve operand identity/context and explicit plan role |
| Containment/owner | Validate complete original ownership | Validate original ownership and fresh candidate containment |

Symbol targets are already resolved; the resolver never reparses prefixes, performs namespace loading or finds a different same-QName target. An unknown builtin, absent target, duplicate ID, unresolved symbol, wrong target kind, collision or invalid override is an input error, including below disabled particles. The diagnostic points to the reference's original source when available.

For a proposed lookup the order is membership check, designated endpoint definition, candidate addition, retained actual definition. There is no actual fallback after membership failure. Reading an unchanged actual `T`, `M`, group or particle does not switch evaluation context: a recursive reference to `D` still sees proposed `D`.

Legal self/mutual content recursion and sharing remain references. Preparation separately rejects cycles in local ownership, syntactic containment, group expansion, AU-group expansion, simple derivation/item/member expansion, complex base derivation and substitution affiliation. The builtin `anyType` ur-type sentinel terminates traversal and is not a user derivation cycle; no other cycle exemption exists.

A malformed actual input, invalid plan shape or missing/wrong target is an input error. A well-formed proposed edge set with a prohibited cycle is candidate-rejected with its cycle rule and related sources; an actual cycle violates the resolved-input precondition and is an input error. Failed semantic predicates also reject only the supplied candidate, while missing authority is unresolved.

Keep reference resolution separate from predicate evaluation. A validly resolved type can still fail derivation, final/block, substitution or particle predicates. A recursive predicate dependency must use its owner's proved termination rule; an active cache entry is not a proof of success.

## Endpoint comparison

The single comparison root is actual final endpoint `D` against proposed `D`. The compared projection follows every non-derivation effective property: content roots and particles, element declarations, AU/declaration/value operands, scalar content, facets, local scopes and sharing. It omits the endpoint's derivation edge and syntactic source contribution classification, which are replaced by the explicit construction plan and checked separately.

The ancestor and existing intermediate are exact reused identities, verified by plan preparation. Every actual ID reached by the endpoint property projection is anchored, including named/global types and declarations, original AUs, local owner identities and anonymous scalar operands. A fresh component is allowed only at a construction position outside that anchored projection, or as a fresh particle wrapper whose explicit correspondence preserves all non-annotation properties and edge incidence.

The projection stops at referenced type definitions and local-owner identities: it compares their anchored IDs, not their ancestry, content or other roots' properties. Element recursion is therefore represented by an anchored reference to `D`, while semantic queries on that reference use the selected context. Particle/group expansion and AU component properties remain in the projection; no type-content unfolding crosses an element/type reference.

The supplied certificate must be a total injective bijection over those two finite projections, map the root to the root, fix all anchored identities, preserve component kind, exact occurrences, content variety, mixed/abstract/final/block properties, declarations, scopes, original constraint operands and edge order/multiplicity, and preserve shared versus distinct nodes. Annotations and diagnostic source paths may differ for genuinely constructed wrappers; they remain honest provenance. Text equality never substitutes for typed scalar equality, whose owner supplies a separate receipt when needed.

Correspondence failure rejects only this certificate/candidate projection. It proves neither that no certificate exists nor that no RE01 witness exists. The existing [incidence checker](../test/research/re01/incidence-probe.ts) supplies bounded AU certificate mechanics, not automatic whole-endpoint equality; the future adapter must preserve order for particle child edges rather than reuse its unordered edge-multiset check indiscriminately.

Original named group `G` is not an additional comparison root merely because actual `D` once imported it. D1 can share individual original `G/g` and `G/h` while leaving `G` unchanged; this preserves their IDs and owners. The XML-source fresh-AU correspondence in the RE01 record is a different witness domain, outside this resolver's identity policy.

## Validation ownership

All members are checked in the proposed context, including unchanged members and source-only operands. This deliberately conservative rule avoids inventing a difficult incremental invalidation theorem. Actual context checks are comparison evidence, not automatically reusable legality receipts; only immutable builtin admission and identical original lexical/source records can be borrowed, while context-sensitive predicate answers are recomputed.

| Obligation | Context and inputs | Rule owner | Reuse/closure decision |
|---|---|---|---|
| IDs, targets, local owners, member closure | Both contexts; all slots/owners | Context preparation R1/R2 | Recheck candidate membership; actual IDs remain immutable |
| Prohibited cycles | Proposed expansion/base/head edges | Preparation R1 | Iterative active/done check; content recursion excluded |
| Type derivation method exclusions | Declared query context; derived/base/exclusion set | Relation adapter R3 | Recompute through proposed ancestry |
| Type `final`, element `final`, type/element `block` | Proposed type edges and element properties | R3 plus construction adapter R4 | Distinguish derivation final from substitution blocking |
| Intermediate extension and endpoint restriction | Proposed ancestor/intermediate/endpoint; original raw operands | R4/#234 component predicates | No transitivity assumption; no recursive RE01 search |
| Substitution affiliation and substitutability | Every retained global member/head; transitive affiliation | R3 | Recompute even for unchanged declarations |
| Effective substitution group membership | Retained global universe, abstract/block/type facts | R3 | Excluded affiliates recorded, not implicit members |
| UPA/particle attribution | Every member type/group content, use positions, in-context substitutions | R4/#179 particle owner | Recompute; group uses retain distinct attribution positions |
| Element declaration consistency | Same content closure, implicit substitution members | R4/#179 declaration owner | Named type identity required; structural equality insufficient |
| AU sets, restrictions and uniqueness | Every type/group original AU and source contribution | R4/AU01 C1 | All original constraints; no flattened QName projection |
| Wildcard namespace/process/member ranges | Original wildcard and particle operands | R4/PW01 R-240 | Formal whole-group and adjusted member checks remain separate |
| Scalar derivation/value/facet operands | Original type/lexical/namespace context per operand | R4/#179 scalar owner; DT01 A when calendar | No new scalar engine; missing authority remains unresolved |
| Original raw all placement and content variety | Original extension operand and proposed construction | R4/#179 component owner | Restriction pointlessness cannot erase extension constraints |
| Endpoint properties and incidence | Actual versus proposed endpoint projection | Comparison R2 | Supplied certificate only |

### Predicate rules that must remain distinct

`checkTypeDerivation` takes derived reference, base reference and a canonical excluded-method set in one context. For complex types, [Type Derivation OK](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-ct-derived-ok) first allows identical definitions; otherwise the derived method must be allowed, then immediate-base equality or the permitted recursive base comparison applies. For simple types, use [the separate simple rule](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-st-derived-ok), including base `final`, list/union ur-type and base-union alternatives; do not implement it as a generic ancestry walk.

[NameAndTypeOK](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#rcase-NameAndTypeOK) 3.2.5 excludes extension/list/union for the local element comparison. [Element properties](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#e-props-correct) 4 checks an affiliate's type against its head's type using the head's substitution-group exclusions. [Substitution Group OK](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-equiv-derived-ok-rec) additionally checks affiliation chain and disallowed methods against head and intermediate type blocking constraints; head `block="substitution"` suppresses substitutability without making the affiliation property absent.

[EDC](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-element-consistent) includes implicit substitution members and requires the same named top-level type for repeated same-QName declarations. [UPA](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-nonambig) distinguishes particle positions even when they originate from the same shared group. Neither an occurrence interval nor reference-graph closure proves those obligations.

R4 constructs a finite inventory with one entry per applicable rule/operand tuple in stable order. All member constraints are included, not merely predicates directly reached from the final particle comparison. Complete XSD rules not implemented by the accepted predicate owner remain named unresolved inventory entries; adapters must never declare complete legality by passing only their available subset.

### Attribute construction roles

Actual source roles are immutable `sourceUses`, including local/group replacement, direct prohibition and ineffective group prohibition. The proposed restriction instead has exactly one explicit `AttributeAction` for each expanded QName in the union of intermediate and endpoint AU sets. Duplicate or missing actions are malformed input; there is no role inference from equality or source order.

`retain` inherits the intermediate's entire same-QName AU-ID set unchanged. `replace` installs its listed endpoint AUs and invokes accepted AU01 requiredness, original-type derivation and typed fixed retention against every intermediate matching AU. `prohibit` produces no endpoint AU for that name and fails if any original intermediate matching AU is required. A replacement for a new name requires admission by the intermediate's original wildcard.

An extension plan preserves all ancestor AU IDs and may add individually shared original final AUs; uniqueness and every use/declaration's own constraint remain separate checks. Retention never compares conflicting inherited fixed uses pairwise as if they were source replacements; every present runtime value would still satisfy all C1 fixed obligations. Differing defaults are not fixed constraints, and QName/calendar aliases retain their original typed contexts.

### Established retained-substitution negative control

The new [actual schema](../test/conformance/fixtures/xsd/re01/substitution-actual.xsd) independently defines empty `A`, `T` extending `A`, `B` restricting `A`, `D` extending `B`, head `H:B` and member `M:D` affiliated with `H`. With no exclusions, actual `D` has immediate base `B`, satisfying `e-props-correct` 4 and the invoked complex type relation.

The [retained proposed schema](../test/conformance/fixtures/xsd/re01/substitution-retained.xsd) changes only `D` to restrict `T`. Its ancestry is `D -> T -> A -> anyType`; it never reaches `B`, so retained `M/H` fails that required type relation even though the declarations themselves are unchanged. This is an independently sourced negative result for this explicit context, not a statement that all candidates must retain `M/H`.

The [omitted-member control](../test/conformance/fixtures/xsd/re01/substitution-omitted.xsd) removes `M` and retains `H`. That smaller component schema has no `M/H` affiliation obligation. The [focused strict TypeScript tests](../test/conformance/reference/re01-substitution-context.test.ts) check the written source premises and literal ancestry expectations separately from current libxml2 construction observations; the live primary accepts actual/omitted and rejects retained proposed.

## Algorithms and data flow

### Preparation and deterministic lookup

```text
validate positive safe-integer limits; create one request budget
reserve actual plus fresh component node count before indexing
validate and index every original ID, kind, identity, source and slot
validate one endpoint replacement and candidate-local additions
validate roots and two immediate derivation edges against original ancestor
build explicit proposed membership; do not auto-add missing targets
for every member in stable ID order:
    select proposed definition; validate every outgoing slot and owner
    record all original source operands, including nonsurviving uses
check forbidden edge DAGs iteratively; preserve content-reference cycles
scan original incoming references and substitution chains for exclusions
freeze member/boundary views; issue actual and proposed context handles
on lookup: validate context/owner/slot; charge access; select exact target
on any failed charge: invalidate request; return resource-limit only
```

Iteration order is ascending UTF-16 ID order, then the fixed slot order above with numeric indexes in source order. Input arrays for set-valued membership/AUs are canonicalized by ID; semantic particle/union/containment order is preserved. Duplicate membership entries, additions or endpoint actions are input errors instead of order-dependent last-writer behavior.

The boundary census needs no speculative graph framework. Keep an ID index, fixed-slot visitor and reverse-reference lists inside preparation; derive substitution descendants by finite head-edge traversal. These structures have one consumer and no public mutation, transport or policy hooks.

### Comparison and delegated validation

```text
build each endpoint non-derivation projection with visited IDs
stop expansion at anchored type and local-owner references
verify supplied root pair and bijection; compare properties and edge incidence
enumerate applicable member obligations, including unchanged members
invoke the named owned adapters in deterministic rule/operand order
    pass context, original operands and the shared charging functions
    retain only complete rule receipts; never cache partial acceptance
if any rule fails: reject this candidate, with original related sources
if any rule lacks authority: unresolved, naming rule and owner
if all pass: emit scoped checked-candidate receipt and excluded boundary
```

The direct component predicates may invoke context-aware type queries but must not invoke the RE01 candidate search recursively to validate their own candidate. RE01's existential clause remains a caller proof obligation; the proposed two-step construction supplies its candidate without assuming the complete candidate family. If a delegated predicate cannot terminate without an unproved recursive assumption, it returns unresolved.

### Future production adapter

R6's documented production seam consumes `resolved.graph`, `resolved.links` and source context from `prepareResolvedCompilationInput`. It maps canonical simple/complex types into type facts, group-use nodes into explicit reference slots, and immutable IDs into anchors. It extracts final/block defaults from original declared/schema attributes, preserving lexical context and retained unsupported syntax as obligations.

`composed.types` can supply content contribution roots, but its QName-collapsed `attributes` cannot supply AU facts. The adapter obtains original use/declaration/group contribution IDs directly from `resolved.graph` and passes them to the AU01 owner. It never guesses original uses from effective attributes or imports unaccepted #231 modules into research.

The accepted [`OccurrenceAnalysis`](../src/compiler/occurrenceAnalysis.ts) supplies exact total range and `schemaEmptiable` only where a particle predicate requests them. For changed/fresh particle operands, the future semantic owner supplies a context-qualified view to that same analysis contract; the resolver does not derive occurrences or substitute `nullable`. An unchanged particle summary is reusable only when that owner's input content/occurrence closure is identical; changed type-level composition summaries are not reused.

The read-only #231 trace at `460f5b8379c68ffef79917284e445b5ab046429e` shows `assessmentContext` indexing one actual graph, scalar `derives` following that index and particle assessment calling it with a restriction-only boolean. R3/R4 require explicit context plus the full excluded-method set at that future seam; roots, normalized views and scalar descriptions also need context-specific caches. This is architectural guidance for #179's later reviewed integration, not copied executable code.

## Caching and resources

### Cache keys and lifetime

All caches belong to one prepared request. A key includes actual input identity, candidate identity, context identity, predicate/rule authority version, ordered operand identities, relevant occurrence/source operand identities and canonical predicate options, including the sorted deduplicated excluded-method set. Fixed-value keys also include each operand's original lexical and namespace context; QName spelling alone is insufficient.

Actual and proposed contexts never share predicate entries merely because an unchanged record object is shared. Two candidates never share entries even when they use the same final ID. Lookup keys include owner and slot; group attribution keys include use position; comparison keys include both contexts and supplied projection/certificate identities.

Cache states are absent, active or complete. Complete positive and negative predicate answers may be reused only within the same context/key; unresolved answers may be recorded for deterministic diagnostics but never promoted to success. A rejected candidate's cache dies with that request; an exhausted request clears all active/complete entries and exposes no usable context or partial receipt.

An active content reference is returned as a reference, not an expanded node. An active forbidden derivation path rejects the candidate. An active delegated semantic evaluation without its own proved fixed-point rule is unresolved; it cannot be treated as true to break recursion.

### Inclusive budget and cost model

Defaults are independently inclusive 100,000 nodes and 1,000,000 work units. Overrides must be positive safe integers. A reservation checks `requested <= remaining` before allocation/execution and never increments usage past the limit; sums use checked subtraction instead of overflowing machine counters.

Node usage counts every actual input component once, even when excluded, plus every fresh addition once. The endpoint replacement reuses one component identity and consumes work for its record/copies but no extra node slot; builtin handles are fixed shared constants. Set membership, incoming references and repeated uses never multiply the node count, but each edge and use position consumes work.

| Operation | Charge before allocation or execution |
|---|---|
| Input indexing/validation | One per record, field, edge and collection entry; each text code unit |
| Candidate snapshot/override | Record/field/entry costs plus copied text length |
| Map/set/queue/stack/cache | One per created container, inserted entry, push/pop, read or state transition |
| Reference traversal/cache hit | One per access plus key construction/comparison text |
| Sorting and canonical keys | Each comparator visit and compared UTF-16 unit; output entries/text |
| Original/source/context data | Every inspected namespace, source, bound, facet and lexical text code unit |
| Certificate/obligation output | Each receipt/diagnostic record, field, edge, list entry and copied text |
| Exact arithmetic/predicate work | Owning accepted contract's charged operands/results; same request budget |

Lengths may be read in constant time to reserve text work, but scanning, hashing, string comparison, concatenation and serialization must charge their inspected/produced UTF-16 units. Immutable borrowed text is charged when indexed/inspected; a further copy is charged again before copying. Deep-freezing traversals, diagnostic source copies and certificate arrays are included; returning an already borrowed immutable record avoids an uncharged copy.

Reserve one constant-size terminal failure envelope at request start. On resource exhaustion, return only that envelope and counters, with no unbounded diagnostic formatting or partial target/certificate/legality receipts; all later calls on its contexts return the same resource failure without work. Ordinary diagnostics are charged before output; if their construction exhausts the request, resource-limit supersedes the rejection or input error.

Preparation costs `O(N + E + L)` before deterministic sorting, where N is distinct input/addition components, E includes semantic, source, ownership and boundary edges, and L is inspected text length. Charged comparison sorting adds its actual comparator/text cost; space is `O(N + E + Lcopies)`. Endpoint certificate checking is linear in its finite projections and certificate entries, apart from charged canonicalization.

Type-chain queries visit finite derivation operands and union alternatives under their owner's cost model. Substitution descendant computation is finite over retained elements; complete UPA/particle/scalar work has its owning predicate's bounds, not a claimed resolver-linear bound. Shared DAGs remain references, exact huge occurrences stay decimal operands and neither legal recursion nor finite repetition is expanded into repeated structures.

## Behavioral test matrix

These are future observable resolver tests, not placeholder executable calls to nonexistent APIs. Each expectation's authority and scope is explicit; current fixtures prove only their documented predicates. Future test names below are intended files under `test/research/re01/`, owned by the named task.

| ID / requirement | Independent expectation and scope | Evidence / intended test | Task |
|---|---|---|---|
| B01 context propagation | Actual D method excluded; proposed D immediate base T passes local type query | Existing endpoint all [control](../test/conformance/reference/re01-endpoint-continuation.test.ts); `resolver-resolution.test.ts` | R2/R3 |
| B02 named identity | Reused T matches; fresh T-copy does not match anchored T and reaches excluded extension | Same dated clause/source contrast; `resolver-relations.test.ts` | R3 |
| B03 legal content recursion | Self/mutual element-type refs resolve without expansion or recursion error | #175/#178 contracts; independent two-type records in `resolver-context.test.ts` | R1/R2 |
| B04 forbidden cycles | Base, list/member, group, ownership and head cycles fail; builtin sentinel terminates | S05 forbidden-edge contract; hand-written cycle records | R1 |
| B05 identity/reference errors | Wrong owner, missing target, wrong role/QName, builtin collision and nonendpoint override are input errors | Canonical ID/owner contract; `resolver-context.test.ts` | R1/R2 |
| B06 unchanged traversal | Unchanged M.type or group path to D selects proposed D; actual context selects actual D | Explicit slot rules; independent literal records | R2 |
| B07 explicit membership | Excluded outgoing target is outside-context; excluded incoming M is recorded, never auto-added | Membership contract and omitted schema control | R1/R2 |
| B08 retained substitution | Actual M/H passes; retained proposed M/H rejects; omitted M has no such obligation | New [substitution control](../test/conformance/reference/re01-substitution-context.test.ts); `resolver-validation.test.ts` | R3/R4 |
| B09 incoming implicit members | Retained head's substitution set uses retained affiliates only; boundary lists omitted affiliates | `cos-equiv-class`; hand-written H/M/descendant records | R3 |
| B10 final and block | Base final extension rejects even vacuous extension; head block substitution suppresses substitution | Existing [final control](../test/conformance/reference/re01-particle-continuation.test.ts) and dated substitution clauses | R3/R4 |
| B11 predicate isolation | Same pair in actual/proposed, two candidates and differing exclusion sets yields its own answer | B01/B02 contrasting premises; `resolver-cache.test.ts` | R5 |
| B12 request isolation | Rejected/exhausted request followed by independent valid one has fresh counters/results | Failure-lifetime contract; literal two-request controls | R5 |
| B13 immutability/provenance | Actual records stay deep-equal/identical; proposed diagnostics retain original related paths | Canonical immutable contract; freeze and snapshot assertions | R1/R2/R5 |
| B14 deterministic failures | Shuffled set-valued inputs give same first diagnostic and canonical output | Stable ID/slot/rule order; independent multiple-error fixture | R1/R4/R5 |
| B15 inclusive resources | Same finite request succeeds at its charged count; one less exhausts with no partial result | Published cost model; separately authored operation ledger in `resolver-budget.test.ts` | R5 |
| B16 node sharing/exact values | 100,000 distinct input/addition IDs admitted with sufficient work; 100,001 fails; repeated refs do not expand | #178 and existing probe boundary evidence; independent ledger | R5 |
| B17 endpoint certificate | Distinct equal AUs cannot collapse; wrong local scope/fixed operand/order fails; D derivation alone may differ | Existing [incidence tests](../test/research/re01/incidence-probe.test.ts); `resolver-comparison.test.ts` | R2 |
| B18 AU roles | Omission/retain preserves original IDs; replacement checks all original matching fixed/required uses | Accepted AU01 literal matching table and group-incidence control | R4 |
| B19 delegated authority | Missing UPA/scalar/normalization authority returns named unresolved; lookup can still succeed | Success scope and inventory contract; `resolver-validation.test.ts` | R4 |
| B20 original particle constraints | Raw singleton all cannot become appendable through restriction normalization; direct restriction need not be transitive | Existing particle continuation controls | R4 |
| B21 attribution/EDC inputs | Distinct group use positions and implicit retained affiliates reach the owning checker | Dated UPA/EDC clauses; independently authored request-capture records | R4 |

B01/B02/B08/B10/B18/B20 have established narrow clause or selected-contract expectations now. B03-B07/B09/B11-B17/B19/B21 are contract-level expectations independently specified here and require handwritten prepared records, not expectations generated from the implementation. B15's complete numeric work ledger must be authored and independently reviewed in R5 before accepting exact-boundary results; old probe counts are not resolver counts.

The matrix does not establish general UPA, scalar equivalence, source-normalization or full restriction predicates by supplying truth tables. R4 adapter tests verify context/operand delivery and refusal when authority is missing; actual predicate acceptance remains with its semantic owner. No essential resolver behavior waits on a theorem about all possible RE01 candidates.

## Implementation tasks

Each task has one accountable implementing agent identified by a role below; bind that role to the actual agent/session when work starts. The #234 research coordinator integrates the leaf PRs and preserves these acceptance boundaries. Each implementing agent supplies an independent reviewer who did not author the task's material.

| Task | Accountable agent role | Dependencies | Bounded deliverable |
|---|---|---|---|
| R1 | Context preparation agent | Reviewed #256 specification | `resolver-context.ts` and owned context tests |
| R2 | Resolution/comparison agent | R1 reviewed interfaces | `resolver-resolution.ts`, `resolver-comparison.ts` and tests |
| R3 | Relation adapter agent | R1/R2 context lookup | `resolver-relations.ts` and relation tests |
| R4 | Validation integration agent | R1-R3 and accepted predicate records | `resolver-validation.ts` and delivery tests |
| R5 | Cache/resource agent | R1-R4 reviewed functions | `resolver-budget.ts`, private cache integration and boundary tests |
| R6 | Research integration agent | R1-R5 reviewed leaves | Integration evidence, production seam document and handoff |
| R7 | Fresh final reviewer | Exact R6 commit/tree and required checks | Independent readiness/guarantee review |

All modules above live in `test/research/re01/`; no implementation issue is opened by this session. Budget hooks and charge-before-work are part of R1's initial contract and every subsequent leaf; R5 audits/integrates them rather than postponing boundedness. R3 and R2's comparison implementation may run in parallel after R1 and R2's lookup contract are reviewed, with separate files; R4 needs both accepted results and R5 follows their integrated ledger.

### R1: Prepare explicit identities and contexts

Implement the readonly view validation, original/addition indexes, endpoint-only replacement, membership/outgoing closure, excluded-incoming manifest and forbidden-edge traversal. Own `resolver-context.ts`, a minimal shared type file and context tests only. Acceptance is B03-B05/B07/B13/B14 plus preallocation exhaustion controls; the review gate checks every reference/owner edge and all actual-source roles.

Semantic uncertainty is low at this structural boundary because actual IDs/owners are supplied and all membership rules are explicit. Integration depends on independently prepared research facts, not production extraction. Verification is moderately involved: cycle-kind distinctions, transitive excluded affiliation and local owner sharing need separate literal fixtures.

### R2: Resolve deterministically and verify endpoint correspondence

Implement validated owner/slot lookup in the caller context and the exact non-derivation endpoint projection/certificate check. Own resolution/comparison modules and their tests; retain direct references rather than materializing recursive trees. Acceptance is B01/B06/B07/B13/B17 and wrong-slot/forged-context controls, with no schema-legality success inferred from `ok`.

Semantic uncertainty is bounded by the selected D1 anchored-identity policy; source-representable fresh AU equivalence is excluded from this task. Integration depends on R1's issued handles and budget. Verification difficulty comes from ordered particle edges versus AU set incidence and the anchored type/owner expansion stop; reviewers trace every comparison edge to the specification.

### R3: Provide context-aware derivation and substitution relations

Implement the dated complex/simple TypeDerivationOK control flow and substitution affiliation/group relation using context lookup and explicit exclusions/final/block inputs. Builtin relationships come from the existing semantic owner or a reviewed fixed research table; do not copy a second scalar evaluator. Own the relation module and B01/B02/B08-B10 tests, plus same-type, union/list, head cycle and block/final contrasts.

Semantic uncertainty concerns authority coverage, not how contexts resolve: supplied tables do not prove complete simple-type semantics. The leaf must document each builtin/simple-rule premise and return unresolved for an unqualified premise; introducing a general scalar engine is outside scope. Its reviewer checks the simple rule independently, immediate identity tests before traversal and all excluded-method permutations.

### R4: Enumerate required checks and integrate owned predicates

Implement the finite all-member obligation inventory and narrow direct adapters with context/operand/authority receipts. Own validation module/tests; integrate accepted AU01 source roles and PW01/DT01 only where invoked, while treating unimplemented complete component predicates as explicit unresolved entries. Acceptance is B08/B10/B18-B21 and a scoped checked-candidate receipt only when the entire named inventory has qualified passes.

Semantic uncertainty remains in broader RE01 full-type predicates and is not hidden inside coding: this task implements context delivery and an honest completeness ledger, not their missing proofs. Integration depends on R3 and the accepted sibling artifacts; verification must capture original raw particles, every AU constraint, excluded substitution members and distinct attribution positions. Independent review rejects any subset-of-checks shortcut or reuse of actual context receipts.

### R5: Audit cache isolation and inclusive resources

Integrate request-local cache keys/states and audit every index, sort, text, queue, predicate, copy and output charge against the published cost model. Own budget/cache modules and boundary tests, with narrowly reviewed changes in predecessor modules where a charge is missing. Acceptance is B11-B16, a handwritten independently reviewed work ledger and exact at/one-below controls for one complete finite request.

There is no semantic uncertainty about exhaustion: it proves no negative conclusion and yields no partial success. Integration depends on all charging hooks and predicate costs; verification is difficult because cache hits, boundary census, freezing and diagnostics can hide work. The review gate audits before-allocation accounting and a fresh valid request after each failure class.

### R6: Integrate research behavior and implementation handoff

Complete all matrix rows on the combined research modules, reproduce existing endpoint/group/particle and new substitution controls, update hashes and document the exact future production adapter seam. Own combined tests, affected documentation/provenance and handoff only; do not edit production modules or activate #231. Acceptance requires all required #232 commands on the exact delivered head and a clean deterministic diff.

Semantic uncertainty is explicitly inherited from delegated predicates and the whole RE01 theorem; it does not authorize claiming complete candidate legality. Integration is substantial because every leaf's authority and resource receipt must survive combination. Independent verification checks that a positive resolver result, a supplied-predicate conditional check and a proved full-type witness are reported separately.

### R7: Review exact delivery independently

The fresh reviewer reads this assignment/specification/references without previous chat, reviews the exact R6 commit/tree and traces all behavioral cases to contracts. The deliverable is a verdict naming missing semantics, omissions, cache/resource findings and any qualifications, followed by renewed review after substantive changes. No code or specification author may supply this verdict for their own material.

The first ready task after specification readiness review is R1. R3's qualification limits and R4's unresolved semantic receipts are explicit implementation behavior, not unspecified resolver decisions. A new essential resolver question requires a focused prerequisite with a written counterexample, source clauses, proposed contract amendment and reviewed exit condition before dependent work proceeds.

## Proof boundary and handoff

This specification fixes one-context resolution, member/closure boundaries, identity preservation, explicit hypothetical AU roles, anchored endpoint comparison, validation ownership and deterministic bounded request behavior. Research implementation readiness means those contracts and tasks can be implemented without inventing a hidden semantic policy; it does not mean every delegated XSD predicate has already been implemented or the RE01 theorem proved.

#234 still owns positive full-type witness soundness, complete candidate-family reduction including original intermediate identities, content/simple/mixed cases, source-valid normalization/all placement, AU integration, anonymous scalar identity, ambient-schema preservation assumptions and the complete negative-answer/termination theorem with sufficient resources. An unsuccessful candidate, rejected certificate, smaller-context success or resource exhaustion cannot discharge those obligations.

#232 still owns joint consistency and independently reviewed research acceptance. #179 retains production adapter/complete legality integration and all guarded qualifications; #153 owns combined S06 acceptance. Accepted AU01/PW01/DT01 are not reopened, and S07/S08 readiness, public support and production activation remain unchanged.

### Delivery and verification ledger

The specification owner is Codex session `/root` for #256. The independent review, resolved findings, reviewed commit/tree, current command results, hosted checks and implementation readiness verdict belong in the linked draft PR and #256 handoff, avoiding self-referential commit hashes in this document. Substantive changes after review require renewed review of the delivered content.

Reproduce with supported Node and existing dependencies:

```bash
npm ci --cache tmp/cache/npm
npm run reference:setup
npm run check:toolchain
npm run docs:validate
npm run typecheck:research
npm run typecheck:reference
npx vitest run test/conformance/s06-research.test.ts test/conformance/reference/re01-substitution-context.test.ts
npm run ci
npm run test:reference:full
npm run test:conformance
git diff --check
```

IDE inspections are unavailable; repository documentation/snippet validation, scoped TypeScript, provenance, executable reference controls and independent review supply portable verification. #256 remains open until this specification has no essential resolver blockers, passes the independent review/checks and reaches main through normal protected merges; an unmerged parent branch alone does not satisfy closure.
