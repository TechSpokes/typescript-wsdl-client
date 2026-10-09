/** One explicit graph reader boundary; typed fields are checked before identity/reference integrity. */
import {DEFAULT_GRAPH_NODES, GRAPH_MODEL, globalId, scopedId, isBuiltinType, wsdlReferenceRoles} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, Reference, SymbolRole} from "./canonicalGraph.js";
import {CatalogError, positiveLimit, canonicalJson} from "./catalogErrors.js";
import {resolveLexicalQName, syntaxAttribute, syntaxElements, XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxElement} from "../loader/orderedSyntax.js";

type Check = (value: unknown, field: string) => void;
type Field = {check: Check; optional?: boolean};
const invalid = (field: string, reason: string): never => {throw new CatalogError("invalid-schema", `Malformed catalog: ${reason}`, field);};
const str: Check = (v, p) => {if (typeof v !== "string") invalid(p, "expected string");};
const bool: Check = (v, p) => {if (typeof v !== "boolean") invalid(p, "expected boolean");};
const integer = (min: number): Check => (v, p) => {if (!Number.isSafeInteger(v) || (v as number) < min) invalid(p, "expected safe integer");};
const enumeration = (...values: unknown[]): Check => (v, p) => {if (!values.includes(v)) invalid(p, "unknown discriminant or value");};
const pattern = (regexp: RegExp): Check => (v, p) => {str(v, p); if (!regexp.test(v as string)) invalid(p, "invalid string shape");};
const array = (check: Check): Check => (v, p) => {if (!Array.isArray(v)) invalid(p, "expected array"); (v as unknown[]).forEach((c, i) => check(c, `${p}/${i}`));};
const field = (check: Check, optional = false): Field => ({check, optional});
const object = (fields: Record<string, Field>): Check => (v, p) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid(p, "expected object");
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o)) if (!Object.hasOwn(fields, k)) invalid(`${p}/${k}`, "unknown mandatory field");
  for (const [k, f] of Object.entries(fields)) {
    if (!Object.hasOwn(o, k)) {if (!f.optional) invalid(`${p}/${k}`, "missing required field");}
    else f.check(o[k], `${p}/${k}`);
  }
};
const record = (check: Check): Check => (v, p) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid(p, "expected record");
  for (const [k, c] of Object.entries(v as object)) check(c, `${p}/${k}`);
};
const discriminator = (key: string, variants: Record<string, Check>): Check => (v, p) => {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid(p, "expected discriminated object");
  const tag = (v as Record<string, unknown>)[key];
  if (typeof tag !== "string" || !Object.hasOwn(variants, tag)) invalid(`${p}/${key}`, "unknown discriminant");
  variants[tag as string](v, p);
};
const roles = ["element", "attribute", "type", "group", "attributeGroup", "message", "portType", "binding", "service"] as const;
const role = enumeration(...roles);
const digest = pattern(/^[a-f0-9]{64}$/);
const sourceUri = pattern(/^urn:source:sha256:[a-f0-9]{64}$/);
const baseUri = pattern(/^urn:base:sha256:[a-f0-9]{64}$/);
const interpretation: Check = (v, p) => {
  str(v, p);
  if (/^urn:source:sha256:[a-f0-9]{64}$/.test(v as string)) return;
  let tuple: unknown;
  try {tuple = JSON.parse(v as string);} catch {invalid(p, "invalid interpretation key");}
  if (!Array.isArray(tuple) || tuple.length !== 7) invalid(p, "invalid interpretation tuple");
  const t = tuple as unknown[];
  [digest, sourceUri, baseUri, str, enumeration("root", "inline", "include", "import"), str, pattern(/^(?:\/\d+)+$/)].forEach((check, i) => check(t[i], `${p}/${i}`));
  if (t[1] !== `urn:source:sha256:${t[0]}`) invalid(p, "inconsistent interpretation resource");
};
const position = object({offset: field(integer(0)), line: field(integer(1)), column: field(integer(1))});
const source: Check = (v, p) => {
  object({uri: field(sourceUri), digest: field(digest), path: field(pattern(/^(?:\/\d+)+$/)), start: field(position), end: field(position)})(v, p);
  const s = v as {uri: string; digest: string; start: {offset: number}; end: {offset: number}};
  if (s.uri !== `urn:source:sha256:${s.digest}` || s.start.offset > s.end.offset) invalid(p, "inconsistent source digest/span");
};
const name: Check = (v, p) => {
  object({namespace: field(str), local: field(str)})(v, p);
  const n = v as {namespace: string; local: string};
  try { if (n.local.includes(":") || resolveLexicalQName(n.local, {namespaces: Object.create(null)} as SyntaxElement).local !== n.local) invalid(p, "invalid canonical NCName"); }
  catch (e) {if (e instanceof CatalogError) throw e; invalid(p, "invalid canonical NCName");}
};
const attribute = object({name: field(name), lexicalName: field(str), value: field(str)});
const context = object({namespaces: field(record(str)), baseUri: field(baseUri), source: field(source), effectiveNamespace: field(str), chameleon: field(bool), schemaAttributes: field(array(attribute))});
const lexical = object({value: field(str), context: field(context)});
const syntax: Check = (v, p) => discriminator("kind", {
  text: object({kind: field(enumeration("text")), value: field(str), source: field(source)}),
  element: object({kind: field(enumeration("element")), name: field(name), lexicalName: field(str), attributes: field(array(attribute)), namespaces: field(record(str)), baseUri: field(baseUri), source: field(source), children: field(array(syntax))}),
})(v, p);
const elementSyntax: Check = (v, p) => {syntax(v, p); if ((v as {kind: string}).kind !== "element") invalid(p, "expected element syntax");};
const value = object({kind: field(enumeration("default", "fixed")), lexical: field(lexical)});
const facet = object({name: field(enumeration("enumeration", "pattern", "whiteSpace", "length", "minLength", "maxLength", "minInclusive", "minExclusive", "maxInclusive", "maxExclusive", "totalDigits", "fractionDigits")), lexical: field(lexical), fixed: field(bool), syntax: field(elementSyntax)});
const wildcard = object({namespace: field(lexical), processContents: field(enumeration("strict", "lax", "skip"))});
const identity = discriminator("kind", {
  global: object({kind: field(enumeration("global")), role: field(role), name: field(name)}),
  scoped: object({kind: field(enumeration("scoped")), owner: field(str), path: field(pattern(/^(?:\/\d+)+$|^\/$/)), role: field(str)}),
});
const occurs: Check = (v, p) => {
  object({min: field(pattern(/^(?:0|[1-9]\d*)$/)), max: field((v, p) => {if (v !== "unbounded") pattern(/^(?:0|[1-9]\d*)$/)(v, p);})})(v, p);
  const {min, max} = v as {min: string; max: string};
  if (max !== "unbounded" && (min.length > max.length || (min.length === max.length && min > max))) invalid(p, "occurrence minimum exceeds maximum");
};
const base = {id: field(str), identity: field(identity), context: field(context), declaredAttributes: field(array(attribute)), annotations: field(array(elementSyntax)), retained: field(array(elementSyntax)), syntaxDetails: field(array(elementSyntax))};
const attrs = field(array(str));

