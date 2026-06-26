#!/usr/bin/env node

import {readFile, writeFile} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {capabilities} from "../test/conformance/registry.js";

const targetFile = "docs/supported-patterns.md";
const startMarker = "<!-- support-matrix:start -->";
const endMarker = "<!-- support-matrix:end -->";

export function generateSupportMatrix(): string {
  const lines = [
    startMarker,
    "| Capability ID | Status | Public contract |",
    "|---|---|---|",
  ];

  for (const capability of capabilities) {
    lines.push(`| \`${capability.id}\` | ${capability.status} | ${capability.publicContract} |`);
  }

  lines.push(endMarker);
  return `${lines.join("\n")}\n`;
}

export function replaceSupportMatrix(markdown: string, matrix = generateSupportMatrix()): string {
  const start = markdown.indexOf(startMarker);
  const end = markdown.indexOf(endMarker);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(`Missing support matrix markers in ${targetFile}.`);
  }

  const afterEnd = end + endMarker.length;
  return `${markdown.slice(0, start)}${matrix}${markdown.slice(afterEnd).replace(/^\r?\n/, "")}`;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes("--check");
  const markdown = await readFile(targetFile, "utf8");
  const updated = replaceSupportMatrix(markdown);

  if (checkOnly) {
    if (updated !== markdown) {
      console.error(`${targetFile} support matrix is stale. Run npm run docs:support-matrix.`);
      process.exitCode = 1;
      return;
    }

    console.log("Support matrix is up to date.");
    return;
  }

  await writeFile(targetFile, updated);
  console.log(`Updated ${targetFile} support matrix.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
