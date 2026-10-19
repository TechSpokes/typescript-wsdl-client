/** Original source AU semantics: AU01 C1, never QName-collapsed composition.
 * This owner assesses actual source mapping. Abstract hypothetical construction
 * has a separate domain gate and is not inferred from source inheritance.
 */
import type {AttributeNode, AttributeUseNode, ComplexTypeNode, GraphNode, NodeId, Reference, ValueConstraint} from './canonicalGraph.js';
import type {ExpandedName, SyntaxSource} from '../loader/orderedSyntax.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import {createSchemaScalarKernel} from './schemaScalarKernel.js';
import type {AssessedSchemaOperand, ScalarResult} from './schemaScalarKernel.js';
import type {ScalarObligation} from './scalarSchemaAssessment.js';
import {checkTypeDerivation, checkImmediateTypeFinal} from './schemaTypeRelations.js';
import type {RelationResult} from './schemaTypeRelations.js';
import {checkDeclaration} from './schemaDeclarationPrimitives.js';
import type {DeclarationReceipt} from './schemaDeclarationPrimitives.js';
import {namespaceAllows, namespaceExpressible, namespaceIntersection, namespaceSubset, namespaceUnion, processContentsRestricts, wildcardNamespaces} from './wildcardAlgebra.js';
import type {NamespaceConstraint, WildcardProcess} from './wildcardAlgebra.js';
import {declaredType, resolveSemanticType, semanticTypeKey} from './schemaTypeIdentity.js';
import type {SemanticTypeDependency, SemanticTypeReference} from './semanticTypeReference.js';
import {collectSemanticTypeDependencies} from './semanticTypeDependencies.js';

export type TypedAttributeConstraint = Readonly<{kind: 'fixed' | 'default'; origin: 'use' | 'declaration'; value: AssessedSchemaOperand}>;
export type OriginalAttributeUse = Readonly<{
  id: NodeId; declaration: AttributeNode; source: AttributeUseNode; required: boolean;
  own?: TypedAttributeConstraint; declared?: TypedAttributeConstraint; effective?: TypedAttributeConstraint;
}>;
export type AttributePresencePlan = Readonly<{
  name: ExpandedName; uses: readonly OriginalAttributeUse[]; required: boolean;
  fixed: readonly TypedAttributeConstraint[];
  absent: Readonly<{kind: 'required' | 'unchanged' | 'conflict'} | {kind: 'augment'; witness: TypedAttributeConstraint}>;
}>;
export type AttributeWildcard = Readonly<{namespace: NamespaceConstraint; processContents: WildcardProcess; sources: readonly NodeId[]}>;
export type SourceAttributePlan = Readonly<{
  owner: NodeId; uses: readonly OriginalAttributeUse[]; attributes: readonly AttributePresencePlan[]; wildcard?: AttributeWildcard;
  /** Valid source operands are retained even after a replacement/removal. */
  schemaOperands: readonly OriginalAttributeUse[];
  declarations: readonly DeclarationReceipt[];
}>;
export type AttributeFailure = Readonly<{kind: 'invalid-schema' | 'candidate-rejected' | 'unsupported-capability' | 'unresolved'; rule: string; component: NodeId; source?: SyntaxSource; contextId?: string; message: string}>;
export type AttributeResult = Readonly<{kind: 'checked'; contextId: string; authority: 'AU01-C1-source-v1' | 'AU01-C1-raw-v2' | 'AU01-C1-raw-properties-v1'; value: SourceAttributePlan;
  obligations: readonly string[]; scalarObligations: readonly ScalarObligation[]; typeDependencies: readonly SemanticTypeDependency[]}> | AttributeFailure | ResourceLimitFailure;
type Container = ComplexTypeNode | Extract<GraphNode, {kind: 'attributeGroup'}>;
type AttributeRole = 'source' | 'raw';
type AttributeMode = 'container' | 'standalone' | 'properties';
type DeclarationFact = Readonly<{
  receipt: DeclarationReceipt; value: TypedAttributeConstraint | undefined;
  scalarObligations: readonly ScalarObligation[];
  typeDependencies: readonly SemanticTypeDependency[];
}>;
type AttributeUseFact = Readonly<{
  kind: 'present'; value: OriginalAttributeUse; declaration: DeclarationFact;
  scalarObligations: readonly ScalarObligation[];
  typeDependencies: readonly SemanticTypeDependency[];
} | {
  kind: 'absent'; declaration?: DeclarationFact;
  scalarObligations: readonly ScalarObligation[];
  typeDependencies: readonly SemanticTypeDependency[];
}>;
type AttributeFactCache = Readonly<{
  declarations: Map<NodeId, DeclarationFact>; uses: Map<NodeId, AttributeUseFact>;
}>;
// Only immutable, completely evaluated local facts are retained. Context identity
// captures active membership, raw properties and original/active operand roles;
// shared source nodes never authorize transfer to another authentic context.
const attributeFacts = new WeakMap<SemanticContext, Map<AttributeRole, AttributeFactCache>>();
class AttributeAbort extends Error {
  constructor(readonly result: AttributeFailure | ResourceLimitFailure) {super(result.kind);}
}