export function validateSemanticGraph(input: unknown, options: {maxNodes?: number} = {}): asserts input is CanonicalGraph {
  const maxNodes = positiveLimit(options.maxNodes, DEFAULT_GRAPH_NODES, "maxNodes");
  const refs: {reference: Reference; expected: readonly SymbolRole[]; field: string}[] = [];
  const reference = (...expected: SymbolRole[]): Check => (v, p) => {
    discriminator("kind", {
      symbol: object({kind: field(enumeration("symbol")), role: field(enumeration(...expected)), name: field(name), lexical: field(lexical), target: field(str, true)}),
      builtin: object({kind: field(enumeration("builtin")), name: field(name), lexical: field(lexical, true)}),
      local: object({kind: field(enumeration("local")), target: field(str)}),
    })(v, p);
    refs.push({reference: v as Reference, expected, field: p});
  };
  const term = discriminator("kind", {
    sequence: object({kind: field(enumeration("sequence")), children: attrs}),
    choice: object({kind: field(enumeration("choice")), children: attrs}),
    all: object({kind: field(enumeration("all")), children: attrs}),
    element: object({kind: field(enumeration("element")), declaration: field(reference("element"))}),
    group: object({kind: field(enumeration("group")), reference: field(reference("group"))}),
    any: object({kind: field(enumeration("any")), wildcard: field(wildcard)}),
  });
  const node = discriminator("kind", {
    element: object({...base, kind: field(enumeration("element")), name: field(name), type: field(reference("type")), nillable: field(bool), abstract: field(bool), value: field(value, true), substitutionGroup: field(reference("element"), true)}),
    attribute: object({...base, kind: field(enumeration("attribute")), name: field(name), type: field(reference("type")), value: field(value, true)}),
    particle: object({...base, kind: field(enumeration("particle")), occurs: field(occurs), term: field(term)}),
    attributeUse: object({...base, kind: field(enumeration("attributeUse")), declaration: field(reference("attribute")), use: field(enumeration("optional", "required", "prohibited")), value: field(value, true)}),
    attributeGroupUse: object({...base, kind: field(enumeration("attributeGroupUse")), reference: field(reference("attributeGroup"))}),
    attributeWildcard: object({...base, kind: field(enumeration("attributeWildcard")), wildcard: field(wildcard)}),
    simpleType: object({...base, kind: field(enumeration("simpleType")), variety: field(discriminator("kind", {
      restriction: object({kind: field(enumeration("restriction")), base: field(reference("type")), facets: field(array(facet))}),
      list: object({kind: field(enumeration("list")), item: field(reference("type"))}),
      union: object({kind: field(enumeration("union")), members: field(array(reference("type")))}),
    }))}),
    complexType: object({...base, kind: field(enumeration("complexType")), mixed: field(bool), abstract: field(bool), content: field(str, true), attributes: attrs,
      derivation: field(object({kind: field(enumeration("extension", "restriction")), contentKind: field(enumeration("simple", "complex")), base: field(reference("type")), inlineType: field(reference("type"), true), facets: field(array(facet))}), true)}),
    group: object({...base, kind: field(enumeration("group")), content: field(str)}),
    attributeGroup: object({...base, kind: field(enumeration("attributeGroup")), attributes: attrs}),
    wsdl: object({...base, kind: field(enumeration("wsdl")), role: field(enumeration("message", "portType", "binding", "service")), name: field(name), syntax: field(elementSyntax),
      references: field(array(object({path: field(str), attribute: field(str), reference: field(reference(...roles))})))}),
  });
  object({model: field(enumeration(GRAPH_MODEL)), nodes: field((v, p) => {
    if (!Array.isArray(v)) invalid(p, "expected node array");
    if ((v as unknown[]).length > maxNodes) throw new CatalogError("resource-limit", `Catalog graph exceeds ${maxNodes} nodes`, p);
    array(node)(v, p);
  }), globals: field(array(str)), origins: field(record(array(object({interpretation: field(interpretation), context: field(context)})))),
  schemaAnnotations: field(array(elementSyntax)), schemaRetained: field(array(object({context: field(context), syntax: field(elementSyntax)}))),
  loading: field(object({limits: field(object({resources: field(integer(1)), resourceBytes: field(integer(1)), totalBytes: field(integer(1)), resolutionDepth: field(integer(1)), redirects: field(integer(0)), resourceMs: field(integer(1)), totalIoMs: field(integer(1)), syntaxDepth: field(integer(1))})),
    edges: field(array(object({kind: field(enumeration("include", "import", "wsdl-import")), from: field(interpretation), to: field(interpretation, true), referenceUri: field(baseUri, true), source: field(source), cycle: field(bool)})))})),
  })(input, "graph");
  const graph = input as CanonicalGraph, nodes = new Map<string, GraphNode>();
  const nodeRole = (n: GraphNode | undefined): SymbolRole | undefined => !n ? undefined : n.kind === "simpleType" || n.kind === "complexType" ? "type" : n.kind === "wsdl" ? n.role : roles.includes(n.kind as SymbolRole) ? n.kind as SymbolRole : undefined;
  for (const n of graph.nodes) {
    if (nodes.has(n.id)) invalid(`graph/nodes/${n.id}`, "duplicate node identity");
    const expectedId = n.identity.kind === "global" ? globalId(n.identity.role, n.identity.name) : scopedId(n.identity.owner, n.identity.path, n.identity.role);
    if (n.id !== expectedId) invalid(`graph/nodes/${n.id}`, "identity does not match ID");
    if (n.identity.kind === "global" && (nodeRole(n) !== n.identity.role || ("name" in n && (n.name.namespace !== n.identity.name.namespace || n.name.local !== n.identity.name.local)))) invalid(`graph/nodes/${n.id}`, "global symbol role/name mismatch");
    if (n.identity.kind === "scoped") {
      const expectedRole = n.kind === "simpleType" || n.kind === "complexType" ? "type" : ["attributeUse", "attributeGroupUse", "attributeWildcard"].includes(n.kind) ? "attributeUse" : n.kind;
      if (n.identity.role !== expectedRole) invalid(n.id, "scoped role disagrees with node kind");
    }
    nodes.set(n.id, n);
  }
  const expectedGlobals = graph.nodes.filter(n => n.identity.kind === "global").map(n => n.id).sort();
  if (JSON.stringify([...graph.globals].sort()) !== JSON.stringify(expectedGlobals)) invalid("graph/globals", "global index does not match declarations");
  if (Object.keys(graph.origins).length !== nodes.size) invalid("graph/origins", "provenance index does not match nodes");
  for (const n of graph.nodes) {
    if (!Object.hasOwn(graph.origins, n.id) || !graph.origins[n.id].length) invalid("graph/origins", "missing node provenance");
    if (n.identity.kind === "scoped" && !nodeRole(nodes.get(n.identity.owner)!)) invalid(`graph/nodes/${n.id}/identity/owner`, "missing or invalid containing declaration");
    for (const origin of graph.origins[n.id]) {
      if (origin.interpretation.startsWith("urn:")) {
        if (origin.interpretation !== origin.context.source.uri) invalid(n.id, "inconsistent document provenance");
      } else {
        const t = JSON.parse(origin.interpretation) as string[];
        if (t[0] !== origin.context.source.digest || t[3] !== origin.context.effectiveNamespace || !(origin.context.source.path === t[6] || origin.context.source.path.startsWith(t[6] + "/"))) invalid(n.id, "inconsistent schema provenance");
      }
    }
  }
  const get = (id: string, allowed: readonly GraphNode["kind"][], field: string) => {
    const n = nodes.get(id); if (!n || !allowed.includes(n.kind)) invalid(field, "missing or wrong-role reference target"); return n!;
  };
  const structural = new Map<string, string[]>();
  for (const n of graph.nodes) {
    const children: string[] = [];
    if (n.kind === "particle" && ["sequence", "choice", "all"].includes(n.term.kind)) {
      const term = n.term as {kind: string; children: readonly string[]};
      for (const id of term.children) get(id, ["particle"], `graph/nodes/${n.id}/term/children`);
      children.push(...term.children);
      if (term.children.some(id => {const child = nodes.get(id)!; return child.kind === "particle" && child.term.kind === "all";})) invalid(n.id, "all cannot be nested inside a compositor");
      if (term.kind === "all") {
        if (n.occurs.max !== "1" || !["0", "1"].includes(n.occurs.min)) invalid(n.id, "illegal all occurrence");
        for (const id of term.children) {const child = nodes.get(id)!; if (child.kind !== "particle" || child.term.kind !== "element" || !["0", "1"].includes(child.occurs.min) || !["0", "1"].includes(child.occurs.max)) invalid(n.id, "illegal all child");}
      }
    }
    if (n.kind === "complexType" || n.kind === "group") {
      if (n.content) {
        const content = get(n.content, ["particle"], `${n.id}/content`) as Extract<GraphNode, {kind: "particle"}>;
        if (!(n.kind === "group" ? ["sequence", "choice", "all"] : ["sequence", "choice", "all", "group"]).includes(content.term.kind)) invalid(n.id, "invalid declaration content particle");
        if (n.kind === "group" && (content.occurs.min !== "1" || content.occurs.max !== "1")) invalid(n.id, "group definition has occurrence bounds");
        if (n.kind === "complexType" && n.derivation?.contentKind === "simple") invalid(n.id, "simple content cannot contain a particle");
        children.push(n.content);
      }
    }
    if (n.kind === "simpleType" && n.variety.kind === "union" && !n.variety.members.length) invalid(n.id, "empty union");
    if (n.kind === "complexType" || n.kind === "attributeGroup") for (const id of n.attributes) {get(id, ["attributeUse", "attributeGroupUse", "attributeWildcard"], `${n.id}/attributes`); children.push(id);}
    if (new Set(children).size !== children.length) invalid(n.id, "duplicate structural use site");
    const owner = n.kind === "particle" && n.identity.kind === "scoped" ? n.identity.owner : n.id;
    for (const id of children) {const child = nodes.get(id)!; if (child.identity.kind !== "scoped" || child.identity.owner !== owner) invalid(n.id, "structural child belongs to a different declaration");}
    structural.set(n.id, children);
  }
  for (const {reference: r, expected, field: p} of refs) {
    if (r.kind === "builtin") {
      if (!expected.includes("type") || r.name.namespace !== XSD_NAMESPACE || !isBuiltinType(r.name.local)) invalid(p, "invalid builtin type reference");
      if (r.lexical) {
        try {
          const resolved = resolveLexicalQName(r.lexical.value, {namespaces: Object.assign(Object.create(null), r.lexical.context.namespaces), source: r.lexical.context.source} as SyntaxElement);
          if (resolved.namespace !== r.name.namespace || resolved.local !== r.name.local) invalid(p, "builtin QName context disagrees with reference");
        } catch (e) {if (e instanceof CatalogError) throw e; invalid(p, "invalid builtin QName context");}
      }
    } else if (r.kind === "symbol") {
      const expectedId = globalId(r.role, r.name), target = nodes.get(expectedId);
      if ((r.target !== undefined && r.target !== expectedId) || (r.target !== undefined && !target) || (target && r.target === undefined)) invalid(p, "corrupt symbol link");
      try {
        const lexicalName = resolveLexicalQName(r.lexical.value, {namespaces: Object.assign(Object.create(null), r.lexical.context.namespaces), source: r.lexical.context.source} as SyntaxElement);
        const namespace = !lexicalName.namespace && r.lexical.context.chameleon ? r.lexical.context.effectiveNamespace : lexicalName.namespace;
        if (namespace !== r.name.namespace || lexicalName.local !== r.name.local) invalid(p, "QName context disagrees with reference identity");
      } catch (e) {if (e instanceof CatalogError) throw e; invalid(p, "invalid lexical QName context");}
    } else {
      const target = nodes.get(r.target); if (!target || !expected.includes(nodeRole(target)!)) invalid(p, "corrupt local declaration reference");
      const from = graph.nodes[Number(p.split("/")[2])];
      const owner = ["particle", "attributeUse"].includes(from.kind) && from.identity.kind === "scoped" ? from.identity.owner : from.id;
      if (target!.identity.kind !== "scoped" || target!.identity.owner !== owner) invalid(p, "local reference belongs to a different declaration");
      structural.get(from.id)!.push(r.target);
    }
  }
  for (const n of graph.nodes) if (n.kind === "wsdl") {
    const expected: {path: string; attribute: string; role: SymbolRole; value: string; syntax: SyntaxElement}[] = [];
    const visit = (s: SyntaxElement) => {
      for (const [attribute, role] of Object.entries(wsdlReferenceRoles(s))) {
        const value = syntaxAttribute(s, attribute); if (value !== undefined) expected.push({path: s.source.path.slice(n.syntax.source.path.length) || "/", attribute, role, value, syntax: s});
      }
      for (const child of syntaxElements(s)) visit(child);
    };
    visit(n.syntax);
    if (expected.length !== n.references.length) invalid(n.id, "WSDL reference index incomplete");
    expected.forEach((e, i) => {
      const r = n.references[i];
      if (r.path !== e.path || r.attribute !== e.attribute || r.reference.kind === "local" || (r.reference.kind === "symbol" && r.reference.role !== e.role) || r.reference.lexical?.value !== e.value) invalid(n.id, "WSDL reference role/context mismatch");
      const c = r.reference.kind !== "local" ? r.reference.lexical?.context : undefined;
      if (!c || canonicalJson(c.namespaces) !== canonicalJson(e.syntax.namespaces) || canonicalJson(c.source) !== canonicalJson(e.syntax.source) || c.baseUri !== e.syntax.baseUri || c.effectiveNamespace !== n.context.effectiveNamespace || c.chameleon !== n.context.chameleon || canonicalJson(c.schemaAttributes) !== canonicalJson(n.context.schemaAttributes)) invalid(n.id, "WSDL reference disagrees with declaring syntax context");
    });
  }
  const parents = new Map<string, string>();
  for (const [parent, children] of structural) for (const child of children) {
    if (parents.has(child)) invalid(child, "structural use site has multiple parents");
    parents.set(child, parent);
  }
  for (const n of graph.nodes) if (n.identity.kind === "scoped") {
    if (!parents.has(n.id)) invalid(n.id, "orphan scoped use site or declaration");
    const owner = nodes.get(n.identity.owner)!;
    if (n.context.source.path !== owner.context.source.path + (n.identity.path === "/" ? "" : n.identity.path)) invalid(n.id, "scoped path disagrees with containing declaration");
  }
  // Ownership and structural containment must be acyclic. Semantic recursion through references is legal.
  const complete = new Set<string>(), active = new Set<string>();
  for (const id of nodes.keys()) {
    const stack: {id: string; exit: boolean}[] = [{id, exit: false}];
    while (stack.length) {
      const item = stack.pop()!;
      if (item.exit) {active.delete(item.id); complete.add(item.id); continue;}
      if (complete.has(item.id)) continue;
      if (active.has(item.id)) invalid(item.id, "cyclic structural containment");
      active.add(item.id); stack.push({id: item.id, exit: true});
      for (const child of [...(structural.get(item.id) ?? [])].reverse()) stack.push({id: child, exit: false});
    }
  }
  const ownersDone = new Set<string>();
  for (const n of graph.nodes) {
    let current = n; const path = new Set<string>();
    while (current.identity.kind === "scoped" && !ownersDone.has(current.id)) {
      if (path.has(current.id)) invalid(n.id, "cyclic declaration ownership");
      path.add(current.id); current = nodes.get(current.identity.owner)!;
    }
    for (const id of path) ownersDone.add(id);
  }
}
