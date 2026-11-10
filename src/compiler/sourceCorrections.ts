/** Explicit, source-pinned XML corrections for loaded schema inputs. */
import {createHash} from "node:crypto";
import {copyOriginalSchemaResource} from "../loader/schemaInput.js";
import type {SchemaInput} from "../loader/schemaInput.js";
import {decodeMetadataXml, isXmlNCName, syntaxElements, XSD_NAMESPACE} from "../loader/orderedSyntax.js";
import type {SyntaxElement} from "../loader/orderedSyntax.js";
import type {OfflineSchemaResource} from "../loader/schemaResources.js";
import {DEFAULT_GRAPH_NODES, GraphError, isBuiltinType} from "./canonicalGraph.js";
import type {CanonicalGraph, GraphNode, NodeId, Identity} from "./canonicalGraph.js";
import {buildCanonicalGraph} from "./buildCanonicalGraph.js";
import {namespaceAllows, wildcardNamespaces} from './wildcardAlgebra.js';

const RECIPE_VERSION = 1 as const;
const MAX_RECIPE_BYTES = 256 * 1024;
const MAX_RECIPE_DEPTH = 32;
const MAX_CORRECTIONS = 256;
const MAX_OUTPUT_GROWTH = 2 * 1024 * 1024;
const MAX_SYNTAX_INDEX_NODES = DEFAULT_GRAPH_NODES;
const MAX_LEXICAL_SCAN = 64 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;

export type SourceCorrectionSelector = Readonly<{id: NodeId; uri: string; digest: string}>;
export type SourceCorrectionInventoryNode = Readonly<{
  id: NodeId;
  kind: GraphNode["kind"];
  role: string;
  namespace: string;
  name?: Readonly<{namespace: string; local: string}>;
  syntaxName: Readonly<{namespace: string; local: string}>;
  uri: string;
  digest: string;
  path: string;
  start: number;
  end: number;
  attributes: readonly Readonly<{name: string; namespace: string; lexicalName: string; value: string}>[];
  occurs?: Readonly<{min: string; max: string | "unbounded"}>;
  wildcard?: Readonly<{namespace: string; processContents: string}>;
  children?: readonly NodeId[];
  parent?: NodeId;
  chameleon: boolean;
  ambiguousContext: boolean;
}>;
export type SourceCorrectionInventory = Readonly<{
  version: 1;
  resources: readonly Readonly<{uri: string; digest: string; byteLength: number}>[];
  nodes: readonly SourceCorrectionInventoryNode[];
}>;

type OccursCorrection = Readonly<{kind: "set-occurs"; target: SourceCorrectionSelector; min: string; max: string | "unbounded"}>;
type WildcardCorrection = Readonly<{kind: "set-wildcard-namespaces"; target: SourceCorrectionSelector; namespaces: readonly string[]}>;
type InsertPosition = "append" | Readonly<{kind: "before" | "after"; target: SourceCorrectionSelector}>;
type InsertElement = Readonly<
  {kind: "declaration"; name: string; type: Readonly<{namespace: string; local: string}>; min: string; max: string | "unbounded"} |
  {kind: "reference"; target: SourceCorrectionSelector; min: string; max: string | "unbounded"}
>;
type InsertCorrection = Readonly<{kind: "insert-element"; target: SourceCorrectionSelector; position: InsertPosition; element: InsertElement}>;
type Correction = OccursCorrection | WildcardCorrection | InsertCorrection;
type Recipe = Readonly<{version: 1; resources: readonly Readonly<{uri: string; digest: string}>[]; corrections: readonly Correction[]}>;
type SourceRecord = {uri: string; digest: string; bytes: Uint8Array; aliases: Set<string>};
type TargetRecord = {node: GraphNode; syntax: SyntaxElement; ambiguousContext: boolean};
type Patch = {start: number; end: number; text: string; label: string};
type LexicalBudget = {remaining: number};

export type SourceCorrectionProvenance = Readonly<{
  version: 1;
  canonicalRecipeDigest: string;
  resources: readonly Readonly<{uri: string; originalDigest: string; effectiveDigest: string; changed: boolean}>[];
  corrections: readonly Readonly<{kind: Correction["kind"]; target: SourceCorrectionSelector}>[];
}>;
export type PreparedCorrectedSourceInputs = Readonly<{
  inventory: SourceCorrectionInventory;
  resources: ReadonlyMap<string, OfflineSchemaResource>;
  provenance: SourceCorrectionProvenance;
}>;

export class SourceCorrectionError extends Error {
  constructor(readonly category: "invalid-recipe" | "stale-source" | "ambiguous-target" | "unsupported-target" | "resource-limit" | "cancelled", message: string) {
    super(message);
    this.name = "SourceCorrectionError";
  }
}

function fail(category: SourceCorrectionError["category"], message: string): never {
  throw new SourceCorrectionError(category, message);
}
const checkAbort = (signal?: AbortSignal): void => {
  if (signal?.aborted) fail("cancelled", "Source correction cancelled");
};
const sha256 = (bytes: Uint8Array | string): string => createHash("sha256").update(bytes).digest("hex");
const compareText = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sourceKey = (uri: string, digest: string, path: string): string => JSON.stringify([uri, digest, path]);
const selectorKey = (selector: SourceCorrectionSelector): string => JSON.stringify([selector.id, selector.uri, selector.digest]);
const hasOwn = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
function scanCheckpoint(budget: LexicalBudget, signal?: AbortSignal): void {
  checkAbort(signal);
  budget.remaining -= 1024;
  if (budget.remaining < 0) fail("resource-limit", "Source correction lexical scan exceeds its work limit");
}

