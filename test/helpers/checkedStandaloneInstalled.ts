import {expect} from 'vitest';
import {copyFile, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InstalledIntakeTooling} from './installedIntakeTooling.js';
import {installIntakeProject} from './installedIntakeTooling.js';
import {runOwnedNode} from './ownedNodeProcess.js';
import {verificationPath} from './verificationPath.js';

async function generatedContract(directory: string) {
  const files = (await readdir(directory, {recursive: true, withFileTypes: true}))
    .filter(entry => entry.isFile()).map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
  const artifacts = await Promise.all(files.map(async file => {
    const bytes = await readFile(path.join(directory, file));
    if (path.basename(file) !== 'source-resources.json') return [file, bytes] as const;
    const source = JSON.parse(bytes.toString('utf8')) as {resources: {logicalUri: string}[]};
    // @why Local provenance records identify the generation destination; runtime paths must already be owner-relative.
    for (const resource of source.resources) resource.logicalUri = path.relative(path.dirname(path.join(directory, file)), fileURLToPath(resource.logicalUri));
    return [file, source] as const;
  }));
  return Object.fromEntries(artifacts);
}

export async function qualifyCheckedStandaloneInstalled(shared: InstalledIntakeTooling, signal: AbortSignal): Promise<void> {
  const checkout = process.cwd();
  const {tooling, cli} = shared;
  const consumer = path.join(tooling, 'standalone');
  const inputs = path.join(consumer, 'inputs');
  const sourceName = 'import-forecast.wsdl', dependencyName = 'import-forecast-types.xsd';
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run installed qualification through npm');
  const evidence = path.resolve(verificationPath('tmp/conformance/checked-standalone-installed'));
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca',
    npm_config_cache: path.resolve('tmp/cache/npm'), VITEST_MAX_WORKERS: '1'};
  delete env.NODE_PATH;
  const run = (args: string[], cwd: string, expectedRefusal = false) => runOwnedNode(args,
    {cwd, env, signal, timeoutMs: 240_000, childProcessesDenied: expectedRefusal});
  const permissions = ['--permission', '--allow-fs-read=' + tooling, '--allow-fs-write=' + consumer];
  const compile = (files: string[], options: string[], cwd: string) => run([
    path.join(checkout, 'node_modules/typescript/bin/tsc'), '--strict', '--skipLibCheck', '--module', 'NodeNext', '--target', 'es2022',
    '--typeRoots', path.join(checkout, 'node_modules/@types'), '--types', 'node', ...options, ...files,
  ], cwd);
  await mkdir(inputs, {recursive: true});
  try {
    for (const file of [sourceName, dependencyName]) {
      await copyFile(path.join(checkout, 'test/conformance/fixtures/xsd/imports', file), path.join(inputs, file));
    }
    const cliDir = path.join(consumer, 'cli'), apiDir = path.join(consumer, 'api'), pipelineDir = path.join(consumer, 'pipeline');
    const cliClient = path.join(cliDir, '.client'), apiClient = path.join(apiDir, '.client'), pipelineClient = path.join(pipelineDir, '.client');
    const source = path.join(inputs, sourceName);
    const legacyCatalog = path.join(consumer, 'catalog.json');
    await run([...permissions, cli, 'compile', '--wsdl-source', source, '--catalog-file', legacyCatalog], consumer);
    expect(JSON.parse(await readFile(legacyCatalog, 'utf8'))).toMatchObject({operations: [{name: 'GetForecast'}]});
    const cliReport = path.join(consumer, 'cli-report.json');
    const cliBase = [cli, 'client', '--model', 'checked-components-v1'];
    const generated = await run([...permissions, ...cliBase, '--wsdl-source', path.relative(consumer, source),
      '--client-dir', path.relative(consumer, cliClient), '--checked-report', cliReport], consumer);
    const planner = path.join(consumer, 'generate.ts');
    await copyFile(path.join(checkout, 'test/fixtures/consumers/checked-standalone-generate.ts'), planner);
    await compile([planner], ['--noEmit'], tooling);
    const executed = await run([...permissions, planner, path.relative(tooling, source), path.relative(tooling, apiClient), path.relative(tooling, apiDir)], tooling);
    const generatedApi = JSON.parse(executed.stdout);
    expect(generatedApi.client).toEqual({checked: JSON.parse(generated.stdout), planning: JSON.parse(await readFile(cliReport, 'utf8'))});
    expect(JSON.parse(generated.stdout)).toMatchObject({model: 'checked-components-v1', operations: [{operation: 'GetForecast', generated: true, executed: false}]});
    await run([...permissions, cli, 'pipeline', '--model', 'checked-components-v1', '--wsdl-source', source, '--client-dir', pipelineClient,
      '--openapi-file', path.join(pipelineDir, 'openapi.json'), '--gateway-dir', path.join(pipelineDir, 'gateway'), '--gateway-version-prefix', 'v1',
      '--gateway-service-name', 'forecast', '--init-app', '--app-dir', pipelineDir, '--test-dir', path.join(pipelineDir, 'test')], tooling);
    expect(await readdir(cliDir)).toEqual(['.client']);
    const contract = await generatedContract(cliClient);
    expect(Object.keys(contract).map(file => file.replaceAll('\\', '/')).sort()).toEqual([
      'client.ts', 'inventory.json', 'operations/0/client.ts', 'operations/0/contract.json', 'source-resources.json',
      'source/files/' + dependencyName, 'source/files/' + sourceName,
    ]);
    expect(await generatedContract(apiClient)).toEqual(contract);
    expect(await generatedContract(pipelineClient)).toEqual(contract);
    for (const file of [sourceName, dependencyName]) {
      expect(await readFile(path.join(cliClient, 'source/files', file))).toEqual(await readFile(path.join(inputs, file)));
    }

    const openapiFile = path.join(cliDir, 'openapi.json'), gatewayDir = path.join(cliDir, 'gateway');
    const http = ['--model', 'checked-components-v1', '--wsdl-source', path.relative(consumer, source),
      '--openapi-file', openapiFile, '--gateway-version-prefix', 'v1', '--gateway-service-name', 'forecast'];
    const gateway = [...permissions, cli, 'gateway', ...http, '--gateway-dir', gatewayDir, '--client-dir', cliClient];
    const app = [...permissions, cli, 'app', ...http, '--gateway-dir', gatewayDir, '--client-dir', cliClient,
      '--app-dir', cliDir, '--test-dir', path.join(cliDir, 'test')];
    await expect(run(gateway, consumer, true)).rejects.toThrow(/missing checked artifact.*openapi\.json.*regenerate/i);
    await expect(readdir(gatewayDir)).rejects.toMatchObject({code: 'ENOENT'});
    const spec = await run([...permissions, cli, 'openapi', ...http, '--checked-report', path.join(consumer, 'openapi-plan.json')], consumer);
    expect(JSON.parse(spec.stdout)).toEqual(generatedApi.openapi.checked);
    expect((await readdir(cliDir)).sort()).toEqual(['.client', 'openapi.json']);
    for (const input of [source, path.join(inputs, dependencyName)]) {
      const bytes = await readFile(input), args = [...http];
      args[args.indexOf('--openapi-file') + 1] = input;
      await expect(run([...permissions, cli, 'openapi', ...args], consumer, true))
        .rejects.toThrow('OpenAPI output overlaps an original source file');
      expect(await readFile(input)).toEqual(bytes);
    }
    await expect(run([...permissions, cli, 'openapi', ...http, '--catalog-file', legacyCatalog], consumer, true))
      .rejects.toThrow(/unsupported checked model option.*--catalog-file.*original WSDL/i);
    const doc = await readFile(openapiFile, 'utf8');
    await writeFile(openapiFile, doc.replace('/v1/forecast/GetForecast', '/v1/foreign/GetForecast'));
    await expect(run(gateway, consumer, true)).rejects.toThrow(/altered or mismatched checked artifact.*openapi\.json/i);
    await writeFile(openapiFile, doc);
    const capsule = path.join(cliClient, 'operations/0/contract.json'), capsuleBytes = await readFile(capsule);
    await writeFile(capsule, '{}');
    await expect(run(gateway, consumer, true)).rejects.toThrow(/altered or mismatched checked artifact.*contract\.json/i);
    await writeFile(capsule, capsuleBytes);
    const gatewayResult = await run(gateway, consumer);
    expect(JSON.parse(gatewayResult.stdout)).toEqual(generatedApi.gateway.checked);
    const plugin = path.join(gatewayDir, 'plugin.ts'), pluginBytes = await readFile(plugin);
    await writeFile(plugin, '// mismatched gateway');
    await expect(run(app, consumer, true)).rejects.toThrow(/altered or mismatched checked artifact.*plugin\.ts/i);
    await expect(readFile(path.join(cliDir, 'server.ts'))).rejects.toMatchObject({code: 'ENOENT'});
    await writeFile(plugin, pluginBytes);
    const scaffold = await run(app, consumer);
    expect(JSON.parse(scaffold.stdout)).toEqual(generatedApi.scaffold.checked);
    expect(generatedApi.scaffold.openapiDoc).toEqual(JSON.parse(doc));
    const complete = await generatedContract(cliDir);
    expect(await generatedContract(apiDir)).toEqual(complete);
    expect(await generatedContract(pipelineDir)).toEqual(complete);

    const server = path.join(cliDir, 'server.ts'), test = path.join(cliDir, 'test/checked-scaffold.test.ts');
    const initialServer = await readFile(server, 'utf8'), initialTest = await readFile(test, 'utf8');
    const customization = '\n// Consumer customization retained.\n';
    await writeFile(server, initialServer + customization);
    await writeFile(test, initialTest + customization);
    await expect(run([...app, '--checked-report', server, '--force-checked-files'], consumer, true))
      .rejects.toThrow('report and draft files must have separate paths');
    await expect(run([...app, '--checked-report', test, '--force-checked-files'], consumer, true))
      .rejects.toThrow('report and draft files must have separate paths');
    await run(app, consumer);
    expect(await readFile(server, 'utf8')).toBe(initialServer + customization);
    expect(await readFile(test, 'utf8')).toBe(initialTest + customization);
    await run([...app, '--force'], consumer);
    expect(await readFile(server, 'utf8')).toBe(initialServer);
    expect(await readFile(test, 'utf8')).toBe(initialTest + customization);
    await writeFile(server, initialServer + customization);
    await run([...app, '--force-test'], consumer);
    expect(await readFile(server, 'utf8')).toBe(initialServer + customization);
    expect(await readFile(test, 'utf8')).toBe(initialTest);

    const refused = path.join(consumer, 'refused');
    await expect(run([...permissions, ...cliBase, '--client-dir', refused, '--catalog-file', path.join(consumer, 'catalog.json')], consumer, true))
      .rejects.toThrow('Unsupported checked model option: --catalog-file');
    await expect(run([...permissions, ...cliBase, '--client-dir', refused, '--wsdl-source', source, '--client-int64-as=string'], consumer, true))
      .rejects.toThrow('Unsupported checked model option: --client-int64-as');
    const original = await readFile(source, 'utf8');
    const invalid = path.join(inputs, 'invalid.wsdl');
    await writeFile(invalid, original.replace('v:Days', 'v:Missing'));
    await expect(run([...permissions, ...cliBase, '--client-dir', refused, '--wsdl-source', invalid], consumer, true))
      .rejects.toThrow('Checked generation refused: invalid-source');
    await expect(readdir(refused)).rejects.toMatchObject({code: 'ENOENT'});

    const other = path.join(consumer, 'other');
    await writeFile(source, original + '\n<!-- independently generated foreign capsule -->\n');
    await run([...permissions, planner, source, other], tooling);
    await copyFile(path.join(other, 'operations/0/contract.json'), path.join(cliDir, 'other-contract.json'));
    for (const file of ['request.xml', 'response.xml', 'fault.xml']) {
      await copyFile(path.join(checkout, 'test/conformance/fixtures/assessment/forecast-messages', file), path.join(cliDir, file));
    }
    const wire = path.join(cliDir, 'wire.ts');
    await copyFile(path.join(checkout, 'test/fixtures/consumers/checked-standalone-wire.ts'), wire);
    await mkdir(evidence, {recursive: true});
    await installIntakeProject(shared, cliDir, evidence, env, (_label, args, cwd) => run(args, cwd), 'standalone-app-install');
    for (const command of ['typecheck', 'test', 'build']) {
      const result = await run([npm, 'run', command], cliDir);
      await writeFile(path.join(evidence, command + '.log'), result.stdout + result.stderr);
    }
    await run([npm, 'prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], cliDir);
    await expect(readdir(path.join(cliDir, 'node_modules/vitest'))).rejects.toMatchObject({code: 'ENOENT'});
    const deployed = path.join(consumer, 'deployed');
    await rename(cliDir, deployed);
    await Promise.all([inputs, apiDir, pipelineDir, other].map(directory => rm(directory, {recursive: true})));
    const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const result = await run(['--permission', ...network, '--allow-fs-read=' + deployed, '--allow-fs-write=' + deployed,
      path.join(deployed, 'dist/wire.js'), path.join(checkout, 'package.json')], deployed);
    const observations = JSON.parse(result.stdout);
    expect(observations).toEqual({exchanges: 5, clientRefusals: 6, gatewayRefusals: 4, originalCheckoutReadable: false});
    await writeFile(path.join(evidence, 'wire.json'), result.stdout);
  } finally {
    await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
}
