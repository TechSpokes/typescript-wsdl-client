# Direct scalar values

Internal P3.3 mapping/inverse and P3.4 bare-root XML codec contract. See the root [README](../README.md) and [matching contract](content-model-matching.md).

## Implementation checkpoint

One integration owner implements the complete chain under #382, #155, #184 and #182. Inputs are an authentic operation, a newly issued successful structural match, or an authentic source-derived mapping plus fresh application data. Receipt identity, never digest or diagnostic JSON, supplies authority.

The complete native root plan determines every slot, including unobserved optional members. Scalar roots project to primitives; complex roots project to owned null-prototype records keyed by distinct source local names. Required singletons are required; optional singletons are omitted when absent; unbounded members always have dense ordered arrays, empty only when min=0. Empty sequences yield empty records.

String content is preserved; boolean maps to boolean; validated int32 maps exactly to number, normalizing negative zero to zero. Original lexical spellings, declaration/type identities, namespaces and source paths remain immutable evidence. The inverse accepts fresh values, reconstructs expanded names and source order with canonical scalar spellings, and reuses structural and shared scalar validation. It produces lexical data, not XML bytes.

Data inputs are plain records and dense arrays without proxies or accessors. Unknown keys, symbols, nonenumerable fields, inherited/custom prototypes, boxed/callable values, sparse/extra-property arrays, missing required members and wrong scalar types are refused without coercion, getters or caller mutation. Ordinary Object.prototype and null prototypes are accepted for fresh records.

The original inclusive sticky request budget covers controlled inspections, planning, values, text, keys, construction, revalidation and publication, subject to the intrinsic enumeration limitation below. Cancellation is cooperative; failures issue no partial receipt. No new runtime budget lifetime is introduced. Success still has admitted:false; transport, persistence, generation and public activation remain deferred. The internal byte codec below extends the value boundary only.

## Laws and rule basis

For admitted data-only fresh application values, project(validate(expand(v))) equals normalizeApplication(v). Expansion of a projected validated payload preserves expanded names, declaration order, occurrence counts and typed values modulo canonical scalar spelling. Normalization is deterministic, idempotent and non-mutating; it changes only record key order/prototype ownership and numeric negative zero, never repairs invalid shapes.

