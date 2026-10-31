/**
 * Qualifies installed gateways independently from their generated scaffold checks.
 * @since 1.1.6
 */
import {expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);
/**
 * Packs the candidate and exercises only installed public generation and runtime entry points.
 * @returns Resolves after consumer commands and independent HTTP/SOAP assertions pass.
 * @throws If installation, generation, consumer checks or independent wire assertions fail.
 * @sideEffects Uses disposable consumers, owned loopback processes and retained evidence under tmp/conformance.
 */
export async function qualifyCheckedGatewayInstalled(): Promise<void> {
  const root = process.cwd();
  const evidence = path.join(root, 'tmp/conformance/checked-gateway-installed');
  const consumer = await realpath(await mkdtemp(path.join(tmpdir(), 'wsdl-gateway-')));
  const tooling = path.join(consumer, 'tooling'), project = path.join(consumer, 'project');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this installed qualification through npm test');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca',
    npm_config_cache: path.join(root, 'tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = (args: string[], cwd = consumer) => exec(process.execPath, args,
    {cwd, env, timeout: 240_000, maxBuffer: 8 * 1024 * 1024});
  try {
    await mkdir(evidence, {recursive: true});
    await mkdir(tooling); await mkdir(project);
    const fixture = path.join(root, 'test/conformance/fixtures/assessment/forecast.wsdl');
    const source = path.join(consumer, 'forecast.wsdl');
    await copyFile(fixture, source);
    const namespace = 'urn:checked:forecast';
    const checkedDirect = {selector: {portType: {namespace, local: 'ForecastPortType'},
      binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'},
    service: {namespace, local: 'ForecastService'}, port: 'ForecastPort', fileRoots: [consumer]};
    const config = path.join(consumer, 'generation.json');
    await writeFile(config, JSON.stringify(checkedDirect));
    const packed = await run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', evidence], root);
    const filename = (JSON.parse(packed.stdout) as {filename: string}[])[0]!.filename;
    expect(path.basename(filename)).toBe(filename);
    const tarball = path.join(evidence, filename);
    await writeFile(path.join(tooling, 'package.json'), JSON.stringify({private: true, type: 'module'}));
    await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], tooling);
    const cli = path.join(tooling, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js');
    const generation = [cli, 'pipeline', '--model', 'checked-direct-v1', '--checked-config', config,
      '--wsdl-source', source, '--client-dir', path.join(project, 'client'),
      '--openapi-file', path.join(project, 'openapi.json'), '--gateway-dir', path.join(project, 'gateway'),
      '--gateway-version-prefix', 'v1', '--gateway-service-name', 'forecast', '--init-app',
      '--app-dir', project, '--test-dir', path.join(project, 'test')];
    const installedGenerate = ['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer, ...generation];
    const generated = await run(installedGenerate, tooling);
    await writeFile(path.join(evidence, 'generation.log'), generated.stdout + generated.stderr);
    const clientBefore = await readFile(path.join(project, 'client/client.ts'), 'utf8');
    const scaffold = path.join(project, 'server.ts');
    const customized = (await readFile(scaffold, 'utf8')) + '\n// Consumer-owned customization retained across generation.\n';
    await writeFile(scaffold, customized);
    await run(installedGenerate, tooling);
    expect(await readFile(scaffold, 'utf8')).toBe(customized);
    expect(await readFile(path.join(project, 'client/client.ts'), 'utf8')).toBe(clientBefore);
    const inventory = JSON.parse(await readFile(path.join(project, 'client/inventory.json'), 'utf8')) as {
      selection: unknown; operations: {requested: boolean; selected: boolean; generated: boolean; executed: boolean}[];
    };
    expect(inventory.selection).toMatchObject({service: checkedDirect.service, port: checkedDirect.port,
      selector: checkedDirect.selector});
    expect(inventory.operations).toHaveLength(1);
    expect(inventory.operations[0]).toMatchObject({requested: true, selected: true, generated: true, executed: false});
    await writeFile(config, JSON.stringify({...checkedDirect,
      selector: {...checkedDirect.selector, operation: 'UnimplementedRequestedOperation'}}));
    await expect(run(installedGenerate, tooling)).rejects.toThrow();
    expect(await readFile(path.join(project, 'client/client.ts'), 'utf8')).toBe(clientBefore);
    await writeFile(config, JSON.stringify(checkedDirect));
    // Candidate installation uses the ordinary consumer dependency installation command.
    await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], project);
    for (const command of ['typecheck', 'test', 'build']) {
      const result = await run([npm, 'run', command], project);
      await writeFile(path.join(evidence, command + '.log'), result.stdout + result.stderr);
    }
    const messageDir = path.join(root, 'test/conformance/fixtures/assessment/forecast-messages');
    for (const name of ['request.xml', 'response.xml', 'fault.xml', 'expectations.json']) {
      await copyFile(path.join(messageDir, name), path.join(project, name));
    }
    await copyFile(path.join(root, 'test/helpers/checkedGatewayInstalledProcess.ts'), path.join(project, 'qualification.ts'));
    const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net=127.0.0.1'] : [];
    const executed = await run(['--permission', '--allow-child-process', ...networkPermission,
      '--allow-fs-read=' + project, '--allow-fs-write=' + project,
      path.join(project, 'qualification.ts'), fixture], project);
    const result: unknown = JSON.parse(executed.stdout);
    expect(result).toMatchObject({kind: 'checked-gateway-installed', originalCheckoutReadable: false});
    await writeFile(path.join(evidence, 'wire.log'), executed.stdout + executed.stderr);
    const original = await readFile(source, 'utf8');
    for (const mode of ['optional', 'scalar'] as const) {
      const variant = mode === 'optional'
        ? original.replace('<xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/>',
          '<xs:element name="city" type="xs:string" minOccurs="0"/><xs:element name="days" type="xs:int" minOccurs="1" maxOccurs="unbounded"/>')
        : original.replace('type="t:ForecastRequest"', 'type="xs:boolean"')
          .replace('type="t:ForecastResponse"', 'type="xs:int"').replace('name="ForecastFault" type="t:ForecastFault"', 'name="ForecastFault" type="xs:string"');
      const variantSource = path.join(consumer, mode + '.wsdl');
      await writeFile(variantSource, variant);
      const opts = {wsdl: variantSource, model: 'checked-direct-v1', checkedDirect,
        clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
        gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'forecast'},
        app: {appDir: project}, test: {testDir: path.join(project, 'test')}};
      await run(['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
        '--input-type=module', '-e',
        'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client"; await runGenerationPipeline(JSON.parse(process.argv[1]));',
        JSON.stringify(opts)], tooling);
      await run([npm, 'run', 'typecheck'], project);
      await run([npm, 'run', 'build'], project);
      const checked = await run(['--permission', '--allow-child-process', ...networkPermission,
        '--allow-fs-read=' + project, '--allow-fs-write=' + project,
        path.join(project, 'qualification.ts'), fixture, mode], project);
      expect(JSON.parse(checked.stdout)).toMatchObject({kind: 'checked-gateway-installed', variant: mode});
      await writeFile(path.join(evidence, mode + '-wire.log'), checked.stdout + checked.stderr);
    }
  } catch (error) {
    const failure = error as Error & {stdout?: string; stderr?: string};
    await writeFile(path.join(evidence, 'failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
    throw error;
  } finally {
    await rm(consumer, {recursive: true, force: true});
  }
}
