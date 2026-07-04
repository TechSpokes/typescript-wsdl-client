import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

export function repoPath(root, filePath) {
  return toPosix(path.relative(root, filePath));
}

export async function readTextFile(filePath) {
  return readFile(filePath, { encoding: "utf8" });
}

/**
 * Reads a file as Node binary data.
 *
 * @param {string} filePath - File path to read.
 * @returns {Promise<Buffer>} Buffer returned by Node `fs.readFile`.
 */
export async function readBinaryFile(filePath) {
  return readFile(filePath);
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readTextFile(filePath));
}

export async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function listFiles(root, options = {}) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  const sortRoot = options.sortRoot ?? root;

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath, { sortRoot }));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => repoPath(sortRoot, left).localeCompare(repoPath(sortRoot, right)));
}
