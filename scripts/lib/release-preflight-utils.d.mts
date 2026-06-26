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

export declare function verifyPublishWorkflowGate(
  scripts: Record<string, string>,
  releasePackageWorkflow: string,
): string[];

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
