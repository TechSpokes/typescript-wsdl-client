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
