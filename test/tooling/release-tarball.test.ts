import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {bindTarball, validatePackedTarball, verifyTarball, type TarballIdentity} from '../../scripts/lib/release-tarball.ts';
import {verificationPath} from '../helpers/verificationPath.js';

describe('release tarball handoff', () => {
  const identity: TarballIdentity = {
    repository: 'owner/repo', repositoryId: '123', workflowRef: 'owner/repo/.github/workflows/qualification.yml@refs/heads/main',
    run: '456', attempt: '1', tag: 'v1.2.3', commit: 'a'.repeat(40), name: '@scope/package', version: '1.2.3',
  };
  let directory: string;
  let archive: string;
  let sha256: string;
  let integrity: string;
  const files = ['package.json', 'README.md'];

  beforeAll(() => {
    const parent = verificationPath('tmp/conformance/release-tarball');
    mkdirSync(parent, {recursive: true});
    directory = mkdtempSync(path.join(parent, 'case-'));
    const packageDirectory = path.join(directory, 'package');
    mkdirSync(packageDirectory);
    writeFileSync(path.join(packageDirectory, 'package.json'), JSON.stringify({name: identity.name, version: identity.version}));
    writeFileSync(path.join(packageDirectory, 'README.md'), 'packed guide');
    archive = path.join(directory, 'candidate.tgz');
    execFileSync('tar', ['-czf', archive, '-C', directory, 'package/package.json', 'package/README.md']);
    const bytes = readFileSync(archive);
    sha256 = createHash('sha256').update(bytes).digest('hex');
    integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
  });

  afterAll(() => {
    if (directory) rmSync(directory, {recursive: true, force: true, maxRetries: 3});
  });

  it('validates actual archived text and refuses disagreement with the npm pack listing', async () => {
    await expect(validatePackedTarball(archive, integrity, files, (actual, readText) => {
      expect(actual).toEqual(files);
      expect(readText('README.md')).toBe('packed guide');
    })).resolves.toBe(sha256);
    await expect(validatePackedTarball(archive, integrity, ['package.json'], () => {throw new Error('unexpected validation');}))
      .rejects.toThrow('Tarball files differ from the npm pack report');
    await expect(validatePackedTarball(archive, undefined, files, () => {throw new Error('unexpected validation');}))
      .rejects.toThrow('Tarball bytes differ from the npm pack report');
  });

  it('binds and verifies the package identity and exact bytes', () => {
    const record = bindTarball(archive, identity, sha256);
    expect(verifyTarball(archive, record, identity, record.sha256)).toEqual(record);
    const wrongPackage = {...identity, name: '@scope/other'};
    expect(() => verifyTarball(archive, {...record, ...wrongPackage}, wrongPackage, record.sha256))
      .toThrow('Tarball package identity does not match the candidate');
  });

  it('refuses a different archive with the same package identity before binding', async () => {
    const validated = await validatePackedTarball(archive, integrity, files, () => undefined);
    const replacement = path.join(directory, 'replacement.tgz');
    writeFileSync(path.join(directory, 'package/README.md'), 'different guide');
    execFileSync('tar', ['-czf', replacement, '-C', directory, 'package/package.json', 'package/README.md']);
    expect(() => bindTarball(replacement, identity, validated)).toThrow('Tarball digest mismatch');
  });

  it.each([
    'repository', 'repositoryId', 'workflowRef', 'run', 'attempt', 'tag', 'commit', 'name', 'version',
  ] as const)('rejects wrong %s', field => {
    const record = bindTarball(archive, identity, sha256);
    expect(() => verifyTarball(archive, {...record, [field]: 'other'}, identity, record.sha256))
      .toThrow(`Tarball ${field} does not match the receiving job`);
  });

  it('rejects missing and modified archives and a substituted digest', () => {
    const record = bindTarball(archive, identity, sha256);
    expect(() => verifyTarball(path.join(directory, 'missing.tgz'), record, identity, record.sha256)).toThrow(/ENOENT/);
    const changed = path.join(directory, 'changed.tgz');
    copyFileSync(archive, changed);
    appendFileSync(changed, Buffer.from([0]));
    expect(() => verifyTarball(changed, record, identity, record.sha256)).toThrow('Tarball digest mismatch');
    expect(() => verifyTarball(changed, {...record, sha256: 'b'.repeat(64)}, identity, record.sha256))
      .toThrow('Tarball record digest differs from the build job output');
  });
});
