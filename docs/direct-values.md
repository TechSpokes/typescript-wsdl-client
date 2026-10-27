# Direct scalar values

Internal direct mapping, bare-root XML codec and portable source contract. See the root [README](../README.md) and [matching contract](content-model-matching.md).

## Current direct-client resource policy

Normal generated-client execution has no profiling work quota, payload-size quota or default SOAP deadline. The application hosting a client or REST gateway owns its resource capacity, timeout choices, logging and failure handling. This policy implements the October 27, 2026 clarification and supersedes older direct-path claims below that test budgets protect consumer applications.

### Plan and implementation

The implementation separates data ownership from profiling, removes artificial allocation reservations, makes normal execution unmetered, and keeps bounded profiles explicit in tests. It reuses the existing copier, validators, codec and transport. Source authorization, native contract identity, correct schema/protocol validation and rejection of unsupported features remain required; they are not resource quotas.

`createApplicationBudget()` supplies the semantic engine interface without collecting counters or rejecting work. Tests explicitly supply profiling limits to opt into the existing measured/bounded engine. The default 125-million-work/100,000-node research profile is unchanged for those tests and research tools; it is not silently installed into ordinary generated calls. Zero usage counters in normal mode mean metering is disabled, not that execution was free.

The generated client options do not expose the internal profiling budget. A caller may still explicitly supply SOAP byte/depth/text/node limits or a timeout for its own application policy. Only supplied size/depth values are enforced in normal mode; an absent timeout or timeout zero creates no SOAP deadline. Configuration is owned before asynchronous use, preserving the earlier mutation fix independently of profiling.

Portable capsule/source handling, generated-file emission, value inverse construction and metadata ownership likewise do not inherit the bounded test profile during normal execution. Existing low-level numeric interfaces use JavaScript's safe-integer representation ceiling to express the absence of a configured quota; this is not a supported maximum workload or a resource-safety promise. Actual process, runtime and operating-system limits can still fail, and those failures belong to the hosting application.

### Testing and optimization profiles

These numbers are selected only when a test opts into profiling. They are not normal client defaults or guarantees that all data below them fits memory.

| Test boundary | Profile value | Purpose |
| --- | --- | --- |
| Local WSDL | 64 KiB | Reproduce small-source qualification cases |
| Capsule | 256 KiB | Exercise at/beyond byte-boundary behavior |
| XML | 1 MiB bytes/text, depth 256, 100,000 nodes | Test concrete buffer and traversal boundaries |
| Fresh values | 1 MiB string content, 100,000 scalar items | Test failure before inverse construction |
| Metadata copies | 100,000 entries, 1 MiB text, depth 256 | Exercise malformed option-graph cases |
| Generated file | 512 KiB conservative bound | Test emission refusal |
| Native algorithms | Existing work/node counters | Compare optimization behavior and test exhaustion |

Text counters use UTF-16 units; byte counters use encoded bytes. Work units remain an internal diagnostic model, not milliseconds, CPU time, heap allocation or RSS. Historical measurements and default research-engine accounting are not rewritten. The extracted ownership implementation preserves those counters when profiling is explicitly selected.

Routine base64/JSON handling, copying, freezing, source bootstrap, codec emission and publication no longer assign artificial work prices. In particular, the node-soap bootstrap does not reserve `4 * sourceBytes²` or invented bootstrap node allocations. Profiling exhaustion stays sticky within a profiled test invocation; each independent invocation creates fresh state.

### Alternatives and product decision

| Approach | Decision | Consequence |
| --- | --- | --- |
| Mandatory library quotas | Removed from normal direct execution | Valid work is not rejected by a test allowance |
| Explicit profiling limits | Retained in test/internal controls | Optimization and at/beyond-boundary evidence remain reproducible |
| Application-selected timeout/size controls | Honored when supplied | The host chooses its own operational policy |
| Worker/process or OS CPU/memory containment | Hosting-application option | Requires deployment and lifecycle decisions outside this library |

The library makes no hard heap, RSS, CPU-time or preemption guarantee. A large workload can exhaust process resources; the hosting application observes and handles that failure. Same-thread timers cannot interrupt synchronous JavaScript. Format, schema and authorization checks remain separate from resource profiling, including the existing restriction to the supported direct grammar and owned-loopback adapter.

### Verification and observed improvement

The diagnostic probe in `test/helpers/directResourceProbe.ts` compares separately loaded builds against the same local server and 10,655-byte WSDL. The archived P3.7 build returned resource-limit with zero requests; the changed build returned soap-response with one request. This demonstrates removal of an artificial rejection, not a latency speedup: the old build never completed equivalent work.

Installed-consumer tests additionally generate and execute a client from a WSDL above 64 KiB with request and response values above 1 MiB using normal defaults. The same generated call explicitly given a 1 KiB application limit refuses before HTTP. Existing request/response/fault, authority, optional/array, mutation/getter/proxy and cancellation controls remain. Tests of profiling limits now opt in explicitly; normal-mode tests assert that no work quota or counters are activated.

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

