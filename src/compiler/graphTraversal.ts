/** Typed graph edges shared by resolution and structural companion traversal. */
import type {GraphNode, NodeId, Reference} from "./canonicalGraph.js";

export type ReferenceSlot = Readonly<{path: string; reference: Reference}>;

/** Map typed reference fields only; lexical syntax/provenance remain original data. */
export function mapNodeReferences(node: GraphNode, map: (reference: Reference) => Reference): GraphNode {
  switch (node.kind) {
    case "element": return {...node, type: map(node.type), substitutionGroup: node.substitutionGroup ? map(node.substitutionGroup) : undefined};
    case "attribute": return {...node, type: map(node.type)};
    case "attributeUse": return {...node, declaration: map(node.declaration)};
    case "attributeGroupUse": return {...node, reference: map(node.reference)};
    case "particle": return {...node, term: node.term.kind === "element" ? {...node.term, declaration: map(node.term.declaration)} : node.term.kind === "group" ? {...node.term, reference: map(node.term.reference)} : node.term};
    case "complexType": return {...node, derivation: node.derivation ? {...node.derivation, base: map(node.derivation.base), inlineType: node.derivation.inlineType ? map(node.derivation.inlineType) : undefined} : undefined};
    case "simpleType": return {...node, variety: node.variety.kind === "restriction" ? {...node.variety, base: map(node.variety.base)} : node.variety.kind === "list" ? {...node.variety, item: map(node.variety.item)} : {...node.variety, members: node.variety.members.map(map)}};
    case "wsdl": return {...node, references: node.references.map(r => ({...r, reference: map(r.reference)}))};
    default: return node;
  }
}
export function referenceSlots(node: GraphNode): readonly ReferenceSlot[] {
  const slot = (path: string, reference: Reference): ReferenceSlot => ({path, reference});
  switch (node.kind) {
    case "element": return [slot("type", node.type), ...(node.substitutionGroup ? [slot("substitutionGroup", node.substitutionGroup)] : [])];
    case "attribute": return [slot("type", node.type)];
    case "attributeUse": return [slot("declaration", node.declaration)];
    case "attributeGroupUse": return [slot("reference", node.reference)];
    case "particle": return node.term.kind === "element" ? [slot("term/declaration", node.term.declaration)] : node.term.kind === "group" ? [slot("term/reference", node.term.reference)] : [];
    case "complexType": return node.derivation ? [slot("derivation/base", node.derivation.base), ...(node.derivation.inlineType ? [slot("derivation/inlineType", node.derivation.inlineType)] : [])] : [];
    case "simpleType": return node.variety.kind === "restriction" ? [slot("variety/base", node.variety.base)] : node.variety.kind === "list" ? [slot("variety/item", node.variety.item)] : node.variety.members.map((r, i) => slot(`variety/members/${i}`, r));
    case "wsdl": return node.references.map((r, i) => slot(`references/${i}`, r.reference));
    default: return [];
  }
}

export function containedNodes(node: GraphNode): readonly NodeId[] {
  switch (node.kind) {
    case "group": return [node.content];
    case "complexType": return [...(node.content ? [node.content] : []), ...node.attributes];
    case "attributeGroup": return node.attributes;
    case "particle": return "children" in node.term ? node.term.children : [];
    default: return [];
  }
}
