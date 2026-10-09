# Canonical Schema Graph

Internal S04 graph contracts for the unreleased faithful compiler. See the root [README](../README.md).

## Ownership and data flow

[ADR-003 D01/D04/D09](decisions/003-content-model-contracts.md) defines identity, profile and budgets.
[S03 loading](content-model-loading.md) supplies immutable syntax through its repository-owned adapter.
[The model](../src/compiler/canonicalGraph.ts) and [pure builder](../src/compiler/buildCanonicalGraph.ts) implement #173.

```text
SchemaInput.schemas + ordered WSDL documents
  -> reserve global symbols
  -> build complete declarations and independent use sites
  -> link available targets without expansion
  -> freeze CanonicalGraph
  -> S05 reference/composition assessment
```

`buildCanonicalGraph(input, {maxNodes?})` performs no I/O and never mutates input.
The internal graph is not exported by the package entry point or activated by the CLI.
The legacy compiler and its consumers retain the 1.x default.

## Identities and immutable references

Global IDs are JSON tuples `['global', role, effectiveNamespace, localName]`.
Element, attribute, type, model group, attribute group and WSDL roles occupy separate symbol spaces.
Simple and complex named types share the type symbol space.

Scoped identity is `(containingDeclarationId, sourceRelativePath, role)`.
The ID is `scoped:` plus SHA-256 of the UTF-8 JSON tuple `[owner, path, role]`; the tuple remains explicit in `identity`.
Hashing prevents recursively escaped anonymous-owner IDs from growing exponentially with nesting.
An anonymous type is a distinct type node owned by its containing declaration.
Local elements with the same expanded name in different types retain independent declarations and type references.

Syntax paths are relative to the containing declaration and preserve the adapter's ordered element/text indexes.
They contain no document URI or temporary directory.
Changing source structure may change scoped IDs; output names and prefixes never define identity.

Interpretation keys live only in `origins`; repeated root/include interpretations do not create additional globals.
Repeated declarations from the same byte digest and source path share one complete body.
Conflicting declarations for one global identity fail explicitly rather than being merged by name.

References are discriminated `symbol`, `builtin` or `local` values.
Available global targets are linked after all bodies exist; unresolved symbol references keep their expanded name and lexical context with no target.
S05 owns missing-target diagnosis, reference visibility, component-cycle legality and complete derivation semantics.

For recursive `element Shared -> type Shared -> element-use Shared`, each target points to a complete declaration.
No eager expansion or empty recursion placeholder is introduced.
Two uses of group `Pair` with bounds `0..2` and `3..900719925474099312345678901234567890` share its definition and keep separate particles.

## Node invariants

Element and attribute declarations own their expanded names, type references and default/fixed constraints.
Particles own only their local `Occurs` and term: ordered sequence, choice, legal XSD 1.0 all, element use, group use or wildcard.
Attributes, attribute-group references and attribute wildcards occupy an ordered attribute-use list distinct from child content.

Simple types retain restriction bases and ordered facets, list items or declaration-ordered union members.
Complex types retain local content and attributes plus distinct extension/restriction edges and simple/complex content kind.
No derived content, effective attribute composition or occurrence summary is calculated here.

Finite bounds are canonical nonnegative decimal strings; `unbounded` is a distinct maximum token.
The builder compares exact integers, rejects negative/fractional/reversed ranges and invalid all shapes, and never converts bounds to Number.
Zero remains a local bound; S06 calculates its annihilating effect on summaries.

WSDL nodes preserve ordered message/operation/binding/service syntax and role-qualified references.
Their binding extensions, actions, body/header/fault selections and lexical attributes remain available to later planning.
The graph does not select a SOAP transport or advertise qualified capabilities.

## Lexical context and provenance

Every graph node retains source URI, original-byte digest, source path and start/end positions, inherited base URI and namespace scope.
Source offsets and exclusive ends follow the [adapter contract](content-model-loading.md#syntax-and-provenance-contract).
`GraphContext.schemaAttributes` retains schema-level defaults for downstream interpretation.

Facet values, defaults/fixed values, wildcard namespace constraints and explicit QName references retain `LexicalValue {value, context}`.
Lexical values are not coerced, normalized or assessed by S04.
QName facets can be interpreted later using the original locally rebound namespace context.

Chameleon adoption changes a no-namespace component reference's effective target namespace while preserving its original lexical context.
A lexical `Node` with an empty default binding can target `urn:a:Node` under adoption and `urn:b:Node` in another interpretation.
An explicit/default lexical namespace remains authoritative; it is never overwritten by adoption.

Default namespaces apply to lexical QNames and XML element names, while unprefixed ordinary XML attributes remain unqualified.
Local declaration names use `form` or the schema's respective element/attribute form default.
These declaration rules are independent of the XML syntax name's namespace.

Annotations preserve ordered element/text syntax, attributes and namespaces, including mixed appinfo text.
`syntaxDetails` preserves restriction/list/union and content-wrapper syntax; facets retain their complete declaring syntax.
Known element-only XSD containers reject significant text explicitly, while mixed annotation content remains ordered.
Uninterpreted declarations remain `retained` or contextual `schemaRetained` for S06 assessment; preservation is not support certification.
Full internal URIs and loading edges remain provenance; [format 2 persistence](content-model-catalog.md) implements #174's artifact-safe serialization and semantic fingerprints.

## Resource and validation boundaries

The inclusive provisional limit is 100,000 declarations and use-site nodes together.
An explicit positive safe-integer `maxNodes` overrides it; construction fails with `resource-limit` and returns no partial graph.
Malformed structural shapes fail with `invalid-schema` and the declaring source.

S03's loading limits and conservative cyclic-depth behavior are consumed unchanged in `graph.loading`.
The builder performs structural checks only; S05 resolves/composes, S06 checks complete schema legality and reachable capabilities, and S07 matches values.
UPA, scalar/facet legality, complete component-cycle rules and production codecs remain downstream gates.

## Evidence and reproduction

[Graph tests](../test/unit/canonical-graph.test.ts) reuse independent S01/S02 and S03 fixtures.
[Graph fixtures](../test/conformance/fixtures/xsd/graph/shared-recursive.xsd) add shared definitions, recursion, local names, anonymous types, large bounds and scalar lexical context.
[Chameleon input](../test/conformance/fixtures/xsd/graph/chameleon.wsdl) proves namespace adoption without rewriting lexical bindings.
[Independent schema qualification](../test/conformance/reference/graph_contract_test.py) accepts the complete graph fixture with xmlschema 4.2.0.
Pinned libxml2 rejects that fixture's huge bound; it accepts the variant with only that maximum changed to `4`.
The graph's exact-bound tests and unchanged xmlschema acceptance establish the large-bound evidence separately from libxml2's limited range.

```bash
npx vitest run test/unit/canonical-graph.test.ts test/unit/canonical-graph-budgets.test.ts
npx tsc -p test/unit/tsconfig.json
npm run ci
npm run test:reference:full
```

[Budget evidence](../test/unit/canonical-graph-budgets.test.ts) measures 100,000/100,001 nodes and writes ignored results to `tmp/conformance/schema-graph/measurements.json`.
The #151 handoff pins exact independently reviewed heads, merged revisions, commands/results and later qualification owners.
Optional IDE checks, Windows filesystem behavior, private production schemas and broad platform limits remain unqualified.
