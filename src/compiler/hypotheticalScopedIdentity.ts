/** Internal optional injective encoding for genuinely fresh scoped plan identities. */
import {globalId, scopedId} from './canonicalGraph.js';
import type {GraphNode, Identity} from './canonicalGraph.js';

export type IdentityCharge = (units: number) => void;
const noop: IdentityCharge = () => {};
export const HYPOTHETICAL_SCOPED_TAG = 'hypothetical-scoped-v1';

/** JSON tuple encoding is injective on owner/path/role UTF-16 strings; actual IDs keep legacy encoding. */
export function hypotheticalScopedId(owner: string, path: string, role: string, charge: IdentityCharge = noop): string {
  charge(64 + 6 * (owner.length + path.length + role.length));
  return JSON.stringify([HYPOTHETICAL_SCOPED_TAG, owner, path, role]);
}

/** Private backing only: these tagged IDs are never admitted context members. */
export function privateParticleId(family: 'effective' | 'builtin-anyType', owner: string, path: string, role: string,
  charge: IdentityCharge): string {
  charge(96 + 6 * (family.length + owner.length + path.length + role.length));
  return JSON.stringify(['semantic-private-particle-v1', family, owner, path, role]);
}

/** Encoding-independent identity tuple; required to reject legacy/new aliases of one scoped identity. */
export function semanticIdentityTuple(identity: Identity, charge: IdentityCharge = noop): string {
  if (identity.kind === 'global') {
    charge(64 + 6 * (identity.role.length + identity.name.namespace.length + identity.name.local.length));
    return globalId(identity.role, identity.name);
  }
  charge(64 + 6 * (identity.owner.length + identity.path.length + identity.role.length));
  return JSON.stringify(['scoped-identity', identity.owner, identity.path, identity.role]);
}

/** New acceptance seam ONLY for hypothetical additions; actual/source admission remains native legacy. */
export function matchesHypotheticalNodeId(node: GraphNode, charge: IdentityCharge = noop): boolean {
  const identity = node.identity;
  if (identity.kind === 'global') {
    charge(64 + 6 * (identity.role.length + identity.name.namespace.length + identity.name.local.length));
    const expected = globalId(identity.role, identity.name); charge(node.id.length + expected.length + 1);
    return node.id === expected;
  }
  charge(HYPOTHETICAL_SCOPED_TAG.length + 4);
  if (node.id.startsWith('["' + HYPOTHETICAL_SCOPED_TAG + '"')) {
    const expected = hypotheticalScopedId(identity.owner, identity.path, identity.role, charge);
    charge(node.id.length + expected.length + 1); return node.id === expected;
  }
  charge(64 + 6 * (identity.owner.length + identity.path.length + identity.role.length));
  const legacy = scopedId(identity.owner, identity.path, identity.role); charge(node.id.length + legacy.length + 1);
  return node.id === legacy;
}

export function sameSemanticIdentity(left: GraphNode, right: GraphNode, charge: IdentityCharge = noop): boolean {
  const a = semanticIdentityTuple(left.identity, charge), b = semanticIdentityTuple(right.identity, charge);
  charge(a.length + b.length + 1); return a === b;
}

/** Returns the second record of a duplicate identity tuple; does not conflate distinct tuples sharing a hash. */
export function duplicateIdentityTuple(nodes: Iterable<GraphNode>, charge: IdentityCharge = noop): string | undefined {
  charge(4);
  const seen = new Map<string, string>();
  for (const node of nodes) {
    const tuple = semanticIdentityTuple(node.identity, charge); charge(tuple.length + node.id.length + 3);
    const prior = seen.get(tuple);
    if (prior !== undefined && prior !== node.id) return node.id;
    seen.set(tuple, node.id);
  }
  return undefined;
}

/** Finite constructive allocation, independent of hash range or collision assumptions. */
export function allocateHypotheticalScopedIdentity(owner: string, role: string,
  forbiddenIds: ReadonlySet<string>, forbiddenTuples: ReadonlySet<string>, charge: IdentityCharge = noop):
  Readonly<{id: string; identity: Extract<Identity, {kind: 'scoped'}>; candidatesTried: bigint}> {
  charge(64);
  const blocked = BigInt(forbiddenIds.size) + BigInt(forbiddenTuples.size);
  for (let index = 0n; index <= blocked; index += 1n) {
    // Set.size is a safe integer, so index has at most 17 decimal digits.
    charge(64);
    const path = '/$hypothetical/' + index.toString();
    charge(8 + owner.length + path.length + role.length);
    const identity = {kind: 'scoped', owner, path, role} as const;
    const id = hypotheticalScopedId(owner, path, role, charge), tuple = semanticIdentityTuple(identity, charge);
    charge(6 + id.length + tuple.length);
    if (!forbiddenIds.has(id) && !forbiddenTuples.has(tuple)) {
      charge(4);
      return Object.freeze({id, identity, candidatesTried: index + 1n});
    }
  }
  throw new Error('Finite injective allocation invariant violated');
}
