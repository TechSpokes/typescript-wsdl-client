# Checked WSDL readiness inventory

Measured source assessment and the next bounded client packet. See the root [README](../README.md).

## Accepted assessment boundary

[P1 PR #371](https://github.com/TechSpokes/typescript-wsdl-client/pull/371) merged as `2a362164e4ece1c840b53243074069c5fe89c4da`, with reviewed tree `7a762018c9512d060aeb5dd10a0031e45c29e6fc`. The [ADR amendment](decisions/003-content-model-contracts.md#checked-product-assessment-amendment-p1-d01) separates native whole-actual direct premises, dated-XSD correspondence, runtime capability, execution and admission.

The production entry is `assessSchemaSource`; the diagnostic command is `wsdl-tsc assess --wsdl-source <source> --report <path>`. Report version is `checked-assessment-v1`, native basis `native-direct-premises-v1`, and the qualified correspondence route is `dated-XSD-2004-direct-v1`. Diagnostic JSON is not an authenticated reusable operation contract or permission to generate.

P1 contract review accepted `7e40478`; implementation review accepted final head `5f66b665659f28ebf84b504cf8ccc31ceec07c93`. All nine head checks passed; actual main had the identical tree. Independent probes exercised direct aliases, duplicate names, correspondence exclusions, native budget exhaustion, malformed reports and loading/CLI cancellation.

## Corpus and reproduction

The [manifest](../test/conformance/readiness-corpus.json) pins seven inputs and nine resource entries with origin, permission, digest, bytes and selection rationale. Weather, import, chameleon and shared recursion reuse [#272](https://github.com/TechSpokes/typescript-wsdl-client/issues/272)'s provenance work; existing conformance sources add repeated/deep composition. New Forecast is authored in P2, separately from the reused-corpus baseline.

Two inputs are synthetic and five are reference controls. No real production-service or reduced tier is counted. The unavailable real tier contains no redistributable complete production-service snapshot; Weather is a repository example and does not establish customer or market coverage.

```bash
npm run assess:inventory -- --profile default
npm run assess:inventory -- --profile diagnostic
```

The [strict TypeScript runner](../scripts/readiness-inventory.ts) calls only the P1 production checker. Each profile is an independent request per input, with no hidden retry or reset. Default limits are 125,000,000 work and 100,000 cumulative nodes; the explicitly selected diagnostic profile uses 1,000,000,000 work and the same node cap.

Every report also records exact loading and publication limits. Complete runs verify the canonical URI identity, digest and byte count of every loaded resource against the pinned closure; partial runs retain `closureVerified: false`. Source/context identity, component origins, interpretation namespaces/bases and all unresolved report obligations remain in the evidence.

## Measured results

Measurements use runner revision `9314ae2bcffd1ce977a35f5da625500f8127ab36`, Node 24.19.0, package 1.1.4 and the pinned lockfile digest in each output. [Default evidence](../test/conformance/readiness-default.json) and [diagnostic evidence](../test/conformance/readiness-diagnostic.json) contain exact counters, contexts, operations, limits, reproduction commands, memory and timing observations.

| Input | Native / correspondence | Execution | Ops | Work | Nodes | API ms | Peak RSS KiB |
|---|---|---|---:|---:|---:|---:|---:|
| weather | established / inconclusive | completed | 9 | 41723204 | 412 | 166.6 | 97892 |
| import | established / inconclusive | completed | 1 | 19528100 | 56 | 72.6 | 70220 |
| chameleon | established / inconclusive | completed | 0 | 18117154 | 32 | 68.2 | 69832 |
| shared-recursive | inconclusive / inconclusive | resource-limit | 0 | 124999821 | 122 | 135.6 | 83476 |
| repeated-composite | established / inconclusive | completed | 1 | 22732410 | 144 | 90.8 | 75432 |
| deep-composition | established / inconclusive | completed | 1 | 19205747 | 54 | 71.9 | 68620 |
| checked-forecast | established / established | completed | 1 | 20269795 | 84 | 80.1 | 69312 |

Both profiles have 7 input requests: 6 completed and 1 resource-limited; 6 native-established, 0 native-disproved and 1 native-inconclusive. Only 1/7 inputs has qualified schema eligibility. The 13 discovered operations include 1 schema-eligible operation and 0 admitted operations; all seven operation inventories completed, including the exhausted XSD-only input's empty operation inventory.

All 13 operations report structured generation unsupported and their six runtime prerequisites not-assessed: 13 unsupported and 78 not-assessed capability entries, with none qualified supported. These are exact selected-corpus denominators. A partial operation inventory would be counted separately and would not imply zero actual operations.

For five completed noneligible inputs, the named blocker is `dated-XSD-correspondence`, outside P1's sufficient direct grammar. Shared recursion exhausts both profiles; its native whole-actual assessment remains unfinished. Neither exhaustion nor unavailable correspondence is an invalid-schema conclusion, and the diagnostic run does not replace or repair its default result.

Wall time measures the assessment API, including its source preparation/checking/publication; it excludes manifest hashing and the runner's report reparse. Peak RSS is the OS high-water value for an isolated child process including Node, module imports, input verification and report handling. It is not incremental checker allocation, a universal complexity result or a throughput benchmark.

## Selected P3 source and behavior

Select synthetic [Forecast WSDL](../test/conformance/fixtures/assessment/forecast.wsdl), 2,456 bytes, SHA-256 `51ae02c9950c15530193231d9f1bfbd5605d00934581cc73336132fa489834ea`. Its complete source closure is this one MIT-licensed WSDL, with one inline `urn:checked:forecast` schema and no imports. The P1 reports establish both native direct scope and the qualified dated-XSD correspondence route under both profiles.

The operation is `{urn:checked:forecast}ForecastPortType/GetForecast`, document/literal SOAP 1.1 with action `urn:checked:GetForecast`. The required request sequence is `city: string`, then `days: int`; response is `city: string`, zero or more ordered `temperature: int` values, then `complete: boolean`. This exercises namespace-qualified order and repeated scalar values without claiming nested composite or record support.

The declared `ForecastError` uses `{urn:checked:forecast}ForecastFault` detail with ordered `code` and `message` strings. Independent [request](../test/conformance/fixtures/assessment/forecast-messages/request.xml), [response](../test/conformance/fixtures/assessment/forecast-messages/response.xml), [fault](../test/conformance/fixtures/assessment/forecast-messages/fault.xml) and [expectations](../test/conformance/fixtures/assessment/forecast-messages/expectations.json) pin application values, SOAP faultcode/faultstring, HTTP 500 and detail separately. These are future codec/transport acceptance inputs, not claims that a codec has run.

The fixture address is a deliberately unusable localhost port. The later transport fixture must inject its actual local server address, retain SOAPAction and text/xml behavior, and exercise requests, responses and declared faults without production dispatch. The real-service validation requirement remains missing and must not be silently replaced by this synthetic target.

## P3.1 entry packet

[#372](https://github.com/TechSpokes/typescript-wsdl-client/issues/372) supplies the bounded entry for #179/#201: an authenticated transient direct-operation source contract, described below. P1 intentionally exposes diagnostic data; the new internal selector joins one operation's input/output/fault roots, source closure and binding/action for structured runtime consumers. Report JSON cannot become that receipt by assertion.

The entry reuses native loading, direct verification and aggregate discharge; resolves one unambiguous operation and its message/fault roots; preserves source/context/model identity; and reports missing runtime capabilities without dispatch or generation. Independent negatives cover ambiguous selection, changed/missing source/message/binding context, diagnostic replay, cancellation and exhaustion. It is a concrete predecessor to matching, with no universal RE01 or full-profile completion claim.

| Component | Existing evidence | Remaining selected-slice owner |
|---|---|---|
| Loading/graph/occurrence | Implemented native source and exact schema analysis | Preserve in #372 |
| Schema assessment/correspondence | Qualified direct facts for this source | #179/#201 transient operation contract in #372 |
| Payload matcher | Direct structure-only matching with unassessed scalar duties | Broader #154/#180/#181 remain |
| Projection/scalar payload | Internal direct values and fresh inverse; qualified logical resource model accepted | #382/#155/#182/#184 |
| Bundle/compatibility | Format-2 graph persistence exists; runtime contract unqualified | #185/#186 |
| XML/codec | Existing legacy templates; selected structured codec unqualified | #187/#188/#189 |
| Buffered transport | Existing legacy SOAP path; selected structured exchange unqualified | #190 |
| Generation/CLI | Legacy generator and P1 diagnostics exist; structured path inactive | #195/#201 |

After #378 structural matching, implement reversible projection/scalars, minimal internal metadata/compatibility, secure XML/codec, buffered binding/transport, then internal generation/CLI integration in that order. Reuse existing owners and the same semantic core. Wildcards, imported/chameleon correspondence, recursive payloads, attributes, nil-enabled declarations, polymorphism, streaming, gateways and OpenAPI are unnecessary for this exact first slice; their broader owners remain open.

Acceptance must exercise order/group boundaries, namespace rebinding, zero/one/many repetitions, int32 edges and invalid values, boolean lexical forms, empty versus absent text, forbidden nil/attributes, round-trip laws, XML security/truncation, local HTTP/SOAP faults, installed consumers and deterministic regeneration. [#369](https://github.com/TechSpokes/typescript-wsdl-client/issues/369) remains blocked on this implemented evidence chain, rather than becoming ready from its schema report alone.

## Validation and retained boundaries

P1 passed fresh dependency/reference setup, full CI with 3,853 tests/294 files and 73 installed-consumer artifacts, full reference with 245 tests/47 files and 14 schemas/40 instances, full conformance with 359 tests/48 files, strict TypeScript, documentation, provenance and toolchain checks. The two new P2 controls verify corpus integrity and execute the production inventory, including its selected direct-schema expectation.

Final P2 nonauthor review, required gate results, merged revisions, actual-main checks and cleanup are recorded in [#368](https://github.com/TechSpokes/typescript-wsdl-client/issues/368). Legacy defaults, full-profile/research claims and package version remain unchanged. No conditional generation, public structured activation, release, tag or publication is part of P1/P2.

## P3.1 internal operation selection

The internal `selectDirectOperation` entry in [directOperation.ts](../src/compiler/directOperation.ts) takes a source, an explicit expanded-name `portType`, an explicit expanded-name `binding`, an exact case-sensitive `operation`, and controlled loading options. It refuses overloaded operation names rather than inferring input/output signatures or choosing a first match. Service addresses remain inert metadata.

[qualifyDirectSource](../src/compiler/checkedSourcePreparation.ts) is shared with diagnostic assessment. One loaded immutable source, prepared native request and inclusive sticky budget cover local actual-component duties, aggregate direct closure, the unchanged P1 dated-direct correspondence route, selection and publication. An unrelated invalid actual declaration still prevents selection; missing correspondence remains inconclusive.

The initial WSDL shape is request-response SOAP 1.1 over SOAP HTTP, effective document style, literal use, one global-element part per input/output/fault, and exact bound fault-name correspondence. An operation style may override a valid binding style; omitted binding style means document. Explicit body `parts` must select the sole part, and SOAPAction must be present, including an explicitly empty action.

The primary binding rules are WSDL 1.1 [request-response](https://www.w3.org/TR/2001/NOTE-wsdl-20010315#_request-response), [SOAP binding](https://www.w3.org/TR/2001/NOTE-wsdl-20010315#_soap:binding), [SOAP operation](https://www.w3.org/TR/2001/NOTE-wsdl-20010315#_soap:operation), [SOAP body](https://www.w3.org/TR/2001/NOTE-wsdl-20010315#_soap:body) and [SOAP fault](https://www.w3.org/TR/2001/NOTE-wsdl-20010315#_soap:fault). Single-part bodies and refusing overloads are this entry's sufficient supported subset, not general WSDL validity rules.

Headers, security, attachments, other SOAP versions/transports, rpc/encoded bodies, type-based/multipart bodies and foreign extensions are unsupported. The conservative extension policy refuses unfamiliar optional extensions too, including extensions outside the selected binding; it skips only WSDL documentation payload and separately qualified XSD syntax. This policy makes no claim that a legal unsupported WSDL is invalid.

Results distinguish `selected`, `selection-refused`, `unsupported`, `invalid-schema`, `inconclusive`, `loading-refused`, `resource-limit` and `cancelled`. Every failure carries usage and a rule, and issues no contract. Loading limits remain additional bounds; cancellation is cooperative at loading, component, selection and publication boundaries.

### Authenticated consumption

`inspectDirectOperation(contract, expectedContext?)` accepts only the exact issued immutable contract object. It returns the exact native context, original loaded source and qualification evidence; every message root contains its actual global element, type reference, message/part identity and source provenance. Copies, JSON reports and foreign contexts fail authentication, even when their deterministic identities agree.

Authority lasts for the retained in-memory snapshot. A later changed source needs fresh loading and qualification and may legitimately issue a different contract; it does not invalidate the old immutable snapshot. Neither a digest nor a context ID authenticates copied data, and no persisted format or package-root export is added.

Run this repository-local example from the repository root with `node --import tsx --input-type=module`, supplying the following program on standard input:

```typescript
import path from 'node:path';
import {selectDirectOperation, inspectDirectOperation} from './src/compiler/directOperation.ts';

const namespace = 'urn:checked:forecast';
const result = await selectDirectOperation(
  'test/conformance/fixtures/assessment/forecast.wsdl',
  {
    portType: {namespace, local: 'ForecastPortType'},
    binding: {namespace, local: 'ForecastBinding'},
    operation: 'GetForecast',
  },
  {loading: {policy: {fileRoots: [path.resolve('test/conformance/fixtures/assessment')]}}},
);
if (result.kind !== 'selected') throw new Error(result.kind + ': ' + result.rule);
const {contract, context} = inspectDirectOperation(result.contract);
const root = context.lookup(contract.input.element.id);
if (root.kind !== 'found' || root.node !== contract.input.element) throw new Error('Foreign root');
console.log(contract.input.element.name, context.resolve(contract.input.type));
```

Selection establishes schema-qualified roots and binding metadata only. `admitted` remains false; matcher, projection, scalar payload validation, bundle, codec, buffered transport and structured generation are explicitly missing. Independent message fixtures remain expectations for later implementation, with no SOAP dispatch or generated artifacts in this entry.

### P3.2 structural matcher checkpoint

The internal [direct structural matcher](content-model-matching.md) now consumes authenticated contracts and all three directions across the current qualified direct grammar. It checks root/order/count/namespace/text and complete consumption while retaining ordered unassessed scalar duties. The original selected contract remains unadmitted, including its historical missing-capability fields.

Independent literal tests and 1,444 finite-language comparisons cover the synthetic Forecast messages and genuinely qualified renamed/form/occurrence/scalar-root/empty-sequence sources. Ownership/resource controls exercise immutable copies, authority, malformed/cyclic/getter data, inclusive limits, cancellation and sticky repeated calls. This finite scope does not establish general S07 or scalar payload validity.

Delivery/review/check revisions are recorded in [#378](https://github.com/TechSpokes/typescript-wsdl-client/issues/378) and the [durable roadmap #379](https://github.com/TechSpokes/typescript-wsdl-client/issues/379). The [scalar/projection implementation](direct-values.md) belongs to #184/#182 under #155; it consumes actual lexical/type/context/map facts and must authenticate receipts before granting scalar authority. #154/#180/#181/#369 and broader owners remain open.

## P3.3 implementation checkpoint

The internal [direct value chain](direct-values.md) now implements issued structural-result consumption, shared datatype scalar validation, complete native mapping and fresh-value inverse with structural/scalar revalidation. Its success remains admitted:false; historic assessment capability flags retain their original meanings. Production codec/transport/generation and broader owner criteria remain open.

Fresh-context nonauthor review identified the intrinsic key-enumeration boundary, and the user explicitly accepted the [qualified logical resource model](direct-values.md#accepted-resource-model) after codebase research and a valid-key-vector precharge improvement. Controlled work, every valid key vector and retained output are precharged; oversized malformed-object engine vectors are excluded, with no hard V8 memory ceiling claimed. Exact review, final validation and protected-delivery evidence is recorded in [#382](https://github.com/TechSpokes/typescript-wsdl-client/issues/382) and [#379](https://github.com/TechSpokes/typescript-wsdl-client/issues/379). The next minimal in-memory metadata and secure XML-value/codec packet is prepared in the direct-value contract, without starting it.
