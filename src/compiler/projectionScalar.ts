/** Payload facade over the existing native scalar implementation; no source-validity or admission receipt. */
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {AttributeNode, ElementNode, GraphNode, LexicalValue, Reference} from './canonicalGraph.js';
import {schemaScalarContext, SchemaAssessmentError, SchemaOperandContextError} from './schemaScalarContext.js';
import {scalarSchemaAssessment} from './scalarSchemaAssessment.js';
import type {ScalarSupportPlan} from './scalarSchemaAssessment.js';
import type {DatatypeOperand} from './datatypeValues.js';
import type {ExpandedName} from '../loader/orderedSyntax.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import type {DatatypeLexicalOperand} from './schemaValueContext.js';
import {types} from 'node:util';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {deriveActualComplexContent} from './complexTypeContent.js';
import type {SemanticTypeReference} from './semanticTypeReference.js';

type Declaration = AttributeNode | ElementNode;
export type ProjectionScalarFailure = Readonly<{kind: 'unavailable' | 'scalar-invalid'; rule: string}>;
export interface ProjectionScalarList {
  readonly builtin: ExpandedName; readonly whitespace: 'preserve' | 'replace' | 'collapse'; readonly retainLexical?: true;
}
export type ProjectionScalarDescription = Readonly<{kind: 'projection-scalar-type'; builtin: ExpandedName; atomicString?: true; retainLexical?: true; list?: ProjectionScalarList}>;
type DescriptionResult = ProjectionScalarDescription | ProjectionScalarFailure | ResourceLimitFailure;
type OperandResult = Readonly<{kind: 'projection-scalar-operand'; operand: DatatypeOperand}> | ProjectionScalarFailure | ResourceLimitFailure;
const kernels = new WeakMap<SemanticContext, ReturnType<typeof kernel>>();
const unionPrimitives = new Set(['string', 'decimal', 'boolean', 'float', 'double', 'duration', 'dateTime', 'time',
  'date', 'gYearMonth', 'gYear', 'gMonthDay', 'gDay', 'gMonth', 'hexBinary', 'base64Binary', 'anyURI', 'QName']);
type UnionRepresentation = 'lexical' | 'scoped';

/** Qualify the effective member shapes of a checked lexical union.
 * @param union Native union plan after XSD 1.0 flattening.
 * @param resolve Resolve a native member or list item in the same semantic context.
 * @param allowLists Whether the union is itself a complete value rather than a list item.
 * @returns The lexical representation, including scope when QName selection requires it.
 */
export function componentUnionRepresentation(union: ScalarSupportPlan, resolve: (ref: SemanticTypeReference) => ScalarSupportPlan,
  allowLists: boolean): UnionRepresentation | undefined {
  const atomic = (plan: ScalarSupportPlan): UnionRepresentation | undefined =>
    plan.variety === 'atomic' && !plan.obligations?.length && unionPrimitives.has(plan.primitive ?? '')
      ? plan.primitive === 'QName' ? 'scoped' : 'lexical' : undefined;
  if (union.variety !== 'union' || !union.members?.length || union.obligations?.length) return undefined;
  let representation: UnionRepresentation = 'lexical';
  for (const reference of union.members) {
    const member = resolve(reference);
    let itemRepresentation = atomic(member);
    if (!itemRepresentation && allowLists && member.variety === 'list' && member.item && !member.obligations?.length) {
      const item = resolve(member.item);
      itemRepresentation = atomic(item) ?? componentUnionRepresentation(item, resolve, false);
    }
    if (!itemRepresentation) return undefined;
    if (itemRepresentation === 'scoped') representation = 'scoped';
  }
  return representation;
}

