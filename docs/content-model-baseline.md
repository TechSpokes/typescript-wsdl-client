# Content Model Baseline

Bounded S01 evidence for current output and independent XSD 1.0 validation. See the root [README.md](../README.md) for documentation navigation.

## Purpose and boundary

[Task #166](https://github.com/TechSpokes/typescript-wsdl-client/issues/166) characterizes the finite corpus agreed in [S01 #148](https://github.com/TechSpokes/typescript-wsdl-client/issues/148). It preserves the shipped #141 correction and public defaults; remaining semantic repairs belong to [epic #147](https://github.com/TechSpokes/typescript-wsdl-client/issues/147).

The source baseline is main at `b633cd1561ccb2689134a7289cf48bb097b0d1f1`, with package v1.1.4, TypeScript 6.0.3 and Node 24.19.0. The runner reports the actual checked-out commit and tracked dirty state separately from this production baseline; PR and issue acceptance records pin the final tested delivery commits.

## One authoritative manifest

[`semantic-baseline.json`](../test/conformance/semantic-baseline.json) owns the 14 case IDs, inputs, expected reference outcomes, current generated behavior, intended semantics and gap disposition. Each case links a capability in the existing [registry](../test/conformance/registry.ts); the two new research rows record limitations rather than increasing supported-feature claims.

The corpus reuses the [occurrence fixture](../test/conformance/fixtures/xsd/sequences/sequence-occurrence-wrappers.wsdl) from the public #141 example and the existing [simple-choice fixture](../test/conformance/fixtures/xsd/compositors/choice-union-simple.wsdl). The [boundary fixture](../test/conformance/fixtures/xsd/compositors/content-model-boundaries.wsdl) adds legal minimal cases, while [invalid-all](../test/conformance/fixtures/xsd/compositors/content-model-invalid-all.wsdl) preserves a historical illegal input with an explicit schema-rejection disposition.

### Manifest fields

| Field | Meaning |
|---|---|
| `id`, `family` | Stable case and bounded semantic family |
| `capabilityId`, `fixture`, `provenance` | Existing registry link and sanitized source |
| `findings` | Stable CM identifiers from epic #147 |
| `schema` | Expected independent schema-compilation outcome |
| `instances` | Committed XML inputs and expected reference outcomes |
| `current` | Observed catalog, scoped TypeScript and OpenAPI assertions |
| `current.defaultChoice` | Separate current default-mode assertions for choices |
| `intended` | Desired schema meaning, not production expectations |
| `disposition` | Remaining gap and numbered downstream owners |
| `downstream` | Real transport, registry mock, unrun or inapplicable evidence |
| `referenceDisagreement` | Explicit validator disagreement and resolution owner |
| `fast` | Membership in the required deterministic subset |

All fixture paths are relative to `test/conformance/fixtures/`. Current OpenAPI assertions use `flattenArrayWrappers: false` to expose the element properties; the existing occurrence transport suite separately exercises both wrapped and flattened HTTP responses.

The [characterization suite](../test/conformance/semantic-baseline.test.ts) compiles the fixtures and compares current catalog/type/schema results with literal manifest expectations. Choice cases execute opt-in `union` and current default `all-optional` independently; neither mode's name serves as evidence of its behavior.

## Setup and reproduction

Python 3.12 with `venv` and Node 24 or 26 are required for reference qualification. The test-only [requirements](../test/conformance/reference/requirements.txt) pin lxml 6.0.2, libxml2 2.14.6 as checked at runtime, xmlschema 4.2.0 and elementpath 5.0.4; incompatible engines fail with a setup diagnostic.

Run setup once with package-index access, then validation requires only committed inputs and installed tools. No production dependency or runtime validator is introduced.

```bash
npm ci --cache tmp/cache/npm
npm run reference:setup
npm run test:reference
npm run test:reference:full
npx vitest run test/conformance/semantic-baseline.test.ts test/integration/sequence-occurrence-transport.test.ts
npx tsc -p test/conformance/tsconfig.json
```

`reference:setup` creates `tmp/conformance/reference-venv` and installs pinned binary wheels. On Windows the launcher selects `Scripts/python.exe`; elsewhere it selects `bin/python`. `S01_SETUP_PYTHON` selects the interpreter used to create the environment, and `S01_REFERENCE_PYTHON` selects an already provisioned matching interpreter.

Keep these executables outside generated consumer artifacts. `npm run clean:tmp` deletes the virtual environment, so repeat setup afterward; ordinary pipeline resets remove only `tmp/smoke`.

### Required and full lanes

`npm run test:reference` runs six deterministic cases: original-sequence, simple-choice, sequence-order, zero-group-unbounded, finite-count-gap and invalid-all-sequence. Both existing hosted Node 24 and Node 26 jobs provision Python and run this command through their aggregate scripts; `npm run ci` also requires it.

`npm run test:reference:full` qualifies every manifest entry, including the secondary check for the documented disabled-element disagreement. Ordinary Vitest characterization without the tool is not passing reference evidence. Missing tooling, wrong versions, missing fixtures, forbidden dependencies and result disagreements exit nonzero.

The launcher also executes small adapter tests for setup failure, missing input, schema rejection, reference disagreement and prohibited external resources. The TypeScript unit test verifies that a missing interpreter fails the required lane.

To retain machine-readable full evidence on a committed tree:

```bash
npm run --silent test:reference:full > tmp/conformance/semantic-reference-full.json
```

## Reference adapter responsibilities

The [Python adapter](../test/conformance/reference/validate.py) extracts one embedded schema and materializes inherited namespace bindings before compiling it. This preserves prefixes used only in QName-valued attributes, such as `type="tns:AddressType"`; losing those bindings would manufacture schema failures.

libxml2 supplies primary schema and instance results without importing production semantic helpers. Expected results are literal independent assertions in the manifest, not computations from catalog bounds.

The adapter rejects DTDs and schema import/include/redefine directives, disables entity resolution and networking, and confines inputs to the committed fixture root. This boundary is sufficient for the selected self-contained corpus; broader schema loading remains with its downstream owners rather than a second production loader.

Schema compilation and instance validation have separate output fields. A rejected schema produces no instance results; malformed or missing inputs and missing tooling are setup/input failures rather than expected instance rejection. Successful qualification means recorded observations agree, including explicitly assigned disagreements; it does not prove the future faithful model is implemented.

## Executed outcomes

Full qualification covers 14 cases: 13 schema-accepted cases, one schema-rejected case and 40 primary instance checks. These span four distinct WSDL fixtures; schema results are cached per fixture but reported per case. The required subset covers six cases and 15 instances.

The illegal nested sequence beneath `xs:all` fails schema compilation before instance evaluation. Its legal optional-all counterpart accepts the empty group and a single item, and rejects two items; production output still requires the item.

### Validator disagreement

For `zero-element-unbounded`, libxml2 2.14.6 accepts both the empty instance and the instance containing a disabled `row`. The independently pinned xmlschema 4.2.0 implementation rejects that row, agreeing with the intended zero-occurrence semantics; the full runner executes and reports this secondary outcome.

The primary `accepted` expectation characterizes libxml2's limitation, not valid XSD semantics. [#181](https://github.com/TechSpokes/typescript-wsdl-client/issues/181) owns reference-oracle follow-up under CM-15, while schema analysis, matching and projection owners retain the implementation gap. Do not use primary acceptance here to approve a future codec.

## Consumer evidence and limitations

The [real SOAP transport test](../test/integration/sequence-occurrence-transport.test.ts) and [shared harness](../test/helpers/occurrenceTransport.mjs) verify singleton and two-item response arrays, omitted optional requests, repeated bounded/unbounded request XML and gateway JSON bytes after serialization. Both wrapper-flattening modes execute, and installed-package smoke reuses this harness.

This proves the focused occurrence shape correction and singleton normalization, not complete XML-instance validation. Other boundary cases have catalog/type/OpenAPI evidence only unless their manifest explicitly links registry mock evidence; no production vendor WSDL or later buffered/streaming architecture probe is claimed.

Finite lengths and the 2-or-4 count hole remain unenforced in generated arrays. Repeated `(a,b)` sequence order and group correlation are lost in independent property arrays. Disabled groups, optional all, inherited choice bounds, repeated selections and empty alternatives retain current limitations.

Current default choice output requires scalar fields for the selected minimal fixtures, while opt-in union expresses a single exclusive branch. A required repeated choice needs two selections, potentially of the same branch; neither current representation captures that language.

Wildcard metadata retains local bounds, but the current TypeScript/OpenAPI projection omits ordered wildcard elements and enclosing repetition. These are characterization results, not new supported-pattern claims.

## Downstream ownership and S02 inputs

Each manifest disposition records concrete issue numbers. Subsequent consumer qualification owns the applicable client/gateway behavior; the existing public [support matrix](supported-patterns.md) remains authoritative for released claims.

| Responsibility | Owning issue |
|---|---|
| Bounds, choice presence and count analysis | [#178](https://github.com/TechSpokes/typescript-wsdl-client/issues/178) |
| Schema legality and reachable support | [#179](https://github.com/TechSpokes/typescript-wsdl-client/issues/179) |
| Ordered particle matching | [#180](https://github.com/TechSpokes/typescript-wsdl-client/issues/180) |
| Independent oracle disagreement | [#181](https://github.com/TechSpokes/typescript-wsdl-client/issues/181) |
| Reversible value and branch projection | [#182](https://github.com/TechSpokes/typescript-wsdl-client/issues/182) |
| Faithful XML encoding | [#188](https://github.com/TechSpokes/typescript-wsdl-client/issues/188) |
| HTTP representation validation | [#198](https://github.com/TechSpokes/typescript-wsdl-client/issues/198) |

[S02 #149](https://github.com/TechSpokes/typescript-wsdl-client/issues/149) must decide how ordered/group-correlated data is represented, what XML equivalence means for invisible groups and empty branches, and how the declared XSD/datatype/wildcard profile is enforced. It must assign validation versus normalization and serialization boundaries, compatible artifact routing, public activation policy and bounded resource failures.

These are inputs to [#168](https://github.com/TechSpokes/typescript-wsdl-client/issues/168), not an S01 architecture implementation. The SOAP and gateway feasibility probes remain blocked until a reviewed ADR draft supplies their concrete contracts.
