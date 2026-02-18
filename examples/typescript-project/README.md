# TypeScript Project Example

Minimal project showing how to use the generated SOAP client in a TypeScript application.

## Prerequisites

Generate the client from a WSDL source:

```bash
npx wsdl-tsc pipeline \
  --wsdl-source https://example.com/service?wsdl \
  --client-dir ./generated/client
```

## Project Setup

```bash
npm init -y
npm install soap
npm install -D tsx typescript @types/node
```

Ensure your `tsconfig.json` uses NodeNext module resolution:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

## Usage

```typescript
import { Weather } from "./generated/client/client.js";

const client = new Weather({
  source: "https://example.com/service?wsdl",
});

const result = await client.GetCityWeatherByZIP({
  ZIP: "10001",
});

console.log(result);
```

## Running

```bash
npx tsx src/index.ts
```

## Key Points

- Import specifiers use `.js` extensions (NodeNext convention for ESM)
- The `source` parameter accepts both URLs and local file paths
- All request/response types are fully typed from the WSDL schema
- The client constructor connects to the SOAP service lazily on first call
