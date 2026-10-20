/** Concrete effective-content mapping, separate from source and raw component validity. */
import {scopedId} from './canonicalGraph.js';
import type {CanonicalGraph, ComplexTypeNode, GraphNode, NodeId, Occurs, ParticleNode, Reference} from './canonicalGraph.js';
import {assertSemanticContext, graphForSemanticContext} from './semanticContext.js';
import type {SemanticContext} from './semanticContext.js';
import type {OriginalComplexParticleHandle, RawComplexContent} from './re01TypeProperties.js';
import type {RelationFailure} from './schemaTypeRelations.js';
import type {ResourceLimitFailure} from './semanticBudget.js';

export type ParticleContentView = Readonly<{
  contextId: string;
  type: NodeId;
  scope: 'actual-source-mapping' | 'candidate-raw-properties' | 'original-property-projection' | 'builtin-type' | 'model-group';
  /** Actual simple content can reference a diagnostic projection node, not an active scalar component.
   * Semantic scalar properties and the GSC1 identity come from the scalar owner's
   * contentProperties({kind: 'local', target: type}, type), including its obligations.
   * Candidate simple content instead carries its supplied raw scalar reference.
   */
  content: RawComplexContent;
  /** Optional diagnostic materialization, charged on first access; semantic consumers use particleContentNode. */
  graph: CanonicalGraph;
  synthetic: readonly NodeId[];
  urTypeWildcards: readonly NodeId[];
}>;
export type ContentViewResult = Readonly<{kind: 'checked'; view: ParticleContentView}> | RelationFailure | ResourceLimitFailure;
const authorities = new WeakMap<object, SemanticContext>();
const generatedNodes = new WeakMap<object, ReadonlyMap<NodeId, GraphNode>>();
const actualCaches = new WeakMap<object, Map<NodeId, ParticleContentView>>();
const candidateCaches = new WeakMap<object, Map<NodeId, ParticleContentView>>();
const originalPropertyCaches = new WeakMap<object, Map<NodeId, ParticleContentView>>();
const originalParticles = new WeakMap<object, Readonly<{context: SemanticContext; view: ParticleContentView}>>();
const originalParticleCaches = new WeakMap<object, Map<NodeId, OriginalComplexParticleHandle>>();
const originalRawViews = new WeakSet<object>();
const ONE = Object.freeze({min: '1', max: '1'});
const OPTIONAL_MANY = Object.freeze({min: '0', max: 'unbounded'});
const EMPTY = Object.freeze({kind: 'empty'} as const);
const NONE: readonly never[] = Object.freeze([]);
class MappingFailure extends Error {constructor(readonly result: RelationFailure) {super(result.message);}}

export function assertParticleContentView(context: SemanticContext, view: ParticleContentView): void {
  assertSemanticContext(context);
  if (authorities.get(view) !== context) throw new TypeError('Unauthenticated or foreign particle content view');
}

/** Constant-time authenticated semantic lookup, without a whole-graph projection. */
export function particleContentNode(context: SemanticContext, view: ParticleContentView, id: NodeId): GraphNode | undefined {
  assertParticleContentView(context, view); context.budget.chargeWork(2 + id.length);
  const generated = generatedNodes.get(view)!.get(id);
  if (generated) return generated;
  const actual = context.lookup(id); return actual.kind === 'found' ? actual.node : undefined;
}

function issueContentView(context: SemanticContext, fields: Omit<ParticleContentView, 'graph'>, additions: readonly GraphNode[]): ParticleContentView {
  const budget = context.budget; budget.chargeWork(18 + additions.length * 2);
  const generated = new Map<NodeId, GraphNode>();
  for (const node of additions) {budget.chargeWork(2 + node.id.length); generated.set(node.id, node);}
  let projection: CanonicalGraph | undefined;
  const view: ParticleContentView = Object.freeze({...fields, get graph(): CanonicalGraph {
    budget.chargeWork();
    if (projection) return projection;
    const source = graphForSemanticContext(context);
    if (!generated.size) return projection = source;
    budget.chargeWork(12 + source.nodes.length + generated.size);
    projection = Object.freeze({...source, nodes: Object.freeze([...source.nodes, ...generated.values()])});
    return projection;
  }});
  authorities.set(view, context); generatedNodes.set(view, generated); return view;
}

