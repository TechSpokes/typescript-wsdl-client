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

## Introduction

- TypeScript WSDL Client transforms WSDL/XSD schemas into a fully-typed, ready-to-use SOAP client for TypeScript.
- Eliminates common SOAP pain points: inconsistent XML mappings, complex type inheritance, and module interop headaches.
- Generates maintainable, diff-friendly code that runs in modern Node.js (ESM/CJS) and strict TypeScript.

With this tool you get:
- End-to-end type safety: generated interfaces, aliases, and marshalling/unmarshalling logic.
- Deterministic JSON ⇄ SOAP metadata: clear attribute vs element ordering.
- Flexible primitive mapping: control decimals, dates, integers, and more via flags.
- Automatic flattening of `<complexContent>`/`<simpleContent>` inheritance.
- `<choice>` handling strategies and WS-Policy security hints baked in.
- Pluggable ESM/CJS imports: target your runtime with `--imports` alone.

Vendor: **[TechSpokes](https://www.techspokes.com)**  
Maintainer: **Serge Liatko** ([@sergeliatko](https://github.com/sergeliatko))  

---

## Installation

Install the generator as a development dependency:

```bash
npm i -D @techspokes/typescript-wsdl-client
# Your app will use node-soap at runtime:
npm i soap
```

---

## Quick Start

### Generate a SOAP Client

Run the following command to generate a client from your WSDL file:

```bash
npx wsdl-tsc --wsdl ./spec/wsdl/MyService.wsdl --out ./src/services/my-service
```

### Use the Generated Client

```ts
import soap from "soap";
import { MyService } from "./services/my-service/client.js";

const client = new MyService({
  source: "https://example.com/MyService?wsdl",
  security: new soap.WSSecurity("user", "pass")
});

const response = await client.MyOperation({
  MyOperationRQ: {
    MyElement: {
      MyAttribute: "value",
      ChildElementA: "valueA",
    },
  },
});

console.log(response);
```

---

## Features

- **Primitive-type mapping**: Fine-grained flags (`--int64-as`, `--bigint-as`, `--decimal-as`, `--date-as`) so you don't have to hand-roll conversions for odd XSD primitives.
- **Complex/simpleContent inheritance**: Automatically flattens and extends base types for `<complexContent>` and `<simpleContent>` extensions.
- **Deterministic metadata**: Emits runtime maps for JSON ⇄ SOAP mapping—clear attribute vs element distinctions and order.
- **Choice element support**: Two modes (`all-optional` or `union`) to handle `<choice>` constructs exactly how you need.
- **Fail-fast unresolved references**: `--fail-on-unresolved` aborts codegen on missing type refs to catch XSD import issues early.
- **WS-Policy security hints**: Parses WS-Policy tokens and surfaces required security hints in generated JSDoc.
- **Full catalog introspection**: `--catalog` emits a JSON dump of the compiled schema for debugging large/malformed WSDLs.
- **Stable, sorted output**: Interfaces, aliases, attributes, and elements are consistently sorted for diff-friendly regeneration.
- **ESM/CJS interop & custom imports**: `--imports js|ts|bare` lets you target your module system without manual edits.
- **Attributes and child elements**: Supports both XML attributes and nested elements (including mixed `$value` content).
- **Security integration**: Works with any `soap.ISecurity` (e.g., `WSSecurity`, `BasicAuthSecurity`) for seamless auth.

---

## CLI Usage

```bash
wsdl-tsc --wsdl <path-or-url> --out <dir> [options]
```

### Required Flags
- `--wsdl`: Path or URL to the WSDL file.
- `--out`: Output directory for the generated files.

### Options

| Flag                   | Type      | Choices                        | Default        | Description                                                      |
|------------------------|-----------|--------------------------------|----------------|------------------------------------------------------------------|
| `--imports`            | string    | js, ts, bare                   | js             | Intra-generated import specifiers: '.js', '.ts', or bare         |
| `--catalog`            | boolean   | true, false                    | false          | Emit catalog.json for introspection                              |
| `--client-name`        | string    | —                              | derived        | Override the exported client class name                          |
| `--attributes-key`     | string    | any                            | $attributes    | Key used by runtime marshaller for XML attributes                |
| `--int64-as`           | string    | string, number, bigint         | string         | How to map xs:long/xs:unsignedLong                               |
| `--bigint-as`          | string    | string, number                 | string         | How to map xs:integer family (positive/nonNegative/etc.)         |
| `--decimal-as`         | string    | string, number                 | string         | How to map xs:decimal (money/precision)                          |
| `--date-as`            | string    | string, Date                   | string         | How to map date/time/duration types                              |
| `--choice`             | string    | all-optional, union            | all-optional   | Representation of `<choice>` elements                            |
| `--fail-on-unresolved` | boolean   | true, false                    | true           | Fail if any type references cannot be resolved                   |
| `--nillable-as-optional` | boolean | true, false                    | false          | Treat nillable elements as optional properties in types          |

---

## Generated Files

The generator produces the following files in the output directory:

```
<out>/
  types.ts       # TypeScript interfaces and type aliases
  utils.ts       # Runtime metadata for JSON ⇄ SOAP mapping
  client.ts      # Strongly-typed SOAP client wrapper
  catalog.json   # (optional) Compiled catalog JSON if `--catalog` is set
```

---

## Advanced Usage

### Programmatic API

You can use the generator programmatically:

```ts
import { compileWsdlToProject } from "@techspokes/typescript-wsdl-client";

await compileWsdlToProject({
  wsdl: "./spec/wsdl/MyService.wsdl",
  outDir: "./generated",
  options: {
    imports: "js",
    catalog: true,
    primitive: {
      int64As: "string",
      bigIntegerAs: "string",
      decimalAs: "string",
      dateAs: "string",
    },
    choice: "all-optional",
    failOnUnresolved: true,
    attributesKey: "$attributes",
    clientName: "MyServiceClient",
    nillableAsOptional: false,
  },
});
```

---

## Troubleshooting

- CLI errors  
  • "Error: Cannot parse WSDL" → verify file path or URL; test with `curl -I <wsdl-url>`.  
  • "Cannot resolve type XYZ" → ensure all XSD imports are reachable or use `--fail-on-unresolved=false`.  
- Module resolution  
  • `ERR_MODULE_NOT_FOUND` → align import extensions: use `--imports js` (adds `.js`), `--imports ts` (adds `.ts`), or `--imports bare` for no extension.  
- TypeScript type issues  
  • "Cannot find module './client'" → run `npm run typecheck`, confirm your `outDir` matches import paths, and include generated `.d.ts`.  
- Runtime SOAP errors  
  • Enable raw SOAP logging:  
    ```bash
    NODE_DEBUG=soap node your-app.js
    ```  
  • "wsdl is not valid" → update `soap` to latest (`npm i soap@latest`).  
- Security warnings  
  • Missing or invalid headers → pass a valid `soap.ISecurity` instance:  
    ```ts
    new soap.WSSecurity("user","pass",{passwordType:"PasswordText"});
    ```  
- XML attribute/content issues  
  • Wrong key in requests → override with `--attributes-key inKey[:outKey]` (e.g., `--attributes-key $attributes:attributes`).

---

## Roadmap

Please see the [ROADMAP.md](ROADMAP.md) for planned features and improvements.

---

## Contributing

We welcome contributions! Please see the following resources:
- [CONTRIBUTING.md](CONTRIBUTING.md): Development workflow and guidelines.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md): Community expectations.
- [SECURITY.md](SECURITY.md): Reporting vulnerabilities.

---

## License

MIT © TechSpokes.
*The tool is MIT-licensed. Generated artifacts are owned by you; the tool imposes no license on generated files.*

---

## Sponsors

**Silver Sponsors**
- Your Name Here!

**Gold Sponsors**
- [Your Name or Company (with a link) Here!](https://your-link-here.com)

**Platinum Sponsors**
- [Your Name or Company (with a link) Here!](https://your-link-here.com)
- **AND** 30-min one-to-one video meeting on AI, business automations, vacation rentals industry, development, tools, or a subject of your choice.

Want to see your name or company here? [Become a sponsor!](https://github.com/sponsors/TechSpokes)
