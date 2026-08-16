export interface DatedChangelogSection {
  index: number;
  dateString: string;
}

export declare function findDatedChangelogSection(
  lines: string[],
  version: string,
): DatedChangelogSection | null;

export declare function verifyTrackedTreeStable(
  before: string,
  after: string,
): string[];

export declare function verifyConformanceGateScripts(
  scripts: Record<string, string>,
): string[];

export declare function verifyPublishWorkflowGate(
  scripts: Record<string, string>,
  releasePackageWorkflow: string,
): string[];

export declare function verifySkillDeliveryGate(
  releaseDraftWorkflow: string,
): string[];

export declare function verifyReleaseAbandonmentGate(
  workflows: {
    releaseDraftWorkflow: string;
    releasePackageWorkflow: string;
    releaseAbandonWorkflow: string;
  },
): string[];

export declare function verifyNodeReleaseGate(
  inputs: {
    packageJson: {
      engines?: {
        node?: string;
      };
    };
    ciWorkflow: string;
    releaseAbandonWorkflow: string;
    releasePackageWorkflow: string;
    releaseDraftWorkflow: string;
  },
): string[];
