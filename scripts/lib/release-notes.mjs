#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_SECTIONS = [
  "What This Improves",
  "Highlights",
  "Upgrade Notes",
  "Validation",
  "Notes",
];

export function verifyReleaseNotes(notesPath, tag) {
  const errors = [];

  if (!/^v\d+\.\d+\.\d+$/.test(tag)) {
    errors.push(`Tag '${tag}' does not match expected vX.Y.Z format.`);
    return { ok: false, errors };
  }

  if (!fs.existsSync(notesPath)) {
    errors.push(`Missing release notes file: ${notesPath}`);
    return { ok: false, errors };
  }

  const raw = fs.readFileSync(notesPath, "utf-8");
  const lines = raw.split(/\r?\n/);

  const expectedTitle = `# TypeScript WSDL Client ${tag}`;
  const firstLine = lines[0] ?? "";
  if (firstLine !== expectedTitle) {
    errors.push(`Release notes first line must be exactly: ${expectedTitle}`);
  }

  const headingIndex = new Map();
  const headingList = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(#{1,6}) (.+?)\s*$/);
    if (!match) continue;
    const level = match[1].length;
    const text = match[2];
    headingList.push({ line: index + 1, level, text, raw: line });
    if (level === 2 && !headingIndex.has(text)) {
      headingIndex.set(text, index + 1);
    }
  }

  const improvesLine = headingIndex.get("What This Improves");
  if (!improvesLine) {
    errors.push("Release notes must contain a ## What This Improves section.");
  }

  const missingSections = REQUIRED_SECTIONS.filter(name => !headingIndex.has(name));
  if (missingSections.length > 0) {
    errors.push(
      `Release notes must include ## ${REQUIRED_SECTIONS.join(", ## ")} sections.`,
    );
  }

  if (missingSections.length === 0 && improvesLine) {
    const lineOf = name => headingIndex.get(name);
    const ordered =
      lineOf("What This Improves") < lineOf("Highlights")
      && lineOf("Highlights") < lineOf("Upgrade Notes")
      && lineOf("Upgrade Notes") < lineOf("Validation")
      && lineOf("Validation") < lineOf("Notes");
    if (!ordered) {
      errors.push("Release note sections must appear in the expected order.");
    }
  }

  const secondHeading = headingList[1];
  if (!secondHeading) {
    errors.push("Release notes must include an H2 subtitle after the H1 title.");
  } else if (secondHeading.level !== 2) {
    errors.push("The second Markdown heading in release notes must be an H2 subtitle.");
  } else if (secondHeading.text === "What This Improves" || (improvesLine && secondHeading.line >= improvesLine)) {
    errors.push("Release notes must include an H2 subtitle before ## What This Improves.");
  }

  return { ok: errors.length === 0, errors };
}

function defaultNotesPath(tag) {
  return path.join("docs", "releases", `${tag}.md`);
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return fileURLToPath(import.meta.url) === path.resolve(entry);
}

if (isMainModule()) {
  const [, , fileArg, tagArg] = process.argv;
  if (!fileArg || !tagArg) {
    console.error("Usage: node scripts/lib/release-notes.mjs <notes-file|--tag> <vX.Y.Z>");
    console.error("  When --tag is the first arg, the notes file path is derived from the tag.");
    process.exit(2);
  }

  const tag = fileArg === "--tag" ? tagArg : tagArg;
  const file = fileArg === "--tag" ? defaultNotesPath(tagArg) : fileArg;

  const { ok, errors } = verifyReleaseNotes(file, tag);
  if (!ok) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }
  console.log(`Release notes ${file} match ${tag}.`);
}
