import {describe, expect, test} from "vitest";
import {capabilities} from "./registry.js";
import {fixturePathFor, runCompileCase} from "./runner.js";

const runnableCapabilities = capabilities.filter(capability => capability.compile.outcome !== "research");

describe("WSDL capability conformance registry", () => {
  test("declares unique capability ids with local fixtures", () => {
    const ids = new Set<string>();

    for (const capability of capabilities) {
      expect(ids.has(capability.id)).toBe(false);
      ids.add(capability.id);

      expect(capability.title).not.toEqual("");
      expect(capability.featureTags.length).toBeGreaterThan(0);
      expect(capability.fixture).toEqual(`${capability.id}/${capability.id}.wsdl`);
      expect(capability.authority).not.toEqual("");
      expect(capability.provenance).not.toEqual("");
      expect(capability.license).not.toEqual("");
      expect(capability.fixtureKind).not.toEqual("");
      expect(fixturePathFor(capability).replace(/\\/g, "/")).toContain(`fixtures/${capability.id}/${capability.id}.wsdl`);
    }
  });

  test.each(runnableCapabilities)("$id satisfies its compile expectation", async capability => {
    await runCompileCase(capability);
  });
});
