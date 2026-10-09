/** Select WSDL operation contracts before walking schema capability closures. */
import type {GraphNode, NodeId, Reference, WsdlNode} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {resolveLexicalQName, SchemaLoadingError, syntaxAttribute, WSDL_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxElement} from "../loader/orderedSyntax.js";
import {normalizeWhitespace} from "./schemaDatatypeValues.js";
import {schemaUri} from "./schemaUri.js";
import {isXmlNmtoken} from "../loader/orderedSyntax.js";

export type AssessmentSelection = Readonly<
  {kind: "components"; id: string; roots: readonly NodeId[]} |
  {kind: "operation"; id: string; binding: NodeId; operation: string; inputName?: string; outputName?: string;
    port?: Readonly<{service: NodeId; name: string}>; additionalRoots?: readonly NodeId[]}
>;
export type BindingSupportPlan = Readonly<{
  binding: NodeId; operation: string; version: "soap11" | "soap12"; style: "document"; use: "literal";
  transport: "http://schemas.xmlsoap.org/soap/http"; action?: string; endpoint?: string;
  requiredCapabilities: readonly string[];
  adapterOwners: readonly ["#190", "#192"]; dispatchQualification: "required-before-dispatch";
}>;
const SOAP11 = "http://schemas.xmlsoap.org/wsdl/soap/", SOAP12 = "http://schemas.xmlsoap.org/wsdl/soap12/";
const HTTP = "http://schemas.xmlsoap.org/soap/http";
export function selectedOperationRoots(c: AssessmentContext, selection: AssessmentSelection): {roots: NodeId[]; binding?: BindingSupportPlan} {
  const roots: NodeId[] = [];
  const add = (id: NodeId, owner: GraphNode) => {c.step(owner); c.get(id); roots.push(id);};
  if (selection.kind === "components") {
    for (const id of selection.roots) add(id, c.get(id));
    return {roots};
  }
  const owner = c.get(selection.binding); c.setCurrent(owner);
  if (owner.kind !== "wsdl" || owner.role !== "binding") c.fail(owner, "wsdl-binding", "Operation selection requires a WSDL binding");
  const binding = owner as WsdlNode;
  const qname = (value: string, syntax: SyntaxElement) => {
    c.text(value, owner);
    try {return resolveLexicalQName(value, syntax);}
    catch (error) {
      if (error instanceof SchemaLoadingError && error.category === "invalid-schema") return c.fail(owner, "wsdl-qname", error.message, error.source);
      throw error;
    }
  };
  const children = (node: SyntaxElement, namespace?: string, local?: string): SyntaxElement[] => {
    const result: SyntaxElement[] = [];
    for (const child of node.children) {
      c.step(owner);
      if (child.kind === "element" && (namespace === undefined || child.name.namespace === namespace) && (local === undefined || child.name.local === local)) result.push(child);
    }
    return result;
  };
  const operations = (node: SyntaxElement) => {
    const result: SyntaxElement[] = [];
    for (const operation of children(node, WSDL_NAMESPACE, "operation")) {
      c.step(owner);
      if (syntaxAttribute(operation, "name") !== selection.operation) continue;
      const input = children(operation, WSDL_NAMESPACE, "input")[0], output = children(operation, WSDL_NAMESPACE, "output")[0];
      if (selection.inputName !== undefined && (!input || syntaxAttribute(input, "name") !== selection.inputName)) continue;
      if (selection.outputName !== undefined && (!output || syntaxAttribute(output, "name") !== selection.outputName)) continue;
      result.push(operation);
    }
    if (result.length !== 1) c.fail(owner, "wsdl-operation-selection", "Select one declared operation and disambiguate overloaded input/output names");
    return result[0];
  };
  const lexicalReference = (value: string, role: "message" | "binding" | "portType", syntax: SyntaxElement): Reference => {
    c.text(value, owner);
    const name = qname(value, syntax);
    return {kind: "symbol", role, name, lexical: {value, context: {...owner.context, namespaces: syntax.namespaces, baseUri: syntax.baseUri, source: syntax.source}}};
  };
  const portTypeName = syntaxAttribute(binding.syntax, "type");
  if (portTypeName === undefined) c.fail(owner, "wsdl-binding", "Binding is missing its portType reference");
  const portType = c.get(c.target(lexicalReference(portTypeName!, "portType", binding.syntax), owner)!);
  if (portType.kind !== "wsdl" || portType.role !== "portType") c.fail(owner, "wsdl-binding", "Binding requires a portType");
  const bindingOperation = operations(binding.syntax), abstractOperation = operations((portType as WsdlNode).syntax);
  const soapBindings = children(binding.syntax).filter(n => [SOAP11, SOAP12].includes(n.name.namespace) && n.name.local === "binding");
  if (soapBindings.length !== 1) c.unsupported(owner, "binding-kind", "Faithful schema assessment requires one explicit SOAP binding");
  const soapBinding = soapBindings[0], namespace = soapBinding.name.namespace, version = namespace === SOAP11 ? "soap11" : "soap12";
  const rawTransport = syntaxAttribute(soapBinding, "transport");
  if (rawTransport === undefined) c.fail(owner, "binding-transport", "SOAP binding requires its transport", soapBinding.source);
  c.text(rawTransport!, owner);
  const transport = normalizeWhitespace(rawTransport!, "collapse");
  if (!schemaUri(transport, owner, c)) c.fail(owner, "binding-transport", "SOAP transport is not an anyURI value", soapBinding.source);
  if (transport !== HTTP) c.unsupported(owner, "binding-transport", "SOAP binding transport is outside the evidenced HTTP contract", soapBinding.source);
  const soapOperations = children(bindingOperation, namespace, "operation");
  if (soapOperations.length > 1) c.fail(owner, "soap-operation", "An operation permits one SOAP operation extension", bindingOperation.source);
  const soapOperation = soapOperations[0];
  if (version === "soap11" && (!soapOperation || syntaxAttribute(soapOperation, "soapAction") === undefined)) c.fail(owner, "soap-action", "SOAP 1.1 HTTP requires an explicit soapAction (which may be empty)", bindingOperation.source);
  const operationStyle = soapOperation && syntaxAttribute(soapOperation, "style"), bindingStyle = syntaxAttribute(soapBinding, "style");
  for (const value of [operationStyle, bindingStyle]) if (value !== undefined && !["document", "rpc"].includes(value)) c.fail(owner, "binding-style", "Invalid SOAP string style enumeration", soapOperation?.source ?? soapBinding.source);
  const style = operationStyle ?? bindingStyle ?? "document";
  if (style !== "document") c.unsupported(owner, "binding-style", "RPC/encoded binding requires a separately approved codec contract", soapOperation?.source ?? soapBinding.source);
  const capabilities = new Set<string>([version, "document-literal", "selected-binding-action", "declared-faults"]);
  const token = (syntax: SyntaxElement, name: string) => {
    const raw = syntaxAttribute(syntax, name); if (raw === undefined) return undefined;
    c.text(raw, owner); const value = normalizeWhitespace(raw, "collapse");
    if (!isXmlNmtoken(value)) c.fail(owner, "wsdl-token", "Expected an XML NMTOKEN", syntax.source);
    return value;
  };
  const literal = (syntax: SyntaxElement) => {
    const use = syntaxAttribute(syntax, "use");
    if (use === undefined || !["literal", "encoded"].includes(use)) c.fail(owner, "binding-use", "Invalid SOAP string use enumeration", syntax.source);
    if (use !== "literal") c.unsupported(owner, "binding-use", "Encoded SOAP content is excluded", syntax.source);
  };
  const messageParts = (syntax: SyntaxElement, specified?: readonly string[], fault = false) => {
    const value = syntaxAttribute(syntax, "message");
    if (value === undefined) c.fail(owner, "wsdl-message", "Operation direction is missing its message", syntax.source);
    const message = c.get(c.target(lexicalReference(value!, "message", syntax), owner)!);
    if (message.kind !== "wsdl" || message.role !== "message") c.fail(owner, "wsdl-message", "Direction requires a message", syntax.source);
    const found = new Set<string>(), parts = children((message as WsdlNode).syntax, WSDL_NAMESPACE, "part");
    if (fault && parts.length !== 1) c.fail(message, "soap-fault-part", "A SOAP fault message requires exactly one part", syntax.source);
    for (const part of parts) {
      const name = token(part, "name");
      if (!name || found.has(name)) c.fail(message, "wsdl-part", "Message part names must be present and unique", part.source);
      found.add(name!);
      if (specified && !specified.includes(name!)) continue;
      const element = syntaxAttribute(part, "element"), type = syntaxAttribute(part, "type");
      if ((element === undefined) === (type === undefined)) c.fail(message, "wsdl-part", "Part requires exactly one element or type", part.source);
      const partValue = element ?? type!;
      c.text(partValue, message);
      const reference: Reference = {kind: "symbol", role: element === undefined ? "type" : "element", name: qname(partValue, part), lexical: {value: partValue, context: {...message.context, namespaces: part.namespaces, source: part.source}}};
      if (reference.role === "type" && reference.name.namespace === "http://www.w3.org/2001/XMLSchema") {
        // SOAP document/literal type parts require wrapper/name conventions
        // absent from this profile's element-root binding contract.
        c.unsupported(message, "document-type-part", "Document/literal body parts require declared element roots", part.source);
      }
      if (reference.role !== "element") c.unsupported(message, "document-type-part", "Document/literal body parts require declared element roots", part.source);
      add(c.target(reference, message)!, message);
    }
    if (specified) for (const name of specified) {c.step(owner); if (!found.has(name)) c.fail(message, "wsdl-part", "Selected body/header part is not declared", syntax.source);}
  };
  const assessExtensions = (extensionTree: SyntaxElement[]) => {while (extensionTree.length) {
      const child = extensionTree.pop()!;
      c.step(owner);
      if (child.name.namespace === "http://schemas.xmlsoap.org/wsdl/mime/") c.unsupported(owner, "attachments", "Attachments/MTOM are excluded", child.source);
      if (child.name.namespace !== WSDL_NAMESPACE && child.name.namespace !== namespace) {
        const rawRequired = syntaxAttribute(child, "required", WSDL_NAMESPACE), required = rawRequired === undefined ? undefined : normalizeWhitespace(rawRequired, "collapse");
        if (required !== undefined && !["true", "false", "1", "0"].includes(required)) c.fail(owner, "wsdl-required", "Invalid required-extension boolean", child.source);
        if (required === "true" || required === "1") c.unsupported(owner, "required-binding-extension", "Required binding extension has no assessed capability", child.source);
      }
      for (const nested of children(child)) extensionTree.push(nested);
  }};
  // Binding-wide extension semantics apply to every selected operation;
  // other operation subtrees remain outside this operation's assessment.
  assessExtensions([...children(binding.syntax).filter(child => child.name.namespace !== WSDL_NAMESPACE), bindingOperation]);
  for (const direction of children(abstractOperation, WSDL_NAMESPACE)) {
    if (!["input", "output", "fault"].includes(direction.name.local)) continue;
    const corresponding = children(bindingOperation, WSDL_NAMESPACE, direction.name.local).find(n => direction.name.local !== "fault" || token(n, "name") === token(direction, "name"));
    const bodies = corresponding ? children(corresponding, namespace, direction.name.local === "fault" ? "fault" : "body") : [];
    if (bodies.length !== 1) c.fail(owner, "soap-body", "Each bound direction/fault requires one SOAP body/fault", corresponding?.source ?? bindingOperation.source);
    const body = bodies[0];
    if (direction.name.local === "fault" && token(body, "name") !== token(direction, "name")) c.fail(owner, "soap-fault", "SOAP fault name must match its declared WSDL fault", body.source);
    literal(body);
    const rawParts = body && syntaxAttribute(body, "parts");
    if (rawParts !== undefined) c.text(rawParts, owner);
    const parts = rawParts === undefined ? undefined : normalizeWhitespace(rawParts, "collapse");
    if (parts !== undefined && (!parts || parts.split(" ").some(part => !isXmlNmtoken(part)))) c.fail(owner, "soap-parts", "SOAP parts requires a nonempty XML NMTOKENS value", body.source);
    messageParts(direction, parts === undefined ? undefined : parts ? parts.split(" ") : [], direction.name.local === "fault");
    if (corresponding) for (const header of children(corresponding, namespace, "header")) {
      literal(header);
      const part = token(header, "part"); if (!part) c.fail(owner, "soap-header", "Header requires a selected message part", header.source);
      messageParts(header, [part!]); capabilities.add("soap-headers");
      for (const fault of children(header, namespace, "headerfault")) {
        literal(fault);
        const faultPart = token(fault, "part"); if (!faultPart) c.fail(owner, "soap-header", "Header fault requires a selected part", fault.source);
        messageParts(fault, [faultPart!]);
      }
    }
  }
  let endpoint: string | undefined;
  if (selection.port) {
    const service = c.get(selection.port.service);
    if (service.kind !== "wsdl" || service.role !== "service") c.fail(service, "wsdl-port", "Port selection requires a service");
    const ports = children((service as WsdlNode).syntax, WSDL_NAMESPACE, "port").filter(p => token(p, "name") === selection.port!.name);
    if (ports.length !== 1) c.fail(service, "wsdl-port", "Select one declared service port");
    const port = ports[0], bindingName = syntaxAttribute(port, "binding");
    assessExtensions(children(port).filter(child => child.name.namespace !== WSDL_NAMESPACE));
    if (!bindingName || c.target(lexicalReference(bindingName, "binding", port), service) !== owner.id) c.fail(service, "wsdl-port", "Selected port does not use the selected binding", port.source);
    const address = children(port, namespace, "address");
    if (address.length !== 1 || !syntaxAttribute(address[0], "location")) c.fail(service, "soap-address", "Selected SOAP port requires an endpoint", port.source);
    const rawEndpoint = syntaxAttribute(address[0], "location")!; c.text(rawEndpoint, service);
    endpoint = normalizeWhitespace(rawEndpoint, "collapse");
    if (!schemaUri(endpoint, service, c)) c.fail(service, "soap-address", "SOAP endpoint is not an anyURI value", address[0].source);
  }
  for (const id of selection.additionalRoots ?? []) add(id, owner);
  c.step(owner, capabilities.size);
  const rawAction = soapOperation && syntaxAttribute(soapOperation, "soapAction");
  if (rawAction !== undefined) c.text(rawAction, owner);
  const action = rawAction === undefined ? undefined : normalizeWhitespace(rawAction, "collapse");
  if (action !== undefined && !schemaUri(action, owner, c)) c.fail(owner, "soap-action", "SOAP action is not an anyURI value", soapOperation!.source);
  return {roots, binding: {binding: owner.id, operation: selection.operation, version, style: "document", use: "literal", transport: HTTP,
    action, endpoint,
    requiredCapabilities: [...capabilities], adapterOwners: ["#190", "#192"], dispatchQualification: "required-before-dispatch"}};
}
