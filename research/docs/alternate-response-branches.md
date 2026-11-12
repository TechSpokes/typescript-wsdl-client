# Alternate response branches for independent companion projections

## Decision and scope

Recommend an explicit, opt-in scoped response-branch mechanism as a focused follow-up for independently sourced companion projections. Reuse the native grammar, XML observation and value owners; select one declared branch before validating it, and expose application errors as a separate non-success outcome. This independently reviewed recommendation for [#471](https://github.com/TechSpokes/typescript-wsdl-client/issues/471) does not ship that mechanism or extend checked response support.

Ordinary native choices already express this synthetic XML language when the consumer can supply one coherent replacement source closure. That remains the smaller solution for consumers who own such a closure and an application adapter that interprets the typed alternative. It does not preserve the existing independent-universe projection contract automatically, and ordinary choice validation alone still labels both alternatives `soap-response`.

The starting implementation is `1.4.1`, commit `40fc43fa1954cb9e1121b9d35a2982c41d766aea`. Diagnostics #469 and declared-type corrections #470 are independent delivery work; neither should acquire branch semantics through this investigation.

## Demonstrated evidence

The [strict TypeScript controls](../tests/alternate-response-branches.test.ts) use only synthetic [outer WSDL](../fixtures/alternate-response-branches/outer.wsdl), [companion WSDL](../fixtures/alternate-response-branches/companion.wsdl), [alternate grammar](../fixtures/alternate-response-branches/error.wsdl), [replacement choice grammar](../fixtures/alternate-response-branches/choice.wsdl) and [payload XSD](../fixtures/alternate-response-branches/payload.xsd). All operations and addresses belong to the test; the companion address is never contacted.

| Control | Observed result |
| --- | --- |
| Immediate qualified companion response | Native projected record value, count 1 |
| Public checked response configuration | Same success and alternate-boundary refusal |
| Additional no-namespace wrappers | `mismatch`, `record-wrapper-companion-boundary` |
| Separately authored complete alternate grammar | Native value retains wrappers and attributes |
| Full replacement source with native choice | Both XML branches validate under `$choice` |
| Record projection over that choice | `unsupported`, `record-wrapper-terminal-scope` |
| Both alternatives in one response | Native choice refuses |
| Unknown immediate child | Native choice refuses |
| Qualified substitutes for no-namespace wrappers | Native alternate and choice grammars refuse |
| Wrong application-error namespace | Native alternate grammar refuses |
| Invalid integer or boolean in error | Native alternate grammar refuses |
| Invalid integer in success | Native choice refuses |
| Missing required wrapper attribute | Native alternate grammar refuses |
| Unknown error descendant | Native alternate grammar refuses |
| SOAP 1.1 Fault with actual HTTP 500 metadata | Separate `soap-fault` outcome |
| Application-error XML with HTTP 500 metadata | `protocol` refusal |
| Pre-aborted signal and eight-byte XML allowance | `cancelled` and `resource-limit` |
| Owned HTTP 200 response | Exact bytes retained; same projection refusal and alternate native value |

The owned wire control serves the exact application-error envelope with `text/xml; charset=utf-8`, observes the response bytes and actual HTTP metadata, and compares independently specified JSON. It does not exercise a new branch selector, generated gateway or installed package. The initial sandboxed loopback attempt was denied with `EACCES`; scoped execution with loopback access verifies the same controls without changing network or TLS policy.

Run the bounded controls with:

```bash
npx vitest run --config vitest.research.config.ts research/tests/alternate-response-branches.test.ts
npm run research:typecheck
npm run research:docs
```

## Current ownership and refusal boundary

[Component record projection](../../src/compiler/componentRecordProjection.ts) authenticates independent native contracts, permits one immediate companion output QName, and derives the repeated complex-record path in that companion's universe. The outer family is a unit sequence of fixed standard metadata and one strict wildcard. It refuses ordinary choice terminals, output attributes outside that family, multiple boundaries and longer payload paths.

At runtime, the outer root, attributes, text, ordered children and metadata are checked before the one boundary is assessed through the companion's native mapping. The full companion value survives, including nonrecord fields; absence of records does not establish an application error. A new branch path cannot be implemented by changing only `payloadPath` or searching descendants for a familiar QName.

[SOAP response assessment](../../src/compiler/directSoap.ts) owns envelope/body selection, actual HTTP/media checks, declared fault detail and ordinary protocol Faults. Its projection callback can select only the exact output projection or an authenticated declared fault mapping. It cannot select a second application-output contract today.

[Capsules](../../src/compiler/directSourceCapsule.ts) retain one projection specification and one companion's selector, output, library identities and pinned resources. Reconstruction requires explicit physical companion authority and rebuilds the projection before compatibility is established. [Runtime results](../../src/client/directClientRuntime.ts), [generated client types](../../src/client/generateDirectClient.ts) and the [checked gateway](../../src/gateway/generateCheckedGateway.ts) currently distinguish response, SOAP Fault and refusal; a normally validated choice remains a successful response.

The checked gateway sends valid responses as HTTP 200 and Faults/refused upstream responses as HTTP 502. Its OpenAPI description has the same split. Treating a source-level application-error choice as HTTP 200 would therefore be the existing behavior, not completion of a new typed-error contract.

## Alternatives

### Existing corrections and ordinary choices

The [bounded correction operations](../../docs/checked-gateway.md#consumer-owned-source-corrections) cannot replace a wildcard with a choice, add nested anonymous wrapper grammar or add imports. Occurrence, namespace, insertion and declared-type edits do not supply those missing declarations. Widening a wildcard or changing an error scalar to string would not establish branch authority.

A complete consumer-owned replacement snapshot can instead import the payload declarations and declare the exact no-namespace wrappers as an ordinary choice. The controls demonstrate that native mapping already validates this full language, retains attributes, rejects simultaneous branches and exposes `$choice`. Requalify and regenerate that whole closure; do not imply upstream approval or combine colliding declarations from independent universes.

This approach is sufficient when the consumer intentionally owns one coherent source universe and supplies an application adapter for outcome semantics. It is not a bounded correction to the existing scoped projection and does not solve declaration collisions or independent grammar ownership in the general case. Prefer it over a package feature when those prerequisites hold.

### Explicit scoped projection branches

For the stated independent-universe use case, add a finite, explicitly configured set of independently qualified branch grammars and retain one success projection. Branch discrimination must use exact expanded-name paths from the outer root, including each empty namespace, rather than local-name heuristics. A configured application-error branch should validate the complete outer response under its own grammar, preserving wrapper attributes and constraints rather than validating only an extracted error subtree.

The current native owners demonstrate that both individual grammars can validate the required values. They do not yet demonstrate shared-parse multi-branch selection, a versioned generated outcome contract or capsule reconstruction of a branch set. Those are follow-up implementation obligations, not inferred support.

### External application adapter

An external adapter is a suitable immediate boundary when the consumer owns the wire protocol and complete source grammar. With a regenerated ordinary-choice client, the adapter can convert the validated alternative into a typed application error and explicit non-success HTTP response. It must not infer errors from an empty record array, business-code string matching or a failed success decode.

An adapter around the existing independent scoped client cannot rescue its alternate-branch refusal safely by scraping raw XML. Independently acquiring and validating an error grammar, performing bounded structural selection and maintaining response limits would recreate the proposed package work in the application. Such an adapter remains consumer-owned and requires its own security and transport qualification.

## Follow-up contract

### Source and branch authority

Keep the existing `records-with-declared-wrapper-scope` association unchanged. Add a separately versioned opt-in response-branch configuration containing one success association plus a bounded list of application-error branches. Each branch needs a stable configuration ID, original source URI/digest closure, full operation/output selector, exact root-relative expanded-name discriminator path and native mapping identity.

Qualify every grammar independently, even if root or nested QNames collide. Do not merge source graphs or resolve a branch by a generated TypeScript name. Error grammars must declare the complete outer root, exact no-namespace wrapper path, attributes and qualified payload; no wildcard can substitute for an unvalidated error subtree.

### Deterministic selection and validation

Validate branch definitions before accepting configuration. Require pairwise-disjoint immediate structural discriminators for the first supported family; reject duplicate, prefix-overlapping or otherwise unproved-disjoint branch definitions. Scalar values and vendor codes must not choose a branch.

Parse SOAP once with the existing bounded observation owner, validate protocol grammar and select one output branch by exact direct-child steps. Count every selection step against shared work/node limits, stop on cancellation, and refuse unknown or multiple matches. Do not implement a try-decode loop across contracts.

Once a branch is selected, its full native validation is final. Invalid scalar, unknown child, missing attribute or wrong occurrence must remain that branch's refusal; failure cannot retry the success branch, weaker grammar or generic string mapping. SOAP Fault selection remains protocol-owned and precedes application-output selection.

For the first family, paths are bounded and nonrecursive and there is no per-record selection or streaming. Share the parsed observation across independently owned native mappings without cloning nodes, reserializing XML, stripping namespaces or discarding attributes. Any required cross-owner observation API must preserve the existing issued-handle and node-membership checks.

### Results, HTTP and OpenAPI

Generated direct results should add an opt-in `kind: "application-error"` variant with a configured branch ID and its complete validated native value. Success remains `soap-response`; declared/protocol SOAP Faults remain `soap-fault`. Keep malformed selected outputs as existing failure variants, never successful or empty record data.

For the first generated gateway contract, recommend HTTP 502 for recognized application errors, consistent with current non-success upstream outcomes, with an explicit `{kind: "application-error", branch, value}` envelope. HTTP 200 describes only successful data. The 502 OpenAPI response must distinguish application-error envelopes, existing Fault envelopes and value-redacted refusal envelopes using disjoint required discriminators; generated TypeScript and runtime serializers must agree.

This policy intentionally makes no automatic mapping from business error codes to HTTP 4xx/5xx. Consumer-specific status policy belongs in a separate application adapter. Independently reviewed HTTP serialization tests must confirm that the discriminator survives and that no malformed selected branch is serialized as data.

### Compatibility and retained artifacts

Existing single-boundary clients, runtime bindings and capsules keep their current meaning and bytes. Introduce a new projection/branch-set identity and compatible opt-in runtime/capsule version for branch-enabled generation; old runtimes must refuse unfamiliar artifacts explicitly. Do not reinterpret an existing `component-record-scope-v1` capsule as a branch set.

Hash the complete ordered branch configuration, grammar resource closures, native mapping identities and outcome policy into compatibility. Reconstruct all branches offline using explicit source permissions and pinned generated snapshots. Any source, path, branch order/identity or outcome-policy change requires qualification and regeneration of matching client, capsule, runtime and OpenAPI artifacts.

## Exact implementation packet

The independently reviewed implementation packet is tracked in [#472: Add opt-in independently validated application-error branches to scoped companion responses](https://github.com/TechSpokes/typescript-wsdl-client/issues/472). Its prerequisites are this reviewed decision, ordinary native observation/mapping ownership, the existing single-boundary projection and explicit source configuration. Neither broad #184/#397 completion nor new scalar support is a prerequisite.

1. Extend planning with bounded branch configuration, exact source pinning and proved-disjoint discriminator checks.
2. Add one native branch-set owner that reuses SOAP observation and independently authenticated full-output mappings.
3. Add fail-closed selection, complete branch validation and distinct typed application-error results.
4. Version capsule/runtime compatibility and implement offline reconstruction with explicit authority for every source.
5. Regenerate client types, checked runtime, gateway serializers and OpenAPI from the same outcome plan.
6. Qualify installed generated consumers and owned SOAP/HTTP exchanges, including relocation and cancellation.
7. Document source authority, non-success semantics, opt-in compatibility and regeneration before independent review.

Retain the synthetic fixtures as the starting evidence, then add actual branch-set controls for duplicate/prefix-overlapping configuration, multiple matches, unknown branches, colliding root/field/type names across independent universes, invalid selected scalars, QName spoofing and unsupported namespace/path changes. Include original-byte preservation, stale digests, missing imports, capsule/runtime mismatch, pre-aborted and mid-response cancellation, capacity exhaustion and cleanup.

Installed controls must compare independently expected request/response XML, serialized success/error/Fault HTTP results and OpenAPI schemas. Assert no retry or fallback after a selected error fails validation. Product tests must own adopted behavior and must not import this research spike.

## Remaining limits and review triggers

Demonstrated conclusions are the present projection boundary, individual native grammar feasibility, ordinary choice reuse, strict negative controls, protocol Fault separation and an owned-wire observation. Configuration ambiguity prevention, shared-parse dispatch, generated application-error results and branch-set artifact compatibility remain design proposals requiring implementation and independent review.

The spike does not qualify a production provider, streaming, general recursive discriminators, complete XSD support, new imports through recipes, package installation or generated branch-enabled gateways. Its native inputs intentionally use small public grammars; wider branch families require their own evidence.

Revisit the recommendation if an existing public configuration is shown to preserve independent universes and typed non-success semantics, or if concrete consumer authority permits a consolidated replacement closure. Reopen the contract before allowing overlapping structural discriminators, scalar-based selection, configurable HTTP business statuses, streaming, record-local errors or mutation of existing capsule semantics.
