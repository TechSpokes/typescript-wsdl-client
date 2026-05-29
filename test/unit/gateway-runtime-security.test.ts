import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { emitRuntimeModule } from "../../src/gateway/generators.js";

const tempRoots: string[] = [];

function createFixtureRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `wsdl-${name}-`));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("generated gateway runtime hardening", () => {
  it("does not assign through prototype keys while unwrapping child fields", async () => {
    const outDir = createFixtureRoot("runtime-security");
    emitRuntimeModule(outDir, "v1", "weather", {
      types: [{ name: "ArrayOfSafe", attrs: [], elems: [{ name: "Item", max: "unbounded" }] }],
      meta: {
        childType: {
          UnsafeContainer: {
            __proto__: "ArrayOfSafe",
            constructor: "ArrayOfSafe",
            prototype: "ArrayOfSafe",
            safe: "ArrayOfSafe",
          },
          ArrayOfSafe: { Item: "SafeItem" },
        },
      },
    });

    const runtimePath = `${pathToFileURL(join(outDir, "runtime.ts")).href}?security=${Date.now()}`;
    const runtime = await import(runtimePath);
    const data: Record<string, unknown> = { safe: { Item: [{ value: 1 }] } };
    const originalPrototype = Object.getPrototypeOf(data);

    const result = runtime.unwrapArrayWrappers(data, "UnsafeContainer");

    expect(result).toBe(data);
    expect(Object.getPrototypeOf(data)).toBe(originalPrototype);
    expect(Object.hasOwn(data, "constructor")).toBe(false);
    expect(Object.hasOwn(data, "prototype")).toBe(false);
    expect(data.safe).toEqual([{ value: 1 }]);
  });
});
