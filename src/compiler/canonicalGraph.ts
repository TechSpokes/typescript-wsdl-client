/** Internal, language-neutral S04 contract. S05 resolves and composes these references. */
import {createHash} from "node:crypto";
import type {ExpandedName, SyntaxAttribute, SyntaxElement, SyntaxSource} from "../loader/orderedSyntax.js";

export const GRAPH_MODEL = "xsd10-faithful-v1" as const;
export const DEFAULT_GRAPH_NODES = 100_000;
export type NodeId = string;
export type SymbolRole = "element" | "attribute" | "type" | "group" | "attributeGroup" | "message" | "portType" | "binding" | "service";
export type Identity = Readonly<
  {kind: "global"; role: SymbolRole; name: ExpandedName} |
  {kind: "scoped"; owner: NodeId; path: string; role: string}
>;
export type GraphContext = Readonly<{
  namespaces: Readonly<Record<string, string>>;
  baseUri: string;
  source: SyntaxSource;
  effectiveNamespace: string;
  chameleon: boolean;
  schemaAttributes: readonly SyntaxAttribute[];
}>;
export type LexicalValue = Readonly<{value: string; context: GraphContext}>;
export type Reference = Readonly<
  {kind: "symbol"; role: SymbolRole; name: ExpandedName; lexical: LexicalValue; target?: NodeId} |
  {kind: "builtin"; name: ExpandedName; lexical?: LexicalValue} |
  {kind: "local"; target: NodeId}
>;
/** Canonical unsigned decimal strings; no Number conversion or derived occurrence summaries. */
export type Occurs = Readonly<{min: string; max: string | "unbounded"}>;
export type ValueConstraint = Readonly<{kind: "default" | "fixed"; lexical: LexicalValue}>;
export type Facet = Readonly<{name: string; lexical: LexicalValue; fixed: boolean; syntax: SyntaxElement}>;
export type Wildcard = Readonly<{namespace: LexicalValue; processContents: "strict" | "lax" | "skip"}>;
type NodeBase = Readonly<{
  id: NodeId;
  identity: Identity;
  context: GraphContext;
  declaredAttributes: readonly SyntaxAttribute[];
  annotations: readonly SyntaxElement[];
  /** Unsupported/uninterpreted declarations remain visible for S06 capability assessment. */
  retained: readonly SyntaxElement[];
  /** Ordered restriction/list/union or content-wrapper syntax, including unassessed attributes. */
  syntaxDetails: readonly SyntaxElement[];
}>;
export type ElementNode = NodeBase & Readonly<{
  kind: "element"; name: ExpandedName; type: Reference; nillable: boolean; abstract: boolean;
  value?: ValueConstraint; substitutionGroup?: Reference;
}>;
export type AttributeNode = NodeBase & Readonly<{kind: "attribute"; name: ExpandedName; type: Reference; value?: ValueConstraint}>;
export type ParticleNode = NodeBase & Readonly<{
  kind: "particle"; occurs: Occurs;
  term: Readonly<
    {kind: "sequence" | "choice" | "all"; children: readonly NodeId[]} |
    {kind: "element"; declaration: Reference} |
    {kind: "group"; reference: Reference} |
    {kind: "any"; wildcard: Wildcard}
  >;
}>;
export type AttributeUseNode = NodeBase & Readonly<{
  kind: "attributeUse"; declaration: Reference; use: "optional" | "required" | "prohibited"; value?: ValueConstraint;
}>;
export type AttributeGroupUseNode = NodeBase & Readonly<{kind: "attributeGroupUse"; reference: Reference}>;
export type AttributeWildcardNode = NodeBase & Readonly<{kind: "attributeWildcard"; wildcard: Wildcard}>;
export type SimpleTypeNode = NodeBase & Readonly<{
  kind: "simpleType";
  variety: Readonly<
    {kind: "restriction"; base: Reference; facets: readonly Facet[]} |
    {kind: "list"; item: Reference} |
    {kind: "union"; members: readonly Reference[]}
  >;
}>;
export type ComplexTypeNode = NodeBase & Readonly<{
  kind: "complexType"; mixed: boolean; abstract: boolean; content?: NodeId; attributes: readonly NodeId[];
  derivation?: Readonly<{kind: "extension" | "restriction"; contentKind: "simple" | "complex"; base: Reference; inlineType?: Reference; facets: readonly Facet[]}>;
}>;
export type GroupNode = NodeBase & Readonly<{kind: "group"; content: NodeId}>;
export type AttributeGroupNode = NodeBase & Readonly<{kind: "attributeGroup"; attributes: readonly NodeId[]}>;
/** WSDL names/references and ordered binding syntax; transport interpretation remains downstream. */
export type WsdlNode = NodeBase & Readonly<{
  kind: "wsdl"; role: "message" | "portType" | "binding" | "service"; name: ExpandedName;
  references: readonly Readonly<{path: string; attribute: string; reference: Reference}>[];
  syntax: SyntaxElement;
}>;
export type GraphNode = ElementNode | AttributeNode | ParticleNode | AttributeUseNode | AttributeGroupUseNode |
  AttributeWildcardNode | SimpleTypeNode | ComplexTypeNode | GroupNode | AttributeGroupNode | WsdlNode;
export type GraphOrigin = Readonly<{interpretation: string; context: GraphContext}>;
export type CanonicalGraph = Readonly<{
  model: typeof GRAPH_MODEL;
  nodes: readonly GraphNode[];
  globals: readonly NodeId[];
  origins: Readonly<Record<NodeId, readonly GraphOrigin[]>>;
  schemaAnnotations: readonly SyntaxElement[];
  schemaRetained: readonly Readonly<{context: GraphContext; syntax: SyntaxElement}>[];
  /** Includes/imports are provenance, never symbol identity or eager composition. */
  loading: Readonly<{limits: import("../loader/schemaResources.js").LoadingLimits; edges: readonly import("../loader/schemaInput.js").ResolutionEdge[]}>;
}>;

export class GraphError extends Error {
  constructor(readonly category: "invalid-schema" | "resource-limit", message: string, readonly source?: SyntaxSource) {
    super(message); this.name = "GraphError";
  }
}
export function globalId(role: SymbolRole, name: ExpandedName): NodeId {
  return JSON.stringify(["global", role, name.namespace, name.local]);
}
export function scopedId(owner: NodeId, path: string, role: string): NodeId {
  return "scoped:" + createHash("sha256").update(JSON.stringify([owner, path, role])).digest("hex");
}
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
