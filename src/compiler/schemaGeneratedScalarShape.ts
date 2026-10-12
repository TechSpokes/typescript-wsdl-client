/** Original-source scalar identity/shape mapping. No facet or validity engine. */
import type {ComplexTypeNode, GraphNode, NodeId, Reference} from './canonicalGraph.js';
import {isBuiltinType} from './canonicalGraph.js';
import {builtinListItem, builtinParents, builtinPrimitive} from './schemaDatatypeValues.js';
import {XSD_NAMESPACE} from '../loader/orderedSyntax.js';
import {assertSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {ResourceLimitFailure} from './semanticBudget.js';
import type {OriginalGeneratedScalarReference, SemanticTypeIdentity, SemanticTypeReference} from './semanticTypeReference.js';

export type OriginalScalarShapeFailure = Readonly<{kind: 'unresolved'; rule: string; message: string; contextId: string; component?: NodeId}>;
export type OriginalScalarShapeResult<T> = Readonly<{kind: 'checked'; value: T; contextId: string;
  authority: 'XSD10-original-scalar-shape-v1'; acceptance: 'structural-only'; sourceDependencies: readonly NodeId[]}>
  | OriginalScalarShapeFailure | ResourceLimitFailure;
export type OriginalGeneratedScalarShape = Readonly<{
  slot: OriginalGeneratedScalarReference; name: undefined; targetNamespace: string; final: readonly [];
  annotation: 'absent'; base: SemanticTypeReference; variety: 'atomic' | 'list' | 'union';
  primitive?: string; item?: SemanticTypeReference; members?: readonly SemanticTypeReference[];
}>;
type Shape = Readonly<{identity: SemanticTypeIdentity; base?: SemanticTypeReference;
  variety: 'atomic' | 'list' | 'union' | 'absent' | 'complex'; primitive?: string;
  item?: SemanticTypeReference; members?: readonly SemanticTypeReference[]; sourceDependencies: readonly NodeId[]}>;
class ShapeProblem extends Error {constructor(readonly rule: string, message: string, readonly component?: NodeId) {super(message);}}
const caches = new WeakMap<SemanticContext, Map<string, Shape>>();
const builtinRef = (local: string): Reference => ({kind: 'builtin', name: {namespace: XSD_NAMESPACE, local}});
function identityReference(identity: SemanticTypeIdentity): SemanticTypeReference {
  return identity.kind === 'component' ? {kind: 'local', target: identity.id} : identity;
}
function sourceShape(context: SemanticContext, input: SemanticTypeReference): Shape {
  const b = context.budget;
  b.chargeWork(4);
  let cache = caches.get(context); if (!cache) {cache = new Map(); caches.set(context, cache);}
  const select = (reference: SemanticTypeReference): {key: string; node?: GraphNode; builtin?: string} => {
    b.chargeWork(8);
    if (reference.kind === 'original-generated') {
      b.chargeWork(reference.owner.length + 3);
      if(context.lookupScalarSlot(reference).kind!=='found')throw new ShapeProblem('original-generated-owner','No original generated scalar component was mapped',reference.owner);
      const node = context.sourceNode(reference.owner);
      if (node?.kind !== 'complexType' || node.derivation?.kind !== 'restriction' || node.derivation.contentKind !== 'simple')
        throw new ShapeProblem('original-generated-owner', 'Original scalar slot requires its source simple-content restriction owner', reference.owner);
      return {key: `slot:${reference.owner}`, node};
    }
    const found = context.resolve(reference);
    if (found.kind === 'builtin') {
      if (found.name.namespace !== XSD_NAMESPACE || !isBuiltinType(found.name.local)) throw new ShapeProblem('original-scalar-builtin', 'Unknown original builtin');
      b.chargeWork(found.name.local.length + 2); return {key: `builtin:${found.name.local}`, builtin: found.name.local};
    }
    if (found.kind !== 'found') throw new ShapeProblem('original-scalar-reference', 'Original scalar reference is unavailable', found.id);
    if(context.originalSourceComponentAbsent(found.node.id))throw new ShapeProblem('original-scalar-absent','Source projection does not map a component',found.node.id);
    const node = context.sourceNode(found.node.id);
    if (!node || node.kind !== 'simpleType' && node.kind !== 'complexType') throw new ShapeProblem('original-scalar-role', 'Original reference has no scalar shape', found.node.id);
    b.chargeWork(node.id.length + 2);
    return {key: node.kind === 'complexType' && node.derivation?.kind === 'restriction' && node.derivation.contentKind === 'simple' ? `slot:${node.id}` : `component:${node.id}`, node};
  };
  type Frame = {reference: SemanticTypeReference; selected: ReturnType<typeof select>; dependencies?: readonly SemanticTypeReference[]};
  const first = select(input), stack: Frame[] = [{reference: input, selected: first}], active = new Set<string>();
  while (stack.length) {
    b.chargeWork(4); const frame = stack[stack.length - 1], {key, node} = frame.selected;
    if (cache.has(key)) {stack.pop(); continue;}
    if (!frame.dependencies) {
      if (active.has(key)) throw new ShapeProblem('original-scalar-shape-cycle', 'Original scalar shape has a dependency cycle', node?.id);
      active.add(key);
      if (frame.selected.builtin) {
        const name = frame.selected.builtin, item = builtinListItem(name);
        const shape: Shape = {identity: {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: name}},
          base: name === 'anyType' ? undefined : builtinRef(name === 'anySimpleType' ? 'anyType' : builtinParents[name] ?? 'anySimpleType'),
          variety: name === 'anyType' ? 'complex' : name === 'anySimpleType' ? 'absent' : item ? 'list' : 'atomic',
          primitive: item || name === 'anySimpleType' || name === 'anyType' ? undefined : builtinPrimitive(name),
          item: item ? builtinRef(item) : undefined, sourceDependencies: []};
        cache.set(key, b.freeze(b.snapshot(shape))); active.delete(key); stack.pop(); continue;
      }
      b.chargeWork(8);
      if (node!.kind === 'simpleType') frame.dependencies = node!.variety.kind === 'restriction' ? [node!.variety.base]
        : node!.variety.kind === 'list' ? [node!.variety.item] : node!.variety.members;
      else {
        const source = node as ComplexTypeNode;
        if (source.derivation?.contentKind !== 'simple') throw new ShapeProblem('original-scalar-role', 'Original complex type has no simple-content shape', source.id);
        frame.dependencies = [source.derivation.kind === 'restriction' && source.derivation.inlineType ? source.derivation.inlineType : source.derivation.base];
      }
      b.chargeWork(frame.dependencies.length * 4 + 1);
      for (let index = frame.dependencies.length - 1; index >= 0; index--) {
        const reference = frame.dependencies[index], selected = select(reference);
        if (!cache.has(selected.key)) stack.push({reference, selected});
      }
      continue;
    }
    const read = (reference: SemanticTypeReference): Shape => cache!.get(select(reference).key)!;
    b.chargeWork(frame.dependencies.length + 4);
    const dependencies = new Set<NodeId>([node!.id]);
    for (const reference of frame.dependencies) {
      const dependency = read(reference); b.chargeWork(dependency.sourceDependencies.length + 1);
      for (const id of dependency.sourceDependencies) dependencies.add(id);
    }
    let shape: Omit<Shape, 'sourceDependencies'>;
    if (node!.kind === 'simpleType') {
      const source = node!;
      if (source.variety.kind === 'restriction') {
        const base = read(source.variety.base);
        shape = {...base, identity: {kind: 'component', id: source.id}, base: identityReference(base.identity)};
      } else if (source.variety.kind === 'list') shape = {identity: {kind: 'component', id: source.id}, base: builtinRef('anySimpleType'),
        variety: 'list', item: identityReference(read(source.variety.item).identity)};
      else {
        const members: SemanticTypeReference[] = [];
        for (const reference of source.variety.members) {
          const member = read(reference); b.chargeWork(3 + (member.members?.length ?? 1));
          if (member.variety === 'union') members.push(...member.members!);
          else members.push(identityReference(member.identity));
        }
        shape = {identity: {kind: 'component', id: source.id}, base: builtinRef('anySimpleType'), variety: 'union', members};
      }
    } else {
      const source = node as ComplexTypeNode, base = read(frame.dependencies[0]);
      shape = source.derivation!.kind === 'extension' ? base : {...base,
        identity: {kind: 'original-generated', owner: source.id}, base: identityReference(base.identity)};
    }
    b.chargeWork(dependencies.size + 3);
    cache.set(key, b.freeze(b.snapshot({...shape, sourceDependencies: [...dependencies]})));
    active.delete(key); stack.pop();
  }
  return cache.get(first.key)!;
}
function run<T>(context: SemanticContext, operation: (original: SemanticContext) => {value: T; sourceDependencies: readonly NodeId[]}): OriginalScalarShapeResult<T> {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const original = context.originalContext();
    try {
      const {value, sourceDependencies} = operation(original);
      return context.budget.freeze(context.budget.snapshot({kind: 'checked' as const, value, contextId: original.contextId,
        authority: 'XSD10-original-scalar-shape-v1' as const, acceptance: 'structural-only' as const, sourceDependencies}));
    } catch (error) {
      if (!(error instanceof ShapeProblem)) throw error;
      return context.budget.freeze(context.budget.snapshot({kind: 'unresolved' as const, rule: error.rule, message: error.message,
        contextId: original.contextId, component: error.component}));
    }
  });
}
export function resolveOriginalScalarIdentity(context: SemanticContext, reference: SemanticTypeReference): OriginalScalarShapeResult<SemanticTypeIdentity> {
  return run(context, original => {
    const safe = context.budget.freeze(context.budget.snapshot(reference)), shape = sourceShape(original, safe);
    return {value: shape.identity, sourceDependencies: shape.sourceDependencies};
  });
}
export function originalGeneratedShape(context: SemanticContext, slot: OriginalGeneratedScalarReference): OriginalScalarShapeResult<OriginalGeneratedScalarShape> {
  return run(context, original => {
    const safe = context.budget.freeze(context.budget.snapshot(slot));
    if (safe.kind !== 'original-generated' || typeof safe.owner !== 'string') throw new TypeError('Expected original scalar slot');
    const shape = sourceShape(original, safe), source = original.sourceNode(safe.owner)!;
    if (shape.variety === 'absent' || shape.variety === 'complex' || !shape.base)
      throw new ShapeProblem('original-generated-variety', 'Original generated scalar has no ordinary simple variety', safe.owner);
    return {value: {slot: safe, name: undefined, targetNamespace: source.context.effectiveNamespace, final: [], annotation: 'absent',
      base: shape.base, variety: shape.variety, primitive: shape.primitive, item: shape.item, members: shape.members},
      sourceDependencies: shape.sourceDependencies};
  });
}
