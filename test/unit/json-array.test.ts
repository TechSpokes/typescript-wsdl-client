import {describe, expect, it} from "vitest";
import {toJsonArray} from "../../src/runtime/jsonArray.js";

async function drain(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: string[] = [];
  for await (const c of stream) {
    chunks.push(typeof c === "string" ? c : c.toString("utf-8"));
  }
  return chunks.join("");
}

async function readUntilError(stream: NodeJS.ReadableStream): Promise<{body: string; error: Error}> {
  const chunks: string[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (c) => chunks.push(c.toString("utf-8")));
    stream.on("error", (error: Error) => resolve({body: chunks.join(""), error}));
    stream.on("end", () => reject(new Error("expected error event, got end")));
  });
}

describe("toJsonArray", () => {
  it("emits an empty JSON array for an empty iterable", async () => {
    async function* records(): AsyncIterable<never> {
      // no yields
    }

    const out = await drain(toJsonArray(records()));
    expect(out).toBe("[]");
  });

  it("emits one record as a JSON array", async () => {
    async function* records() {
      yield {a: 1};
    }

    const out = await drain(toJsonArray(records()));
    expect(out).toBe(`[{"a":1}]`);
  });

  it("emits multiple records as a comma-delimited JSON array", async () => {
    async function* records() {
      yield {a: 1};
      yield {a: 2};
      yield {a: 3};
    }

    const out = await drain(toJsonArray(records()));
    expect(out).toBe(`[{"a":1},{"a":2},{"a":3}]`);
  });

  it("serializes nested objects faithfully", async () => {
    async function* records() {
      yield {a: {b: [1, 2, {c: "x,y"}]}};
    }

    const out = await drain(toJsonArray(records()));
    expect(out).toBe(`[{"a":{"b":[1,2,{"c":"x,y"}]}}]`);
  });

  it("does not emit bytes when the source fails before the first record", async () => {
    async function* failing() {
      throw new Error("boom before");
      yield {ok: false};
    }

    const result = await readUntilError(toJsonArray(failing()));
    expect(result.error.message).toBe("boom before");
    expect(result.body).toBe("");
  });

  it("emits a partial array when the source fails after the first record", async () => {
    async function* failing() {
      yield {ok: true};
      throw new Error("boom after");
    }

    const result = await readUntilError(toJsonArray(failing()));
    expect(result.error.message).toBe("boom after");
    expect(result.body).toBe(`[{"ok":true}`);
  });

  it("respects downstream backpressure: iterator does not run ahead", async () => {
    let produced = 0;
    async function* counter() {
      while (true) {
        produced++;
        yield {i: produced};
      }
    }

    const stream = toJsonArray(counter());
    const iter = stream[Symbol.asyncIterator]();
    const {value} = await iter.next();
    expect(typeof value).toBe("string");
    expect(value).toBe(`[{"i":1}`);
    await iter.return?.();
    expect(produced).toBeLessThan(500);
  });

  it("calls iterator return when the stream is destroyed before completion", async () => {
    let cleanedUp = false;
    async function* records() {
      try {
        yield {a: 1};
        yield {a: 2};
      } finally {
        cleanedUp = true;
      }
    }

    const stream = toJsonArray(records());
    const iter = stream[Symbol.asyncIterator]();
    await iter.next();
    await iter.return?.();

    expect(cleanedUp).toBe(true);
  });
});
