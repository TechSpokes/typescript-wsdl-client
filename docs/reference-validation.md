# Reference Validation

Internal evidence contracts for the Node tooling migration. See the root [README](../README.md).

## Status

[Epic #239](https://github.com/TechSpokes/typescript-wsdl-client/issues/239) replaces operational Python with strict TypeScript without changing production semantics.
The [migration map](../test/conformance/reference/migration-map.json) pins every Python method, assertion block and parameterized family at the refreshed main revision.
All 53 mapped methods and 13 SOAP consumers have executable replacements. Gate S passed through the maintainer's [NT-CONT-01 acceptance](https://github.com/TechSpokes/typescript-wsdl-client/issues/239#issuecomment-6098237195); final platform evidence is recorded in the delivery ledger.

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

The map pins all 14 legacy Python files, 53 method blocks and their loop/subcase families with hashes and source links.
It also maps baseline manifest rows and instances, mixed-file pure versus external ownership, SOAP consumers, setup, documentation and manifest discovery.
Follow each method's pinned source link for every literal input and module-level expectation table; total test counts are only a cross-check.
The [historical source snapshot](../test/conformance/reference/legacy-source-snapshot.json) preserves all complete source bytes and module-level tables as non-executable data. Its hashes verify coverage offline after deletion, including shallow checkouts.

Inventory verification uses Node; Python must not run to generate migration scripts or expected answers.
Both required and full launchers verify actual execution of all 53 mapped TypeScript methods. They preserve the 6-schema/15-instance required subset and 14-schema/40-instance full selection, and reject empty or missing discovery.

## Draft #231 handoff

Draft [PR #231](https://github.com/TechSpokes/typescript-wsdl-client/pull/231) remains untouched at `460f5b8379c68ffef79917284e445b5ab046429e`.
Its additional Python reference test belongs to #179's later rebase and must be ported to strict TypeScript through the accepted reference contract.
The migration guard rejects that file and every removed executable source; no legacy allowance remains.

## Verification commands

```bash
npm ci
npm run docs:validate
```

Run each executable port's focused Vitest command and scoped TypeScript project from the migration map.
Gate P qualifies one live engine within its limits; Gate S accepts the narrower scoped evidence policy below. Linux/Windows Node 24/26 qualification proves interpreter absence or execution denial during normal installation and execution.

## Executable ports

Pure AU01/RE01 research and all structural, AU/RE, PW/DT reference suites execute through Node. SOAP consumers validate the actual captured wire bytes with separately named primary and selected-contract results. The S06 manifest reconciles every original artifact with its current path/hash and retains original inventory provenance.

```bash
npm ci
npm run check:toolchain
npm run typecheck:tooling
npm run typecheck:research
npx tsc -p test/conformance/reference/tsconfig.json
npm run test:research:ports
npm run test:reference:full
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

Gate S passes through accepted NT-CONT-01.
The [decision packet](https://github.com/TechSpokes/typescript-wsdl-client/issues/239#issuecomment-6097034663) documents the exact 23 live xmlschema method families, secondary baseline instance and 13 SOAP calls at risk.
Published Xerces 2.0.2 fails schema-construction controls; TypeScript engine 1.7.3 accepts invalid-all construction and rounds exact bounds.
The required lane therefore has one live general-purpose XSD engine, independent selected-contract assertions, pinned historical external observations and explicit unqualified capabilities. These checks do not supply full second-engine validation or PSVI augmentation.

```bash
npm install --prefix tmp/conformance/node-qualification --cache tmp/cache/npm libxml2-wasm@0.7.2 xerces-wasm@2.0.2 xml-xsd-engine@1.7.3
npx tsx test/conformance/reference/qualification/primary-checks.ts
npx tsx test/conformance/reference/qualification/probe.ts
npx tsx test/conformance/reference/qualification/record.ts
```

These are bounded investigations, not a supported alternate required lane.
Failed candidates are installed only in the classified disposable directory; only the qualified primary package is a pinned development dependency.
The original candidate investigation used PATH denial and remains historical staging evidence. Final qualification uses physical interpreter inventory and absolute-path negative controls on Linux, and execution/read ACL denial with saved rollback on Windows.
The Windows audit records its installation roots, registry-discovered paths, canonical aliases and protected OS-data exclusions. Unreadable selected installation roots fail qualification; the audit does not claim that arbitrarily renamed executables across the entire host filesystem are absent.
Inventoried symbolic-file aliases receive file-data-read and execution ACL denial on the link object using `icacls /L`; resolvable physical targets receive the same denial. The granular `RD,X` rights leave ACL access available for restoration. Failed canonical lookup is diagnostic information, not evidence of execution denial. All original ACLs are saved before any denial and restored afterward, with `/L` used for link objects. Absolute paths, command names and alias reads must remain denied or unavailable before and after installation and execution, including original aliases absent from the later inventory. A process that starts and exits unsuccessfully fails the denial check. The copied-Node control must execute successfully before enforcement and be denied afterward.
`record.ts` accepts an optional installation-evidence JSON path; without it, regeneration makes no installation claim.
New producer runs capture source/input/engine hashes at execution. Recorders reject stale output and write ignored `recorded-report.json` or `recorded-observations.json`; checked historical reports remain unchanged.

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

The Node primary and scoped fixture grammar accept the existing ordered SOAP body and reject the reordered body. All 13 integration consumers now use the async Node helper and retain real transport, TLS, authentication and streaming coverage.
The recorded primary recheck also preserves 14/40 baseline, 38/8 PW01, 113 additional instance observations and 15 boundary controls after the extraction experiment was added.

### Accepted approach

Proceed toward Python removal using the qualified Node primary and independently authored strict TypeScript contract checks.
Retain all original exact research domains, historical external observations, required selections and method families.
Document unavailable full-schema or typed-augmentation evidence explicitly; do not convert it into a passing validator result.

The maintainer accepted replacing the required second general-purpose live engine with this narrower evidence contract. Ordinary defaults, datatype precision and content order retain executable scoped assertions. The #232/#234 proof obligations and production guards remain unchanged.

## Reviewed continuation

The [NT-CONT-01 contract](../test/conformance/reference/continuation-contract.json) prepares continuation from staged revision `a69f04442b4766f7e9068c61fafd94ce1d02577b`.
The user authorized an architectural review in place of the unavailable Task Analysis skill.
The maintainer accepted the contract and authorized delivery; it records every affected method's treatment and remaining unqualified capability.

### Decision and effect

The legacy requirement runs two general-purpose XSD validators; no adequate second Node package has been qualified.
The required lane runs the qualified Node primary, independent TypeScript checks of selected contracts and pinned historical xmlschema observations. NT-CONT-01 accepts one live general-purpose engine, with fresh scoped assertions that never claim full second-engine validation.

All 23 affected methods, the secondary zero-bound baseline instance and all 13 SOAP consumers have assigned replacement scopes.
Ordinary defaults and typed fixed values must retain executable checks of exact value, datatype, original lexical/namespace/source provenance and source identity.
The original huge-bound schemas retain exact contract checks and an explicit unqualified full-schema status; adjusted copies cannot qualify them.

The public-schema research supports prioritizing this Node path but cannot establish that rare cases never occur.
Large input/provenance limits observed in eBay and Travelport require separate Node product work when support is needed.
Neither an uncommon declaration nor an existing budget limit establishes a Python requirement; reconsider Python when a reproducible required capability and a concrete replacement justify the tradeoff.

### Execution order

| Issues | Work before the next stage |
| --- | --- |
| #240, #244, #246 | Offline source snapshot, exact occurrence guard, trustworthy new run provenance |
| #245, #247 | Accepted contract, evidence kinds and bounded shared interfaces |
| #248 through #251 | All mapped family checks, baseline selections and captured SOAP consumers |
| #252 | Atomic command cutover, Python/allowance deletion and manifest/document reconciliation |
| #253 | Verified Python absence/denial on Linux and Windows with Node 24 and 26 |

#247 owns common interfaces and reporting mechanics; family-specific contract checks belong to their existing suite owners.
It does not become a general XSD engine or reopen the RE01 proof.
Use the existing AU01/RE01/PW01/DT01 probes with independent literal expectations and preserve all exact domains and resource limits.

### Review findings and completion checks

The contract assigns eight concrete findings to their existing issues, including Git-history dependence and occurrence spellings that bypass the guard.
The SOAP replacement stages in a separate helper; cutover removed the original executable validation function after replacement verification.
Both reference selections must retain every migrated method, enforce nonempty discovery and preserve 6/15 fast and 14/40 full baseline coverage.

The final guard removes its allowance reader and file together and runs in required CI commands.
Launcher tests, S06 TypeScript discovery, all 147 artifact entries, engine identities and documentation must match the actual cutover.
New qualification records must capture source/input hashes at execution and reject stale raw output rather than attaching current hashes to an earlier run.

All four platform/version lanes require normal `npm ci` and execution under verified interpreter absence or denial.
Enforcement must cover named and absolute interpreter paths with negative controls; removing `setup-python` or masking PATH alone is insufficient.
The [qualification workflow](../.github/workflows/node-reference.yml) runs the four lanes on the exact PR head. It pins npm 11.9.0 so normal install hooks execute, verifies controls before/after installation and checks, and uploads actual reports. The external delivery ledger records successful and unrun lanes without inferring results.

## Reproduction of relevance investigation

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
