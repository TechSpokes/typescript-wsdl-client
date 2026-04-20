import {describe, expect, it} from "vitest";
import {toNdjson} from "../../src/runtime/ndjson.js";

async function drain(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: string[] = [];
  for await (const c of stream) {
    chunks.push(typeof c === "string" ? c : c.toString("utf-8"));
  }
  return chunks.join("");
}

describe("toNdjson", () => {
  it("emits one JSON line per record", async () => {
    async function* records() {
      yield {a: 1};
      yield {a: 2};
      yield {a: 3};
    }
    const out = await drain(toNdjson(records()));
    expect(out).toBe(`{"a":1}\n{"a":2}\n{"a":3}\n`);
  });

  it("produces an empty stream for an empty iterable", async () => {
    async function* records(): AsyncIterable<never> {
      // no yields
    }
    const out = await drain(toNdjson(records()));
    expect(out).toBe("");
  });

  it("forwards source errors as stream error events", async () => {
    async function* failing() {
      yield {ok: true};
      throw new Error("boom");
    }
    const stream = toNdjson(failing());
    const lines: string[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on("data", (c) => lines.push(c.toString("utf-8")));
      stream.on("error", (err) => {
        try {
          expect(err.message).toBe("boom");
          expect(lines.join("")).toBe(`{"ok":true}\n`);
          resolve();
        } catch (e) {
          reject(e);
        }
      });
      stream.on("end", () => reject(new Error("expected error event, got end")));
    });
  });

  it("respects downstream backpressure: iterator does not run ahead", async () => {
    // Count how many records the source is asked to produce before the
    // consumer actively reads. Readable.from caches highWaterMark records
    // in the internal buffer; after the buffer is full, no further next()
    // is issued until the consumer pulls.
    let produced = 0;
    async function* counter() {
      while (true) {
        produced++;
        yield {i: produced};
      }
    }
    const stream = toNdjson(counter());
    // Read just the first line, then destroy the stream.
    const iter = stream[Symbol.asyncIterator]();
    const {value} = await iter.next();
    expect(typeof value).toBe("string");
    expect(value).toMatch(/^{"i":1}\n$/);
    stream.destroy();
    // A well-behaved Readable.from should not have pulled thousands of
    // records for the buffer — Node's default objectMode highWaterMark for
    // Readable.from is 16, but we're in byte mode so it's based on bytes.
    // The guard here is: count must be bounded, not runaway.
    expect(produced).toBeLessThan(500);
  });

  it("serializes nested objects faithfully", async () => {
    async function* records() {
      yield {a: {b: [1, 2, {c: "x"}]}};
    }
    const out = await drain(toNdjson(records()));
    expect(out).toBe(`{"a":{"b":[1,2,{"c":"x"}]}}\n`);
  });
});