function boundedJsonSize(value: unknown, signal?: AbortSignal): number {
  const active = new Set<object>();
  let size = 0, steps = 0;
  const visit = (current: unknown, depth: number): void => {
    if ((steps++ & 255) === 0) checkAbort(signal);
    if (depth > MAX_RECIPE_DEPTH) fail("invalid-recipe", "Source correction recipe JSON nesting is too deep");
    if (current === null) {size += 4; return;}
    if (typeof current === "string") {size += current.length * 6 + 2; return;}
    if (typeof current === "number" || typeof current === "boolean") {size += 16; return;}
    if (typeof current !== "object") fail("invalid-recipe", "Source correction recipe must contain JSON data only");
    if (active.has(current)) fail("invalid-recipe", "Source correction recipe must not contain cycles");
    active.add(current);
    if (Array.isArray(current)) {
      size += 2;
      for (const item of current) {visit(item, depth + 1); size += 1; if (size > MAX_RECIPE_BYTES) fail("resource-limit", "Source correction recipe exceeds the size limit");}
    } else {
      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) fail("invalid-recipe", "Source correction recipe objects must be plain JSON objects");
      size += 2;
      for (const [key, child] of Object.entries(current)) {
        size += key.length * 6 + 4; visit(child, depth + 1);
        if (size > MAX_RECIPE_BYTES) fail("resource-limit", "Source correction recipe exceeds the size limit");
      }
    }
    active.delete(current);
    if (size > MAX_RECIPE_BYTES) fail("resource-limit", "Source correction recipe exceeds the size limit");
  };
  visit(value, 0);
  return size;
}

function record(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid-recipe", `${label} must be an object`);
  const object = value as Record<string, unknown>, keys = Object.keys(object);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) fail("invalid-recipe", `${label} has missing or unknown fields`);
  return object;
}
function text(value: unknown, label: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) fail("invalid-recipe", `${label} must be ${allowEmpty ? "a string" : "a nonempty string"}`);
  return value;
}
function digest(value: unknown, label: string): string {
  const valueText = text(value, label);
  if (!HASH.test(valueText)) fail("invalid-recipe", `${label} must be a lowercase SHA-256 digest`);
  return valueText;
}
function selector(value: unknown, label: string): SourceCorrectionSelector {
  const item = record(value, ["id", "uri", "digest"], label);
  return Object.freeze({id: text(item.id, `${label}.id`), uri: text(item.uri, `${label}.uri`), digest: digest(item.digest, `${label}.digest`)});
}
function occurrence(value: unknown, label: string, allowUnbounded: boolean): string {
  const result = text(value, label);
  if (allowUnbounded && result === "unbounded") return result;
  if (!/^(0|[1-9][0-9]*)$/.test(result)) fail("invalid-recipe", `${label} must be a canonical nonnegative integer${allowUnbounded ? " or unbounded" : ""}`);
  return result;
}
function checkOccurs(min: string, max: string, label: string): void {
  if (max !== "unbounded" && (min.length > max.length || (min.length === max.length && min > max))) fail("invalid-recipe", `${label} minimum exceeds maximum`);
}
function parseRecipe(value: unknown, signal?: AbortSignal): Recipe {
  boundedJsonSize(value, signal);
  const root = record(value, ["version", "resources", "corrections"], "recipe");
  if (root.version !== RECIPE_VERSION) fail("invalid-recipe", "Unsupported source correction recipe version");
  if (!Array.isArray(root.resources) || !Array.isArray(root.corrections)) fail("invalid-recipe", "Recipe resources and corrections must be arrays");
  if (root.corrections.length > MAX_CORRECTIONS) fail("resource-limit", "Source correction count exceeds the limit");
  const resources = root.resources.map((raw, index) => {
    const item = record(raw, ["uri", "digest"], `resources[${index}]`);
    return Object.freeze({uri: text(item.uri, `resources[${index}].uri`), digest: digest(item.digest, `resources[${index}].digest`)});
  });
  const corrections = root.corrections.map((raw, index): Correction => {
    checkAbort(signal);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) fail("invalid-recipe", `corrections[${index}] must be an object`);
    const kind = (raw as Record<string, unknown>).kind;
    if (kind === "set-occurs") {
      const item = record(raw, ["kind", "target", "min", "max"], `corrections[${index}]`);
      const min = occurrence(item.min, `corrections[${index}].min`, false), max = occurrence(item.max, `corrections[${index}].max`, true);
      checkOccurs(min, max, `corrections[${index}]`);
      return Object.freeze({kind, target: selector(item.target, `corrections[${index}].target`), min, max});
    }
    if (kind === "set-wildcard-namespaces") {
      const item = record(raw, ["kind", "target", "namespaces"], `corrections[${index}]`);
      if (!Array.isArray(item.namespaces) || item.namespaces.length === 0) fail("invalid-recipe", `corrections[${index}].namespaces must be a nonempty array`);
      const namespaces = item.namespaces.map((entry, offset) => {
        const value = text(entry, `corrections[${index}].namespaces[${offset}]`, true);
        if (/\s/.test(value) || value.startsWith("##")) fail("invalid-recipe", "Wildcard namespace entries must be namespace names, not tokens or whitespace-separated values");
        return value;
      });
      if (new Set(namespaces).size !== namespaces.length) fail("invalid-recipe", "Wildcard namespace entries must be unique");
      return Object.freeze({kind, target: selector(item.target, `corrections[${index}].target`), namespaces: Object.freeze(namespaces)});
    }
    if (kind === "insert-element") {
      const item = record(raw, ["kind", "target", "position", "element"], `corrections[${index}]`);
      let position: InsertPosition;
      if (item.position === "append") position = "append";
      else {
        const p = record(item.position, ["kind", "target"], `corrections[${index}].position`);
        if (p.kind !== "before" && p.kind !== "after") fail("invalid-recipe", `corrections[${index}].position.kind must be before or after`);
        position = Object.freeze({kind: p.kind, target: selector(p.target, `corrections[${index}].position.target`)});
      }
      const elementRaw = item.element;
      if (!elementRaw || typeof elementRaw !== "object" || Array.isArray(elementRaw)) fail("invalid-recipe", `corrections[${index}].element must be an object`);
      const elementKind = (elementRaw as Record<string, unknown>).kind;
      let element: InsertElement;
      if (elementKind === "declaration") {
        const e = record(elementRaw, ["kind", "name", "type", "min", "max"], `corrections[${index}].element`);
        const typeValue = record(e.type, ["namespace", "local"], `corrections[${index}].element.type`);
        const name = text(e.name, `corrections[${index}].element.name`);
        if (!isXmlNCName(name)) fail("invalid-recipe", "Inserted element name must be an XML NCName");
        const typeNamespace = text(typeValue.namespace, "type.namespace", true), typeLocal = text(typeValue.local, "type.local");
        if (!isXmlNCName(typeLocal)) fail("invalid-recipe", "Inserted element type local name must be an XML NCName");
        const min = occurrence(e.min, `corrections[${index}].element.min`, false), max = occurrence(e.max, `corrections[${index}].element.max`, true);
        checkOccurs(min, max, `corrections[${index}].element`);
        element = Object.freeze({kind: elementKind, name, type: Object.freeze({namespace: typeNamespace, local: typeLocal}), min, max});
      } else if (elementKind === "reference") {
        const e = record(elementRaw, ["kind", "target", "min", "max"], `corrections[${index}].element`);
        const min = occurrence(e.min, `corrections[${index}].element.min`, false), max = occurrence(e.max, `corrections[${index}].element.max`, true);
        checkOccurs(min, max, `corrections[${index}].element`);
        element = Object.freeze({kind: elementKind, target: selector(e.target, `corrections[${index}].element.target`), min, max});
      } else fail("invalid-recipe", `corrections[${index}].element.kind must be declaration or reference`);
      return Object.freeze({kind, target: selector(item.target, `corrections[${index}].target`), position, element});
    }
    return fail("invalid-recipe", `Unknown correction kind at corrections[${index}]`);
  });
  return Object.freeze({version: RECIPE_VERSION, resources: Object.freeze(resources), corrections: Object.freeze(corrections)});
}

