# Direct scalar values

Internal P3.3 mapping and inverse contract. See the root [README](../README.md) and [matching contract](content-model-matching.md).

## Implementation checkpoint

One integration owner implements the complete chain under #382, #155, #184 and #182. Inputs are an authentic operation, a newly issued successful structural match, or an authentic source-derived mapping plus fresh application data. Receipt identity, never digest or diagnostic JSON, supplies authority.

The complete native root plan determines every slot, including unobserved optional members. Scalar roots project to primitives; complex roots project to owned null-prototype records keyed by distinct source local names. Required singletons are required; optional singletons are omitted when absent; unbounded members always have dense ordered arrays, empty only when min=0. Empty sequences yield empty records.

String content is preserved; boolean maps to boolean; validated int32 maps exactly to number, normalizing negative zero to zero. Original lexical spellings, declaration/type identities, namespaces and source paths remain immutable evidence. The inverse accepts fresh values, reconstructs expanded names and source order with canonical scalar spellings, and reuses structural and shared scalar validation. It produces lexical data, not XML bytes.

Data inputs are plain records and dense arrays without proxies or accessors. Unknown keys, symbols, nonenumerable fields, inherited/custom prototypes, boxed/callable values, sparse/extra-property arrays, missing required members and wrong scalar types are refused without coercion, getters or caller mutation. Ordinary Object.prototype and null prototypes are accepted for fresh records.

The original inclusive sticky request budget covers controlled inspections, planning, values, text, keys, construction, revalidation and publication, subject to the intrinsic enumeration limitation below. Cancellation is cooperative; failures issue no partial receipt. No new runtime budget lifetime is introduced. Success still has admitted:false; production codecs, transport, persistence, generation and public activation remain deferred.

## Laws and rule basis

For admitted data-only fresh application values, project(validate(expand(v))) equals normalizeApplication(v). Expansion of a projected validated payload preserves expanded names, declaration order, occurrence counts and typed values modulo canonical scalar spelling. Normalization is deterministic, idempotent and non-mutating; it changes only record key order/prototype ownership and numeric negative zero, never repairs invalid shapes.

These are in-memory structure/value laws, not XML byte round trips. Scalar rules come from the dated [XSD Datatypes recommendation](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/): string 3.2.1, boolean 3.2.2, int 3.3.17, integer 3.3.13 and whiteSpace 4.3.6; XML character validity follows XML 1.0 Char. Neutral datatype calculations are shared with schema assessment; payload diagnostics and issuance are separate.

## APIs and failures

`createDirectValueMapping(contract, direction, options?)` returns an issued `direct-mapping`, independent of any payload. `assessDirectScalars(contract, match, options?)` authenticates the final `structural-match`, validates every duty, projects the application value and returns an issued `direct-value` with `mapping`, `structural`, `operands`, `value` and usage. `expandDirectValue(contract, mapping, freshValue, options?)` returns an issued `direct-expanded` with generated `payload` lexical data and its revalidated `validated` value receipt.

The identity-only inspectors are `inspectDirectStructuralMatch`, `inspectDirectValueMapping`, `inspectDirectValue` and `inspectDirectExpandedValue`; every inspector takes the receipt then the expected original operation contract. Inspectors do not perform operational work or grant a fresh budget. Each operational API checks cancellation and remaining resources again. Copies, JSON, context IDs and equal digests supply no authority.

Payload lexical failures return `scalar-invalid` with schema and numeric payload paths. Application shape/type failures return `value-invalid`; native unavailability returns `unsupported`; interruption returns `cancelled` or sticky `resource-limit`. No failure publishes values, operands, mappings or partially reconstructed payloads. Malformed receipt authority throws `TypeError`; genuine internal errors propagate rather than becoming invalid caller data.

## Accepted resource model

