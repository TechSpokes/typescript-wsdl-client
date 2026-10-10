import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import * as soap from "soap";
import {SignedXml} from "xml-crypto";
import {DOMParser} from "@xmldom/xmldom";
import {
  children, fixtureDir, faultBody, generateProbe, installOrderedStreamSeams,
  invalidBody, orderedBody, orderedCapture, pinBufferedPort, responseParts, soap11, soap12, startProbeServer,
  type GeneratedProbe, type OrderedNode,
} from "../helpers/contentModelSoapProbe.js";
import {validateCapturedSoap} from "../helpers/contentModelSoapReference.js";

// This evidence intentionally asserts legacy failures. It is not a new public
// faithful runtime or a capability support claim for unexercised combinations.
describe("#169 bounded generated SOAP adapter feasibility", () => {
  let server: Awaited<ReturnType<typeof startProbeServer>>;
  let generated: Awaited<ReturnType<typeof generateProbe>>;
  beforeAll(async () => {
    server = await startProbeServer();
    generated = await generateProbe(server.url);
  });
  afterAll(async () => {generated?.cleanup(); await server?.close();});

  function rawResponse(xml: string): OrderedNode {
    const capture = orderedCapture();
    capture.write(xml); capture.close();
    return capture.records[0];
  }
  function assertContext(record: OrderedNode) {
    expect(children(children(record, "selection")[0]).map(node => node.name.local))
      .toEqual(["a", "b", "c", "a", "b"]);
    expect(children(children(record, "pairs")[0]).map(node => node.name.local)).toEqual(["p", "q", "p", "q"]);
    const kind = children(record, "kind")[0];
    expect(kind.name.namespace).toBe("urn:content-model:probe");
    expect(kind.namespaces.k).toBe("urn:kind");
    expect(kind.content).toEqual([{text: "k:T"}]);
    const nullable = children(record, "nullable")[0];
    expect(nullable.attributes).toEqual(expect.arrayContaining([
      {name: {namespace: "http://www.w3.org/2001/XMLSchema-instance", local: "nil"}, lexical: "true"},
      {name: {namespace: "", local: "id"}, lexical: "7"},
    ]));
    expect(nullable.content).toEqual([]);
  }
  function preencoded(client: GeneratedProbe) {return client.Submit({_xml: orderedBody});}
  async function drain(records: AsyncIterable<unknown>) {
    const values: unknown[] = [];
    for await (const record of records) values.push(record);
    return values;
  }

  it("qualifies fixture schema and rejects name-keyed order independently", async () => {
    expect(await validateCapturedSoap(orderedBody)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    expect(await validateCapturedSoap(invalidBody)).toMatchObject({primary: {accepted: false}, selectedContract: {accepted: false}});
    // Invisible grouping history is absent from the wire. Both are the same
    // ordered token value, without an invented recoverable group boundary.
    const first = [["x"], ["y", "z"]];
    const second = [["x", "y"], ["z"]];
    const encodeTokens = (groups: string[][]) => groups.flat().map(token => `<token>${token}</token>`).join("");
    expect(encodeTokens(first)).toBe(encodeTokens(second));
    expect(orderedBody).toContain(encodeTokens(first));
  });

  it("carries the exact shared body through buffered _xml and exposes raw response before parsing", async () => {
    server.configure({});
    const client = generated.create({endpoint: `${server.url}/override`}, new soap.BasicAuthSecurity("dummy", "dummy"));
    const dependency = await client.soapClient();
    pinBufferedPort(dependency, "First11", "urn:probe:submit");
    dependency.addHttpHeader("x-probe-request", "dummy");
    dependency.addSoapHeader('<trace xmlns="urn:headers">request</trace>');
    const seen: string[] = [];
    const originalParse = dependency.wsdl.xmlToObject.bind(dependency.wsdl) as (...args: unknown[]) => unknown;
    dependency.on("response", (xml: string) => {seen.push("raw"); assertContext(rawResponse(xml));});
    dependency.wsdl.xmlToObject = (...args: unknown[]) => {seen.push("parse"); return originalParse(...args);};
    const result = await preencoded(client);
    const request = server.requests.at(-1)!;
    expect(request.path).toBe("/override");
    expect(request.headers.soapaction).toBe('"urn:probe:submit"');
    expect(request.headers.authorization).toBe("Basic ZHVtbXk6ZHVtbXk=");
    expect(request.headers["x-probe-request"]).toBe("dummy");
    expect(request.xml).toContain('<trace xmlns="urn:headers">request</trace>');
    expect(request.xml).toContain(orderedBody);
    expect(result.requestRaw).toBe(request.xml);
    expect(result.responseRaw).toBe(responseParts().join(""));
    expect(result.headers).toMatchObject({trace: "response"});
    expect(dependency.lastResponseHeaders?.["x-probe"]).toBe("response");
    expect(seen).toEqual(["raw", "parse"]);
    expect(await validateCapturedSoap(request.xml)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    expect(await validateCapturedSoap(result.responseRaw)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    dependency.setEndpoint(`${server.url}/set-endpoint`);
    pinBufferedPort(dependency, "First11", "urn:probe:submit");
    await preencoded(client);
    expect(server.requests.at(-1)!.path).toBe("/set-endpoint");
  });

  it("executes the documented $xml ordered child hook and characterizes generated name-keying", async () => {
    server.configure({});
    const client = generated.create();
    const rawChildren = orderedBody.replace(/^<Submit[^>]*>/, "").replace(/<\/Submit>$/, "")
      .replace(/<(selection|pairs|ambiguous|kind|nullable)(?=[ >])/, '<$1 xmlns="urn:content-model:probe"')
      .replace(/<(pairs|ambiguous|kind|nullable)(?=[ >])/g, '<$1 xmlns="urn:content-model:probe"')
      .replace('<nullable ', '<nullable xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ');
    await client.Submit({$xml: rawChildren});
    expect(await validateCapturedSoap(server.requests.at(-1)!.xml)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    const legacy = {
      selection: {a: ["1", "4"], b: ["2", "5"], c: "3"},
      pairs: {p: ["6", "8"], q: ["7", "9"]}, ambiguous: {token: ["x", "y", "z"]},
      kind: {$value: "k:T", $attributes: {"xmlns:k": "urn:kind"}},
      nullable: {$attributes: {"xsi:nil": "true", id: "7"}},
    };
    await client.Submit(legacy);
    expect(await validateCapturedSoap(server.requests.at(-1)!.xml)).toMatchObject({primary: {accepted: false}, selectedContract: {accepted: false}});
    await client.StreamSubmit(legacy).then(result => drain(result.records));
    expect(await validateCapturedSoap(server.requests.at(-1)!.xml)).toMatchObject({primary: {accepted: false}, selectedContract: {accepted: false}});
  });

  it("feeds the same preencoded body into actual callStream and captures ordered context before EOF", async () => {
    server.configure({gated: true});
    const client = generated.create();
    const {capture, lifecycle} = installOrderedStreamSeams(client);
    const result = await client.StreamSubmit({});
    const iterator = result.records[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first.done).toBe(false);
    expect(server.finished).toBe(false);
    expect(lifecycle.outcome).toBe("pending");
    expect(capture.records).toHaveLength(1);
    assertContext(capture.records[0]);
    // Existing parser name-keys siblings and reduces nil+id to null. The tap
    // sees context before that lossy materialization on the very same bytes.
    expect(first.value).toMatchObject({selection: {a: ["1", "4"], b: ["2", "5"], c: "3"}, nullable: null});
    const request = server.requests.at(-1)!;
    expect(request.path).toBe("/first");
    expect(request.headers.soapaction).toBe('"urn:probe:stream"');
    expect(request.headers["content-type"]).toBe("text/xml; charset=utf-8");
    expect(result.headers["x-probe"]).toBe("response");
    expect(result.headers.trace).toBeUndefined();
    const soapHeader = children(capture.roots[0], "Header")[0];
    expect(children(soapHeader, "trace")[0].name.namespace).toBe("urn:headers");
    expect(request.xml).toContain(orderedBody);
    expect(result.requestRaw).toBe(request.xml);
    expect(await validateCapturedSoap(request.xml)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    server.release();
    expect((await iterator.next()).done).toBe(false);
    expect((await iterator.next()).done).toBe(true);
    expect(lifecycle.outcome).toBe("success");
    expect(capture.records).toHaveLength(2);
    assertContext(capture.records[1]);
    expect(capture.raw).toBe(responseParts().join(""));
    expect(await validateCapturedSoap(capture.raw)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
  });

  it("retains expanded names and nil aliases from HTTP chunks before the namespace-blind record parser", async () => {
    const xml = responseParts().join("")
      .replaceAll("<record ", '<p:record xmlns:p="urn:content-model:probe" ')
      .replaceAll("</record>", "</p:record>")
      .replaceAll('xsi:nil="true"', 'n:nil="true" xmlns:n="http://www.w3.org/2001/XMLSchema-instance"');
    server.configure({body: xml});
    const buffered = await preencoded(generated.create());
    assertContext(rawResponse(buffered.responseRaw));
    const client = generated.create();
    const seam = installOrderedStreamSeams(client);
    const result = await client.StreamSubmit({});
    // Shipped parser matches lexical tag names, so p:record is invisible.
    expect(await drain(result.records)).toEqual([]);
    expect(seam.capture.records).toHaveLength(2);
    assertContext(seam.capture.records[0]);
    expect(seam.capture.raw).toBe(xml);
    expect(await validateCapturedSoap(seam.capture.raw)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
  });

  it("executes explicit buffered ports/SOAP1.2 while streaming ignores node-soap binding overrides", async () => {
    server.configure({});
    const buffered = generated.create();
    const dep = await buffered.soapClient();
    dep.Submit = dep.SoapProbe.Second11.Submit;
    await preencoded(buffered);
    expect(server.requests.at(-1)!.path).toBe("/second");
    // node-soap shares method descriptors across bindings of one portType:
    // the last SOAP1.2 action overwrites this SOAP1.1 port's action.
    expect(server.requests.at(-1)!.headers.soapaction).toBe('"urn:probe:submit12"');
    pinBufferedPort(dep, "Second11", "urn:probe:submit");
    await preencoded(buffered);
    expect(server.requests.at(-1)!.headers.soapaction).toBe('"urn:probe:submit"');
    server.configure({namespace: soap12});
    const version12 = generated.create({forceSoap12Headers: true});
    const dep12 = await version12.soapClient();
    dep12.Submit = dep12.SoapProbe.Port12.Submit;
    const result12 = await preencoded(version12);
    expect(server.requests.at(-1)!.path).toBe("/soap12");
    expect(server.requests.at(-1)!.headers["content-type"]).toContain('application/soap+xml; charset=utf-8; action="urn:probe:submit12"');
    expect(server.requests.at(-1)!.xml).toContain(soap12);
    expect(dep12.lastResponseHeaders?.["content-type"]).toBe("application/soap+xml; charset=utf-8");
    expect(await validateCapturedSoap(result12.requestRaw)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    server.configure({});
    const streamed = generated.create({endpoint: `${server.url}/override`, forceSoap12Headers: true});
    const streamDep = await streamed.soapClient();
    streamDep.setEndpoint(`${server.url}/second`);
    streamDep.StreamSubmit = streamDep.SoapProbe.Port12.StreamSubmit;
    installOrderedStreamSeams(streamed);
    await streamed.StreamSubmit({}).then(value => drain(value.records));
    expect(server.requests.at(-1)!.path).toBe("/first");
    expect(server.requests.at(-1)!.xml).toContain(soap11);
    expect(server.requests.at(-1)!.headers.soapaction).toBe('"urn:probe:stream"');
  });

  it("executes Basic, HTTP/SOAP headers and UsernameToken independently on each current path", async () => {
    server.configure({});
    for (const security of [new soap.BasicAuthSecurity("dummy", "dummy"),
      new soap.WSSecurity("dummy", "dummy", {passwordType: "PasswordText", hasTimeStamp: false})]) {
      server.configure(security instanceof soap.BasicAuthSecurity ? {authorization: "Basic ZHVtbXk6ZHVtbXk="} : {});
      const client = generated.create({}, security);
      const dep = await client.soapClient();
      dep.addHttpHeader("x-probe-request", "dummy");
      dep.addSoapHeader('<trace xmlns="urn:headers">request</trace>');
      await preencoded(client);
      const buffered = server.requests.at(-1)!;
      expect(buffered.headers["x-probe-request"]).toBe("dummy");
      expect(buffered.xml).toContain('<trace xmlns="urn:headers">request</trace>');
      if (security instanceof soap.BasicAuthSecurity) expect(buffered.headers.authorization).toBe("Basic ZHVtbXk6ZHVtbXk=");
      else expect(buffered.xml).toContain("UsernameToken");
      installOrderedStreamSeams(client);
      if (security instanceof soap.BasicAuthSecurity) await expect(client.StreamSubmit({})).rejects.toThrow("401");
      else await client.StreamSubmit({}).then(value => drain(value.records));
      const streamed = server.requests.at(-1)!;
      expect(streamed.headers.authorization).toBeUndefined();
      expect(streamed.headers["x-probe-request"]).toBeUndefined();
      expect(streamed.xml).not.toContain("UsernameToken");
      expect(streamed.xml).not.toContain('<trace xmlns="urn:headers">request</trace>');
    }
  });

  it("executes mutual TLS on buffered calls and characterizes the dedicated fetch security failure", async () => {
    const tls = await startProbeServer(true);
    const tlsGenerated = await generateProbe(tls.url);
    try {
      const key = readFileSync(join(fixtureDir, "test-key.pem"));
      const cert = readFileSync(join(fixtureDir, "test-cert.pem"));
      const client = tlsGenerated.create({}, new soap.ClientSSLSecurity(key, cert, cert));
      await preencoded(client);
      expect(tls.requests.at(-1)!.tlsAuthorized).toBe(true);
      expect(await validateCapturedSoap(tls.requests.at(-1)!.xml)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
      installOrderedStreamSeams(client);
      await expect(client.StreamSubmit({})).rejects.toThrow("fetch failed");
      expect(tls.requests).toHaveLength(1);
    } finally {tlsGenerated.cleanup(); await tls.close();}
  });

  it("signs the final buffered preencoded body and verifies that signature locally, while stream omits it", async () => {
    server.configure({});
    const key = readFileSync(join(fixtureDir, "test-key.pem"), "utf8");
    const cert = readFileSync(join(fixtureDir, "test-cert.pem"), "utf8");
    const client = generated.create({}, new soap.WSSecurityCert(key, cert, "", {hasTimeStamp: false}));
    const result = await preencoded(client);
    expect(result.requestRaw).toContain(orderedBody);
    const document = new DOMParser().parseFromString(result.requestRaw, "text/xml");
    const signature = document.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature")[0];
    const verifier = new SignedXml({publicCert: cert, getCertFromKeyInfo: () => null});
    verifier.loadSignature(signature);
    expect(verifier.checkSignature(result.requestRaw)).toBe(true);
    expect(verifier.checkSignature(result.requestRaw.replace("<a>1</a>", "<a>changed</a>"))).toBe(false);
    expect(await validateCapturedSoap(result.requestRaw)).toMatchObject({primary: {accepted: true}, selectedContract: {accepted: true}});
    installOrderedStreamSeams(client);
    await client.StreamSubmit({}).then(result => drain(result.records));
    expect(server.requests.at(-1)!.xml).not.toContain("Signature");
    // No incoming signature verification is implemented or claimed here.
  });

  it("distinguishes HTTP failure, SOAP fault omissions, malformed EOF and syntax completion", async () => {
    server.configure({status: 500, body: faultBody});
    await expect(preencoded(generated.create())).rejects.toThrow();
    await expect(generated.create().StreamSubmit({})).rejects.toThrow("500");
    server.configure({body: faultBody});
    await expect(preencoded(generated.create())).rejects.toThrow("probe failure");
    const unadapted = await generated.create().StreamSubmit({});
    expect(await drain(unadapted.records)).toEqual([]);
    const faultClient = generated.create();
    const faultSeam = installOrderedStreamSeams(faultClient);
    await expect(faultClient.StreamSubmit({}).then(result => drain(result.records))).rejects.toThrow("soap-fault");
    expect(faultSeam.lifecycle.outcome).toBe("failure");
    server.configure({body: responseParts()[0]});
    const truncatedClient = generated.create();
    const truncatedSeam = installOrderedStreamSeams(truncatedClient);
    const truncated = await truncatedClient.StreamSubmit({});
    const iterator = truncated.records[Symbol.asyncIterator]();
    expect((await iterator.next()).done).toBe(false);
    await expect(iterator.next()).rejects.toThrow();
    expect(truncatedSeam.lifecycle.outcome).toBe("failure");
  });

  it("shows current early return does not cancel input and proves a consumption-bound cancellation seam", async () => {
    server.configure({gated: true});
    const current = await generated.create().StreamSubmit({});
    const currentIterator = current.records[Symbol.asyncIterator]();
    await currentIterator.next();
    await currentIterator.return!();
    expect(server.finished).toBe(false);
    expect(server.cancelled).toBe(false);
    server.release();
    server.configure({gated: true});
    const client = generated.create();
    const seam = installOrderedStreamSeams(client);
    const result = await client.StreamSubmit({});
    const iterator = result.records[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.return!();
    expect(seam.lifecycle.outcome).toBe("cancelled");
    await vi.waitFor(() => expect(server.cancelled).toBe(true));
    expect(server.finished).toBe(false);
    // Generated buffered call has no operation options. Forwarding one signal
    // through its existing node-soap call hook proves the bounded correction.
    server.configure({gated: true});
    const buffered = generated.create();
    const dep = await buffered.soapClient();
    const abort = new AbortController();
    const invoke = dep.Submit.bind(dep);
    dep.Submit = (args: unknown, callback: (...args: unknown[]) => void) => invoke(args, callback, {signal: abort.signal});
    const count = server.requests.length;
    const pending = preencoded(buffered);
    const rejection = expect(pending).rejects.toThrow(/cancel/i);
    await vi.waitFor(() => expect(server.requests.length).toBe(count + 1));
    abort.abort();
    await rejection;
    await vi.waitFor(() => expect(server.cancelled).toBe(true));
  });
});
