import {expect} from 'vitest';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, realpath, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {selectDirectOperation, selectComponentOperations} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule, reconstructDirectSourceCapsule, createComponentSourceCapsule, reconstructComponentSourceCapsuleForOperation} from '../../src/compiler/directSourceCapsule.js';
import {generateDirectClient, generateComponentClient, writeDirectClient} from '../../src/client/generateDirectClient.js';
import {runOwnedNode} from './ownedNodeProcess.js';

const COMMAND_TIMEOUT_MS = 180_000;
export const GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS = 60_000;
// @why Pack, install, typecheck and runtime each retain their three-minute command deadline.
export const GENERATED_INSTALLED_WORKFLOW_TIMEOUT_MS = 4 * COMMAND_TIMEOUT_MS + GENERATED_INSTALLED_CLEANUP_TIMEOUT_MS;

/** Qualify generated clients through an isolated installed package and independent wire oracle.
 * @param binding Runtime binding whose compatibility and generated variants are exercised.
 * @param signal Caller cancellation, including a Vitest deadline.
 * @returns Resolves after generation, consumer compilation and wire assertions pass.
 * @throws For failed assertions, command limits, cancellation or incomplete cleanup.
 * @sideEffects Creates disposable consumers and retains evidence under tmp/conformance.
 */
