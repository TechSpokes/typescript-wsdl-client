/**
 * Tests for --openapi-flatten-array-wrappers flag in both modes.
 *
 * Verifies that:
 * - With flattenArrayWrappers: true (default): ArrayOf* schemas are type: "array",
 *   runtime.ts contains unwrapArrayWrappers(), route files import it, and
 *   wrapper-shaped SOAP responses are correctly unwrapped.
 * - With flattenArrayWrappers: false: ArrayOf* schemas are type: "object",
 *   runtime.ts does NOT contain unwrapArrayWrappers(), route files use plain
 *   buildSuccessEnvelope(), and SOAP wrapper objects pass through unchanged.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
// noinspection ES6PreferShortImport
import { runGenerationPipeline } from "../../src/pipeline.js";

// ── Paths ──────────────────────────────────────────────────

const WSDL = join(import.meta.dirname, "..", "..", "examples", "minimal", "weather.wsdl");

// ── Mock client ────────────────────────────────────────────

interface MockOperations {
  GetWeatherInformation(args: unknown): Promise<{ response: unknown; headers: unknown }>;
  GetCityForecastByZIP(args: unknown): Promise<{ response: unknown; headers: unknown }>;
  GetCityWeatherByZIP(args: unknown): Promise<{ response: unknown; headers: unknown }>;
}

/**
 * Creates a mock SOAP client returning wrapper-shaped data (matching real SOAP).
 */
function createWrapperMockClient(): MockOperations {
  return {
    GetWeatherInformation: async () => ({
      response: {
        GetWeatherInformationResult: {
          WeatherDescription: [
            { WeatherID: 1, Description: "Sunny", PictureURL: "https://example.com/sunny.png" },
          ],
        },
      },
      headers: {},
    }),
    GetCityForecastByZIP: async () => ({
      response: {
        GetCityForecastByZIPResult: {
          Success: true,
          City: "New York",
          ForecastResult: {
            Forecast: [
              {
                Date: "2026-02-18T00:00:00",
                WeatherID: 1,
                Desciption: "Sunny",
                Temperatures: { MorningLow: "40", DaytimeHigh: "72" },
                ProbabilityOfPrecipiation: { Nighttime: "10", Daytime: "5" },
              },
            ],
          },
        },
      },
      headers: {},
    }),
    GetCityWeatherByZIP: async () => ({
      response: {
        GetCityWeatherByZIPResult: {
          Success: true,
          WeatherID: 1,
          City: "New York",
          Temperature: "72",
          Description: "Sunny",
        },
      },
      headers: {},
    }),
  };
}

// ── Helpers ────────────────────────────────────────────────

async function createTestApp(outDir: string, mockClient: MockOperations): Promise<FastifyInstance> {
  const pluginPath = pathToFileURL(join(outDir, "gateway", "plugin.ts")).href;
  const pluginModule = await import(pluginPath);
  const app = Fastify({ logger: false });
  await app.register(pluginModule.default, { client: mockClient });
  await app.ready();
  return app;
}

// ══════════════════════════════════════════════════════════════
// flattenArrayWrappers: true (default)
// ══════════════════════════════════════════════════════════════

