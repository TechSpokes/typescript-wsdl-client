/** Original component XML syntax only; aggregate schema/candidate checking is separate. */
// Reconciled from unaccepted #231@460f5b8; this owner is independently scoped.
import type {GraphNode, NodeId} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaScalarContext.js";
import {schemaScalarContext, SchemaAssessmentError} from "./schemaScalarContext.js";
import {assertSemanticContext} from "./semanticContext.js";
import type {SemanticContext} from "./semanticContext.js";
import type {ResourceLimitFailure} from "./semanticBudget.js";
import {isXmlNCName, XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxAttribute, SyntaxElement, SyntaxSource} from "../loader/orderedSyntax.js";
import {normalizeWhitespace} from "./schemaDatatypeValues.js";
import {declarationMethods, RelationProblem} from "./schemaTypeRelations.js";
import {schemaBooleanLexical, schemaNonNegativeIntegerLexical} from './schemaSourceLexical.js';

const facetNames = new Set(["length", "minLength", "maxLength", "pattern", "enumeration", "whiteSpace", "minInclusive", "maxInclusive", "minExclusive", "maxExclusive", "totalDigits", "fractionDigits"]);
const particleNames = new Set(["sequence", "choice", "all", "group"]);
const excluded = new Set(["key", "keyref", "unique", "assert", "assertion", "alternative", "openContent", "defaultOpenContent", "explicitTimezone", "redefine"]);
function sameSource(c: AssessmentContext, node: GraphNode, left: SyntaxSource, right: SyntaxSource): boolean {
  c.step(node, 12);
  return c.budget.compareText(left.uri, right.uri) === 0 && c.budget.compareText(left.digest, right.digest) === 0
    && c.budget.compareText(left.path, right.path) === 0
    && left.start.offset === right.start.offset && left.end.offset === right.end.offset
    && left.start.line === right.start.line && left.start.column === right.start.column
    && left.end.line === right.end.line && left.end.column === right.end.column;
}
/** The builder represents one local element source as declaration and use.
 * Its retained inline child belongs to the exact declaration's anonymous type.
 */
