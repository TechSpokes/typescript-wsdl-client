# Canonical Derivation Composition

Internal S05 derivation views over immutable declarations. See the root [README](../README.md).

## Input, result and assessment gate

[`composeCanonicalGraph`](../src/compiler/composeCanonicalGraph.ts) consumes the reviewed [resolved-reference contract](content-model-resolution.md).
It returns `ComposedGraph {resolved, types, metrics}` without changing the [canonical graph](content-model-graph.md).
Each `ComposedType` retains its declaration ID, original derivation edge, effective content contributions, attributes, wildcard, scalar layers and explicit legality obligations.

All results carry `assessment: "requires-schema-assessment"`.
This boundary computes composition; it never certifies complete XSD legality, capability support or payload validity.
No emitter accepts these internal views; #179 must discharge obligations before downstream planning under [ADR-003 D04](decisions/003-content-model-contracts.md#xsd-10-profile-and-enforcement-s02-d04).

Content contributions reference declared particle IDs, preserving order and local bounds rather than flattening children.
Builtin `anyType` remains an explicit opaque contribution with its original builtin reference.
Attribute/wildcard source IDs and scalar owner layers trace every contribution to the declared graph.

## Distinct derivation operations

`extendContent(base, local)` concatenates the base root contributions followed by the local root particle.
`restrictContent(local)` returns only the local root, or empty content when no particle is declared.
Neither operation expands group definitions, calculates occurrences or mutates base and sibling types.

```text
Base:       optional a, optional b
Extension:  Base roots, local extra
Restriction: local optional a
Empty restriction: no child particles
```

Complex-content derivation requires a complex base; simple-content extension requires a scalar-bearing base.
Simple-content restriction retains facets and optional inline scalar types as ordered owner layers.
Its mixed-base check uses the composed base, including effective mixed content inherited through an empty `anyType` extension.
Named scalar restriction/list/union definitions and lexical contexts remain original graph data for #179/#184.

Extension with no local content inherits the base's effective mixed content.
An empty extension of `anyType` preserves opaque child content and its `##any` lax attribute wildcard.
Restriction of `anyType` replaces child content and permits declared attributes through that base wildcard, while an omitted derived wildcard is removed.

## Attribute-use composition

Attribute groups are traversed separately from child model groups.
Omitted restriction uses inherit base required/optional uses and their constraints.
A declared prohibition removes an explicit optional use; weakening or prohibiting a required base attribute fails with `invalid-schema`.
This applies to a direct type restriction; a prohibited use inside an attribute group contributes no attribute use and leaves inherited uses intact.

Prohibitions remain traceable tombstones in the view rather than becoming wildcard QName exclusions.
A matching retained wildcard can still admit that QName; prohibition removes an explicit use only.
Extension prohibition contributes no new use and never removes a base use; conflicting inherited cases retain a legality obligation.

Local redeclarations retain their actual declared types and default/fixed values.
No missing local type is inferred from the base, and scalar values are never compared through Number or plain lexical equality.
New restricted attributes require a matching base wildcard; type narrowing and applicable fixed-value equivalence retain both reference/value contexts for their enforcement owners.

## Wildcard composition

Each wildcard namespace is interpreted using its original effective namespace.
`##other` excludes that namespace and the absent namespace; imported groups can therefore have different constraints despite identical lexical spelling.
Finite sets and complements support exact union, intersection and subset checks without replacing lexical declarations.

Group wildcards intersect namespace sets and preserve the first group wildcard's processing mode.
Extension unions base and local namespace sets using the local processing mode, or inherits the base wildcard when no local wildcard exists.
Restriction removes an omitted wildcard; an explicit wildcard must be a namespace subset with equal or stronger processing (`skip < lax < strict`).

An intersection or union need not be expressible as one legal XSD 1.0 wildcard.
The view retains the mathematical result and source operands; `wildcard-expressibility` remains an explicit #179 gate.
Impossible restriction subsets and weakened processing fail here rather than being silently accepted.

## Independent disagreements and remaining obligations

Pinned xmlschema 4.2.0 and lxml 6.1.0/libxml2 2.14.6 disagree on duplicate extension uses and some extension prohibitions.
They also disagree on fixed-value restrictions, group-plus-local wildcard processing and imported `##other` combinations.
These cases are not added to verified support from either engine alone.

Conflicting group/local processing returns `assessment-required` alternatives and original wildcard sources, with no invented selected mode.
Each nested attribute group preserves its own processing obligation through callers.
Fixed-value obligations retain both lexical values and type context, including value-equivalent integer spellings such as `1` and `+01`.
Particle language inclusion, extension/mixed legality, attribute-type derivation, wildcard expressibility and scalar derivation remain explicit #179 obligations; #184 owns payload scalar enforcement.

This division follows the existing S06 legality ownership rather than narrowing the approved profile.
The [decision register](content-model-decisions.md) assigns these concrete evidence qualifications to #179; they block affected assessed plans.
The S01/#181 disagreement and S02 transport/security qualifications remain unchanged.

## Resources and evidence

Composition defaults to 100,000 graph nodes and 1,000,000 work steps with positive safe-integer overrides.
Iterative derivation order and bounded attribute-group expansion terminate independently of legal element/type recursion.
Inherited content, attribute, wildcard and obligation copying consumes work; exhaustion returns `resource-limit` without a partial view.
Provenance source-array copying is counted before allocation, including repeated references and derived merges.

[Unit tests](../test/unit/composed-graph.test.ts) exercise contrasting extension/restriction, empty content, immutable siblings, attributes, wildcard operations, scalar/list/union contexts, opaque bases, catalog round trips and exact configured budgets.
[Independent fixtures](../test/conformance/fixtures/xsd/composition/derivations.xsd) and [Node qualification](../test/conformance/reference/composition-contract.test.ts) assert current schema observations, scoped ordered payload contracts and separately recorded historical disagreements under [NT-CONT-01](reference-validation.md).

```bash
npx vitest run test/unit/composed-graph.test.ts test/unit/resolved-graph.test.ts
npx tsc -p test/unit/tsconfig.json
npm run test:reference:full
npm run ci
```

These are internal faithful results; legacy default generation remains active.
No occurrence summaries, complete legality checker, scalar payload engine, projection, codec or emitter rewrite belongs to S05.
