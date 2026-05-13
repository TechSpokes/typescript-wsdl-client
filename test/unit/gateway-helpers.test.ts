import {describe, expect, it} from "vitest";
import {slugName} from "../../src/gateway/helpers.js";

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
