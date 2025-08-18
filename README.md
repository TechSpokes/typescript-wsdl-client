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

**TypeScript WSDL Client** is a generator that converts WSDL/XSD files into a fully-typed SOAP client for TypeScript. It simplifies SOAP integration by generating deterministic, type-safe code that works seamlessly with modern TypeScript and Node.js environments.

Key features:
- **Typed SOAP client**: Generates TypeScript interfaces and runtime code.
- **Deterministic metadata**: Ensures clean JSON ⇄ SOAP mapping.
- **ESM and CommonJS support**: Compatible with modern and legacy module systems.
- **Customizable mappings**: Control how XML primitives (e.g., `xs:decimal`, `xs:date`) are mapped.

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
npx wsdl-tsc --wsdl ./spec/wsdl/MyService.wsdl --out ./src/generated/my --imports js --ops-ts
```

### Use the Generated Client

```ts
import { createSoapClient } from "./generated/my/runtime.js";
import { MyServiceSoapClient } from "./generated/my/client.js";
import soap from "soap";

const security = new soap.WSSecurity("user", "pass");
const soapClient = await createSoapClient({
  wsdlUrl: "https://example.com/MyService?wsdl",
  security,
});

const client = new MyServiceSoapClient(soapClient, "$attributes");
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

- **Attributes and Child Elements**: Supports both attributes and nested elements in SOAP requests.
- **Literal Text Values**: Handles mixed content (attributes + text).
- **Security Integration**: Works with `node-soap` security instances (e.g., `WSSecurity`, `BasicAuthSecurity`).
- **WS-Policy Hints**: Provides inline hints for security configuration based on WSDL policies.

---

## CLI Usage

The CLI is the primary way to generate SOAP clients.

```bash
wsdl-tsc --wsdl <path-or-url> --out <dir> [options]
```

### Required Flags
- `--wsdl`: Path or URL to the WSDL file.
- `--out`: Output directory for the generated files.

### Options

| Flag                | Type      | Choices                        | Default      | Description                                                      |
|---------------------|-----------|--------------------------------|--------------|------------------------------------------------------------------|
| `--imports`         | string    | js, ts, bare                   | js           | Intra-generated import specifiers: '.js', '.ts', or bare         |
| `--ops-ts`          | boolean   | true, false                    | true         | Emit `operations.ts` instead of JSON                             |
| `--attributes-key`  | string    | any                            | $attributes  | Key used by runtime marshaller for XML attributes                |
| `--int64-as`        | string    | string, number, bigint         | string       | How to map xs:long/xs:unsignedLong                               |
| `--bigint-as`       | string    | string, number                 | string       | How to map xs:integer family (positive/nonNegative/etc.)         |
| `--decimal-as`      | string    | string, number                 | string       | How to map xs:decimal (money/precision)                          |
| `--date-as`         | string    | string, Date                   | string       | How to map date/time/duration types                              |

---

## Generated Files

The generator produces the following files in the output directory:

```
<out>/
  types.ts       # TypeScript interfaces and type aliases
  client.ts      # Thin wrapper for SOAP operations
  runtime.ts     # SOAP runtime utilities
  meta.ts        # Metadata for JSON ⇄ SOAP mapping
  operations.ts  # Operation metadata (optional, based on --ops-ts)
```

---

## Advanced Usage

### Programmatic API

You can use the generator programmatically for custom workflows:

```ts
import { compileCatalog } from "@techspokes/typescript-wsdl-client";

const catalog = await loadWsdlCatalog("./spec/wsdl/MyService.wsdl");
const compiled = compileCatalog(catalog, {
  primitive: { decimalAs: "string", dateAs: "string" },
});

// Use the compiled output as needed.
```

---

## Troubleshooting

- **Missing `runtime.ts`**: Ensure the output directory is writable and you're using the latest version.
- **Module system issues**: Use `--imports js` for ESM/NodeNext or `--imports bare` for CommonJS.
- **Security warnings**: Configure `node-soap` security (e.g., `WSSecurity`) as needed.

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

## 💖 Sponsors

**Silver Sponsors**
- Your Name Here!

**Gold Sponsors**
- [Your Name or Company (with a link) Here!](https://your-link-here.com)

**Platinum Sponsors**
- [Your Name or Company (with a link) Here!](https://your-link-here.com)
- **AND** 30-min one-to-one video meeting on AI, business automations, vacation rentals industry, development, tools, or a subject of your choice.

Want to see your name or company here? [Become a sponsor!](https://github.com/sponsors/TechSpokes)
