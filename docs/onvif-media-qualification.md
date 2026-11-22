# ONVIF Media GetSnapshotUri qualification

## Source and binding

The consumer uses ONVIF 26.06 Media WSDL at commit `68ee1b540a40f848c9599eba2c55b87547c588d6`. An owned WSDL wrapper supplies a loopback SOAP 1.2 address for the original `MediaBinding`. It selects `Media/GetSnapshotUri` from 79 discovered operations. Its action is `http://www.onvif.org/ver10/media/wsdl/GetSnapshotUri`. [Pinned Media WSDL](https://github.com/onvif/specs/blob/68ee1b540a40f848c9599eba2c55b87547c588d6/wsdl/ver10/media/wsdl/media.wsdl)

The [pin manifest](../test/fixtures/wsdl/real-services/onvif-media/provenance.json) gives each resource's retrieval URL, logical URI, byte count and SHA-256. The shared closure includes 10 ONVIF, OASIS and W3C schema resources. ONVIF and OASIS permit unmodified copies under their file notices. The W3C resources use the applicable software notices or the unmodified-document reuse terms. [Shared provenance](https://github.com/TechSpokes/typescript-wsdl-client/issues/510#issuecomment-7062616823) · [W3C reuse terms](https://www.w3.org/copyright/intellectual-rights/)

## Published baseline and candidate

| Configuration | Published v1.12.1 | v1.13.0 |
| --- | --- | --- |
| Default whole source | `cos-nonambig` | `cos-nonambig` |
| `closed-operation-v1` | `operation-wildcard-dependency` | `operation-wildcard-dependency` |
| `lax-wildcard-operation-v1` | Unavailable | Installed, compiled, relocated HTTP and SOAP |

The whole-source refusal identifies `RecordingJobConfiguration`. The selected response depends on `tt:MediaUri`. Its four required fields precede a lax element wildcard, and its attribute wildcard is lax. The new scope qualifies the selected operation while retaining `sourceLegality: disproved` in planning. [Baseline measurements](https://github.com/TechSpokes/typescript-wsdl-client/issues/397#issuecomment-7077090333) · [Pinned MediaUri](https://github.com/onvif/specs/blob/68ee1b540a40f848c9599eba2c55b87547c588d6/wsdl/ver10/schema/onvif.xsd#L2465-L2494)

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

The synthetic [lax wildcard fixture](../test/conformance/fixtures/assessment/scoped-lax-wildcard.wsdl) separately exercises declared element and attribute validation and inverse projection. The installed replay uses a test-owned endpoint and provides no live device acceptance.

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
