# Reference Validation

Internal evidence contracts for the Node tooling migration. See the root [README](../README.md).

## Status

[Epic #239](https://github.com/TechSpokes/typescript-wsdl-client/issues/239) stages a tooling migration without changing production semantics.
The [migration map](../test/conformance/reference/migration-map.json) pins every Python method, assertion block and parameterized family at the refreshed main revision.
Pending destinations are proposals, not accepted executable evidence. Required commands retain the frozen legacy path until both validator gates and every replacement pass.

## Evidence policy

Pure contract assertions, current engine observations and historical observations are separate evidence kinds.
Expected answers come from independently authored literal tables or reviewed source contracts, never production semantic helpers.
An engine disagreement records a new versioned observation without changing the selected project interpretation.

Schema construction must execute independently of instance validation.
Typed augmentation must expose the value, datatype, original lexical witness and namespace/source provenance where the obligation requires them.
An adjusted small-bound fixture cannot qualify the original huge-bound schema.

## Internal result contract

Each result has `phase` (`setup`, `input`, `schema`, or `instance`) and `outcome` (`accepted`, `rejected`, `unsupported-capability`, or `resource-limit`).
Setup and input failures have explicit diagnostics and cannot count as schema rejection.
A rejected schema produces no instance results. Unavailable capabilities and exhausted resources never imply invalidity.

Reports identify the wrapper package and version, engine version, artifact/build provenance, platform and Node version.
Reports include the tested Git revision/tree, dirty-tree status and exact input SHA-256 hashes.
Historical records retain their original engine and source identity and are never counted as fresh checks.

## Input and resource boundary

Fixtures use stable local URIs and an explicit registered input set.
Unknown resources, network resolution, DTDs, path escapes and malformed XML fail as input errors.
Extracted schemas and SOAP payloads retain inherited namespace bindings, including prefixes used only in QName-valued attributes.

WASM objects must be disposed in `finally` blocks; blocking validation needs worker isolation for enforceable elapsed-time limits.
Node/work limits are charged before copies or allocation and return no partial success.
AU01 and RE01 retain the 100,000-node and 1,000,000-work defaults; failed finite witness searches leave RE01 unresolved.

## Migration inventory

The map records all 14 legacy Python files, 53 methods, complete pinned method bodies and their loop/subcase families.
It also maps baseline manifest rows and instances, mixed-file pure versus external ownership, SOAP consumers, setup, documentation and manifest discovery.
Follow each method's pinned source link for every literal input and module-level expectation table; total test counts are only a cross-check.

Inventory verification uses Node; Python must not run to generate migration scripts or expected answers.
The required fast launcher currently runs all legacy test methods as well as its 6-schema/15-instance subset; full baseline selection is 14 schemas/40 instances.
The replacement must preserve both selections and reject empty discovery.

## Draft #231 handoff

Draft [PR #231](https://github.com/TechSpokes/typescript-wsdl-client/pull/231) remains untouched at `460f5b8379c68ffef79917284e445b5ab046429e`.
Its additional Python reference test belongs to #179's later rebase and must be ported to strict TypeScript through the accepted reference contract.
The migration guard must reject that file rather than refreshing its frozen allowance automatically.

## Verification commands

```bash
npm ci
npm run docs:validate
```

Run each executable port's focused Vitest command and scoped TypeScript project from the migration map.
Pending external destinations require accepted Gate P and Gate S before becoming live evidence.
Final Linux/Windows Node 24/26 qualification must prove Python unavailable or execution denied during normal installation and execution.

## Executable staging ports

The pure AU01 and RE01 ports execute alongside frozen legacy evidence.
No required reference or SOAP command has switched to Node yet, and the existing 147-artifact S06 manifest remains unchanged.
The migration map marks each staged pure/adapter method as verified without accepting dependent external coverage.

```bash
npm ci
npm run check:toolchain
npm run typecheck:tooling
npm run typecheck:research
npx tsc -p test/conformance/reference/tsconfig.json
npm run test:research:ports
npx vitest run test/conformance/reference/migration-map.test.ts test/conformance/reference/validate.test.ts
npm run research:re01:measure
```

AU01 uses `test/research/s06-au01/probe.ts`; RE01 uses `test/research/re01/witness-probe.ts` and `measure.ts`.
Their readonly records retain original object identity and exact lexical values.
Work accounting uses UTF-16 code units, conservatively charging non-BMP input; legacy ASCII measurements retain their counts.
Fixture syntax identities use explicit sibling indexes, preserving source distinctions without requiring Python XPath spelling.

RE01 measurements reproduce work limits 29/28, huge-operand work 228, shared-DAG work 218 and node-boundary work 600007/600006.
The adversarial prefix exhausts 1,000,000 work units and returns no partial witness.
These results leave the unresolved soundness, completeness, termination and hypothetical source-identity questions in #232/#234 unchanged.

## Validator gates

Gate P is qualified with explicit limits for the pinned test-only `libxml2-wasm@0.7.2` artifact.
Its wrapper source pins libxml2 2.15.1, separately identified from historical lxml's libxml2 2.14.6.
The [candidate report](../test/conformance/reference/qualification/observations.json) records artifact hashes, original inputs and actual Linux Node 24 results.

The measured primary corpus matches 14 baseline schema and 40 instance outcomes, 38 PW01 schema and 8 instance outcomes, and 113 additional literal instance observations.
Original huge-bound schemas remain unsupported by the primary adapter; adjusted analysis inputs are explicitly separate.
Worker elapsed limits and JavaScript heap limits are checked; JavaScript heap limits do not cap WASM linear memory or total process RSS.

Gate S requires a maintainer decision.
The [decision packet](https://github.com/TechSpokes/typescript-wsdl-client/issues/239#issuecomment-6097034663) documents the exact 23 live xmlschema method families, secondary baseline instance and 13 SOAP calls at risk.
Published Xerces 2.0.2 fails schema-construction controls; TypeScript engine 1.7.3 accepts invalid-all construction and rounds exact bounds.

```bash
npm install --prefix tmp/conformance/node-qualification --cache tmp/cache/npm libxml2-wasm@0.7.2 xerces-wasm@2.0.2 xml-xsd-engine@1.7.3
npx tsx test/conformance/reference/qualification/primary-checks.ts
npx tsx test/conformance/reference/qualification/probe.ts
npx tsx test/conformance/reference/qualification/record.ts
```

These are bounded investigations, not a supported alternate required lane.
Failed candidates are installed only in the classified disposable directory; only the qualified primary package is a pinned development dependency.
Normal installation and candidate execution passed with Python/Pip PATH aliases denied, but final Python-free tree and Windows/Node 26 qualification remain blocked with #252/#253.
`record.ts` accepts an optional installation-evidence JSON path; without it, regeneration makes no installation claim.

## Real-world relevance investigation

The [pinned source inventory](../test/conformance/reference/qualification/relevance-sources.json) covers 196 distinct published XML documents from the official ONVIF repository, eBay's SDK and Travelport's C# tutorial.
The [compact observations](../test/conformance/reference/qualification/relevance-observations.json) identify every input hash, measured environment, code source hash and sampling limitation.
This is a purposive schema sample; it does not measure deployed API prevalence or inspect production payloads.

| Sample | Snapshot | Distinct files | Largest finite occurrence |
| --- | --- | --- | --- |
| ONVIF official tree | 2026-08-18 | 38 | 3 |
| eBay SDK WSDL 1379 | 2024-11-26 | 1 | 8 |
| Travelport tutorial | 2018-05-21 | 157 | 9999 |

No sampled declaration exceeded the primary occurrence guard of 2147483647 or contained a BCE/leap-second default or fixed value.
Dates, exact numeric scalar types, defaults, restrictions, unbounded particles and repeating compositors are present.
Instance calendar values remain unrestricted by this absence finding, and scalar precision is separate from occurrence counts.

The extension/attribute screen is incomplete: 935 of 1842 extension chains contain unresolved or ambiguous references.
Its zero candidate collisions cannot establish that conflicting attribute-use cases are absent or rare.
The eBay latest-host and current Travelport archive downloads returned HTTP 403, so neither historical sample is presented as the current release.

### Observed limits

The 4.6 MB eBay WSDL exceeds the staged reference adapter's extraction and total-input budgets.
An explicit 8 MiB extraction/total-input experiment reached independent schema construction, which rejected two `maxOccur` attributes in the unmodified SDK artifact.
A separate large valid-schema control passes with an explicit budget and retains schema/instance separation; product and default adapter limits remain unchanged.

Travelport's historical Hotel/Common pair loads into 3562 internal graph nodes but serializes about 22.8 MB of syntax/provenance.
Charging that graph requires 19529525 work units; the internal faithful preparation exhausts both tested 1000000 and 16000000 budgets before schema assessment.
This motivates Node representation/accounting work before claiming large-schema faithful support; it is not an RE01 witness failure or evidence that Python is required.

The ONVIF probe stops at its unauthorized external import under the deliberately offline policy.
The eBay internal probe stops at a provenance guard, and public legacy compilation rejects its abstract request type.
These observations do not qualify those APIs and do not change existing generation guards.

The Node primary accepts the existing ordered SOAP body and rejects the existing reordered body.
That establishes feasibility for these two controls; the 13 integration consumers still require a complete port and validation.
The recorded primary recheck also preserves 14/40 baseline, 38/8 PW01, 113 additional instance observations and 15 boundary controls after the extraction experiment was added.

### Recommendation and remaining contract decision

Proceed toward Python removal using the qualified Node primary and independently authored strict TypeScript contract checks.
Retain all original exact research domains, historical external observations, required selections and method families.
Document unavailable full-schema or typed-augmentation evidence explicitly; do not convert it into a passing validator result.

The outstanding approval concerns replacing the required second general-purpose live XSD engine with this narrower evidence contract.
Ordinary defaults, datatype precision and content order need adequate replacement assertions before cutover; a lack of rare sampled declarations does not authorize dropping them.
Gate S, required launchers and #232/#234 proof obligations remain unchanged until that contract is explicitly accepted and its replacements pass.

### Reproduction

Use the existing Node dependencies and proxy/CA configuration appropriate to the environment.
Downloads verify pinned Git blobs, use four workers and enforce 8 MiB per input and 64 MiB per download run.
Full descriptive outputs and downloaded public schemas stay in the classified, ignored research directory.
The two primary recheck commands use the disposable candidate installation documented under [Validator gates](#validator-gates).

```bash
npx tsx test/conformance/reference/qualification/relevance.ts --download
npx tsx test/conformance/reference/qualification/relevance-probes.ts
npx tsx test/conformance/reference/qualification/primary-checks.ts
npx tsx test/conformance/reference/qualification/probe.ts
npx tsx test/conformance/reference/qualification/relevance-record.ts
npx tsc -p test/conformance/reference/tsconfig.json
npx vitest run test/conformance/reference/validate.test.ts
```