export async function qualifyGeneratedInstalled(binding: 'private' | 'root' | 'component', signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const root = process.cwd(), evidence = path.join(root, 'tmp/conformance/' + (binding === 'component' ? 'component-transferred' : binding === 'root' ? 'p38-evidence' : 'p37-evidence'));
  const consumer = await realpath(await mkdtemp(path.join(tmpdir(), 'wsdl-generated-')));
  const fixture = path.join(root, 'test/conformance/fixtures/assessment/forecast.wsdl');
  const variants = await Promise.all([
    {name: 'forecast', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
    {name: 'padded', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
    {name: 'large', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
    {name: 'alias', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
    {name: 'renamed', ns: 'urn:renamed:climate', prefix: 'Climate', op: 'ReadClimate'},
    {name: 'shapes', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'createClient'},
    {name: 'scalar', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast'},
    {name: 'empty', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'value-list'},
  ].map(async variant => ({...variant, source: await readFile(variant.name === 'forecast' ? fixture
    : path.join(root, 'test/conformance/fixtures/assessment/direct-variants', variant.name + '.wsdl'), 'utf8')})));

  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Use npm test');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.join(root, 'tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = (args: string[], cwd = consumer) => runOwnedNode(args, {cwd, env, signal, timeoutMs: COMMAND_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024, childProcessesDenied: args[0] === '--permission'});
  try {
    await mkdir(evidence, {recursive: true});
    await mkdir(path.join(consumer, 'authorized'));
    try {await symlink(fixture, path.join(consumer, 'authorized/link.wsdl'), 'file');}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;}
    for (const v of variants) {
      signal?.throwIfAborted();
      const file = path.join(consumer, 'authorized', v.name + '.wsdl'); await writeFile(file, v.source);
      if (binding === 'root' && v.name === 'forecast') {
        const frozen = path.join(root, 'test/conformance/fixtures/compatibility/v1.1.5');
        const provenance = JSON.parse(await readFile(path.join(frozen, 'provenance.json'), 'utf8')) as {
          version: string; integrity: string; gitHead: string; files: Record<string, string>;
        };
        expect(provenance).toMatchObject({version: '1.1.5', gitHead: 'f7c93f9f3ba720995df47b79ef93e832c0ebcf3d',
          integrity: 'sha512-PjQ1icQfm5dITjjesFRjrfw5B3SAyYaTPDylRVX5bJqXJG9gbpqry4grf2K5shGAvM4jbZvB1zw5gkYiv0pOMg=='});
        for (const name of ['forecast.ts', 'forecast.json', 'forecast.wsdl']) {
          const bytes = await readFile(path.join(frozen, name));
          expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.files[name]);
          await writeFile(name.endsWith('.wsdl') ? file : path.join(consumer, name), bytes);
        }
        continue;
      }
      const selector = {portType: {namespace: v.ns, local: v.prefix + 'PortType'}, binding: {namespace: v.ns, local: v.prefix + 'Binding'}, operation: v.op};
      const selected = binding === 'component' ? (await selectComponentOperations(file, [selector], {loading: {policy: {fileRoots: [path.dirname(file)]}}}))[0]!
        : await selectDirectOperation(file, selector, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
      if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
      const selection = {service: {namespace: v.ns, local: v.prefix + 'Service'}, port: v.prefix + 'Port'};
      const capsule = binding === 'component' ? await createComponentSourceCapsule(selected.contract, selection) : createDirectSourceCapsule(selected.contract, selection);
      if (capsule.kind !== 'direct-capsule' && capsule.kind !== 'component-capsule') throw new Error(JSON.stringify(capsule));
      const generate = async () => {
        signal?.throwIfAborted();
        const native = binding === 'component' ? await reconstructComponentSourceCapsuleForOperation(capsule.bytes, selected.contract, selection)
          : await reconstructDirectSourceCapsule(capsule.bytes, file, {policy: {fileRoots: [path.dirname(file)]}});
        signal?.throwIfAborted();
        if (native.kind === 'reconstructed-component') return generateComponentClient(native);
        if (native.kind !== 'reconstructed-direct') throw new Error(JSON.stringify(native));
        return generateDirectClient(native);
      };
      const generated = await generate(), repeated = await generate();
      if (!(generated.kind === 'generated-direct-client' || generated.kind === 'generated-component-client') || !(repeated.kind === 'generated-direct-client' || repeated.kind === 'generated-component-client')) throw new Error(JSON.stringify([generated, repeated]));
      expect(generated.source).toBe(repeated.source);
      if (binding === 'root') {
        const relocated = path.join(consumer, 'authorized', v.name + '-generation.wsdl');
        await copyFile(file, relocated);
        const native = await reconstructDirectSourceCapsule(capsule.bytes, relocated, {policy: {fileRoots: [path.dirname(file)]}});
        if (native.kind !== 'reconstructed-direct') throw new Error(native.rule);
        const moved = generateDirectClient(native);
        if (moved.kind !== 'generated-direct-client') throw new Error(moved.rule);
        expect(moved.source).toBe(generated.source);
      }
      expect(generated.source).not.toContain(root);
      expect(generated.source).not.toContain('from "@techspokes/');
      writeDirectClient(path.join(consumer, v.name + '.ts'), generated);
      await writeFile(path.join(consumer, v.name + '.json'), generated.capsule);
      writeDirectClient(path.join(evidence, v.name + '.ts'), generated);
    }
    const packed = await run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', evidence], root);
    const filename = (JSON.parse(packed.stdout) as {filename: string}[])[0]!.filename;
    expect(path.basename(filename)).toBe(filename);
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
    await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', path.join(evidence, filename), 'typescript@6.0.3']);
    await copyFile(path.join(root, binding === 'component' ? 'test/helpers/checkedComponentInstalledProcess.ts' : binding === 'root' ? 'test/helpers/checkedDirectInstalledProcess.ts' : 'test/helpers/generatedDirectInstalledProcess.ts'), path.join(consumer, 'process.ts'));
    await copyFile(path.join(root, 'test/helpers/generatedDirectConsumer.ts'), path.join(consumer, 'generatedDirectConsumer.ts'));
    await writeFile(path.join(consumer, 'usage.ts'), `import type {Request, Response, DeclaredFault} from './forecast.js';
${binding !== 'private' ? `import {checkedDirectRuntimeV1} from '@techspokes/typescript-wsdl-client';
import {createClient} from './forecast.js';
createClient(checkedDirectRuntimeV1);
// @ts-expect-error generated/runtime version mismatch
createClient({...checkedDirectRuntimeV1, version: 'checked-direct-runtime-v0'});
declare const callOptions: import('./forecast.js').Options;
// @ts-expect-error profiling is not a supported caller option
checkedDirectRuntimeV1.execute('', {}, {...callOptions, budget: {}}, 'checked-direct-runtime-v1');` : ''}
import type {Request as Shapes} from './shapes.js';
import type {Request as Empty} from './empty.js';
const request: Request = {city: 'Paris', days: 2};
const response: Response = {city: '', temperature: [], complete: true};
const shape: Shapes = {days: [1, 2]};
const empty: Empty = {};
declare const fault: DeclaredFault;
const exact: 'ForecastError' = fault.fault.name;
const message: string = fault.value.message;
// @ts-expect-error wrong scalar
const bad: Request = {city: 'Paris', days: '2'};
// @ts-expect-error required field
const missing: Request = {city: 'Paris'};
// @ts-expect-error response direction
const wrong: Request = response;
// @ts-expect-error required nonempty array
const none: Shapes = {days: []};
// @ts-expect-error no members in empty sequence
const extra: Empty = {other: ''};
// @ts-expect-error invalid boolean
const boolean: Response = {city: '', temperature: [], complete: 1};
void [request, shape, empty, exact, message];
`.replaceAll(binding === 'component' ? 'checkedDirectRuntimeV1' : '\u0000', 'checkedComponentRuntimeV1')
      .replace(binding === 'component' ? "import type {Request, Response, DeclaredFault} from './forecast.js';" : '\u0000',
        "import type {Request, Response, Result} from './forecast.js';\ntype DeclaredFault = Extract<Result, {kind: 'soap-fault'}>;")
      .replaceAll(binding === 'component' ? 'checked-direct-runtime-v1' : '\u0000', 'checked-component-runtime-v2'));
    await writeFile(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, exactOptionalPropertyTypes: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', outDir: 'compiled', types: []}, include: variants.map(v => v.name + '.ts').concat('usage.ts')}));
    await run(['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
      path.join(consumer, 'node_modules/typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')]);
    const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net=127.0.0.1'] : [];
    const executed = await run(['--permission', ...networkPermission, '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer, path.join(consumer, 'process.ts'), fixture]);
    expect(JSON.parse(executed.stdout)).toMatchObject({kind: 'generated-installed-soap', admitted: false});
    await writeFile(path.join(evidence, 'consumer.log'), executed.stdout + executed.stderr);
  } catch (error) {
    const failure = error as Error & {stdout?: string; stderr?: string};
    await writeFile(path.join(evidence, 'failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
    throw new Error(failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''), {cause: error});
  } finally {await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});}
}
