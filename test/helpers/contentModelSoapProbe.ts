import {createServer, type IncomingHttpHeaders, type ServerResponse} from "node:http";
import {createServer as createTlsServer} from "node:https";
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {SaxesParser, type SaxesTagNS} from "saxes";
import type {Client, IOptions, ISecurity} from "soap";
import {runGenerationPipeline} from "../../src/pipeline.js";

export const fixtureDir = resolve("test/conformance/fixtures/soap/content-model");
export const orderedBody = readFileSync(join(fixtureDir, "ordered.xml"), "utf8").trim();
export const invalidBody = readFileSync(join(fixtureDir, "name-keyed-invalid.xml"), "utf8").trim();
export const faultBody = readFileSync(join(fixtureDir, "fault.xml"), "utf8").trim();
export const soap11 = "http://schemas.xmlsoap.org/soap/envelope/";
export const soap12 = "http://www.w3.org/2003/05/soap-envelope";
const payloadNamespace = "urn:content-model:probe";
const record = orderedBody.replace(/Submit/g, "record");

export function responseParts(namespace = soap11): [string, string] {
  return [
    `<soap:Envelope xmlns:soap="${namespace}"><soap:Header><trace xmlns="urn:headers">response</trace></soap:Header><soap:Body><SubmitResponse xmlns="${payloadNamespace}"><records>${record}`,
    `${record}</records></SubmitResponse></soap:Body></soap:Envelope>`,
  ];
}

export type ResponsePlan = {status?: number; body?: string; gated?: boolean; namespace?: string; authorization?: string};
export type CapturedRequest = {path: string; headers: IncomingHttpHeaders; xml: string; tlsAuthorized: boolean};

export async function startProbeServer(tls = false) {
  const requests: CapturedRequest[] = [];
  let plan: ResponsePlan = {};
  let release: (() => void) | undefined;
  let latestResponse = {finished: false, cancelled: false};
  const handler = (request: import("node:http").IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];
    request.on("data", chunk => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      requests.push({path: request.url ?? "", headers: request.headers,
        xml: Buffer.concat(chunks).toString("utf8"),
        tlsAuthorized: Boolean((request.socket as import("node:tls").TLSSocket).authorized)});
      const state = {finished: false, cancelled: false};
      latestResponse = state;
      response.on("finish", () => {state.finished = true;});
      response.on("close", () => {if (!state.finished) state.cancelled = true;});
      if (plan.authorization && request.headers.authorization !== plan.authorization) {
        response.writeHead(401); response.end("dummy authorization required"); return;
      }
      response.writeHead(plan.status ?? 200, {
        "content-type": plan.namespace === soap12 ? "application/soap+xml; charset=utf-8" : "text/xml; charset=utf-8",
        "x-probe": "response",
      });
      if (plan.body !== undefined) {
        response.end(plan.body);
      } else {
        const [prefix, tail] = responseParts(plan.namespace);
        response.write(prefix);
        if (plan.gated) release = () => response.end(tail);
        else response.end(tail);
      }
    });
  };
  const server = tls ? createTlsServer({
    key: readFileSync(join(fixtureDir, "test-key.pem")),
    cert: readFileSync(join(fixtureDir, "test-cert.pem")),
    ca: readFileSync(join(fixtureDir, "test-cert.pem")),
    requestCert: true, rejectUnauthorized: true,
  }, handler) : createServer(handler);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Probe listener missing");
  return {
    url: `${tls ? "https" : "http"}://127.0.0.1:${address.port}`,
    requests,
    configure(next: ResponsePlan) {plan = next; release = undefined;},
    release() {if (!release) throw new Error("No gated response"); release();},
    get finished() {return latestResponse.finished;},
    get cancelled() {return latestResponse.cancelled;},
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    },
  };
}

export interface BufferedResult {
  response: unknown; headers: unknown; responseRaw: string; requestRaw: string;
}
export interface StreamResult {
  records: AsyncIterable<unknown>; headers: Record<string, string>; requestRaw: string;
}
export interface GeneratedProbe {
  Submit(args: unknown): Promise<BufferedResult>;
  StreamSubmit(args: unknown): Promise<StreamResult>;
  soapClient(): Promise<Client>;
  buildSoapEnvelope(...args: unknown[]): string;
  webStreamToAsyncIterable(body: ReadableStream<Uint8Array>): AsyncIterable<Uint8Array>;
}

// Pin one generated operation once, forwarding action as per-call headers.
// This avoids setSOAPAction's shared mutable state during concurrent calls.
export function pinBufferedPort(dependency: Client, port: "First11" | "Second11", action: string) {
  const invoke = dependency.SoapProbe[port].Submit;
  const headers = {SOAPAction: `"${action}"`};
  dependency.Submit = (args: unknown, callback: (...args: unknown[]) => void) => invoke(args, callback, {}, headers);
}

