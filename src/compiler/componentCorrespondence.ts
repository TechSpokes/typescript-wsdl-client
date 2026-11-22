/** Sufficient dated correspondence for ordinary source components without endpoint-shadowing witnesses. */
import type {SchemaInput} from '../loader/schemaInput.js';
import {resolveLexicalQName, syntaxAttribute, syntaxElements, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import type {SyntaxElement} from '../loader/orderedSyntax.js';
import {isBuiltinType} from './canonicalGraph.js';
import {inspectNativeSourceConstruction} from './checkedSourcePreparation.js';
import type {NativeSourceConstruction} from './checkedSourcePreparation.js';
import type {ResourceLimitFailure, ResolverUsage} from './semanticBudget.js';
import {assertSimpleExtensionConstruction} from './finiteRe01Verification.js';
import {scalarSchemaAssessment} from './scalarSchemaAssessment.js';
import {schemaScalarContext} from './schemaScalarContext.js';
import {componentUnionRepresentation} from './projectionScalar.js';
import {assertFiniteRe01Frontier, type FiniteRe01Frontier} from './finiteRe01Verification.js';
import type {SemanticContext} from './semanticContext.js';

export const COMPONENT_CORRESPONDENCE = 'dated-XSD-2004-components-v1' as const;
export interface ComponentCorrespondence {
  readonly kind: 'component-correspondence'; readonly basis: typeof COMPONENT_CORRESPONDENCE;
  readonly scope: 'ordinary-source-components';
  readonly interpretations: number; readonly constructedContexts: number; readonly usage: ResolverUsage;
  readonly scopedQName?: true;
}
export type ComponentCorrespondenceResult = ComponentCorrespondence | ResourceLimitFailure |
  Readonly<{kind: 'inconclusive-correspondence'; rule: string; path?: string; usage: ResolverUsage}>;
const issued = new WeakMap<ComponentCorrespondence, NativeSourceConstruction>();
/** Receipt identity binds correspondence to the exact fresh native construction, never a diagnostic digest. */
export function inspectComponentCorrespondence(value: ComponentCorrespondence, construction: NativeSourceConstruction): ComponentCorrespondence {
  if (issued.get(value) !== construction) throw new TypeError('Fresh matching component correspondence required');
  inspectNativeSourceConstruction(construction);
  return value;
}

const forms = new Set(['schema', 'import', 'include', 'annotation', 'complexType', 'simpleType', 'complexContent', 'simpleContent',
  'extension', 'restriction', 'enumeration', 'list', 'union', 'length', 'minLength', 'maxLength', 'whiteSpace', 'pattern',
  'minInclusive', 'maxInclusive', 'minExclusive', 'maxExclusive', 'totalDigits', 'fractionDigits',
  'element', 'attribute', 'attributeGroup', 'sequence', 'choice', 'all', 'group', 'any', 'anyAttribute']);
const contextual = new Set(['NOTATION', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'anyType', 'anySimpleType']);

function ordinarySyntax(root: SyntaxElement, step: () => void, charge: (amount: number) => void,
  scope: 'whole' | 'closed-declaration' | 'closed-schema-shell' = 'whole') {
  const closed = scope !== 'whole';
  const stack: {node: SyntaxElement; parent?: SyntaxElement}[] = [{node: root}];
  while (stack.length) {
    step(); const {node, parent} = stack.pop()!;
    charge(96 + node.attributes.length * 32 + node.children.length * 8);
    const refuse = (rule: string) => ({rule, path: node.source.path});
    if (node.name.namespace !== XSD_NAMESPACE || !forms.has(node.name.local)) return refuse('source-form-' + node.name.local);
    if (node.name.local === 'annotation') continue;
    if (closed && ['any', 'anyAttribute'].includes(node.name.local)) return refuse('operation-wildcard-dependency');
    if (node.name.local === 'restriction' && parent?.name.local !== 'simpleType') return refuse('source-complex-restriction');
    for (const attribute of node.attributes) {
      step(); charge(64 + attribute.value.length * 4);
      if (attribute.name.namespace !== '') return refuse('foreign-source-attribute');
      if (attribute.name.local === 'substitutionGroup') return refuse('source-substitution');
      if (!['type', 'base', 'itemType', 'memberTypes'].includes(attribute.name.local)) continue;
      const words = attribute.name.local === 'memberTypes' ? attribute.value.trim().split(/[\t\r\n ]+/) : [attribute.value];
      for (const word of words) {
        step(); const name = resolveLexicalQName(word, node);
        if (name.namespace === XSD_NAMESPACE && (!isBuiltinType(name.local) || contextual.has(name.local) || closed && name.local === 'QName'))
          return refuse('scalar-correspondence-scope');
      }
    }
    if (['element', 'attribute'].includes(node.name.local) && syntaxAttribute(node, 'type') === undefined && syntaxAttribute(node, 'ref') === undefined
      && !syntaxElements(node).some(child => child.name.namespace === XSD_NAMESPACE && ['simpleType', 'complexType'].includes(child.name.local))) return refuse('implicit-opaque-declaration-type');
    for (const child of syntaxElements(node)) {
      step();
      if (scope === 'closed-schema-shell' && node === root && !['annotation', 'import', 'include'].includes(child.name.local)) continue;
      stack.push({node: child, parent: node});
    }
  }
}

/** Assesses the original declaration syntax reached by a closed native operation proof. */
export function checkScopedComponentCorrespondence(input: SchemaInput, actual: SemanticContext,
  frontier: FiniteRe01Frontier, check: () => void): {rule: string; path?: string} | undefined {
  assertFiniteRe01Frontier(actual, frontier);
  const charge = actual.budget.chargeWork;
  if (frontier.identityConstraints.length || frontier.scalarSlots.length) return {rule: 'operation-contextual-dependencies'};
  const original = new Set<string>();
  const key = ({uri, path}: SyntaxElement['source']) => JSON.stringify([uri, path]);
  for (const receipt of frontier.components) {
    check();
    let node = actual.sourceNode(receipt.component);
    if (!node || receipt.standardDependencies.length || receipt.identityConstraintDependencies.length) return {rule: 'operation-source-dependencies'};
    if (node.context.chameleon) return {rule: 'chameleon-interpretation', path: node.context.source.path};
    if (node.context.effectiveNamespace === XSD_NAMESPACE || node.context.effectiveNamespace === 'http://www.w3.org/2000/xmlns/')
      return {rule: 'system-namespace-unqualified', path: node.context.source.path};
    if (node.kind === 'attributeWildcard' || node.kind === 'particle' && node.term.kind === 'any') return {rule: 'operation-wildcard-dependency'};
    if (node.kind === 'element' && actual.incomingAffiliates(node.id).length) return {rule: 'operation-substitution-dependency'};
    while (node.identity.kind === 'scoped') {
      check(); const parent = actual.sourceNode(node.identity.owner);
      if (!parent) return {rule: 'operation-source-owner'};
      node = parent;
    }
    charge(node.context.source.path.length + node.context.source.uri.length + 4);
    original.add(key(node.context.source));
  }
  const matched = new Set<string>(), shells = new Set<string>();
  for (const schema of input.schemas) {
    check();
    for (const declaration of syntaxElements(schema.syntax)) {
      check();
      const identity = key(declaration.source);
      if (!original.has(identity)) continue;
      matched.add(identity);
      shells.add(schema.key);
      const refusal = ordinarySyntax(declaration, check, charge, 'closed-declaration');
      if (refusal) return refusal;
    }
  }
  if (original.size !== matched.size) return {rule: 'operation-source-correspondence'};
  const schemas = new Map(input.schemas.map(schema => [schema.key, schema]));
  const incoming = new Map<string, string[]>();
  for (const edge of input.edges) {
    check();
    if (edge.kind === 'wsdl-import' || !edge.to) continue;
    const parents = incoming.get(edge.to);
    if (parents) parents.push(edge.from);
    else incoming.set(edge.to, [edge.from]);
  }
  // @why A declaration-free include or import can control the selected schema's interpretation.
  for (const id of shells) {
    check(); const schema = schemas.get(id);
    if (!schema) return {rule: 'operation-schema-context'};
    if (schema.context.kind === 'include' && syntaxAttribute(schema.syntax, 'targetNamespace') === undefined && schema.targetNamespace !== '')
      return {rule: 'chameleon-interpretation', path: schema.syntax.source.path};
    const refusal = ordinarySyntax(schema.syntax, check, charge, 'closed-schema-shell');
    if (refusal) return refusal;
    for (const parent of incoming.get(id) ?? []) {check(); shells.add(parent);}
  }
  const scalar = scalarSchemaAssessment(schemaScalarContext(actual));
  for (const {component} of frontier.components) {
    check(); const found = actual.lookup(component);
    if (found.kind !== 'found' || found.node.kind !== 'simpleType') continue;
    const plan = scalar.ensure({kind: 'local', target: component}, found.node);
    if (plan.obligations?.length || plan.variety === 'union' || plan.variety === 'atomic' && plan.primitive === 'QName')
      return {rule: 'operation-scalar-correspondence'};
    if (plan.variety === 'atomic' && plan.layers.some(layer => layer.facets.some(facet => !['enumeration', 'whiteSpace'].includes(facet.name)))
      && plan.primitive !== 'string' && plan.primitive !== 'decimal') return {rule: 'scalar-facet-correspondence-scope'};
  }
}

/** Audit a closed representation fragment after whole native construction; this is not a second schema checker.
 * @remarks Source syntax/values and component legality remain the native S4S, construction and aggregate owners.
 *   This sufficient route excludes redefine/chameleon, identity/substitution and wider faceted families,
 *   source complex restrictions, contextual/explicit ur-type references, foreign attributes and endpoint-shadowing witnesses.
 *   Endpoint-shadowing witnesses remain inconclusive until component-valued TYPE/SCOPE interpretation is established.
 * @returns An authenticated correspondence or an inconclusive scope/resource result; never a schema-invalid judgment.
 * @throws TypeError For copied/foreign construction or source. Cancellation callbacks propagate unchanged.
 */
export function checkComponentCorrespondence(input: SchemaInput, supplied: NativeSourceConstruction,
  options: Readonly<{check?: () => void}> = {}): ComponentCorrespondenceResult {
  const construction = inspectNativeSourceConstruction(supplied, input);
  const actual = construction.request.actual, {budget} = actual;
  const check = () => {options.check?.(); budget.chargeWork();};
  const outside = (rule: string, path?: string): ComponentCorrespondenceResult => {
    budget.chargeWork(64 + rule.length * 4);
    return Object.freeze({kind: 'inconclusive-correspondence', rule, ...(path ? {path} : {}), usage: Object.freeze({...budget.usage()})});
  };
  return budget.guard(() => {
    check();
    if (!construction.nativeEstablished) return outside('native-construction-unestablished');
    if (!input.schemas.length) return outside('no-schema-interpretation');
    for (const schema of input.schemas) {
      check(); budget.chargeWork(128 + schema.targetNamespace.length * 4);
      if (schema.targetNamespace === XSD_NAMESPACE || schema.targetNamespace === 'http://www.w3.org/2000/xmlns/') return outside('system-namespace-unqualified', schema.syntax.source.path);
      if (schema.context.kind === 'include' && syntaxAttribute(schema.syntax, 'targetNamespace') === undefined && schema.targetNamespace !== '') return outside('chameleon-interpretation', schema.syntax.source.path);
      const refusal = ordinarySyntax(schema.syntax, check, budget.chargeWork);
      if (refusal) return outside(refusal.rule, refusal.path);
    }
    // @why #422 audits all actual named/inline/inherited scalar components after whole native formation.
    //   Native plans own flattened member order, QName resolution, facets and obligations; syntax alone grants no receipt.
    const scalar = scalarSchemaAssessment(schemaScalarContext(actual));
    let scopedQName = false;
    for (const id of actual.members) {
      check(); const found = actual.lookup(id);
      if (found.kind !== 'found' || found.node.kind !== 'simpleType') continue;
      const owner = found.node, plan = scalar.ensure({kind: 'local', target: id}, owner);
      if (plan.obligations?.length) return outside('scalar-source-obligations');
      if (plan.variety === 'union') {
        const representation = componentUnionRepresentation(plan, reference => {
          check(); return scalar.ensure(reference, owner);
        }, true);
        if (!representation) return outside('scalar-union-correspondence-scope');
        if (representation === 'scoped') scopedQName = true;
      }
      if (plan.variety === 'atomic' && plan.layers.some(layer => layer.facets.some(facet => !['enumeration', 'whiteSpace'].includes(facet.name)))
        && plan.primitive !== 'string' && plan.primitive !== 'decimal')
        return outside('scalar-facet-correspondence-scope');
    }
    const closure = construction.closure;
    const proof = 'proof' in closure ? closure.proof : [];
    if (proof.length) return outside('constructed-component-interpretation-unestablished');
    if ('actualScalarSlots' in closure && closure.actualScalarSlots.length) return outside('generated-scalar-correspondence');
    let constructedContexts = 0;
    if ('simple' in closure) {
      assertSimpleExtensionConstruction(actual, closure);
      if (closure.kind !== 'checked-simple-extension-construction' || closure.unresolved.length)
        return outside('simple-extension-premises-unestablished');
      if (closure.complex.frontier.scalarSlots.length || closure.simple.some(item => item.frontier.scalarSlots.length))
        return outside('generated-scalar-correspondence');
      // @why cos-ct-extends.1.5 asks for an in-principle relation, not replacement of the stored actual base.
      //   Finite allocation keeps original identities and then binds TYPE/SCOPE edges unchanged. Each E owns
      //   its new local attributes/uses. Its checked extension from anySimpleType and D's paired restriction
      //   clauses 1-4 and 5.2 establish the two-step relation on D's unchanged effective properties. The exact
      //   simple-extension spine, whole-actual and fresh-middle closure, and all typed/scalar debts are native
      //   prerequisites of this authenticated receipt. Source/S4S/builtin/property restrictions above still apply.
      constructedContexts = closure.simple.length;
    }
    check(); budget.chargeWork(256);
    const receipt: ComponentCorrespondence = Object.freeze({kind: 'component-correspondence', basis: COMPONENT_CORRESPONDENCE,
      scope: 'ordinary-source-components', interpretations: input.schemas.length, constructedContexts,
      ...(scopedQName ? {scopedQName: true as const} : {}),
      usage: Object.freeze({...budget.usage()})});
    issued.set(receipt, construction);
    return receipt;
  });
}
