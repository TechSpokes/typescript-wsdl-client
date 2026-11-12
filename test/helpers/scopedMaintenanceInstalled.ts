/** Installed-package qualification for diagnostics and explicit declared-type correction.
 * @since 1.5.0
 */
import {expect} from 'vitest';
import {copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runOwnedNode} from './ownedNodeProcess.js';
import {installIntakeProject, type InstalledIntakeTooling} from './installedIntakeTooling.js';

/** Qualify installed authoring and relocated generated gateways with independent SOAP/HTTP expectations.
 * @param shared Independently packed candidate installed by this suite.
 * @param signal Caller cancellation propagated to owned child processes.
 * @returns Resolves after public authoring, compilation and wire assertions pass.
 * @throws For failed subprocesses, assertions or cancellation.
 * @sideEffects Creates isolated consumers and retains command evidence beneath tmp/conformance.
 */
export async function qualifyScopedMaintenanceInstalled(shared: InstalledIntakeTooling, signal: AbortSignal): Promise<void> {
  const npm = process.env.npm_execpath; if (!npm) throw new Error('Run installed qualification through npm');
  const evidence = path.resolve(process.env.WSDL_TEST_RUN_DIR ?? 'tmp/conformance', 'scoped-maintenance-installed');
  await mkdir(evidence, {recursive: true});
  const logs = await mkdtemp(path.join(evidence, 'run-'));
  const consumer = path.join(shared.root, 'scoped-maintenance'); await mkdir(consumer);
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.resolve('tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = async (label: string, args: string[], cwd: string) => {
    try {
      const result = await runOwnedNode(args, {cwd, env, signal, timeoutMs: 240_000, maxBuffer: 8 * 1024 * 1024,
        childProcessesDenied: args[0] === '--permission'});
      await writeFile(path.join(logs, label + '.log'), result.stdout + result.stderr); return result;
    } catch (error) {
      const captured = error as Error & {stdout?: string; stderr?: string};
      await writeFile(path.join(logs, label + '-failure.log'), captured.message + '\n' + (captured.stdout ?? '') + (captured.stderr ?? ''));
      throw new Error(captured.message + '\n' + (captured.stdout ?? '') + (captured.stderr ?? ''), {cause: error});
    }
  };
  try {
    await mkdir(path.join(consumer, 'inputs'));
    await copyFile('test/conformance/fixtures/xsd/types/type-declared-corrections.wsdl', path.join(consumer, 'inputs/content.wsdl'));
    const author = path.join(shared.tooling, 'scoped-maintenance-author.ts');
    await copyFile('test/helpers/scopedMaintenanceAuthoringProcess.ts', author);
    const authored = await run('public-authoring-generation', ['--permission', '--allow-fs-read=' + consumer,
      '--allow-fs-read=' + shared.tooling, '--allow-fs-write=' + consumer, author], consumer);
    expect(JSON.parse(authored.stdout.trim().split('\n').at(-1)!)).toMatchObject({kind: 'scoped-maintenance-authored', trustedOriginalTargets: 2});
    for (const mode of ['original', 'string', 'layout']) {
      const project = path.join(consumer, mode);
      await installIntakeProject(shared, project, logs, env, run, mode + '-install');
      for (const command of ['typecheck', 'build']) await run(mode + '-' + command, [npm, 'run', command], project);
    }
    await rm(path.join(consumer, 'inputs'), {recursive: true});
    await rm(path.join(consumer, 'string.json')); await rm(path.join(consumer, 'layout.json'));
    await copyFile('test/helpers/scopedMaintenanceInstalledProcess.ts', path.join(consumer, 'wire.ts'));
    const relocated = path.join(shared.root, 'relocated-maintenance'); await rename(consumer, relocated);
    const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const result = await run('relocated-offline-wire', ['--permission', ...network, '--allow-fs-read=' + relocated,
      '--allow-fs-write=' + relocated, path.join(relocated, 'wire.ts'), path.resolve('package.json')], relocated);
    expect(JSON.parse(result.stdout)).toMatchObject({kind: 'scoped-maintenance-installed', originalRejected: true,
      correctedAccepted: true, unknownRejected: true, layoutRejectedNonsense: true, offline: true});
    await writeFile(path.join(logs, 'result.json'), result.stdout);
    await rm(relocated, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  } finally {await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});}
}
