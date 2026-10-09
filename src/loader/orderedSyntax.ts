/** Ordered XML syntax boundary for the unreleased faithful compiler. */
import {createHash} from "node:crypto";
import {SaxesParser} from "saxes";

export const XML_NAMESPACE = "http://www.w3.org/XML/1998/namespace";
export const XSD_NAMESPACE = "http://www.w3.org/2001/XMLSchema";
export const WSDL_NAMESPACE = "http://schemas.xmlsoap.org/wsdl/";
export const DEFAULT_SYNTAX_DEPTH = 256;

export type ExpandedName = Readonly<{namespace: string; local: string}>;
export type SourcePosition = Readonly<{offset: number; line: number; column: number}>;
export type SyntaxSource = Readonly<{
  uri: string;
  digest: string;
  path: string;
  start: SourcePosition;
  end: SourcePosition;
}>;
export type SyntaxAttribute = Readonly<{
  name: ExpandedName;
  lexicalName: string;
  value: string;
}>;
export type SyntaxText = Readonly<{kind: "text"; value: string; source: SyntaxSource}>;
export type SyntaxElement = Readonly<{
  kind: "element";
  name: ExpandedName;
  lexicalName: string;
  attributes: readonly SyntaxAttribute[];
  namespaces: Readonly<Record<string, string>>;
  baseUri: string;
  children: readonly SyntaxNode[];
  source: SyntaxSource;
}>;
export type SyntaxNode = SyntaxElement | SyntaxText;
export type SyntaxDocument = Readonly<{uri: string; digest: string; root: SyntaxElement}>;

export type LoadingErrorCategory = "invalid-schema" | "unsupported-capability" | "resource-limit" | "transport";
export class SchemaLoadingError extends Error {
  constructor(readonly category: LoadingErrorCategory, message: string, readonly source?: SyntaxSource) {
    super(message);
    this.name = "SchemaLoadingError";
  }
}

export function syntaxAttribute(node: SyntaxElement, local: string, namespace = ""): string | undefined {
  return node.attributes.find(a => a.name.local === local && a.name.namespace === namespace)?.value;
}

export function syntaxElements(node: SyntaxElement, namespace?: string, local?: string): SyntaxElement[] {
  return node.children.filter((n): n is SyntaxElement => n.kind === "element"
    && (namespace === undefined || n.name.namespace === namespace)
    && (local === undefined || n.name.local === local));
}

// XML 1.0 (fifth edition) NCName; QName values use default namespaces, attributes do not.
const ncStart = "A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const ncName = new RegExp(`^[${ncStart}][${ncStart}\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`, "u");
export function resolveLexicalQName(lexical: string, node: SyntaxElement): ExpandedName {
  const parts = lexical.replace(/^[\t\r\n ]+|[\t\r\n ]+$/g, "").split(":");
  if (parts.length > 2 || parts.some(p => !ncName.test(p))) {
    throw new SchemaLoadingError("invalid-schema", "Invalid lexical QName", node.source);
  }
  const prefix = parts.length === 2 ? parts[0] : "";
  const namespace = node.namespaces[prefix];
  if (prefix && !namespace) throw new SchemaLoadingError("invalid-schema", "Unbound QName prefix", node.source);
  return Object.freeze({namespace: namespace ?? "", local: parts.at(-1)!});
}

function decodeXml(bytes: Uint8Array): string {
  const encoding = bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le"
    : bytes[0] === 0xfe && bytes[1] === 0xff ? "utf-16be" : "utf-8";
  try {
    const text = new TextDecoder(encoding, {fatal: true}).decode(bytes);
    const declared = /^<\?xml\s[^?]*encoding\s*=\s*["']([^"']+)["']/i.exec(text)?.[1].toLowerCase();
    if (declared && !(encoding === "utf-8" ? ["utf-8", "utf8"] : ["utf-16", encoding]).includes(declared)) {
      throw new SchemaLoadingError("unsupported-capability", "Unsupported XML byte encoding");
    }
    return text;
  } catch (error) {
    if (error instanceof SchemaLoadingError) throw error;
    throw new SchemaLoadingError("invalid-schema", "Invalid XML byte encoding");
  }
}