This section records the historical P3.3 accounting contract. The current direct-client resource policy above supersedes its procedural pricing requirements while retaining data/shape validation and the intrinsic-enumeration limitation.

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

Exact P3.4 review, local/hosted checks and merged-main identities belong to #384 and [roadmap #379](https://github.com/TechSpokes/typescript-wsdl-client/issues/379). The separately scoped P3.5 adapter under #388 now consumes this codec for an internal buffered SOAP 1.1 unauthenticated loopback exchange; its [transport contract and qualifications](content-model-soap-feasibility.md#p35-original-byte-qualification) cover source-byte bootstrap, original response bytes, envelopes, declared Faults and request lifetime. Broad portable bundles, public structured generation, security combinations and activation remain separate work.

The internal decoder accepts a protocol payload selector over the single parsed observed document. Its selected mapping is authenticated against the same operation, and the payload must be an actual descendant by object identity. It reuses structural/scalar checks without subtree reserialization, preserving the complete original document digest, actual coordinates and inherited namespace bindings on the selected response or fault detail. A synthetic tree cannot acquire observed provenance through this seam.

## P3.6 internal portable source capsule

[The private capsule module](../src/compiler/directSourceCapsule.ts) consumes authentic operations and existing native mappings. It adds no package export, public CLI, generated client or admission; package 1.1.4 and legacy defaults remain unchanged. This narrow capsule is not the full ADR bundle format or completion of #185/#186.

### Source authority and reconstruction

An installed consumer must separately authorize a new physical local WSDL copy. `reconstructDirectSourceCapsule(bytes, localSource, {policy, limits?, signal?})` reads that file through the existing resource loader, checks its exact bytes against the capsule, then runs whole-source native qualification, explicit operation selection, the shared SOAP bootstrap guard and fresh native mapping issuance. The reader does not write the source file or choose a filesystem location.

The original checkout URI is never retained, authorized or fetched. File-root and symlink policy remain enforced; resource graphs and network sources are refused. An artifact digest detects corruption and never supplies permission, source authority or signature verification.

`readDirectSourceCapsule(bytes, budget, signal?)` reads bounded data without I/O. Its result is not a contract or a reconstructible handle. Serialized operation/mapping/report objects and copied reconstruction results cannot acquire WeakMap authority.

`createDirectSourceCapsule(contract, {service, port}, signal?)` writes deterministic UTF-8 JSON bytes from a native operation. Its sole source payload is canonical base64 of the exact retained UTF-8 WSDL bytes, including any original BOM; it does not reconstruct WSDL from declarations.

### Format and comparison

The closed format records its capsule/model/scope versions, native mapping and scalar policy versions, and the owned-loopback HTTP runtime policy. Compatibility records the explicit expanded portType/binding, operation, service, port and action, plus request/response/declared-fault message parts, expanded root/type names and native ordered slots with exact bounds and builtins. No executable plan, source path, context identifier, endpoint permission or runtime handle is persisted.

`checkDirectSourceCompatibility(expected, contract, selection, signal?)` requires an identity-issued reconstruction as `expected`, so its embedded source and claimed contract have already been checked together. The actual contract must also be a fresh native operation; raw artifact bytes or JSON copies are refused. A comparison checks complete native-derived descriptors and distinguishes `exact-bytes` from `revised-bytes` without calling either authenticated trust.

Authorized retrieval relocation, harmless QName prefix changes and source formatting can preserve the checked contract. Changed action, service/port/binding/operation identity, expanded roots/faults/members, order, occurrence bounds or scalar meaning require regeneration. Unknown/mixed/legacy formats and unsupported version or policy identifiers fail closed with regeneration guidance.

The reader accepts at most 256 KiB of artifact bytes, 64 KiB of source and JSON nesting depth 16. It rejects malformed UTF-8/JSON, duplicate escaped keys, missing/unknown fields, noncanonical base64, corruption, shared byte backing and unsupported versions before semantic preparation. A recomputed checksum cannot rescue a false source-derived descriptor: reconstruction compares it against the newly qualified source before publishing handles.

### Request resources and installed evidence

Reconstruction starts one fresh request-specific inclusive sticky budget for artifact decoding, duplicate/shape checks, canonical copies/hashes, physical source reading, preliminary syntax, native load/qualification, mappings and publication. Comparison spends the actual operation's existing budget; reading an already reconstructed expected descriptor does not revive or dispatch its operation. Each future independent invocation starts a new budget; there is no reusable-client lifetime counter.

Byte/depth/node limits, cancellation, schema inconclusive, incompatible artifacts, unsupported scope and missing authority remain separate failures. These are engineering work/allocation reservations with cooperative checkpoints, not a hard heap limit or preemptive execution guarantee.

[Installed qualification](../test/integration/portable-installed.test.ts) packs and installs the npm tarball in a separate temporary directory and process. The copied test-only TypeScript harness verifies physical private `dist` imports, denies checkout filesystem reads with Node permissions, blocks implicit fetches, requalifies an authorized copy, relocates it and issues fresh mappings and deterministic XML. Private-module testing establishes no supported package subpath; package exports remain root-only.

