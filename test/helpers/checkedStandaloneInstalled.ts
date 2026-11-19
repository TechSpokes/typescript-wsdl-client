import {expect} from 'vitest';
import {copyFile, mkdir, readFile, readdir, rename, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import type {InstalledIntakeTooling} from './installedIntakeTooling.js';
import {runOwnedNode} from './ownedNodeProcess.js';

async function clientContract(directory: string) {
  const files = (await readdir(directory, {recursive: true, withFileTypes: true}))
    .filter(entry => entry.isFile()).map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
  const artifacts = await Promise.all(files.map(async file => {
    const bytes = await readFile(path.join(directory, file));
    if (file !== 'source-resources.json') return [file, bytes] as const;
    const source = JSON.parse(bytes.toString('utf8')) as {resources: {logicalUri: string}[]};
    // @why Local provenance records identify the generation destination; runtime paths must already be owner-relative.
    for (const resource of source.resources) resource.logicalUri = path.relative(directory, fileURLToPath(resource.logicalUri));
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
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca'};
  delete env.NODE_PATH;
  const run = (args: string[], cwd: string, expectedRefusal = false) => runOwnedNode(args,
    {cwd, env, signal, timeoutMs: 120_000, childProcessesDenied: expectedRefusal});
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
    const cliClient = path.join(cliDir, 'client'), apiClient = path.join(apiDir, 'client'), pipelineClient = path.join(pipelineDir, 'client');
    const source = path.join(inputs, sourceName);
    const cliReport = path.join(consumer, 'cli-report.json');
    const cliBase = [cli, 'client', '--model', 'checked-components-v1'];
    const generated = await run([...permissions, ...cliBase, '--wsdl-source', path.relative(consumer, source),
      '--client-dir', path.relative(consumer, cliClient), '--checked-report', cliReport], consumer);
    const planner = path.join(consumer, 'generate.ts');
    await copyFile(path.join(checkout, 'test/fixtures/consumers/checked-standalone-generate.ts'), planner);
    await compile([planner], ['--noEmit'], tooling);
    const executed = await run([...permissions, planner, path.relative(tooling, source), path.relative(tooling, apiClient)], tooling);
    expect(JSON.parse(executed.stdout)).toEqual({checked: JSON.parse(generated.stdout), planning: JSON.parse(await readFile(cliReport, 'utf8'))});
    expect(JSON.parse(generated.stdout)).toMatchObject({model: 'checked-components-v1', operations: [{operation: 'GetForecast', generated: true, executed: false}]});
    await run([...permissions, cli, 'pipeline', '--model', 'checked-components-v1', '--wsdl-source', source, '--client-dir', pipelineClient,
      '--openapi-file', path.join(pipelineDir, 'openapi.json'), '--gateway-dir', path.join(pipelineDir, 'gateway'), '--gateway-version-prefix', 'v1',
      '--gateway-service-name', 'forecast', '--init-app', '--app-dir', pipelineDir], tooling);
    expect(await readdir(cliDir)).toEqual(['client']);
    expect(await readdir(apiDir)).toEqual(['client']);
    const contract = await clientContract(cliClient);
    expect(Object.keys(contract).map(file => file.replaceAll('\\', '/')).sort()).toEqual([
      'client.ts', 'inventory.json', 'operations/0/client.ts', 'operations/0/contract.json', 'source-resources.json',
      'source/files/' + dependencyName, 'source/files/' + sourceName,
    ]);
    expect(await clientContract(apiClient)).toEqual(contract);
    expect(await clientContract(pipelineClient)).toEqual(contract);
    for (const file of [sourceName, dependencyName]) {
      expect(await readFile(path.join(cliClient, 'source/files', file))).toEqual(await readFile(path.join(inputs, file)));
    }

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
    const deployed = path.join(consumer, 'deployed');
    await rename(cliDir, deployed);
    await copyFile(path.join(other, 'operations/0/contract.json'), path.join(deployed, 'other-contract.json'));
    await Promise.all([inputs, apiDir, pipelineDir, other].map(directory => rm(directory, {recursive: true})));
    for (const file of ['request.xml', 'response.xml', 'fault.xml']) {
      await copyFile(path.join(checkout, 'test/conformance/fixtures/assessment/forecast-messages', file), path.join(deployed, file));
    }
    const wire = path.join(deployed, 'wire.ts');
    await copyFile(path.join(checkout, 'test/fixtures/consumers/checked-standalone-wire.ts'), wire);
    await compile([wire], ['--rootDir', deployed, '--outDir', path.join(deployed, 'build')], deployed);
    const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const result = await run(['--permission', ...network, '--allow-fs-read=' + tooling, '--allow-fs-write=' + deployed,
      path.join(deployed, 'build/wire.js'), path.join(checkout, 'package.json')], deployed);
    expect(JSON.parse(result.stdout)).toEqual({exchanges: 2, refusals: 6, originalCheckoutReadable: false});
  } finally {
    await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});
  }
}
