# Checked WSDL development checkpoint

## Branch and delivery state

This checkpoint preserves the implementation and WSDL-first analysis on `agent/wsdl-first-coverage`, based on `6ece8713d0ddfc1af648cb861206222328802737`. W2 continues the clean local prerequisite at `9adac1da3d8a5884064291ee76c6d696318ca363`; the former `src/util/errors.ts` marker was stale metadata. This is a development checkpoint, not a release or general WSDL support claim. Package versions and legacy defaults remain unchanged.

The [WSDL-first assessment](content-model-wsdl-first-assessment.md) records the original consumer workflow gaps, JSON configuration direction and roadmap alignment. Issue #405 adds the bounded local WSDL-first slice described in the [checked gateway documentation](checked-gateway.md): unambiguous selection, shared native planning and minimal missing-import recovery. This does not complete arbitrary source repair or broad WSDL coverage.

## Implemented and locally verified

The additive `checked-components-v1` pipeline reuses the native source, contract, mapping, XML codec and SOAP transport owners. It supports the qualified imported/structured fragment, inherited and repeated records, attributes, ordered content and supported scalar restrictions. Fixed standard schema acquisition and explicit companion-payload projections are reusable capabilities; the engine contains no Escapia-specific dispatch branches.

Original Escapia contracts were the acceptance case. Independent consumers generated, installed, strictly typechecked, tested and built all 15 EVRNService operations and both EVRNContentService operations. Separate generated gateway processes completed 46 Main and six Content exchanges against owned verified HTTPS SOAP services with independent expectations. Invalid HTTP cases caused no upstream calls, and invalid responses were refused. The two services retain distinct binding identities and route prefixes.

| Service | Operation | Installed owned-wire result |
| --- | --- | --- |
| EVRNService | UnitDescriptiveInfo | Passed |
| EVRNService | UnitSearch | Passed |
| EVRNService | UnitCalendarAvail | Passed |
| EVRNService | UnitStay | Passed |
| EVRNService | UnitRes | Passed |
| EVRNService | UnitRead | Passed |
| EVRNService | UnitInquiry | Passed |
| EVRNService | UnitCalendarAvailBatch | Passed |
| EVRNService | Campaign | Passed |
| EVRNService | PropertyManager | Passed |
| EVRNService | UnitHold | Passed |
| EVRNService | ReservationCancel | Passed |
| EVRNService | UnitCalendarAvailExtended | Passed |
| EVRNService | ReservationUpdate | Passed |
| EVRNService | BookingChannels | Passed |
| EVRNContentService | UnitDescriptiveInfoStream | Passed with explicit companion view |
| EVRNContentService | UnitCalendarAvailBatch | Passed with explicit companion view |

Content retained 94 descriptive and 104 calendar records with independently checked identifiers/order and complete companion payload preservation. Its configuration is manually supplied, delivery is buffered, and validation has explicit wrapper/wildcard exclusions. Positive replay inserted one declared synthetic schema element into published example XML. Unmodified examples missing that required element were tested separately and refused. No provider connectivity or business acceptance follows.

## Verification provenance

The reviewed implementation passed full native Windows CI: 4,573 broad cases with four existing skips and 253 reference cases with three skips, plus strict TypeScript/toolchain checks, documentation/package validation, pipeline smoke and installed-package smoke with 73 TypeScript artifacts. Separate strict unit and diagnostic checking passed. A focused 17-case suite covers scoped artifacts, source changes/permissions, endpoint denial, declared faults, serialization and cancellation. Those gates preceded these documentation/changelog additions; no engine or test code was changed to prepare this commit.

The same nonauthor reviewer verified the 405-file implementation snapshot and then the 559-file final evidence snapshot before and after inspection, with no unresolved actionable findings. The closing review verified all 117 preserved example files against consumer originals. This is scoped static review and evidence consistency checking, not independent execution, full-profile acceptance or provider approval.