### Next consumer boundary

The P3.6 handoff to P3.7 under #195/#201 is implemented by the internal consumer below. It preserves explicit service/port/endpoint authorization and fresh per-invocation budgets. Public exports/CLI, general generated-client design, broader grammar/security and activation require later decisions.

## P3.7 internal generated TypeScript consumer

[The native-plan generator](../src/client/generateDirectClient.ts) accepts an identity-issued reconstructed source, authenticates compatibility and each mapping, and emits one deterministic strict NodeNext TypeScript file plus its exact capsule. It uses the shared preamble composer with a dedicated internal-artifact preamble. There is no public command or package export for this generator.

### Typed internal binding

The generated file has no imports. `createClient(runtime)` receives a trusted internal binding with one `execute` method; the generated operation has the exact source operation spelling as a computed quoted key. [The binding owner](../src/client/directClientRuntime.ts) delegates exclusively to the existing capsule, mapping and buffered SOAP owners. The test harness loads this binding by verified physical installed private-module path; that mechanism is not a supported package subpath or plugin interface.

The generated capsule literal pins the static contract. Each invocation requires matching loaded capsule bytes, an explicitly authorized physical local source and file roots, and explicit SOAP service, port, endpoint and endpoint authorization. The binding copies options before asynchronous work, refuses accessors/proxies and unsupported options, creates one fresh budget, reconstructs native authority from the authorized file, checks native compatibility and calls `exchangeDirectSoap`. No handle, endpoint permission, budget or source authorization is cached between independent calls.

Exact capsule pinning intentionally rejects mixed generated files and capsules, even where a different source might have a compatible semantic shape. Regenerate the matched internal file and capsule after source-byte changes; an authorized relocation of identical bytes remains valid. Capsule reading and checksums confer no permission. Failure results retain native categories and never contain a typed usable value.

### Static shapes and naming

`Request`, `Response` and indexed `Fault_0` declarations are direction-specific roles, not prettified schema names. Equal local names in different namespaces cannot merge these declarations; the capsule retains all expanded native identities. Source keys and operation spellings are JSON-quoted, and operation keys are computed to avoid prototype setters. The generated fault union retains exact declared fault names and value shapes, including scalar and empty roots.

Optional singletons are omittable; zero-or-more slots are required readonly arrays; one-or-more slots are readonly nonempty tuples. Empty sequences use `Readonly<Record<string, never>>`. String, Boolean and int32 map to `string`, `boolean` and `number`; native validation enforces int32 range, exact keys, dense arrays, scalar semantics and occurrence rules that TypeScript alone cannot express. Consumers can enable `exactOptionalPropertyTypes` to reject explicit undefined statically; the runtime always enforces omission semantics.

The inherited node-soap bootstrap refuses `__proto__`, `constructor`, `toString`, other `Object.prototype` names and `prototype` anywhere in source declaration names. These fail before generation and dispatch; this packet does not weaken that boundary or claim arbitrary XML-name execution. Accepted reserved JavaScript words and hyphenated XML names are emitted safely. Broader dependency-name support requires a separately reviewed transport-owner change.

### Accounting and qualification

Emission bounds variable source contributions against a 512 KiB output ceiling before building source strings. `writeDirectClient` authenticates the bounded artifact and refuses an already failed semantic request; procedural emission and writes have no synthetic allocation price. Generated code contains no source path, checkout dependency or private package import.

Native semantic accounting spans qualification and validation without resetting; routine byte copying, base64 comparison, serialization and publication use actual input/output caps. Separate calls get separate budgets; exhausted calls return no partial usable value. Normal calls no longer inherit the old source/capsule/XML test caps or semantic work allowance; cooperative cancellation and any explicit application-selected limits remain available. This is engineering accounting, not a hard heap or preemption guarantee; malformed own-key vector allocation has the same intrinsic qualification as the existing adapter.

[Installed tests](../test/integration/generated-direct-installed.test.ts) generate bounded files for Forecast, renamed and prefix-aliased sources, optional/nonempty-array shapes, scalar and empty roots. They install the actual npm tarball in another directory, compile independently authored valid/invalid TypeScript and execute the emitted wrappers in a child with checkout reads denied. The harness permits only its consumer directory for file reads/writes and verifies real SOAP request namespace/order/scalars, response arrays and HTTP 200/500 declared faults, relocation, stale/mixed inputs, missing permissions, unsupported capabilities, cancellation and exhaustion. Node 24's permission model does not restrict sockets; endpoint restriction remains the native owned-loopback policy. Node versions exposing network permissions additionally receive the explicit loopback grant.

[Independent controls](../test/unit/generated-direct-independent.test.ts) challenge getters/proxies, mutable option metadata, copied authority, sticky exhausted generation and preserved dependency-name refusals. Hosted Linux and Windows Node24/26 run the generated installed qualification explicitly. Public-interface readiness and any remaining blockers belong to a separate P3.8 task; public activation, legacy defaults, package 1.1.4, root-only exports and `admitted:false` remain unchanged.
