# Semantic Catalog Format 2

Internal S04 persistence and compatibility boundaries for the unreleased faithful compiler. See the root [README](../README.md).

## Versions and entry points

[ADR-003 D04/D09/D10](decisions/003-content-model-contracts.md) and the [decision register](content-model-decisions.md) own profile, budgets and compatibility.
[The graph contract](content-model-graph.md) remains authoritative; a compatibility view is always derived.
[Catalog entry points](../src/compiler/semanticCatalog.ts) are internal modules, outside the package entry point.

`SemanticCatalog` contains `catalogFormat: 2`, `model: "xsd10-faithful-v1"`, `profile: "xsd10-faithful-v1"`, `graph` and `semanticFingerprint`.
`createSemanticCatalog(graph, limits?)` creates an immutable portable snapshot.
`serializeSemanticCatalog(catalog, limits?)` emits canonical JSON and one trailing newline.
`readCatalog(text, {mode?, maxBytes?, maxDepth?, maxNodes?})` returns a discriminated legacy, semantic or regeneration-required result.
`readCatalogFile(file, options)` applies the same boundary through a bounded regular-file read and strict UTF-8 decoding.
`readLegacyCatalogFile` is the explicit adapter used by existing CLI, OpenAPI, gateway, app, generated-test and companion-catalog readers.

No new faithful CLI flag, public export or emitter is activated.
Source compilation through `prepareCompilationInput` defaults to the existing legacy loader/compiler and preserves legacy names/options.
An explicit internal `mode: "faithful"` builds only the ordered graph/catalog through [S03 loading](content-model-loading.md), with caller-authorized policy.
It does not certify support or produce the later portable bundle.

## Canonical persistence and validation

Object keys use ECMAScript UTF-16 code-unit ordering and compact JSON encoding.
Node/global display tables sort by ID; origin tables sort by their canonical representation.
Particle children, union members, facets, attributes, ordered syntax and WSDL reference arrays retain their declaration order.
The reader normalizes display tables, so accepted permutations serialize identically.

Global IDs are compact JSON tuples from the graph contract.
Scoped IDs hash UTF-8 bytes of compact `JSON.stringify([owner, path, role])`, with JSON string escaping and no whitespace.
For `owner = "parent"`, `path = "/0/1"`, `role = "type"`, the input bytes encode `["parent","/0/1","type"]` and the ID is `scoped:f325bc3d3205fbca17c95034c3a1093ed14ce66b9db6347931ad6890c026f65f`.
The explicit identity tuple remains serialized for verification by another language.

Finite bounds remain exact canonical unsigned decimal strings; `unbounded` is a distinct maximum.
Every discriminant, required field, node identity, index, reference role/target, QName namespace context and structural ownership is checked before returning an immutable catalog.
Scoped structural use sites have one parent; semantic references can share declarations and recurse.
Containment/ownership cycles, malformed bounds, nested all, illegal all children, empty unions, unknown mandatory fields and duplicate JSON keys fail explicitly.
WSDL reference indexes must agree with the ordered declaring syntax, lexical scope and source context.
Validation of complete derivation/reference visibility, facet legality, UPA and supported capabilities remains with S05/S06.

## Provenance and fingerprints

Internal graph retrieval URIs never become global or scoped identity.
Portable source locations retain digest, source path and exact start/end positions with `urn:source:sha256:<original-byte-digest>`.
Inherited bases and loading-reference URIs use `urn:base:sha256:<digest>` tokens.
Same-resource bases hash source digest, document-relative placement and an optional query digest; relocating the complete fixture tree does not change catalog bytes.
Interpretation tuples retain namespace/adoption/resolution distinctions using portable source/base tokens, independently of symbol identity.
The reader rejects raw retrieval provenance rather than silently redacting an input artifact.

Retrieval attributes such as `xml:base`, schema locations and documentation source URIs become digest tokens.
Binding endpoint addresses remain ordered semantic syntax; credential-bearing URI userinfo and recognizable secret query parameters on binding addresses are rejected.
Credentials belong to external runtime configuration.
No serialization can infer secrets embedded in arbitrary schema text: input annotations/lexical values must be suitable for the intended artifact audience.

