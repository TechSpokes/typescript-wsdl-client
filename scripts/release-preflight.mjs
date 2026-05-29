#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  APP_GENERATOR,
  PACKAGE_JSON,
  ROOT,
  expectedRanges,
  failIfErrors,
  readJson,
  runNpm,
  verifyGeneratedAppSource,
  verifyRootManifestAndLock,
} from "./lib/deps.mjs";
import { verifyReleaseNotes } from "./lib/release-notes.mjs";

const WEATHER_WSDL = path.join(ROOT, "examples", "minimal", "weather.wsdl");
const EXAMPLES_DIR = path.join(ROOT, "examples", "generated-output");
const PREFLIGHT_DIR = path.join(ROOT, "tmp", "preflight-examples");
const CHANGELOG = path.join(ROOT, "CHANGELOG.md");
const SKILL_DIR = path.join(ROOT, "dist", "assets");
const CLI_ENTRY = path.join(ROOT, "src", "cli.ts");

function parseArgs(argv) {
  const args = { skipCi: false, skipExamples: false, skipDeps: false, target: null };
  for (const arg of argv) {
    if (arg === "--skip-ci") args.skipCi = true;
    else if (arg === "--skip-examples") args.skipExamples = true;
    else if (arg === "--skip-deps") args.skipDeps = true;
    else if (arg.startsWith("--")) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (!args.target) {
      args.target = arg;
    } else {
      throw new Error(`Unexpected positional argument: ${arg}`);
    }
  }
  if (!args.target) {
    throw new Error("Missing target version. Usage: npm run release:preflight -- vX.Y.Z [--skip-ci] [--skip-examples] [--skip-deps]");
  }
  return args;
}

function normalizeTag(input) {
  const trimmed = input.trim();
  const tag = trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`Tag '${input}' does not match expected vX.Y.Z format.`);
  }
  return tag;
}

function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf-8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || "").trim()}`);
  }
  return (result.stdout || "").trim();
}

const results = [];

function record(name, status, message, ms) {
  results.push({ name, status, message: message ?? "", ms });
  const label =
    status === "pass" ? "[PASS]"
    : status === "warn" ? "[WARN]"
    : status === "skip" ? "[SKIP]"
    : "[FAIL]";
  const timing = typeof ms === "number" ? ` (${ms}ms)` : "";
  const suffix = message ? `: ${message}` : "";
  console.log(`${label} ${name}${timing}${suffix}`);
}

async function step(name, fn) {
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    const status = result?.status ?? "pass";
    record(name, status, result?.message, ms);
  } catch (error) {
    const ms = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    record(name, "fail", message, ms);
  }
}

function readEnginesNode() {
  const pkg = readJson(PACKAGE_JSON);
  const constraint = pkg.engines?.node ?? ">=20.0.0";
  const match = constraint.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [20, 0, 0];
  return match.slice(1, 4).map(Number);
}

function compareSemver(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function nodeRuntime() {
  const required = readEnginesNode();
  const current = process.versions.node.split(".").map(Number);
  if (compareSemver(current, required) < 0) {
    throw new Error(`Node ${process.versions.node} is below required ${required.join(".")}`);
  }
  return { message: `Node ${process.versions.node} satisfies >= ${required.join(".")}` };
}

function tagFormat(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`Tag '${tag}' does not match expected vX.Y.Z format.`);
  }
  return { message: tag };
}

function tagAvailability(tag) {
  const out = git(["tag", "-l", tag]);
  const found = out.split(/\r?\n/).map(s => s.trim()).includes(tag);
  if (found) {
    return { status: "warn", message: `local tag ${tag} already exists` };
  }
  return { message: `tag ${tag} not present locally` };
}

function packageVersionMatches(tag) {
  const expected = tag.replace(/^v/, "");
  const pkg = readJson(PACKAGE_JSON);
  if (pkg.version !== expected) {
    throw new Error(`package.json version is ${pkg.version}, expected ${expected}`);
  }
  return { message: `package.json version is ${expected}` };
}

function changelogEntry(tag) {
  const version = tag.replace(/^v/, "");
  if (!fs.existsSync(CHANGELOG)) {
    throw new Error("CHANGELOG.md is missing.");
  }
  const content = fs.readFileSync(CHANGELOG, "utf-8");
  const lines = content.split(/\r?\n/);
  const headerRegex = new RegExp(`^## \\[${version.replace(/\./g, "\\.")}\\] - (\\d{4}-\\d{2}-\\d{2})\\s*$`);
  const headerIndex = lines.findIndex(line => headerRegex.test(line));
  if (headerIndex === -1) {
    throw new Error(`CHANGELOG.md is missing required dated section: ## [${version}] - YYYY-MM-DD`);
  }
  const dateMatch = lines[headerIndex].match(headerRegex);
  const dateString = dateMatch?.[1];
  if (!dateString || Number.isNaN(Date.parse(dateString))) {
    throw new Error(`CHANGELOG.md ${version} section date '${dateString}' is not a valid ISO date.`);
  }
  let hasBullet = false;
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^## \[/.test(line)) break;
    if (/^\s*-\s+\S/.test(line)) {
      hasBullet = true;
      break;
    }
  }
  if (!hasBullet) {
    throw new Error(`CHANGELOG.md ${version} section has no bullet entries.`);
  }
  return { message: `## [${version}] - ${dateString}` };
}

