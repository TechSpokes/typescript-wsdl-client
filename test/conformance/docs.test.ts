import {readFileSync} from "node:fs";
import {describe, expect, test} from "vitest";
import {capabilities} from "./registry.js";

function githubAnchorForHeading(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-");
}

function collectHeadingAnchors(markdown: string): Set<string> {
  const anchors = new Set<string>();

  for (const line of markdown.split(/\r?\n/)) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (match) {
      anchors.add(githubAnchorForHeading(match[2]));
    }
  }

  return anchors;
}

describe("WSDL capability docs anchors", () => {
  test("point to headings in supported patterns documentation", () => {
    const supportedPatterns = readFileSync("docs/supported-patterns.md", "utf8");
    const anchors = collectHeadingAnchors(supportedPatterns);

    for (const capability of capabilities) {
      if (capability.docsAnchor) {
        expect(anchors.has(capability.docsAnchor), capability.id).toBe(true);
      }
    }
  });
});
