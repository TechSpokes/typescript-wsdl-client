import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(".");

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
});
