import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {readPackReport} from './npm-pack-output.mjs';

export function candidateFilename(filename: string): string {
  if (typeof filename !== 'string' || path.basename(filename) !== filename || !filename.endsWith('.tgz')) {
    throw new Error('npm pack did not report a package filename');
  }
  return filename;
}

/** Reuse the validated delivery tarball or pack the existing build for a focused installed test.
 * @param destination Owned scratch for a standalone pack.
 * @param pack Runs npm pack and returns its JSON output.
 * @returns Absolute candidate tarball path.
 * @throws If the package metadata or pack operation is invalid.
 */
export async function candidateTarball(destination: string, pack: () => Promise<string>): Promise<string> {
  const workspace = process.env.WSDL_TEST_RUN_DIR;
  if (workspace) {
    const directory = path.join(workspace, 'package');
    const shared = await readFile(path.join(directory, 'candidate'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (shared !== undefined) return path.join(directory, candidateFilename(shared));
  }
  return path.join(destination, candidateFilename(readPackReport(await pack()).filename));
}

export function lockedDependencies(names: string[]): string[] {
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8')) as {
    packages: Record<string, {version: string}>;
  };
  return names.map(name => {
    const version = lock.packages['node_modules/' + name]?.version;
    if (!version) throw new Error(`Missing locked version for ${name}`);
    return `${name}@${version}`;
  });
}
