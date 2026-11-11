/**
 * Qualifies installed gateways independently from their generated scaffold checks.
 * @since 1.1.6
 */
import {expect} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, realpath, appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {runOwnedNode} from './ownedNodeProcess.js';
import {noaaCases} from './noaaRpcOracle.js';

export const CHECKED_GATEWAY_STAGE_TIMEOUT_MS = 240_000;
export const CHECKED_GATEWAY_CLEANUP_TIMEOUT_MS = 60_000;
// @why #440: roughly three times the observed 353-second Windows workflow plus cleanup; below the 30/45-minute job caps.
// @constraints This shared workflow ceiling composes with four-minute commands; their maxima are not all simultaneously available.
export const CHECKED_GATEWAY_WORKFLOW_TIMEOUT_MS = 20 * 60_000;
/**
 * Packs the candidate and exercises only installed public generation and runtime entry points.
 * @param signal Caller cancellation; active owned command trees close before cleanup resolves.
 * @returns Resolves after consumer commands and independent HTTP/SOAP assertions pass.
 * @throws If installation, generation, consumer checks or independent wire assertions fail.
 * @sideEffects Uses disposable consumers, owned loopback processes and retained evidence under tmp/conformance.
 */
export async function qualifyCheckedGatewayInstalled(signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const root = process.cwd();
  const evidence = path.join(process.env.WSDL_TEST_RUN_DIR ?? path.join(root, 'tmp/conformance'), 'checked-gateway-installed');
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this installed qualification through npm test');
  const consumer = await realpath(await mkdtemp(path.join(tmpdir(), 'wsdl-gateway-')));
  const tooling = path.join(consumer, 'tooling'), project = path.join(consumer, 'project');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca',
    npm_config_cache: path.join(root, 'tmp/cache/npm')};
  delete env.NODE_PATH;
  const progressFile = path.join(evidence, 'progress.ndjson');
  let stage = 0;
  const run = async (label: string, args: string[], cwd = consumer, expectedError?: string) => {
    signal?.throwIfAborted();
    const current = ++stage, started = performance.now();
    const report = async (state: string) => {
      const event = {stage: current, label, state, elapsedMs: Math.round(performance.now() - started), at: new Date().toISOString()};
      await appendFile(progressFile, JSON.stringify(event) + '\n');
      console.info(`[installed gateway] ${current} ${state}: ${label} (${event.elapsedMs}ms)`);
    };
    await report('started');
    try {
      const result = await runOwnedNode(args, {cwd, env, signal, timeoutMs: CHECKED_GATEWAY_STAGE_TIMEOUT_MS,
        childProcessesDenied: expectedError !== undefined,
        maxBuffer: 8 * 1024 * 1024});
      await report('completed');
      return result;
    } catch (error) {
      await report(signal?.aborted ? 'cancelled' : expectedError && !(error instanceof AggregateError) && error instanceof Error && error.message.includes(expectedError)
        ? 'expected-refusal' : 'failed');
      throw error;
    }
  };
  try {
    await mkdir(evidence, {recursive: true});
    const [revision, tree] = execFileSync('git', ['rev-parse', 'HEAD', 'HEAD^{tree}'],
      {cwd: root, encoding: 'utf8', timeout: 5000, windowsHide: true}).trim().split(/\r?\n/);
    await writeFile(progressFile, JSON.stringify({kind: 'installed-gateway-run', revision, tree,
      stageTimeoutMs: CHECKED_GATEWAY_STAGE_TIMEOUT_MS, workflowWatchdogMs: CHECKED_GATEWAY_WORKFLOW_TIMEOUT_MS,
      workers: process.env.VITEST_MAX_WORKERS ?? 'vitest-default', startedAt: new Date().toISOString()}) + '\n');
    await mkdir(tooling); await mkdir(project);
    const fixture = path.join(root, 'test/conformance/fixtures/assessment/forecast.wsdl');
    const source = path.join(consumer, 'forecast.wsdl');
    await copyFile(fixture, source);
    const namespace = 'urn:checked:forecast';
    const selector = {portType: {namespace, local: 'ForecastPortType'},
      binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
    const checkedComponents = {selectors: [selector], sourceResources: [], sourceOrigins: [],
    service: {namespace, local: 'ForecastService'}, port: 'ForecastPort', fileRoots: [consumer]};
    const config = path.join(consumer, 'generation.json');
    await writeFile(config, JSON.stringify(checkedComponents));
    const packed = await run('pack candidate', [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', evidence], root);
    const filename = (JSON.parse(packed.stdout) as {filename: string}[])[0]!.filename;
    expect(path.basename(filename)).toBe(filename);
    const tarball = path.join(evidence, filename);
    await writeFile(path.join(tooling, 'package.json'), JSON.stringify({private: true, type: 'module'}));
    await run('install generator', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], tooling);
    const cli = path.join(tooling, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js');
    const generation = [cli, 'pipeline', '--model', 'checked-components-v1', '--checked-config', config,
      '--wsdl-source', source, '--client-dir', path.join(project, 'client'),
      '--openapi-file', path.join(project, 'openapi.json'), '--gateway-dir', path.join(project, 'gateway'),
      '--gateway-version-prefix', 'v1', '--gateway-service-name', 'forecast', '--init-app',
      '--app-dir', project, '--test-dir', path.join(project, 'test')];
    const installedGenerate = ['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer, ...generation];
    const generated = await run('generate installed project', installedGenerate, tooling);
    await writeFile(path.join(evidence, 'generation.log'), generated.stdout + generated.stderr);
    const clientBefore = await readFile(path.join(project, 'client/client.ts'), 'utf8');
    const scaffold = path.join(project, 'server.ts');
    const customized = (await readFile(scaffold, 'utf8')) + '\n// Consumer-owned customization retained across generation.\n';
    await writeFile(scaffold, customized);
    await run('regenerate and preserve scaffolds', installedGenerate, tooling);
    expect(await readFile(scaffold, 'utf8')).toBe(customized);
    expect(await readFile(path.join(project, 'client/client.ts'), 'utf8')).toBe(clientBefore);
    await copyFile(path.join(project, 'openapi.json'), path.join(project, 'composition-first.json'));
    const inventory = JSON.parse(await readFile(path.join(project, 'client/inventory.json'), 'utf8')) as {
      selection: unknown; operations: {requested: boolean; selected: boolean; generated: boolean; executed: boolean}[];
    };
    expect(inventory.selection).toMatchObject({service: checkedComponents.service, port: checkedComponents.port,
      selector: checkedComponents.selectors[0]!});
    expect(inventory.operations).toHaveLength(1);
    expect(inventory.operations[0]).toMatchObject({requested: true, selected: true, generated: true, executed: false});
    await writeFile(config, JSON.stringify({...checkedComponents,
      selectors: [{...checkedComponents.selectors[0]!, operation: 'UnimplementedRequestedOperation'}]}));
    await expect(run('refuse requested unsupported operation', installedGenerate, tooling, 'UnimplementedRequestedOperation'))
      .rejects.toThrow('UnimplementedRequestedOperation');
    expect(await readFile(path.join(project, 'client/client.ts'), 'utf8')).toBe(clientBefore);
    await writeFile(config, JSON.stringify(checkedComponents));
    // Candidate installation uses the ordinary consumer dependency installation command.
    await run('install consumer', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], project);
    for (const command of ['typecheck', 'test', 'build']) {
      const result = await run('consumer ' + command, [npm, 'run', command], project);
      await writeFile(path.join(evidence, command + '.log'), result.stdout + result.stderr);
    }
    const messageDir = path.join(root, 'test/conformance/fixtures/assessment/forecast-messages');
    for (const name of ['request.xml', 'response.xml', 'fault.xml', 'expectations.json']) {
      await copyFile(path.join(messageDir, name), path.join(project, name));
    }
    await copyFile(path.join(root, 'test/helpers/checkedGatewayInstalledProcess.ts'), path.join(project, 'qualification.ts'));
    await copyFile(path.join(root, 'test/helpers/noaaRpcOracle.ts'), path.join(project, 'noaaRpcOracle.ts'));
    await writeFile(path.join(project, 'noaaRpcOracle.js'), stripTypeScriptTypes(await readFile(path.join(root, 'test/helpers/noaaRpcOracle.ts'), 'utf8')));
    await copyFile(path.join(root, 'test/fixtures/wsdl/real-services/noaa-ndfd/live-zip-evidence.json'), path.join(project, 'live-zip-evidence.json'));
    await copyFile(path.join(root, 'test/helpers/ownedParentGuard.ts'), path.join(project, 'parent-guard.ts'));
    const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    const executed = await run('independent HTTP/SOAP contract and controls', ['--permission', '--allow-child-process', ...networkPermission,
      '--allow-fs-read=' + project, '--allow-fs-write=' + project,
      path.join(project, 'qualification.ts'), fixture], project);
    const result: unknown = JSON.parse(executed.stdout);
    expect(result).toMatchObject({kind: 'checked-gateway-installed', originalCheckoutReadable: false});
    await writeFile(path.join(evidence, 'wire.log'), executed.stdout + executed.stderr);
    const encodingFixture = path.join(root, 'test/conformance/fixtures/assessment/metadata-encoding');
    const metadata = await readFile(path.join(encodingFixture, 'service.wsdl'), 'utf8');
    const values = await readFile(path.join(encodingFixture, 'values.xsd'), 'utf8');
    const encode = (xml: string, encoding: 'latin1' | 'utf16le' | 'utf16be'): Buffer => {
      const declared = xml.replace('encoding="UTF-8"', `encoding="${encoding === 'latin1' ? 'ISO-8859-1' : 'UTF-16'}"`);
      if (encoding === 'latin1') return Buffer.from(declared, 'latin1');
      const bytes = Buffer.from(declared, 'utf16le');
      return encoding === 'utf16le' ? Buffer.concat([Buffer.from([0xff, 0xfe]), bytes])
        : Buffer.concat([Buffer.from([0xfe, 0xff]), bytes.swap16()]);
    };
    // @why Every root and import byte form carries an independently asserted non-ASCII contract operand.
    for (const [rootEncoding, importEncoding] of [['latin1', 'utf16le'], ['utf16le', 'utf16be'], ['utf16be', 'latin1']] as const) {
      const mode = 'encoding-' + rootEncoding;
      const importedName = mode + '.xsd';
      const encodedSource = path.join(consumer, mode + '.wsdl');
      const importedFile = path.join(consumer, importedName);
      await writeFile(encodedSource, encode(metadata.replace('values.xsd', importedName), rootEncoding));
      await writeFile(importedFile, encode(values, importEncoding));
      await writeFile(config, JSON.stringify({...checkedComponents,
        sourceResources: [{uri: pathToFileURL(importedFile).href, file: importedFile}]}));
      const args = [...installedGenerate];
      args[args.indexOf('--wsdl-source') + 1] = encodedSource;
      await run(mode + ' installed CLI generation', args, tooling);
      for (const name of [mode + '.wsdl', importedName]) {
        expect(await readFile(path.join(project, 'client/source/files', name))).toEqual(await readFile(path.join(consumer, name)));
      }
      await run(mode + ' consumer typecheck', [npm, 'run', 'typecheck'], project);
      await run(mode + ' consumer build', [npm, 'run', 'build'], project);
      const checked = await run(mode + ' independent HTTP/SOAP contract', ['--permission', '--allow-child-process', ...networkPermission,
        '--allow-fs-read=' + project, '--allow-fs-write=' + project,
        path.join(project, 'qualification.ts'), fixture, mode], project);
      expect(JSON.parse(checked.stdout)).toMatchObject({kind: 'checked-gateway-installed', variant: mode,
        upstreamRequests: 1, refusals: 4, artifactRefusals: 2});
      await writeFile(path.join(evidence, mode + '-wire.log'), checked.stdout + checked.stderr);
    }
    await writeFile(config, JSON.stringify(checkedComponents));
    const original = await readFile(source, 'utf8');
    for (const mode of ['optional', 'scalar', 'nil', 'keyed', 'facets', 'groups-default', 'groups-configured'] as const) {
      const grouped = mode.startsWith('groups-');
      const variant = grouped ? (await readFile(path.join(root,'test/conformance/fixtures/assessment/application-groups.wsdl'),'utf8'))
        .replaceAll('urn:checked:groups','urn:checked:forecast').replaceAll('PaymentPortType','ForecastPortType').replaceAll('PaymentBinding','ForecastBinding')
        .replaceAll('PaymentService','ForecastService').replaceAll('PaymentPort','ForecastPort').replaceAll('PaymentFault','ForecastFault').replaceAll('PaymentError','ForecastError')
        .replaceAll('SubmitResponse','GetForecastResponse').replaceAll('Submit','GetForecast')
        : mode === 'nil' || mode === 'keyed' || mode === 'facets' ? await readFile(path.join(root, `test/conformance/fixtures/assessment/${mode}.wsdl`), 'utf8') : mode === 'optional'
        ? original.replace('<xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/>',
          '<xs:element name="city" type="xs:string" minOccurs="0"/><xs:element name="days" type="xs:int" minOccurs="1" maxOccurs="unbounded"/>')
        : original.replace('type="t:ForecastRequest"', 'type="xs:boolean"')
          .replace('type="t:ForecastResponse"', 'type="xs:int"').replace('name="ForecastFault" type="t:ForecastFault"', 'name="ForecastFault" type="xs:string"');
      const variantSource = path.join(consumer, mode + '.wsdl');
      await writeFile(variantSource, variant);
      let groupOptions: {names?: {target:string;propertyName?:string;typeName?:string}[]} | undefined = grouped ? {} : undefined;
      const opts = {wsdl: variantSource, model: 'checked-components-v1', checkedComponents:{...checkedComponents,...(grouped?{applicationGroups:groupOptions}:{})},
        clientOutDir: path.join(project, 'client'), openapi: {outFile: path.join(project, 'openapi.json')},
        gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: mode === 'scalar' ? 'forecast-scalar' : 'forecast'},
        app: {appDir: project}, test: {testDir: path.join(project, 'test')}};
      await run(mode + ' installed API generation', ['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
        '--input-type=module', '-e',
        'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client"; await runGenerationPipeline(JSON.parse(process.argv[1]));',
        JSON.stringify(opts)], tooling);
      if (mode === 'groups-configured') {
        const inventory = JSON.parse(await readFile(path.join(project,'client/inventory.json'),'utf8')) as {
          applicationGroups:{targets:{target:string;role:string;defaults:{typeName:string}}[]}};
        groupOptions={names:[...inventory.applicationGroups.targets.filter(t=>t.defaults.typeName.startsWith('PaymentChoiceChoice')).map(t=>({target:t.target,
          ...(t.role==='choice'?{propertyName:'$payment',typeName:'PaymentMethod'}:{typeName:t.defaults.typeName.endsWith('1')?'CardPayment':'BankPayment'})})),
          ...inventory.applicationGroups.targets.filter(t=>t.role==='choice' && t.defaults.typeName.startsWith('NestedAlternativesChoiceAlternative')).map(t=>({
            target:t.target,propertyName:'$method',typeName:t.defaults.typeName.includes('Alternative1')?'CardChannel':'BankChannel'})),
          ...inventory.applicationGroups.targets.filter(t=>t.role==='sequence' && ['OneSequenceSequence','TwoSequenceSequence'].includes(t.defaults.typeName)).map(t=>({
            target:t.target,...(t.defaults.typeName==='OneSequenceSequence'?{propertyName:'$id',typeName:'__proto__'}:{typeName:'toString'})}))]};
        await writeFile(config,JSON.stringify({...checkedComponents,applicationGroups:groupOptions}));
        const args=[...installedGenerate];
        args[args.indexOf('--wsdl-source')+1]=variantSource;
        await run('configured group CLI inventory-copy regeneration',args,tooling);
      }
      await run(mode + ' consumer typecheck', [npm, 'run', 'typecheck'], project);
      await run(mode + ' consumer build', [npm, 'run', 'build'], project);
      if (mode === 'scalar') {
        const composition = await run('compose independent installed checked services', ['--permission', '--allow-fs-read=' + project,
          '--input-type=module', '-e',
          'import assert from "node:assert/strict"; import {readFile} from "node:fs/promises"; '
          + 'import {composeOpenApiDocuments} from "@techspokes/typescript-wsdl-client"; import {Ajv} from "ajv"; '
          + 'const first=JSON.parse(await readFile("composition-first.json","utf8")); const second=JSON.parse(await readFile("openapi.json","utf8")); '
          + 'const inputs=[{key:"first",document:first},{key:"second",document:second}]; const before=JSON.stringify(inputs); '
          + 'const doc=composeOpenApiDocuments(inputs); assert.equal(JSON.stringify(inputs),before); '
          + 'for(const [route,good,bad] of [["/v1/forecast/GetForecast",{city:"Oslo",days:2},true], '
          + '["/v1/forecast-scalar/GetForecast",true,{city:"Oslo",days:2}]]) {'
          + 'const schema=doc.paths[route].post.requestBody.content["application/json"].schema; '
          + 'const validate=new Ajv({strict:false,coerceTypes:false,useDefaults:false,removeAdditional:false}).compile({...schema,components:doc.components}); '
          + 'assert.equal(validate(good),true); assert.equal(validate(bad),false); } '
          + 'process.stdout.write(JSON.stringify({kind:"installed-checked-composition",paths:Object.keys(doc.paths)}));'], project);
        expect(JSON.parse(composition.stdout)).toMatchObject({kind: 'installed-checked-composition',
          paths: ['/v1/forecast-scalar/GetForecast', '/v1/forecast/GetForecast']});
        await writeFile(path.join(evidence, 'composition.log'), composition.stdout + composition.stderr);
      }
      const checked = await run(mode + ' independent HTTP/SOAP contract', ['--permission', '--allow-child-process', ...networkPermission,
        '--allow-fs-read=' + project, '--allow-fs-write=' + project,
        path.join(project, 'qualification.ts'), fixture, mode], project);
      expect(JSON.parse(checked.stdout)).toMatchObject({kind: 'checked-gateway-installed', variant: mode});
      await writeFile(path.join(evidence, mode + '-wire.log'), checked.stdout + checked.stderr);
    }
    // @why #458 qualifies original NOAA bytes through the same installed consumer and owned-server harness.
    const noaaSource = path.join(consumer, 'noaa.wsdl');
    await copyFile(path.join(root, 'test/fixtures/wsdl/real-services/noaa-ndfd/ndfd-xml.wsdl'), noaaSource);
    const noaaNamespace = 'http://localhost/xml/wsdl/ndfdXML.wsdl';
    await writeFile(config, JSON.stringify({...checkedComponents, selectors: noaaCases.map(({operation}) => ({operation,
      portType: {namespace: noaaNamespace, local: 'ndfdXMLPortType'}, binding: {namespace: noaaNamespace, local: 'ndfdXMLBinding'}})),
      service: {namespace: noaaNamespace, local: 'ndfdXML'}, port: 'ndfdXMLPort'}));
    // @why Changing the selected operation deliberately refreshes both consumer-owned
    //   scaffold defaults; the earlier same-contract check proves preservation without force.
    const noaaGeneration = [...installedGenerate, '--force-test', '--force-init'];
    noaaGeneration[noaaGeneration.indexOf('--wsdl-source') + 1] = noaaSource;
    await run('NOAA original-source installed CLI generation', noaaGeneration, tooling);
    const noaaClient = await readFile(path.join(project, 'client/client.ts'), 'utf8');
    const readNoaaContracts = () => Promise.all(noaaCases.map((_, index) => readFile(path.join(project, `client/operations/${index}/contract.json`), 'utf8')));
    const noaaContracts = await readNoaaContracts();
    const noaaOpenApi = await readFile(path.join(project, 'openapi.json'), 'utf8');
    await run('NOAA deterministic regeneration', noaaGeneration, tooling);
    expect(await readFile(path.join(project, 'client/client.ts'), 'utf8')).toBe(noaaClient);
    expect(await readNoaaContracts()).toEqual(noaaContracts);
    expect(await readFile(path.join(project, 'openapi.json'), 'utf8')).toBe(noaaOpenApi);
    expect(await readFile(path.join(project, 'client/source/files/noaa.wsdl'))).toEqual(await readFile(noaaSource));
    const noaaInventory = JSON.parse(await readFile(path.join(project, 'client/inventory.json'), 'utf8')) as {
      operations: {operation: string; generated: boolean; executed: boolean}[]};
    expect(noaaInventory.operations).toHaveLength(12);
    expect(noaaInventory.operations.every(operation => operation.generated)).toBe(true);
    expect(noaaInventory.operations.every(operation => !operation.executed)).toBe(true);
    // @why This disposable project changes contracts in place. Retire the previous
    //   compiled scaffold before testing current source; the next build owns fresh output.
    await rm(path.join(project, 'dist'), {recursive: true, force: true});
    for (const command of ['typecheck', 'test', 'build']) {
      const result = await run('NOAA consumer ' + command, [npm, 'run', command], project);
      await writeFile(path.join(evidence, 'noaa-' + command + '.log'), result.stdout + result.stderr);
    }
    const noaaWire = await run('NOAA independent installed HTTP/SOAP typed profile', ['--permission', '--allow-child-process', ...networkPermission,
      '--allow-fs-read=' + project, '--allow-fs-write=' + project,
      path.join(project, 'qualification.ts'), fixture, 'noaa'], project);
    expect(JSON.parse(noaaWire.stdout)).toMatchObject({kind: 'checked-gateway-installed', variant: 'noaa',
      originalCheckoutReadable: false, providerCalls: 0});
    await writeFile(path.join(evidence, 'noaa-wire.log'), noaaWire.stdout + noaaWire.stderr);
  } catch (error) {
    const failure = error as Error & {stdout?: string; stderr?: string};
    await writeFile(path.join(evidence, 'failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
    await appendFile(progressFile, JSON.stringify({kind: 'installed-gateway-run',
      state: signal?.aborted ? 'cancelled' : 'failed', stage, at: new Date().toISOString()}) + '\n');
    throw error;
  } finally {
    await rm(consumer, {recursive: true, force: true, maxRetries: 3, retryDelay: 100});
    await appendFile(progressFile, JSON.stringify({kind: 'consumer-cleanup', state: 'completed', at: new Date().toISOString()}) + '\n');
  }
  if (signal?.aborted) {
    await appendFile(progressFile, JSON.stringify({kind: 'installed-gateway-run', state: 'cancelled', at: new Date().toISOString()}) + '\n');
    signal.throwIfAborted();
  }
  await appendFile(progressFile, JSON.stringify({kind: 'installed-gateway-run', state: 'completed', stages: stage,
    finishedAt: new Date().toISOString()}) + '\n');
}
