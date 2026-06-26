export interface DatedChangelogSection {
  index: number;
  dateString: string;
}

export declare function findDatedChangelogSection(
  lines: string[],
  version: string,
): DatedChangelogSection | null;

export declare function verifyConformanceGateScripts(
  scripts: Record<string, string>,
): string[];
