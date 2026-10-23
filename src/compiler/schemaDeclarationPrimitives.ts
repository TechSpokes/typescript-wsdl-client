import type {SemanticTypeReference as Reference, SemanticTypeDependency, OriginalGeneratedScalarReference} from './semanticTypeReference.js';
/** Declaration-local properties only. EDC and containing type validity are separate. */
import type {ElementNode, AttributeNode, GraphNode, NodeId} from './canonicalGraph.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import {isXmlNCName, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {AssessedSchemaOperand, ScalarFailure} from './schemaScalarKernel.js';
import {checkSubstitution, declarationMethods, RelationProblem} from './schemaTypeRelations.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {resolveSemanticType, declaredType} from './schemaTypeIdentity.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import {readElementIdentityConstraints} from './schemaIdentityConstraints.js';
import type {IdentityConstraintDependency} from './schemaIdentityConstraints.js';

export type DeclarationReceipt = Readonly<{kind: 'checked'; component: NodeId; contextId: string;
  authority: 'XSD10-declaration-properties-v1'; constraint?: AssessedSchemaOperand;
  obligations: readonly string[]; scalarObligations: readonly ScalarObligation[]; typeDependencies:readonly SemanticTypeDependency[];
  identityConstraintDependencies: readonly IdentityConstraintDependency[]}>;
export type DeclarationResult = DeclarationReceipt | ScalarFailure | ResourceLimitFailure;
type ConstraintResult = Readonly<{kind: 'checked'; constraint: AssessedSchemaOperand;
  scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[]}> | ScalarFailure | ResourceLimitFailure;
export type DeclarationValuePropertyResult = DeclarationResult | Readonly<{kind: 'checked'; component: NodeId; contextId: string;
  authority: 'XSD10-mixed-value-property-v1' | 'XSD10-source-simple-value-property-v1' | 'XSD10-raw-simple-value-property-v1'; constraint: AssessedSchemaOperand; obligations: readonly string[];
  scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[]}>;
const nameAttribute = (node: GraphNode, name: string): string | undefined =>
  node.declaredAttributes.find(a => a.name.namespace === '' && a.name.local === name)?.value;
/** Shared actual VALUE assessment; selecting a mixed value's STRING is not FULL of its complex owner. */
function constraintValue(context: SemanticContext, node: ElementNode | AttributeNode, reference: Reference): ConstraintResult {
  const constraint = node.value!;
  if (constraint.kind !== 'default' && constraint.kind !== 'fixed') return context.budget.freeze(context.budget.snapshot({kind: 'invalid-schema' as const,
    rule: 'declaration-value', component: node.id, message: 'Value constraint must be default or fixed', source: node.context.source}));
  const scalar = createSchemaScalarKernel(context), checked = scalar.checkValue(reference, constraint, node.id);
  if (checked.kind !== 'checked') return checked;
  const assessed = scalar.assess(reference, constraint.lexical, node.id);
  if (assessed.kind !== 'checked') return assessed;
  const typed = collectSemanticTypeDependencies(context); typed.add(checked.typeDependencies); typed.add(assessed.typeDependencies);
  context.budget.chargeWork(4 + checked.obligations.length + assessed.obligations.length);
  return Object.freeze({kind: 'checked', constraint: assessed.value,
    scalarObligations: Object.freeze([...checked.obligations, ...assessed.obligations]), typeDependencies: typed.snapshot()});
}