export function assessSourceAttributeUses(context: SemanticContext, ownerId: NodeId): AttributeResult {
  return assessAttributeUses(context, ownerId, 'source');
}

/** Check one available original/fresh AU even if no effective type retains it. */
export function assessAttributeUse(context: SemanticContext, useId: NodeId): AttributeResult {
  assertSemanticContext(context);
  const result = assessAttributeUses(context, useId, context.kind === 'actual' ? 'source' : 'raw', 'standalone');
  return context.kind === 'candidate' && result.kind === 'invalid-schema' ? context.budget.guard(() => {
    if (result.contextId !== undefined && result.contextId === context.originalContext().contextId) return result;
    context.budget.chargeWork(8); return Object.freeze({...result, kind: 'candidate-rejected' as const});
  }) : result;
}

/** Literal abstract AU properties: no source union or inherited omission. */
export function assessRawAttributeUses(context: SemanticContext, ownerId: NodeId): AttributeResult {
  return rawResult(context, assessAttributeUses(context, ownerId, 'raw'));
}

/** Read complete effective AU properties without certifying the containing
 * type's derivation. Individual AU/declaration/scalar premises remain checked.
 */
export function readRawAttributeProperties(context: SemanticContext, ownerId: NodeId): AttributeResult {
  return rawResult(context, assessAttributeUses(context, ownerId, 'raw', 'properties'));
}

function rawResult(context: SemanticContext, result: AttributeResult): AttributeResult {
  return result.kind === 'invalid-schema' ? context.budget.guard(() => {
    if (result.contextId !== undefined && result.contextId === context.originalContext().contextId) return result;
    context.budget.chargeWork(8); return Object.freeze({...result, kind: 'candidate-rejected' as const});
  }) : result;
}

