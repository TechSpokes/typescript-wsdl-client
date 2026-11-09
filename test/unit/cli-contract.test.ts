import { readFileSync } from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(".");
const commandNames = ["compile", "client", "openapi", "gateway", "app", "pipeline"] as const;

function extractCliFlags(source: string): string[] {
  const optionNames = [...source.matchAll(/\.option\("([^"]+)"/g)].map((match) => match[1]);
  const aliases = [...source.matchAll(/alias:\s*"([^"]+)"/g)].map((match) => match[1]);
  return [...new Set([...optionNames, ...aliases].filter((flag) => flag !== "generate-app"))].sort();
}

function extractDocumentedFlags(source: string): string[] {
  return [...new Set([...source.matchAll(/`(--[a-z0-9-]+)`/g)].map((match) => match[1].slice(2)))].sort();
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((item) => !rightSet.has(item));
}

function commandHelp(...args: string[]): string {
  // @why Public help is the user-facing option boundary; source branch spelling is not part of the CLI contract.
  return execFileSync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src/cli.ts"), ...args, "--help"],
    {cwd: repoRoot, encoding: "utf8", timeout: 15_000, windowsHide: true});
}

function extractMarkdownSection(source: string, heading: typeof commandNames[number]): string {
  const marker = `## ${heading}`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const afterStart = start + marker.length;
  const nextHeading = source.slice(afterStart).search(/\n## [^\n]+/);
  return source.slice(start, nextHeading >= 0 ? afterStart + nextHeading : source.length);
}

describe("CLI contract documentation", () => {
  it("keeps public catalog defaults out of the repository tmp workspace", () => {
    const cliSource = readFileSync(path.join(repoRoot, "src", "cli.ts"), "utf8");
    const docsSource = readFileSync(path.join(repoRoot, "docs", "cli-reference.md"), "utf8");

    expect(cliSource).not.toContain("tmp/catalog.json");
    expect(docsSource).not.toContain("tmp/catalog.json");
    expect(cliSource).toContain("Use compile for catalog-only output.");
  });

  it("keeps public CLI flags aligned with the CLI reference", () => {
    const cliSource = readFileSync(path.join(repoRoot, "src", "cli.ts"), "utf8");
    const docsSource = readFileSync(path.join(repoRoot, "docs", "cli-reference.md"), "utf8");
    const cliFlags = extractCliFlags(cliSource);
    const documentedFlags = extractDocumentedFlags(docsSource);

    expect({
      documentedButMissingFromCli: difference(documentedFlags, cliFlags),
      publicCliFlagsMissingFromDocs: difference(cliFlags, documentedFlags),
    }).toEqual({
      documentedButMissingFromCli: [],
      publicCliFlagsMissingFromDocs: [],
    });
  });

  it("keeps choice-mode support scoped to compiler-backed commands", () => {
    for (const command of ["compile", "client", "pipeline"] as const) {
      expect(commandHelp(command)).toContain("--client-choice-mode");
    }

    for (const command of ["openapi", "gateway", "app"] as const) {
      expect(commandHelp(command)).not.toContain("--client-choice-mode");
    }
    const composition = commandHelp("pipeline", "--services-config", "unused-services.json");
    expect(composition).toContain("--services-config");
    expect(composition).not.toContain("--client-choice-mode");
  }, 60_000);

  it("documents choice mode only on commands that accept it", () => {
    const docsSource = readFileSync(path.join(repoRoot, "docs", "cli-reference.md"), "utf8");

    for (const command of ["compile", "client", "pipeline"] as const) {
      const section = extractMarkdownSection(docsSource, command);
      expect(section).toContain("`--client-choice-mode`");
      expect(section).toContain("`all-optional`");
      expect(section).toContain("`union`");
    }

    for (const command of ["openapi", "gateway", "app"] as const) {
      expect(extractMarkdownSection(docsSource, command)).not.toContain("`--client-choice-mode`");
    }
  });
});
