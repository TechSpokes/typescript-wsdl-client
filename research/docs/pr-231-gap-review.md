# S06 draft gap review and retirement

This review retires [PR #231](https://github.com/TechSpokes/typescript-wsdl-client/pull/231) as a superseded integration vehicle. It does not merge its assessment implementation or change current source, mapping, runtime, consumer or dependency contracts.

## Preserved history

The annotated non-release tag `archive/pr-231-s06-assessment` preserves head `460f5b8379c68ffef79917284e445b5ab046429e`, tree `56830b28d1006b019918a364aa62f1ed9d7d8817`, and its ten draft-only commits relative to the review baseline main `457d81d1aec7f559abd1b1ea59e4a578b25c509c`. The tag was pushed and its peeled remote revision verified before branch cleanup.

The tag retains all 221 changed files, including 123 XSD and 70 WSDL fixtures, their complete manifests, original assertions and reference observations. Historical executable source stays in that Git history; this change introduces no Python files, execution or dependencies.

The [schema manifest](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/test/conformance/schema-assessment-manifest.json), [binding manifest](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/test/conformance/schema-binding-manifest.json) and [inline assertions](https://github.com/TechSpokes/typescript-wsdl-client/blob/460f5b8379c68ffef79917284e445b5ab046429e/test/unit/schema-assessment.test.ts) remain addressable at that immutable head.

## Focused TypeScript additions

The [focused tests](../../test/unit/s06-gap-regressions.test.ts) use current native APIs and the existing forecast fixture. They make no provider requests and grant no runtime admission.

| Retained gap | Additional regression value |
|---|---|
| SOAP 1.2 numeric `soapActionRequired="0"` | Existing owned-wire optional-action test uses `false`; numeric false gets an explicit selection control |
| Malformed action-required boolean | Exercises the exact current boolean refusal before any operation contract is issued |
| Relative action URI | Exercises the exact current absolute-action refusal |
| Empty action URI | Distinguishes an explicit empty action from an omitted optional action |
| Shared group expansion | Three-level positive and twenty-level adversarial controls check precharged preparation and sticky exhaustion |

Existing [operation tests](../../test/unit/direct-operation.test.ts) already exercise message/fault references, part selection, message order, names, unsupported headers, extensions and transport. Existing [SOAP 1.2 wire tests](../../test/integration/component-soap12.test.ts) cover canonical optional and missing required actions. No equivalent cases for malformed action-required booleans, empty/relative actions or numeric optional actions were found in the current test inventory outside the superseded local proposal.

The scalar, attribute, particle and whole-source families already have current native owners, including [scalar operands](../../test/unit/schema-scalar-independent.test.ts), [attribute prerequisites](../../test/unit/schema-attribute-reuse-independent.test.ts), [symbolic UPA](../../test/unit/particle-upa-independent.test.ts) and [source construction](../../test/unit/native-source-construction.test.ts). A byte-different historical fixture does not establish a missing regression. The appendix preserves each historical row without claiming every unported input is semantically identical to an existing test.

## Remaining discrepancies and ownership

| Case family | Observed current result | Disposition |
|---|---|---|
| Empty `anyType` extension, absent or empty local sequence | Native `cos-particle-extend` invalid-schema | #179 must review separate synthetic ur-type identities in actual and builtin content views |
| Scalar-base complex-content extension, absent or empty local sequence | Explicit `effective-complex-content` unresolved | Retain under #179; no new supported source form is claimed |
| Reordered derivation and full negatives | Scoped results do not establish universal completeness | #232/#234 and combined #153 stay open |

All four historical empty-extension positives were accepted by the current independent libxml2 engine during review. For the two `anyType` cases, offline native inspection found matching sequence/wildcard shapes but distinct private identities. This is a specific discrepancy, not authorization to replace raw extension identity rules with structural or language equality.

The [current ADR](../../docs/decisions/003-content-model-contracts.md#ordinary-component-route-and-constructed-correspondence-p1-d02) keeps native construction, dated-XSD correspondence and runtime admission separate. These observations do not demonstrate failure of the currently supported consumer profile, and this change repairs none of these semantic cases.

A separate offline probe found that unknown SOAP children named `constructor`, `toString` or `__proto__` with an ordinary attribute throw `TypeError: allowed.includes is not a function` in the current binding allowlist. The unchanged forecast control selects, and an ordinary unknown child returns `unsupported/wsdl-extension`. The old empty-element probes pass and miss this variant. Preserve this concrete finding under #179; fixing it requires production code and is outside this test-only delivery.

## Reference evidence boundary

Both original Python reference methods remain preserved at the tag. During review, existing Node/WASM libxml2 reproduced all 123 historical libxml2 schema observations and the three literal nested-union payload observations. The historical xmlschema answers were not executed or fabricated as a live second engine.

Those observations are evidence, not standards authority or full-profile acceptance. Existing strict TypeScript reference infrastructure remains unchanged. No broad historical engine-replay suite is added to required product or research checks.

## Retirement conditions

Close #231 as superseded only after the focused changes and this record are delivered and verified. Verify the archive tag still points to the exact old head before deleting `codex/s06-analysis`. Closing the PR accepts no old aggregate obligation discharge and closes no broader semantic or research owner.

## Complete manifest disposition

The following 193 rows identify the exact original manifest cases. Archived cases remain available for later owners; an absent distinct-gap demonstration is not a universal coverage claim.

| Original case | Area | Disposition |
|---|---|---|
| `restriction-block` | XSD | Archived; no distinct new gap established |
| `inline-scalar-widen` | XSD | Archived; no distinct new gap established |
| `inline-scalar-widen-same-primitive` | XSD | Archived; no distinct new gap established |
| `facet-invalid-attribute` | XSD | Archived; no distinct new gap established |
| `restriction-invalid-attribute` | XSD | Archived; no distinct new gap established |
| `complex-facet-ignored` | XSD | Archived; no distinct new gap established |
| `complex-content-from-scalar` | XSD | Archived; no distinct new gap established |
| `dead-branch-element-consistency` | XSD | Archived; no distinct new gap established |
| `pattern-class-invalid-dash` | XSD | Archived; no distinct new gap established |
| `precision-leading-zero` | XSD | Archived; no distinct new gap established |
| `qname-length` | XSD | Archived; no distinct new gap established |
| `midnight-equivalence` | XSD | Archived; no distinct new gap established |
| `time-zone-equivalence` | XSD | Archived; no distinct new gap established |
| `facet-nonxml-whitespace` | XSD | Archived; no distinct new gap established |
| `final-nonxml-whitespace` | XSD | Archived; no distinct new gap established |
| `attribute-restrict-union-member-derived` | XSD | Archived; no distinct new gap established |
| `list-of-constrained-nested-union` | XSD | Archived; no distinct new gap established |
| `all-extension-empty-choice` | XSD | Archived; no distinct new gap established |
| `all-extension-empty-sequence` | XSD | Archived; no distinct new gap established |
| `mixed-extension-empty-sequence` | XSD | Archived; no distinct new gap established |
| `prohibited-unsupported-id` | XSD | Archived; no distinct new gap established |
| `disabled-unsupported-id` | XSD | Archived; no distinct new gap established |
| `prohibited-bogus-fixed` | XSD | Archived; no distinct new gap established |
| `anytype-extension-vacuous` | XSD | Discrepancy retained under #179 |
| `anytype-extension-empty-sequence` | XSD | Discrepancy retained under #179 |
| `anytype-extension-element` | XSD | Archived; no distinct new gap established |
| `anytype-extension-element-mixed` | XSD | Archived; no distinct new gap established |
| `simple-base-complex-extension-vacuous` | XSD | Discrepancy retained under #179 |
| `simple-base-complex-extension-empty-sequence` | XSD | Discrepancy retained under #179 |
| `whitespace-enumeration-default` | XSD | Archived; no distinct new gap established |
| `reordered-particle-string` | XSD | Research #234 remains open |
| `reordered-particle-token` | XSD | Research #234 remains open |
| `reordered-particle-int` | XSD | Research #234 remains open |
| `reordered-attribute-string` | XSD | Research #234 remains open |
| `reordered-attribute-token` | XSD | Research #234 remains open |
| `reordered-attribute-int` | XSD | Research #234 remains open |
| `differing-global-attribute-uses` | XSD | Accepted owner replaces old guard |
| `bound-base-enumeration` | XSD | Archived; no distinct new gap established |
| `bound-base-pattern` | XSD | Archived; no distinct new gap established |
| `bound-base-precision` | XSD | Archived; no distinct new gap established |
| `bound-exclusive-equality` | XSD | Archived; no distinct new gap established |
| `bound-inclusive-excluded` | XSD | Archived; no distinct new gap established |
| `bound-exclusive-empty` | XSD | Archived; no distinct new gap established |
| `nan-inclusive` | XSD | Archived; no distinct new gap established |
| `anysimple-restriction` | XSD | Archived; no distinct new gap established |
| `anysimple-list` | XSD | Archived; no distinct new gap established |
| `anysimple-union` | XSD | Archived; no distinct new gap established |
| `float-direct-rounding` | XSD | Archived; no distinct new gap established |
| `id-collapsed` | XSD | Archived; no distinct new gap established |
| `xsd-qualified-attribute` | XSD | Archived; no distinct new gap established |
| `inherited-empty-redeclare-minExclusive` | XSD | Archived; no distinct new gap established |
| `inherited-empty-redeclare-maxExclusive` | XSD | Archived; no distinct new gap established |
| `maxexclusive-at-inherited-mininclusive` | XSD | Archived; no distinct new gap established |
| `bce-date-0004` | XSD | Accepted owner replaces old guard |
| `bce-date-0001` | XSD | Accepted owner replaces old guard |
| `bce-dateTime-0004` | XSD | Accepted owner replaces old guard |
| `bce-dateTime-0001` | XSD | Accepted owner replaces old guard |
| `nested-group-wildcard-cardinality` | XSD | Accepted owner replaces old guard |
| `uri-scheme-invalid` | XSD | Archived; no distinct new gap established |
| `uri-bracket-open` | XSD | Archived; no distinct new gap established |
| `uri-ipv6-invalid` | XSD | Archived; no distinct new gap established |
| `uri-percent-invalid` | XSD | Archived; no distinct new gap established |
| `uri-registry-authority` | XSD | Archived; no distinct new gap established |
| `uri-ipv6` | XSD | Archived; no distinct new gap established |
| `uri-unicode-space` | XSD | Archived; no distinct new gap established |
| `uri-empty` | XSD | Archived; no distinct new gap established |
| `upa-dead-initial-prefix` | XSD | Archived; no distinct new gap established |
| `upa-dead-separator` | XSD | Archived; no distinct new gap established |
| `disabled-global-facet-invalid` | XSD | Archived; no distinct new gap established |
| `disabled-global-fixed-invalid` | XSD | Archived; no distinct new gap established |
| `nested-union-flattened-fixed` | XSD | Archived; no distinct new gap established |
| `facet-signed-zero` | XSD | Archived; no distinct new gap established |
| `intrinsic-token-list-empty` | XSD | Archived; no distinct new gap established |
| `uri-ipv6-leadingzero` | XSD | Archived; no distinct new gap established |
| `uri-ipv6-octet-overflow` | XSD | Archived; no distinct new gap established |
| `gmonth-trailing-dashes` | XSD | Archived; no distinct new gap established |
| `gmonth-control` | XSD | Archived; no distinct new gap established |
| `nested-union-payload` | XSD | Archived; no distinct new gap established |
| `facet-fixed-nonxml-whitespace` | XSD | Archived; no distinct new gap established |
| `re-dead-wildcard-intermediate` | XSD | Archived; no distinct new gap established |
| `re-dead-wildcard-final-restriction` | XSD | Archived; no distinct new gap established |
| `duration-cross-year-zero` | XSD | Accepted owner replaces old guard |
| `disabled-global-reordered` | XSD | Research #234 remains open |
| `disabled-global-mixed-scalar-restriction` | XSD | Archived; no distinct new gap established |
| `anytype-default` | XSD | Archived; no distinct new gap established |
| `anytype-fixed` | XSD | Archived; no distinct new gap established |
| `anytype-derived-default` | XSD | Archived; no distinct new gap established |
| `disabled-global-id-fixed` | XSD | Archived; no distinct new gap established |
| `prohibited-global-id-fixed` | XSD | Archived; no distinct new gap established |
| `disabled-derived-id-default` | XSD | Archived; no distinct new gap established |
| `disabled-scalar-complex-id-fixed` | XSD | Archived; no distinct new gap established |
| `disabled-global-id-control` | XSD | Archived; no distinct new gap established |
| `prohibited-global-id-control` | XSD | Archived; no distinct new gap established |
| `active-id-fixed` | XSD | Archived; no distinct new gap established |
| `anytype-derived-fixed` | XSD | Archived; no distinct new gap established |
| `disabled-global-anytype-fixed` | XSD | Archived; no distinct new gap established |
| `disabled-global-anytype-derived-default` | XSD | Archived; no distinct new gap established |
| `anytype-fixed-particle-restriction` | XSD | Archived; no distinct new gap established |
| `source-complex-two-id` | XSD | Archived; no distinct new gap established |
| `source-group-two-id` | XSD | Archived; no distinct new gap established |
| `source-extension-two-id` | XSD | Archived; no distinct new gap established |
| `source-id-prohibited-control` | XSD | Archived; no distinct new gap established |
| `disabled-global-type-local-invalid-default` | XSD | Archived; no distinct new gap established |
| `disabled-global-type-local-id-fixed` | XSD | Archived; no distinct new gap established |
| `disabled-global-type-inline-invalid-default` | XSD | Archived; no distinct new gap established |
| `disabled-global-type-local-legal-id` | XSD | Archived; no distinct new gap established |
| `restriction-removes-element-id` | XSD | Archived; no distinct new gap established |
| `restriction-prohibits-attribute-id` | XSD | Archived; no distinct new gap established |
| `restriction-removes-attribute-id` | XSD | Old runtime guard superseded |
| `attribute-complex-scalar-type` | XSD | Archived; no distinct new gap established |
| `prohibited-global-complex-scalar-attribute` | XSD | Archived; no distinct new gap established |
| `prohibited-local-complex-type-absent` | XSD | Archived; no distinct new gap established |
| `group-direct-distinct-au` | XSD | Archived; no distinct new gap established |
| `group-nested-distinct-au` | XSD | Archived; no distinct new gap established |
| `group-reused-identical-au` | XSD | Archived; no distinct new gap established |
| `complex-distinct-same-global-au` | XSD | Archived; no distinct new gap established |
| `disabled-global-final-bogus` | XSD | Archived; no distinct new gap established |
| `disabled-global-element-block-bogus` | XSD | Archived; no distinct new gap established |
| `restriction-base-final-bogus` | XSD | Archived; no distinct new gap established |
| `disabled-global-retained-child` | XSD | Archived; no distinct new gap established |
| `disabled-global-local-identity-illegal` | XSD | Old runtime guard superseded |
| `disabled-global-abstract-control` | XSD | Archived; no distinct new gap established |
| `disabled-global-local-identity-control` | XSD | Old runtime guard superseded |
| `binding-control` | WSDL | Archived; existing refusal or wider binding scope |
| `binding-action-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `binding-required-extension` | WSDL | Archived; existing refusal or wider binding scope |
| `port-required-extension` | WSDL | Archived; existing refusal or wider binding scope |
| `fault-multipart` | WSDL | Archived; existing refusal or wider binding scope |
| `fault-control` | WSDL | Archived; existing refusal or wider binding scope |
| `style-empty` | WSDL | Archived; existing refusal or wider binding scope |
| `style-invalid` | WSDL | Archived; existing refusal or wider binding scope |
| `style-string-spaces` | WSDL | Archived; existing refusal or wider binding scope |
| `use-invalid` | WSDL | Archived; existing refusal or wider binding scope |
| `use-string-spaces` | WSDL | Archived; existing refusal or wider binding scope |
| `parts-empty` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-operation-duplicate` | WSDL | Archived; existing refusal or wider binding scope |
| `transport-collapsed` | WSDL | Archived; existing refusal or wider binding scope |
| `part-name-collapsed` | WSDL | Archived; existing refusal or wider binding scope |
| `header-part-collapsed` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-binding` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-port` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-operation` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-boolean-invalid` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-extension-position-invalid` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-control` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-action-optional` | WSDL | Numeric 0 port; whitespace unclaimed |
| `soap12-operation-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-action-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-action-required-invalid` | WSDL | Focused TypeScript refusal regression |
| `soap12-action-relative` | WSDL | Focused TypeScript refusal regression |
| `soap12-action-empty` | WSDL | Focused TypeScript refusal regression |
| `soap12-binding-order` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-operation-order` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-body-order` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-body-encoding` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-body-namespace-relative` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-address-order` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-address-transport` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-parts-empty` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-use-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-unknown-constructor` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-constructor` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-unknown-toString` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-toString` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-unknown-__proto__` | WSDL | Archived; existing refusal or wider binding scope |
| `soap-required-__proto__` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-bound-duplicate` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-abstract-duplicate` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-bound-surplus` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-bound-name` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-notification` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-fault-control` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-fault-order` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-fault-use-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-fault-encoding` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-fault-nmtoken` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-header-control` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-header-encoding` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-headerfault-encoding` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-header-use-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-headerfault-use-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `binding-protocol-duplicate` | WSDL | Archived; existing refusal or wider binding scope |
| `binding-protocol-competing` | WSDL | Archived; existing refusal or wider binding scope |
| `port-address-competing` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-overload-named` | WSDL | Archived; existing refusal or wider binding scope |
| `operation-name-collapsed` | WSDL | Archived; existing refusal or wider binding scope |
| `soap11-address-transport` | WSDL | Archived; existing refusal or wider binding scope |
| `direction-binding-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `fault-binding-absent` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-rpc-document-encoded` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-rpc-document-encoded-relative` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-rpc-document-literal` | WSDL | Archived; existing refusal or wider binding scope |
| `soap12-rpc-document-namespace-absent` | WSDL | Archived; existing refusal or wider binding scope |

## Inline assertion families

The original unit suite contains 19 families with 40 literal test cases. Their complete source and tables remain at the pinned head.

| Original family | Disposition |
|---|---|
| plans opaque mixed value constraints without certifying child content | Current owner tests; no distinct new gap established |
| assesses selected WSDL bodies and reachable headers independently | Old orchestration not adopted |
| bounds shared group-use copying before expanding an adversarial DAG | Focused shared-DAG regression |
| checks %s without expanding counters | Current owner tests; no distinct new gap established |
| distinguishes group use positions and preserves legal recursive element content | Current owner tests; no distinct new gap established |
| checks structural element consistency even in unrealizable alternatives | Current owner tests; no distinct new gap established |
| checks original syntax and inline scalar component derivation | Current owner tests; no distinct new gap established |
| retains element block constraints in restrictions | Current owner tests; no distinct new gap established |
| preserves effective content identity for empty extensions and opaque anyType legality | Four empty-extension discrepancies retained under #179; remaining controls use current owners |
| omits absent use/particle capabilities while retaining their source-reference gates | Current owner tests; no distinct new gap established |
| checks restriction: %s | Current owner tests; no distinct new gap established |
| compares schema fixed operands in value space: %s | Current owner tests; no distinct new gap established |
| checks scalar facet legality: %s | Current owner tests; no distinct new gap established |
| checks decimal scale in totalDigits and retains QName length's XSD exception | Current owner tests; no distinct new gap established |
| interprets enumeration in the base value space independently of local facet order | Current owner tests; no distinct new gap established |
| retains declared unions while applying XSD 1.0 member flattening and rejecting list-of-list types | Current owner tests; no distinct new gap established |
| accepts constrained nested atomic unions as list items and derived union-member attribute types | Current owner tests; no distinct new gap established |
| limits support to selected reachable closures and is deterministic and immutable | Old orchestration not adopted |
| reassesses S05 original wildcard/fixed operands against the primary rules | Current owner tests; no distinct new gap established |
