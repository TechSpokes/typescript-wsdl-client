/** Pure two-phase construction from the repository-owned S03 adapter; no I/O or expansion. */
import {resolveLexicalQName, syntaxAttribute, syntaxElements, XSD_NAMESPACE, WSDL_NAMESPACE} from "../loader/orderedSyntax.js";
import type {ExpandedName, SyntaxElement} from "../loader/orderedSyntax.js";
import type {SchemaInput, SchemaInterpretation} from "../loader/schemaInput.js";
import {DEFAULT_GRAPH_NODES, GRAPH_MODEL, GraphError, globalId, scopedId, deepFreeze} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, GraphContext, Identity, NodeId, SymbolRole, Reference, LexicalValue, Occurs, ValueConstraint, Facet, Wildcard, GraphOrigin} from "./canonicalGraph.js";

type Scope = {schema: SchemaInterpretation; owner: NodeId; rootPath: string};
const declarationRoles: Record<string, SymbolRole> = Object.assign(Object.create(null), {element: "element", attribute: "attribute", simpleType: "type", complexType: "type", group: "group", attributeGroup: "attributeGroup"});
const particleKinds = new Set(["sequence", "choice", "all", "element", "group", "any"]);
const facetKinds = new Set(["enumeration", "pattern", "whiteSpace", "length", "minLength", "maxLength", "minInclusive", "minExclusive", "maxInclusive", "maxExclusive", "totalDigits", "fractionDigits"]);
const builtinTypes = new Set("anyType anySimpleType string boolean decimal float double duration dateTime time date gYearMonth gYear gMonthDay gDay gMonth hexBinary base64Binary anyURI QName NOTATION normalizedString token language NMTOKEN NMTOKENS Name NCName ID IDREF IDREFS ENTITY ENTITIES integer nonPositiveInteger negativeInteger long int short byte nonNegativeInteger unsignedLong unsignedInt unsignedShort unsignedByte positiveInteger".split(" "));

