# Ordered Schema Loading

Internal S03 input contracts for the unreleased faithful compiler. See the root [README](../README.md).

## Ownership and compatibility

[ADR-003 D01/D04/D09](decisions/003-content-model-contracts.md) owns the input, profile and budget decisions.
The [decision register](content-model-decisions.md) assigns the later semantic consumers.
The [ordered syntax adapter](../src/loader/orderedSyntax.ts) implements #171; [contextual traversal](../src/loader/schemaInput.ts) and [resource I/O](../src/loader/schemaResources.ts) implement #172.

This internal adapter is not exported from the package entry point or activated by the CLI.
The existing [WSDL loader](../src/loader/wsdlLoader.ts) remains the legacy default while #174 owns later routing.
Parsing XML syntax does not certify XSD legality, resolve declarations, or establish payload validity.

## Syntax and provenance contract

`parseOrderedSyntax(bytes, absoluteUri, {maxDepth})` returns an immutable `SyntaxDocument` with `root`, full `uri` and SHA-256 `digest` of original bytes.
`SyntaxElement.children` retains text and element order across every compositor kind; no name-keyed grouping occurs.
Annotations, occurrence strings, declaration form settings and lexical attribute values remain available for their later owners.

Each element retains its expanded `name`, `lexicalName`, ordinary attributes, all in-scope `namespaces`, effective `baseUri` and `source`.
Namespace declarations populate context rather than ordinary attributes.
Default namespaces apply to element names; unprefixed attribute names have an empty namespace.

`resolveLexicalQName(value, element)` resolves QName-valued attributes or text in the declaring element's namespace context, including the default binding.
It rejects malformed lexical names and unbound prefixes, without echoing lexical values in diagnostics.
`syntaxElements` filters direct element children by expanded name while retaining order; `syntaxAttribute` retrieves an expanded attribute name.

`source` contains full document URI, digest, stable source-relative syntax path and start/end positions.
Lines and columns are one-based; offsets are zero-based UTF-16 positions in decoded XML and end offsets are exclusive.
Syntax paths distinguish local declarations in different containing types; they are not global symbol identities.
S04 owns global `(namespace, local, role)` identities and containing-declaration identities for locals.

`baseUri` begins at the supplied final retrieval URI and inherits each `xml:base` through URL-reference resolution.
For a document at `https://example.test/contracts/root.xsd`, `xml:base="../types/"` gives `https://example.test/types/`.
The syntax adapter computes this context without performing I/O; #172 must authorize each resolved fetch.

## Syntax limits and diagnostics

The default nesting budget is 256 elements, inclusive, checked before accepting the next element.
`SchemaLoadingError` distinguishes `invalid-schema`, `unsupported-capability`, `resource-limit` and `transport`; syntax errors carry source context.
The adapter rejects DTDs, entity declarations and unresolved entity references, while accepting XML's predefined and numeric character references.

UTF-8 and BOM-marked UTF-16 are decoded strictly; unsupported declared encodings fail explicitly.
Comments and processing instructions are outside XML-value fidelity and omitted; CDATA retains its text.
The parser dependency is confined to this module; consumers receive repository-owned types.

## Controlled resolution contract

`loadSchemaInput(source, {policy, limits, offlineResources})` creates one compilation-scoped snapshot.
It accepts local paths, absolute file/HTTP(S) URIs, XSD roots and WSDL 1.1 definitions, including WSDL imports and inline schemas.
It returns immutable documents, contextual schemas, resource metadata, explicit resolution edges, limits and I/O metrics.

Traversal uses only expanded XSD include/import children and WSDL imports in their declaring syntax context.
Payload roots fail with `unsupported-capability`; `xsi:schemaLocation` and annotation content never initiate resolution.
Includes adopt the containing namespace only when the included schema has no target namespace; explicit namespace mismatches fail.
Imports preserve their declared namespace and check it against the retrieved schema.

An import without a schema location remains an unresolved edge for S05; it never guesses a network endpoint from its namespace.
Include without a location fails as invalid input.
Cycle edges remain in the result and stop active expansion; unresolved declaration diagnostics belong to S05 after traversal.

`SchemaInterpretation` exposes `syntax`, `documentUri`, `digest`, `baseUri`, `targetNamespace`, `context` and `key`.
The context records root/inline/include/import kind and the namespace requested by that relationship.
Its key is a deterministic tuple of digest, final document URI, effective base URI, effective target namespace, context kind/namespace and syntax path.
The path distinguishes multiple inline schemas in the same document even when they share a namespace.

For example, `common.xsd` without a target namespace included from `urn:a` and `urn:b` has one fetched resource and two interpretations.
Both interpretations share immutable syntax; S04 reads their effective namespaces without changing lexical QName scope or mutating declarations.
Identical bytes at `/base-a/common.xsd` and `/base-b/common.xsd` keep distinct interpretations because `child.xsd` resolves differently.

The raw byte cache uses `(canonical final retrieval URI, SHA-256 digest)` and request/redirect aliases.
Fetches and traversal are serialized within a compilation; each successful final resource is fetched once.
The interpretation cache is separate and never keyed by digest alone.

## URI and security policy

`policy.fileRoots` authorizes local roots; `policy.allowedOrigins` authorizes exact HTTP(S) origins, including scheme and port.
Both lists default to empty. No input root grants implicit import permission.
Every import and redirect is rechecked, including the result of inherited `xml:base`.

