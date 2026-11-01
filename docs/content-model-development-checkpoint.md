# Checked WSDL development checkpoint

## Branch and delivery state

This checkpoint preserves the local implementation and WSDL-first analysis on `agent/wsdl-first-coverage`, based on `6ece8713d0ddfc1af648cb861206222328802737`. It is a development checkpoint, not a release or a declaration of general WSDL support. Package versions and legacy defaults remain unchanged. The unrelated working-copy change in `src/util/errors.ts` is excluded.

The [WSDL-first assessment](content-model-wsdl-first-assessment.md) records the desired consumer workflow, existing implementation gaps, JSON configuration direction and roadmap alignment. That workflow is not yet implemented end to end. The [checked gateway documentation](checked-gateway.md) describes the actual opt-in mode and its limitations.

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
| Consumer workflow | Public pipeline and explicit checked JSON | WSDL-first discovery, unified reports and minimal generated resolution drafts |
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

Begin with a shared inspection/planning result consumed by the existing pipeline and APIs. Derive unambiguous service/binding selections and schema representations, classify blockers, and emit human/JSON reports plus minimal editable resolution drafts. Add a generic supported WSDL with no authored semantic mapping, a missing-import case with one requested value, and distinct invalid/unsupported/inconclusive/ambiguous cases as installed-consumer acceptance tests.

Then expand the supported feature corpus according to useful unrelated contracts. Declare the WSDL/XSD versions and binding families to be covered before measuring progress toward all declared features. Endpoint permissions, credentials and expected business values remain explicit runtime/test inputs. This checkpoint does not authorize publication, a default switch or a separate semantic engine.
