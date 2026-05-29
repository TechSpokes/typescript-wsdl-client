import fs from "node:fs";
import path from "node:path";

const IGNORED_EXAMPLE_FILES = new Set(["README.md"]);

function normalizeRelativePath(relativePath) {
  return relativePath.replace(/\\/g, "/");
}

function collectFiles(dir, relativePath = "") {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(path.join(dir, relativePath), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(dir, child));
    } else {
      files.push(normalizeRelativePath(child));
    }
  }
  return files.sort();
}

function isInsideRoot(root, value) {
  const relative = path.relative(root, value);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function normalizeRepoPath(value, root) {
  if (typeof value !== "string") return value;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return value;

  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
  if (isInsideRoot(root, resolved)) {
    return normalizeRelativePath(path.relative(root, resolved));
  }
  return normalizeRelativePath(value);
}

function normalizeCatalogJson(content, root) {
  const catalog = JSON.parse(content);
  if (catalog.options && typeof catalog.options === "object") {
    if (Object.hasOwn(catalog.options, "out")) {
      catalog.options.out = "<OUTPUT_DIR>";
    }
    if (Object.hasOwn(catalog.options, "wsdl")) {
      catalog.options.wsdl = normalizeRepoPath(catalog.options.wsdl, root);
    }
  }
  if (Object.hasOwn(catalog, "wsdlUri")) {
    catalog.wsdlUri = normalizeRepoPath(catalog.wsdlUri, root);
  }
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

function readComparableFile(filePath, relativePath, root) {
  if (relativePath === "client/catalog.json") {
    return Buffer.from(normalizeCatalogJson(fs.readFileSync(filePath, "utf-8"), root), "utf-8");
  }
  return fs.readFileSync(filePath);
}

export function findExampleDrift(leftDir, rightDir, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const files = new Set([...collectFiles(leftDir), ...collectFiles(rightDir)]);
  const diffs = [];

  for (const relativePath of [...files].sort()) {
    if (IGNORED_EXAMPLE_FILES.has(relativePath)) continue;

    const leftPath = path.join(leftDir, ...relativePath.split("/"));
    const rightPath = path.join(rightDir, ...relativePath.split("/"));
    const leftExists = fs.existsSync(leftPath);
    const rightExists = fs.existsSync(rightPath);
    if (leftExists !== rightExists) {
      diffs.push(relativePath);
      continue;
    }

    const leftContent = readComparableFile(leftPath, relativePath, root);
    const rightContent = readComparableFile(rightPath, relativePath, root);
    if (!leftContent.equals(rightContent)) {
      diffs.push(relativePath);
    }
  }

  return diffs;
}
