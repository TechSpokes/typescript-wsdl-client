import {describe, expect, it} from "vitest";
import {globalId, scopedId} from "../../src/compiler/declarationIdentity.js";
import {globalId as checkedGlobal, scopedId as checkedScoped} from "../../src/compiler/canonicalGraph.js";

describe("shared declaration identity byte contract", () => {
  it("retains checked global and scoped golden encodings through the old import path", () => {
    expect(globalId("type", {namespace: "urn:identity", local: "Entry"}))
      .toBe('["global","type","urn:identity","Entry"]');
    expect(scopedId("owner", "/sequence[0]/element[2]", "type"))
      .toBe("scoped:1f7c1ab029d0dcb0dfa8e6a92b9d545101869de7c2f8d6e56ea9fbe8402e9478");
    expect(checkedGlobal).toBe(globalId);
    expect(checkedScoped).toBe(scopedId);
  });
});
