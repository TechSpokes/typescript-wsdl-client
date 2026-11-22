import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {copyFile, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expect, it} from 'vitest';
import {candidateTarball} from '../../scripts/lib/candidate-package.js';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';

it('qualifies the exact installed checked-stream candidate in a strict-built relocated consumer', {
  tags: 'installed-compatibility', timeout: 480_000,
}, async context => {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run installed qualification through npm');
  const checkout = process.cwd();
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'wsdl-checked-stream-')));
  const tooling = path.join(temporary, 'tooling'), project = path.join(temporary, 'project');
  const fixture = path.join(checkout, 'test/fixtures/wsdl/stream-mapping.wsdl');
  const source = path.join(project, 'stream-mapping.wsdl');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.join(checkout, 'tmp/cache/npm')};
  delete env.NODE_PATH;
  let stage = 'create external consumer';
  async function run(label: string, args: string[], cwd = project) {
    stage = label;
    console.info('[checked streaming installed] ' + label);
    return runOwnedNode(args, {cwd, env, signal: context.signal, timeoutMs: 120_000, maxBuffer: 2 * 1024 * 1024});
  }
  try {
    await mkdir(tooling);
    await mkdir(project);
    await copyFile(fixture, source);
    const tarball = await candidateTarball(temporary, async () =>
      (await run('pack focused candidate', [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary], checkout)).stdout);
    const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: checkout, encoding: 'utf8', windowsHide: true}).trim();
    const archive = createHash('sha256').update(await readFile(tarball)).digest('hex');
    const sourceDigest = createHash('sha256').update(await readFile(source)).digest('hex');
    const treeClean = !execFileSync('git', ['status', '--porcelain'], {cwd: checkout, encoding: 'utf8', windowsHide: true}).trim();
    await writeFile(path.join(tooling, 'package.json'), '{"private":true,"type":"module"}\n');
    await run('install the exact generator archive', [npm, 'install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], tooling);
    const cli = path.join(tooling, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js');
    const permissions = ['--permission', '--allow-fs-read=' + temporary, '--allow-fs-write=' + temporary];
    const namespace = 'urn:stream-mapping';
    const selector = {portType: {namespace, local: 'MappingPort'}, binding: {namespace, local: 'MappingBinding'}, operation: 'Read'};
    const formats = ['ndjson', 'json-array'] as const;
    for (const format of formats) {
      const app = path.join(project, format), client = path.join(app, 'client'), gateway = path.join(app, 'gateway');
      const openapi = path.join(app, 'openapi.json');
      const checkedComponents = {streams: [{selector, path: ['ReadResponse', 'Record'], format}]};
      if (format === 'ndjson') {
        const config = path.join(temporary, 'checked.json');
        const report = path.join(temporary, 'plan.json');
        await writeFile(config, JSON.stringify(checkedComponents));
        const common = ['--model', 'checked-components-v1', '--wsdl-source', source, '--checked-config', config];
        const http = ['--openapi-file', openapi, '--gateway-version-prefix', 'v1', '--gateway-service-name', 'mapping'];
        await run('standalone CLI client and planner', [...permissions, cli, 'client', ...common, '--client-dir', client, '--checked-report', report], tooling);
        expect(JSON.parse(await readFile(report, 'utf8'))).toMatchObject({ready: true, executed: false,
          streams: [{selector, format, scope: 'full-response', path: [{namespace, local: 'ReadResponse'}, {namespace, local: 'Record'}]}]});
        await run('standalone CLI OpenAPI', [...permissions, cli, 'openapi', ...common, ...http], tooling);
        await run('standalone CLI gateway', [...permissions, cli, 'gateway', ...common, ...http, '--client-dir', client, '--gateway-dir', gateway], tooling);
        await run('standalone CLI app', [...permissions, cli, 'app', ...common, ...http, '--client-dir', client, '--gateway-dir', gateway, '--app-dir', app], tooling);
      } else {
        await run('installed public API pipeline', [...permissions, '--input-type=module', '-e',
          'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client"; await runGenerationPipeline(JSON.parse(process.argv[1]));',
          JSON.stringify({model: 'checked-components-v1', wsdl: source, checkedComponents, clientOutDir: client,
            openapi: {outFile: openapi}, gateway: {outDir: gateway, versionSlug: 'v1', serviceSlug: 'mapping'}, app: {appDir: app}})], tooling);
      }
      const document = JSON.parse(await readFile(openapi, 'utf8')) as {paths: Record<string, {post: Record<string, unknown>}>};
      expect(document.paths['/v1/mapping/Read']?.post).toMatchObject({
        'x-wsdl-tsc-stream': {format, scope: 'full-response', itemSchema: expect.any(Object)},
        responses: {'200': {content: {[format === 'ndjson' ? 'application/x-ndjson' : 'application/json']: expect.any(Object)}}},
      });
      await copyFile(path.join(checkout, 'test/fixtures/wsdl/stream-mapping-wire/consumer.ts'), path.join(app, 'qualification.ts'));
    }
    const controls = path.join(project, 'ndjson');
    const buffered = [cli, 'client', '--model', 'checked-components-v1', '--wsdl-source', source];
    await run('generate a buffered capsule over the same source', [...permissions, ...buffered, '--client-dir', path.join(controls, 'buffered-client')], tooling);
    const baseline = process.env.WSDL_CHECKED_STREAM_BASELINE_ARCHIVE;
    if (baseline) {
      stage = 'verify frozen-client baseline archive';
      expect(createHash('sha256').update(await readFile(baseline)).digest('hex'))
        .toBe('185c22f836a2dc1bd2255047713c96a6f9641f1800ffb8accee6e77655210350');
      const frozenTooling = path.join(temporary, 'published');
      await mkdir(frozenTooling);
      await writeFile(path.join(frozenTooling, 'package.json'), '{"private":true,"type":"module"}\n');
      await run('install checksum-pinned published baseline', [npm, 'install', '--no-audit', '--no-fund', '--ignore-scripts', baseline], frozenTooling);
      const frozenCli = path.join(frozenTooling, 'node_modules/@techspokes/typescript-wsdl-client/dist/cli.js');
      await run('generate the frozen published buffered client', [...permissions, frozenCli, ...buffered.slice(1),
        '--client-dir', path.join(controls, 'frozen-client')], frozenTooling);
    }

    const fixtureDir = path.join(checkout, 'test/conformance/fixtures/xsd/standard-schema-element');
    const outer = path.join(project, 'wrapper.wsdl'), companion = path.join(project, 'records.wsdl');
    await copyFile(path.join(fixtureDir, 'wrapper.wsdl'), outer);
    await copyFile(path.join(fixtureDir, 'records.wsdl'), companion);
    const name = (local: string) => ({namespace: 'urn:owned:wrapper', local});
    const wrapperSelector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
    const recordSelector = {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'};
    const companionApp = path.join(project, 'companion');
    await run('installed public API companion generation', [...permissions, '--input-type=module', '-e',
      'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client"; await runGenerationPipeline(JSON.parse(process.argv[1]));',
      JSON.stringify({model: 'checked-components-v1', wsdl: outer, clientOutDir: path.join(companionApp, 'client'),
        checkedComponents: {streams: [{selector: wrapperSelector, path: ['Envelope', 'Envelope', 'Records', 'Record'], format: 'ndjson'}],
          recordProjections: [{selector: wrapperSelector, source: companion, recordSelector, scope: 'records-with-declared-wrapper-scope'}]},
        openapi: {outFile: path.join(companionApp, 'openapi.json')}, gateway: {outDir: path.join(companionApp, 'gateway'), versionSlug: 'v1', serviceSlug: 'mapping'},
        app: {appDir: companionApp}})], tooling);
    await copyFile(path.join(checkout, 'test/fixtures/wsdl/stream-mapping-wire/companion.ts'), path.join(companionApp, 'qualification.ts'));
    await copyFile(path.join(project, 'ndjson/package.json'), path.join(project, 'package.json'));
    await run('install consumer dependencies from the same archive', [npm, 'install', '--no-audit', '--no-fund', '--ignore-scripts', tarball]);
    for (const format of [...formats, 'companion']) {
      await run('strict build ' + format, [path.join('node_modules', 'typescript', 'bin', 'tsc'), '-p', format]);
    }
    await run('remove consumer development dependencies', [npm, 'prune', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund']);
    const relocated = path.join(temporary, 'relocated');
    await rename(project, relocated);
    const receipts = [];
    const net = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net'] : [];
    for (const format of formats) {
      const result = await run('relocated socket qualification ' + format, ['--permission', ...net, '--allow-fs-read=' + relocated,
        path.join(format, 'dist/qualification.js'), fixture, format, path.join(relocated, 'stream-mapping.wsdl'),
        baseline ? 'frozen' : ''], relocated);
      const receipt: unknown = JSON.parse(result.stdout.trim());
      expect(receipt).toMatchObject({format, originalCheckoutReadable: false, firstBeforeUpstreamRelease: true, dispatches: 9 + Number(!!baseline),
        rejectedDispatches: 0, complete: {kind: 'complete', records: 1}, lateOutcome: {kind: 'xml-invalid'},
        truncatedOutcome: {kind: 'transport'}, cancelledOutcome: {kind: 'cancelled'}, lateHttpAborted: true,
        backpressure: {stableWhilePaused: true, producerReleased: true},
        ...(baseline ? {frozenKind: 'soap-response'} : {})});
      receipts.push(receipt);
    }
    const scoped = await run('relocated socket qualification companion', ['--permission', ...net, '--allow-fs-read=' + relocated,
      'companion/dist/qualification.js', fixture], relocated);
    const scopedReceipt: unknown = JSON.parse(scoped.stdout.trim());
    expect(scopedReceipt).toMatchObject({scope: 'records-with-declared-wrapper-scope', originalCheckoutReadable: false,
      firstBeforeUpstreamRelease: true, cleanEof: true, emptyHttp: 200, wrongWrapperHttp: 502, dispatches: 3});
    receipts.push(scopedReceipt);
    const receipt = {tree, treeClean, archiveSha256: archive, sourceSha256: sourceDigest, node: process.version, platform: process.platform, receipts};
    const evidence = process.env.WSDL_CHECKED_STREAM_EVIDENCE_DIR;
    if (evidence) {
      stage = 'retain installed candidate archive and wire receipt';
      await mkdir(evidence, {recursive: true});
      await copyFile(tarball, path.join(evidence, 'candidate.tgz'), constants.COPYFILE_EXCL);
      await writeFile(path.join(evidence, 'checked-streaming.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    }
    console.info('[checked streaming receipt] ' + JSON.stringify(receipt));
  } catch (error) {
    throw new Error('Installed checked streaming failed during ' + stage, {cause: error});
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
});
