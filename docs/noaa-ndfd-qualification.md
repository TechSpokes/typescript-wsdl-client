# NOAA NDFD source and operation qualification

Authentic-source intake and bounded owned-server execution evidence for NDFD metadata. See the root [README](../README.md).

## Result and scope

The unchanged NOAA/NWS WSDL plans and generates all 12 operations through checked component generation. Every generated HTTP route has an independently specified owned SOAP exchange, using one installed consumer for client, OpenAPI, gateway, app and scaffold checks. The bounded SOAP 1.1 RPC/encoded profile includes native scalar restrictions and the complete 73-field Boolean record; every output remains an opaque string.

Whole-source native component construction and dated-XSD component correspondence precede selection, generation and fresh runtime artifact reconstruction. The separate narrower direct assessment still completes with native schema `established`, dated-XSD correspondence `inconclusive` and `schemaEligible: false`; its selector returns `inconclusive: whole-source-qualification`. Component qualification does not broaden that older direct-runtime contract.

The original P3.9-A acquisition used main `f7c93f9f3ba720995df47b79ef93e832c0ebcf3d`, package 1.1.5, and observed an encoding refusal. The current reclassification uses the #426 metadata encoding implementation based on main `1f96b4550eafd5fb5a5301a2841c098b05a269ab`, package 1.1.7, without changing provider bytes. This ASCII-only source verifies declaration handling and intake advancement; separate non-ASCII metadata fixtures establish character decoding.

## Provenance and permission

