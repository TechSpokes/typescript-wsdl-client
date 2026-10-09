# ADR 003: Faithful Content Models and Integration Boundaries

Architecture contracts for S02 and the later content-model implementation. See the root [README](../../README.md).

## Status and authority

Initial draft for independent review, October 9, 2026. Final acceptance requires executed #169/#170 evidence and joint review; this draft activates no production behavior. The [decision register](../content-model-decisions.md) is the single disposition/ownership register.

[Epic #147](https://github.com/TechSpokes/typescript-wsdl-client/issues/147), [S02 #149](https://github.com/TechSpokes/typescript-wsdl-client/issues/149) and #168/#169/#170 supply the acceptance gates. [S01 baseline](../content-model-baseline.md) and [shipped-fix reconciliation](../content-model-shipped-fix.md) are evidence, including BCsabaEngine's separately attributed production report. Their [manifest](../../test/conformance/semantic-baseline.json) remains authoritative for case IDs and expected outcomes.

These contracts define the intended `xsd10-faithful-v1` profile, not the shipped support matrix. Implementation tasks must add independent fixtures before claiming each supported constraint. A missing implementation is an implementation gate, not permission to silently drop a rule.

## Input and canonical graph: S02-D01

Preserve ordered element/text syntax, expanded names, every element's in-scope namespaces, source URI, line/column and source digest before compiling. The syntax adapter belongs to #171; controlled resolution belongs to #172. DTDs, external entities and payload-driven schema fetching are forbidden.

Resolve relative references against the declaring document's absolute URI. Initially support local files and HTTP(S) through an explicit allow policy; reject other schemes. A user-authorized root does not authorize arbitrary imports: local imports stay within configured roots, and remote redirects and every import are rechecked against host/scheme policy.

Cache fetched bytes by canonical absolute retrieval URI and digest. Cache schema interpretation separately by `(resource digest, effective target namespace, include/import context)`; a chameleon include interpreted in two namespaces produces two contexts. Preserve cycle edges, fetch once per resource, and diagnose unresolved declarations after traversal rather than substituting empty types. #172 must define URI normalization without collapsing distinct query strings or filesystem identities.

The immutable graph (#173/#174) contains separate element/type/attribute/group declarations, particle nodes, local occurrence bounds, structured references, derivation edges, namespace constraints, source provenance and operation bindings. Symbol identity is `(namespace URI, local name, symbol role)`; anonymous identities use stable source-relative paths. Prefixes and generated TypeScript names are not identity.

Finite bounds use exact integers; persisted finite bounds are decimal strings and unbounded is a distinct token. Zero annihilates descendant bounds, including an unbounded descendant. #178 calculates summaries; #180 matches complete particle languages, including gaps, correlation and order. A min/max interval is never a complete validator.

References retain their roles and identities; recursion remains a reference. #175/#176 resolve references and derive extension by composition and restriction by checked language/attribute constraints. #179 rejects illegal schemas, including UPA violations and illegal `all` particles, before planning projections.

## Runtime values and projections: S02-D02

The graph describes allowed values; an XML value describes one value. #187 owns ordered XML values/events, with expanded element/attribute names, ordered children/text, namespace context for QName lexical values, nil state and scalar lexical/value context. Comments, processing instructions, prefix spelling, attribute order, entity spellings and transport chunk boundaries are outside fidelity; significant mixed text and child order are inside it.

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

Target schema-defined XML values, not byte identity. `normalizeXml` compares expanded names, allowed attributes, meaningful ordered content, nil and type-specific scalar value meaning under the operation's resolved schema context. Only element-only insignificant whitespace is discarded; mixed-content whitespace remains. QName prefix changes are equivalent only when they resolve to the same expanded name.

`normalizeValue` returns a fresh value without mutating caller objects. It chooses the projection's documented canonical representative of invisible grouping, empty realizations and scalar lexical equivalence. It must preserve observable order and multiplicity; it cannot turn invalid branches into valid ones.

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
| Scalar lexical form | Valid decimal `+01.00` maps to value `1`; original caller text stays untouched |
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
| String family / whitespace | Unicode string; preserve/replace/collapse in a new scalar | #184/#188/#189/#198 | #184 whitespace and Unicode-length fixtures |
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
| Union | Declaration-order member assessment; retain selected type and canonical value | #179/#184; #183 tagged mapping; never infer from JS coercion | #184 overlapping lexical/member-order fixtures |

`anySimpleType` accepts lexical text with no invented constraints. `anyType` is an explicit opaque scope, not a validated concrete structure. NOTATION, ID/IDREF document identity, keys/keyrefs/unique, substitution-group and dynamic `xsi:type` polymorphism, `redefine`, attachments/MTOM and XSD 1.1 assertions/open content are excluded with `unsupported-capability`. #179 owns diagnosis; legacy behavior remains routed by S02-D10.

Supported pattern planning initially admits only an evidenced equivalent subset; it must diagnose every other construct rather than copy arbitrary XSD regex into JSON Schema. List/union of supported members are in scope; members using excluded constraints make the reachable type unsupported. New scalar families cannot be marked verified from a profile label or a serializer test alone.

### Scalar pipeline

XML lexical assessment (#187/#189) retains lexical text and namespace context, then #184 validates/converts according to the type plan. #188 validates application values before encoding. #198 validates HTTP representation before explicit conversion; #199/#200 call the same scalar/particle owners for request and response semantics.

Diagnostic paths include operation, type/particle ID, expanded name, source location and instance path where available; values and credential-bearing headers are not copied into errors. `invalid-schema`, `invalid-value`, `unsupported-capability`, `resource-limit`, `incompatible-artifact`, `transport`, `soap-fault` and `cancelled` are distinct categories. #179/#180/#184 own semantic detail; adapters attach I/O context without changing categories.

## Portable contracts and dialects: S02-D05 / S02-D06

#182 owns the client projection; #183 owns HTTP JSON projection; #184 owns scalar rules. Type references remain structured until a backend resolves deterministic names. Exact integers/decimals use decimal strings in HTTP JSON, QName uses expanded names, binary uses canonical encoded text and nonfinite floats use explicit tagged/string representations. Client mappings may use exact runtime scalar types; those types never leak through JSON.stringify accidentally.

#185/#186 persist one data-only portable bundle: format/model/profile versions, graph/source digests, projection and codec plans, binding selection, declared capabilities, limits, validation/completion scope and fingerprint. Proposed first format is `catalogFormat:2`, `bundleFormat:1`, `model:"xsd10-faithful-v1"`; these are independent of npm version. No generated-source parsing or OpenAPI reconstruction creates missing XML structure.

Fingerprint SHA-256 covers a deterministic semantic serialization of graph, selected projections, profile, binding/capabilities and scope. Exclude timestamps, machine paths and documentation from semantic identity; include source digests separately for provenance. Consumers negotiate exact format major/model/profile and supported required capabilities, and compare the same bundle fingerprint before dispatch. Unknown mandatory fields/capabilities fail closed; optional annotations can be ignored within a supported format.

OpenAPI 3.1.1 / its 2020-12-based schema dialect is the documentation target. Runtime JSON Schema and serializer schemas are separately emitted lowerings; they do not consume arbitrary OpenAPI schemas. Initial candidate runtime/serializer dialect is draft-07 with a route-scoped non-mutating Ajv compiler and independent shared semantic validation. #170 must prove closure, recursion, nullable boundaries, facets and data-preserving fallback before this choice is final.

JSON Schema constrains JSON representations; XSD regex, QName scope, exact decimal facets and complete particle languages require supplemental #184/#180 checks where the lowering is incomplete. Each plan declares completeness and supplemental requirements. The serializer is never a validator. #197 emits dialect-specific plans; #198 supplies validators; #199/#200 integrate validation and explicit conversion independently from serialization.

## SOAP adapters and security ordering: S02-D07

Retain ADR-002's dedicated streaming transport as the candidate; #169 must execute the current buffered and streaming paths before final adoption. #190 owns buffered integration and #192 owns shared request encoding plus streamed decoder integration. One #188 encoder produces ordered body content for both; transports own envelopes, namespace bindings, SOAP version/action/headers, endpoint selection and I/O, without a second particle/scalar engine.

The buffered adapter can use node-soap's documented raw XML request hook and raw response before name-keyed parsing if #169 proves it preserves relevant binding/security behavior. Name-keyed parsed objects alone cannot carry `a,b,a` order. Streaming supplies namespace-aware ordered events from the body to #189's decoder.

Select an operation's declared binding/version/port explicitly, not the first service port. Dispatch checks endpoint overrides, actions, HTTP/SOAP headers, faults, auth/security, cancellation and capabilities against the bundle. Unsupported/unverified combinations fail before sending; never silently omit credentials or signatures. #169's matrix must distinguish executed success/failure from source inspection and upstream documentation.

Validate/encode application input, build the envelope, then apply security-sensitive signatures to the final envelope before dispatch. Incoming signature/security verification precedes semantic normalization; preserve required raw bytes at that boundary. Changing prefixes, text or grouping after signing can invalidate signatures. No XML-value equivalence contract promises a byte-preserving signed round trip.

HTTP Basic/header auth, WS-Security, TLS client certificates, SOAP 1.2 and cancellation are separate capabilities. Preserve the legacy buffered capability surface through its legacy adapter. Only combinations executed by #169 may count as verified on the proposed faithful path; isolated later capability qualification can block #190/#192 without changing graph/value contracts, provided the required base transport feasibility is established.

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

## Compatibility and activation: S02-D10

Preserve the current legacy default for the 1.x line. Faithful behavior is explicit opt-in when its consumers and qualification gates exist; a default public-shape switch requires the next major release (2.0.0), integrated S17/S18 evidence and a separately approved activation PR. S02 merges docs/probes only; it neither announces a new release nor changes the default.

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

Names derive deterministically from symbol identities with stable namespace collision suffixes and source-relative anonymous paths. Keep legacy names on the legacy route; faithful mode may introduce new names/shapes explicitly. #195 owns name mapping and collision fixtures; a documentation edit or digest change cannot randomly rename symbols. Flattened information is never reconstructed by assertion. #204 qualifies integrated migration; #205 removes duplicate semantic ownership only after compatibility coverage.

## Rejected alternatives: S02-D11

Bounds-only patches cannot enforce count gaps, order or correlations. Universal property flattening loses branch/interleaving context. Raw parse-tree DTOs confuse schema syntax with application values and expose parser-specific prefixes/history.

One schema for all backends conflates XML semantics, HTTP representation, OpenAPI vocabulary and serializer support. A second schema/validation engine duplicates scalar/particle authority; target lowerings and supplemental checks consume one owned core. Raw fetch replacement without a binding/security capability gate can bypass authentication, headers or signatures. Removing dedicated streaming would restore full-response buffering without incremental evidence.

## Evidence and final gate

S01 executes the finite manifest and real occurrence transport harness, not these new faithful contracts. #169 must commit local HTTP assertions for both actual paths, raw/ordered seams, invisible boundaries, namespaces/nil, streaming-before-EOF and capabilities. #170 must compare submitted, validator-visible, returned and byte-serialized values, preserving a host control route.

Final #168/#149 acceptance requires both reviewed probes, reconciled register entries, reviewed delivery revisions, local aggregate CI, hosted Node 24/26 and merged-main checks. Any unresolved graph, projection, bundle/runtime, required base transport or compatibility choice blocks S03. Later isolated capability qualification has an explicit affected consumer and cannot count as verified support.

## Primary references

- [XSD 1.0 structures, second edition](https://www.w3.org/TR/xmlschema-1/)
- [XSD 1.0 datatypes, second edition](https://www.w3.org/TR/xmlschema-2/)
- [Namespaces in XML 1.0, third edition](https://www.w3.org/TR/xml-names/)
- [OpenAPI 3.1.1](https://spec.openapis.org/oas/v3.1.1.html)
- [ADR-002](002-streamable-responses.md): current dedicated streaming decision and shipped behavior
