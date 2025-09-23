# TypeScript WSDL Client

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![npm downloads](https://img.shields.io/npm/dm/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![GitHub Stars](https://img.shields.io/github/stars/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/watchers)
[![TechSpokes Org](https://img.shields.io/badge/org-techspokes-181717?logo=github)](https://github.com/techspokes)
[![Sponsor](https://img.shields.io/badge/sponsor-GitHub-blue?logo=github-sponsors)](https://github.com/sponsors/TechSpokes)

> **Mission**: Turn complex WSDL/XSD definitions into ergonomic, stable, type‑safe TypeScript SOAP clients — with an optional OpenAPI 3.1 bridge — so you can integrate legacy enterprise services confidently.

---
## 1. Why This Project (What Sets It Apart)
Most generators stop at loosely typed stubs or leak XML complexity into your application layer. This tool focuses on **correct flattening and determinism**:

| Core Differentiator | What You Get |
|---------------------|--------------|
| Attribute + Element Flattening | Attributes and child elements appear as peer properties (no nested wrapper noise). |
| `$value` Text Content Convention | Simple & mixed content always represented as a `$value` property (collision-safe & documented). |
| Inheritance Resolution | `complexContent` and `simpleContent` extensions are merged or extended consistently. |
| Choice Strategy | Predictable `all-optional` modeling today (future advanced discriminators planned). |
| WS‑Policy Security Hints | Inline scan of policies surfaces required auth hints (e.g. `usernameToken`, `https`). |
| Deterministic Output | Sorted declarations and stable alias resolution for diff‑friendly regeneration. |
| Primitive Mapping Controls | Explicit flags for long / big integer / decimal / temporal families (string‑first safety). |
| Catalog Introspection | One JSON artifact (`catalog.json`) to drive further tooling (including OpenAPI). |
| OpenAPI 3.1 Bridge | Mirrors the exact TypeScript model — no divergence between runtime and spec. |
| Multi‑format Output | `--format json|yaml|both` with always‑on validation (unless disabled). |
| One‑Shot Pipeline | Single pass (parse → TS → OpenAPI) for CI & automation. |

**Vendor**: [TechSpokes](https://www.techspokes.com) · **Maintainer**: Serge Liatko ([@sergeliatko](https://github.com/sergeliatko))


---
## 2. Installation
```bash
npm i -D @techspokes/typescript-wsdl-client
npm i soap   # runtime dependency for actual SOAP calls
```

---
## 3. Typical Repository Layout
You usually want generated SOAP clients under a namespaced integration folder. Examples:
```
src/
  services/
    third-party/
      weather/
        client.ts
        types.ts
        utils.ts
        catalog.json
        openapi.json
```
Pick a structure that communicates ownership and stability. Regenerate into the same folder for clean diffs.

---
## 4. Primary Usage: Generate a TypeScript SOAP Client
The **SOAP client generation** is the core of this project and the most common use case.

### 4.1 Quick Start
```bash
npx wsdl-tsc --wsdl ./wsdl/Weather.wsdl --out ./src/services/third-party/weather
```

**Try with included example:**
```bash
npx wsdl-tsc --wsdl examples/minimal/weather.wsdl --out ./tmp/weather
```

Imports afterward:
```ts
import { Weather } from "../services/third-party/weather/client.js";
```

### 4.2 What Gets Generated
| File | Purpose |
|------|---------|
| `client.ts` | Strongly typed wrapper with one method per operation. |
| `types.ts` | Flattened interfaces & literal/enum aliases. |
| `utils.ts` | Metadata (attribute vs element, occurrence, nillable). |
| `catalog.json` | (If `--catalog`) compiled representation for debugging / OpenAPI reuse. |

### 4.3 Key Modeling Rules Recap
- **Attributes & elements** → peer properties.
- **Text content** → `$value`.
- **Required attributes**: `use!=optional`; elements `min>=1`.
- **Multiplicity**: `max>1` or `unbounded` → arrays.
- **Nillable**: `nillable="true"` preserved (optionally modelled optional with `--nillable-as-optional`).
- **Inheritance**: extensions merged or emitted as extends; simpleContent base collapsed logically.

### 4.4 CLI Flags (SOAP Client)
| Flag | Default | Description |
|------|---------|-------------|
| `--wsdl` | (required) | Local path or URL to WSDL. |
| `--out` | (required) | Output directory. |
| `--imports` | `js` | Intra‑generated import style: `js`, `ts`, `bare`. |
| `--catalog` | `false` | Emit `catalog.json`. |
| `--client-name` | derived | Override exported class name. |
| `--attributes-key` | `$attributes` | Attribute bag key. |
| `--choice` | `all-optional` | Current choice strategy. |
| `--nillable-as-optional` | `false` | Treat nillable elements as optional props. |
| `--fail-on-unresolved` | `true` | Fail build on unresolved references. |
| `--int64-as` | `string` | Map 64‑bit integer types. |
| `--bigint-as` | `string` | Map arbitrary-size integer family. |
| `--decimal-as` | `string` | Map `xs:decimal`. |
| `--date-as` | `string` | Map date/time/duration primitives. |

### 4.5 Example With Safer Numeric Decisions
```bash
npx wsdl-tsc \
  --wsdl https://example.com/Hotel.wsdl \
  --out ./src/integrations/soap/hotel \
  --int64-as number \
  --decimal-as string \
  --date-as string \
  --catalog
```

### 4.6 Programmatic Generation (TypeScript Only)
```ts
import { compileWsdlToProject } from "@techspokes/typescript-wsdl-client";
await compileWsdlToProject({
  wsdl: "./wsdl/Hotel.wsdl",
  outDir: "./src/integrations/soap/hotel"
});
```

---
## 5. Generating an OpenAPI 3.1 Definition (as a standalone run)
If you already have generated your SOAP client and just want an HTTP-friendly spec for proxies / gateways / docs:
```bash
npx wsdl-tsc openapi --wsdl ./wsdl/Hotel.wsdl --out ./openapi/hotel --format both
```
Or reuse a previously generated catalog:
```bash
npx wsdl-tsc openapi --catalog ./src/integrations/soap/hotel/catalog.json --out ./openapi/hotel
```

### 5.1 Formats & Validation
| Flag | Purpose |
|------|---------|
| `--format json|yaml|both` | Output format (default json). |
| `--yaml` | (Deprecated) alias for `--format yaml` when format absent. |
| `--validate/--no-validate` | Validation on by default. |
| `--out` | Base path or explicit file (extension optional). |

### 5.2 Core Schema Parity
The OpenAPI schemas reproduce the **exact** flattening & naming used in `types.ts` — crucial for avoiding drift between SOAP and REST surfaces.

### 5.3 Additional Flags (Selected)
| Flag | Description |
|------|-------------|
| `--basePath` | Prefix for REST path segments (e.g. `/v1/booking`). |
| `--pathStyle kebab|asis|lower` | Control operation name → path transformation. |
| `--method` | Default HTTP method (per‑op override via `--ops`). |
| `--tag-style` | Tag inference: `default`, `service`, `first`. |
| `--security` | Path to `security.json` (schemes + headers + overrides). |
| `--tags` | Path to `tags.json` (explicit operation → tag map). |
| `--ops` | Path to `ops.json` (method/summary/description/deprecated). |
| `--closedSchemas` | Apply `additionalProperties:false` globally. |
| `--pruneUnusedSchemas` | Emit only reachable schemas. |

### 5.4 Programmatic OpenAPI Generation
```ts
import { generateOpenAPI } from "@techspokes/typescript-wsdl-client";
const { jsonPath, yamlPath } = await generateOpenAPI({
  wsdl: "./wsdl/Hotel.wsdl",
  outFile: "./openapi/hotel",
  format: "both"
});
```

---
## 6. One‑Shot Pipeline (SOAP Client + OpenAPI Together)
Ideal for CI: single WSDL parse → TS artifacts + catalog + OpenAPI (validated).
```bash
npx wsdl-tsc pipeline --wsdl ./wsdl/Hotel.wsdl --out ./src/integrations/soap/hotel --format both
```

| Pipeline Flag | Default | Notes |
|---------------|---------|-------|
| All SOAP flags | — | Same semantics as base generation. |
| All OpenAPI flags | — | Same semantics as standalone openapi. |
| `--openapi-out` | derived | Override OpenAPI base file. |
| `--format` | json | Multi-format control. |
| `--validate/--no-validate` | validate | Spec validation toggle. |
| `--tag-style` | default | Tag inference. |

Programmatic single pass:
```ts
import { runGenerationPipeline } from "@techspokes/typescript-wsdl-client";
await runGenerationPipeline({
  wsdl: "./wsdl/Hotel.wsdl",
  outDir: "./src/integrations/soap/hotel",
  openapi: { format: "both", tagStyle: "service" }
});
```

---
## 7. Security Configuration (OpenAPI)
`security.json` example:
```json
{
  "global": {
    "scheme": "bearer",
    "bearer": { "bearerFormat": "JWT" },
    "headers": [ { "name": "X-Correlation-Id", "required": false, "schema": { "type": "string" } } ]
  },
  "overrides": {
    "CancelBooking": { "scheme": "apiKey" }
  }
}
```
Supported `scheme`: `none|basic|bearer|apiKey|oauth2`.

---
## 8. Tag Inference Strategies
| Strategy | Behavior |
|----------|----------|
| `default` | Single tag = service name (fallback `SOAP`). |
| `service` | Always service name (even if operation prefix differs). |
| `first` | First lexical segment of CamelCase operation (e.g. `GetCityWeatherByZIP` → `Get`). |

Provide `tags.json` for explicit mapping when heuristics are insufficient.

---
## 9. Working With the Generated Client
### 9.1 SOAP Client Construction
```ts
import soap from "soap";
import { Hotel } from "./src/integrations/soap/hotel/client.js";

const hotel = new Hotel({
  source: "https://example.com/HotelService?wsdl",
  security: new soap.WSSecurity("user", "pass")
});

const res = await hotel.GetReservation({
  GetReservationRQ: { ReservationId: "ABC123" }
});
```
### 9.2 Attributes & Text Values
If an element has text content and attributes, you pass both:
```ts
const Price = {
  currencyCode: "USD",
  $value: "123.45"
};
```

---
## 10. Advanced Topics
| Topic | Notes |
|-------|-------|
| Primitive mapping philosophy | Defaults prefer string to avoid precision loss. |
| Choice flattening | Represented as optional union of fields – simpler consumption. |
| Array wrappers | Single repeated child w/out attributes collapses to an array schema in OpenAPI. |
| Validation | Uses `@apidevtools/swagger-parser`; disable with `--no-validate`. |
| Future | Discriminated unions for choices, richer policy extraction, snapshot OpenAPI tests. |

---
## 11. Troubleshooting
| Symptom | Resolution |
|---------|------------|
| WSDL fetch fails | Curl the URL, check TLS/proxy, retry with local copy. |
| Unresolved types | Re-run with `--fail-on-unresolved=false` to inspect partial graph. |
| Missing schema in OpenAPI | Ensure the global element exists (catalog shows compiled symbols). |
| Wrong array modeling | Check `maxOccurs` in WSDL; tool only arrays when `max>1` or `unbounded`. |
| Auth errors at runtime | Provide a proper `soap.ISecurity` instance (`WSSecurity`, etc.). |
| Date/time confusion | Use `--date-as Date` for runtime Date objects. |

Enable SOAP wire logging:
```bash
NODE_DEBUG=soap node app.js
```

---
## 12. Programmatic Reference (Summary)
| Function | Purpose |
|----------|---------|
| `compileWsdlToProject` | WSDL → TS artifacts. |
| `generateOpenAPI` | WSDL or catalog → OpenAPI (json / yaml / both). |
| `runGenerationPipeline` | One pass: compile + TS emit + OpenAPI. |

---
## 13. Contributing
1. Fork & branch.
2. `npm i && npm run build`.
3. Use `npm run smoke:gen`, `npm run smoke:pipeline`, `npm run smoke:openapi:validate`.
   - Note: These smoke tests use `examples/minimal/weather.wsdl` for quick validation.
4. Add a bullet under **Unreleased** in `CHANGELOG.md`.

See also: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`.

---
## 14. License
MIT © TechSpokes — Generated artifacts are fully yours.

---
## 15. Sponsors
Support ongoing maintenance: https://github.com/sponsors/TechSpokes  
*Your brand could be featured here.*
