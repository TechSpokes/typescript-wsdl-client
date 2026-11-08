/** Private research views; structural success does not assess schema legality. */
export type Id = string;
export type Method = "extension" | "restriction" | "list" | "union";
export type Name = Readonly<{namespace: string; local: string}>;
export type Kind = "type" | "element" | "attribute" | "particle" | "attributeUse"
  | "group" | "attributeGroup";
export type Source = Readonly<{
  uri: string; digest: string; path: string; baseUri: string;
  start: Readonly<{line: number; column: number}>;
  end: Readonly<{line: number; column: number}>;
  namespaces: Readonly<Record<string, string>>;
  effectiveNamespace: string; interpretation: string; chameleon: boolean;
}>;
export type Ref = Readonly<
  {kind: "symbol"; role: "type" | "element" | "attribute" | "group" | "attributeGroup";
    name: Name; target: Id; source: Source} |
  {kind: "local"; target: Id} |
  {kind: "builtin"; name: Name}
>;
export type Operand = Readonly<{type: Ref; lexical: string; source: Source}>;
export type Facet = Readonly<{id: Id; name: string; fixed: boolean; operand: Operand}>;
export type Value = Readonly<{kind: "fixed" | "default"; operand: Operand}>;
export type Occurs = Readonly<{min: string; max: string | "unbounded"}>;
export type Wildcard = Readonly<{
  namespaces: Readonly<{kind: "set" | "not"; values: readonly string[]}>;
  process: "strict" | "lax" | "skip"; source: Source;
}>;
export type Content = Readonly<
  {kind: "empty"} | {kind: "simple"; type: Ref} |
  {kind: "element-only" | "mixed"; roots: readonly Id[]} |
  {kind: "opaque-builtin"; type: Ref}
>;
export type Facts = Readonly<
  {kind: "type"; variety: "complex" | "atomic" | "list" | "union";
    base: Ref; method: Method; final: readonly Method[];
    block: readonly ("extension" | "restriction")[]; abstract: boolean;
    content: Content; declaredContent: Content;
    attributeUses: readonly Id[]; wildcard?: Wildcard; declaredWildcard?: Wildcard;
    items: readonly Ref[]; facets: readonly Facet[]} |
  {kind: "element"; name: Name; type: Ref; nillable: boolean; abstract: boolean;
    final: readonly Method[]; block: readonly (Method | "substitution")[];
    value?: Value; head?: Ref; identityConstraints: readonly string[]} |
  {kind: "attribute"; name: Name; type: Ref; value?: Value} |
  {kind: "attributeUse"; declaration: Ref; required: boolean; value?: Value} |
  {kind: "particle"; occurs: Occurs; term: "element" | "group" | "any"
    | "sequence" | "choice" | "all"; reference?: Ref;
    children: readonly Id[]; wildcard?: Wildcard} |
  {kind: "group"; root: Id} |
  {kind: "attributeGroup"; uses: readonly Id[]; wildcard?: Wildcard}
>;
export type Identity = Readonly<
  {kind: "global"; role: Kind; name: Name} |
  {kind: "local"; owner: Id; path: string; role: Kind} |
  {kind: "fresh"; owner?: Id; path: string; role: Kind}
>;
export type SourceUse = Readonly<
  {kind: "admitted"; owner: Id; origin: string; use: Id;
    role: "local" | "group"; ownValue?: Value; source: Source} |
  {kind: "local-prohibition"; owner: Id; origin: string; name: Name;
    role: "direct-prohibition" | "group-prohibition"; source: Source;
    representationChecks: readonly string[]} |
  {kind: "reference-prohibition"; owner: Id; origin: string; declaration: Ref;
    role: "direct-prohibition" | "group-prohibition"; source: Source;
    representationChecks: readonly string[]}
>;
export type SourceGroupUse = Readonly<{
  owner: Id; origin: string; reference: Ref; source: Source;
}>;
export type Component = Readonly<{
  id: Id; identity: Identity; facts: Facts; owns: readonly Id[];
  source: Source; sourceUses: readonly SourceUse[];
  sourceGroups: readonly SourceGroupUse[];
  unassessed: readonly Readonly<{rule: string; owner: string; source: Source}>[];
  provenance: Readonly<{kind: "actual" | "constructed" | "endpoint-replacement";
    originals: readonly Id[]}>;
}>;
export type ActualInput = Readonly<{key: string; components: readonly Component[]}>;
export type AttributeAction = Readonly<
  {name: Name; role: "retain"} |
  {name: Name; role: "replace"; uses: readonly Id[]} |
  {name: Name; role: "prohibit"}
>;
export type Candidate = Readonly<{
  key: string; ancestor: Ref; intermediate: Id; endpoint: Id;
  retained: readonly Id[]; additions: readonly Component[];
  endpointDefinition: Component; attributes: readonly AttributeAction[];
}>;
export type Limits = Readonly<{maxNodes?: number; maxWork?: number}>;
export type Usage = Readonly<{nodes: number; work: number}>;
export type Diagnostic = Readonly<{
  code: string; rule: string; context: string; candidate?: string;
  component?: Id; slot?: string; source?: Source; related: readonly Source[];
}>;
export type BoundaryEdge = Readonly<{owner: Id; slot: string; target: Id}>;
declare const contextBrand: unique symbol;
export type Context = Readonly<{
  [contextBrand]: true; key: string; kind: "actual" | "proposed";
  members: readonly Id[]; excludedIncoming: readonly BoundaryEdge[];
}>;
export type Result<T> = Readonly<
  {kind: "ok"; value: T; usage: Usage} |
  {kind: "input-error" | "candidate-rejected" | "unresolved";
    diagnostic: Diagnostic; usage: Usage} |
  {kind: "resource-limit"; limit: "nodes" | "work"; usage: Usage}
>;
export type Target = Readonly<
  {kind: "component"; component: Component} | {kind: "builtin"; name: Name}
>;
export type Prepared = Readonly<{actual: Context; proposed: Context}>;
export type Pair = readonly [Id, Id];
export type Correspondence = Readonly<{actualRoot: Id; proposedRoot: Id;
  pairs: readonly Pair[]}>;
export type CorrespondenceReceipt = Readonly<{scope: "endpoint-properties-and-incidence";
  actualContext: string; proposedContext: string; pairs: readonly Pair[]}>;
