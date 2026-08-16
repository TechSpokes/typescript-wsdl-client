export interface SkillInstallOptions {
  force?: boolean;
  name?: string;
  skillDir?: string;
  target: string;
}

export declare function parseArgs(argv: string[]): {
  force: boolean;
  name: string;
  target: string;
};

export declare function installSkill(options: SkillInstallOptions): Promise<string>;
