import {expect} from 'vitest';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, appendFile, readdir} from 'node:fs/promises';
import path from 'node:path';
import {runOwnedNode} from './ownedNodeProcess.js';
import type {InstalledIntakeTooling} from './installedIntakeTooling.js';
import type {CheckedComponentPlan} from '../../src/index.js';

export async function qualifyLocalIntakeInstalled(shared: InstalledIntakeTooling, signal: AbortSignal): Promise<void> {
  const root = process.cwd(), npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run installed qualification through npm');
  const evidence = path.resolve('tmp/conformance/wsdl-first-installed'); await mkdir(evidence, {recursive: true});
  const runEvidence = await mkdtemp(path.join(evidence, 'run-'));
  const consumer = path.join(shared.root, 'local'); await mkdir(consumer);
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.resolve('tmp/cache/npm'), VITEST_MAX_WORKERS: '1'};
  delete env.NODE_PATH;
  const run = async (label: string, args: string[], cwd: string) => {
    const start = performance.now();
    try {
      const result = await runOwnedNode(args, {cwd, env, signal: signal, timeoutMs: 240_000, maxBuffer: 8 * 1024 * 1024,
        childProcessesDenied: label === 'missing-import' || label === 'unresolved-draft' || label.startsWith('refuse-')});
      await appendFile(path.join(runEvidence, 'timing.ndjson'), JSON.stringify({label, elapsedMs: Math.round(performance.now() - start), result: 'passed'}) + '\n');
      return result;
    } catch (error) {
      const failure = error as Error & {stdout?: string; stderr?: string};
      await writeFile(path.join(runEvidence, label + '-refusal-or-failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
      await appendFile(path.join(runEvidence, 'timing.ndjson'), JSON.stringify({label, elapsedMs: Math.round(performance.now() - start), result: 'refused-or-failed'}) + '\n');
      throw error;
    }
  };
  try {
    const {tooling, tarball, cli} = shared;
    const inputs = path.join(consumer, 'inputs'); await mkdir(inputs);
    const source = path.join(inputs, 'source.wsdl'), missing = path.join(inputs, 'missing.wsdl'), dependency = path.join(inputs, 'import-relative-types-types.xsd');
    await copyFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', source);
    await copyFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', dependency);
    await copyFile('test/conformance/fixtures/assessment/wsdl-first-missing.wsdl', missing);
    const permissions = ['--permission', '--allow-fs-read=' + consumer, '--allow-fs-read=' + tooling, '--allow-fs-write=' + consumer];
    for (const mode of ['cli', 'api', 'recovery']) {
      const project = path.join(consumer, mode), wsdl = mode === 'recovery' ? missing : source;
      const opts = {model: 'checked-components-v1', wsdl, clientOutDir: path.join(project, 'client'),
        openapi: {outFile: path.join(project, 'openapi.json')}, gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'import'},
        app: {appDir: project}, test: {testDir: path.join(project, 'test')}};
      const report = path.join(consumer, mode + '-report.json'), draft = path.join(consumer, mode + '-draft.json');
      const cliArgs = [cli, 'pipeline', '--model', 'checked-components-v1', '--wsdl-source', wsdl,
        '--client-dir', opts.clientOutDir, '--openapi-file', opts.openapi.outFile, '--gateway-dir', opts.gateway.outDir,
        '--gateway-version-prefix', 'v1', '--gateway-service-name', 'import', '--init-app', '--app-dir', project, '--test-dir', opts.test.testDir];
      const api = ['--input-type=module', '-e', 'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client"; const r=await runGenerationPipeline(JSON.parse(process.argv[1])); console.log(JSON.stringify(r.planning));'];
      if (mode === 'cli') {
        const invalidFile = path.join(consumer, 'invalid-config.json');
        for (const value of [null, [], 1, true, '']) {
          await writeFile(invalidFile, JSON.stringify(value));
          await expect(run('refuse-malformed-root', [...permissions, ...cliArgs, '--checked-config', invalidFile], tooling)).rejects.toThrow('configuration');
        }
      }
      if (mode === 'recovery') {
        await expect(run('missing-import', [...permissions, ...cliArgs, '--checked-report', report, '--checked-draft', draft], tooling)).rejects.toThrow('locationless-import');
        const plan = JSON.parse(await readFile(report, 'utf8')) as CheckedComponentPlan;
        expect(plan.blockers).toMatchObject([{category: 'missing-dependency', affected: [{operation: 'SubmitImported'}]}]);
        await copyFile(report, path.join(runEvidence, 'missing-report.json'));
        await copyFile(draft, path.join(runEvidence, 'before.json'));
        await expect(run('unresolved-draft', [...permissions, ...cliArgs, '--checked-config', draft], tooling)).rejects.toThrow('configuration');
        const config = JSON.parse(await readFile(draft, 'utf8')) as {namespaceLocations: {namespace: string; location: string}[]};
        config.namespaceLocations[0]!.location = dependency;
        await writeFile(draft, JSON.stringify(config)); await copyFile(draft, path.join(runEvidence, 'after.json'));
        await run('resolved-generation', [...permissions, ...cliArgs, '--checked-config', draft], tooling);
      } else if (mode === 'cli') await run('automatic-cli', [...permissions, ...cliArgs], tooling);
      else await run('automatic-api', [...permissions, ...api, JSON.stringify(opts)], tooling);
      const inventory = JSON.parse(await readFile(path.join(project, 'client/inventory.json'), 'utf8')) as {operations: unknown[]};
      expect(inventory.operations).toHaveLength(1); await writeFile(path.join(runEvidence, mode + '-inventory.json'), JSON.stringify(inventory, null, 2));
      const artifacts = (await readdir(project, {recursive: true, withFileTypes: true})).filter(entry => entry.isFile())
        .map(entry => path.relative(project, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort();
      await writeFile(path.join(runEvidence, mode + '-artifacts.json'), JSON.stringify(artifacts, null, 2) + '\n');
      await run(mode + '-install', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], project);
      for (const command of ['typecheck', 'test', 'build']) {
        const result = await run(mode + '-' + command, [npm, 'run', command], project);
        await writeFile(path.join(runEvidence, mode + '-' + command + '.log'), result.stdout + result.stderr);
      }
      for (const name of ['test-cert.pem', 'test-key.pem']) await copyFile('test/conformance/fixtures/soap/content-model/' + name, path.join(project, name));
      await copyFile('test/helpers/localIntakeInstalledProcess.ts', path.join(project, 'wire.ts'));
      await copyFile('test/helpers/ownedParentGuard.ts', path.join(project, 'parent-guard.ts'));
      const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
      const result = await run(mode + '-wire', ['--permission', '--allow-child-process', ...network, '--allow-fs-read=' + project, '--allow-fs-write=' + project,
        path.join(project, 'wire.ts'), path.join(root, 'package.json')], project);
      expect(JSON.parse(result.stdout)).toMatchObject({kind: 'wsdl-first-installed-wire', checkoutReadable: false, exchanges: 1, invalidHttpRejected: true, verifiedTls: true});
      await writeFile(path.join(runEvidence, mode + '-wire.json'), result.stdout);
    }
    await writeFile(path.join(runEvidence, 'result.json'), JSON.stringify({status: 'passed', projects: 3, operations: 3, exchanges: 3, humanResolutionValues: 1,
      harnessStageWatchdogMs: 240_000, productLatencyRequirement: false}));
  } finally {await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});}
}
