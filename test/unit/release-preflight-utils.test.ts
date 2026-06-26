import { describe, expect, it } from "vitest";
import * as releasePreflightUtils from "../../scripts/lib/release-preflight-utils.mjs";

const { findDatedChangelogSection } = releasePreflightUtils;

type ConformanceGateVerifier = (scripts: Record<string, string>) => string[];

function verifyConformanceGateScripts(scripts: Record<string, string>): string[] {
  const verifier = (releasePreflightUtils as typeof releasePreflightUtils & {
    verifyConformanceGateScripts?: ConformanceGateVerifier;
  }).verifyConformanceGateScripts;

  expect(verifier).toBeTypeOf("function");
  return verifier?.(scripts) ?? [];
}

describe("findDatedChangelogSection", () => {
  it("finds a dated semver changelog section", () => {
    const result = findDatedChangelogSection(["## [0.24.0] - 2026-05-29"], "0.24.0");

    expect(result).toEqual({ index: 0, dateString: "2026-05-29" });
  });

  it("matches versions literally without interpolating them into a regex", () => {
    const result = findDatedChangelogSection(["## [1\\2\\3] - 2026-05-29"], "1\\2\\3");

    expect(result).toEqual({ index: 0, dateString: "2026-05-29" });
  });
});

describe("verifyConformanceGateScripts", () => {
  it("accepts the current broad Vitest CI coverage with a focused conformance command", () => {
    const errors = verifyConformanceGateScripts({
      "test": "vitest run",
      "test:conformance": "vitest run test/conformance",
      "ci": "npm run clean && npm run build && vitest run && npm run smoke:pipeline",
    });

    expect(errors).toEqual([]);
  });

  it("rejects missing focused conformance commands", () => {
    const errors = verifyConformanceGateScripts({
      "test": "vitest run",
      "ci": "npm run clean && vitest run",
    });

    expect(errors).toContain("package.json scripts.test:conformance must run vitest against test/conformance.");
  });

  it("rejects broad test commands that cannot discover conformance tests", () => {
    const errors = verifyConformanceGateScripts({
      "test": "vitest run test/unit",
      "test:conformance": "vitest run test/conformance",
      "ci": "npm run clean && npm test",
    });

    expect(errors).toContain("package.json scripts.test must leave Vitest discovery broad enough to include test/conformance.");
  });

  it("rejects CI scripts that do not run the broad test command", () => {
    const errors = verifyConformanceGateScripts({
      "test": "vitest run",
      "test:conformance": "vitest run test/conformance",
      "ci": "npm run clean && npm run test:unit && npm run smoke:pipeline",
    });

    expect(errors).toContain("package.json scripts.ci must run npm test, npm run test, or a broad vitest run so conformance is release-covered.");
  });
});
