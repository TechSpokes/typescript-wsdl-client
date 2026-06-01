import { readFileSync } from "node:fs";
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

function extractCliCommandBlock(source: string, command: typeof commandNames[number]): string {
  const marker = `if (rawArgs[0] === "${command}")`;
  const start = source.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const nextCommandStart = commandNames
    .filter((candidate) => candidate !== command)
    .map((candidate) => source.indexOf(`if (rawArgs[0] === "${candidate}")`, start + marker.length))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  return source.slice(start, nextCommandStart ?? source.length);
}

function extractCliCommandFlags(source: string, command: typeof commandNames[number]): string[] {
  return extractCliFlags(extractCliCommandBlock(source, command));
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
    const cliSource = readFileSync(path.join(repoRoot, "src", "cli.ts"), "utf8");

    for (const command of ["compile", "client", "pipeline"] as const) {
      expect(extractCliCommandFlags(cliSource, command)).toContain("client-choice-mode");
    }

    for (const command of ["openapi", "gateway", "app"] as const) {
      expect(extractCliCommandFlags(cliSource, command)).not.toContain("client-choice-mode");
    }
  });

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