/** VALUE properties select actual scalar/fact support; full declaration validity has its own owner. */
export function checkDeclarationValueProperty(context: SemanticContext, id: NodeId): DeclarationValuePropertyResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    context.budget.chargeWork(8 + id.length);
    const found = context.lookup(id);
    if (found.kind !== 'found' || found.node.kind !== 'element' || !found.node.value) return checkDeclaration(context, id);
    const node = found.node, declared = declaredType(context, node), type = resolveSemanticType(context, declared);
    if (type.kind !== 'component' || type.node.kind !== 'complexType') return checkDeclaration(context, id);
    const raw = context.rawTypeProperties(type.node.id), source = context.sourceNode(type.node.id);
    const sourceSimple = !raw && source?.kind === 'complexType' && source.derivation?.contentKind === 'simple'
      && (context.originalComplexContentSource(type.node.id) !== undefined || context.originalComplexPropertySource(type.node.id) !== undefined);
    const rawSimple = raw?.content.kind === 'simple' ? raw.content : undefined;
    if (rawSimple) {
      const selected = resolveSemanticType(context, rawSimple.type);
      if (selected.kind === 'missing' || selected.kind === 'outside-context')
        return context.budget.freeze(context.budget.snapshot({kind: 'unresolved' as const, rule: 'src-resolve', component: type.node.id,
          message: 'Simple content datatype is unavailable', source: type.node.context.source}));
      if (!(selected.kind === 'builtin' && selected.name.local !== 'anyType' || selected.kind === 'original-generated'
        || selected.kind === 'component' && selected.node.kind === 'simpleType'))
        return context.budget.freeze(context.budget.snapshot({kind: 'invalid-schema' as const, rule: 'raw-type-content-role', component: type.node.id,
          message: 'Simple content requires an actual simple datatype', source: type.node.context.source}));
    }
    const mixed = raw ? raw.content.kind === 'mixed' : source?.kind === 'complexType' && source.mixed && source.derivation?.contentKind !== 'simple';
    if (!sourceSimple && !rawSimple && !mixed) return checkDeclaration(context, id);
    const value = constraintValue(context, node, rawSimple?.type ?? (sourceSimple ? declared : {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'string'}}));
    if (value.kind !== 'checked') return value;
    return context.budget.freeze(context.budget.snapshot({kind: 'checked' as const, component: id, contextId: context.contextId,
      authority: rawSimple ? 'XSD10-raw-simple-value-property-v1' as const : sourceSimple ? 'XSD10-source-simple-value-property-v1' as const : 'XSD10-mixed-value-property-v1' as const,
      constraint: value.constraint, obligations: sourceSimple || rawSimple ? [] : ['element-default-mixed-emptiable:' + type.node.id],
      scalarObligations: value.scalarObligations, typeDependencies: value.typeDependencies}));
  });
}
export function checkDeclaration(context: SemanticContext, id: NodeId): DeclarationResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const lookup = context.lookup(id);
    if (lookup.kind !== 'found') return context.budget.freeze(context.budget.snapshot({kind: 'unresolved' as const, rule: 'declaration-operand', component: id, message: 'Declaration is outside the authenticated context'}));
    const node = lookup.node;
    const fail = (rule: string, message: string, kind: ScalarFailure['kind'] = 'invalid-schema'): ScalarFailure =>
      context.budget.freeze(context.budget.snapshot({kind, rule, message, component: id, source: node.context.source}));
    if (node.kind !== 'attribute' && node.kind !== 'element') return fail('declaration-kind', 'Expected an element or attribute declaration');
    context.budget.chargeWork(32 + node.name.local.length + node.name.namespace.length + node.declaredAttributes.length * 8);
    if (!isXmlNCName(node.name.local)) return fail('declaration-name', 'Declaration name must be an XML NCName');
    if (node.kind === 'element' && (typeof node.abstract !== 'boolean' || typeof node.nillable !== 'boolean')) return fail('e-props-correct', 'Abstract and nillable properties must be booleans');
    if (node.value && node.value.kind !== 'default' && node.value.kind !== 'fixed') return fail('declaration-value', 'Value constraint must be default or fixed');
    if (node.kind === 'attribute' && node.name.namespace === 'http://www.w3.org/2001/XMLSchema-instance') return fail('a-props-correct', 'Attribute declarations cannot target the XML Schema instance namespace');
    if (node.name.namespace === 'http://www.w3.org/2000/xmlns/' || node.kind === 'attribute' && node.name.local === 'xmlns') return fail('a-props-correct', 'The namespace declaration name is forbidden');
    if (context.sourceNode(node.id)) {
    if (nameAttribute(node, 'default') !== undefined && nameAttribute(node, 'fixed') !== undefined) return fail('src-declaration', 'Default and fixed are mutually exclusive');
    if (nameAttribute(node, 'ref') !== undefined && nameAttribute(node, 'name') !== undefined) return fail('src-declaration', 'Name and ref are mutually exclusive');
    if (nameAttribute(node, 'type') !== undefined && node.type.kind === 'local') return fail('src-declaration', 'Type and anonymous type are mutually exclusive');
    for (const property of node.kind === 'element' ? ['abstract', 'nillable'] : []) {
      const value = nameAttribute(node, property);
      if (value !== undefined && !['true', 'false', '0', '1'].includes(value.replace(/[\t\r\n ]+/g, ' ').replace(/^ | $/g, ''))) return fail('boolean-lexical', `Invalid ${property} boolean`);
    }
    if (node.identity.kind !== 'global') {
      if (nameAttribute(node, 'substitutionGroup') !== undefined || nameAttribute(node, 'abstract') !== undefined || nameAttribute(node, 'final') !== undefined) return fail('src-element', 'Local declaration has a global-only property');
    }
    }
    let identityConstraintDependencies: readonly IdentityConstraintDependency[] = [];
    if (node.kind === 'element') {
      const constraints = readElementIdentityConstraints(context, id);
      if (constraints.kind !== 'checked') return constraints;
      identityConstraintDependencies = constraints.identityConstraintDependencies;
    }
    const type=declaredType(context,node), selected = resolveSemanticType(context,type);
    const typed=collectSemanticTypeDependencies(context);
    if(selected.kind==='component'||selected.kind==='builtin'||selected.kind==='original-generated')typed.add([{contextId:context.contextId,type:selected.identity}]);
    if (selected.kind !== 'component' && selected.kind !== 'builtin' && selected.kind !== 'original-generated') return fail('src-resolve', 'Declared type is unavailable', 'unresolved');
    if (selected.kind === 'component' && selected.node.kind !== 'simpleType' && selected.node.kind !== 'complexType') return fail('declared-type', 'Reference does not name a type');
    if (node.kind === 'attribute' && (selected.kind === 'builtin' && selected.name.local === 'anyType' || selected.kind === 'component' && selected.node.kind === 'complexType')) return fail('a-props-correct.2', 'Attribute declarations require a simple type');
    if (node.kind === 'element') {
      try {declarationMethods(context, node, 'final'); declarationMethods(context, node, 'block');}
      catch (error) {if (error instanceof RelationProblem) return fail(error.result.rule, error.message, error.result.kind === 'unresolved' ? 'unresolved' : 'invalid-schema'); throw error;}
      if (node.substitutionGroup) {
        const head = context.resolve(node.substitutionGroup);
        if (head.kind !== 'found' || head.node.kind !== 'element') return fail('e-props-correct.4', 'Affiliation head is unavailable', 'unresolved');
        if (node.identity.kind !== 'global' || head.node.identity.kind !== 'global') return fail('e-props-correct.4', 'Affiliation requires global element declarations');
        const relation = checkSubstitution(context, node.id, head.node.id, {mode: 'affiliation'});
        if (relation.kind === 'resource-limit') return relation;
        if (relation.kind !== 'checked') return fail(relation.rule, relation.message, 'unresolved');
        typed.add(relation.typeDependencies);
        if (!relation.value) return fail('e-props-correct.4', 'Immediate affiliation type relation is not satisfied');
      }
    }
    const scalar = createSchemaScalarKernel(context), obligations: string[] = ['declared-type-component-validity'], scalarObligations: ScalarObligation[] = [];
    const remember = (required: readonly ScalarObligation[]): void => {
      context.budget.chargeWork(required.length * 8 + 1);
      for (const obligation of required) {
        context.budget.chargeWork(scalarObligations.length + 1);
        if (!scalarObligations.some(prior => prior.rule === obligation.rule && prior.component === obligation.component && (prior.contextId ?? context.contextId) === (obligation.contextId ?? context.contextId))) scalarObligations.push(obligation);
      }
    };
    if (selected.kind === 'original-generated' || selected.kind === 'builtin' && selected.name.local !== 'anyType' || selected.kind === 'component' && selected.node.kind === 'simpleType') {
      const description = scalar.describe(type, node.id);
      if (description.kind !== 'checked') return description;
      if (description.value.primitive === 'NOTATION' && !description.value.layers.some(layer => layer.facets.some(facet => facet.name === 'enumeration'))) return fail('enumeration-required-notation', 'NOTATION cannot be used directly as a declared datatype');
      remember(description.obligations);typed.add(description.typeDependencies);
    }
    let constraint: AssessedSchemaOperand | undefined;
    if (node.value) {
      let reference: Reference = type;
      if (selected.kind === 'builtin' && selected.name.local === 'anyType') reference = {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anySimpleType'}};
      else if (selected.kind === 'component' && selected.node.kind === 'complexType') {
        const raw = context.rawTypeProperties(selected.node.id);
        if (!raw && !context.sourceNode(selected.node.id)) return fail('missing-type-component-properties', 'Abstract helper type requires explicit component properties', 'unresolved');
        const simple = raw ? raw.content.kind === 'simple' : selected.node.derivation?.contentKind === 'simple';
        if (!simple) {
        if (!(raw ? raw.content.kind === 'mixed' : selected.node.mixed)) return fail('e-props-correct.2', 'Element value constraints require simple or mixed content');
        obligations.push('element-default-mixed-emptiable:' + selected.node.id);
        reference = {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'string'}};
        }
      }
      const value = constraintValue(context, node, reference);
      if (value.kind !== 'checked') return value;
      constraint = value.constraint;
      remember(value.scalarObligations); typed.add(value.typeDependencies);
    }
    const owned=context.budget.freeze(context.budget.snapshot({kind:'checked' as const,component:id,contextId:context.contextId,
      authority:'XSD10-declaration-properties-v1' as const,constraint,obligations,scalarObligations}));
    const typeDependencies=typed.snapshot();context.budget.chargeWork(24);return Object.freeze({...owned,typeDependencies,identityConstraintDependencies});
  });
}
