# Research

Exploratory schema semantics and historical investigation material for `typescript-wsdl-client`. Use the root [README](../README.md) for the product and [ADR-004](../docs/decisions/004-product-research-boundary.md) for the boundary.

## Scope and status

Universal derivability, whole-forest erasure, finite-catalogue completeness and unrestricted negative decisions remain unresolved under [the research epic](https://github.com/TechSpokes/typescript-wsdl-client/issues/232) and [RE01](https://github.com/TechSpokes/typescript-wsdl-client/issues/234). Relocation does not complete those goals or change any accepted native semantic rule.

`tests/` contains experimental implementations and controls. `reference/` contains their dedicated independent observations and historical method obligations; shared XML fixtures and product reference adapters remain under `test/conformance/`.

Research may consume `src/` and shared test infrastructure. Product code and product validation must remain independent of experimental implementations and research provenance; useful results adopted into the product need maintained product regression evidence.

## Run research

Install the repository dependencies on Node 24 or later, then run the optional lane:

```bash
npm run research:ci
```

Use narrower checks while working:

```bash
npm run research:typecheck
npm run research:test
npm run research:reference
npm run research:docs
```

The research runner records results under `tmp/conformance/research/` and verifies the 37 research migration methods actually ran. The product lane independently verifies its 16 methods; the combined research auditor preserves all 53 original methods and their immutable source blocks.

The optional research workflow runs when research files change or through manual dispatch. The research-platform workflow retains the historical isolated environment qualification for explicit use; it does not gate product PRs.

## Investigation records

- [Joint rule investigations](docs/content-model-s06-research-handoff.md) connect attribute, wildcard, calendar and derivation work.
- [Derivation research](docs/content-model-s06-re-01.md) records retained results and unresolved proof obligations.
- [XML/JSON exploration](docs/v1.0-xml-json-mapping.md) retains exploratory examples and inverse limits.
- [Historical development evidence](docs/content-model-development-checkpoint.md) records earlier delivered slices and limits.

Current JSON representation rules live in the [product mapping contract](../docs/mapping-contract.md), with configuration in the [checked gateway guide](../docs/checked-gateway.md). Research examples do not independently grant product admission or provider support.
