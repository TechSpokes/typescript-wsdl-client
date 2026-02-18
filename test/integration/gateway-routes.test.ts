/**
 * Integration tests for generated gateway route handlers.
 *
 * These tests run the full pipeline to generate gateway code, then dynamically
 * import the generated Fastify plugin, register it with a mock SOAP client,
 * and test routes via Fastify's inject() — no real HTTP server needed.
 *
 * Mock response data uses the wrapper-shaped structure that real SOAP clients
 * return (e.g., { Forecast: [...] } for ArrayOfForecast). The generated
 * unwrapArrayWrappers() function strips these wrappers at runtime so the
 * response matches the flattened OpenAPI array schemas.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import Fastify, { type FastifyInstance } from "fastify";
import { runGenerationPipeline } from "../../src/pipeline.js";

// ── Paths ──────────────────────────────────────────────────

const WSDL = join(import.meta.dirname, "..", "..", "examples", "minimal", "weather.wsdl");
let outDir: string;

// ── Mock client ────────────────────────────────────────────

interface MockOperations {
  GetWeatherInformation(args: unknown): Promise<{ response: unknown; headers: unknown }>;
  GetCityForecastByZIP(args: unknown): Promise<{ response: unknown; headers: unknown }>;
  GetCityWeatherByZIP(args: unknown): Promise<{ response: unknown; headers: unknown }>;
}

/**
 * Creates a mock SOAP client.
 *
 * Response shapes match the real SOAP client wrapper structure (TypeScript
 * interfaces). ArrayOf* types use wrapper objects (e.g., { Forecast: [...] }).
 * The generated unwrapArrayWrappers() function strips these at runtime so
 * Fastify's serializer sees the flat arrays matching the OpenAPI schemas.
 */
function createMockClient(overrides: Partial<MockOperations> = {}): MockOperations {
  return {
    GetWeatherInformation: async () => ({
      response: {
        // Real SOAP returns wrapper: { WeatherDescription: [...] }
        // unwrapArrayWrappers strips it to plain array for the schema
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
          // Real SOAP returns wrapper: { Forecast: [...] }
          // unwrapArrayWrappers strips it to plain array for the schema
          ForecastResult: { Forecast: [] },
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
    ...overrides,
  };
}

// ── Helpers ────────────────────────────────────────────────

/** Create a Fastify app with the generated gateway plugin and a mock client */
async function createTestApp(mockClient: MockOperations): Promise<FastifyInstance> {
  const pluginPath = pathToFileURL(join(outDir, "gateway", "plugin.ts")).href;
  const pluginModule = await import(pluginPath);
  const gatewayPlugin = pluginModule.default;

  const app = Fastify({ logger: false });
  await app.register(gatewayPlugin, { client: mockClient });
  await app.ready();
  return app;
}

// ── Setup ──────────────────────────────────────────────────

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), "wsdl-integ-"));
  await runGenerationPipeline({
    wsdl: WSDL,
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
  });
}, 30_000);

afterAll(() => {
  if (outDir) {
    rmSync(outDir, { recursive: true, force: true });
  }
});

// ── Happy-path tests ───────────────────────────────────────

describe("gateway routes — happy path", () => {
  it("POST /get-city-weather-by-zip returns SUCCESS envelope", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("SUCCESS");
      expect(body.data).toBeDefined();
      expect(body.data.GetCityWeatherByZIPResult.City).toBe("New York");
      expect(body.error).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("POST /get-city-forecast-by-zip returns SUCCESS envelope with unwrapped arrays", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-forecast-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("SUCCESS");
      expect(body.data.GetCityForecastByZIPResult.Success).toBe(true);
      // ForecastResult should be unwrapped from { Forecast: [] } to []
      expect(Array.isArray(body.data.GetCityForecastByZIPResult.ForecastResult)).toBe(true);
      expect(body.error).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("POST /get-weather-information returns SUCCESS envelope (empty body)", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-weather-information",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("SUCCESS");
      expect(body.data.GetWeatherInformationResult).toHaveLength(1);
      expect(body.error).toBeNull();
    } finally {
      await app.close();
    }
  });

  it("passes request body to mock client", async () => {
    let receivedArgs: unknown;
    const app = await createTestApp(
      createMockClient({
        GetCityWeatherByZIP: async (args) => {
          receivedArgs = args;
          return {
            response: { GetCityWeatherByZIPResult: { Success: true, WeatherID: 1 } },
            headers: {},
          };
        },
      })
    );
    try {
      await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "90210" },
      });
      expect(receivedArgs).toEqual({ ZIP: "90210" });
    } finally {
      await app.close();
    }
  });
});

