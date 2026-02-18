import { describe, it, expect, beforeAll } from "vitest";
import { runGenerationPipeline } from "../../src/pipeline.js";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

/**
 * Recursively collect all files under a directory, sorted for determinism.
 */
function walkDir(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkDir(full));
    } else {
      files.push(full);
    }
  }
  return files.sort();
}

/**
 * Normalize path separators to forward slashes for cross-platform snapshot stability.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

describe("pipeline snapshot", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), "wsdl-snap-"));
    await runGenerationPipeline({
      wsdl: "examples/minimal/weather.wsdl",
      catalogOut: join(outDir, "client", "catalog.json"),
      clientOutDir: join(outDir, "client"),
      openapi: {
        outFile: join(outDir, "openapi.json"),
        format: "json",
      },
      gateway: {
        outDir: join(outDir, "gateway"),
        versionSlug: "v1",
        serviceSlug: "weather",
      },
      test: {
        testDir: join(outDir, "tests"),
        force: false,
      },
    });
  }, 60_000);

  // --- Client artifacts ---

  it("client/client.ts", () => {
    const content = readFileSync(join(outDir, "client", "client.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("client/types.ts", () => {
    const content = readFileSync(join(outDir, "client", "types.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("client/utils.ts", () => {
    const content = readFileSync(join(outDir, "client", "utils.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("client/catalog.json", () => {
    const content = readFileSync(join(outDir, "client", "catalog.json"), "utf-8");
    const parsed = JSON.parse(content);
    // Sanitize non-deterministic fields that contain temp directory paths
    if (parsed.options?.out) {
      parsed.options.out = "<SANITIZED_OUT_DIR>";
    }
    if (parsed.options?.wsdl && !parsed.options.wsdl.startsWith("http")) {
      // Keep the relative path form if it's a local file reference
      parsed.options.wsdl = parsed.options.wsdl.replace(/\\/g, "/");
    }
    expect(parsed).toMatchSnapshot();
  });

  // --- OpenAPI spec ---

  it("openapi.json", () => {
    const content = readFileSync(join(outDir, "openapi.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed).toMatchSnapshot();
  });

  // --- Gateway core files ---

  it("gateway/plugin.ts", () => {
    const content = readFileSync(join(outDir, "gateway", "plugin.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("gateway/routes.ts", () => {
    const content = readFileSync(join(outDir, "gateway", "routes.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("gateway/schemas.ts", () => {
    const content = readFileSync(join(outDir, "gateway", "schemas.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("gateway/runtime.ts", () => {
    const content = readFileSync(join(outDir, "gateway", "runtime.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("gateway/_typecheck.ts", () => {
    const content = readFileSync(join(outDir, "gateway", "_typecheck.ts"), "utf-8");
    expect(content).toMatchSnapshot();
  });

  // --- Gateway route files ---

  it("gateway/routes/getcityforecastbyzip.ts", () => {
    const content = readFileSync(
      join(outDir, "gateway", "routes", "getcityforecastbyzip.ts"),
      "utf-8"
    );
    expect(content).toMatchSnapshot();
  });

  it("gateway/routes/getcityweatherbyzip.ts", () => {
    const content = readFileSync(
      join(outDir, "gateway", "routes", "getcityweatherbyzip.ts"),
      "utf-8"
    );
    expect(content).toMatchSnapshot();
  });

  it("gateway/routes/getweatherinformation.ts", () => {
    const content = readFileSync(
      join(outDir, "gateway", "routes", "getweatherinformation.ts"),
      "utf-8"
    );
    expect(content).toMatchSnapshot();
  });

  // --- Gateway schema JSON files (dynamic) ---

  describe("gateway schemas", () => {
    it("all model and operation schema files match snapshots", () => {
      const schemasDir = join(outDir, "gateway", "schemas");
      const jsonFiles = walkDir(schemasDir).filter((f) => f.endsWith(".json"));

      expect(jsonFiles.length).toBeGreaterThan(0);

      for (const file of jsonFiles) {
        const relPath = normalizePath(file.slice(outDir.length + 1));
        const content = readFileSync(file, "utf-8");
        const parsed = JSON.parse(content);
        expect(parsed).toMatchSnapshot(relPath);
      }
    });
  });

  // --- Generated test suite ---

  it("tests/helpers/mock-client.ts", () => {
    const filePath = join(outDir, "tests", "helpers", "mock-client.ts");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatchSnapshot();
  });

  it("tests/gateway/routes.test.ts", () => {
    const filePath = join(outDir, "tests", "gateway", "routes.test.ts");
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, "utf-8");
    expect(content).toMatchSnapshot();
  });

  // --- File inventory (catch new/removed files) ---

  it("generates the expected set of files", () => {
    const allFiles = walkDir(outDir)
      .map((f) => normalizePath(f.slice(outDir.length + 1)))
      .sort();
    expect(allFiles).toMatchSnapshot();
  });
});
