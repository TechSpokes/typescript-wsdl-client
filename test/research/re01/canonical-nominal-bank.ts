/** Canonical ordinary nominal deltas only; no search, receipt or action-lifting claim. */
import {globalId} from '../../../src/compiler/canonicalGraph.js';
import type {ComplexTypeNode, ElementNode, GraphNode, Identity, NodeId, Reference} from '../../../src/compiler/canonicalGraph.js';
import {isXmlNCName, XSD_NAMESPACE} from '../../../src/loader/orderedSyntax.js';
import type {ExpandedName} from '../../../src/loader/orderedSyntax.js';
import {assertSemanticContext, storedIdentityOccupant} from '../../../src/compiler/semanticContext.js';
import type {SemanticCandidateDelta, SemanticContext} from '../../../src/compiler/semanticContext.js';
import {allocateHypotheticalScopedIdentity, semanticIdentityTuple} from '../../../src/compiler/hypotheticalScopedIdentity.js';
import {deriveActualComplexContent, deriveOriginalComplexParticle} from '../../../src/compiler/complexTypeContent.js';
import {assessSourceAttributeUses} from '../../../src/compiler/schemaAttributeUses.js';
import {declarationMethods} from '../../../src/compiler/schemaTypeRelations.js';
import {declaredType, resolveSemanticType} from '../../../src/compiler/schemaTypeIdentity.js';
import type {SemanticTypeReference} from '../../../src/compiler/semanticTypeReference.js';
import type {RawComplexContent, RawComplexTypeProperties} from '../../../src/compiler/re01TypeProperties.js';
import type {RawElementProperties} from '../../../src/compiler/schemaElementProperties.js';
import type {ResourceLimitFailure} from '../../../src/compiler/semanticBudget.js';

export type BankTypeRef = Readonly<{role: string}> | Readonly<{anchor: true}>;
export type NominalBankRole = Readonly<{
  role: string; base: BankTypeRef; method: 'extension' | 'restriction';
  block: readonly ('extension' | 'restriction')[]; named: boolean;
}>;
export type NominalGlobalPort = Readonly<{name: ExpandedName; type: BankTypeRef; head: NodeId}>;
export type CanonicalBankInput = Readonly<{
  parent: SemanticContext; carrier: NodeId; mode: 'aur-free' | 'proper-b'; anchor: NodeId;
  roles: readonly NominalBankRole[]; globals: readonly NominalGlobalPort[];
  reserved?: readonly Readonly<{id: NodeId; identity: Identity}>[];
}>;
export type CanonicalBankFailure = Readonly<{kind: 'outside-frame'; rule: string; component?: NodeId}>;
export type NominalChildDelta = Readonly<{
  target: NodeId; intermediate: NodeId; ancestor: Reference;
  /** Caller supplies the actual current membership and a distinct fork key. */
  delta: Pick<SemanticCandidateDelta, 'endpoint' | 'additions' | 'rawTypes'>;
}>;
export type PreparedNominalBank = Readonly<{
  kind: 'prepared-nominal-bank';
  delta: Pick<SemanticCandidateDelta, 'additions' | 'rawTypes' | 'rawElements'>;
  roles: ReadonlyMap<string, NodeId>; globals: readonly NodeId[];
  children: ReadonlyMap<string, NominalChildDelta>; requiredExternal: readonly NodeId[];
}>;
class Stop extends Error {constructor(readonly result: CanonicalBankFailure | ResourceLimitFailure) {super(result.kind);}}