/** Positions are one-based lines/columns and zero-based UTF-16 offsets in decoded XML. */
export function parseOrderedSyntax(bytes: Uint8Array, uri: string, options: {maxDepth?: number} = {}): SyntaxDocument {
  const maxDepth = options.maxDepth ?? DEFAULT_SYNTAX_DEPTH;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 1) throw new RangeError("maxDepth must be a positive safe integer");
  try { new URL(uri); } catch { throw new SchemaLoadingError("invalid-schema", "An absolute source URI is required"); }
  const digest = createHash("sha256").update(bytes).digest("hex");
  const text = decodeXml(bytes);
  const lines = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\r") { if (text[i + 1] === "\n") i++; lines.push(i + 1); }
    else if (text[i] === "\n") lines.push(i + 1);
  }
  const position = (offset: number): SourcePosition => {
    let low = 0, high = lines.length;
    while (low + 1 < high) { const mid = (low + high) >>> 1; if (lines[mid] <= offset) low = mid; else high = mid; }
    return Object.freeze({offset, line: low + 1, column: offset - lines[low] + 1});
  };
  const source = (path: string, start: number, end: number): SyntaxSource => Object.freeze({uri, digest, path, start: position(start), end: position(end)});
  type Building = Omit<SyntaxElement, "children" | "source"> & {children: SyntaxNode[]; source: SyntaxSource};
  const stack: Building[] = [];
  let root: SyntaxElement | undefined;
  let tagStart = 0, cursor = 0;
  const parser = new SaxesParser({xmlns: true});
  const fail = (category: LoadingErrorCategory, message: string): never => {
    throw new SchemaLoadingError(category, message, source(stack.at(-1)?.source.path ?? "/0", tagStart, parser.position));
  };
  parser.on("error", () => fail("invalid-schema", "Malformed XML or unresolved entity reference"));
  parser.on("doctype", () => fail("unsupported-capability", "DTDs and entity declarations are forbidden"));
  parser.on("opentagstart", () => { tagStart = text.lastIndexOf("<", parser.position - 1); });
  parser.on("opentag", tag => {
    if (stack.length >= maxDepth) fail("resource-limit", `XML syntax depth exceeds ${maxDepth} elements`);
    const parent = stack.at(-1);
    const attributes = Object.values(tag.attributes).filter(a => a.uri !== "http://www.w3.org/2000/xmlns/")
      .map(a => Object.freeze({name: Object.freeze({namespace: a.uri, local: a.local}), lexicalName: a.name, value: a.value}));
    const namespaces = Object.freeze(Object.assign(Object.create(null), parent?.namespaces ?? {xml: XML_NAMESPACE, "": ""}, tag.ns));
    const base = attributes.find(a => a.name.namespace === XML_NAMESPACE && a.name.local === "base")?.value;
    let baseUri: string;
    try { baseUri = new URL(base ?? "", parent?.baseUri ?? uri).href; }
    catch { return fail("invalid-schema", "Invalid xml:base URI"); }
    const node: Building = {kind: "element", name: Object.freeze({namespace: tag.uri, local: tag.local}), lexicalName: tag.name,
      attributes: Object.freeze(attributes), namespaces, baseUri, children: [], source: source(parent ? `${parent.source.path}/${parent.children.length}` : "/0", tagStart, parser.position)};
    if (parent) parent.children.push(node);
    else root = node;
    stack.push(node);
    cursor = parser.position;
  });
  const appendText = (value: string, start: number, end: number) => {
    const parent = stack.at(-1);
    if (parent) parent.children.push(Object.freeze({kind: "text", value, source: source(`${parent.source.path}/${parent.children.length}`, start, end)}));
  };
  parser.on("text", value => { const end = text[parser.position - 1] === "<" ? parser.position - 1 : parser.position; appendText(value, cursor, end); cursor = end; });
  parser.on("cdata", value => { appendText(value, cursor + 9, parser.position - 3); cursor = parser.position; });
  parser.on("comment", () => { cursor = parser.position; });
  parser.on("processinginstruction", () => { cursor = parser.position; });
  parser.on("closetag", () => {
    const node = stack.pop()!;
    node.source = source(node.source.path, node.source.start.offset, parser.position);
    Object.freeze(node.children);
    Object.freeze(node);
    cursor = parser.position;
  });
  parser.write(text).close();
  if (!root) fail("invalid-schema", "Missing XML root element");
  return Object.freeze({uri, digest, root: root!});
}
