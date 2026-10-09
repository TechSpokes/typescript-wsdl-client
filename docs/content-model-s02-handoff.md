# S02 Content Model Handoff

Delivery evidence and continuation inputs for architecture contracts and integration feasibility. See the root [README](../README.md).

## Delivery boundary

[S02 #149](https://github.com/TechSpokes/typescript-wsdl-client/issues/149) integrates #168/#169/#170 in [PR #224](https://github.com/TechSpokes/typescript-wsdl-client/pull/224). The issue's final acceptance checkpoint pins the exact delivery head, normal protected merge, joint independent review and local/hosted/merged-main checks. No S03 implementation, public default activation, production transport/schema rewrite, dependency upgrade or release operation belongs to this delivery.

Starting main: `86089d73d02f39b04c0ae2eac8522efc2b3d47c8`. The reviewed draft is `2f88ec81f77f4fc5a06b78f2d507ae8e20fe7a7c`; the original draft `13d33cbaccf1a1de30edd21b1dab9c40aa199acc` received blocking findings which the follow-up commits resolved before probes started. Independent semantic and integration agents explicitly passed the reviewed draft.

| Probe | Independently reviewed source commit | Integrated commit |
|---|---|---|
| Gateway #170 | `d826ff506a80437bca1b747f40b772727643a506` | `f98b8c852e806ea455bc225fc1e2f8c3c99d489c` |
| SOAP #169 | `4d1d3972fbb0f8170232a3bd143f0fcf0adc842d` | `6cf38a5474acc6015539c97e84b0dd17614aee9b` |

## Contracts and ownership

The [ADR-003](decisions/003-content-model-contracts.md) is the contract source; the [decision register](content-model-decisions.md) owns resolved decisions S02-D01 through S02-D11 and the six D06 dialect/fallback subentries. D07's two open security qualification subentries block their affected consumers, with explicit resolution tasks and S03 nonblocking rationale. The [S01 manifest](../test/conformance/semantic-baseline.json) remains unchanged, including its known independently recorded oracle disagreement and BCsabaEngine attribution in the [shipped-fix record](content-model-shipped-fix.md).

S03 consumes D01/D04/D09: ordered syntax and local namespace/base context, legal supported-profile input and bounded policy-controlled fetching. S08/S10 consume D02/D03/D04: XML-value equivalence, admitted lexical witnesses, nil attributes, normalized invisible group history and one scalar/particle core.

#174 implements legacy/new catalog routing; #185/#186 implement bundle/version/fingerprint checks; #195/#196/#201 consume them before dispatch. #204 qualifies migration. The 1.x default stays legacy; the architecture release train is 2.0.0, with default activation separately approved after S17/S18.

#190/#192 consume the transport decision and one shared content encoder. #193 owns verification-before-yield, cancellation, backpressure and declared completion scope; #194 proves parity. #197/#198 emit selected JSON dialects and shared supplemental checks; #199/#200 integrate non-mutating request and independent response validation.

## Proven capabilities and limits

The [SOAP evidence](content-model-soap-feasibility.md) executes eleven tests through actual generated transports and bounded test-only seams. Both carry the same independently validated ordered body; incoming raw XML retains order/namespace/QName/nil attributes; records arrive before EOF. Buffered Basic, HTTP/SOAP headers, UsernameToken, TLS client authentication and outgoing signature verification pass. A per-call action override corrects the locked dependency's multi-binding action collision without mutable global action state.

Current streaming drops configured auth/headers/version/endpoint overrides, faults and early-return cancellation. Raw namespace/fault/cancel seams prove bounded correction points; #192/#193 must implement them. Streaming auth/TLS/SOAP 1.2 and incoming/combined security remain qualification blockers for affected dispatch/yielding. The probe's syntax completion does not certify the future profile's whole-response semantic completion.

The [gateway evidence](content-model-gateway-feasibility.md) executes nineteen tests with validator-visible snapshots and actual response bytes. Route-local Ajv rejects input without repair while the host control route keeps its defaults. Recursion, nullable boundaries, closure, exact strings and ordinary facets execute; test-only supplemental int64/fractionDigits callbacks reject before handler/serialization. Current serializer field loss, changed allOf meaning and unchecked 150-reference fallback are captured failures; independent validation and explicit JSON fallback preserve admitted data.

The selected dialects are OAS 3.1.1 documentation and separate draft-07 runtime/serializer plans. Current OAS output remains 3.1.0; no production lowering changed. #180/#184/#198 implement full shared particle/scalar checks; schema success or inert annotations cannot replace those checks. No foundational S03 decision remains open, but none of these probe seams is a shipped faithful codec.

## Execution and validation

Local toolchain: Node 24.19.0, npm 11.9.0, TypeScript 6.0.3, Vitest 5.0.3 and Python 3.12.14. Locked libraries: soap 1.13.3, saxes 6.0.0, Axios 1.20.0, xml-crypto 6.3.3, xmldom 0.8.15, Fastify 5.12.5, Ajv 8.20.0, fast-json-stringify 7.0.1, Ajv compiler 4.0.6 and serializer compiler 5.1.0. Independent reference tools are lxml 6.1.0/libxml2 2.14.6, xmlschema 4.2.0 and elementpath 5.0.4.

```bash
npm ci --cache tmp/cache/npm
npm run reference:setup
npm run test:feasibility
npm run typecheck:integration
npm run docs:validate
npm run ci
npm run test:reference:full
git diff --check
```

The existing aggregate CI owns build/typechecking, reference subset, all Vitest/conformance tests, documentation/support-matrix checks, pipeline smoke and installed-package smoke. Final exact revision, commands, counts, hosted Node 24/26 and merged-main results are recorded in #149's acceptance checkpoint; historical S01 results are not substituted for new checks.

Leaf validation passed 11 SOAP and 19 gateway tests, integration typechecking, documentation checks and pipeline smoke. Each leaf ran all 138 conformance tests; independent reviewers reran both targeted suites, and the gateway reviewer also reran integration typechecking/docs. The final integration gate runs both together through `test:feasibility` and the repository aggregate.

IDE inspections are unavailable; repository checks provide the portable verification. Private vendor production, real credentials and external provider security systems are unrun. The individual probe records must name every unverified combination; no documentation-only capability counts as executed support. Release preflight, package/tag publication and S03 tests are outside this task.

## Provisional budgets

The [ADR budget table](decisions/003-content-model-contracts.md#provisional-resource-budgets-s02-d09) is authoritative. S03's initial budgets are 128 schema resources, 8 MiB/resource and 64 MiB aggregate decompressed bytes, 32 resolution edges, five redirects/fetch, 15 seconds/resource and 120 seconds compilation I/O, and XML syntax depth 256.

Later first owners enforce 100,000 graph nodes, 1,000,000 matcher transitions/10,000 live states, 1 MiB scalar lexical text/4,096 numeric digits, 32 MiB buffered payloads, 4 MiB stream records, at most 16 queued records/8 MiB, and 30 seconds stream inactivity. These are provisional selected budgets, not measured supported maxima; #208 qualifies measurements without becoming their first implementation owner.

## S03 continuation prompt

```text
Implement and deliver S03 (#150) for TechSpokes/typescript-wsdl-client, starting
with #171. Read current repository instructions and current bodies/comments/
dependencies for #147, completed #149, #150, #171 and #172. Fetch current main
and verify S02's accepted PR #224 and exact final handoff in #149; preserve
unrelated changes and use isolated worktrees. Do not infer readiness from
labels alone.

Read ADR-003, the S02 decision register and both feasibility records. Consume
D01/D04/D09: ordered element/text syntax, expanded names, local namespaces,
full source URI/location/digest and inherited xml:base; keep global identities
distinct from scoped local declarations. Preserve default-element versus
unprefixed-attribute namespace rules and lexical QName context. Keep parser
details behind the #171 adapter and retain legacy default behavior.

After #171's reviewed adapter/provenance contract, implement #172: separately
cache fetched bytes and schema interpretations keyed by digest, effective
document/base URI, effective target namespace and include/import context.
Resolve relative references against the final policy-checked retrieval URI
plus xml:base. Reject DTD/entities, unsupported schemes, unauthorized roots/
hosts/redirects and payload-triggered schema fetching. Implement provisional
budgets and measure at/beyond-limit cases: 128 resources, 8 MiB/resource,
64 MiB aggregate decompressed bytes, 32 resolution edges, five redirects,
15,000 ms/resource, 120,000 ms total I/O and syntax depth 256.

Reuse independent fixtures and add interleaving, arbitrary/default/rebound
namespaces, chameleon includes, identical bytes at distinct base URIs,
relative chains, repeated includes, cycles and forbidden-resolution cases.
Obtain independent substantive review, run required repository checks and
normal protected merges, reconcile #150/#171/#172 and the execution index,
and hand off exact interfaces/revisions/results to S04. Do not implement
the canonical graph, projections, production codecs or activate defaults
during S03; do not publish packages or tags.
```
