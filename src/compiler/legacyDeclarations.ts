import {createHash} from "node:crypto";
import {globalId, scopedId, type NodeId} from "./declarationIdentity.js";
import {pascal, resolveQName} from "../util/tools.js";

type XmlNode = Record<string, unknown>;
export type LegacyGlobal = Readonly<{
  kind: "complex" | "simple" | "element";
  name: string;
  ns: string;
  node: unknown;
  prefixes: Record<string, string>;
}>;
type Declaration = {id: NodeId; candidate: string; stem: string; anonymous: boolean};
const object = (value: unknown): value is XmlNode => value !== null && typeof value === "object" && !Array.isArray(value);
const local = (key: string): string => key.slice(key.indexOf(":") + 1);
const attribute = (node: unknown, name: string): string => object(node) && typeof node[`@_${name}`] === "string" ? node[`@_${name}`] as string : "";
const children = (node: unknown, role: string): unknown[] => object(node) ? Object.entries(node)
  .filter(([key]) => local(key) === role).flatMap(([, value]) => Array.isArray(value) ? value : [value]) : [];

/** Index legacy declarations without importing the checked loader's source or acceptance policies.
 * @constraints Paths count equal role/name peers within a parent, never text nodes or unrelated global declarations.
 * @constraints Name allocation is local to this compilation; independent catalogs still require conservative conflict checks.
 */
export class LegacyDeclarations {
  private readonly declarations = new Map<NodeId, Declaration>();
  private readonly names = new Map<NodeId, string>();
  private readonly surfaces = new Map<NodeId, NodeId>();
  private readonly inlineByOwner = new Map<NodeId, WeakMap<object, NodeId>>();

  constructor(globals: readonly LegacyGlobal[]) {
    const named = new Set(globals.filter(g => g.kind !== "element").map(g => this.type(g.ns, g.name)));
    for (const g of globals) {
      const id = g.kind === "element" ? this.element(g.ns, g.name) : this.type(g.ns, g.name);
      if (g.kind === "element") {
        const target = attribute(g.node, "type");
        const q = target ? resolveQName(target, g.ns, g.prefixes) : undefined;
        if (q && q.ns === g.ns && q.local === g.name && named.has(this.type(q.ns, q.local))) {
          this.surfaces.set(id, this.type(q.ns, q.local));
          continue;
        }
      }
      const body = g.kind === "element" ? children(g.node, "complexType")[0] : g.node;
      const surface = g.kind === "element" && body ? scopedId(id, "complexType", "type") : id;
      this.surfaces.set(id, surface);
      this.declarations.set(surface, {id: surface, candidate: pascal(g.name), stem: pascal(g.name), anonymous: false});
      if (body && g.kind !== "simple") this.walk(surface, body, pascal(g.name), []);
    }
    this.allocate();
  }

  type(ns: string, name: string): NodeId { return globalId("type", {namespace: ns, local: name}); }
  element(ns: string, name: string): NodeId { return globalId("element", {namespace: ns, local: name}); }
  surface(ns: string, name: string): NodeId {
    const id = this.element(ns, name);
    return this.surfaces.get(id) ?? id;
  }
  name(id: NodeId): string {
    const name = this.names.get(id);
    if (!name) throw new Error(`Missing legacy declaration name: ${id}`);
    return name;
  }
  inline(owner: NodeId, element: unknown): NodeId {
    const id = object(element) ? this.inlineByOwner.get(owner)?.get(element) : undefined;
    if (!id) throw new Error(`Missing inline declaration in ${owner}`);
    return id;
  }

  private walk(owner: NodeId, node: unknown, stem: string, path: readonly string[]): void {
    if (!object(node)) return;
    const peers = new Map<string, number>();
    for (const [key, value] of Object.entries(node)) {
      const role = local(key);
      if (!["sequence", "choice", "all", "element", "complexContent", "simpleContent", "extension", "restriction"].includes(role)) continue;
      for (const child of Array.isArray(value) ? value : [value]) {
        const xmlName = attribute(child, "name") || attribute(child, "ref").split(":").at(-1) || "";
        const peer = JSON.stringify([role, xmlName]);
        const ordinal = peers.get(peer) ?? 0;
        peers.set(peer, ordinal + 1);
        const childPath = [...path, JSON.stringify([role, xmlName, ordinal])];
        if (role === "element") {
          const body = children(child, "complexType")[0];
          if (!body || !object(child)) continue;
          const elementId = scopedId(owner, JSON.stringify(childPath), "element");
          const id = scopedId(elementId, "complexType", "type");
          const candidate = pascal(xmlName);
          const childStem = `${stem}${candidate}`;
          this.declarations.set(id, {id, candidate, stem: childStem, anonymous: true});
          let byNode = this.inlineByOwner.get(owner);
          if (!byNode) this.inlineByOwner.set(owner, byNode = new WeakMap());
          byNode.set(child, id);
          this.walk(id, body, childStem, []);
        } else this.walk(owner, child, stem, childPath);
      }
    }
  }

  private allocate(): void {
    const groups = new Map<string, Declaration[]>();
    for (const d of this.declarations.values()) {
      const group = groups.get(d.candidate) ?? [];
      group.push(d);
      groups.set(d.candidate, group);
    }
    const proposed = new Map<NodeId, string>();
    const fixed = new Set<string>();
    const preserved = new Set<NodeId>();
    for (const [candidate, group] of groups) {
      const named = group.filter(d => !d.anonymous);
      if (group.length === 1 || named.length === 1) {
        const declaration = group.length === 1 ? group[0] : named[0];
        proposed.set(declaration.id, candidate);
        preserved.add(declaration.id);
        fixed.add(candidate);
      }
      for (const d of group) {
        if (!proposed.has(d.id)) proposed.set(d.id, d.anonymous ? d.stem : d.candidate);
      }
    }
    // @why No traversal-order winner: every unresolved member of a collision receives an identity-derived suffix.
    const counts = new Map<string, number>();
    for (const name of proposed.values()) counts.set(name, (counts.get(name) ?? 0) + 1);
    const pending: Declaration[] = [];
    for (const d of this.declarations.values()) {
      const name = proposed.get(d.id)!;
      if (preserved.has(d.id) || (counts.get(name) === 1 && !fixed.has(name))) this.names.set(d.id, name);
      else pending.push(d);
    }
    const used = new Set(this.names.values());
    for (let length = 12; pending.length > 0; length += 4) {
      if (length > 64) throw new Error("Cannot allocate unique legacy declaration names");
      const candidates = pending.map(d => `${proposed.get(d.id)}_${createHash("sha256").update(d.id).digest("hex").slice(0, length)}`);
      const occurrences = new Map<string, number>();
      for (const name of candidates) occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
      for (let i = pending.length - 1; i >= 0; i--) {
        const name = candidates[i];
        if (used.has(name) || occurrences.get(name)! > 1) continue;
        this.names.set(pending[i].id, name);
        used.add(name);
        pending.splice(i, 1);
      }
    }
  }
}