/** Source mapping is meaningful only in the actual source context. */
export function deriveActualComplexContent(context: SemanticContext, type: NodeId): ContentViewResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    const fail = (component: NodeId, message: string): never => {
      budget.chargeWork(8 + component.length + message.length);
      throw new MappingFailure(Object.freeze({kind: 'unresolved', rule: 'effective-complex-content', component, message}));
    };
    try {
      budget.chargeWork(10 + type.length);
      if (context.kind !== 'actual') return fail(type, 'Actual-source content mapping requires the actual context');
      let cache = actualCaches.get(context);
      if (!cache) {budget.chargeWork(2); cache = new Map(); actualCaches.set(context, cache);}
      const cached = cache.get(type);
      if (cached) {budget.chargeWork(3); return Object.freeze({kind: 'checked', view: cached});}
      budget.chargeWork(8);
      const mapped = new Map<NodeId, RawComplexContent>(), active = new Set<NodeId>();
      const additions: GraphNode[] = [], urTypeWildcards: NodeId[] = [];
      const get = (id: NodeId): GraphNode => {
        const found = context.lookup(id);
        return found.kind === 'found' ? found.node : fail(id, `Required component is ${found.kind}`);
      };
      const complex = (id: NodeId): ComplexTypeNode => {
        const node = get(id);
        return node.kind === 'complexType' ? node : fail(id, 'Content mapping requires a complex type');
      };
      const synthetic = (owner: ComplexTypeNode, term: ParticleNode['term'], occurs: Occurs = ONE): NodeId => {
        budget.reserveNodes(1);
        const path = `$semantic-content/${context.contextId}/${additions.length}`;
        budget.chargeWork(96 + 6 * (owner.id.length + path.length));
        const identity = Object.freeze({kind: 'scoped', owner: owner.id, path, role: 'particle'} as const);
        const id = scopedId(owner.id, path, 'particle');
        if (context.lookup(id).kind === 'found') return fail(id, 'Synthetic semantic identity collision');
        budget.chargeWork(16 + id.length);
        additions.push(Object.freeze({id, identity, kind: 'particle', occurs, term, context: owner.context,
          declaredAttributes: NONE, annotations: NONE, retained: NONE, syntaxDetails: NONE}));
        return id;
      };
      const sequence = (owner: ComplexTypeNode, children: readonly NodeId[]): NodeId => {
        budget.chargeWork(4 + children.length);
        return synthetic(owner, Object.freeze({kind: 'sequence', children: Object.freeze([...children])}));
      };
      const particleContent = (node: ComplexTypeNode, particle: NodeId): RawComplexContent => {
        budget.chargeWork(4); return Object.freeze({kind: node.mixed ? 'mixed' : 'element-only', particle});
      };
      const local = (node: ComplexTypeNode): RawComplexContent => {
        if (!node.content) return node.mixed ? particleContent(node, sequence(node, NONE)) : EMPTY;
        const particle = get(node.content);
        if (particle.kind !== 'particle') return fail(node.id, 'Declared content is not a particle');
        budget.chargeWork(4 + particle.occurs.min.length + particle.occurs.max.length);
        const absent = particle.occurs.max === '0' || 'children' in particle.term && particle.term.children.length === 0
          && (particle.term.kind !== 'choice' || particle.occurs.min === '0');
        if (absent) return node.mixed ? particleContent(node, sequence(node, NONE)) : EMPTY;
        return particleContent(node, particle.id);
      };
      const builtin = (owner: ComplexTypeNode, reference: Reference): RawComplexContent => {
        if (reference.kind !== 'builtin' || reference.name.local !== 'anyType') return fail(owner.id, 'Complex content requires a complex base');
        budget.chargeWork(10);
        const wildcard = Object.freeze({namespace: Object.freeze({value: '##any', context: owner.context}), processContents: 'lax'} as const);
        const id = synthetic(owner, Object.freeze({kind: 'any', wildcard}), OPTIONAL_MANY);
        budget.chargeWork(); urTypeWildcards.push(id);
        budget.chargeWork(4); return Object.freeze({kind: 'mixed', particle: sequence(owner, [id])});
      };
      type Frame = {node: ComplexTypeNode; base?: ComplexTypeNode; entered: boolean};
      budget.chargeWork(4); const stack: Frame[] = [{node: complex(type), entered: false}];
      while (stack.length) {
        budget.chargeWork(5); const frame = stack[stack.length - 1], node = frame.node;
        if (!frame.entered) {
          budget.chargeWork(2 + node.id.length);
          if (active.has(node.id)) return fail(node.id, 'Forbidden type derivation cycle');
          active.add(node.id); frame.entered = true;
          if (node.derivation) {
            const target = context.resolve(node.derivation.base);
            if (target.kind === 'found') {
              if (target.node.kind !== 'complexType') {
                if (node.derivation.contentKind === 'complex' || target.node.kind !== 'simpleType') return fail(node.id, 'Content derivation requires an appropriate type base');
              } else {
                frame.base = target.node;
                if (!mapped.has(target.node.id)) {budget.chargeWork(4); stack.push({node: target.node, entered: false}); continue;}
              }
            } else if (target.kind !== 'builtin') return fail(node.id, 'Base is unavailable in the actual context');
          }
        }
        let content: RawComplexContent;
        if (node.derivation?.contentKind === 'simple') {
          const inherited = frame.base ? mapped.get(frame.base.id)! : undefined;
          const scalar = inherited?.kind === 'simple' ? inherited.type : !frame.base ? node.derivation.base : undefined;
          if (node.derivation.kind === 'extension') {
            if (!scalar || scalar.kind === 'builtin' && scalar.name.local === 'anyType') return fail(node.id, 'Simple-content extension requires simple content');
            budget.chargeWork(4); content = Object.freeze({kind: 'simple', type: scalar});
          } else {
            const base = node.derivation.inlineType ?? scalar;
            if (!base) return fail(node.id, 'Simple-content restriction requires a mapped simple base or explicit inline type');
            // This is only the authentic source slot selector. The scalar
            // owner separately maps its properties and assesses local legality.
            budget.chargeWork(4);
            const slot = context.lookupScalarSlot({kind: 'original-generated', owner: node.id});
            if (slot.kind !== 'found') return fail(node.id, 'Original generated scalar slot is unavailable');
            budget.chargeWork(3); content = Object.freeze({kind: 'simple', type: slot.slot});
          }
        } else {
          const declared = local(node);
          if (node.derivation?.kind !== 'extension') content = declared;
          else {
            const base = frame.base ? mapped.get(frame.base.id)! : builtin(node, node.derivation.base);
            if (base.kind === 'simple' || base.kind === 'opaque-builtin') return fail(node.id, 'Complex-content extension cannot extend scalar or unresolved builtin content');
            if (declared.kind === 'empty') content = base;
            else if (base.kind === 'empty') content = declared;
            else if ('particle' in declared) content = particleContent(node, sequence(node, [base.particle, declared.particle]));
            else return fail(node.id, 'Complex content unexpectedly mapped to scalar content');
          }
        }
        budget.chargeWork(3); mapped.set(node.id, content); active.delete(node.id); stack.pop();
      }
      budget.chargeWork(24 + 2 * additions.length + urTypeWildcards.length);
      const view = issueContentView(context, {contextId: context.contextId, type, scope: 'actual-source-mapping', content: mapped.get(type)!,
        synthetic: Object.freeze(additions.map(node => node.id)), urTypeWildcards: Object.freeze(urTypeWildcards)}, additions);
      cache.set(type, view);
      return Object.freeze({kind: 'checked', view});
    } catch (error: unknown) {if (error instanceof MappingFailure) return error.result; throw error;}
  });
}

