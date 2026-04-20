import {describe, it, expect} from "vitest";
import {parseStreamConfig, StreamConfigError} from "../../src";

describe("parseStreamConfig", () => {
  it("parses a minimal valid configuration", () => {
    const cfg = parseStreamConfig({
      shapeCatalogs: {
        evrn: {wsdlSource: "https://example.com/EVRNService.svc?singleWsdl"},
      },
      operations: {
        UnitDescriptiveInfoStream: {
          recordType: "UnitDescriptiveContentType",
          recordPath: [
            "UnitDescriptiveInfoStream",
            "EVRN_UnitDescriptiveInfoRS",
            "UnitDescriptiveContents",
            "UnitDescriptiveContent",
          ],
          shapeCatalog: "evrn",
        },
      },
    });

    expect(cfg.shapeCatalogs.evrn).toEqual({
      wsdlSource: "https://example.com/EVRNService.svc?singleWsdl",
      catalogFile: undefined,
    });
    const op = cfg.operations.UnitDescriptiveInfoStream;
    expect(op.mode).toBe("stream");
    expect(op.format).toBe("ndjson");
    expect(op.mediaType).toBe("application/x-ndjson");
    expect(op.recordTypeName).toBe("UnitDescriptiveContentType");
    expect(op.recordPath).toEqual([
      "UnitDescriptiveInfoStream",
      "EVRN_UnitDescriptiveInfoRS",
      "UnitDescriptiveContents",
      "UnitDescriptiveContent",
    ]);
    expect(op.shapeCatalogName).toBe("evrn");
  });

  it("preserves duplicate recordPath segments", () => {
    const cfg = parseStreamConfig({
      operations: {
        Foo: {
          recordType: "FooRecord",
          recordPath: ["Wrap", "Wrap", "Items", "Item"],
        },
      },
    });
    expect(cfg.operations.Foo.recordPath).toEqual(["Wrap", "Wrap", "Items", "Item"]);
  });

  it("defaults mediaType for json-array format", () => {
    const cfg = parseStreamConfig({
      operations: {
        Foo: {
          format: "json-array",
          recordType: "FooRecord",
          recordPath: ["Items", "Item"],
        },
      },
    });
    expect(cfg.operations.Foo.format).toBe("json-array");
    expect(cfg.operations.Foo.mediaType).toBe("application/json");
  });

  it("accepts a custom mediaType override", () => {
    const cfg = parseStreamConfig({
      operations: {
        Foo: {
          mediaType: "application/vnd.example.records+ndjson",
          recordType: "FooRecord",
          recordPath: ["Items", "Item"],
        },
      },
    });
    expect(cfg.operations.Foo.mediaType).toBe("application/vnd.example.records+ndjson");
  });

  it("rejects a config that is not an object", () => {
    expect(() => parseStreamConfig([])).toThrow(StreamConfigError);
    expect(() => parseStreamConfig(null)).toThrow(StreamConfigError);
    expect(() => parseStreamConfig(42)).toThrow(StreamConfigError);
  });

  it("rejects a config with no operations", () => {
    expect(() => parseStreamConfig({operations: {}}))
      .toThrow(/at least one operation/i);
    expect(() => parseStreamConfig({operations: {}}))
      .toThrow(StreamConfigError);
  });

  it("rejects an operation missing recordType", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {recordPath: ["a"]},
        },
      }),
    ).toThrow(/recordType is required/);
  });

  it("rejects an operation missing recordPath", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {recordType: "FooRecord"},
        },
      }),
    ).toThrow(/recordPath must be a non-empty array/);
  });

  it("rejects an operation with empty recordPath", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {recordType: "FooRecord", recordPath: []},
        },
      }),
    ).toThrow(/recordPath must be a non-empty array/);
  });

  it("rejects a recordPath entry that is not a string", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {recordType: "FooRecord", recordPath: ["a", 42, "c"]},
        },
      }),
    ).toThrow(/recordPath\[1] must be a non-empty string/);
  });

  it("rejects an unsupported format", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {format: "xml", recordType: "FooRecord", recordPath: ["a"]},
        },
      }),
    ).toThrow(/format must be one of/);
  });

  it("rejects a mediaType without a slash", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {mediaType: "ndjson", recordType: "FooRecord", recordPath: ["a"]},
        },
      }),
    ).toThrow(/type\/subtype/);
  });

  it("rejects a shapeCatalog entry with neither wsdlSource nor catalogFile", () => {
    expect(() =>
      parseStreamConfig({
        shapeCatalogs: {evrn: {}},
        operations: {
          Foo: {recordType: "FooRecord", recordPath: ["a"], shapeCatalog: "evrn"},
        },
      }),
    ).toThrow(/must set one of "wsdlSource" or "catalogFile"/);
  });

  it("rejects a shapeCatalog entry with both wsdlSource and catalogFile", () => {
    expect(() =>
      parseStreamConfig({
        shapeCatalogs: {
          evrn: {wsdlSource: "x", catalogFile: "y"},
        },
        operations: {
          Foo: {recordType: "FooRecord", recordPath: ["a"], shapeCatalog: "evrn"},
        },
      }),
    ).toThrow(/exactly one of/);
  });

  it("rejects an operation that references an unknown shapeCatalog", () => {
    expect(() =>
      parseStreamConfig({
        shapeCatalogs: {evrn: {wsdlSource: "x"}},
        operations: {
          Foo: {
            recordType: "FooRecord",
            recordPath: ["a"],
            shapeCatalog: "unknown",
          },
        },
      }),
    ).toThrow(/references "unknown" which is not declared/);
  });

  it("rejects an operation with an explicit non-stream mode", () => {
    expect(() =>
      parseStreamConfig({
        operations: {
          Foo: {mode: "buffered", recordType: "FooRecord", recordPath: ["a"]},
        },
      }),
    ).toThrow(/must be "stream"/);
  });

  it("attaches pointer context to error messages", () => {
    const thrown = captureThrown(() =>
      parseStreamConfig({
        operations: {
          Foo: {recordType: "FooRecord", recordPath: ["a", "", "c"]},
        },
      }),
    );
    expect(thrown).toBeInstanceOf(StreamConfigError);
    expect((thrown as StreamConfigError).toUserMessage()).toMatch(/\$\.operations\.Foo\.recordPath\[1]/);
  });
});

function captureThrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error("expected fn to throw");
}
