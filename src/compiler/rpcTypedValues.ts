/** Typed RPC composition over native scalar and record owners.
 * @since 1.1.9
 * @constraints Canonical inline parameters; no encoded request graph or array support.
 */
import {globalId} from './canonicalGraph.js';
import type {GraphNode, Reference} from './canonicalGraph.js';
import type {SemanticContext} from './semanticContext.js';
import type {RpcMessageRoot} from './directOperation.js';
import {planProjectionType, matchOrderedProjection, isXmlCharacters} from './directStructurePlan.js';
import type {DirectProjectionPlan, DirectProjectionRecord, DirectProjectionValue} from './directStructurePlan.js';
import {assessProjectionTypeOperand} from './projectionScalar.js';
import {resolveLexicalQName, syntaxAttribute, syntaxElements, XSD_NAMESPACE, XML_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ExpandedName, SyntaxElement} from '../loader/orderedSyntax.js';
import {directDataOwnership} from './directExecutionPolicy.js';

const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/';
const ENC = 'http://schemas.xmlsoap.org/soap/encoding/';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
type Scalar = string | boolean;
export type RpcTypedValue = Readonly<Record<string, Scalar | Readonly<Record<string, boolean>>>>;
type Fail = (kind: 'value-invalid' | 'unsupported' | 'mismatch', rule: string, node?: SyntaxElement) => never;
type Control = {check(): void; fail: Fail};
export interface RpcPartPlan {
  readonly name: string; readonly reference: Reference; readonly owner: GraphNode;
  readonly type: ExpandedName; readonly projection: DirectProjectionPlan;
}

/** Plan actual message parts; original source references remain native authority.
 * @param context Exact qualified context.
 * @param root Source-owned RPC message.
 * @param control Shared cancellation and refusal controls.
 * @returns Native scalar/flat Boolean record plans in WSDL declaration order.
 */
export function planRpcParts(context: SemanticContext, root: RpcMessageRoot, control: Control): readonly RpcPartPlan[] {
  const found = context.lookup(globalId('message', root.message));
  if (found.kind !== 'found' || found.node.kind !== 'wsdl' || found.node.role !== 'message') return control.fail('unsupported', 'rpc-message-owner');
  const owner = found.node;
  return Object.freeze(root.parts.map(part => {
    control.check(); context.budget.chargeWork(128);
    const resolved = context.resolve(part.type);
    const type = resolved.kind === 'builtin' ? resolved.name : resolved.kind === 'found' && resolved.node.identity.kind === 'global'
      ? resolved.node.identity.name : control.fail('unsupported', 'rpc-named-type-required');
    const projection = planProjectionType(context, owner, part.type, control.check, () => control.fail('unsupported', 'rpc-native-type-shape'));
    const scalar = (value: DirectProjectionValue) => value.kind === 'scalar' && !value.list && !value.nillable
      && ['string', 'boolean', 'decimal', 'integer', 'date', 'dateTime'].includes(value.builtin.local);
    if (projection.root.kind === 'scalar') {
      if (!scalar(projection.root)) return control.fail('unsupported', 'rpc-scalar-representation');
    } else {
      const record = projection.records.find(record => record.type.id === (projection.root as {type: string}).type)!;
      if (projection.records.length !== 1 || record.content !== 'element-only' || record.attributes.length || record.attributeWildcard
        || !record.ordered || record.keyed || record.contextual || record.slots.some(slot => !scalar(slot.value)
          || slot.value.kind !== 'scalar' || slot.value.builtin.local !== 'boolean' || slot.particle.occurs.min !== '1' || slot.particle.occurs.max !== '1'))
        return control.fail('unsupported', 'rpc-flat-boolean-record');
    }
    return Object.freeze({name: part.name, reference: part.type, owner, type, projection});
  }));
}

function scalar(context: SemanticContext, owner: GraphNode, reference: Reference, shape: DirectProjectionValue,
  lexical: string, node: SyntaxElement, control: Control): Scalar {
  if (shape.kind !== 'scalar' || !isXmlCharacters(lexical)) return control.fail('value-invalid', 'rpc-scalar-characters', node);
  const assessed = assessProjectionTypeOperand(context, owner, reference,
    {value: lexical, context: {namespaces: node.namespaces, source: node.source}}, control.check);
  if (assessed.kind !== 'projection-scalar-operand') return control.fail('value-invalid', 'rule' in assessed ? assessed.rule : 'rpc-scalar-budget', node);
  if (shape.constraint?.kind === 'fixed' && assessed.operand.canonical !== shape.constraint.canonical)
    return control.fail('value-invalid', 'fixed-element-value', node);
  return shape.builtin.local === 'boolean' ? assessed.operand.canonical === 'true' : lexical;
}

