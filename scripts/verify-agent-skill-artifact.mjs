#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listZipEntries, skillFolderName } from "./build-agent-skill.mjs";
import { pathExists, readJsonFile, readTextFile } from "./lib/files.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function parseArgs(argv) {
  const args = {};
  const allowed = new Set(["checksums", "expected-tag", "previous-zip", "work-dir", "wsdl", "zip"]);
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value) {
      throw new Error("Usage: verify-agent-skill-artifact --zip <file> --checksums <file> --work-dir <directory> --wsdl <file> --expected-tag <tag> [--previous-zip <file>]");
    }
    const key = flag.slice(2);
    if (!allowed.has(key)) {
      throw new Error(`Unknown argument: ${flag}`);
    }
    args[key] = value;
  }

  for (const required of ["zip", "checksums", "work-dir", "wsdl", "expected-tag"]) {
    if (!args[required]) {
      throw new Error(`Missing required --${required} argument.`);
    }
  }

  if (!/^v\d+\.\d+\.\d+$/.test(args["expected-tag"])) {
    throw new Error("--expected-tag must match vX.Y.Z.");
  }

  return args;
}

function safeArchivePath(root, entry) {
  const segments = entry.split("/");
  if (!entry || entry.startsWith("/") || segments.some(segment => !segment || segment === "." || segment === "..")) {
    throw new Error(`Unsafe ZIP entry path: ${entry}`);
  }

  const output = path.resolve(root, ...segments);
  const relative = path.relative(root, output);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`ZIP entry escapes the extraction root: ${entry}`);
  }
  return output;
}

/**
 * Extracts the deterministic deflate-only ZIP format produced by the skill builder.
 *
 * @param {Buffer} archive - Complete generated ZIP bytes.
 * @param {string} targetRoot - Empty or isolated extraction directory.
 * @returns {Promise<string[]>} Extracted entry names in archive order.
 * @throws {Error} When an entry is unsafe, truncated, encrypted, or uses another compression method.
 * @constraints This verifier intentionally accepts only the repository-owned ZIP profile.
 */
export async function extractAgentSkillZip(archive, targetRoot) {
  const expectedEntries = listZipEntries(archive);
  const extractedEntries = [];
  let offset = 0;

  while (offset + 4 <= archive.length && archive.readUInt32LE(offset) === 0x04034b50) {
    if (offset + 30 > archive.length) {
      throw new Error("ZIP local-file header is truncated.");
    }

    const flags = archive.readUInt16LE(offset + 6);
    const compression = archive.readUInt16LE(offset + 8);
    const compressedSize = archive.readUInt32LE(offset + 18);
    const uncompressedSize = archive.readUInt32LE(offset + 22);
    const nameLength = archive.readUInt16LE(offset + 26);
    const extraLength = archive.readUInt16LE(offset + 28);
    if (flags !== 0 || compression !== 8) {
      throw new Error("Agent skill ZIP must use unencrypted raw-deflate entries without data descriptors.");
    }

    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLength;
    const dataStart = nameEnd + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > archive.length) {
      throw new Error("ZIP entry data is truncated.");
    }

    const entry = archive.subarray(nameStart, nameEnd).toString("utf8");
    const content = inflateRawSync(archive.subarray(dataStart, dataEnd));
    if (content.length !== uncompressedSize) {
      throw new Error(`ZIP entry size mismatch: ${entry}`);
    }

    const output = safeArchivePath(targetRoot, entry);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, content);
    extractedEntries.push(entry);
    offset = dataEnd;
  }

  if (JSON.stringify(extractedEntries) !== JSON.stringify(expectedEntries)) {
    throw new Error("Extracted ZIP entries do not match the central-directory inventory.");
  }
  return extractedEntries;
}

/**
 * Verifies one archive against its release checksum manifest.
 *
 * @param {string} zipPath - Downloaded archive path.
 * @param {string} checksumPath - Downloaded `SHA256SUMS` path.
 * @returns {Promise<string>} Verified lowercase SHA-256 digest.
 * @throws {Error} When the manifest does not contain exactly the archive's matching digest.
 */
