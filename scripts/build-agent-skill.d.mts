export interface AgentSkillReference {
  kind: "evergreen" | "fluid";
  source: string;
  output: string;
  sections?: string[];
  required?: boolean;
}

export interface AgentSkillManifest {
  references: AgentSkillReference[];
}

export interface AgentSkillBuildResult {
  archiveDigest?: string;
  archiveEntries: string[];
  checksumPath?: string;
  packageRoot: string;
  stageRoot: string;
  zipPath?: string;
}

export declare const skillFolderName: string;

export declare function extractSection(markdown: string, selector: string, sourcePath: string): string;

export declare function buildSourceMap(input: {
  version: string;
  tag: string;
  manifest: AgentSkillManifest;
}): object;

export declare function listZipEntries(archive: Buffer): string[];

export declare function buildAgentSkill(options?: {
  assetsDir?: string;
  createArchive?: boolean;
  stageRoot?: string;
  tag?: string;
}): Promise<AgentSkillBuildResult>;
