# TypeScript WSDL Client

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![npm downloads](https://img.shields.io/npm/dm/@techspokes%2Ftypescript-wsdl-client.svg)](https://www.npmjs.com/package/@techspokes/typescript-wsdl-client)
[![GitHub Stars](https://img.shields.io/github/stars/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/network/members)
[![GitHub Watchers](https://img.shields.io/github/watchers/techspokes/typescript-wsdl-client?style=social)](https://github.com/techspokes/typescript-wsdl-client/watchers)

[![TechSpokes Org](https://img.shields.io/badge/org-techspokes-181717?logo=github)](https://github.com/techspokes)
[![Sponsor TechSpokes](https://img.shields.io/badge/sponsor-GitHub-blue?logo=github-sponsors)](https://github.com/sponsors/TechSpokes)

**TypeScript WSDL → SOAP client generator.**
Reads WSDL/XSD (with imports) and emits a small, typed client you can compile into your app.

* `xs:attribute` support (attributes become first-class fields, not bags)
* `complexType` (`sequence` / `all` / `choice`)
* `simpleContent` / `complexContent` (`extension` + `restriction`)
* Inline **anonymous** types (auto-named, stable)
* Global `element @ref` resolution
* Duplicate/local-name **merge** across schemas/namespaces
* Deterministic metadata (`ATTR_SPEC`, `PROP_META`) for clean JSON ⇄ SOAP mapping
* ESM **and** CommonJS friendly output

Vendor: **[TechSpokes](https://www.techspokes.com)** · Contact: **[contact page](https://www.techspokes.com/contact/)**
Maintainer: **Serge Liatko** ([@sergeliatko](https://github.com/sergeliatko)) · GitHub org: [@techspokes](https://github.com/techspokes)

---

## Quick start

Install the generator (dev-time) in your project:

```bash
npm i -D @techspokes/typescript-wsdl-client
# your app will use node-soap at runtime:
npm i soap
```

Generate into your app (recommended under `src/generated/...`):

```bash
npx wsdl-tsc --wsdl ./spec/wsdl/MyService.wsdl --out ./src/generated/my --imports js --ops-ts
```

Use the generated client:

```ts
// ESM / NodeNext app
import { createSoapClient } from "./generated/my/runtime.js";
// class name defaults to <ServiceName>SoapClient (from WSDL), e.g., MyServiceSoapClient
import { MyServiceSoapClient } from "./generated/my/client.js";

// optional: pass security straight into createSoapClient (node-soap security instance)
import soap from "soap";
const security = new soap.WSSecurity("user", "pass");

const soapClient = await createSoapClient({
  wsdlUrl: "https://example.com/MyService?wsdl",
  security, // or configure after creation: (await createSoapClient(...)).setSecurity(security)
});

const client = new MyServiceSoapClient(soapClient, "$attributes"); // attributes key optional

// Example: To set literal text content for an XML element, use the reserved `$value` key.
// Other keys in the object represent XML attributes (e.g. `MyAttribute`) and child elements (e.g. `MyElement`).
// This lets you build mixed-content XML: `$value` for text, attribute keys for XML attributes, and element keys for nested elements.
const rs = await client.MyOperation({
  MyOperationRQ: {
    MyAttribute: "passed as attribute",
    MyElement: "passed as child element",
    $value: "passed text content here",
  }
});

console.log(rs);
```

> The generator always emits TypeScript sources (`*.ts`). You compile them with your app.

---

## Security and WS-Policy hints

- node-soap leaves security up to you. Create a security instance (e.g., `new soap.BasicAuthSecurity(...)`, `new soap.WSSecurity(...)`, `new soap.ClientSSLSecurity(...)`) and set it on the client via `client.setSecurity(...)`.
- The runtime factory `createSoapClient({ wsdlUrl, endpoint?, wsdlOptions?, security? })` accepts an optional `security` and will call `client.setSecurity(security)` for you.
- The generated client includes minimal WS-Policy hints if your WSDL embeds inline `wsp:Policy` under `wsdl:binding` or `wsdl:binding/wsdl:operation`.
  - Hints are surfaced in method JSDoc as “Security (WSDL policy hint): …” and in `operations.json`/`operations.ts` as a `security: string[]` field (e.g., `usernameToken`, `https`, `x509`, `messageSecurity`).
  - These hints are best-effort and not authoritative (no `wsp:PolicyReference` dereferencing yet). They’re intended to nudge you to configure the right security.
  - At runtime, if an operation has hints and your client has no `security` configured, a console warning is emitted.

---

## CLI

```
wsdl-tsc --wsdl <path-or-url> --out <dir> [options]
```

### Local development

By default, `npx wsdl-tsc` invokes the published npm version. To run the CLI from your local source (with your latest changes), use one of these approaches:

```bash
# Directly via tsx (requires tsx in devDependencies)
npx tsx src/cli.ts --wsdl <path-or-url> --out <dir> [options]

# Via npm script
git clone ... then:
npm install
git checkout <branch>
npm run dev -- --wsdl <path-or-url> --out <dir> [options]

# Using npm link to symlink your working copy
npm link
wsdl-tsc --wsdl <path-or-url> --out <dir> [options]
```

**Required**

* `--wsdl` — WSDL path or URL
* `--out` — output directory (created if missing)

**Options**

| Flag                | Type      | Choices                        | Default      | Description                                                      |
|---------------------|-----------|--------------------------------|--------------|------------------------------------------------------------------|
| `--imports`         | string    | js, ts, bare                   | js           | Intra-generated import specifiers: '.js', '.ts', or bare         |
| `--ops-ts`          | boolean   | true, false                    | true         | Emit `operations.ts` instead of JSON                             |
| `--attributes-key`  | string    | any                            | $attributes  | Key used by runtime marshaller for XML attributes                |
| `--client-name`     | string    | any                            | —            | Override the exported client class name (exact)                  |
| `--int64-as`        | string    | string, number, bigint         | string       | How to map xs:long/xs:unsignedLong                               |
| `--bigint-as`       | string    | string, number                 | string       | How to map xs:integer family (positive/nonNegative/etc.)         |
| `--decimal-as`      | string    | string, number                 | string       | How to map xs:decimal (money/precision)                          |
| `--date-as`         | string    | string, Date                   | string       | How to map date/time/duration types                              |

### Client naming

- By default, the generated client class is named after the WSDL service: `<ServiceName>SoapClient`.
- If the service name can’t be determined, we fall back to the WSDL filename: `<WsdlFileBaseName>SoapClient`.
- If neither is available, we fall back to `GeneratedSoapClient`.
- You can override the name entirely with `--client-name MyCustomClient` (the exact export name will be used).

**Primitive mapping (safe defaults)**

Defaults are **string-first** to avoid precision & timezone surprises:

* `xs:decimal` → `string` (money/precision safe)
* 64-bit integers → `string` (you can opt into `bigint` or `number`)
* dates/times → `string` (transport-friendly, no implicit tz conversion)

Override these defaults using the CLI flags above as needed for your use case.

# What gets generated

```
<out>/
  types.ts       # interfaces + type aliases (with @xsd JSDoc: original XML type/occurs)
  client.ts      # thin operation wrapper (calls into runtime)
  runtime.ts     # small SOAP runtime: createSoapClient, toSoapArgs, fromSoapResult
  meta.ts        # ATTR_SPEC, CHILD_TYPE, PROP_META for JSON ⇄ SOAP mapping
  operations.ts  # compiled operation metadata (name, soapAction, etc.)
```

Example: if `User` has `@Id` and `@CreatedAt`, you’ll see:

```ts
interface User {
  Id?: string;
  CreatedAt?: string; // or Date if you chose --date-as Date
}
```

---

## Using in different app module systems

### ESM / NodeNext (recommended)

Service `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

Generate with `--imports js` and import `./client.js`, `./runtime.js`.

### CommonJS

Keep your app `module: "CommonJS"` and generate with `--imports bare` (imports like `./runtime`).
TypeScript will compile to `require("./runtime")` cleanly.

---

## Recommended workflow

* **Vendor** your WSDL(s) in `spec/wsdl/` for reproducible builds.
* Generate into `src/generated/<service>/` and **commit the generated files** (deterministic CI/Docker).
* Build your app (the generated code compiles with it).

**Example scripts (app `package.json`):**

```json
{
  "scripts": {
    "codegen:my": "wsdl-tsc --wsdl ./spec/wsdl/MyService.wsdl --out ./src/generated/my --imports js --ops-ts",
    "prebuild": "npm run codegen:my",
    "build": "tsc -p tsconfig.json"
  }
}
```

---

## Programmatic API (optional)

```ts
import { compileCatalog, xsdToTsPrimitive, type CompilerOptions } from "@techspokes/typescript-wsdl-client";
import { loadWsdlCatalog } from "@techspokes/typescript-wsdl-client/internal-or-your-loader"; // if you expose it

const catalog = await loadWsdlCatalog("./spec/wsdl/MyService.wsdl");
const compiled = compileCatalog(catalog, {
  primitive: { decimalAs: "string", dateAs: "string" }
});
// …write your own emitters or use the built-ins in the CLI.
```

---

## Primitive mapping rationale

Defaults are **string-first** to avoid precision & timezone surprises:

* `xs:decimal` → `string` (money/precision safe)
* 64-bit integers → `string` (you can opt into `bigint` or `number`)
* dates/times → `string` (transport-friendly, no implicit tz conversion)

Change per your needs with the CLI flags above.

---

## Minimal test you can run

```bash
# generate from a local WSDL
npx wsdl-tsc --wsdl ./spec/wsdl/MyService.wsdl --out ./tmp --imports js --ops-ts

# quick typecheck of generated output (NodeNext)
npx tsc --noEmit --module NodeNext --moduleResolution NodeNext --target ES2022 ./tmp/*.ts
```

---

## Troubleshooting

* **“I don’t see `runtime.ts`”** — You should. Ensure you’re on a recent version and check that the output directory is writable.
* **“Cannot find './runtime.js'”** — Your app must be `module: "NodeNext"` when using `--imports js`.
  Use `--imports bare` for CommonJS apps.
* **“node-soap not found”** — Install it in your **app**: `npm i soap`.
* **“Security required?”** — If your generated client warns or JSDoc shows a security hint, configure node-soap security: `client.setSecurity(new soap.WSSecurity(...))` or pass `security` to `createSoapClient`.

---

## Contributing

Issues and PRs welcome. Please include a **minimal WSDL/XSD** fixture that reproduces the case.
Node 20+ supported.

- See CONTRIBUTING.md for setup and workflow.
- See CODE_OF_CONDUCT.md for community expectations.
- Security reports: see SECURITY.md.

---

## Community

- Contributing guide: CONTRIBUTING.md
- Code of Conduct: CODE_OF_CONDUCT.md
- Security policy: SECURITY.md
- Support: SUPPORT.md
- Roadmap: ROADMAP.md
- Changelog: CHANGELOG.md

---

## License

MIT © TechSpokes.
*The tool is MIT-licensed. Generated artifacts are owned by you; the tool imposes no license on generated files.*

---

## 💖 Sponsors

**Silver Sponsors**
- Your Name Here!

**Gold Sponsors**
- [Your Name or Company](https://your-link-here.com)

**Platinum Sponsors**
- [Your Name or Company](https://your-link-here.com) – 30-min one-to-one video meeting on AI, business automations, vacation rentals industry, development, tools, or a subject of your choice.

Want to see your name or company here? [Become a sponsor!](https://github.com/sponsors/TechSpokes)
