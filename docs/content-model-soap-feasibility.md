# Content Model SOAP Adapter Feasibility

Executed local SOAP evidence for S02, #169, and the adapter consumers #190/#192/#193. See the root [README](../README.md).

## P3.5 original-byte qualification

The historical buffered `response` event described below exposes decoded text, not original HTTP entity bytes. Its event ordering and namespace-content observations remain useful, but it supplies no original encoding, BOM or byte-digest provenance. P3.5 supersedes that byte-provenance inference with an executed request-local hook in the locked `soap` 1.13.3 HTTP client.

The [seam probe](../test/integration/direct-soap-seams.test.ts) bootstraps the original Forecast WSDL text with its original source URI, explicitly selects `ForecastService.ForecastPort.GetForecast`, supplies one literal `_xml` body and sets SOAPAction in per-call extra headers. It uses the dependency's existing `HttpClient.request` with `responseType: arraybuffer`, `decompress: false`, `maxRedirects: 0` and a response-byte cap. The captured BOM-qualified UTF-16LE response equals independently supplied server bytes; a decoded UTF-8 reconstruction would fail this assertion. The production adapter separately validates fresh values and its final envelope before dispatch.

The [internal adapter](../src/compiler/directSoap.ts) wraps only the existing dependency callback. A private completion error without response data prevents node-soap's name-keyed parser, including its error-response parser, from running. The normal dependency HTTP stack still owns dispatch and bounded native buffering; no replacement HTTP or SOAP stack is introduced. Captured bytes reach the existing ordered parser before any text conversion.

### Source authority and exact dispatch

The semantic source loader privately retains its original policy-authorized resource bytes by native `SchemaInput` identity. The adapter obtains a precharged owned copy from that snapshot through [the source bridge](../src/loader/schemaInput.ts), never through a digest, caller-supplied report, regenerated WSDL or source refetch. Tests delete a renamed original WSDL after operation selection and still complete the actual exchange.

This first bootstrap accepts one original UTF-8 WSDL resource, matching the current dated direct schema grammar's absence of include/import. Resource graphs, import/include/redefine triggers even in foreign syntax, unsupported WSDL extensions, dependency-reserved names and unsafe namespace interpolation are refused before dependency bootstrap. An import-location hook also prohibits dependency fetching. Arbitrary resource-graph support is not claimed.

The caller explicitly names the service expanded name and port. Source syntax must bind that exact port to the authentic operation binding; dispatch uses only the corresponding own dependency method and immutable per-call action. The adapter checks the final dependency envelope, body, action, content type and endpoint before HTTP I/O using the same codec/parser/matcher/scalar chain. It never mutates global SOAPAction or selects the first port.

### Buffered protocol and capability scope

`exchangeDirectSoap` is internal and accepts one authentic operation/input mapping, fresh application values and closed request-local configuration. Dispatch requires an explicit endpoint override and an allow callback for that exact endpoint. This packet accepts only explicitly owned ephemeral IPv4 loopback HTTP servers; the fixture's port 1 metadata grants no authority and is never contacted.

Input validation precedes dependency bootstrap and network execution. Response success requires HTTP EOF, allowed status and content type, encoding agreement, a complete SOAP 1.1 Envelope with one Body payload and successful shared direct validation. An absent or empty Header is accepted; every populated SOAP Header and protocol attribute is refused before application normalization. The envelope has explicit prefixed namespace bindings, so unqualified application children retain their namespace.

HTTP 200 and 500 declared Faults return `soap-fault` with typed detail, the observed expanded faultcode QName and its immutable original `codeNode` with namespace context and coordinates. The separate protocol layer checks Fault child order, cardinality, namespace, optional actor, textual code/string and exactly one declared detail. It resolves faultcode using the actual observed node's inherited bindings and the shared QName owner. Unknown/ambiguous detail, malformed protocol, unbound codes and HTTP 500 ordinary bodies fail without partial values.

The adapter refuses requested SOAP 1.2, HTTPS/TLS/mTLS, authentication, WS-Security, signing, arbitrary HTTP/SOAP headers, attachments, redirects, compression and streaming. Response redirects are never followed; compression and populated SOAP headers cannot become successful application results. Legacy transport capabilities and defaults remain unchanged; this internal unauthenticated slice does not qualify those wider combinations.

### Lifetime, accounting and evidence

