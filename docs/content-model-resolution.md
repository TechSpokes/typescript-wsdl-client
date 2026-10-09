# Canonical Reference Resolution

Internal S05 reference contracts for the unreleased faithful compiler. See the root [README](../README.md).

## Boundary and ownership

[The canonical graph](content-model-graph.md) remains the sole declaration model.
[`resolveCanonicalGraph`](../src/compiler/resolveCanonicalGraph.ts) returns a frozen `ResolvedGraph {graph, links, metrics}`.
Each link identifies its declaring node, typed field path, original reference and resolved target; builtin types have no graph target.

Resolution performs no I/O and does not expand definitions, overwrite occurrences or parse generated TypeScript.
[`referenceSlots` and `containedNodes`](../src/compiler/graphTraversal.ts) describe typed graph edges for resolution and companion closure traversal.
`referenceTarget` checks role-qualified symbol identity against complete definitions rather than trusting an existing target link.

S05.2 consumes this reviewed boundary for derivation composition; S05.3 integrates structural companions.
S06 owns occurrence summaries, emptiness, complete schema legality and reachable capabilities.
Payload scalar enforcement remains #184's responsibility under [ADR-003](decisions/003-content-model-contracts.md).

## Visibility and identity

Global lookup uses namespace, local name and symbol role; local references retain their containing declaration identity.
The same element/type/attribute spelling occupies different symbol spaces.
Named and anonymous types remain complete definitions, including self and mutual recursion through element content.

A schema reference can use its effective target namespace, XSD builtin types, or a namespace explicitly imported by its declaring interpretation.
An including schema's imports do not authorize references in an included document, and transitive imports do not authorize another namespace.
Every origin of a shared declaration must supply the same applicable permission; interpretation keys remain loading context only.

Chameleon references retain their lexical namespace scope and use the effective adopted namespace already recorded by S04.
Missing targets produce `invalid-schema` with the referring component and source path even when another symbol role has that name.
Prefix aliases and output names never supply permission or identity.

## Catalog evidence

The builder now retains import/include syntax in the existing `schemaRetained` field, including imports without locations.
This uses the existing [format 2](content-model-catalog.md) typed syntax contract without changing mandatory fields, model or profile.
Import namespace declarations supply visibility evidence; schema locations remain portable provenance and are excluded from semantic fingerprints.

Located imports in existing S04 catalogs retain namespace evidence through their loading targets.
If a foreign reference needs an unlocated import whose declaration was omitted by S04, resolution returns `incompatible-artifact` and requires original-source regeneration.
Neither successful reading nor an existing symbol target certifies semantic resolution.

## Recursion and component cycles

```text
element Shared -> type Shared -> particle using element Shared: legal value recursion
group A -> sequence -> group B -> choice -> group A: forbidden expansion cycle
type A -> derivation base B -> derivation base A: forbidden base cycle
```

An explicit iterative active/done traversal checks structural, group-expansion, scalar-variety and derivation edges.
Crossing an element declaration's type boundary admits recursive values, so those edges are excluded from the forbidden-cycle traversal.
Model groups, attribute groups, scalar list/union/base dependencies and complex derivation cannot expand cyclically.
Cycle diagnostics retain all involved source paths rather than inserting an empty stub.

Declared references and component cycles are assessed even beneath zero bounds; occurrence elimination belongs to #178.
Pinned xmlschema rejects zero-bound group cycles and missing references; libxml2 optimizes those particles away and accepts them.
That additional oracle disagreement is recorded separately from the existing [S01 disagreement](content-model-baseline.md).

## Resources and executable evidence

Resolution defaults to 100,000 graph nodes and 1,000,000 traversal steps, inclusive, with positive safe-integer overrides.
Each reference/origin/edge and DFS transition consumes work; exhaustion returns `resource-limit` without a partial result.
S03 loading limits and its conservative cyclic-depth behavior remain unchanged.

[Resolver tests](../test/unit/resolved-graph.test.ts) reuse graph/chameleon fixtures and cover role collisions, repeated bounds, missing targets, cycles, visibility, unlocated imports, immutability and catalog round trips.
[Independent reference fixtures](../test/conformance/fixtures/xsd/references/resolved.xsd) and [Python qualification](../test/conformance/reference/resolution_contract_test.py) provide schema-engine evidence independently of the TypeScript graph.

```bash
npx vitest run test/unit/resolved-graph.test.ts test/unit/semantic-catalog.test.ts
npx tsc -p test/unit/tsconfig.json
npm run test:reference:full
npm run ci
```

These are internal faithful checks; existing public behavior and support claims remain on the legacy route.
No faithful CLI activation, projection, codec, package publication or tags belong to this boundary.
Optional IDE inspections, Windows/private-production qualification and [S02 transport/security gates](content-model-decisions.md) remain unqualified.
