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
export declare const ROOT: string;
export declare function npmEnv(): NodeJS.ProcessEnv;
export declare function npmInvocation(args: string[]): {command: string; args: string[]; shell: boolean};
