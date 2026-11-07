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

export const COMPONENT_CORRESPONDENCE = 'dated-XSD-2004-components-v1' as const;
export interface ComponentCorrespondence {
  readonly kind: 'component-correspondence'; readonly basis: typeof COMPONENT_CORRESPONDENCE;
  readonly scope: 'ordinary-source-components';
  readonly interpretations: number; readonly constructedContexts: number; readonly usage: ResolverUsage;
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
const contextual = new Set(['QName', 'NOTATION', 'ID', 'IDREF', 'IDREFS', 'ENTITY', 'ENTITIES', 'anyType', 'anySimpleType']);

/** Audit a closed representation fragment after whole native construction; this is not a second schema checker.
 * @remarks Source syntax/values and component legality remain the native S4S, construction and aggregate owners.
 *   This sufficient route excludes redefine/chameleon, identity/substitution, non-string unions and wider faceted families,
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
  const outside = (rule: string, node?: SyntaxElement): ComponentCorrespondenceResult => {
    budget.chargeWork(64 + rule.length * 4);
    return Object.freeze({kind: 'inconclusive-correspondence', rule, ...(node ? {path: node.source.path} : {}), usage: Object.freeze({...budget.usage()})});
  };
  return budget.guard(() => {
    check();
    if (!construction.nativeEstablished) return outside('native-construction-unestablished');
    if (!input.schemas.length) return outside('no-schema-interpretation');
    for (const schema of input.schemas) {
      check(); budget.chargeWork(128 + schema.targetNamespace.length * 4);
      if (schema.targetNamespace === XSD_NAMESPACE || schema.targetNamespace === 'http://www.w3.org/2000/xmlns/') return outside('system-namespace-unqualified', schema.syntax);
      if (schema.context.kind === 'include' && syntaxAttribute(schema.syntax, 'targetNamespace') === undefined && schema.targetNamespace !== '') return outside('chameleon-interpretation', schema.syntax);
      const stack: {node: SyntaxElement; parent?: SyntaxElement}[] = [{node: schema.syntax}];
      while (stack.length) {
        check(); const {node, parent} = stack.pop()!;
        budget.chargeWork(96 + node.attributes.length * 32 + node.children.length * 8);
        if (node.name.namespace !== XSD_NAMESPACE || !forms.has(node.name.local)) return outside('source-form-' + node.name.local, node);
        // @why Annotation contents are data under 2004 S4S; the native document owner already checks their syntax and IDs.
        if (node.name.local === 'annotation') continue;
        if (node.name.local === 'restriction' && parent?.name.local !== 'simpleType') return outside('source-complex-restriction', node);
        for (const attribute of node.attributes) {
          check(); budget.chargeWork(64 + attribute.value.length * 4);
          if (attribute.name.namespace !== '') return outside('foreign-source-attribute', node);
          if (attribute.name.local === 'substitutionGroup') return outside('source-substitution', node);
          if (['type', 'base', 'itemType', 'memberTypes'].includes(attribute.name.local)) {
            const words = attribute.name.local === 'memberTypes' ? attribute.value.trim().split(/[\t\r\n ]+/) : [attribute.value];
            for (const word of words) {
              check();
              const name = resolveLexicalQName(word, node);
              if (name.namespace === XSD_NAMESPACE && (!isBuiltinType(name.local) || contextual.has(name.local))) return outside('scalar-correspondence-scope', node);
            }
          }
        }
        if (['element', 'attribute'].includes(node.name.local) && syntaxAttribute(node, 'type') === undefined && syntaxAttribute(node, 'ref') === undefined
          && !syntaxElements(node).some(child => child.name.namespace === XSD_NAMESPACE && ['simpleType', 'complexType'].includes(child.name.local))) return outside('implicit-opaque-declaration-type', node);
        for (const child of syntaxElements(node)) {check(); stack.push({node: child, parent: node});}
      }
    }
    // @why #422 audits all actual named/inline/inherited scalar components after whole native formation.
    //   Native plans own flattened member order, QName resolution, facets and obligations; syntax alone grants no receipt.
    const scalar = scalarSchemaAssessment(schemaScalarContext(actual));
    for (const id of actual.members) {
      check(); const found = actual.lookup(id);
      if (found.kind !== 'found' || found.node.kind !== 'simpleType') continue;
      const owner = found.node, plan = scalar.ensure({kind: 'local', target: id}, owner);
      if (plan.obligations?.length) return outside('scalar-source-obligations');
      if (plan.variety === 'union') {
        for (const reference of plan.members ?? []) {
          check(); const member = scalar.ensure(reference, owner);
          if (member.variety !== 'atomic' || member.primitive !== 'string' || member.obligations?.length)
            return outside('scalar-union-correspondence-scope');
        }
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
      usage: Object.freeze({...budget.usage()})});
    issued.set(receipt, construction);
    return receipt;
  });
}
