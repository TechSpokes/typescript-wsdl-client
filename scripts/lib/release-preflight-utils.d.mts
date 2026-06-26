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

export declare const SUPPORTED_NODE_FLOOR: 24;

export declare const CURRENT_NODE_LINE: 26;

export declare function verifyNodeReleaseGate(
  inputs: {
    packageJson: {
      engines?: {
        node?: string;
      };
    };
    ciWorkflow: string;
    releasePackageWorkflow: string;
    releaseDraftWorkflow: string;
  },
): string[];
