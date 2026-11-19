/**
 * Validates npm tarball contents and binds verified bytes to the producing Actions attempt.
 * @since Unreleased
 * @why #505 qualifies a handoff without publication capability.
 */
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';

export interface TarballIdentity {
  repository: string;
  repositoryId: string;
  workflowRef: string;
  run: string;
  attempt: string;
  tag: string;
  commit: string;
  name: string;
  version: string;
}

export interface TarballRecord extends TarballIdentity {
  sha256: string;
}

function tar(args: string[], input?: Buffer): string {
  return execFileSync('tar', args, {input, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024});
}

function digestArchive(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Validates a locally built npm archive against its pack report and content contract.
 * @param archive Absolute path to the locally produced npm archive.
 * @param integrity Integrity from the same npm pack invocation.
 * @param reportFiles Files listed by the same pack invocation.
 * @param validate Package file and text validation shared with ordinary delivery.
 * @returns SHA-256 of the same bytes whose contents were validated.
 * @throws Error When the archive listing, its contents, or scratch cleanup fail.
 */
export async function validatePackedTarball(
  archive: string,
  integrity: string | undefined,
  reportFiles: readonly string[],
  validate: (files: readonly string[], readText: (file: string) => string) => void,
): Promise<string> {
  const bytes = readFileSync(archive);
  if (integrity !== `sha512-${createHash('sha512').update(bytes).digest('base64')}`) {
    throw new Error('Tarball bytes differ from the npm pack report');
  }
  const extracted = await mkdtemp(path.join(path.dirname(archive), 'validated-'));
  try {
    const snapshot = path.join(extracted, 'snapshot.tgz');
    await writeFile(snapshot, bytes, {flag: 'wx'});
    const entries = tar(['-tzf', snapshot]).trimEnd().split(/\r?\n/);
    const files = entries.map(entry => {
      const relative = entry.slice('package/'.length);
      if (!entry.startsWith('package/') || relative.includes('\\') || relative.includes(':')
        || relative.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid npm tarball path');
      return relative;
    });
    const expected = [...reportFiles].sort();
    if (new Set(files).size !== files.length || JSON.stringify([...files].sort()) !== JSON.stringify(expected)) {
      throw new Error('Tarball files differ from the npm pack report');
    }
    tar(['-xzf', snapshot, '-C', extracted]);
    validate(files, file => readFileSync(path.join(extracted, 'package', file), 'utf8'));
    return digestArchive(bytes);
  } finally {
    await rm(extracted, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
  }
}

/**
 * Binds a validated archive to the trusted build job inputs and its actual manifest.
 * @param archive Absolute archive path.
 * @param identity Expected checkout, run and release identity.
 * @param expectedDigest SHA-256 from the completed validation step.
 * @returns Identity and SHA-256 of the archive.
 * @throws Error When the archive or its manifest is missing or the package identity disagrees.
 */
export function bindTarball(archive: string, identity: TarballIdentity, expectedDigest: string): TarballRecord {
  const bytes = readFileSync(archive);
  const sha256 = digestArchive(bytes);
  if (sha256 !== expectedDigest) throw new Error('Tarball digest mismatch');
  const manifest: unknown = JSON.parse(tar(['-xOzf', '-', 'package/package.json'], bytes));
  if (typeof manifest !== 'object' || manifest === null || !('name' in manifest) || !('version' in manifest)
    || manifest.name !== identity.name || manifest.version !== identity.version || identity.tag !== `v${identity.version}`) {
    throw new Error('Tarball package identity does not match the candidate');
  }
  return {...identity, sha256};
}

/**
 * Checks the artifact record against the consumer job and the separate producer digest.
 * @param archive Fixed path to the downloaded archive.
 * @param record Record within the same downloaded artifact.
 * @param identity Independently established consumer job inputs.
 * @param digest Trusted digest conveyed as an output of the successful build job.
 * @returns The verified candidate identity and digest.
 * @throws Error For missing, modified or differently identified evidence.
 */
export function verifyTarball(archive: string, record: unknown, identity: TarballIdentity, digest: string): TarballRecord {
  if (typeof record !== 'object' || record === null) throw new Error('Missing tarball identity record');
  for (const [field, expected] of Object.entries(identity)) {
    if (Object.getOwnPropertyDescriptor(record, field)?.value !== expected) throw new Error(`Tarball ${field} does not match the receiving job`);
  }
  if (!/^[a-f0-9]{64}$/.test(digest) || !('sha256' in record) || record.sha256 !== digest) {
    throw new Error('Tarball record digest differs from the build job output');
  }
  return bindTarball(archive, identity, digest);
}