function releaseNotes(tag) {
  const notesPath = path.join(ROOT, "docs", "releases", `${tag}.md`);
  const { ok, errors } = verifyReleaseNotes(notesPath, tag);
  if (!ok) {
    throw new Error(errors.join("\n"));
  }
  return { message: `docs/releases/${tag}.md is well-formed` };
}

let cachedRanges = null;

function depFreshness() {
  const pkg = readJson(PACKAGE_JSON);
  const names = [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].sort();
  const ranges = expectedRanges(names);
  const errors = verifyRootManifestAndLock(ranges);
  failIfErrors(errors);
  cachedRanges = ranges;
  return { message: `${names.length} root pins match npm latest` };
}

function rangesFromPackageJson() {
  const pkg = readJson(PACKAGE_JSON);
  const ranges = new Map();
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, value] of Object.entries(pkg[section] ?? {})) {
      ranges.set(name, value);
    }
  }
  return ranges;
}

function generatedAppPins() {
  const ranges = cachedRanges ?? rangesFromPackageJson();
  const content = fs.readFileSync(APP_GENERATOR, "utf-8");
  const errors = verifyGeneratedAppSource(content, ranges);
  failIfErrors(errors);
  return { message: "generated app pins align with root" };
}

function lockfileInSync() {
  try {
    runNpm(["ci", "--dry-run", "--ignore-scripts"]);
    return { message: "npm ci --dry-run accepts the lockfile" };
  } catch (error) {
    throw new Error(`npm ci --dry-run failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function diffDirectories(left, right) {
  const diffs = [];
  walkAndDiff(left, right, "", diffs);
  return diffs;
}

function walkAndDiff(left, right, rel, diffs) {
  const leftPath = path.join(left, rel);
  const rightPath = path.join(right, rel);
  const leftExists = fs.existsSync(leftPath);
  const rightExists = fs.existsSync(rightPath);
  if (!leftExists && !rightExists) return;
  if (leftExists !== rightExists) {
    diffs.push(rel || ".");
    return;
  }
  const leftStat = fs.statSync(leftPath);
  const rightStat = fs.statSync(rightPath);
  if (leftStat.isDirectory() !== rightStat.isDirectory()) {
    diffs.push(rel || ".");
    return;
  }
  if (leftStat.isDirectory()) {
    const names = new Set([...fs.readdirSync(leftPath), ...fs.readdirSync(rightPath)]);
    for (const name of [...names].sort()) {
      walkAndDiff(left, right, path.join(rel, name), diffs);
    }
    return;
  }
  const leftBuf = fs.readFileSync(leftPath);
  const rightBuf = fs.readFileSync(rightPath);
  if (!leftBuf.equals(rightBuf)) {
    diffs.push(rel || ".");
  }
}

function examplesFresh() {
  fs.rmSync(PREFLIGHT_DIR, { recursive: true, force: true });
  fs.mkdirSync(PREFLIGHT_DIR, { recursive: true });
  runNpm([
    "exec",
    "--",
    "tsx",
    CLI_ENTRY,
    "pipeline",
    "--wsdl-source", WEATHER_WSDL,
    "--client-dir", path.join(PREFLIGHT_DIR, "client"),
    "--openapi-file", path.join(PREFLIGHT_DIR, "openapi.json"),
    "--gateway-dir", path.join(PREFLIGHT_DIR, "gateway"),
    "--gateway-service-name", "weather",
    "--gateway-version-prefix", "v1",
    "--openapi-format", "json",
  ]);
  const diffs = diffDirectories(EXAMPLES_DIR, PREFLIGHT_DIR);
  if (diffs.length > 0) {
    throw new Error(`examples/generated-output/ drifts from regenerated output:\n${diffs.map(d => `- ${d}`).join("\n")}\nRun \`npm run examples:regenerate\` and commit the diff.`);
  }
  return { message: "examples/generated-output/ matches regenerated output" };
}