The SHA-256 semantic fingerprint excludes source digests/locations, retrieval bases, loading policy/edges, origin tables, documentation and annotations.
Reference fingerprints use expanded role-qualified names, rather than prefix spelling, while the artifact preserves original lexical QName context for validation and later interpretation.
Fingerprint-only scoped IDs follow ordered structural containment; serialized source-relative identities and WSDL syntax paths remain unchanged.
This keeps inserted documentation and element-only formatting whitespace out of semantic identity without changing semantic child order.
Remaining scalar/facet/default/fixed lexical values and namespace context participate conservatively; S04 does not assert datatype equivalence.
The fingerprint detects semantic mismatch, not authenticity or provenance tampering; this is not the later bundle fingerprint combining projections/binding/capabilities/scope.
#185/#186 own bundle format 1 and integrated compatibility checks.

## Early compatibility matrix

| Input / selected mode | S04 behavior |
|---|---|
| Legacy unversioned catalog / legacy | Explicit legacy adapter; retain existing metadata, names and options |
| Legacy catalog / faithful | Regeneration-required, category `incompatible-artifact`, original source required |
| Original WSDL / legacy | Existing loader/compiler; default unchanged |
| Original WSDL/XSD / internal faithful | Controlled ordered loader, immutable graph and format 2 catalog only |
| Format 2 catalog / internal faithful | Typed validation, exact version/model/profile and fingerprint check |
| Format 2 catalog / legacy consumer | Reject `incompatible-artifact`; regenerate matched legacy artifacts from original source |
| Unknown format/model/profile, versioned bundle at catalog boundary | Reject explicitly; no fallback to the flattened reader |
| Mixed generated artifacts or faithful OpenAPI-only gateway | Deferred to #185/#186/#195/#196/#201; require the original source and portable bundle |

The legacy reader checks the historical envelope and named table entries without inventing missing ordered structure or renaming metadata.
Its compatibility boundary is not a new complete validator for every historical compiler field.
The regeneration result supplies the internal source-compilation call, with placeholders for the original source and authorized roots.
For example, import `prepareCompilationInput` in a repository development program and call:

```typescript
await prepareCompilationInput(
  {kind: "source", source: originalSource},
  {mode: "faithful", loading: {policy: {fileRoots: authorizedRoots}}},
);
```

The shipped `wsdl-tsc compile` command still emits the legacy catalog.
There is no supported faithful generation command during S04.
The architecture release train remains 2.0.0, with integrated S17/S18 evidence and separately approved default activation.

## Limits, evidence and downstream readiness

The catalog boundary defaults to 64 MiB of UTF-8 JSON, 100,000 graph nodes and JSON nesting depth 1,024, inclusive.
Byte/node overrides require positive safe integers; nesting can be lowered but cannot exceed the reader safety ceiling.
Configured byte boundaries, multibyte input, node rejection, 1,024/1,025 nesting, corrupt UTF-8 and Linux FIFO rejection have executable tests.
The full default 64 MiB catalog boundary and Windows special-file behavior are not platform-qualified by these tests.
S03 loading limits, denial defaults and conservative cyclic-depth behavior are consumed unchanged.
Later scalar/projection/codec budgets retain their [assigned owners](content-model-decisions.md).

[Catalog tests](../test/unit/semantic-catalog.test.ts) reuse independent graph, chameleon and SOAP fixtures and cover relocation, lexical facets, large bounds, recursion, corrupt artifacts and consumer rejection.
[Independent graph schema evidence](../test/conformance/reference/graph_contract_test.py) retains the documented xmlschema/libxml2 large-bound distinction.

```bash
npx vitest run test/unit/semantic-catalog.test.ts test/unit/canonical-graph.test.ts
npx tsc -p test/unit/tsconfig.json
npm run ci
npm run test:reference:full
```

#151's final handoff pins reviewed heads, merge revisions, versions, fixtures, exact commands/results and S05 readiness.
#175 resolves references, #176 implements derivation/attribute composition, and #177 integrates companion closures and diagnostics.
#178 owns later occurrence summaries.
S02's open streaming/incoming-security qualifications and S01's #181-owned oracle disagreement remain downstream gates.
Production codecs, projections, emitter rewrites, package publication and default activation remain outside S04.
