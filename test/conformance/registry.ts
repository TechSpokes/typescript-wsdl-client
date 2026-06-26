import type {CapabilityCase} from "./types.js";

function requireSchema(doc: any, name: string): any {
  const schema = doc.components?.schemas?.[name];
  if (!schema) {
    throw new Error(`Expected OpenAPI schema ${name}.`);
  }
  return schema;
}

function requireOperation(doc: any, operationId: string): any {
  for (const pathItem of Object.values(doc.paths ?? {})) {
    for (const operation of Object.values(pathItem as Record<string, any>)) {
      if ((operation as any).operationId === operationId) {
        return operation;
      }
    }
  }
  throw new Error(`Expected OpenAPI operation ${operationId}.`);
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual: ${actualJson}`);
  }
}

function assertSuccessEnvelope(body: any, expectedData: unknown): void {
  assertJsonEqual(
    body,
    {
      status: "SUCCESS",
      message: null,
      data: expectedData,
      error: null,
    },
    "Gateway should return the standard success envelope.",
  );
}

export const capabilities: CapabilityCase[] = [
  {
    id: "weather-document-literal-soap",
    title: "Weather document-literal SOAP baseline",
    status: "supported",
    featureTags: ["wsdl", "soap", "document-literal", "baseline"],
    fixture: "wsdl/baselines/baseline-weather-document-literal.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "The canonical weather WSDL compiles through client, OpenAPI, gateway, generated-test, and app artifacts with document-literal SOAP operations.",
    decision: "support",
    decisionReason: "The weather fixture is the canonical smoke-test WSDL and proves the baseline document-literal SOAP pipeline.",
    authority: "WSDL 1.1",
    provenance: "Repository weather fixture copied into the conformance corpus for baseline support evidence.",
    license: "MIT",
    fixtureKind: "real-world-compatible",
    compile: {
      outcome: "success",
      typeNames: ["GetWeatherInformation", "GetCityForecastByZIP", "WeatherReturn", "ArrayOfForecast"],
      operationNames: ["GetWeatherInformation", "GetCityForecastByZIP", "GetCityWeatherByZIP"],
      assert: compiled => {
        const operation = compiled.operations.find(op => op.name === "GetWeatherInformation");
        if (operation?.soapAction !== "http://ws.cdyne.com/WeatherWS/GetWeatherInformation") {
          throw new Error("Weather baseline should retain the SOAP 1.1 action from the first SOAP binding.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "export interface ArrayOfForecast"},
        {file: "operations", text: "GetWeatherInformation("},
        {file: "operations", text: "args: GetWeatherInformation"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const arraySchema = requireSchema(doc, "ArrayOfForecast");
        if (arraySchema.type !== "array") {
          throw new Error("Weather ArrayOfForecast should flatten to an OpenAPI array schema by default.");
        }
        const operation = requireOperation(doc, "GetWeatherInformation");
        if (operation.summary !== "Gets Information for each WeatherID") {
          throw new Error("Weather operation documentation should propagate into OpenAPI summary.");
        }
      },
    },
    gateway: {
      outcome: "success",
      sourceIncludes: [
        {file: "runtime.ts", text: "ArrayOfWeatherDescription"},
      ],
      requests: [
        {
          operationId: "GetWeatherInformation",
          payload: {},
          mockClient: {
            GetWeatherInformation: async () => ({
              response: {
                GetWeatherInformationResult: {
                  WeatherDescription: [
                    {WeatherID: 1, Description: "Sunny", PictureURL: "https://example.test/sunny.png"},
                  ],
                },
              },
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {
            GetWeatherInformationResult: [
              {WeatherID: 1, Description: "Sunny", PictureURL: "https://example.test/sunny.png"},
            ],
          }),
          assertClientArgs: args => assertJsonEqual(args, {}, "Gateway should pass the empty weather request wrapper."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
      sourceIncludes: [
        {file: "runtime/unwrap.test.ts", text: "ArrayOfForecast"},
      ],
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "sequence-baseline-complex",
    title: "Complex sequences with nested references and repeated optional fields",
    status: "supported",
    featureTags: ["xsd", "sequence", "types", "baseline"],
    fixture: "xsd/sequences/sequence-baseline-complex.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "Complex type sequences support nested complex references, repeated elements, optional fields, and all-optional request wrappers.",
    decision: "support",
    decisionReason: "The baseline sequence fixture exercises reusable XSD object modeling used throughout generated client, OpenAPI, and gateway artifacts.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture distilled from existing sequence and optionality coverage.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["SubmitSequence", "SubmitSequenceResponse", "Customer", "CustomerProfile", "LineItem"],
      operationNames: ["SubmitSequence"],
      assert: compiled => {
        const request = compiled.types.find(type => type.name === "SubmitSequence");
        const items = request?.elems.find(elem => elem.name === "items");
        if (!items || items.min !== 0 || items.max !== "unbounded") {
          throw new Error("SubmitSequence.items should compile as an optional repeated element.");
        }
        const customer = request?.elems.find(elem => elem.name === "customer");
        if (customer?.tsType !== "Customer") {
          throw new Error("SubmitSequence.customer should reference the nested Customer type.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "items?: LineItem[];"},
        {file: "types", text: "profile?: CustomerProfile;"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const schema = requireSchema(doc, "SubmitSequence");
        if (schema.required?.includes("items") || schema.required?.includes("note")) {
          throw new Error("Optional sequence fields should not be OpenAPI required properties.");
        }
        if (schema.properties?.items?.type !== "array") {
          throw new Error("Repeated sequence fields should emit OpenAPI array properties.");
        }
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitSequence",
          payload: {customer: {id: "C-1", profile: {tier: "gold"}}, items: [{sku: "SKU-1", quantity: 2}]},
          mockClient: {
            SubmitSequence: async () => ({
              response: {accepted: true},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {accepted: true}),
          assertClientArgs: args => assertJsonEqual(
            args,
            {customer: {id: "C-1", profile: {tier: "gold"}}, items: [{sku: "SKU-1", quantity: 2}]},
            "Gateway should pass nested sequence payloads to the client.",
          ),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "simple-restriction-list",
    title: "Simple type restrictions, enumerations, and lists",
    status: "supported",
    featureTags: ["xsd", "simple-type", "restriction", "list"],
    fixture: "xsd/types/type-simple-restriction-list.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "Named simple type restrictions, enumerations, and `xs:list` declarations emit aligned TypeScript aliases and OpenAPI schemas.",
    decision: "support",
    decisionReason: "Simple restrictions and list aliases are stable scalar modeling behavior used by generated TypeScript and OpenAPI outputs.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture distilled from simple-type unit coverage.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      aliasNames: ["Color", "CodeList"],
      typeNames: ["SubmitSimple", "SubmitSimpleResponse"],
      operationNames: ["SubmitSimple"],
      assert: compiled => {
        if (compiled.aliases.find(alias => alias.name === "Color")?.tsType !== '"Red" | "Green" | "Blue"') {
          throw new Error("Color should compile to a string literal union alias.");
        }
        if (compiled.aliases.find(alias => alias.name === "CodeList")?.tsType !== "string[]") {
          throw new Error("CodeList should compile xs:list to an array alias.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "export type Color = \"Red\" | \"Green\" | \"Blue\";"},
        {file: "types", text: "export type CodeList = string[];"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        assertJsonEqual(
          requireSchema(doc, "Color"),
          {type: "string", enum: ["Red", "Green", "Blue"]},
          "Color should emit an enum scalar schema.",
        );
        assertJsonEqual(
          requireSchema(doc, "CodeList"),
          {type: "array", items: {type: "string"}},
          "CodeList should emit an array schema.",
        );
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitSimple",
          payload: {color: "Red", codes: ["A", "B"]},
          mockClient: {
            SubmitSimple: async () => ({
              response: {color: "Green"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {color: "Green"}),
          assertClientArgs: args => assertJsonEqual(args, {color: "Red", codes: ["A", "B"]}, "Gateway should pass simple alias payloads to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "same-name-simple-alias",
    title: "Same-name simple type element alias reuse",
    status: "supported",
    featureTags: ["xsd", "simple-type", "alias", "diagnostic-note"],
    fixture: "xsd/types/type-simple-alias-same-name.wsdl",
    docsAnchor: "named-simple-types-and-same-name-elements",
    publicContract: "A global element with the same local name as its named simple type reuses the scalar alias instead of emitting a duplicate wrapper interface.",
    decision: "support",
    decisionReason: "Alias reuse prevents duplicate TypeScript declarations and is reported as an informational catalog note.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture distilled from same-name simple type unit coverage.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      aliasNames: ["AliasCode"],
      operationNames: ["EchoAlias"],
      diagnosticNotes: ["reuses same-name simple type alias AliasCode"],
      assert: compiled => {
        if (compiled.types.some(type => type.name === "AliasCode")) {
          throw new Error("AliasCode should not emit a duplicate wrapper interface.");
        }
        const operation = compiled.operations.find(op => op.name === "EchoAlias");
        if (operation?.inputTypeName !== "AliasCode" || operation.outputTypeName !== "AliasCode") {
          throw new Error("EchoAlias should use the scalar AliasCode alias for input and output.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "export type AliasCode = \"Primary\" | \"Secondary\";"},
        {file: "operations", text: "EchoAlias("},
        {file: "operations", text: "args: AliasCode"},
      ],
      assert: ({readFile}) => {
        if (readFile("types").includes("export interface AliasCode")) {
          throw new Error("AliasCode should not emit an interface in generated types.");
        }
      },
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        assertJsonEqual(
          requireSchema(doc, "AliasCode"),
          {type: "string", enum: ["Primary", "Secondary"]},
          "AliasCode should emit a scalar enum schema.",
        );
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "EchoAlias",
          payload: "Primary",
          mockClient: {
            EchoAlias: async () => ({
              response: "Secondary",
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, "Secondary"),
          assertClientArgs: args => assertJsonEqual(args, "Primary", "Gateway should pass scalar alias payloads to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "simple-content-attributes",
    title: "Simple content with flattened attributes",
    status: "supported",
    featureTags: ["xsd", "simple-content", "attribute"],
    fixture: "xsd/types/type-simple-content-attributes.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "Simple content emits text content through `$value` and flattens XML attributes as peer properties.",
    decision: "support",
    decisionReason: "The `$value` convention and flattened attributes are core XML mapping behavior in generated artifacts.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture distilled from simple-content and attribute mapping coverage.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["LabeledAmount", "SubmitAmount", "SubmitAmountResponse"],
      operationNames: ["SubmitAmount"],
      assert: compiled => {
        const amount = compiled.types.find(type => type.name === "LabeledAmount");
        if (!amount?.elems.some(elem => elem.name === "$value" && elem.tsType === "string")) {
          throw new Error("LabeledAmount should expose simple content through $value.");
        }
        if (!amount.attrs.some(attr => attr.name === "currency" && attr.use === "required")) {
          throw new Error("LabeledAmount should flatten required currency attribute metadata.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "$value?: string;"},
        {file: "types", text: "currency: string;"},
        {file: "types", text: "source?: string;"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const schema = requireSchema(doc, "LabeledAmount");
        if (!schema.properties?.$value || !schema.properties?.currency) {
          throw new Error("Simple content and attributes should be peer OpenAPI properties.");
        }
        if (!schema.required?.includes("currency")) {
          throw new Error("Required XML attributes should be required OpenAPI properties.");
        }
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitAmount",
          payload: {amount: {$value: "42.00", currency: "USD", source: "quoted"}},
          mockClient: {
            SubmitAmount: async () => ({
              response: {accepted: true},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {accepted: true}),
          assertClientArgs: args => assertJsonEqual(
            args,
            {amount: {$value: "42.00", currency: "USD", source: "quoted"}},
            "Gateway should pass $value and flattened attributes to the client.",
          ),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "documentation-propagation",
    title: "WSDL and XSD documentation propagation",
    status: "supported",
    featureTags: ["wsdl", "xsd", "documentation"],
    fixture: "wsdl/documentation/documentation-propagation.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "WSDL and XSD documentation propagates into catalog metadata, generated TypeScript comments, OpenAPI descriptions, and gateway route comments.",
    decision: "support",
    decisionReason: "Documentation propagation is part of the public generated artifact contract and should be fixture-backed.",
    authority: "WSDL 1.1",
    provenance: "Repository-authored fixture distilled from documentation propagation unit coverage.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["GetThing", "GetThingResponse", "Thing"],
      operationNames: ["GetThing"],
      assert: compiled => {
        const operation = compiled.operations.find(op => op.name === "GetThing");
        if (operation?.doc !== "Gets a thing. Returns details.") {
          throw new Error("Operation documentation should be retained in compiled metadata.");
        }
        const thing = compiled.types.find(type => type.name === "Thing");
        if (thing?.doc !== "Thing payload." || thing.elems.find(elem => elem.name === "name")?.doc !== "Display name.") {
          throw new Error("XSD type and element documentation should be retained in compiled metadata.");
        }
        if (compiled.wsdlDocs?.services?.find(service => service.name === "DocsService")?.doc !== "Demo service entrypoint.") {
          throw new Error("WSDL service documentation should be retained in catalog metadata.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "* Thing payload."},
        {file: "types", text: "* Display name."},
        {file: "operations", text: "* Gets a thing. Returns details."},
        {file: "client", text: "* Gets a thing. Returns details."},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const operation = requireOperation(doc, "GetThing");
        if (operation.summary !== "Gets a thing." || operation.description !== "Gets a thing. Returns details.") {
          throw new Error("WSDL operation docs should propagate into OpenAPI summary and description.");
        }
        const schema = requireSchema(doc, "Thing");
        if (schema.description !== "Thing payload." || schema.properties?.name?.description !== "Display name.") {
          throw new Error("XSD docs should propagate into OpenAPI schema descriptions.");
        }
      },
    },
    gateway: {
      outcome: "success",
      sourceIncludes: [
        {file: "routes/getthing.ts", text: "* Summary: Gets a thing."},
        {file: "routes/getthing.ts", text: "* Description: Gets a thing. Returns details."},
      ],
      requests: [
        {
          operationId: "GetThing",
          payload: {id: "T-1"},
          mockClient: {
            GetThing: async () => ({
              response: {result: {name: "Thing One"}},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {result: {name: "Thing One"}}),
          assertClientArgs: args => assertJsonEqual(args, {id: "T-1"}, "Gateway should pass documented request payloads to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "soap12-first-binding",
    title: "SOAP 1.2 binding selected when it is the first SOAP binding",
    status: "supported",
    featureTags: ["wsdl", "binding", "soap12"],
    fixture: "wsdl/bindings/binding-soap12-first.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "SOAP 1.1 and SOAP 1.2 bindings are detected, and the first SOAP binding deterministically provides operation binding metadata.",
    decision: "support",
    decisionReason: "The compiler scans both SOAP 1.1 and SOAP 1.2 bindings and keeps first-binding behavior deterministic.",
    authority: "WSDL 1.1",
    provenance: "Repository-authored fixture for SOAP 1.2 first-binding detection.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["Ping", "PingResponse"],
      operationNames: ["Ping"],
      assert: compiled => {
        const operation = compiled.operations.find(op => op.name === "Ping");
        if (operation?.soapAction !== "urn:soap12-first") {
          throw new Error("Ping should use the SOAP 1.2 action from the first SOAP binding.");
        }
      },
    },
    client: {
      outcome: "success",
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        requireOperation(doc, "Ping");
        requireSchema(doc, "Ping");
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "Ping",
          payload: {value: "request"},
          mockClient: {
            Ping: async () => ({
              response: {value: "response"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {value: "response"}),
          assertClientArgs: args => assertJsonEqual(args, {value: "request"}, "Gateway should use the operation selected from the first SOAP binding."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "xsd-import-relative",
    title: "Relative XSD import",
    status: "supported",
    featureTags: ["xsd", "import", "types"],
    fixture: "xsd/imports/import-relative-types.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "Relative XSD imports are resolved and imported complex types participate in client, OpenAPI, gateway, generated-test, and app artifacts.",
    decision: "support",
    decisionReason: "Relative XSD imports are existing behavior and can be proven through a committed multi-file fixture.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for relative XSD import resolution.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["SubmitImported", "SubmitImportedResponse", "ImportedPayload"],
      operationNames: ["SubmitImported"],
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "payload: ImportedPayload;"},
        {file: "types", text: "export interface ImportedPayload"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        requireSchema(doc, "ImportedPayload");
        const request = requireSchema(doc, "SubmitImported");
        if (request.properties?.payload?.$ref !== "#/components/schemas/ImportedPayload") {
          throw new Error("Imported payload should be referenced from the request OpenAPI schema.");
        }
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitImported",
          payload: {payload: {name: "imported"}},
          mockClient: {
            SubmitImported: async () => ({
              response: {accepted: true},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {accepted: true}),
          assertClientArgs: args => assertJsonEqual(args, {payload: {name: "imported"}}, "Gateway should pass imported type payloads to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "choice-union-simple",
    title: "Simple xs:choice emitted as a discriminated union catalog shape",
    status: "supported",
    featureTags: ["xsd", "choice", "types"],
    fixture: "xsd/compositors/choice-union-simple.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "`xs:choice` union mode retains choice metadata and drives generated TypeScript/OpenAPI constraints.",
    decision: "support",
    decisionReason: "Choice union mode is already implemented and has compile, client, and OpenAPI evidence in focused tests.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture distilled from XML Schema choice semantics.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compilerOptions: {
      choice: "union",
    },
    compile: {
      outcome: "success",
      typeNames: ["ChoiceRequest", "ChoiceResponse"],
      operationNames: ["SubmitChoice"],
      assert: compiled => {
        const request = compiled.types.find(type => type.name === "ChoiceRequest");
        if (!request?.choiceGroups?.some(group => group.branches.some(branch => branch.name === "email"))) {
          throw new Error("ChoiceRequest should retain a choice group with the email branch.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "export type ChoiceRequest = ChoiceRequestChoiceBase & ChoiceRequestChoice1;"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const schema = requireSchema(doc, "ChoiceRequest");
        if (!Array.isArray(schema.oneOf)) {
          throw new Error("ChoiceRequest should carry OpenAPI oneOf branch constraints.");
        }
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitChoice",
          payload: {email: "person@example.test"},
          mockClient: {
            SubmitChoice: async () => ({
              response: {accepted: true},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {accepted: true}),
          assertClientArgs: args => assertJsonEqual(args, {email: "person@example.test"}, "Gateway should pass the choice request body to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
      sourceIncludes: [
        {file: "gateway/validation.test.ts", text: "rejects invalid ChoiceRequest choice payload"},
        {file: "gateway/validation.test.ts", text: "\"email\": \"sample\""},
      ],
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "xs-union-simple-type",
    title: "xs:union simple type",
    status: "supported",
    featureTags: ["xsd", "simple-type", "union"],
    fixture: "xsd/types/type-union-simple.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "Simple `xs:union` aliases compile to TypeScript unions and OpenAPI `oneOf` schemas.",
    decision: "support",
    decisionReason: "Simple xs:union memberTypes are schema-local and can be represented honestly as TypeScript alias unions.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for a named simple type that combines member types.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      aliasNames: ["Identifier", "InlineIdentifier"],
      typeNames: ["UnionRequest", "UnionResponse"],
      operationNames: ["ResolveUnion"],
      assert: compiled => {
        const alias = compiled.aliases.find(entry => entry.name === "Identifier");
        if (alias?.tsType !== "string | number") {
          throw new Error("Identifier should compile xs:union memberTypes as string | number.");
        }
        const inlineAlias = compiled.aliases.find(entry => entry.name === "InlineIdentifier");
        if (inlineAlias?.tsType !== '"Local" | "Remote" | number') {
          throw new Error("InlineIdentifier should compile nested xs:union simple types.");
        }
      },
    },
    client: {
      outcome: "success",
      sourceIncludes: [
        {file: "types", text: "export type Identifier = string | number;"},
        {file: "types", text: "export type InlineIdentifier = \"Local\" | \"Remote\" | number;"},
      ],
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        assertJsonEqual(
          requireSchema(doc, "Identifier"),
          {oneOf: [{type: "string"}, {type: "number"}]},
          "Identifier should emit a mixed primitive oneOf schema.",
        );
        assertJsonEqual(
          requireSchema(doc, "InlineIdentifier"),
          {oneOf: [{type: "string", enum: ["Local", "Remote"]}, {type: "number"}]},
          "InlineIdentifier should emit a mixed literal and primitive oneOf schema.",
        );
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "ResolveUnion",
          payload: {id: "ABC-123", inlineId: "Local"},
          mockClient: {
            ResolveUnion: async () => ({
              response: {$value: "resolved"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {$value: "resolved"}),
          assertClientArgs: args => assertJsonEqual(args, {id: "ABC-123", inlineId: "Local"}, "Gateway should pass union values to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "abstract-complex-type",
    title: "Abstract complex type with concrete extension",
    status: "diagnostic",
    featureTags: ["xsd", "inheritance", "diagnostic"],
    fixture: "xsd/types/type-complex-abstract-extension.wsdl",
    docsAnchor: "not-yet-supported",
    publicContract: "Abstract complex types are rejected with a diagnostic instead of being treated as concrete.",
    decision: "diagnostic",
    decisionReason: "Full abstract type semantics imply polymorphic instance handling; the compiler rejects them instead of treating abstract types as concrete.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for abstract complex type declaration and extension.",
    license: "MIT",
    fixtureKind: "diagnostic-required",
    compile: {
      outcome: "error",
      errorClass: "WsdlCompilationError",
      messageIncludes: ["Unsupported abstract complex type", "BaseRecord"],
      userMessageIncludes: ["Abstract complex types require polymorphic instance handling"],
      context: {
        element: "BaseRecord",
        namespace: "urn:conformance:abstract-complex-type",
      },
    },
  },
  {
    id: "substitution-group-element",
    title: "Substitution group element family",
    status: "diagnostic",
    featureTags: ["xsd", "substitution-group", "diagnostic"],
    fixture: "xsd/elements/element-substitution-group.wsdl",
    docsAnchor: "not-yet-supported",
    publicContract: "Substitution groups are rejected with a diagnostic instead of being silently omitted.",
    decision: "diagnostic",
    decisionReason: "Substitution groups require polymorphic element expansion; the compiler avoids silent omission by producing a diagnostic.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for head and member elements in a substitution group.",
    license: "MIT",
    fixtureKind: "diagnostic-required",
    compile: {
      outcome: "error",
      errorClass: "WsdlCompilationError",
      messageIncludes: ["Unsupported XSD substitution group", "cardPayment"],
      userMessageIncludes: ["Substitution groups require polymorphic element expansion"],
      context: {
        element: "cardPayment",
        namespace: "urn:conformance:substitution-group-element",
      },
    },
  },
  {
    id: "multi-binding-first-soap",
    title: "Multiple bindings select the first SOAP binding",
    status: "partial",
    featureTags: ["wsdl", "binding", "soap"],
    fixture: "wsdl/bindings/binding-soap-first-multi.wsdl",
    docsAnchor: "first-binding-selection",
    publicContract: "Multiple bindings are deterministic: the first SOAP binding is selected and all ports are documented.",
    decision: "partial-support",
    decisionReason: "First SOAP binding selection is deterministic and documented, but explicit binding selection remains a future enhancement.",
    authority: "WSDL 1.1",
    provenance: "Repository-authored fixture for existing first SOAP binding selection behavior.",
    license: "MIT",
    fixtureKind: "real-world-compatible",
    compile: {
      outcome: "success",
      typeNames: ["GetValueRequest", "GetValueResponse"],
      operationNames: ["GetValue"],
      assert: compiled => {
        const operation = compiled.operations.find(op => op.name === "GetValue");
        if (operation?.soapAction !== "urn:first") {
          throw new Error("GetValue should use the soapAction from the first SOAP binding.");
        }
      },
    },
    client: {
      outcome: "success",
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        requireOperation(doc, "GetValue");
        requireSchema(doc, "GetValueRequest");
        requireSchema(doc, "GetValueResponse");
      },
    },
    gateway: {
      outcome: "success",
      sourceIncludes: [
        {file: "routes/getvalue.ts", text: "client.GetValue"},
      ],
      requests: [
        {
          operationId: "GetValue",
          payload: {$value: "first-binding"},
          mockClient: {
            GetValue: async () => ({
              response: {$value: "first-response"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {$value: "first-response"}),
          assertClientArgs: args => assertJsonEqual(args, {$value: "first-binding"}, "Gateway should call the deterministic first SOAP binding operation."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "external-policy-reference",
    title: "External WS-Policy reference is retained as a known limitation",
    status: "partial",
    featureTags: ["wsdl", "ws-policy", "security"],
    fixture: "ws-policy/references/policy-reference-external.wsdl",
    docsAnchor: "ws-policy-and-ws-security-hints",
    publicContract: "Inline policy hints are detected; external `PolicyReference` documents are not fetched or resolved.",
    decision: "partial-support",
    decisionReason: "Inline policy hints are supported, while external PolicyReference resolution is intentionally not fetched or interpreted.",
    authority: "WS-I Basic Profile",
    provenance: "Repository-authored fixture for an unresolved external WS-Policy reference.",
    license: "MIT",
    fixtureKind: "real-world-compatible",
    compile: {
      outcome: "success",
      typeNames: ["PolicyRequest", "PolicyResponse"],
      operationNames: ["CheckPolicy"],
      assert: compiled => {
        const operation = compiled.operations.find(op => op.name === "CheckPolicy");
        if (!operation || (operation.security ?? []).length !== 0) {
          throw new Error("External PolicyReference should not produce inline security hints.");
        }
      },
    },
    client: {
      outcome: "success",
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const operation = requireOperation(doc, "CheckPolicy");
        if (doc.security || operation.security) {
          throw new Error("External PolicyReference should not produce OpenAPI security requirements.");
        }
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "CheckPolicy",
          payload: {$value: "policy-check"},
          mockClient: {
            CheckPolicy: async () => ({
              response: {$value: "allowed"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {$value: "allowed"}),
          assertClientArgs: args => assertJsonEqual(args, {$value: "policy-check"}, "Gateway should not enforce an unresolved external policy reference."),
        },
      ],
      assert: ({readGatewayFile}) => {
        const pluginSource = readGatewayFile("plugin.ts");
        if (pluginSource.includes("authenticate") || pluginSource.includes("authorization")) {
          throw new Error("External PolicyReference should not emit generated inbound authentication hooks.");
        }
      },
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "deep-composition-sequence",
    title: "Deep nested sequence composition",
    status: "supported",
    featureTags: ["xsd", "sequence", "composition"],
    fixture: "xsd/sequences/sequence-composition-deep.wsdl",
    docsAnchor: "fully-supported",
    publicContract: "Deep nested sequences compile into deterministic type metadata.",
    decision: "support",
    decisionReason: "Nested sequence composition maps directly to deterministic compiled type metadata.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for nested local complex types and element wrappers.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["DeepRequest", "LevelOne", "LevelTwo", "DeepResponse"],
      operationNames: ["SubmitDeep"],
    },
    client: {
      outcome: "success",
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        requireSchema(doc, "DeepRequest");
        requireSchema(doc, "LevelOne");
        requireSchema(doc, "LevelTwo");
        requireOperation(doc, "SubmitDeep");
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitDeep",
          payload: {levelOne: {levelTwo: {value: "nested"}}},
          mockClient: {
            SubmitDeep: async () => ({
              response: {$value: "accepted"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {$value: "accepted"}),
          assertClientArgs: args => assertJsonEqual(args, {levelOne: {levelTwo: {value: "nested"}}}, "Gateway should pass deep composition payloads to the client."),
        },
      ],
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "xs-anyattribute",
    title: "xs:anyAttribute wildcard",
    status: "partial",
    featureTags: ["xsd", "wildcard", "attribute"],
    fixture: "xsd/wildcards/wildcard-attribute-any.wsdl",
    docsAnchor: "xsanyattribute",
    publicContract: "`xs:anyAttribute` is retained as catalog metadata, but generated wildcard attributes are not emitted.",
    decision: "partial-support",
    decisionReason: "The compiler can retain attribute wildcard metadata, but generated TypeScript and OpenAPI do not yet expose arbitrary attribute bags.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for attribute wildcard behavior.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "success",
      typeNames: ["AnyAttributeRequest", "AnyAttributeResponse"],
      operationNames: ["SubmitAnyAttribute"],
      assert: compiled => {
        const request = compiled.types.find(type => type.name === "AnyAttributeRequest");
        if (!request?.attributeWildcards?.some(wildcard => wildcard.namespace === "##other")) {
          throw new Error("AnyAttributeRequest should retain the xs:anyAttribute namespace metadata.");
        }
      },
    },
    client: {
      outcome: "success",
    },
    openapi: {
      outcome: "success",
      assert: ({doc}) => {
        const schema = requireSchema(doc, "AnyAttributeRequest");
        if (schema.properties?.$attributes || schema.additionalProperties === true) {
          throw new Error("xs:anyAttribute should not be emitted as generated wildcard attributes yet.");
        }
      },
    },
    gateway: {
      outcome: "success",
      requests: [
        {
          operationId: "SubmitAnyAttribute",
          payload: {value: "known-only"},
          mockClient: {
            SubmitAnyAttribute: async () => ({
              response: {$value: "stored"},
              headers: {},
            }),
          },
          expectedStatus: 200,
          assertBody: body => assertSuccessEnvelope(body, {$value: "stored"}),
          assertClientArgs: args => assertJsonEqual(args, {value: "known-only"}, "Gateway should pass only the modeled xs:anyAttribute payload subset."),
        },
      ],
      assert: ({readGatewayFile}) => {
        const schemaSource = readGatewayFile("schemas/models/anyattributerequest.json");
        if (schemaSource.includes("$attributes")) {
          throw new Error("xs:anyAttribute gateway schema should not emit a wildcard attribute bag.");
        }
      },
    },
    generatedTests: {
      outcome: "success",
    },
    app: {
      outcome: "success",
    },
  },
  {
    id: "mtom-xop-attachment",
    title: "MTOM/XOP attachment payload",
    status: "unsupported",
    featureTags: ["soap", "mtom", "xop", "attachment"],
    fixture: "soap/attachments/attachment-mtom-xop.wsdl",
    docsAnchor: "not-yet-supported",
    publicContract: "MTOM/XOP binary attachment metadata is rejected because attachment transport is outside the 1.0 typed SOAP-to-REST contract.",
    decision: "out-of-scope",
    decisionReason: "MTOM/XOP requires binary attachment transport and MIME packaging semantics beyond the 1.0 typed SOAP-to-REST pipeline.",
    authority: "SOAP 1.1",
    provenance: "Repository-authored fixture for XOP include references in document-literal payloads.",
    license: "MIT",
    fixtureKind: "diagnostic-required",
    compile: {
      outcome: "error",
      errorClass: "WsdlCompilationError",
      messageIncludes: ["Unsupported MTOM/XOP or XML MIME attachment metadata"],
      userMessageIncludes: ["Attachment payloads require MIME or binary transport semantics"],
      context: {
        namespace: "urn:conformance:mtom-xop-attachment",
      },
    },
  },
];
