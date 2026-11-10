/** Packed-consumer qualification for an explicitly completed SOAP wrapper contract.
 * @since Unreleased
 */
import {expect} from 'vitest';
import {appendFile, copyFile, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectSourceCorrectionInventory} from '../../src/compiler/sourceCorrections.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';
import {runOwnedNode} from './ownedNodeProcess.js';
import {installIntakeProject, type InstalledIntakeTooling} from './installedIntakeTooling.js';

/**
 * Generate and execute original and corrected apps using one independently packed candidate.
 * @param shared Installed candidate tooling reused by the intake suite.
 * @param signal Caller cancellation propagated through owned stages.
 * @returns Resolves after installed compilation and independent SOAP behavior agree.
 * @throws For rejected generation, dependency installation, compilation, or wire assertions.
 * @sideEffects Creates isolated consumers and retains compact evidence under tmp/conformance.
 */
export async function qualifyCorrectedIntakeInstalled(shared: InstalledIntakeTooling, signal: AbortSignal): Promise<void> {
  const npm = process.env.npm_execpath; if (!npm) throw new Error('Run installed qualification through npm');
  const evidence = path.resolve('tmp/conformance/source-corrections-installed'); await mkdir(evidence, {recursive: true});
  const logs = await mkdtemp(path.join(evidence, 'run-'));
  const consumer = path.join(shared.root, 'corrected'); await mkdir(consumer);
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.resolve('tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = async (label: string, args: string[], cwd: string) => {
    const started = performance.now();
    try {
      const result = await runOwnedNode(args, {cwd, env, signal, timeoutMs: 240_000, maxBuffer: 8 * 1024 * 1024,
        childProcessesDenied: args[0] === '--permission'});
      await writeFile(path.join(logs, label + '.log'), result.stdout + result.stderr);
      return result;
    } catch (error) {
      const captured = error as Error & {stdout?: string; stderr?: string};
      await writeFile(path.join(logs, label + '-failure.log'), captured.message + '\n' + (captured.stdout ?? '') + (captured.stderr ?? ''));
      throw new Error(`${captured.message}\n${captured.stdout ?? ''}${captured.stderr ?? ''}`, {cause: error});
    } finally {await appendFile(path.join(logs, 'timing.ndjson'), JSON.stringify({label, elapsedMs: Math.round(performance.now() - started)}) + '\n');}
  };
  try {
    const inputs = path.join(consumer, 'inputs'); await mkdir(inputs);
    const source = path.join(inputs, 'wrapper.wsdl'), companion = path.join(inputs, 'records.wsdl');
    for (const file of [source, companion]) await copyFile(path.join('test/conformance/fixtures/xsd/standard-schema-element', path.basename(file)), file);
    const main = await loadSemanticSchemaInput(source, {policy: {fileRoots: [inputs]}, signal});
    const records = await loadSemanticSchemaInput(companion, {policy: {fileRoots: [inputs]}, signal});
    const inventory = inspectSourceCorrectionInventory([main, records], signal);
    const target = (node: (typeof inventory.nodes)[number]) => ({id: node.id, uri: node.uri, digest: node.digest});
    const metadata = inventory.nodes.find(node => node.uri === main.root.uri && node.kind === 'particle'
      && node.attributes.some(attribute => attribute.name === 'ref' && attribute.value === 'xs:schema'));
    const wildcard = inventory.nodes.find(node => node.uri === main.root.uri && node.kind === 'particle' && node.wildcard);
    const quantity = inventory.nodes.find(node => node.uri === records.root.uri && node.kind === 'particle'
      && node.attributes.some(attribute => attribute.name === 'name' && attribute.value === 'Quantity'));
    const sequence = quantity && inventory.nodes.find(node => node.uri === records.root.uri && node.children?.includes(quantity.id));
    if (!metadata || !wildcard || !quantity || !sequence) throw new Error('Expected original wrapper and companion inventory targets');
    // @constraints The recipe is authored outside generated apps; it states three explicit source changes, never a validation override.
    const recipe = {version: 1, resources: inventory.resources.map(({uri, digest}) => ({uri, digest})), corrections: [
      {kind: 'set-occurs', target: target(metadata), min: '0', max: '1'},
      {kind: 'set-wildcard-namespaces', target: target(wildcard), namespaces: ['urn:owned:wrapper']},
      {kind: 'insert-element', target: target(sequence), position: {kind: 'after', target: target(quantity)},
        element: {kind: 'declaration', name: 'CorrectionCode', type: {namespace: 'http://www.w3.org/2001/XMLSchema', local: 'string'}, min: '0', max: '1'}},
    ]};
    const recipeFile = path.join(consumer, 'recipe.json'); await writeFile(recipeFile, JSON.stringify(recipe));
    await writeFile(path.join(logs, 'authored-recipe.json'), JSON.stringify(recipe, null, 2));
    const name = (local: string) => ({namespace: 'urn:owned:wrapper', local});
    const selector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
    const config = {fileRoots: [inputs], sourceResources: [], sourceOrigins: [], selectors: [selector], service: name('WrapperService'), port: 'WrapperPort',
      standardLibraries: ['w3c-xsd10-schema-element-2004-v1'], recordProjections: [{selector, source: companion,
        recordSelector: {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'}, scope: 'records-with-declared-wrapper-scope'}]};
    const permissions = ['--permission', '--allow-fs-read=' + consumer, '--allow-fs-read=' + shared.tooling, '--allow-fs-write=' + consumer];
    for (const mode of ['original', 'completed']) {
      const project = path.join(consumer, mode), configuration = path.join(consumer, mode + '.json');
      await writeFile(configuration, JSON.stringify({...config, ...(mode === 'completed' ? {sourceCorrectionsFile: recipeFile} : {})}));
      await run(mode + '-generate', [...permissions, shared.cli, 'pipeline', '--model', 'checked-components-v1', '--wsdl-source', source,
        '--checked-config', configuration, '--client-dir', path.join(project, 'client'), '--openapi-file', path.join(project, 'openapi.json'),
        '--gateway-dir', path.join(project, 'gateway'), '--gateway-version-prefix', 'v1', '--gateway-service-name', 'wrapper', '--init-app', '--app-dir', project], shared.tooling);
      const provenance = path.join(project, 'client/source-corrections.json');
      if (mode === 'completed') {
        const record = JSON.parse(await readFile(provenance, 'utf8')) as {corrections: {kind: string}[]};
        expect(record.corrections.map(change => change.kind).sort()).toEqual(['insert-element', 'set-occurs', 'set-wildcard-namespaces']);
        await copyFile(provenance, path.join(logs, 'completed-provenance.json'));
      } else await expect(readFile(provenance)).rejects.toMatchObject({code: 'ENOENT'});
      await installIntakeProject(shared, project, logs, env, run, mode + '-install');
      for (const command of ['typecheck', 'build']) await run(mode + '-' + command, [npm, 'run', command], project);
    }
    await rm(inputs, {recursive: true}); await rm(recipeFile);
    await copyFile('test/helpers/correctedIntakeInstalledProcess.ts', path.join(consumer, 'wire.ts'));
    const network = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const result = await run('completed-wire', ['--permission', ...network, '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
      path.join(consumer, 'wire.ts'), path.resolve('package.json')], consumer);
    expect(JSON.parse(result.stdout)).toMatchObject({kind: 'completed-wrapper-installed', checkoutReadable: false, recipePresent: false,
      originalSourcePresent: false, successfulCorrectedCalls: 2, originalRejections: 2, soapCalls: 4, tamperRejectedBeforeIo: true});
    await writeFile(path.join(logs, 'result.json'), result.stdout);
  } finally {await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});}
}
