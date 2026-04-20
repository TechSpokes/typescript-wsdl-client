import {describe, expect, it} from "vitest";
import {parseRecords, type RecordParseSpec} from "../../src/runtime/streamXml.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* feed(chunks: string[]): AsyncIterable<string> {
  for (const c of chunks) yield c;
}

async function collect<T>(iter: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const r of iter) out.push(r);
  return out;
}

const ESCAPIA_XML = [
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">`,
  `<soap:Body>`,
  `<UnitDescriptiveInfoStream>`,
  `<EVRN_UnitDescriptiveInfoRS>`,
  `<EVRN_UnitDescriptiveInfoRS>`,
  `<UnitDescriptiveContents>`,
  `<UnitDescriptiveContent Id="101"><Name>Villa A</Name><Fees><Amount>100</Amount><Currency>USD</Currency></Fees></UnitDescriptiveContent>`,
  `<UnitDescriptiveContent Id="102"><Name>Villa B</Name><Fees><Amount>200</Amount><Currency>USD</Currency></Fees><Fees><Amount>50</Amount><Currency>USD</Currency></Fees></UnitDescriptiveContent>`,
  `<UnitDescriptiveContent Id="103"><Name>Villa C</Name></UnitDescriptiveContent>`,
  `</UnitDescriptiveContents>`,
  `</EVRN_UnitDescriptiveInfoRS>`,
  `</EVRN_UnitDescriptiveInfoRS>`,
  `</UnitDescriptiveInfoStream>`,
  `</soap:Body>`,
  `</soap:Envelope>`,
].join("");

