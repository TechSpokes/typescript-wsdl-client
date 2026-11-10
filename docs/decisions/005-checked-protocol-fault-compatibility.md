# ADR-005: Checked protocol fault compatibility

Preserve generated runtime contracts while adding protocol-only fault results. See the root [README](../../README.md) for the documentation index.

## Status

Accepted for the 1.4.0 candidate on 2026-11-10.

## Context

A SOAP fault can describe a protocol failure without carrying declared application detail. Checked SOAP 1.2 already represents such faults without inventing a decoded application value, while checked SOAP 1.1 requires one declared detail. Existing generated SOAP 1.1 clients promise a typed value for every accepted fault, so widening their runtime response shape would break that promise.

Offline response inspection also needs to select one operation from a checked generation project. External source corrections authenticate that project's complete source closure, including companions belonging to operations that are not being inspected.

## Decision

Newly generated SOAP 1.1 component clients use an additive `checkedComponentRuntimeV3` binding and the `checked-component-soap11-runtime-v1` handshake. Existing V1 and V2 bindings retain their contracts, including existing SOAP 1.1 artifact behavior through those bindings; the direct preview remains strict.

The shared component-native SOAP path and offline inspection recognize valid SOAP 1.1 protocol faults. An absent, empty or wholly undeclared detail carries protocol metadata and original response bytes without a decoded application value or declared fault name. A uniquely declared detail still requires native validation; mixed or ambiguous declared detail remains refused.

Preparation authenticates and corrects the complete configured source closure before narrowing native operation selection. Inspection selects the requested projection without mutating the caller's project configuration or dropping inactive companion digest pins.

Correction drafts pin the complete original project closure while resolving correction sites only in the assessed operation's source scope. A draft is suppressed if an assessed source disappears or changes during inventory acquisition. Failed correction preparation leaves the companion unassessed instead of silently substituting the upstream original contract.

Inspection shares the native codec's byte-ownership checks before copying or hashing. Caller-owned byte properties cannot bypass capacities, shared backing stores refuse, and CLI file acquisition uses one bounded regular-file descriptor.

## Constraints

- No provider identifiers, response rewriting or namespace guessing enter product code.
- Invalid declared fault values remain refused rather than falling back to untyped protocol faults.
- Protocol faults remain failures and never become successful application responses.
- Existing capsule formats and source ownership remain unchanged.
- Missing dependencies and stale pins still refuse before response acceptance.

## Regression evidence required

Generic owned fixtures must cover detail-less, empty-detail and undeclared-detail faults, declared valid and invalid values, malformed protocol structure, generated HTTP output and runtime compatibility. Multi-operation inspection must assess both configured operations, preserve inactive source pins and refuse source tampering without network access.

Live provider captures supplement these product regressions and remain outside committed fixtures and package contents. See the [testing guide](../testing.md) and [checked gateway guide](../checked-gateway.md).
