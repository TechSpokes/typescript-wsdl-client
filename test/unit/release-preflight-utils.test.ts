import {readFileSync} from "node:fs";
import { describe, expect, it } from "vitest";
import * as releasePreflightUtils from "../../scripts/lib/release-preflight-utils.mjs";

const {
  findDatedChangelogSection,
  verifyConformanceGateScripts,
  verifyNodeReleaseGate,
  verifyPublishWorkflowGate,
  verifyReleaseAbandonmentGate,
  verifySkillDeliveryGate,
  verifyTrackedTreeStable,
} = releasePreflightUtils;

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

describe("verifyTrackedTreeStable", () => {
  it("accepts an unchanged tracked release diff", () => {
    expect(verifyTrackedTreeStable("release diff", "release diff")).toEqual([]);
  });

  it("rejects tracked content changed by preflight", () => {
    expect(verifyTrackedTreeStable("before", "after")).toEqual([
      "Release preflight modified tracked content; review the diff and rerun preflight on the new final candidate.",
    ]);
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
    releaseAbandonWorkflow: `
      with:
        node-version: 24
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
      releaseAbandonWorkflow: "node-version: 20",
    });

    expect(errors).toEqual([
      "Release package workflow must run on Node 24.",
      "Draft release workflow must run on Node 24.",
      "Release abandonment workflow must run on Node 24.",
    ]);
  });
});

describe("verifyPublishWorkflowGate", () => {
  const scripts = {
    "release:publish-check": "npm run clean && npm run build && npm run typecheck && npm run skill:validate && npm run package:validate",
  };
  const workflow = `
  env:
    NPM_VERSION: 12.0.1
  run: npm install -g npm@\${NPM_VERSION}
  run: npm run release:publish-check
  `;

  it("accepts a targeted publish check in the release package workflow", () => {
    expect(verifyPublishWorkflowGate(scripts, workflow)).toEqual([]);
  });

  it("rejects missing targeted publish check scripts", () => {
    const errors = verifyPublishWorkflowGate({}, workflow);

    expect(errors).toContain("package.json scripts.release:publish-check must exist for targeted post-release publish validation.");
  });

  it("rejects publish checks that rerun full CI or broad tests", () => {
    const errors = verifyPublishWorkflowGate({
      "release:publish-check": "npm run clean && npm run build && npm run typecheck && npm run skill:validate && npm run package:validate && npm run ci",
    }, workflow);

    expect(errors).toContain("package.json scripts.release:publish-check must stay targeted and must not run full tests, conformance, smoke, or npm run ci.");
  });

  it("rejects release package workflows that rerun full CI", () => {
    const errors = verifyPublishWorkflowGate(scripts, "run: npm run ci");

    expect(errors).toContain("Release package workflow must run npm run release:publish-check before publishing.");
    expect(errors).toContain("Release package workflow must not run npm run ci; full CI belongs to release preflight before tagging.");
  });

  it.each([
    "publish-gpr:",
    "registry-url: https://npm.pkg.github.com/",
    "packages: write",
  ])("rejects GitHub Packages capability through %s", forbiddenCapability => {
    const errors = verifyPublishWorkflowGate(scripts, `${workflow}\n${forbiddenCapability}`);

    expect(errors).toContain("Release package workflow must publish only to npmjs and must not grant GitHub Packages capability.");
  });

  it.each([
    "run: npm install -g npm@latest",
    "env:\n  NPM_VERSION: 12",
    "env:\n  NPM_VERSION: 12.0.1",
  ])("rejects an unpinned release npm toolchain through %s", npmSetup => {
    const errors = verifyPublishWorkflowGate(scripts, `${npmSetup}\nrun: npm run release:publish-check`);

    expect(errors).toContain("Release package workflow must pin and install an exact tested npm version.");
  });
});

describe("verifySkillDeliveryGate", () => {
  const workflow = `
permissions:
  attestations: write
  contents: write
  id-token: write
- name: Package agent skill
- uses: actions/attest-build-provenance@v4
- run: gh release upload skill.zip SHA256SUMS
- run: gh release download --pattern skill.zip --pattern SHA256SUMS
- run: gh attestation verify skill.zip
- run: node scripts/verify-agent-skill-artifact.mjs
  `;

  it("accepts a checksummed, attested, downloaded, and installed artifact chain", () => {
    expect(verifySkillDeliveryGate(workflow)).toEqual([]);
  });

  it("accepts the repository draft release workflow", () => {
    expect(verifySkillDeliveryGate(readFileSync(".github/workflows/release-draft.yml", "utf8"))).toEqual([]);
  });

  it("rejects missing release provenance permissions", () => {
    const errors = verifySkillDeliveryGate(workflow.replace("  attestations: write\n", ""));

    expect(errors).toContain("Draft release workflow must grant attestations: write for verified agent-skill delivery.");
  });

  it("rejects verification that happens before the uploaded asset is downloaded", () => {
    const errors = verifySkillDeliveryGate(workflow.replace(
      "- run: gh release download --pattern skill.zip --pattern SHA256SUMS\n",
      "",
    ));

    expect(errors).toContain("Draft release workflow must package, attest, upload, download, verify provenance, and verify the installed artifact in order.");
  });
});

describe("verifyReleaseAbandonmentGate", () => {
  const releaseDraftWorkflow = `
    group: release-state-v1.0.0
    node scripts/lib/release-state.mjs guard --tag v1.0.0
    - name: Package agent skill
  `;
  const releasePackageWorkflow = `
  group: release-state-v1.0.0
  build:
    permissions:
      contents: read
    steps:
      - run: node scripts/lib/release-state.mjs guard --tag v1.0.0
      - run: npm run release:publish-check
  publish-npm:
    needs: build
    permissions:
      id-token: write
  `;
  const releaseAbandonWorkflow = `
  group: release-state-v1.0.0
  workflow_dispatch:
  MARKER_STATE: matching
  echo "present=false"
  run: git tag -a abandoned/v1.0.0 abc
  echo "Actor: \${ACTOR}"
  echo "Evidence: \${EVIDENCE}"
  - name: Verify immutable abandonment marker
  run: gh release delete v1.0.0 --yes
  `;

  it("accepts guarded draft, package, and abandonment workflows", () => {
    expect(verifyReleaseAbandonmentGate({releaseDraftWorkflow, releasePackageWorkflow, releaseAbandonWorkflow})).toEqual([]);
  });

  it("accepts the repository release workflows", () => {
    expect(verifyReleaseAbandonmentGate({
      releaseDraftWorkflow: readFileSync(".github/workflows/release-draft.yml", "utf8"),
      releasePackageWorkflow: readFileSync(".github/workflows/release-package.yml", "utf8"),
      releaseAbandonWorkflow: readFileSync(".github/workflows/release-abandon.yml", "utf8"),
    })).toEqual([]);
  });

  it("rejects package capability before the guarded prerequisite", () => {
    const errors = verifyReleaseAbandonmentGate({
      releaseDraftWorkflow,
      releasePackageWorkflow: releasePackageWorkflow.replace("contents: read", "contents: read\n      id-token: write"),
      releaseAbandonWorkflow,
    });

    expect(errors).toContain("The guarded build job must not receive package or OIDC publication capability.");
  });

  it("rejects missing or late release-state guards", () => {
    const errors = verifyReleaseAbandonmentGate({
      releaseDraftWorkflow: "- name: Package agent skill",
      releasePackageWorkflow: releasePackageWorkflow.replace("node scripts/lib/release-state.mjs guard --tag v1.0.0", "echo unguarded"),
      releaseAbandonWorkflow: "on: workflow_dispatch",
    });

    expect(errors).toContain("Draft release workflow must guard abandonment state before packaging or draft mutation.");
    expect(errors).toContain("Release package workflow must guard abandonment state before publish validation.");
    expect(errors).toContain("Manual abandonment workflow must create and verify the immutable marker before retiring the draft release.");
  });

  it("rejects draft retirement that deletes the release tag", () => {
    const errors = verifyReleaseAbandonmentGate({
      releaseDraftWorkflow,
      releasePackageWorkflow,
      releaseAbandonWorkflow: releaseAbandonWorkflow.replace("--yes", "--yes --cleanup-tag"),
    });

    expect(errors).toContain("Manual abandonment workflow must never delete the release tag while retiring a draft.");
  });

  it("rejects abandonment without an idempotent absent-draft state", () => {
    const errors = verifyReleaseAbandonmentGate({
      releaseDraftWorkflow,
      releasePackageWorkflow,
      releaseAbandonWorkflow: releaseAbandonWorkflow.replace("echo \"present=false\"", "echo missing"),
    });

    expect(errors).toContain("Manual abandonment workflow must accept a matching marker with an already absent draft.");
  });

  it("rejects marker annotations without durable actor evidence", () => {
    const errors = verifyReleaseAbandonmentGate({
      releaseDraftWorkflow,
      releasePackageWorkflow,
      releaseAbandonWorkflow: releaseAbandonWorkflow.replace("Actor: \${ACTOR}", "Actor omitted"),
    });

    expect(errors).toContain("Manual abandonment workflow must preserve actor and optional evidence in new marker annotations.");
  });
});
