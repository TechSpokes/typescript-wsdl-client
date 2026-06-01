import { describe, expect, it } from "vitest";
import { selectExpectedRange } from "../../scripts/lib/deps.mjs";

describe("selectExpectedRange", () => {
  it("keeps a newer current semver range when the registry latest tag points backward", () => {
    expect(selectExpectedRange("^4.1.7", "3.2.5")).toBe("^4.1.7");
  });

  it("updates an older current semver range to the registry latest version", () => {
    expect(selectExpectedRange("^4.1.1", "4.2.0")).toBe("^4.2.0");
  });

  it("uses the registry latest version when no current range exists", () => {
    expect(selectExpectedRange(undefined, "1.2.3")).toBe("^1.2.3");
  });
});
