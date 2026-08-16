#!/usr/bin/env node

import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildAgentSkill,
  buildSourceMap,
  extractSection,
  listZipEntries,
  skillFolderName,
} from "./build-agent-skill.mjs";
import { listFiles, pathExists, readBinaryFile, readJsonFile, readTextFile, toPosix } from "./lib/files.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const validationPaths = [
  path.join(repoRoot, "dist", "agent-skill-assets-a"),
  path.join(repoRoot, "dist", "agent-skill-assets-b"),
  path.join(repoRoot, "dist", "agent-skill-validate-a"),
  path.join(repoRoot, "dist", "agent-skill-validate-b"),
];

function repoPath(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

async function readJson(relativePath) {
  return readJsonFile(path.join(repoRoot, relativePath));
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

function validateSkillFrontmatter(markdown, expectedLicense) {
  const frontmatter = parseFrontmatter(markdown);
  const keys = [...frontmatter.keys()].sort();
  const allowed = ["description", "license", "name"];

  if (JSON.stringify(keys) !== JSON.stringify(allowed)) {
    throw new Error(`SKILL.md frontmatter must include only name, description, and license. Found: ${keys.join(", ")}`);
  }

  const name = frontmatter.get("name") ?? "";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length >= 64) {
    throw new Error("Skill name must be lowercase hyphen-case and under 64 characters.");
  }

  const description = frontmatter.get("description") ?? "";
  if (description.length < 80 || !description.includes("@techspokes/typescript-wsdl-client") || !/consumer|WSDL|generate/i.test(description)) {
    throw new Error("Skill description must be non-empty and trigger-rich for consumer WSDL generation tasks.");
  }

  if (frontmatter.get("license") !== expectedLicense) {
    throw new Error(`SKILL.md license must match package.json license '${expectedLicense}'.`);
  }
}

function validateSkillNodeRequirement(markdown, enginesNode) {
  const match = /^>=(\d+)\.\d+\.\d+$/.exec(enginesNode);
  if (!match) {
    throw new Error(`Unsupported package engines.node requirement: ${enginesNode}`);
  }

  const expected = `Node.js ${match[1]} or newer`;
  if (!markdown.includes(expected)) {
    throw new Error(`agent-skill/SKILL.md must require ${expected} to match package.json.`);
  }
}

async function validateManifestSources(manifest) {
  for (const reference of manifest.references) {
    const sourcePath = path.join(repoRoot, reference.source);
    if (!(await pathExists(sourcePath))) {
      throw new Error(`Manifest source does not exist: ${reference.source}`);
    }

    if (reference.kind === "fluid") {
      const markdown = await readTextFile(sourcePath);
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
  const files = (await listFiles(packageRoot, { sortRoot: repoRoot })).filter((filePath) => filePath.endsWith(".md"));
  const anchorsByFile = new Map();

  for (const filePath of files) {
    const markdown = await readTextFile(filePath);
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
    const markdown = await readTextFile(filePath);
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

  for (const filePath of await listFiles(packageRoot, { sortRoot: repoRoot })) {
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

  for (const filePath of await listFiles(root, { sortRoot: repoRoot })) {
    const relativePath = toPosix(path.relative(root, filePath));
    const content = await readBinaryFile(filePath);
    const hash = createHash("sha256").update(content).digest("hex");
    entries.push(`${relativePath}\0${hash}`);
  }

  return entries.join("\n");
}

function expectedArchiveEntries(manifest) {
  return [
    `${skillFolderName}/LICENSE`,
    `${skillFolderName}/SKILL.md`,
    `${skillFolderName}/install.mjs`,
    `${skillFolderName}/references/SOURCE-MAP.json`,
    ...new Set(manifest.references.map(reference => `${skillFolderName}/${reference.output}`)),
  ].sort((left, right) => left.localeCompare(right));
}

async function validateArchive(result, manifest, tag) {
  const archive = await readBinaryFile(result.zipPath);
  const entries = listZipEntries(archive);
  const expectedEntries = expectedArchiveEntries(manifest);
  if (JSON.stringify(entries) !== JSON.stringify(expectedEntries)) {
    throw new Error(`Agent skill ZIP inventory mismatch. Expected ${expectedEntries.join(", ")}; found ${entries.join(", ")}.`);
  }
  if (JSON.stringify(entries) !== JSON.stringify(result.archiveEntries)) {
    throw new Error("Agent skill ZIP inventory differs from the builder result.");
  }

  const expectedChecksums = `${result.archiveDigest}  typescript-wsdl-client-agent-skill-${tag}.zip\n`;
  const checksums = await readTextFile(result.checksumPath);
  if (checksums !== expectedChecksums) {
    throw new Error("Agent skill SHA256SUMS does not match the generated archive digest.");
  }
}

async function validateSourceMap(packageRoot, manifest, packageJson, tag) {
  const sourceMap = await readJsonFile(path.join(packageRoot, "references", "SOURCE-MAP.json"));
  const expected = buildSourceMap({ version: packageJson.version, tag, manifest });
  if (JSON.stringify(sourceMap) !== JSON.stringify(expected)) {
    throw new Error("Agent skill SOURCE-MAP.json does not exactly match the maintained reference manifest.");
  }
}

function interpolateFixture(value, packageJson) {
  const nodeMajor = /^(?:>=)?(\d+)/.exec(packageJson.engines.node)?.[1];
  return value.replaceAll("{{nodeMajor}}", nodeMajor ?? "");
}

async function validateBehaviorFixtures(packageRoot, packageJson) {
  const fixture = await readJson("test/fixtures/agent-skill/behavior.json");

  for (const scenario of fixture.scenarios ?? []) {
    const content = (await Promise.all(
      scenario.files.map(file => readTextFile(path.join(packageRoot, file))),
    )).join("\n");

    for (const required of scenario.required ?? []) {
      const expected = interpolateFixture(required, packageJson);
      if (!content.includes(expected)) {
        throw new Error(`Agent skill behavior fixture '${scenario.id}' is missing required guidance: ${expected}`);
      }
    }

    for (const forbidden of scenario.forbidden ?? []) {
      const rejected = interpolateFixture(forbidden, packageJson);
      if (content.includes(rejected)) {
        throw new Error(`Agent skill behavior fixture '${scenario.id}' contains forbidden guidance: ${rejected}`);
      }
    }
  }
}

async function validateDeterministicBuild(tag, manifest, packageJson) {
  const first = await buildAgentSkill({
    assetsDir: path.join(repoRoot, "dist", "agent-skill-assets-a"),
    stageRoot: path.join(repoRoot, "dist", "agent-skill-validate-a"),
    tag,
  });
  const second = await buildAgentSkill({
    assetsDir: path.join(repoRoot, "dist", "agent-skill-assets-b"),
    stageRoot: path.join(repoRoot, "dist", "agent-skill-validate-b"),
    tag,
  });

  const firstHash = await hashTree(first.stageRoot);
  const secondHash = await hashTree(second.stageRoot);
  if (firstHash !== secondHash) {
    throw new Error("Agent skill staged output is nondeterministic.");
  }
  if (!first.archiveDigest || first.archiveDigest !== second.archiveDigest) {
    throw new Error("Agent skill ZIP output is not byte-identical across complete builds.");
  }

  await validateArchive(first, manifest, tag);
  await validateArchive(second, manifest, tag);
  await validateSourceMap(first.packageRoot, manifest, packageJson, tag);
  await validateBehaviorFixtures(first.packageRoot, packageJson);

  return first;
}

async function validateEvergreenNoFluidTables(manifest) {
  for (const reference of manifest.references.filter((item) => item.kind === "evergreen")) {
    const markdown = await readTextFile(path.join(repoRoot, reference.source));
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

  const skillMarkdown = await readTextFile(path.join(repoRoot, "agent-skill", "SKILL.md"));
  validateSkillFrontmatter(skillMarkdown, packageJson.license);
  validateSkillNodeRequirement(skillMarkdown, packageJson.engines.node);
  await validateManifestSources(manifest);
  await validateEvergreenNoFluidTables(manifest);

  try {
    const result = await validateDeterministicBuild(tag, manifest, packageJson);
    await validatePackagedMarkdown(result.packageRoot);
    await validateForbiddenFiles(result.packageRoot);
  } finally {
    await Promise.all(validationPaths.map(filePath => rm(filePath, { force: true, recursive: true })));
  }

  console.log(`Agent skill validation passed for ${tag}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
