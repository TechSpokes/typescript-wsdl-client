# Exact Particle Analysis

Internal S06 occurrence and emptiness contracts over the immutable graph. See the root [README](../README.md).

## API and guarantees

[`analyzeOccurrences`](../src/compiler/occurrenceAnalysis.ts) consumes the `ComposedGraph` from [the common source/catalog entry](content-model-companions.md).
It returns `analyzed {analysis}` or `failure {diagnostic}` without partial success on exhaustion.
The analysis retains the original composed/resolved/canonical graph and the `requires-schema-assessment` gate.

Each particle summary records exact named-element and wildcard contributions, `nullable` and `hasRealization`.
Type summaries combine the ordered composed roots, preserving restriction replacement versus extension concatenation.
The particle table and original graph retain alternative-local guarantees and ordered relationships; object-wide intervals cannot replace them.

Finite bounds remain canonical decimal strings; `unbounded` is a distinct maximum.
The shared occurrence algebra uses exact `BigInt` after charging operand/result work.
Zero dominates multiplication in either position, including beneath unbounded descendants; finite repetitions are never expanded.

## Contributions and emptiness

Sequences and legal all groups add member contributions.
Choices take minima/maxima across realizable alternatives, inserting zero for absent members.
A single required branch stays required; a member in every branch retains their minimum guarantee.
Local repetition multiplies contributions without changing declared occurrences or group definitions.

An empty sequence or all group admits epsilon.
An empty required choice admits no sequence; an optional empty choice admits epsilon through zero repetitions.
A choice with an epsilon branch is nullable even with a positive occurrence minimum.
Unrealizable alternatives supply no accepted branch; `hasRealization` distinguishes empty language from epsilon.

Elements are atomic child events, independently of their type's child-content emptiness.
`hasRealization` describes the particle language with elements as terminals; it does not certify finite recursively nested values or scalar validity.
Scalar/mixed text, nil, attributes and defaults remain later owners' responsibilities.

Legal element/type recursion terminates without empty definition stubs.
Group/containment expansion uses iterative active/done traversal and memoization; S05 already rejects cycles in those edges.
No recursive emptiness equation crosses element type edges because an element is never epsilon.
S05's missing-reference and forbidden-cycle diagnostics remain applicable beneath zero bounds.

## Intervals and opaque scope

A repeated pair can have interval `2..4` while admitting only counts 2 and 4.
Order, gaps and correlated branches remain in the original grammar for #180/#181; summaries are not payload validators.
An opaque builtin contribution remains original data.
The scope `declared-particles-with-opaque-builtin` means named counts describe declared contributions only, not possible opaque content.
Analysis never promotes builtin or skip/lax content to full concrete validation.

## Budgets and evidence

Analysis independently applies S05's inclusive 100,000-node and 1,000,000-work-step defaults.
Indexing, traversal, arithmetic digits, conservative multiplication work and contribution/provenance copying count before allocation.
Positive safe-integer overrides follow existing semantic policy; exhausted analysis returns `resource-limit` without partial success.
Later matcher, payload scalar and generated-output budgets retain their [ADR-003 D09 owners](decisions/003-content-model-contracts.md#provisional-resource-budgets-s02-d09).

[`analysis.xsd`](../test/conformance/fixtures/xsd/analysis/analysis.xsd) and [pinned reference checks](../test/conformance/reference/analysis_contract_test.py) qualify schema validity separately from payload acceptance.
The reference check raises xmlschema's documented model-depth setting from 15 to 32 for nested shared-group wrappers and treats qualification warnings as errors.
Libxml2 qualifies the small language cases with only the unused huge bound reduced; xmlschema qualifies that original exact bound.
[Unit tests](../test/unit/occurrence-analysis.test.ts) cover arithmetic, zero, alternatives, recursion, immutability and configured boundaries.
Ignored measurements go to `tmp/conformance/analysis/measurements.json`; platform/broad qualification remains #208's responsibility.
S01/#181 and S05 oracle disagreements and [S02 security qualifications](content-model-decisions.md) remain assigned downstream.

```bash
npx vitest run test/unit/occurrence-analysis.test.ts
npx tsc -p test/unit/tsconfig.json
npm run test:reference:full
```
