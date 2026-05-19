#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentSkill, extractSection } from "./build-agent-skill.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function repoPath(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

async function pathExists(filePath) {
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

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files.sort((left, right) => repoPath(left).localeCompare(repoPath(right)));
}

function parseFrontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) {
    throw new Error("agent-skill/SKILL.md must start with YAML frontmatter.");
  }

  const values = new Map();
  const lines = match[1].split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const keyMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!keyMatch) {
      throw new Error(`Unsupported frontmatter line in SKILL.md: ${line}`);
    }

    values.set(keyMatch[1], keyMatch[2]);
  }

  return values;
}

function validateSkillFrontmatter(markdown) {
  const frontmatter = parseFrontmatter(markdown);
  const keys = [...frontmatter.keys()].sort();
  const allowed = ["description", "name"];

  if (JSON.stringify(keys) !== JSON.stringify(allowed)) {
    throw new Error(`SKILL.md frontmatter must include only name and description. Found: ${keys.join(", ")}`);
  }

  const name = frontmatter.get("name") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length >= 64) {
    throw new Error("Skill name must be lowercase hyphen-case and under 64 characters.");
  }

  const description = frontmatter.get("description") ?? "";
  if (description.length < 80 || !description.includes("@techspokes/typescript-wsdl-client") || !/consumer|WSDL|generate/i.test(description)) {
    throw new Error("Skill description must be non-empty and trigger-rich for consumer WSDL generation tasks.");
  }
}

async function validateManifestSources(manifest) {
  for (const reference of manifest.references) {
    const sourcePath = path.join(repoRoot, reference.source);
    if (!(await pathExists(sourcePath))) {
      throw new Error(`Manifest source does not exist: ${reference.source}`);
    }

    if (reference.kind === "fluid") {
      const markdown = await readFile(sourcePath, "utf8");
      for (const section of reference.sections ?? []) {
        extractSection(markdown, section, reference.source);
      }
    }
  }
}

function slugifyHeading(heading) {
  return heading
    .replace(/^#{1,6}\s+/, "")
    .trim()
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[([^\x5d]+)\x5d\(([^)]+)\)/g)].map((match) => ({
    text: match[1],
    target: match[2],
  }));
}

async function validatePackagedMarkdown(packageRoot) {
  const files = (await listFiles(packageRoot)).filter((filePath) => filePath.endsWith(".md"));
  const anchorsByFile = new Map();

  for (const filePath of files) {
    const markdown = await readFile(filePath, "utf8");
    const h1Count = markdown.split(/\r?\n/).filter((line) => /^#\s+/.test(line)).length;
    if (h1Count !== 1) {
      throw new Error(`${repoPath(filePath)} must contain exactly one H1.`);
    }

    const anchors = new Set();
    for (const line of markdown.split(/\r?\n/)) {
      if (/^#{1,6}\s+/.test(line)) {
        anchors.add(slugifyHeading(line));
      }
    }
    anchorsByFile.set(filePath, anchors);
  }

  for (const filePath of files) {
    const markdown = await readFile(filePath, "utf8");
    for (const link of markdownLinks(markdown)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link.target)) {
        continue;
      }

      const [targetPath, fragment = ""] = link.target.split("#");
      const resolved = targetPath ? path.resolve(path.dirname(filePath), targetPath) : filePath;
      if (!(await pathExists(resolved))) {
        throw new Error(`${repoPath(filePath)} links to missing packaged file: ${link.target}`);
      }

      if (fragment) {
        const anchors = anchorsByFile.get(resolved) ?? new Set();
        if (!anchors.has(fragment)) {
          throw new Error(`${repoPath(filePath)} links to missing packaged heading: ${link.target}`);
        }
      }
    }
  }
}

async function validateForbiddenFiles(packageRoot) {
  const forbiddenSegments = new Set([
    ".git",
    ".github",
    ".idea",
    "node_modules",
    "dist",
    "tmp",
    "generated-output",
    "releases",
  ]);

  for (const filePath of await listFiles(packageRoot)) {
    const packagedPath = toPosix(path.relative(packageRoot, filePath));
    const segments = packagedPath.split("/");
    for (const segment of segments) {
      if (forbiddenSegments.has(segment)) {
        throw new Error(`Forbidden file packaged: ${packagedPath}`);
      }
    }

    if (segments.some((segment) => segment === "package.json" || segment === "package-lock.json")) {
      throw new Error(`Repository bootstrap material packaged: ${packagedPath}`);
    }
  }
}

async function hashTree(root) {
  const entries = [];

  for (const filePath of await listFiles(root)) {
    const relativePath = toPosix(path.relative(root, filePath));
    const content = await readFile(filePath);
    const hash = createHash("sha256").update(content).digest("hex");
    entries.push(`${relativePath}\0${hash}`);
  }

  return entries.join("\n");
}

async function validateDeterministicBuild(tag) {
  const first = await buildAgentSkill({
    createArchive: false,
    stageRoot: path.join(repoRoot, "dist", "agent-skill-validate-a"),
    tag,
  });
  const second = await buildAgentSkill({
    createArchive: false,
    stageRoot: path.join(repoRoot, "dist", "agent-skill-validate-b"),
    tag,
  });

  const firstHash = await hashTree(first.stageRoot);
  const secondHash = await hashTree(second.stageRoot);
  if (firstHash !== secondHash) {
    throw new Error("Agent skill staged output is nondeterministic.");
  }

  return first;
}

async function validateEvergreenNoFluidTables(manifest) {
  for (const reference of manifest.references.filter((item) => item.kind === "evergreen")) {
    const markdown = await readFile(path.join(repoRoot, reference.source), "utf8");
    const flagLikeCount = (markdown.match(/`--[a-z0-9-]+`/g) ?? []).length;

    if (/^###\s+.*Flags$/m.test(markdown) || /\|\s*Flag\s*\|/i.test(markdown) || flagLikeCount > 12) {
      throw new Error(`${reference.source} appears to duplicate fluid CLI flag reference content.`);
    }
  }
}

async function main() {
  const packageJson = await readJson("package.json");
  const tag = `v${packageJson.version}`;
  const manifest = await readJson("agent-skill/reference-manifest.json");

  validateSkillFrontmatter(await readFile(path.join(repoRoot, "agent-skill", "SKILL.md"), "utf8"));
  await validateManifestSources(manifest);
  await validateEvergreenNoFluidTables(manifest);

  const result = await validateDeterministicBuild(tag);
  await validatePackagedMarkdown(result.packageRoot);
  await validateForbiddenFiles(result.packageRoot);

  console.log(`Agent skill validation passed for ${tag}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
