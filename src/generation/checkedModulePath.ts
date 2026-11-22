import path from 'node:path';

export function checkedModulePath(from: string, to: string): string {
  const relative = path.relative(from, to).split(path.sep).join('/');
  return relative.startsWith('../') ? relative : './' + relative;
}

export function hasModuleUrlDelimiters(file: string): boolean {
  return /[?#%]/.test(file);
}

/** Emits a Node load expression for a literal filesystem path containing URL delimiters.
 * @param file - Relative module path in TypeScript spelling.
 * @returns An awaited import with separate URL and TypeScript spellings.
 * @why Node reads ESM specifiers as URLs while NodeNext resolves the type query on disk.
 */
export function checkedModuleLoad(file: string): string {
  const urlPath = file.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `await import(new URL(${JSON.stringify(urlPath)}, import.meta.url).href) as typeof import(${JSON.stringify(file)})`;
}