describe("flattenArrayWrappers: true (default)", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), "wsdl-flat-true-"));
    await runGenerationPipeline({
      wsdl: WSDL,
      catalogOut: join(outDir, "client", "catalog.json"),
      clientOutDir: join(outDir, "client"),
      openapi: {
        outFile: join(outDir, "openapi.json"),
        format: "json",
        flattenArrayWrappers: true,
      },
      gateway: {
        outDir: join(outDir, "gateway"),
        versionSlug: "v1",
        serviceSlug: "weather",
      },
    });
  }, 30_000);

  afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  // --- Schema structure ---

  it("ArrayOf* schemas are type: 'array' in OpenAPI", () => {
    const openapi = JSON.parse(readFileSync(join(outDir, "openapi.json"), "utf-8"));
    const schemas = openapi.components.schemas;

    // Find ArrayOf* schemas
    const arrayOfNames = Object.keys(schemas).filter((n) => n.startsWith("ArrayOf"));
    expect(arrayOfNames.length).toBeGreaterThan(0);

    for (const name of arrayOfNames) {
      expect(schemas[name].type).toBe("array");
      expect(schemas[name].items).toBeDefined();
      // Should NOT have properties (it's a flat array, not an object wrapper)
      expect(schemas[name].properties).toBeUndefined();
    }
  });

  it("ArrayOf* JSON Schema model files use type: 'array'", () => {
    const modelsDir = join(outDir, "gateway", "schemas", "models");
    const modelFiles = readdirSync(modelsDir).filter((f) => f.endsWith(".json"));

    const arrayOfFiles = modelFiles.filter((f) => f.startsWith("arrayof"));
    expect(arrayOfFiles.length).toBeGreaterThan(0);

    for (const file of arrayOfFiles) {
      const schema = JSON.parse(readFileSync(join(modelsDir, file), "utf-8"));
      expect(schema.type).toBe("array");
      expect(schema.items).toBeDefined();
    }
  });

  // --- Runtime unwrap ---

  it("runtime.ts contains unwrapArrayWrappers function", () => {
    const runtimeContent = readFileSync(join(outDir, "gateway", "runtime.ts"), "utf-8");
    expect(runtimeContent).toContain("export function unwrapArrayWrappers");
    expect(runtimeContent).toContain("ARRAY_WRAPPERS");
    expect(runtimeContent).toContain("CHILDREN_TYPES");
  });

  it("runtime.ts ARRAY_WRAPPERS map contains ArrayOf* entries", () => {
    const runtimeContent = readFileSync(join(outDir, "gateway", "runtime.ts"), "utf-8");
    // The map should contain entries like "ArrayOfForecast": "Forecast"
    expect(runtimeContent).toContain("ArrayOfForecast");
    expect(runtimeContent).toContain("ArrayOfWeatherDescription");
  });

  // --- Route files ---

  it("route files import unwrapArrayWrappers", () => {
    const routesDir = join(outDir, "gateway", "routes");
    const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const content = readFileSync(join(routesDir, file), "utf-8");
      expect(content).toContain("unwrapArrayWrappers");
      expect(content).toContain("import { buildSuccessEnvelope, unwrapArrayWrappers }");
    }
  });

  it("route handlers call unwrapArrayWrappers with response type name", () => {
    const routesDir = join(outDir, "gateway", "routes");
    const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));

    for (const file of routeFiles) {
      const content = readFileSync(join(routesDir, file), "utf-8");
      // Pattern: unwrapArrayWrappers(result.response, "SomeTypeName")
      expect(content).toMatch(/unwrapArrayWrappers\(result\.response,\s*"[A-Z]\w+"\)/);
    }
  });

  // --- End-to-end unwrap ---

  it("unwraps ArrayOf* wrapper in GET weather information response", async () => {
    const app = await createTestApp(outDir, createWrapperMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-weather-information",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // GetWeatherInformationResult was { WeatherDescription: [...] }
      // After unwrap it should be a flat array
      expect(Array.isArray(body.data.GetWeatherInformationResult)).toBe(true);
      expect(body.data.GetWeatherInformationResult).toHaveLength(1);
      expect(body.data.GetWeatherInformationResult[0].WeatherID).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("unwraps nested ArrayOf* wrapper in forecast response", async () => {
    const app = await createTestApp(outDir, createWrapperMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-forecast-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // ForecastResult was { Forecast: [...] }, should be unwrapped to [...]
      expect(Array.isArray(body.data.GetCityForecastByZIPResult.ForecastResult)).toBe(true);
      expect(body.data.GetCityForecastByZIPResult.ForecastResult).toHaveLength(1);
      expect(body.data.GetCityForecastByZIPResult.ForecastResult[0].WeatherID).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("non-wrapper types pass through unchanged", async () => {
    const app = await createTestApp(outDir, createWrapperMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // WeatherReturn has no array wrappers, should pass through
      expect(body.data.GetCityWeatherByZIPResult.City).toBe("New York");
      expect(body.data.GetCityWeatherByZIPResult.Success).toBe(true);
    } finally {
      await app.close();
    }
  });
});

// ══════════════════════════════════════════════════════════════
// flattenArrayWrappers: false
// ══════════════════════════════════════════════════════════════

describe("flattenArrayWrappers: false", () => {
  let outDir: string;

  beforeAll(async () => {
    outDir = mkdtempSync(join(tmpdir(), "wsdl-flat-false-"));
    await runGenerationPipeline({
      wsdl: WSDL,
      catalogOut: join(outDir, "client", "catalog.json"),
      clientOutDir: join(outDir, "client"),
      openapi: {
        outFile: join(outDir, "openapi.json"),
        format: "json",
        flattenArrayWrappers: false,
        skipValidate: true, // schemas change shape, skip OpenAPI validation
      },
      gateway: {
        outDir: join(outDir, "gateway"),
        versionSlug: "v1",
        serviceSlug: "weather",
      },
    });
  }, 30_000);

  afterAll(() => {
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  // --- Schema structure ---

  it("ArrayOf* schemas are type: 'object' in OpenAPI (not flattened)", () => {
    const openapi = JSON.parse(readFileSync(join(outDir, "openapi.json"), "utf-8"));
    const schemas = openapi.components.schemas;

    const arrayOfNames = Object.keys(schemas).filter((n) => n.startsWith("ArrayOf"));
    expect(arrayOfNames.length).toBeGreaterThan(0);

    for (const name of arrayOfNames) {
      expect(schemas[name].type).toBe("object");
      expect(schemas[name].properties).toBeDefined();
      // Should NOT be a flat array
      expect(schemas[name].items).toBeUndefined();
    }
  });

  it("ArrayOf* object schemas have their inner element as a property", () => {
    const openapi = JSON.parse(readFileSync(join(outDir, "openapi.json"), "utf-8"));
    const schemas = openapi.components.schemas;

    // ArrayOfForecast should have a "Forecast" property that is an array.
    // The Forecast element is nillable, so the property is wrapped in anyOf.
    const aof = schemas["ArrayOfForecast"];
    expect(aof).toBeDefined();
    expect(aof.type).toBe("object");
    expect(aof.properties.Forecast).toBeDefined();
    // nillable="true" produces { anyOf: [{ type: "array", ... }, { type: "null" }] }
    expect(aof.properties.Forecast.anyOf).toBeDefined();
    expect(aof.properties.Forecast.anyOf[0].type).toBe("array");

    // ArrayOfWeatherDescription should have a "WeatherDescription" property
    const aowd = schemas["ArrayOfWeatherDescription"];
    expect(aowd).toBeDefined();
    expect(aowd.type).toBe("object");
    expect(aowd.properties.WeatherDescription).toBeDefined();
    expect(aowd.properties.WeatherDescription.type).toBe("array");
  });

  it("ArrayOf* JSON Schema model files use type: 'object'", () => {
    const modelsDir = join(outDir, "gateway", "schemas", "models");
    const modelFiles = readdirSync(modelsDir).filter((f) => f.endsWith(".json"));

    const arrayOfFiles = modelFiles.filter((f) => f.startsWith("arrayof"));
    expect(arrayOfFiles.length).toBeGreaterThan(0);

    for (const file of arrayOfFiles) {
      const schema = JSON.parse(readFileSync(join(modelsDir, file), "utf-8"));
      expect(schema.type).toBe("object");
      expect(schema.properties).toBeDefined();
    }
  });

  // --- Runtime: NO unwrap ---

  it("runtime.ts does NOT contain unwrapArrayWrappers", () => {
    const runtimeContent = readFileSync(join(outDir, "gateway", "runtime.ts"), "utf-8");
    expect(runtimeContent).not.toContain("unwrapArrayWrappers");
    expect(runtimeContent).not.toContain("ARRAY_WRAPPERS");
    expect(runtimeContent).not.toContain("CHILDREN_TYPES");
  });

  it("runtime.ts still contains standard envelope builders", () => {
    const runtimeContent = readFileSync(join(outDir, "gateway", "runtime.ts"), "utf-8");
    expect(runtimeContent).toContain("export function buildSuccessEnvelope");
    expect(runtimeContent).toContain("export function buildErrorEnvelope");
    expect(runtimeContent).toContain("export function classifyError");
  });

  // --- Route files: NO unwrap ---

  it("route files do NOT import unwrapArrayWrappers", () => {
    const routesDir = join(outDir, "gateway", "routes");
    const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
    expect(routeFiles.length).toBeGreaterThan(0);

    for (const file of routeFiles) {
      const content = readFileSync(join(routesDir, file), "utf-8");
      expect(content).not.toContain("unwrapArrayWrappers");
      // Should use the simple import
      expect(content).toContain("import { buildSuccessEnvelope } from");
    }
  });

  it("route handlers use buildSuccessEnvelope(result.response) directly", () => {
    const routesDir = join(outDir, "gateway", "routes");
    const routeFiles = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));

    for (const file of routeFiles) {
      const content = readFileSync(join(routesDir, file), "utf-8");
      expect(content).toContain("return buildSuccessEnvelope(result.response)");
    }
  });

  // --- End-to-end: wrapper objects pass through ---

  it("SOAP wrapper objects pass through in responses (no unwrap)", async () => {
    const app = await createTestApp(outDir, createWrapperMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-weather-information",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // Without unwrap, the wrapper object should pass through
      // GetWeatherInformationResult should be { WeatherDescription: [...] }
      expect(body.data.GetWeatherInformationResult).toHaveProperty("WeatherDescription");
      expect(Array.isArray(body.data.GetWeatherInformationResult.WeatherDescription)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("nested wrapper objects pass through in forecast response", async () => {
    const app = await createTestApp(outDir, createWrapperMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-forecast-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      // ForecastResult should remain as { Forecast: [...] } (not unwrapped)
      expect(body.data.GetCityForecastByZIPResult.ForecastResult).toHaveProperty("Forecast");
      expect(Array.isArray(body.data.GetCityForecastByZIPResult.ForecastResult.Forecast)).toBe(true);
      expect(body.data.GetCityForecastByZIPResult.ForecastResult.Forecast).toHaveLength(1);
    } finally {
      await app.close();
    }
  });
});