function assessAttributeUses(context: SemanticContext, ownerId: NodeId, role: AttributeRole, mode: AttributeMode = 'container'): AttributeResult {
  assertSemanticContext(context);
  const budget = context.budget, charge = budget.chargeWork;
  return budget.guard(() => {
    const problem = (node: GraphNode, rule: string, message: string, kind: AttributeFailure['kind'] = 'invalid-schema'): never => {
      charge(12 + rule.length + message.length);
      throw new AttributeAbort(Object.freeze({kind, rule, component: node.id, source: node.context.source, message}));
    };
    const get = (id: NodeId): GraphNode => {
      const found = context.lookup(id);
      if (found.kind !== 'found') {
        charge(10 + id.length);
        throw new AttributeAbort(Object.freeze({kind: 'unresolved', rule: 'src-resolve', component: id, message: 'Attribute owner is unavailable in this context'}));
      }
      return found.node;
    };
    const target = (ref: Reference, owner: GraphNode): GraphNode => {
      const found = context.resolve(ref);
      if (found.kind !== 'found') return problem(owner, 'src-resolve', 'Attribute reference needs an active component', 'unresolved');
      return found.node;
    };
    const scalar = createSchemaScalarKernel(context);
    const typeDependencies = collectSemanticTypeDependencies(context);
    charge(); const scalarObligations: ScalarObligation[] = [];
    const unwrap = <T>(result: ScalarResult<T> | RelationResult<T>, node: GraphNode, obligations = scalarObligations, dependencies = typeDependencies): T => {
      if (result.kind === 'checked') {
        dependencies.add(result.typeDependencies);
        if (result.authority === 'XSD10-schema-scalars-DT01-A-v1') {
          for (const obligation of result.obligations) {charge(); obligations.push(obligation);}
        }
        return result.value;
      }
      if (result.kind === 'resource-limit') throw new AttributeAbort(result);
      // Preserve the shared owner's diagnostic origin. An original datatype's
      // formation failure is distinct from a candidate operand failing that
      // valid datatype; only the scalar owner can identify that distinction.
      charge(9);
      throw new AttributeAbort(Object.freeze({kind: result.kind === 'invalid-input' ? 'invalid-schema' : result.kind,
        rule: result.rule, message: result.message, component: result.component ?? node.id,
        source: 'source' in result ? result.source : node.context.source,
        ...('contextId' in result && result.contextId !== undefined ? {contextId: result.contextId} : {})}));
    };
    const nameKey = (name: ExpandedName): string => {
      charge(8 + 2 * (name.namespace.length + name.local.length)); return JSON.stringify([name.namespace, name.local]);
    };
    const typed = (declaration: AttributeNode, constraint: ValueConstraint | undefined, owner: GraphNode, origin: 'use' | 'declaration', obligations = scalarObligations, dependencies = typeDependencies): TypedAttributeConstraint | undefined => {
      if (!constraint) return undefined;
      const type = declaredType(context, declaration);
      const value = unwrap(scalar.assessValue(type, constraint, owner.id), owner, obligations, dependencies);
      charge(5); return Object.freeze({kind: constraint.kind, origin, value});
    };
    const equal = (a: TypedAttributeConstraint, b: TypedAttributeConstraint, owner: GraphNode, obligations = scalarObligations, dependencies = typeDependencies): boolean => unwrap(
      scalar.equivalent(a.value.type, a.value.lexical, b.value.type, b.value.lexical, owner.id), owner, obligations, dependencies);
    const asContainer = (node: GraphNode): Container => {
      if (node.kind !== 'complexType' && node.kind !== 'attributeGroup') return problem(node, 'src-attribute-group', 'Expected a type or attribute group');
      return node;
    };
    const attributeGroup = (node: GraphNode): Extract<GraphNode, {kind: 'attributeGroup'}> => {
      if (node.kind !== 'attributeGroup') return problem(node, 'src-attribute-group', 'Attribute group reference requires an attribute group');
      return node;
    };
    try {
      const requested = get(ownerId);
      if (role === 'source' && context.kind !== 'actual') return problem(requested, 'source-construction-role', 'Actual source mapping cannot certify abstract hypothetical AU construction', 'unresolved');
      charge(); let roles = attributeFacts.get(context);
      if (!roles) {charge(3); roles = new Map(); attributeFacts.set(context, roles);}
      charge(); let cached = roles.get(role);
      if (!cached) {
        charge(9); cached = Object.freeze({declarations: new Map<NodeId, DeclarationFact>(), uses: new Map<NodeId, AttributeUseFact>()});
        roles.set(role, cached);
      }
      charge(4);
      const plans = new Map<NodeId, SourceAttributePlan>(), useCache = new Map<NodeId, AttributeUseFact>();
      charge(); const declarationEvidence = new Map<NodeId, DeclarationReceipt>();
      const declaration = (node: AttributeNode): DeclarationFact => {
        charge(1 + node.id.length); const previous = cached.declarations.get(node.id);
        if (previous) return previous;
        const checked = checkDeclaration(context, node.id);
        if (checked.kind !== 'checked') throw new AttributeAbort(checked);
        charge(); const obligations: ScalarObligation[] = [];
        const dependencies = collectSemanticTypeDependencies(context); dependencies.add(checked.typeDependencies);
        unwrap(scalar.describe(declaredType(context, node), node.id), node, obligations, dependencies);
        const value = typed(node, node.value, node, 'declaration', obligations, dependencies);
        charge(10 + obligations.length + node.id.length);
        const fact = Object.freeze({receipt: checked, value, scalarObligations: Object.freeze(obligations), typeDependencies: dependencies.snapshot()});
        cached.declarations.set(node.id, fact); return fact;
      };
      const replay = (fact: AttributeUseFact): OriginalAttributeUse | undefined => {
        const dependency = fact.declaration;
        if (dependency) {
          const id = dependency.receipt.component;
          charge(1 + id.length);
          if (!declarationEvidence.has(id)) {
            charge(2 + id.length); declarationEvidence.set(id, dependency.receipt);
            for (const obligation of dependency.scalarObligations) {charge(2); scalarObligations.push(obligation);}
            typeDependencies.add(dependency.typeDependencies);
          }
        }
        for (const obligation of fact.scalarObligations) {charge(2); scalarObligations.push(obligation);}
        typeDependencies.add(fact.typeDependencies);
        return fact.kind === 'present' ? fact.value : undefined;
      };
      const use = (node: AttributeUseNode): OriginalAttributeUse | undefined => {
        charge(1 + node.id.length); const previous = useCache.get(node.id);
        if (previous) return previous.kind === 'present' ? previous.value : undefined;
        charge(1 + node.id.length); const stored = cached.uses.get(node.id);
        if (stored) {
          const result = replay(stored);
          charge(1 + node.id.length); useCache.set(node.id, stored); return result;
        }
        const attribute = target(node.declaration, node);
        if (attribute.kind !== 'attribute') return problem(node, 'src-attribute', 'AU requires an attribute declaration');
        // A prohibited local declaration maps to no semantic AU/declaration.
        // A referenced global still owes its own scalar/declaration obligations.
        let fact: AttributeUseFact;
        if (node.use === 'prohibited') {
          const dependency = attribute.identity.kind === 'global' ? declaration(attribute) : undefined;
          charge(10); fact = Object.freeze({kind: 'absent', declaration: dependency, scalarObligations: Object.freeze([]), typeDependencies: Object.freeze([])});
        } else {
          // Retain the complete dependency even when another AU has already
          // replayed it in this invocation. Ambient inventory deltas are not a
          // dependency closure (notably for two uses of one global declaration).
          const dependency = declaration(attribute), declared = dependency.value;
          if (role === 'source' && node.value?.kind === 'default' && node.use !== 'optional') return problem(node, 'src-attribute.2', 'An explicit source default requires an optional use');
          charge(); const obligations: ScalarObligation[] = [];
          const dependencies = collectSemanticTypeDependencies(context);
          const own = typed(attribute, node.value, node, 'use', obligations, dependencies);
          if (own && declared?.kind === 'fixed' && (own.kind !== 'fixed' || !equal(own, declared, node, obligations, dependencies))) return problem(node, 'au-props-correct.2', 'Use constraint disagrees with declaration fixed value');
          charge(9);
          const value = Object.freeze({id: node.id, declaration: attribute, source: node, required: node.use === 'required', own, declared, effective: own ?? declared});
          charge(11 + obligations.length);
          fact = Object.freeze({kind: 'present', value, declaration: dependency, scalarObligations: Object.freeze(obligations), typeDependencies: dependencies.snapshot()});
        }
        const result = replay(fact);
        // Publish only after the entire local evaluation and evidence replay
        // succeeded. Later container-specific failures do not invalidate this
        // fact, and none of those container judgments is cached here.
        charge(2 + 2 * node.id.length);
        cached.uses.set(node.id, fact); useCache.set(node.id, fact); return result;
      };
      const combine = (a: AttributeWildcard | undefined, b: AttributeWildcard | undefined, owner: GraphNode, union: boolean): AttributeWildcard | undefined => {
        if (!a) return b; if (!b) return a;
        const namespace = union ? namespaceUnion(a.namespace, b.namespace, charge) : namespaceIntersection(a.namespace, b.namespace, charge);
        if (!namespaceExpressible(namespace, charge)) return problem(owner, 'cos-aw-intersect/union', 'Wildcard combination is not expressible');
        charge(7 + a.sources.length + b.sources.length);
        return Object.freeze({namespace, processContents: union ? b.processContents : a.processContents, sources: Object.freeze([...a.sources, ...b.sources])});
      };
      const idType: Reference = {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'ID'}};
      const checkUses = (uses: readonly OriginalAttributeUse[], owner: Container): readonly OriginalAttributeUse[] => {
        charge(3); const identities = new Map<NodeId, OriginalAttributeUse>(), names = new Map<string, OriginalAttributeUse>(), ids = new Set<NodeId>();
        for (const item of uses) {
          charge(3 + item.id.length); if (identities.has(item.id)) continue;
          const k = nameKey(item.declaration.name), previous = names.get(k);
          if (previous && (owner.kind === 'attributeGroup' || previous.declaration.id !== item.declaration.id)) return problem(owner,
            owner.kind === 'attributeGroup' ? 'ag-props-correct.2' : 'ct-props-correct.4', 'Distinct members violate declaration uniqueness');
          if (unwrap(checkTypeDerivation(context, declaredType(context, item.declaration), idType, []), owner)) {
            charge(); ids.add(owner.kind === 'attributeGroup' ? item.id : item.declaration.id);
            if (ids.size > 1) return problem(owner, owner.kind === 'attributeGroup' ? 'ag-props-correct.3' : 'ct-props-correct.5', 'Multiple ID-derived members');
          }
          charge(2); identities.set(item.id, item); names.set(k, item);
        }
        charge(identities.size + 2); return Object.freeze([...identities.values()]);
      };
      const presence = (uses: readonly OriginalAttributeUse[], owner: GraphNode): readonly AttributePresencePlan[] => {
        charge(2); const names = new Map<string, OriginalAttributeUse[]>(), result: AttributePresencePlan[] = [];
        for (const item of uses) {
          const k = nameKey(item.declaration.name); charge(4); const values = names.get(k) ?? [];
          values.push(item); names.set(k, values);
        }
        for (const group of names.values()) {
          charge(3); let required = false, witness: TypedAttributeConstraint | undefined, conflict = false;
          const fixed: TypedAttributeConstraint[] = [];
          for (const item of group) {
            charge(2); required ||= item.required;
            if (item.effective?.kind === 'fixed') {charge(); fixed.push(item.effective);}
            if (!item.required && item.effective) {
              if (witness && !equal(witness, item.effective, owner)) conflict = true;
              witness ??= item.effective;
            }
          }
          charge(12 + group.length + fixed.length);
          result.push(Object.freeze({name: group[0]!.declaration.name, uses: Object.freeze(group), required, fixed: Object.freeze(fixed),
            absent: Object.freeze(required ? {kind: 'required' as const} : conflict ? {kind: 'conflict' as const} : witness ? {kind: 'augment' as const, witness} : {kind: 'unchanged' as const})}));
        }
        charge(result.length + 1); return Object.freeze(result);
      };
      if (mode === 'standalone') {
        if (requested.kind !== 'attributeUse') return problem(requested, 'au-props-correct', 'Expected an attribute use');
        const mapped = use(requested);
        if (role === 'raw' && !mapped) return problem(requested, 'au-props-correct', 'A literal AU is a present use');
        charge(15 + declarationEvidence.size + scalarObligations.length);
        const uses = Object.freeze(mapped ? [mapped] : []);
        const value = Object.freeze({owner: requested.id, uses, attributes: presence(uses, requested),
          schemaOperands: uses, declarations: Object.freeze([...declarationEvidence.values()])});
        return Object.freeze({kind: 'checked' as const, contextId: context.contextId,
          authority: role === 'source' ? 'AU01-C1-source-v1' as const : 'AU01-C1-raw-v2' as const,
          value, obligations: Object.freeze(['owning-type-or-group-validity', ...(role === 'source' ? ['source-representation-syntax'] : [])]),
          scalarObligations: Object.freeze(scalarObligations), typeDependencies: typeDependencies.snapshot()});
      }
      const root = asContainer(requested);
      const replacementFailure = (item: OriginalAttributeUse, original: OriginalAttributeUse, obligations = scalarObligations, dependencies = typeDependencies): Readonly<{rule: string; message: string}> | undefined => {
        charge();
        if (original.required && !item.required) {charge(4); return {rule: 'derivation-ok-restriction.2.1.1', message: 'Replacement weakens required base use'};}
        if (!unwrap(checkTypeDerivation(context, declaredType(context, item.declaration), declaredType(context, original.declaration), []), item.source, obligations, dependencies)) {charge(4); return {rule: 'derivation-ok-restriction.2.1.2', message: 'Replacement type does not derive from original type'};}
        if (original.effective?.kind === 'fixed' && (item.effective?.kind !== 'fixed' || !equal(original.effective, item.effective, item.source, obligations, dependencies))) {charge(4); return {rule: 'derivation-ok-restriction.2.1.3', message: 'Replacement fails an original fixed constraint'};}
        return undefined;
      };
      const checkReplacement = (item: OriginalAttributeUse, original: OriginalAttributeUse): void => {
        const failure = replacementFailure(item, original);
        if (failure) problem(item.source, failure.rule, failure.message);
      };
      if (role === 'raw') {
        if (root.kind === 'attributeGroup' || mode === 'properties') {
          const group = root.kind === 'attributeGroup';
          const raw = group ? context.rawAttributeGroupProperties(root.id) : context.rawTypeProperties(root.id);
          if (!raw) return problem(root, group ? 'raw-attribute-group-properties' : 'raw-type-properties', 'Complete literal attribute properties are required', 'unresolved');
          charge(2); const local: OriginalAttributeUse[] = [];
          for (const id of raw.attributeUses) {
            const item = get(id);
            if (item.kind !== 'attributeUse' || item.use === 'prohibited') return problem(item, 'au-props-correct', 'Literal effective properties contain only present attribute uses');
            const mapped = use(item)!; charge(); local.push(mapped);
          }
          const uses = checkUses(local, root), wildcard = raw.wildcard;
          if (wildcard && (!['strict', 'lax', 'skip'].includes(wildcard.processContents) || !namespaceExpressible(wildcard.namespace, charge)))
            return problem(root, 'cos-aw-union/intersect', 'Literal group wildcard has invalid component properties');
          charge(15 + uses.length + declarationEvidence.size + scalarObligations.length);
          const value = Object.freeze({owner: root.id, uses, attributes: presence(uses, root), wildcard,
            schemaOperands: uses, declarations: Object.freeze([...declarationEvidence.values()])});
          return Object.freeze({kind: 'checked' as const, contextId: context.contextId,
            authority: mode === 'properties' ? 'AU01-C1-raw-properties-v1' as const : 'AU01-C1-raw-v2' as const,
            value, obligations: Object.freeze(group ? ['aggregate-group-validity', 'raw-group-property-correspondence'] : ['aggregate-type-validity', 'raw-type-property-correspondence']),
            scalarObligations: Object.freeze(scalarObligations), typeDependencies: typeDependencies.snapshot()});
        }
        const sameType = (a: SemanticTypeReference, b: SemanticTypeReference, owner: GraphNode): boolean => {
          const x = resolveSemanticType(context, a), y = resolveSemanticType(context, b);
          if (!('identity' in x) || !('identity' in y)) return problem(owner, 'src-resolve', 'Attribute type identity is unavailable', 'unresolved');
          charge(7);
          typeDependencies.add([{contextId: context.contextId, type: x.identity}, {contextId: context.contextId, type: y.identity}]);
          return budget.compareText(semanticTypeKey(context, x.identity), semanticTypeKey(context, y.identity)) === 0;
        };
        charge(3); const stack: ComplexTypeNode[] = [root], active = new Set<NodeId>();
        while (stack.length) {
          charge(); const node = stack[stack.length - 1]!;
          const raw = context.rawTypeProperties(node.id);
          if (!raw) return problem(node, 'raw-type-properties', 'Complete literal attribute properties are required', 'unresolved');
          const baseResolution = resolveSemanticType(context, raw.derivation.base);
          if (!('identity' in baseResolution)) return problem(node, 'src-resolve', 'Literal base is unavailable', 'unresolved');
          charge(4);
          typeDependencies.add([{contextId: context.contextId, type: baseResolution.identity}]);
          const baseNode = baseResolution.kind === 'component' ? baseResolution.node : undefined;
          if (baseNode && baseNode.kind !== 'complexType' && baseNode.kind !== 'simpleType') return problem(node, 'raw-type-properties', 'Base must be a type');
          if (baseNode?.kind === 'complexType' && !plans.has(baseNode.id)) {
            charge(2);
            if (baseNode.id === node.id || active.has(baseNode.id)) return problem(node, 'type-derivation-cycle', 'Literal base chain contains a cycle');
            active.add(node.id); stack.push(baseNode); continue;
          }
          const base = baseNode ? plans.get(baseNode.id) : undefined;
          const ur = baseResolution.kind === 'builtin' && baseResolution.name.namespace === XSD_NAMESPACE && baseResolution.name.local === 'anyType';
          const baseWildcard: AttributeWildcard | undefined = base?.wildcard ?? (ur ? {namespace: {kind: 'not', namespaces: []}, processContents: 'lax', sources: []} : undefined);
          charge(2); const local: OriginalAttributeUse[] = [];
          for (const id of raw.attributeUses) {
            const item = get(id);
            if (item.kind !== 'attributeUse' || item.use === 'prohibited') return problem(item, 'au-props-correct', 'A literal AU set contains only present attribute uses');
            const mapped = use(item)!; charge(); local.push(mapped);
          }
          const uses = checkUses(local, node), wildcard = raw.wildcard;
          if (wildcard && (!['strict', 'lax', 'skip'].includes(wildcard.processContents) || !namespaceExpressible(wildcard.namespace, charge))) return problem(node, 'cos-aw-union/intersect', 'Literal wildcard has invalid component properties');
          if (!unwrap(checkImmediateTypeFinal(context, {kind: 'local', target: node.id}), node)) return problem(node, 'cos-ct-extends/derivation-ok-restriction', 'Base final excludes derivation');
          if (raw.derivation.method === 'extension') {
            for (const original of base?.uses ?? []) {
              let matched = false;
              for (const item of uses) {
                if (nameKey(item.declaration.name) === nameKey(original.declaration.name) && sameType(declaredType(context, item.declaration), declaredType(context, original.declaration), node)) matched = true;
              }
              if (!matched) return problem(node, 'cos-ct-extends.1.2', 'Literal extension omits a base attribute name/type match');
            }
            if (baseWildcard && (!wildcard || !namespaceSubset(baseWildcard.namespace, wildcard.namespace, charge))) return problem(node, 'cos-ct-extends.1.3', 'Literal extension wildcard must contain the base wildcard');
          } else {
            charge(3); const requiredNames = new Set<string>();
            let pendingMatch: AttributeFailure | undefined;
            for (const item of uses) {
              let matched = false, compatible = false;
              let failure: ReturnType<typeof replacementFailure>;
              let pending: AttributeFailure | undefined, qualified: Readonly<{obligations: readonly ScalarObligation[]; dependencies: readonly SemanticTypeDependency[]}> | undefined;
              const k = nameKey(item.declaration.name);
              for (const original of base?.uses ?? []) if (k === nameKey(original.declaration.name)) {
                matched = true;
                charge(); const pairObligations: ScalarObligation[] = [];
                const pairDependencies = collectSemanticTypeDependencies(context);
                try {
                  const next = replacementFailure(item, original, pairObligations, pairDependencies);
                  if (next) failure ??= next;
                  else if (pairObligations.length === 0) {typeDependencies.add(pairDependencies.snapshot()); compatible = true; break;}
                  else if (!qualified) {charge(3); qualified = {obligations: pairObligations, dependencies: pairDependencies.snapshot()};}
                } catch (error) {
                  if (!(error instanceof AttributeAbort) || error.result.kind !== 'unresolved' && error.result.kind !== 'unsupported-capability') throw error;
                  pending ??= error.result;
                }
              }
              if (!matched && (!baseWildcard || !namespaceAllows(baseWildcard.namespace, item.declaration.name.namespace, charge))) return problem(node, 'derivation-ok-restriction.2.2', 'Literal restriction adds an attribute outside the base wildcard');
              // Selected literal interpretation: one compatible pair suffices.
              // Prefer a debt-free pair; otherwise retain one qualified pair's
              // complete obligations for the aggregate checker to discharge.
              // Mapped declaration/AU debts remain independently in the receipt.
              if (!compatible && qualified) {
                for (const obligation of qualified.obligations) {charge(2); scalarObligations.push(obligation);}
                typeDependencies.add(qualified.dependencies);
                compatible = true;
              }
              if (!compatible) {
                if (pending) pendingMatch ??= pending;
                else if (failure) return problem(item.source, failure.rule, failure.message);
              }
              if (item.required) {charge(); requiredNames.add(k);}
            }
            for (const original of base?.uses ?? []) if (original.required && !requiredNames.has(nameKey(original.declaration.name))) return problem(node, 'derivation-ok-restriction.3', 'Literal restriction omits a required base attribute');
            if (wildcard && (!baseWildcard || !namespaceSubset(wildcard.namespace, baseWildcard.namespace, charge) || !ur && !processContentsRestricts(wildcard.processContents, baseWildcard.processContents, charge))) return problem(node, 'derivation-ok-restriction.4', 'Literal wildcard is not an admitted restriction');
            if (pendingMatch) throw new AttributeAbort(pendingMatch);
          }
          charge(12 + uses.length + (base?.schemaOperands.length ?? 0) + declarationEvidence.size);
          const plan = Object.freeze({owner: node.id, uses, attributes: presence(uses, node), wildcard,
            schemaOperands: Object.freeze([...(base?.schemaOperands ?? []), ...uses]), declarations: Object.freeze([...declarationEvidence.values()])});
          plans.set(node.id, plan); active.delete(node.id); stack.pop();
        }
        charge(10 + scalarObligations.length); return Object.freeze({kind: 'checked' as const, contextId: context.contextId, authority: 'AU01-C1-raw-v2' as const,
          value: plans.get(root.id)!, obligations: Object.freeze(['aggregate-type-validity', 'raw-type-property-correspondence']), scalarObligations: Object.freeze(scalarObligations), typeDependencies: typeDependencies.snapshot()});
      }
      const dependencies = (node: Container): Container[] => {
        charge(); const result: Container[] = [];
        if (node.kind === 'complexType' && node.derivation && node.derivation.base.kind !== 'builtin') {
          const base = target(node.derivation.base, node); if (base.kind === 'complexType') {charge(); result.push(base);}
        }
        for (const id of node.attributes) {
          const item = get(id); if (item.kind === 'attributeGroupUse') {charge(); result.push(attributeGroup(target(item.reference, item)));}
        }
        return result;
      };
      charge(2); const stack: {node: Container; entered: boolean}[] = [{node: root, entered: false}];
      while (stack.length) {
        charge(2); const frame = stack[stack.length - 1]!, node = frame.node;
        if (plans.has(node.id)) {stack.pop(); continue;}
        if (!frame.entered) {
          frame.entered = true;
          for (const dependency of dependencies(node)) if (!plans.has(dependency.id)) {charge(3); stack.push({node: dependency, entered: false});}
          continue;
        }
        charge(4); const local: OriginalAttributeUse[] = [], schemaOperands: OriginalAttributeUse[] = [], prohibitions = new Set<string>();
        let explicit: AttributeWildcard | undefined, groups: AttributeWildcard | undefined;
        for (const id of node.attributes) {
          const item = get(id);
          if (item.kind === 'attributeUse') {
            const mapped = use(item);
            if (mapped) {charge(2); local.push(mapped); schemaOperands.push(mapped);}
            else if (node.kind === 'complexType' && node.derivation?.kind === 'restriction') {
              const attribute = target(item.declaration, item);
              if (attribute.kind !== 'attribute') return problem(item, 'src-attribute', 'Prohibited reference requires declaration');
              charge(); prohibitions.add(nameKey(attribute.name));
            }
          } else if (item.kind === 'attributeGroupUse') {
            const group = plans.get(target(item.reference, item).id)!;
            charge(group.uses.length + group.schemaOperands.length); local.push(...group.uses); schemaOperands.push(...group.schemaOperands);
            groups = combine(groups, group.wildcard, node, false);
          } else if (item.kind === 'attributeWildcard') {
            if (explicit) return problem(item, 'src-attribute-group', 'Multiple explicit wildcards');
            const namespace = wildcardNamespaces(item.wildcard, charge); charge(6);
            explicit = Object.freeze({namespace, processContents: item.wildcard.processContents, sources: Object.freeze([item.id])});
          } else return problem(item, 'src-attribute-group', 'Invalid attribute contribution');
        }
        let wildcard = explicit ? combine(explicit, groups, node, false) : groups;
        let uses = checkUses(local, node);
        if (node.kind === 'complexType' && node.derivation) {
          if (!unwrap(checkImmediateTypeFinal(context, {kind: 'local', target: node.id}), node)) return problem(node, 'cos-ct-extends/derivation-ok-restriction', 'Base final excludes derivation');
          const base = node.derivation.base.kind === 'builtin' ? undefined : plans.get(target(node.derivation.base, node).id);
          const ur = node.derivation.base.kind === 'builtin' && node.derivation.base.name.namespace === XSD_NAMESPACE && node.derivation.base.name.local === 'anyType';
          const baseWildcard: AttributeWildcard | undefined = base?.wildcard ?? (ur ? {namespace: {kind: 'not', namespaces: []}, processContents: 'lax', sources: []} : undefined);
          if (base) {charge(base.schemaOperands.length); schemaOperands.push(...base.schemaOperands);}
          if (node.derivation.kind === 'extension') {
            charge((base?.uses.length ?? 0) + uses.length + 1); uses = checkUses([...(base?.uses ?? []), ...uses], node);
            wildcard = combine(baseWildcard, wildcard, node, true);
          } else {
            charge(3); const byName = new Map<string, OriginalAttributeUse[]>(), replacements = new Set<string>(), inherited: OriginalAttributeUse[] = [];
            for (const item of base?.uses ?? []) {const k = nameKey(item.declaration.name); charge(4); const values = byName.get(k) ?? []; values.push(item); byName.set(k, values);}
            for (const item of uses) {
              const k = nameKey(item.declaration.name), matches = byName.get(k); charge(); replacements.add(k);
              if (!matches && (!baseWildcard || !namespaceAllows(baseWildcard.namespace, item.declaration.name.namespace, charge))) return problem(node, 'derivation-ok-restriction.2.2', 'New attribute outside base wildcard');
              for (const original of matches ?? []) checkReplacement(item, original);
            }
            for (const item of base?.uses ?? []) {
              const k = nameKey(item.declaration.name);
              if (replacements.has(k)) continue;
              if (prohibitions.has(k)) {if (item.required) return problem(node, 'derivation-ok-restriction.3', 'Prohibition removes required attribute');}
              else {charge(); inherited.push(item);}
            }
            charge(inherited.length + uses.length + 1); uses = checkUses([...inherited, ...uses], node);
            if (wildcard && (!baseWildcard || !namespaceSubset(wildcard.namespace, baseWildcard.namespace, charge) || !ur && !processContentsRestricts(wildcard.processContents, baseWildcard.processContents, charge))) return problem(node, 'derivation-ok-restriction.4', 'Wildcard is not an admitted restriction');
          }
        }
        const attributes = presence(uses, node);
        charge(11 + schemaOperands.length + declarationEvidence.size);
        const plan = Object.freeze({owner: node.id, uses, attributes, wildcard, schemaOperands: Object.freeze(schemaOperands), declarations: Object.freeze([...declarationEvidence.values()])});
        plans.set(node.id, plan); stack.pop();
      }
      charge(10 + scalarObligations.length); return Object.freeze({kind: 'checked' as const, contextId: context.contextId, authority: 'AU01-C1-source-v1' as const,
        value: plans.get(root.id)!, obligations: Object.freeze(['aggregate-type-validity', 'source-representation-syntax'] as const), scalarObligations: Object.freeze(scalarObligations), typeDependencies: typeDependencies.snapshot()});
    } catch (error) {
      if (error instanceof AttributeAbort) return error.result;
      throw error;
    }
  });
}
