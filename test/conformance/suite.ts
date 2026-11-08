import {existsSync} from "node:fs";
import {describe, expect, test} from "vitest";
import {fixturesRoot, isWithinRoot, validateAllConformanceFixtureGraphs} from "./fixturePolicy.js";
import {capabilities} from "./registry.js";
import {CONFORMANCE_CLEANUP_TIMEOUT_MS, CONFORMANCE_COMMAND_TIMEOUT_MS, fixturePathFor, runAppCase, runClientCase, runCompileCase, runGatewayCase, runGeneratedTestsCase, runOpenApiCase} from "./runner.js";

const runnableCapabilities = capabilities.filter(capability => capability.compile.outcome !== "research");
const downstreamCapabilities = capabilities.filter(capability =>
  capability.status === "supported" || capability.status === "partial"
);
const terminalStatusCapabilities = capabilities.filter(capability =>
  capability.status === "diagnostic" || capability.status === "unsupported"
);

export function registerContractCases(): void {
  describe("WSDL capability conformance contracts", () => {
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
        expect(isWithinRoot(fixturesRoot, fixturePathFor(capability)), capability.id).toBe(true);
        expect(existsSync(fixturePathFor(capability)), capability.id).toBe(true);
      }
    });

    test("keeps schema imports and includes inside conformance fixtures", () => {
      expect(() => validateAllConformanceFixtureGraphs()).not.toThrow();
    });

    for (const capability of terminalStatusCapabilities) {
      test(`${capability.id} has executable terminal compile evidence`, () => {
        expect(capability.compile.outcome, capability.id).not.toBe("research");
      });
    }

    for (const capability of downstreamCapabilities) {
      test(`${capability.id} declares client, OpenAPI, and gateway evidence`, () => {
        expect(capability.client, `${capability.id} client expectation`).toBeDefined();
        expect(capability.openapi, `${capability.id} OpenAPI expectation`).toBeDefined();
        expect(capability.gateway, `${capability.id} gateway expectation`).toBeDefined();
      });

      test(`${capability.id} declares generated-test and app evidence`, () => {
        expect(capability.generatedTests, `${capability.id} generated-test expectation`).toBeDefined();
        expect(capability.app, `${capability.id} app expectation`).toBeDefined();
      });
    }
  });
}

export function registerCompileCases(): void {
  describe("WSDL compile conformance", () => {
    for (const capability of runnableCapabilities) {
      test(`${capability.id} satisfies its compile expectation`, async context => {
        const work = runCompileCase(capability, context.signal);
        context.onTestFinished(async () => {await work.catch(() => undefined);}, CONFORMANCE_CLEANUP_TIMEOUT_MS);
        await work;
      });
    }
  });
}

export function registerClientCases(): void {
  describe("WSDL client conformance", () => {
    for (const capability of downstreamCapabilities) {
      test(`${capability.id} satisfies its client expectation`, async context => {
        const work = runClientCase(capability, context.signal);
        context.onTestFinished(async () => {await work.catch(() => undefined);}, CONFORMANCE_CLEANUP_TIMEOUT_MS);
        await work;
      }, CONFORMANCE_COMMAND_TIMEOUT_MS + CONFORMANCE_CLEANUP_TIMEOUT_MS);
    }
  });
}

export function registerOpenApiCases(): void {
  describe("WSDL OpenAPI conformance", () => {
    for (const capability of downstreamCapabilities) {
      test(`${capability.id} satisfies its OpenAPI expectation`, async context => {
        const work = runOpenApiCase(capability, context.signal);
        context.onTestFinished(async () => {await work.catch(() => undefined);}, CONFORMANCE_CLEANUP_TIMEOUT_MS);
        await work;
      });
    }
  });
}

export function registerGatewayCases(): void {
  describe("WSDL gateway conformance", () => {
    for (const capability of downstreamCapabilities) {
      test(`${capability.id} satisfies its gateway expectation`, async context => {
        const work = runGatewayCase(capability, context.signal);
        context.onTestFinished(async () => {await work.catch(() => undefined);}, CONFORMANCE_CLEANUP_TIMEOUT_MS);
        await work;
      }, CONFORMANCE_COMMAND_TIMEOUT_MS + CONFORMANCE_CLEANUP_TIMEOUT_MS);
    }
  });
}

export function registerGeneratedTestCases(): void {
  describe("WSDL generated-test conformance", () => {
    for (const capability of downstreamCapabilities) {
      test(`${capability.id} satisfies its generated-test expectation`, async context => {
        const work = runGeneratedTestsCase(capability, context.signal);
        context.onTestFinished(async () => {await work.catch(() => undefined);}, CONFORMANCE_CLEANUP_TIMEOUT_MS);
        await work;
      }, 2 * CONFORMANCE_COMMAND_TIMEOUT_MS + CONFORMANCE_CLEANUP_TIMEOUT_MS);
    }
  });
}

export function registerAppCases(): void {
  describe("WSDL app conformance", () => {
    for (const capability of downstreamCapabilities) {
      test(`${capability.id} satisfies its app expectation`, async context => {
        const work = runAppCase(capability, context.signal);
        context.onTestFinished(async () => {await work.catch(() => undefined);}, CONFORMANCE_CLEANUP_TIMEOUT_MS);
        await work;
      }, 2 * CONFORMANCE_COMMAND_TIMEOUT_MS + CONFORMANCE_CLEANUP_TIMEOUT_MS);
    }
  });
}
