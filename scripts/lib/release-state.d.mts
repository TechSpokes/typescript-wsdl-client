export function parseReleaseTag(tag: string): {tag: string; version: string; marker: string};
export function classifyAbandonmentMarker(input: {releaseCommit: string; markerCommit?: string}): "absent" | "matching";
export function verifyPublicationState(input: {draft: boolean; prerelease: boolean; published: boolean}): void;
