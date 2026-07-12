import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {scripts: Record<string, string>};
const stageNames = ["contracts", "compile", "client", "openapi", "gateway", "generated-tests", "app"] as const;

describe("conformance package scripts", () => {
  it("keeps one verbose full-suite command for release coverage", () => {
    expect(packageJson.scripts["test:conformance"]).toBe("vitest run test/conformance --reporter=verbose");
  });

  it.each(stageNames)("runs the %s stage through the stage-only config", stage => {
    expect(packageJson.scripts[`test:conformance:${stage}`]).toBe(
      `vitest run --config vitest.conformance.config.ts test/conformance/stages/${stage}.stage.ts --reporter=verbose`,
    );
  });

  it("keeps stage-only entrypoints outside broad test discovery", () => {
    const config = readFileSync("vitest.config.ts", "utf8");
    const stageConfig = readFileSync("vitest.conformance.config.ts", "utf8");

    expect(config).toContain('include: ["test/**/*.test.ts"]');
    expect(stageConfig).toContain('include: ["test/conformance/stages/*.stage.ts"]');
  });
});