Detailed logs, exact install/generate/typecheck/test/build/start arguments, archived harnesses, the operation ledger, original inputs/provenance and runnable projects remain locally under `tmp/conformance/escapia-2026-10-31/`. The final candidate package SHA-256 is `6b24044e4085d433117e0b7cd4725a34c0feefe78b713b98bfbafd0a2920d81a`; its installation evidence is `candidate/component-installs/run-F97NA9`, and final wire evidence is `candidate/component-wire-runs/run-pLnNR2` and `candidate/component-wire-runs/run-Fx2dPI`.

Ignored archives, dependencies, machine-specific logs and vendor/example XML are not added to Git by this checkpoint. The original bytes remain preserved locally; inclusion in a future portable regression corpus needs explicit fixture/provenance review. Generic engine regression fixtures and tests are committed. A fresh clone can run repository tests; reproducing the vendor-specific trial additionally requires the retained or independently supplied original contracts and explicit configuration.

## Distance to broad WSDL coverage

There is no defensible coverage percentage or completion date. The current public matrix contains a bounded legacy pattern corpus, not an inventory of every WSDL/XSD feature or combination. The checked model has a different, narrower qualified profile. Seventeen successful operations from two related services are useful integration evidence but not a representative denominator for arbitrary WSDLs.

| Area | Current position | Remaining delivery |
| --- | --- | --- |
| Consumer workflow | Shared WSDL-first component planning and missing-import drafts | Broader recovery and optional application views |
| Schema semantics | Qualified structured fragment with native checks | Wider derivation, nil/polymorphism/identity and other excluded feature combinations |
| Protocol coverage | Qualified document/literal SOAP 1.1 | Further SOAP versions/styles, attachment and policy combinations with owned evidence |
| Security and streaming | Verified TLS for the acceptance path; existing legacy streaming | Broader configured security and checked incremental delivery/completion qualification |
| Overrides | Explicit sources, selections and companion views | Guided suggestions, naming/adapters, bounded amendments and stale-override refusal |
| Portability and release | Installed local candidate | Broader standalone migration, independent corpus evidence and release/default gates |

The remaining work is several substantial deliveries, not one mapping-file enhancement. The [current roadmap](../ROADMAP.md), product #401 and useful-coverage #397 remain the governing direction. The existing post-1.0 inspector plan and CLI/API owner #201 are the appropriate place for the next WSDL-first workflow slice; #202 owns generated test suggestions, and #185/#186 preserve contract compatibility. Full-profile owners and draft PR #231 remain separate and unclosed.

## Safe interpretation of overrides and allowlists

Source-root/origin permissions, operation selection, naming choices and explicitly scoped payload views can be represented in configuration. Such an allowlist grants permission or selects behavior; it does not prove that an unsupported schema can be encoded and decoded faithfully.

An unsupported feature cannot become checked merely by adding its name to a whitelist. Any opaque or reduced-guarantee mode must declare exactly what is preserved and validated. A source repair must identify the original declaration, preserve provenance, refuse stale inputs and pass fresh native checks on the effective contract. Custom application mappings need explicit serialization behavior and tests. No silent downgrade, discarded data or admission-flag override is acceptable.

## Next development boundary

Issue #405 delivers the bounded shared inspection/planning slice. The next coverage decision is to qualify an unrelated structured WSDL family under #397 before expanding inference or protocol families. Broader recovery, companion inference and arbitrary source repair remain separate decisions.

Then expand the supported feature corpus according to useful unrelated contracts. Declare the WSDL/XSD versions and binding families to be covered before measuring progress toward all declared features. Endpoint permissions, credentials and expected business values remain explicit runtime/test inputs. This checkpoint does not authorize publication, a default switch or a separate semantic engine.

## W1 local WSDL-first delivery for #405

The opt-in component pipeline and package-root `planCheckedComponents` now share discovery and native preparation. A local supported source with one service/port/binding selects every operation without authored semantic JSON. Partial explicit choices remain supported. The containing directory supplies the documented default root; outside-root resources, metadata origins, standard libraries, companion views and runtime endpoints still require explicit authorization. Explicit snapshot sets remain closed.

