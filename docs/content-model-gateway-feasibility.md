# Content Model Gateway Feasibility

Executed S02 #170 evidence for validation, representation and serialized-byte boundaries. See the root [README](../README.md).

## Scope and disposition

This bounded probe supports ADR 003's draft-07 runtime and serializer lowering, route-local non-mutating validation, and independently validated JSON serialization fallback. It introduces fixtures and tests only; the current gateway emitter and unrelated host policy remain unchanged.

The [ADR](decisions/003-content-model-contracts.md#portable-contracts-and-dialects-s02-d05-s02-d06) defines the architecture; the [decision register](content-model-decisions.md) owns final dispositions. This document records executed observations, primary documentation, unverified combinations and first-consumer gates for #197/#198/#199/#200.

## Reproduction and inspected versions

The executable corpus is [the gateway feasibility integration test](../test/integration/content-model-gateway-feasibility.test.ts). Its [route helper](../test/helpers/contentModelGatewayProbe.ts) uses installed Ajv and serializer engines, not another schema or semantic engine.

The reviewed draft checkpoint was `2f88ec81f77f4fc5a06b78f2d507ae8e20fe7a7c`. The following installed versions were observed after `npm ci --cache tmp/cache/npm` on Node `24.19.0`; the lockfile, rather than package ranges, determines this evidence.

| Component | Installed version | Role |
|---|---|---|
| Fastify | 5.12.5 | HTTP routes and injection |
| Ajv | 8.20.0 | Runtime JSON validation |
| `@fastify/ajv-compiler` | 4.0.6 | Host default validator |
| `fast-json-stringify` | 7.0.1 | Schema serializer |
| `@fastify/fast-json-stringify-compiler` | 5.1.0 | Host serializer adapter |
| `ajv-formats` | 3.0.1 | Installed host format plugin |
| Vitest | 5.0.3 | Executable evidence |
| TypeScript | 6.0.3 | Existing integration typecheck |

Run the local checks from the repository root:

```bash
npm ci --cache tmp/cache/npm
npx vitest run test/integration/content-model-gateway-feasibility.test.ts --reporter=verbose
npm run typecheck:integration
npm run docs:validate
npm run test:conformance
```

The integration suite writes `tmp/conformance/content-model-gateway/traces.json`. Each ordinary probe records submitted JSON text, parsed submission, validator-visible values before/after, handler input, returned response, response-validation values, serializer-output values, status and actual HTTP bytes.

Missing handler/serializer snapshots mean the request or response was rejected before that boundary. The imported current-emitter fallback has no body validator, so its trace records that boundary as absent rather than inventing validator observations.

## Selected dialect boundaries

### OpenAPI documentation

Select OpenAPI `3.1.1` and its OAS schema dialect based on JSON Schema 2020-12 for future faithful documentation. Primary specification inspection establishes the standard; it does not prove that the installed Fastify runtime or serializer executes every OpenAPI keyword.

The [current OpenAPI generator](../src/openapi/generateOpenAPI.ts) emits `openapi: "3.1.0"` and omits `jsonSchemaDialect`; this is source inspection, not an assertion that it already emits the selected `3.1.1` target. The synthetic complexity document in this probe uses `3.1.1` only to test gateway emission from that input.

OpenAPI documents representation constraints and supplemental requirements. `x-xsd-fractionDigits` is an annotation: strict route-local Ajv rejects it as unknown; explicitly registering it as annotation-only admits `"1.234"` despite a declared value of two.

### Runtime JSON Schema

Select draft-07 for the bounded faithful runtime lowering. The installed default Ajv class loads the draft-07 vocabulary and meta-schema; the compiler uses `strict: true`, `coerceTypes: false`, `removeAdditional: false`, `useDefaults: false` and `allErrors: false`.

Use route-level `validatorCompiler`; register referenced schemas with that Ajv instance explicitly. Do not change the host's global compiler or Ajv options. The same Fastify instance's control route retains coercion, default insertion and removal of unknown fields.

Executed failures establish that a 2020-12 `$schema` cannot compile with this class and that unlabelled `unevaluatedProperties` fails strict compilation. Other modern vocabulary is outside the selected lowering; unknown required capabilities must fail planning or compilation rather than be ignored.

### Serializer JSON Schema

Select separately emitted draft-07 serializer schemas for the tested closed shapes. Installed `fast-json-stringify` documentation expressly requires draft-07 input; its conversion and branch selection behavior is not complete response validation.

Validate returned HTTP JSON before serialization, validate parsed serialized bytes with the same independent runtime plan and shared semantic owner, and compare admitted JSON values for preservation. The probe's serializer wrapper rejects field loss before bytes leave Fastify; it does not repair the value or silently switch backend.

Select an explicit route-local `JSON.stringify` fallback when serializer lowering cannot preserve an admitted JSON value or when the configured complexity policy selects fallback. Keep response validation and its references available regardless of serializer selection; a fallback must never remove the validation obligation.

## Executed observations

### Requests and host control

| Case | Route-local observation | Host control observation |
|---|---|---|
| Numeric field submitted for string | 400; original field unchanged | Converted to string |
| Required field with schema default missing | 400; field remains absent | Default inserted |
| Unknown closed-object property | 400; property remains present | Property removed |
| Both closed exclusive-choice fields | 400; both fields retained | 200 after removing one field |
| Valid declared fields | 200; validator and handler values equal submission | Control remains independent |

These observations prove that invalid input cannot pass only because validation coerces, inserts defaults or removes fields on the proposed route. They characterize existing Fastify defaults; they do not recommend a global host-policy rewrite.

### Structural lowerings

| Construct | Executed outcome | Boundary |
|---|---|---|
| Closed `oneOf` branches | Valid branch survives bytes; combined branches rejected | Runtime and schema serializer |
| Overlapping `oneOf` | Both alternatives match; rejected | Runtime |
| Overlapping `anyOf` | Both fields accepted and preserved | Runtime and JSON fallback |
| Two empty `oneOf` alternatives | Empty object rejected because both match | Runtime |
| Two empty `anyOf` alternatives | Empty object accepted and preserved | Runtime and JSON fallback |
| Nullable array items | `["a",null]` accepted; null wrapper rejected | Runtime and schema serializer |
| Nullable array wrapper | Null wrapper accepted; `[null]` rejected | Runtime and schema serializer |
| Recursive `$ref` with nullable child | Nested valid response preserved; nested numeric value rejected | Runtime and schema serializer |
| Outer object closure with `allOf` requirements | Both declared fields preserved; missing/unknown fields rejected | Runtime and schema serializer |
| Closed disjoint `allOf` members | Original rejects `{a,b}`; current flattening accepts it | Current helper changes meaning |

The draft-07 outer-closure fixture enumerates the complete property set once at its containing object and declares local properties in each required subschema to satisfy Ajv `strictRequired`. A graph-driven lowering must emit the equivalent complete closure; generic merging of arbitrary OpenAPI `allOf` is not an equivalence proof.

An XML empty alternative is validated by the shared particle language, not by counting JSON `oneOf` matches. Overlapping or empty JSON alternatives that cannot express that language use a declared lowering plus #180 supplemental validation, with validated JSON fallback where serializer selection is unsuitable.

### Scalar and facet boundaries

Precision-sensitive int64 `"9223372036854775807"` and decimal `"9007199254740993.12345678901234567890"` survive validator snapshots and HTTP bytes exactly. Numeric substitutions and exponent-form decimal strings are rejected by the string representation schema.

Submitting the same digits as JSON numbers loses precision in JSON parsing before the validator sees them. The native-number probe sees `9223372036854776000` and `9007199254740994`; downstream schema validation cannot restore the submitted digits.

The reviewed lexical-sensitive witness `"+01.00"` survives response serialization. The fixture's anchored JSON pattern selects that representation and rejects `"1"`; it does not claim arbitrary XSD pattern equivalence or authorize rewriting a facet-constrained lexical witness.

Representation-only validation admits `"9223372036854775808"` and decimal `"1.234"`. A separate test-only shared-owner callback uses built-in `BigInt` for int64 bounds and exact textual fractional digits after trailing-zero removal for a two-fractional-digit profile; it rejects upper/lower out-of-range and excess-scale witnesses before handler dispatch and before response serialization, without mutating values.

The callback proves an executable supplemental seam, not a production XSD validator. Exact coefficient/scale conversion, totalDigits, all numeric bounds, XSD lexical/value normalization and XSD regex semantics remain owned by #184/#198; no duplicate scalar engine is added here.

| Constraint | Independent Ajv evidence | Serializer evidence |
|---|---|---|
| `type`, `required`, object closure | Accepted and rejected cases | Approved closed fields preserved |
| `pattern`, `minLength`, `maxLength` | Request and returned-response failures | Invalid string still serialized without independent validation |
| Integer `minimum`, `maximum` | Request and returned-response failures | Out-of-range integer still serialized without independent validation |
| `enum`, `minItems`, `maxItems` | Request and returned-response failures | Invalid array still serialized without independent validation |
| Exact int64/fractionDigits | Supplemental callback rejects exact witnesses | Callback retained under JSON fallback |
| `x-xsd-fractionDigits` | Unknown keyword rejected; annotation registration does not enforce | No enforcement claim |
| XSD particle/regex/QName rules | Injected shared semantic seam only | No enforcement claim |

### Response field preservation and complexity fallback

An open object schema admits an `approved` field absent from `properties`. The schema serializer omits it, and the proposed preservation boundary returns 500 before output; explicitly selecting validated JSON fallback preserves the nested field and values.

The current [gateway emitter](../src/gateway/generators.ts) selects no fallback at 149 reachable schema references and selects fallback at 150. The test imports the actual emitted route module and supplies a local handler for its generated stub; the route registration removes `response` and uses Fastify's JSON serialization fallback.

That current emitted route returns both a valid 150-reference response and an invalid numeric/unknown-field response with 200 and unchanged bytes. The proposed adapter retains the same referenced runtime response schema, returns the valid response without field loss and rejects the invalid response before serialization even while using `JSON.stringify`.

This broad 150-reference graph proves the existing policy boundary and fallback behavior. It does not measure the serializer's maximum depth, prove a stack overflow at exactly 150, or justify a new resource limit.

## Decision-register handoff

The following D06 entries resolve architecture choices within the tested scope. Missing implementation and qualification remain blocking gates for their first consumers; they are not claims of already shipped faithful behavior.

| Entry | Selected contract | Evidence | First owner and consuming gate |
|---|---|---|---|
| D06-OpenAPI | OAS 3.1.1 documentation; separate runtime lowering | Primary standard; current output source inspected | #197 must emit selected dialect and completeness metadata |
| D06-runtime | Strict non-mutating route-local draft-07 Ajv | Host isolation, structures, facets, modern-keyword failures | #198 validator/compiler plan; #199 request integration |
| D06-serializer | Separate draft-07 serializer plan; serializer is not validation | Actual byte checks and ordinary facet counterexamples | #197 lowering; #200 preservation validation |
| D06-fallback | Explicit JSON fallback preserves independent response validation | Imported current emitter and 150-ref proposed route | #200 must retain validation when serializer schema is omitted |
| D06-supplemental | One shared #180/#184 semantic owner, injected at each boundary | Exact facet callback and fail-closed seam tests | #198 must supply shared rules; #199/#200 must invoke them |
| D06-closure | Complete graph-derived closure; no generic allOf flattening | Original/flattened meaning differs | #197 lowering proof before #198/#199/#200 consume it |

Required blockers are explicit: #197 must diagnose an unsupported lowering or choose an evidenced validated fallback; #198 must reject incomplete plans lacking required #180/#184 checks; #199 must validate before explicit representation conversion and dispatch; #200 must validate converted response JSON and serializer bytes before sending. Exact scalar facets, complete particle languages and lexical-sensitive normalization cannot be waived by schema or serializer success.

## Documented and unverified combinations

Installed primary docs describe draft-07, nullable extensions, recursive references, serializer defaults, field omission and branch selection. Documentation alone does not expand this finite executed corpus.

Format plugins are installed on the host, but the route-local Ajv probe does not install them or claim date/time/binary format enforcement. QName namespace scope, XSD Unicode/regex differences, list/union assessment, wildcard and nil-with-attributes projections, mixed text, discriminator, `if/then/else`, dependent vocabulary and pathological recursive depth are unverified here and require implementing-issue fixtures.

OpenAPI 3.1.1 document validation, generic 2020-12 Ajv compilation, arbitrary modern-to-draft-07 lowering, live network listeners, consumer-installed dependency matrices, Node 26 and adversarial performance/resource limits were not exercised by this integration suite. The current threshold remains a selected existing fallback policy rather than a newly measured engine limit.

## Validation record

The final targeted suite passed all 19 tests on Node 24.19.0; the existing integration typecheck passed. Full conformance passed all 138 tests across three files; documentation validation and the pipeline smoke check passed.

IDE inspections were unavailable; repository-local TypeScript, Vitest and documentation checks provide the local verification. No production files, dependencies or global host options were changed.

## Primary references

- [Fastify 5.12.5 validation and serialization](https://github.com/fastify/fastify/blob/v5.12.5/docs/Reference/Validation-and-Serialization.md)
- [Ajv 8.20.0 README](https://github.com/ajv-validator/ajv/blob/v8.20.0/README.md)
- [Ajv 8.20.0 data modification](https://github.com/ajv-validator/ajv/blob/v8.20.0/docs/guide/modifying-data.md)
- [fast-json-stringify 7.0.1 README](https://github.com/fastify/fast-json-stringify/blob/v7.0.1/README.md)
- [OpenAPI 3.1.1 specification](https://github.com/OAI/OpenAPI-Specification/blob/3.1.1/versions/3.1.1.md)
- [ADR 003 scalar profile](decisions/003-content-model-contracts.md#xsd-10-profile-and-enforcement-s02-d04)
