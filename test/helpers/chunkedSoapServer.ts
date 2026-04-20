import http, {type IncomingMessage, type Server, type ServerResponse} from "node:http";
import {once} from "node:events";
import {setTimeout as sleep} from "node:timers/promises";

// Research fixture: minimal HTTP server that answers a specific WSDL request and
// then streams a SOAP response body in pre-sliced chunks with inter-chunk delays,
// so we can observe whether a consumer (node-soap, a raw client, or a SAX parser)
// yields data before the server closes the response.

export interface ChunkedSoapServerOptions {
  wsdl: string;
  chunks: string[];
  interChunkDelayMs: number;
  preFirstChunkDelayMs?: number;
  contentType?: string;
  onServerFlushedFirstChunk?: (tAtFlushMs: number) => void;
  onServerClosed?: (tAtCloseMs: number) => void;
}

export interface RunningChunkedSoapServer {
  url: string;
  wsdlUrl: string;
  close(): Promise<void>;
  lastRequestBody: () => string | undefined;
  startTimeMs: number;
}

export async function startChunkedSoapServer(opts: ChunkedSoapServerOptions): Promise<RunningChunkedSoapServer> {
  let lastBody: string | undefined;
  const startTimeMs = Date.now();

  const server: Server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";

    if (req.method === "GET" && (url === "/service?wsdl" || url === "/service?WSDL")) {
      res.statusCode = 200;
      res.setHeader("content-type", "text/xml; charset=utf-8");
      res.end(opts.wsdl);
      return;
    }

    if (req.method === "POST" && url === "/service") {
      // Capture request body for test assertions.
      const bodyChunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => bodyChunks.push(chunk));
      await once(req, "end");
      lastBody = Buffer.concat(bodyChunks).toString("utf-8");

      res.statusCode = 200;
      res.setHeader("content-type", opts.contentType ?? "text/xml; charset=utf-8");
      // Force chunked transfer: do not set content-length; flush headers immediately.
      res.flushHeaders();

      if (opts.preFirstChunkDelayMs && opts.preFirstChunkDelayMs > 0) {
        await sleep(opts.preFirstChunkDelayMs);
      }

      for (let i = 0; i < opts.chunks.length; i++) {
        const chunk = opts.chunks[i];
        res.write(chunk);
        if (i === 0 && opts.onServerFlushedFirstChunk) {
          opts.onServerFlushedFirstChunk(Date.now() - startTimeMs);
        }
        if (i < opts.chunks.length - 1) {
          await sleep(opts.interChunkDelayMs);
        }
      }

      res.end();
      if (opts.onServerClosed) {
        opts.onServerClosed(Date.now() - startTimeMs);
      }
      return;
    }

    res.statusCode = 404;
    res.end("not found");
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("Failed to bind chunked SOAP server to a TCP port");
  }
  const base = `http://127.0.0.1:${addr.port}`;

  return {
    url: `${base}/service`,
    wsdlUrl: `${base}/service?wsdl`,
    startTimeMs,
    lastRequestBody: () => lastBody,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

// Minimal WSDL that describes a single operation `Stream` with a trivial
// string-in / string-out contract. Enough for node-soap to build a client;
// the streaming probe exchanges arbitrary XML bodies, so the output schema
// only needs to parse, not match the actual bytes.
export function buildProbeWsdl(endpointUrl: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"
                  xmlns:xs="http://www.w3.org/2001/XMLSchema"
                  xmlns:tns="urn:probe"
                  xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
                  targetNamespace="urn:probe">
  <wsdl:types>
    <xs:schema targetNamespace="urn:probe" elementFormDefault="qualified">
      <xs:element name="StreamRequest">
        <xs:complexType><xs:sequence><xs:element name="q" type="xs:string"/></xs:sequence></xs:complexType>
      </xs:element>
      <xs:element name="StreamResponse">
        <xs:complexType><xs:sequence>
          <xs:element name="Result" type="xs:string"/>
        </xs:sequence></xs:complexType>
      </xs:element>
    </xs:schema>
  </wsdl:types>
  <wsdl:message name="StreamIn"><wsdl:part name="parameters" element="tns:StreamRequest"/></wsdl:message>
  <wsdl:message name="StreamOut"><wsdl:part name="parameters" element="tns:StreamResponse"/></wsdl:message>
  <wsdl:portType name="ProbePort">
    <wsdl:operation name="Stream">
      <wsdl:input message="tns:StreamIn"/>
      <wsdl:output message="tns:StreamOut"/>
    </wsdl:operation>
  </wsdl:portType>
  <wsdl:binding name="ProbeBinding" type="tns:ProbePort">
    <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
    <wsdl:operation name="Stream">
      <soap:operation soapAction="urn:probe/Stream"/>
      <wsdl:input><soap:body use="literal"/></wsdl:input>
      <wsdl:output><soap:body use="literal"/></wsdl:output>
    </wsdl:operation>
  </wsdl:binding>
  <wsdl:service name="ProbeService">
    <wsdl:port name="ProbePort" binding="tns:ProbeBinding">
      <soap:address location="${endpointUrl}"/>
    </wsdl:port>
  </wsdl:service>
</wsdl:definitions>`;
}