`checked-component-plan-v1` records the full discovered service/port/binding/portType/operation denominator, bound operation identities, opaque source locators/digests, independent dimensions and actionable blockers. Loading failures retain incomplete inventory. Selection, qualification, mapping, source relocation and non-writing client/gateway lowering run before readiness; changes between discovery and native preparation refuse. No report, draft, digest or user whitelist grants eligibility. Direct assessment, checked-direct behavior, compatibility checks and legacy defaults remain separate.

### Configuration before and after

The automatic CLI and root-API cases supply only WSDL/model and ordinary explicit output/scaffold options. Neither supplies selectors, schema mappings, examples or endpoint permission during generation. The recovery case starts with one locationless import of `urn:conformance:import-relative-types:types`. Its generated draft retains the known selections and roots, with one `REQUIRED_SCHEMA_LOCATION` value. Replacing that value with the existing authorized `import-relative-types-types.xsd` path completes recovery through fresh native checks. Unresolved drafts refuse before source loading. Reports/drafts preserve existing files unless their explicit force option is supplied.

### Complete installed result inventory

The final independent installed acceptance is retained under `tmp/conformance/wsdl-first-installed/run-L2sjsz/`. It packs and installs the package outside the checkout and exercises automatic CLI, automatic root API and resolved-import CLI generation. All three projects install, strictly typecheck, test, build and start as separate gateways with checkout reads denied.

Each discovers/selects/generates one `ImportPortType` / `ImportBinding` / `SubmitImported` operation in `urn:conformance:import-relative-types`; execution is recorded only by the independent wire harness. This is three project-operation results and three owned verified-HTTPS exchanges, representing one distinct synthetic operation and two dependency-location arrangements. It is not a broader service-coverage denominator.

Each project produces 19 artifacts. `cli-artifacts.json`, `api-artifacts.json` and `recovery-artifacts.json` retain every relative filename; matching inventory and wire JSON files record the complete operation/result denominator. The generated files comprise the service client and operation client, one contract, copied WSDL/XSD, source provenance and inventory, merged OpenAPI, service/operation gateway plugins and operation schemas/OpenAPI, server, package/TypeScript/runtime configuration, README, gitignore and scaffold test.

Runtime endpoint allowlists are supplied separately for owned execution. Independent XML/action/namespace/order and typed-response assertions pass; invalid HTTP causes zero additional SOAP calls.

`before.json` and `after.json` retain the exact editable configuration change. `missing-report.json` retains the focused dependency request, and `timing.ndjson` records every install/generate/typecheck/test/build/wire command outcome.

Automatic CLI/API generation took 0.671/0.681 seconds; missing-import diagnosis took 0.560 seconds, unresolved-draft refusal 0.519 seconds and resolved regeneration 0.639 seconds. Recovery required one human-supplied value. The four-minute per-stage harness watchdog is test infrastructure, not a product deadline or latency requirement.

### Validation and review disposition

Focused planning tests cover determinism, automatic generation, one-value recovery, ambiguous/conflicting choices, same-local-name full identities, unsupported bindings, unrelated whole-source invalidity, inconclusive correspondence, missing dependencies, permissions, cancellation, unknown/accessor controls, duplicate snapshots, source drift and report ownership. Component integration additionally covers source alias refusal before readiness and preserved explicit companion/scaffold behavior. Strict unit/integration TypeScript and documentation checks passed.

The full Windows CI passed in 923.783 seconds with one test worker. It passed 4,586 broad cases with four existing skips, plus 253 reference cases with three existing platform skips. Toolchain/strict checks, docs/package validation, conformance within broad Vitest, pipeline smoke and installed-package smoke with 73 TypeScript artifacts all passed; unchanged aggregate evidence is reused rather than repeating equivalent conformance runs.

The exact command output and timing are retained in `tmp/conformance/wsdl-first-405/ci.log` and `ci-result.json`. Focused commands were `npm exec -- vitest run test/unit/checked-planning.test.ts --maxWorkers=1`, component integration plus S06 provenance tests, `npm exec -- tsc -p test/unit/tsconfig.json`, `npm run typecheck:integration` and `npm run docs:validate`. CI executes the full package script graph; TLS remains verified with the Windows system CA and no global resource-policy changes.