export async function verifyAgentSkillChecksum(zipPath, checksumPath) {
  const archive = await readFile(zipPath);
  const digest = createHash("sha256").update(archive).digest("hex");
  const expectedLine = `${digest}  ${path.basename(zipPath)}`;
  const lines = (await readTextFile(checksumPath)).trim().split(/\r?\n/).filter(Boolean);
  if (lines.length !== 1 || lines[0] !== expectedLine) {
    throw new Error(`SHA256SUMS does not match ${path.basename(zipPath)}.`);
  }
  return digest;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
  }
}

async function verifyInstalledSkill(installedRoot, expectedTag) {
  const skillFile = path.join(installedRoot, "SKILL.md");
  const sourceMapFile = path.join(installedRoot, "references", "SOURCE-MAP.json");
  const skill = await readTextFile(skillFile);
  const sourceMap = await readJsonFile(sourceMapFile);

  if (!/^license:\s*MIT$/m.test(skill)) {
    throw new Error("Installed SKILL.md is missing the MIT license metadata.");
  }
  if (sourceMap.tag !== expectedTag || sourceMap.version !== expectedTag.slice(1)) {
    throw new Error(`Installed SOURCE-MAP.json does not match ${expectedTag}.`);
  }
}

async function runConsumerFixture(wsdlPath, workDir) {
  const clientDir = path.join(workDir, "consumer", "client");
  const openapiFile = path.join(workDir, "consumer", "openapi.json");
  const gatewayDir = path.join(workDir, "consumer", "gateway");
  const tsxEntry = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");

  run(process.execPath, [
    tsxEntry, "src/cli.ts", "pipeline",
    "--wsdl-source", path.resolve(wsdlPath),
    "--client-dir", clientDir,
    "--openapi-file", openapiFile,
    "--gateway-dir", gatewayDir,
    "--gateway-service-name", "weather",
    "--gateway-version-prefix", "v1",
    "--openapi-format", "json",
    "--init-app",
  ]);

  for (const expected of [
    path.join(clientDir, "catalog.json"),
    path.join(clientDir, "client.ts"),
    openapiFile,
    path.join(gatewayDir, "plugin.ts"),
    path.join(workDir, "consumer", "app", "server.ts"),
  ]) {
    if (!(await pathExists(expected))) {
      throw new Error(`Representative consumer fixture is missing ${path.relative(workDir, expected)}.`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const zipPath = path.resolve(args.zip);
  const checksumPath = path.resolve(args.checksums);
  const workDir = path.resolve(args["work-dir"]);
  const extractRoot = path.join(workDir, "extracted");
  const installTarget = path.join(workDir, "installed");

  await mkdir(workDir, { recursive: true });
  const digest = await verifyAgentSkillChecksum(zipPath, checksumPath);
  await extractAgentSkillZip(await readFile(zipPath), extractRoot);

  const extractedSkill = path.join(extractRoot, skillFolderName);
  const installedSkill = path.join(installTarget, skillFolderName);

  if (args["previous-zip"]) {
    const previousExtractRoot = path.join(workDir, "previous-extracted");
    await extractAgentSkillZip(await readFile(path.resolve(args["previous-zip"])), previousExtractRoot);
    const previousSkill = path.join(previousExtractRoot, skillFolderName);
    run(process.execPath, [path.join(previousSkill, "install.mjs"), "--target", installTarget]);
    await writeFile(path.join(installedSkill, "SKILL.md"), "locally modified previous release\n", "utf8");
    await writeFile(path.join(installedSkill, "stale-local-file.txt"), "stale\n", "utf8");
    run(process.execPath, [path.join(extractedSkill, "install.mjs"), "--target", installTarget, "--force"]);
    if (await pathExists(path.join(installedSkill, "stale-local-file.txt"))) {
      throw new Error("Forced replacement preserved a stale local file from the previous release.");
    }
  } else {
    run(process.execPath, [path.join(extractedSkill, "install.mjs"), "--target", installTarget]);
  }

  await verifyInstalledSkill(installedSkill, args["expected-tag"]);
  await runConsumerFixture(args.wsdl, workDir);

  console.log(`Verified agent skill artifact ${path.basename(zipPath)} (${digest}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