These are the original in-memory structure/value laws. The byte codec below extends them across its qualified XML boundary. Scalar rules come from the dated [XSD Datatypes recommendation](https://www.w3.org/TR/2004/REC-xmlschema-2-20041028/): string 3.2.1, boolean 3.2.2, int 3.3.17, integer 3.3.13 and whiteSpace 4.3.6; XML character validity follows XML 1.0 Char. Neutral datatype calculations are shared with schema assessment; payload diagnostics and issuance are separate.

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

## Internal bare-root XML codec

P3.4 under [#384](https://github.com/TechSpokes/typescript-wsdl-client/issues/384) implements the minimal in-memory consumer for #185/#186/#187/#188/#189. Its metadata is the original authentic operation and source-owned mapping with version `direct-values-v1`; no additional bundle or fingerprint authority is introduced. The broader owners retain their full-profile acceptance criteria.

`encodeDirectXml(contract, mapping, freshValue, options?)` calls `expandDirectValue` before emitting deterministic UTF-8 bytes. It returns `direct-encoded` with caller-owned mutable `bytes`, the authentic `expanded` receipt, encoding and usage. The byte array is data, never authority; changing it cannot change the validated expansion or authenticate another payload.

`decodeDirectXml(contract, mapping, bytes, options?)` accepts a non-shared `Uint8Array` or Buffer, copies its native byte slots without length/buffer/iterator getters, parses ordered observed syntax, then calls `matchDirectOperation` and `assessDirectScalars`. It returns `direct-decoded` with immutable observed `payload`, authentic `validated` receipt and usage. Both APIs are internal exports from [directCodec.ts](../src/compiler/directCodec.ts), absent from the package public API.

Identity checks precede property/version interpretation. Foreign/copied/JSON/wrong-version handles throw TypeError; genuine future incompatible metadata returns unsupported. Direction and exact root come from the mapping, with no guessed catalog upgrade or source reload. SOAP 1.1 document/literal binding/action remain source metadata and authorize no I/O.

### Supported values and joint laws

The codec covers the entire currently admitted direct grammar: string/int/boolean scalar roots and named element-only flat distinct scalar sequences, including empty sequences and every admitted optional/required singleton/unbounded pair. It preserves optional omission versus present empty strings and always-present dense repeated arrays. It emits schema order, independent of application key order, without synthetic application containers.

For valid fresh data, `decode(encode(v)).validated.value = normalizeApplication(v)`. For admissible XML, re-encoding the decoded value preserves expanded names, declaration order, occurrence counts and exact typed values modulo canonical scalar spelling. It preserves string content; boolean emits true/false, int32 emits exact decimal with numeric negative zero becoming zero. This is not original lexical-byte identity or a signed-byte round trip.

Prefixes are allocated by first source-order use of expanded namespaces, then bound at each use. The encoder never emits a default namespace, so unqualified children stay unqualified without inheriting an ambient default. Text escapes ampersand/angle brackets, preserves Unicode and encodes CR as `&#13;`; namespace attributes additionally escape quotes/tab/newline. The delivered shared scalar core checks XML characters and scalar validity before successful encoding.

### Secure byte boundary and provenance

The codec reuses [orderedSyntax.ts](../src/loader/orderedSyntax.ts) with namespace-aware `saxes` 6.0.0, strict fatal decoding and XML 1.0-only mode. Saxes is an in-memory tokenizer with no resolver or external I/O; DTD declarations are refused, predefined/numeric references are processed, and unknown/general/external entities fail. Schema locations, namespace URIs and xml:base are never fetched; unsupported application attributes, nil and xsi:type fail through the existing matcher.

UTF-8 with optional BOM and BOM-qualified UTF-16LE/BE are supported. XML declaration encoding must agree with the bytes; unsupported encodings, doubled BOMs, isolated surrogates, malformed Unicode, namespace errors, multiple roots and truncated syntax fail without repair. XML 1.1 is unsupported. BOM-less UTF-16 is refused. EOF completion precedes any successful decoded result.

Observed syntax retains the digest of the exact incoming bytes, caller-supplied absolute `options.uri` (default `urn:typescript-wsdl-client:observed-direct-xml`), namespace contexts, lexical text and numeric source paths. Positions remain one-based lines/columns and zero-based UTF-16 offsets in BOM-decoded text, as in the syntax owner; these are decoded-text positions, not byte offsets. Generated expansions retain their explicit generated URN/empty digest/zero positions and are never relabeled as observed input.

Malformed XML returns `xml-invalid`; unsupported syntax/semantics returns `unsupported`; valid XML with wrong structure returns `mismatch`; shared-core lexical failures return `scalar-invalid`; fresh shape/type errors return `value-invalid`. Cancellation and resource limits remain separate terminal failures, with no bytes or validated payload on failure. Diagnostics contain safe fixed rules and source coordinates rather than raw payload text; native internal errors propagate.

### Resources and cancellation

`options.limits` may set positive safe-integer `maxBytes`, `maxDepth`, `maxNodes` and `maxText`. The initial internal codec profile defaults to 1 MiB bytes, depth 256, 100,000 emitted/retained syntax nodes and 1 MiB aggregate element text in UTF-16 units; it deliberately does not claim the broader ADR buffered transport profile. Limits are inclusive and apply per invocation; raising them never raises or resets the original request budget.

The inclusive sticky operation budget still covers selection, mapping, inverse, parser/encoder traversal, native byte copies, hash/decoder/SAX token buffers, line indexes, inherited namespace/path copies, scalar checks and publication. Bytes are capped and bulk work reserved before copying/decoding/tokenization, including ignored comments, processing instructions and forbidden DTD tokens. Namespace/path copies, relative xml:base URL resolution and retained nodes/text are charged before construction. The engine-intrinsic exclusion for malformed arbitrary application key vectors remains exactly as accepted above.

A configured syntax cap fails that invocation; work already spent remains spent. Exhaustion of the original operation work/node budget is sticky across both codec APIs and all earlier APIs. No V8 heap ceiling or instantaneous preemption is promised. Cancellation is cooperative at entry, parser chunks of at most 1024 decoded UTF-16 units, node/text visits and before publication; the bounded decoder/hash intrinsics complete before the next checkpoint.

Encoder node/text accounting includes generated empty text nodes; the parser counts retained text events, so empty XML elements may consume fewer nodes. Both stages honor their declared inclusive caps; neither metric is a wire-byte equivalence claim. A production reusable client's per-call budget lifetime remains a later explicit decision, not a permanent-client counter or new session framework.

### Runnable codec example

After selecting an authentic operation with the earlier example, use its contract and mapping directly:

```typescript
import {encodeDirectXml, decodeDirectXml} from './src/compiler/directCodec.ts';
import {createDirectValueMapping} from './src/compiler/directValues.ts';
import type {DirectOperationContract} from './src/compiler/directOperation.ts';
declare const contract: DirectOperationContract;
const mapping = createDirectValueMapping(contract, {kind: 'input'});
if (mapping.kind !== 'direct-mapping') throw new Error(mapping.kind);
const encoded = encodeDirectXml(contract, mapping, {city: 'Paris', days: 2});
if (encoded.kind !== 'direct-encoded') throw new Error(encoded.kind);
const decoded = decodeDirectXml(contract, mapping, encoded.bytes);
if (decoded.kind !== 'direct-decoded') throw new Error(decoded.kind);
console.log(decoded.validated.value);
```

### Qualification and remaining boundary

[Codec controls](../test/unit/direct-codec.test.ts) run the actual Forecast request/response/ForecastError fixture payload bytes against independent expectations, fresh-byte laws, renamed/form/prefix sources, scalar/empty roots, all counts, reserved names, Unicode/CR/escaping, encoding/security failures, authenticity, cancellation and inclusive limits. [Nonauthor controls](../test/unit/direct-codec-independent.test.ts) independently exercise BOM/URN repairs, native byte access, chunk boundaries and observed provenance. These are bare-root tests; their test-only SOAP extraction is not a production envelope parser.

Exact final review, local/hosted checks and merged-main identities belong to #384 and [roadmap #379](https://github.com/TechSpokes/typescript-wsdl-client/issues/379). SOAP envelopes, endpoints, security, HTTP dispatch, real-wire response/fault policy, persistence and structured generation remain unimplemented for this selected path. Prepare the smallest buffered SOAP packet under #190/#191 only after P3.4 delivery, and do not start it automatically.
