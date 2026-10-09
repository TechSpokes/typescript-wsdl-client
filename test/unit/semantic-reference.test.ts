import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {expect, it} from "vitest";

it("fails the required reference lane when its validator is missing", () => {
  const result = spawnSync(process.execPath, ["scripts/semantic-reference.mjs"], {
    encoding: "utf8",
    env: {...process.env, S01_REFERENCE_PYTHON: resolve("tmp/conformance/missing-reference-python")},
  });
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Missing required XSD reference Python");
});
