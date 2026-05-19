#!/usr/bin/env node

import { deflateRawSync } from "node:zlib";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const skillFolderName = "typescript-wsdl-client";
const defaultStageRoot = path.join(repoRoot, "dist", "agent-skill-stage");
const defaultAssetsDir = path.join(repoRoot, "dist", "assets");

const titleByOutput = new Map([
  ["references/cli-reference.md", "CLI Reference"],
  ["references/generated-code.md", "Generated Code"],
  ["references/testing.md", "Testing"],
  ["references/troubleshooting.md", "Troubleshooting"],
  ["references/streaming.md", "Streaming"],
]);

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function repoPath(filePath) {
  return toPosix(path.relative(repoRoot, filePath));
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
}

function validateReleaseTag(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`Release tag '${tag}' must match vX.Y.Z.`);
  }
}

async function readPackageVersion() {
  const packageJson = await readJson("package.json");
  return packageJson.version;
}

function headingLevel(heading) {
  const match = /^(#{1,6})\s+/.exec(heading);
  if (!match) {
    throw new Error(`Invalid heading selector: ${heading}`);
  }

  return match[1].length;
}

export function extractSection(markdown, selector, sourcePath) {
  if (selector.startsWith("marker:")) {
    const marker = selector.slice("marker:".length);
    const start = `<!-- agent-skill:start ${marker} -->`;
    const end = `<!-- agent-skill:end ${marker} -->`;
    const startIndex = markdown.indexOf(start);
    const endIndex = markdown.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
      throw new Error(`Missing marker range '${marker}' in ${sourcePath}.`);
    }

    return markdown.slice(startIndex + start.length, endIndex).trim();
  }

  const lines = markdown.split(/\r?\n/);
  const level = headingLevel(selector);
  const headingIndex = lines.findIndex((line) => line.trim() === selector);

  if (headingIndex === -1) {
    throw new Error(`Missing section '${selector}' in ${sourcePath}.`);
  }

  let endIndex = lines.length;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+/.exec(lines[index]);
    if (match && match[1].length <= level) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(headingIndex, endIndex).join("\n").trim();
}

function linkTargetToSource(sourcePath, target) {
  const [targetPath, fragment = ""] = target.split("#");
  if (!targetPath) {
    return { fragment, source: "" };
  }

  const sourceDir = path.dirname(path.join(repoRoot, sourcePath));
  const resolvedPath = path.resolve(sourceDir, targetPath);
  return {
    fragment,
    source: repoPath(resolvedPath),
  };
}

function rewriteLinks(markdown, sourcePath, sourceToOutput, linkPolicy) {
  if (!linkPolicy || linkPolicy === "rewrite") {
    return markdown.replace(/\[([^\x5d]+)\x5d\(([^)]+)\)/g, (match, text, rawTarget) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
        return match;
      }

      const { source, fragment } = linkTargetToSource(sourcePath, rawTarget);
      if (!source) {
        return match;
      }

      const output = sourceToOutput.get(source);
      if (output) {
        const targetName = path.posix.basename(output);
        return `[${text}](${targetName}${fragment ? `#${fragment}` : ""})`;
      }

      const sourceName = path.posix.basename(source);
      return `${text} (see ${sourceName})`;
    });
  }

  if (linkPolicy === "plainText") {
    return markdown.replace(/\[([^\x5d]+)\x5d\(([^)]+)\)/g, (match, text, rawTarget) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
        return match;
      }

      const { source } = linkTargetToSource(sourcePath, rawTarget);
      return source ? `${text} (see ${path.posix.basename(source)})` : text;
    });
  }

  if (linkPolicy === "fail") {
    const relativeLink = markdownLinks(markdown).find((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target));
    if (relativeLink) {
      throw new Error(`Relative link '${relativeLink}' is not allowed by fail linkPolicy in ${sourcePath}.`);
    }

    return markdown;
  }

  throw new Error(`Unsupported linkPolicy '${linkPolicy}' in ${sourcePath}.`);
}

function markdownLinks(markdown) {
  return [...markdown.matchAll(/\[[^\x5d]+\x5d\(([^)]+)\)/g)].map((match) => match[1]);
}

function ensureSingleTrailingNewline(value) {
  return `${value.replace(/\s+$/u, "")}\n`;
}

function buildSourceToOutput(manifest) {
  const sourceToOutput = new Map();

  for (const reference of manifest.references) {
    sourceToOutput.set(reference.source, reference.output);
  }

  return sourceToOutput;
}

function buildSourceMap({ version, tag, manifest }) {
  return {
    package: "@techspokes/typescript-wsdl-client",
    version,
    tag,
    references: manifest.references.map((reference) => ({
      kind: reference.kind,
      source: reference.source,
      output: reference.output,
      sections: reference.sections ?? [],
      required: reference.required === true,
    })),
  };
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

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, ensureSingleTrailingNewline(content), "utf8");
}

async function copyFileTo(source, output) {
  await mkdir(path.dirname(output), { recursive: true });
  await cp(source, output, { force: true });
}