export async function generateProbe(url: string) {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/soap-feasibility-"));
  const wsdl = join(directory, "probe.wsdl");
  writeFileSync(wsdl, readFileSync(join(fixtureDir, "probe.wsdl"), "utf8")
    .replaceAll("http://127.0.0.1:1", url));
  await runGenerationPipeline({
    wsdl, catalogOut: join(directory, "client/catalog.json"), clientOutDir: join(directory, "client"),
    compiler: {imports: "js"},
    streamConfig: {shapeCatalogs: {}, operations: {StreamSubmit: {
      mode: "stream", format: "ndjson", mediaType: "application/x-ndjson",
      recordPath: ["SubmitResponse", "records", "record"], recordTypeName: "RecordType",
    }}},
  });
  const module = await import(pathToFileURL(join(directory, "client/client.ts")).href);
  const Probe = module.SoapProbe as new(options: {source: string; options: IOptions; security?: ISecurity}) => GeneratedProbe;
  return {
    create(options: IOptions = {}, security?: ISecurity) {
      return new Probe({source: wsdl, options: {disableCache: true, ...options}, security});
    },
    cleanup() {rmSync(directory, {recursive: true, force: true});},
  };
}

export interface OrderedNode {
  name: {namespace: string; local: string};
  attributes: Array<{name: {namespace: string; local: string}; lexical: string}>;
  namespaces: Record<string, string>;
  content: Array<OrderedNode | {text: string}>;
}

// Syntax capture only: no particle matching, scalar conversion or projection.
export function orderedCapture() {
  const parser = new SaxesParser({xmlns: true});
  const decoder = new TextDecoder();
  const roots: OrderedNode[] = [];
  const records: OrderedNode[] = [];
  const stack: OrderedNode[] = [];
  const rawParts: string[] = [];
  let error: Error | undefined;
  parser.on("opentag", (tag: SaxesTagNS) => {
    const node: OrderedNode = {
      name: {namespace: tag.uri, local: tag.local},
      namespaces: {...stack.at(-1)?.namespaces, ...tag.ns},
      attributes: Object.values(tag.attributes).filter(attr => attr.uri !== "http://www.w3.org/2000/xmlns/")
        .map(attr => ({name: {namespace: attr.uri, local: attr.local}, lexical: attr.value})),
      content: [],
    };
    if (stack.length) stack.at(-1)!.content.push(node);
    else roots.push(node);
    stack.push(node);
  });
  parser.on("closetag", () => {
    const node = stack.pop()!;
    if (node.name.namespace === payloadNamespace && node.name.local === "record") records.push(node);
    if ([soap11, soap12].includes(node.name.namespace) && node.name.local === "Fault") error = new Error("soap-fault");
  });
  parser.on("text", text => stack.at(-1)?.content.push({text}));
  parser.on("cdata", text => stack.at(-1)?.content.push({text}));
  parser.on("doctype", () => {error = new Error("DOCTYPE prohibited");});
  parser.on("error", cause => {error = cause;});
  return {
    roots, records,
    get raw() {return rawParts.join("");},
    write(chunk: string | Uint8Array) {
      const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, {stream: true});
      rawParts.push(text);
      parser.write(text);
      if (error) throw error;
    },
    close() {
      const tail = decoder.decode(); rawParts.push(tail);
      parser.write(tail).close(); if (error) throw error;
    },
  };
}

export function children(node: OrderedNode, local?: string): OrderedNode[] {
  return node.content.filter((entry): entry is OrderedNode => "name" in entry && (!local || entry.name.local === local));
}

// Override two existing protected hooks on the generated instance. The actual
// generated callStream still owns endpoint/action/fetch/status/parseRecords.
export function installOrderedStreamSeams(client: GeneratedProbe, body = orderedBody) {
  const originalEnvelope = client.buildSoapEnvelope.bind(client);
  client.buildSoapEnvelope = (...args) => originalEnvelope(...args)
    .replace(/(<soap:Body>)[\s\S]*(<\/soap:Body>)/, `$1${body}$2`);
  const capture = orderedCapture();
  const lifecycle: {outcome: "pending" | "success" | "failure" | "cancelled"} = {outcome: "pending"};
  client.webStreamToAsyncIterable = async function* (source) {
    const reader = source.getReader();
    try {
      while (true) {
        const step = await reader.read();
        if (step.done) {
          capture.close();
          lifecycle.outcome = "success";
          return;
        }
        capture.write(step.value);
        yield step.value;
      }
    } catch (error) {
      lifecycle.outcome = "failure";
      throw error;
    } finally {
      if (lifecycle.outcome === "pending") lifecycle.outcome = "cancelled";
      if (lifecycle.outcome !== "success") await reader.cancel();
      reader.releaseLock();
    }
  };
  return {capture, lifecycle};
}