export function buildCanonicalGraph(input: SchemaInput, options: {maxNodes?: number} = {}): CanonicalGraph {
  const maxNodes = options.maxNodes ?? DEFAULT_GRAPH_NODES;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1) throw new RangeError("maxNodes must be a positive safe integer");
  const nodes = new Map<NodeId, GraphNode>();
  const scopedRoles = new Map<NodeId, string>();
  const reserved = new Map<NodeId, {node: SyntaxElement; schema: SchemaInterpretation}>();
  const origins: Record<NodeId, GraphOrigin[]> = Object.create(null);
  const annotations: SyntaxElement[] = [];
  const schemaRetained: {context: GraphContext; syntax: SyntaxElement}[] = [];
  const fail = (node: SyntaxElement, message: string): never => { throw new GraphError("invalid-schema", message, node.source); };
  const elementOnly = (node: SyntaxElement): void => {
    if (node.children.some(c => c.kind === "text" && /[^\t\r\n ]/.test(c.value))) fail(node, "Non-whitespace text in element-only schema content");
  };
  const context = (node: SyntaxElement, schema: SchemaInterpretation): GraphContext => ({namespaces: node.namespaces, baseUri: node.baseUri, source: node.source,
    effectiveNamespace: schema.targetNamespace, chameleon: schema.context.kind === "include" && !syntaxAttribute(schema.syntax, "targetNamespace"), schemaAttributes: schema.syntax.attributes});
  const lexical = (value: string, node: SyntaxElement, scope: Scope): LexicalValue => ({value, context: context(node, scope.schema)});
  const required = (node: SyntaxElement, name: string): string => syntaxAttribute(node, name) ?? fail(node, `Missing ${name} attribute`);
  const bool = (node: SyntaxElement, name: string, fallback = false): boolean => {
    const v = syntaxAttribute(node, name); if (v === undefined) return fallback;
    if (["true", "1"].includes(v.trim())) return true;
    if (["false", "0"].includes(v.trim())) return false;
    return fail(node, `Invalid ${name} boolean`);
  };
  const choice = <T extends string>(node: SyntaxElement, attr: string, allowed: readonly T[], fallback: T): T => {
    const value = syntaxAttribute(node, attr)?.trim() ?? fallback;
    if (!allowed.includes(value as T)) return fail(node, `Invalid ${attr} value`);
    return value as T;
  };
  const named = (node: SyntaxElement, namespace: string): ExpandedName => {
    const local = required(node, "name");
    // Validate NCName through the adapter without letting the default namespace define identity.
    const resolved = resolveLexicalQName(local, node);
    if (local.includes(":")) return fail(node, "Declaration name must be an NCName");
    return {namespace, local: resolved.local};
  };
  const occurrence = (node: SyntaxElement): Occurs => {
    const finite = (v: string): string => {
      const trimmed = v.trim();
      if (!/^[+-]?\d+$/.test(trimmed)) return fail(node, "Occurrence must be a nonnegative integer");
      const canonical = trimmed.replace(/^[+-]/, "").replace(/^0+(?=\d)/, "");
      if (trimmed.startsWith("-") && canonical !== "0") return fail(node, "Occurrence must be a nonnegative integer");
      return canonical;
    };
    const min = finite(syntaxAttribute(node, "minOccurs") ?? "1");
    const rawMax = syntaxAttribute(node, "maxOccurs")?.trim() ?? "1";
    const max = rawMax === "unbounded" ? rawMax : finite(rawMax);
    if (max !== "unbounded" && (min.length > max.length || (min.length === max.length && min > max))) return fail(node, "Occurrence minimum exceeds maximum");
    return {min, max};
  };
  const ref = (value: string, role: SymbolRole, node: SyntaxElement, scope: Scope): Reference => {
    const lexicalName = resolveLexicalQName(value, node);
    // XSD chameleon adoption changes component interpretation, never lexical namespace bindings.
    const name = !lexicalName.namespace && context(node, scope.schema).chameleon
      ? {namespace: scope.schema.targetNamespace, local: lexicalName.local} : lexicalName;
    if (role === "type" && name.namespace === XSD_NAMESPACE && builtinTypes.has(name.local)) return {kind: "builtin", name, lexical: lexical(value, node, scope)};
    return {kind: "symbol", role, name, lexical: lexical(value, node, scope)};
  };
  const builtin = (local: string): Reference => ({kind: "builtin", name: {namespace: XSD_NAMESPACE, local}});
  const idFor = (node: SyntaxElement, scope: Scope, role: string): NodeId => {
    const id = scopedId(scope.owner, node.source.path.slice(scope.rootPath.length) || "/", role); scopedRoles.set(id, role); return id;
  };
  const base = (node: SyntaxElement, scope: Scope, id: NodeId, identity?: Identity, consumed: readonly string[] = []) => {
    if (node.name.namespace === XSD_NAMESPACE) elementOnly(node);
    return {id,
    identity: identity ?? {kind: "scoped" as const, owner: scope.owner, path: node.source.path.slice(scope.rootPath.length) || "/", role: scopedRoles.get(id)!},
    context: context(node, scope.schema), declaredAttributes: node.attributes,
    annotations: syntaxElements(node, XSD_NAMESPACE, "annotation"), syntaxDetails: [] as SyntaxElement[],
    retained: syntaxElements(node).filter(c => c.name.namespace !== XSD_NAMESPACE || (c.name.local !== "annotation" && !consumed.includes(c.name.local)))};
  };
  const put = (node: GraphNode, scope: Scope): NodeId => {
    if (nodes.has(node.id)) throw new GraphError("invalid-schema", "Duplicate scoped graph identity", node.context.source);
    if (nodes.size >= maxNodes) throw new GraphError("resource-limit", `Canonical graph exceeds ${maxNodes} nodes`, node.context.source);
    nodes.set(node.id, node);
    origins[node.id] = [{interpretation: scope.schema.key, context: node.context}];
    return node.id;
  };
  const valueConstraint = (node: SyntaxElement, scope: Scope): ValueConstraint | undefined => {
    const d = syntaxAttribute(node, "default"), f = syntaxAttribute(node, "fixed");
    if (d !== undefined && f !== undefined) return fail(node, "Default and fixed are mutually exclusive");
    return d !== undefined ? {kind: "default", lexical: lexical(d, node, scope)} : f !== undefined ? {kind: "fixed", lexical: lexical(f, node, scope)} : undefined;
  };
  const facets = (node: SyntaxElement, scope: Scope): Facet[] => syntaxElements(node, XSD_NAMESPACE).filter(n => facetKinds.has(n.name.local)).map(n => ({name: n.name.local,
    lexical: lexical(required(n, "value"), n, scope), fixed: bool(n, "fixed"), syntax: n}));
  const wildcard = (node: SyntaxElement, scope: Scope): Wildcard => ({namespace: lexical(syntaxAttribute(node, "namespace") ?? "##any", node, scope),
    processContents: choice(node, "processContents", ["strict", "lax", "skip"] as const, "strict")});
  const one = (nodes: SyntaxElement[], node: SyntaxElement, description: string): SyntaxElement | undefined => {
    if (nodes.length > 1) return fail(node, `Multiple ${description}`); return nodes[0];
  };
  const typeFor = (node: SyntaxElement, scope: Scope, fallback: string): Reference => {
    const type = syntaxAttribute(node, "type");
    const inline = one(syntaxElements(node, XSD_NAMESPACE).filter(c => ["simpleType", "complexType"].includes(c.name.local)), node, "inline types");
    if (type && inline) return fail(node, "Named and inline types are mutually exclusive");
    return type !== undefined ? ref(type, "type", node, scope) : inline ? {kind: "local", target: buildType(inline, scope)} : builtin(fallback);
  };
  const declaration = (node: SyntaxElement, scope: Scope, role: "element" | "attribute", global?: Identity): NodeId => {
    if (syntaxAttribute(node, "ref") !== undefined) return fail(node, "Reference is a use, not a declaration");
    if (global && (syntaxAttribute(node, "minOccurs") !== undefined || syntaxAttribute(node, "maxOccurs") !== undefined || syntaxAttribute(node, "form") !== undefined)) return fail(node, "Global declarations cannot carry occurrence or form");
    const form = choice(node, "form", ["qualified", "unqualified"] as const,
      choice(scope.schema.syntax, role === "element" ? "elementFormDefault" : "attributeFormDefault", ["qualified", "unqualified"] as const, "unqualified"));
    const name = named(node, global || form === "qualified" ? scope.schema.targetNamespace : "");
    const id = global ? globalId(role, name) : idFor(node, scope, role);
    const inner = {schema: scope.schema, owner: id, rootPath: node.source.path};
    const common = {...base(node, scope, id, global, ["simpleType", "complexType"]), name, type: typeFor(node, inner, role === "element" ? "anyType" : "anySimpleType"), value: valueConstraint(node, scope)};
    if (role === "attribute") {
      if (syntaxElements(node, XSD_NAMESPACE, "complexType").length) return fail(node, "Attributes require simple types");
      return put({...common, kind: "attribute"}, scope);
    }
    const sg = syntaxAttribute(node, "substitutionGroup");
    return put({...common, kind: "element", nillable: bool(node, "nillable"), abstract: bool(node, "abstract"), substitutionGroup: sg === undefined ? undefined : ref(sg, "element", node, scope)}, scope);
  };
  const particle = (node: SyntaxElement, scope: Scope): NodeId => {
    const id = idFor(node, scope, "particle"), occurs = occurrence(node);
    const common = {...base(node, scope, id, undefined, ["sequence", "choice", "all", "element", "group", "any"]), kind: "particle" as const, occurs};
    const kind = node.name.local;
    if (["sequence", "choice", "all"].includes(kind)) {
      const children = syntaxElements(node, XSD_NAMESPACE).filter(c => particleKinds.has(c.name.local));
      if (children.some(c => c.name.local === "all")) return fail(node, "XSD 1.0 all cannot be nested inside a compositor");
      if (kind === "all" && (occurs.max !== "1" || !["0", "1"].includes(occurs.min))) return fail(node, "XSD 1.0 all requires min 0/1 and max 1");
      if (kind === "all" && children.some(c => c.name.local !== "element" || !["0", "1"].includes(occurrence(c).min) || !["0", "1"].includes(occurrence(c).max))) return fail(node, "XSD 1.0 all children must be elements with 0/1 bounds");
      return put({...common, term: {kind: kind as "sequence" | "choice" | "all", children: children.map(c => particle(c, scope))}}, scope);
    }
    if (kind === "any") return put({...common, term: {kind: "any", wildcard: wildcard(node, scope)}}, scope);
    if (kind === "group") {
      if (syntaxAttribute(node, "name") !== undefined || syntaxElements(node, XSD_NAMESPACE).some(c => particleKinds.has(c.name.local))) return fail(node, "Group uses require only a reference");
      return put({...common, term: {kind: "group", reference: ref(required(node, "ref"), "group", node, scope)}}, scope);
    }
    const r = syntaxAttribute(node, "ref");
    if (r !== undefined && ["name", "type", "form", "default", "fixed", "nillable"].some(a => syntaxAttribute(node, a) !== undefined)) return fail(node, "Element references cannot redeclare their target");
    if (r !== undefined && syntaxElements(node, XSD_NAMESPACE).some(c => c.name.local !== "annotation")) return fail(node, "Element references cannot contain declarations");
    return put({...common, term: {kind: "element", declaration: r !== undefined ? ref(r, "element", node, scope) : {kind: "local", target: declaration(node, scope, "element")}}}, scope);
  };
  const attributes = (node: SyntaxElement, scope: Scope): NodeId[] => syntaxElements(node, XSD_NAMESPACE).filter(c => ["attribute", "attributeGroup", "anyAttribute"].includes(c.name.local)).map(c => {
    const id = idFor(c, scope, "attributeUse"), common = base(c, scope, id, undefined, ["simpleType"]);
    if (c.name.local === "anyAttribute") return put({...common, kind: "attributeWildcard", wildcard: wildcard(c, scope)}, scope);
    if (c.name.local === "attributeGroup") return put({...common, kind: "attributeGroupUse", reference: ref(required(c, "ref"), "attributeGroup", c, scope)}, scope);
    const r = syntaxAttribute(c, "ref");
    if (r !== undefined && ["name", "type", "form"].some(a => syntaxAttribute(c, a) !== undefined)) return fail(c, "Attribute references cannot redeclare their target");
    if (r !== undefined && syntaxElements(c, XSD_NAMESPACE).some(n => n.name.local !== "annotation")) return fail(c, "Attribute references cannot contain declarations");
    return put({...common, kind: "attributeUse", declaration: r !== undefined ? ref(r, "attribute", c, scope) : {kind: "local", target: declaration(c, scope, "attribute")},
      use: choice(c, "use", ["optional", "required", "prohibited"] as const, "optional"), value: valueConstraint(c, scope)}, scope);
  });
  const buildType = (node: SyntaxElement, scope: Scope, global?: Identity): NodeId => {
    const id = global?.kind === "global" ? globalId("type", global.name) : idFor(node, scope, "type");
    const inner = {schema: scope.schema, owner: id, rootPath: node.source.path};
    const inlineSimple = (container: SyntaxElement): Reference | undefined => {
      const inline = one(syntaxElements(container, XSD_NAMESPACE, "simpleType"), container, "inline simple types");
      return inline ? {kind: "local", target: buildType(inline, inner)} : undefined;
    };
    if (node.name.local === "simpleType") {
      const body = one(syntaxElements(node, XSD_NAMESPACE).filter(c => ["restriction", "list", "union"].includes(c.name.local)), node, "simple type varieties") ?? fail(node, "Simple type requires restriction, list or union");
      elementOnly(body);
      const common = {...base(node, scope, id, global, ["restriction", "list", "union"]), kind: "simpleType" as const,
        annotations: [...syntaxElements(node, XSD_NAMESPACE, "annotation"), ...syntaxElements(body, XSD_NAMESPACE, "annotation")], syntaxDetails: [body],
        retained: [...syntaxElements(node).filter(c => c.name.namespace !== XSD_NAMESPACE || !["annotation", "restriction", "list", "union"].includes(c.name.local)),
          ...syntaxElements(body).filter(c => c.name.namespace !== XSD_NAMESPACE || !["annotation", "simpleType", ...(body.name.local === "restriction" ? [...facetKinds] : [])].includes(c.name.local))]};
      if (body.name.local === "union") {
        const members = (syntaxAttribute(body, "memberTypes")?.trim().split(/\s+/).filter(Boolean) ?? []).map(v => ref(v, "type", body, inner));
        for (const c of syntaxElements(body, XSD_NAMESPACE, "simpleType")) members.push({kind: "local", target: buildType(c, inner)});
        if (!members.length) return fail(body, "Union requires members");
        return put({...common, variety: {kind: "union", members}}, scope);
      }
      const attr = body.name.local === "list" ? "itemType" : "base";
      const value = syntaxAttribute(body, attr), inline = inlineSimple(body);
      if (value !== undefined && inline) return fail(body, "Named and inline scalar references are mutually exclusive");
      const reference = value !== undefined ? ref(value, "type", body, inner) : inline ?? fail(body, `Missing ${attr} or inline type`);
      return put({...common, variety: body.name.local === "list" ? {kind: "list", item: reference} : {kind: "restriction", base: reference, facets: facets(body, inner)}}, scope);
    }
    const wrapper = one(syntaxElements(node, XSD_NAMESPACE).filter(c => ["simpleContent", "complexContent"].includes(c.name.local)), node, "content wrappers");
    const body = wrapper ? one(syntaxElements(wrapper, XSD_NAMESPACE).filter(c => ["extension", "restriction"].includes(c.name.local)), wrapper, "derivations") ?? fail(wrapper, "Missing content derivation") : node;
    if (wrapper) { elementOnly(wrapper); elementOnly(body); }
    if (wrapper && syntaxElements(node, XSD_NAMESPACE).some(c => particleKinds.has(c.name.local) || ["attribute", "attributeGroup", "anyAttribute"].includes(c.name.local))) return fail(node, "Content wrappers cannot coexist with direct content");
    const content = one(syntaxElements(body, XSD_NAMESPACE).filter(c => particleKinds.has(c.name.local)), body, "content particles");
    if (content && !["sequence", "choice", "all", "group"].includes(content.name.local)) return fail(content, "Complex type content requires a compositor or group reference");
    if (content && wrapper?.name.local === "simpleContent") return fail(content, "Simple content cannot contain a particle");
    return put({...base(node, scope, id, global, ["simpleContent", "complexContent", "sequence", "choice", "all", "group", "attribute", "attributeGroup", "anyAttribute"]),
      kind: "complexType", mixed: wrapper ? bool(wrapper, "mixed", bool(node, "mixed")) : bool(node, "mixed"), abstract: bool(node, "abstract"),
      annotations: [...syntaxElements(node, XSD_NAMESPACE, "annotation"), ...(wrapper ? [...syntaxElements(wrapper, XSD_NAMESPACE, "annotation"), ...syntaxElements(body, XSD_NAMESPACE, "annotation")] : [])],
      syntaxDetails: wrapper ? [wrapper] : [],
      retained: [...syntaxElements(node).filter(c => c.name.namespace !== XSD_NAMESPACE || !["annotation", "simpleContent", "complexContent", ...particleKinds, "attribute", "attributeGroup", "anyAttribute"].includes(c.name.local)),
        ...(wrapper ? [...syntaxElements(wrapper).filter(c => c.name.namespace !== XSD_NAMESPACE || !["annotation", "extension", "restriction"].includes(c.name.local)),
          ...syntaxElements(body).filter(c => c.name.namespace !== XSD_NAMESPACE || !["annotation", ...(wrapper.name.local === "simpleContent" && body.name.local === "restriction" ? ["simpleType"] : []), ...particleKinds, ...facetKinds, "attribute", "attributeGroup", "anyAttribute"].includes(c.name.local))] : [])],
      content: content ? particle(content, inner) : undefined, attributes: attributes(body, inner),
      derivation: wrapper ? {kind: body.name.local as "extension" | "restriction", contentKind: wrapper.name.local === "simpleContent" ? "simple" : "complex",
        base: ref(required(body, "base"), "type", body, inner), inlineType: wrapper.name.local === "simpleContent" && body.name.local === "restriction" ? inlineSimple(body) : undefined,
        facets: facets(body, inner)} : undefined}, scope);
  };

  // Phase 1: reserve global symbol space, independent of interpretation keys and traversal order.
  for (const schema of input.schemas) {
    elementOnly(schema.syntax);
    annotations.push(...syntaxElements(schema.syntax, XSD_NAMESPACE, "annotation"));
    for (const child of syntaxElements(schema.syntax)) {
      if (child.name.namespace !== XSD_NAMESPACE || !["annotation", "include", "import", ...Object.keys(declarationRoles)].includes(child.name.local)) schemaRetained.push({context: context(child, schema), syntax: child});
    }
    for (const node of syntaxElements(schema.syntax, XSD_NAMESPACE)) {
      const role = declarationRoles[node.name.local]; if (!role) continue;
      const name = named(node, schema.targetNamespace), id = globalId(role, name), prior = reserved.get(id);
      if (prior) {
        if (prior.node.source.digest !== node.source.digest || prior.node.source.path !== node.source.path) fail(node, "Conflicting global symbol declarations");
      } else {
        if (reserved.size >= maxNodes) throw new GraphError("resource-limit", `Canonical graph exceeds ${maxNodes} declarations`, node.source);
        reserved.set(id, {node, schema});
      }
    }
  }
  // Phase 2: build complete bodies. References are linked afterward, never expanded into stubs.
  for (const [id, {node, schema}] of reserved) {
    const scope: Scope = {schema, owner: id, rootPath: node.source.path};
    const role = declarationRoles[node.name.local], identity: Identity = {kind: "global", role, name: named(node, schema.targetNamespace)};
    if (role === "type") buildType(node, scope, identity);
    else if (role === "element" || role === "attribute") declaration(node, scope, role, identity);
    else if (role === "group") {
      const content = one(syntaxElements(node, XSD_NAMESPACE).filter(c => ["sequence", "choice", "all"].includes(c.name.local)), node, "group content") ?? fail(node, "Group requires compositor content");
      if (syntaxAttribute(content, "minOccurs") !== undefined || syntaxAttribute(content, "maxOccurs") !== undefined) fail(content, "Group definition content cannot carry occurrence bounds");
      put({...base(node, scope, id, identity, ["sequence", "choice", "all"]), kind: "group", content: particle(content, scope)}, scope);
    } else put({...base(node, scope, id, identity, ["attribute", "attributeGroup", "anyAttribute"]), kind: "attributeGroup", attributes: attributes(node, scope)}, scope);
  }
  // WSDL references remain ordered and role-qualified for later operation/binding planning.
  for (const doc of input.documents) {
    if (doc.root.name.namespace !== WSDL_NAMESPACE) continue;
    const namespace = syntaxAttribute(doc.root, "targetNamespace") ?? "";
    const schema: SchemaInterpretation = {key: doc.uri, syntax: doc.root, documentUri: doc.uri, digest: doc.digest, baseUri: doc.root.baseUri, targetNamespace: namespace, context: {kind: "root", namespace}};
    for (const node of syntaxElements(doc.root, WSDL_NAMESPACE).filter(n => ["message", "portType", "binding", "service"].includes(n.name.local))) {
      const role = node.name.local as "message" | "portType" | "binding" | "service", name = named(node, namespace), id = globalId(role, name);
      const scope: Scope = {schema, owner: id, rootPath: node.source.path};
      const references: {path: string; attribute: string; reference: Reference}[] = [];
      const visit = (n: SyntaxElement) => {
        const roles: Record<string, SymbolRole> = n.name.namespace === WSDL_NAMESPACE ? (n.name.local === "part" ? {element: "element", type: "type"}
          : n.name.local === "binding" ? {type: "portType"} : n.name.local === "port" ? {binding: "binding"} : ["input", "output", "fault"].includes(n.name.local) ? {message: "message"} : {}) : {};
        for (const [attribute, targetRole] of Object.entries(roles)) {
          const value = syntaxAttribute(n, attribute); if (value !== undefined) references.push({path: n.source.path.slice(node.source.path.length) || "/", attribute, reference: ref(value, targetRole, n, scope)});
        }
        for (const c of syntaxElements(n)) visit(c);
      };
      visit(node);
      put({...base(node, scope, id, {kind: "global", role, name}), retained: [], kind: "wsdl", role, name, syntax: node, references}, scope);
    }
  }
  const link = (r: Reference): Reference => {
    if (r.kind !== "symbol") return r;
    const target = globalId(r.role, r.name);
    return {...r, ...(nodes.has(target) ? {target} : {})};
  };
  const linkNode = (n: GraphNode): GraphNode => {
    switch (n.kind) {
      case "element": return {...n, type: link(n.type), substitutionGroup: n.substitutionGroup ? link(n.substitutionGroup) : undefined};
      case "attribute": return {...n, type: link(n.type)};
      case "attributeUse": return {...n, declaration: link(n.declaration)};
      case "attributeGroupUse": return {...n, reference: link(n.reference)};
      case "particle": return {...n, term: n.term.kind === "element" ? {...n.term, declaration: link(n.term.declaration)} : n.term.kind === "group" ? {...n.term, reference: link(n.term.reference)} : n.term};
      case "complexType": return {...n, derivation: n.derivation ? {...n.derivation, base: link(n.derivation.base), inlineType: n.derivation.inlineType ? link(n.derivation.inlineType) : undefined} : undefined};
      case "simpleType": return {...n, variety: n.variety.kind === "restriction" ? {...n.variety, base: link(n.variety.base)} : n.variety.kind === "list" ? {...n.variety, item: link(n.variety.item)} : {...n.variety, members: n.variety.members.map(link)}};
      case "wsdl": return {...n, references: n.references.map(r => ({...r, reference: link(r.reference)}))};
      default: return n;
    }
  };
  // All loading contexts remain provenance; they do not multiply global symbols or local bodies.
  const ownerCache = new Map<NodeId, NodeId>();
  const rootOwner = (n: GraphNode): NodeId => {
    if (n.identity.kind === "global") return n.id;
    const prior = ownerCache.get(n.id); if (prior) return prior;
    const owner = rootOwner(nodes.get(n.identity.owner)!); ownerCache.set(n.id, owner); return owner;
  };
  const owned = new Map<NodeId, GraphNode[]>();
  for (const n of nodes.values()) {
    const owner = rootOwner(n), group = owned.get(owner) ?? []; group.push(n); owned.set(owner, group);
  }
  for (const schema of input.schemas) for (const node of syntaxElements(schema.syntax, XSD_NAMESPACE)) {
    const role = declarationRoles[node.name.local]; if (!role) continue;
    const id = globalId(role, named(node, schema.targetNamespace));
    if (!origins[id].some(o => o.interpretation === schema.key)) {
      const paths = new Map<string, SyntaxElement>();
      const visit = (n: SyntaxElement) => {paths.set(n.source.path, n); for (const c of syntaxElements(n)) visit(c);};
      visit(node);
      for (const n of owned.get(id) ?? []) origins[n.id].push({interpretation: schema.key, context: context(paths.get(n.context.source.path)!, schema)});
    }
  }
  return deepFreeze({model: GRAPH_MODEL, nodes: [...nodes.values()].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).map(linkNode),
    globals: [...nodes.values()].filter(n => n.identity.kind === "global").map(n => n.id).sort(), origins,
    schemaAnnotations: annotations, schemaRetained, loading: {limits: input.limits, edges: input.edges}});
}
