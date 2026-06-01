export interface MarkdownLink {
  line: number;
  target: string;
}

export interface CodeFence {
  code: string;
  language: string;
  line: number;
}

export interface DocsValidationError {
  file: string;
  line: number;
  message: string;
}

export function slugifyHeading(heading: string): string;
export function collectAnchors(markdown: string): Set<string>;
export function extractMarkdownLinks(markdown: string): MarkdownLink[];
export function extractCodeFences(markdown: string): CodeFence[];
export function validateMarkdownFile(filePath: string, repoRoot?: string): Promise<DocsValidationError[]>;
export function validateDocs(repoRoot?: string): Promise<DocsValidationError[]>;