function syntaxIndex(input: SchemaInput, signal?: AbortSignal): Map<string, SyntaxElement> {
  const index = new Map<string, SyntaxElement>();
  let count = 0;
  const visit = (node: SyntaxElement): void => {
    if ((count++ & 127) === 0) checkAbort(signal);
    if (count > MAX_SYNTAX_INDEX_NODES) fail("resource-limit", "Source correction XML span index exceeds the node limit");
    index.set(sourceKey(node.source.uri, node.source.digest, node.source.path), node);
    for (const child of syntaxElements(node)) visit(child);
  };
  for (const doc of input.documents) visit(doc.root);
  return index;
}
function nodeRole(identity: Identity): string {return identity.role;}
function nodeName(node: GraphNode): Readonly<{namespace: string; local: string}> | undefined {
  if (node.kind === "element" || node.kind === "attribute" || node.kind === "wsdl") return node.name;
  return node.identity.kind === "global" ? node.identity.name : undefined;
}
function targetMap(inputs: readonly SchemaInput[], signal?: AbortSignal): {inventory: SourceCorrectionInventory; targets: Map<string, TargetRecord>; sources: Map<string, SourceRecord>; aliases: Map<string, string>} {
  if (!Array.isArray(inputs) || inputs.length === 0) fail("invalid-recipe", "At least one authenticated source input is required");
  const sources = new Map<string, SourceRecord>(), aliases = new Map<string, string>(), targets = new Map<string, TargetRecord>();
  const contextNamespaces = new Map<string, Set<string>>(), contextChameleon = new Map<string, boolean>();
  let nodeCount = 0, byteCount = 0;
  const resourceCountLimit = Math.min(...inputs.map(input => input.limits.resources));
  const totalLimit = Math.min(...inputs.map(input => input.limits.totalBytes));
  const resourceLimit = Math.min(...inputs.map(input => input.limits.resourceBytes));
  let syntaxNodeCount = 0;
  for (const input of inputs) {
    checkAbort(signal);
    const index = syntaxIndex(input, signal);
    syntaxNodeCount += index.size;
    if (syntaxNodeCount > MAX_SYNTAX_INDEX_NODES) fail("resource-limit", "Combined source correction XML span index exceeds the node limit");
    let graph: CanonicalGraph;
    try {graph = buildCanonicalGraph(input);} catch (error) {
      if (error instanceof GraphError) fail(error.category === "resource-limit" ? "resource-limit" : "unsupported-target", "Source correction input could not be represented in the canonical graph");
      throw error;
    }
    nodeCount += graph.nodes.length;
    if (nodeCount > DEFAULT_GRAPH_NODES) fail("resource-limit", "Combined source correction graph exceeds the node limit");
    for (const resource of input.resources) {
      checkAbort(signal);
      const bytes = copyOriginalSchemaResource(input, resource.uri, () => {});
      checkAbort(signal);
      if (bytes.byteLength !== resource.byteLength || sha256(bytes) !== resource.digest) fail("stale-source", "Loaded source resource bytes do not match their pinned digest");
      const prior = sources.get(resource.uri);
      if (prior && (prior.digest !== resource.digest || !Buffer.from(prior.bytes).equals(Buffer.from(bytes)))) fail("stale-source", "Inputs disagree about bytes for a shared schema resource");
      if (!prior) {
        if (sources.size >= resourceCountLimit) fail("resource-limit", "Combined source correction resource count exceeds the loading limit");
        byteCount += bytes.byteLength;
        if (byteCount > totalLimit || bytes.byteLength > resourceLimit) fail("resource-limit", "Combined source correction resource bytes exceed the loading limit");
        sources.set(resource.uri, {uri: resource.uri, digest: resource.digest, bytes, aliases: new Set()});
      }
    }
    for (const [alias, uri] of input.resourceAliases) {
      checkAbort(signal);
      const canonical = sources.get(uri);
      if (!canonical) fail("stale-source", "Schema alias points to an absent canonical resource");
      const existing = aliases.get(alias);
      if (existing && existing !== uri) fail("ambiguous-target", "Inputs assign a schema alias to different resources");
      aliases.set(alias, uri); canonical.aliases.add(alias);
    }
    let graphScanned = 0;
    for (const node of graph.nodes) {
      if ((graphScanned++ & 127) === 0) checkAbort(signal);
      const source = node.context.source, syntax = index.get(sourceKey(source.uri, source.digest, source.path));
      if (!syntax) fail("stale-source", "Canonical graph target has no matching loaded XML span");
      const key = selectorKey({id: node.id, uri: source.uri, digest: source.digest});
      const location = sourceKey(source.uri, source.digest, source.path);
      const namespaces = contextNamespaces.get(location) ?? new Set<string>();
      namespaces.add(node.context.effectiveNamespace); contextNamespaces.set(location, namespaces);
      contextChameleon.set(location, Boolean(contextChameleon.get(location) || node.context.chameleon));
      for (const origin of graph.origins[node.id] ?? []) {
        const originSource = origin.context.source;
        if (sourceKey(originSource.uri, originSource.digest, originSource.path) === location) {
          namespaces.add(origin.context.effectiveNamespace);
          contextChameleon.set(location, Boolean(contextChameleon.get(location) || origin.context.chameleon));
        }
      }
      const old = targets.get(key);
      if (old) {
        if (old.node.context.effectiveNamespace !== node.context.effectiveNamespace || old.node.context.source.path !== source.path) {
          fail("ambiguous-target", "One canonical identity has conflicting schema contexts");
        }
        continue;
      }
      targets.set(key, {node, syntax, ambiguousContext: false});
    }
  }
  for (const target of targets.values()) {
    const source = target.node.context.source;
    target.ambiguousContext = (contextNamespaces.get(sourceKey(source.uri, source.digest, source.path))?.size ?? 0) > 1;
  }
  const inventoryResources = Object.freeze([...sources.values()].map(({uri, digest, bytes}) => Object.freeze({uri, digest, byteLength: bytes.byteLength})).sort((a, b) => compareText(a.uri, b.uri)));
  const nodes: SourceCorrectionInventoryNode[] = [];
  const parents = new Map<NodeId, NodeId>();
  for (const {node} of targets.values()) {
    if (node.identity.kind === "scoped") parents.set(node.id, node.identity.owner);
    if (node.kind === "complexType" && node.content) parents.set(node.content, node.id);
    if (node.kind === "complexType") for (const id of node.attributes) parents.set(id, node.id);
    if (node.kind === "particle" && (node.term.kind === "sequence" || node.term.kind === "choice" || node.term.kind === "all")) {
      for (const id of node.term.children) parents.set(id, node.id);
    }
    if (node.kind === "particle" && node.term.kind === "element" && node.term.declaration.kind === "local") parents.set(node.term.declaration.target, node.id);
  }
  for (const {node, syntax, ambiguousContext} of targets.values()) {
    checkAbort(signal);
    const source = node.context.source;
    const rawAttributes = Object.freeze(syntax.attributes.map(attribute => Object.freeze({name: attribute.name.local, namespace: attribute.name.namespace, lexicalName: attribute.lexicalName, value: attribute.value})));
    const wildcard = node.kind === "particle" && node.term.kind === "any" ? Object.freeze({namespace: node.term.wildcard.namespace.value, processContents: node.term.wildcard.processContents})
      : node.kind === "attributeWildcard" ? Object.freeze({namespace: node.wildcard.namespace.value, processContents: node.wildcard.processContents}) : undefined;
    const children = node.kind === "particle" && (node.term.kind === "sequence" || node.term.kind === "choice" || node.term.kind === "all") ? node.term.children : undefined;
    const entry: SourceCorrectionInventoryNode = Object.freeze({id: node.id, kind: node.kind, role: nodeRole(node.identity), namespace: node.context.effectiveNamespace,
      ...(nodeName(node) ? {name: nodeName(node)} : {}), syntaxName: syntax.name, uri: source.uri, digest: source.digest, path: source.path,
      start: source.start.offset, end: source.end.offset, attributes: rawAttributes, ...(node.kind === "particle" ? {occurs: node.occurs} : {}),
      ...(wildcard ? {wildcard} : {}), ...(children ? {children} : {}), ...(parents.has(node.id) ? {parent: parents.get(node.id)} : {}),
      chameleon: Boolean(node.context.chameleon || contextChameleon.get(sourceKey(source.uri, source.digest, source.path))), ambiguousContext});
    nodes.push(entry);
  }
  nodes.sort((a, b) => compareText(a.uri, b.uri) || compareText(a.path, b.path) || compareText(a.id, b.id));
  return {inventory: Object.freeze({version: 1, resources: inventoryResources, nodes: Object.freeze(nodes)}), targets, sources, aliases};
}