The original operation budget remains inclusive and sticky across source preparation, encoding, original-byte copies, dependency bootstrap, final-envelope validation, HTTP buffering, parsing, direct decoding and publication. Native bootstrap receives conservative source-size work and syntax-node reservations before entry. The complete configured response-buffer/copy capacity is reserved before dispatch; retained response bytes are copied only within that reservation. Default XML limits remain 1 MiB, depth 256, 100,000 syntax nodes and 1 MiB text, without raising semantic defaults.

The work/node counters are the existing engineering accounting model, not a V8 heap ceiling or instruction-level preemption. Axios may receive one native incoming chunk before rejecting a response that exceeds its configured byte cap; no oversized response is parsed, published or returned. Native buffers and decoder/parser intrinsics retain their actual scope. The existing intrinsic bulk-key-vector qualification also applies to closed internal option records: valid option keys are reserved before enumeration, but a malformed record can cause a larger temporary key vector before its unknown fields are rejected. Exhaustion never becomes invalidity or usable partial success.

The adapter owns one nonpersistent HTTP agent, AbortController and deadline per call. Cancellation and terminal failures abort pending I/O and destroy that agent in `finally`; listeners and deadline handlers are removed. Tests own and close their ephemeral servers and sockets. Transport, protocol, XML, value/scalar, unsupported, cancellation and exhaustion results remain distinct; diagnostics do not retain raw HTTP errors or payload text.

