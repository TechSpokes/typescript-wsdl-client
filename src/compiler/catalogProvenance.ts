/** Portable provenance is content-addressed; full retrieval context stays in the loading snapshot. */
import {createHash} from "node:crypto";
import path from "node:path";
import {XML_NAMESPACE, XSD_NAMESPACE, WSDL_NAMESPACE} from "../loader/orderedSyntax.js";
import type {ExpandedName} from "../loader/orderedSyntax.js";
import type {SyntaxElement, SyntaxSource, SyntaxAttribute} from "../loader/orderedSyntax.js";
import type {CanonicalGraph, GraphNode, Reference} from "./canonicalGraph.js";
import {canonicalJson, CatalogError} from "./catalogErrors.js";

export const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");
const sourceUri = (digest: string) => `urn:source:sha256:${digest}`;
const artifactUri = /^(?:urn:source:sha256:|urn:base:sha256:)[a-f0-9]{64}$/;

function baseUri(uri: string, source: SyntaxSource): string {
  if (artifactUri.test(uri)) return uri;
  try {
    const base = new URL(uri), document = new URL(source.uri);
    // Relative file placement is retained as a digest; temporary root paths never leave the snapshot.
    const relation = base.protocol === document.protocol && base.host === document.host
      ? path.posix.relative(path.posix.dirname(document.pathname), base.pathname) : `${base.protocol}//${base.host}${base.pathname}`;
    return `urn:base:sha256:${sha256(canonicalJson([source.digest, relation, base.search ? sha256(base.search) : ""]))}`;
  } catch { throw new CatalogError("invalid-schema", "Invalid provenance URI"); }
}

export function artifactGraph(graph: CanonicalGraph): CanonicalGraph {
  const resources = new Map<string, string>();
  const collect = (v: unknown): void => {
    if (typeof v === "string" && /[a-z][a-z0-9+.-]*:\/\/[^\s/]*@/i.test(v)) throw new CatalogError("incompatible-artifact", "Credential-bearing URI cannot be serialized");
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v)) { for (const c of v) collect(c); return; }
    const o = v as Record<string, unknown>;
    if (typeof o.uri === "string" && typeof o.digest === "string" && typeof o.path === "string") resources.set(o.uri, o.digest);
    for (const c of Object.values(o)) collect(c);
  };
  collect(graph);
  const interpretation = (key: string): string => {
    if (artifactUri.test(key)) return key;
    if (resources.has(key)) return sourceUri(resources.get(key)!);
    try {
      const tuple = JSON.parse(key);
      if (!Array.isArray(tuple) || tuple.length !== 7) throw Error();
      return canonicalJson([tuple[0], sourceUri(tuple[0]), baseUri(tuple[2], {uri: tuple[1], digest: tuple[0]} as SyntaxSource), ...tuple.slice(3)]);
    } catch { throw new CatalogError("invalid-schema", "Invalid loading interpretation key"); }
  };
  const transform = (v: unknown, parentName?: ExpandedName): unknown => {
    if (!v || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map(c => transform(c, parentName));
    const o = v as Record<string, unknown>, result: Record<string, unknown> = Object.create(null);
    for (const [k, c] of Object.entries(o)) {
      if (c === undefined) continue;
      if (k === "uri" && typeof o.digest === "string") result[k] = sourceUri(o.digest);
      else if (k === "baseUri" && o.source) result[k] = baseUri(c as string, o.source as SyntaxSource);
      else if (k === "interpretation" || (k === "from" && o.cycle !== undefined) || (k === "to" && o.cycle !== undefined)) result[k] = interpretation(c as string);
      else if (k === "referenceUri" && o.source) result[k] = baseUri(c as string, o.source as SyntaxSource);
      else result[k] = transform(c, k === "attributes" && o.kind === "element" ? o.name as ExpandedName : undefined);
    }
    if (o.name && typeof o.value === "string") {
      const a = o as unknown as SyntaxAttribute;
      const bindingAddress = ["http://schemas.xmlsoap.org/wsdl/soap/", "http://schemas.xmlsoap.org/wsdl/soap12/"].includes(parentName?.namespace ?? "") && parentName?.local === "address" && a.name.local === "location";
      if (bindingAddress) {
        try {
          const endpoint = new URL(a.value);
          if ([...endpoint.searchParams.keys()].some(k => /token|secret|password|api[-_]?key|authorization|signature|credential/i.test(k))) throw new CatalogError("incompatible-artifact", "Credential-bearing binding URI cannot be serialized");
        } catch (e) {if (e instanceof CatalogError) throw e; throw new CatalogError("invalid-schema", "Invalid binding address URI");}
      }
      if ((a.name.namespace === XML_NAMESPACE && a.name.local === "base") ||
        (parentName?.namespace === XSD_NAMESPACE && ["include", "import", "redefine"].includes(parentName.local) && a.name.local === "schemaLocation") ||
        (parentName?.namespace === XSD_NAMESPACE && parentName.local === "documentation" && a.name.local === "source") ||
        (parentName?.namespace === WSDL_NAMESPACE && parentName.local === "import" && a.name.local === "location")) {
        // Retrieval URI attributes are provenance; binding endpoints remain semantic syntax.
        result.value = artifactUri.test(a.value) ? a.value : `urn:base:sha256:${sha256(a.value.replace(/\?.*$/, ""))}`;
      }
    }
    return result;
  };
  return normalizeGraphTables(transform(graph) as CanonicalGraph);
}