The primary agent executed the checks. One nonauthor reviewer statically inspected the working candidate against `1c6caac3969d72aa1c6b5d33d537f73a734bd18c`, excluding unrelated `src/util/errors.ts`. Three findings were fixed: readiness preceding layout/lowering checks, malformed CLI roots bypassing validation and snapshot conflicts falsely disproving source legality.

Resource drift and the final reporting/evidence deltas were also reviewed; no actionable findings remain. The reviewer ran no tests and issued no independent execution or provider approval. IDE inspections were unavailable; repository-local checks provide verification.

The first full-gate attempt exposed the expected pinned loader hash change from the diagnostic document observer. The S06 manifest pin was refreshed without changing research claims. A subsequent strict build caught a CLI type-narrowing error, which was corrected before the final gate.

Failed-attempt logs are preserved. Package versions remain 1.1.5; local development commits target 1.1.6. No remote CI, Linux/WSL/container run, push, PR mutation, merge, tag, release, publication, deployment or production SOAP call is part of this delivery.

Broader owners and draft PR #231 remain open and unchanged. Task-owned gateway and SOAP listeners close in harness cleanup, and disposable installed consumers are removed; retained evidence and unrelated work remain intact.

## W2 intake and endpoint delivery for #406

This section supersedes W1's manual remote-resource bookkeeping and duplicate component endpoint permission requirements. The reviewed dispatch implements #407 and #408 together on the existing branch; #409/#410 and broader source, security, companion and product owners remain open. There is no XML negotiation, validation bypass, universal conversion, companion discovery or default-mode change.

### Supported behavior and configuration

Supported HTTP(S) WSDL roots acquire their declared same-origin WSDL/XSD graph through the existing loader, planner and pipeline. A reusable `sourceOrigins` decision adds an exact additional origin; explicit empty origins and closed physical snapshot sets retain denial semantics. Redirects retain final bases and aliases, query-distinct resources remain distinct, shared dependencies are fetched once, and source-declared remote-to-file transitions refuse. Native unsupported graphs, including unsupported cyclic bootstrap cases, remain refusals.

Generation writes original bytes, digests, provenance, logical root/alias records and relocated runtime configuration. Runtime independently authorizes physical files, requalifies source and compares artifacts without downloading metadata. Regeneration reacquires URL inputs; saved reports grant no authority. Existing scaffold skip/force ownership and non-atomic emission limits remain unchanged.

Before W2, a remote project authored resource maps and selectors and duplicated an endpoint in an allowlist. The ordinary component CLI now needs WSDL/model and explicit output options; its same-origin case has no checked JSON. The root API cross-origin case supplies only `sourceOrigins: [secondOrigin]`. A locationless import still requires one supplied location, followed by fresh native checks.

On invocation, the selected service/port address or explicit override supplies routing intent. Omitted component restrictions permit that destination; explicit callbacks/lists narrow it, including empty deny-all. Component injection uses `checked-component-runtime-v2`, with the existing exported binding name retained; regenerate matched clients, capsules, gateways and consumer scaffolds deliberately. Direct-preview permissions, legacy JSON/raw fields, checked result/fault values, typed mappings, strict wildcard checks and streaming defaults remain unchanged.

### Installed proof inventory

The final W2 synthetic installed evidence is `tmp/conformance/w2-intake/run-wpHKQb/`, repeated within successful CI; `run-scS7dM/` preserves the preceding equivalent three-project proof. The ordinary CLI, cross-origin root API and resolved-import root API each generate one operation from four physical metadata documents: root WSDL, imported definitions WSDL, imported schema and nested included schema. The graph includes root/dependency redirects; API acquisition uses one explicitly permitted second origin. Ordinary cases author no dependency records, selectors, type mappings or examples; recovery edits one location in the generated draft.