function kernel(context: SemanticContext) {
  const base = schemaScalarContext(context);
  let callerCheck: (() => void) | undefined;
  let interrupted = false;
  const check = () => {
    try {callerCheck?.();} catch (error) {interrupted = true; throw error;}
  };
  const c = {...base,
    step(owner?: GraphNode, count = 1) {check(); base.step(owner, count);},
    text(value: string, owner?: GraphNode) {check(); return base.text(value, owner);},
    algebra: occurrenceAlgebra(() => {check(); base.step();}),
  };
  // The default scalar profile excludes document-wide identity/DTD/NOTATION duties.
  // SOURCE formation remains the existing implementation; payload operands never become schema evidence.
  const core = scalarSchemaAssessment(c);
  const descriptions = new Map<string, ProjectionScalarDescription>();
  const references = new Map<string, SemanticTypeReference>();
  const keyFor = (declaration: GraphNode, reference: Reference): string => JSON.stringify([declaration.id,
    reference.kind, reference.kind === 'local' ? reference.target : [reference.name.namespace, reference.name.local]]);
  const owner = (declaration: GraphNode): GraphNode => {
    if (types.isProxy(declaration)) throw new TypeError('Expected exact native scalar declaration');
    const id = Object.getOwnPropertyDescriptor(declaration, 'id');
    if (!id || !('value' in id) || typeof id.value !== 'string') throw new TypeError('Expected exact native scalar declaration');
    const found = context.lookup(id.value);
    if (found.kind !== 'found' || found.node !== declaration) throw new TypeError('Expected exact native scalar declaration');
    return declaration;
  };
  const describe = (declaration: GraphNode, selected: Reference): ProjectionScalarDescription | ProjectionScalarFailure => {
    owner(declaration);
    const key = keyFor(declaration, selected);
    const cached = descriptions.get(key);
    if (cached) return cached;
    let reference: SemanticTypeReference = selected;
    const type = context.resolve(selected);
    if (type.kind === 'found' && type.node.kind === 'complexType') {
      const content = deriveActualComplexContent(context, type.node.id);
      if (content.kind !== 'checked' || content.view.content.kind !== 'simple') return Object.freeze({kind: 'unavailable', rule: 'scalar-content-reference'});
      reference = content.view.content.type;
    }
    const plan = core.ensure(reference, declaration);
    const resolve = (reference: SemanticTypeReference) => {
      check(); c.step(declaration);
      return core.ensure(reference, declaration);
    };
    const union = plan.variety === 'union';
    const unionRepresentation = union ? componentUnionRepresentation(plan, resolve, true) : undefined;
    if (union && !unionRepresentation) return Object.freeze({kind: 'unavailable', rule: 'declared-scalar-union'});
    if (plan.obligations?.length) return Object.freeze({kind: 'unavailable', rule: 'scalar-source-obligations'});
    let item: ProjectionScalarList | undefined;
    let scoped = unionRepresentation === 'scoped';
    if (plan.variety === 'list') {
      if (!plan.item) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item'});
      const member = core.ensure(plan.item, declaration);
      // @why #492 composes the qualified atomic union subset without changing native token or equality ownership.
      const unionItem = componentUnionRepresentation(member, resolve, false);
      if (member.variety !== 'atomic' && !unionItem) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item-' + member.variety});
      if (member.obligations?.length || member.whitespace === 'member' && !unionItem) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item-source-obligations'});
      const local = unionItem ? 'string' : member.builtin ?? member.primitive;
      if (!local) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item-representation'});
      scoped = unionItem === 'scoped';
      context.budget.chargeWork(64);
      item = Object.freeze({builtin: Object.freeze({namespace: XSD_NAMESPACE, local}), whitespace: unionItem ? 'preserve' : member.whitespace as ProjectionScalarList['whitespace'],
        ...(unionItem || member.layers.some(layer => layer.patterns.length > 0) ? {retainLexical: true as const} : {})});
    }
    const local = scoped ? 'QName' : union ? 'string' : item?.builtin.local ?? plan.builtin ?? plan.primitive;
    if (!local) return Object.freeze({kind: 'unavailable', rule: 'scalar-representation'});
    context.budget.chargeWork(64 + declaration.id.length);
    const retainLexical = scoped || union || plan.layers.some(layer => layer.patterns.length > 0);
    if (local === 'QName' && !scoped && (retainLexical || item?.retainLexical))
      return Object.freeze({kind: 'unavailable', rule: 'qname-lexical-facet-representation'});
    const result: ProjectionScalarDescription = Object.freeze({kind: 'projection-scalar-type', builtin: Object.freeze({namespace: XSD_NAMESPACE, local}),
      ...(plan.variety === 'atomic' && plan.primitive === 'string' ? {atomicString: true as const} : {}),
      ...(retainLexical ? {retainLexical: true as const} : {}), ...(item && !scoped ? {list: item} : {})});
    descriptions.set(key, result);
    references.set(key, reference);
    return result;
  };
  const failure = (error: unknown, operand: boolean): ProjectionScalarFailure => {
    if (error instanceof SchemaOperandContextError) return Object.freeze({kind: 'unavailable', rule: error.rule});
    if (!(error instanceof SchemaAssessmentError)) throw error;
    return Object.freeze({kind: operand && error.category === 'invalid-schema' ? 'scalar-invalid' : 'unavailable', rule: error.rule});
  };
  return {
    declarationType(declaration: Declaration): Reference {
      owner(declaration);
      return declaration.type;
    },
    describe(declaration: GraphNode, reference: Reference, cooperative?: () => void): DescriptionResult {
      const previous = callerCheck; callerCheck = cooperative; interrupted = false;
      try {
        return context.budget.guard(() => {
          try {return describe(declaration, reference);} catch (error) {return failure(error, false);}
        });
      } finally {if (interrupted) kernels.delete(context); callerCheck = previous;}
    },
    assess(declaration: GraphNode, reference: Reference, supplied: DatatypeLexicalOperand, cooperative?: () => void): OperandResult {
      const previous = callerCheck; callerCheck = cooperative; interrupted = false;
      try {
        return context.budget.guard(() => {
          let operand = false;
          try {
            const description = describe(declaration, reference);
            if (description.kind !== 'projection-scalar-type') return description;
            const input = context.budget.freeze(context.budget.snapshot(supplied));
            // GraphContext here is calculation data, not a source/context receipt. Namespace and source facts come from the payload.
            const lexical: LexicalValue = {value: input.value, context: {...declaration.context,
              namespaces: input.context.namespaces, source: input.context.source, baseUri: input.context.source.uri}};
            operand = true;
            const value = core.assess(references.get(keyFor(declaration, reference))!, lexical, declaration);
            context.budget.chargeWork(16);
            return Object.freeze({kind: 'projection-scalar-operand', operand: value});
          } catch (error) {return failure(error, operand);}
        });
      } finally {if (interrupted) kernels.delete(context); callerCheck = previous;}
    },
  };
}
function get(context: SemanticContext) {
  assertSemanticContext(context);
  if (context.kind !== 'actual') throw new TypeError('Payload scalar projection requires actual source');
  let result = kernels.get(context);
  if (!result) {context.budget.chargeWork(16); result = kernel(context); kernels.set(context, result);}
  return result;
}
/** Native declaration lookup and source-type formation precede any payload calculation. */
export function describeProjectionScalar(context: SemanticContext, declaration: Declaration, check?: () => void): DescriptionResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const scalar = get(context);
    return scalar.describe(declaration, scalar.declarationType(declaration), check);
  });
}
/** A successful calculation is payload-only data; it grants no schema, operation or portable artifact authority. */
export function assessProjectionScalarOperand(context: SemanticContext, declaration: Declaration, lexical: DatatypeLexicalOperand, check?: () => void): OperandResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const scalar = get(context);
    return scalar.assess(declaration, scalar.declarationType(declaration), lexical, check);
  });
}

/** Describe a source-owned type without inventing an element declaration.
 * @param context Native source context.
 * @param owner Exact graph node owning the reference.
 * @param reference Source-selected type reference.
 * @param check Cooperative budget/cancellation checkpoint.
 * @returns The existing native scalar description or explicit refusal.
 */
export function describeProjectionType(context: SemanticContext, owner: GraphNode, reference: Reference, check?: () => void): DescriptionResult {
  return context.budget.guard(() => get(context).describe(owner, reference, check));
}

/** Assess a typed value through the same native restrictions as element values.
 * @param context Native source context.
 * @param owner Exact source node owning the reference.
 * @param reference Source-selected type reference.
 * @param lexical Observed lexical value and namespace context.
 * @param check Cooperative checkpoint.
 * @returns Native datatype operand or explicit refusal.
 */
export function assessProjectionTypeOperand(context: SemanticContext, owner: GraphNode, reference: Reference, lexical: DatatypeLexicalOperand, check?: () => void): OperandResult {
  return context.budget.guard(() => get(context).assess(owner, reference, lexical, check));
}
