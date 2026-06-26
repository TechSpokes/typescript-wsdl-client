import {describe, expect, test} from "vitest";
import {capabilities} from "./registry.js";
import {fixturePathFor, runClientCase, runCompileCase, runOpenApiCase} from "./runner.js";

const runnableCapabilities = capabilities.filter(capability => capability.compile.outcome !== "research");
const downstreamCapabilities = capabilities.filter(capability =>
  capability.status === "supported" || capability.status === "partial"
);
const terminalStatusCapabilities = capabilities.filter(capability =>
  capability.status === "diagnostic" || capability.status === "unsupported"
);

describe("WSDL capability conformance registry", () => {
  test("declares unique capability ids with local fixtures", () => {
    const ids = new Set<string>();

    for (const capability of capabilities) {
      expect(ids.has(capability.id)).toBe(false);
      ids.add(capability.id);

      expect(capability.title).not.toEqual("");
      expect(capability.featureTags.length).toBeGreaterThan(0);
      expect(capability.decision).not.toEqual("");
      expect(capability.decisionReason).not.toEqual("");
      expect(capability.fixture).toMatch(/^[a-z0-9-]+(?:\/[a-z0-9-]+)+\.wsdl$/);
      expect(capability.fixture).not.toContain("/service.wsdl");
      expect(capability.authority).not.toEqual("");
      expect(capability.provenance).not.toEqual("");
      expect(capability.license).not.toEqual("");
      expect(capability.fixtureKind).not.toEqual("");
      expect(fixturePathFor(capability).replace(/\\/g, "/")).toContain(`fixtures/${capability.fixture}`);
    }
  });

  test.each(runnableCapabilities)("$id satisfies its compile expectation", async capability => {
    await runCompileCase(capability);
  });

  test.each(terminalStatusCapabilities)("$id has executable terminal compile evidence", capability => {
    expect(capability.compile.outcome, capability.id).not.toBe("research");
  });

  test.each(downstreamCapabilities)("$id declares client and OpenAPI evidence", capability => {
    expect(capability.client, `${capability.id} client expectation`).toBeDefined();
    expect(capability.openapi, `${capability.id} OpenAPI expectation`).toBeDefined();
  });

  test.each(downstreamCapabilities)("$id satisfies its client expectation", async capability => {
    await runClientCase(capability);
  });

  test.each(downstreamCapabilities)("$id satisfies its OpenAPI expectation", async capability => {
    await runOpenApiCase(capability);
  });
});
