#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function runNpmPackDryRun() {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", "npm pack --dry-run --json --ignore-scripts --cache tmp/cache/npm"]
      : ["pack", "--dry-run", "--json", "--ignore-scripts", "--cache", "tmp/cache/npm"];
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: {
        ...process.env,
        npm_config_loglevel: "silent",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`npm pack dry-run failed with exit code ${code}.\n${stderr}`));
        return;
      }

      resolve(stdout);
    });
  });
}

function parsePackOutput(output) {
  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed) || parsed.length !== 1 || !Array.isArray(parsed[0].files)) {
    throw new Error("Unexpected npm pack --dry-run --json output.");
  }

  return parsed[0].files.map((file) => file.path).sort();
}

function validatePackageFiles(files) {
  const forbiddenPatterns = [
    /^agent-skill\//,
    /^scripts\//,
    /^test\//,
    /^tmp\//,
    /^dist\/assets\//,
    /^dist\/agent-skill/,
    /^\.github\//,
    /^\.idea\//,
    /^node_modules\//,
  ];

  const forbiddenFiles = files.filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)));
  if (forbiddenFiles.length > 0) {
    throw new Error(`Forbidden files would be published:\n${forbiddenFiles.join("\n")}`);
  }

  const requiredFiles = [
    "dist/cli.js",
    "dist/index.js",
    "dist/index.d.ts",
    "docs/agent-skill.md",
    "README.md",
    "LICENSE",
    "package.json",
  ];

  const missingFiles = requiredFiles.filter((file) => !files.includes(file));
  if (missingFiles.length > 0) {
    throw new Error(`Required package files are missing:\n${missingFiles.join("\n")}`);
  }
}

async function main() {
  const output = await runNpmPackDryRun();
  const files = parsePackOutput(output);
  validatePackageFiles(files);
  console.log(`NPM package validation passed with ${files.length} files.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
