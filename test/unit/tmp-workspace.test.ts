import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf-8")) as {
  scripts: Record<string, string>;
};

describe("repository tmp workspace paths", () => {
  it("keeps smoke output under tmp/smoke", () => {
    const smokeScripts = Object.entries(packageJson.scripts)
      .filter(([name]) => name.startsWith("smoke:"))
      .filter(([name]) => name !== "smoke:reset");

    expect(smokeScripts.length).toBeGreaterThan(0);
    for (const [name, script] of smokeScripts) {
      expect(script, name).toContain("tmp/smoke/");
      expect(script, name).not.toMatch(/\btmp\/(?:client|gateway|app|openapi\.json|catalog\.json|tests)\b/);
    }
  });

  it("keeps npm cache under tmp/cache/npm", () => {
    const depsScript = readFileSync("scripts/lib/deps.mjs", "utf-8");
    const packageScript = readFileSync("scripts/validate-npm-package.mjs", "utf-8");

    expect(depsScript).toContain("tmp\", \"cache\", \"npm");
    expect(packageScript).toContain("--cache tmp/cache/npm");
    expect(depsScript).not.toContain("tmp\", \"npm-cache");
    expect(packageScript).not.toContain("--cache tmp/npm-cache");
  });

  it("keeps release preflight examples under tmp/preflight/examples", () => {
    const preflightScript = readFileSync("scripts/release-preflight.mjs", "utf-8");

    expect(preflightScript).toContain("\"tmp\", \"preflight\", \"examples\"");
    expect(preflightScript).not.toContain("\"tmp\", \"preflight-examples\"");
  });

  it("keeps generated-test integration spikes under tmp/test-generation", () => {
    const integrationTest = readFileSync("test/integration/test-generation.test.ts", "utf-8");

    expect(integrationTest).toContain("\"tmp\", \"test-generation\"");
    expect(integrationTest).not.toContain("join(PROJECT_ROOT, \"tmp\")");
  });
});
