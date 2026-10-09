# Content Model SOAP Adapter Feasibility

Executed local SOAP evidence for S02, #169, and the adapter consumers #190/#192/#193. See the root [README](../README.md).

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

`S01_REFERENCE_PYTHON` can select an already provisioned reference interpreter. Missing or mismatched reference dependencies fail the probe; the independent lane is never silently skipped.

The reviewed starting revision is `2f88ec81f77f4fc5a06b78f2d507ae8e20fe7a7c`. Executed versions are Node 24.19.0, Python 3.12.14, soap 1.13.3, saxes 6.0.0, Axios 1.20.0, Vitest 5.0.3 and TypeScript 6.0.3. Signature verification uses soap's locked transitive xml-crypto 6.3.3 and @xmldom/xmldom 0.8.15; no dependency is added.

Local validation passed eleven probe tests, 138 conformance tests, integration TypeScript checking, documentation validation and the pipeline smoke check. The signing test emits an upstream xml-crypto deprecation warning from node-soap's existing signature implementation; the signature verification and tamper rejection still pass.

The [independent capture validator](../test/conformance/reference/soap_probe.py) reuses the baseline's pinned reference tooling: lxml 6.1.0/libxml2 2.14.6, xmlschema 4.2.0 and elementpath 5.0.4. It extracts the captured SOAP body payload and validates it against the embedded XSD with both engines; no production semantic implementation supplies expected validity. External resources and DTDs are prohibited.

## Payload and incoming context

The [ordered fixture](../test/conformance/fixtures/soap/content-model/ordered.xml) contains repeated composite choice `(a,b)|c` with mixed selections, repeated `(p,q)` sequences, invisible repeated-token grouping, a namespace-qualified QName value and a nil element retaining `id="7"`. Both independent engines accept it and reject the [grouped-by-name fixture](../test/conformance/fixtures/soap/content-model/name-keyed-invalid.xml).

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
