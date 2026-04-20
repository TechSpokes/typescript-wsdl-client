// noinspection JSVoidFunctionReturnValueUsed,JSRedundantAwait
// IntelliJ's TS analyzer occasionally misreports node:fs / node:path /
// JSON.stringify / local factory calls as returning void on this file, and
// misreports awaited Promise<void> helpers as non-promises. tsc --noEmit
// is clean; all 9 tests pass. Scoped comments repeat the suppression below.
import {describe, it, expect} from "vitest";
import {mkdtempSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {applyShapeCatalogs, parseStreamConfig} from "../../src";
import {WsdlCompilationError} from "../../src/util/errors.js";
import type {CompiledCatalog, CompiledType, CompiledAlias} from "../../src/compiler/schemaCompiler.js";

// ---------------------------------------------------------------------------
// Programmatic CompiledCatalog fixtures.
// We skip real WSDL round-trips at this layer because the shape resolver only
// consumes the compiled shape. Running against real fixtures lives in phase-5.
// ---------------------------------------------------------------------------

function makeType(partial: Partial<CompiledType> & {name: string; ns: string}): CompiledType {
  return {
    name: partial.name,
    ns: partial.ns,
    attrs: partial.attrs ?? [],
    elems: partial.elems ?? [],
    ...(partial.doc ? {doc: partial.doc} : {}),
    ...(partial.base ? {base: partial.base} : {}),
    ...(partial.wildcards ? {wildcards: partial.wildcards} : {}),
  };
}

function makeAlias(partial: Partial<CompiledAlias> & {name: string; ns: string; tsType: string; declared: string}): CompiledAlias {
  return {
    name: partial.name,
    ns: partial.ns,
    tsType: partial.tsType,
    declared: partial.declared,
    ...(partial.doc ? {doc: partial.doc} : {}),
  };
}

function makeEmptyCatalog(serviceName: string, ns: string): CompiledCatalog {
  return {
    options: {
      wsdl: "",
      out: "",
      imports: "js",
      catalog: false,
      primitive: {int64As: "string", bigIntegerAs: "string", decimalAs: "string", dateAs: "string"},
    },
    types: [],
    aliases: [],
    meta: {attrSpec: {}, attrType: {}, childType: {}, propMeta: {}},
    operations: [],
    wsdlTargetNS: ns,
    wsdlUri: `memory://${serviceName}`,
    serviceName,
  };
}

function populateMeta(cat: CompiledCatalog): void {
  for (const t of cat.types) {
    cat.meta.attrSpec[t.name] = t.attrs.map((a) => a.name);
    cat.meta.childType[t.name] = Object.fromEntries(t.elems.map((e) => [e.name, e.tsType]));
    cat.meta.propMeta[t.name] = Object.fromEntries(
      t.elems.map((e) => [e.name, {declaredType: e.declaredType, min: e.min, max: e.max, nillable: !!e.nillable}]),
    );
    const attrMap: Record<string, string> = {};
    for (const a of t.attrs) attrMap[a.name] = a.tsType;
    if (Object.keys(attrMap).length > 0) cat.meta.attrType[t.name] = attrMap;
  }
}

// Build a small companion catalog with a 3-type reachable graph:
//   UnitDescriptiveContentType -> UnitFeeType (referenced via elems)
//                              -> UnitAvailabilityType
// Plus an unrelated UnrelatedType that should NOT be copied.
function buildCompanionCatalog(): CompiledCatalog {
  const cat = makeEmptyCatalog("Main", "urn:example:main");
  const feeType = makeType({
    name: "UnitFeeType",
    ns: "urn:example:main",
    elems: [
      {name: "Amount", tsType: "string", min: 1, max: 1, declaredType: "xs:decimal"},
      {name: "Currency", tsType: "string", min: 1, max: 1, declaredType: "xs:string"},
    ],
  });
  const availabilityType = makeType({
    name: "UnitAvailabilityType",
    ns: "urn:example:main",
    elems: [
      {name: "Available", tsType: "boolean", min: 1, max: 1, declaredType: "xs:boolean"},
    ],
  });
  const recordType = makeType({
    name: "UnitDescriptiveContentType",
    ns: "urn:example:main",
    attrs: [
      {name: "Id", tsType: "string", use: "required", declaredType: "xs:string"},
    ],
    elems: [
      {name: "Name", tsType: "string", min: 1, max: 1, declaredType: "xs:string"},
      {name: "Fees", tsType: "UnitFeeType", min: 0, max: "unbounded", declaredType: "{urn:example:main}UnitFeeType"},
      {name: "Availability", tsType: "UnitAvailabilityType", min: 0, max: 1, declaredType: "{urn:example:main}UnitAvailabilityType"},
    ],
  });
  const unrelated = makeType({
    name: "UnrelatedType",
    ns: "urn:example:main",
    elems: [{name: "X", tsType: "string", min: 1, max: 1, declaredType: "xs:string"}],
  });
  cat.types.push(feeType, availabilityType, recordType, unrelated);
  populateMeta(cat);
  return cat;
}

describe("applyShapeCatalogs", () => {
  it("is a no-op when streamConfig declares no operations that reference catalogs", async () => {
    // Empty streamConfig will have been rejected at parse-time, so construct
    // directly: an operation referencing a type already in the main catalog.
    const main = makeEmptyCatalog("Content", "urn:example:content");
    main.types.push(makeType({
      name: "LocalRecord",
      ns: "urn:example:content",
      elems: [{name: "v", tsType: "string", min: 1, max: 1, declaredType: "xs:string"}],
    }));
    populateMeta(main);
    const cfg = parseStreamConfig({
      operations: {
        Op: {
          recordType: "LocalRecord",
          recordPath: ["x"],
        },
      },
    });
    await applyShapeCatalogs(main, cfg);
    expect(main.types.map((t) => t.name).sort()).toEqual(["LocalRecord"]);
  });

  it("copies the reachable type graph from a companion catalog", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const companion = buildCompanionCatalog();
    // The companion is driven by writing it to a temp catalog file and
    // referencing it from the stream-config via `catalogFile`. That bypasses
    // any need for a DI hook in applyShapeCatalogs for tests.
    const dir = mkdtempSync(join(tmpdir(), "wsdl-shape-"));
    try {
      const catalogFile = join(dir, "main-catalog.json");
      writeFileSync(catalogFile, JSON.stringify(companion), "utf-8");
      const cfg = parseStreamConfig({
        shapeCatalogs: {main: {catalogFile}},
        operations: {
          UnitInfoStream: {
            recordType: "UnitDescriptiveContentType",
            recordPath: ["Records", "Record"],
            shapeCatalog: "main",
          },
        },
      });
      // noinspection JSRedundantAwait
      await applyShapeCatalogs(main, cfg, {baseDir: dir});
      const names = main.types.map((t) => t.name).sort();
      expect(names).toEqual([
        "UnitAvailabilityType",
        "UnitDescriptiveContentType",
        "UnitFeeType",
      ]);
      // Unrelated type must NOT have been copied.
      expect(names.includes("UnrelatedType")).toBe(false);
      // Meta for a copied type must come along.
      expect(main.meta.childType.UnitDescriptiveContentType).toBeDefined();
      expect(main.meta.attrType.UnitDescriptiveContentType).toEqual({Id: "string"});
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it("dedupes structurally identical types without error", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const companion = buildCompanionCatalog();
    // Pre-seed the main catalog with an IDENTICAL UnitFeeType.
    main.types.push(makeType({
      name: "UnitFeeType",
      ns: "urn:example:content",
      elems: [
        {name: "Amount", tsType: "string", min: 1, max: 1, declaredType: "xs:decimal"},
        {name: "Currency", tsType: "string", min: 1, max: 1, declaredType: "xs:string"},
      ],
    }));
    populateMeta(main);
    const dir = mkdtempSync(join(tmpdir(), "wsdl-shape-dedupe-"));
    try {
      const catalogFile = join(dir, "main-catalog.json");
      const serialized: string = JSON.stringify(companion);
      writeFileSync(catalogFile, serialized, "utf-8");
      const cfg = parseStreamConfig({
        shapeCatalogs: {main: {catalogFile}},
        operations: {
          Op: {
            recordType: "UnitDescriptiveContentType",
            recordPath: ["r"],
            shapeCatalog: "main",
          },
        },
      });
      await applyShapeCatalogs(main, cfg, {baseDir: dir});
      // UnitFeeType should appear exactly once.
      const count = main.types.filter((t) => t.name === "UnitFeeType").length;
      expect(count).toBe(1);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it("fails loudly on a structural name collision", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const companion = buildCompanionCatalog();
    // Pre-seed main with a DIFFERENTLY-SHAPED UnitFeeType.
    main.types.push(makeType({
      name: "UnitFeeType",
      ns: "urn:example:content",
      elems: [
        {name: "Amount", tsType: "number", min: 1, max: 1, declaredType: "xs:decimal"},
      ],
    }));
    populateMeta(main);
    const dir = mkdtempSync(join(tmpdir(), "wsdl-shape-collide-"));
    try {
      const catalogFile = join(dir, "main-catalog.json");
      writeFileSync(catalogFile, JSON.stringify(companion), "utf-8");
      const cfg = parseStreamConfig({
        shapeCatalogs: {main: {catalogFile}},
        operations: {
          Op: {
            recordType: "UnitDescriptiveContentType",
            recordPath: ["r"],
            shapeCatalog: "main",
          },
        },
      });
      await expect(applyShapeCatalogs(main, cfg, {baseDir: dir})).rejects.toThrow(WsdlCompilationError);
      await expect(applyShapeCatalogs(main, cfg, {baseDir: dir})).rejects.toThrow(/conflicts structurally/);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it("fails when an operation's record type is absent from its shape catalog", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const companion = buildCompanionCatalog();
    const dir = mkdtempSync(join(tmpdir(), "wsdl-shape-missing-"));
    try {
      const catalogFile = join(dir, "main-catalog.json");
      writeFileSync(catalogFile, JSON.stringify(companion), "utf-8");
      const cfg = parseStreamConfig({
        shapeCatalogs: {main: {catalogFile}},
        operations: {
          Op: {
            recordType: "DoesNotExist",
            recordPath: ["r"],
            shapeCatalog: "main",
          },
        },
      });
      await expect(applyShapeCatalogs(main, cfg, {baseDir: dir})).rejects.toThrow(
        /record type "DoesNotExist".*not present in shape catalog "main"/,
      );
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it("fails when an operation has no shapeCatalog and its record type is missing from the current catalog", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const cfg = parseStreamConfig({
      operations: {
        Op: {
          recordType: "Missing",
          recordPath: ["r"],
        },
      },
    });
    // noinspection JSRedundantAwait
    await expect(applyShapeCatalogs(main, cfg)).rejects.toThrow(
      /record type "Missing" which is not present in the compiled catalog/,
    );
  });

  it("copies aliases that the record graph depends on", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const companion = makeEmptyCatalog("Main", "urn:example:main");
    companion.aliases.push(makeAlias({
      name: "CurrencyCode",
      ns: "urn:example:main",
      tsType: `"USD" | "EUR" | "GBP"`,
      declared: "{urn:example:main}CurrencyCode",
    }));
    companion.types.push(makeType({
      name: "PriceType",
      ns: "urn:example:main",
      elems: [
        {name: "Amount", tsType: "string", min: 1, max: 1, declaredType: "xs:decimal"},
        {name: "Currency", tsType: "CurrencyCode", min: 1, max: 1, declaredType: "{urn:example:main}CurrencyCode"},
      ],
    }));
    populateMeta(companion);
    const dir = mkdtempSync(join(tmpdir(), "wsdl-shape-alias-"));
    try {
      const catalogFile = join(dir, "main-catalog.json");
      writeFileSync(catalogFile, JSON.stringify(companion), "utf-8");
      const cfg = parseStreamConfig({
        shapeCatalogs: {main: {catalogFile}},
        operations: {
          Op: {
            recordType: "PriceType",
            recordPath: ["r"],
            shapeCatalog: "main",
          },
        },
      });
      await applyShapeCatalogs(main, cfg, {baseDir: dir});
      expect(main.types.map((t) => t.name)).toEqual(["PriceType"]);
      expect(main.aliases.map((a) => a.name)).toEqual(["CurrencyCode"]);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it("copies base types transitively", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    const companion = makeEmptyCatalog("Main", "urn:example:main");
    companion.types.push(makeType({
      name: "BaseRecord",
      ns: "urn:example:main",
      elems: [{name: "Id", tsType: "string", min: 1, max: 1, declaredType: "xs:string"}],
    }));
    companion.types.push(makeType({
      name: "DerivedRecord",
      ns: "urn:example:main",
      base: "BaseRecord",
      elems: [
        {name: "Id", tsType: "string", min: 1, max: 1, declaredType: "xs:string"},
        {name: "Extra", tsType: "string", min: 1, max: 1, declaredType: "xs:string"},
      ],
    }));
    populateMeta(companion);
    const dir = mkdtempSync(join(tmpdir(), "wsdl-shape-base-"));
    try {
      const catalogFile = join(dir, "main-catalog.json");
      const serialized: string = JSON.stringify(companion);
      writeFileSync(catalogFile, serialized, "utf-8");
      const cfg = parseStreamConfig({
        shapeCatalogs: {main: {catalogFile}},
        operations: {
          Op: {
            recordType: "DerivedRecord",
            recordPath: ["r"],
            shapeCatalog: "main",
          },
        },
      });
      await applyShapeCatalogs(main, cfg, {baseDir: dir});
      expect(main.types.map((t) => t.name).sort()).toEqual(["BaseRecord", "DerivedRecord"]);
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  it("fails when a shape catalog name is referenced but not declared", async () => {
    const main = makeEmptyCatalog("Content", "urn:example:content");
    main.types.push(makeType({
      name: "Rec",
      ns: "urn:example:content",
      elems: [{name: "v", tsType: "string", min: 1, max: 1, declaredType: "xs:string"}],
    }));
    populateMeta(main);
    // parseStreamConfig already rejects this shape, so build the object directly.
    const badCfg = {
      shapeCatalogs: {},
      operations: {
        Op: {
          mode: "stream" as const,
          format: "ndjson" as const,
          mediaType: "application/x-ndjson",
          recordPath: ["r"],
          recordTypeName: "Rec",
          shapeCatalogName: "missing-catalog",
        },
      },
    };
    await expect(applyShapeCatalogs(main, badCfg)).rejects.toThrow(/not declared under "shapeCatalogs"/);
  });
});
