import {directLimit, directLoadingLimits} from './directExecutionPolicy.js';
/** Transient source-owned schema selection. This module grants no runtime admission. */
import {loadSemanticSchemaInput} from '../loader/schemaInput.js';
import type {SchemaInput, SchemaInputOptions} from '../loader/schemaInput.js';
import {SchemaLoadingError, WSDL_NAMESPACE, XSD_NAMESPACE, syntaxAttribute, syntaxElements, isXmlNCName} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement, SyntaxSource} from '../loader/orderedSyntax.js';
import {globalId} from './canonicalGraph.js';
import type {ElementNode, GraphNode, Reference, WsdlNode} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import {createApplicationBudget, DEFAULT_MAX_NODES} from './semanticBudget.js';
import type {SemanticBudget, SemanticBudgetLimits, ResolverUsage} from './semanticBudget.js';
import {qualifyDirectSource} from './checkedSourcePreparation.js';
import type {DirectSourceQualification} from './checkedSourcePreparation.js';
import {qualifyComponentSource, inspectComponentSourceQualification} from './checkedComponentSource.js';
import type {ComponentSourceQualification} from './checkedComponentSource.js';
import {prepareWsdlPolicyRequirements, assertWsdlPolicyRequirements} from './wsdlPolicyRequirements.js';
import type {WsdlPolicyRequirements, BindingPolicyRequirements} from './wsdlPolicyRequirements.js';
import type {StandardSchemaLibrary} from './standardSchemaComponents.js';

const SOAP = 'http://schemas.xmlsoap.org/wsdl/soap/';
const HTTP = 'http://schemas.xmlsoap.org/soap/http';
const ADDRESSING_WSDL = 'http://www.w3.org/2006/05/addressing/wsdl';
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
/** Source-owned RPC parameters; these are WSDL parts rather than schema element declarations.
 * @since 1.1.9
 */
export interface RpcMessageRoot {
  readonly kind: 'rpc-typed-parts-v1';
  readonly message: ExpandedName;
  readonly parts: readonly Readonly<{name: string; type: Reference; source: SyntaxSource}>[];
  readonly wrapper: ExpandedName;
  readonly bodyNamespace: string;
  readonly encoding: 'http://schemas.xmlsoap.org/soap/encoding/';
  readonly source: SyntaxSource;
}
/** Distinguish typed RPC parameters without inventing a document element.
 * @param root Selected native message.
 * @returns Whether the message uses the bounded RPC profile.
 */
export function isRpcMessageRoot(root: DirectMessageRoot | RpcMessageRoot): root is RpcMessageRoot {
  return 'kind' in root && root.kind === 'rpc-typed-parts-v1';
}
export interface DirectOperationContract {
  readonly selector: DirectOperationSelector;
  readonly contextId: string;
  readonly basis: 'native-direct-premises-v1' | 'native-component-premises-v1';
  readonly correspondence: 'dated-XSD-2004-direct-v1' | 'dated-XSD-2004-components-v1';
  readonly binding: Readonly<{version: '1.1'; style: 'document' | 'rpc'; use: 'literal' | 'encoded'; encoding?: string; transport: string; action: string; source: SyntaxSource}>;
  readonly input: DirectMessageRoot | RpcMessageRoot;
  readonly output: DirectMessageRoot | RpcMessageRoot;
  readonly faults: readonly Readonly<{name: string; root: DirectMessageRoot}>[];
  readonly policy?: BindingPolicyRequirements;
  readonly addressingActions?: Readonly<{required: false; input?: string; output?: string;
    faults: readonly Readonly<{name: string; action: string}>[]}>;
  readonly missingCapabilities: readonly string[];
  readonly admitted: false;
}
export type DirectOperationResult = Readonly<{kind: 'selected'; contract: DirectOperationContract; usage: ResolverUsage}> |
  Readonly<{kind: 'invalid-schema' | 'inconclusive' | 'unsupported' | 'selection-refused' | 'loading-refused' | 'resource-limit' | 'cancelled'; rule: string; usage: ResolverUsage}>;
export interface DirectOperationInspection {
  readonly contract: DirectOperationContract;
  readonly context: SemanticContext;
  readonly source: SchemaInput;
  readonly evidence: Extract<DirectSourceQualification, {kind: 'qualified-source'}> | ComponentSourceQualification;
  readonly policyOwner?: WsdlPolicyRequirements;
}
const issued = new WeakMap<DirectOperationContract, DirectOperationInspection>();