All three projects install, strictly typecheck, run scaffold tests, build, relocate and execute with both metadata servers stopped. Each completes three separate-gateway exchanges and one direct installed-client exchange. The twelve independently counted wire observations are exactly declared, override, allowed override and declared per project; explicit empty/mismatched restrictions and invalid HTTP values add zero calls. Exact Saxes expanded-name/order/text/action expectations specify the SOAP request independently. Acquisition, generation, startup and scaffold tests add zero business transactions.

The complete operation/source/artifact inventories are the CLI/API/recovery `inventory.json`, `source-resources.json` and `artifacts.json` copies in that evidence directory. Each project has 21 files, including service and per-operation client/types, capsule, copied source bytes and provenance, inventory, merged/per-operation OpenAPI, service/operation gateway modules and schemas, server, package/TypeScript/runtime configuration, README, gitignore and scaffold test. `before.json`/`after.json` retain the one-value recovery; `timing.ndjson` and stage logs retain command results.

Final CLI/API/recovery generation took 1.046/0.743/0.732 seconds; cold same-origin planning took 1.450 seconds, denied cross-origin diagnosis 0.600 seconds and missing-location diagnosis/recovery 0.576/0.683 seconds. The preceding two-project proof also passed in 79.66 seconds at `run-hQiyDc`; the final three-project proof strengthens its request oracle and adds installed remote recovery. These observations describe owned synthetic inputs, not provider latency or a performance guarantee.

Escapia evidence is `tmp/conformance/w2-escapia/run-ElGNc0/`, with complete operation lists in `result.json`, `evrn-inventory.json` and `content-inventory.json`, and complete artifact lists in `evrn-artifacts.json`/`content-artifacts.json`. All 15 Main identities listed earlier in this checkpoint regenerate from an owned HTTPS root with zero authored resource records or selectors. Its two-document source graph preserves original dependency bytes and rebases only the WSDL schema acquisition origin; original hashes are verified and retained. Main's 89 artifact files install, strictly typecheck, pass 16 scaffold tests and build; generation took 19.009 seconds.

Content retains its original four-document outer/companion graph, two explicit resource records, two selectors, fixed standard library and explicit record projections. Both Content operations produce 26 artifact files, install, strictly typecheck, pass three scaffold tests and build; generation took 15.055 seconds. The retained separate-process HTTPS harness passes six exchanges in 101.101 seconds with 94 descriptive and 104 calendar records, complete companion payloads and independent identifier/order checks. Positive replay inserts one declared synthetic schema child; unmodified examples missing it and invalid scalar responses still refuse. No production SOAP or provider acceptance is claimed.

### Validation and delivery status

The focused compatibility/transport suite passed 32 cases before review; final repair checks passed ten W2 intake cases, ten component SOAP cases and five local/URL companion pipeline cases, with eleven planning cases also retained. Scoped strict unit/integration/harness checks, toolchain guard and documentation validation passed. The two loader source pins in S06 provenance were refreshed without changing historical measurements or research claims. IDE inspection tools were unavailable; repository-local checks provide verification.

One nonauthor reviewer identified and reviewed repairs for remote `xml:base` provenance, primary logical-root leakage into companion reconstruction, conflicting offline aliases in either traversal order and cached-alias byte limits. The reviewer also requested the exact installed request oracle and missing-address refusal/override evidence; these are implemented and executed. Review is static source/evidence inspection, not independent execution. A Content authored-selector summary counter was corrected from zero to two with an audit note; actual configuration and command/wire logs are unchanged.

Earlier attempts retain honest failures: sandbox junction permissions required an elevated rerun; the new gateway guard initially omitted `sourceUri`; the direct-client harness used the wrong invocation signature and then expected a plain prototype; the Escapia harness initially omitted existing companion selectors. These were corrected without changing JSON values or relaxing native checks. The first full CI took 1,272.45 seconds and found one obsolete HTTP-alias refusal assertion after 4,598 passes and four skips; the assertion now checks preserved alias identity while retaining forged-source and Windows junction refusals. Its focused rerun passed all 13 source-layout/intake cases.