export type OriginalParticleResult = Readonly<{kind: 'checked'; content: Extract<RawComplexContent, {particle: NodeId}>}>
  | RelationFailure | ResourceLimitFailure;

/** Select the same source component, conditional on the separate actual-source
 * qualification. Neither the source owner's nor its current-H validity is imported. */
export function deriveOriginalComplexParticle(context: SemanticContext, type: NodeId): OriginalParticleResult {
  assertSemanticContext(context);
  return context.budget.guard(() => {
    const b = context.budget; b.chargeWork(12 + type.length);
    if (!context.originalComplexContentSource(type)) return Object.freeze({kind: 'unresolved',
      rule: 'original-particle-source', component: type, message: 'Authentic actual complex source mapping required'});
    const source = deriveActualComplexContent(context, type);
    if (source.kind !== 'checked') return source;
    if (!('particle' in source.view.content)) return Object.freeze({kind: 'unresolved',
      rule: 'original-particle-source', component: type, message: 'Original content must be a particle'});
    let cache = originalParticleCaches.get(context);
    if (!cache) {b.chargeWork(2); cache = new Map(); originalParticleCaches.set(context, cache);}
    let handle = cache.get(type);
    if (!handle) {
      b.chargeWork(8 + type.length + source.view.content.particle.length);
      handle = Object.freeze({owner: type, particle: source.view.content.particle}) as OriginalComplexParticleHandle;
      originalParticles.set(handle, {context, view: source.view}); cache.set(type, handle);
    }
    b.chargeWork(5);
    return Object.freeze({kind: 'checked', content: Object.freeze({...source.view.content, original: handle})});
  });
}

