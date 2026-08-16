import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {installSkill} from "../../agent-skill/install.mjs";
import {buildAgentSkill, listZipEntries} from "../../scripts/build-agent-skill.mjs";
import {extractAgentSkillZip, verifyAgentSkillChecksum} from "../../scripts/verify-agent-skill-artifact.mjs";

let roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wsdl-agent-skill-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) {
    rmSync(root, {force: true, recursive: true});
  }
  roots = [];
});

describe("agent skill release artifact", () => {
  it("emits a checksummed ZIP with the exact installable inventory", async () => {
    const root = makeRoot();
    const result = await buildAgentSkill({
      assetsDir: join(root, "assets"),
      stageRoot: join(root, "stage"),
      tag: `v${JSON.parse(readFileSync("package.json", "utf8")).version}`,
    });
    if (!result.zipPath || !result.checksumPath || !result.archiveDigest) {
      throw new Error("Expected a complete archived build result.");
    }

    await expect(verifyAgentSkillChecksum(result.zipPath, result.checksumPath)).resolves.toBe(result.archiveDigest);
    const archive = await readFile(result.zipPath);
    expect(listZipEntries(archive)).toEqual(result.archiveEntries);
    expect(result.archiveEntries).toContain("typescript-wsdl-client/LICENSE");
    expect(result.archiveEntries).toContain("typescript-wsdl-client/references/SOURCE-MAP.json");

    const extractRoot = join(root, "extracted");
    await expect(extractAgentSkillZip(archive, extractRoot)).resolves.toEqual(result.archiveEntries);
    expect(readFileSync(join(extractRoot, "typescript-wsdl-client", "SKILL.md"), "utf8")).toContain("license: MIT");
  });
});

describe("agent skill installer", () => {
  it("refuses an existing install without force and replaces it exactly with force", async () => {
    const root = makeRoot();
    const source = join(root, "candidate");
    const target = join(root, "skills");
    const existing = join(target, "typescript-wsdl-client");
    mkdirSync(join(source, "references"), {recursive: true});
    mkdirSync(existing, {recursive: true});
    writeFileSync(join(source, "SKILL.md"), "candidate\n");
    writeFileSync(join(source, "references", "current.md"), "current\n");
    writeFileSync(join(existing, "SKILL.md"), "locally modified\n");
    writeFileSync(join(existing, "stale.md"), "stale\n");

    await expect(installSkill({skillDir: source, target})).rejects.toThrow("Pass --force to replace it");
    expect(readFileSync(join(existing, "SKILL.md"), "utf8")).toBe("locally modified\n");
    expect(readFileSync(join(existing, "stale.md"), "utf8")).toBe("stale\n");

    await expect(installSkill({force: true, skillDir: source, target})).resolves.toBe(existing);
    expect(readFileSync(join(existing, "SKILL.md"), "utf8")).toBe("candidate\n");
    expect(readFileSync(join(existing, "references", "current.md"), "utf8")).toBe("current\n");
    expect(() => readFileSync(join(existing, "stale.md"), "utf8")).toThrow();
    expect(readdirSync(target).filter(name => name.startsWith(".typescript-wsdl-client."))).toEqual([]);
  });

  it("changes only the explicit target tree", async () => {
    const root = makeRoot();
    const source = join(root, "candidate");
    const target = join(root, "consumer", "skills");
    const protectedFiles = [
      join(root, ".codex", "config.toml"),
      join(root, ".vscode", "settings.json"),
      join(root, "mcp.json"),
      join(root, "profile.ps1"),
    ];
    mkdirSync(source, {recursive: true});
    writeFileSync(join(source, "SKILL.md"), "candidate\n");
    for (const file of protectedFiles) {
      mkdirSync(join(file, ".."), {recursive: true});
      writeFileSync(file, `sentinel:${file}\n`);
    }
    const before = protectedFiles.map(file => readFileSync(file, "utf8"));

    await installSkill({skillDir: source, target});

    expect(protectedFiles.map(file => readFileSync(file, "utf8"))).toEqual(before);
    expect(readFileSync(join(target, "typescript-wsdl-client", "SKILL.md"), "utf8")).toBe("candidate\n");
  });

  it("rejects installation inside the extracted source tree", async () => {
    const root = makeRoot();
    const source = join(root, "candidate");
    mkdirSync(source, {recursive: true});
    writeFileSync(join(source, "SKILL.md"), "candidate\n");

    await expect(installSkill({skillDir: source, target: join(source, "skills")})).rejects.toThrow(
      "outside the extracted skill directory",
    );
  });

  it("rejects programmatic folder names that escape the target", async () => {
    const root = makeRoot();
    const source = join(root, "candidate");
    mkdirSync(source, {recursive: true});
    writeFileSync(join(source, "SKILL.md"), "candidate\n");

    await expect(installSkill({name: "../outside", skillDir: source, target: join(root, "skills")})).rejects.toThrow(
      "must be a folder name",
    );
  });
});
