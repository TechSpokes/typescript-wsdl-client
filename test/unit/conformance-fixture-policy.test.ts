import {mkdtempSync, mkdirSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {readFileUnder, validateConformanceFixtureGraph} from "../conformance/fixturePolicy.js";

function makeFixtureRoot(): string {
  return mkdtempSync(join(tmpdir(), "wsdl-conformance-fixtures-"));
}

function writeFixture(root: string, relativePath: string, content: string): string {
  const filePath = join(root, relativePath);
  mkdirSync(dirname(filePath), {recursive: true});
  writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("conformance fixture policy", () => {
  it("accepts schema imports that stay inside the fixture root", () => {
    const root = makeFixtureRoot();
    const wsdl = writeFixture(root, "xsd/imports/service.wsdl", `
      <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema">
        <wsdl:types>
          <xs:schema>
            <xs:import schemaLocation="types.xsd"/>
          </xs:schema>
        </wsdl:types>
      </wsdl:definitions>
    `);
    writeFixture(root, "xsd/imports/types.xsd", "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"/>");

    expect(() => validateConformanceFixtureGraph(wsdl, root)).not.toThrow();
  });

  it("rejects schema imports that escape or fetch outside the fixture root", () => {
    const root = makeFixtureRoot();
    const externalRoot = makeFixtureRoot();
    const outside = writeFixture(externalRoot, "outside.xsd", "<xs:schema xmlns:xs=\"http://www.w3.org/2001/XMLSchema\"/>");

    const cases = [
      ["url.wsdl", "https://example.test/schema.xsd", "external URL"],
      ["absolute.wsdl", outside, "absolute path"],
      ["parent.wsdl", "../../outside.xsd", "outside"],
      ["missing.wsdl", "missing.xsd", "missing"],
    ] as const;

    for (const [fileName, schemaLocation, message] of cases) {
      const wsdl = writeFixture(root, `xsd/${fileName}`, `
        <wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/" xmlns:xs="http://www.w3.org/2001/XMLSchema">
          <wsdl:types>
            <xs:schema>
              <xs:import schemaLocation="${schemaLocation}"/>
            </xs:schema>
          </wsdl:types>
        </wsdl:definitions>
      `);

      expect(() => validateConformanceFixtureGraph(wsdl, root)).toThrow(message);
    }
  });

  it("confines generated artifact reads to their artifact root", () => {
    const root = makeFixtureRoot();
    writeFixture(root, "gateway/plugin.ts", "export default {};");

    expect(readFileUnder(join(root, "gateway"), "plugin.ts")).toContain("export default");
    expect(() => readFileUnder(join(root, "gateway"), "../outside.ts")).toThrow("outside");
  });
});
