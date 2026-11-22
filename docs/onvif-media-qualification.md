# ONVIF Media qualification

## Source and binding

The consumer uses ONVIF 26.06 Media WSDL at commit `68ee1b540a40f848c9599eba2c55b87547c588d6`. An owned WSDL wrapper supplies a loopback SOAP 1.2 address for the original `MediaBinding` and exposes 79 operations for selection. The batch selects five read operations on the same port. [Pinned Media WSDL](https://github.com/onvif/specs/blob/68ee1b540a40f848c9599eba2c55b87547c588d6/wsdl/ver10/media/wsdl/media.wsdl)

The [pin manifest](../test/fixtures/wsdl/real-services/onvif-media/provenance.json) gives each resource's retrieval URL, logical URI, byte count and SHA-256. The shared closure includes 10 ONVIF, OASIS and W3C schema resources. ONVIF and OASIS permit unmodified copies under their file notices. The W3C resources use the applicable software notices or the unmodified-document reuse terms. [Shared provenance](https://github.com/TechSpokes/typescript-wsdl-client/issues/510#issuecomment-7062616823) · [W3C reuse terms](https://www.w3.org/copyright/intellectual-rights/)

## Published snapshot history

| Configuration | Published v1.12.1 | v1.13.0 |
| --- | --- | --- |
| Default whole source | `cos-nonambig` | `cos-nonambig` |
| `closed-operation-v1` | `operation-wildcard-dependency` | `operation-wildcard-dependency` |
| `lax-wildcard-operation-v1` | Unavailable | Installed, compiled, relocated HTTP and SOAP |

The whole-source refusal identifies `RecordingJobConfiguration`. The selected response depends on `tt:MediaUri`. Its four required fields precede a lax element wildcard, and its attribute wildcard is lax. Scoped planning retains `sourceLegality: disproved`. [Baseline measurements](https://github.com/TechSpokes/typescript-wsdl-client/issues/397#issuecomment-7077090333) · [Pinned MediaUri](https://github.com/onvif/specs/blob/68ee1b540a40f848c9599eba2c55b87547c588d6/wsdl/ver10/schema/onvif.xsd#L2465-L2494)

## Installed consumer replay

Retrieve the original bytes into a private local directory using the manifest URLs. The verification script rejects a changed byte count or SHA-256 before generation. The script installs the supplied npm tarball in an operating-system temporary directory, generates from the offline map, runs scaffold tests, builds under strict TypeScript and relocates the project before driving HTTP and SOAP.

```powershell
$pinDirectory = '.generated/onvif-media/inputs'
New-Item -ItemType Directory -Force -Path $pinDirectory | Out-Null
$manifest = Get-Content -Raw test/fixtures/wsdl/real-services/onvif-media/provenance.json | ConvertFrom-Json
foreach ($pin in $manifest.resources) {
    curl.exe --fail --location --output (Join-Path $pinDirectory $pin.file) $pin.retrievalUrl
    if ($LASTEXITCODE -ne 0) { throw "Unable to retrieve $($pin.file)" }
}
```

From a checkout with development dependencies installed, pass the candidate archive and the prepared snapshot directory.

```bash
npm run verify:onvif-media -- .generated/techspokes-typescript-wsdl-client-1.13.0.tgz \
  .generated/onvif-media/inputs .generated/onvif-media/evidence
```

The verifier checks the qualified token in the emitted SOAP POST with an independent namespace-aware parser. The owned response supplies a URI, two Booleans, a duration, a known integer-valued extension and an unknown element and attribute. It checks an HTTP 200 with preserved namespace identity, order and lexical content. Invalid REST input, denied endpoints, and missing or stale snapshots refuse without a SOAP request. Invalid SOAP values and a SOAP 1.2 Receiver fault produce HTTP 502.

The synthetic [lax wildcard fixture](../test/conformance/fixtures/assessment/scoped-lax-wildcard.wsdl) separately exercises declared element and attribute validation and inverse projection. The installed replay uses a test-owned endpoint. Live device acceptance is a separate qualification.

## DeleteOSD declared attribute replay

The same source pins and owned binding can select `MediaBinding/DeleteOSD`. In the original WSDL, the request has a required `OSDToken` before the lax wildcard and the response contains a lax wildcard. The test-owned extension is an unknown element with a declared `xmime:contentType` attribute from the pinned XML MIME import. The attribute's string restriction requires at least three characters. [Pinned DeleteOSD declarations](https://github.com/onvif/specs/blob/68ee1b540a40f848c9599eba2c55b87547c588d6/wsdl/ver10/media/wsdl/media.wsdl#L1909-L1927) · [XML MIME schema](https://www.w3.org/2005/05/xmlmime)

```bash
npm run verify:onvif-media -- .generated/npm-v1.13.0.tgz \
  .generated/onvif-media/inputs .generated/onvif-media/osd-baseline DeleteOSD --baseline
npm run verify:onvif-media -- .generated/candidate.tgz \
  .generated/onvif-media/inputs .generated/onvif-media/osd-candidate DeleteOSD
```

The published baseline refuses the declared attribute even with `image/png`. The candidate preserves the expanded name and lexical string on both the outbound SOAP request and the HTTP response. The test sends the same attribute local name in a second namespace and checks both values independently. Invalid `xmime:contentType="x"` yields HTTP 400 before any SOAP POST and HTTP 502 when supplied by the owned upstream.

Both runs replay the whole-source and closed-operation refusals before generation. The verifier records per-case SOAP dispatches, applies endpoint and snapshot controls, and requires zero network metadata fetches.

## Five-read batch replay

| Operation | Application input | Verified response |
| --- | --- | --- |
| `GetVideoSources` | Empty object | Ordered sources with distinct tokens, frame rates and resolutions |
| `GetStreamUri` | Profile token, namespace boundary and RTP-Unicast/RTSP setup | Stream URI, two flags and timeout |
| `GetSnapshotUri` | Profile token | Snapshot URI, flags, timeout, typed and lexical extensions |
| `GetVideoEncoderConfigurations` | Empty object | Empty and ordered nonempty configuration lists |
| `GetCompatibleVideoEncoderConfigurations` | Profile token | Distinct compatible configuration |

Supply the profile token independently of the source tokens returned by `GetVideoSources`. The stream request uses a root `$namespaces` boundary with the empty default namespace and an ordered `StreamSetup.$content` containing `Stream` and `Transport`. The binding's video-source SOAP action is `http://www.onvif.org/ver10/media/wsdlGetVideoSources/`.

Encoder configurations contain the `token` attribute and keyed `$content`. Their optional fields can be omitted before the required `SessionTimeout` delimiter. The replay checks declared `RateControl` before the delimiter, a vendor element with the same local name after the delimiter, and lexical quality and timeout values. [Pinned encoder type](https://github.com/onvif/specs/blob/68ee1b540a40f848c9599eba2c55b87547c588d6/wsdl/ver10/schema/onvif.xsd#L681-L729)

Prepare the pins as above. Pack the published v1.13.0 archive and the reviewed checkout into separate directories.

```bash
mkdir -p .generated/onvif-media/published .generated/onvif-media/candidate
npm pack @techspokes/typescript-wsdl-client@1.13.0 --ignore-scripts --pack-destination .generated/onvif-media/published
npm run build
candidate_version=$(node -p 'require("./package.json").version')
npm pack --ignore-scripts --pack-destination .generated/onvif-media/candidate
npm run verify:onvif-media -- .generated/onvif-media/published/techspokes-typescript-wsdl-client-1.13.0.tgz \
  .generated/onvif-media/inputs .generated/onvif-media/published-evidence --baseline-batch
npm run verify:onvif-media -- ".generated/onvif-media/candidate/techspokes-typescript-wsdl-client-$candidate_version.tgz" \
  .generated/onvif-media/inputs .generated/onvif-media/candidate-evidence --candidate-batch \
  .generated/onvif-media/published-evidence "$(git rev-parse 'HEAD^{tree}')"
```

Run each invocation with a fresh evidence directory. On Windows, use system certificate trust for npm and the documented loopback permissions. [Windows setup](testing.md#windows-and-certificates)

The batch records archive hashes, the identical planner-wrapper digest, per-operation blockers and the highest demonstrated stages in `comparison.json` and `comparison.csv`. Inspect `exchanges.json` for raw SOAP request and response XML, actions, HTTP statuses and per-case dispatch counts. The candidate also records the authentic encoder codec round trip in `encoder-codec.json`.
