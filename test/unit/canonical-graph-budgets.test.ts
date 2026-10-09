import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync} from "node:fs";
import {expect, it} from "vitest";
import {loadSchemaInput} from "../../src/loader/schemaInput.js";
import {buildCanonicalGraph} from "../../src/compiler/buildCanonicalGraph.js";
import {DEFAULT_GRAPH_NODES} from "../../src/compiler/canonicalGraph.js";

it("measures the provisional 100,000-node inclusive graph boundary", async () => {
  const measurements: {nodes: number; outcome: string; elapsedMs: number}[] = [];
  for (const count of [DEFAULT_GRAPH_NODES, DEFAULT_GRAPH_NODES + 1]) {
    const uri = "https://graph.test/budget.xsd";
    const bytes = Buffer.from('<schema xmlns="http://www.w3.org/2001/XMLSchema">' + Array.from({length: count}, (_, i) => `<element name="n${i}"/>`).join("") + "</schema>");
    const input = await loadSchemaInput(uri, {policy: {allowedOrigins: ["https://graph.test"]}, offlineResources: new Map([[uri, {bytes, digest: createHash("sha256").update(bytes).digest("hex")}]])});
    const start = performance.now();
    let outcome: string;
    if (count === DEFAULT_GRAPH_NODES) {
      expect(buildCanonicalGraph(input).nodes).toHaveLength(count); outcome = "passes";
    } else {
      expect(() => buildCanonicalGraph(input)).toThrowError(expect.objectContaining({category: "resource-limit"})); outcome = "resource-limit";
    }
    measurements.push({nodes: count, outcome, elapsedMs: performance.now() - start});
  }
  mkdirSync("tmp/conformance/schema-graph", {recursive: true});
  writeFileSync("tmp/conformance/schema-graph/measurements.json", JSON.stringify(measurements, null, 2) + "\n");
}, 60_000);
