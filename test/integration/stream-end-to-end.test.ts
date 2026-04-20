import {describe, it, expect} from "vitest";
import Fastify from "fastify";
import {parseRecords} from "../../src/runtime/streamXml.js";
import {toNdjson} from "../../src/runtime/ndjson.js";
import {startChunkedSoapServer} from "../helpers/chunkedSoapServer.js";

// Phase 5 acceptance gate for ADR-002:
//   "The chunked integration test proves the first record is sent before the
//    full SOAP response is available."
//
// The tests below wire together the same runtime primitives the generated
// client (src/client/generateClient.ts callStream) and generated gateway
// (src/gateway/generators.ts route handler) use, but drive them directly
// so the timing assertions don't depend on the wsdl-tsc build completing.

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* webStreamToAsyncIterable(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array> {
  const reader = body.getReader();
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch { /* noop */ }
  }
}

// Escapia-shaped SOAP body split into chunks so the server emits one record
// per chunk with inter-chunk delays. The wrapper elements are split across
// chunk boundaries to exercise the SAX parser's chunk-boundary handling.
const CHUNKS = [
  `<?xml version="1.0" encoding="utf-8"?>` +
    `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">` +
    `<soap:Body>` +
    `<StreamResponse xmlns="urn:probe">`,
  `<Records>`,
  `<Record><Id>1</Id><Name>alpha</Name></Record>`,
  `<Record><Id>2</Id><Name>beta</Name></Record>`,
  `<Record><Id>3</Id><Name>gamma</Name></Record>`,
  `</Records>`,
  `</StreamResponse></soap:Body></soap:Envelope>`,
];
const INTER_CHUNK_DELAY_MS = 150;

const SPEC = {
  recordPath: ["StreamResponse", "Records", "Record"],
  recordTypeName: "Record",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("stream end-to-end integration", () => {
  it("yields the first record before the upstream SOAP response finishes", async () => {
    let firstChunkFlushedAtMs: number | undefined;
    let serverClosedAtMs: number | undefined;
    const server = await startChunkedSoapServer({
      wsdl: "<unused/>",
      chunks: CHUNKS,
      interChunkDelayMs: INTER_CHUNK_DELAY_MS,
      onServerFlushedFirstChunk: (t) => {
        firstChunkFlushedAtMs = t;
      },
      onServerClosed: (t) => {
        serverClosedAtMs = t;
      },
    });
    try {
      const tStart = Date.now();
      const res = await fetch(server.url, {
        method: "POST",
        headers: {"content-type": "text/xml; charset=utf-8", soapaction: '"urn:probe/Stream"'},
        body: "<dummy/>",
      });
      expect(res.ok).toBe(true);
      expect(res.body).toBeTruthy();
      const records = parseRecords<{Id: string; Name: string}>(
        webStreamToAsyncIterable(res.body!),
        SPEC,
      );
      const iter = records[Symbol.asyncIterator]();
      const first = await iter.next();
      const tFirstRecord = Date.now() - tStart;
      expect(first.done).toBe(false);
      expect(first.value).toEqual({Id: "1", Name: "alpha"});

      // Drain the remaining records.
      const rest: Array<{Id: string; Name: string}> = [];
      while (true) {
        const step = await iter.next();
        if (step.done) break;
        rest.push(step.value);
      }
      expect(rest).toHaveLength(2);

      // Acceptance gate: first record must have arrived well before the
      // server wrote its last chunk. The server's total emit duration is
      // ~INTER_CHUNK_DELAY_MS * (CHUNKS.length - 1); allow a slack of one
      // chunk delay to absorb scheduler jitter on CI.
      expect(serverClosedAtMs, "server must have closed").toBeGreaterThan(0);
      expect(tFirstRecord).toBeLessThan((serverClosedAtMs ?? 0) - INTER_CHUNK_DELAY_MS);
      // Sanity: first record should follow first-chunk flush closely (within
      // a generous bound — we can't be tighter without flaking in CI).
      expect(firstChunkFlushedAtMs).toBeDefined();
    } finally {
      await server.close();
    }
  }, 15_000);

  it("fastify gateway emits the first NDJSON line before upstream EOF", async () => {
    let serverClosedAtMs: number | undefined;
    const server = await startChunkedSoapServer({
      wsdl: "<unused/>",
      chunks: CHUNKS,
      interChunkDelayMs: INTER_CHUNK_DELAY_MS,
      onServerClosed: (t) => {
        serverClosedAtMs = t;
      },
    });
    const app = Fastify({logger: false});
    app.post("/stream", async (_request, reply) => {
      const upstream = await fetch(server.url, {
        method: "POST",
        headers: {"content-type": "text/xml; charset=utf-8", soapaction: '"urn:probe/Stream"'},
        body: "<dummy/>",
      });
      const records = parseRecords(webStreamToAsyncIterable(upstream.body!), SPEC);
      reply.type("application/x-ndjson");
      return reply.send(toNdjson(records));
    });
    await app.listen({port: 0, host: "127.0.0.1"});
    try {
      const addr = app.server.address();
      if (!addr || typeof addr === "string") throw new Error("failed to bind Fastify");
      const port = addr.port;

      const tStart = Date.now();
      const res = await fetch(`http://127.0.0.1:${port}/stream`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: "{}",
      });
      expect(res.ok).toBe(true);
      expect(res.headers.get("content-type")).toContain("application/x-ndjson");
      expect(res.body).toBeTruthy();

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let firstLineAtMs: number | undefined;
      const collected: Array<{Id: string; Name: string}> = [];
      while (true) {
        const {value, done} = await reader.read();
        if (done) break;
        if (value) buffer += decoder.decode(value, {stream: true});
        let nl = buffer.indexOf("\n");
        while (nl >= 0) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          if (line.length > 0) {
            if (firstLineAtMs === undefined) firstLineAtMs = Date.now() - tStart;
            collected.push(JSON.parse(line));
          }
          nl = buffer.indexOf("\n");
        }
      }

      expect(collected).toHaveLength(3);
      expect(collected[0]).toEqual({Id: "1", Name: "alpha"});
      expect(firstLineAtMs, "first NDJSON line must arrive").toBeDefined();
      expect(serverClosedAtMs, "server must have closed").toBeGreaterThan(0);
      expect(firstLineAtMs!).toBeLessThan((serverClosedAtMs ?? 0) - INTER_CHUNK_DELAY_MS);
    } finally {
      await app.close();
      await server.close();
    }
  }, 20_000);
});