/** Private issuer authentication used before the context factory snapshots raw data. */
export function originalComplexParticleSource(context: SemanticContext, handle: OriginalComplexParticleHandle): ParticleContentView {
  assertSemanticContext(context); context.budget.chargeWork(4);
  const source = originalParticles.get(handle);
  if (!source || source.context !== context || context.kind !== 'actual') throw new TypeError('Unauthenticated or foreign original particle handle');
  return source.view;
}

/** Raw candidate properties are read directly; their component validity remains a separate prerequisite. */
export function deriveRawComplexContent(context: SemanticContext, type: NodeId): ContentViewResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    budget.chargeWork(10 + type.length);
    let cache = candidateCaches.get(context);
    if (!cache) {budget.chargeWork(2); cache = new Map(); candidateCaches.set(context, cache);}
    const cached = cache.get(type);
    if (cached) {budget.chargeWork(3); return Object.freeze({kind: 'checked', view: cached});}
    const properties = context.rawTypeProperties(type);
    if (context.kind !== 'candidate' || !properties) {
      budget.chargeWork(8); return Object.freeze({kind: 'unresolved', rule: 'effective-complex-content', component: type, message: 'Candidate raw type properties are required'});
    }
    const additions: GraphNode[] = [];
    let synthetic: readonly NodeId[] = NONE, urTypeWildcards: readonly NodeId[] = NONE;
    const original = 'particle' in properties.content ? properties.content.original : undefined;
    if (original) {
      const actual = context.originalContext(), source = originalComplexParticleSource(actual, original);
      const owner = context.lookup(original.owner);
      if (owner.kind !== 'found' || owner.node.kind !== 'complexType' || !('particle' in properties.content)
        || properties.content.particle !== original.particle) throw new TypeError('Invalid original particle selection');
      synthetic = source.synthetic; urTypeWildcards = source.urTypeWildcards;
      for (const id of synthetic) {
        budget.chargeWork(3 + id.length);
        if (context.lookup(id).kind !== 'missing') return Object.freeze({kind: 'unresolved', rule: 'original-property-synthetic-collision',
          component: id, message: 'Original particle identity is occupied'});
        const node = particleContentNode(actual, source, id);
        if (!node) throw new TypeError('Missing original particle backing');
        additions.push(node);
      }
    } else if ('particle' in properties.content) {
      const particle = context.lookup(properties.content.particle);
      if (particle.kind !== 'found' || particle.node.kind !== 'particle') {
        budget.chargeWork(8); return Object.freeze({kind: 'unresolved', rule: 'effective-complex-content', component: type, message: 'Raw content particle is unavailable'});
      }
    }
    budget.chargeWork(12);
    const view = issueContentView(context, {contextId: context.contextId, type, scope: 'candidate-raw-properties', content: properties.content,
      synthetic, urTypeWildcards}, additions);
    if (original) originalRawViews.add(view);
    cache.set(type, view);
    return Object.freeze({kind: 'checked', view});
  });
}