/** These display/provenance tables have no semantic child order. */
export function normalizeGraphTables(result: CanonicalGraph): CanonicalGraph {
  const origins = Object.fromEntries(Object.entries(result.origins).map(([id, values]) => [id, [...values].sort((a, b) => {const x = canonicalJson(a), y = canonicalJson(b); return x < y ? -1 : x > y ? 1 : 0;})]));
  return {...result, origins, nodes: [...result.nodes].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0), globals: [...result.globals].sort()};
}

/** Excludes source digests/locations, machine paths, documentation and loading policy. */
export function semanticGraphRepresentation(graph: CanonicalGraph, options: {referenceIdentityOnly?: boolean} = {}): {structure: string; identities: ReadonlyMap<string, string>} {
  const portable = artifactGraph(graph);
  // Source-relative scoped IDs remain artifact identity. Fingerprint-only IDs follow semantic
  // containment instead, so inserting documentation cannot change their identity or table order.
  const ids = new Map<string, string>(), paths = new Map<string, string>();
  const nodes = new Map(portable.nodes.map(n => [n.id, n]));
  const children = (n: GraphNode): [string, string][] => {
    const result: [string, string][] = [];
    const ref = (r: Reference | undefined, edge: string) => {if (r?.kind === "local") result.push([r.target, edge]);};
    if (n.kind === "element" || n.kind === "attribute") ref(n.type, "type");
    if (n.kind === "element") ref(n.substitutionGroup, "substitutionGroup");
    if (n.kind === "attributeUse") ref(n.declaration, "declaration");
    if (n.kind === "attributeGroupUse") ref(n.reference, "attributeGroup");
    if (n.kind === "particle") {
      if (n.term.kind === "element") ref(n.term.declaration, "declaration");
      else if (n.term.kind === "group") ref(n.term.reference, "group");
      else if (n.term.kind === "sequence" || n.term.kind === "choice" || n.term.kind === "all") n.term.children.forEach((id, i) => result.push([id, `children/${i}`]));
    }
    if (n.kind === "group" || n.kind === "complexType") {if (n.content) result.push([n.content, "content"]);}
    if (n.kind === "attributeGroup" || n.kind === "complexType") n.attributes.forEach((id, i) => result.push([id, `attributes/${i}`]));
    if (n.kind === "complexType") {ref(n.derivation?.base, "base"); ref(n.derivation?.inlineType, "inlineType");}
    if (n.kind === "simpleType") {
      if (n.variety.kind === "restriction") ref(n.variety.base, "base");
      else if (n.variety.kind === "list") ref(n.variety.item, "item");
      else n.variety.members.forEach((r, i) => ref(r, `members/${i}`));
    }
    return result;
  };
  const stack = portable.globals.map(id => ({id, path: id}));
  while (stack.length) {
    const item = stack.pop()!, n = nodes.get(item.id)!;
    if (ids.has(n.id)) continue;
    const id = n.identity.kind === "global" ? n.id : `semantic:${sha256(item.path)}`;
    ids.set(n.id, id); paths.set(n.id, item.path);
    for (const [child, edge] of children(n)) stack.push({id: child, path: `${item.path}/${edge}`});
  }
  const mappedId = (id: string): string => ids.get(id)!;
  const reference = (r: Reference): Reference => r.kind === "local" ? {...r, target: mappedId(r.target)} : r;
  const mapNode = (n: GraphNode): GraphNode => {
    const common = {...n, id: mappedId(n.id), identity: n.identity.kind === "scoped" ? {...n.identity, owner: mappedId(n.identity.owner), path: paths.get(n.id)!} : n.identity};
    switch (n.kind) {
      case "element": return {...common, kind: n.kind, name: n.name, type: reference(n.type), nillable: n.nillable, abstract: n.abstract, value: n.value, substitutionGroup: n.substitutionGroup ? reference(n.substitutionGroup) : undefined};
      case "attribute": return {...common, kind: n.kind, name: n.name, type: reference(n.type), value: n.value};
      case "attributeUse": return {...common, kind: n.kind, declaration: reference(n.declaration), use: n.use, value: n.value};
      case "particle": return {...common, kind: n.kind, occurs: n.occurs, term: n.term.kind === "element" ? {...n.term, declaration: reference(n.term.declaration)} : n.term.kind === "group" ? {...n.term, reference: reference(n.term.reference)} : n.term.kind === "sequence" || n.term.kind === "choice" || n.term.kind === "all" ? {...n.term, children: n.term.children.map(mappedId)} : n.term};
      case "group": return {...common, kind: n.kind, content: mappedId(n.content)};
      case "attributeGroup": return {...common, kind: n.kind, attributes: n.attributes.map(mappedId)};
      case "complexType": return {...common, kind: n.kind, mixed: n.mixed, abstract: n.abstract, content: n.content ? mappedId(n.content) : undefined, attributes: n.attributes.map(mappedId), derivation: n.derivation ? {...n.derivation, base: reference(n.derivation.base), inlineType: n.derivation.inlineType ? reference(n.derivation.inlineType) : undefined} : undefined};
      case "simpleType": return {...common, kind: n.kind, variety: n.variety.kind === "restriction" ? {...n.variety, base: reference(n.variety.base)} : n.variety.kind === "list" ? {...n.variety, item: reference(n.variety.item)} : {...n.variety, members: n.variety.members.map(reference)}};
      case "attributeGroupUse": return {...common, kind: n.kind, reference: reference(n.reference)};
      case "attributeWildcard": return {...common, kind: n.kind, wildcard: n.wildcard};
      case "wsdl": return {...common, kind: n.kind, name: n.name, role: n.role, syntax: n.syntax, references: n.references};
    }
  };
  const stable = {...portable, nodes: portable.nodes.map(mapNode).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)};
  const omit = new Set(["source", "uri", "digest", "baseUri", "origins", "loading", "schemaAnnotations", "annotations", "lexicalName"]);
  const semantic = (v: unknown, parentName?: ExpandedName): unknown => {
    if (Array.isArray(v)) return v.filter(c => !(c && typeof c === "object" && (((c as SyntaxElement).name?.local === "annotation" && (c as SyntaxElement).name?.namespace === XSD_NAMESPACE) || ((c as SyntaxElement).name?.local === "documentation" && [XSD_NAMESPACE, WSDL_NAMESPACE].includes((c as SyntaxElement).name?.namespace))))).map(c => semantic(c, parentName)).filter(c => c !== undefined);
    if (!v || typeof v !== "object") return v;
    const o = v as Record<string, unknown>;
    if (o.kind === "text" && typeof o.value === "string" && !/[^\t\r\n ]/.test(o.value) && [XSD_NAMESPACE, WSDL_NAMESPACE].includes(parentName?.namespace ?? "")) return undefined;
    if (o.kind === "symbol" || o.kind === "builtin") return Object.fromEntries(Object.entries(o).filter(([k]) => k !== "lexical" && !(options.referenceIdentityOnly && k === "target")).map(([k, c]) => [k, semantic(c)]));
    if (o.name && typeof o.value === "string" && (o.name as {namespace: string; local: string}).namespace === XML_NAMESPACE && (o.name as {local: string}).local === "base") return undefined;
    if (o.name && typeof o.value === "string" && (o.name as ExpandedName).namespace === "" && (o.name as ExpandedName).local === "schemaLocation" && parentName?.namespace === XSD_NAMESPACE && ["include", "import"].includes(parentName.local)) return undefined;
    return Object.fromEntries(Object.entries(o).filter(([k]) => !omit.has(k) && !(k === "path" && Object.hasOwn(o, "reference") && Object.hasOwn(o, "attribute"))).map(([k, c]) => [k, semantic(c, ["children", "attributes"].includes(k) && o.kind === "element" ? o.name as ExpandedName : undefined)]));
  };
  return {structure: canonicalJson(semantic(stable)), identities: ids};
}

/** Fingerprinting and companion comparison share the same actual normalized structure. */
export function semanticGraphFingerprint(graph: CanonicalGraph): string {
  return sha256(semanticGraphRepresentation(graph).structure);
}