export function inspectSourceCorrectionInventory(inputs: readonly SchemaInput[], signal?: AbortSignal): SourceCorrectionInventory {
  checkAbort(signal);
  return targetMap(inputs, signal).inventory;
}

function targetFor(selectorValue: SourceCorrectionSelector, targets: Map<string, TargetRecord>): TargetRecord {
  const target = targets.get(selectorKey(selectorValue));
  if (!target) fail("stale-source", "Correction target is absent from the pinned canonical inventory");
  if (target.ambiguousContext) fail("ambiguous-target", "Correction target source is interpreted under multiple target namespaces");
  return target;
}
function xmlEscapeAttribute(value: string, quote: string): string {
  let escaped = value.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return quote === "\"" ? escaped.replace(/\"/g, "&quot;") : escaped.replace(/'/g, "&apos;");
}
type StartTag = {name: string; close: number; selfClosing: boolean; attributes: Map<string, {valueStart: number; valueEnd: number; quote: string}>};
function startTag(text: string, start: number, signal?: AbortSignal, budget: LexicalBudget = {remaining: MAX_LEXICAL_SCAN}): StartTag {
  if (text[start] !== "<" || text[start + 1] === "/" || text[start + 1] === "!" || text[start + 1] === "?") fail("stale-source", "Canonical source span does not point to an opening tag");
  let i = start + 1;
  const nameStart = i;
  while (i < text.length && !/[\s/>]/.test(text[i]!)) {i++; if ((i & 1023) === 0) scanCheckpoint(budget, signal);}
  const name = text.slice(nameStart, i), attributes = new Map<string, {valueStart: number; valueEnd: number; quote: string}>();
  while (i < text.length) {
    while (/\s/.test(text[i] ?? "")) {i++; if ((i & 1023) === 0) scanCheckpoint(budget, signal);}
    if (text[i] === ">") return {name, close: i, selfClosing: false, attributes};
    if (text[i] === "/" && text[i + 1] === ">") return {name, close: i, selfClosing: true, attributes};
    const attrStart = i;
    while (i < text.length && !/[\s=/>]/.test(text[i]!)) {i++; if ((i & 1023) === 0) scanCheckpoint(budget, signal);}
    if (i === attrStart) fail("stale-source", "Malformed XML attribute syntax in correction target");
    const attrName = text.slice(attrStart, i);
    while (/\s/.test(text[i] ?? "")) {i++; if ((i & 1023) === 0) scanCheckpoint(budget, signal);}
    if (text[i++] !== "=") fail("stale-source", "Malformed XML attribute syntax in correction target");
    while (/\s/.test(text[i] ?? "")) {i++; if ((i & 1023) === 0) scanCheckpoint(budget, signal);}
    const quote = text[i++];
    if (quote !== "'" && quote !== "\"") fail("stale-source", "XML attributes must be quoted");
    const valueStart = i;
    while (i < text.length && text[i] !== quote) {i++; if ((i & 1023) === 0) scanCheckpoint(budget, signal);}
    if (i >= text.length) fail("stale-source", "Unterminated XML attribute in correction target");
    if (attributes.has(attrName)) fail("stale-source", "Duplicate lexical attribute in correction target");
    attributes.set(attrName, {valueStart, valueEnd: i, quote}); i++;
  }
  return fail("stale-source", "Unterminated XML start tag in correction target");
}
function updateStartTag(text: string, target: TargetRecord, set: Readonly<Record<string, string>>, signal?: AbortSignal, budget?: LexicalBudget): Patch[] {
  const offset = target.node.context.source.start.offset, tag = startTag(text, offset, signal, budget);
  const existingByLocal = new Map<string, {key: string; valueStart: number; valueEnd: number; quote: string}>();
  for (const [key, attr] of tag.attributes) if (!key.includes(":")) existingByLocal.set(key, {key, ...attr});
  const patches: Patch[] = [], additions: string[] = [];
  for (const [local, value] of Object.entries(set)) {
    const existing = existingByLocal.get(local);
    if (existing) {
      if (text.slice(existing.valueStart, existing.valueEnd) !== value) patches.push({start: existing.valueStart, end: existing.valueEnd, text: xmlEscapeAttribute(value, existing.quote), label: `${target.node.id}:${local}`});
    } else additions.push(`${local}="${xmlEscapeAttribute(value, "\"")}"`);
  }
  if (additions.length) {
    // startTag() records absolute offsets in the full decoded document.
    const position = tag.close;
    patches.push({start: position, end: position, text: ` ${additions.join(" ")}`, label: `${target.node.id}:attributes`});
  }
  return patches;
}
function findTerminator(text: string, token: string, start: number, limit: number, signal: AbortSignal | undefined, budget: LexicalBudget): number {
  for (let i = start; i + token.length <= limit; i++) {
    if ((i & 1023) === 0) scanCheckpoint(budget, signal);
    if (text[i] === token[0] && text.startsWith(token, i)) return i;
  }
  return -1;
}
function closingTagStart(text: string, target: TargetRecord, signal?: AbortSignal, budget: LexicalBudget = {remaining: MAX_LEXICAL_SCAN}): number {
  const syntax = target.syntax, source = target.node.context.source, opening = startTag(text, source.start.offset, signal, budget);
  if (opening.selfClosing) fail("unsupported-target", "Cannot append a child to an empty sequence element");
  let depth = 1, i = opening.close + 1;
  while (i < source.end.offset) {
    if ((i & 1023) === 0) scanCheckpoint(budget, signal);
    if (text[i] !== "<") {i++; continue;}
    if (text.startsWith("<!--", i)) {const end = findTerminator(text, "-->", i + 4, source.end.offset, signal, budget); if (end < 0) break; i = end + 3; continue;}
    if (text.startsWith("<![CDATA[", i)) {const end = findTerminator(text, "]]>", i + 9, source.end.offset, signal, budget); if (end < 0) break; i = end + 3; continue;}
    if (text.startsWith("<?", i)) {const end = findTerminator(text, "?>", i + 2, source.end.offset, signal, budget); if (end < 0) break; i = end + 2; continue;}
    let j = i + 1, quote = "";
    for (; j < source.end.offset; j++) {
      const char = text[j]!;
      if (quote) {if (char === quote) quote = "";}
      else if (char === "'" || char === "\"") quote = char;
      else if (char === ">") break;
      if ((j & 1023) === 0) scanCheckpoint(budget, signal);
    }
    if (j >= source.end.offset) break;
    const token = text.slice(i, j + 1), closing = /^<\//.test(token), selfClosing = /\/\s*>$/.test(token);
    if (closing) {
      depth--;
      if (depth === 0) return i;
    } else if (!selfClosing && !/^<!/.test(token)) depth++;
    i = j + 1;
  }
  return fail("stale-source", `Could not locate closing tag for ${syntax.name.local}`);
}
function indentAt(text: string, offset: number, signal?: AbortSignal): string | undefined {
  let start = offset, scanned = 0;
  while (start > 0 && text[start - 1] !== "\n" && scanned < 4096) {
    const char = text[start - 1]!;
    if (char !== " " && char !== "\t" && char !== "\r") return undefined;
    start--; scanned++;
    if ((scanned & 1023) === 0) checkAbort(signal);
  }
  if (start > 0 && text[start - 1] !== "\n") return undefined;
  return text.slice(start, offset);
}
function qname(namespace: string, local: string, context: Readonly<Record<string, string>>, fresh: Set<string>): {lexical: string; declaration?: string} {
  if (namespace === "" && (context[""] ?? "") !== "") {
    fail("unsupported-target", "Cannot emit a no-namespace QName beneath a nonempty default namespace");
  }
  const prefixes = Object.entries(context).filter(([prefix, uri]) => prefix && uri === namespace).map(([prefix]) => prefix).sort(compareText);
  if (prefixes.length) return {lexical: `${prefixes[0]}:${local}`};
  if ((context[""] ?? "") === namespace) return {lexical: local};
  let prefix = "correction", suffix = 0;
  while (hasOwn(context, prefix) || fresh.has(prefix)) prefix = `correction${++suffix}`;
  fresh.add(prefix);
  return {lexical: `${prefix}:${local}`, declaration: `xmlns:${prefix}="${xmlEscapeAttribute(namespace, "\"")}"`};
}
function siblingTagName(target: TargetRecord, local: string): string {
  const colon = target.syntax.lexicalName.indexOf(":");
  return colon < 0 ? local : `${target.syntax.lexicalName.slice(0, colon)}:${local}`;
}
function checkSelectorResource(selectorValue: SourceCorrectionSelector, sources: Map<string, SourceRecord>): SourceRecord {
  const source = sources.get(selectorValue.uri);
  if (!source || source.digest !== selectorValue.digest) fail("stale-source", "Correction selector resource URI or digest is stale");
  return source;
}
function validateRecipePins(recipe: Recipe, sources: Map<string, SourceRecord>): void {
  if (recipe.resources.length !== sources.size) fail("stale-source", "Recipe must pin every resource in the loaded input union exactly once");
  const seen = new Set<string>();
  for (const pin of recipe.resources) {
    if (seen.has(pin.uri)) fail("invalid-recipe", "Recipe contains a duplicate resource pin");
    seen.add(pin.uri);
    const source = sources.get(pin.uri);
    if (!source || source.digest !== pin.digest) fail("stale-source", "Recipe resource URI/digest does not match the loaded source union");
  }
  if ([...sources.keys()].some(uri => !seen.has(uri))) fail("stale-source", "Recipe omits a resource from the loaded source union");
}
function validateTargetType(qnameValue: Readonly<{namespace: string; local: string}>, targets: Map<string, TargetRecord>): void {
  if (qnameValue.namespace === XSD_NAMESPACE && isBuiltinType(qnameValue.local)) return;
  const exists = [...targets.values()].some(target => target.node.kind === "simpleType" || target.node.kind === "complexType"
    ? target.node.identity.kind === "global" && target.node.identity.name.namespace === qnameValue.namespace && target.node.identity.name.local === qnameValue.local : false);
  if (!exists) fail("unsupported-target", "Inserted element type must refer to an existing named type or XML Schema builtin");
}
function decodedResource(source: SourceRecord, cache: Map<string, string>): string {
  const prior = cache.get(source.uri);
  if (prior !== undefined) return prior;
  const decoded = decodeMetadataXml(source.bytes);
  cache.set(source.uri, decoded);
  return decoded;
}
function validateCorrection(correction: Correction, targets: Map<string, TargetRecord>, sources: Map<string, SourceRecord>, decoded: Map<string, string>, claimed: Set<string>, insertSlots: Set<string>, signal?: AbortSignal, scanBudget: LexicalBudget = {remaining: MAX_LEXICAL_SCAN}): {patches: Map<string, Patch[]>; provenance: {kind: Correction["kind"]; target: SourceCorrectionSelector}} {
  const target = targetFor(correction.target, targets), source = checkSelectorResource(correction.target, sources), node = target.node;
  checkAbort(signal);
  if (correction.kind === "set-occurs") {
    if (node.kind !== "particle") fail("unsupported-target", "set-occurs target must be an XSD particle");
    const set = {minOccurs: correction.min, maxOccurs: correction.max};
    for (const key of ["minOccurs", "maxOccurs"]) {
      const claim = `${selectorKey(correction.target)}:${key}`;
      if (claimed.has(claim)) fail("invalid-recipe", `Conflicting correction for ${key}`);
      claimed.add(claim);
    }
    return {patches: new Map([[source.uri, updateStartTag(decodedResource(source, decoded), target, set, signal, scanBudget)]]), provenance: {kind: correction.kind, target: correction.target}};
  }
  if (correction.kind === "set-wildcard-namespaces") {
    const wildcard = node.kind === "particle" && node.term.kind === "any" ? node.term.wildcard : undefined;
    if (!wildcard) fail("unsupported-target", "Wildcard namespace target must be xs:any");
    // @why Namespace identity uses XSD's XML whitespace rules; JavaScript trim would widen some IRI constraints.
    const charge = (amount = 1) => {
      checkAbort(signal);
      scanBudget.remaining -= amount;
      if (scanBudget.remaining < 0) fail('resource-limit', 'Source correction namespace comparison exceeds its work limit');
    };
    const originalNamespaces = wildcardNamespaces(wildcard, charge);
    if (correction.namespaces.some(namespace => !namespaceAllows(originalNamespaces, namespace, charge))) {
      fail("unsupported-target", "Requested wildcard namespaces would widen the accepted namespace set");
    }
    const encoded = correction.namespaces.map(namespace => namespace === "" ? "##local" : namespace).sort(compareText).join(" ");
    const claim = `${selectorKey(correction.target)}:namespace`;
    if (claimed.has(claim)) fail("invalid-recipe", "Conflicting wildcard namespace corrections");
    claimed.add(claim);
    return {patches: new Map([[source.uri, updateStartTag(decodedResource(source, decoded), target, {namespace: encoded}, signal, scanBudget)]]), provenance: {kind: correction.kind, target: correction.target}};
  }
  if (node.kind !== "particle" || node.term.kind !== "sequence") fail("unsupported-target", "insert-element target must be an xs:sequence particle");
  const xml = decodedResource(source, decoded), freshPrefixes = new Set<string>(), tagName = siblingTagName(target, "element");
  let markup: string;
  if (correction.element.kind === "declaration") {
    validateTargetType(correction.element.type, targets);
    const type = qname(correction.element.type.namespace, correction.element.type.local, node.context.namespaces, freshPrefixes);
    const declaration = type.declaration ? ` ${type.declaration}` : "";
    markup = `<${tagName}${declaration} name="${xmlEscapeAttribute(correction.element.name, "\"")}" type="${xmlEscapeAttribute(type.lexical, "\"")}" minOccurs="${correction.element.min}" maxOccurs="${xmlEscapeAttribute(correction.element.max, "\"")}"/>`;
  } else {
    const referenced = targetFor(correction.element.target, targets).node;
    if (referenced.kind !== "element" || referenced.identity.kind !== "global") fail("unsupported-target", "Inserted ref must target an existing global element");
    const ref = qname(referenced.name.namespace, referenced.name.local, node.context.namespaces, freshPrefixes);
    const declaration = ref.declaration ? ` ${ref.declaration}` : "";
    markup = `<${tagName}${declaration} ref="${xmlEscapeAttribute(ref.lexical, "\"")}" minOccurs="${correction.element.min}" maxOccurs="${correction.element.max}"/>`;
  }
  let position: number, text: string, replacementEnd: number | undefined;
  if (correction.position === "append") {
    const opening = startTag(xml, target.syntax.source.start.offset, signal, scanBudget);
    if (opening.selfClosing) {
      // @why Expanding only the closing token preserves the empty sequence's attributes and namespace context.
      position = opening.close;
      replacementEnd = opening.close + 2;
      text = `>${markup}</${opening.name}>`;
    } else {
      position = closingTagStart(xml, target, signal, scanBudget);
      const indent = indentAt(xml, position, signal);
      text = indent === undefined ? markup : `${markup}\n${indent}`;
    }
  } else {
    const anchor = targetFor(correction.position.target, targets);
    if (anchor.node.kind !== "particle" || anchor.node.term.kind !== "element" || !node.term.children.includes(anchor.node.id)) {
      fail("unsupported-target", "Insertion anchor must be a direct xs:element child of the selected sequence");
    }
    if (anchor.node.context.source.uri !== source.uri || anchor.node.context.source.digest !== source.digest) fail("unsupported-target", "Insertion anchor and sequence must share a source resource");
    if (anchor.ambiguousContext) fail("ambiguous-target", "Insertion anchor source is interpreted under multiple target namespaces");
    if (correction.position.kind === "before") {
      position = anchor.node.context.source.start.offset;
      const indent = indentAt(xml, position, signal);
      text = indent === undefined ? `${markup} ` : `${markup}\n${indent}`;
    } else {
      position = anchor.node.context.source.end.offset;
      const indent = indentAt(xml, position, signal);
      text = indent === undefined ? ` ${markup}` : `\n${indent}${markup}`;
    }
  }
  const slot = `${selectorKey(correction.target)}:${position}`;
  if (insertSlots.has(slot)) fail("invalid-recipe", "Multiple insertions target the same original source position");
  insertSlots.add(slot);
  return {patches: new Map([[source.uri, [{start: position, end: replacementEnd ?? position, text, label: `${node.id}:insert`}]]]), provenance: {kind: correction.kind, target: correction.target}};
}

function applyPatches(original: string, patches: readonly Patch[], signal?: AbortSignal): string {
  const combined = new Map<string, Patch>();
  for (const patch of patches) {
    const key = `${patch.start}:${patch.end}`;
    const prior = combined.get(key);
    if (!prior) {combined.set(key, patch); continue;}
    if (patch.start !== patch.end || !prior.label.endsWith(":attributes") || !patch.label.endsWith(":attributes")) {
      fail("invalid-recipe", "Correction source edits conflict at the same location");
    }
    combined.set(key, {...prior, text: prior.text + patch.text.replace(/^\s+/, " ")});
  }
  const sorted = [...combined.values()].sort((a, b) => a.start - b.start || a.end - b.end || compareText(a.label, b.label));
  let previousEnd = 0;
  const chunks: string[] = [];
  for (const patch of sorted) {
    checkAbort(signal);
    if (patch.start < previousEnd || patch.end < patch.start || patch.end > original.length) fail("invalid-recipe", "Correction source spans overlap or exceed the original resource");
    chunks.push(original.slice(previousEnd, patch.start), patch.text);
    previousEnd = patch.end;
  }
  chunks.push(original.slice(previousEnd));
  return chunks.join("");
}
function utf8Output(text: string, original: Uint8Array): Uint8Array {
  let output = text;
  const declarationEnd = output.startsWith("\uFEFF") ? 1 : 0;
  const declaration = /^<\?xml\b[^?]*\?>/i.exec(output.slice(declarationEnd));
  if (declaration) {
    const updated = declaration[0].replace(/(\bencoding\s*=\s*)(['"])[^'"]*\2/i, "$1$2UTF-8$2");
    output = output.slice(0, declarationEnd) + updated + output.slice(declarationEnd + declaration[0].length);
  }
  const bytes = new TextEncoder().encode(output), hasBom = original[0] === 0xef && original[1] === 0xbb && original[2] === 0xbf || original[0] === 0xfe && original[1] === 0xff || original[0] === 0xff && original[1] === 0xfe;
  if (!hasBom) return bytes;
  return Uint8Array.from([0xef, 0xbb, 0xbf, ...bytes]);
}
function canonicalRecipeDigest(recipe: Recipe): string {
  const normalized = {version: recipe.version, resources: [...recipe.resources].sort((a, b) => compareText(a.uri, b.uri)), corrections: recipe.corrections};
  return sha256(JSON.stringify(normalized));
}

/** Validate and apply a versioned correction recipe to an authenticated source union. */
export function prepareCorrectedSourceInputs(inputs: readonly SchemaInput[], recipeValue: unknown, signal?: AbortSignal): PreparedCorrectedSourceInputs {
  checkAbort(signal);
  const recipe = parseRecipe(recipeValue, signal), {inventory, targets, sources, aliases} = targetMap(inputs, signal);
  validateRecipePins(recipe, sources);
  const patches = new Map<string, Patch[]>(), decoded = new Map<string, string>(), claimed = new Set<string>(), insertSlots = new Set<string>();
  const scanBudget: LexicalBudget = {remaining: MAX_LEXICAL_SCAN};
  const provenanceCorrections: Array<{kind: Correction["kind"]; target: SourceCorrectionSelector}> = [];
  for (const correction of recipe.corrections) {
    checkAbort(signal);
    const result = validateCorrection(correction, targets, sources, decoded, claimed, insertSlots, signal, scanBudget);
    for (const [uri, values] of result.patches) {
      const list = patches.get(uri) ?? []; list.push(...values); patches.set(uri, list);
    }
    provenanceCorrections.push(result.provenance);
  }
  const resources = new Map<string, OfflineSchemaResource>(), provenanceResources: Array<{uri: string; originalDigest: string; effectiveDigest: string; changed: boolean}> = [];
  let effectiveBytesTotal = 0;
  let outputGrowth = 0;
  const outputLimit = Math.min(...inputs.map(input => input.limits.totalBytes)), singleLimit = Math.min(...inputs.map(input => input.limits.resourceBytes));
  for (const source of [...sources.values()].sort((a, b) => compareText(a.uri, b.uri))) {
    checkAbort(signal);
    const edits = patches.get(source.uri) ?? [];
    const originalText = edits.length ? decodedResource(source, decoded) : "";
    const updated = edits.length ? applyPatches(originalText, edits, signal) : "";
    const bytes = edits.length && updated !== originalText ? utf8Output(updated, source.bytes) : source.bytes;
    if (bytes.byteLength > singleLimit) fail("resource-limit", "Corrected XML resource exceeds its byte limit");
    effectiveBytesTotal += bytes.byteLength;
    if (effectiveBytesTotal > outputLimit) fail("resource-limit", "Corrected source union exceeds its total byte limit");
    outputGrowth += Math.max(0, bytes.byteLength - source.bytes.byteLength);
    if (outputGrowth > MAX_OUTPUT_GROWTH) fail("resource-limit", "Correction output growth exceeds the limit");
    const effectiveDigest = sha256(bytes), changed = effectiveDigest !== source.digest;
    const resource = Object.freeze({bytes: new Uint8Array(bytes), digest: effectiveDigest});
    resources.set(source.uri, resource);
    for (const alias of source.aliases) if (alias !== source.uri) resources.set(alias, Object.freeze({bytes: resource.bytes, digest: resource.digest, canonicalUri: source.uri}));
    provenanceResources.push(Object.freeze({uri: source.uri, originalDigest: source.digest, effectiveDigest, changed}));
  }
  for (const [alias, canonical] of aliases.entries()) {
    const direct = sources.get(alias), actual = sources.get(canonical);
    if (!actual) fail("stale-source", "Offline alias lost its canonical source resource");
    if (direct && alias !== canonical && (direct.digest !== actual.digest || !Buffer.from(direct.bytes).equals(Buffer.from(actual.bytes)))) {
      fail("ambiguous-target", "A schema alias conflicts with another canonical resource URI");
    }
  }
  const provenance: SourceCorrectionProvenance = Object.freeze({version: 1, canonicalRecipeDigest: canonicalRecipeDigest(recipe),
    resources: Object.freeze(provenanceResources), corrections: Object.freeze(provenanceCorrections.map(item => Object.freeze(item)))});
  return Object.freeze({inventory, resources, provenance});
}
