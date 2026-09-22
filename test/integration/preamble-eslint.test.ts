import {beforeAll, afterAll, describe, it, expect} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {spawnSync} from "node:child_process";
import {ESLint, type Linter} from "eslint";
import {defineConfig, globalIgnores} from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import {compileWsdlToProject} from "../../src/index.js";

const base = path.resolve("tmp/test-generation/preamble-eslint");
let root: string;
let generated: string;
const handwritten = "export class Maintained {}\n";
const rule: NonNullable<Linter.Config["rules"]> = {"no-restricted-syntax": ["error", {selector: "ClassDeclaration", message: "Class policy control"}]};
const tsConfig = {files: ["**/*.ts"], languageOptions: {parser: tseslint.parser}, rules: rule};
function linter(extra: Linter.Config[] = [], policy: Linter.Config["linterOptions"] = {}) {
  return new ESLint({cwd: root, overrideConfigFile: true, overrideConfig: [tsConfig, {linterOptions: policy}, ...extra]});
}
function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(root, file)), {recursive: true});
  fs.writeFileSync(path.join(root, file), content);
}
function cli(args: string[]) {
  return spawnSync(process.execPath, [path.resolve("node_modules/eslint/bin/eslint.js"), ...args], {cwd: root, encoding: "utf8"});
}
beforeAll(async () => {
  fs.mkdirSync(base, {recursive: true});
  root = fs.mkdtempSync(path.join(base, "consumer-"));
  await compileWsdlToProject({wsdl: "examples/minimal/weather.wsdl", outDir: path.join(root, ".generated/client")});
  generated = fs.readFileSync(path.join(root, ".generated/client/client.ts"), "utf8");
  write("src/app.ts", handwritten);
  write("src/other/client.ts", handwritten);
  write("eslint.config.mjs", `import tseslint from "typescript-eslint";\nexport default [
    {ignores: [".generated/client/**", ".generated/gateway/**"]},
    {files: ["**/*.ts"], languageOptions: {parser: tseslint.parser}, rules: ${JSON.stringify(rule)}}
  ];\n`);
});
afterAll(() => fs.rmSync(root, {recursive: true, force: true}));

describe("consumer ESLint behavior", () => {
  it("suppresses a real generated violation while maintained source remains checked", async () => {
    const eslint = linter();
    const without = generated.replace(/^\/\* eslint-disable \*\/\r?\n/, "");
    const [before] = await eslint.lintText(without, {filePath: ".generated/client/client.ts"});
    expect(before.messages.some(m => m.ruleId === "no-restricted-syntax")).toBe(true);
    expect(before.fatalErrorCount).toBe(0);
    const [after] = await eslint.lintText(generated, {filePath: ".generated/client/client.ts"});
    expect(after.messages).toEqual([]);
    expect(after.suppressedMessages.some(m => m.ruleId === "no-restricted-syntax")).toBe(true);
    const [control] = await eslint.lintText(handwritten, {filePath: "src/app.ts"});
    expect(control.errorCount).toBe(1);
  });

  it("respects noInlineConfig and CLI --no-inline-config", async () => {
    const [result] = await linter([], {noInlineConfig: true}).lintText(generated, {filePath: "output.ts"});
    expect(result.messages.some(m => m.ruleId === "no-restricted-syntax")).toBe(true);
    write("output.ts", generated);
    const run = cli(["--no-inline-config", "output.ts", "--format", "json"]);
    expect(run.status, run.stderr).toBe(1);
    expect((JSON.parse(run.stdout) as ESLint.LintResult[])[0].messages.some(m => m.ruleId === "no-restricted-syntax")).toBe(true);
  });

  it.each(["warn", "error"] as const)("reports unused directives at %s severity", async severity => {
    const [result] = await linter([], {reportUnusedDisableDirectives: severity}).lintText("/* eslint-disable */\nexport {};", {filePath: "clean.ts"});
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].message).toContain("Unused eslint-disable");
    expect(result.messages[0].severity).toBe(severity === "warn" ? 1 : 2);
  });

  it("does not suppress parser errors but global exclusion skips parsing", async () => {
    const broken = "/* eslint-disable */\nconst broken: = ;";
    const [parsed] = await linter().lintText(broken, {filePath: ".generated/gateway/broken.ts"});
    expect(parsed.fatalErrorCount).toBe(1);
    const excluded = linter([globalIgnores([".generated/gateway/**"])]);
    expect(await excluded.isPathIgnored(path.join(root, ".generated/gateway/broken.ts"))).toBe(true);
    expect(await excluded.lintText(broken, {filePath: ".generated/gateway/broken.ts", warnIgnored: false})).toEqual([]);
  });

  it.each(["helper", "object", "mixed"])("executes %s ignore patterns without hiding handwritten files", async variant => {
    const patterns = variant === "mixed"
      ? ["src/integrations/weather/client.ts", "src/integrations/weather/types.ts", "src/integrations/weather/operations.ts", "src/integrations/weather/utils.ts", "src/integrations/weather/gateway/**"]
      : [".generated/client/**", ".generated/gateway/**"];
    const config = defineConfig([
      variant === "object" ? {ignores: patterns} : globalIgnores(patterns),
      js.configs.recommended, tseslint.configs.recommended,
      {files: ["**/*.ts"], rules: rule},
      {linterOptions: {noInlineConfig: true, reportUnusedDisableDirectives: "error"}},
    ]);
    const eslint = new ESLint({cwd: root, overrideConfigFile: true, overrideConfig: config});
    const file = variant === "mixed" ? "src/integrations/weather/client.ts" : ".generated/client/client.ts";
    expect(await eslint.isPathIgnored(path.join(root, file))).toBe(true);
    expect(await eslint.lintText(generated, {filePath: file, warnIgnored: false})).toEqual([]);
    const [control] = await eslint.lintText(handwritten, {filePath: "src/other/client.ts"});
    expect(control.messages.some(m => m.ruleId === "no-restricted-syntax")).toBe(true);
  });

  it("handles explicit ignored filenames without concealing maintained violations", () => {
    const warning = cli(["--max-warnings", "0", ".generated/client/client.ts", "--format", "json"]);
    expect(warning.status).toBe(1);
    expect(JSON.parse(warning.stdout)[0].warningCount).toBe(1);
    const ignored = cli(["--max-warnings", "0", "--no-warn-ignored", ".generated/client/client.ts", "--format", "json"]);
    expect(ignored.status, ignored.stderr).toBe(0);
    const control = cli(["--max-warnings", "0", "--no-warn-ignored", ".generated/client/client.ts", "src/app.ts", "--format", "json"]);
    expect(control.status, control.stderr).toBe(1);
    expect((JSON.parse(control.stdout) as ESLint.LintResult[]).some(r => r.messages.some(m => m.ruleId === "no-restricted-syntax"))).toBe(true);
  });
});
