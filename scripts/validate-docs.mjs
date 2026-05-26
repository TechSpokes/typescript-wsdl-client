#!/usr/bin/env node

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const markdownRoots = ["docs", "examples", "agent-skill", ".github"];
const excludedDirectories = new Set(["node_modules", "dist", "tmp", ".git", "client", "gateway", "app"]);
const skippedTargetPattern = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function formatRelativePath(repoRoot, filePath) {
  const relativePath = path.relative(repoRoot, filePath);
  return toPosixPath(relativePath === "" ? path.basename(filePath) : relativePath);
}

function sortErrors(errors) {
  return [...errors].sort((left, right) => {
    if (left.file < right.file) {
      return -1;
    }
    if (left.file > right.file) {
      return 1;
    }

    const lineCompare = left.line - right.line;
    if (lineCompare !== 0) {
      return lineCompare;
    }

    return left.message.localeCompare(right.message);
  });
}

function stripLinkTitle(rawTarget) {
  const trimmed = rawTarget.trim();
  const angleMatch = trimmed.match(/^<([^>]+)>/);
  if (angleMatch) {
    return angleMatch[1];
  }

  const titleMatch = trimmed.match(/^(\S+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?$/);
  return titleMatch?.[1] ?? trimmed;
}

function splitTarget(target) {
  const hashIndex = target.indexOf("#");
  if (hashIndex === -1) {
    return { fragment: "", targetPath: target };
  }

  return {
    fragment: target.slice(hashIndex + 1),
    targetPath: target.slice(0, hashIndex),
  };
}

function decodeLocalPath(targetPath) {
  try {
    return decodeURIComponent(targetPath);
  } catch {
    return targetPath;
  }
}

export function slugifyHeading(heading) {
  return heading
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .replace(/\s+#+\s*$/, "")
    .replace(/`([^`]*)`/g, "$1")
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function collectAnchors(markdown) {
  const anchors = new Set();
  const seen = new Map();
  const headingPattern = /^\s{0,3}#{1,6}\s+(.+)$/;

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(headingPattern);
    if (!match) {
      continue;
    }

    const baseSlug = slugifyHeading(match[0]);
    const count = seen.get(baseSlug) ?? 0;
    seen.set(baseSlug, count + 1);
    anchors.add(count === 0 ? baseSlug : `${baseSlug}-${count}`);
  }

  return anchors;
}

export function extractMarkdownLinks(markdown) {
  const links = [];
  let inFence = false;
  const lines = markdown.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      continue;
    }

    const linkPattern = /(!?)\[[^\]]*]\(([^)]+)\)/g;
    for (const match of line.matchAll(linkPattern)) {
      if (match[1] === "!") {
        continue;
      }

      links.push({
        line: index + 1,
        target: stripLinkTitle(match[2]),
      });
    }
  }

  return links;
}

export function extractCodeFences(markdown) {
  const fences = [];
  const lines = markdown.split(/\r?\n/);
  let activeFence = null;

  for (const [index, line] of lines.entries()) {
    const fenceMatch = line.match(/^\s*```([^\s`]*)\s*$/);
    if (!fenceMatch) {
      if (activeFence) {
        activeFence.codeLines.push(line);
      }
      continue;
    }

    if (activeFence) {
      fences.push({
        code: activeFence.codeLines.join("\n"),
        language: activeFence.language,
        line: activeFence.line,
      });
      activeFence = null;
      continue;
    }

    activeFence = {
      codeLines: [],
      language: fenceMatch[1] ?? "",
      line: index + 1,
    };
  }

  if (activeFence) {
    fences.push({
      code: activeFence.codeLines.join("\n"),
      language: activeFence.language,
      line: activeFence.line,
    });
  }

  return fences;
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function validateLink({ fileDir, filePath, link, markdownCache, repoRoot }) {
  const target = link.target;
  if (target === "" || skippedTargetPattern.test(target)) {
    return [];
  }

  const { fragment, targetPath } = splitTarget(target);
  const resolvedPath = targetPath === ""
    ? filePath
    : path.resolve(fileDir, decodeLocalPath(targetPath));
  const displayFile = formatRelativePath(repoRoot, filePath);
  const errors = [];

  let targetStats;
  try {
    targetStats = await stat(resolvedPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    errors.push({
      file: displayFile,
      line: link.line,
      message: `links to missing file: ${target}`,
    });
    return errors;
  }

  if (targetStats.isDirectory()) {
    const readmePath = path.join(resolvedPath, "README.md");
    if (await pathExists(readmePath)) {
      errors.push({
        file: displayFile,
        line: link.line,
        message: `links to directory; use ${toPosixPath(path.relative(fileDir, readmePath))}`,
      });
      return errors;
    }

    errors.push({
      file: displayFile,
      line: link.line,
      message: `links to directory without README.md: ${target}`,
    });
    return errors;
  }

  if (fragment === "") {
    return errors;
  }

  const targetMarkdown = await readMarkdownFromCache(markdownCache, resolvedPath);
  const anchors = collectAnchors(targetMarkdown);
  const decodedFragment = decodeLocalPath(fragment);
  if (!anchors.has(decodedFragment)) {
    errors.push({
      file: displayFile,
      line: link.line,
      message: `links to missing heading: ${target}`,
    });
  }

  return errors;
}

async function readMarkdownFromCache(cache, filePath) {
  const key = path.resolve(filePath);
  const existing = cache.get(key);
  if (existing !== undefined) {
    return existing;
  }

  const markdown = await readFile(key, "utf8");
  cache.set(key, markdown);
  return markdown;
}

function validateCodeFences({ file, fences }) {
  const errors = [];

  for (const fence of fences) {
    if (fence.language === "") {
      errors.push({
        file,
        line: fence.line,
        message: "code fence is missing a language label",
      });
      continue;
    }

    if (fence.language !== "ts" && fence.language !== "typescript") {
      continue;
    }

    const result = ts.transpileModule(fence.code, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    });
    const syntacticDiagnostics = result.diagnostics?.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error) ?? [];

    for (const diagnostic of syntacticDiagnostics) {
      const position = typeof diagnostic.start === "number"
        ? ts.getLineAndCharacterOfPosition(ts.createSourceFile("snippet.ts", fence.code, ts.ScriptTarget.ES2022, true), diagnostic.start)
        : { line: 0 };
      errors.push({
        file,
        line: fence.line + position.line + 1,
        message: `TypeScript snippet has syntax error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      });
    }
  }

  return errors;
}