// ── Envelope structure tests ───────────────────────────────

describe("gateway routes — envelope structure", () => {
  it("success envelope has correct shape", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      const body = res.json();
      expect(body).toHaveProperty("status", "SUCCESS");
      expect(body).toHaveProperty("message", null);
      expect(body).toHaveProperty("data");
      expect(body).toHaveProperty("error", null);
    } finally {
      await app.close();
    }
  });

  it("error envelope has correct shape on generic error", async () => {
    const app = await createTestApp(
      createMockClient({
        GetCityWeatherByZIP: async () => {
          throw new Error("something broke");
        },
      })
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      // Generic errors produce details: undefined, which serializes to null — matches schema
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body).toHaveProperty("status", "ERROR");
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("data", null);
      expect(body.error).toHaveProperty("code", "INTERNAL_ERROR");
      expect(body.error).toHaveProperty("message");
    } finally {
      await app.close();
    }
  });
});

// ── Error classification tests ─────────────────────────────

describe("gateway routes — error classification", () => {
  it("returns 502 SOAP_FAULT on SOAP fault error", async () => {
    const app = await createTestApp(
      createMockClient({
        GetCityWeatherByZIP: async () => {
          throw Object.assign(new Error("SOAP fault"), {
            root: {
              Envelope: {
                Body: {
                  Fault: {
                    faultcode: "soap:Server",
                    faultstring: "Invalid ZIP code",
                  },
                },
              },
            },
          });
        },
      })
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "00000" },
      });
      // SOAP fault details is an object → matches the error schema
      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.status).toBe("ERROR");
      expect(body.error.code).toBe("SOAP_FAULT");
      expect(body.error.message).toBe("Invalid ZIP code");
    } finally {
      await app.close();
    }
  });

  it("classifyError returns 503 for ECONNREFUSED", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { classifyError } = await import(runtimePath);
    const result = classifyError(new Error("connect ECONNREFUSED 127.0.0.1:80"));
    expect(result.httpStatus).toBe(503);
    expect(result.code).toBe("SERVICE_UNAVAILABLE");
    expect(result.details).toEqual({ message: "connect ECONNREFUSED 127.0.0.1:80" });
  });

  it("classifyError returns 503 for ENOTFOUND", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { classifyError } = await import(runtimePath);
    const result = classifyError(new Error("getaddrinfo ENOTFOUND soap.example.com"));
    expect(result.httpStatus).toBe(503);
    expect(result.code).toBe("SERVICE_UNAVAILABLE");
    expect(result.details).toEqual({ message: expect.stringContaining("ENOTFOUND") });
  });

  it("classifyError returns 504 for ETIMEDOUT", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { classifyError } = await import(runtimePath);
    const result = classifyError(new Error("ETIMEDOUT"));
    expect(result.httpStatus).toBe(504);
    expect(result.code).toBe("GATEWAY_TIMEOUT");
    expect(result.details).toEqual({ message: "ETIMEDOUT" });
  });

  it("classifyError returns 504 for timeout", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { classifyError } = await import(runtimePath);
    const result = classifyError(new Error("Request timeout after 30000ms"));
    expect(result.httpStatus).toBe(504);
    expect(result.code).toBe("GATEWAY_TIMEOUT");
    expect(result.details).toEqual({ message: "Request timeout after 30000ms" });
  });

  it("classifyError returns 500 for unknown errors", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { classifyError } = await import(runtimePath);
    const result = classifyError(new Error("something unexpected"));
    expect(result.httpStatus).toBe(500);
    expect(result.code).toBe("INTERNAL_ERROR");
  });

  it("classifyError returns 400 for validation errors", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { classifyError } = await import(runtimePath);
    const err = Object.assign(new Error("Validation failed"), {
      validation: [{ message: "body/ZIP must be string", keyword: "type" }],
    });
    const result = classifyError(err);
    expect(result.httpStatus).toBe(400);
    expect(result.code).toBe("VALIDATION_ERROR");
    expect(result.details).toEqual({
      validationErrors: [{ message: "body/ZIP must be string", keyword: "type" }],
    });
  });

  it("connection errors through Fastify produce 503 response", async () => {
    const app = await createTestApp(
      createMockClient({
        GetCityWeatherByZIP: async () => {
          throw new Error("connect ECONNREFUSED 127.0.0.1:80");
        },
      })
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.status).toBe("ERROR");
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.details).toEqual({
        message: "connect ECONNREFUSED 127.0.0.1:80",
      });
    } finally {
      await app.close();
    }
  });

  it("timeout errors through Fastify produce 504 response", async () => {
    const app = await createTestApp(
      createMockClient({
        GetCityWeatherByZIP: async () => {
          throw new Error("ETIMEDOUT");
        },
      })
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(504);
      const body = res.json();
      expect(body.status).toBe("ERROR");
      expect(body.error.code).toBe("GATEWAY_TIMEOUT");
      expect(body.error.details).toEqual({ message: "ETIMEDOUT" });
    } finally {
      await app.close();
    }
  });
});