Final `npm run ci` passed in 1,344.60 seconds with one worker on Windows Node v24.21.0. It passed 4,599 broad cases with four existing skips, 253 reference cases with three existing skips, strict/toolchain checks, skill/package/docs validation, pipeline smoke and installed-package smoke with 73 TypeScript artifacts. Full conformance and unchanged snapshots ran within broad Vitest discovery; equivalent separate conformance/snapshot-update runs were not duplicated. Logs/results are `tmp/conformance/w2-ci/final/ci.log` and `result.json`; the failed attempt remains separately preserved. A dependency deprecation warning and npm update notice were informational.

Source and tests remain unchanged after that successful gate; final checkpoint prose receives its own documentation validation and closing static review. The exact candidate manifests and 166-path unpublished inventory are under `tmp/conformance/w2-review/`. Normal same-branch commit/push follows closing review; the final chat and `delivery.json` in that directory record local/remote identity and hosted-check observations. This branch push does not trigger current CI, so absent hosted checks are not a CI pass.

Task-owned harnesses close and await gateway/metadata/SOAP processes and remove disposable installed consumers. Existing unrelated process chains, retained originals/evidence and draft PR #231 are preserved. Package and lockfile versions remain 1.1.5; development commits target 1.1.6. Production SOAP, Linux/WSL/containers, manually dispatched hosted workflows, PR mutation, merge, tag, release, publication and deployment were not performed. #409/#410 and broader owners remain open.

## Dependency alert follow-up

The same branch addresses Dependabot #99 (`follow-redirects`, GHSA-mrwp-f3q8-3g9p) and #101 (`minimatch`, GHSA-g3hv-75wg-m249). The runtime lock moves `follow-redirects` from 1.16.1 to 1.16.2 within the existing `soap`/Axios ranges. The advisory concerns caller-supplied custom sensitive headers in cross-realm arrays; this inspection does not establish that the application's Axios path leaks credentials.

Current upstream ESLint, typescript-eslint and rimraf releases still request minimatch 10 or glob 13. Root overrides select minimatch 11.0.3 and, under rimraf, glob 14.0.3 with path-scurry 3.0.0 and the new nonrecursive matcher dependency. Old glob cannot safely consume minimatch 11's changed pattern objects, so the pair is upgraded together; this also resolves the newer glob cancellation advisory GHSA-3g3m-2fjr-6pw4 found by npm audit.

These are development-only overrides, not a new runtime policy. Remove them when upstream ranges support the patched versions. Three committed strict TypeScript compatibility cases exercise ESLint brace patterns and ignores, TypeScript default-project matching with typed linting, and asynchronous/synchronous rimraf glob deletion with preserved nonmatches on Windows.

The local resolved-tree audit moves from 14 affected package entries (three underlying advisories, including dependent packages) to zero vulnerabilities. Root lockfile changes and overrides do not update an existing consumer's lockfile; consumers must refresh their own dependency resolution. GitHub alerts track the default branch and can remain open until the fixes reach it.

Final one-worker `npm run ci` passed on Windows Node v24.21.0 in 1,157.76 seconds: 4,602 broad cases with four existing Windows skips, 253 reference cases with three existing Windows skips, strict/toolchain checks, unchanged snapshots, conformance, docs/package/skill validation, pipeline smoke and installed-package smoke with 73 TypeScript artifacts. The fresh W2 installed proof at `tmp/conformance/w2-intake/run-5IabpT/` passed all three projects and twelve owned exchanges; W1's `run-AtHCgO` passed three projects and three exchanges. Original Escapia replay evidence is reused unchanged, not rerun for this dependency-only repair.

The three new compatibility tests also passed separately in 3.89 seconds with strict tooling typechecking. One nonauthor statically reviewed the five-file candidate and inspected resolved consumer APIs with no actionable findings; the reviewer executed no tests. Final CI, audit and candidate evidence are retained under `tmp/conformance/w2-dependencies/`; closing documentation validation and source/evidence review precede the normal same-branch commit/push. Package versions remain 1.1.5, and no PR, default-branch or release mutation is included.
