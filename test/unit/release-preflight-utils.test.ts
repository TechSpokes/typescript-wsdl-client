import { describe, expect, it } from "vitest";
import { findDatedChangelogSection } from "../../scripts/lib/release-preflight-utils.mjs";

describe("findDatedChangelogSection", () => {
  it("finds a dated semver changelog section", () => {
    const result = findDatedChangelogSection(["## [0.24.0] - 2026-05-29"], "0.24.0");

    expect(result).toEqual({ index: 0, dateString: "2026-05-29" });
  });

  it("matches versions literally without interpolating them into a regex", () => {
    const result = findDatedChangelogSection(["## [1\\2\\3] - 2026-05-29"], "1\\2\\3");

    expect(result).toEqual({ index: 0, dateString: "2026-05-29" });
  });
});