/** Object identity authenticates the exact issued roots; context IDs and digests do not. */
export function inspectDirectOperation(contract: DirectOperationContract, expectedContext?: SemanticContext): DirectOperationInspection {
  const owned = issued.get(contract);
  if (!owned || expectedContext !== undefined && owned.context !== expectedContext) throw new TypeError('Unauthenticated or foreign direct operation');
  if (owned.policyOwner) assertWsdlPolicyRequirements(owned.source, owned.policyOwner);
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
  return selectDirectOperationInRequest(source, selector, options, createApplicationBudget(options.limits));
}

/** Private-module composition seam: portable reading and selection share one request. */
export async function selectDirectOperationInRequest(source: string, selector: DirectOperationSelector, options: Readonly<{
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
}>, budget: SemanticBudget): Promise<DirectOperationResult> {
  return selectOperationInRequest(source, selector, options, budget, 'direct');
}

/** Select through additive native component qualification without granting codec, transport or runtime admission.
 * @remarks The same WSDL binding/message owner is used by the existing preview. New contracts carry a distinct
 *   basis and correspondence; preview codecs and source capsules continue to refuse them until independently extended.
 * @returns Fresh source-bound operation roots or an explicit qualification/selection failure.
 */
export async function selectComponentOperation(source: string, selector: DirectOperationSelector, options: Readonly<{
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
  standardLibraries?: readonly StandardSchemaLibrary[];
}>): Promise<DirectOperationResult> {
  return selectComponentOperationInRequest(source, selector, options, createApplicationBudget(options.limits));
}

/** Private composition seam: artifact reading and fresh component selection share the same sticky request. */
export async function selectComponentOperationInRequest(source: string, selector: DirectOperationSelector, options: Readonly<{
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
  standardLibraries?: readonly StandardSchemaLibrary[];
}>, budget: SemanticBudget): Promise<DirectOperationResult> {
  return selectOperationInRequest(source, selector, {...options, standardLibraries: Object.freeze([...(options.standardLibraries ?? [])])}, budget, 'components');
}

interface ComponentSelectionCache {
  input?: SchemaInput; qualified?: ComponentSourceQualification; policy?: WsdlPolicyRequirements;
  failure?: Exclude<DirectOperationResult, {kind: 'selected'}>;
}

/** Select requested service operations against one fresh native source snapshot and sticky request.
 * @remarks Native whole-source qualification is reused by identity within this batch only. Every binding/message
 *   selection still runs through the same owner; no source flags, saved reports or operation-name guesses are consumed.
 * @returns One result in each requested position, including explicit refusals. No requested operation is omitted.
 */
export async function selectComponentOperations(source: string, selectors: readonly DirectOperationSelector[], options: Readonly<{
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
  standardLibraries?: readonly StandardSchemaLibrary[];
}>): Promise<readonly DirectOperationResult[]> {
  const budget = createApplicationBudget(options.limits), cache: ComponentSelectionCache = {};
  const owned = budget.snapshot(selectors);
  if (!Array.isArray(owned) || Object.keys(owned).length !== owned.length) throw new TypeError('Dense operation selectors required');
  const results: DirectOperationResult[] = [];
  const captured = {...options, standardLibraries: Object.freeze([...(options.standardLibraries ?? [])])};
  for (const selector of owned) results.push(await selectOperationInRequest(source, selector, captured, budget, 'components', cache));
  return Object.freeze(results);
}

