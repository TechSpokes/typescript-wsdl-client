/** Initial ordinary prototype reissue only; supplied deltas are not validity receipts. */
import type {ComplexTypeNode, ElementNode, GraphNode, Identity, NodeId, ParticleNode, Reference} from '../../../src/compiler/canonicalGraph.js';
import {allocateHypotheticalScopedIdentity, semanticIdentityTuple} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {assertSemanticContext, storedIdentityOccupant} from '../../../src/compiler/semanticContext.js';
import type {SemanticCandidateDelta, SemanticContext} from '../../../src/compiler/semanticContext.js';
import {deriveRawComplexContent} from '../../../src/compiler/complexTypeContent.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import {declaredType} from '../../../src/compiler/schemaTypeIdentity.js';
import {declarationMethods} from '../../../src/compiler/schemaTypeRelations.js';
import {readElementIdentityConstraints} from '../../../src/compiler/schemaIdentityConstraints.js';
import {readParticleWildcard} from '../../../src/compiler/schemaParticleWildcardProperties.js';
import type {RawParticleWildcardProperties} from '../../../src/compiler/schemaParticleWildcardProperties.js';
import type {RawElementProperties} from '../../../src/compiler/schemaElementProperties.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';

export type PrototypeFrameFailure = Readonly<{kind: 'outside-frame'; rule: string; component?: NodeId}>;
export type SelectedPrototypeInput = Readonly<{
  parent: SemanticContext;
  donor: SemanticContext;
  /** An actually retained parent storage carrier; its FULL is not inferred. */
  carrier: NodeId;
  /** Supplied initial BASE section. Every selected value is a fixed point. */
  section: ReadonlyMap<NodeId, NodeId>;
  /** Already planned GLOBAL declarations keep their literal identities. */
  externalGlobals?: readonly NodeId[];
  /** Other planned first-birth additions reserve both their ID and identity tuple. */
  reserved?: readonly Readonly<{id: NodeId; identity: Identity}>[];
}>;
export type PreparedPrototypes = Readonly<{
  kind: 'prepared-prototypes';
  delta: Pick<SemanticCandidateDelta, 'additions' | 'rawTypes' | 'rawElements' | 'rawParticleWildcards'>;
  typeMap: ReadonlyMap<NodeId, NodeId>;
  particleMap: ReadonlyMap<NodeId, NodeId>;
  declarationMap: ReadonlyMap<NodeId, NodeId>;
  requiredExternal: readonly NodeId[];
}>;
export type SelectedPrototypeResult = PreparedPrototypes | PrototypeFrameFailure | ResourceLimitFailure;
class Outside extends Error {constructor(readonly result: PrototypeFrameFailure) {super(result.rule);}}

/**
 * Reissue chosen actual BODY/BASE prototypes at one genuine first birth.
 * FIELDs use the supplied TYPE section; private particle identity is injective.
 * No search, child construction, source authority or semantic receipt is issued.
 */
