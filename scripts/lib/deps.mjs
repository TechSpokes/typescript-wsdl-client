import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ROOT = path.resolve(__dirname, "..", "..");
export const PACKAGE_JSON = path.join(ROOT, "package.json");
export const PACKAGE_LOCK_JSON = path.join(ROOT, "package-lock.json");
export const APP_GENERATOR = path.join(ROOT, "src", "app", "generateApp.ts");
export const GENERATED_APP_PACKAGE = path.join(ROOT, "tmp", "smoke", "app", "package.json");

export const APP_DEPENDENCIES = {
  dependencies: ["fastify", "fastify-plugin", "saxes", "soap"],
  devDependencies: ["@types/node", "tsx", "typescript"],
};

const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPM_CLI = process.env.npm_execpath;

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

export function npmEnv() {
  const existing = process.env.NODE_OPTIONS ?? "";
  const nodeOptions = existing.includes("--use-system-ca")
    ? existing
    : `${existing} --use-system-ca`.trim();
  return {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    npm_config_cache: path.join(ROOT, "tmp", "cache", "npm"),
  };
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: npmEnv(),
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
    shell: options.shell ?? false,
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    const reason = result.error ? ` (${result.error.message})` : "";
    throw new Error(`${command} ${args.join(" ")} failed${reason}${output ? `:\n${output}` : ""}`);
  }

  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

export function runNpm(args, options = {}) {
  if (NPM_CLI) {
    return run(process.execPath, [NPM_CLI, ...args], options);
  }
  return run(NPM, args, { ...options, shell: process.platform === "win32" });
}

export function latestVersion(packageName) {
  const raw = runNpm(["view", packageName, "version", "--json"]);
  return JSON.parse(raw);
}

export function directDependencyNames(pkg) {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].sort();
}

export function directDependencyRanges(pkg) {
  const ranges = new Map();
  for (const section of ["dependencies", "devDependencies"]) {
    for (const [name, range] of Object.entries(pkg[section] ?? {})) {
      ranges.set(name, range);
    }
  }
  return ranges;
}

function parseSemver(value) {
  const match = value?.match(/^\^?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return undefined;
  return match.slice(1, 4).map(Number);
}

function compareSemver(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function selectExpectedRange(currentRange, latest) {
  const latestRange = `^${latest}`;
  const currentVersion = parseSemver(currentRange);
  const latestVersion = parseSemver(latest);
  if (currentVersion && latestVersion && compareSemver(currentVersion, latestVersion) > 0) {
    return currentRange;
  }
  return latestRange;
}

export function expectedRanges(names, currentRanges = new Map()) {
  const ranges = new Map();
  for (const name of names) {
    const latest = latestVersion(name);
    ranges.set(name, selectExpectedRange(currentRanges.get(name), latest));
  }
  return ranges;
}

export function verifyRootManifestAndLock(ranges) {
  const pkg = readJson(PACKAGE_JSON);
  const lock = readJson(PACKAGE_LOCK_JSON);
  const lockRoot = lock.packages?.[""];
  const errors = [];

  for (const section of ["dependencies", "devDependencies"]) {
    const deps = pkg[section] ?? {};
    const lockDeps = lockRoot?.[section] ?? {};
    for (const [name, expected] of ranges) {
      if (!(name in deps)) continue;
      if (deps[name] !== expected) {
        errors.push(`package.json ${section}.${name} is ${deps[name]}, expected ${expected}`);
      }
      if (lockDeps[name] !== expected) {
        errors.push(`package-lock.json root ${section}.${name} is ${lockDeps[name]}, expected ${expected}`);
      }
      const packageEntry = lock.packages?.[`node_modules/${name}`];
      const expectedVersion = expected.slice(1);
      if (packageEntry?.version !== expectedVersion) {
        errors.push(`package-lock.json node_modules/${name} is ${packageEntry?.version ?? "<missing>"}, expected ${expectedVersion}`);
      }
    }
  }

  return errors;
}

export function appGeneratorPinRegex(name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`("${escapedName}"|${escapedName}): "([^"]+)"`, "g");
}

export function verifyGeneratedAppSource(content, ranges) {
  const errors = [];
  for (const [section, names] of Object.entries(APP_DEPENDENCIES)) {
    for (const name of names) {
      const expected = ranges.get(name);
      if (!expected) continue;
      const pattern = appGeneratorPinRegex(name);
      let match;
      let found = false;
      while ((match = pattern.exec(content)) !== null) {
        found = true;
        const current = match[2];
        if (current !== expected) {
          errors.push(`src/app/generateApp.ts ${section}.${name} is ${current}, expected ${expected}`);
        }
      }
      if (!found) {
        errors.push(`src/app/generateApp.ts ${section}.${name} pin not found`);
      }
    }
  }
  return errors;
}

export function verifyGeneratedApp(ranges) {
  const generated = readJson(GENERATED_APP_PACKAGE);
  const errors = [];

  for (const [section, names] of Object.entries(APP_DEPENDENCIES)) {
    for (const name of names) {
      const actual = generated[section]?.[name];
      const expected = ranges.get(name);
      if (actual !== expected) {
        errors.push(`generated app ${section}.${name} is ${actual ?? "<missing>"}, expected ${expected}`);
      }
    }
  }

  return errors;
}

export function failIfErrors(errors) {
  if (errors.length === 0) return;
  throw new Error(`Dependency maintenance verification failed:\n${errors.map(error => `- ${error}`).join("\n")}`);
}
