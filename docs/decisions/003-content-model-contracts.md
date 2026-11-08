# ADR 003: Faithful Content Models and Integration Boundaries

Architecture contracts for S02 and the later content-model implementation. See the root [README](../../README.md).

## Status and authority

S02 contracts reconciled with the executed [SOAP probe](../content-model-soap-feasibility.md) and [gateway probe](../content-model-gateway-feasibility.md), October 9, 2026. The initial draft passed independent semantic and integration review at `2f88ec81f77f4fc5a06b78f2d507ae8e20fe7a7c` before either probe began. The [decision register](../content-model-decisions.md) is the single disposition/ownership register; [S02's handoff](../../research/docs/content-model-s02-handoff.md) and #149 record final review/check/delivery checkpoints. This ADR activates no production behavior.

[Epic #147](https://github.com/TechSpokes/typescript-wsdl-client/issues/147), [S02 #149](https://github.com/TechSpokes/typescript-wsdl-client/issues/149) and #168/#169/#170 supply the acceptance gates. [S01 baseline](../content-model-baseline.md) and [shipped-fix reconciliation](../content-model-shipped-fix.md) are evidence, including BCsabaEngine's separately attributed production report. Their [manifest](../../test/conformance/semantic-baseline.json) remains authoritative for case IDs and expected outcomes.

These contracts define the intended `xsd10-faithful-v1` profile, not the shipped support matrix. Implementation tasks must add independent fixtures before claiming each supported constraint. A missing implementation is an implementation gate, not permission to silently drop a rule.

## Input and canonical graph: S02-D01

### W2 intake and endpoint amendment

For opt-in `checked-components-v1`, the explicitly supplied HTTP(S) root expresses intent to acquire its declared same-origin graph through the existing loader. One nonempty `sourceOrigins` project decision adds exact additional origins; explicit empty permission and closed offline snapshots remain restrictive. Every redirect is checked, remote-to-local transitions refuse, and namespace names are not guessed as schema locations. Generated logical root/alias-to-physical records preserve original bytes and final bases; records and artifacts grant neither native legality nor later I/O permission. Regeneration acquires fresh metadata, while runtime independently rechecks authorized physical snapshots without downloading metadata.

Component runtime protocol `checked-component-runtime-v2` derives the selected service/port address or uses an explicit override only on operation invocation. Optional endpoint restrictions narrow that destination, including empty deny-all; redirects do not widen it. TLS, source policy, source/artifact freshness, binding/action and native value checks remain unchanged. Generation, startup and scaffold tests execute no business operations. This supersedes the component fragment's mandatory duplicate endpoint permission below; the direct preview's loopback/permission contract and 1.x legacy defaults remain unchanged. See [checked gateway setup](../checked-gateway.md#url-intake-and-endpoint-intent) for controls, regeneration and scaffold ownership.

### Source graph contract

Preserve ordered element/text syntax, expanded names, every element's in-scope namespaces, source URI, line/column and source digest before compiling. The syntax adapter belongs to #171; controlled resolution belongs to #172. DTDs, external entities and payload-driven schema fetching are forbidden.

Resolve relative references against the declaring node's effective base URI, initially the final retrieval URI after policy-checked redirects. #171 preserves inherited `xml:base`; #172 resolves it before each import/include, under the same scheme/host/root policy. Initially support local files and HTTP(S) through an explicit allow policy; reject other schemes. A user-authorized root does not authorize arbitrary imports: local imports stay within configured roots, and remote redirects and every import are rechecked against host/scheme policy.

Cache fetched bytes by canonical absolute retrieval URI and digest. Cache schema interpretation separately by `(resource digest, effective document/base URI, effective target namespace, include/import context)`; a chameleon include interpreted in two namespaces produces two contexts. Byte-identical schemas at different base URIs may resolve relative references differently and must not alias; #172 owns that fixture together with redirect and `xml:base` cases. Preserve cycle edges, fetch once per resource, and diagnose unresolved declarations after traversal rather than substituting empty types. #172 must define URI normalization without collapsing distinct query strings or filesystem identities.

The immutable graph (#173/#174) contains separate element/type/attribute/group declarations, particle nodes, local occurrence bounds, structured references, derivation edges, namespace constraints, source provenance and operation bindings. Global symbol identity is `(namespace URI, local name, symbol role)`; named local declarations and anonymous types additionally use containing declaration identity and stable source-relative paths. The same local element QName in two containing types may have different types and must remain distinct; #177 owns that fixture. Prefixes and generated TypeScript names are not identity.

Finite bounds use exact integers; persisted finite bounds are decimal strings and unbounded is a distinct token. Zero annihilates descendant bounds, including an unbounded descendant. #178 calculates summaries; #180 matches complete particle languages, including gaps, correlation and order. A min/max interval is never a complete validator.

References retain their roles and identities; recursion remains a reference. #175/#176 resolve references and derive extension by composition and restriction by checked language/attribute constraints. #179 rejects illegal schemas, including UPA violations and illegal `all` particles, before planning projections.

## Runtime values and projections: S02-D02

The bounded #431/#432 delivery adds generation-time `applicationGroups` to the existing checked-component contract. Absence preserves previous artifacts and values; `{}` selects source-derived groups and optional `names` selects definition-scoped presentation aliases. The [checked gateway reference](../checked-gateway.md#application-groups-and-configured-names) specifies the inventory-copy workflow and compatibility boundaries.

Grouping requires observable nonempty boundaries; local optional bounds do not make a nonempty body nullable. Empty-capable bodies, zero-width realizations and ambiguous partitions retain the record's existing ordered representation, including required empty-capable choices governed by native language acceptance. Mixed/open/keyed records retain their existing presentation; overlapping native leaf alphabets still refuse.

One authenticated source-derived description drives inverse/forward mapping, named TypeScript alternatives and OpenAPI references. Optional repeated empty arrays normalize to omission without mutation. Capsules persist the presentation choice and rederive it from authorized sources; mismatched presentations fail artifact checks. This is a bounded opt-in disposition, not an automatic migration, new runtime payload switch or general ambiguity solver.

The bounded [XML/JSON mapping contract](../mapping-contract.md#selected-keyed-mapping-contract) selects keyed mixed/open entries, separate namespace identity/context, attribute carriers and explicit nil, with research-only fresh inverse examples for #409/#421. This handoff does not activate production support or replace these ADR guarantees; existing accepted mappings remain compatible.

Synthetic keys introduced into XML-derived application objects use the repository's `$` prefix; the [reserved mapping-key inventory](../concepts.md#reserved-mapping-keys) distinguishes existing keys, research proposals and descriptor compatibility work. Source-derived XML data names remain data names.

The graph describes allowed values; an XML value describes one value. #187 owns ordered XML values/events, with expanded element/attribute names, ordered children/text, namespace context for QName lexical values, nil state and scalar lexical/value context. Namespace declarations supply context and interpreted `xsi:nil` supplies nil state, rather than becoming ordinary application attributes; the lexical boundary retains their raw forms for security processing. Comments, processing instructions, prefix spelling, attribute order, entity spellings and transport chunk boundaries are outside fidelity; significant mixed text and child order are inside it.

Boundary shapes below are illustrative data contracts, not prescribed class or function APIs.

```typescript
type ExpandedName = { namespace: string; local: string };
type TypeReference = { namespace: string; local: string; role: "type" };
type XmlValue = {
  name: ExpandedName;
  attributes: Array<{ name: ExpandedName; lexical: string }>;
  nil: boolean;
  content: Array<XmlValue | { text: string }>;
  namespaces: Readonly<Record<string, string>>;
};
```

#182 selects compact objects/arrays only when reversible from observable XML values. Repeated `(a,b)` becomes an ordered sequence of pairs only if boundaries are uniquely inferable; repeated choices with mixed selections become an ordered tagged branch array when inferable. If invisible boundaries cannot be uniquely recovered, expose an ordered typed content representation, not independent name-keyed arrays or invented history.

Projection plans label each mapping `reversible`, `normalized` or `lossy`. Normalized mappings specify the precise equivalence class; lossy convenience views cannot be accepted as a faithful SOAP input without retained canonical content. Empty branch choices carry no recoverable wire identity. Zero-width repetitions normalize away; a required empty-capable choice is validated by language acceptance, not property presence.

Nil is independent of attributes. For a nillable element with attribute `id="7"`, a faithful representation can be `{nil:true, attributes:{id:"7"}}`; it cannot be reduced to `null`. Absence, `<x/>`, `<x xsi:nil="true"/>`, a null item and a null wrapper are distinct. Nil forbids content and preserves allowed attributes; #179/#180/#184 enforce the applicable declaration constraints.

## Equivalence and normalization: S02-D03

Target schema-defined XML values, not byte identity. `normalizeXml` compares expanded names, allowed attributes, meaningful ordered content, nil and type-specific scalar value meaning under the operation's resolved schema context. It applies the same declared default/fixed augmentation as XML assessment, so an absent defaulted attribute and its explicitly encoded assessed value compare equally. Only element-only insignificant whitespace is discarded; mixed-content whitespace remains. QName prefix changes are equivalent only when they resolve to the same expanded name.

`normalizeValue` returns a fresh value without mutating caller objects. It chooses the projection's documented canonical representative of invisible grouping, empty realizations and scalar lexical equivalence. It must preserve observable order and multiplicity; it cannot turn invalid branches into valid ones. Lexical-sensitive facets require retaining an admitted lexical witness or proving the selected representative satisfies every facet; value equality alone does not authorize rewriting a pattern-constrained lexical form.

The laws apply to schema/profile-valid XML and runtime-valid values within the selected faithful projection and declared validation scope. They do not promise equivalence for unsupported, invalid or lossy data.

```text
decode(encode(value)) = normalizeValue(value)
normalizeXml(encode(decode(xml))) = normalizeXml(xml)
normalizeValue(normalizeValue(value)) = normalizeValue(value)
```

### Falsifiable examples

| Case | Input and required observation |
|---|---|
| Reversible pairs | `(a=1,b=2),(a=3,b=4)` encodes `a,b,a,b`, never `a,a,b,b` |
| Mixed branch order | `[a(1),b(2),a(3)]` decodes in that order |
| Invisible boundaries | Groups `[a],[a,a]` and `[a,a],[a]` encode the same three `a` nodes |
| Canonical representative | Both invisible groupings normalize to the same ordered three-node value |
| Empty alternatives | Zero, one or several empty selections normalize to the same empty content |
| Nil attributes | Nil `x` with `id=7` retains `id=7` through both round trips |
| QName aliases | `p:T` and `q:T` with equal namespace bindings normalize equally |
| Scalar lexical form | Unconstrained decimal `+01.00` maps to value `1`; original caller text stays untouched |
| Lexical-sensitive facet | Decimal pattern `[+]0[0-9][.][0-9]{2}` retains an admitted witness such as `+01.00`, not `1` |
| Invalid input | A branch object containing mutually exclusive fields is rejected, never repaired |

Standards-defined whitespace/value normalization belongs to #184. API representation conversion is a separate explicit boundary (#183/#184/#198): HTTP decimal strings become exact scalar values in a new object. No JavaScript numeric coercion, removal of unknown fields or validator defaults may rescue an invalid submission.

XSD default/fixed augmentation is explicit in the XML assessment stage: defaulted optional attributes may be materialized, and present empty non-nil elements may receive their declared default. An absent element is not created to satisfy a required particle. Fixed values are checked by value; defaults never make a missing required API field valid. Normalized projections expose augmented values and their documented canonical encoding without changing the input.

## XSD 1.0 profile and enforcement: S02-D04

The profile selects legal XSD 1.0 sequences, choices, groups and `all` with legal bounds; zero, optional, repeated composite/nested alternatives and recursion remain in scope. Graph legality and reachable capability assessment (#179) precede particle matching (#180) and scalar validation (#184). Unsupported reachable features fail planning with the exact source/type/feature; unreachable declarations do not silently enlarge an operation's support claim.

### Profile-to-enforcement matrix

Each fixture below is an independent acceptance input: S01 IDs link to the existing manifest; named new fixture families are required deliverables of the implementing issue, not claims of executed S02 coverage. #181 and #207 qualify them against independent XSD engines; the known libxml2 zero-element disagreement remains explicit.

| Family / accepted domain | Conversion and validation boundary | Diagnostic / implementation | Independent fixture |
|---|---|---|---|
| Legal particles and exact counts | Ordered events; no flattening | `invalid-schema` #179; `invalid-value` #180 | S01 `sequence-order`, `finite-count-gap`, `zero-group-unbounded` |
| Empty/composite/repeated choice | Language acceptance, not presence counts | #179/#180/#182 | S01 `empty-alternative`, `required-multiple`; #181 mixed composites |
| Groups, recursion, extension/restriction | Resolved references and checked derivation | #175/#176/#179 | #177 group/recursive/derivation fixtures |
| Attributes, nil, simple/mixed content | Preserve attributes and text order; validate nil/content separately | #180/#184/#187/#188/#189 | #189 nil-with-attributes and mixed-text fixtures |
| Wildcard strict/lax/skip | Preserve ordered nodes; strict resolves and validates; lax validates known declarations; skip is opaque | #179/#180/#185/#189 | S01 `wildcard-sequence`; #189 wildcard modes |
| String family / whitespace | `string`, `normalizedString`, `token`, `language`, `Name`, `NCName`, `NMTOKEN`, `NMTOKENS`; type-specific grammar and whitespace | #184 grammar/normalization; #188/#189/#198 consume | #184 whitespace, name/language grammar and Unicode-length fixtures |
| Boolean | XML `true,false,1,0`; HTTP boolean only | Exact boolean conversion #184 | #184 invalid lexical boolean fixtures |
| Integer family | Signed decimal lexical forms; exact integer, subtype bounds | Canonical decimal string for HTTP; #184/#198 | #184 int64 extrema and out-of-range fixtures |
| Decimal | Finite base-10, no exponent; exact coefficient/scale | String-first; no Number rounding; #184/#198 | #184 decimal bounds and fraction/total digits |
| Float/double | XSD lexical domain including `INF,-INF,NaN`; IEEE type rounding | Tagged/string nonfinite HTTP values; #184/#183 | #184 nonfinite and rounding fixtures |
| Date/time/duration families | XSD lexical domain and timezone-presence semantics; no automatic UTC conversion | String representation; #184; no JS Date substitution | #184 timezone, leap/date and duration fixtures |
| Binary and anyURI | XSD lexical domain; decoded bytes for binary length; no URI dereference | Explicit canonical lexical conversion #184 | #184 invalid base64/hex and URI fixtures |
| QName | Resolve lexical prefix with local scope; preserve expanded name | HTTP `{namespace,local}`; unbound prefix is invalid; #184/#187 | #171 rebinding; #184 QName-value fixtures |
| Enumeration | Compare validated scalar values, not JS string coercion | #179 legality; #184 value check; #198 supplemental | #184 enum lexical aliases and rejection |
| Pattern | XSD regex semantics and derivation combination; ECMAScript subset only when equivalent | #179 rejects unsupported regex constructs; #184/#198 | #184 multiple-pattern and regex-difference fixtures |
| Numeric bounds / precision | Exact min/max inclusive/exclusive, totalDigits/fractionDigits | #184 shared exact arithmetic; #198 supplemental | #184 boundary values beyond safe integer |
| Length facets | XSD units: characters, bytes or list items according to type | #184; backend keywords only where equivalent | #184 non-BMP string and binary lengths |
| Default/fixed | Explicit schema assessment; fixed checked after scalar conversion | #179/#184/#189; API validator defaults disabled | #184 absent attribute/present empty element/fixed mismatch |
| List | Whitespace-separated supported atomic items; ordered item array | #179 legality; #184 item/facet validation; #183 JSON array | #184 empty/invalid item and list-length fixtures |
| Union | Native declaration-order assessment; primitive-string atomic unions retain the complete input string | #422 lexical specialization; #184 owns wider tagged design | `string-unions.xsd`; installed `facets.wsdl` |

`anySimpleType` accepts lexical text with no invented constraints. `anyType` is an explicit opaque scope, not a validated concrete structure. NOTATION, ID/IDREF/IDREFS document identity, ENTITY/ENTITIES requiring DTD declarations, keys/keyrefs/unique, substitution-group and dynamic `xsi:type` polymorphism, `redefine`, attachments/MTOM and XSD 1.1 assertions/open content are excluded with `unsupported-capability`. #179 owns diagnosis; legacy behavior remains routed by S02-D10.

Supported pattern planning admits the existing native-supported XSD regex fragment; other constructs refuse rather than being copied into JSON Schema. List/union of supported members are in scope; members using excluded constraints make the reachable type unsupported. The #422 component specialization admits unions whose effective members are atomic with primitive string and no contextual or document-wide obligations. Its JSON projection is the complete lexical input before member-specific whitespace normalization; every fresh inverse repeats native declaration-order assessment, retaining the selected member and typed value internally. Nested members flatten in XSD 1.0 order. Lists of this subset use lexical item strings under the existing list mapping and token rules; list-level patterns can retain one whole-list string. Heterogeneous and general tagged-union design remains with #184/#183. Any future tags must describe the native selection rather than unrecoverable caller history. New scalar families cannot be marked verified from a profile label or a serializer test alone.

### Scalar pipeline

The [S06 research handoff](../../research/docs/content-model-s06-research-handoff.md) supplies separate AU01, RE01, PW01 and DT01 evidence and candidate interfaces.
The maintainer explicitly selected C1 attribute semantics with universal source-replacement matching, R-240 wildcard bounds and candidate A's calendar repairs.
Their local research acceptance is separate from RE01's missing completeness proof, #179 implementation and the factual BCE reference correction.
The existing profile and this enforcement matrix remain authoritative, with #179 owning schema integration and #184 owning the shared payload scalar implementation.

XML lexical assessment (#187/#189) retains lexical text and namespace context, then #184 validates/converts according to the type plan. #188 validates application values before encoding. #198 validates HTTP representation before explicit conversion; #199/#200 call the same scalar/particle owners for request and response semantics.

Diagnostic paths include operation, type/particle ID, expanded name, source location and instance path where available; values and credential-bearing headers are not copied into errors. `invalid-schema`, `invalid-value`, `unsupported-capability`, `resource-limit`, `incompatible-artifact`, `transport`, `soap-fault` and `cancelled` are distinct categories. #179/#180/#184 own semantic detail; adapters attach I/O context without changing categories.

## Portable contracts and dialects: S02-D05 / S02-D06

#182 owns the client projection; #183 owns HTTP JSON projection; #184 owns scalar rules. Type references remain structured until a backend resolves deterministic names. Exact integers/decimals use decimal strings in HTTP JSON, QName uses expanded names, binary uses canonical encoded text and nonfinite floats use explicit tagged/string representations. Client mappings may use exact runtime scalar types; those types never leak through JSON.stringify accidentally.

#185/#186 persist one data-only portable bundle: format/model/profile versions, graph/source digests, projection and codec plans, binding selection, declared capabilities, limits, validation/completion scope and fingerprint. The first formats are `catalogFormat:2`, `bundleFormat:1`, `model:"xsd10-faithful-v1"`; these are independent of npm version. No generated-source parsing or OpenAPI reconstruction creates missing XML structure.

Fingerprint SHA-256 covers a deterministic semantic serialization of graph, selected projections, profile, binding/capabilities and scope. Exclude timestamps, machine paths and documentation from semantic identity; include source digests separately for provenance. #185 validates bundle structure, references and limits before #186 compares compatibility; a digest detects mismatch but does not authenticate an untrusted artifact. Consumers negotiate exact format major/model/profile and supported required capabilities, and compare the same bundle fingerprint before dispatch. Unknown mandatory fields/capabilities fail closed; optional annotations can be ignored within a supported format.

OpenAPI 3.1.1 / its 2020-12-based schema dialect is the selected documentation target. Current output is 3.1.0; #197 implements the new target with completeness metadata. Runtime JSON Schema and serializer schemas are separately emitted draft-07 lowerings; they do not consume arbitrary OpenAPI schemas. The [gateway probe](../content-model-gateway-feasibility.md) executes strict route-local Ajv without coercion/defaults/removal, recursion, nullable boundaries, closure, facets and byte preservation. Unknown dialect keywords and missing supplemental plans fail closed.

JSON Schema constrains JSON representations; XSD regex, QName scope, exact decimal facets and complete particle languages require supplemental #184/#180 checks where the lowering is incomplete. Each plan declares completeness and supplemental requirements. The serializer is never a validator. #197 emits dialect-specific plans; #198 supplies validators; #199/#200 integrate validation and explicit conversion independently from serialization.

Use tested draft-07 serializer plans where they preserve admitted JSON values. Otherwise select explicit validated `JSON.stringify` fallback, retaining the independent response validator and shared supplemental rules. The current 150-reference heuristic is an executed existing policy, not a measured serializer maximum; #200 owns its qualified replacement or retention. Current generic `allOf` flattening changes meaning for closed disjoint members, and current fallback accepts invalid responses; neither behavior is adopted as faithful validation. Validate returned HTTP JSON independently and prove the serialized bytes preserve every admitted field/value; #200 must reject field loss before sending.

## SOAP adapters and security ordering: S02-D07

Retain ADR-002's dedicated streaming transport. The [SOAP probe](../content-model-soap-feasibility.md) establishes SOAP 1.1 document/literal feasibility through both actual generated execution paths with bounded raw-body/raw-response seams. #190 owns buffered integration and #192 owns shared request encoding plus streamed decoder integration. One #188 encoder produces ordered body content for both; transports own envelopes, namespace bindings, SOAP version/action/headers, endpoint selection and I/O, without a second particle/scalar engine.

Select node-soap's executed `_xml` complete-body or documented `$xml` child-content hook before its security stage, plus the dependency response event before name-keyed parsing. Buffered Basic/header/UsernameToken/signature/mTLS checks pass through that seam; incoming security verification remains a separately enforced qualification gate. Name-keyed parsed objects alone cannot carry `a,b,a` order. Streaming injects that same content at its envelope boundary and supplies namespace-aware ordered events from actual HTTP chunks to #189's decoder.

Select an operation's declared binding/version/port explicitly, not the first service port. Dispatch checks endpoint overrides, actions, HTTP/SOAP headers, faults, auth/security, cancellation and capabilities against the bundle. Unsupported/unverified combinations fail before sending; never silently omit credentials or signatures. #169's matrix must distinguish executed success/failure from source inspection and upstream documentation.

Validate/encode application input, build the envelope, then apply security-sensitive signatures to the final envelope before dispatch. Incoming signature/security verification precedes semantic normalization; preserve required raw bytes at that boundary. Changing prefixes, text or grouping after signing can invalidate signatures. No XML-value equivalence contract promises a byte-preserving signed round trip.

For a signature whose verification scope closes only at response EOF, records must not be exposed as authenticated before verification. #190 may use bounded buffering; #192/#193 must either use a separately proven incremental verification protocol or reject that streaming/security combination before dispatch. A signature failure is terminal failure and never successful completion. The verification-before-yield rule is mandatory even if record datatype validation succeeds.

The S02 minimum feasibility gate is local SOAP 1.1 document/literal HTTP: both actual paths must preserve a shared pre-encoded ordered body and expose response order/namespace/nil context before name-keyed parsing; buffered calls must preserve endpoint overrides, actions, HTTP Basic and HTTP/SOAP headers and faults; streaming calls must establish declared binding endpoint/action/HTTP response headers, HTTP failure, before-EOF records and a consumption/completion seam. Streaming auth, SOAP headers, SOAP faults and cancellation must be executed and classified even when the current path fails. A current omission is not a verified capability: the selected contract must name a fail-closed first-consumer owner and concrete seam for correction. Existing buffered security cannot be dropped; a new required security/transport combination with no evidenced adapter seam blocks S02 closure.

HTTP Basic/header auth, WS-Security, TLS client certificates, SOAP 1.2 and cancellation are separate capabilities. Preserve the legacy buffered capability surface through its legacy adapter. Only combinations executed by #169 may count as verified on the proposed faithful path; isolated later capability qualification can block #190/#192 without changing graph/value contracts, provided the required base transport feasibility is established.

The executed minimum passes, including per-call selected-port/action and buffered abort seams, raw namespace/nil context, streamed records before EOF, fault detection and cancellation correction seams. The locked dependency's shared-port-type action collision requires immutable selected-port routing and per-call version-appropriate action headers in #190; a mutable global action setter is rejected. Current streaming omits configured endpoint/security/headers/version overrides, accepts HTTP-200 faults as empty results, loses namespace/nil context during materialization and leaves input open after early return. #192/#193 must replace those narrow responsibilities with the demonstrated seams and reject every unqualified capability before dispatch; current omissions are executed failures, not support.

## Stream completion: S02-D08

#185 persists scope; #193 owns lifecycle/completion; #194 proves parity. Yielding a valid record is provisional: successful whole-response completion requires well-formed XML EOF, the selected SOAP version/envelope/body/wrapper grammar, valid records, declared wrapper/scalar and aggregate constraints, valid trailing content, and no SOAP fault or transport error.

For opaque/wildcard wrappers with companion record types, completion certifies SOAP grammar, configured wrapper/path shape and counts, record validity and declared trailing policy. It does not certify unknown wildcard/opaque content against a nonexistent concrete response schema. Strict wildcards validate resolved declarations; lax/skip coverage is reported explicitly. Unknown header blocks and `mustUnderstand` handling remain binding responsibilities, not silently validated record content.

Declare `full-response` or `records-with-declared-wrapper-scope` plus opaque exclusions in the bundle. A terminal outcome is success, failure, or cancellation; exhaustion after a validation failure must reject, not appear as success. Early consumer return cancels input and releases resources; it never certifies completion. Completion follows consumption and bounded backpressure, not an independent background drain. Gateway failures before bytes use an error envelope; failures after bytes abort the response as in ADR-002.

## Provisional resource budgets: S02-D09

These are selected defaults for the future faithful path, not measured maxima or changes to current production defaults. Limits are configurable downward; increases require an explicit caller policy within safe integer/exact-bound handling. #208 refines them with measurements; each first owner implements at/beyond-limit tests now.

| Limit | Default and unit | Enforcement owner / failure |
|---|---|---|
| Schema resource count | 128 distinct resources per compilation | #172 `resource-limit` |
| Schema bytes | 8 MiB per resource; 64 MiB aggregate decompressed | #172 `resource-limit` before parse |
| Resolution depth / redirects | 32 edges / 5 redirects per fetch | #172 `resource-limit` |
| Fetch time | 15,000 ms per resource; 120,000 ms compilation I/O | #172 `transport` timeout |
| Syntax/XML depth | 256 nested elements | #171/#187 `resource-limit` |
| Graph size | 100,000 declarations plus particles | #173/#179 `resource-limit` |
| Matching work | 1,000,000 state transitions; 10,000 live states per value | #180 `resource-limit`, no partial acceptance |
| Scalar size | 1 MiB UTF-8 lexical bytes; 4,096 numeric digits | #184/#187 `resource-limit` |
| Generated expansion | 10,000 alternatives per type; 16 MiB per generated file | #182/#195/#197 `resource-limit` or declared validated fallback |
| Buffered payload | 32 MiB decompressed XML/JSON bytes per operation | #187/#190/#199/#200 `resource-limit` |
| Streaming record | 4 MiB decoded UTF-8 bytes per record | #189/#193 `resource-limit` |
| Streaming queued data | 16 records and 8 MiB, whichever is first | #193 bounded backpressure / `resource-limit` |
| Aggregate counters | Exact integers, no numeric wraparound | #180/#193 `resource-limit` at configured operation count |
| Stream inactivity | 30,000 ms without upstream progress | #193 `transport` timeout |

Streaming has no global document-byte cap by default; it enforces depth, record, queue and operation aggregate constraints. Queue capacity pauses input; a single oversized record fails. User cancellation is `cancelled`, distinct from deadline exhaustion. S03 applies loading/depth budgets only, without implementing downstream codec budgets.

### Direct-client application ownership amendment, October 27, 2026

Normal generated-client execution does not inherit research/testing work or size quotas. Resource capacity, logs and operational failures belong to the application hosting the client or REST gateway. Callers may explicitly select their own timeout or size controls; no SOAP deadline is installed by default. Source/contract authorization, schema/protocol correctness and unsupported-feature refusals remain independent requirements.

The [current direct-client policy](../direct-values.md#current-direct-client-resource-policy) records the plan, implementation, test-profile values, product tradeoffs and measured before/after behavior. The private direct path uses an unmetered semantic-engine interface by default; bounded profiling and the existing native accounting remain explicit in tests/research for optimization and exhaustion measurements. This replaces synthetic procedural allocation reservations, including the quadratic source bootstrap reservation, without creating a second semantic engine.

The amendment supersedes prior mandatory per-invocation resource-accounting claims for normal direct clients. Existing research-tool defaults, historical measurements, public exports, legacy behavior and admission remain unchanged. No consumer CPU/memory protection or preemption guarantee is claimed.

## Compatibility and activation: S02-D10

Preserve the current legacy default for the 1.x line. The planned architecture release train is 2.0.0; earlier faithful evaluation is limited to unreleased opt-in development artifacts unless a reviewed ADR amendment authorizes an earlier supported release. A default public-shape switch requires that major release, integrated S17/S18 evidence and a separately approved activation PR. S02 merges docs/probes only; it neither announces a new release nor changes the default.

### Version 1.1.6 opt-in preview availability amendment

This historical November 1, 2026 dispatch authorized the v1.1.6 candidate's bounded `checked-components-v1` and `checked-direct-v1` previews through the existing pipeline and package-root runtime. It supplied the earlier-release exception above for their independently qualified scopes only. The November 3 amendment below supersedes its generation-mode decision; the [trial guide](../checked-generation.md) and [checked gateway reference](../checked-gateway.md) describe the current workflow and compatibility requirements.

### November 3, 2026 consolidation amendment

The approved #412 execution consolidates public generation into legacy and `checked-components-v1`, targeting v1.1.7 while v1.1.6 remains an unpublished, consumed candidate. The already-shipped `checkedDirectRuntimeV1` protocol and restrictions remain compatible with frozen v1.1.5-issued artifacts. If v1.1.6 is published before delivery, the removal premise must be reconsidered before merge or tagging. Its existing tag and draft remain untouched.

One generation invocation may reuse its source-owned native handles, closed SOAP metadata, mappings and prepared lowerings. Those transient results never become saved authority; separate plans and runtime calls still qualify fresh physical sources. Generated `checked-source-resources-v2` records contain only project-owned snapshots, aliases, artifact locations and acquisition choices. Optional host overrides preserve explicit restrictions, including empty denial; complete older source configurations remain advanced inputs.

Concise companion associations explicitly acknowledge `records-with-declared-wrapper-scope`. Native mapping owners derive unique paths and fixed exclusions, retain `recordPath` when ambiguous and pass through `createComponentRecordProjection` as the final gate. The companion interpretation does not establish full response validity in the outer strict-wildcard universe. Required schema metadata and invalid scalar/wildcard refusals remain mandatory; no automatic companion discovery or new response mode is introduced.

Legacy remains the 1.x default, and `admitted:false` remains the full-profile marker. Preview availability does not admit the full faithful profile, establish universal research completeness, qualify production providers/security or activate checked streaming. Wider owners and full-profile S17/S18 evidence remain open; a default public-shape activation still requires the separately approved 2.0.0 major-release gate.

### Legacy and faithful routing

| Input / requested mode | Selected behavior | Diagnostic and first owner |
|---|---|---|
| Legacy unversioned flattened catalog / legacy | Supported through explicit legacy adapter | #174 route as legacy; preserve existing names/options |
| Legacy catalog / faithful | Regenerate from original WSDL/XSD | #174 `incompatible-artifact`: missing ordered semantics; show source compile command |
| Original source / legacy | Supported; derive legacy projection from one compiler during migration | #174/#195/#201 preserve defaults and deterministic names |
| Original source / faithful | Compile graph and new bundle only when profile/binding supported | #179 support diagnostic; #185/#201 opt-in routing |
| New bundle / compatible faithful consumers | Supported after versions/capabilities/fingerprint match | #185/#186/#195/#196 validate before call |
| New bundle / legacy-only consumer | Reject; regenerate matched artifacts for selected mode | #186/#201 `incompatible-artifact` |
| Mixed catalog/client/gateway/bundle fingerprints | Reject before dispatch; regenerate together | #185/#186/#195/#196/#201 name mismatched artifacts |
| Unknown format major/model/profile or required capability | Reject with expected/actual contract identifiers | #174/#186 runtime compatibility error |
| OpenAPI-only faithful gateway generation | Regeneration-required with portable bundle | #196/#201 missing SOAP contract diagnostic |

Names derive deterministically from symbol identities with stable namespace collision suffixes and source-relative anonymous paths. Keep legacy names on the legacy route; faithful mode may introduce new names/shapes explicitly. #184 owns naming rules and #195 consumes them with generator collision fixtures; a documentation edit or digest change cannot randomly rename symbols. Flattened information is never reconstructed by assertion. #204 qualifies integrated migration; #205 removes duplicate semantic ownership only after compatibility coverage.

## Rejected alternatives: S02-D11

Bounds-only patches cannot enforce count gaps, order or correlations. Universal property flattening loses branch/interleaving context. Raw parse-tree DTOs confuse schema syntax with application values and expose parser-specific prefixes/history.

One schema for all backends conflates XML semantics, HTTP representation, OpenAPI vocabulary and serializer support. A second schema/validation engine duplicates scalar/particle authority; target lowerings and supplemental checks consume one owned core. Raw fetch replacement without a binding/security capability gate can bypass authentication, headers or signatures. Removing dedicated streaming would restore full-response buffering without incremental evidence.

## Evidence and final gate

S01 executes the finite manifest and real occurrence transport harness, not these new faithful contracts. #169 commits eleven local HTTP/TLS/signing assertions for both actual paths, raw/ordered seams, invisible boundaries, namespaces/nil, streaming-before-EOF and capabilities. #170 commits nineteen route assertions comparing submitted, validator-visible, returned and byte-serialized values, preserving a host control route. Their [SOAP](../content-model-soap-feasibility.md) and [gateway](../content-model-gateway-feasibility.md) records distinguish generated behavior, test-only adapter feasibility and unverified combinations.

Final #168/#149 acceptance requires both reviewed probes, reconciled register entries, reviewed delivery revisions, local aggregate CI, hosted Node 24/26 and merged-main checks. Any unresolved graph, projection, bundle/runtime, required base transport or compatibility choice blocks S03. Later isolated capability qualification has an explicit affected consumer and cannot count as verified support.

## Primary references

- [XSD 1.0 structures, second edition](https://www.w3.org/TR/xmlschema-1/)
- [XSD 1.0 datatypes, second edition](https://www.w3.org/TR/xmlschema-2/)
- [Namespaces in XML 1.0, third edition](https://www.w3.org/TR/xml-names/)
- [XML Base, second edition](https://www.w3.org/TR/xmlbase/)
- [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [ADR-002](002-streamable-responses.md): current dedicated streaming decision and shipped behavior

## Checked product assessment amendment: P1-D01

Issue [#367](https://github.com/TechSpokes/typescript-wsdl-client/issues/367) authorizes a separate checked-product track. Universal RE01 completeness remains a research goal, but is no longer an unconditional predecessor of qualified product delivery. This amendment supersedes historical blanket product gates only; the approved full profile and research completeness flags are unchanged.

The additive `assessSchemaSource` API and `wsdl-tsc assess --wsdl-source <source> --report <path>` command perform diagnostics only. They use the controlled loader with explicit roots/origins, source-bound native contexts and existing semantic owners. They cannot generate artifacts, dispatch SOAP or authorize later generation by replaying a report.

### Independent report dimensions

Report version `checked-assessment-v1` names scope `whole-actual-native-direct-v1`, model `xsd10-faithful-v1`, and basis `native-direct-premises-v1`. Established means all required source-document, whole actual component, generated scalar, notation, identity-formation, dependency and aggregate obligations in that scope have accepted native evidence. It is not a claim of complete dated-XSD validation: the independent dated-XSD correspondence dimension must also be established before any standards-based checked schema eligibility.

Each obligation records rule, component, origin context, evidence basis and an established/disproved/inconclusive result with evidence or an unresolved reason. Required work is inventoried before assessment; aggregate status is disproved if any sound actual failure exists, established only if every required duty is present and established, otherwise inconclusive. Interrupted or unenumerated work retains a required inventory/closure duty; empty arrays cannot imply success. Independent actual-component checks continue after ordinary unresolved/unsupported results, so unrelated actual failures remain discoverable.

The direct route checks actual source premises and primitive no-change derivation using the existing finite owner and its aggregate dependency discharge. A constructed B-v1/Q_f witness is never silently promoted to dated-XSD evidence. Constructed witnesses are excluded from this first product adapter; nonprimitive RE01 remains a named unresolved obligation, and lack of a witness is inconclusive, never original-schema invalidity.

Execution independently records completed, resource-limit, cancelled or failed. A normally finished limited strategy may be inconclusive; sticky exhaustion may not become completed. Partial reports retain known facts and explicitly unassessed duties; invalid unrelated actual declarations remain relevant to whole-Gamma legality.

Every discoverable WSDL portType operation has supported/unsupported/not-assessed capability entries for matching, projection, scalar payload validation, bundle, codec, buffered transport and structured generation. Schema legality does not establish runtime support. Checked admission requires completed execution, all required established schema and correspondence obligations, and all required implemented/tested runtime capabilities; this diagnostic milestone admits no generation.

### Identity, budgets and diagnostics

Reports include exact source resource digests, import/include edges and effective interpretation contexts, named limits, semantic contract/tool versions and request work/node usage. Ordering is deterministic by stable source/context/component/rule keys; ephemeral native request IDs are normalized to the report's actual context. URI identities use opaque request-local labels plus digests so credentials, query strings, absolute paths and source payloads are not published. Digests detect mismatches; they are neither authentication nor proof certificates.

One inclusive sticky request budget covers loading, preparation, native checking, copying, caching and publication, with the existing loader's byte/depth/time and structural limits retained as additional bounds. Cancellation is cooperative at stage and component boundaries; it is never a schema failure. Terminal escape reports retain an explicit unassessed closure duty and cannot grant admission.

The CLI writes only the requested JSON report and a concise status diagnostic. Execution takes exit precedence over schema facts: resource-limit is 4, cancelled is 5 and failed is 1, even when a known schema failure is retained. For completed execution, exit codes are 0 for established required schema scope and correspondence, 2 for inconclusive, 3 for disproved, 4 for resource-limit, 5 for cancelled, and 1 for loading/operational/report-write failure. Runtime unavailability is separately reported and does not turn schema invalid; no existing command, shape or legacy default changes.

### Qualified dated-XSD direct route

The first sufficient correspondence route accepts source-bound full native direct closure only when each root/inline schema contains named nonderived, nonmixed complex types with one sequence and global elements referring to those types or builtin string/boolean/int. Local sequence elements must have distinct local names and builtin string/boolean/int types; minOccurs is 0 or 1 and maxOccurs is 1 or unbounded. Schema attributes are limited to targetNamespace and form defaults; declarations use only name/type, and local elements may additionally use form and occurrence bounds.

No include/import/chameleon, annotations, foreign attributes, defaults/fixed, identity, attributes, substitution, facets, derivation or opaque builtin type falls within this sufficient route. Native construction and aggregate discharge remain required: the whitelist is correspondence evidence, never a second checker. Distinct names establish trivial EDC/UPA, ordinary sequence construction maps directly to the 2004 Structures rules, and the three builtin types use the 2004 Datatypes definitions. Other cases are correspondence-inconclusive; no generic native invalid-schema result is promoted to dated-XSD invalidity.

### Required acceptance boundary

Independent review must audit direct-route one-way soundness, whole-Gamma dependency closure, actual/candidate attribution, missing-duty aggregation and resource accounting. Comparison validators are corroboration only. No report establishes runtime payload matching, reversibility, binding/security support or end-to-end readiness; those remain the named downstream owners' acceptance duties.

### P1 accounting implementation

The report publisher reserves a fixed 1 MiB terminal envelope before source I/O, charges its copying/freezing/JSON escape bound to the same request, and checks conservative per-record byte bounds before retaining facts. Exhaustion publishes only already reserved facts plus an unassessed terminal duty; publication cannot restore completion or eligibility. Limits below the publication reservation fail before source work.

Canonical preparation reserves graph nodes before node construction, passes the caller's node limit to the builder, charges text/namespace construction and deterministic sorting, and shares request work with reference resolution. Context indexing additionally counts its admitted nodes; the usage node counter is cumulative preparation/context allocation accounting, not unique canonical component count. Existing loader byte/depth/time and resolver step caps remain additional named safety limits.

## Ordinary component route and constructed correspondence: P1-D02

The additive component route separates source-schema eligibility from operation and runtime admission. It does not change `checked-direct-v1`, `checked-assessment-v1`, legacy defaults or universal research completeness claims. Native finite construction alone remains insufficient: `qualifyComponentSource` requires both a fresh whole-actual construction and separately issued `dated-XSD-2004-components-v1` correspondence. Its result always records `admitted: false`; downstream operation, mapping, artifact and transport owners must still qualify their capabilities before generation or dispatch.

The source fragment admits explicit-namespace imports/includes, nested named/anonymous types, element/attribute declarations and references, attribute/model groups, sequence/choice/all/wildcards, primitive type extension, actual-only complex extension chains, enumeration restrictions and lists. #422 extends this fragment with native-supported string length/whitespace/pattern restrictions, int32 and exact integer/decimal bounds/digits/pattern restrictions, restricted list items and primitive-string atomic unions. Native plans audit inherited, inline and member references throughout the actual source; union `memberTypes` QNames retain namespace aliases and effective member order. Schema annotations are inert to these validation semantics; the native document owner still checks their syntax and IDs. Formation, values, defaults/fixed, occurrence arithmetic, derivation rules, EDC/UPA and aggregate obligations remain native checks, not a second lexical checker in the correspondence gate.

The sufficient route excludes redefine, chameleon namespace adoption, foreign attributes outside annotations, substitution/identity/notation declarations, heterogeneous or list-member unions, wider non-enumeration faceted families, source-level complex/simple-content restrictions, explicit ur-type/contextual datatype references, implicit opaque declaration types and all endpoint-shadowing finite witnesses. Unsupported forms remain correspondence-inconclusive, never dated-schema-invalid. System schema namespaces require their own qualified library interpretation and are excluded here. Runtime support is independently narrower where a projector or transport cannot preserve a legal source feature.

| Correspondence premise | Native authority and additional restriction |
|---|---|
| Original source representation | Authenticated loader snapshot plus the dated 2004 S4S/document owner |
| Whole actual component legality | All actual schema components, source duties and aggregate dependencies checked by native construction |
| Primitive derivation | Existing direct finite-owner closure; no hypothetical component is inferred |
| Actual-only complex extension chains | Existing whole-actual frontier and aggregate owner plus exact ancestry with no restriction after the designated immediate-anyType-base ancestor |
| Nonprimitive derivation | Native finite validity remains meaningful, but does not establish dated TYPE/SCOPE interpretation |
| Hypothetical context inspection | Exact checked contexts retained privately by the finite verifier; context IDs cannot recreate them |
| Endpoint shadowing | Correspondence-inconclusive until component-valued TYPE/SCOPE preservation and recursive closure are proved |

[Structures 5.1](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#layer1) permits component acquisition outside schema documents. That permission does not prove that an endpoint-shadowing native interpretation preserves component-valued TYPE and SCOPE references. Node and RAW property identity alone do not supply that implication. A future nonprimitive route must establish the context-indexed interpretation and recursive closure under the component property tables in [Structures 3](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#concepts) and the [2004 Datatypes definitions](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/). The current route refuses such witnesses; comparison validators never issue eligibility or discharge this proof.

Correspondence and qualification receipts are transient and bound by identity to the exact native construction and loaded input. Copied, foreign or saved representations cannot be consumed as authority. The same caller-owned budget covers source construction, property inspection and publication; explicit exhaustion remains sticky and cancellation remains operational. Ordinary execution acquires no diagnostic work target or watchdog deadline from this route.

The actual-only chain strategy uses the sufficient case described by the note to [cos-ct-extends.1.5](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#cos-ct-extends): no restriction occurs after the first derivation from anyType. It checks the exact designated ancestor and every subsequent complex extension edge in the actual context, without replacing endpoints, modifying primitive flags or issuing candidate correspondence. Simple-base ancestry and intervening restrictions remain unresolved by this rule. The additive component qualifier tries this strategy before finite construction; any remaining finite proof is still correspondence-inconclusive. The existing direct preview does not acquire this strategy.

### Additive local construction boundary

An additive native preparation can propose two fresh complex types while retaining every original component: an extension middle and a restriction representative. The native frontier owner checks both fresh types and every consumed dependency, includes their exact contexts in aggregate discharge and refuses remaining nonprimitive dependencies. Original nodes, scope owners and all raw property maps must retain their original identities. Preparation and property-comparison dependencies are retained; unresolved scalar debts cannot become success.

The separate simple-content property checker compares the representative with the existing native source mapping. Scalar component identity, attributes, wildcard, namespace, abstract, final and block properties must match; the representative has a fresh identity/name and a restriction base. The middle extends the exact designated ancestor with its scalar content and the target's attributes. Comparison uses native component references and namespace algebra; a producer's provenance label supplies no correspondence evidence.

These are authenticated local construction and native property receipts, not dated-XSD eligibility. The remaining implication is whether this fresh representative establishes the original target's in-principle two-step derivation under the dated component interpretation, including the deliberate identity/name difference. No source-qualification or operation/runtime consumer accepts these receipts. The recursive synthetic fixture demonstrates that a dependency back to a nonprimitive actual endpoint remains unresolved rather than being silently assumed.

### Paired simple restriction predicate boundary

The native AU owner can evaluate restriction against an explicit alternative complex base without replacing the target's node or raw properties. It first assesses the base under its actual derivation, then applies restriction arguments only to the root predicate. Existing required/fixed/type/wildcard restriction rules are reused. The construction owner combines this AU predicate with the existing scalar content-derivation kernel for simple content. These receipts describe a predicate, not a change to the target's actual base edge or proof of whole-schema legality.

A separate middle proposal creates only a fresh extension type, with fresh local declarations and uses owned by that middle. Global declarations retain their original references; effective value constraints retain their native lexical contexts. Local declarations carry no declaration value constraint. The native verifier independently checks this fresh-owned scope shape, complete dependencies and aggregate discharge before retaining the original target's paired predicate. No differently named restriction representative is used on this path.

The source-value mapper distinguishes attribute-use syntax from declaration properties under [Structures 3.2.2](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/#declare-attribute). Local source defaults/fixed values map to the use; global declaration constraints remain declared values. Authenticated declaration SOURCE access distinguishes this mapping from explicit raw component values, which remain unchanged. Canonical source records and their lexical evidence are preserved.

The paired path still leaves actual RE01 and the dated interpretation of an alternative derivation unassessed. Its native predicates and fresh-middle closure do not themselves grant source eligibility, generation or runtime admission. A source-level sufficient route must additionally establish the supported component interpretation and the original target's in-principle derivation under cos-ct-extends.1.5, then discharge every actual obligation.

### Simple extension source qualification

The additive component qualifier now supplies a sufficient source route for simple-content extension spines. Every complex edge must extend simple content and terminate at a simple type; the independently computed designated ancestor must be standard `anySimpleType`. A fresh middle independently satisfies extension from that ancestor, owns its local attribute declarations/uses, and passes complete native construction and dependency checks. The original target passes paired restriction clauses 1 through 4 and 5.2 against that middle without replacing original identities, TYPE/SCOPE bindings or stored derivations.

Under the 2004 `cos-ct-extends.1.5` in-principle relation, these premises establish the alternative two-step derivation within the existing ordinary source fragment. Finite component identities are allocated before their unchanged edges are bound. The source owner requires a fresh authenticated whole-source receipt, complete duty coverage, no unresolved scalar or nonprimitive debt, and the existing source/S4S/builtin/property correspondence exclusions. Generated scalar slots and finite proofs that shadow original endpoints remain outside this correspondence route.

This establishes additive schema eligibility only. Operation selection reuses the existing binding/message owner with distinct component-premise and correspondence labels. Structured operation mappings retain native plans under a distinct mapping version. Existing preview mappings/codecs and source capsules refuse these new handles, and the public checked-direct pipeline and legacy defaults retain their current behavior. Policy enforcement, imported artifact reconstruction and runtime admission remain separate prerequisites.

### Component policy, XML and retained metadata boundaries

The additive operation selector can now interpret a closed, single-alternative WS-Policy 1.2 transport-policy fragment with same-document binding references. It preserves HTTPS/client-certificate requirements, algorithm suite, security-header layout and timestamp requirements, while refusing unknown assertions, external/nested references, alternative choice and ambiguous attachments. Requirements are source-bound and explicitly unenforced. The [July 2005 SecurityPolicy](https://specs.xmlsoap.org/ws/2005/07/securitypolicy/ws-securitypolicy.pdf) defaults are Lax layout and no timestamp; omission of the client-certificate attribute remains outside this qualified fragment.

The selector retains May 2006 WS-Addressing `Action` attributes as informational metadata only when no `UsingAddressing` requirement is present. It keeps SOAPAction selection independent, as specified by [the dated WSDL binding](https://www.w3.org/TR/2006/CR-ws-addr-wsdl-20060529/#explicitaction). Required WS-Addressing remains unsupported. Recognizing this metadata grants no endpoint permission or SOAP header behavior.

The component codec has its own version/authority gate and reuses the existing ordered XML parser, native structured matcher, scalar checks and inverse. One iterative XML writer serves both profiles and preserves qualified attributes, text and expanded names; the preview retains its flat mapping gate. Application-item capacity includes attributes, so the component inverse uses the encoded byte capacity rather than conflating application items with XML syntax nodes. Explicit XML node/depth/character-data limits are still checked at their own boundaries.

The SOAP dependency can be prepared from authorized native snapshots through a private, prefilled metadata cache. Each acyclic metadata resource is decoded independently from UTF-8, explicitly declared ISO-8859-1 or BOM-marked UTF-16 LE/BE; ambiguous or unowned import contexts refuse without file or network fallback. Native source bytes remain unchanged, and service/port/binding checks are shared with the preview.

Metadata decoding follows byte marks and XML declarations; HTTP charset headers are not retained as encoding authority, so this boundary adds no general MIME charset negotiation. Disposable private text supplies the SOAP dependency without broadening SOAP response encoding or shipped direct-runtime bootstrap policy. XML encoding and metadata preparation do not establish policy enforcement, actual SOAP execution, artifact compatibility or gateway admission.

The component exchange composes that bootstrap and codec with the existing SOAP adapter. It requires explicit endpoint permission and enforces HTTPS with certificate and hostname verification when required by the source policy. An optional PEM trust anchor is caller configuration, never permission to disable verification. Client-certificate requirements, timestamps, timestamp-specific layouts, supporting tokens and security headers remain outside this transport fragment and refuse before dispatch. Algorithm suites constrain WS-Security cryptographic operations; this fragment performs none and does not reinterpret them as TLS cipher-suite selectors.

Both profiles share explicit service/port/operation dispatch, raw response capture, SOAP protocol checks, native normal/fault validation and connection cleanup. The component profile has no default timeout; caller deadlines and XML capacities are explicit execution controls. Owned HTTPS execution can establish an individual native exchange, but does not issue portable artifact or generated gateway admission. The existing direct preview retains its original loopback HTTP boundary.

### Component source artifacts and generated shapes

The component artifact profile records original resource bytes with relocation-stable resource keys and explicit service/binding/message/operation descriptions. Artifact reading grants no authority. Consumer reconstruction reads the physical root even if an older offline snapshot was supplied, loads dependencies under independent caller permissions, reruns native qualification and mapping, and compares every original byte and selected root. The new profile requires exact resource bytes; the preview's existing revised-byte compatibility policy remains unchanged.

A service batch can reuse one fresh native source/qualification/policy identity while selecting each requested operation separately. Every requested position receives a result, including refusals. A generator may compare an expected artifact against those transient native operation handles; copied/saved reports cannot reconstruct the expected role. Runtime reconstruction continues to read independently authorized physical sources on execution, and the public component entry accepts no diagnostic budget.

The existing client and checked gateway emitters lower authenticated component projections to recursive role-scoped TypeScript and JSON shapes. Attributes, simple content, repeated values and ordered QName/value records retain their native representation. Scalar facets, fixed/default semantics, ordered occurrence correlation and strict wildcard declaration membership remain supplemental native duties; JSON shape completeness is explicitly false. Schema resource identifiers scope recursive references independently of their location in OpenAPI or fault wrappers. Input and response failures carry distinct phases so native input rejection becomes HTTP400 while invalid upstream values remain non-success.

### Explicit native standard-component dependencies

The internal component qualifier can consume explicitly acquired, implementation-owned standard definitions. This follows the component-acquisition provision in dated [Structures section 4.2.3](https://www.w3.org/TR/2004/REC-xmlschema-1-20041028/structures.html#composition-schemaImport). Selecting a library does not qualify application source. Import permissions remain specific to the declaring interpretation, and copied reports or native-handle lookalikes cannot recreate acquisition. Explicit schema-source conflicts and candidate shadowing refuse. The loader's DTD policy and original metadata bytes remain unchanged.

The fixed `w3c-xsd10-schema-element-2004-v1` library supplies the global `xs:schema` element, its anonymous complex type extending `xs:openAttrs`, and that named type's restriction of `xs:anyType`. These are separate component identities, not primitive aliases. Their grammar and instance clauses reuse the existing dated S4S owners. Embedded schema data does not acquire or compile the application declarations that its QName values mention.

Native standard construction issues a context-bound dependency receipt. Application component construction consumes these dependencies explicitly, and aggregate closure authenticates them separately from application graph nodes and builtin datatype dependencies. Semantic particle views retain the external declaration without fabricated source nodes. Existing occurrence, EDC and UPA owners continue checking application particles; standard acquisition does not rescue ambiguous or inconsistent declarations. Other standard names and cross-definition relations remain unavailable unless implemented explicitly.

This is a source-construction capability. It does not extend the checked-direct preview or, by itself, provide a public pipeline option, value projection, portable reconstruction or response mapping. Opaque or companion-record outputs still require the explicit scope, paths, independent source interpretation and completion duties in S02-D08 before gateway admission.

### Explicit buffered companion-record projection

An internal native projection now composes two independently qualified component contracts under `records-with-declared-wrapper-scope`. Configuration supplies exact expanded-name payload and record paths. The current wrapper family is a unit sequence containing fixed standard metadata elements and one strict wildcard boundary. Native content, attribute, occurrence, EDC and UPA owners establish that family; unsupported shapes refuse. The companion path must resolve unique declared slots ending in repeated complex records. Operation names do not supply paths or declaration selection.

The explicit exclusions identify omitted standard schema metadata and the wrapper's declaration universe at the companion boundary. The latter is assessed in the selected companion context, without merging global declarations or claiming whole-response XSD validity in the wrapper universe. Standard metadata still has its required presence/order and fixed instance checks; it does not compile new application schemas. The complete companion payload is retained, including metadata, warnings and errors, rather than reducing responses to a potentially misleading successful record array.

One owned XML observation reuses the existing parser and XML capacities. Wrapper checks, companion value validation and declared outer faults consume actual nodes from that observation. Copied observations, copied projections and foreign roots cannot issue authority. Projected JSON revalidation uses the exact companion's existing inverse, establishing only projected-value validity. This is buffered processing and makes no incremental-delivery or streaming claim. Public configuration, portable artifacts and generated gateway integration remain separate prerequisites.

The component SOAP transport also distinguishes optional response headers under [SOAP 1.1 sections 4.2 through 4.2.3](https://www.w3.org/TR/2000/NOTE-SOAP-20000508/). Qualified blocks without `mustUnderstand`, or with value `0`, may be ignored; returned exchange metadata identifies their names without certifying their application semantics. Unsupported mandatory blocks and actor-directed processing refuse, and invalid SOAP 1.1 boolean syntax or unqualified blocks fail protocol checks. Outgoing header emission and the checked-direct preview retain their existing boundaries.
