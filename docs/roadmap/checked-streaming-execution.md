# Checked streaming delivery record

The initial checked client and gateway delivery shipped in [v1.15.0](../releases/v1.15.0.md) through [PR #515](https://github.com/TechSpokes/typescript-wsdl-client/pull/515) and [release PR #516](https://github.com/TechSpokes/typescript-wsdl-client/pull/516). See the [roadmap](../../ROADMAP.md) for current delivery order and the [checked streaming guide](../checked-streaming.md) for configuration.

## Published scope

The credential-free SOAP 1.1 document/literal path qualifies Read with full-response completion and synthetic Fetch with declared companion scope. The installed consumer proves first-record delivery before upstream EOF in both HTTP formats, late abort, incomplete HTTP framing, cancellation, and frozen v1.14.0 buffered-client compatibility. The release-tree CI ran the installed stream case on Linux and Windows with Node 24 and 26. Full delivery ran on Linux Node 24 in CI and Windows Node 24 in release preflight. [Release-tree CI](https://github.com/TechSpokes/typescript-wsdl-client/actions/runs/45160350084) · [Preflight record](https://github.com/TechSpokes/typescript-wsdl-client/pull/516)

## Escapia fixture checkpoint

The published v1.16.0 consumer passed local fixture acceptance for `UnitDescriptiveInfoStream` and `UnitCalendarAvailBatch` over loopback HTTPS. The fixture verified the outgoing SOAP 1.1 envelope, request QName, action, target and version independently of the generated client. Live Escapia testing remains separate pending credentials. [Fixture results](../checked-streaming.md#escapia-fixture-acceptance) · [Issue #517](https://github.com/TechSpokes/typescript-wsdl-client/issues/517)

### Issue exits

| Issue | Published-scope evidence | Open acceptance |
| --- | --- | --- |
| [#159](https://github.com/TechSpokes/typescript-wsdl-client/issues/159) | Read socket handshake for client and both HTTP formats, synthetic Fetch scope and retained legacy controls | Verified replacement or retirement for every documented legacy promise |
| [#192](https://github.com/TechSpokes/typescript-wsdl-client/issues/192) | Shared request encoder, independent expanded-name/order assertions, qualified path, UTF-8 splits and zero dispatch controls | Full protocol and security matrix, legacy request serialization retirement |
| [#193](https://github.com/TechSpokes/typescript-wsdl-client/issues/193) | Required Read record, valid empty Fetch, wrapper and footer checks, late failures, cancellation, exact size/depth limits, and an owned producer stalled by demand | Broader transport coverage and process-wide heap measurements under the full D09 profile |
| [#194](https://github.com/TechSpokes/typescript-wsdl-client/issues/194) | Buffered versus streamed Read values and requests, synthetic Fetch known and companion grammar, malformed suffix invariance, and both Escapia companion fixtures | Broader approved parity corpus and live companion services |

The remaining [legacy inventory](#legacy-selection-inventory) includes distinct configuration and value-shape dispositions.

## Historical v1.14.0 implementation plan

The original setup, baseline reproduction and implementation steps below record how the initial delivery was qualified.

### Original worktree setup

Read this file before switching worktrees. The planning baseline is published v1.14.0, commit `55a73f5079e60dfc2b1320a20acf34713a3abb2e`. Fetch current main, compare changes since that tag in the files below, and carry this plan into one `agent/` implementation branch in a separate worktree.

On the machine holding the local planning branch, run the following from the repository root. The cherry-pick carries the reviewed documentation into the new checkout. If main already contains the plan, omit the cherry-pick. Choose unused names if the paths or branches already exist.

```sh
git fetch origin main
git worktree add -b agent/checked-streaming ../typescript-wsdl-client-checked-streaming origin/main
git -C ../typescript-wsdl-client-checked-streaming cherry-pick agent/checked-streaming-plan
cd ../typescript-wsdl-client-checked-streaming
npm ci
```

Use [repository instructions](../../AGENTS.md), [contributor setup](../../CONTRIBUTING.md) and the [verification sequence](../testing.md#before-opening-or-updating-a-pull-request).

Deliver a checked client that yields a natively validated record and a generated HTTP route that emits it while the owned SOAP server is still waiting to finish. Successful completion must also establish the declared response scope.

Keep legacy as the default and retain existing buffered methods and previously generated clients' runtime contracts. The initial delivery is an opt-in product change, with wider issue closure governed by the evidence below.

## Issue order and dependencies

| Owner | Start from | Evidence required to finish |
| --- | --- | --- |
| [#159](https://github.com/TechSpokes/typescript-wsdl-client/issues/159) | Inventory legacy promises by operation and format | Installed replacements or explicit retirement dispositions |
| [#192](https://github.com/TechSpokes/typescript-wsdl-client/issues/192) | Source-bound stream selection, shared request encoder, dedicated transport | Independent request XML and native incremental record comparison |
| [#193](https://github.com/TechSpokes/typescript-wsdl-client/issues/193) | Design the terminal result together with #192 | Full or scoped completion, backpressure, cancellation and measured cleanup |
| [#194](https://github.com/TechSpokes/typescript-wsdl-client/issues/194) | Author independent fixtures before implementing | Buffered and streamed wire parity, chunk invariance and lifecycle evidence |
| [#200](https://github.com/TechSpokes/typescript-wsdl-client/issues/200), [#203](https://github.com/TechSpokes/typescript-wsdl-client/issues/203) | Connect the generated route to the stream and install its archive | Preserved bytes, strict build and relocated public consumer |

The [accepted transport investigation](https://github.com/TechSpokes/typescript-wsdl-client/issues/169) and [ADR-003 decisions D07-D10](../decisions/003-content-model-contracts.md) govern transport, completion, resources and compatibility. Consume the applicable [bundle](https://github.com/TechSpokes/typescript-wsdl-client/issues/156), [codec](https://github.com/TechSpokes/typescript-wsdl-client/issues/157) and [buffered wire](https://github.com/TechSpokes/typescript-wsdl-client/issues/191) contracts. Identify a missing primitive by fixture and layer, implement its bounded prerequisite in the same delivery when possible, and keep full-profile parent gates intact.

## First operation and baseline

Use the SOAP 1.1 document/literal `Read` operation in `urn:stream-mapping`. Its service is `StreamMapping`, port and port type `MappingPort`, binding `MappingBinding`, and SOAP action `urn:stream-mapping:read`. Each step in `ReadResponse/Record` is qualified by that namespace. The legacy generated gateway test observes bytes from the first item over a socket in both formats.

Its XML exercises record order, attributes, scalar values, nil and repeated children. Use the original WSDL and independently authored exchanges. [Read fixture](../../test/fixtures/wsdl/stream-mapping.wsdl) and [legacy generated-wire test](../../test/integration/stream-mapped-transport.test.ts).

The original `Read` requires at least one record and has no footer. Assert that an empty `ReadResponse` fails. For the successful empty case use the existing [Fetch fixture](../../test/conformance/fixtures/xsd/standard-schema-element/records.wsdl) with an optional repeated complex record.

Derive one explicit Fetch variant with a required Boolean footer after the records and a typed wrapper attribute. Use it for missing, duplicate or invalid footer and invalid wrapper attributes. [Forecast](../../test/conformance/fixtures/assessment/forecast.wsdl) provides an established Boolean-footer control and yields scalar temperatures.

On November 22, 2026, the checksum-verified npm package was installed in a clean OS-temp consumer on Node 24.21.0. Its public planner returned `ready: true` and zero blockers for Read and Forecast. The installed CLI emitted the ordinary Read client, gateway and OpenAPI. The generated `client/inventory.json` recorded `generated: true` and `executed: false`. The separate planner report recorded `generated: false` and `executed: false`.

With a legacy Read stream selection, the checked CLI exited 1 with `[ERROR] Unsupported checked model option: --stream-config` and created no selected output directory. The planning probe ended at generation.

### Reproduce the published baseline

From the implementation repo root on Windows, use a new OS-temp consumer. Install each candidate archive in its own consumer. Use the applicable Node system trust from [Windows setup](../testing.md#windows-and-certificates).

```powershell
$ErrorActionPreference = 'Stop'
$env:NODE_USE_SYSTEM_CA = '1'
Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
$consumer = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ('stream-baseline-' + [guid]::NewGuid().ToString('N')))
Copy-Item -LiteralPath test/fixtures/wsdl/stream-mapping.wsdl -Destination $consumer.FullName
Push-Location -LiteralPath $consumer.FullName
npm.cmd init -y
if ($LASTEXITCODE) { throw 'Baseline package setup failed' }
npm.cmd pack '@techspokes/typescript-wsdl-client@1.14.0' --registry=https://registry.npmjs.org --ignore-scripts
if ($LASTEXITCODE) { throw 'Published archive download failed' }
$tarball = 'techspokes-typescript-wsdl-client-1.14.0.tgz'
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $tarball).Hash -ne '185c22f836a2dc1bd2255047713c96a6f9641f1800ffb8accee6e77655210350') { throw 'Unexpected archive' }
npm.cmd install --ignore-scripts --no-audit --no-fund "./$tarball"
if ($LASTEXITCODE) { throw 'Published archive installation failed' }
node --input-type=module -e "import { planCheckedComponents } from '@techspokes/typescript-wsdl-client'; const r = await planCheckedComponents('stream-mapping.wsdl'); console.log(JSON.stringify({ready:r.ready, selection:r.selection, blockers:r.blockers})); if (!r.ready) process.exitCode = 1;"
if ($LASTEXITCODE) { throw 'Published planner failed' }
.\node_modules\.bin\wsdl-tsc.cmd pipeline --model checked-components-v1 --wsdl-source stream-mapping.wsdl --client-dir .generated/read/client --gateway-dir .generated/read/gateway --gateway-service-name mapping --gateway-version-prefix v1 --openapi-file .generated/read/openapi.json --checked-report .generated/read-plan.json
if ($LASTEXITCODE) { throw 'Published buffered generation failed' }
Pop-Location
```

Record the planner, generation, install, strict build and exchange as distinct stages. The binding on this single-operation WSDL is unambiguous. If future source or preparation changes introduce a blocker, capture its exact stage and continue with the Fetch control. Identify each candidate by Git tree and archive checksum.

ONVIF Media is a separate buffered qualification whose next historical baseline uses these same published bytes. Its candidate wire receipts and the release publication receipt have separate identities. [Published artifact and Media evidence](https://github.com/TechSpokes/typescript-wsdl-client/issues/207#issuecomment-7081782202).

## Build the smallest working path

1. Write the server-controlled first-record handshake and the independent request/record expectations first.
2. Admit a single known wrapper and repeated record through checked planning and both generated endpoints.
3. Connect the pull-driven decoder to a generated client and gateway, then strict-build and execute an installed example.
4. Complete the lifecycle, capability and invalid-response cases below using the same contracts.
5. Qualify companion-scoped and other promised profiles individually before marking the corresponding issue complete.

### Generation and compatibility

Use the existing `--checked-config` and typed `checkedComponents` entry points with an opt-in stream selection tied to the full operation selector, record path and output format. Derive the record declaration and expanded path from the pinned source, and use the existing native companion association when needed. Resolve legacy local-name paths only when unique, preserving repeated path segments.

Fail generation on ambiguous paths, a mismatched type, incompatible source options or a missing declaration. Expose qualified selections and specific refusals through the checked planner.

Start in [checked planning](../../src/checkedPlanning.ts), [checked stage orchestration](../../src/checkedPipeline.ts), [generated client](../../src/client/generateDirectClient.ts) and [gateway and OpenAPI emission](../../src/gateway/generateCheckedGateway.ts).

The checked pipeline currently rejects legacy compiler and streaming controls together. Enable only the checked selection with demonstrated semantics. Exercise public CLI and typed API entry points with the same configuration, including separate client/OpenAPI/gateway/app generation.

For the ordinary known wrapper, derive the stream selector directly from its checked output mapping. The existing `createComponentRecordProjection` binds a specific outer wildcard and companion schema and currently retains the whole projected payload. Reserve it for that separate scope.

Issue an additive stream-capable handshake using the [runtime version patterns](../../src/client/directClientVersion.ts), [runtime bindings](../../src/client/directClientRuntime.ts) and [capsule identity](../../src/compiler/directSourceCapsule.ts). Cover selector, record declaration/path, completion scope, format, source and runtime compatibility in the appropriate identities.

Test buffered/stream and same-source/different-spec swaps, the frozen published buffered client on the candidate runtime, and one project with both streamed and buffered operations. Require refusals before I/O and preserve public buffered methods.

Inventory legacy configuration choices, including format, record path and companion inputs. Show how each maps to a source-qualified checked selection or report the first unrepresentable choice.

Use [ADR-002](../decisions/002-streamable-responses.md) for the two format contracts. Publish `application/x-ndjson` or `application/json` and `x-wsdl-tsc-stream.itemSchema` in OpenAPI, and expose typed records and observable completion to client callers.

Validate each mapped HTTP item independently before serialization without coercion, property removal or defaults.

Compare bytes against expected JSON. Clean HTTP EOF and the JSON-array closing bracket require successful terminal validation. Reuse [NDJSON](../../src/runtime/ndjson.ts) and [JSON-array formatting](../../src/runtime/jsonArray.ts) where their behavior is sufficient.

### Request and response

Validate and encode each request once with the checked body encoder. Preserve the selected SOAP envelope, action, endpoint authority and admitted HTTP/SOAP headers and credentials. Reuse [checked SOAP preparation](../../src/compiler/componentSoapPreparation.ts), [XML codec](../../src/compiler/directCodec.ts) and [SOAP transport policy](../../src/compiler/directSoap.ts). Use a dedicated streaming response reader.

The first positive profile uses credential-free SOAP 1.1 document/literal, UTF-8 and identity content encoding. Authorize the exact endpoint, including its query, retain verified TLS for HTTPS and disable automatic redirects, proxy routing and transparent decompression. Never forward metadata credentials onto SOAP requests. Verify a redirect reaches a second owned listener zero times. For subsequent authorized security profiles validate the final envelope after applying security, with no subsequent rewrite of signed bytes.

Explicitly reject unsupported request-time combinations before dispatch. Refuse an unexpected inbound encoding, unsupported mandatory header or invalid response when first observable.

Require agreement among HTTP charset, BOM and XML declaration. For HTTP 200 distinguish a normal payload from a SOAP Fault. For HTTP 500 preserve the checked declared or protocol fault outcome and reject a normal record before first yield.

Reject redirects, HTML and unsupported media. Exercise a syntactically complete envelope followed by a reset or shorter body than the declared Content-Length. Completion requires clean HTTP framing as well as XML EOF. A security mode requiring verification of the entire response at EOF must refuse before dispatch on the incremental path. [Protocol fault compatibility](../decisions/005-checked-protocol-fault-compatibility.md)

Use one fatal incremental decoder and namespace-aware ordered XML event stream per response. Flush at EOF. Preserve namespace scope, attributes, nil and text across chunk boundaries. Advance the existing native content and scalar semantics as the wrapper and record close.

A complete buffered XML observation cannot certify a partial response. The [ordered projection matcher](../../src/compiler/directStructurePlan.ts) currently takes the whole child-name sequence. Factor a bounded transition/cursor shared with [structural validation](../../src/compiler/directStructure.ts) and [native scalar assessment](../../src/compiler/directValues.ts).

Preserve inherited namespace and base context at a record boundary.

Match the [ordered XML reader](../../src/loader/orderedSyntax.ts) for DTD/entity and namespace refusals, including split markup and zero external fetches. Avoid building a full SOAP tree or retaining previously yielded values. [Checked record projection](../../src/compiler/componentRecordProjection.ts) and [SOAP feasibility](../content-model-soap-feasibility.md).

### Lifecycle and HTTP behavior

Expose a pull-driven iterable, an explicit way to cancel before iteration, and the declared scope with the terminal result. Show callers how to consume and then observe completion.

A pending read, consumer return, disconnect and concurrent abort must settle once and release the upstream body, parser and listeners. A stream that is never drained cannot certify success. Do not read the remaining body in the background.

For `full-response`, verify the selected SOAP envelope, headers, body, wrapper attributes, aggregate counts, non-record values, required footer and EOF. For `records-with-declared-wrapper-scope`, publish the checked wrapper/path and exclusions, authenticate the companion association and qualify only its stated guarantees. Reject a wrong wrapper or invalid footer at its first observable boundary. A Fault in place of the sole SOAP payload follows fault handling. A Fault-shaped sibling after valid records violates the one-payload grammar and aborts the stream. Keep caller cancellation distinct from validation, transport and resource failures.

Before any HTTP bytes, use the established gateway status and error body for invalid input, incompatible artifacts and upstream faults.

After bytes, abort the downstream response on failure. NDJSON can have valid preceding lines and JSON-array must lack a successful closing bracket. Return empty NDJSON or `[]` only after valid zero-record completion.

Keep gateway disconnect listeners active until send completion or abort. Ensure the iterator rejects on late failure instead of returning a clean `done` followed by a separately failed status. Settle the terminal result without unhandled rejections and give one owner responsibility for disposal.

Use bounded pull and exact occurrence counters on every stream. In an explicitly bounded D09 test profile, check at and just beyond 4 MiB decoded per record, 16 pending records or 8 MiB (first limit reached), depth and a 30-second upstream inactivity timeout. Pause reads at capacity, even within one input chunk. Account for non-record header/footer text and parser-held bytes. Compare peak retained bytes and records with producer reads during a stalled consumer.

Suspend the inactivity clock while demand is deliberately paused. Report a configured timeout as transport failure and user abort as cancellation. Under the [direct-client resource amendment](../direct-values.md#current-direct-client-resource-policy), applications select SOAP deadlines and size limits. Retain flow control independently of those policies and introduce no implicit direct-call deadline, payload-size quota or total-stream byte cap.

## Independent verification and issue exits

| Boundary | Required observation |
| --- | --- |
| First record | Client yields and HTTP reader decodes a complete NDJSON line or JSON-array item before releasing the SOAP suffix |
| Known grammar | Valid zero/one/many, wrong wrapper/order, invalid attribute/scalar and missing or duplicate footer |
| Wire authority | Independent XML parser confirms expanded names, ordered values, selected envelope/action and headers |
| Zero dispatch | Invalid request, stale/mixed artifacts, denied endpoint and unsupported security each cause zero SOAP calls |
| Chunk boundaries | Every single split of small byte fixtures, multibyte text, namespace rebinding, entities and malformed final bytes |
| Completion | Early and late faults, premature EOF, truncation, cancellation before iteration and during a pending read |
| Resource ownership | Slow/abandoned readers, oversized record, queue high-water counts/bytes, socket close and concurrent isolation |
| HTTP contract | Both formats, zero records, pre-byte error envelope and post-byte transport abort on a real socket |
| Installed consumer | Pack once, install outside the repo, generate and strict-build, relocate with production dependencies, run over real sockets |

Use explicit server gates and observe downstream reads, socket closure and terminal state. Do not substitute elapsed-time guesses, Fastify injection or a final accumulated string for the first-record proof. Require identical yielded prefixes and terminal states for a valid record followed by a malformed suffix in one read versus separate reads.

Compare buffered and streamed record values to independently authored expectations, including namespaces, nil attributes, restrictions and zero/one/many children. For broader #194 exit include repeated composite choices, recursive records and scoped companion containers. Run the linked legacy regression suites on the same relevant profile and explicitly reconcile any intentional mapping correction.

After the known-wrapper slice, qualify repeated complex records under the existing explicit companion association, with independent synthetic inputs where private sources are unavailable.

Use the documented `UnitDescriptiveInfoStream` and `UnitCalendarAvailBatch` promises, including the repeated calendar wrapper name, to drive parity. Reuse the [Escapia evidence](v1.0-published-consumer-acceptance.md) and [legacy composition checkpoint](multi-service-gateway.md). Record installed synthetic and authentic owned-service results separately.

Before retiring the legacy request serialization named in #192, compare final captured requests across the supported legacy matrix and identify the current owner in the [released template](../../src/runtime/clientStreamMethods.tpl.txt).

Classify supported SOAP versions, security, headers, response charsets, compression, formats, faults and source/profile permutations as executed, refused or pending. A passing public fixture advances its named scope.

Use focused checks while developing and assign one final verification owner. Run the existing legacy controls from the repository root.

```sh
npm test -- test/integration/stream-mapped-transport.test.ts test/integration/stream-request-wire-parity.test.ts
npm test -- test/integration/stream-transport-lifecycle.test.ts test/integration/stream-gateway-cancellation.test.ts
```

Add focused checked cases to the existing integration and installed-consumer harnesses and document their exact commands once implemented. Run `npm run build` and `npm run package:validate -- --pack` before a focused installed run when a fresh validated tarball is required. Follow the existing harness for exact tarball selection, clearing `NODE_PATH` and enforcing `node --permission` in the production-only consumer. Assert that reading the checkout is denied.

Include a focused checked-stream test in the representative installed lane and update the conformance registry and support matrix for the delivered scope. Use [installed checked gateway verification](../../test/integration/checked-gateway-installed.test.ts) as the isolation pattern.

Follow the [pre-push sequence](../testing.md#before-opening-or-updating-a-pull-request) with one final delivery gate on the reviewed candidate, `npm run ci`. Record the platform checks for Linux and Windows on Node 24/26 and any scope still unrun. Release preparation and switching the public default are separately governed.

Attach the operation, binding, source/version, archive identities, input, expected and observed wire result, first failing stage/diagnostic and dispatch count to the relevant row. Use [#397](https://github.com/TechSpokes/typescript-wsdl-client/issues/397) for capability disposition, [#207](https://github.com/TechSpokes/typescript-wsdl-client/issues/207) for fixture-to-artifact evidence and [#401](https://github.com/TechSpokes/typescript-wsdl-client/issues/401) for installed outcomes.

If a blocker appears, preserve the exact evidence and continue independent cases. Close a leaf only after all its acceptance items are met. Keep #159 open until the legacy streaming inventory has an installed replacement or maintainer-approved disposition for every promised behavior.

## Independent plan review

Three reviewers approved this handoff for standalone implementation on November 22, 2026. The schema and compatibility review separated known-wrapper matching from companion projection and added mixed buffered/streamed client checks. The transport review added HTTP framing, credential isolation, fault timing and explicit caller resource policy.

The installed-consumer review corrected the fixture occurrence bounds and strengthened the first-record assertion to a complete item at the HTTP consumer. Implementation review and installed wire qualification belong to the future candidate.

## Candidate qualification

The checked reader uses the native request encoder, ordered child cursor and scalar matcher. The adapter owns the SOAP 1.1 envelope and HTTP framing. The public configuration and cancellation contract are in [Checked streaming](../checked-streaming.md).

Run the focused source, legacy and installed checks from the implementation worktree. On Windows use system certificate trust and loopback access as described in [Testing](../testing.md#windows-and-certificates).

```bash
npm test -- test/integration/checked-streaming.test.ts test/unit/component-record-projection.test.ts
npm test -- test/integration/stream-mapped-transport.test.ts test/integration/stream-request-wire-parity.test.ts test/integration/stream-transport-lifecycle.test.ts test/integration/stream-gateway-cancellation.test.ts
npm run build
npm test -- test/integration/checked-streaming-installed.test.ts
```

Set `WSDL_CHECKED_STREAM_BASELINE_ARCHIVE` to the absolute path of the checksum-pinned v1.14.0 tarball to include the frozen published client check. The installed lane emits `[checked streaming receipt]` with the Git tree, clean-worktree indicator, archive SHA-256, pinned Read SHA-256, platform, independent requests and socket outcomes. Set `WSDL_CHECKED_STREAM_EVIDENCE_DIR` to a fresh evidence directory to retain the receipt and the exact archive. The final `npm run ci` supplies the shared validated tarball, runs installed qualification and includes the pipeline smoke check.

### Legacy selection inventory

| Legacy promise | Checked configuration or current disposition |
| --- | --- |
| Operation name and stream mode | Full binding, port-type and operation selector in `checkedComponents.streams` |
| NDJSON and JSON array | Explicit `format` with fixed media types for each format |
| Custom `mediaType` | Pending a checked HTTP representation contract |
| Local-name `recordPath` | Resolve each `path` step to one declaration and retain repeated segments |
| Catalog `recordType` | Derive the source declaration and optionally assert its expanded type |
| Companion `wsdlSource` | Authorize the physical WSDL with `recordProjections` and its exact selector |
| Companion `catalogFile` | Requires the original companion WSDL and its source closure |
| Legacy primitive and flattening configuration | Checked stream uses native checked values |
| `UnitDescriptiveInfoStream` | Installed v1.16.0 fixture verified the Main companion selection and typed `UnitDescriptiveContentType` records |
| `UnitCalendarAvailBatch` | Installed v1.16.0 fixture verified the repeated response wrapper and typed `UnitCalendarAvailType` records |

### Qualified transport summary

The positive transport profile is credential-free SOAP 1.1 document/literal, UTF-8, identity encoding and an explicitly approved endpoint. The tests exercise HTTP status, mandatory headers, redirects, early and late faults, reset after a complete XML envelope with incomplete HTTP framing, and cancellation before and during demand. Published legacy values can differ from native checked values. Read canonicalizes decimals, uses the checked nil object, and supplies empty repeated fields.
