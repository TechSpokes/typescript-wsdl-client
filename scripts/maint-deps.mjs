import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(ROOT, "package.json");
const PACKAGE_LOCK_JSON = path.join(ROOT, "package-lock.json");
const APP_GENERATOR = path.join(ROOT, "src", "app", "generateApp.ts");
const GENERATED_APP_PACKAGE = path.join(ROOT, "tmp", "app", "package.json");

const APP_DEPENDENCIES = {
  dependencies: ["fastify", "fastify-plugin", "saxes", "soap"],
  devDependencies: ["@types/node", "tsx", "typescript"],
};
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const NPM_CLI = process.env.npm_execpath;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function npmEnv() {
  const existing = process.env.NODE_OPTIONS ?? "";
  const nodeOptions = existing.includes("--use-system-ca")
    ? existing
    : `${existing} --use-system-ca`.trim();
  return {
    ...process.env,
    NODE_OPTIONS: nodeOptions,
    npm_config_cache: path.join(ROOT, "tmp", "npm-cache"),
  };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
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

function runNpm(args, options = {}) {
  if (NPM_CLI) {
    return run(process.execPath, [NPM_CLI, ...args], options);
  }
  return run(NPM, args, {...options, shell: process.platform === "win32"});
}

function latestVersion(packageName) {
  const raw = runNpm(["view", packageName, "version", "--json"]);
  return JSON.parse(raw);
}

function directDependencyNames(pkg) {
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].sort();
}

function expectedRanges(names) {
  const ranges = new Map();
  for (const name of names) {
    const latest = latestVersion(name);
    ranges.set(name, `^${latest}`);
  }
  return ranges;
}

function updateRootPackage(pkg, ranges) {
  let changed = false;
  for (const section of ["dependencies", "devDependencies"]) {
    const deps = pkg[section] ?? {};
    for (const name of Object.keys(deps)) {
      const expected = ranges.get(name);
      if (expected && deps[name] !== expected) {
        console.log(`root ${section}.${name}: ${deps[name]} -> ${expected}`);
        deps[name] = expected;
        changed = true;
      }
    }
  }
  if (changed) writeJson(PACKAGE_JSON, pkg);
  return changed;
}

function updateAppGenerator(ranges) {
  let content = fs.readFileSync(APP_GENERATOR, "utf-8");
  let changed = false;

  for (const sectionPackages of Object.values(APP_DEPENDENCIES)) {
    for (const name of sectionPackages) {
      const expected = ranges.get(name);
      if (!expected) continue;

      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`("${escapedName}"|${escapedName}): "([^"]+)"`, "g");
      content = content.replace(pattern, (match, key, current) => {
        if (current === expected) return match;
        changed = true;
        console.log(`generated app ${name}: ${current} -> ${expected}`);
        return `${key}: "${expected}"`;
      });
    }
  }

  if (changed) fs.writeFileSync(APP_GENERATOR, content, "utf-8");
  return changed;
}

function verifyRootManifestAndLock(ranges) {
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

function verifyGeneratedApp(ranges) {
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

function failIfErrors(errors) {
  if (errors.length === 0) return;
  throw new Error(`Dependency maintenance verification failed:\n${errors.map(error => `- ${error}`).join("\n")}`);
}

function main() {
  const pkg = readJson(PACKAGE_JSON);
  const rootPackages = directDependencyNames(pkg);
  const appPackages = Object.values(APP_DEPENDENCIES).flat();
  const ranges = expectedRanges([...new Set([...rootPackages, ...appPackages])].sort());

  const rootChanged = updateRootPackage(pkg, ranges);
  const appChanged = updateAppGenerator(ranges);

  if (!rootChanged) {
    console.log("Root package dependency ranges are already current.");
  }

  if (!appChanged) {
    console.log("Generated app dependency ranges are already current.");
  }

  console.log("Refreshing package-lock.json with npm install...");
  runNpm(["install"], {stdio: "inherit"});

  failIfErrors(verifyRootManifestAndLock(ranges));

  console.log("Generating app scaffold for dependency verification...");
  runNpm(["run", "smoke:pipeline"], {stdio: "inherit"});

  failIfErrors(verifyGeneratedApp(ranges));
  console.log("Dependency maintenance completed successfully.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
