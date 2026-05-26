import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectAnchors,
  extractCodeFences,
  extractMarkdownLinks,
  slugifyHeading,
  validateDocs,
  validateMarkdownFile,
} from "../../scripts/validate-docs.mjs";

const tempRoots: string[] = [];

async function createFixtureRoot(name: string): Promise<string> {
  const root = path.resolve("tmp", `docs-validator-${name}`);
  await rm(root, { force: true, recursive: true });
  await mkdir(root, { recursive: true });
  tempRoots.push(root);
  return root;
}

async function writeFixture(root: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("slugifyHeading", () => {
  it("generates GitHub-style slugs for repository headings", () => {
    expect(slugifyHeading("### Security `Config` & Setup!")).toBe("security-config-setup");
  });
});

describe("collectAnchors", () => {
  it("tracks duplicate heading anchors with numeric suffixes", () => {
    const anchors = collectAnchors("# Title\n\n## Setup\n\n## Setup\n\n### `Config` Options!");

    expect([...anchors].sort()).toEqual(["config-options", "setup", "setup-1", "title"]);
  });
});

describe("extractMarkdownLinks", () => {
  it("extracts inline links outside fenced code blocks and strips title text", () => {
    const links = extractMarkdownLinks([
      "[Config](docs/configuration.md \"Configuration docs\")",
      "",
      "```markdown",
      "[Ignored](missing.md)",
      "```",
      "[Anchor](#conventions)",
    ].join("\n"));

    expect(links).toEqual([
      { line: 1, target: "docs/configuration.md" },
      { line: 6, target: "#conventions" },
    ]);
  });
});

describe("extractCodeFences", () => {
  it("extracts labeled and unlabeled opening fences without treating closers as unlabeled", () => {
    const fences = extractCodeFences(["```ts", "const value = 1;", "```", "", "```", "plain", "```"].join("\n"));

    expect(fences).toEqual([
      { code: "const value = 1;", language: "ts", line: 1 },
      { code: "plain", language: "", line: 5 },
    ]);
  });
});

describe("validateMarkdownFile", () => {
  it("reports missing files, missing headings, directory targets, unlabeled fences, and TypeScript syntax errors", async () => {
    const root = await createFixtureRoot("file-errors");
    await writeFixture(root, "target.md", "# Existing Heading\n");
    await writeFixture(root, "guide/README.md", "# Guide\n");
    await writeFixture(root, "README.md", [
      "# Docs",
      "",
      "[Missing](missing.md)",
      "",
      "[Bad Heading](target.md#absent-heading)",
      "",
      "[Directory](guide)",
      "",
      "```",
      "plain",
      "```",
      "",
      "```ts",
      "const value = ;",
      "```",
    ].join("\n"));

    const errors = await validateMarkdownFile(path.join(root, "README.md"), root);

    expect(errors.map((error) => `${error.file}:${error.line} ${error.message}`)).toEqual([
      "README.md:3 links to missing file: missing.md",
      "README.md:5 links to missing heading: target.md#absent-heading",
      "README.md:7 links to directory; use guide/README.md",
      "README.md:9 code fence is missing a language label",
      "README.md:14 TypeScript snippet has syntax error: Expression expected.",
    ]);
  });
});

describe("validateDocs", () => {
  it("discovers maintained Markdown files and sorts diagnostics deterministically", async () => {
    const root = await createFixtureRoot("repo");
    await writeFixture(root, "README.md", "# Root\n\n[Missing](missing.md)\n");
    await writeFixture(root, "docs/README.md", "# Docs\n\n[Missing](missing.md)\n");
    await writeFixture(root, "node_modules/README.md", "# Ignored\n\n[Missing](missing.md)\n");
    await writeFixture(root, "client/README.md", "# Ignored\n\n[Missing](missing.md)\n");

    const errors = await validateDocs(root);

    expect(errors.map((error) => `${error.file}:${error.line} ${error.message}`)).toEqual([
      "README.md:3 links to missing file: missing.md",
      "docs/README.md:3 links to missing file: missing.md",
    ]);
  });
});
