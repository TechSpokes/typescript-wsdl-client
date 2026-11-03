import {mkdtemp, mkdir, readFile, writeFile, rm, realpath} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {runOwnedNode} from './ownedNodeProcess.js';

export interface InstalledIntakeTooling {
  readonly root: string; readonly tooling: string; readonly cli: string; readonly tarball: string;
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
    await run('install-tooling', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], tooling);
    await writeFile(path.join(logs, 'result.json'), JSON.stringify({status: 'passed', packs: 1, toolingInstalls: 1,
      sha256: createHash('sha256').update(await readFile(tarball)).digest('hex'), timings}, null, 2));
    return {root, tooling, tarball, cli: path.join(tooling, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js')};
  } catch (error) {
    const failure = error as Error & {stdout?: string; stderr?: string};
    await writeFile(path.join(logs, 'failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
    await rm(root, {recursive: true, force: true, maxRetries: 10, retryDelay: 200}); throw error;
  }
}
