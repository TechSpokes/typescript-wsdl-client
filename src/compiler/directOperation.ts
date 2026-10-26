/** Transient source-owned schema selection. This module grants no runtime admission. */
import {loadSemanticSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput, SchemaInputOptions} from '../loader/schemaInput.js';
import {SchemaLoadingError, WSDL_NAMESPACE, XSD_NAMESPACE, syntaxAttribute, syntaxElements, isXmlNCName} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import {globalId} from './canonicalGraph.js';
import type {ElementNode, GraphNode, Reference, WsdlNode} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import {createSemanticBudget, DEFAULT_MAX_NODES} from './semanticBudget.js';
import type {SemanticBudgetLimits, ResolverUsage} from './semanticBudget.js';
import {qualifyDirectSource} from './checkedSourcePreparation.js';
import type {DirectSourceQualification} from './checkedSourcePreparation.js';

const SOAP = 'http://schemas.xmlsoap.org/wsdl/soap/';
const HTTP = 'http://schemas.xmlsoap.org/soap/http';
export interface DirectOperationSelector {
  readonly portType: ExpandedName;
  readonly binding: ExpandedName;
  readonly operation: string;
}
export interface DirectMessageRoot {
  readonly message: ExpandedName;
  readonly part: string;
  readonly element: ElementNode;
  readonly type: Reference;
  readonly source: SyntaxSource;
}
export interface DirectOperationContract {
  readonly selector: DirectOperationSelector;
  readonly contextId: string;
  readonly basis: 'native-direct-premises-v1';
  readonly correspondence: 'dated-XSD-2004-direct-v1';
  readonly binding: Readonly<{version: '1.1'; style: 'document'; use: 'literal'; transport: string; action: string; source: SyntaxSource}>;
  readonly input: DirectMessageRoot;
  readonly output: DirectMessageRoot;
  readonly faults: readonly Readonly<{name: string; root: DirectMessageRoot}>[];
  readonly missingCapabilities: readonly string[];
  readonly admitted: false;
}
export type DirectOperationResult = Readonly<{kind: 'selected'; contract: DirectOperationContract; usage: ResolverUsage}> |
  Readonly<{kind: 'invalid-schema' | 'inconclusive' | 'unsupported' | 'selection-refused' | 'loading-refused' | 'resource-limit' | 'cancelled'; rule: string; usage: ResolverUsage}>;
export interface DirectOperationInspection {
  readonly contract: DirectOperationContract;
  readonly context: SemanticContext;
  readonly source: SchemaInput;
  readonly evidence: Extract<DirectSourceQualification, {kind: 'qualified-source'}>;
}
const issued = new WeakMap<DirectOperationContract, DirectOperationInspection>();

/** Object identity authenticates the exact issued roots; context IDs and digests do not. */
export function inspectDirectOperation(contract: DirectOperationContract, expectedContext?: SemanticContext): DirectOperationInspection {
  const owned = issued.get(contract);
  if (!owned || expectedContext !== undefined && owned.context !== expectedContext) throw new TypeError('Unauthenticated or foreign direct operation');
  return owned;
}
class Refusal extends Error {
  constructor(readonly kind: Exclude<DirectOperationResult['kind'], 'selected'>, readonly rule: string) {super(rule);}
}
class Cancelled extends Error {}

