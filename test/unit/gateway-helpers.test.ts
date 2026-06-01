import {describe, expect, it} from "vitest";
import {measureSchemaRefComplexity, slugName} from "../../src/gateway/helpers.js";

describe("slugName", () => {
  it("normalizes names to lowercase underscore slugs", () => {
    expect(slugName("User-Profile_Data")).toBe("user_profile_data");
  });

  it("strips long leading and trailing separator runs", () => {
    expect(slugName(`${"_".repeat(5000)}GetWeather${"_".repeat(5000)}`)).toBe("getweather");
  });

  it("preserves the existing empty result for separator-only names", () => {
    expect(slugName("___")).toBe("");
  });
});

describe("measureSchemaRefComplexity", () => {
  it("counts references inside composed schema branches", () => {
    const schemas = {
      Envelope: {
        type: "object",
        properties: {
          data: {
            oneOf: [
              {$ref: "#/components/schemas/EmailChoice"},
              {
                anyOf: [
                  {$ref: "#/components/schemas/PhoneChoice"},
                  {$ref: "#/components/schemas/FallbackChoice"},
                ],
              },
            ],
          },
        },
        allOf: [{$ref: "#/components/schemas/BaseEnvelope"}],
      },
      BaseEnvelope: {type: "object"},
      EmailChoice: {type: "object"},
      PhoneChoice: {type: "object"},
      FallbackChoice: {type: "object"},
    };

    expect(measureSchemaRefComplexity("Envelope", schemas)).toBe(5);
  });
});