async function selectOperationInRequest(source: string, selector: DirectOperationSelector, options: Readonly<{
  loading: SchemaInputOptions; limits?: SemanticBudgetLimits; signal?: AbortSignal;
  standardLibraries?: readonly StandardSchemaLibrary[];
}>, budget: SemanticBudget, profile: 'direct' | 'components', cache?: ComponentSelectionCache): Promise<DirectOperationResult> {
  const check = () => {if (options.signal?.aborted) throw new Cancelled(); budget.chargeWork();};
  const refuse = (kind: Refusal['kind'], rule: string): never => {throw new Refusal(kind, rule);};
  const failure = (kind: Refusal['kind'], rule: string): DirectOperationResult => Object.freeze({kind, rule, usage: Object.freeze({...budget.usage()})});
  const sourceFailure = (kind: Refusal['kind'], rule: string): DirectOperationResult => {
    const result = failure(kind, rule);
    if (cache && result.kind !== 'selected') cache.failure = result;
    return result;
  };
  try {
    // Fixed terminal envelope and issuance bookkeeping, before any source work.
    budget.chargeWork(4096); check();
    const ownedSelector = budget.freeze(budget.snapshot(selector));
    const name = (value: ExpandedName | undefined) => value && typeof value.namespace === 'string' && typeof value.local === 'string' && isXmlNCName(value.local);
    if (!name(ownedSelector.portType) || !name(ownedSelector.binding) || typeof ownedSelector.operation !== 'string' || !isXmlNCName(ownedSelector.operation)) return failure('selection-refused', 'explicit-selector');
    if (cache?.failure) return failure(cache.failure.kind, cache.failure.rule);
    const input = cache?.input ?? await loadSemanticSchemaInput(source, {...options.loading, limits: directLoadingLimits(budget, options.loading.limits), signal: options.signal, chargeWork: amount => {check(); budget.chargeWork(amount);}});
    if (cache) cache.input = input;
    check();
    const result = budget.guard(() => {
      const qualificationOptions = {budget, maxNodes: options.limits?.maxNodes ?? directLimit(budget, DEFAULT_MAX_NODES), check};
      const qualified = cache?.qualified ?? (profile === 'direct' ? qualifyDirectSource(input, qualificationOptions)
        : qualifyComponentSource(input, {...qualificationOptions, standardLibraries: options.standardLibraries}));
      if (qualified.kind === 'resource-limit') return sourceFailure('resource-limit', 'source-qualification');
      if (qualified.kind === 'source-preparation-failed' && qualified.category === 'resource-limit') return sourceFailure('resource-limit', 'source-preparation');
      if (qualified.kind !== 'qualified-source' && qualified.kind !== 'component-source') return sourceFailure(qualified.kind === 'source-preparation-failed' && qualified.category === 'invalid-schema' ? 'invalid-schema' : 'inconclusive', 'source-preparation');
      if (qualified.kind === 'component-source') inspectComponentSourceQualification(qualified, input);
      const construction = qualified.kind === 'component-source' ? qualified.construction : qualified;
      const eligible = qualified.kind === 'component-source' ? qualified.schemaEligible : qualified.eligible;
      if (!eligible) return sourceFailure(construction.localDisproved || construction.closure.kind === 'invalid-schema' ? 'invalid-schema' : 'inconclusive',
        qualified.kind === 'component-source' && qualified.correspondence.kind === 'inconclusive-correspondence'
          ? `whole-source-qualification:${qualified.correspondence.rule}${qualified.correspondence.path ? ':' + qualified.correspondence.path : ''}` : 'whole-source-qualification');
      const {request} = construction;
      const context = request.actual;
      let policyOwner: WsdlPolicyRequirements | undefined;
      if (profile === 'components') {
        const policies = cache?.policy ?? prepareWsdlPolicyRequirements(input, budget, check);
        if (policies.kind !== 'wsdl-policy-requirements') return sourceFailure(policies.kind, 'rule' in policies ? policies.rule : 'policy-budget');
        assertWsdlPolicyRequirements(input, policies); policyOwner = policies;
        if (cache && qualified.kind === 'component-source') {cache.qualified = qualified; cache.policy = policies;}
      }
      const children = (node: SyntaxElement): SyntaxElement[] => {
        check(); budget.chargeWork(128 + node.children.length * 16 + node.attributes.length * 32);
        for (const a of node.attributes) budget.chargeWork(a.value.length * 8 + a.name.local.length * 8 + a.name.namespace.length * 8);
        for (const child of node.children) {
          if (child.kind === 'element') budget.chargeWork(16 + child.name.namespace.length * 8 + child.name.local.length * 8);
        }
        return syntaxElements(node);
      };
      const attr = syntaxAttribute;
      const addressingMessages = new Set<SyntaxElement>();
      if (profile === 'components') for (const document of input.documents) {
        for (const portType of children(document.root).filter(node => node.name.namespace === WSDL_NAMESPACE && node.name.local === 'portType'))
          for (const operation of children(portType).filter(node => node.name.namespace === WSDL_NAMESPACE && node.name.local === 'operation'))
            for (const message of children(operation).filter(node => node.name.namespace === WSDL_NAMESPACE && ['input', 'output', 'fault'].includes(node.name.local)))
              addressingMessages.add(message);
      }
      const addressingAttribute = (node: SyntaxElement, namespace: string, local: string) =>
        addressingMessages.has(node) && namespace === ADDRESSING_WSDL && local === 'Action';
      const exactly = (node: SyntaxElement, namespace: string, local: string): SyntaxElement => {
        const found = children(node).filter(c => c.name.namespace === namespace && c.name.local === local);
        if (found.length !== 1) return refuse('selection-refused', `expected-one-${local}`);
        return found[0]!;
      };
      const shape = (node: SyntaxElement, allowed: readonly string[]) => {
        for (const child of children(node)) if (!allowed.includes(`${child.name.namespace}#${child.name.local}`)
          && !policyOwner?.isPolicyMetadata(child)) refuse('unsupported', 'binding-child-shape');
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
        for (const a of node.attributes) if (!addressingAttribute(node, a.name.namespace, a.name.local)
          && (a.name.namespace !== '' || !allowed.includes(a.name.local))) refuse('unsupported', 'binding-attribute-shape');
      };
      // Conservative extension policy: only known WSDL 1.1/SOAP 1.1 syntax, even when optional.
      // Documentation payload and XSD syntax are inert here and owned separately.
      budget.chargeWork(64 + input.schemas.length * 32);
      const qualifiedSchemas = new Set(input.schemas.map(schema => schema.syntax));
      const attributes: Record<string, readonly string[]> = {
        definitions: ['name', 'targetNamespace'], import: ['namespace', 'location'], types: [], message: ['name'], part: ['name', 'element', 'type'],
        portType: ['name'], operation: ['name', 'parameterOrder'], input: ['name', 'message'], output: ['name', 'message'], fault: ['name', 'message'],
        binding: ['name', 'type'], service: ['name'], port: ['name', 'binding'],
      };
      const soapAttributes: Record<string, readonly string[]> = {binding: ['style', 'transport'], operation: ['soapAction', 'style'], body: profile === 'components' ? ['use', 'parts', 'namespace', 'encodingStyle'] : ['use', 'parts'], fault: ['name', 'use'], address: ['location']};
      for (const document of input.documents) {
        const stack = [document.root];
        while (stack.length) {
          const node = stack.pop()!;
          const nested = children(node);
          if (qualifiedSchemas.has(node)) continue;
          if (policyOwner?.isPolicyMetadata(node)) continue;
          if (node.name.namespace === WSDL_NAMESPACE && node.name.local === 'documentation') continue;
          const allowed = node.name.namespace === WSDL_NAMESPACE ? attributes[node.name.local] : node.name.namespace === SOAP ? soapAttributes[node.name.local] : undefined;
          if (!allowed) return refuse('unsupported', 'wsdl-extension');
          for (const a of node.attributes) {
            // @why The May 2006 WSDL binding assigns no normative intent to Action without UsingAddressing.
            //   UsingAddressing remains unsupported, so these attributes are retained metadata, never SOAP header instructions.
            if (addressingAttribute(node, a.name.namespace, a.name.local)) continue;
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
      const style = attr(soapOperation, 'style') ?? attr(soapBinding, 'style') ?? 'document';
      if (style !== 'document' && !(profile === 'components' && style === 'rpc')) return refuse('unsupported', 'soap-style');
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
        attrs(body, faultName === undefined ? ['use', 'parts'] : ['use', 'name']);
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
      const rpcRoot = (messageSyntax: SyntaxElement, boundSyntax: SyntaxElement, direction: 'input' | 'output'): RpcMessageRoot => {
        attrs(messageSyntax, ['name', 'message']); attrs(boundSyntax, ['name']);
        shape(messageSyntax, [ws('documentation')]); shape(boundSyntax, [soap('body'), ws('documentation')]);
        const body = exactly(boundSyntax, SOAP, 'body'); shape(body, []);
        const encoding = 'http://schemas.xmlsoap.org/soap/encoding/' as const;
        if (attr(body, 'use') !== 'encoded' || attr(body, 'encodingStyle')?.trim() !== encoding) return refuse('unsupported', 'rpc-string-encoding');
        const bodyNamespace = attr(body, 'namespace');
        if (!bodyNamespace || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(bodyNamespace)) return refuse('unsupported', 'rpc-body-namespace');
        const message = reference(portType, messageSyntax, 'message');
        if (message.kind !== 'wsdl' || message.role !== 'message') return refuse('selection-refused', 'message-reference');
        shape(message.syntax, [ws('part'), ws('documentation')]);
        const declared = children(message.syntax).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'part');
        if (!declared.length || direction === 'output' && declared.length !== 1) return refuse('unsupported', 'rpc-single-string-result');
        const names = new Set<string>();
        const parts = declared.map(part => {
          attrs(part, ['name', 'type']); shape(part, [ws('documentation')]);
          const name = attr(part, 'name');
          if (!name || !isXmlNCName(name) || names.has(name)) return refuse('selection-refused', 'rpc-part-name');
          names.add(name);
          const path = part.source.path.slice(message.syntax.source.path.length) || '/';
          const refs = message.references.filter(r => r.path === path && r.attribute === 'type');
          if (refs.length !== 1 || refs[0]!.reference.kind !== 'builtin' || refs[0]!.reference.name.namespace !== XSD_NAMESPACE || refs[0]!.reference.name.local !== 'string')
            return refuse('unsupported', 'rpc-string-part-required');
          return Object.freeze({name, type: refs[0]!.reference, source: part.source});
        });
        if (attr(body, 'parts') !== undefined && attr(body, 'parts')!.trim().split(/[\t\r\n ]+/).join(' ') !== parts.map(p => p.name).join(' '))
          return refuse('unsupported', 'rpc-body-parts');
        return Object.freeze({kind: 'rpc-typed-parts-v1', message: message.name, parts, bodyNamespace, encoding,
          wrapper: {namespace: bodyNamespace, local: ownedSelector.operation + (direction === 'output' ? 'Response' : '')}, source: body.source});
      };
      const io = (direction: 'input' | 'output', declaration: SyntaxElement): DirectMessageRoot | RpcMessageRoot => {
        const boundIo = exactly(bound, WSDL_NAMESPACE, direction);
        const boundName = attr(boundIo, 'name');
        const expectedName = attr(declaration, 'name') ?? `${ownedSelector.operation}${direction === 'input' ? 'Request' : 'Response'}`;
        if (boundName !== undefined && boundName !== expectedName) return refuse('selection-refused', 'binding-message-name');
        return style === 'rpc' ? rpcRoot(declaration, boundIo, direction) : root(declaration, boundIo);
      };
      const requestRoot = io('input', abstractInput), responseRoot = io('output', abstractOutput);
      const declaredFaults = children(abstract).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'fault');
      const boundFaults = children(bound).filter(c => c.name.namespace === WSDL_NAMESPACE && c.name.local === 'fault');
      if (style === 'rpc' && (declaredFaults.length || boundFaults.length)) return refuse('unsupported', 'rpc-declared-fault');
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
      const contract: DirectOperationContract = {selector: ownedSelector, contextId: context.contextId,
        basis: profile === 'direct' ? 'native-direct-premises-v1' : 'native-component-premises-v1',
        correspondence: profile === 'direct' ? 'dated-XSD-2004-direct-v1' : 'dated-XSD-2004-components-v1',
        binding: {version: '1.1', style: style as 'document' | 'rpc', use: style === 'rpc' ? 'encoded' : 'literal',
          ...(style === 'rpc' ? {encoding: 'http://schemas.xmlsoap.org/soap/encoding/'} : {}), transport: HTTP, action, source: binding.context.source},
        input: requestRoot, output: responseRoot, faults,
        ...(policyOwner ? {policy: policyOwner.forBinding(binding.syntax), addressingActions: {required: false as const,
          input: attr(abstractInput, 'Action', ADDRESSING_WSDL), output: attr(abstractOutput, 'Action', ADDRESSING_WSDL),
          faults: declaredFaults.flatMap(fault => {const action = attr(fault, 'Action', ADDRESSING_WSDL);
            return action === undefined ? [] : [{name: attr(fault, 'name')!, action}];})}} : {}),
        missingCapabilities: ['matcher', 'projection', 'scalar-payload', 'bundle', 'codec', 'buffered-transport', 'structured-generation',
          ...(policyOwner?.forBinding(binding.syntax).kind === 'https-transport' ? ['policy-enforcement'] : [])], admitted: false};
      budget.freeze(contract); check(); budget.chargeWork(256);
      const selected = Object.freeze({kind: 'selected' as const, contract, usage: Object.freeze({...budget.usage()})});
      issued.set(contract, Object.freeze({contract, context, source: input, evidence: qualified, ...(policyOwner ? {policyOwner} : {})}));
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
