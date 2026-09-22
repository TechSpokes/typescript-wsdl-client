import {describe, it, expect, afterEach, vi} from "vitest";
import fs from "node:fs";
import path from "node:path";
import {createPreambleResolver, composeGeneratedSource, resolvePreamble} from "../../src/generation/preamble.js";
import {writeGeneratedSource} from "../../src/generation/writeGeneratedSource.js";
import {validatePreamble, validatePreambleDirectory} from "../../scripts/lib/preamble-validation.mjs";

const base = path.resolve("tmp/test-generation/preambles");
const roots: string[] = [];
function fixture() {
  fs.mkdirSync(base, {recursive: true});
  const root = fs.mkdtempSync(path.join(base, "unit-"));
  roots.push(root);
  fs.writeFileSync(path.join(root, "typescript.preamble"), "// root\n");
  return root;
}
function resource(root: string, scope: string, content: string) {
  fs.mkdirSync(path.join(root, scope), {recursive: true});
  fs.writeFileSync(path.join(root, scope, "typescript.preamble"), content);
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});

describe("packaged preambles", () => {
  it("validates every shipped resource and selects ownership", () => {
    expect(validatePreambleDirectory(path.resolve("src/generation/preambles"))).toHaveLength(3);
    expect(resolvePreamble("client")).toContain("Do not edit manually");
    expect(resolvePreamble("app")).toContain("Customize this file");
    expect(resolvePreamble("test/runtime")).toContain("Customize this file");
  });

  it("selects the nearest override without concatenating ancestors", () => {
    const root = fixture();
    resource(root, "gateway", "// gateway");
    resource(root, "gateway/routes", "// route");
    const resolve = createPreambleResolver(root);
    expect(resolve("gateway/routes/operation")).toBe("// route");
    expect(resolve("gateway/runtime")).toBe("// gateway");
    expect(resolve("client")).toBe("// root\n");
  });

  it("requires the root even when an override exists", () => {
    const root = fixture();
    resource(root, "app", "// scaffold");
    fs.unlinkSync(path.join(root, "typescript.preamble"));
    expect(() => createPreambleResolver(root)("app")).toThrow(/typescript.preamble/);
  });

  it.each(["", "  \r\n", "\uFEFF"])("rejects an empty selected resource %j", content => {
    const root = fixture();
    resource(root, "gateway", content);
    expect(() => createPreambleResolver(root)("gateway/routes")).toThrow(/empty/);
  });

  it("does not fall back from a non-file or unreadable override", () => {
    const root = fixture();
    fs.mkdirSync(path.join(root, "app/typescript.preamble"), {recursive: true});
    expect(() => createPreambleResolver(root)("app")).toThrow(/regular file/);
    resource(root, "test", "// test");
    const original = fs.readFileSync;
    vi.spyOn(fs, "readFileSync").mockImplementation(((file: fs.PathOrFileDescriptor, ...args: unknown[]) => {
      if (String(file).includes(`${path.sep}test${path.sep}`)) throw Object.assign(new Error("denied"), {code: "EACCES"});
      return (original as Function)(file, ...args);
    }) as typeof fs.readFileSync);
    expect(() => createPreambleResolver(root)("test")).toThrow(/denied/);
  });

  it.each(["", "..", "../app", "/app", "C:/app", "gateway\\routes", "a//b", "a/./b"])("rejects scope %j", scope => {
    expect(() => createPreambleResolver(fixture())(scope)).toThrow(/Invalid.*scope/);
  });

  it("isolates caches and retries failed reads", () => {
    const root = fixture();
    const first = createPreambleResolver(root);
    expect(first("client")).toBe("// root\n");
    fs.writeFileSync(path.join(root, "typescript.preamble"), "// changed");
    expect(first("client")).toBe("// root\n");
    expect(createPreambleResolver(root)("client")).toBe("// changed");
    resource(root, "app", "");
    expect(() => first("app")).toThrow(/empty/);
    resource(root, "app", "// repaired");
    expect(first("app")).toBe("// repaired");
  });

  it("normalizes only the prefix and preserves body/shebang bytes", () => {
    const body = "/** original */\r\n// @ts-expect-error\r\nconst x = unknown;\r\n";
    expect(composeGeneratedSource("\uFEFF" + body, "\uFEFF// café\r\n")).toBe("// café\n\n" + body);
    expect(composeGeneratedSource("\uFEFF#!/usr/bin/env node\r\n" + body, "// header")).toBe("#!/usr/bin/env node\r\n// header\n\n" + body);
    expect(composeGeneratedSource("#!/bin/node", "// header")).toBe("#!/bin/node\n// header\n\n");
    expect(composeGeneratedSource("#!/bin/node\r" + body, "// header")).toBe("#!/bin/node\r// header\n\n" + body);
  });

  it("writes deterministic output independent of destination and propagates errors", () => {
    const root = fixture();
    const file = path.join(root, "custom-name.ts");
    writeGeneratedSource(file, "export {};\n", "client");
    const first = fs.readFileSync(file, "utf8");
    writeGeneratedSource(file, "export {};\n", "client");
    expect(fs.readFileSync(file, "utf8")).toBe(first);
    expect(() => writeGeneratedSource(root, "", "client")).toThrow(/Failed to generate/);
    expect(() => writeGeneratedSource(file, "", "../bad")).toThrow(/scope/);
    expect(fs.readFileSync(file, "utf8")).toBe(first);
  });
});

describe("comment-only resource validation", () => {
  it.each(["// valid", "\uFEFF/* café */\r\n// end", " \n/* multiline\n comment */\n"])("accepts %j", text => {
    expect(() => validatePreamble(text)).not.toThrow();
  });
  it.each([
    "", " \n", "/* unterminated", "// header\nconst x = 1;", "export {};", "import 'x';", "declare const x: number;",
    "// @ts-check", "// @ts-nocheck", "// @ts-ignore", "// @ts-expect-error", "/// <reference path='x.ts' />",
    "\u00a0/// <reference types='node' />",
    "/** @jsxRuntime automatic */", "/** @jsxImportSource react */", "/** @jsx h */", "#!/usr/bin/env node",
  ])("rejects %j", text => {
    expect(() => validatePreamble(text)).toThrow();
  });
});
