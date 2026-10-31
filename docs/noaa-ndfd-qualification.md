# NOAA NDFD source and operation qualification

P3.9-A authentic-source refusal evidence for one NDFD operation. See the root [README](../README.md).

## Result and scope

The original NOAA/NWS WSDL was acquired successfully on October 31, 2026. The existing native loader refuses its declared ISO-8859-1 encoding with `unsupported-capability: Unsupported XML byte encoding`; the operation selector returns `loading-refused` with rule `unsupported-capability` and issues no contract.

This is an unsupported source representation, not an invalid-schema verdict. Whole-schema validity, dated-XSD correspondence, scalar and grammar qualification remain inconclusive or unassessed. No capsule, mapping, codec, generated client or SOAP exchange is reached; no runtime capability is added.

The starting revision independently matched fetched and live remote main: `f7c93f9f3ba720995df47b79ef93e832c0ebcf3d`, tree `9faa8281caa61388a6a3a1beb4d3e90056483daa`. The original checkout was clean and preserved; the isolated task tree began at that exact revision. Package 1.1.5 remains unchanged; post-release commit titles target 1.1.6.

## Provenance and permission

The provider is NOAA National Weather Service, National Digital Forecast Database XML Web Service. The [official service documentation](https://graphical.weather.gov/xml/) links the deployed SOAP metadata route and describes the NDFD operations. Provider documentation and retrieval origin establish service identity; the WSDL's literal `localhost` namespace and address remain as supplied.

The [original WSDL](../test/fixtures/wsdl/real-services/noaa-ndfd/ndfd-xml.wsdl) retains all 27,397 response bytes. Retrieval began at `2026-10-31T08:49:55.6646726Z` and completed at `2026-10-31T08:49:58.3079006Z`; original and final URL were both [the primary WSDL URL](https://digital.weather.gov/xml/SOAP_server/ndfdXMLserver.php?wsdl), with HTTP 200, `text/xml; charset=ISO-8859-1` and successful TLS verification. SHA-256 is `67197bd2c0def2c09a8f3a23b6dee3a9b297840b1e54ce5d56f42614ef3d3aa2`.

The [NWS reuse policy](https://www.weather.gov/disclaimer) permits lawful reuse of NWS web information unless specifically restricted. Attribution, no implied NOAA/NWS endorsement and no modified content presented as official material are required; third-party material requires its own permission. No source-specific copyright, copying restriction or third-party notice occurs in the acquired WSDL or static request example.

These unmodified NOAA/NWS artifacts are public-domain provider material outside the repository's MIT copyright claim. NOAA/NWS does not endorse this project. Encoding declarations, whitespace, documentation, unused declarations and endpoint remain intact; `.gitattributes` disables text conversion for both provider artifacts.

The adjacent [provenance manifest](../test/fixtures/wsdl/real-services/noaa-ndfd/provenance.json) pins original/final URLs, retrieval times, bytes and SHA-256 for the source, official documentation, reuse policy and independent static request. HTML captures remain local acquisition evidence; they are not schema dependencies. Offline tests never re-fetch mutable provider pages. No VIES, private/customer evidence or credentials are included.

The source-intake fixtures live under `test/fixtures/wsdl/real-services/`, separately from the native-parseable conformance graph corpus. Their original encoding intentionally refuses that parser; the focused source-intake tests verify metadata closure and the expected native refusal. The existing conformance graph parser and every existing conformance fixture remain unchanged.

## Resource closure

The resource closure is one WSDL with one inline schema, no WSDL imports, XSD includes, redefines or `schemaLocation` attributes. It has exactly two namespace-only `xsd:import` edges: `http://schemas.xmlsoap.org/soap/encoding/` and `http://schemas.xmlsoap.org/wsdl/`.

Both edges remain intact. The metadata test inventories every import/include/redefine and QName-bearing component-reference attribute; all component references name the inline namespace or XSD builtins. Neither imported namespace supplies a referenced component, so no external schema bytes are needed for this snapshot's resource inventory. Namespace declarations and SOAP encoding URIs are not retrieval instructions; no URL or dependency has been manufactured.

This is byte/resource evidence, not schema construction. The native loader stops before publishing a graph, so native inventory reports `closureVerified: false`, empty resources and unassessed operations. The independent resource inventory grants no native authority.

## Selected operation and independent expectations

The exact selector is port type `{http://localhost/xml/wsdl/ndfdXML.wsdl}ndfdXMLPortType`, binding `{http://localhost/xml/wsdl/ndfdXML.wsdl}ndfdXMLBinding`, operation `LatLonListZipCode`. Provider documentation describes conversion of US/Puerto Rico ZIP codes into WGS84 latitude/longitude values for later forecast queries.

The WSDL declares SOAP 1.1 over SOAP HTTP, RPC style and encoded bodies, with encoding style `http://schemas.xmlsoap.org/soap/encoding/`. SOAPAction is `https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl#LatLonListZipCode`; body namespace is `https://digital.weather.gov/xml/wsdl/ndfdXML.wsdl`.

| Direction | Message | Ordered parts |
|---|---|---|
| Request | `LatLonListZipCodeRequest` | `zipCodeList`, `XMLformat`, `listType`, all `xsd:string` |
| Response | `LatLonListZipCodeResponse` | `listLatLonOut: xsd:string` |
| Fault | None declared | No operation or binding fault |

The [provider static request](https://digital.weather.gov/xml/docs/SOAP_Requests/LatLonListZipCode.xml), retained as [original XML](../test/fixtures/wsdl/real-services/noaa-ndfd/lat-lon-list-zip-code-request.xml), independently specifies `zipCodeList = "21045 20910"`, `XMLformat = "DWML"`, `listType = "zipCode"`, in that order with `xsi:type="xsd:string"`. The original is 654 bytes, SHA-256 `56c06c7044867970f028a5d3037dac6fae15dad137613b947dd952525099be9d`. Provider documentation separately lists the input semantics and DWML/TSML format choices.

The static request uses wrapper namespace `uri:DWMLgen`, differing from the acquired binding. This discrepancy is retained, not repaired into a successful wire oracle. Response coordinates are not independently pinned and no service response was requested. No declared-fault behavior exists to qualify; undeclared SOAP faults remain possible.

The WSDL address is `http://localhost/xml/SOAP_server/ndfdXMLserver.php`. Current provider documentation instead instructs SOAP users to use HTTPS at the provider endpoint and preserve parameter order. The source declares no authentication requirement, SOAP header, WS-Policy or WS-Security contract; actual production security remains unverified. Neither address nor documentation grants endpoint permission.

## Reproduction

After normal pinned dependency installation, run these offline checks:

```bash
npx vitest run test/integration/noaa-ndfd-qualification.test.ts test/tooling/readiness-inventory.test.ts
npm run typecheck:integration
npm run assess:inventory -- --profile default
```

The integration test uses the actual loader, assessment implementation and operation selector on unchanged local bytes with an explicit file-root policy and no allowed network origins. Two fresh assessment requests serialize identically; two fresh selector requests refuse identically. Both `fetch` and socket connections are forbidden and counted, with zero calls asserted, including to the literal localhost service address.

Expected assessment is `execution: failed`, `category: unsupported-capability`, `schema: inconclusive`, `correspondence: inconclusive`, `schemaEligible: false`, `operationInventory: unassessed`, `admitted: false`. Selection is `kind: loading-refused`, `rule: unsupported-capability`, without a contract. Encoding refusal precedes RPC/schema/scalar/transport qualification; later limitations are source observations, not additional native refusal results.

No production SOAP call occurs. Without an authenticated contract, capsule/mapping/codec/generation and installed real-client loopback execution are inapplicable. Existing synthetic installed-consumer checks remain separate regression evidence.

### Validation checkpoint

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

Weather and Forecast remain synthetic. This real source adds authentic encoding/RPC metadata and a native loading refusal, with no expanded supported XSD or SOAP execution claim.

Fresh default and diagnostic inventory runs each record eight inputs, six completed requests, one explicit shared-recursion resource limit and one NOAA loading failure. Six native schemas are established, two remain inconclusive, none is disproved, one has qualified correspondence, thirteen operations are inventoried and none is admitted. NOAA's operation inventory remains unassessed because loading refuses first.

## Owners and next decision

| Boundary | Existing owner | Evidence limit |
|---|---|---|
| ISO-8859-1 source | #171/#172, consumed by #185/#201 | First native refusal; no contract |
| Capsule compatibility | #185/#186 | No capsule issued; checks remain mandatory |
| RPC/encoded type-based multipart request | #190/#191 | Outside document/literal single-element contract |
| Named restrictions and `xsd:all` elsewhere in source | #195/#201 with semantic/scalar owners | Whole-source assessment did not run |
| Production HTTPS/security | #190/#191 | Provider guidance; zero execution |
| Generated runtime | #195/#201 | No authenticated plan |

The next narrow capability decision is whether to admit ISO-8859-1 schema-source decoding while retaining and hashing original bytes, with independent non-ASCII and malformed-input controls. That removes only the first obstruction; RPC/encoded, correspondence and production security still need separate decisions. No encoding/transport capability, public activation, admission/default/version change, release or publication is implemented here.
