import {mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {parseStreamConfig, runGenerationPipeline} from "../../src/index.js";

const WSDL = join(import.meta.dirname, "..", "..", "examples", "minimal", "weather.wsdl");

type OpenApiTestDocument = {
  paths: Record<string, {
    post: {
      responses: Record<string, {
        content: Record<string, {
          schema: unknown;
          "x-wsdl-tsc-stream"?: unknown;
        }>;
      }>;
    };
  }>;
};

function weatherStreamConfig(format: "ndjson" | "json-array") {
  return parseStreamConfig({
    operations: {
      GetWeatherInformation: {
        format,
        recordType: "WeatherDescription",
        recordPath: [
          "GetWeatherInformationResponse",
          "GetWeatherInformationResult",
          "WeatherDescription",
        ],
      },
    },
  });
}

async function generateOpenApiForStream(format: "ndjson" | "json-array"): Promise<OpenApiTestDocument> {
  const outDir = mkdtempSync(join(tmpdir(), `wsdl-openapi-stream-${format}-`));
  const {openapiDoc} = await runGenerationPipeline({
    wsdl: WSDL,
    catalogOut: join(outDir, "client", "catalog.json"),
    clientOutDir: join(outDir, "client"),
    openapi: {
      outFile: join(outDir, "openapi.json"),
      format: "json",
      skipValidate: true,
    },
    streamConfig: weatherStreamConfig(format),
  });
  if (!openapiDoc) {
    throw new Error("expected pipeline to return an OpenAPI document");
  }
  return openapiDoc as OpenApiTestDocument;
}

describe("OpenAPI stream responses", () => {
  it("keeps NDJSON streams as a string response with stream metadata", async () => {
    const doc = await generateOpenApiForStream("ndjson");
    const response200 = doc.paths["/get-weather-information"].post.responses["200"];
    const entry = response200.content["application/x-ndjson"];

    expect(entry.schema).toEqual({type: "string"});
    expect(entry["x-wsdl-tsc-stream"]).toEqual({
      format: "ndjson",
      itemSchema: {$ref: "#/components/schemas/WeatherDescription"},
    });
  });

  it("emits JSON array streams as application/json arrays with stream metadata", async () => {
    const doc = await generateOpenApiForStream("json-array");
    const response200 = doc.paths["/get-weather-information"].post.responses["200"];
    const entry = response200.content["application/json"];

    expect(entry.schema).toEqual({
      type: "array",
      items: {$ref: "#/components/schemas/WeatherDescription"},
    });
    expect(entry["x-wsdl-tsc-stream"]).toEqual({
      format: "json-array",
      itemSchema: {$ref: "#/components/schemas/WeatherDescription"},
    });
  });
});