function particleInlineType(c: AssessmentContext, node: GraphNode): Extract<GraphNode, {kind: "simpleType" | "complexType"}> | undefined {
  c.step(node, 12);
  if (node.kind !== "particle" || node.term.kind !== "element" || node.term.declaration.kind !== "local"
    || node.identity.kind !== "scoped") return;
  const declaration = c.get(node.term.declaration.target);
  if (declaration.kind !== "element" || declaration.identity.kind !== "scoped" || declaration.type.kind !== "local"
    || c.budget.compareText(declaration.identity.owner, node.identity.owner) !== 0
    || !sameSource(c, node, declaration.context.source, node.context.source)) return;
  const type = c.get(declaration.type.target);
  if ((type.kind !== "simpleType" && type.kind !== "complexType") || type.identity.kind !== "scoped"
    || c.budget.compareText(type.identity.owner, declaration.id) !== 0) return;
  const source = type.context.source, owner = declaration.context.source;
  c.text(source.path, node); c.text(owner.path, node); c.step(node, 6);
  const prefix = owner.path + "/";
  if (c.budget.compareText(source.uri, owner.uri) !== 0 || c.budget.compareText(source.digest, owner.digest) !== 0
    || !source.path.startsWith(prefix) || source.path.slice(prefix.length).includes("/")
    || source.start.offset < owner.start.offset || source.end.offset > owner.end.offset) return;
  return type;
}
function checkSchemaSyntax(c: AssessmentContext, node: GraphNode) {
  if (node.kind === "wsdl") return;
  // Fixed grammar tables/closures below are bounded per component; reserve them
  // before allocation. Input-sized traversal and output are charged separately.
  c.step(node, 300);
  const fail = (message: string, source = node.context.source): never => c.fail(node, "schema-for-schemas", message, source);
  const attrs = (attributes: readonly SyntaxAttribute[], allowed: readonly string[], source: SyntaxSource, facet = false) => {
    for (const a of attributes) {
      c.step(node); c.text(a.name.local, node); c.text(a.value, node);
      if (a.name.namespace === XSD_NAMESPACE || !a.name.namespace && !allowed.includes(a.name.local)) fail("Attribute is not permitted in this XSD syntax context", source);
      if (!a.name.namespace && a.name.local === "id" && !isXmlNCName(normalizeWhitespace(a.value, "collapse"))) fail("Schema id must be an XML NCName", source);
      if (!a.name.namespace && (["abstract", "nillable", "mixed"].includes(a.name.local) || facet && a.name.local === "fixed") && !schemaBooleanLexical(a.value)) fail("Invalid XML Schema boolean spelling", source);
      if (!a.name.namespace && ["minOccurs", "maxOccurs"].includes(a.name.local)) {
        const value = normalizeWhitespace(a.value, "collapse");
        if (!(a.name.local === "maxOccurs" && value === "unbounded") && !schemaNonNegativeIntegerLexical(value)) fail("Occurrence requires an exact nonnegative integer", source);
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
  c.step(node, allowed.length + common.length + 16);
  attrs(node.declaredAttributes, allowed, node.context.source);
  attrs(node.context.schemaAttributes, ["id", "attributeFormDefault", "elementFormDefault", "blockDefault", "finalDefault", "targetNamespace", "version"], node.context.source);
  for (const a of node.context.schemaAttributes) {
    c.step(node, 12); c.text(a.value, node);
    if (!a.name.namespace && ["attributeFormDefault", "elementFormDefault"].includes(a.name.local)
      && !["qualified", "unqualified"].includes(normalizeWhitespace(a.value, "collapse"))) fail("Invalid schema form default");
  }
  for (const a of node.declaredAttributes) {
    c.step(node, 30); c.text(a.value, node);
    if (!a.name.namespace && ["form", "processContents", "use", "whiteSpace"].includes(a.name.local)) {
      const domains: Record<string, string[]> = {form: ["qualified", "unqualified"], processContents: ["strict", "lax", "skip"], use: ["optional", "required", "prohibited"]};
      if (domains[a.name.local] && !domains[a.name.local].includes(normalizeWhitespace(a.value, "collapse"))) fail("Invalid XSD token spelling");
    }
  }
  // Graph construction retains roles and source positions rather than a
  // second syntax tree. Reconstruct direct-child ordering from those original
  // positions; do not infer it from composed/flattened properties.
  c.step(node);
  const children: {role: string; source: SyntaxSource}[] = [];
  const child = (role: string, source: SyntaxSource) => {
    c.step(node); c.text(source.path, node);
    c.text(node.context.source.path, node); c.text(source.uri, node); c.text(node.context.source.uri, node);
    const prefix = node.context.source.path + "/";
    if (source.uri === node.context.source.uri && source.path.startsWith(prefix) && !source.path.slice(prefix.length).includes("/")) {
      c.step(node, 4); children.push({role, source});
    }
  };
  for (const annotation of node.annotations) child("annotation", annotation.source);
  for (const syntax of node.syntaxDetails) child("content", syntax.source);
  if (node.kind === "complexType") {
    if (node.content) child("content", c.get(node.content).context.source);
    for (const id of node.attributes) {const n = c.get(id); child(n.kind === "attributeWildcard" ? "wildcard" : "attribute", n.context.source);}
  } else if (node.kind === "attributeGroup") {
    for (const id of node.attributes) {const n = c.get(id); child(n.kind === "attributeWildcard" ? "wildcard" : "attribute", n.context.source);}
  } else if (node.kind === "group") child("content", c.get(node.content).context.source);
  else if (node.kind === "particle" && "children" in node.term) for (const id of node.term.children) child("member", c.get(id).context.source);
  else if (node.kind === "particle") {const type = particleInlineType(c, node); if (type) child("content", type.context.source);}
  else if ((node.kind === "element" || node.kind === "attribute") && node.type.kind === "local") child("content", c.get(node.type.target).context.source);
  const ordered = c.budget.sorted(children, (a, b) => {c.step(node); return a.source.start.offset - b.source.start.offset;});
  let seenAnnotation = false, seenContent = false, stage = 0;
  for (const item of ordered) {
    c.step(node);
    if (item.role === "annotation") {if (stage || seenAnnotation) fail("Annotation must occur once before declaration content", item.source); seenAnnotation = true; continue;}
    const next = item.role === "content" || item.role === "member" ? 1 : item.role === "attribute" ? 2 : 3;
    if (item.role === "content") {if (seenContent) fail("Declaration permits at most one content child", item.source); seenContent = true;}
    if (next < stage || stage === 3) fail("Declaration child violates the XSD source ordering", item.source);
    stage = next;
  }
  c.step(node, node.declaredAttributes.length * 4);
  if (node.kind === "attributeUse" && node.declaredAttributes.some(a => !a.name.namespace && a.name.local === "default")
      && node.use !== "optional") c.fail(node, "src-attribute", "Attribute source default requires an optional use");
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
      c.step(node, 40);
      if (node.kind === "simpleType") checkBody(syntax, "scalar");
      else {
        attrs(syntax.attributes, ["id", ...(syntax.name.local === "complexContent" ? ["mixed"] : [])], syntax.source);
        const children = elements(syntax); let body: SyntaxElement | undefined, annotation = false;
        for (const child of children) {
          c.step(node);
          if (child.name.local === "annotation" && child.name.namespace === XSD_NAMESPACE && !body && !annotation) {annotation = true; continue;}
          if (body || child.name.namespace !== XSD_NAMESPACE || !["restriction", "extension"].includes(child.name.local)) fail("Content wrapper requires one restriction or extension after annotation", child.source);
          body = child;
        }
        if (!body) fail("Missing content derivation", syntax.source);
        checkBody(body!, syntax.name.local === "complexContent" ? "complex" : "simple");
      }
    }
  }
  function elements(syntax: SyntaxElement): SyntaxElement[] {
    c.step(node);
    const result: SyntaxElement[] = [];
    for (const child of syntax.children) {c.step(node, 2); if (child.kind === "element") result.push(child); else {c.text(child.value, node); if (/[^\t\r\n ]/.test(child.value)) fail("XSD declaration requires element-only syntax", child.source);}}
    return result;
  }
  function checkBody(body: SyntaxElement, context: "scalar" | "simple" | "complex") {
    c.step(node, 50);
    attrs(body.attributes, ["id", body.name.local === "list" ? "itemType" : body.name.local === "union" ? "memberTypes" : "base"], body.source);
    let stage = 0, annotation = false, scalarType = false, particle = false, wildcard = false;
    for (const child of elements(body)) {
      c.step(node, 40); const name = child.name.local;
      if (child.name.namespace !== XSD_NAMESPACE) fail("Foreign child belongs in annotation/appinfo", child.source);
      if (excluded.has(name)) c.unsupported(node, `xsd:${name}`, "Excluded schema feature is retained for capability diagnosis", child.source);
      if (name === "annotation") {if (stage || annotation) fail("Annotation must occur once before the content", child.source); annotation = true; continue;}
      if (name === "simpleType" && (context === "scalar" || context === "simple" && body.name.local === "restriction")
          && stage <= 1 && (body.name.local === "union" || !scalarType)) {scalarType = true; stage = 1; continue;}
      if (facetNames.has(name) && body.name.local === "restriction" && context !== "complex" && stage <= 2) {
        stage = 2; attrs(child.attributes, ["id", "value", ...(["enumeration", "pattern"].includes(name) ? [] : ["fixed"])], child.source, true);
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

export type ActualSyntaxResult = Readonly<{
  kind: 'checked'; contextId: string; component: NodeId; authority: 'XSD10-original-component-syntax-v1';
  scope: 'original-component-source-syntax';
  remaining: readonly ['schema-document-syntax', 'child-component-syntax', 'semantic-construction'];
}> | Readonly<{
  kind: 'invalid-schema' | 'unsupported-capability' | 'unresolved';
  rule: string; component: NodeId; message: string; source?: SyntaxSource;
}> | ResourceLimitFailure;

/**
 * Checks the source slice retained by the canonical node. This is not a complete
 * schema-for-schemas validator, and has no hypothetical-construction authority.
 */
export function checkActualSchemaSyntax(context: SemanticContext, nodeId: NodeId): ActualSyntaxResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const b = context.budget;
    b.chargeWork(200 + nodeId.length);
    const publish = (result: Exclude<ActualSyntaxResult, ResourceLimitFailure>): ActualSyntaxResult => b.freeze(b.snapshot(result));
    if (context.kind !== 'actual') return publish({kind: 'unresolved', rule: 'actual-source-only',
      component: nodeId, message: 'Hypothetical components do not acquire XML source representation obligations'});
    const found = context.lookup(nodeId);
    if (found.kind !== 'found') return publish({kind: 'unresolved', rule: 'src-resolve',
      component: nodeId, message: `Original component is ${found.kind}`});
    const node = found.node;
    if (node.kind === 'wsdl') return publish({kind: 'unresolved', rule: 'xsd-source-only',
      component: node.id, source: node.context.source, message: 'WSDL representation is outside the XSD source owner'});
    const c = schemaScalarContext(context);
    c.setCurrent(node);
    try {
      checkSchemaSyntax(c, node);
      declarationMethods(context, node, 'final');
      declarationMethods(context, node, 'block');
      const inline = node.retained.length ? particleInlineType(c, node) : undefined;
      let inlineSeen = false;
      for (const retained of node.retained) {
        c.step(node); c.text(retained.name.local, node);
        if (!inlineSeen && inline && retained.name.namespace === XSD_NAMESPACE && retained.name.local === inline.kind
          && sameSource(c, node, retained.source, inline.context.source)) {inlineSeen = true; continue;}
        if (retained.name.namespace === XSD_NAMESPACE && excluded.has(retained.name.local))
          c.unsupported(node, `xsd:${retained.name.local}`, 'Retained feature needs its separate capability authority', retained.source);
        c.fail(node, 'schema-for-schemas', 'Unexpected child in the declaration content grammar', retained.source);
      }
      if (node.kind === 'group') {
        const content = c.get(node.content);
        c.step(node, content.declaredAttributes.length);
        if (content.kind !== 'particle' || content.declaredAttributes.some(a => !a.name.namespace && ['minOccurs', 'maxOccurs'].includes(a.name.local)))
          c.fail(node, 'src-group', 'Named group compositors cannot declare occurrence attributes');
      }
      return publish({kind: 'checked', contextId: context.contextId, component: node.id,
        authority: 'XSD10-original-component-syntax-v1', scope: 'original-component-source-syntax',
        remaining: ['schema-document-syntax', 'child-component-syntax', 'semantic-construction']});
    } catch (error: unknown) {
      if (error instanceof RelationProblem) return publish({kind: error.result.kind === 'invalid-input' ? 'invalid-schema' : 'unresolved',
        rule: error.result.rule, component: node.id, message: error.result.message, source: node.context.source});
      if (!(error instanceof SchemaAssessmentError)) throw error;
      return publish({kind: error.category === 'missing-prerequisite' || error.category === 'scalar-indeterminate'
        ? 'unresolved' : error.category, rule: error.rule, component: node.id, message: error.message, source: error.source});
    }
  });
}
