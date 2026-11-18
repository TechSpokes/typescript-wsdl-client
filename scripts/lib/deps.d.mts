export declare function selectExpectedRange(
  currentRange: string | undefined,
  latest: string,
): string;

export declare function directDependencyRanges(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Map<string, string>;
export declare function verifyGeneratedApp(ranges: ReadonlyMap<string, string>, manifestPath: string): string[];
export declare function failIfErrors(errors: readonly string[]): void;