The provider is NOAA National Weather Service, National Digital Forecast Database XML Web Service. The [official service documentation](https://graphical.weather.gov/xml/) links the deployed SOAP metadata route and describes the NDFD operations. Provider documentation and retrieval origin establish service identity; the WSDL's literal `localhost` namespace and address remain as supplied.

The [original WSDL](../test/fixtures/wsdl/real-services/noaa-ndfd/ndfd-xml.wsdl) retains all 27,397 response bytes. Retrieval began at `2026-10-31T08:49:55.6646726Z` and completed at `2026-10-31T08:49:58.3079006Z`; original and final URL were both [the primary WSDL URL](https://digital.weather.gov/xml/SOAP_server/ndfdXMLserver.php?wsdl), with HTTP 200, `text/xml; charset=ISO-8859-1` and successful TLS verification. SHA-256 is `67197bd2c0def2c09a8f3a23b6dee3a9b297840b1e54ce5d56f42614ef3d3aa2`.

The [NWS reuse policy](https://www.weather.gov/disclaimer) permits lawful reuse of NWS web information unless specifically restricted. Attribution, no implied NOAA/NWS endorsement and no modified content presented as official material are required; third-party material requires its own permission. No source-specific copyright, copying restriction or third-party notice occurs in the acquired WSDL or static request example.

These unmodified NOAA/NWS artifacts are public-domain provider material outside the repository's MIT copyright claim. NOAA/NWS does not endorse this project. Encoding declarations, whitespace, documentation, unused declarations and endpoint remain intact; `.gitattributes` disables text conversion for both provider artifacts.

The adjacent [provenance manifest](../test/fixtures/wsdl/real-services/noaa-ndfd/provenance.json) pins original/final URLs, retrieval times, bytes and SHA-256 for the source, official documentation, reuse policy and independent static request. HTML captures remain local acquisition evidence; they are not schema dependencies. Offline tests never re-fetch mutable provider pages. No VIES, private/customer evidence or credentials are included.

The source-intake fixtures live under `test/fixtures/wsdl/real-services/`, separately from the synthetic conformance corpus. Focused source-intake tests verify original-byte identity, decoded metadata closure, all independent operation identities and the selected native plan; installed qualification adds generation and owned HTTP/SOAP execution.

## Resource closure

The resource closure is one WSDL with one inline schema, no WSDL imports, XSD includes, redefines or `schemaLocation` attributes. It has exactly two namespace-only `xsd:import` edges: `http://schemas.xmlsoap.org/soap/encoding/` and `http://schemas.xmlsoap.org/wsdl/`.

Both edges remain intact. The metadata test inventories every import/include/redefine and QName-bearing component-reference attribute; all component references name the inline namespace or XSD builtins. Neither imported namespace supplies a referenced component, so no external schema bytes are needed for this snapshot's resource inventory. Namespace declarations and SOAP encoding URIs are not retrieval instructions; no URL or dependency has been manufactured.

The native loader retains one original resource and both unresolved namespace-only import edges. The planner allows unused imports without invented schemas and relies on whole-source native construction and reference resolution for required components. Genuinely missing referenced components, wrong namespaces, conflicting declarations and denied resource access still refuse; namespace URIs never become implicit retrieval targets.

## Selected operation and independent expectations

The exact selector is port type `{http://localhost/xml/wsdl/ndfdXML.wsdl}ndfdXMLPortType`, binding `{http://localhost/xml/wsdl/ndfdXML.wsdl}ndfdXMLBinding`, operation `LatLonListZipCode`. Provider documentation describes conversion of US/Puerto Rico ZIP codes into WGS84 latitude/longitude values for later forecast queries.

The WSDL declares SOAP 1.1 over SOAP HTTP, RPC style and encoded bodies, with encoding style `http://schemas.xmlsoap.org/soap/encoding/`. SOAPAction is `https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl#LatLonListZipCode`; body namespace is `https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl`.

| Direction | Message | Ordered parts |
|---|---|---|
| Request | `LatLonListZipCodeRequest` | `zipCodeList`, `XMLformat`, `listType`, all `xsd:string` |
| Response | `LatLonListZipCodeResponse` | `listLatLonOut: xsd:string` |
| Fault | None declared | No operation or binding fault |

The [provider static request](https://digital.weather.gov/xml/docs/SOAP_Requests/LatLonListZipCode.xml), retained as [original XML](../test/fixtures/wsdl/real-services/noaa-ndfd/lat-lon-list-zip-code-request.xml), independently specifies `zipCodeList = "21045 20910"`, `XMLformat = "DWML"`, `listType = "zipCode"`, in that order with `xsi:type="xsd:string"`. The original is 654 bytes, SHA-256 `56c06c7044867970f028a5d3037dac6fae15dad137613b947dd952525099be9d`. Provider documentation separately lists the input semantics and DWML/TSML format choices.

The static request uses wrapper namespace `uri:DWMLgen`, differing from the acquired binding. This historical discrepancy is retained. The later authorized ZIP-code observation followed the WSDL namespace and received the corresponding response; observed coordinates are not independent geographic truth. No declared-fault behavior exists to qualify; undeclared SOAP faults remain possible.

The WSDL address is `http://localhost/xml/SOAP_server/ndfdXMLserver.php`. Current provider documentation instead instructs SOAP users to use HTTPS at the provider endpoint and preserve parameter order. The source declares no authentication requirement, SOAP header, WS-Policy or WS-Security contract; actual production security remains unverified. Neither address nor documentation grants endpoint permission.

## Delivered typed RPC profile

Each public request is one object keyed by the original required message parts. `LatLonListZipCode` retains `zipCodeList`, `XMLformat` and `listType`; other operations add decimal, arbitrary-precision integer, date, dateTime and source-defined enumeration inputs, all represented as strings. Booleans remain JSON Booleans. No numeric floating-point or implicit JavaScript Date conversion occurs.

`weatherParametersType` is one ordinary object with all 73 exact source Boolean names. Missing, null, unknown and invalid flags refuse; omitted flags never default to false. The native all-group owner validates actual outgoing children, including unordered input and fixed-value constraints. Canonical writing follows a deterministic source plan and typed accessors preserve named scalar/record namespaces.

Every response is one object keyed by its original output part: `listLatLonOut`, `listCityNamesOut`, `XMLByDayOut`, `XMLOut` or `GMLOut`. Empty strings, escaped XML, Unicode and significant whitespace remain strings without DWML/GML/TSML parsing, schema-hint fetching or geographic validation.

Requests use the WSDL body namespace, unqualified accessors and source message-part declaration order, independently of JSON property insertion order. There is no `parameterOrder`: declaration order is the deterministic writing policy and agrees with the saved request, but proves neither the provider's RPC signature nor live acceptance.

Responses accept one unambiguous struct in the output body namespace and a single string return accessor regardless of their local names, projecting to the source-owned JSON key. Inline values and same-Body `id`/`href` string references before or after the struct are covered, with namespace-resolved explicit types and applicable SOAP encoding root markers. Duplicate or dangling IDs, external references, cycles, nil, unsupported dynamic types, compound values, multiple results, ambiguous roots, wrong namespaces, contradictory encoding and result-plus-Fault mixtures refuse without partial success.

RPC/literal, other primitive families, general nested records, multiple return/out parameters, declared RPC faults, headers, `parameterOrder`, encoded arrays and shared or cyclic object graphs remain outside this profile. Standard SOAP faults remain errors. Existing document/literal, mandatory-header, endpoint/TLS, media-type, cancellation and caller-selected limit checks remain in force.

The source operation set is `LatLonListZipCode`, `LatLonListSubgrid`, `LatLonListLine`, `LatLonListSquare`, `LatLonListCityNames`, `CornerPoints`, `NDFDgenByDay`, `NDFDgenByDayLatLonList`, `GmlTimeSeries`, `NDFDgen`, `NDFDgenLatLonList` and `GmlLatLonList`. Independent owned-server request/response expectations cover each operation; this is not all-operation live-provider acceptance or full SOAP/RPC support.

### Latin1 response boundary

The checked component runtime accepts exact ISO-8859-1 response bytes under the [encoding agreement policy](supported-patterns.md#checked-soap-11-rpc-string-profile). Header, declaration and BOM assertions must agree; unsupported or contradictory assertions refuse before projection. UTF-8 remains the default, with BOM-marked UTF-16 retained. Separate non-ASCII and C1 controls distinguish true Latin1 from Windows-1252, with XML legality, original-byte digests and caller limits retained.

Typed inputs use `component-rpc-typed-values-v1` and a distinct source-capsule interpretation. Existing string-RPC artifacts retain their deterministic identity and source reconstruction requirements. The additive compatible component response extension does not change the narrower shipped direct runtime or source decoder policy.

### Provider observation and live acceptance

The [portable evidence](../test/fixtures/wsdl/real-services/noaa-ndfd/live-zip-evidence.json), copied byte-exactly from [issue #460](https://github.com/TechSpokes/typescript-wsdl-client/issues/460), records the 2026-11-09 08:16 UTC authorized ZIP-code call. NOAA returned HTTP 200 with ISO-8859-1 header/declaration and an ASCII-only DWML string containing `39.203,-76.858 39.0138,-77.0242`; the previous gateway refused it with HTTP 502 at Content-Type. The installed owned-server harness replays those exact bytes offline and compares the complete output string, separately from authored non-ASCII controls.

One controlled repeat of the same input at the explicit verified HTTPS endpoint is authorized for this implementation session. Its delivery result is recorded in the issue/PR handoff; ordinary tests, generation and startup never contact NOAA. One ZIP operation cannot establish live acceptance of the remaining 11, provider availability or geographic correctness.

## Reproduction

After normal pinned dependency installation, run these offline checks:

```bash
npm test -- test/integration/noaa-ndfd-qualification.test.ts test/tooling/readiness-inventory.test.ts
npm run typecheck:integration
npm run test:installed
```

The source integration test uses the actual loader, assessment implementation, direct operation selector and component planner on unchanged local bytes with an explicit file-root policy and no allowed network origins. Two fresh assessments, direct selections and explicit component plans agree. Both `fetch` and socket connections are forbidden and counted, with zero calls asserted, including to the literal localhost service address.

Expected direct assessment is `execution: completed`, `schema: established`, `correspondence: inconclusive`, `schemaEligible: false`, `operationInventory: complete`, `admitted: false`, with all 12 operation names. Direct selection is `kind: inconclusive`, `rule: whole-source-qualification`, without a contract. The explicit component plan has a complete 12-operation inventory, `ready: true`, `executed: false` and no blockers; only `LatLonListZipCode` is selected.

The existing isolated installed-consumer helper reuses its package installation and owned-server harness for the NOAA phase. Public CLI output regenerates deterministically, retains source bytes, builds client/OpenAPI/gateway/app artifacts for all 12 operations and runs generated scaffold tests. Every actual HTTP route verifies exact strings and independently authored namespace-aware request assertions, including all 73 flags and distinctive precision/timezone values; invalid JSON refuses before SOAP, malformed responses return errors, and stale source/artifact controls refuse before dispatch. Attempt-local `checked-gateway-installed/noaa-wire.log` and `noaa-typecheck.log`, `noaa-test.log`, `noaa-build.log` retain the outcome.

### Historical acquisition validation checkpoint

The focused six-test run, strict integration TypeScript, documentation/support-matrix validation and independent nonauthor review pass. The reviewer separately checked original acquisition hashes and reran the four original regression assessments below. The final exact-revision CI, full reference/conformance, package/installed-consumer and hosted platform results are recorded in the [#398 delivery ledger](https://github.com/TechSpokes/typescript-wsdl-client/issues/398).

The first full local `npm run ci` attempt passed toolchain/strict checks, build, required reference, skill/package and docs validation, then reported existing mutual-TLS and CLI timing failures during broad Vitest. The isolated CA-pinned TLS probe reproduced certificate-chain failure with verification enabled; the broad attempt was stopped rather than reported as passing. Tests and TLS checks were not weakened; hosted exact-candidate full CI is required for delivery.

## Separate regression inventory

### Original complex regressions

The original [semantic baseline manifest](../test/conformance/semantic-baseline.json) is a separate 14-case, 40-instance inventory, with exact fixture paths, provenance, expected reference outcomes and owner dispositions. Its selected-contract versus reference-engine disagreements remain explicit, including `zero-element-unbounded`; it is not replaced by the smaller P2 readiness sample.

| Original case ID | Independently specified duty |
|---|---|
| `original-sequence` | One or two addresses |
| `optional-sequence` | Absent wrapper or zero through five addresses |
| `simple-choice` | Exactly one named branch |
| `sequence-order` | Repeated pair order and correlation |
| `choice-boundary` | Zero through five independent choices |
| `zero-group-unbounded` | Disabled group contributes zero |
| `zero-element-unbounded` | Disabled element under unbounded group |
| `required-single` | One nonempty choice |
| `required-multiple` | Two ordered choices |
| `empty-alternative` | Required choice can realize empty content |
| `finite-count-gap` | Two or four items, never three |
| `optional-all` | Optional whole `all` group |
| `wildcard-sequence` | Ordered other-namespace elements with lax duties |
| `invalid-all-sequence` | Schema-level rejection before instances |

Fresh `assessSchemaSource` requests on the four unchanged source WSDLs give these results under the default diagnostic limits and an explicit local fixture-root policy. These are whole-source assessments, not generated-client or wire acceptance.

| Source fixture under `test/conformance/fixtures/` | Native schema | Correspondence | Exact limiting obligation |
|---|---|---|---|
| `xsd/sequences/sequence-occurrence-wrappers.wsdl` | Established | Inconclusive | `dated-XSD-correspondence` |
| `xsd/compositors/choice-union-simple.wsdl` | Established | Inconclusive | `dated-XSD-correspondence` |
| `xsd/compositors/content-model-boundaries.wsdl` | Established | Inconclusive | `dated-XSD-correspondence` |
| `xsd/compositors/content-model-invalid-all.wsdl` | Disproved | Inconclusive | `canonical-build`: native `invalid-schema` |

All four requests complete with `schemaEligible: false` and `admitted: false`. The first three are outside the independently qualified direct correspondence route; this is not invalid XSD. The fourth is the deliberately invalid control. Reproduce each assessment with the existing CLI, substituting the table's source path and a distinct report path:

```bash
mkdir -p tmp/conformance/p39-a
npm run dev -- assess --wsdl-source test/conformance/fixtures/xsd/compositors/content-model-boundaries.wsdl --report tmp/conformance/p39-a/original-boundaries.json
```

An inconclusive report exits 2; a completed native-disproved report exits 3. Original baseline acceptance remains with the manifest's semantic, projection, scalar and codec owners; no original-case generated checked-client qualification is claimed here.

### P2 readiness sample

The [corpus](../test/conformance/readiness-corpus.json) now has eight inputs: one real metadata snapshot, two synthetic controls and five reference controls. Historical [default](../test/conformance/readiness-default.json) and [diagnostic](../test/conformance/readiness-diagnostic.json) outputs remain seven-input P2 evidence at their recorded revision.

| Original reference | Evidence | Historical P2 result |
|---|---|---|
| `import` | Two-resource relative import | Native established; correspondence inconclusive |
| `chameleon` | Include in two namespaces | Native established; correspondence inconclusive |
| `shared-recursive` | Shared recursive graph | Explicit diagnostic budget exhausted |
| `repeated-composite` | Composite occurrence wrappers | Native established; correspondence inconclusive |
| `deep-composition` | Nested composition | Native established; correspondence inconclusive |

Weather and Forecast remain synthetic. NOAA adds authentic encoding/RPC metadata, all-12 bounded original-source owned-server execution, offline provider replay and separate single-operation live evidence.

The historical eight-input default and diagnostic runs recorded a NOAA loading failure and unassessed operations. Current executable inventory checks use the maintained nine-input corpus and require NOAA's pinned closure to verify, its assessment to complete with native schema established and correspondence inconclusive, and all 12 operations to be inventoried without admission. The historical JSON files retain their original revision and are not current-head results.

## Owners and next decision

| Boundary | Existing owner | Evidence limit |
|---|---|---|
| ISO-8859-1 source | #426 under #397 | Original bytes decode unchanged |
| Locationless imports | #426/#427 with source owners | Unused imports permitted; required references still resolve natively |
| Capsule compatibility | #185/#186 and #458 | Fresh reconstruction and stale/tampered refusal remain mandatory |
| RPC/encoded typed parts | #458/#460 under #427 | All-12 owned execution; one flat Boolean record |
| Whole-source direct correspondence | #195/#201 with semantic/scalar owners | Native schema established; correspondence inconclusive |
| Production HTTPS/security | #190/#191 | Single ZIP-code live evidence; no general security acceptance |
| Generated runtime | #458/#460 | All-12 installed HTTP routes and owned opaque string exchanges |

Issue #458 delivers the bounded component string profile and unused-import correction while preserving original bytes and digests. Broader #427, #426 and #397 work, narrow direct correspondence, the provider request namespace discrepancy and production security retain their separate owners and acceptance. No default/version change, release, publication or universal research closure belongs to this qualification.
