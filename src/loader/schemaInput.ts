/** Contextual schema traversal; consumes ordered syntax, never payload hints. */
import {parseOrderedSyntax, SchemaLoadingError, syntaxAttribute, syntaxElements, XSD_NAMESPACE, WSDL_NAMESPACE} from "./orderedSyntax.js";
import type {SyntaxDocument, SyntaxElement, SyntaxSource} from "./orderedSyntax.js";
import {SchemaResourceLoader, resolveResourceUri} from "./schemaResources.js";
import type {LoadingLimits, OfflineSchemaResource, ResourceMetadata, SchemaResourcePolicy} from "./schemaResources.js";
import {resolutionDepthBound} from "./resolutionDepth.js";
import type {ResolutionArc} from "./resolutionDepth.js";
import {normalizeWhitespace} from '../util/xmlWhitespace.js';

export type SchemaContext = Readonly<{kind: "root" | "inline" | "include" | "import"; namespace: string}>;
export type SchemaInterpretation = Readonly<{
  key: string;
  syntax: SyntaxElement;
  documentUri: string;
  digest: string;
  baseUri: string;
  targetNamespace: string;
  context: SchemaContext;
}>;
export type ResolutionEdge = Readonly<{
  kind: "include" | "import" | "wsdl-import";
  from: string;
  to?: string;
  referenceUri?: string;
  source: SyntaxSource;
  cycle: boolean;
}>;
export type SchemaInput = Readonly<{
  root: SyntaxDocument;
  documents: readonly SyntaxDocument[];
  schemas: readonly SchemaInterpretation[];
  resources: readonly ResourceMetadata[];
  edges: readonly ResolutionEdge[];
  limits: LoadingLimits;
  metrics: Readonly<{resources: number; totalBytes: number; ioMs: number}>;
}>;

// Source-syntax evidence is issued only by this loader, never by a copied shape.
const loadedInputs = new WeakSet<object>();
export function assertLoadedSchemaInput(input: SchemaInput): void {
  if (!loadedInputs.has(input)) throw new TypeError("Unauthenticated loaded schema input");
}

export function schemaInterpretationKey(node: SyntaxElement, targetNamespace: string, context: SchemaContext): string {
  return JSON.stringify([node.source.digest, node.source.uri, node.baseUri, targetNamespace, context.kind, context.namespace, node.source.path]);
}

export type SchemaInputOptions = {
  /** Optional request accounting used by the additive assessment boundary. */
  chargeWork?: (amount: number) => void;
  policy: SchemaResourcePolicy;
  limits?: Partial<LoadingLimits>;
  offlineResources?: ReadonlyMap<string, OfflineSchemaResource>;
};

/** A fresh compilation-scoped snapshot, with no implicit network or filesystem permission. */
export function loadSchemaInput(source: string, options: SchemaInputOptions): Promise<SchemaInput> {
  return loadSchemaInputWithValues(source, options, false);
}

/** Internal faithful source entry; preserves syntax and the legacy public entry. */
export function loadSemanticSchemaInput(source: string, options: SchemaInputOptions): Promise<SchemaInput> {
  return loadSchemaInputWithValues(source, options, true);
}

