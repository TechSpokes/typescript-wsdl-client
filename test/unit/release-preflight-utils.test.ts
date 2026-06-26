import { describe, expect, it } from "vitest";
import * as releasePreflightUtils from "../../scripts/lib/release-preflight-utils.mjs";

const { findDatedChangelogSection } = releasePreflightUtils;

type ConformanceGateVerifier = (scripts: Record<string, string>) => string[];
type NodeReleaseGateVerifier = (inputs: {
  packageJson: {
    engines?: {
      node?: string;
    };
  };
  ciWorkflow: string;
  releasePackageWorkflow: string;
  releaseDraftWorkflow: string;
}) => string[];

function verifyConformanceGateScripts(scripts: Record<string, string>): string[] {
  const verifier = (releasePreflightUtils as typeof releasePreflightUtils & {
    verifyConformanceGateScripts?: ConformanceGateVerifier;
  }).verifyConformanceGateScripts;

  expect(verifier).toBeTypeOf("function");
  return verifier?.(scripts) ?? [];
}

function verifyNodeReleaseGate(inputs: Parameters<NodeReleaseGateVerifier>[0]): string[] {
  const verifier = (releasePreflightUtils as typeof releasePreflightUtils & {
    verifyNodeReleaseGate?: NodeReleaseGateVerifier;
  }).verifyNodeReleaseGate;

  expect(verifier).toBeTypeOf("function");
  return verifier?.(inputs) ?? [];
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

describe("verifyNodeReleaseGate", () => {
  const baseInputs = {
    packageJson: {
      engines: {
        node: ">=24.0.0",
      },
    },
    ciWorkflow: `
      strategy:
        matrix:
          node-version: [24, 26]
    `,
    releasePackageWorkflow: `
      env:
        NODE_VERSION: 24
    `,
    releaseDraftWorkflow: `
      with:
        node-version: 24
    `,
  };

  it("accepts the declared Node floor, current-line CI coverage, and release floor", () => {
    expect(verifyNodeReleaseGate(baseInputs)).toEqual([]);
  });

  it("rejects a package engine below the supported Node floor", () => {
    const errors = verifyNodeReleaseGate({
      ...baseInputs,
      packageJson: {
        engines: {
          node: ">=20.0.0",
        },
      },
    });

    expect(errors).toContain("package.json engines.node must declare Node >=24.0.0.");
  });

  it("rejects CI matrices that omit the supported Node floor", () => {
    const errors = verifyNodeReleaseGate({
      ...baseInputs,
      ciWorkflow: "node-version: [26]",
    });

    expect(errors).toContain("CI workflow must test the supported Node floor 24.");
  });

  it("rejects CI matrices that omit the current Node line", () => {
    const errors = verifyNodeReleaseGate({
      ...baseInputs,
      ciWorkflow: "node-version: [24]",
    });

    expect(errors).toContain("CI workflow must test the current Node line 26.");
  });

  it("rejects release workflows that run below the supported Node floor", () => {
    const errors = verifyNodeReleaseGate({
      ...baseInputs,
      releasePackageWorkflow: "NODE_VERSION: 20",
      releaseDraftWorkflow: "node-version: 20",
    });

    expect(errors).toEqual([
      "Release package workflow must run on Node 24.",
      "Draft release workflow must run on Node 24.",
    ]);
  });
});
