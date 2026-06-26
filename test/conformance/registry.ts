import type {CapabilityCase} from "./types.js";

export const capabilities: CapabilityCase[] = [
  {
    id: "choice-union-simple",
    title: "Simple xs:choice emitted as a discriminated union catalog shape",
    status: "supported",
    featureTags: ["xsd", "choice", "types"],
    fixture: "choice-union-simple/choice-union-simple.wsdl",
    docsAnchor: "fully-supported",
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
    status: "research",
    featureTags: ["xsd", "simple-type", "union"],
    fixture: "xs-union-simple-type/xs-union-simple-type.wsdl",
    docsAnchor: "not-yet-supported",
    authority: "XML Schema 1.0",
    provenance: "Repository-authored fixture for a named simple type that combines member types.",
    license: "MIT",
    fixtureKind: "standards-valid",
    compile: {
      outcome: "research",
      reason: "The current compiler falls back to string for xs:union and needs an explicit support policy.",
    },
  },
  {
    id: "abstract-complex-type",
    title: "Abstract complex type with concrete extension",
    status: "diagnostic",
    featureTags: ["xsd", "inheritance", "diagnostic"],
    fixture: "abstract-complex-type/abstract-complex-type.wsdl",
    docsAnchor: "not-yet-supported",
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
    fixture: "substitution-group-element/substitution-group-element.wsdl",
    docsAnchor: "not-yet-supported",
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
    fixture: "multi-binding-first-soap/multi-binding-first-soap.wsdl",
    docsAnchor: "first-binding-selection",
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
    fixture: "external-policy-reference/external-policy-reference.wsdl",
    docsAnchor: "ws-policy-and-ws-security-hints",
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
    fixture: "deep-composition-sequence/deep-composition-sequence.wsdl",
    docsAnchor: "fully-supported",
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
    fixture: "xs-anyattribute/xs-anyattribute.wsdl",
    docsAnchor: "xsanyattribute",
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
    fixture: "mtom-xop-attachment/mtom-xop-attachment.wsdl",
    docsAnchor: "not-yet-supported",
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
