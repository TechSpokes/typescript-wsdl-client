# Structural Companion Catalogs

Internal S05 reuse over the [canonical graph](content-model-graph.md), [typed reader](content-model-catalog.md), [reference resolution](content-model-resolution.md) and [composition](content-model-composition.md). See the root [README](../README.md).

## Reader and common semantic result

`prepareResolvedCompilationInput(input, options)` is the internal faithful counterpart exposed from [`semanticCatalog.ts`](../src/compiler/semanticCatalog.ts) and [`shapeResolver.ts`](../src/compiler/shapeResolver.ts).
It accepts original source, catalog text or a catalog file, plus companion requests containing input and explicit global `NodeId` roots.
Source loading requires the same explicit policy as S03; file/text inputs pass through the bounded S04 reader.
An unused companion with no roots is never read or loaded.

The result contains one `SemanticCatalog`, its `ResolvedGraph`, its `ComposedGraph`, and copy/deduplication evidence.
Resolution and composition consume the same persisted declared graph after reuse.
The union refreshes typed symbol-target links immutably before catalog validation; missing definitions supplied in either direction become ordinary resolved references.
No catalog-specific derived representation feeds downstream consumers.

Catalog format remains 2 and model/profile remain `xsd10-faithful-v1`.
Derived views and merge metrics are recomputed, not persisted.
Flattened legacy input returns the existing `regeneration-required` result with `requiredInput: "original-source"`; no structural semantics are inferred from TypeScript expressions.
Unknown versions/models/profiles and corrupt catalogs retain existing reader diagnostics.

Public `applyShapeCatalogs` and the CLI continue to use the legacy default adapter.
The new internal entry does not activate faithful generation, projections, codecs or streaming transport.

## Required closure and provenance

`mergeStructuralCompanions(primary, companions, limits)` walks typed containment and reference slots from each requested global root.
The visited set terminates self/mutual element-type recursion while retaining complete definitions.
Groups, attribute groups, derivation bases, anonymous types and scalar/list/union references participate in the same closure.
An unavailable imported definition may be supplied by the primary graph; the common resolver still verifies every use's original import visibility.
Requested companion pools are indexed before traversal; required dependencies can be supplied by another pool regardless of request order.
Unrelated operation/type nodes and their node-local unsupported constraints are not copied.

Namespace, local name and symbol role define global identity.
Loading interpretations never create extra global identities, and scoped declarations remain owned by their original containing components.
No public symbol is renamed to make a collision disappear.

Equal scoped definitions at normalized containment positions retain the primary declaration IDs and merge all corresponding origins.
New definitions retain their original scoped IDs.
Required schema-level retained syntax, annotations and import/include provenance accompany selected interpretations; source paths and digests remain available for diagnostics and assessment.
The merged graph retains the primary loading-limit record; each companion was independently read/loaded under its own input limits, and reuse applies a separate semantic work budget.

## Actual structural equality

Equality compares normalized structural data from each global declaration and its owned local closure, using the shared [`semanticGraphRepresentation`](../src/compiler/catalogProvenance.ts).
The full normalized structures must match; a matching fingerprint alone never establishes equality.
Every reachable global dependency is independently copied or compared, including recursive dependencies.

The comparison includes expanded namespace/role identity, ordered particles and compositors, exact occurrences, typed references, derivation kind/base/local content, scalar variety/facets, attribute use/value constraints, wildcard namespace/processing and retained unassessed syntax.
It excludes retrieval locations, source digests, documentation and optional stored symbol-target hints.
Scope positions normalize documentation-induced source-path shifts; lexical value contexts remain intact.

This is conservative declared-structure equality, not a scalar value-equivalence or particle-language proof.
Different lexical constraints or namespace contexts can require source reconciliation even when later assessment might prove them equivalent.
It does not flatten inline content and group references into a claimed equivalence.
The existing format-2 fingerprint algorithm remains unchanged; companion comparison separately ignores stored target-hint availability.

Meaningful collisions throw `SemanticError` with category `invalid-schema`, the global component, the companion source and the existing source in `related`.
The message asks for reconciliation of original declarations.
Required missing references, forbidden cycles and import visibility failures flow through the common resolver.
Unsupported retained constraints remain visible for #179; successful reuse does not certify their legality or capability.

## Resource and support evidence

Closure indexing/traversal, structural normalization and provenance copying consume bounded work.
Normalization input and copied strings are counted before serialization; copied graph size is checked while adding definitions.
Dynamic object keys, including namespace prefixes, count as copied strings.
Defaults remain 100,000 nodes and 1,000,000 steps, with positive safe-integer overrides.
Exhaustion returns `resource-limit` without modifying any input or returning a partial result.
Input gathering bounds aggregate retained nodes and structural data before retaining each additional read, including redundant definitions.
Gathering, merge, resolution and composition each apply that configured budget independently.
S03's conservative cyclic-depth loading behavior remains unchanged.

[Integration tests](../test/integration/structural-companions.test.ts) cover reader/source/file dispatch, recursive required closures, differing bounds, namespace/role collisions, chameleon and anonymous owners, source-path deduplication, missing references/cycles, structural collisions, legacy regeneration and catalog round trips.
The [public characterization fixture](../test/conformance/fixtures/xsd/composition/derivation-boundaries.wsdl) is qualified for schema/payload behavior by both pinned reference engines.
Its executable [registry row](../test/conformance/registry.ts) records legacy group omission, appended restriction content, ineffective prohibitions and named recursive references.
[Supported patterns](supported-patterns.md) distinguishes this public characterization from internal faithful evidence.

```bash
npx tsc -p test/unit/tsconfig.json
npx tsc -p test/integration/tsconfig.json
npx tsc -p test/conformance/tsconfig.json
npx vitest run test/integration/structural-companions.test.ts
npm run test:conformance
npm run test:reference:full
npm run ci
```

#178 owns occurrence summaries/emptiness, #179 owns complete legality and reachable capability assessment, and #184 owns payload scalar enforcement.
The documented oracle disagreements and S02 platform/security qualifications still apply.
