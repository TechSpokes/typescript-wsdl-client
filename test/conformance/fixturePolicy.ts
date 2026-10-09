import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, isAbsolute, join, relative, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {parseOrderedSyntax, syntaxAttribute, syntaxElements, XSD_NAMESPACE, WSDL_NAMESPACE} from "../../src/loader/orderedSyntax.js";
import type {SyntaxElement} from "../../src/loader/orderedSyntax.js";

const conformanceDir = dirname(fileURLToPath(import.meta.url));

export const fixturesRoot = resolve(conformanceDir, "fixtures");

export function isWithinRoot(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const rel = relative(rootPath, candidatePath);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function resolveUnder(root: string, relativePath: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(relativePath) || isAbsolute(relativePath)) {
    throw new Error(`Path ${relativePath} must be relative to ${root}.`);
  }

  const resolved = resolve(root, relativePath);
  if (!isWithinRoot(root, resolved)) {
    throw new Error(`Path ${relativePath} resolves outside ${root}.`);
  }

  return resolved;
}

export function readFileUnder(root: string, relativePath: string): string {
  return readFileSync(resolveUnder(root, relativePath), "utf8");
}

export function collectXmlFixtures(root = fixturesRoot): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, {withFileTypes: true})) {
    const entryPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectXmlFixtures(entryPath));
    } else if (/\.(wsdl|xsd)$/i.test(entry.name)) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export function validateConformanceFixtureGraph(entryPath: string, root = fixturesRoot): void {
  const resolvedRoot = resolve(root);
  const resolvedEntry = resolve(entryPath);
  if (!isWithinRoot(resolvedRoot, resolvedEntry)) {
    throw new Error(`Conformance fixture ${resolvedEntry} is outside ${resolvedRoot}.`);
  }
  if (!existsSync(resolvedEntry)) {
    throw new Error(`Conformance fixture is missing: ${resolvedEntry}`);
  }

  const visited = new Set<string>();
  validateXmlDocument(resolvedEntry, resolvedRoot, visited);
}

export function validateAllConformanceFixtureGraphs(root = fixturesRoot): void {
  for (const fixture of collectXmlFixtures(root)) {
    validateConformanceFixtureGraph(fixture, root);
  }
}

function validateXmlDocument(filePath: string, root: string, visited: Set<string>): void {
  if (visited.has(filePath)) {
    return;
  }
  visited.add(filePath);

  const parsed = parseOrderedSyntax(readFileSync(filePath), pathToFileURL(filePath).href);
  for (const {location, baseUri} of collectSchemaLocations(parsed.root)) {
    const importedPath = resolveSchemaLocation(filePath, location, baseUri, root);
    validateXmlDocument(importedPath, root, visited);
  }
}

function resolveSchemaLocation(sourceFile: string, schemaLocation: string, baseUri: string, root: string): string {
  if (/^https?:\/\//i.test(schemaLocation)) {
    throw new Error(`Conformance fixture ${sourceFile} imports external URL ${schemaLocation}.`);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(schemaLocation) || isAbsolute(schemaLocation)) {
    throw new Error(`Conformance fixture ${sourceFile} imports absolute path ${schemaLocation}.`);
  }

  const effective = new URL(schemaLocation, baseUri);
  if (effective.protocol !== "file:") throw new Error(`Conformance fixture ${sourceFile} imports external URL through xml:base.`);
  const resolved = fileURLToPath(effective);
  if (!isWithinRoot(root, resolved)) {
    throw new Error(`Conformance fixture ${sourceFile} imports outside fixture root: ${schemaLocation}.`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`Conformance fixture ${sourceFile} imports missing schema ${schemaLocation}.`);
  }

  return resolved;
}

function collectSchemaLocations(root: SyntaxElement): {location: string; baseUri: string}[] {
  const locations: {location: string; baseUri: string}[] = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    const schemaReference = node.name.namespace === XSD_NAMESPACE && ["import", "include"].includes(node.name.local);
    const wsdlReference = node.name.namespace === WSDL_NAMESPACE && node.name.local === "import";
    const location = schemaReference ? syntaxAttribute(node, "schemaLocation") : wsdlReference ? syntaxAttribute(node, "location") : undefined;
    if (location) locations.push({location, baseUri: node.baseUri});
    pending.push(...syntaxElements(node));
  }
  return locations;
}
