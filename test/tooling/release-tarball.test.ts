import {execFileSync, type ExecFileSyncOptionsWithStringEncoding} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {load} from 'js-yaml';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {bindTarball, releaseTarballSource, validatePackedTarball, verifyTarball, type TarballIdentity} from '../../scripts/lib/release-tarball.ts';
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
    expect(record.integrity).toBe(integrity);
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
    expect(() => verifyTarball(archive, {...record, integrity: 'sha512-wrong'}, identity, record.sha256))
      .toThrow('Tarball integrity differs from the validated archive');
  });

  it('binds a guarded annotated release and refuses draft or abandoned inputs without OIDC', () => {
    const checkout = path.resolve(directory, 'checkout');
    const artifact = path.join(checkout, 'artifact');
    const releaseScripts = path.join(checkout, 'scripts');
    const hooks = path.join(checkout, 'empty-hooks');
    mkdirSync(path.join(releaseScripts, 'lib'), {recursive: true});
    mkdirSync(artifact);
    mkdirSync(hooks);
    for (const script of ['qualify-release-tarball.ts', 'lib/release-tarball.ts', 'lib/release-state.mjs']) {
      copyFileSync(fileURLToPath(new URL(`../../scripts/${script}`, import.meta.url)), path.join(releaseScripts, script));
    }
    const options: ExecFileSyncOptionsWithStringEncoding = {cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']};
    const git = (...args: string[]) => execFileSync('git', ['-c', 'user.name=Release Fixture', '-c', 'user.email=fixture@example.test',
      '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', '-c', `core.hooksPath=${hooks}`, ...args], options).trim();
    git('init', '--object-format=sha1');
    writeFileSync(path.join(checkout, 'package.json'), JSON.stringify({name: identity.name, version: identity.version, type: 'module'}));
    git('add', 'package.json');
    git('commit', '-m', 'Release fixture');
    const commit = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', commit);
    git('tag', '-a', identity.tag, '-m', 'Release fixture');
    const guardOutput = path.join(artifact, 'guard-output');
    const guard = (draft: boolean, published: boolean) => execFileSync(process.execPath, [path.join(releaseScripts, 'lib/release-state.mjs'),
      'guard', '--tag', identity.tag, '--draft', String(draft), '--prerelease', 'false', '--published', String(published),
      '--mode', 'package', '--require-main', 'true', '--github-output', guardOutput], options);
    expect(() => guard(true, false)).toThrow('Package publication requires an existing published');
    guard(false, true);
    const checked = /^release_commit=(.+)$/m.exec(readFileSync(guardOutput, 'utf8'))?.[1];
    expect(checked).toBe(commit);
    copyFileSync(archive, path.join(artifact, 'candidate.tgz'));
    writeFileSync(path.join(artifact, 'candidate'), JSON.stringify({filename: 'candidate.tgz', sha256}));
    const env: NodeJS.ProcessEnv = {...process.env, RELEASE_TARBALL_DIR: artifact, RELEASE_TAG: identity.tag, GITHUB_OUTPUT: path.join(artifact, 'output'),
      GITHUB_REPOSITORY: identity.repository, GITHUB_REPOSITORY_ID: identity.repositoryId, GITHUB_EVENT_NAME: 'release',
      GITHUB_WORKFLOW_REF: `${identity.repository}/.github/workflows/release-package.yml@refs/tags/${identity.tag}`,
      GITHUB_REF: `refs/tags/${identity.tag}`, GITHUB_SHA: commit, GITHUB_RUN_ID: identity.run, GITHUB_RUN_ATTEMPT: identity.attempt,
      GUARDED_RELEASE_COMMIT: checked, VALIDATED_SHA256: sha256};
    delete env.ACTIONS_ID_TOKEN_REQUEST_URL;
    const cli = path.join(releaseScripts, 'qualify-release-tarball.ts');
    expect(() => execFileSync(process.execPath, [cli, 'bind', '--release'], {...options, env: {...env, GUARDED_RELEASE_COMMIT: ''}}))
      .toThrow('Missing GUARDED_RELEASE_COMMIT');
    execFileSync(process.execPath, [cli, 'bind', '--release'], {...options, env});
    expect(execFileSync(process.execPath, [cli, 'verify', '--release'], {...options, env})).toContain(integrity);
    git('tag', '-a', `abandoned/${identity.tag}`, '-m', 'Abandon fixture');
    expect(() => guard(false, true)).toThrow('is permanently abandoned');
    git('update-ref', `refs/tags/abandoned/${identity.tag}`, git('rev-parse', 'HEAD:package.json'));
    expect(() => guard(false, true)).toThrow('does not resolve to a commit');
  });
});

