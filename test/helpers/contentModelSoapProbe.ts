import {createServer, type IncomingHttpHeaders, type ServerResponse} from "node:http";
import {createServer as createTlsServer} from "node:https";
import {readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync} from "node:fs";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {SaxesParser, type SaxesTagNS} from "saxes";
import {HttpClient, type Client, type IHttpClient, type IOptions, type ISecurity} from "soap";
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
}

const probeTransports = new WeakMap<GeneratedProbe, IHttpClient>();

// Pin one generated operation once, forwarding action as per-call headers.
// This avoids setSOAPAction's shared mutable state during concurrent calls.
export function pinBufferedPort(dependency: Client, port: "First11" | "Second11", action: string) {
  const invoke = dependency.SoapProbe[port].Submit;
  const headers = {SOAPAction: `"${action}"`};
  dependency.Submit = (args: unknown, callback: (...args: unknown[]) => void) => invoke(args, callback, {}, headers);
}

/**
 * Generate clients for the independent ordered-wire probe.
 * @param url Owned HTTP or TLS listener replacing the fixture's placeholder endpoints.
 * @param bindings Preserve the mixed fixture or isolate SOAP 1.1 for positive transport qualification.
 * @returns Client factory and cleanup for the generated temporary project.
 * @throws For WSDL compilation, generation, or module loading failures.
 * @sideEffects Writes a disposable project under tmp/conformance.
 */
export async function generateProbe(url: string, bindings: "mixed" | "single-soap11" = "mixed") {
  mkdirSync("tmp/conformance", {recursive: true});
  const directory = mkdtempSync(resolve("tmp/conformance/soap-feasibility-"));
  const wsdl = join(directory, "probe.wsdl");
  let source = readFileSync(join(fixtureDir, "probe.wsdl"), "utf8").replaceAll("http://127.0.0.1:1", url);
  // @constraints Positive transport checks isolate one binding; the original mixed fixture remains independent library-limit evidence.
  if (bindings === "single-soap11") source = source
    .replace(/<wsdl:binding name="Soap12"[\s\S]*?<\/wsdl:binding>/, "")
    .replace(/<wsdl:port name="(?:Second11|Port12)"[\s\S]*?<\/wsdl:port>/g, "");
  writeFileSync(wsdl, source);
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
      const transport = options.httpClient ?? new HttpClient(options);
      const client = new Probe({source: wsdl, options: {disableCache: true, ...options, httpClient: transport}, security});
      probeTransports.set(client, transport);
      return client;
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

/**
 * Inject the independent ordered body and capture the actual streamed XML bytes.
 * @param client Probe with a supplied public HTTP transport.
 * @param body Complete preencoded SOAP body element for independent order validation.
 * @returns Ordered syntax evidence and observed completion, failure, or cancellation.
 * @throws When the probe lacks a streaming HTTP transport or received XML is malformed.
 * @constraints Generated code retains endpoint, security, response parsing, and transport cleanup ownership.
 */
export function installOrderedStreamSeams(client: GeneratedProbe, body = orderedBody) {
  const originalEnvelope = client.buildSoapEnvelope.bind(client);
  client.buildSoapEnvelope = (...args) => originalEnvelope(...args)
    .replace(/(<soap:Body>)[\s\S]*(<\/soap:Body>)/, `$1${body}$2`);
  const capture = orderedCapture();
  const lifecycle: {outcome: "pending" | "success" | "failure" | "cancelled"} = {outcome: "pending"};
  const transport = probeTransports.get(client);
  if (!transport?.requestStream) throw new Error("Generated probe requires the supplied streaming HTTP transport");
  const requestStream = transport.requestStream.bind(transport);
  transport.requestStream = async (...args) => {
    const response = await requestStream(...args);
    const source = response.data;
    const iterator = source[Symbol.asyncIterator].bind(source);
    source.once("close", () => {if (lifecycle.outcome === "pending") lifecycle.outcome = "cancelled";});
    source[Symbol.asyncIterator] = async function* (): AsyncGenerator<string | Uint8Array, undefined, unknown> {
      const input = iterator();
      try {
        while (true) {
          const step = await input.next();
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
        if (lifecycle.outcome !== "success") await input.return?.();
      }
    };
    return response;
  };
  return {capture, lifecycle};
}
