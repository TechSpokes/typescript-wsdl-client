import {describe, expect, it} from "vitest";
import {classifyAbandonmentMarker, parseReleaseTag, verifyPublicationState} from "../../scripts/lib/release-state.mjs";

describe("release abandonment state", () => {
  it("derives the immutable marker from a final-form release tag", () => {
    expect(parseReleaseTag("v1.0.0")).toEqual({
      tag: "v1.0.0",
      version: "1.0.0",
      marker: "abandoned/v1.0.0",
    });
  });

  it("rejects malformed and prerelease tags", () => {
    expect(() => parseReleaseTag("1.0.0")).toThrow("must match vX.Y.Z");
    expect(() => parseReleaseTag("v1.0.0-rc.1")).toThrow("must match vX.Y.Z");
  });

  it("allows a candidate without an abandonment marker", () => {
    expect(classifyAbandonmentMarker({releaseCommit: "abc"})).toBe("absent");
  });

  it("classifies a marker on the release commit as permanently abandoned", () => {
    expect(classifyAbandonmentMarker({releaseCommit: "abc", markerCommit: "abc"})).toBe("matching");
  });

  it("rejects a marker that resolves to another commit", () => {
    expect(() => classifyAbandonmentMarker({releaseCommit: "abc", markerCommit: "def"})).toThrow("Maintainer review is required");
  });
});

describe("package publication state", () => {
  it("accepts a normal published release", () => {
    expect(() => verifyPublicationState({draft: false, prerelease: false, published: true})).not.toThrow();
  });

  it.each([
    {draft: true, prerelease: false, published: false},
    {draft: false, prerelease: true, published: true},
    {draft: false, prerelease: false, published: false},
  ])("rejects non-publishable state %#", state => {
    expect(() => verifyPublicationState(state)).toThrow("published, non-draft, non-prerelease");
  });
});