// ── Validation tests ───────────────────────────────────────

describe("gateway routes — request handling", () => {
  it("accepts valid payload with optional fields", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("accepts empty body for operations with no required fields", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-weather-information",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("accepts empty body for operations with all-optional fields", async () => {
    const app = await createTestApp(createMockClient());
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: {},
      });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  // NOTE: Fastify enables type coercion by default (ajv coerceTypes: true),
  // so integer 12345 is coerced to string "12345" for ZIP. This is standard
  // Fastify behavior — the generated schemas don't override it.
  it("coerces integer to string for string-typed fields (Fastify default)", async () => {
    let receivedArgs: unknown;
    const app = await createTestApp(
      createMockClient({
        GetCityWeatherByZIP: async (args) => {
          receivedArgs = args;
          return {
            response: { GetCityWeatherByZIPResult: { Success: true, WeatherID: 1 } },
            headers: {},
          };
        },
      })
    );
    try {
      const res = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: 12345 },
      });
      expect(res.statusCode).toBe(200);
      // Fastify coerces the integer to a string
      expect(receivedArgs).toEqual({ ZIP: "12345" });
    } finally {
      await app.close();
    }
  });
});

// ── Plugin behavior tests ──────────────────────────────────

describe("gateway plugin — behavior", () => {
  it("applies prefix when provided", async () => {
    const pluginPath = pathToFileURL(join(outDir, "gateway", "plugin.ts")).href;
    const pluginModule = await import(pluginPath);

    const app = Fastify({ logger: false });
    await app.register(pluginModule.default, {
      client: createMockClient(),
      prefix: "/api/v1",
    });
    await app.ready();

    try {
      // Route without prefix should 404
      const res404 = await app.inject({
        method: "POST",
        url: "/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res404.statusCode).toBe(404);

      // Route with prefix should work
      const res200 = await app.inject({
        method: "POST",
        url: "/api/v1/get-city-weather-by-zip",
        payload: { ZIP: "10001" },
      });
      expect(res200.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it("decorates fastify instance with client", async () => {
    const mockClient = createMockClient();
    const pluginPath = pathToFileURL(join(outDir, "gateway", "plugin.ts")).href;
    const pluginModule = await import(pluginPath);

    const app = Fastify({ logger: false });
    await app.register(pluginModule.default, { client: mockClient });
    await app.ready();

    try {
      expect(app.hasDecorator("weatherClient")).toBe(true);
    } finally {
      await app.close();
    }
  });
});

// ── Runtime utility tests ──────────────────────────────────

describe("gateway runtime — envelope builders", () => {
  it("buildSuccessEnvelope produces correct structure", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { buildSuccessEnvelope } = await import(runtimePath);

    const envelope = buildSuccessEnvelope({ foo: "bar" });
    expect(envelope).toEqual({
      status: "SUCCESS",
      message: null,
      data: { foo: "bar" },
      error: null,
    });
  });

  it("buildSuccessEnvelope accepts optional message", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { buildSuccessEnvelope } = await import(runtimePath);

    const envelope = buildSuccessEnvelope({ foo: "bar" }, "All good");
    expect(envelope.message).toBe("All good");
  });

  it("buildErrorEnvelope produces correct structure", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { buildErrorEnvelope } = await import(runtimePath);

    const envelope = buildErrorEnvelope("SOME_ERROR", "Something failed");
    expect(envelope).toEqual({
      status: "ERROR",
      message: "Something failed",
      data: null,
      error: { code: "SOME_ERROR", message: "Something failed" },
    });
  });

  it("buildErrorEnvelope includes details when provided", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { buildErrorEnvelope } = await import(runtimePath);

    const envelope = buildErrorEnvelope("SOME_ERROR", "Failed", { reason: "timeout" });
    expect(envelope.error.details).toEqual({ reason: "timeout" });
  });
});

// ── unwrapArrayWrappers tests ──────────────────────────────

describe("gateway runtime — unwrapArrayWrappers", () => {
  it("unwraps ArrayOf* wrapper objects to flat arrays", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { unwrapArrayWrappers } = await import(runtimePath);

    // ArrayOfWeatherDescription has inner key "WeatherDescription"
    const wrapped = { WeatherDescription: [{ WeatherID: 1 }] };
    const result = unwrapArrayWrappers(wrapped, "ArrayOfWeatherDescription");
    expect(result).toEqual([{ WeatherID: 1 }]);
  });

  it("returns empty array when inner key is missing", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { unwrapArrayWrappers } = await import(runtimePath);

    const result = unwrapArrayWrappers({}, "ArrayOfForecast");
    expect(result).toEqual([]);
  });

  it("recursively unwraps nested wrapper fields", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { unwrapArrayWrappers } = await import(runtimePath);

    // ForecastReturn has a ForecastResult field of type ArrayOfForecast
    const data = {
      Success: true,
      ForecastResult: { Forecast: [{ Temperature: "72" }] },
    };
    const result = unwrapArrayWrappers(data, "ForecastReturn") as any;
    expect(result.Success).toBe(true);
    expect(result.ForecastResult).toEqual([{ Temperature: "72" }]);
  });

  it("is a no-op for types without wrapper fields", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { unwrapArrayWrappers } = await import(runtimePath);

    const data = { Success: true, City: "NYC" };
    const result = unwrapArrayWrappers(data, "WeatherReturn");
    expect(result).toEqual({ Success: true, City: "NYC" });
  });

  it("returns null/undefined/primitives unchanged", async () => {
    const runtimePath = pathToFileURL(join(outDir, "gateway", "runtime.ts")).href;
    const { unwrapArrayWrappers } = await import(runtimePath);

    expect(unwrapArrayWrappers(null, "Anything")).toBeNull();
    expect(unwrapArrayWrappers(undefined, "Anything")).toBeUndefined();
    expect(unwrapArrayWrappers("hello", "Anything")).toBe("hello");
    expect(unwrapArrayWrappers(42, "Anything")).toBe(42);
  });
});
