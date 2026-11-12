/** Installed qualification of independently pinned response branches.
 * @since 1.6.0
 */
import {expect} from 'vitest';
import {appendFile, cp, copyFile, mkdir, mkdtemp, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runOwnedNode} from './ownedNodeProcess.js';
import {installIntakeProject, type InstalledIntakeTooling} from './installedIntakeTooling.js';

/** Qualify matched installed artifacts after removing authoring sources and relocating consumers.
 * @param shared Freshly packed candidate installed by the intake suite.
 * @param signal Test cancellation propagated through every owned subprocess.
 * @returns Resolves after installed generation, builds and independent SOAP/HTTP assertions pass.
 * @throws For failed assertions, subprocesses, cancellation or cleanup.
 * @sideEffects Creates isolated consumers and retains stage logs under tmp/conformance.
 */
export async function qualifyResponseBranchesInstalled(shared: InstalledIntakeTooling, signal: AbortSignal): Promise<void> {
  const npm = process.env.npm_execpath; if (!npm) throw new Error('Run installed qualification through npm');
  const evidence = path.resolve(process.env.WSDL_TEST_RUN_DIR ?? 'tmp/conformance', 'response-branches-installed');
  await mkdir(evidence, {recursive: true});
  const logs = await mkdtemp(path.join(evidence, 'run-'));
  const consumer = path.join(shared.root, 'response-branches'), relocated = path.join(shared.root, 'relocated-response-branches');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.resolve('tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = async (label: string, args: string[], cwd: string) => {
    const started = performance.now();
    try {
      const result = await runOwnedNode(args, {cwd, env, signal, timeoutMs: 240_000, maxBuffer: 8 * 1024 * 1024,
        childProcessesDenied: args[0] === '--permission'});
      await writeFile(path.join(logs, label + '.log'), result.stdout + result.stderr); return result;
    } catch (error) {
      const captured = error as Error & {stdout?: string; stderr?: string};
      await writeFile(path.join(logs, label + '-failure.log'), captured.message + '\n' + (captured.stdout ?? '') + (captured.stderr ?? ''));
      throw new Error(captured.message + '\n' + (captured.stdout ?? '') + (captured.stderr ?? ''), {cause: error});
    } finally {await appendFile(path.join(logs, 'timing.ndjson'), JSON.stringify({label, elapsedMs: Math.round(performance.now() - started)}) + '\n');}
  };
  try {
    await mkdir(consumer);
    await cp('test/conformance/fixtures/soap/response-branches', path.join(consumer, 'inputs'), {recursive: true});
    const author = path.join(shared.tooling, 'response-branches-author.ts');
    await copyFile('test/helpers/responseBranchesAuthoringProcess.ts', author);
    const authored = await run('public-authoring-generation', ['--permission', '--allow-fs-read=' + consumer,
      '--allow-fs-read=' + shared.tooling, '--allow-fs-write=' + consumer, author], consumer);
    expect(JSON.parse(authored.stdout.trim().split('\n').at(-1)!)).toMatchObject({kind: 'response-branches-authored', originalBytesPreserved: true});
    for (const mode of ['soap11', 'soap12', 'mixed']) {
      const project = path.join(consumer, mode);
      await installIntakeProject(shared, project, logs, env, run, mode + '-install');
      for (const command of ['typecheck', 'build']) await run(mode + '-' + command, [npm, 'run', command], project);
    }
    await rm(path.join(consumer, 'inputs'), {recursive: true});
    await copyFile('test/helpers/responseBranchesInstalledProcess.ts', path.join(consumer, 'wire.ts'));
    await rename(consumer, relocated);
    const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const result = await run('relocated-offline-wire', ['--permission', ...network, '--allow-fs-read=' + relocated,
      '--allow-fs-write=' + relocated, path.join(relocated, 'wire.ts'), path.resolve('package.json')], relocated);
    expect(JSON.parse(result.stdout)).toMatchObject({kind: 'response-branches-installed', offline: true, soapVersions: 2,
      applicationError: true, selectedFailureClosed: true, staleRejectedBeforeIo: true, mixedService: true});
    await writeFile(path.join(logs, 'result.json'), result.stdout);
  } finally {
    for (const directory of [consumer, relocated]) await rm(directory, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
}