function fullCi() {
  runNpm(["run", "ci"], { stdio: "inherit" });
  return { message: "npm run ci passed" };
}

function skillArtifact(tag) {
  runNpm(["run", "skill:package", "--", tag], { stdio: "inherit" });
  const asset = path.join(SKILL_DIR, `typescript-wsdl-client-agent-skill-${tag}.zip`);
  if (!fs.existsSync(asset)) {
    throw new Error(`expected artifact missing: ${path.relative(ROOT, asset)}`);
  }
  return { message: path.relative(ROOT, asset) };
}

function workingTreeStatus() {
  const dirty = git(["status", "--porcelain"]);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const notes = [];
  if (dirty) notes.push("working tree has uncommitted changes");
  if (branch !== "main") notes.push(`current branch is ${branch}, not main`);
  if (notes.length > 0) {
    return { status: "warn", message: notes.join("; ") };
  }
  return { message: `clean on ${branch}` };
}

function summarize(tag) {
  const counts = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const r of results) counts[r.status] += 1;
  console.log("");
  console.log("Summary:");
  for (const r of results) {
    const label = r.status.toUpperCase().padEnd(4, " ");
    console.log(`  [${label}] ${r.name}`);
  }
  console.log("");
  console.log(`Totals: ${counts.pass} pass | ${counts.warn} warn | ${counts.fail} fail | ${counts.skip} skip`);
  if (counts.fail === 0) {
    console.log("");
    console.log("Next steps:");
    console.log(`  git tag ${tag} -m "Release ${tag}"`);
    console.log(`  git push origin main ${tag}`);
  }
  return counts.fail === 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tag = normalizeTag(args.target);
  console.log(`Preflight target: ${tag}`);
  console.log("");

  await step("node-runtime", nodeRuntime);
  await step("tag-format", () => tagFormat(tag));
  await step("tag-availability", () => tagAvailability(tag));
  await step("package-version", () => packageVersionMatches(tag));
  await step("changelog-entry", () => changelogEntry(tag));
  await step("release-notes", () => releaseNotes(tag));

  if (args.skipDeps) {
    record("dep-freshness", "skip", "--skip-deps");
  } else {
    await step("dep-freshness", depFreshness);
  }
  await step("generated-app-pins", generatedAppPins);

  if (args.skipDeps) {
    record("lockfile-sync", "skip", "--skip-deps");
  } else {
    await step("lockfile-sync", lockfileInSync);
  }

  if (args.skipExamples) {
    record("examples-fresh", "skip", "--skip-examples");
  } else {
    await step("examples-fresh", examplesFresh);
  }

  if (args.skipCi) {
    record("npm-run-ci", "skip", "--skip-ci");
    record("skill-artifact", "skip", "--skip-ci");
  } else {
    await step("npm-run-ci", fullCi);
    await step("skill-artifact", () => skillArtifact(tag));
  }

  await step("working-tree", workingTreeStatus);

  const ok = summarize(tag);
  process.exit(ok ? 0 : 1);
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
