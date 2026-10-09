# Shipped Occurrence Fix Reconciliation

S01 integration record for the delivered contributor correction and remaining content-model limits. See the root [README.md](../README.md) for documentation navigation.

## Delivered behavior and attribution

[BCsabaEngine](https://github.com/BCsabaEngine) diagnosed the dropped enclosing-sequence bounds in [#141](https://github.com/TechSpokes/typescript-wsdl-client/issues/141) and supplied [PR #145](https://github.com/TechSpokes/typescript-wsdl-client/pull/145). The landed maintainer integration narrows propagation to uninterrupted, nonzero sequence ancestry; it preserves the earlier choice, all, disabled-content and wildcard boundaries.

PR #145 merged on September 25, 2026 at `8385d9dd3cb0f8fdd45ad99df340783a6ea220c3`. Subsequent [PR #210](https://github.com/TechSpokes/typescript-wsdl-client/pull/210) merged at `86f8bc81a4a9a3985595f337281713e107b2527e` and normalized singleton SOAP responses using the corrected catalog metadata.

[v1.1.2](releases/v1.1.2.md) published on September 25 and shipped both changes, including the correction from the abandoned v1.1.1 candidate. Its release notes credit the original contribution; later v1.1.3/v1.1.4 publication and maintenance #209/#217 do not change that attribution or delivery version.

#141 is closed; [epic #147](https://github.com/TechSpokes/typescript-wsdl-client/issues/147) remains open for the broader content-model architecture. Reproducing the focused shipped correction does not complete that architecture.

## Cause, correction and runtime adaptation

The reported pattern places repetition on an enclosing `xs:sequence`, while the old compiler read only the child element's local occurrences. The sanitized [occurrence fixture](../test/conformance/fixtures/xsd/sequences/sequence-occurrence-wrappers.wsdl) preserves the reported `maxOccurs="2"` sequence around `address` and optional finite/unbounded sequence cases.

The [compiler traversal](../src/compiler/schemaCompiler.ts) now combines uninterrupted sequence bounds with the child element's bounds. `Addresses.address` receives `1..2` and becomes `AddressType[]`; `OptionalAddresses.address` receives `0..5` and becomes optional. This correction concerns metadata and generated shape, not an exact particle validator.

node-soap may decode a singleton repeated element as an object even when the generated contract requires an array. The [metadata generator](../src/client/generateUtils.ts) supplies the optional `RepeatedElements` map, and the [client conversion](../src/client/generateClient.ts) wraps non-null singleton repeated properties before gateway serialization; arrays retain their values and order.

The existing regression covers inherited and aliased type metadata, absent/undefined/null values, false/zero/empty-string singleton primitives, unchanged scalar properties, attributes and `$value`. Metadata without `RepeatedElements` retains its legacy behavior. This adaptation preserves response array shape; it does not independently certify XML-instance validity.

## Independent evidence consumed from #166

[PR #221](https://github.com/TechSpokes/typescript-wsdl-client/pull/221) delivered the authoritative [manifest](../test/conformance/semantic-baseline.json) and [reference setup/runner documentation](content-model-baseline.md). Its tested head was `94340c89b384831b411edce61c1e9994119b51d6`; merged main is `b86c653dfa0672231ca9b7cbc56d15ef6ae18bae`, with the same Git tree `bf3d8e7caa18a12ac204b061ad0ccc6e8563c6fb`.

The production source baseline is `b633cd1561ccb2689134a7289cf48bb097b0d1f1`. Independent qualification uses committed public fixtures on current code, not the private vendor WSDL or an old permanent planning revision. The PR/issue acceptance records identify final checked heads and hosted check runs for this documentation delivery.

The `original-sequence` entry accepts one or two addresses and rejects zero or three. Catalog and scoped TypeScript/OpenAPI assertions demonstrate the enclosing-bound correction; the existing [transport test](../test/integration/sequence-occurrence-transport.test.ts) and [shared harness](../test/helpers/occurrenceTransport.mjs) demonstrate downstream behavior against real local SOAP exchanges.

That harness sends omitted optional fields and two-item bounded/unbounded requests, checks actual request XML, and returns singleton/two-item complex and primitive responses. Both wrapped and flattened gateways preserve their expected JSON response bytes without the singleton HTTP 500 mismatch; an optional response wrapper is omitted in one case and contains one address in another.

The #166 full local CI passed 670 tests in 55 files, all conformance stages, pipeline smoke and installed-package consumer checks covering 73 TypeScript artifacts. The installed consumer invokes the same transport harness outside the checkout. Its independent full reference qualification passed 14 cases and 40 primary instance checks, with the documented secondary disagreement check; the required subset passed six cases and 15 instances.

This task consumes that manifest and requalifies it after a bounded test-tool correction. GitHub identified lxml's CVE-2026-41066 update in [PR #222](https://github.com/TechSpokes/typescript-wsdl-client/pull/222); the follow-up pins lxml 6.1.0 with the same libxml2 2.14.6 engine instead of 6.0.2. The adapter already disables external entities explicitly, but handing off a known vulnerable tool pin is unnecessary.

Fresh setup, full reference qualification and full local CI verify the corrected tool pin; the corpus and literal semantic expectations remain unchanged. Historical commits and the private production environment are not rerun, and no new SOAP coverage for other manifest boundaries is claimed. Package publication, release tags, metadata bumps and S02 feasibility probes are outside this delivery.

### Historical checks and contributor report

PR #145 records focused regressions, conformance and consumer checks around the compiler change. PR #210 records the singleton regressions, real SOAP tests and v1.1.2 release qualification. Those records are historical evidence; they are not substituted for the independently executed #166 checks on current main.

On September 26, [BCsabaEngine reported](https://github.com/TechSpokes/typescript-wsdl-client/issues/141#issuecomment-5843833294) that behavior met requirements, all tests passed and generated sources were in order. This is contributor production acceptance, distinct from repository fixture qualification; the private environment and its test suite were not reproduced during S01.

## Remaining owned limitations

The [manifest](../test/conformance/semantic-baseline.json) remains the only case baseline. Its stable IDs and dispositions link each gap to CM findings and concrete issue owners; this record supplies integration context without duplicating those expected-output tables.

### Local versus inherited occurrences

`original-sequence` and `optional-sequence` preserve the delivered local/inherited array and optionality correction. Finite array lengths remain unchecked. Regenerate from original WSDL/XSD before relying on corrected metadata; an old flattened catalog cannot recover lost enclosing occurrences.

`choice-boundary` and `optional-all` record preserved compatibility boundaries, not support for inherited group semantics. `zero-group-unbounded` wrongly retains a required scalar child, while `zero-element-unbounded` preserves catalog zero but emits an optional scalar that can admit prohibited data; CM-01/CM-03 remain with #178/#179/#180 and projection/validation consumers.

### Choices, order and count gaps

`simple-choice`, `required-single`, `required-multiple` and `empty-alternative` distinguish single nonempty branches, repeated selections and invisible empty realizations. Current default and union expectations are separate: default output actually requires scalar branch fields in these fixtures, while opt-in union expresses one exclusive scalar selection; neither expresses every repeated or empty case.

`sequence-order` loses repeated pair order/correlation in independent arrays, and `finite-count-gap` shows why `2..4` does not enforce only two or four items. CM-02/CM-03/CM-04/CM-05 lead to analysis/matching #178/#180, projection #182, codec #188 and HTTP validation #198.

### Wildcards and schema legality

`wildcard-sequence` retains local wildcard metadata but omits enclosing repetition and ordered wildcard values from generated TypeScript/OpenAPI. No real wildcard transport claim was added. The legal optional-all case is distinct from `invalid-all-sequence`, which is rejected at independent schema compilation even though the legacy compiler accepts it; #179 owns legality/support diagnostics.

The disabled-element instance is an explicit CM-15 oracle disagreement: libxml2 2.14.6 accepts it, while xmlschema 4.2.0 rejects it. The full runner preserves both outcomes, and #181 owns investigation; primary acceptance does not establish intended validity. S01 closes with this bounded, reproducible disposition rather than repairing the production architecture.

## S02 decisions and starting artifacts

[#168](https://github.com/TechSpokes/typescript-wsdl-client/issues/168) starts from the delivered manifest, adapter, current characterization suite, integration record, public support registry and [ADR-002](decisions/002-streamable-responses.md). The [S02 session](https://github.com/TechSpokes/typescript-wsdl-client/issues/149) must resolve the following questions through its reviewed decision register.

1. Which value representations preserve repeated pair order, branch identity and repeated choices reversibly?
2. What equivalence is promised when group history or an empty branch is invisible in XML?
3. Which XSD/datatype/wildcard constraints are supported, and where are legality, matching and scalar rules enforced?
4. How do validation, intentional conversion, normalization and serialization preserve caller data and reject invalid input?
5. How do buffered and streaming SOAP paths share semantics while retaining transport/security and completion guarantees?
6. Which old-catalog/source/new-bundle/mixed-artifact combinations require regeneration or rejection before activation?
7. Which numeric resource limits apply, with what units, failure categories and enforcement owners?

The decisions about representations, bundles, transport and compatibility are foundational gates for S03. Draft #168 is the next entry task after S01 closure; #169/#170 remain blocked until its reviewed ADR draft exists. This handoff starts no S02 implementation and activates no new public behavior.
