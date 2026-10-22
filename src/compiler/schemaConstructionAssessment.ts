/** Concrete local component premises; the finite proof driver owns their closure. */
import type {GraphNode, NodeId, Reference} from './canonicalGraph.js';
import {containedNodes} from './graphTraversal.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {checkActualSchemaSyntax} from './schemaSyntaxAssessment.js';
import {checkDeclaration} from './schemaDeclarationPrimitives.js';
import {assessAttributeUse, assessRawAttributeUses, assessCandidateAttributeUses, assessSourceAttributeUses} from './schemaAttributeUses.js';
import type {AttributeResult} from './schemaAttributeUses.js';
import {createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {ScalarResult} from './schemaScalarKernel.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import {checkImmediateTypeFinal, immediateTypeBase} from './schemaTypeRelations.js';
import type {RelationResult} from './schemaTypeRelations.js';
import {deriveActualComplexContent, deriveRawComplexContent, deriveOriginalComplexPropertyContent, deriveOriginalContentSubtree, particleContentNode, deriveBuiltinAnyTypeContent, deriveModelGroupContent, originalUrWildcardSource} from './complexTypeContent.js';
import type {ParticleContentView} from './complexTypeContent.js';
import {validateRawComplexTypeProperties} from './re01TypePropertyValidation.js';
import {isXmlNCName, XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {wildcardNamespaces, namespaceExpressible} from './wildcardAlgebra.js';
import {readParticleWildcard} from './schemaParticleWildcardProperties.js';
import {SemanticError} from './resolveCanonicalGraph.js';
import {occurrenceAlgebra} from './occurrenceAnalysis.js';
import {checkComplexParticleContent} from './particleLocalAssessment.js';
import {prepareSemanticParticleView} from './particleSemanticView.js';
import {checkParticleRestriction} from './particleRestriction.js';
import {checkRawParticleExtension} from './particleExtension.js';
import {assertCandidateCorrespondence} from './re01CandidateCorrespondence.js';
import type {CorrespondenceReceipt} from './re01CandidateCorrespondence.js';
import type {SemanticTypeDependency, SemanticTypeReference} from './semanticTypeReference.js';
import {declaredType, resolveSemanticType, semanticTypeKey} from './schemaTypeIdentity.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';
import {collectIdentityConstraintDependencies} from './schemaIdentityConstraints.js';
import type {IdentityConstraintDependency} from './schemaIdentityConstraints.js';

export type ConstructionObligation = Readonly<{rule: string; component: NodeId; contextId: string}>;
export type ComponentConstructionReceipt = Readonly<{
  kind: 'checked'; authority: 'XSD10-component-construction-v1'; contextId: string; component: NodeId;
  scope: 'local-component-premises' | 'original-source-syntax-only'; receipts: readonly object[];
  dependencies: readonly NodeId[]; builtinDependencies: readonly string[];
  typeDependencies: readonly SemanticTypeDependency[];
  identityConstraintDependencies: readonly IdentityConstraintDependency[];
  re01?: Readonly<{target: NodeId; ancestor: SemanticTypeReference; primitive: boolean}>;
  obligations: readonly ConstructionObligation[];
  discharged: readonly ConstructionObligation[];
}>;
export type ConstructionFailure = Readonly<{kind: 'invalid-schema' | 'candidate-rejected' | 'unsupported-capability' | 'unresolved';
  rule: string; component: NodeId; message: string; contextId?: string}>;
export type ComponentConstructionResult = ComponentConstructionReceipt | ConstructionFailure | ResourceLimitFailure;
const issued = new WeakMap<ComponentConstructionReceipt, SemanticContext>();
class ConstructionAbort extends Error {constructor(readonly result: ConstructionFailure | ResourceLimitFailure) {super(result.kind);}}
const ANY: Reference = Object.freeze({kind: 'builtin', name: Object.freeze({namespace: XSD_NAMESPACE, local: 'anyType'})});
const local = (target: NodeId): Reference => ({kind: 'local', target});

/** Original syntax under a prohibited use/zero particle has no local component. */
export function isAbsentOriginalSourceComponent(context: SemanticContext, id: NodeId): boolean {
  assertSemanticContext(context);
  if (context.kind !== 'actual') return false;
  return context.originalSourceComponentAbsent(id);
}

export function assertComponentConstruction(context: SemanticContext, receipt: ComponentConstructionReceipt): void {
  assertSemanticContext(context);
  if (issued.get(receipt) !== context) throw new TypeError('Unauthenticated or foreign component construction receipt');
}

export function checkComponentConstruction(context: SemanticContext, id: NodeId,
  options: Readonly<{correspondence?: CorrespondenceReceipt}> = {}): ComponentConstructionResult {
  assertSemanticContext(context);
  const b = context.budget;
  return b.guard(() => {
    b.chargeWork(60);
    if (!options || typeof options !== 'object') throw new TypeError('Construction options require data');
    const field = Object.getOwnPropertyDescriptor(options, 'correspondence');
    if (field && !('value' in field)) throw new TypeError('Construction options require data');
    const correspondence = field?.value as CorrespondenceReceipt | undefined;
    if (correspondence) assertCandidateCorrespondence(context, correspondence);
    const fail = (rule: string, message: string, kind: ConstructionFailure['kind'] = 'invalid-schema',
      originContextId?: string, component = id): never => {
      b.chargeWork(12 + rule.length + message.length + component.length + (originContextId?.length ?? 0));
      throw new ConstructionAbort(Object.freeze({kind: kind === 'invalid-schema' && context.kind === 'candidate'
        && (originContextId === undefined || originContextId === context.contextId) ? 'candidate-rejected' : kind,
        rule, component, message, ...(originContextId === undefined ? {} : {contextId: originContextId})}));
    };
    try {
      b.chargeWork(12);
      const found = context.lookup(id);
      if (found.kind !== 'found') return fail('component-membership', 'Component is unavailable in the selected context', 'unresolved');
      const node = found.node, receipts: object[] = [], dependencies = new Set<NodeId>(), builtins = new Set<string>();
      const typeDependencies = collectSemanticTypeDependencies(context);
      const identityConstraintDependencies = collectIdentityConstraintDependencies(context);
      const obligations: ConstructionObligation[] = [];
      const requireNode = (target: NodeId): GraphNode => {
        b.chargeWork(2 + target.length);
        const lookup = context.lookup(target);
        if (lookup.kind !== 'found') return fail('component-dependency', 'A required component is unavailable', 'unresolved');
        dependencies.add(target); return lookup.node;
      };
      const reference = (ref: SemanticTypeReference): GraphNode | undefined => {
        if (ref.kind === 'original-generated') {
          const resolved = resolveSemanticType(context, ref);
          if (resolved.kind !== 'original-generated') return fail('scalar-slot-membership', 'A required scalar slot is unavailable', 'unresolved');
          b.chargeWork(4);
          typeDependencies.add([{contextId: context.contextId, type: resolved.identity}]);
          return undefined;
        }
        const lookup = context.resolve(ref);
        b.chargeWork(3);
        if (lookup.kind === 'builtin') {b.chargeWork(lookup.name.local.length); builtins.add(lookup.name.local); return undefined;}
        if (lookup.kind !== 'found') return fail('component-dependency', 'A required reference is unavailable', 'unresolved');
        b.chargeWork(lookup.node.id.length); dependencies.add(lookup.node.id); return lookup.node;
      };
      const obligation = (rule: string, component = id, contextId = context.contextId): void => {
        b.chargeWork(6 + rule.length + component.length + contextId.length); obligations.push({rule, component, contextId});
      };
      const scalarObligations = (items: readonly ScalarObligation[]): void => {
        for (const item of items) {
          b.chargeWork();
          const ownerContext = item.contextId ?? context.contextId;
          if (ownerContext !== context.contextId && ownerContext !== context.originalContext().contextId)
            return fail('scalar-obligation-context', 'Scalar premise has no authenticated interpretation context', 'unresolved');
          if (ownerContext === context.contextId && item.rule === 'raw-simple-content-derivation-validity' && item.component !== id) requireNode(item.component);
          else obligation(item.rule, item.component, ownerContext);
        }
      };
      const declarationObligation = (pending: string, owner: NodeId): void => {
        if (pending === 'declared-type-component-validity') return;
        const rules = ['element-default-mixed-emptiable', 'simple-content-base-mixed-emptiable',
          'raw-simple-content-derivation-validity', 'raw-simple-facet-restriction-validity'] as const;
        for (const rule of rules) {
          b.chargeWork(2 + rule.length + pending.length);
          if (!pending.startsWith(rule + ':')) continue;
          const component = pending.slice(rule.length + 1);
          if (rule === 'element-default-mixed-emptiable') {
            requireNode(component);
            const mapped = content(component);
            if (mapped.content.kind !== 'mixed') return fail('e-props-correct.2', 'Element value constraint requires simple or mixed content');
            const view = checked(prepareSemanticParticleView(context, mapped, 'restriction'));
            if (!view.view.root.summary.schemaEmptiable) return fail('e-props-correct.2', 'Mixed element value constraint requires formal particle emptiability');
          } else scalarObligations([{rule, component}]);
          return;
        }
        obligation(pending, owner);
      };
      const checked = <T extends {kind: string}>(result: T): Extract<T, {kind: 'checked'}> => {
        if (result.kind === 'resource-limit') throw new ConstructionAbort(result as T & ResourceLimitFailure);
        if (result.kind !== 'checked') {
          const failed = result as T & {rule: string; message?: string; kind: string; contextId?: string; component?: NodeId};
          // Scalar owners distinguish an intrinsically invalid original type
          // from a candidate operand merely evaluated in that original type.
          // Preserve the former's owning context and component; do not infer
          // actual invalidity from the datatype lookup context alone.
          if (failed.contextId !== undefined && failed.contextId !== context.contextId
            && failed.contextId !== context.originalContext().contextId)
            return fail('construction-failure-context', 'Local failure has no authenticated originating context', 'unresolved');
          return fail(failed.rule, failed.message ?? 'Required local owner did not check its premise',
            failed.kind === 'unsupported-capability' ? 'unsupported-capability' : failed.kind === 'unresolved' ? 'unresolved'
              : failed.kind === 'candidate-rejected' ? 'candidate-rejected' : 'invalid-schema',
            failed.contextId, failed.contextId === undefined ? id : failed.component ?? id);
        }
        if ('typeDependencies' in result) typeDependencies.add((result as T & {typeDependencies: readonly SemanticTypeDependency[]}).typeDependencies);
        if ('identityConstraintDependencies' in result) identityConstraintDependencies.add((result as T & {identityConstraintDependencies: readonly IdentityConstraintDependency[]}).identityConstraintDependencies);
        b.chargeWork(); receipts.push(result); return result as Extract<T, {kind: 'checked'}>;
      };
      const scalar = createSchemaScalarKernel(context);
      const scalarResult = <T>(result: ScalarResult<T>): T => {
        const value = checked(result); scalarObligations(value.obligations); return value.value;
      };
      const relation = <T>(result: RelationResult<T>): T => {
        const value = checked(result);
        for (const dependency of value.dependencies) {
          b.chargeWork(2 + dependency.length);
          if (dependency.startsWith('builtin:')) builtins.add(dependency.slice(8)); else requireNode(dependency);
        }
        for (const pending of value.obligations) if (pending !== 'component-validity') obligation(pending);
        return value.value;
      };
      const attributes = (result: AttributeResult): void => {
        const value = checked(result);
        scalarObligations(value.scalarObligations);
        for (const use of value.value.schemaOperands) {
          b.chargeWork(2); requireNode(use.declaration.id); reference(declaredType(context, use.declaration));
        }
        for (const declaration of value.value.declarations) {
          b.chargeWork(); requireNode(declaration.component);
          scalarObligations(declaration.scalarObligations);
          for (const pending of declaration.obligations) {
            b.chargeWork(); declarationObligation(pending, declaration.component);
          }
        }
        // The aggregate driver supplies type validity and original/raw
        // correspondence. Source syntax is checked here and on generated deps.
      };
      if (context.kind === 'actual') checked(checkActualSchemaSyntax(context, id));
      if (isAbsentOriginalSourceComponent(context, id)) {
        // Referenced globals remain semantic components even when their source
        // use maps to nothing. Other hidden local syntax is checked separately.
        for (const slot of context.references(id)) {
          if (slot.reference.kind === 'original-generated') return fail('source-only-scalar-slot',
            'Suppressed original source cannot supply a semantic scalar slot', 'unresolved');
          b.chargeWork(); const target = context.resolve(slot.reference);
          if (target.kind === 'found' && target.node.identity.kind === 'global') requireNode(target.node.id);
        }
        b.chargeWork(20 + receipts.length + dependencies.size);
        const receipt: ComponentConstructionReceipt = Object.freeze({kind: 'checked', authority: 'XSD10-component-construction-v1',
          scope: 'original-source-syntax-only', contextId: context.contextId, component: id, receipts: Object.freeze(receipts),
          dependencies: Object.freeze([...dependencies]), builtinDependencies: Object.freeze([]), typeDependencies: typeDependencies.snapshot(),
          identityConstraintDependencies: identityConstraintDependencies.snapshot(),
          obligations: Object.freeze([]), discharged: Object.freeze([])});
        b.chargeWork(); issued.set(receipt, context); return receipt;
      }
      if (context.kind === 'candidate' && node.kind === 'particle' && node.occurs.max === '0') {
        occurrenceAlgebra(b.chargeWork).validate(node.occurs);
        return fail('p-props-correct', 'A particle component must have a positive maximum occurrence');
      }
      if (context.kind === 'candidate' && context.originalSourceComponentAbsent(id)) {
        // This frozen factory field records exact source binding, without a NOTATION lookup.
        if (context.notationUniverse !== 'source-bound') return fail('original-source-component-admission',
          'Authentic original component membership has not been established', 'unresolved', context.contextId);
        return fail('original-source-only-component', 'Retained source-only syntax does not denote an original semantic component',
          'candidate-rejected', context.contextId);
      }
      if (node.identity.kind === 'global') {
        b.chargeWork(node.identity.name.local.length + 2);
        if (!isXmlNCName(node.identity.name.local)) return fail('component-name', 'Global component name must be an XML NCName');
      }
      const rawComplex = node.kind === 'complexType' ? context.rawTypeProperties(id) : undefined;
      const originalComplex = node.kind === 'complexType' ? context.originalComplexPropertySource(id) : undefined;
      const originalContent = originalComplex ? checked(deriveOriginalComplexPropertyContent(context, id)).view : undefined;
      const sourceContent = originalContent ?? (rawComplex && 'particle' in rawComplex.content && rawComplex.content.original
        ? checked(deriveRawComplexContent(context, id)).view : undefined);
      const rawSimple = node.kind === 'simpleType' ? context.rawSimpleTypeProperties(id) : undefined;
      const rawGroup = node.kind === 'attributeGroup' ? context.rawAttributeGroupProperties(id) : undefined;
      const particleChildren = node.kind === 'particle' && 'children' in node.term
        ? context.originalCompositorChildren(id) ?? node.term.children : undefined;
      const content = (target: NodeId): ParticleContentView => checked(context.kind === 'actual'
        ? deriveActualComplexContent(context, target) : deriveOriginalComplexPropertyContent(context, target)).view;
      const particleLegal = (view: ParticleContentView): void => {
        const legal = checked(checkComplexParticleContent(context, view));
        if (!legal.value) return fail(legal.failedRule ?? 'particle-local-legality', 'Particle content violates its local constraints');
      };
      const borrowedParticle = (target: NodeId): GraphNode | undefined => {
        const handle = context.originalUrWildcard(target);
        if (!handle) return undefined;
        const leaf = originalUrWildcardSource(context.originalContext(), handle);
        // Preparation authenticates this immutable terminal leaf. It is not
        // an F component, and borrowing its provenance never requires FULL(owner).
        occurrenceAlgebra(b.chargeWork).validate(leaf.occurs);
        if (leaf.term.kind !== 'any' || leaf.occurs.min !== '0' || leaf.occurs.max !== 'unbounded'
          || leaf.term.wildcard.namespace.value !== '##any' || leaf.term.wildcard.processContents !== 'lax')
          return fail('original-ur-wildcard', 'Invalid borrowed native UR wildcard', 'unresolved', undefined, target);
        return leaf;
      };
      if (sourceContent) {
        if (originalComplex) {
          b.chargeWork(100 + context.contextId.length + context.originalContext().contextId.length + id.length);
          receipts.push(Object.freeze({kind: 'checked-original-input', authority: 'XSD10-original-complex-input-v1',
            contextId: context.contextId, originalContextId: context.originalContext().contextId, component: id,
            scope: 'guarded-original-particle-empty-input', remaining: Object.freeze(['actual-source-qualification', 'complete-type-validity'])}));
          reference(originalComplex.derivation?.base ?? ANY);
        } else if (rawComplex) {
          reference(rawComplex.derivation.base);
          for (const use of rawComplex.attributeUses) {b.chargeWork(); requireNode(use);}
        }
        const pending = 'particle' in sourceContent.content ? [sourceContent.content.particle] : [], seen = new Set<NodeId>();
        while (pending.length) {
          b.chargeWork(4); const target = pending.pop()!;
          if (seen.has(target)) continue; seen.add(target);
          const item = particleContentNode(context, sourceContent, target);
          if (!item) return fail('original-content-frontier', 'Original content dependency is unavailable', 'unresolved', undefined, target);
          const privateParticle = context.lookup(target).kind === 'missing' && sourceContent.synthetic.includes(target);
          if (!privateParticle) {
            if (context.originalSourceComponentAbsent(target) || item.kind === 'particle' && item.occurs.max === '0' && context.sourceNode(target))
              return fail('original-content-source-only', 'Source-only content traversal is not supported', 'unresolved', undefined, target);
            requireNode(target);
          }
          if (item.kind === 'group') {b.chargeWork(); pending.push(item.content); continue;}
          if (item.kind !== 'particle') return fail('original-content-frontier', 'Content edge must denote a particle or group', 'unresolved', undefined, target);
          if (privateParticle) {
            occurrenceAlgebra(b.chargeWork).validate(item.occurs);
            if (item.term.kind === 'sequence' && item.occurs.min === '1' && item.occurs.max === '1') {
              // Exact mapper-owned composition, never a new H component.
            } else if (item.term.kind === 'any' && sourceContent.urTypeWildcards.includes(target)
              && item.occurs.min === '0' && item.occurs.max === 'unbounded'
              && namespaceExpressible(wildcardNamespaces(item.term.wildcard, b.chargeWork), b.chargeWork)
              && item.term.wildcard.processContents === 'lax') {
              // Authenticated native ur wildcard; ordinary fresh wildcards never enter this branch.
            } else return fail('original-content-shape', 'Unsupported private content shape', 'unresolved', undefined, target);
            particleLegal(checked(deriveOriginalContentSubtree(context, sourceContent, target)).view);
          }
          if ('children' in item.term) {
            const children = context.originalCompositorChildren(item.id) ?? item.term.children;
            b.chargeWork(children.length); pending.push(...children);
          }
          else if (item.term.kind === 'group') {
            const group = reference(item.term.reference);
            if (group?.kind !== 'group') return fail('particle-properties', 'Group use must reference a model group');
            b.chargeWork(); pending.push(group.id);
          } else if (item.term.kind === 'element') {
            const declaration = reference(item.term.declaration);
            if (declaration?.kind !== 'element') return fail('particle-properties', 'Element use must reference a declaration');
          }
        }
      } else if (rawComplex) {
        reference(rawComplex.derivation.base);
        for (const use of rawComplex.attributeUses) {b.chargeWork(); requireNode(use);}
        if (rawComplex.content.kind === 'simple' || rawComplex.content.kind === 'opaque-builtin') reference(rawComplex.content.type);
        else if ('particle' in rawComplex.content) requireNode(rawComplex.content.particle);
      } else if (rawSimple) {
        reference(rawSimple.base);
        if (rawSimple.variety.kind === 'list') reference(rawSimple.variety.item);
        else if (rawSimple.variety.kind === 'union') for (const member of rawSimple.variety.members) {b.chargeWork(); reference(member);}
      } else if (rawGroup) {
        for (const use of rawGroup.attributeUses) {b.chargeWork(); requireNode(use);}
        for (const source of rawGroup.wildcard?.sources ?? []) {b.chargeWork(); requireNode(source);}
      } else {
        for (const slot of context.references(id)) {b.chargeWork(); reference(slot.reference);}
        if (node.kind === 'complexType' || node.kind === 'attributeGroup') b.chargeWork(node.attributes.length + 2);
        if (node.kind === 'particle' && 'children' in node.term) b.chargeWork(node.term.children.length + 2);
        for (const child of particleChildren ?? containedNodes(node)) {
          b.chargeWork();
          if (!(node.kind === 'particle' && 'children' in node.term && borrowedParticle(child))) requireNode(child);
        }
      }
      let re01: ComponentConstructionReceipt['re01'];
      let ownRawSimpleContentChecked = false;
      switch (node.kind) {
        case 'element': case 'attribute': {
          reference(declaredType(context, node));
          const result = checked(checkDeclaration(context, id));
          scalarObligations(result.scalarObligations);
          for (const pending of result.obligations) {
            b.chargeWork(); declarationObligation(pending, id);
          }
          break;
        }
        case 'simpleType':
          scalarResult(scalar.describe(local(id), id));
          if (!relation(checkImmediateTypeFinal(context, local(id)))) return fail('st-props-correct.final', 'Immediate base prohibits this simple derivation');
          break;
        case 'complexType': {
          if (context.kind === 'candidate' && !originalContent) {
            const validation = validateRawComplexTypeProperties(context, id, correspondence);
            if (validation.kind === 'resource-limit') throw new ConstructionAbort(validation);
            if (validation.kind !== 'checked-structure') return fail(validation.rule, 'Raw complex properties are not structurally qualified', validation.kind === 'unresolved' ? 'unresolved' : 'invalid-schema');
            b.chargeWork(); receipts.push(validation);
          }
          const base = rawComplex?.derivation.base ?? node.derivation?.base ?? ANY;
          const method = rawComplex?.derivation.method ?? node.derivation?.kind ?? 'restriction';
          const baseNode = reference(base);
          if (!relation(checkImmediateTypeFinal(context, local(id)))) return fail('ct-props-correct.final', 'Immediate base prohibits this complex derivation');
          const uses = context.kind === 'actual' ? assessSourceAttributeUses(context, id) : assessCandidateAttributeUses(context, id);
          attributes(uses);
          if (originalContent && uses.kind === 'checked') {
            for (const use of uses.value.uses) {b.chargeWork(); requireNode(use.id);}
            for (const source of uses.value.wildcard?.sources ?? []) {b.chargeWork(); requireNode(source);}
          }
          const ownContent = content(id), own = ownContent.content;
          const ownScalar = own.kind === 'simple' ? context.kind === 'actual' ? local(id) : own.type : undefined;
          const baseSimple = base.kind === 'original-generated' || (base.kind === 'builtin' ? base.name.local !== 'anyType' : baseNode?.kind === 'simpleType');
          if (baseNode && baseNode.kind !== 'complexType' && baseNode.kind !== 'simpleType') return fail('ct-props-correct.1', 'Complex base reference must identify a type');
          if (baseSimple) {
            if (method !== 'extension' || own.kind !== 'simple') return fail('cos-ct-extends.2', 'A simple base requires extension with that same simple content');
            const a = scalarResult(scalar.contentIdentity(ownScalar!, id)), z = scalarResult(scalar.contentIdentity(base, id));
            if (b.compareText(a.definition, z.definition) !== 0) return fail('cos-ct-extends.2.1', 'Simple-base extension must preserve exact scalar component identity');
            ownRawSimpleContentChecked = true;
            break;
          }
          const ur = base.kind === 'builtin' && base.name.local === 'anyType';
          const baseContent = baseNode?.kind === 'complexType' ? content(baseNode.id)
            : ur ? checked(deriveBuiltinAnyTypeContent(context, id)).view : undefined;
          const prior = baseContent?.content;
          if (!prior || own.kind === 'opaque-builtin' || prior.kind === 'opaque-builtin')
            return fail('complex-content-properties', 'Complex content comparison requires concrete content properties', 'unresolved');
          const baseScalar = prior?.kind === 'simple' ? context.kind === 'actual' && baseNode ? local(baseNode.id) : prior.type : undefined;
          if (ownScalar) scalarResult(scalar.describe(ownScalar, id));
          if ('particle' in own) particleLegal(ownContent);
          if (method === 'restriction' && ur) ownRawSimpleContentChecked = own.kind === 'simple';
          else if (own.kind === 'simple' && prior?.kind === 'simple') {
            if (method === 'extension') {
              const a = scalarResult(scalar.contentIdentity(ownScalar!, id)), z = scalarResult(scalar.contentIdentity(baseScalar!, id));
              if (b.compareText(a.definition, z.definition) !== 0) return fail('cos-ct-extends.1.4.1', 'Extension must preserve exact simple content identity');
            } else if (!scalarResult(scalar.contentDerivation(ownScalar!, baseScalar!, id)))
              return fail('derivation-ok-restriction.5.2', 'Simple content is not derived from the base content');
            ownRawSimpleContentChecked = true;
          } else if (own.kind === 'empty' && prior?.kind === 'empty') {
            // Exact local empty/empty branches of extension 1.4.2 and restriction 5.3.
          } else if (method === 'restriction' && baseContent && (own.kind === 'simple' && prior?.kind === 'mixed' || own.kind === 'empty' && prior && 'particle' in prior)) {
            const normalizedBase = checked(prepareSemanticParticleView(context, baseContent, 'restriction'));
            if (!normalizedBase.view.root.summary.schemaEmptiable) return fail('derivation-ok-restriction.5', 'This content restriction requires a formally emptiable base particle');
            ownRawSimpleContentChecked = own.kind === 'simple';
            for (let index = obligations.length - 1; index >= 0; index--) {
              b.chargeWork();
              if (obligations[index].rule === 'simple-content-base-mixed-emptiable' && obligations[index].component === baseNode?.id && obligations[index].contextId === context.contextId) obligations.splice(index, 1);
            }
          } else if (method === 'restriction' && baseContent && 'particle' in own && prior && (prior.kind === 'empty' || 'particle' in prior)) {
            if (own.kind === 'mixed' && prior.kind !== 'mixed') return fail('derivation-ok-restriction.5.4', 'Mixed restriction requires mixed base content');
            const derivedView = checked(prepareSemanticParticleView(context, ownContent, 'restriction'));
            const baseView = checked(prepareSemanticParticleView(context, baseContent, 'restriction'));
            const restriction = checked(checkParticleRestriction(context, derivedView.view, baseView.view, {deferScalarObligations: true}));
            scalarObligations(restriction.scalarObligations);
            if (!restriction.value)
              return fail('derivation-ok-restriction.5.4', 'Particle restriction is not satisfied');
          } else if (method === 'extension' && 'particle' in own && prior?.kind === 'empty') {
            // Extension1.4.3.2.1 imposes no nonempty prefix when the base is empty.
          } else if (method === 'extension' && baseContent && 'particle' in own && prior && 'particle' in prior) {
            if (own.kind !== prior.kind) return fail('cos-ct-extends.1.4.3', 'Particle extension must preserve mixed versus element-only variety');
            const extension = checked(checkRawParticleExtension(context, ownContent, baseContent));
            if (!extension.value)
              return fail('cos-particle-extend', 'Raw extension does not preserve the original particle or its exact first member');
            scalarObligations(extension.scalarObligations);
            for (const pending of extension.obligations) {
              b.chargeWork(); if (pending !== 'component-validity') declarationObligation(pending, id);
            }
          } else if (method === 'extension' && (own.kind === 'empty' && prior && 'particle' in prior || own.kind === 'simple' && prior?.kind === 'mixed'))
            return fail('cos-ct-extends.1.4', 'Extension cannot remove or change the base content variety');
          else if (own.kind === 'simple' && prior?.kind !== 'mixed') return fail('complex-content-relation', 'Simple content is incompatible with the base content');
          else if (prior?.kind === 'simple') return fail('complex-content-relation', 'Nonsimple content cannot replace simple base content');
          else return fail('complex-content-relation', 'Content varieties do not satisfy a permitted extension or restriction branch');
          if (method === 'extension') {
            b.chargeWork(4); const seen = new Set<string>();
            let ancestor: SemanticTypeReference = base;
            let primitive = false;
            while (true) {
              const n = reference(ancestor);
              if (ancestor.kind === 'builtin' && ancestor.name.local === 'anyType') {
                primitive = base.kind === 'builtin' && base.name.local === 'anyType';
                re01 = Object.freeze({target: id, ancestor, primitive}); break;
              }
              const next: SemanticTypeReference | undefined = relation(immediateTypeBase(context, ancestor));
              if (!next) return fail('re01-ancestor', 'No ancestor with immediate anyType base is available', 'unresolved');
              if (next.kind === 'builtin' && next.name.local === 'anyType') {
                primitive = baseNode !== undefined && n?.id === baseNode.id;
                re01 = Object.freeze({target: id, ancestor, primitive}); break;
              }
              const key = n?.id ?? (ancestor.kind === 'builtin' ? `builtin:${ancestor.name.local}`
                : ancestor.kind === 'original-generated' ? semanticTypeKey(context, ancestor) : '');
              b.chargeWork(3 + key.length);
              if (seen.has(key)) return fail('ct-props-correct.3', 'Type ancestry is cyclic');
              seen.add(key); ancestor = next;
            }
          }
          break;
        }
        case 'attributeUse': attributes(assessAttributeUse(context, id)); break;
        case 'attributeGroup':
          attributes(context.kind === 'actual' ? assessSourceAttributeUses(context, id) : assessRawAttributeUses(context, id));
          break;
        case 'attributeGroupUse': {
          const target = reference(node.reference);
          if (target?.kind !== 'attributeGroup') return fail('src-attribute-group', 'Attribute group use must reference an attribute group');
          break;
        }
        case 'attributeWildcard': {
          const namespace = wildcardNamespaces(node.wildcard, b.chargeWork);
          if (!namespaceExpressible(namespace, b.chargeWork) || !['strict', 'lax', 'skip'].includes(node.wildcard.processContents))
            return fail('wildcard-properties', 'Wildcard property domain is invalid');
          break;
        }
        case 'particle': {
          occurrenceAlgebra(b.chargeWork).validate(node.occurs);
          if (node.occurs.max === '0') return fail('p-props-correct', 'A particle component must have a positive maximum occurrence');
          if (node.term.kind === 'element') {
            const declaration = reference(node.term.declaration);
            if (declaration?.kind !== 'element') return fail('particle-properties', 'Element particle must reference an element declaration');
            if (declaration.identity.kind === 'global') {
              if (context.membership !== 'complete-actual-plus-additions') obligation('complete-substitution-universe');
              b.chargeWork(3); const pending = [declaration.id], seen = new Set<NodeId>();
              while (pending.length) {
                b.chargeWork(2); const head = pending.pop()!;
                if (seen.has(head)) continue; seen.add(head);
                for (const member of context.incomingAffiliates(head)) {b.chargeWork(); requireNode(member); pending.push(member);}
              }
            }
          } else if (node.term.kind === 'group') {
            const group = reference(node.term.reference);
            if (group?.kind !== 'group') return fail('particle-properties', 'Group particle must reference a model group');
          } else if (node.term.kind === 'any') {
            const wildcard = readParticleWildcard(context, node);
            if (!namespaceExpressible(wildcard.namespace, b.chargeWork) ||
              !['strict', 'lax', 'skip'].includes(wildcard.processContents))
              return fail('wildcard-properties', 'Particle wildcard namespace is not expressible');
          } else for (const child of particleChildren ?? node.term.children) {
            b.chargeWork(); const item = borrowedParticle(child) ?? requireNode(child);
            if (item.kind !== 'particle') return fail('particle-properties', 'Model group children must be particles');
            if (node.term.kind === 'all' && (item.term.kind !== 'element' || !['0', '1'].includes(item.occurs.min) || !['0', '1'].includes(item.occurs.max)))
              return fail('cos-all-limited', 'All children must be element particles with zero/one bounds');
          }
          if ('children' in node.term) particleLegal(checked(deriveModelGroupContent(context, id)).view);
          if (node.term.kind === 'all' && (node.occurs.max !== '1' || !['0', '1'].includes(node.occurs.min)))
            return fail('cos-all-limited', 'All particle must have max1 and min0/1');
          break;
        }
        case 'group': {
          const root = requireNode(node.content);
          if (root.kind !== 'particle' || !('children' in root.term) || root.occurs.min !== '1' || root.occurs.max !== '1')
            return fail('src-group', 'Named group content requires a compositor with occurrence1..1');
          particleLegal(checked(deriveModelGroupContent(context, id)).view);
          break;
        }
        case 'wsdl': return fail('xsd-component-only', 'WSDL interpretation is not an XSD component premise', 'unresolved');
      }
      b.chargeWork(obligations.length + dependencies.size + builtins.size + receipts.length + 20);
      const pending = obligations.filter(item => !(ownRawSimpleContentChecked && item.contextId === context.contextId && item.component === id && item.rule === 'raw-simple-content-derivation-validity'));
      dependencies.delete(id);
      const receipt: ComponentConstructionReceipt = Object.freeze({kind: 'checked', authority: 'XSD10-component-construction-v1',
        scope: 'local-component-premises', contextId: context.contextId, component: id, receipts: Object.freeze(receipts),
        dependencies: Object.freeze([...dependencies]), builtinDependencies: Object.freeze([...builtins]), re01,
        typeDependencies: typeDependencies.snapshot(), identityConstraintDependencies: identityConstraintDependencies.snapshot(),
        obligations: b.freeze(b.snapshot(pending)),
        discharged: ownRawSimpleContentChecked
          ? b.freeze(b.snapshot([{rule: 'raw-simple-content-derivation-validity', component: id, contextId: context.contextId}])) : Object.freeze([])});
      b.chargeWork(); issued.set(receipt, context); return receipt;
    } catch (error: unknown) {
      if (error instanceof ConstructionAbort) return error.result;
      if (error instanceof SemanticError) {
        if (b.exhausted()) throw error;
        b.chargeWork(12 + error.category.length + error.message.length + id.length);
        return Object.freeze({kind: error.category === 'invalid-schema'
          ? context.kind === 'candidate' ? 'candidate-rejected' : 'invalid-schema' : 'unresolved',
        rule: error.category, component: id, message: error.message});
      }
      throw error;
    }
  });
}
