/**
 * Utility Functions for TypeScript WSDL Client Generator
 *
 * This module provides a collection of helper functions used throughout the codebase
 * for common tasks such as:
 *
 * - XML node processing and traversal
 * - Name formatting and conversion between different cases
 * - QName (qualified name) resolution with namespace handling
 * - Array normalization and manipulation
 * - Client name derivation from various sources
 *
 * These utilities create a consistent approach to handling common operations across
 * the different modules of the generator.
 */
import type {CompiledCatalog} from "../compiler/schemaCompiler.js";

/**
 * Normalizes a possibly-single value into an array
 *
 * XML parsers often return single items directly and multiple items as arrays.
 * This function ensures consistent array treatment regardless of the input.
 *
 * @template T - Type of the array elements
 * @param {T|T[]|undefined|null} x - Value to normalize
 * @returns {T[]} - Array containing the value(s) or empty array if null/undefined
 */
export function normalizeArray<T>(x: T | T[] | undefined | null): T[] {
  if (x == null) return [];
  return Array.isArray(x) ? x : [x];
}

/**
 * Collects direct children whose local name matches (prefix-agnostic)
 *
 * XML namespaces can cause the same element to appear with different prefixes.
 * This function finds elements by their local name, ignoring namespace prefixes.
 *
 * @param {any} node - Parent XML node to search within
 * @param {string} local - Local name to match (without namespace prefix)
 * @returns {any[]} - Array of matching child nodes
 */
export function getChildrenWithLocalName(node: any, local: string): any[] {
  const out: any[] = [];
  for (const [k, v] of Object.entries(node || {})) {
    if (k === local || k.endsWith(`:${local}`)) {
      const arr = Array.isArray(v) ? v : [v];
      out.push(...arr.filter(Boolean));
    }
  }
  return out;
}

/**
 * Returns the first direct child whose local name matches (prefix-agnostic)
 *
 * Similar to getChildrenWithLocalName but returns only the first matching node.
 * Useful for elements that should appear only once in a valid document.
 *
 * @param {any} node - Parent XML node to search within
 * @param {string} local - Local name to match (without namespace prefix)
 * @returns {any|undefined} - First matching child node or undefined if none found
 */
export function getFirstWithLocalName(node: any, local: string): any | undefined {
  for (const [k, v] of Object.entries(node || {})) {
    if (k === local || k.endsWith(`:${local}`)) return v;
  }
  return undefined;
}

/**
 * Converts a string to PascalCase format for TypeScript type names
 *
 * This function handles various input formats and produces valid TypeScript identifiers:
 * - Converts separators (spaces, dashes, dots, etc.) to camelCase boundaries
 * - Preserves underscores as literal characters
 * - Removes invalid identifier characters
 * - Ensures the result is a valid TypeScript identifier (not starting with numbers)
 * - Avoids collision with TypeScript reserved keywords
 *
 * @param {string} s - Input string to convert to PascalCase
 * @returns {string} - Valid TypeScript identifier in PascalCase
 */
export function pascal(s: string): string {
  const raw = String(s ?? "");
  // Split on underscores to preserve them literally
  const segments = raw.split("_");
  const cased = segments.map(seg => {
    // Uppercase letters after common separators (start, space, dash, dot, colon, slash)
    const up = seg.replace(/(^|[-\s.:\/])([A-Za-z0-9_$])/g, (_m, _sep, c) => String(c).toUpperCase());
    // Remove disallowed identifier characters but preserve A-Z, a-z, 0-9, _ and $
    return up.replace(/[^A-Za-z0-9_$]/g, "");
  });
  let out = cased.join("_");
  if (!out) out = "_"; // fallback
  if (/^[0-9]/.test(out)) out = `_${out}`; // ensure valid identifier start

  // guard against TypeScript reserved keywords when the identifier equals them exactly
  const reserved = [
    "break", "case", "catch", "class", "const", "continue", "debugger", "default", "delete",
    "do", "else", "enum", "export", "extends", "false", "finally", "for", "function", "if",
    "import", "in", "instanceof", "new", "null", "return", "super", "switch", "this", "throw",
    "true", "try", "typeof", "var", "void", "while", "with", "as", "implements", "interface",
    "let", "package", "private", "protected", "public", "static", "yield", "any", "boolean",
    "constructor", "declare", "get", "module", "require", "number", "set", "string", "symbol",
    "type", "from", "of"
  ];
  const lower = out.toLowerCase();
  if (reserved.includes(lower)) {
    out = `_${out}`;
  }
  return out;
}

/**
 * Resolves a qualified name (QName) to its namespace and local parts
 *
 * XML uses qualified names (prefix:localName) to reference elements in namespaces.
 * This function resolves the prefix to its full namespace URI using the provided prefixes map.
 *
 * @param {string} qname - Qualified name (e.g., "xs:string" or "myPrefix:elementName")
 * @param {string} defaultNS - Default namespace to use if no prefix is present
 * @param {Record<string, string>} prefixes - Map of namespace prefixes to full URIs
 * @returns {{ns: string, local: string}} - Object containing namespace URI and local name
 */
export function resolveQName(
  qname: string,
  defaultNS: string,
  prefixes: Record<string, string>
): { ns: string; local: string } {
  if (!qname) return {ns: defaultNS, local: ""};
  const parts = qname.split(":");
  if (parts.length === 2) {
    const [prefix, local] = parts;
    const ns = prefixes[prefix] || defaultNS;
    return {ns, local};
  }
  return {ns: defaultNS, local: qname};
}

/**
 * Derives a SOAP client class name from various sources
 *
 * This function uses a hierarchy of sources to determine an appropriate class name:
 * 1. Explicit override from compiler options (highest priority)
 * 2. Service name from the WSDL document
 * 3. WSDL filename without extension
 * 4. Default fallback name ("GeneratedSOAPClient")
 *
 * @param {CompiledCatalog} compiled - The compiled WSDL catalog
 * @returns {string} - Appropriate class name for the generated SOAP client
 */
export function deriveClientName(
  compiled: CompiledCatalog
): string {
  const overrideName = (compiled.options.clientName || "").trim();
  const svcName = compiled.serviceName ? pascal(compiled.serviceName) : "";
  const fileBase = (() => {
    const uri = compiled.wsdlUri || "";
    const seg = uri.split(/[\\/]/).pop() || "";
    const noExt = seg.replace(/\.[^.]+$/, "");
    return noExt ? pascal(noExt) : "";
  })();
  return overrideName
    || ((svcName || fileBase) ? `${svcName || fileBase}` : "GeneratedSOAPClient");
}

/**
 * Explodes a PascalCase string into its constituent segments
 *
 * This function breaks a PascalCase identifier into individual words
 * by inserting underscores at camelCase transitions and then splitting.
 *
 * @param {string} s - PascalCase string to explode
 * @returns {string[]} - Array of individual segments
 */
export function explodePascal(s: string): string[] {
  // insert underscores between camel‐transitions
  const withUnderscores = String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2');
  return withUnderscores.split('_').filter(Boolean);
}

/**
 * Convert a PascalCase string to snake_case (lowercase + underscores).
 *
 * This function takes a PascalCase string, explodes it into its component segments,
 * converts each segment to lowercase, and joins them with underscores to form a
 * snake_case string.
 *
 * @param {string} s - PascalCase string to convert
 * @returns {string} - snake_case version of the input string
 */
export function pascalToSnakeCase(s: string): string {
  return explodePascal(s)
    .map(seg => seg.toLowerCase())
    .join('_');
}
