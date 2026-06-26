import type {CapabilityCase} from "./types.js";

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
  },
  {
    id: "abstract-complex-type",
    title: "Abstract complex type with concrete extension",
    status: "diagnostic",
    featureTags: ["xsd", "inheritance", "diagnostic"],
    fixture: "xsd/types/type-complex-abstract-extension.wsdl",
    docsAnchor: "not-yet-supported",
    publicContract: "Abstract complex type semantics are not modeled yet; 1.0 should reject or warn instead of treating them as concrete.",
    decision: "diagnostic",
    decisionReason: "Full abstract type semantics imply polymorphic instance handling; 1.0 should reject or warn instead of treating abstract types as concrete.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for abstract complex type declaration and extension.",
    license: "MIT",
    fixtureKind: "diagnostic-required",
    compile: {
      outcome: "research",
      reason: "The compiler currently does not model abstract complex type constraints.",
    },
  },
  {
    id: "substitution-group-element",
    title: "Substitution group element family",
    status: "diagnostic",
    featureTags: ["xsd", "substitution-group", "diagnostic"],
    fixture: "xsd/elements/element-substitution-group.wsdl",
    docsAnchor: "not-yet-supported",
    publicContract: "Substitution groups are not expanded yet; 1.0 should avoid silent omission with a diagnostic.",
    decision: "diagnostic",
    decisionReason: "Substitution groups require polymorphic element expansion; 1.0 should avoid silent omission by producing a diagnostic.",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for head and member elements in a substitution group.",
    license: "MIT",
    fixtureKind: "diagnostic-required",
    compile: {
      outcome: "research",
      reason: "The compiler has no substitution group expansion or explicit diagnostic policy yet.",
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
  },
  {
    id: "mtom-xop-attachment",
    title: "MTOM/XOP attachment payload",
    status: "unsupported",
    featureTags: ["soap", "mtom", "xop", "attachment"],
    fixture: "soap/attachments/attachment-mtom-xop.wsdl",
    docsAnchor: "not-yet-supported",
    publicContract: "MTOM/XOP binary attachment transport is outside the 1.0 typed SOAP-to-REST contract.",
    decision: "out-of-scope",
    decisionReason: "MTOM/XOP requires binary attachment transport and MIME packaging semantics beyond the 1.0 typed SOAP-to-REST pipeline.",
    authority: "SOAP 1.1",
    provenance: "Repository-authored fixture for XOP include references in document-literal payloads.",
    license: "MIT",
    fixtureKind: "diagnostic-required",
    compile: {
      outcome: "research",
      reason: "The generator does not have an attachment transport or binary payload mapping contract.",
    },
  },
];