export function prepareSelectedPrototypes(input: SelectedPrototypeInput): SelectedPrototypeResult {
  const {parent, donor} = input;
  assertSemanticContext(parent); assertSemanticContext(donor);
  const b = parent.budget;
  return b.guard(() => {
    const fail = (rule: string, component?: NodeId): never => {
      b.chargeWork(8 + rule.length + (component?.length ?? 0));
      throw new Outside(Object.freeze({kind: 'outside-frame', rule, ...(component === undefined ? {} : {component})}));
    };
    try {
      b.chargeWork(32);
      if (parent.originalContext() !== donor.originalContext()) return fail('foreign-source-context');
      const get = (id: NodeId): GraphNode => {
        b.chargeWork(2 + id.length); const found = donor.lookup(id);
        return found.kind === 'found' ? found.node : fail('donor-component-unavailable', id);
      };
      if (parent.lookup(input.carrier).kind !== 'found') return fail('carrier-unavailable', input.carrier);
      const carrier = parent.lookup(input.carrier); // All TYPE storage owners stay outside the new owner graph.
      if (carrier.kind !== 'found' || carrier.node.kind !== 'complexType' && carrier.node.kind !== 'element'
        && carrier.node.kind !== 'group') return fail('unsupported-carrier', input.carrier);
      b.chargeWork(80 + input.section.size * 4 + (input.externalGlobals?.length ?? 0) * 2);
      const section = new Map(input.section), selected = new Set(section.values());
      const externals = new Set(input.externalGlobals ?? []), requiredExternal = new Set<NodeId>([input.carrier]);
      const types = new Map<NodeId, ComplexTypeNode>(), rows = new Map<NodeId, RawComplexTypeProperties>();
      const targets = new Map<NodeId, NodeId>(), particleMap = new Map<NodeId, NodeId>(), declarationMap = new Map<NodeId, NodeId>();
      const particles = new Map<NodeId, ParticleNode>(), declarations = new Map<NodeId, ElementNode>();
      const bodies = new Map<NodeId, RawComplexContent>();
      const reservedIds = new Set<NodeId>(), reservedTuples = new Set<string>();
      const reserve = (id: NodeId, identity: Identity): void => {
        b.chargeWork(4 + id.length); reservedIds.add(id); reservedTuples.add(semanticIdentityTuple(identity, b.chargeWork));
      };
      for (const planned of input.reserved ?? []) reserve(planned.id, planned.identity);
      const allocate = (owner: NodeId, role: string) => {
        // The context query includes inactive stored identities. Each blocked
        // tuple is reserved before retrying; the stored context is finite.
        while (true) {
          b.chargeWork(4);
          const found = allocateHypotheticalScopedIdentity(owner, role, reservedIds, reservedTuples, b.chargeWork);
          const occupied = parent.lookup(found.id).kind !== 'missing' || storedIdentityOccupant(parent, found.identity) !== undefined;
          reserve(found.id, found.identity);
          if (!occupied) return found;
        }
      };
      const external = (id: NodeId): boolean => {
        b.chargeWork(2 + id.length);
        const found = parent.lookup(id);
        if (found.kind === 'found') {requiredExternal.add(id); return true;}
        if (externals.has(id)) {
          const node = get(id);
          if (node.identity.kind !== 'global' || node.kind !== 'element') return fail('unsupported-external-global', id);
          requiredExternal.add(id); return true;
        }
        return false;
      };
      const typeId = (reference: SemanticTypeReference): NodeId | undefined => {
        if (reference.kind === 'original-generated') return fail('scalar-slot-outside-frame', reference.owner);
        const found = donor.resolve(reference);
        if (found.kind === 'builtin') return undefined;
        if (found.kind !== 'found' || found.node.kind !== 'complexType' && found.node.kind !== 'simpleType')
          return fail('type-unavailable');
        return found.node.id;
      };
      const image = (reference: SemanticTypeReference): Reference => {
        const id = typeId(reference);
        if (id === undefined) return reference as Reference;
        const mapped = targets.get(section.get(id) ?? id);
        if (mapped) return {kind: 'local', target: mapped};
        if (!external(id)) return fail('unmapped-type-exit', id);
        return reference as Reference;
      };
      const ordinary = (id: NodeId): Readonly<{node: ComplexTypeNode; row: RawComplexTypeProperties}> => {
        const node = get(id), row = donor.rawTypeProperties(id);
        if (node.kind !== 'complexType' || node.identity.kind !== 'scoped' || !row) return fail('anonymous-raw-type-required', id);
        if (row.content.kind === 'simple' || row.content.kind === 'opaque-builtin' || node.derivation?.contentKind === 'simple')
          return fail('simple-content-outside-frame', id);
        if (row.attributeUses.length || row.wildcard || node.attributes.length) return fail('attributes-outside-frame', id);
        if (row.targetNamespace === undefined) return fail('explicit-namespace-required', id);
        return {node, row};
      };
      const key = (reference: SemanticTypeReference): string => {
        const id = typeId(reference);
        if (reference.kind === 'builtin') b.chargeWork(12 + reference.name.namespace.length + reference.name.local.length);
        return id === undefined && reference.kind === 'builtin' ? JSON.stringify([reference.name.namespace, reference.name.local])
          : id === undefined ? fail('unsupported-base') : section.get(id) ?? id;
      };
      for (const [old, chosen] of section) {
        b.chargeWork(8);
        if (section.get(chosen) !== chosen) return fail('section-not-a-retraction', old);
        if (parent.lookup(old).kind === 'found' || parent.lookup(chosen).kind === 'found') return fail('inherited-type-rewrite', old);
        const a = ordinary(old), c = ordinary(chosen);
        if (a.row.derivation.method !== c.row.derivation.method || a.row.abstract !== c.row.abstract
          || a.row.targetNamespace !== c.row.targetNamespace || a.row.content.kind !== c.row.content.kind
          || JSON.stringify(a.row.final) !== JSON.stringify(c.row.final) || JSON.stringify(a.row.block) !== JSON.stringify(c.row.block))
          return fail('incompatible-type-header', old);
        if (key(a.row.derivation.base) !== key(c.row.derivation.base)) return fail('section-does-not-preserve-base', old);
        const selectedBase = typeId(c.row.derivation.base);
        if (selectedBase !== undefined && section.has(selectedBase) && section.get(selectedBase) !== selectedBase)
          return fail('selected-base-not-selected', chosen);
      }
      for (const id of selected) {
        const prototype = ordinary(id), allocated = allocate(input.carrier, 'type');
        b.chargeWork(20 + id.length + allocated.id.length);
        targets.set(id, allocated.id); types.set(id, {...prototype.node, id: allocated.id, identity: allocated.identity}); rows.set(id, prototype.row);
      }
      const fixed = (id: NodeId): boolean => {
        const found = parent.lookup(id);
        if (found.kind !== 'found') return false;
        if (get(id) !== found.node) return fail('protected-record-changed', id);
        requiredExternal.add(id); return true;
      };
      const scope = (declaration: ElementNode): NodeId => {
        let current: GraphNode = declaration; const seen = new Set<NodeId>();
        while (current.identity.kind === 'scoped') {
          b.chargeWork(4);
          if (seen.has(current.id)) return fail('scope-cycle', declaration.id);
          seen.add(current.id); current = get(current.identity.owner);
          if (current.kind === 'complexType') {
            const mapped = image({kind: 'local', target: current.id});
            return mapped.kind === 'local' ? mapped.target : fail('unsupported-scope', declaration.id);
          }
          if (current.kind === 'group' || current.kind === 'attributeGroup') {
            if (!fixed(current.id)) return fail('group-scope-rewrite-outside-frame', current.id);
            return current.id;
          }
        }
        return fail('undefined-scope-outside-frame', declaration.id);
      };
      const pending: NodeId[] = [];
      const enqueue = (id: NodeId): void => {b.chargeWork(2 + id.length); pending.push(id);};
      for (const [id, row] of rows) {
        if ('particle' in row.content && row.content.original) {
          const view = deriveRawComplexContent(donor, id);
          if (view.kind === 'resource-limit') return view;
          if (view.kind !== 'checked') return fail('source-whole-unavailable', id);
          if (parent.lookup(row.content.original.owner).kind !== 'found') return fail('source-owner-unavailable', row.content.original.owner);
          // Opaque source backing consists of immutable actual identities.
          // A section over any of those identities is an unsupported rewrite.
          for (const source of section.keys()) if (donor.originalContext().sourceNode(source)) return fail('source-backing-rewrite', source);
          bodies.set(id, row.content); requiredExternal.add(row.content.original.owner);
        } else {
          bodies.set(id, row.content);
          if ('particle' in row.content) enqueue(row.content.particle);
        }
      }
      while (pending.length) {
        b.chargeWork(4); const id = pending.pop()!;
        if (particles.has(id) || declarations.has(id) || fixed(id)) continue;
        const node = get(id);
        if (node.kind === 'particle') {
          if (node.occurs.max === '0') return fail('zero-particle-outside-frame', id);
          if (node.term.kind === 'group') {
            const group = donor.resolve(node.term.reference);
            if (group.kind !== 'found' || group.node.kind !== 'group' || !fixed(group.node.id)) return fail('group-rewrite-outside-frame', id);
          } else if (node.term.kind === 'element') {
            const declaration = donor.resolve(node.term.declaration);
            if (declaration.kind !== 'found' || declaration.node.kind !== 'element') return fail('element-unavailable', id);
            if (declaration.node.identity.kind === 'global') {
              if (!external(declaration.node.id)) return fail('unplanned-global', declaration.node.id);
            } else enqueue(declaration.node.id);
          } else if ('children' in node.term) for (const child of node.term.children) enqueue(child);
          const allocated = allocate(input.carrier, 'particle'); b.chargeWork(20 + id.length + allocated.id.length); particleMap.set(id, allocated.id);
          particles.set(id, {...node, id: allocated.id, identity: allocated.identity});
        } else if (node.kind === 'element' && node.identity.kind === 'scoped') {
          if (node.value || node.substitutionGroup) return fail('declaration-value-or-sg-outside-frame', id);
          const constraints = readElementIdentityConstraints(donor, id);
          if (constraints.kind === 'resource-limit') return constraints;
          if (constraints.kind !== 'checked' || constraints.value.length) return fail('identity-constraints-outside-frame', id);
          image(declaredType(donor, node));
          const owner = scope(node), allocated = allocate(owner, 'element');
          b.chargeWork(20 + id.length + allocated.id.length);
          declarationMap.set(id, allocated.id); declarations.set(id, {...node, id: allocated.id, identity: allocated.identity});
        } else return fail('unsupported-private-component', id);
      }
      const component = (id: NodeId): NodeId => {b.chargeWork(4 + id.length); return particleMap.get(id) ?? declarationMap.get(id) ?? id;};
      const reference = (ref: Reference): Reference => {
        const found = donor.resolve(ref);
        if (found.kind === 'builtin') return ref;
        if (found.kind !== 'found') return fail('reference-unavailable');
        return {kind: 'local', target: component(found.node.id)};
      };
      const additions: GraphNode[] = [], rawTypes: RawComplexTypeProperties[] = [], rawElements: RawElementProperties[] = [], rawParticleWildcards: RawParticleWildcardProperties[] = [];
      for (const [old, node] of particles) {
        b.chargeWork(24);
        const prototype = get(old); if (prototype.kind !== 'particle') return fail('particle-required', old);
        if ('children' in prototype.term) b.chargeWork(1 + prototype.term.children.length);
        const term = prototype.term.kind === 'element' ? {...prototype.term, declaration: reference(prototype.term.declaration)}
          : prototype.term.kind === 'group' ? {...prototype.term, reference: reference(prototype.term.reference)}
            : 'children' in prototype.term ? {...prototype.term, children: prototype.term.children.map(component)} : prototype.term;
        additions.push({...node, term});
        if (prototype.term.kind === 'any') {
          const wildcard = readParticleWildcard(donor, prototype);
          rawParticleWildcards.push({particle: node.id, namespace: wildcard.namespace, processContents: wildcard.processContents});
        }
      }
      for (const [old, node] of declarations) {
        b.chargeWork(28);
        const prototype = get(old); if (prototype.kind !== 'element') return fail('element-required', old);
        const type = image(declaredType(donor, prototype));
        additions.push({...node, type});
        rawElements.push({element: node.id, type, final: declarationMethods(donor, prototype, 'final') as RawElementProperties['final'],
          block: declarationMethods(donor, prototype, 'block') as RawElementProperties['block']});
      }
      for (const [old, node] of types) {
        b.chargeWork(32);
        const row = rows.get(old)!, body = bodies.get(old)!, base = image(row.derivation.base);
        const content = 'particle' in body && !body.original ? {...body, particle: component(body.particle)} : body;
        additions.push({...node, content: 'particle' in content && !content.original ? content.particle : undefined,
          derivation: {kind: row.derivation.method, contentKind: 'complex', base, facets: []}});
        rawTypes.push({...row, type: node.id, derivation: {method: row.derivation.method, base}, content,
          provenance: {kind: 'hypothetical-abstract', originals: []}});
      }
      const typeMap = new Map<NodeId, NodeId>();
      for (const [old, chosen] of section) {b.chargeWork(4 + old.length + chosen.length); typeMap.set(old, targets.get(chosen)!);}
      b.chargeWork(additions.length + rawTypes.length + rawElements.length + requiredExternal.size + 32);
      return Object.freeze({kind: 'prepared-prototypes', delta: Object.freeze({additions: b.freeze(additions), rawTypes: b.freeze(rawTypes),
        rawElements: b.freeze(rawElements), rawParticleWildcards: b.freeze(rawParticleWildcards)}),
      typeMap, particleMap, declarationMap, requiredExternal: Object.freeze([...requiredExternal])});
    } catch (error: unknown) {if (error instanceof Outside) return error.result; throw error;}
  });
}