function recordOf(part: RpcPartPlan): DirectProjectionRecord {return part.projection.records[0]!;}
function object(value: unknown, names: readonly string[], control: Control): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return control.fail('value-invalid', 'rpc-data-object-required');
  const keys = Object.keys(value);
  if (keys.length !== names.length || keys.some(key => !names.includes(key))) return control.fail('value-invalid', 'rpc-required-parts');
  return value as Record<string, unknown>;
}

/** Expand typed values with native restrictions and canonical inline type accessors.
 * @param context Exact qualified context.
 * @param root Source-owned RPC parameters.
 * @param plans Native type plans.
 * @param application Data-only JSON value.
 * @param control Shared invocation controls.
 * @returns Canonical RPC wrapper plus its validated application value.
 */
export function expandRpcTyped(context: SemanticContext, root: RpcMessageRoot, plans: readonly RpcPartPlan[], application: unknown, control: Control): {payload: SyntaxElement; value: RpcTypedValue} {
  let owned: unknown;
  try {owned = directDataOwnership(context.budget).snapshot(application, control.check);} catch (error) {
    if (error instanceof TypeError) return control.fail('value-invalid', 'rpc-data-object-required');
    throw error;
  }
  const input = object(owned, plans.map(part => part.name), control);
  const namespaces: Record<string, string> = {xml: XML_NAMESPACE, '': '', rpc: root.bodyNamespace, xsi: XSI, xsd: XSD_NAMESPACE, enc: ENC, soap: SOAP};
  const typeNamespaces = [...new Set(plans.map(part => part.type.namespace))].filter(ns => ns !== XSD_NAMESPACE).sort();
  typeNamespaces.forEach((namespace, index) => {namespaces['t' + index] = namespace;});
  const element = (name: ExpandedName, value: unknown, shape: DirectProjectionValue, owner: GraphNode, reference: Reference, type?: ExpandedName): SyntaxElement => {
    control.check(); context.budget.chargeWork(256);
    const prefix = type?.namespace === XSD_NAMESPACE ? 'xsd' : type ? 't' + typeNamespaces.indexOf(type.namespace) : '';
    const node: SyntaxElement = {kind: 'element', name, lexicalName: name.local, namespaces, baseUri: root.source.uri, source: root.source,
      attributes: type ? [{name: {namespace: XSI, local: 'type'}, lexicalName: 'xsi:type', value: prefix + ':' + type.local}] : [], children: []};
    if (shape.kind !== 'scalar') return control.fail('unsupported', 'rpc-scalar-required');
    const lexical = shape.builtin.local === 'boolean' ? typeof value === 'boolean' ? String(value) : control.fail('value-invalid', 'boolean-required')
      : typeof value === 'string' ? value : control.fail('value-invalid', 'string-required');
    scalar(context, owner, reference, shape, lexical, node, control);
    return {...node, children: [{kind: 'text', value: lexical, source: root.source}]};
  };
  const children = plans.map(part => {
    if (part.projection.root.kind === 'scalar') return element({namespace: '', local: part.name}, input[part.name], part.projection.root, part.owner, part.reference, part.type);
    const record = recordOf(part), value = object(input[part.name], record.slots.map(slot => slot.element.name.local), control);
    const fields = record.slots.map(slot => element(slot.element.name, value[slot.element.name.local], slot.value, slot.element, slot.element.type,
      slot.value.kind === 'scalar' ? slot.value.builtin : undefined));
    const prefix = 't' + typeNamespaces.indexOf(part.type.namespace);
    return {kind: 'element' as const, name: {namespace: '', local: part.name}, lexicalName: part.name, namespaces, baseUri: root.source.uri, source: root.source,
      attributes: [{name: {namespace: XSI, local: 'type'}, lexicalName: 'xsi:type', value: prefix + ':' + part.type.local}], children: fields};
  });
  const payload: SyntaxElement = {kind: 'element', name: root.wrapper, lexicalName: 'rpc:' + root.wrapper.local, namespaces,
    baseUri: root.source.uri, source: root.source, attributes: [{name: {namespace: SOAP, local: 'encodingStyle'}, lexicalName: 'soap:encodingStyle', value: ENC}], children};
  return {payload, value: readRpcTyped(context, root, plans, payload, control)};
}

