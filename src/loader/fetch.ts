/**
 * WSDL Document Fetcher
 *
 * This module provides utilities for fetching WSDL and XSD documents from either
 * HTTP/HTTPS URLs or local file paths. It handles relative paths intelligently by
 * resolving them against the referring document, which is crucial for processing XSD
 * imports and includes with relative paths.
 *
 * The fetcher supports:
 * - HTTP/HTTPS URLs (using the global fetch API)
 * - Absolute file paths
 * - Relative file paths (resolved against an optional base path)
 */

import fs from "node:fs";
import path from "node:path";

export function isHttpUrl(source: string): boolean {
  return /^https?:/i.test(source);
}

/**
 * Fetches text content from a URL or file path
 *
 * This function retrieves the content of a WSDL or XSD document from either
 * a remote URL or a local file path. It handles:
 *
 * - HTTP/HTTPS URLs (using the global fetch API with appropriate XML headers)
 * - Absolute local file paths
 * - Relative paths (resolved against the provided base path)
 *
 * This is a key component for resolving schema imports and includes, which may
 * use relative paths to reference other schema documents.
 *
 * @param {string} urlOrPath - URL or file path to fetch
 * @param {string} [base] - URL or file path of the document that references this resource
 * @returns {Promise<{uri: string, text: string}>} - Effective HTTP URL or resolved file path and text content
 * @throws {Error} - If a remote reference is invalid, the HTTP request fails, or the file cannot be read
 */
export async function fetchText(urlOrPath: string, base?: string): Promise<{ uri: string; text: string }> {
  let uri = urlOrPath;
  if (base && !isHttpUrl(uri)) {
    if (isHttpUrl(base)) {
      uri = new URL(uri, base).href;
      if (!isHttpUrl(uri)) throw new Error(`Expected an HTTP(S) reference from ${base}: ${urlOrPath}`);
    } else if (!path.isAbsolute(uri)) {
      uri = path.resolve(path.dirname(base), uri);
    }
  }
  if (isHttpUrl(uri)) {
    const res = await fetch(uri, {headers: {Accept: "application/xml,text/xml,*/*"}});
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${uri}`);
    const text = await res.text();
    return {uri: res.url || uri, text};
  } else {
    const text = fs.readFileSync(uri, "utf8");
    return {uri, text};
  }
}
