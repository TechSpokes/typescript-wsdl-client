import {describe, it, expect} from "vitest";
import {createClientAsync} from "soap";
import {buildProbeWsdl, startChunkedSoapServer} from "../helpers/chunkedSoapServer.js";

// PHASE-0 research: does node-soap surface response bytes incrementally?
//
// Strategy: stand up an HTTP server that writes a well-formed SOAP envelope
// in N chunks with inter-chunk delays, then call the generated operation via
// node-soap and record the wall-clock timestamp at which the operation
// promise resolves. Compare to the time at which the server flushed its
// first chunk and its last chunk.
//
// If node-soap is streaming, its callback should fire near the first-chunk
// flush time. If node-soap buffers the entire response before parsing, the
// callback fires at or after the server-close time.
//
// The research output (printed to stdout; not used as a gate) drives the
// transport decision recorded in scratches/plans/v017/streamable-responses.plan.yaml.

describe("research: node-soap response delivery mode", () => {
  it("measures time-to-callback against server first-chunk and close timings", async () => {
    const CHUNKS = [
      `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>`,
      `<StreamResponse xmlns="urn:probe"><Result>`,
      `chunked-ok`,
      `</Result></StreamResponse>`,
      `</soap:Body></soap:Envelope>`,
    ];
    const INTER_CHUNK_DELAY_MS = 150;

    let firstChunkFlushedAtMs: number | undefined;
    let serverClosedAtMs: number | undefined;

    // Two-pass server start: first build with placeholder URL to get port,
    // but we need URL up front for the WSDL. So build on an extra port-0 pass
    // by constructing the WSDL with a placeholder and rewriting, OR compute
    // the endpoint base first with a quick listen/close. Simpler: start with
    // an empty WSDL, read port, stop, rebuild WSDL with real URL, restart.
    // Easiest: use a throwaway-start to discover the port.
    const probe = await startChunkedSoapServer({
      wsdl: buildProbeWsdl("http://127.0.0.1:0/service"),
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
      // Rewrite WSDL with the real URL. node-soap loads WSDL from the URL
      // above; build a second WSDL-only endpoint would be overkill. Instead,
      // point node-soap at the root WSDL URL we already serve; the port is
      // what matters for endpoint resolution.
      // The WSDL currently embeds 127.0.0.1:0 as the SOAP address, which
      // node-soap uses to send the request. Override via the client endpoint.
      const client = await createClientAsync(probe.wsdlUrl, {
        endpoint: probe.url,
      });

      const tStart = Date.now();
      const [result] = await client.StreamAsync({q: "ping"});
      const tCallback = Date.now() - tStart;

      // Sanity: the response parsed.
      expect(result).toBeDefined();

      // Use relative timings from the server start, but both clocks share
      // wall time on the same machine; the server records t relative to its
      // own startTimeMs which is close to tStart here.
      const tFirstChunk = firstChunkFlushedAtMs ?? -1;
      const tClose = serverClosedAtMs ?? -1;

      // Hard assertion: server must have actually chunked. If the fixture
      // degenerated to a single write, this test proves nothing.
      expect(tClose).toBeGreaterThanOrEqual(tFirstChunk + INTER_CHUNK_DELAY_MS * (CHUNKS.length - 1) - 50);

      // Classification heuristic (telemetry only; not a hard gate because
      // wall-clock timings under Vitest parallel load can land in a narrow
      // ambiguous window).
      //   streaming  => callback fires well before server close
      //   buffering  => callback fires at or after server close
      // A gap of at least half the total server-emit duration separates the
      // two regimes in practice.
      const totalEmitMs = tClose - tFirstChunk;
      const streams = tCallback < tClose - totalEmitMs / 2;
      const buffers = tCallback >= tFirstChunk + totalEmitMs / 2;
      const verdict = streams && !buffers ? "STREAMS" : buffers && !streams ? "BUFFERS" : "AMBIGUOUS";

      // Intentional console output: this is a research probe, not a pass/fail
      // gate. The plan YAML records the human-read outcome.
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        kind: "node-soap-streaming-probe",
        verdict,
        firstChunkFlushedAtMs: tFirstChunk,
        serverClosedAtMs: tClose,
        clientCallbackAtMs: tCallback,
        interChunkDelayMs: INTER_CHUNK_DELAY_MS,
        chunkCount: CHUNKS.length,
      }, null, 2));
    } finally {
      await probe.close();
    }
  }, 20_000);
});