The user explicitly accepted the following scoped resource qualification for P3.3 on October 26, 2026, recorded in [#382](https://github.com/TechSpokes/typescript-wsdl-client/issues/382#issuecomment-6424153066): JavaScript `Reflect.ownKeys` constructs an intrinsic temporary key vector before its length can be known. Rejecting every symbol/nonenumerable extra field on an arbitrary plain data object requires this bulk intrinsic; a prior guessed cap cannot bound the allocation. The inverse precharges the maximum valid vector before the intrinsic: the source slot count for records, or length plus one for dense arrays. It immediately refuses any excess count before per-key traversal. This reserves every valid key vector before construction, but a malformed object can still cause the engine to allocate a larger temporary vector before control returns.

All controlled traversal, scalar work, retained copies, construction and publication use the original budget. This model does not establish a hard heap bound or preemption of intrinsic enumeration. Exact all-allocation precharging for arbitrary malformed application objects is not established and is outside the accepted model. The scope decision preserves all value/shape checks and the original budget; it does not introduce a V8 memory ceiling or permit successful output on exhaustion. No default budgets or test deadlines were raised.

## Runnable three-direction example

From the repository root run `node --import tsx --input-type=module-typescript` and supply this program on standard input. The existing ordered parser is used only as a test adapter; this example does not qualify a secure SOAP codec.

```typescript
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {selectDirectOperation} from './src/compiler/directOperation.ts';
import {matchDirectOperation} from './src/compiler/directStructure.ts';
import {assessDirectScalars, createDirectValueMapping, expandDirectValue} from './src/compiler/directValues.ts';
import {parseOrderedSyntax, syntaxElements} from './src/loader/orderedSyntax.ts';

const directory = path.resolve('test/conformance/fixtures/assessment');
const namespace = 'urn:checked:forecast';
const selected = await selectDirectOperation(path.join(directory, 'forecast.wsdl'), {
  portType: {namespace, local: 'ForecastPortType'},
  binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast',
}, {loading: {policy: {fileRoots: [directory]}}});
if (selected.kind !== 'selected') throw new Error(selected.kind);
const cases = [
  ['request', {kind: 'input'}, {city: 'Paris', days: 2}],
  ['response', {kind: 'output'}, {city: 'Paris', temperature: [18, -2], complete: true}],
  ['fault', {kind: 'fault', name: 'ForecastError'}, {code: 'NOT_FOUND', message: 'Unknown city'}],
] as const;
for (const [file, direction, fresh] of cases) {
  const uri = path.join(directory, 'forecast-messages', file + '.xml');
  const envelope = parseOrderedSyntax(await readFile(uri), pathToFileURL(uri).href).root;
  let payload = syntaxElements(syntaxElements(envelope)[0]!)[0]!;
  if (file === 'fault') payload = syntaxElements(syntaxElements(payload).find(n => n.name.local === 'detail')!)[0]!;
  const match = matchDirectOperation(selected.contract, direction, payload);
  if (match.kind !== 'structural-match') throw new Error(match.kind);
  const value = assessDirectScalars(selected.contract, match);
  const mapping = createDirectValueMapping(selected.contract, direction);
  if (value.kind !== 'direct-value' || mapping.kind !== 'direct-mapping') throw new Error('validation failed');
  const inverse = expandDirectValue(selected.contract, mapping, fresh);
  if (inverse.kind !== 'direct-expanded') throw new Error(inverse.kind);
  console.log(file, value.value, inverse.validated.value);
}
```

## Exact next metadata/XML-value/codec packet

This packet is prepared for #185/#186/#187/#188/#189, not automatically started. The minimum next consumer is an internal in-memory direct codec, retaining the original authentic operation and mapping; it does not need a portable bundle platform. Broader persistence and cross-process compatibility criteria in #185/#186 remain open.

Consume `DirectOperationContract` and `DirectValueMapping.version='direct-values-v1'`, exact root declaration/type/expanded names, ordered slots with particle occurrence bounds and builtin identities, the binding's SOAP 1.1 document/literal action, and exact input/output/declared fault directions. The sole accepted mapping is source-owned; a hash detects mismatch but never substitutes for receipt identity. Reject incompatible direction/root/context or mapping version before interpretation; do not auto-upgrade old catalogs.

The value bridge is `DirectExpandedValue.payload`: ordered expanded-name lexical data with empty attributes, typed text and explicit generated provenance. It is not a serialized XML tree; `lexicalName` is a local-name placeholder, namespace maps are empty, and zero positions/empty digest in the generated URN are synthetic markers. The encoder must allocate prefixes by expanded namespace, handle unqualified children/default-namespace resets, escape text and attributes, and never treat placeholders as observed source bytes. Incoming syntax retains actual parser source positions, namespace maps and original lexical spellings through `DirectAssessedScalar`.

String values preserve content; boolean spellings normalize to true/false; int32 spellings normalize to exact decimal number text with negative zero mapped to zero. Optional singleton omission, empty string presence and always-present repeated arrays remain distinct. No nil, attributes, defaults, type substitution, facets, dates/decimal/QName or nested complex grammar may be inferred. Reuse `expandDirectValue` and `assessDirectScalars`; do not add another scalar validator or derive schema slots from populated occurrences.

Define a secure byte/XML boundary under #187 before claiming parser security: explicit byte/depth/node/text limits, DTD/entity/external-resource refusal, truncation/encoding handling, namespace correctness and controlled parser provenance. Implement #188/#189 encode/decode over the direct mapping, preserving the distinction between original observed syntax and generated value data. Exact source/version compatibility must be checked before codec use; no persisted artifacts, transport, generation or public API is needed for that first codec qualification.

Acceptance must run request/response/ForecastError fixtures and independent expectations, fresh-value encode/decode laws, alias prefixes, unqualified form/reset cases, Unicode/XML character and escaping controls, zero/one/many arrays, omission/empty distinctions, hostile legal names, wrong source/direction/version, malformed/truncated XML and forbidden DTD/entity inputs. Byte round trips are modulo the declared typed normalization, never original lexical spelling. Use explicit source handles; do not infer trust from digest strings.

The current budget lasts for the entire retained operation request, including repeated value calls. A production reusable client's per-invocation resource lifecycle needs an explicit later decision; codec consumers must neither reset this counter silently nor adopt it as a permanent-client lifetime policy. Resolve the intrinsic key-enumeration limitation above before claiming universal preallocation bounds.

### Recommendation and alternatives

The recommended scoped model retains fresh plain records/arrays, reserves the source-known valid key vector in advance, and explicitly qualifies the intrinsic enumeration of malformed objects. This follows the existing [logical budget traversal](../src/compiler/semanticBudget.ts) and [retained-allocation proxy model](content-model-s06-re-01-resolver-implementation.md#preparation-measurement-evidence), which do not measure V8 allocations or promise a memory ceiling. The user explicitly accepted this qualification under #382 after codebase research and independent review; existing precedent alone was not treated as authorization.

The stronger alternative is an incrementally issued owned value boundary, where every member is added after a charge, or a separately bounded serialized input. Either changes the arbitrary fresh-record interface and requires its own contract/acceptance work. Enumerable-only traversal cannot detect hidden/symbol extras; a guessed cap cannot constrain intrinsic allocation; worker cloning can invoke getters and discard descriptor distinctions. None is a scope-preserving substitute for this inverse.