HTTP redirects are manual and policy-checked before the next request; an HTTP redirect cannot select a file.
The final checked URI becomes document identity and the initial base for syntax.
Origin policy authorizes the destination explicitly, including any caller-approved private destination; it does not inherit application transport credentials.

URL normalization removes fragments, resolves dot segments and normalizes host/default-port spelling while preserving queries.
Local paths become absolute file URIs; filesystem identity uses `realpath`, with traversal and symlink checks against configured roots.
File queries and remote file authorities, other schemes and URLs containing user/password credentials fail explicitly.

Full source URIs are internal provenance, not semantic fingerprints or publishable artifact fields.
Callers must use credential-free source URLs and trusted, stable authorized filesystem roots; S04/#174 owns artifact-safe provenance serialization.
Transport errors omit upstream response text and credential-bearing error strings; referencing-node source locations remain available.

An optional offline map contains canonical URIs and pinned `{bytes, digest}` records.
Every offline resource still passes policy, size and digest checks; a missing record fails without network fallback.
Resource metadata exposes full final URI, digest and decompressed byte length, with no raw bytes in the returned input snapshot.

## Loading budgets

The provisional defaults from ADR-003 are implemented before downstream graph construction.
Positive safe-integer overrides permit explicit caller increases or lower limits; redirects may be zero.

| Budget | Inclusive default | Outcome beyond limit |
|---|---|---|
| Distinct final resources | 128 | `resource-limit` before next fetch |
| Decompressed resource bytes | 8 MiB | `resource-limit` before parse |
| Aggregate decompressed bytes | 64 MiB | `resource-limit` before parse |
| Active resolution chain | 32 edges | `resource-limit`, including cached subtrees |
| Redirects per fetch | 5 | `resource-limit` before sixth destination |
| Resource I/O | 15,000 ms | `transport`, abort/cancel input |
| Total compilation I/O | 120,000 ms | `transport`, abort/cancel input |
| XML element nesting | 256 | `resource-limit` in syntax adapter |

HTTP response bodies and files are read incrementally; decompressed chunks count against both byte budgets.
The deadline covers fetching, redirects and body reads; parsing is outside the I/O clock.
The total counts serial resource I/O, with monotonic timing and the remaining total budget constraining each fetch.
No rejected load returns a partial schema model.

## Evidence and reproduction

[Ordered syntax tests](../test/unit/ordered-syntax.test.ts) reuse independently qualified S01 compositor and S02 ordered SOAP inputs.
[Syntax fixtures](../test/conformance/fixtures/xsd/syntax/ordered-namespaces.xsd) and their [default-namespace equivalent](../test/conformance/fixtures/xsd/syntax/default-namespaces.xsd) exercise interleaving, annotations, rebinding, lexical QNames and distinct local paths.
These syntax fixtures establish input preservation; later graph/profile tasks own semantic schema assessment.

```bash
npx vitest run test/unit/ordered-syntax.test.ts --reporter=verbose
npx tsc -p test/unit/tsconfig.json
npx vitest run test/unit/schema-input.test.ts test/unit/schema-loading-budgets.test.ts test/integration/schema-resource-http.test.ts
npm run ci
```

Depth 256 succeeds and depth 257 fails with `resource-limit`; lower configured limits and malformed XML fail explicitly.
Tests also preserve the legacy relative-import fixture and validate source locations/digests and strict byte decoding.
Exact reviewed commits, executed aggregate results and measured limits are recorded in #150's final S03 handoff.

[Context fixtures](../test/conformance/fixtures/xsd/resolution/chameleon.wsdl) add chameleon/repeated includes, identical-byte bases, relative chains and cycles.
[Context tests](../test/unit/schema-input.test.ts) add offline digests, namespace mismatch, URI policy, query identity, symlink/traversal rejection, WSDL imports and payload hints.
[Live HTTP evidence](../test/integration/schema-resource-http.test.ts) checks final retrieval/base resolution and actual gzip decompression.

[Budget tests](../test/unit/schema-loading-budgets.test.ts) run 128/129 resources, 8 MiB/8 MiB+1, 64 MiB/64 MiB+1, 32/33 edges, 5/6 redirects and 256/257 syntax depth.
Per-resource 15,000/15,001 ms and total 120,000/120,001 ms use controlled monotonic clocks, with stalled-body cancellation also checked.
They write observed outcomes and elapsed times to ignored `tmp/conformance/schema-loading/measurements.json`.
These boundary measurements do not qualify production network latency, private vendors, Windows filesystem behavior or general supported maxima; #208 owns later qualification.

## S04 continuation inputs

#171 was independently reviewed at `3bb3cd656b1c0d15906d55262a22776c78964984` and merged normally through PR #225 as `11f635072ee0999cd5f904c58cae90b476b064ff`.
#172 starts from that merge and consumes its exact syntax contract.
The final #150 acceptance record pins both reviewed heads, merge revisions, full repository checks and merged-main checks.

S04 #173 reads `SchemaInput.schemas` and the immutable ordered syntax, preserving interpretation context in global and local identities.
#174 serializes artifact-safe provenance separately from semantic fingerprints and implements catalog routing.
S05 resolves declaration/reference semantics from the recorded edges; S03 does not create canonical graph nodes, projections or codecs.
