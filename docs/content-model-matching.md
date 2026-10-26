# Direct structural matching

Internal authenticated payload structure and scalar handoff contract. See the root [README](../README.md).

## Authority and supported grammar

[matchDirectOperation](../src/compiler/directStructure.ts) consumes an issued [DirectOperationContract](../src/compiler/directOperation.ts), a `DirectDirection` and an ordered `SyntaxElement` payload. `inspectDirectOperation` supplies the exact original source/context/root; copies and diagnostic JSON throw `TypeError`. There is no root/context override, source reload, cache, public export or runtime admission.

Directions are `{kind: 'input'}`, `{kind: 'output'}` and `{kind: 'fault', name: string}` for an exact declared fault. Unknown directions/faults return `unsupported`. The source gate remains the unchanged [P1-D01](decisions/003-content-model-contracts.md#checked-product-assessment-amendment-p1-d01) sufficient direct correspondence route.

The matcher handles global string/int/boolean scalar roots and named element-only complex roots containing a flat ordered sequence of distinct scalar declarations, including empty sequences. Native declaration names determine namespace/form; native occurrence pairs have minima `0`/`1` and maxima `1`/`unbounded`. It consumes original particles and the shared occurrence algebra, never interval summaries as a language validator.

A monotone cursor and actual occurrence count enforce order, required members, singleton maxima and complete consumption. Advancing a slot prevents returning to it later. Unbounded repetition consumes only actual input, with no maximum expansion or speculative state allocation.

## Results and retained duties

`structural-match` has `scope: 'structure-only'`, `scalarValidity: 'unassessed'` and `admitted: false`. It retains the exact `root`, `contextId`, owned `direction`, ordered `occurrences` and final `usage`. It never changes the original contract's `admitted` or `missingCapabilities` fields.

Every `DirectScalarDuty` retains the actual immutable `declaration`, its exact `type` reference, `builtin` expanded name, complete `lexical` text, owned payload `namespaces` and `payloadSource`, generated `payloadPath` and native `schemaPath`. Empty text differs from an absent required element. Text fragments are concatenated without trimming, normalization, conversion or default insertion.

`mismatch` covers wrong expanded names, order/count/consumption, significant element-only text and nested scalar elements. Only XML whitespace (`#x20`, `#x9`, `#xD`, `#xA`) is ignored between complex children. Ordinary attributes, `xsi:nil`, `xsi:type` and `xml:*` return `unsupported` because their semantics are unimplemented; namespace declarations reside in namespace context and are permitted.

`cancelled` and `resource-limit` carry no partial match. Diagnostics carry fixed rules, source schema paths and generated numeric payload paths, without echoing lexical values or caller-supplied paths. Malformed data throws `TypeError`; a potentially legal unsupported payload feature is never called invalid schema.

## Input ownership and resource lifetime

Inputs are data-only plain records and dense arrays, without proxies or accessors. A prepass checks the element root and rejects reused/cyclic syntax nodes through descriptors without invoking getters, reserving syntax nodes before copying. An iterative budgeted snapshot owns retained payload facts; shape checks then distinguish malformed records from XML structural differences. Caller/source objects are neither modified nor newly frozen.

The original selected context budget charges planning, syntax visits, descriptor inspection, text/maps, copying, paths, occurrence collection, freezing and final publication. Repeated calls share the remaining sticky budget; failure cannot reset it. Node accounting adds each payload element/text node to the cumulative source-preparation/context count, and work also bounds all auxiliary records.

Traversal terminates because preflight rejects cyclic/reused syntax nodes, snapshot uses an explicit identity stack, and matching advances through finite payload children and schema slots. Work and retained memory scale with the actual source plan and payload facts, including text/maps/provenance; publication also traverses the retained native root graph. No operation scales with an unbounded hypothetical cardinality.

Cancellation is checked at entry, schema/payload visits, matching boundaries and before publication. This synchronous operation cannot observe timer callbacks until JavaScript yields; it claims cooperative checks only. A reusable production client's invocation-budget lifecycle requires a separate design decision.

## Repository-local example

Run the following from the repository root using `node --import tsx --input-type=module-typescript` and standard input. Parsing here supplies a payload tree for demonstration, not a production SOAP adapter or security qualification.

```typescript
import path from 'node:path';
import {selectDirectOperation} from './src/compiler/directOperation.ts';
import {matchDirectOperation} from './src/compiler/directStructure.ts';
import {parseOrderedSyntax} from './src/loader/orderedSyntax.ts';

const namespace = 'urn:checked:forecast';
const selected = await selectDirectOperation(
  'test/conformance/fixtures/assessment/forecast.wsdl',
  {portType: {namespace, local: 'ForecastPortType'},
    binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'},
  {loading: {policy: {fileRoots: [path.resolve('test/conformance/fixtures/assessment')]}}},
);
if (selected.kind !== 'selected') throw new Error(selected.kind);
const cases = [
  {direction: {kind: 'input'} as const,
    xml: '<f:GetForecast><f:city>Paris</f:city><f:days>not-an-int</f:days></f:GetForecast>'},
  {direction: {kind: 'output'} as const,
    xml: '<f:GetForecastResponse><f:city>Paris</f:city><f:complete>true</f:complete></f:GetForecastResponse>'},
  {direction: {kind: 'fault', name: 'ForecastError'} as const,
    xml: '<f:ForecastFault><f:code>NOT_FOUND</f:code><f:message>Unknown city</f:message></f:ForecastFault>'},
];
for (const example of cases) {
  const xml = example.xml.replace('>', ` xmlns:f="${namespace}">`);
  const payload = parseOrderedSyntax(Buffer.from(xml), 'https://payload.invalid/message.xml').root;
  const result = matchDirectOperation(selected.contract, example.direction, payload);
  console.log(result.kind, result.kind === 'structural-match' ? result.scalarValidity : result.rule);
}
```

All three print `structural-match unassessed`, including the intentionally invalid int lexical witness. No SOAP endpoint is contacted. SOAP envelope/fault validity, production parsing security, scalar validity, projection round trips, codecs, transport and generation remain unassessed.

## Independent evidence

[Independent language tests](../test/unit/direct-structure-evidence.test.ts) specify Forecast request/response/fault expectations without the subject plan. The test-only adapter uses exact SOAP namespace/path extraction. Literal mutations cover trailing requirements, late returns, namespaces/forms, renamed sources, scalar roots, empty sequences, text and attributes.

Finite enumeration covers 1,444 words: 40 request words of length 0..3 over city/days/alien, 341 response words of length 0..4 over city/temperature/complete/alien for each of four temperature occurrence pairs, and 40 words for city-star/days-star. Literal language predicates independently determine expectations; these are finite corroboration, not universal XSD completeness. [Ownership/resource tests](../test/unit/direct-structure.test.ts) cover authority, immutable facts, malformed/cyclic/accessor input, inclusive work/node boundaries, cancellation and sticky reuse.

## Next implementation packet: direct scalars and reversible representation

[#184](https://github.com/TechSpokes/typescript-wsdl-client/issues/184) and [#182](https://github.com/TechSpokes/typescript-wsdl-client/issues/182), coordinated by [#155](https://github.com/TechSpokes/typescript-wsdl-client/issues/155), should consume the exact structural receipt and its ordered `DirectScalarDuty` fields. Extend matcher issuance with a private receipt registry and source-owned inspection boundary in that next packet, then authenticate newly issued receipts against their original contract/context before assigning scalar authority. This packet does not yet issue such an inspector; existing unregistered receipts cannot be authenticated retrospectively. Never treat a copied match/contextId as a valid receipt.

The next internal boundary should accept `(contract, structuralMatch, {signal?})`, preserve source and payload paths/maps, and return complete direct scalar assessment plus a reversible representation or explicit scalar-invalid/unsupported/cancelled/resource-limit. Add source-owned receipt identity at that boundary rather than trusting user-supplied duties. Share the original remaining budget with no reset and publish only after every duty succeeds.

Reuse the native scalar core for `xs:string`, signed int32 and boolean lexical/value rules. Independently cover string empty/whitespace/Unicode, int `-2147483648`, `2147483647`, `+0`, whitespace, overflows, `1.5`, empty and `not-an-int`; boolean `true`, `false`, `1`, `0`, whitespace, `yes` and empty. Distinguish lexical validation from reversible representation and preserve the original lexical witness where normalization loses spelling.

Use [Forecast expectations](../test/conformance/fixtures/assessment/forecast-messages/expectations.json) and the real renamed/form/scalar-root/empty fixtures exercised by the tests. Require invalid values to fail the scalar stage despite structural success, scalar round trips for all three directions, and no loss of repeated occurrence order or namespace/source identity. Full-instance reference validators may corroborate full validity but cannot redefine structural-only expectations.

Nil, attributes/type overrides, augmentation/defaults, arbitrary derivation and general conversion remain unsupported. No codec, transport, persisted bundle, public structured activation, generation, default/version change or publication belongs to that next scalar/projection packet. Broader matcher/evidence owners remain open beyond this direct slice.
