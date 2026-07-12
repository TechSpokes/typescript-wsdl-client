import { describe, expect, it } from "vitest";
import { parsePackOutput } from "../../scripts/lib/npm-pack-output.mjs";

describe("parsePackOutput", () => {
  const packageResult = {
    files: [
      {path: "package.json"},
      {path: "dist/cli.js"},
    ],
  };

  it("normalizes the npm 11 array shape", () => {
    expect(parsePackOutput(JSON.stringify([packageResult]))).toEqual([
      "dist/cli.js",
      "package.json",
    ]);
  });

  it("normalizes the npm 12 package-keyed object shape", () => {
    expect(parsePackOutput(JSON.stringify({
      "@techspokes/typescript-wsdl-client": packageResult,
    }))).toEqual([
      "dist/cli.js",
      "package.json",
    ]);
  });

  it.each([
    [],
    [packageResult, packageResult],
    {},
    {first: packageResult, second: packageResult},
    {"@techspokes/typescript-wsdl-client": {}},
    null,
  ])("rejects malformed package results %#", result => {
    expect(() => parsePackOutput(JSON.stringify(result))).toThrow(
      "Unexpected npm pack --dry-run --json output.",
    );
  });
});