const ESCAPIA_SPEC: RecordParseSpec = {
  recordPath: [
    "UnitDescriptiveInfoStream",
    "EVRN_UnitDescriptiveInfoRS",
    "EVRN_UnitDescriptiveInfoRS",
    "UnitDescriptiveContents",
    "UnitDescriptiveContent",
  ],
  recordTypeName: "UnitDescriptiveContent",
  attributesKey: "$attributes",
  propMeta: {
    UnitDescriptiveContent: {
      Name: {min: 1, max: 1},
      Fees: {min: 0, max: "unbounded"},
    },
  },
  childType: {
    UnitDescriptiveContent: {
      Name: "string",
      Fees: "UnitFee[]",
    },
    UnitFee: {
      Amount: "string",
      Currency: "string",
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseRecords", () => {
  it("extracts records from a full SOAP envelope on a one-shot feed", async () => {
    const records = await collect(parseRecords(feed([ESCAPIA_XML]), ESCAPIA_SPEC));
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({
      $attributes: {Id: "101"},
      Name: "Villa A",
      Fees: [{Amount: "100", Currency: "USD"}],
    });
    expect(records[1]).toEqual({
      $attributes: {Id: "102"},
      Name: "Villa B",
      Fees: [
        {Amount: "200", Currency: "USD"},
        {Amount: "50", Currency: "USD"},
      ],
    });
    expect(records[2]).toEqual({
      $attributes: {Id: "103"},
      Name: "Villa C",
    });
  });

  it("produces identical records regardless of chunk-boundary position", async () => {
    const expected = await collect(parseRecords(feed([ESCAPIA_XML]), ESCAPIA_SPEC));
    for (let b = 1; b < ESCAPIA_XML.length; b++) {
      const chunks = [ESCAPIA_XML.slice(0, b), ESCAPIA_XML.slice(b)];
      const got = await collect(parseRecords(feed(chunks), ESCAPIA_SPEC));
      expect(got, `byte boundary ${b}`).toEqual(expected);
    }
  });

  it("yields records incrementally (first record available before the stream ends)", async () => {
    let firstChunkSentAt: number | undefined;
    let firstRecordAt: number | undefined;
    async function* slow(): AsyncIterable<string> {
      const mid = ESCAPIA_XML.indexOf(`</UnitDescriptiveContent>`);
      const first = ESCAPIA_XML.slice(0, mid + `</UnitDescriptiveContent>`.length);
      const rest = ESCAPIA_XML.slice(mid + `</UnitDescriptiveContent>`.length);
      const t0 = Date.now();
      yield first;
      firstChunkSentAt = Date.now() - t0;
      await new Promise((r) => setTimeout(r, 80));
      yield rest;
    }
    const t0 = Date.now();
    const iter = parseRecords(slow(), ESCAPIA_SPEC);
    const result = await iter[Symbol.asyncIterator]().next();
    firstRecordAt = Date.now() - t0;
    expect(result.value).toMatchObject({Name: "Villa A"});
    // The first record must arrive before the artificial 80ms delay between
    // the first chunk and the rest of the stream. Add slack for system jitter.
    expect(firstRecordAt!).toBeLessThan((firstChunkSentAt ?? 0) + 50);
  });

  it("materializes xsi:nil elements as null", async () => {
    const xml = `
      <Root><Rec><Val xsi:nil="true"/><Name>A</Name></Rec></Root>
    `.trim();
    const spec: RecordParseSpec = {
      recordPath: ["Root", "Rec"],
      recordTypeName: "Rec",
    };
    const records = await collect(parseRecords(feed([xml]), spec));
    expect(records).toEqual([{Val: null, Name: "A"}]);
  });

  it("preserves attributes under the configured attributesKey", async () => {
    const xml = `<Root><Rec id="x" type="a"><V>42</V></Rec></Root>`;
    const records = await collect(
      parseRecords(feed([xml]), {
        recordPath: ["Root", "Rec"],
        recordTypeName: "Rec",
        attributesKey: "@@attrs",
      }),
    );
    expect(records).toEqual([{"@@attrs": {id: "x", type: "a"}, V: "42"}]);
  });

  it("promotes repeated scalar props into arrays even when propMeta says scalar", async () => {
    const xml = `<Root><Rec><V>1</V><V>2</V><V>3</V></Rec></Root>`;
    const records = await collect(
      parseRecords(feed([xml]), {
        recordPath: ["Root", "Rec"],
        recordTypeName: "Rec",
        propMeta: {Rec: {V: {min: 1, max: 1}}},
      }),
    );
    expect(records).toEqual([{V: ["1", "2", "3"]}]);
  });

  it("emits `$value` + attributes for simple-content leaves", async () => {
    const xml = `<Root><Rec><Amount currency="USD">100</Amount></Rec></Root>`;
    const records = await collect(
      parseRecords(feed([xml]), {
        recordPath: ["Root", "Rec"],
        recordTypeName: "Rec",
      }),
    );
    expect(records).toEqual([
      {Amount: {$attributes: {currency: "USD"}, $value: "100"}},
    ]);
  });

  it("throws on malformed XML", async () => {
    const xml = `<Root><Rec><V>unclosed</Rec></Root>`;
    await expect(
      collect(parseRecords(feed([xml]), {recordPath: ["Root", "Rec"], recordTypeName: "Rec"})),
    ).rejects.toThrow();
  });

  it("rejects an empty recordPath", async () => {
    await expect(
      collect(parseRecords(feed(["<x/>"]), {recordPath: [], recordTypeName: "x"})),
    ).rejects.toThrow(/recordPath must not be empty/);
  });

  it("handles Uint8Array chunks via UTF-8 decode", async () => {
    const enc = new TextEncoder();
    async function* bytes(): AsyncIterable<Uint8Array> {
      yield enc.encode(`<Root><Rec><V>`);
      yield enc.encode(`héllo`);
      yield enc.encode(`</V></Rec></Root>`);
    }
    const records = await collect(
      parseRecords(bytes(), {recordPath: ["Root", "Rec"], recordTypeName: "Rec"}),
    );
    expect(records).toEqual([{V: "héllo"}]);
  });
});