/** Validate actual dispatched inline parameters through native scalar/particle duties.
 * @param context Exact source context.
 * @param root Source-owned RPC input.
 * @param plans Native type plans.
 * @param payload Actual outgoing envelope Body or wrapper.
 * @param control Shared execution controls.
 * @returns Validated values keyed by original message part names.
 */
export function readRpcTyped(context: SemanticContext, root: RpcMessageRoot, plans: readonly RpcPartPlan[], payload: SyntaxElement, control: Control): RpcTypedValue {
  const elements = (node: SyntaxElement) => {
    control.check(); context.budget.chargeWork(64 + node.children.length * 16);
    if (node.children.some(child => child.kind === 'text' && /[^\t\r\n ]/.test(child.value))) return control.fail('mismatch', 'rpc-unexpected-text', node);
    return syntaxElements(node);
  };
  const attrs = (node: SyntaxElement, type?: ExpandedName) => {
    for (const attribute of node.attributes) {
      control.check();
      if (attribute.name.namespace === SOAP && attribute.name.local === 'encodingStyle' && attribute.value === ENC) continue;
      if (type && attribute.name.namespace === XSI && attribute.name.local === 'type') {
        let actual: ExpandedName;
        try {actual = resolveLexicalQName(attribute.value, node);} catch {return control.fail('unsupported', 'rpc-typed-accessor', node);}
        if (actual.namespace === type.namespace && actual.local === type.local) continue;
      }
      return control.fail('unsupported', 'rpc-typed-accessor', node);
    }
  };
  if (payload.name.namespace === SOAP && payload.name.local === 'Body') {
    attrs(payload); const wrappers = elements(payload);
    if (wrappers.length !== 1) return control.fail('mismatch', 'rpc-request-wrapper', payload);
    payload = wrappers[0]!;
  }
  if (payload.name.namespace !== root.wrapper.namespace || payload.name.local !== root.wrapper.local) return control.fail('mismatch', 'rpc-request-wrapper', payload);
  attrs(payload);
  const parameters = elements(payload);
  if (parameters.length !== plans.length) return control.fail('mismatch', 'rpc-parameter-count', payload);
  const result: Record<string, Scalar | Readonly<Record<string, boolean>>> = Object.create(null) as Record<string, Scalar | Readonly<Record<string, boolean>>>;
  plans.forEach((part, index) => {
    const node = parameters[index]!;
    if (node.name.namespace !== '' || node.name.local !== part.name) return control.fail('mismatch', 'rpc-parameter-name-order', node);
    attrs(node, part.type);
    const readScalar = (node: SyntaxElement, owner: GraphNode, reference: Reference, shape: DirectProjectionValue): Scalar => {
      if (syntaxElements(node).length) return control.fail('mismatch', 'rpc-scalar-content', node);
      return scalar(context, owner, reference, shape, node.children.map(child => child.kind === 'text' ? child.value : '').join(''), node, control);
    };
    if (part.projection.root.kind === 'scalar') result[part.name] = readScalar(node, part.owner, part.reference, part.projection.root);
    else {
      const record = recordOf(part), fields = elements(node);
      const matched = matchOrderedProjection(context, record, fields.map(field => field.name), control.check);
      if (!matched || matched.some(slot => 'kind' in slot)) return control.fail('mismatch', 'rpc-native-record-content', node);
      const value: Record<string, boolean> = Object.create(null) as Record<string, boolean>;
      fields.forEach(field => {
        const slot = record.slots.find(slot => slot.element.name.local === field.name.local && slot.element.name.namespace === field.name.namespace)!;
        attrs(field, slot.value.kind === 'scalar' ? slot.value.builtin : undefined);
        value[slot.element.name.local] = readScalar(field, slot.element, slot.element.type, slot.value) as boolean;
      });
      result[part.name] = value;
    }
  });
  return result;
}
