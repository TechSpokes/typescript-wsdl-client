# TypeScript WSDL Client

[![CI](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml/badge.svg)](https://github.com/techspokes/typescript-wsdl-client/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/typescript-wsdl-client.svg)](https://www.npmjs.com/package/typescript-wsdl-client)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

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

Vendor: **[TechSpokes](https://www.techspokes.com)** · Contact: **[contact@techspokes.com](mailto:contact@techspokes.com)**
Maintainer: **Serge Liatko** ([@sergeliatko](https://github.com/sergeliatko)) · GitHub org: [@techspokes](https://github.com/techspokes)

---

## Quick start

Install the generator (dev-time) in your project:

```bash
npm i -D typescript-wsdl-client
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
import { GeneratedSoapClient } from "./generated/my/client.js";

const soap = await createSoapClient({ wsdlUrl: "https://example.com/MyService?wsdl" });
const client = new GeneratedSoapClient(soap, "$attributes"); // attributes key optional

const rs = await client.MyOperation({
  MyOperationRQ: {
    MyAttribute: "passed as attribute",
    MyElement: "passed as child element",
    // ...other fields
    // attributes appear as top-level props; child elements as nested objects
  }
});

console.log(rs);
```

> The generator always emits TypeScript sources (`*.ts`). You compile them with your app.

---

## CLI

```
wsdl-tsc --wsdl <path-or-url> --out <dir> [options]
```

**Required**

* `--wsdl` — WSDL path or URL
* `--out` — output directory (created if missing)

**Useful options**

* `--imports js|ts|bare` (default: `js`)
  How intra-generated imports are written:

    * `js` → `./file.js` (best for ESM/NodeNext apps)
    * `ts` → `./file.ts` (use with `allowImportingTsExtensions`)
    * `bare` → `./file` (nice for CommonJS builds)
* `--ops-ts` (default: `true`)
  Emit `operations.ts` instead of JSON.

**Primitive mapping (safe defaults)**

* `--int64-as string|number|bigint` (default `string`) — `xs:long`, `xs:unsignedLong`
* `--bigint-as string|number` (default `string`) — `xs:integer` family
* `--decimal-as string|number` (default `string`) — `xs:decimal` (money/precision)
* `--date-as string|Date` (default `string`) — `xs:date`, `xs:dateTime`, `xs:time`, `g*`, durations

**Other**

* `--attributes-key <string>` (default: `$attributes`)
  The key used by the runtime marshaller when serializing attributes.

---

## What gets generated

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
import { compileCatalog, xsdToTsPrimitive, type CompilerOptions } from "typescript-wsdl-client";
import { loadWsdlCatalog } from "typescript-wsdl-client/internal-or-your-loader"; // if you expose it

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

---

## Contributing

Issues and PRs welcome. Please include a **minimal WSDL/XSD** fixture that reproduces the case.
Node 18/20 supported.

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
