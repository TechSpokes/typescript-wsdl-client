/** Remaining schema-for-schemas constraints on preserved original syntax. */
import type {GraphNode} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {isXmlNCName, XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxAttribute, SyntaxElement, SyntaxSource} from "../loader/orderedSyntax.js";
import {normalizeWhitespace} from "./schemaDatatypeValues.js";

const facetNames = new Set(["length", "minLength", "maxLength", "pattern", "enumeration", "whiteSpace", "minInclusive", "maxInclusive", "minExclusive", "maxExclusive", "totalDigits", "fractionDigits"]);
const particleNames = new Set(["sequence", "choice", "all", "group"]);
const excluded = new Set(["key", "keyref", "unique", "assert", "assertion", "alternative", "openContent", "defaultOpenContent", "explicitTimezone", "redefine"]);
export function checkSchemaSyntax(c: AssessmentContext, node: GraphNode) {
  if (node.kind === "wsdl") return;
  const fail = (message: string, source = node.context.source): never => c.fail(node, "schema-for-schemas", message, source);
  const attrs = (attributes: readonly SyntaxAttribute[], allowed: readonly string[], source: SyntaxSource) => {
    for (const a of attributes) {
      c.step(node); c.text(a.name.local, node); c.text(a.value, node);
      if (!a.name.namespace && !allowed.includes(a.name.local)) fail("Attribute is not permitted in this XSD syntax context", source);
      if (!a.name.namespace && a.name.local === "id" && !isXmlNCName(a.value)) fail("Schema id must be an XML NCName", source);
      if (!a.name.namespace && ["abstract", "nillable", "mixed"].includes(a.name.local) && !["true", "false", "1", "0"].includes(normalizeWhitespace(a.value, "collapse"))) fail("Invalid XML Schema boolean spelling", source);
      if (!a.name.namespace && ["minOccurs", "maxOccurs"].includes(a.name.local)) {
        const value = normalizeWhitespace(a.value, "collapse");
        if (!(a.name.local === "maxOccurs" && value === "unbounded") && !/^[+-]?[0-9]+$/.test(value)) fail("Invalid XML Schema occurrence integer spelling", source);
      }
    }
  };
  const global = node.identity.kind === "global", common = ["id"];
  let allowed: readonly string[];
  switch (node.kind) {
    case "element": allowed = [...common, "name", "type", "default", "fixed", "nillable", "block", ...(global ? ["abstract", "final", "substitutionGroup"] : ["form", "minOccurs", "maxOccurs"])]; break;
    case "attribute": allowed = [...common, "name", "type", "default", "fixed", ...(global ? [] : ["form", "use"])]; break;
    case "complexType": allowed = [...common, "mixed", ...(global ? ["name", "abstract", "final", "block"] : [])]; break;
    case "simpleType": allowed = [...common, ...(global ? ["name", "final"] : [])]; break;
    case "group": case "attributeGroup": allowed = [...common, "name"]; break;
    case "attributeGroupUse": allowed = [...common, "ref"]; break;
    case "attributeWildcard": allowed = [...common, "namespace", "processContents"]; break;
    case "attributeUse": allowed = [...common, "name", "ref", "type", "default", "fixed", "form", "use"]; break;
    case "particle": {
      const bounds = [...common, "minOccurs", "maxOccurs"];
      allowed = node.term.kind === "any" ? [...bounds, "namespace", "processContents"] : node.term.kind === "group" ? [...bounds, "ref"]
        : node.term.kind !== "element" ? bounds : node.term.declaration.kind === "symbol" ? [...bounds, "ref"] : [...bounds, "name", "type", "default", "fixed", "nillable", "block", "form"];
      break;
    }
  }
  attrs(node.declaredAttributes, allowed, node.context.source);
  if (node.kind === "attributeUse" && node.value?.kind === "default" && node.use !== "optional") c.fail(node, "src-attribute", "Attribute default requires an optional use");
  for (const attribute of node.context.schemaAttributes) {
    c.step(node);
    if (attribute.name.namespace || !["finalDefault", "blockDefault"].includes(attribute.name.local)) continue;
    c.text(attribute.value, node); const tokens = normalizeWhitespace(attribute.value, "collapse").split(" ").filter(Boolean);
    const allowed = attribute.name.local === "finalDefault" ? ["extension", "restriction", "list", "union"] : ["extension", "restriction", "substitution"];
    if (!(tokens.length === 1 && tokens[0] === "#all") && tokens.some(t => !allowed.includes(t))) fail("Invalid schema default derivation set");
  }
  if (node.kind === "attribute" && (node.name.local === "xmlns" || node.name.namespace === "http://www.w3.org/2001/XMLSchema-instance")) c.fail(node, "no-xmlns/no-xsi", "User attribute declaration uses a reserved XML Schema name");
  if (node.kind === "simpleType" || node.kind === "complexType") {
    for (const syntax of node.syntaxDetails) {
      c.step(node);
      if (node.kind === "simpleType") checkBody(syntax, "scalar");
      else {
        attrs(syntax.attributes, ["id", ...(syntax.name.local === "complexContent" ? ["mixed"] : [])], syntax.source);
        const children = elements(syntax); let body: SyntaxElement | undefined;
        for (const child of children) {
          c.step(node);
          if (child.name.local === "annotation" && child.name.namespace === XSD_NAMESPACE && !body) continue;
          if (body || child.name.namespace !== XSD_NAMESPACE || !["restriction", "extension"].includes(child.name.local)) fail("Content wrapper requires one restriction or extension after annotation", child.source);
          body = child;
        }
        if (!body) fail("Missing content derivation", syntax.source);
        checkBody(body!, syntax.name.local === "complexContent" ? "complex" : "simple");
      }
    }
  }
  function elements(syntax: SyntaxElement): SyntaxElement[] {
    const result: SyntaxElement[] = [];
    for (const child of syntax.children) {c.step(node); if (child.kind === "element") result.push(child); else if (/[^\t\r\n ]/.test(child.value)) fail("XSD declaration requires element-only syntax", child.source);}
    return result;
  }
  function checkBody(body: SyntaxElement, context: "scalar" | "simple" | "complex") {
    attrs(body.attributes, ["id", body.name.local === "list" ? "itemType" : body.name.local === "union" ? "memberTypes" : "base"], body.source);
    let stage = 0, annotation = false, scalarType = false, particle = false, wildcard = false;
    for (const child of elements(body)) {
      c.step(node); const name = child.name.local;
      if (child.name.namespace !== XSD_NAMESPACE) fail("Foreign child belongs in annotation/appinfo", child.source);
      if (excluded.has(name)) c.unsupported(node, `xsd:${name}`, "Excluded schema feature is retained for capability diagnosis", child.source);
      if (name === "annotation") {if (stage || annotation) fail("Annotation must occur once before the content", child.source); annotation = true; continue;}
      if (name === "simpleType" && context !== "complex" && stage <= 1 && (body.name.local === "union" || !scalarType)) {scalarType = true; stage = 1; continue;}
      if (facetNames.has(name) && body.name.local === "restriction" && context !== "complex" && stage <= 2) {
        stage = 2; attrs(child.attributes, ["id", "value", ...(["enumeration", "pattern"].includes(name) ? [] : ["fixed"])], child.source);
        const contents = elements(child);
        if (contents.length > 1 || contents.some(n => n.name.namespace !== XSD_NAMESPACE || n.name.local !== "annotation")) fail("Facet permits only an optional annotation", child.source);
        continue;
      }
      if (context === "complex" && particleNames.has(name) && stage < 3 && !particle) {particle = true; stage = 3; continue;}
      if (context !== "scalar" && ["attribute", "attributeGroup"].includes(name) && !wildcard) {stage = 4; continue;}
      if (context !== "scalar" && name === "anyAttribute" && !wildcard) {stage = 5; wildcard = true; continue;}
      fail("Child is not permitted at this position in the XSD content grammar", child.source);
    }
  }
}
