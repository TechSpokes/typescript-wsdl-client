import fs from 'node:fs';
import path from 'node:path';
import {readBoundedFile} from '../util/readBoundedFile.js';

export type CheckedArtifactWriter = (file: string, body: string | Uint8Array) => void;

export const writeCheckedArtifact: CheckedArtifactWriter = (file, body) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body);
};

/** Resolve existing path components so aliases to a protected destination can be compared. */
export function checkedArtifactLocation(file: string): string {
  const absolute = path.resolve(file);
  try {
    return fs.realpathSync.native(absolute);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    const parent = path.dirname(absolute);
    return parent === absolute ? absolute : path.join(checkedArtifactLocation(parent), path.basename(absolute));
  }
}

export function checkedPathContains(parent: string, file: string): boolean {
  const relative = path.relative(parent, file);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Compare against newly qualified content without interpreting the installed file as authority. */
export function verifyCheckedArtifact(file: string, body: string | Uint8Array): void {
  const expected = typeof body === 'string' ? Buffer.from(body) : body;
  try {
    if (readBoundedFile(file, expected.length).equals(expected)) return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new Error(`incompatible-artifact: missing checked artifact ${file}. Regenerate the matching artifacts from the original WSDL and imports`, {cause: error});
    }
    if (code && code !== 'ENOTDIR' && code !== 'EISDIR') throw error;
  }
  throw new Error(`incompatible-artifact: altered or mismatched checked artifact ${file}. Regenerate the matching artifacts from the original WSDL and imports`);
}
