import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {describe, expect, it, vi, afterAll, afterEach} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {DEFAULT_LOADING_LIMITS, loadingLimits} from "../../src/loader/schemaResources.js";
import type {OfflineSchemaResource} from "../../src/loader/schemaResources.js";

const origin = "https://budget.example";
const uri = (n: number) => `${origin}/${n}.xsd`;
const schema = (content = "") => `<schema xmlns="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:budget">${content}</schema>`;
const include = (n: number) => `<include schemaLocation="${n}.xsd"/>`;
const padded = (bytes: number, content = "") => { const empty = schema(`<!-- -->${content}`); return Buffer.from(empty.replace("<!-- -->", `<!--${"x".repeat(bytes - Buffer.byteLength(empty) + 1)}-->`)); };
const pinned = (bytes: Uint8Array): OfflineSchemaResource => ({bytes, digest: createHash("sha256").update(bytes).digest("hex")});
const measurements: unknown[] = [];
async function measure(name: string, limit: number, unit: string, operation: () => Promise<unknown>, expected: "pass" | "resource-limit" | "transport") {
  const start = performance.now();
  let outcome = "pass";
  try { await operation(); } catch (error) { outcome = (error as {category: string}).category; }
  const elapsedMs = performance.now() - start;
  measurements.push({name, limit, unit, expected, outcome, elapsedMs});
  expect(outcome, name).toBe(expected);
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
afterAll(() => {
  mkdirSync("tmp/conformance/schema-loading", {recursive: true});
  writeFileSync("tmp/conformance/schema-loading/measurements.json", JSON.stringify({node: process.version, limits: DEFAULT_LOADING_LIMITS, measurements}, null, 2) + "\n");
});

describe("provisional schema loading budgets", () => {
  it("measures 128 resources and rejection of resource 129", async () => {
    for (const count of [128, 129]) {
      const resources = new Map(Array.from({length: count}, (_, n) => [uri(n), pinned(Buffer.from(schema(n === 0 ? Array.from({length: count - 1}, (_, i) => include(i + 1)).join("") : "")))]));
      await measure(`resources-${count}`, 128, "resources", async () => {
        const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources});
        expect(input.metrics.resources).toBe(count);
      }, count === 128 ? "pass" : "resource-limit");
    }
  });

  it("measures 8 MiB/resource and one decompressed byte beyond", async () => {
    for (const bytes of [8 * 1024 * 1024, 8 * 1024 * 1024 + 1]) {
      const buffer = padded(bytes); expect(buffer.byteLength).toBe(bytes);
      await measure(`resource-bytes-${bytes}`, DEFAULT_LOADING_LIMITS.resourceBytes, "decompressed bytes", async () => {
        const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: new Map([[uri(0), pinned(buffer)]])});
        expect(input.metrics.totalBytes).toBe(bytes);
      }, bytes === DEFAULT_LOADING_LIMITS.resourceBytes ? "pass" : "resource-limit");
    }
  });

  it("measures 64 MiB aggregate and one decompressed byte beyond", async () => {
    const resources = new Map(Array.from({length: 8}, (_, n) => [uri(n), pinned(padded(DEFAULT_LOADING_LIMITS.resourceBytes, n === 0 ? Array.from({length: 7}, (_, i) => include(i + 1)).join("") : ""))]));
    await measure("aggregate-at", DEFAULT_LOADING_LIMITS.totalBytes, "decompressed bytes", async () => {
      const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources});
      expect(input.metrics.totalBytes).toBe(DEFAULT_LOADING_LIMITS.totalBytes);
    }, "pass");
    // One more byte is checked on streamed bytes, without requiring a valid next XML document.
    const fetch = vi.fn(async (url: string) => {
      const n = Number(new URL(url).pathname.slice(1).split(".")[0]);
      return new Response(n === 8 ? Buffer.from("x") : padded(DEFAULT_LOADING_LIMITS.resourceBytes, n === 0 ? Array.from({length: 8}, (_, i) => include(i + 1)).join("") : ""));
    }); vi.stubGlobal("fetch", fetch);
    await measure("aggregate-beyond", DEFAULT_LOADING_LIMITS.totalBytes, "decompressed bytes", () => loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}}), "resource-limit");
    expect(fetch).toHaveBeenCalledTimes(9);
  });

  it("measures 32 resolution edges and rejects edge 33", async () => {
    for (const depth of [32, 33]) {
      const resources = new Map(Array.from({length: depth + 1}, (_, n) => [uri(n), pinned(Buffer.from(schema(n === depth ? "" : include(n + 1))))]));
      await measure(`resolution-depth-${depth}`, 32, "edges per active chain", () => loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources}), depth === 32 ? "pass" : "resource-limit");
    }
  });

  it("rejects excessive depth through a previously cached subtree", async () => {
    const resources = new Map(Array.from({length: 34}, (_, n) => [uri(n), pinned(Buffer.from(schema(n === 33 ? "" : include(n + 1))))]));
    resources.set(uri(0), pinned(Buffer.from(schema(include(3) + include(1)))));
    await expect(loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources})).rejects.toMatchObject({category: "resource-limit"});
  });

  it("counts cached WSDL inline schema chains at the WSDL's effective depth", async () => {
    const wsdl = (body: string) => `<w:definitions xmlns:w="http://schemas.xmlsoap.org/wsdl/" xmlns:x="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:wsdl">${body}</w:definitions>`;
    const imp = (name: string) => `<w:import namespace="urn:wsdl" location="${name}.wsdl"/>`;
    const documents = new Map<string, OfflineSchemaResource>([
      [`${origin}/root.wsdl`, pinned(Buffer.from(wsdl(imp("cached") + imp("deep"))))],
      [`${origin}/cached.wsdl`, pinned(Buffer.from(wsdl('<w:types><x:schema targetNamespace="urn:budget"><x:include schemaLocation="1.xsd"/></x:schema></w:types>')))],
      [`${origin}/deep.wsdl`, pinned(Buffer.from(wsdl(imp("cached"))))],
      [uri(1), pinned(Buffer.from(schema(include(2))))], [uri(2), pinned(Buffer.from(schema()))],
    ]);
    await expect(loadSchemaInput(`${origin}/root.wsdl`, {policy: {allowedOrigins: [origin]}, offlineResources: documents, limits: {resolutionDepth: 3}})).rejects.toMatchObject({category: "resource-limit"});
    const admitted = await loadSchemaInput(`${origin}/root.wsdl`, {policy: {allowedOrigins: [origin]}, offlineResources: documents, limits: {resolutionDepth: 4}});
    expect(admitted.resources).toHaveLength(5);
  });

  it("preserves the cycle cutoff when an include repeats at the depth boundary", async () => {
    for (const repeated of [false, true]) {
      const resources = new Map([[uri(0), pinned(Buffer.from(schema(include(1))))], [uri(1), pinned(Buffer.from(schema(include(2) + (repeated ? include(2) : ""))))], [uri(2), pinned(Buffer.from(schema(include(1))))]]);
      const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources, limits: {resolutionDepth: 3}});
      expect(input.resources).toHaveLength(3);
      expect(input.edges.some(e => e.cycle)).toBe(true);
    }
  });

  it("checks dense cached DAG depth without enumerating every path", async () => {
    const count = 30;
    const resources = new Map(Array.from({length: count}, (_, n) => [uri(n), pinned(Buffer.from(schema(Array.from({length: count - n - 1}, (_, i) => include(n + i + 1)).join(""))))]));
    const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    expect(input.resources).toHaveLength(count);
    expect(input.edges).toHaveLength(count * (count - 1) / 2);
    await expect(loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources, limits: {resolutionDepth: 28}})).rejects.toMatchObject({category: "resource-limit"});
  });

  it("retains many repeated include edges without repeating control-graph work", async () => {
    const count = 16_000;
    const resources = new Map([[uri(0), pinned(Buffer.from(schema(include(1).repeat(count))))], [uri(1), pinned(Buffer.from(schema()))]]);
    const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources});
    expect(input.resources).toHaveLength(2);
    expect(input.schemas).toHaveLength(2);
    expect(input.edges).toHaveLength(count);
  });

  it("counts a cycle closing edge from an alternate cached entry", async () => {
    const resources = new Map([
      [uri(0), pinned(Buffer.from(schema(include(1) + include(4))))],
      [uri(1), pinned(Buffer.from(schema(include(2))))],
      [uri(2), pinned(Buffer.from(schema(include(3))))],
      [uri(3), pinned(Buffer.from(schema(include(1))))],
      [uri(4), pinned(Buffer.from(schema(include(2))))],
    ]);
    await expect(loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources, limits: {resolutionDepth: 4}})).rejects.toMatchObject({category: "resource-limit"});
    const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources, limits: {resolutionDepth: 5}});
    expect(input.resources).toHaveLength(5);
    expect(input.edges.some(e => e.cycle)).toBe(true);
  });

  it("admits a closed cycle at its edge budget and rejects one edge below", async () => {
    const resources = new Map(Array.from({length: 32}, (_, n) => [uri(n), pinned(Buffer.from(schema(include(n === 31 ? 1 : n + 1))))]));
    const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources, limits: {resolutionDepth: 32}});
    expect(input.resources).toHaveLength(32);
    await expect(loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: resources, limits: {resolutionDepth: 31}})).rejects.toMatchObject({category: "resource-limit"});
  });

  it("measures five redirects and rejects the sixth before its destination fetch", async () => {
    for (const redirects of [5, 6]) {
      const fetch = vi.fn(async (url: string) => {
        const n = Number(new URL(url).pathname.slice(1).split(".")[0]);
        return n < redirects ? new Response(null, {status: 302, headers: {location: `${n + 1}.xsd`}}) : new Response(schema());
      }); vi.stubGlobal("fetch", fetch);
      await measure(`redirects-${redirects}`, 5, "redirects per resource", () => loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}}), redirects === 5 ? "pass" : "resource-limit");
      expect(fetch).toHaveBeenCalledTimes(6);
    }
  });

  it("measures exact per-resource deadlines using a controlled monotonic clock", async () => {
    for (const delay of [15_000, 15_001]) {
      vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "performance"]});
      let signal: AbortSignal | undefined;
      vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
        signal = options.signal!;
        return new Promise<Response>(resolve => setTimeout(() => resolve(new Response(schema())), delay));
      }));
      const pending = measure(`resource-time-${delay}`, 15_000, "controlled milliseconds", () => loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}}), delay === 15_000 ? "pass" : "transport");
      await vi.runAllTimersAsync(); await pending;
      expect(signal?.aborted).toBe(delay > 15_000);
      vi.useRealTimers();
    }
  });

  it("measures exact total I/O deadlines across separately fetched resources", async () => {
    for (const beyond of [false, true]) {
      vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "performance"]});
      vi.stubGlobal("fetch", vi.fn((url: string) => {
        const n = Number(new URL(url).pathname.slice(1).split(".")[0]);
        return new Promise<Response>(resolve => setTimeout(() => resolve(new Response(schema(n === 0 ? Array.from({length: beyond ? 8 : 7}, (_, i) => include(i + 1)).join("") : ""))), n === 8 ? 1 : 15_000));
      }));
      const pending = measure(`total-time-${beyond ? "beyond" : "at"}`, 120_000, "controlled milliseconds", async () => {
        const input = await loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}});
        expect(input.metrics.ioMs).toBe(120_000);
      }, beyond ? "transport" : "pass");
      await vi.runAllTimersAsync(); await pending;
      vi.useRealTimers();
    }
  });

  it("cancels a stalled body on a deadline and a body exceeding a byte limit", async () => {
    vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout", "performance"]});
    const cancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({cancel}))));
    const result = loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, limits: {resourceMs: 10}}).catch(e => e);
    await vi.runAllTimersAsync(); expect(await result).toMatchObject({category: "transport"}); expect(cancel).toHaveBeenCalled();
    vi.useRealTimers();
    const byteCancel = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({start(controller) {controller.enqueue(Buffer.alloc(20));}, cancel: byteCancel}))));
    await expect(loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, limits: {resourceBytes: 10}})).rejects.toMatchObject({category: "resource-limit"});
    expect(byteCancel).toHaveBeenCalled();
  });

  it("measures syntax depth 256/257 through the resolver and validates overrides", async () => {
    for (const depth of [256, 257]) {
      const xml = schema("<annotation>" + "<x>".repeat(depth - 2) + "</x>".repeat(depth - 2) + "</annotation>");
      await measure(`syntax-depth-${depth}`, 256, "elements", () => loadSchemaInput(uri(0), {policy: {allowedOrigins: [origin]}, offlineResources: new Map([[uri(0), pinned(Buffer.from(xml))]])}), depth === 256 ? "pass" : "resource-limit");
    }
    for (const value of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(() => loadingLimits({resources: value})).toThrow(RangeError);
    expect(loadingLimits({redirects: 0}).redirects).toBe(0);
  });
});
