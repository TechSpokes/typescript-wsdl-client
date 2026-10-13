import {createHash} from "node:crypto";
import {readFileSync, readdirSync} from "node:fs";
import {dirname, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {describe, expect, it} from "vitest";
import {s06ResearchManifestUrl} from "./registry.js";

interface ResearchArtifact {
  path: string;
  sha256: string;
  role: "decision" | "prototype" | "fixture" | "expectations" | "reference" | "semantic-source";
}

interface ResearchContract {
  qualification: string;
  issue: number;
  disposition: "open" | "selected";
  productionOwner: number;
  artifacts: ResearchArtifact[];
}

interface ResearchManifest {
  formatVersion: number;
  scope: string;
  baseline: {revision: string; tree: string};
  historicalDraft: {revision: string; tree: string};
  semanticDefaults: {maxNodes: number; maxWork: number};
  baselineSemanticDefaults: {maxNodes: number; maxWork: number};
  contracts: ResearchContract[];
}

const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = JSON.parse(readFileSync(s06ResearchManifestUrl, "utf8")) as ResearchManifest;

describe("S06 research provenance and delivery scope", () => {
  it("pins selected research contracts and the open proof without certifying production support", () => {
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.scope).toBe("research-only; no production assessment acceptance");
    expect(manifest.baseline).toEqual({revision: "5876065b00d4eeb6d2324eaa63ff9b70e2279198",
      tree: "b647d9b0343d421426a539fc008c3cffa82c7875"});
    expect(manifest.historicalDraft).toEqual({revision: "460f5b8379c68ffef79917284e445b5ab046429e",
      tree: "56830b28d1006b019918a364aa62f1ed9d7d8817"});
    expect(manifest.baselineSemanticDefaults).toEqual({maxNodes: 100_000, maxWork: 1_000_000});
    expect(manifest.semanticDefaults).toEqual({maxNodes: 100_000, maxWork: 125_000_000});
    expect(manifest.contracts.map(contract => [contract.qualification, contract.issue,
      contract.disposition, contract.productionOwner])).toEqual([
      ["S06-AU-01", 233, "selected", 179], ["S06-RE-01", 234, "open", 179],
      ["S06-PW-01", 235, "selected", 179], ["S06-DT-01", 236, "selected", 179],
    ]);
  });

  for (const contract of manifest.contracts) {
    it(`audits exact artifacts and executable reference discovery for ${contract.qualification}`, () => {
      const paths = contract.artifacts.map(artifact => artifact.path);
      expect(new Set(paths).size).toBe(paths.length);
      expect(contract.artifacts.some(artifact => artifact.role === "decision")).toBe(true);
      expect(contract.artifacts.some(artifact => artifact.role === "fixture")).toBe(true);
      const discovered = contract.artifacts.filter(artifact => artifact.role === "reference" &&
        /test\/conformance\/reference\/[^/]+\.test\.ts$/.test(artifact.path));
      expect(discovered.length).toBeGreaterThan(0);
      for (const artifact of contract.artifacts) {
        expect(artifact.path).not.toMatch(/^(?:\/|[A-Za-z]+:)|(?:^|\/)\.\.(?:\/|$)/);
        const bytes = readFileSync(resolve(repository, artifact.path));
        expect(createHash("sha256").update(bytes).digest("hex"), artifact.path).toBe(artifact.sha256);
        if (artifact.role === "semantic-source") expect(artifact.path).toMatch(/^src\/.+\.ts$/);
        if (artifact.role === "prototype" && /\.(?:ts|mjs)$/.test(artifact.path)) {
          // #232 permits shared internal source authorities. Research adapters
          // may consume only source entries included in this evidence inventory.
          for (const match of bytes.toString("utf8").matchAll(/(?:from\s*|import\s*\()\s*["']([^"']*src\/[^"']+)["']/g)) {
            const sourcePath = relative(repository, resolve(repository, dirname(artifact.path), match[1]!)).replaceAll("\\", "/").replace(/\.js$/, ".ts");
            expect(manifest.contracts.some(entry => entry.artifacts.some(source =>
              source.role === "semantic-source" && source.path === sourcePath)), `${artifact.path} -> ${sourcePath}`).toBe(true);
          }
        }
      }
    });
  }

  it("keeps shared production authorities independent of research adapters", () => {
    // The reverse edge would create a second semantic authority or make shipping
    // source depend on research-only fixtures/experimental owner callbacks.
    function inspect(path: string): void {
      for (const item of readdirSync(resolve(repository, path), {withFileTypes: true})) {
        const child = `${path}/${item.name}`;
        if (item.isDirectory()) inspect(child);
        else if (item.name.endsWith(".ts")) {
          const source = readFileSync(resolve(repository, child), "utf8");
          for (const match of source.matchAll(/(?:from\s*|import\s*\()\s*["']([^"']+)["']/g)) {
            if (!match[1]!.startsWith(".")) continue;
            const target = relative(repository, resolve(repository, dirname(child), match[1]!)).replaceAll("\\", "/");
            expect(target, `${child} -> ${target}`).not.toMatch(/^(?:\.\.\/|test\/)/);
          }
        }
      }
    }
    inspect("src");
  });

  it("keeps every delivered S06 fixture in the hashed evidence inventory", () => {
    const inventory = new Set(manifest.contracts.flatMap(contract =>
      contract.artifacts.filter(artifact => artifact.role === "fixture").map(artifact => artifact.path)));
    const roots = [...new Set([...inventory].map(path => dirname(path)))];
    function walk(path: string): void {
      for (const item of readdirSync(resolve(repository, path), {withFileTypes: true})) {
        const child = `${path}/${item.name}`;
        if (item.isDirectory()) walk(child);
        else if (/\.(?:xsd|xml|wsdl)$/.test(item.name)) expect(inventory.has(child), child).toBe(true);
      }
    }
    for (const root of roots) walk(root);
  });
});