/** Retained source properties interpreted in H; never full hypothetical type validity. */
export function deriveOriginalComplexPropertyContent(context: SemanticContext, type: NodeId): ContentViewResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    budget.chargeWork(10 + type.length);
    const owner = context.lookup(type);
    const fail = (rule: string, component = type): ContentViewResult => {
      budget.chargeWork(8 + rule.length + component.length);
      return Object.freeze({kind: 'unresolved', rule, component, message: 'Original property projection is unavailable'});
    };
    if (owner.kind !== 'found' || owner.node.kind !== 'complexType') return fail('component-complex-properties');
    if (context.rawTypeProperties(type)) return deriveRawComplexContent(context, type);
    if (!context.originalComplexPropertySource(type)) return fail('component-complex-properties');
    let cache = originalPropertyCaches.get(context);
    if (!cache) {budget.chargeWork(2); cache = new Map(); originalPropertyCaches.set(context, cache);}
    const prior = cache.get(type);
    if (prior) {budget.chargeWork(3); return Object.freeze({kind: 'checked', view: prior});}
    const source = deriveActualComplexContent(context.originalContext(), type);
    if (source.kind !== 'checked') return source;
    if (source.view.content.kind === 'simple' || source.view.content.kind === 'opaque-builtin') return fail('component-content-properties');
    const additions: GraphNode[] = [];
    for (const id of source.view.synthetic) {
      budget.chargeWork(3 + id.length);
      if (context.lookup(id).kind !== 'missing') return fail('original-property-synthetic-collision', id);
      const node = particleContentNode(context.originalContext(), source.view, id);
      if (!node) return fail('original-property-synthetic-component', id);
      additions.push(node);
    }
    const view = issueContentView(context, {contextId: context.contextId, type, scope: 'original-property-projection',
      content: source.view.content, synthetic: source.view.synthetic, urTypeWildcards: source.view.urTypeWildcards}, additions);
    cache.set(type, view);
    return Object.freeze({kind: 'checked', view});
  });
}

/** Same-H private subtree input for local predicates, never a component-validity receipt. */
export function deriveOriginalContentSubtree(context: SemanticContext, source: ParticleContentView, particle: NodeId): ContentViewResult {
  assertParticleContentView(context, source);
  const budget = context.budget;
  return budget.guard(() => {
    budget.chargeWork(12 + particle.length + source.synthetic.length);
    if (!(originalRawViews.has(source) || source.scope === 'original-property-projection' && context.originalComplexPropertySource(source.type))
      || !source.synthetic.includes(particle) || context.lookup(particle).kind !== 'missing')
      return Object.freeze({kind: 'unresolved', rule: 'original-content-subtree', component: particle, message: 'Authentic private original subtree required'});
    const node = particleContentNode(context, source, particle);
    if (node?.kind !== 'particle') return Object.freeze({kind: 'unresolved', rule: 'original-content-subtree', component: particle, message: 'Private subtree must be a particle'});
    budget.chargeWork(source.synthetic.length + 4);
    return Object.freeze({kind: 'checked', view: issueContentView(context, {contextId: context.contextId, type: source.type,
      scope: source.scope, content: Object.freeze({kind: 'element-only', particle}), synthetic: source.synthetic,
      urTypeWildcards: source.urTypeWildcards}, [...generatedNodes.get(source)!.values()])});
  });
}

