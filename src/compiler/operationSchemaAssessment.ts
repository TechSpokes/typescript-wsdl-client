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
  transport: "http://schemas.xmlsoap.org/soap/http"; action?: string; actionRequired?: boolean; endpoint?: string;
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
  const token = (syntax: SyntaxElement, name: string) => {
    const raw = syntaxAttribute(syntax, name); if (raw === undefined) return undefined;
    c.text(raw, owner); const value = normalizeWhitespace(raw, "collapse");
    if (!isXmlNmtoken(value)) c.fail(owner, "wsdl-token", "Expected an XML NMTOKEN", syntax.source);
    return value;
  };
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
  const operations = (node: SyntaxElement, names = {inputName: selection.inputName, outputName: selection.outputName}, abstract = false) => {
    const result: SyntaxElement[] = [];
    for (const operation of children(node, WSDL_NAMESPACE, "operation")) {
      c.step(owner);
      if (token(operation, "name") !== selection.operation) continue;
      const input = children(operation, WSDL_NAMESPACE, "input")[0], output = children(operation, WSDL_NAMESPACE, "output")[0];
      const io = children(operation, WSDL_NAMESPACE).filter(n => ["input", "output"].includes(n.name.local));
      const effectiveName = (direction: SyntaxElement | undefined) => direction && (token(direction, "name") ?? (abstract ? selection.operation +
        (io.length === 1 ? "" : direction.name.local === "input" ? (io[0].name.local === "input" ? "Request" : "Response") : (io[0].name.local === "input" ? "Response" : "Solicit")) : undefined));
      if (names.inputName !== undefined && effectiveName(input) !== names.inputName) continue;
      if (names.outputName !== undefined && effectiveName(output) !== names.outputName) continue;
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
  const bindingOperation = operations(binding.syntax);
  const namedDirection = (local: string) => {const node = children(bindingOperation, WSDL_NAMESPACE, local)[0]; return node && token(node, "name");};
  const abstractOperation = operations((portType as WsdlNode).syntax, {
    inputName: selection.inputName ?? namedDirection("input"),
    outputName: selection.outputName ?? namedDirection("output"),
  }, true);
  const directions = (operation: SyntaxElement) => children(operation, WSDL_NAMESPACE).filter(n => n.name.local !== "documentation");
  const abstractDirections = directions(abstractOperation), boundDirections = directions(bindingOperation);
  c.step(owner, 12 * (abstractDirections.length + boundDirections.length));
  const abstractShape = abstractDirections.map(n => n.name.local);
  const abstractIo = abstractShape.filter(n => n !== "fault");
  if (abstractShape.some(n => !["input", "output", "fault"].includes(n)) ||
      !["input", "output", "input,output", "output,input"].includes(abstractIo.join(",")) ||
      (abstractIo.length === 1 && abstractShape.includes("fault")) ||
      abstractShape.slice(0, abstractIo.length).join(",") !== abstractIo.join(",")) c.fail(owner, "wsdl-operation-shape", "Invalid abstract operation message-exchange shape", abstractOperation.source);
  const faultNames = new Set<string>();
  for (const fault of abstractDirections.filter(n => n.name.local === "fault")) {
    const name = token(fault, "name");
    if (!name || faultNames.has(name)) c.fail(owner, "wsdl-operation-shape", "Abstract fault names must be present and unique", fault.source);
    c.text(name!, owner); faultNames.add(name!);
  }
  const boundIo = boundDirections.filter(n => n.name.local !== "fault");
  const boundShape = boundIo.map(n => n.name.local);
  if (boundDirections.some(n => !["input", "output", "fault"].includes(n.name.local)) ||
      !["", "input", "output", "input,output"].includes(boundShape.join(",")) ||
      boundShape.some(n => !abstractIo.includes(n)) ||
      boundDirections.slice(0, boundIo.length).map(n => n.name.local).join(",") !== boundShape.join(",")) c.fail(owner, "wsdl-operation-shape", "Bound directions must identify the abstract operation without duplicates or surplus directions", bindingOperation.source);
  const boundFaults = new Set<string>();
  for (const fault of boundDirections.filter(n => n.name.local === "fault")) {
    const name = token(fault, "name");
    if (!name || boundFaults.has(name) || !faultNames.has(name)) c.fail(owner, "wsdl-operation-shape", "Bound faults must match unique declared abstract faults", fault.source);
    c.text(name!, owner); boundFaults.add(name!);
  }
  if (boundIo.length !== abstractIo.length || boundFaults.size !== faultNames.size) c.unsupported(owner, "binding-incomplete", "Missing direction/fault binding has no complete selected-operation capability evidence", bindingOperation.source);
  if (abstractIo[0] === "output") c.unsupported(owner, "binding-message-exchange", "Notification and solicit-response require an independently qualified binding", abstractOperation.source);
  for (let index = 0; index < boundIo.length; index++) {
    const boundName = token(boundIo[index], "name"), abstractName = token(abstractDirections[index], "name") ??
      (abstractIo.length === 1 ? selection.operation : selection.operation + (index === 0 ? "Request" : "Response"));
    if (boundName !== undefined) {c.text(boundName, owner); if (boundName !== abstractName) c.fail(owner, "wsdl-operation-shape", "Bound direction name does not identify its abstract direction", boundIo[index].source);}
  }
  const soapBindings = children(binding.syntax).filter(n => [SOAP11, SOAP12].includes(n.name.namespace) && n.name.local === "binding");
  const HTTP_BINDING = "http://schemas.xmlsoap.org/wsdl/http/";
  const protocols = children(binding.syntax).filter(n => [SOAP11, SOAP12, HTTP_BINDING].includes(n.name.namespace) && n.name.local === "binding");
  if (protocols.length > 1) c.fail(owner, "binding-protocol", "A selected binding permits exactly one protocol", binding.syntax.source);
  if (soapBindings.length !== 1) c.unsupported(owner, "binding-kind", "Faithful schema assessment requires one explicit SOAP binding");
  const soapBinding = soapBindings[0], namespace = soapBinding.name.namespace, version = namespace === SOAP11 ? "soap11" : "soap12";
  const first = (parent: SyntaxElement, child: SyntaxElement) => {
    if (version === "soap12" && children(parent)[0] !== child) c.fail(owner, "soap-extension-order", "SOAP 1.2 requires this extension as the first child element", child.source);
  };
  const absoluteUri = (value: string, syntax: SyntaxElement, rule: string) => {
    if (!schemaUri(value, owner, c) || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value)) c.fail(owner, rule, "SOAP 1.2 requires an absolute anyURI value", syntax.source);
  };
  first(binding.syntax, soapBinding);
  const rawTransport = syntaxAttribute(soapBinding, "transport");
  if (rawTransport === undefined) c.fail(owner, "binding-transport", "SOAP binding requires its transport", soapBinding.source);
  c.text(rawTransport!, owner);
  const transport = normalizeWhitespace(rawTransport!, "collapse");
  if (!schemaUri(transport, owner, c)) c.fail(owner, "binding-transport", "SOAP transport is not an anyURI value", soapBinding.source);
  if (transport !== HTTP) c.unsupported(owner, "binding-transport", "SOAP binding transport is outside the evidenced HTTP contract", soapBinding.source);
  const soapOperations = children(bindingOperation, namespace, "operation");
  if (soapOperations.length > 1) c.fail(owner, "soap-operation", "An operation permits one SOAP operation extension", bindingOperation.source);
  const soapOperation = soapOperations[0];
  if (version === "soap12" && !soapOperation) c.fail(owner, "soap-operation", "SOAP 1.2 HTTP requires one operation extension", bindingOperation.source);
  if (soapOperation) first(bindingOperation, soapOperation);
  if (version === "soap11" && (!soapOperation || syntaxAttribute(soapOperation, "soapAction") === undefined)) c.fail(owner, "soap-action", "SOAP 1.1 HTTP requires an explicit soapAction (which may be empty)", bindingOperation.source);
  let actionRequired: boolean | undefined;
  if (version === "soap12") {
    const raw = syntaxAttribute(soapOperation!, "soapActionRequired");
    if (raw !== undefined) c.text(raw, owner);
    const value = raw === undefined ? "true" : normalizeWhitespace(raw, "collapse");
    if (!["true", "false", "1", "0"].includes(value)) c.fail(owner, "soap-action-required", "Invalid SOAP 1.2 action-required boolean", soapOperation!.source);
    actionRequired = value === "true" || value === "1";
    if (actionRequired && syntaxAttribute(soapOperation!, "soapAction") === undefined) c.fail(owner, "soap-action", "SOAP 1.2 requires soapAction when actionRequired is true", soapOperation!.source);
  }
  const operationStyle = soapOperation && syntaxAttribute(soapOperation, "style"), bindingStyle = syntaxAttribute(soapBinding, "style");
  for (const value of [operationStyle, bindingStyle]) if (value !== undefined && !["document", "rpc"].includes(value)) c.fail(owner, "binding-style", "Invalid SOAP string style enumeration", soapOperation?.source ?? soapBinding.source);
  const style = operationStyle ?? bindingStyle ?? "document";
  if (style !== "document") c.unsupported(owner, "binding-style", "RPC/encoded binding requires a separately approved codec contract", soapOperation?.source ?? soapBinding.source);
  const capabilities = new Set<string>([version, "document-literal", "selected-binding-action", "declared-faults"]);
  const literal = (syntax: SyntaxElement) => {
    const use = syntaxAttribute(syntax, "use");
    if (version === "soap12") {
      // The primary predicate uses the declared binding style, not the
      // effective operation override. Legal encoded bodies remain excluded.
      const encoding = syntaxAttribute(syntax, "encodingStyle");
      if (encoding !== undefined) {
        if (!(bindingStyle === "rpc" && syntax.name.local === "body" && use === "encoded")) c.fail(owner, "soap-encoding-style", "SOAP 1.2 encodingStyle requires declared RPC binding and encoded body", syntax.source);
        c.text(encoding, owner); absoluteUri(normalizeWhitespace(encoding, "collapse"), syntax, "soap-encoding-style");
      }
      const rawNamespace = syntaxAttribute(syntax, "namespace");
      if (rawNamespace === undefined && bindingStyle === "rpc" && ["body", "fault", "headerfault"].includes(syntax.name.local)) c.fail(owner, "soap-namespace", "Declared SOAP 1.2 RPC binding requires this namespace operand", syntax.source);
      if (rawNamespace !== undefined) {c.text(rawNamespace, owner); absoluteUri(normalizeWhitespace(rawNamespace, "collapse"), syntax, "soap-namespace");}
      if (use === undefined && ["body", "fault"].includes(syntax.name.local)) c.unsupported(owner, "binding-use-unspecified", "SOAP 1.2 permits absent body/fault use, but this binding has no explicit literal capability evidence", syntax.source);
    }
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
  const soapPositions: Readonly<Record<string, readonly [string, string]>> = {
    binding: [WSDL_NAMESPACE, "binding"], operation: [WSDL_NAMESPACE, "operation"],
    body: [WSDL_NAMESPACE, "input|output"], fault: [WSDL_NAMESPACE, "fault"],
    header: [WSDL_NAMESPACE, "input|output"], headerfault: [namespace, "header"], address: [WSDL_NAMESPACE, "port"],
  };
  const assessExtensions = (extensionTree: {syntax: SyntaxElement; parent: SyntaxElement}[]) => {while (extensionTree.length) {
      const {syntax: child, parent} = extensionTree.pop()!;
      c.step(owner);
      if (child.name.namespace === "http://schemas.xmlsoap.org/wsdl/mime/") c.unsupported(owner, "attachments", "Attachments/MTOM are excluded", child.source);
      const position = child.name.namespace === namespace && Object.hasOwn(soapPositions, child.name.local) ? soapPositions[child.name.local] : undefined;
      if (position && (parent.name.namespace !== position[0] || !position[1].split("|").includes(parent.name.local))) c.fail(owner, "soap-extension-position", "SOAP extension is not permitted in this WSDL position", child.source);
      if (child.name.namespace !== WSDL_NAMESPACE) {
        const rawRequired = syntaxAttribute(child, "required", WSDL_NAMESPACE);
        if (rawRequired !== undefined) c.text(rawRequired, owner);
        const required = rawRequired === undefined ? undefined : normalizeWhitespace(rawRequired, "collapse");
        if (required !== undefined && !["true", "false", "1", "0"].includes(required)) c.fail(owner, "wsdl-required", "Invalid required-extension boolean", child.source);
        if (!position && (required === "true" || required === "1")) c.unsupported(owner, "required-binding-extension", "Required binding extension has no assessed capability", child.source);
      }
      for (const nested of children(child)) extensionTree.push({syntax: nested, parent: child});
  }};
  // Binding-wide extension semantics apply to every selected operation;
  // other operation subtrees remain outside this operation's assessment.
  const extensions = children(binding.syntax).filter(child => child.name.namespace !== WSDL_NAMESPACE).map(syntax => ({syntax, parent: binding.syntax}));
  extensions.push({syntax: bindingOperation, parent: binding.syntax}); assessExtensions(extensions);
  for (const direction of abstractDirections) {
    if (!["input", "output", "fault"].includes(direction.name.local)) continue;
    const corresponding = children(bindingOperation, WSDL_NAMESPACE, direction.name.local).find(n => direction.name.local !== "fault" || token(n, "name") === token(direction, "name"));
    const bodies = corresponding ? children(corresponding, namespace, direction.name.local === "fault" ? "fault" : "body") : [];
    if (bodies.length !== 1) c.fail(owner, "soap-body", "Each bound direction/fault requires one SOAP body/fault", corresponding?.source ?? bindingOperation.source);
    const body = bodies[0];
    first(corresponding!, body);
    if (direction.name.local === "fault" && token(body, "name") !== token(direction, "name")) c.fail(owner, "soap-fault", "SOAP fault name must match its declared WSDL fault", body.source);
    literal(body);
    const rawParts = body && syntaxAttribute(body, "parts");
    if (rawParts !== undefined) c.text(rawParts, owner);
    const parts = rawParts === undefined ? undefined : normalizeWhitespace(rawParts, "collapse");
    if (parts !== undefined && ((!parts && version === "soap11") || (parts && parts.split(" ").some(part => !isXmlNmtoken(part))))) c.fail(owner, "soap-parts", "Invalid SOAP part-name list (SOAP 1.1 requires at least one token)", body.source);
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
    const addresses = children(port).filter(n => [SOAP11, SOAP12, HTTP_BINDING].includes(n.name.namespace) && n.name.local === "address");
    if (addresses.length > 1) c.fail(service, "soap-address", "A port permits at most one address", port.source);
    assessExtensions(children(port).filter(child => child.name.namespace !== WSDL_NAMESPACE).map(syntax => ({syntax, parent: port})));
    if (!bindingName || c.target(lexicalReference(bindingName, "binding", port), service) !== owner.id) c.fail(service, "wsdl-port", "Selected port does not use the selected binding", port.source);
    const address = children(port, namespace, "address");
    if (address.length !== 1 || !syntaxAttribute(address[0], "location")) c.fail(service, "soap-address", "Selected SOAP port requires an endpoint", port.source);
    first(port, address[0]);
    const rawEndpoint = syntaxAttribute(address[0], "location")!; c.text(rawEndpoint, service);
    endpoint = normalizeWhitespace(rawEndpoint, "collapse");
    if (!schemaUri(endpoint, service, c)) c.fail(service, "soap-address", "SOAP endpoint is not an anyURI value", address[0].source);
    if (version === "soap12") {
      absoluteUri(endpoint, address[0], "soap-address");
    }
    if (!/^https?:/i.test(endpoint)) c.fail(service, "soap-address-transport", "SOAP HTTP endpoint requires HTTP or HTTPS transport", address[0].source);
  }
  for (const id of selection.additionalRoots ?? []) add(id, owner);
  c.step(owner, capabilities.size);
  const rawAction = soapOperation && syntaxAttribute(soapOperation, "soapAction");
  if (rawAction !== undefined) c.text(rawAction, owner);
  const action = rawAction === undefined ? undefined : normalizeWhitespace(rawAction, "collapse");
  if (action !== undefined && !schemaUri(action, owner, c)) c.fail(owner, "soap-action", "SOAP action is not an anyURI value", soapOperation!.source);
  if (version === "soap12" && action !== undefined) absoluteUri(action, soapOperation!, "soap-action");
  return {roots, binding: {binding: owner.id, operation: selection.operation, version, style: "document", use: "literal", transport: HTTP,
    action, actionRequired, endpoint,
    requiredCapabilities: [...capabilities], adapterOwners: ["#190", "#192"], dispatchQualification: "required-before-dispatch"}};
}
