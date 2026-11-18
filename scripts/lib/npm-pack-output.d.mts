export declare function parsePackOutput(output: string): string[];
export declare function readPackReport(output: string): {
  filename: string;
  size: number;
  unpackedSize: number;
  files: {path: string; size: number}[];
};