const builtinCaches = new WeakMap<object, Map<NodeId, ParticleContentView>>();
/** The primary ur-type component, never inferred from an ordinary wildcard's spelling. */
export function deriveBuiltinAnyTypeContent(context: SemanticContext, anchor: NodeId): ContentViewResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    budget.chargeWork(12 + anchor.length);
    let cache = builtinCaches.get(context);
    if (!cache) {budget.chargeWork(2); cache = new Map(); builtinCaches.set(context, cache);}
    const prior = cache.get(anchor);
    if (prior) {budget.chargeWork(3); return Object.freeze({kind: 'checked', view: prior});}
    const owner = context.lookup(anchor);
    if (owner.kind !== 'found') {
      budget.chargeWork(8); return Object.freeze({kind: 'unresolved', rule: 'builtin-anyType-content', component: anchor, message: 'Active diagnostic anchor required'});
    }
    budget.reserveNodes(2);
    const path = '$semantic-builtin-anyType/' + context.contextId;
    budget.chargeWork(180 + 12 * (anchor.length + path.length));
    const anyId = scopedId(anchor, path + '/any', 'particle'), groupId = scopedId(anchor, path + '/sequence', 'particle');
    if (context.lookup(anyId).kind === 'found' || context.lookup(groupId).kind === 'found') {
      budget.chargeWork(8); return Object.freeze({kind: 'unresolved', rule: 'builtin-anyType-content', component: anchor, message: 'Synthetic ur-type identity collision'});
    }
    const common = {kind: 'particle' as const, context: owner.node.context, declaredAttributes: NONE, annotations: NONE, retained: NONE, syntaxDetails: NONE};
    const wildcard = Object.freeze({namespace: Object.freeze({value: '##any', context: owner.node.context}), processContents: 'lax'} as const);
    const any: ParticleNode = Object.freeze({...common, id: anyId, identity: Object.freeze({kind: 'scoped', owner: anchor, path: path + '/any', role: 'particle'}),
      occurs: OPTIONAL_MANY, term: Object.freeze({kind: 'any', wildcard})});
    const sequence: ParticleNode = Object.freeze({...common, id: groupId, identity: Object.freeze({kind: 'scoped', owner: anchor, path: path + '/sequence', role: 'particle'}),
      occurs: ONE, term: Object.freeze({kind: 'sequence', children: Object.freeze([anyId])})});
    budget.chargeWork(25);
    const view = issueContentView(context, {contextId: context.contextId, type: anchor, scope: 'builtin-type',
      content: Object.freeze({kind: 'mixed', particle: groupId}),
      synthetic: Object.freeze([anyId, groupId]), urTypeWildcards: Object.freeze([anyId])}, [any, sequence]);
    cache.set(anchor, view);
    return Object.freeze({kind: 'checked', view});
  });
}

const groupCaches = new WeakMap<object, Map<NodeId, ParticleContentView>>();
/** Local model-group constraints also apply to definitions unused by any type. */
export function deriveModelGroupContent(context: SemanticContext, component: NodeId): ContentViewResult {
  assertSemanticContext(context);
  const budget = context.budget;
  return budget.guard(() => {
    budget.chargeWork(10 + component.length);
    let cache = groupCaches.get(context);
    if (!cache) {budget.chargeWork(2); cache = new Map(); groupCaches.set(context, cache);}
    const prior = cache.get(component);
    if (prior) {budget.chargeWork(3); return Object.freeze({kind: 'checked', view: prior});}
    const node = context.lookup(component);
    if (node.kind !== 'found' || node.node.kind !== 'group' && node.node.kind !== 'particle') {
      budget.chargeWork(8); return Object.freeze({kind: 'unresolved', rule: 'coss-modelGroup', component, message: 'An active model-group definition or particle is required'});
    }
    const particle = node.node.kind === 'group' ? node.node.content : node.node.id;
    const root = context.lookup(particle);
    if (root.kind !== 'found' || root.node.kind !== 'particle') {
      budget.chargeWork(8); return Object.freeze({kind: 'unresolved', rule: 'coss-modelGroup', component, message: 'Model-group root is not an active particle'});
    }
    budget.chargeWork(13);
    const view = issueContentView(context, {contextId: context.contextId, type: component, scope: 'model-group',
      content: Object.freeze({kind: 'element-only', particle}), synthetic: NONE, urTypeWildcards: NONE}, NONE);
    cache.set(component, view);
    return Object.freeze({kind: 'checked', view});
  });
}