/** One load, whole-source qualification, explicit selection and publication on one sticky budget. */
export async function selectDirectOperation(source: string, selector: DirectOperationSelector, options: Readonly<{
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
}>): Promise<DirectOperationResult> {
  const budget = createSemanticBudget(options.limits);
  const check = () => {if (options.signal?.aborted) throw new Cancelled(); budget.chargeWork();};
  const refuse = (kind: Refusal['kind'], rule: string): never => {throw new Refusal(kind, rule);};
  const failure = (kind: Refusal['kind'], rule: string): DirectOperationResult => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  try {
    // Fixed terminal envelope and issuance bookkeeping, before any source work.
    budget.chargeWork(4096); check();
    const ownedSelector = budget.freeze(budget.snapshot(selector));
    const name = (value: ExpandedName | undefined) => value && typeof value.namespace === 'string' && typeof value.local === 'string' && isXmlNCName(value.local);
    if (!name(ownedSelector.portType) || !name(ownedSelector.binding) || typeof ownedSelector.operation !== 'string' || !isXmlNCName(ownedSelector.operation)) return failure('selection-refused', 'explicit-selector');
    const input = await loadSemanticSchemaInput(source, {...options.loading, chargeWork: amount => {check(); budget.chargeWork(amount);}});
    check();
    const result = budget.guard(() => {
      const qualified = qualifyDirectSource(input, {budget, maxNodes: options.limits?.maxNodes ?? DEFAULT_MAX_NODES, check});
      if (qualified.kind === 'resource-limit') return failure('resource-limit', 'source-qualification');
      if (qualified.kind === 'source-preparation-failed' && qualified.category === 'resource-limit') return failure('resource-limit', 'source-preparation');
      if (qualified.kind !== 'qualified-source') return failure(qualified.kind === 'source-preparation-failed' && qualified.category === 'invalid-schema' ? 'invalid-schema' : 'inconclusive', 'source-preparation');
      if (!qualified.eligible) return failure(qualified.localDisproved || qualified.closure.kind === 'invalid-schema' ? 'invalid-schema' : 'inconclusive', 'whole-source-qualification');
      const {request} = qualified;
      const context = request.actual;
      const children = (node: SyntaxElement): SyntaxElement[] => {
        check(); budget.chargeWork(128 + node.children.length * 16 + node.attributes.length * 32);
        for (const a of node.attributes) budget.chargeWork(a.value.length * 8 + a.name.local.length * 8 + a.name.namespace.length * 8);
        for (const child of node.children) {
          if (child.kind === 'element') budget.chargeWork(16 + child.name.namespace.length * 8 + child.name.local.length * 8);
        }
        return syntaxElements(node);
      };
      const attr = syntaxAttribute;
      const exactly = (node: SyntaxElement, namespace: string, local: string): SyntaxElement => {
        const found = children(node).filter(c => c.name.namespace === namespace && c.name.local === local);
        if (found.length !== 1) return refuse('selection-refused', `expected-one-${local}`);
        return found[0]!;
      };
      const shape = (node: SyntaxElement, allowed: readonly string[]) => {
        for (const child of children(node)) if (!allowed.includes(`${child.name.namespace}#${child.name.local}`)) refuse('unsupported', 'binding-child-shape');
        for (const child of node.children) {
          if (child.kind !== 'text') continue;
          budget.chargeWork(8 + child.value.length * 4);
          if (/[^\t\r\n ]/.test(child.value)) refuse('unsupported', 'wsdl-text');
        }
      };
      const ws = (local: string) => `${WSDL_NAMESPACE}#${local}`;
      const soap = (local: string) => `${SOAP}#${local}`;
      const attrs = (node: SyntaxElement, allowed: readonly string[]) => {
        children(node);
        for (const a of node.attributes) if (a.name.namespace !== '' || !allowed.includes(a.name.local)) refuse('unsupported', 'binding-attribute-shape');
      };
      // Conservative extension policy: only known WSDL 1.1/SOAP 1.1 syntax, even when optional.
      // Documentation payload and XSD syntax are inert here and owned separately.
      const attributes: Record<string, readonly string[]> = {
        definitions: ['name', 'targetNamespace'], import: ['namespace', 'location'], types: [], message: ['name'], part: ['name', 'element', 'type'],
        portType: ['name'], operation: ['name', 'parameterOrder'], input: ['name', 'message'], output: ['name', 'message'], fault: ['name', 'message'],
        binding: ['name', 'type'], service: ['name'], port: ['name', 'binding'],
      };
      const soapAttributes: Record<string, readonly string[]> = {binding: ['style', 'transport'], operation: ['soapAction', 'style'], body: ['use', 'parts'], fault: ['name', 'use'], address: ['location']};
      for (const document of input.documents) {
        const stack = [document.root];
        while (stack.length) {
          const node = stack.pop()!;
          const nested = children(node);
          if (node.name.namespace === XSD_NAMESPACE && node.name.local === 'schema') continue;
          if (node.name.namespace === WSDL_NAMESPACE && node.name.local === 'documentation') continue;
          const allowed = node.name.namespace === WSDL_NAMESPACE ? attributes[node.name.local] : node.name.namespace === SOAP ? soapAttributes[node.name.local] : undefined;
          if (!allowed) return refuse('unsupported', 'wsdl-extension');
          for (const a of node.attributes) {
            if (a.name.namespace === WSDL_NAMESPACE && a.name.local === 'required' && node.name.namespace === SOAP && ['true', '1', 'false', '0'].includes(a.value)) continue;
            if (a.name.namespace !== '' || !allowed.includes(a.name.local)) refuse('unsupported', 'wsdl-attribute');
            if (a.name.local === 'name' && !isXmlNCName(a.value)) refuse('selection-refused', 'wsdl-name');
          }
          stack.push(...nested);
        }
      }
      const lookup = (id: string): GraphNode => {
        check(); budget.chargeWork(32 + id.length * 4);
        const found = context.lookup(id);
        if (found.kind !== 'found') return refuse('selection-refused', 'missing-reference');
        return found.node;
      };
      const wsdl = (role: WsdlNode['role'], qname: ExpandedName): WsdlNode => {
        budget.chargeWork(128 + qname.local.length * 8 + qname.namespace.length * 8);
        const node = lookup(globalId(role, qname));
        if (node.kind !== 'wsdl' || node.role !== role) return refuse('selection-refused', 'wrong-wsdl-role');
        return node;
      };
      const reference = (owner: WsdlNode, syntax: SyntaxElement, attribute: string): GraphNode => {
        budget.chargeWork(64 + owner.references.length * (32 + syntax.source.path.length * 4));
        const path = syntax.source.path.slice(owner.syntax.source.path.length) || '/';
        const refs = owner.references.filter(r => r.path === path && r.attribute === attribute);
        if (refs.length !== 1 || refs[0]!.reference.kind !== 'symbol' || !refs[0]!.reference.target) return refuse('selection-refused', 'missing-reference');
        return lookup(refs[0]!.reference.target);
      };
      const portType = wsdl('portType', ownedSelector.portType);
      const binding = wsdl('binding', ownedSelector.binding);
      shape(portType.syntax, [ws('operation'), ws('documentation')]);
      if (reference(binding, binding.syntax, 'type') !== portType) return refuse('selection-refused', 'binding-portType-mismatch');
      const operation = (owner: WsdlNode): SyntaxElement => {
        const matches = children(owner.syntax).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'operation' && attr(c, 'name') === ownedSelector.operation);
        if (matches.length !== 1) return refuse('selection-refused', 'operation-missing-or-overloaded');
        return matches[0]!;
      };
      const abstract = operation(portType), bound = operation(binding);
      attrs(bound, ['name']);
      shape(binding.syntax, [soap('binding'), ws('operation'), ws('documentation')]);
      const soapBinding = exactly(binding.syntax, SOAP, 'binding');
      const soapOperation = exactly(bound, SOAP, 'operation');
      shape(soapBinding, []); shape(soapOperation, []);
      if (!['document', 'rpc'].includes(attr(soapBinding, 'style') ?? 'document')) return refuse('unsupported', 'soap-binding-style');
      if (attr(soapBinding, 'transport') !== HTTP) return refuse('unsupported', 'soap-transport');
      if ((attr(soapOperation, 'style') ?? attr(soapBinding, 'style') ?? 'document') !== 'document') return refuse('unsupported', 'soap-style');
      const action = attr(soapOperation, 'soapAction');
      if (action === undefined) return refuse('unsupported', 'soap-action-required');
      shape(abstract, [ws('input'), ws('output'), ws('fault'), ws('documentation')]);
      shape(bound, [soap('operation'), ws('input'), ws('output'), ws('fault'), ws('documentation')]);
      const abstractInput = exactly(abstract, WSDL_NAMESPACE, 'input'), abstractOutput = exactly(abstract, WSDL_NAMESPACE, 'output');
      const sequence = children(abstract).filter(c => c.name.namespace === WSDL_NAMESPACE && ['input', 'output'].includes(c.name.local));
      if (sequence[0] !== abstractInput || sequence[1] !== abstractOutput) return refuse('unsupported', 'request-response-required');
      const messageOrder = (node: SyntaxElement) => {
        const messages = children(node).filter(c => c.name.namespace === WSDL_NAMESPACE && ['input', 'output', 'fault'].includes(c.name.local));
        if (messages[0]?.name.local !== 'input' || messages[1]?.name.local !== 'output' || messages.slice(2).some(c => c.name.local !== 'fault')) refuse('unsupported', 'request-response-order');
      };
      messageOrder(abstract); messageOrder(bound);
      if (attr(abstract, 'parameterOrder') !== undefined || attr(bound, 'parameterOrder') !== undefined) return refuse('unsupported', 'parameter-order');
      const root = (messageSyntax: SyntaxElement, boundSyntax: SyntaxElement, faultName?: string): DirectMessageRoot => {
        attrs(messageSyntax, ['name', 'message']); attrs(boundSyntax, ['name']);
        shape(messageSyntax, [ws('documentation')]);
        shape(boundSyntax, [soap(faultName === undefined ? 'body' : 'fault'), ws('documentation')]);
        const body = exactly(boundSyntax, SOAP, faultName === undefined ? 'body' : 'fault');
        shape(body, []);
        if (attr(body, 'use') !== 'literal') return refuse('unsupported', 'literal-required');
        if (faultName !== undefined && attr(body, 'name') !== faultName) return refuse('selection-refused', 'soap-fault-name');
        const message = reference(portType, messageSyntax, 'message');
        if (message.kind !== 'wsdl' || message.role !== 'message') return refuse('selection-refused', 'message-reference');
        shape(message.syntax, [ws('part'), ws('documentation')]);
        const parts = children(message.syntax).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'part');
        if (parts.length !== 1) return refuse('unsupported', 'single-part-required');
        const part = parts[0]!, partName = attr(part, 'name');
        if (!partName || !isXmlNCName(partName)) return refuse('selection-refused', 'part-name');
        if (attr(body, 'parts') !== undefined && attr(body, 'parts')!.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, '') !== partName) return refuse('selection-refused', 'body-parts');
        if (attr(part, 'type') !== undefined || attr(part, 'element') === undefined) return refuse('unsupported', 'global-element-part-required');
        shape(part, [ws('documentation')]);
        const element = reference(message, part, 'element');
        if (element.kind !== 'element' || element.identity.kind !== 'global') return refuse('selection-refused', 'global-element-root');
        if (element.type.kind === 'symbol' && !element.type.target) return refuse('selection-refused', 'element-type');
        return Object.freeze({message: message.name, part: partName, element, type: element.type, source: part.source});
      };
      const io = (direction: 'input' | 'output', declaration: SyntaxElement): DirectMessageRoot => {
        const boundIo = exactly(bound, WSDL_NAMESPACE, direction);
        const boundName = attr(boundIo, 'name');
        const expectedName = attr(declaration, 'name') ?? `${ownedSelector.operation}${direction === 'input' ? 'Request' : 'Response'}`;
        if (boundName !== undefined && boundName !== expectedName) return refuse('selection-refused', 'binding-message-name');
        return root(declaration, boundIo);
      };
      const requestRoot = io('input', abstractInput), responseRoot = io('output', abstractOutput);
      const declaredFaults = children(abstract).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'fault');
      const boundFaults = children(bound).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'fault');
      if (declaredFaults.length !== boundFaults.length) return refuse('selection-refused', 'fault-mapping');
      const faultNames = new Set<string>();
      const faults = declaredFaults.map(f => {
        check(); const faultName = attr(f, 'name');
        if (!faultName || !isXmlNCName(faultName) || faultNames.has(faultName)) return refuse('selection-refused', 'fault-name');
        faultNames.add(faultName);
        budget.chargeWork(64 + boundFaults.length * (64 + faultName.length * 4));
        const matches = boundFaults.filter(b => attr(b, 'name') === faultName);
        if (matches.length !== 1) return refuse('selection-refused', 'fault-mapping');
        return Object.freeze({name: faultName, root: root(f, matches[0]!, faultName)});
      });
      check();
      // Charge publication traversal before retaining authority. Roots stay exact context objects.
      const contract: DirectOperationContract = {selector: ownedSelector, contextId: context.contextId, basis: 'native-direct-premises-v1', correspondence: 'dated-XSD-2004-direct-v1',
        binding: {version: '1.1', style: 'document', use: 'literal', transport: HTTP, action, source: binding.context.source},
        input: requestRoot, output: responseRoot, faults,
        missingCapabilities: ['matcher', 'projection', 'scalar-payload', 'bundle', 'codec', 'buffered-transport', 'structured-generation'], admitted: false};
      budget.freeze(contract); check(); budget.chargeWork(256);
      const selected = Object.freeze({kind: 'selected' as const, contract, usage: Object.freeze({...budget.usage()})});
      issued.set(contract, Object.freeze({contract, context, source: input, evidence: qualified}));
      return selected;
    });
    return result.kind === 'resource-limit' ? failure('resource-limit', 'request-budget') : result;
  } catch (error) {
    if (budget.exhausted()) return failure('resource-limit', 'request-budget');
    if (options.signal?.aborted || error instanceof Cancelled) return failure('cancelled', 'cooperative-cancellation');
    if (error instanceof Refusal) return failure(error.kind, error.rule);
    if (error instanceof SchemaLoadingError) return failure(error.category === 'resource-limit' ? 'resource-limit' : 'loading-refused', error.category);
    throw error;
  }
}
