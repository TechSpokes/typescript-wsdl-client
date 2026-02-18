import { describe, it, expect } from "vitest";
import { xsdToTsPrimitive } from "../../src/xsd/primitives.js";

describe("xsdToTsPrimitive", () => {
  describe("string-like types", () => {
    const stringTypes = [
      "xs:string", "xs:normalizedString", "xs:token", "xs:language",
      "xs:Name", "xs:NCName", "xs:NMTOKEN", "xs:NMTOKENS",
      "xs:ID", "xs:IDREF", "xs:IDREFS", "xs:ENTITY", "xs:ENTITIES",
      "xs:anyURI", "xs:QName", "xs:NOTATION",
      "xs:hexBinary", "xs:base64Binary",
    ];

    for (const qname of stringTypes) {
      it(`maps ${qname} to "string"`, () => {
        expect(xsdToTsPrimitive(qname)).toBe("string");
      });
    }
  });

  describe("boolean", () => {
    it('maps xs:boolean to "boolean"', () => {
      expect(xsdToTsPrimitive("xs:boolean")).toBe("boolean");
    });
  });

  describe("safe integer types (32-bit and smaller)", () => {
    const safeInts = ["xs:int", "xs:unsignedInt", "xs:short", "xs:unsignedShort", "xs:byte", "xs:unsignedByte"];

    for (const qname of safeInts) {
      it(`maps ${qname} to "number"`, () => {
        expect(xsdToTsPrimitive(qname)).toBe("number");
      });
    }
  });

  describe("64-bit integers (default: string)", () => {
    it('maps xs:long to "string" by default', () => {
      expect(xsdToTsPrimitive("xs:long")).toBe("string");
    });

    it('maps xs:unsignedLong to "string" by default', () => {
      expect(xsdToTsPrimitive("xs:unsignedLong")).toBe("string");
    });

    it("maps xs:long to number when configured", () => {
      expect(xsdToTsPrimitive("xs:long", { int64As: "number" })).toBe("number");
    });

    it("maps xs:long to bigint when configured", () => {
      expect(xsdToTsPrimitive("xs:long", { int64As: "bigint" })).toBe("bigint");
    });
  });

  describe("arbitrary-precision integers (default: string)", () => {
    const bigInts = [
      "xs:integer", "xs:nonPositiveInteger", "xs:negativeInteger",
      "xs:nonNegativeInteger", "xs:positiveInteger",
    ];

    for (const qname of bigInts) {
      it(`maps ${qname} to "string" by default`, () => {
        expect(xsdToTsPrimitive(qname)).toBe("string");
      });
    }

    it("maps xs:integer to number when configured", () => {
      expect(xsdToTsPrimitive("xs:integer", { bigIntegerAs: "number" })).toBe("number");
    });
  });

  describe("decimal (default: string)", () => {
    it('maps xs:decimal to "string" by default', () => {
      expect(xsdToTsPrimitive("xs:decimal")).toBe("string");
    });

    it("maps xs:decimal to number when configured", () => {
      expect(xsdToTsPrimitive("xs:decimal", { decimalAs: "number" })).toBe("number");
    });
  });

  describe("floating point types", () => {
    it('maps xs:float to "number"', () => {
      expect(xsdToTsPrimitive("xs:float")).toBe("number");
    });

    it('maps xs:double to "number"', () => {
      expect(xsdToTsPrimitive("xs:double")).toBe("number");
    });
  });

  describe("date/time types (default: string)", () => {
    const dateTypes = [
      "xs:date", "xs:dateTime", "xs:time",
      "xs:gYear", "xs:gYearMonth", "xs:gMonth", "xs:gMonthDay", "xs:gDay",
      "xs:duration", "xs:dateTimeStamp",
      "xs:dayTimeDuration", "xs:yearMonthDuration",
    ];

    for (const qname of dateTypes) {
      it(`maps ${qname} to "string" by default`, () => {
        expect(xsdToTsPrimitive(qname)).toBe("string");
      });
    }

    it("maps xs:dateTime to Date when configured", () => {
      expect(xsdToTsPrimitive("xs:dateTime", { dateAs: "Date" })).toBe("Date");
    });
  });

  describe("any types", () => {
    it('maps xs:anyType to "unknown"', () => {
      expect(xsdToTsPrimitive("xs:anyType")).toBe("unknown");
    });

    it('maps xs:anySimpleType to "unknown"', () => {
      expect(xsdToTsPrimitive("xs:anySimpleType")).toBe("unknown");
    });
  });

  describe("unknown types", () => {
    it('falls back to "string" for unrecognized types', () => {
      expect(xsdToTsPrimitive("xs:unknownType")).toBe("string");
    });
  });

  describe("prefix handling", () => {
    it("works without prefix", () => {
      expect(xsdToTsPrimitive("string")).toBe("string");
    });

    it("works with non-standard prefix", () => {
      expect(xsdToTsPrimitive("xsd:int")).toBe("number");
    });
  });
});
