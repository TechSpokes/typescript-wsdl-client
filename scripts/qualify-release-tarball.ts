/**
 * Binds and verifies the actual npm archive for release delivery and read-only qualification.
 * @since Unreleased
 */
import {execFileSync} from 'node:child_process';
import {appendFileSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {bindTarball, releaseTarballSource, verifyTarball, type TarballIdentity} from './lib/release-tarball.ts';

const setting = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

function main(): void {
  const [mode, context, ...unexpected] = process.argv.slice(2);
  if ((mode !== 'bind' && mode !== 'verify') || (context !== undefined && context !== '--release') || unexpected.length) {
    throw new Error('Use bind or verify with optional --release');
  }
  if (process.env.ACTIONS_ID_TOKEN_REQUEST_URL && (context === undefined || mode === 'bind')) {
    throw new Error('Tarball builds and rehearsals must run without OIDC capability');
  }
  const directory = setting('RELEASE_TARBALL_DIR');
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {name: string; version: string};
  const checkout = execFileSync('git', ['rev-parse', '--verify', 'HEAD^{commit}'], {encoding: 'utf8'}).trim();
  const repository = setting('GITHUB_REPOSITORY');
  const workflowRef = setting('GITHUB_WORKFLOW_REF');
  const source = context === '--release' ? releaseTarballSource({
    repository, workflowRef, event: setting('GITHUB_EVENT_NAME'), ref: setting('GITHUB_REF'), sha: setting('GITHUB_SHA'),
    tag: setting('RELEASE_TAG'), guardedCommit: setting('GUARDED_RELEASE_COMMIT'), checkout, version: manifest.version,
  }) : {commit: checkout, tag: `v${manifest.version}`};
  const identity: TarballIdentity = {
    ...source, repository, workflowRef, repositoryId: setting('GITHUB_REPOSITORY_ID'),
    run: setting('GITHUB_RUN_ID'), attempt: setting('GITHUB_RUN_ATTEMPT'), name: manifest.name, version: manifest.version,
  };
  const archive = path.join(directory, 'package.tgz');
  const recordPath = path.join(directory, 'package.json');
  if (mode === 'bind') {
    const candidate: unknown = JSON.parse(readFileSync(path.join(directory, 'candidate'), 'utf8'));
    if (typeof candidate !== 'object' || candidate === null || !('filename' in candidate) || !('sha256' in candidate)
      || typeof candidate.filename !== 'string' || !/^[a-z0-9_.-]+\.tgz$/i.test(candidate.filename)
      || candidate.filename === 'package.tgz' || typeof candidate.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256)) {
      throw new Error('Invalid validated tarball record');
    }
    const source = path.join(directory, candidate.filename);
    const record = bindTarball(source, identity, candidate.sha256);
    renameSync(source, archive);
    writeFileSync(recordPath, JSON.stringify(record) + '\n', {flag: 'wx'});
    appendFileSync(setting('GITHUB_OUTPUT'), `sha256=${record.sha256}\n`);
    console.log(`Validated package archive ${JSON.stringify(record)}`);
  } else {
    const record: unknown = JSON.parse(readFileSync(recordPath, 'utf8'));
    const verified = verifyTarball(archive, record, identity, setting('VALIDATED_SHA256'));
    console.log(`Verified package handoff ${JSON.stringify(verified)}`);
  }
}

main();