export async function validateMarkdownFile(filePath, repoRoot = process.cwd()) {
  const resolvedFilePath = path.resolve(filePath);
  const resolvedRepoRoot = path.resolve(repoRoot);
  const markdownCache = new Map();
  const markdown = await readMarkdownFromCache(markdownCache, resolvedFilePath);
  const displayFile = formatRelativePath(resolvedRepoRoot, resolvedFilePath);
  const fileDir = path.dirname(resolvedFilePath);
  const errors = [];

  for (const link of extractMarkdownLinks(markdown)) {
    errors.push(...await validateLink({
      fileDir,
      filePath: resolvedFilePath,
      link,
      markdownCache,
      repoRoot: resolvedRepoRoot,
    }));
  }

  errors.push(...validateCodeFences({
    fences: extractCodeFences(markdown),
    file: displayFile,
  }));

  return sortErrors(errors);
}

async function walkMarkdownFiles(directory) {
  const files = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) {
        files.push(...await walkMarkdownFiles(entryPath));
      }
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

export async function validateDocs(repoRoot = process.cwd()) {
  const resolvedRepoRoot = path.resolve(repoRoot);
  const rootEntries = await readdir(resolvedRepoRoot, { withFileTypes: true });
  const markdownFiles = rootEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(resolvedRepoRoot, entry.name));

  for (const root of markdownRoots) {
    markdownFiles.push(...await walkMarkdownFiles(path.join(resolvedRepoRoot, root)));
  }

  const uniqueFiles = [...new Set(markdownFiles.map((file) => path.resolve(file)))].sort((left, right) => {
    const leftPath = formatRelativePath(resolvedRepoRoot, left);
    const rightPath = formatRelativePath(resolvedRepoRoot, right);
    if (leftPath < rightPath) {
      return -1;
    }
    if (leftPath > rightPath) {
      return 1;
    }
    return 0;
  });
  const nestedErrors = await Promise.all(uniqueFiles.map((file) => validateMarkdownFile(file, resolvedRepoRoot)));

  return sortErrors(nestedErrors.flat());
}

async function main() {
  const errors = await validateDocs();
  if (errors.length === 0) {
    console.log("Documentation validation passed.");
    return;
  }

  for (const error of errors) {
    console.error(`${error.file}:${error.line} ${error.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
