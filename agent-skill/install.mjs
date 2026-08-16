#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function validateName(name) {
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error("--name must be a folder name, not a path.");
  }
}

/**
 * Parses the standalone skill installer's command-line contract.
 *
 * @param {string[]} argv - Arguments following the installer entry point.
 * @returns {{force: boolean, name: string, target: string}} Validated install options.
 * @throws {Error} When an argument is unknown, incomplete, or unsafe as a folder name.
 */
export function parseArgs(argv) {
  const args = {
    force: false,
    name: "typescript-wsdl-client",
    target: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--force") {
      args.force = true;
      continue;
    }

    if (arg === "--name") {
      args.name = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--target") {
      args.target = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.target) {
    throw new Error("Missing required --target <directory> argument.");
  }

  validateName(args.name);

  return args;
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

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Installs one complete skill tree at an explicit target.
 *
 * @param {{force?: boolean, name?: string, skillDir?: string, target: string}} options - Installation paths and replacement policy.
 * @returns {Promise<string>} Absolute path of the installed skill.
 * @throws {Error} When the target is inside the source, already exists without force, or cannot be replaced safely.
 * @sideEffects Creates only the explicit target tree and temporary siblings used for rollback-safe replacement.
 * @why Issue #125 defines `--force` as exact replacement so stale or locally modified files cannot survive an update.
 */
export async function installSkill({
  force = false,
  name = "typescript-wsdl-client",
  skillDir = path.dirname(fileURLToPath(import.meta.url)),
  target,
}) {
  if (!target) {
    throw new Error("Missing required target directory.");
  }
  validateName(name);

  const sourceRoot = path.resolve(skillDir);
  const targetRoot = path.resolve(target);
  const installPath = path.join(targetRoot, name);

  if (isWithin(sourceRoot, installPath)) {
    throw new Error("The install path must be outside the extracted skill directory.");
  }

  await mkdir(targetRoot, { recursive: true });

  const existing = await pathExists(installPath);
  if (existing && !force) {
    throw new Error(`Refusing to overwrite existing directory: ${installPath}. Pass --force to replace it.`);
  }

  const suffix = `${process.pid}-${randomUUID()}`;
  const stagePath = path.join(targetRoot, `.${name}.install-${suffix}`);
  const backupPath = path.join(targetRoot, `.${name}.backup-${suffix}`);
  let backupCreated = false;

  try {
    await cp(sourceRoot, stagePath, {
      errorOnExist: true,
      force: false,
      recursive: true,
    });

    if (existing) {
      await rename(installPath, backupPath);
      backupCreated = true;
    }

    try {
      await rename(stagePath, installPath);
    } catch (error) {
      if (backupCreated && !(await pathExists(installPath))) {
        await rename(backupPath, installPath);
        backupCreated = false;
      }
      throw error;
    }

    if (backupCreated) {
      await rm(backupPath, { force: true, recursive: true });
    }
  } finally {
    await rm(stagePath, { force: true, recursive: true });
  }

  return installPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const installPath = await installSkill(args);

  console.log(`Installed skill to ${installPath}`);
  console.log("If your agent host does not auto-discover skills, point it at this installed skill folder.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
