import {it, expect} from 'vitest';
import {mkdtemp, mkdir, copyFile, writeFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';

const COMMAND_TIMEOUT_MS = 180_000;
const CLEANUP_TIMEOUT_MS = 60_000;
// @why Five bounded stages include installed generated-code compilation and SOAP execution before cleanup.
const WORKFLOW_TIMEOUT_MS = 5 * COMMAND_TIMEOUT_MS + CLEANUP_TIMEOUT_MS;

async function qualifyPortableInstalled(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const root = process.cwd();
  const consumer = await realpath(await mkdtemp(path.join(tmpdir(), 'wsdl-portable-')));
  try {
    const artifact = path.join(root, 'tmp/conformance/p36-evidence');
    const fixture = path.join(root, 'test/conformance/fixtures/assessment/forecast.wsdl');
    const namespace = 'urn:checked:forecast';
    const selected = await selectDirectOperation(fixture, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [path.dirname(fixture)]}}});
    signal.throwIfAborted();
    expect(selected.kind).toBe('selected');
    if (selected.kind !== 'selected') throw new Error('source selection failed');
    const capsule = createDirectSourceCapsule(selected.contract, {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'});
    if (capsule.kind !== 'direct-capsule') throw new Error(JSON.stringify(capsule));
    const npm = process.env.npm_execpath;
    if (!npm) throw new Error('Run installed qualification using npm test or npm exec');
    const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.join(root, 'tmp/cache/npm')};
    delete env.NODE_PATH;
    const run = (args: string[], cwd: string) => runOwnedNode(args, {cwd, env, signal,
      timeoutMs: COMMAND_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, childProcessesDenied: args[0] === '--permission'});
    await mkdir(artifact, {recursive: true});
    const packed = await run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', artifact], root);
    const packs = JSON.parse(packed.stdout) as {filename: string}[];
    const filename = packs[0]!.filename;
    expect(path.basename(filename)).toBe(filename);
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
    await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', '--cache', path.join(root, 'tmp/cache/npm'),
      path.join(artifact, filename), 'fastify@5.12.8', 'fastify-plugin@6.0.1', 'typescript@6.0.3', '@types/node@26.6.6'], consumer);
    await mkdir(path.join(consumer, 'authorized'));
    await copyFile(fixture, path.join(consumer, 'authorized/source.wsdl'));
    await copyFile(path.join(root, 'test/conformance/fixtures/xsd/types/scoped-identities/wire.wsdl'), path.join(consumer, 'authorized/scoped.wsdl'));
    for (const key of ['main', 'content']) await copyFile(path.join(root, 'test/conformance/fixtures/wsdl/composition', key + '.wsdl'), path.join(consumer, 'authorized/composition-' + key + '.wsdl'));
    await copyFile(path.join(root, 'test/fixtures/wsdl/stream-mapping.wsdl'), path.join(consumer, 'authorized/stream-mapping.wsdl'));
    await copyFile(path.join(root, 'test/helpers/portableInstalledProcess.ts'), path.join(consumer, 'process.ts'));
    await writeFile(path.join(consumer, 'saved.json'), JSON.stringify(selected.kind === 'selected' ? selected.contract : selected));
    await writeFile(path.join(consumer, 'capsule.json'), capsule.bytes);
    const result = await run(['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer, path.join(consumer, 'process.ts'), fixture], consumer);
    expect(JSON.parse(result.stdout)).toMatchObject({kind: 'fresh-installed-authority', admitted: false, slots: 2, fetches: 0, legacyScopedDeclarations: 2,
      nativeCompositionServices: 2, generatedStreamingClient: true});
    await writeFile(path.join(artifact, 'authority-process.log'), result.stdout + result.stderr);
    await writeFile(path.join(consumer, 'consumer.ts'), `import Fastify from 'fastify';
import {runMultiServicePipeline} from '@techspokes/typescript-wsdl-client';
import gateway, {createClients} from './composition/entry/plugin.js';
import {StreamMapping} from './streamed/client.js';
void runMultiServicePipeline;
const clients = createClients({main: {source: 'main.wsdl'}, content: {source: 'content.wsdl'}});
await clients.main.Read({Entry: {Scope: 'main', Lookup: 'key'}});
await clients.content.Read({Entry: {Revision: 1, Index: 2}});
// @ts-expect-error Native service models remain distinct in the installed package.
await clients.main.Read({Entry: {Revision: 1, Index: 2}});
// @ts-expect-error Every configured client needs explicit runtime constructor options.
createClients({main: {source: 'main.wsdl'}});
await Fastify().register(gateway, {clients});
const stream = await new StreamMapping({source: 'stream.wsdl'}).Read({Enabled: true});
for await (const record of stream.records) {
  const count: number = record.Count;
  const total: string = record.Total;
  void [count, total];
}
`);
    await writeFile(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {
      strict: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', rootDir: '.', outDir: 'compiled',
      skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, types: ['node'],
    }, include: ['composition/**/*.ts', 'streamed/**/*.ts', 'consumer.ts']}));
    const checked = await run(['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
      path.join(consumer, 'node_modules/typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')], consumer);
    await writeFile(path.join(artifact, 'native-consumer-types.log'), checked.stdout + checked.stderr);
    const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const executed = await run(['--permission', ...networkPermission, '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
      path.join(consumer, 'process.ts'), fixture, 'composition-runtime'], consumer);
    expect(JSON.parse(executed.stdout)).toEqual({kind: 'native-composition-installed', services: 2, soapDispatches: 2, checkoutDenied: true});
    await writeFile(path.join(artifact, 'native-composition-process.log'), executed.stdout + executed.stderr);
  } catch (error) {
    const failure = error as Error & {stdout?: string; stderr?: string};
    throw new Error(`${failure.message}\n${failure.stdout ?? ''}${failure.stderr ?? ''}`, {cause: error});
  } finally {await rm(consumer, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});}
}

it('requalifies isolated installed sources and compiles native composition and streaming consumers', context => {
  const work = qualifyPortableInstalled(context.signal);
  context.onTestFinished(async () => {await work.catch(() => undefined);}, CLEANUP_TIMEOUT_MS);
  return work;
}, WORKFLOW_TIMEOUT_MS);