The [real-wire acceptance suite](../test/integration/direct-soap.test.ts) consumes the actual Forecast fixtures and independently asserts captured outgoing expanded names, order, counts, headers and literal content, with external validation of the actual captured request subtree. It covers native receipts and byte digests, renamed source/operation/service/port/members/faults, namespace aliases, UTF-16 response bytes, HTTP 200/500 Faults, no-request controls, malformed envelopes/entities, limits, inclusive sticky work/node boundaries and cancellation. Independent nonauthor transport controls and exact delivery/check identities are recorded in [#388](https://github.com/TechSpokes/typescript-wsdl-client/issues/388).

Admission remains `false`; package version remains 1.1.4. This packet adds no public API, generated client, persistent bundle, activation, release or production endpoint qualification. The subsequent generated-client/compatibility packet belongs to #185/#186/#195/#201 and requires a separate execution request.

## Decision and scope

The SOAP 1.1 document/literal HTTP minimum in [ADR-003](decisions/003-content-model-contracts.md#soap-adapters-and-security-ordering-s02-d07) is feasible through bounded adapters. One pre-encoded body reaches both actual generated execution paths, and raw response bytes preserve the context that a shared decoder needs before name-keyed materialization. These tests activate no faithful production mode and make no new shipped support claim.

Retain [ADR-002](decisions/002-streamable-responses.md)'s dedicated streaming transport, opt-in behavior, backpressure direction and terminal-error policy. Its measured node-soap buffering reason remains valid; this probe does not remeasure dependency streaming alternatives. Supersede the hand-built name-keyed payload and record conversion on the future faithful path with the #188 encoder and #189 decoder, while preserving the legacy path under ADR-003's compatibility contract.

The minimum is established by executed seams, not by accepting current omissions. Explicit binding/action dispatch, raw decoding, fault detection and consumption-bound cancellation have concrete small correction points. Authentication, signing, TLS and SOAP 1.2 remain separately qualified streaming capabilities; #192 must reject every required combination before dispatch until its adapter has executed qualification.

## Reproduce and evidence identity

The [Vitest probe](../test/integration/content-model-soap-feasibility.test.ts) generates a client from the committed [WSDL](../test/conformance/fixtures/soap/content-model/probe.wsdl) using the current pipeline. Its [test helper](../test/helpers/contentModelSoapProbe.ts) starts HTTP/HTTPS listeners on loopback, owns generated files under `tmp/conformance/`, and closes listeners and generated directories after testing.

```bash
npm ci --cache tmp/cache/npm
npm run reference:setup
npx vitest run test/integration/content-model-soap-feasibility.test.ts --reporter=verbose
npm run typecheck:integration
npm run test:conformance
npm run docs:validate
npm run smoke:pipeline
```

Normal `npm ci` supplies the pinned Node/WASM dependency. Missing or mismatched dependencies fail the probe; required validation is never silently skipped.

The historical starting revision is `2f88ec81f77f4fc5a06b78f2d507ae8e20fe7a7c`, tested with Node 24.19.0, Python 3.12.14, soap 1.13.3, saxes 6.0.0, Axios 1.20.0, Vitest 5.0.3 and TypeScript 6.0.3. Current signature verification retains the locked transitive xml-crypto 6.3.3 and @xmldom/xmldom 0.8.15; no dependency is added.

Local validation passed eleven probe tests, 138 conformance tests, integration TypeScript checking, documentation validation and the pipeline smoke check. The signing test emits an upstream xml-crypto deprecation warning from node-soap's existing signature implementation; the signature verification and tamper rejection still pass.

The [independent capture helper](../test/helpers/contentModelSoapReference.ts) validates actual captured bytes using `libxml2-wasm@0.7.2`/libxml2 2.15.1 and a separately named scoped fixture grammar under [NT-CONT-01](reference-validation.md). Historical lxml/xmlschema results remain historical; no production model supplies expected validity. Inherited QName namespaces survive payload extraction, and external resources, DTDs and ambiguous Body boundaries are prohibited.

## Payload and incoming context

The [ordered fixture](../test/conformance/fixtures/soap/content-model/ordered.xml) contains repeated choice `(a,b)|c`, repeated `(p,q)`, invisible token grouping, a QName and a nil element retaining `id="7"`. Historical engines, the current primary and scoped grammar accept it and reject the [grouped-by-name fixture](../test/conformance/fixtures/soap/content-model/name-keyed-invalid.xml).

Captured generated legacy requests group sibling values as `a,a,b,b,c` and `p,p,q,q`. The buffered request is schema-invalid; the streaming request also lacks the namespace declaration needed by its manually supplied `xsi:nil` attribute. The faithful pre-encoded body preserves `a,b,c,a,b`, `p,q,p,q`, namespace context and nil attributes on both paths, and the captured outbound envelopes independently validate.

The node-soap `_xml` document hook preserves the complete body element, byte-for-byte within its envelope. The documented `$xml` child hook preserves ordered pre-encoded children, including their explicit namespace declarations. The generated `toSoapArgs` already forwards these test inputs; generated public request types do not yet expose a faithful codec API.

Buffered incoming XML is captured from the dependency's `response` event before `wsdl.xmlToObject` runs. The test asserts event order and the preserved expanded names, QName prefix binding, nil state and `id` attribute from actual response bytes. The normal generated `responseRaw` also matches the captured response, but its callback arrives after name-keyed parsing; faithful verification/decoding must use the earlier boundary.

On streaming calls, a test-only override of the generated `webStreamToAsyncIterable` hook feeds each actual HTTP chunk through namespace-aware saxes before yielding those same bytes into shipped `parseRecords`. Ordered records and attributes are available before that parser merges repeated siblings or reduces nil-with-attributes to `null`. A response using `p:record` and an alternate nil prefix remains fully visible to the raw tap, while the shipped lexical-name record matcher yields zero records.

The raw syntax capture does not match particles, assess scalar values, validate the SOAP wrapper grammar, or invent grouping history. Its bounded retention of the complete small response is evidence instrumentation, not a production buffering recommendation.

### Invisible boundaries

Grouping `[x],[y,z]` and grouping `[x,y],[z]` produce the same three `token` nodes. Neither HTTP transport can recover which grouping was supplied. Normalize both to the same ordered token value under #182/#189; independent name-keyed arrays cannot preserve observable interleaving for the other sections.

## Capability matrix

`Executed success` means the stated behavior was asserted against local HTTP bytes or TLS authentication. `Executed failure` means an assertion characterizes a current omission; tests passing do not turn that omission into support. Test-only seams are identified separately from generated behavior.

| Capability | Buffered generated path | Dedicated generated streaming path | Tested seam or first owner |
|---|---|---|---|
| Shared ordered body | Success with `_xml` or `$xml` input seam | Legacy encoder fails ordered semantics | `buildSoapEnvelope` body hook succeeds; #188/#192 |
| Raw response before name-keying | Dependency response event succeeds | Original chunk source is available | Namespace-aware chunk tap succeeds; #190/#192 |
| Namespace/QName/nil attributes | Raw bytes retain context | Raw bytes retain context; parsed records lose it | Ordered tap including prefix aliases succeeds; #189 |
| SOAP 1.1 document/literal | Envelope succeeds | Envelope succeeds | Explicit body/action fixture; #190/#192 |
| Explicit service/port | Selected buffered port endpoint succeeds | Overrides ignored; first port selected | Buffered port method pin succeeds; #190/#192 |
| SOAP action | Shared-port-type action overwrite fails | Compiler action sent for first binding | Per-call buffered HTTP action override succeeds; #190 |
| Endpoint option/setEndpoint | Both succeed | Both ignored | Dedicated resolver requires selected binding; #192 |
| SOAP 1.2 | Explicit port plus forceSoap12Headers succeeds | Option ignored; SOAP 1.1 sent | #192 rejects pending independent qualification |
| HTTP request headers | Configured header delivered | Configured node-soap header omitted | #192 envelope/HTTP capability boundary |
| HTTP response headers | Dependency exposes headers | Generated result exposes headers | Streaming `x-probe` asserted; #190/#192 |
| SOAP request/response headers | Both delivered/returned | Request header omitted; result contains HTTP headers | #192/#193 parse and enforce SOAP headers |
| HTTP Basic | Authenticated local request succeeds | Credentials omitted; protected listener returns 401 | #192 rejects until auth adapter is qualified |
| WS-Security UsernameToken | PasswordText token delivered | Token omitted | No server token verification claim; #192 |
| WS-Security outgoing signature | Body signature verifies locally | Signature omitted | Final-body signing preserved buffered; #192 |
| TLS client authentication | Server authenticates test certificate | Configured trust/client credentials not transferred; fetch fails | #192 rejects until TLS transport is qualified |
| HTTP 500 failure | Promise rejects | Promise rejects before record result | HTTP status handling retained; #190/#192 |
| SOAP fault with HTTP 200 | Promise rejects with fault | Fault silently appears as empty records | Namespace-aware fault tap rejects; #192/#193 |
| First record before HTTP EOF | Buffered by design | Actual generated iterator yields before gated EOF | Ordered tap also available before EOF; #192 |
| Malformed EOF after a record | Not a success contract | Provisional record then iterator rejection | Tap records terminal failure; #193 |
| Early consumer return | Not applicable to buffered result | Reader lock released, upstream input not cancelled | `reader.cancel()` seam succeeds; #193 |
| Buffered user abort | Public generated method exposes no signal | Not applicable | Per-call node-soap signal forwarding succeeds; #190 |

### Binding/action correction and concurrency

The fixture intentionally places SOAP 1.1 and SOAP 1.2 bindings on one port type. In soap 1.13.3, the later SOAP 1.2 method action overwrites the action observed through the earlier SOAP 1.1 port. The test asserts this failure before correcting it; a single-binding fixture would hide it.

The bounded correction pins the selected service/port operation and forwards `SOAPAction` as a per-call HTTP header through the existing node-soap method's extra-header argument. It does not mutate `setSOAPAction` between requests. #190 must dispatch from immutable operation/binding metadata and keep per-call action/options isolated; using the mutable global setter for concurrent operations is rejected.

SOAP 1.2 is executed with its selected port, SOAP 1.2 envelope namespace and `application/soap+xml` action parameter. That executed case does not qualify every multi-binding action override or streaming SOAP 1.2 combination. #190 must emit the selected action in the version-appropriate per-call convention, and #192 must reject an unqualified version.

## Lifecycle and security boundaries

The streaming test uses a server-controlled gate after its first complete record. `next()` returns that record while the server has not ended the response; the tap's outcome remains `pending`. Further consumption and well-formed XML EOF produce the tap's syntax outcome `success`, while malformed EOF and SOAP fault detection produce `failure`.

This is a consumption/completion seam, not whole-response semantic certification. #193 adds the selected SOAP grammar, wrapper/trailing policy, record/scalar and aggregate validation before reporting faithful completion. A companion record schema alone cannot certify an opaque wrapper.

Current generated early return only releases the web reader lock and leaves the gated response open. The small test-only reader override calls `reader.cancel()` on return, observes the upstream connection close, and records `cancelled` rather than `success`. #193 must additionally own cancellation before iteration starts, abort while a read is pending, deadlines, resource limits and an explicit terminal result.

Buffered cancellation succeeds when its existing operation-call hook forwards an `AbortSignal` to node-soap's HTTP request. The current generated public method omits that argument, so native generated cancellation is not claimed. #190 must expose operation-local cancellation without sharing mutable options.

Outgoing body signing is separately executed: node-soap signs the pre-encoded body, xml-crypto verifies the captured request, and changing an `a` value invalidates that signature. This proves the final-body request seam retains signing; it does not prove incoming response verification or streaming signing.

Incoming signed responses, encrypted responses, UsernameToken server verification, PasswordDigest, timestamp/replay validation, `mustUnderstand`, certificate rotation, remote production endpoints and combined auth/security modes remain unverified. No node-soap callback or raw syntax tap is assumed to authenticate them.

If incoming signature verification requires EOF, #190 uses bounded verification before semantic decoding and #192/#193 reject record yielding until an independently qualified incremental verification protocol exists. Raw bytes remain available at the security boundary; normalization after signing or before verification is forbidden. No signature failure or consumer cancellation can certify successful completion.

## Adapter recommendation and downstream gates

#190 should receive one already validated/encoded body from #188, select a declared port/version/action, use the proven `_xml` or `$xml` seam, and retain node-soap's envelope/header/security/HTTP responsibilities. Its raw response interception precedes name-keyed parsing and any required security verification precedes #189 decoding. It must correct the shared-port action collision and expose cancellation per call.

#192 should retain dedicated incremental HTTP I/O, inject that same body through its envelope boundary, and pass namespace-aware raw chunks to #189 instead of the legacy `parseRecords` projection. Its selected binding boundary owns endpoint, version, action, HTTP/SOAP headers and HTTP security options; its security stage signs the final envelope. It cannot infer compatibility from the presence of a node-soap security object that the dedicated fetch never uses.

#193 owns faults, SOAP/wrapper completion, cancellation and bounded consumption. The fault/cancellation tap proves small seams exist; production fault detail, fault timing, post-record faults and aggregate constraints still need independent implementing fixtures. The tap's namespace alias behavior is proof of access, not the production decoder implementation.

Before any dispatch, #190/#192 must compare the requested bundle capabilities against an executed adapter capability set. A required capability without qualification must fail with `unsupported-capability` before sending any request; dropping credentials, signatures or headers is prohibited. When a newly required combination lacks an evidenced seam, it blocks S02's foundational decision or the affected implementation instead of becoming an incidental limitation.

The demonstrated base seams remove the raw ordered body/response feasibility blocker. The remaining auth/version combinations block faithful dispatch in #192 until qualification, and incoming signature verification blocks authenticated yielding in #190/#192/#193. Those consumer gates cannot be represented as verified support or waived by a matrix label.

## Rejected alternatives and primary evidence

Reusing parsed name-keyed results loses interleaving and nil attributes. Replacing node-soap buffered transport with unsigned raw fetch would discard the executed Basic/header/UsernameToken/signing/TLS surface. Inferring grouping history invents information absent from XML, and reporting iterator exhaustion alone as successful completion accepts current fault omissions.

Do not mutate the envelope after node-soap's signature stage. Installed `lib/client.js` calls security `postProcess` before optional operation `postProcess`; the latter can invalidate a signature. The proven raw-body hook enters before security, and the local signature tampering assertion makes that boundary falsifiable.

The installed-version [node-soap README](https://github.com/vpulim/node-soap/blob/v1.13.3/Readme.md) documents `$xml`, raw XML inputs, explicit service/port methods, endpoint options, extra HTTP headers, response events, security and SOAP 1.2 options. The inspected tag is `081be002518c0bae165b79c7dfbff0976b302df7`.

Installed `lib/wsdl/index.js` implements `_xml` in `objectToDocumentXML` and `$xml` in `objectToXML`; installed `lib/client.js` emits the buffered response event before `xmlToObject` and applies security after assembling the body. The tag's [client source](https://github.com/vpulim/node-soap/blob/v1.13.3/src/client.ts) and [WSDL source](https://github.com/vpulim/node-soap/blob/v1.13.3/src/wsdl/index.ts) are primary references, alongside [the generated client source](../src/client/generateClient.ts) and [dedicated streaming template](../src/runtime/clientStreamMethods.tpl.txt).

`arrayWithChoiceTag`, `stream` and `returnSaxStream` are upstream-documented dependency interfaces; they are not executed alternatives in this probe. Adopting one would require new local evidence for order, namespace context, incremental delivery and security rather than superseding ADR-002 from documentation alone.