async function loadSchemaInputWithValues(source: string, options: SchemaInputOptions, semanticValues: boolean): Promise<SchemaInput> {
  const loader = await SchemaResourceLoader.create(options.policy, options.limits, options.offlineResources, options.chargeWork);
  const documents = new Map<string, SyntaxDocument>();
  const schemas = new Map<string, SchemaInterpretation>();
  const edges: ResolutionEdge[] = [];
  const active = new Set<string>();
  const wsdlVisited = new Set<string>();
  const depthGraph = new Map<string, ResolutionArc[]>();
  const depthTargets = new Map<string, Set<string>>();
  const recordDepthArc = (from: string, to: string, cost: 0 | 1) => {
    const target = JSON.stringify([to, cost]);
    const targets = depthTargets.get(from) ?? new Set<string>();
    if (targets.has(target)) return;
    targets.add(target);
    depthTargets.set(from, targets);
    const arcs = depthGraph.get(from) ?? [];
    arcs.push({to, cost});
    depthGraph.set(from, arcs);
  };
  const recordEdge = (edge: ResolutionEdge) => {
    options.chargeWork?.(256);
    const frozen = Object.freeze(edge);
    edges.push(frozen);
    if (edge.to) recordDepthArc(edge.from, edge.to, 1);
  };
  const checkDepth = (depth: number, node?: SyntaxElement) => {
    if (depth > loader.limits.resolutionDepth) throw new SchemaLoadingError("resource-limit", `Schema resolution depth exceeds ${loader.limits.resolutionDepth} edges`, node?.source);
  };
  const getDocument = async (uri: string): Promise<SyntaxDocument> => {
    const resource = await loader.fetchResource(uri);
    let doc = documents.get(resource.uri);
    if (!doc) {
      doc = parseOrderedSyntax(resource.bytes, resource.uri, {maxDepth: loader.limits.syntaxDepth});
      documents.set(resource.uri, doc);
    }
    return doc;
  };
  const is = (node: SyntaxElement, namespace: string, local: string) => node.name.namespace === namespace && node.name.local === local;
  // Only XSD anyURI properties use this mapping. Original syntax and namespace
  // bindings, WSDL transport names, and arbitrary resource URLs remain intact.
  // Source byte/resource limits govern this phase, before semantic preparation.
  const xsdUri = (node: SyntaxElement, name: string): string | undefined => {
    const value = syntaxAttribute(node, name);
    options.chargeWork?.(64 + (value?.length ?? 0) * 16);
    return value === undefined || !semanticValues ? value : normalizeWhitespace(value, 'collapse');
  };
  // Cached interpretations still consume resolution depth on a later, deeper route.
  const checkCachedDepth = (key: string, depth: number) => {
    if (depth + resolutionDepthBound(key, depthGraph, active) > loader.limits.resolutionDepth) {
      throw new SchemaLoadingError("resource-limit", `Schema resolution depth exceeds ${loader.limits.resolutionDepth} edges`, schemas.get(key)?.syntax.source ?? documents.get(key)?.root.source);
    }
  };
  const referencedDocument = async (reference: string, node: SyntaxElement): Promise<{referenceUri: string; doc: SyntaxDocument}> => {
    try {
      const referenceUri = resolveResourceUri(reference, node.baseUri);
      return {referenceUri, doc: await getDocument(referenceUri)};
    } catch (error) {
      if (error instanceof SchemaLoadingError && !error.source) throw new SchemaLoadingError(error.category, error.message, node.source);
      throw error;
    }
  };
  const interpret = async (node: SyntaxElement, context: SchemaContext, depth: number): Promise<string> => {
    options.chargeWork?.(4096 + (node.source.path.length + node.source.uri.length + node.baseUri.length + context.namespace.length) * 32 + node.children.length * 128);
    checkDepth(depth, node);
    if (!is(node, XSD_NAMESPACE, "schema")) throw new SchemaLoadingError("invalid-schema", "Expected an XSD schema root", node.source);
    const declaredValue = xsdUri(node, "targetNamespace");
    if (semanticValues && declaredValue === '') throw new SchemaLoadingError("invalid-schema", "A present schema target namespace must not be empty", node.source);
    const declaredNamespace = declaredValue ?? "";
    const targetNamespace = context.kind === "include" && !declaredNamespace ? context.namespace : declaredNamespace;
    if (context.kind === "include" && declaredNamespace && declaredNamespace !== context.namespace) {
      throw new SchemaLoadingError("invalid-schema", "Included schema target namespace differs from its including schema", node.source);
    }
    if (context.kind === "import" && targetNamespace !== context.namespace) {
      throw new SchemaLoadingError("invalid-schema", "Imported schema target namespace differs from the declared import namespace", node.source);
    }
    const key = schemaInterpretationKey(node, targetNamespace, context);
    if (schemas.has(key)) { if (!active.has(key)) checkCachedDepth(key, depth); return key; }
    const instance = Object.freeze({key, syntax: node, documentUri: node.source.uri, digest: node.source.digest, baseUri: node.baseUri, targetNamespace, context: Object.freeze(context)});
    schemas.set(key, instance);
    active.add(key);
    for (const child of syntaxElements(node, XSD_NAMESPACE)) {
      if (child.name.local !== "include" && child.name.local !== "import") continue;
      const kind = child.name.local;
      const location = xsdUri(child, "schemaLocation");
      const importedNamespace = xsdUri(child, "namespace");
      const missingLocation = semanticValues ? location === undefined : !location;
      if (missingLocation && kind === "include") throw new SchemaLoadingError("invalid-schema", "Schema include requires schemaLocation", child.source);
      if (missingLocation) { recordEdge({kind, from: key, source: child.source, cycle: false}); continue; }
      checkDepth(depth + 1, child);
      const namespace = kind === "include" ? targetNamespace : importedNamespace ?? "";
      if (kind === "import" && namespace === targetNamespace) throw new SchemaLoadingError("invalid-schema", "Schema import must name a different namespace", child.source);
      const {referenceUri, doc} = await referencedDocument(location!, child);
      const childDeclaredNamespace = xsdUri(doc.root, "targetNamespace");
      // A successfully supplied import referent must match both presence and
      // value. An explicit empty import namespace without a referent is not
      // by itself forbidden by the anyURI datatype or src-import clause 3.
      if (semanticValues && kind === 'import' && (importedNamespace === undefined) !== (childDeclaredNamespace === undefined)) {
        throw new SchemaLoadingError("invalid-schema", "Imported schema target namespace presence differs from the declared import namespace", child.source);
      }
      const childContext: SchemaContext = {kind, namespace};
      const childNamespace = kind === "include" ? childDeclaredNamespace || namespace : childDeclaredNamespace ?? "";
      const childKey = schemaInterpretationKey(doc.root, childNamespace, childContext);
      const cycle = active.has(childKey);
      const to = await interpret(doc.root, childContext, depth + 1);
      recordEdge({kind, from: key, to, referenceUri, source: child.source, cycle});
    }
    active.delete(key);
    return key;
  };
  const visitWsdl = async (doc: SyntaxDocument, depth: number): Promise<void> => {
    checkDepth(depth, doc.root);
    if (!is(doc.root, WSDL_NAMESPACE, "definitions")) throw new SchemaLoadingError("invalid-schema", "Expected WSDL 1.1 definitions", doc.root.source);
    if (wsdlVisited.has(doc.uri)) { if (!active.has(doc.uri)) checkCachedDepth(doc.uri, depth); return; }
    wsdlVisited.add(doc.uri);
    active.add(doc.uri);
    for (const child of syntaxElements(doc.root, WSDL_NAMESPACE)) {
      if (child.name.local === "types") {
        for (const schema of syntaxElements(child, XSD_NAMESPACE, "schema")) {
          const key = await interpret(schema, {kind: "inline", namespace: ""}, depth);
          recordDepthArc(doc.uri, key, 0);
        }
      } else if (child.name.local === "import") {
        const location = syntaxAttribute(child, "location");
        if (!location) throw new SchemaLoadingError("invalid-schema", "WSDL import requires location", child.source);
        checkDepth(depth + 1, child);
        const {referenceUri, doc: imported} = await referencedDocument(location, child);
        if ((syntaxAttribute(imported.root, "targetNamespace") ?? "") !== (syntaxAttribute(child, "namespace") ?? "")) {
          throw new SchemaLoadingError("invalid-schema", "WSDL import namespace mismatch", child.source);
        }
        const cycle = active.has(imported.uri);
        await visitWsdl(imported, depth + 1);
        recordEdge({kind: "wsdl-import", from: doc.uri, to: imported.uri, referenceUri, source: child.source, cycle});
      }
    }
    active.delete(doc.uri);
  };
  const root = await getDocument(resolveResourceUri(source));
  if (is(root.root, XSD_NAMESPACE, "schema")) await interpret(root.root, {kind: "root", namespace: ""}, 0);
  else if (is(root.root, WSDL_NAMESPACE, "definitions")) await visitWsdl(root, 0);
  else throw new SchemaLoadingError("unsupported-capability", "Only WSDL 1.1 or XSD schema inputs are accepted; payload hints cannot resolve schemas", root.root.source);
  const input = Object.freeze({root, documents: Object.freeze([...documents.values()]), schemas: Object.freeze([...schemas.values()]),
    resources: loader.metadata, edges: Object.freeze(edges), limits: loader.limits, metrics: loader.metrics});
  loadedInputs.add(input);
  return input;
}
