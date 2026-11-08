import {describe, it, expect} from "vitest";
import {SaxesParser, type SaxesTagPlain} from "saxes";

// PHASE-0 research: can a SAX parser track a positional element path (including
// duplicate local names) and emit records correctly across arbitrary chunk
// boundaries?
//
// The test is structured as a chunk-fuzz: feed the same XML through saxes with
// many different byte-split boundaries and assert the same record stream is
// produced each time. The tracker logic below is an MVP meant to prove the
// approach; the production implementation will live under src/runtime/streamXml.ts.

type RecordObj = Record<string, string>;

// Path from the root element to the repeated record element. Note the
// duplicate "EVRN_UnitDescriptiveInfoRS" segment: the ADR calls out that the
// tracker must not collapse duplicates.
const RECORD_PATH = [
  "EVRN_UnitDescriptiveInfoRS",
  "EVRN_UnitDescriptiveInfoRS",
  "UnitDescriptiveContents",
  "UnitDescriptiveContent",
];

function parseAll(xml: string, chunkBoundaries: number[]): RecordObj[] {
  const parser = new SaxesParser({xmlns: false, position: false});
  const records: RecordObj[] = [];

  // Stack of element local names currently open, from the document root down.
  const stack: string[] = [];

  // When we are inside the record element, accumulate: currentRecord maps the
  // local name of each direct child to its text content.
  let currentRecord: RecordObj | null = null;
  let currentChildName: string | null = null;

  parser.on("opentag", (tag: SaxesTagPlain) => {
    stack.push(tag.name);
    if (stack.length === RECORD_PATH.length && pathExact(stack)) {
      currentRecord = {};
      currentChildName = null;
      return;
    }
    if (currentRecord && stack.length === RECORD_PATH.length + 1) {
      currentChildName = tag.name;
    }
  });

  parser.on("text", (t: string) => {
    if (currentRecord && currentChildName) {
      const prev = currentRecord[currentChildName] ?? "";
      currentRecord[currentChildName] = prev + t;
    }
  });

  parser.on("closetag", (tag: SaxesTagPlain) => {
    if (currentRecord && stack.length === RECORD_PATH.length + 1 && tag.name === currentChildName) {
      currentChildName = null;
    }
    if (currentRecord && stack.length === RECORD_PATH.length && pathExact(stack)) {
      records.push(currentRecord);
      currentRecord = null;
      currentChildName = null;
    }
    stack.pop();
  });

  parser.on("error", (err: Error) => {
    throw err;
  });

  // Feed XML in the requested slices. Boundaries are monotonically increasing
  // offsets within the string.
  let offset = 0;
  for (const b of chunkBoundaries) {
    parser.write(xml.slice(offset, b));
    offset = b;
  }
  parser.write(xml.slice(offset));
  parser.close();

  return records;
}

function pathExact(stack: string[]): boolean {
  if (stack.length !== RECORD_PATH.length) return false;
  for (let i = 0; i < RECORD_PATH.length; i++) {
    if (stack[i] !== RECORD_PATH[i]) return false;
  }
  return true;
}

const SAMPLE_XML = [
  `<EVRN_UnitDescriptiveInfoRS>`,
  `<EVRN_UnitDescriptiveInfoRS>`,
  `<UnitDescriptiveContents>`,
  `<UnitDescriptiveContent><Id>1</Id><Name>Villa A</Name></UnitDescriptiveContent>`,
  `<UnitDescriptiveContent><Id>2</Id><Name>Villa B</Name></UnitDescriptiveContent>`,
  `<UnitDescriptiveContent><Id>3</Id><Name>Villa C</Name></UnitDescriptiveContent>`,
  `</UnitDescriptiveContents>`,
  `</EVRN_UnitDescriptiveInfoRS>`,
  `</EVRN_UnitDescriptiveInfoRS>`,
].join("");

const EXPECTED: RecordObj[] = [
  {Id: "1", Name: "Villa A"},
  {Id: "2", Name: "Villa B"},
  {Id: "3", Name: "Villa C"},
];

describe("research: saxes record-path tracking", () => {
  it("extracts records from a one-shot feed", () => {
    const out = parseAll(SAMPLE_XML, []);
    expect(out).toEqual(EXPECTED);
  });

  it("produces identical records for every byte-split boundary", () => {
    const failures: Array<{boundary: number; got: RecordObj[]}> = [];
    for (let b = 1; b < SAMPLE_XML.length; b++) {
      const got = parseAll(SAMPLE_XML, [b]);
      if (JSON.stringify(got) !== JSON.stringify(EXPECTED)) {
        failures.push({boundary: b, got});
      }
    }
    expect(failures).toEqual([]);
  });

  it("produces identical records for every pair of byte-split boundaries", () => {
    // Quadratic sweep, clamped by input size (~330 chars => ~54k pairs; fast).
    const failures: Array<{a: number; b: number; got: RecordObj[]}> = [];
    const expectedSerialized: string = JSON.stringify(EXPECTED);
    for (let a = 1; a < SAMPLE_XML.length - 1; a++) {
      for (let b = a + 1; b < SAMPLE_XML.length; b++) {
        const got = parseAll(SAMPLE_XML, [a, b]);
        const gotSerialized: string = JSON.stringify(got);
        if (gotSerialized !== expectedSerialized) {
          failures.push({a, b, got});
          if (failures.length > 5) break;
        }
      }
      if (failures.length > 5) break;
    }
    expect(failures).toEqual([]);
  });

  it("handles records that sit at the tail of deeply nested duplicate names", () => {
    // Extra guard: the tracker must not collapse the two EVRN_... wrappers.
    const xml = `<EVRN_UnitDescriptiveInfoRS><UnitDescriptiveContents><UnitDescriptiveContent><Id>x</Id></UnitDescriptiveContent></UnitDescriptiveContents></EVRN_UnitDescriptiveInfoRS>`;
    // Only one EVRN_ wrapper: path should NOT match, so zero records.
    const out = parseAll(xml, []);
    expect(out).toEqual([]);
  });
});
