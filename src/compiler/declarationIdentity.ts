import {createHash} from "node:crypto";

export type NodeId = string;
export type SymbolRole = "element" | "attribute" | "type" | "group" | "attributeGroup" | "message" | "portType" | "binding" | "service";
export type Identity = Readonly<
  {kind: "global"; role: SymbolRole; name: Readonly<{namespace: string; local: string}>} |
  {kind: "scoped"; owner: NodeId; path: string; role: string}
>;

/** Encode XML symbol identity independently of source location and emitted language names. */
export function globalId(role: SymbolRole, name: Readonly<{namespace: string; local: string}>): NodeId {
  return JSON.stringify(["global", role, name.namespace, name.local]);
}

/** Encode a declaration within its owner's scope using the caller's structural path convention. */
export function scopedId(owner: NodeId, path: string, role: string): NodeId {
  return "scoped:" + createHash("sha256").update(JSON.stringify([owner, path, role])).digest("hex");
}