async function packageReferences({ manifest, packageRoot, sourceToOutput }) {
  const referencesByOutput = new Map();

  for (const reference of manifest.references) {
    const items = referencesByOutput.get(reference.output) ?? [];
    items.push(reference);
    referencesByOutput.set(reference.output, items);
  }

  for (const [outputPath, references] of [...referencesByOutput.entries()].sort()) {
    const first = references[0];
    const destination = path.join(packageRoot, outputPath);

    if (first.kind === "evergreen") {
      if (references.length !== 1) {
        throw new Error(`Evergreen output '${outputPath}' must have exactly one source.`);
      }

      await copyFileTo(path.join(repoRoot, first.source), destination);
      continue;
    }

    const title = titleByOutput.get(outputPath) ?? path.posix.basename(outputPath, ".md");
    const chunks = [`# ${title}`];

    for (const reference of references) {
      const sourceFile = path.join(repoRoot, reference.source);
      const sourceMarkdown = await readFile(sourceFile, "utf8");

      for (const section of reference.sections ?? []) {
        const extracted = extractSection(sourceMarkdown, section, reference.source);
        chunks.push(rewriteLinks(extracted, reference.source, sourceToOutput, reference.linkPolicy));
      }
    }

    await writeText(destination, chunks.join("\n\n"));
  }
}

async function readManifest() {
  const manifest = await readJson("agent-skill/reference-manifest.json");
  if (!Array.isArray(manifest.references)) {
    throw new Error("agent-skill/reference-manifest.json must contain a references array.");
  }

  return manifest;
}

async function copySkillRoot(packageRoot) {
  await copyFileTo(path.join(repoRoot, "agent-skill", "SKILL.md"), path.join(packageRoot, "SKILL.md"));
  await copyFileTo(path.join(repoRoot, "agent-skill", "install.mjs"), path.join(packageRoot, "install.mjs"));
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

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value) {
  const buffer = Buffer.allocUnsafe(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function uint32(value) {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

async function createZip({ sourceRoot, zipPath }) {
  const files = await listFiles(sourceRoot);
  const centralRecords = [];
  let offset = 0;

  await mkdir(path.dirname(zipPath), { recursive: true });
  const output = createWriteStream(zipPath);

  for (const filePath of files) {
    const relativeName = toPosix(path.relative(sourceRoot, filePath));
    const nameBuffer = Buffer.from(relativeName, "utf8");
    const content = await readFile(filePath);
    const compressed = deflateRawSync(content, { level: 9 });
    const crc = crc32(content);
    const dosTime = 0;
    const dosDate = 33;

    const localHeader = Buffer.concat([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(8),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(compressed.length),
      uint32(content.length),
      uint16(nameBuffer.length),
      uint16(0),
      nameBuffer,
    ]);

    output.write(localHeader);
    output.write(compressed);

    centralRecords.push(Buffer.concat([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0),
      uint16(8),
      uint16(dosTime),
      uint16(dosDate),
      uint32(crc),
      uint32(compressed.length),
      uint32(content.length),
      uint16(nameBuffer.length),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(offset),
      nameBuffer,
    ]));

    offset += localHeader.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  output.write(centralDirectory);
  output.write(Buffer.concat([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(centralRecords.length),
    uint16(centralRecords.length),
    uint32(centralDirectory.length),
    uint32(offset),
    uint16(0),
  ]));

  await new Promise((resolve, reject) => {
    output.end(resolve);
    output.on("error", reject);
  });
}

export async function buildAgentSkill(options = {}) {
  const tag = options.tag;
  validateReleaseTag(tag);

  const version = await readPackageVersion();
  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`package.json version '${version}' does not match tag '${tag}'.`);
  }

  const manifest = await readManifest();
  const stageRoot = options.stageRoot ?? defaultStageRoot;
  const packageRoot = path.join(stageRoot, skillFolderName);
  const createArchive = options.createArchive ?? true;

  await rm(stageRoot, { force: true, recursive: true });
  await mkdir(packageRoot, { recursive: true });

  await copySkillRoot(packageRoot);
  await packageReferences({
    manifest,
    packageRoot,
    sourceToOutput: buildSourceToOutput(manifest),
  });

  await writeText(
    path.join(packageRoot, "references", "SOURCE-MAP.json"),
    JSON.stringify(buildSourceMap({ version, tag, manifest }), null, 2),
  );

  let zipPath;
  if (createArchive) {
    const assetsDir = options.assetsDir ?? defaultAssetsDir;
    zipPath = path.join(assetsDir, `typescript-wsdl-client-agent-skill-${tag}.zip`);

    if (await pathExists(zipPath)) {
      await rm(zipPath);
    }

    await createZip({
      sourceRoot: stageRoot,
      zipPath,
    });
  }

  return {
    packageRoot,
    stageRoot,
    zipPath,
  };
}

async function main() {
  const tag = process.argv[2];
  if (!tag) {
    throw new Error("Usage: node scripts/build-agent-skill.mjs vX.Y.Z");
  }

  const result = await buildAgentSkill({ tag });
  console.log(`Packaged agent skill at ${result.zipPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
