import {mkdtemp, mkdir, readFile, writeFile, rm, realpath, stat} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {runOwnedNode} from './ownedNodeProcess.js';

export interface InstalledIntakeTooling {
  readonly root: string; readonly tooling: string; readonly cli: string; readonly tarball: string;
  consumerInstall?: {generatedManifest: string; installedManifest: string; lockfile: string; candidateTarballRelative: string};
}

/** Capture successful isolated-install context without retaining generated projects.
 * @param evidence Directory containing this consumer family's compact evidence.
 * @param project Independently installed consumer directory.
 * @param env The exact npm command environment.
 * @param cachePresentBefore Whether npm's content cache existed before this command; this is not a hit claim.
 * @param lockReused Whether an identical generated manifest reused this candidate's resolved lock.
 * @returns Resolves after sanitized manifest and resolved-version evidence is written.
 * @throws For missing or malformed successful-install metadata.
 * @sideEffects Writes context.json; does not share installed files between consumers.
 */
export async function recordIntakeInstallation(evidence: string, project: string, env: NodeJS.ProcessEnv, cachePresentBefore: boolean, lockReused = false): Promise<void> {
  const lockText = await readFile(path.join(project, 'package-lock.json'), 'utf8');
  const lock = JSON.parse(lockText) as {packages: Record<string, {version?: string; integrity?: string}>};
  const filename = path.join(evidence, 'context.json');
  const context = JSON.parse(await readFile(filename, 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return '{}';
  })) as Record<string, unknown>;
  context[path.basename(project)] = {
    node: process.version, platform: process.platform, arch: process.arch, npm: env.npm_config_user_agent,
    cache: env.npm_config_cache, cachePresentBefore, restoredCache: env.NPM_CACHE_RESTORED ?? 'not-reported', lockReused,
    concurrency: {workerId: env.VITEST_WORKER_ID, poolId: env.VITEST_POOL_ID, nestedMaxWorkers: env.VITEST_MAX_WORKERS ?? 'default'},
    manifest: JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8')) as unknown,
    lockSha256: createHash('sha256').update(lockText).digest('hex'),
    packages: Object.fromEntries(Object.entries(lock.packages).filter(([name]) => name).map(([name, pkg]) =>
      [name, {version: pkg.version, integrity: pkg.integrity}])),
  };
  await writeFile(filename, JSON.stringify(context, null, 2) + '\n');
}

/** Reuse dependency resolution only for byte-identical generated manifests and one immutable candidate.
 * @param shared This suite's candidate identity and previous successful isolated install metadata.
 * @param project A separately generated consumer root with its own node_modules.
 * @param evidence Directory receiving this consumer family's compact context.
 * @param env The command environment containing the explicit shared npm content cache.
 * @param run The caller's owned, timed, cancellable command path.
 * @param label Existing timing label for this generated consumer installation.
 * @returns Resolves after independent installation and resolved-version evidence capture.
 * @throws For command failure or unreadable generated/install metadata.
 * @sideEffects Reuses only manifest/lock text; installs all files independently in each consumer.
 */
export async function installIntakeProject(shared: InstalledIntakeTooling, project: string, evidence: string, env: NodeJS.ProcessEnv,
  run: (label: string, args: string[], cwd: string) => Promise<unknown>, label: string): Promise<void> {
  const npm = process.env.npm_execpath; if (!npm) throw new Error('Run installed qualification through npm');
  const generatedManifest = await readFile(path.join(project, 'package.json'), 'utf8');
  const candidateTarballRelative = path.relative(project, shared.tarball).replaceAll('\\', '/');
  const previous = shared.consumerInstall;
  const lockReused = previous !== undefined && previous.generatedManifest === generatedManifest
    && previous.candidateTarballRelative === candidateTarballRelative;
  if (lockReused) {
    // @why #441 Reuse npm's candidate substitution only after checking the complete generated manifest.
    await writeFile(path.join(project, 'package.json'), previous.installedManifest);
    await writeFile(path.join(project, 'package-lock.json'), previous.lockfile);
  }
  const cachePresentBefore = await intakeCachePresent(env);
  await run(label, [npm, lockReused ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund',
    '--prefer-offline', ...(lockReused ? [] : [shared.tarball])], project);
  if (!lockReused) shared.consumerInstall = {generatedManifest, candidateTarballRelative,
    installedManifest: await readFile(path.join(project, 'package.json'), 'utf8'),
    lockfile: await readFile(path.join(project, 'package-lock.json'), 'utf8')};
  await recordIntakeInstallation(evidence, project, env, cachePresentBefore, lockReused);
}

/** Observe content-cache presence without interpreting it as a successful cache hit.
 * @param env The exact npm command environment containing its absolute cache directory.
 * @returns Whether npm's content-addressed cache directory exists before the command.
 * @throws For filesystem failures other than an absent cache.
 */
export async function intakeCachePresent(env: NodeJS.ProcessEnv): Promise<boolean> {
  if (!env.npm_config_cache) throw new Error('Explicit installed-consumer npm cache required');
  return stat(path.join(env.npm_config_cache, '_cacache')).then(value => value.isDirectory(), error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return false;
  });
}

/** Pack and install immutable candidate tooling once for the local/URL intake suite.
 * @returns Isolated tooling and a retained tarball; callers own mutable project directories separately.
 * @throws For a failed pack/install, after owned process cleanup.
 * @sideEffects Retains exact package identity, timing and command output under tmp/conformance.
 */
export async function installIntakeTooling(): Promise<InstalledIntakeTooling> {
  const npm = process.env.npm_execpath; if (!npm) throw new Error('Run installed qualification through npm');
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'checked-intake-'))), tooling = path.join(root, 'tooling');
  const evidence = path.resolve('tmp/conformance/checked-intake-tooling'); await mkdir(evidence, {recursive: true});
  const logs = await mkdtemp(path.join(evidence, 'run-'));
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.resolve('tmp/cache/npm')};
  delete env.NODE_PATH;
  const timings: {stage: string; elapsedMs: number}[] = [];
  const run = async (stage: string, args: string[], cwd: string) => {
    const start = performance.now();
    try {
      const result = await runOwnedNode(args, {cwd, env, timeoutMs: 240_000});
      await writeFile(path.join(logs, stage + '.log'), result.stdout + result.stderr); return result;
    } finally {timings.push({stage, elapsedMs: Math.round(performance.now() - start)});}
  };
  try {
    const packed = await run('pack', [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', logs], process.cwd());
    const filename = (JSON.parse(packed.stdout) as {filename: string}[])[0]!.filename;
    if (path.basename(filename) !== filename) throw new Error('Unexpected packed filename');
    const tarball = path.join(logs, filename);
    await mkdir(tooling); await writeFile(path.join(tooling, 'package.json'), '{"private":true,"type":"module"}');
    const cachePresentBefore = await intakeCachePresent(env);
    await run('install-tooling', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline', tarball], tooling);
    await recordIntakeInstallation(logs, tooling, env, cachePresentBefore);
    await writeFile(path.join(logs, 'result.json'), JSON.stringify({status: 'passed', packs: 1, toolingInstalls: 1,
      sha256: createHash('sha256').update(await readFile(tarball)).digest('hex'), timings}, null, 2));
    return {root, tooling, tarball, cli: path.join(tooling, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js')};
  } catch (error) {
    const failure = error as Error & {stdout?: string; stderr?: string};
    await writeFile(path.join(logs, 'failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
    await rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); throw error;
  }
}
