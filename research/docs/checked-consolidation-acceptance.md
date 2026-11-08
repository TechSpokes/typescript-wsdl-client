# Checked generation consolidation acceptance

## Scope and release boundary

Issue [#412](https://github.com/TechSpokes/typescript-wsdl-client/issues/412) integrates children #413 through #418 on `agent/wsdl-first-coverage`, starting at `84a932927cb9620264d686b79825c73b8ac760dc`. The approved target is v1.1.7. At startup on November 3, 2026, authenticated GitHub release listings showed v1.1.6 as draft, and npm showed v1.1.5 as latest with no v1.1.6 publication.

The v1.1.6 tag is consumed and immutable. Publication is checked again before merge and tagging because removing its intermediate generation workflow depends on its remaining unpublished. Release and npm publication stay with the maintainer; draft PR #231 and broader owners remain separate.

## Acceptance map

| Child | Delivered behavior | Portable verification |
| --- | --- | --- |
| #413 | Legacy and components generate; shipped direct runtime remains compatible | [Pipeline](../../test/unit/checked-pipeline.test.ts), [installed variants](../../test/integration/component-transferred-installed.test.ts), [old runtime](../../test/integration/checked-direct-installed.test.ts) |
| #414 | Output refusal precedes acquisition; one invocation reuses native preparation and lowerings | [Preparation counters](../../test/unit/checked-preparation.test.ts), [planning](../../test/unit/checked-planning.test.ts), [capsules](../../test/unit/component-source-capsule.test.ts) |
| #415 | Generated bookkeeping supplies defaults; optional overrides and explicit companion associations remain scoped | [Scaffolds](../../test/unit/checked-scaffold.test.ts), [component projects](../../test/integration/checked-component-pipeline.test.ts), [native associations](../../test/unit/component-record-projection.test.ts) |
| #416 | Component readiness and narrow assessment have distinct, honest scopes | [Assessment](../../test/unit/checked-assessment.test.ts), [planning](../../test/unit/checked-planning.test.ts) |
| #417 | One packed tooling installation serves isolated local and URL acceptance cases | [Installed intake suite](../../test/integration/checked-intake-installed.test.ts), [tooling ownership](../../test/helpers/installedIntakeTooling.ts) |
| #418 | Current onboarding, compatibility guidance and v1.1.7 release metadata agree | [Trial](../../docs/checked-generation.md), [reference](../../docs/checked-gateway.md), [release notes](../../docs/releases/v1.1.7.md) |

## Frozen compatibility evidence

The [frozen fixture](../../test/conformance/fixtures/compatibility/v1.1.5/provenance.json) records the published npm archive integrity, producer revision and hashes of its client, capsule and original WSDL. The producer is v1.1.5 from npm, with revision `f7c93f9f3ba720995df47b79ef93e832c0ebcf3d`; its downloaded archive was checked before generating the fixture. Candidate code never regenerates these compatibility artifacts.

The installed direct-runtime harness copies these unchanged Forecast artifacts into an isolated consumer and executes the candidate's package-root runtime. Independent literals check normal values, declared faults, SOAP action/namespaces/order, relocation, version/source/artifact/input refusal and endpoint permissions. Private profiling and other native direct-runtime checks remain independent. No old call is translated into the component transport.

The [committed variant sources](../../test/conformance/fixtures/assessment/direct-variants/padded.wsdl) supplement the original Forecast fixture with padded and large sources, namespace aliases, renamed names, optional/repeated fields, scalar roots and empty records. The component installed harness strictly checks their generated types and independently specified JSON/XML expectations, normal/fault behavior, relocation and refusals. Required repeated fields retain a nonempty tuple type, and HTTP schemas reject XML-forbidden string characters before dispatch.

## Coverage retained during test consolidation

| Previous owner | Current owner | Distinct assertions retained |
| --- | --- | --- |
| `wsdl-first-installed.test.ts` | [Local intake](../../test/helpers/localIntakeInstalled.ts) in the shared installed suite | Automatic CLI/API, malformed roots, one-value recovery, scaffold checks, separate owned HTTPS gateways, checkout denial |
| `w2-intake-installed.test.ts` | [URL intake](../../test/helpers/urlIntakeInstalled.ts) in the shared installed suite | Imports/includes, redirects, explicit origins, zero denied requests, closed snapshots, recovery, relocation, metadata offline |
| Direct pipeline/scaffold tests | [Pipeline](../../test/unit/checked-pipeline.test.ts), [scaffold](../../test/unit/checked-scaffold.test.ts), [gateway](../../test/unit/checked-gateway.test.ts) component tests | Inventory, determinism, cancellation, permissions, output collisions, consumer ownership, dishonest-runtime defense, faults and host policy |
| Direct installed gateway cases | [Installed component gateway](../../test/integration/checked-gateway-installed.test.ts) | Normal/fault wire, optional/repeated/scalar JSON, input/output refusal, limits, cancellation, stale sources/capsules/OpenAPI |
| Direct native/private and published-runtime cases | Existing direct suites plus the frozen installed fixture | Published protocol, flat native grammar, resource controls, forged handles/artifacts and source/endpoint refusal |

No unique assertion was deleted to obtain a passing gate. The shared suite packs and installs tooling once, then keeps all six generated projects and each metadata/SOAP server separate. Generated project installs remain independent. Query-distinct resources and a shared include have independent request counters; additional runtime cases retain empty origin and snapshot denial. Checkout reads are denied explicitly in both installed wire harnesses.

## Configuration before and after

Generation still accepts a WSDL/model and explicit output paths; an unambiguous supported source needs no selectors or graph JSON. Missing-schema drafts now preserve supplied choices and genuinely unresolved locations, without invented selection names or mandatory derived roots. Resubmission performs fresh checks.

Previously an ordinary host copied verbose source, alias, capsule and permission records into an editable file. The generated `checked-source-resources-v2` record now owns those facts relative to the client directory. `npm start` and `buildServer()` load those defaults; optional configuration contains endpoint, host, trust and restrictions. Canonical containment, digest checks, closed physical snapshots and independent native runtime reconstruction remain mandatory.

Complete older configurations remain supported. Explicit advanced source/artifact choices require all four source fields together; incomplete combinations refuse. Omission retains generated defaults, while explicit empty origins, snapshots, libraries and endpoint restrictions remain restrictive. Existing consumer files retain skip/force ownership, so refreshing an older scaffold is deliberate.

Concise companion configuration acknowledges `records-with-declared-wrapper-scope` and selects the outer and companion contracts. Native owners derive the payload path and fixed exclusions; an ambiguous repeated-record path remains an explicit choice. Plans and OpenAPI expose the resolved scope. Complete older projection specifications remain accepted, with matching values, faults and negative checks.

## Measurements and proof boundaries

An independent node-soap constructor counter measured five metadata bootstraps for the original one-operation Forecast plan, then one after consolidation. The same small fixture measured about 153 ms before, about 112 ms after bootstrap reuse, and about 23 ms after retaining lowerings in a later run. These are local observations with warmup and workstation variation, not a latency guarantee.

The first consolidated installed run used one pack taking 2,588 ms and one tooling install taking 11,155 ms, avoiding a second equivalent setup. Its total was 286 seconds. Historical local/URL preflight totals were about 86.6/89.2 seconds on earlier candidates; comparing those whole-run totals would confound workload and environment changes. The measured setup reduction is one pack and one tooling installation.

Portable committed tests do not require private vendor inputs. Retained Escapia replay keeps the 15-operation Main denominator and two-operation typed Content scope against owned services. Content retains complete companion payloads under explicit wrapper exclusions and buffered delivery. Positive examples insert the declared synthetic schema child; unchanged examples missing it remain refusals. No provider connectivity or business acceptance is claimed.

Planning, acquisition, generation, startup and scaffold checks execute no business SOAP operations. Independent wire harnesses perform the actual owned exchanges. Legacy envelopes, raw fields, conversion mappings and streaming defaults remain separately covered by the existing broad tests and pipeline smoke. JSON/OpenAPI describes the generated shape; scalar, ordering and wildcard duties still require native checks.

## Final candidate and delivery evidence

Development checks use native Windows PowerShell, Node 24, strict TypeScript, verified TLS and one test worker. Restricted-sandbox network/junction attempts failed and were rerun with the authorized elevated permissions; they are not successful evidence. One owned companion fault exchange returned a transient transport failure; its focused reproduction and subsequent complete configuration/diagnostic run passed without a transport retry or weakened assertion.

The final PR record binds the nonauthor review and material repairs, release preflight, exact-head Node 24/26 checks, merged tree and tag-triggered draft/artifact verification to the final candidate. Release preflight owns full CI, conformance, reference, snapshot, package/docs, pipeline/installed smoke and skill packaging. Any tracked repair after preflight requires a new final candidate gate.

Detailed development, replay, package and release logs are retained locally under `tmp/conformance/issue-412/` and the installed suites' recorded evidence directories. These ignored archives are execution evidence, not public dependencies. The final delivery report records exact commit identities and task-owned process cleanup. Existing tags, drafts, unrelated work and retained input evidence are preserved.
