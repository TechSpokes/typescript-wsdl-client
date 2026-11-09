# Product Corpus Evidence

Representative inputs and their maintained product checks. See the root [README](../README.md) and [Supported Patterns](supported-patterns.md) for the separate legacy and checked support boundaries.

## Evidence index

This table is generated from `test/conformance/readiness-corpus.json`; its source identity and permission records are checked by the readiness inventory tests. A row indexes executable evidence, not a percentage of WSDL/XSD support or a claim of live provider acceptance.

| Input | Provenance tier | Mode | Expected result | Evidence stages | Executable evidence |
|---|---|---|---|---|---|
| [noaa-ndfd](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/fixtures/wsdl/real-services/noaa-ndfd/ndfd-xml.wsdl) | real | checked | partial | original source decoding and 12-operation inventory, all 12 operations native planning and generation, installed build and every generated HTTP route, owned typed SOAP 1.1 RPC with native restrictions and 73-field Boolean record, exact Latin1 responses and offline provider replay; zero provider calls in tests | [noaa-ndfd-qualification.test.ts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/noaa-ndfd-qualification.test.ts), [checked-gateway-installed.test.ts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/checked-gateway-installed.test.ts) |
| [weather](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/examples/minimal/weather.wsdl) | synthetic | legacy | supported | generate, typecheck, OpenAPI, gateway mock, installed package | [gateway-routes.test.ts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/gateway-routes.test.ts); `npm run package:smoke` |
| [checked-forecast](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/conformance/fixtures/assessment/forecast.wsdl) | synthetic | checked | supported | generate, install, typecheck, HTTP/SOAP success and faults | [checked-gateway-installed.test.ts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/checked-gateway-installed.test.ts) |
| [application-groups](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/conformance/fixtures/assessment/application-groups.wsdl) | synthetic | checked | supported | generate, native SOAP, OpenAPI, installed HTTP/SOAP variant | [checked-application-groups.test.ts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/checked-application-groups.test.ts), [checked-gateway-installed.test.ts](https://github.com/TechSpokes/typescript-wsdl-client/blob/main/test/integration/checked-gateway-installed.test.ts) |

## Run the corpus

```bash
npm run test:corpus
```

The command selects the existing tests once and delegates installed-package checks to their existing script. Refused rows prove their named failure and dispatch boundary; they do not count as successfully generated services.

Installed variant evidence uses independently checked source-derived variants where named; it does not assert an unchanged production-provider contract. Private service evidence remains separate and is not required by this public corpus command.

## Maintain the index

Add rights-cleared inputs and independent expected exchanges to the existing conformance framework. Preserve supported behavior, invalid-input checks, compatibility and security requirements alongside corpus growth.

```bash
npm run docs:corpus
npm run docs:corpus:check
```
