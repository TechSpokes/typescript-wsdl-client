import assert from 'node:assert/strict';
import {copyFile, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {candidateTarball, lockedDependencies} from './lib/candidate-package.js';
import {runOwnedNode} from '../test/helpers/ownedNodeProcess.js';

const root = process.cwd();
const started = performance.now();
let phaseStart = started;
const phase = (label: string) => {
  const now = performance.now();
  console.info(`[legacy smoke] ${label}: ${Math.round(now - phaseStart)}ms`);
  phaseStart = now;
};
const workspace = process.env.WSDL_TEST_RUN_DIR;
const npmCli = process.env.npm_execpath;
if (!workspace || !npmCli) throw new Error('Run this check using npm run package:smoke');
const consumer = await mkdtemp(path.join(await realpath(tmpdir()), 'wsdl-package-consumer-'));
const manifest = JSON.parse(await readFile('package.json', 'utf8')) as {
  name: string; version: string;
};
const env: NodeJS.ProcessEnv = {...process.env, NODE_USE_SYSTEM_CA: '1', npm_config_cache: path.resolve('tmp/cache/npm')};
delete env.NODE_PATH;
const run = (args: string[], cwd = consumer, print = false) => runOwnedNode(args, {
  cwd, env, timeoutMs: 240_000, onOutput: print ? chunk => process.stdout.write(chunk) : undefined,
});
const npm = (args: string[], cwd = consumer) =>
  run([npmCli, ...args, '--ignore-scripts', '--no-audit', '--no-fund'], cwd);
const cli = (args: string[]) => run([npmCli, 'exec', '--offline', '--no', '--', 'wsdl-tsc', ...args]);
const write = (file: string, content: string) => writeFile(path.join(consumer, file), content);
let canRemoveConsumer = true;

try {
  const tarball = await candidateTarball(workspace, async () =>
    (await npm(['pack', '--json', '--pack-destination', workspace], root)).stdout);
  await write('package.json', JSON.stringify({name: 'legacy-package-consumer', private: true, type: 'module'}));
  phase('consumer and tarball setup');
  await npm(['install', '--prefer-offline', '--omit=dev', tarball]);
  phase('production-only install');
  await copyFile('examples/minimal/weather.wsdl', path.join(consumer, 'weather.wsdl'));
  await run(['--input-type=module', '-e', `
    import {createRequire} from 'node:module';
    const require = createRequire(import.meta.url);
    try {require.resolve('typescript'); process.exit(2);}
    catch (error) {if (error.code !== 'MODULE_NOT_FOUND') throw error;}
  `]);
  await cli(['pipeline', '--wsdl-source', 'weather.wsdl', '--client-dir', '.generated/client',
    '--openapi-file', '.generated/openapi.json', '--gateway-dir', '.generated/gateway',
    '--gateway-service-name', 'weather', '--gateway-version-prefix', 'v1', '--init-app',
    '--test-dir', '.generated/tests']);
  await write('api.mjs', `
    import {compileWsdlToProject} from ${JSON.stringify(manifest.name)};
    await compileWsdlToProject({wsdl: 'weather.wsdl', outDir: 'api-client', options: {imports: 'js'}});
  `);
  await run(['api.mjs']);
  phase('production CLI and API generation');

  const app = JSON.parse(await readFile(path.join(consumer, '.generated/app/package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  await npm(['install', '--prefer-offline', ...lockedDependencies([
    ...Object.keys(app.dependencies), 'typescript', '@types/node', 'vitest',
  ])]);
  phase('developer tooling install');
  await copyFile('test/helpers/installedDeclarationNavigation.ts', path.join(consumer, 'declaration-navigation.ts'));
  const declaration = () => run(['declaration-navigation.ts']);
  const compile = () => run(['node_modules/typescript/bin/tsc', '--noEmit', '-p', '.generated/app/tsconfig.json']);
  const tests = () => run([path.join(consumer, 'node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.config.ts'],
    path.join(consumer, '.generated/tests'), true);
  if (process.platform === 'win32') {
    const measure = async (label: string, check: typeof declaration) => {
      const start = performance.now();
      await check();
      console.info(`[legacy smoke] ${label}: ${Math.round(performance.now() - start)}ms`);
    };
    // @constraints Every child must finish before changing the installed package or removing the consumer.
    const results = await Promise.allSettled([
      measure('declaration navigation', declaration), measure('generated app compile', compile), measure('generated app tests', tests),
    ]);
    const failures = results.flatMap(result => result.status === 'rejected' ? [result.reason as unknown] : []);
    const unresolvedCleanup = failures.find(failure => failure instanceof AggregateError);
    if (unresolvedCleanup) throw unresolvedCleanup;
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new Error('Installed consumer checks failed', {cause: new AggregateError(failures)});
    phase('parallel declaration, compile and tests');
  } else {
    await declaration();
    phase('declaration navigation');
    await compile();
    await tests();
    phase('generated app compile and tests');
  }
  for (const directory of ['.generated/client', '.generated/gateway', '.generated/app', '.generated/tests', 'api-client']) {
    const files = (await readdir(path.join(consumer, directory), {recursive: true, withFileTypes: true}))
      .filter(entry => entry.isFile() && entry.name.endsWith('.ts'));
    assert.ok(files.length, `No TypeScript in ${directory}`);
    for (const entry of files) {
      const file = path.join(entry.parentPath, entry.name);
      assert.ok((await readFile(file, 'utf8')).startsWith('/* eslint-disable */\n'), file);
    }
  }
  const preamble = path.join(consumer, 'node_modules', manifest.name, 'src/generation/preambles/typescript.preamble');
  await rename(preamble, preamble + '.removed');
  await assert.rejects(cli(['client', '--wsdl-source', 'weather.wsdl', '--client-dir', 'broken-client']), /preamble/i);
  await assert.rejects(readFile(path.join(consumer, 'broken-client/client.ts')), {code: 'ENOENT'});
  phase('generated files and missing-resource refusal');
  console.log(`Installed package ${manifest.version} passed: npm CLI, package-root API and declarations, generated app and tests, missing-resource refusal.`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
  if (error instanceof AggregateError) {
    canRemoveConsumer = false;
    await writeFile(path.join(workspace, 'external-recovery-required'), consumer + '\n', {flag: 'wx'});
  }
} finally {
  if (canRemoveConsumer) {
    phaseStart = performance.now();
    await rm(consumer, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    phase('cleanup');
  }
  console.info(`[legacy smoke] total: ${Math.round(performance.now() - started)}ms`);
}
