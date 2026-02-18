import { describe, it, expect } from "vitest";
import { toPathSegment } from "../../src/openapi/casing.js";

describe("toPathSegment", () => {
  describe("kebab style", () => {
    it("converts PascalCase to kebab-case", () => {
      expect(toPathSegment("GetUserDetails", "kebab")).toBe("get-user-details");
    });

    it("converts camelCase to kebab-case", () => {
      expect(toPathSegment("getUserDetails", "kebab")).toBe("get-user-details");
    });

    it("handles single word", () => {
      expect(toPathSegment("Users", "kebab")).toBe("users");
    });

    it("handles acronyms", () => {
      expect(toPathSegment("GetHTTPResponse", "kebab")).toBe("get-httpresponse");
    });

    it("strips leading/trailing hyphens", () => {
      expect(toPathSegment("-hello-", "kebab")).toBe("hello");
    });

    it("replaces non-alphanumeric with hyphens", () => {
      expect(toPathSegment("get.user.details", "kebab")).toBe("get-user-details");
    });
  });

  describe("asis style", () => {
    it("preserves original name", () => {
      expect(toPathSegment("GetUserDetails", "asis")).toBe("GetUserDetails");
    });

    it("preserves camelCase", () => {
      expect(toPathSegment("getUserDetails", "asis")).toBe("getUserDetails");
    });

    it("preserves special characters", () => {
      expect(toPathSegment("get-user-details", "asis")).toBe("get-user-details");
    });
  });

  describe("lower style", () => {
    it("converts to lowercase and removes non-alphanumeric", () => {
      expect(toPathSegment("GetUserDetails", "lower")).toBe("getuserdetails");
    });

    it("removes hyphens", () => {
      expect(toPathSegment("get-user-details", "lower")).toBe("getuserdetails");
    });

    it("removes dots", () => {
      expect(toPathSegment("get.user.details", "lower")).toBe("getuserdetails");
    });

    it("handles already lowercase", () => {
      expect(toPathSegment("users", "lower")).toBe("users");
    });
  });
});