describe('release tarball source', () => {
  const commit = 'a'.repeat(40);
  const expected = {tag: 'v1.2.3', commit};
  const source = {
    repository: 'owner/repo', workflowRef: 'owner/repo/.github/workflows/release-package.yml@refs/tags/v1.2.3',
    event: 'release', ref: 'refs/tags/v1.2.3', sha: commit, tag: 'v1.2.3',
    guardedCommit: commit, checkout: commit, version: '1.2.3',
  };

  it('requires matching published-event or recovery refs', () => {
    expect(releaseTarballSource(source)).toEqual(expected);
    expect(releaseTarballSource({...source, event: 'workflow_dispatch'})).toEqual(expected);
  });

  it.each([
    ['event', 'pull_request', 'requires a release event'],
    ['ref', 'refs/heads/main', 'must run from the target release tag'],
    ['workflowRef', 'owner/repo/.github/workflows/rehearsal.yml@refs/tags/v1.2.3', 'must run from the target release tag'],
    ['tag', 'v1.2.4', 'must run from the target release tag'],
    ['sha', 'b'.repeat(40), 'must match the event and guarded tag commit'],
    ['guardedCommit', 'b'.repeat(40), 'must match the event and guarded tag commit'],
    ['checkout', 'b'.repeat(40), 'must match the event and guarded tag commit'],
    ['version', '1.2.4', 'must match the guarded release tag'],
  ])('rejects substituted %s', (field, value, failure) => {
    expect(() => releaseTarballSource({...source, [field]: value})).toThrow(failure);
  });
});

it('uses the guarded build artifact as the only input to the trusted publisher', () => {
  interface Step {id?: string; uses?: string; run?: string; with?: Record<string, string>}
  interface Job {needs?: string; steps: Step[]; permissions: Record<string, string>}
  const workflow = load(readFileSync('.github/workflows/release-package.yml', 'utf8')) as {
    on: {release: {types: string[]}};
    jobs: {build: Job; 'publish-npm': Job};
  };
  const build = workflow.jobs.build;
  const publisher = workflow.jobs['publish-npm'];
  expect(workflow.on.release.types).toEqual(['published']);
  expect(publisher.needs).toBe('build');
  expect(build.permissions).toEqual({contents: 'read'});
  expect(publisher.permissions).toEqual({contents: 'read', 'id-token': 'write'});
  for (const job of [build, publisher]) {
    const guard = job.steps.findIndex(step => step.id === 'release-state');
    const work = job.steps.findIndex(step => step.id === 'bind' || step.uses?.startsWith('actions/download-artifact@'));
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(work).toBeGreaterThan(guard);
    expect(job.steps[guard]?.run).toContain('scripts/lib/release-state.mjs guard');
  }
  expect(build.steps.find(step => step.id === 'bind')?.run).toContain('release:publish-check -- --release-tarball');
  expect(publisher.steps.find(step => step.uses?.startsWith('actions/download-artifact@'))?.with?.['artifact-ids'])
    .toBe('${{ needs.build.outputs.artifact-id }}');
  const commands = publisher.steps.flatMap(step => step.run?.split('\n') ?? []);
  expect(commands).not.toContain('npm ci');
  expect(commands.filter(command => command.startsWith('npm publish ')))
    .toEqual(['npm publish "$RELEASE_TARBALL_DIR/package.tgz" --ignore-scripts --provenance --access public']);
  expect(commands.indexOf('node scripts/qualify-release-tarball.ts verify --release'))
    .toBe(commands.findIndex(command => command.startsWith('npm publish ')) - 1);
});
