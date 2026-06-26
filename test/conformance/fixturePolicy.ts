import {existsSync, readFileSync, readdirSync} from "node:fs";
import {dirname, isAbsolute, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {XMLParser} from "fast-xml-parser";

const parser = new XMLParser({ignoreAttributes: false, attributeNamePrefix: "@_"});
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

  const xml = readFileSync(filePath, "utf8");
  const parsed = parser.parse(xml);
  for (const schemaLocation of collectSchemaLocations(parsed)) {
    const importedPath = resolveSchemaLocation(filePath, schemaLocation, root);
    validateXmlDocument(importedPath, root, visited);
  }
}

function resolveSchemaLocation(sourceFile: string, schemaLocation: string, root: string): string {
  if (/^https?:\/\//i.test(schemaLocation)) {
    throw new Error(`Conformance fixture ${sourceFile} imports external URL ${schemaLocation}.`);
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(schemaLocation) || isAbsolute(schemaLocation)) {
    throw new Error(`Conformance fixture ${sourceFile} imports absolute path ${schemaLocation}.`);
  }

  const resolved = resolve(dirname(sourceFile), schemaLocation);
  if (!isWithinRoot(root, resolved)) {
    throw new Error(`Conformance fixture ${sourceFile} imports outside fixture root: ${schemaLocation}.`);
  }
  if (!existsSync(resolved)) {
    throw new Error(`Conformance fixture ${sourceFile} imports missing schema ${schemaLocation}.`);
  }

  return resolved;
}

function collectSchemaLocations(value: unknown): string[] {
  const locations: string[] = [];

  if (Array.isArray(value)) {
    for (const item of value) {
      locations.push(...collectSchemaLocations(item));
    }
    return locations;
  }

  if (!value || typeof value !== "object") {
    return locations;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const local = key.includes(":") ? key.split(":").pop() : key;
    if ((local === "import" || local === "include") && child && typeof child === "object") {
      for (const node of Array.isArray(child) ? child : [child]) {
        const loc = (node as Record<string, unknown>)["@_schemaLocation"];
        if (typeof loc === "string" && loc.length > 0) {
          locations.push(loc);
        }
      }
    }
    locations.push(...collectSchemaLocations(child));
  }

  return locations;
}