/** Preserve the supplied shared role forest; derive C and AU/AW from its exact SOURCE anchor. */
export function prepareCanonicalNominalBank(input: CanonicalBankInput): PreparedNominalBank | CanonicalBankFailure | ResourceLimitFailure {
  assertSemanticContext(input.parent);
  const parent = input.parent, b = parent.budget;
  return b.guard(() => {
    const actual = parent.originalContext();
    const fail = (rule: string, component?: NodeId): never => {
      b.chargeWork(16 + rule.length + (component?.length ?? 0));
      throw new Stop(Object.freeze({kind: 'outside-frame', rule, ...(component === undefined ? {} : {component})}));
    };
    try {
      b.chargeWork(64 + input.roles.length * 4 + input.globals.length * 4 + (input.reserved?.length ?? 0) * 4);
      const data = b.freeze(b.snapshot({roles: input.roles, globals: input.globals, reserved: input.reserved ?? []}));
      const get = (id: NodeId): GraphNode => {
        b.chargeWork(3 + id.length); const found = parent.lookup(id);
        return found.kind === 'found' ? found.node : fail('component-unavailable', id);
      };
      const carrier = get(input.carrier);
      if (!['complexType', 'element', 'group'].includes(carrier.kind)) return fail('unsupported-carrier', carrier.id);
      const anchor = get(input.anchor), sourceAnchor = actual.lookup(input.anchor);
      if (anchor.kind !== 'complexType' || sourceAnchor.kind !== 'found' || sourceAnchor.node !== anchor
        || !actual.originalComplexContentSource(anchor.id)) return fail('unchanged-source-anchor-required', input.anchor);
      const local = (target: string): Reference => ({kind: 'local', target});
      const typeKey = (reference: SemanticTypeReference): string => {
        b.chargeWork(4); const found = resolveSemanticType(parent, reference);
        if (found.kind === 'component' && found.node.kind === 'complexType') return found.node.id;
        if (found.kind === 'builtin' && found.name.namespace === XSD_NAMESPACE && found.name.local === 'anyType') return 'builtin:anyType';
        return fail('ordinary-complex-type-required');
      };
      const baseOf = (node: ComplexTypeNode): SemanticTypeReference => parent.rawTypeProperties(node.id)?.derivation.base
        ?? node.derivation?.base ?? {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}};
      const methodOf = (node: ComplexTypeNode) => parent.rawTypeProperties(node.id)?.derivation.method ?? node.derivation?.kind ?? 'restriction';
      let a = anchor;
      if (input.mode === 'proper-b') {
        const base = typeKey(baseOf(anchor)), found = parent.lookup(base);
        if (methodOf(anchor) !== 'extension' || found.kind !== 'found' || found.node.kind !== 'complexType') return fail('proper-primitive-anchor-required', anchor.id);
        a = found.node;
      } else if (input.mode !== 'aur-free') return fail('unsupported-bank-mode');
      if (typeKey(baseOf(a)) !== 'builtin:anyType') return fail('designated-height-one-anchor-required', a.id);
      const aSource = actual.lookup(a.id);
      if (aSource.kind !== 'found' || aSource.node !== a || !actual.originalComplexContentSource(a.id)) return fail('unchanged-designated-anchor-required', a.id);
      const sourceProperties = (node: ComplexTypeNode) => {
        const mapped = deriveActualComplexContent(actual, node.id);
        if (mapped.kind === 'resource-limit') throw new Stop(mapped);
        if (mapped.kind !== 'checked') return fail('anchor-content-unavailable', node.id);
        let content: RawComplexContent = mapped.view.content;
        if (content.kind === 'simple' || content.kind === 'opaque-builtin') return fail('scalar-or-opaque-content-outside-frame', node.id);
        if ('particle' in content) {
          const whole = deriveOriginalComplexParticle(actual, node.id);
          if (whole.kind === 'resource-limit') throw new Stop(whole);
          if (whole.kind !== 'checked') return fail('authentic-whole-required', node.id);
          content = whole.content;
        }
        const attributes = assessSourceAttributeUses(actual, node.id);
        if (attributes.kind === 'resource-limit') throw new Stop(attributes);
        if (attributes.kind !== 'checked') return fail('anchor-attributes-unavailable', node.id);
        b.chargeWork(32 + attributes.value.uses.length * 2);
        return {content, attributeUses: attributes.value.uses.map(use => use.id), wildcard: attributes.value.wildcard};
      };
      const equalList = (left: readonly string[], right: readonly string[]): boolean => {
        b.chargeWork(4 + left.length);
        return left.length === right.length && left.every((item, index) => b.compareText(item, right[index]!) === 0);
      };
      const requireUnchangedProperties = (node: ComplexTypeNode, expected: ReturnType<typeof sourceProperties>, rule: string): void => {
        const current = parent.rawTypeProperties(node.id); if (!current) return;
        const content = expected.content, wildcard = expected.wildcard;
        b.chargeWork(64);
        const sameContent = current.content.kind === content.kind && (content.kind === 'empty'
          || 'particle' in current.content && 'particle' in content && b.compareText(current.content.particle, content.particle) === 0
            && current.content.original === content.original);
        const sameWildcard = current.wildcard === wildcard || !!current.wildcard && !!wildcard
          && current.wildcard.processContents === wildcard.processContents && current.wildcard.namespace.kind === wildcard.namespace.kind
          && equalList(current.wildcard.namespace.namespaces, wildcard.namespace.namespaces) && equalList(current.wildcard.sources, wildcard.sources);
        if (!sameContent || !sameWildcard || current.abstract !== node.abstract
          || current.targetNamespace !== undefined && b.compareText(current.targetNamespace, node.context.effectiveNamespace) !== 0
          || methodOf(node) !== (node.derivation?.kind ?? 'restriction')
          || typeKey(baseOf(node)) !== typeKey(node.derivation?.base ?? {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}})
          || !equalList(current.attributeUses, expected.attributeUses) || !equalList(current.final, declarationMethods(actual, node, 'final'))
          || !equalList(current.block, declarationMethods(actual, node, 'block'))) fail(rule, node.id);
      };
      const {content, attributeUses, wildcard} = sourceProperties(anchor);
      requireUnchangedProperties(anchor, {content, attributeUses, wildcard}, 'source-anchor-property-rewrite');
      if (a.id !== anchor.id) requireUnchangedProperties(a, sourceProperties(a), 'designated-anchor-property-rewrite');
      const anchorFinal = declarationMethods(actual, anchor, 'final'), aFinal = declarationMethods(actual, a, 'final');
      const specs = new Map<string, NominalBankRole>(), roleIds = new Map<string, NodeId>();
      const required = new Set<NodeId>([input.carrier, anchor.id, a.id, ...attributeUses, ...(wildcard?.sources ?? [])]);
      const ids = new Set<NodeId>(), tuples = new Set<string>();
      const reserve = (id: NodeId, identity: Identity): void => {b.chargeWork(5 + id.length); ids.add(id); tuples.add(semanticIdentityTuple(identity, b.chargeWork));};
      for (const item of data.reserved) reserve(item.id, item.identity);
      const occupied = (id: NodeId, identity: Identity): boolean => parent.lookup(id).kind !== 'missing'
        || storedIdentityOccupant(parent, identity) !== undefined || ids.has(id) || tuples.has(semanticIdentityTuple(identity, b.chargeWork));
      let nextName = 0n;
      const global = (role: 'type' | 'element', name?: ExpandedName) => {
        while (true) {
          b.chargeWork(48);
          const selected = name ?? {namespace: anchor.context.effectiveNamespace, local: 're01Bank' + (nextName++).toString()};
          b.chargeWork(8 + selected.local.length + selected.namespace.length);
          if (!isXmlNCName(selected.local) || selected.namespace === 'http://www.w3.org/2000/xmlns/') return fail('invalid-fresh-qname');
          const identity = {kind: 'global', role, name: selected} as const, id = globalId(role, selected);
          if (occupied(id, identity)) {if (name) return fail('fresh-qname-occupied', id); reserve(id, identity); continue;}
          reserve(id, identity); return {id, identity};
        }
      };
      const anonymous = () => {
        while (true) {
          b.chargeWork(16); const allocated = allocateHypotheticalScopedIdentity(input.carrier, 'type', ids, tuples, b.chargeWork);
          const found = parent.lookup(allocated.id).kind !== 'missing' || storedIdentityOccupant(parent, allocated.identity) !== undefined;
          reserve(allocated.id, allocated.identity); if (!found) return {id: allocated.id, identity: allocated.identity};
        }
      };
      const common = {context: anchor.context, declaredAttributes: [], annotations: [], retained: [], syntaxDetails: []};
      const types = new Map<string, ComplexTypeNode>(), rows = new Map<string, RawComplexTypeProperties>();
      for (const spec of data.roles) {
        b.chargeWork(32 + spec.role.length + spec.block.length * 4);
        if (!spec.role || specs.has(spec.role) || !['extension', 'restriction'].includes(spec.method)
          || spec.block.some(method => !['extension', 'restriction'].includes(method))) return fail('invalid-role-skeleton');
        specs.set(spec.role, spec);
        const allocated = spec.named ? global('type') : anonymous(); roleIds.set(spec.role, allocated.id);
        types.set(spec.role, {...common, ...allocated, kind: 'complexType', mixed: content.kind === 'mixed', abstract: false, attributes: []});
      }
      const reference = (ref: BankTypeRef): Reference => 'anchor' in ref ? local(anchor.id)
        : local(roleIds.get(ref.role) ?? fail('unknown-type-role', ref.role));
      for (const spec of data.roles) {
        b.chargeWork(16); const seen = new Set<string>(); let at = spec;
        while ('role' in at.base) {
          b.chargeWork(12); if (seen.has(at.role)) return fail('cyclic-role-base', at.role); seen.add(at.role);
          at = specs.get(at.base.role) ?? fail('unknown-type-role', at.base.role);
        }
        if (anchorFinal.includes(at.method)) return fail('anchor-final-prohibits-edge', at.role);
      }
      const makeRow = (node: ComplexTypeNode, method: 'extension' | 'restriction', base: Reference,
        block: readonly ('extension' | 'restriction')[]): RawComplexTypeProperties => ({type: node.id,
        targetNamespace: anchor.context.effectiveNamespace, derivation: {method, base}, abstract: false, final: [], block,
        content, attributeUses, ...(wildcard ? {wildcard} : {}), provenance: {kind: 'hypothetical-abstract', originals: []}});
      const additions: GraphNode[] = [], rawTypes: RawComplexTypeProperties[] = [], rawElements: RawElementProperties[] = [];
      for (const spec of data.roles) {
        b.chargeWork(40); const node = types.get(spec.role)!, base = reference(spec.base);
        const type: ComplexTypeNode = {...node, ...('particle' in content ? {content: content.particle} : {}),
          derivation: {kind: spec.method, contentKind: 'complex', base, facets: []}};
        types.set(spec.role, type); const row = makeRow(type, spec.method, base, spec.block); rows.set(spec.role, row);
        additions.push(type); rawTypes.push(row);
      }
      b.chargeWork(4 + data.globals.length * 2);
      const allocatedMembers = data.globals.map(port => global('element', port.name)), globalIds: NodeId[] = [];
      for (const [index, port] of data.globals.entries()) {
        b.chargeWork(64); const head = get(port.head);
        if (head.kind !== 'element' || head.identity.kind !== 'global') return fail('global-head-required', port.head);
        const headType = declaredType(parent, head), stop = typeKey(headType);
        if (![anchor.id, a.id, 'builtin:anyType'].includes(stop)) return fail('head-type-outside-anchor-suffix', head.id);
        const bridgeId = global('element'), memberId = allocatedMembers[index]!;
        const bridge: ElementNode = {...common, ...bridgeId, kind: 'element', name: bridgeId.identity.name,
          type: stop === 'builtin:anyType' ? {kind: 'builtin', name: {namespace: XSD_NAMESPACE, local: 'anyType'}} : local(stop),
          abstract: true, nillable: false, substitutionGroup: local(head.id)};
        const member: ElementNode = {...common, ...memberId, kind: 'element', name: memberId.identity.name,
          type: reference(port.type), abstract: false, nillable: false, substitutionGroup: local(bridge.id)};
        additions.push(bridge, member); globalIds.push(member.id); required.add(head.id); if (stop !== 'builtin:anyType') required.add(stop);
        rawElements.push(...[bridge, member].map(node => ({element: node.id, type: node.type, final: [], block: []})));
      }
      const children = new Map<string, NominalChildDelta>();
      for (const spec of data.roles) {
        if (spec.method !== 'extension' || input.mode === 'aur-free' && 'anchor' in spec.base) continue;
        b.chargeWork(64); const actor = types.get(spec.role)!, row = rows.get(spec.role)!;
        let intermediate = anchor.id; const childAdditions: GraphNode[] = [], childRows: RawComplexTypeProperties[] = [];
        if (input.mode === 'proper-b') {
          if (anchorFinal.includes('restriction')) return fail('proper-middle-final-restriction', anchor.id);
        } else {
          if (aFinal.includes('extension')) return fail('inactive-middle-final-extension', a.id);
          // Named middles can also support later repeated-QName GLOBAL cohorts.
          const allocated = global('type'), base = local(a.id);
          const q: ComplexTypeNode = {...common, ...allocated, kind: 'complexType', mixed: content.kind === 'mixed', abstract: false,
            attributes: [], ...('particle' in content ? {content: content.particle} : {}),
            derivation: {kind: 'extension', contentKind: 'complex', base, facets: []}};
          intermediate = q.id; childAdditions.push(q); childRows.push(makeRow(q, 'extension', base, ['extension']));
        }
        const base = local(intermediate), endpoint: ComplexTypeNode = {...actor, derivation: {kind: 'restriction', contentKind: 'complex', base, facets: []}};
        childRows.push({...row, derivation: {method: 'restriction', base}});
        children.set(spec.role, Object.freeze({target: actor.id, intermediate, ancestor: local(a.id), delta: Object.freeze({endpoint,
          additions: b.freeze(childAdditions), rawTypes: b.freeze(childRows)})}));
      }
      b.chargeWork(64 + additions.length + rawTypes.length + rawElements.length + roleIds.size + children.size + required.size);
      return Object.freeze({kind: 'prepared-nominal-bank', delta: Object.freeze({additions: b.freeze(additions), rawTypes: b.freeze(rawTypes),
        rawElements: b.freeze(rawElements)}), roles: roleIds, globals: b.freeze(globalIds), children, requiredExternal: b.freeze([...required])});
    } catch (error: unknown) {if (error instanceof Stop) return error.result; throw error;}
  });
}
