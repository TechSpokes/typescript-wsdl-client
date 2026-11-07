/** Payload facade over the existing native scalar implementation; no source-validity or admission receipt. */
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {AttributeNode, ElementNode, GraphNode, LexicalValue} from './canonicalGraph.js';
import {schemaScalarContext, SchemaAssessmentError, SchemaOperandContextError} from './schemaScalarContext.js';
import {scalarSchemaAssessment} from './scalarSchemaAssessment.js';
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
export type ProjectionScalarDescription = Readonly<{kind: 'projection-scalar-type'; builtin: ExpandedName; retainLexical?: true; list?: ProjectionScalarList}>;
type DescriptionResult = ProjectionScalarDescription | ProjectionScalarFailure | ResourceLimitFailure;
type OperandResult = Readonly<{kind: 'projection-scalar-operand'; operand: DatatypeOperand}> | ProjectionScalarFailure | ResourceLimitFailure;
const kernels = new WeakMap<SemanticContext, ReturnType<typeof kernel>>();

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
  const owner = (declaration: Declaration): Declaration => {
    if (types.isProxy(declaration)) throw new TypeError('Expected exact native scalar declaration');
    const id = Object.getOwnPropertyDescriptor(declaration, 'id');
    if (!id || !('value' in id) || typeof id.value !== 'string') throw new TypeError('Expected exact native scalar declaration');
    const found = context.lookup(id.value);
    if (found.kind !== 'found' || found.node !== declaration) throw new TypeError('Expected exact native scalar declaration');
    return declaration;
  };
  const describe = (declaration: Declaration): ProjectionScalarDescription | ProjectionScalarFailure => {
    owner(declaration);
    const cached = descriptions.get(declaration.id);
    if (cached) return cached;
    let reference: SemanticTypeReference = declaration.type;
    const type = context.resolve(declaration.type);
    if (type.kind === 'found' && type.node.kind === 'complexType') {
      const content = deriveActualComplexContent(context, type.node.id);
      if (content.kind !== 'checked' || content.view.content.kind !== 'simple') return Object.freeze({kind: 'unavailable', rule: 'scalar-content-reference'});
      reference = content.view.content.type;
    }
    const plan = core.ensure(reference, declaration);
    const stringUnion = (candidate: typeof plan): boolean => {
      if (candidate.variety !== 'union' || !candidate.members?.length || candidate.obligations?.length) return false;
      for (const reference of candidate.members) {
        check(); c.step(declaration);
        const member = core.ensure(reference, declaration);
        if (member.variety !== 'atomic' || member.primitive !== 'string' || member.obligations?.length) return false;
      }
      return true;
    };
    const union = plan.variety === 'union';
    if (union && !stringUnion(plan)) return Object.freeze({kind: 'unavailable', rule: 'declared-scalar-union'});
    if (plan.obligations?.length) return Object.freeze({kind: 'unavailable', rule: 'scalar-source-obligations'});
    let item: ProjectionScalarList | undefined;
    if (plan.variety === 'list') {
      if (!plan.item) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item'});
      const member = core.ensure(plan.item, declaration);
      const unionItem = stringUnion(member);
      if (member.variety !== 'atomic' && !unionItem) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item-' + member.variety});
      if (member.obligations?.length || member.whitespace === 'member' && !unionItem) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item-source-obligations'});
      const local = unionItem ? 'string' : member.builtin ?? member.primitive;
      if (!local) return Object.freeze({kind: 'unavailable', rule: 'scalar-list-item-representation'});
      context.budget.chargeWork(64);
      item = Object.freeze({builtin: Object.freeze({namespace: XSD_NAMESPACE, local}), whitespace: unionItem ? 'preserve' : member.whitespace as ProjectionScalarList['whitespace'],
        ...(unionItem || member.layers.some(layer => layer.patterns.length > 0) ? {retainLexical: true as const} : {})});
    }
    const local = union ? 'string' : item?.builtin.local ?? plan.builtin ?? plan.primitive;
    if (!local) return Object.freeze({kind: 'unavailable', rule: 'scalar-representation'});
    context.budget.chargeWork(64 + declaration.id.length);
    const retainLexical = union || plan.layers.some(layer => layer.patterns.length > 0);
    const result: ProjectionScalarDescription = Object.freeze({kind: 'projection-scalar-type', builtin: Object.freeze({namespace: XSD_NAMESPACE, local}),
      ...(retainLexical ? {retainLexical: true as const} : {}), ...(item ? {list: item} : {})});
    descriptions.set(declaration.id, result);
    references.set(declaration.id, reference);
    return result;
  };
  const failure = (error: unknown, operand: boolean): ProjectionScalarFailure => {
    if (error instanceof SchemaOperandContextError) return Object.freeze({kind: 'unavailable', rule: error.rule});
    if (!(error instanceof SchemaAssessmentError)) throw error;
    return Object.freeze({kind: operand && error.category === 'invalid-schema' ? 'scalar-invalid' : 'unavailable', rule: error.rule});
  };
  return {
    describe(declaration: Declaration, cooperative?: () => void): DescriptionResult {
      const previous = callerCheck; callerCheck = cooperative; interrupted = false;
      try {
        return context.budget.guard(() => {
          try {return describe(declaration);} catch (error) {return failure(error, false);}
        });
      } finally {if (interrupted) kernels.delete(context); callerCheck = previous;}
    },
    assess(declaration: Declaration, supplied: DatatypeLexicalOperand, cooperative?: () => void): OperandResult {
      const previous = callerCheck; callerCheck = cooperative; interrupted = false;
      try {
        return context.budget.guard(() => {
          let operand = false;
          try {
            const description = describe(declaration);
            if (description.kind !== 'projection-scalar-type') return description;
            const input = context.budget.freeze(context.budget.snapshot(supplied));
            // GraphContext here is calculation data, not a source/context receipt. Namespace and source facts come from the payload.
            const lexical: LexicalValue = {value: input.value, context: {...declaration.context,
              namespaces: input.context.namespaces, source: input.context.source, baseUri: input.context.source.uri}};
            operand = true;
            const value = core.assess(references.get(declaration.id)!, lexical, declaration);
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
  return context.budget.guard(() => get(context).describe(declaration, check));
}
/** A successful calculation is payload-only data; it grants no schema, operation or portable artifact authority. */
export function assessProjectionScalarOperand(context: SemanticContext, declaration: Declaration, lexical: DatatypeLexicalOperand, check?: () => void): OperandResult {
  assertSemanticContext(context);
  return context.budget.guard(() => get(context).assess(declaration, lexical, check));
}
