/** Select WSDL operation contracts before walking schema capability closures. */
import type {GraphNode, NodeId, Reference, WsdlNode} from "./canonicalGraph.js";
import type {AssessmentContext} from "./schemaAssessmentContext.js";
import {resolveLexicalQName, syntaxAttribute, WSDL_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxElement} from "../loader/orderedSyntax.js";

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
    const name = resolveLexicalQName(value, syntax);
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
  const transport = syntaxAttribute(soapBinding, "transport");
  if (transport !== HTTP) c.unsupported(owner, "binding-transport", "SOAP binding transport is outside the evidenced HTTP contract", soapBinding.source);
  const soapOperation = children(bindingOperation, namespace, "operation")[0];
  const style = soapOperation && syntaxAttribute(soapOperation, "style") || syntaxAttribute(soapBinding, "style") || "document";
  if (style !== "document") c.unsupported(owner, "binding-style", "RPC/encoded binding requires a separately approved codec contract", soapOperation?.source ?? soapBinding.source);
  const capabilities = new Set<string>([version, "document-literal", "selected-binding-action", "declared-faults"]);
  const messageParts = (syntax: SyntaxElement, specified?: readonly string[]) => {
    const value = syntaxAttribute(syntax, "message");
    if (value === undefined) c.fail(owner, "wsdl-message", "Operation direction is missing its message", syntax.source);
    const message = c.get(c.target(lexicalReference(value!, "message", syntax), owner)!);
    if (message.kind !== "wsdl" || message.role !== "message") c.fail(owner, "wsdl-message", "Direction requires a message", syntax.source);
    const found = new Set<string>();
    for (const part of children((message as WsdlNode).syntax, WSDL_NAMESPACE, "part")) {
      const name = syntaxAttribute(part, "name");
      if (!name || found.has(name)) c.fail(message, "wsdl-part", "Message part names must be present and unique", part.source);
      found.add(name!);
      if (specified && !specified.includes(name!)) continue;
      const element = syntaxAttribute(part, "element"), type = syntaxAttribute(part, "type");
      if ((element === undefined) === (type === undefined)) c.fail(message, "wsdl-part", "Part requires exactly one element or type", part.source);
      const partValue = element ?? type!;
      c.text(partValue, message);
      const reference: Reference = {kind: "symbol", role: element === undefined ? "type" : "element", name: resolveLexicalQName(partValue, part), lexical: {value: partValue, context: {...message.context, namespaces: part.namespaces, source: part.source}}};
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
  const extensionTree = [bindingOperation];
  while (extensionTree.length) {
    const syntax = extensionTree.pop()!; c.step(owner);
    for (const child of children(syntax)) {
      c.step(owner);
      if (child.name.namespace === "http://schemas.xmlsoap.org/wsdl/mime/") c.unsupported(owner, "attachments", "Attachments/MTOM are excluded", child.source);
      if (child.name.namespace !== WSDL_NAMESPACE && child.name.namespace !== namespace) {
        const required = syntaxAttribute(child, "required", WSDL_NAMESPACE);
        if (required === "true" || required === "1") c.unsupported(owner, "required-binding-extension", "Required binding extension has no assessed capability", child.source);
      }
      extensionTree.push(child);
    }
  }
  for (const direction of children(abstractOperation, WSDL_NAMESPACE)) {
    if (!["input", "output", "fault"].includes(direction.name.local)) continue;
    const corresponding = children(bindingOperation, WSDL_NAMESPACE, direction.name.local).find(n => direction.name.local !== "fault" || syntaxAttribute(n, "name") === syntaxAttribute(direction, "name"));
    const bodies = corresponding ? children(corresponding, namespace, direction.name.local === "fault" ? "fault" : "body") : [];
    if (direction.name.local !== "fault" && bodies.length !== 1) c.fail(owner, "soap-body", "Each bound direction requires one SOAP body", corresponding?.source ?? bindingOperation.source);
    const body = bodies[0];
    if (body && syntaxAttribute(body, "use") !== "literal") c.unsupported(owner, "binding-use", "Encoded SOAP bodies are excluded", body.source);
    const rawParts = body && syntaxAttribute(body, "parts");
    if (rawParts !== undefined) c.text(rawParts, owner);
    messageParts(direction, rawParts === undefined ? undefined : rawParts.trim() ? rawParts.trim().split(/\s+/) : []);
    if (corresponding) for (const header of children(corresponding, namespace, "header")) {
      if (syntaxAttribute(header, "use") !== "literal") c.unsupported(owner, "binding-header-use", "Encoded SOAP headers are excluded", header.source);
      const part = syntaxAttribute(header, "part"); if (!part) c.fail(owner, "soap-header", "Header requires a selected message part", header.source);
      messageParts(header, [part!]); capabilities.add("soap-headers");
      for (const fault of children(header, namespace, "headerfault")) {
        if (syntaxAttribute(fault, "use") !== "literal") c.unsupported(owner, "binding-header-use", "Encoded header faults are excluded", fault.source);
        const faultPart = syntaxAttribute(fault, "part"); if (!faultPart) c.fail(owner, "soap-header", "Header fault requires a selected part", fault.source);
        messageParts(fault, [faultPart!]);
      }
    }
  }
  let endpoint: string | undefined;
  if (selection.port) {
    const service = c.get(selection.port.service);
    if (service.kind !== "wsdl" || service.role !== "service") c.fail(service, "wsdl-port", "Port selection requires a service");
    const ports = children((service as WsdlNode).syntax, WSDL_NAMESPACE, "port").filter(p => syntaxAttribute(p, "name") === selection.port!.name);
    if (ports.length !== 1) c.fail(service, "wsdl-port", "Select one declared service port");
    const port = ports[0], bindingName = syntaxAttribute(port, "binding");
    if (!bindingName || c.target(lexicalReference(bindingName, "binding", port), service) !== owner.id) c.fail(service, "wsdl-port", "Selected port does not use the selected binding", port.source);
    const address = children(port, namespace, "address");
    if (address.length !== 1 || !syntaxAttribute(address[0], "location")) c.fail(service, "soap-address", "Selected SOAP port requires an endpoint", port.source);
    endpoint = syntaxAttribute(address[0], "location"); c.text(endpoint!, service);
  }
  for (const id of selection.additionalRoots ?? []) add(id, owner);
  c.step(owner, capabilities.size);
  return {roots, binding: {binding: owner.id, operation: selection.operation, version, style: "document", use: "literal", transport: HTTP,
    action: soapOperation && syntaxAttribute(soapOperation, "soapAction"), endpoint,
    requiredCapabilities: [...capabilities], adapterOwners: ["#190", "#192"], dispatchQualification: "required-before-dispatch"}};
}
