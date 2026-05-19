#!/usr/bin/env node

import { cp, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
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

  if (!args.name || args.name.includes("/") || args.name.includes("\\") || args.name === "." || args.name === "..") {
    throw new Error("--name must be a folder name, not a path.");
  }

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const skillDir = path.dirname(fileURLToPath(import.meta.url));
  const targetRoot = path.resolve(args.target);
  const installPath = path.join(targetRoot, args.name);

  await mkdir(targetRoot, { recursive: true });

  if ((await pathExists(installPath)) && !args.force) {
    throw new Error(`Refusing to overwrite existing directory: ${installPath}. Pass --force to replace it.`);
  }

  await cp(skillDir, installPath, {
    force: args.force,
    recursive: true,
  });

  console.log(`Installed skill to ${installPath}`);
  console.log("If your agent host does not auto-discover skills, point it at this installed skill folder.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

