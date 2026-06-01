import fs from "node:fs";
import {
  APP_DEPENDENCIES,
  APP_GENERATOR,
  PACKAGE_JSON,
  directDependencyRanges,
  appGeneratorPinRegex,
  directDependencyNames,
  expectedRanges,
  failIfErrors,
  readJson,
  runNpm,
  verifyGeneratedApp,
  verifyRootManifestAndLock,
  writeJson,
} from "./lib/deps.mjs";

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

      const pattern = appGeneratorPinRegex(name);
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

function main() {
  const pkg = readJson(PACKAGE_JSON);
  const rootPackages = directDependencyNames(pkg);
  const appPackages = Object.values(APP_DEPENDENCIES).flat();
  const ranges = expectedRanges([...new Set([...rootPackages, ...appPackages])].sort(), directDependencyRanges(pkg));

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
