import {expect} from 'vitest';
import {mkdtemp, mkdir, readFile, writeFile, appendFile, copyFile, rm, readdir, rename} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:https';
import type {Server} from 'node:https';
import {once} from 'node:events';
import {SaxesParser} from 'saxes';
import {runOwnedNode} from './ownedNodeProcess.js';
import type {InstalledIntakeTooling} from './installedIntakeTooling.js';
import type {CheckedComponentPlan} from '../../src/index.js';

export async function qualifyUrlIntakeInstalled(shared: InstalledIntakeTooling, signal: AbortSignal): Promise<void> {
  const npm = process.env.npm_execpath; if (!npm) throw new Error('Run installed qualification through npm');
  const checkout = process.cwd(), evidence = path.resolve('tmp/conformance/w2-intake'); await mkdir(evidence, {recursive: true});
  const logs = await mkdtemp(path.join(evidence, 'run-')), consumer = path.join(shared.root, 'url'); await mkdir(consumer);
  const certFile = path.resolve('test/conformance/fixtures/soap/content-model/test-cert.pem');
  const cert = await readFile(certFile), key = await readFile('test/conformance/fixtures/soap/content-model/test-key.pem');
  const env = {...process.env, NODE_OPTIONS: '--use-system-ca', NODE_EXTRA_CA_CERTS: certFile, npm_config_cache: path.resolve('tmp/cache/npm'), VITEST_MAX_WORKERS: '1'};
  const run = async (label: string, args: string[], cwd: string) => {
    const start = performance.now();
    try {
      const result = await runOwnedNode(args, {cwd, env, signal: signal, timeoutMs: 240_000, maxBuffer: 8 * 1024 * 1024});
      await writeFile(path.join(logs, label + '.log'), result.stdout + result.stderr);
      await appendFile(path.join(logs, 'timing.ndjson'), JSON.stringify({label, ms: Math.round(performance.now() - start), result: 'passed'}) + '\n'); return result;
    } catch (error) {
      const failure = error as Error & {stdout?: string; stderr?: string};
      await writeFile(path.join(logs, label + '-failure.log'), failure.message + '\n' + (failure.stdout ?? '') + (failure.stderr ?? ''));
      await appendFile(path.join(logs, 'timing.ndjson'), JSON.stringify({label, ms: Math.round(performance.now() - start), result: 'refused-or-failed'}) + '\n'); throw error;
    }
  };
  const calls: string[] = [], metadata: string[] = [], failures: string[] = [];
  const soap = createServer({cert, key}, async (req, res) => {
    let body = ''; for await (const chunk of req) body += String(chunk);
    calls.push(req.url!);
    const names: string[] = [], texts: string[] = [];
    try {
      const parser = new SaxesParser({xmlns: true});
      parser.on('opentag', tag => names.push(`{${tag.uri}}${tag.local}`));
      parser.on('text', text => {if (text.trim()) texts.push(text);});
      parser.write(body).close();
      const expected = ['{http://schemas.xmlsoap.org/soap/envelope/}Envelope', '{http://schemas.xmlsoap.org/soap/envelope/}Body',
        '{urn:conformance:import-relative-types}SubmitImported', '{urn:conformance:import-relative-types}payload', '{urn:conformance:import-relative-types:types}name'];
      if (req.method !== 'POST' || req.headers.soapaction !== '"urn:SubmitImported"' || JSON.stringify(names) !== JSON.stringify(expected)
        || JSON.stringify(texts) !== JSON.stringify(['owned & independent'])) failures.push('Independent SOAP namespace/order/text/action mismatch');
    } catch {failures.push('Malformed SOAP request');}
    res.writeHead(200, {'Content-Type': 'text/xml'});
    res.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><r:SubmitImportedResponse xmlns:r="urn:conformance:import-relative-types"><r:accepted>1</r:accepted></r:SubmitImportedResponse></s:Body></s:Envelope>');
  });
  const documents = new Map<string, string>();
  let secondOrigin = '', cross = false;
  const serve = (second: boolean) => createServer({cert, key}, (req, res) => {
    metadata.push((second ? 'second:' : 'first:') + req.url);
    if (!second && req.url === '/start') {res.writeHead(302, {Location: '/entry/root.wsdl'}); res.end(); return;}
    if (!second && req.url === '/entry/schemas/types?xsd=0') {res.writeHead(307, {Location: cross ? secondOrigin + '/model/types?xsd=0' : '/model/types?xsd=0'}); res.end(); return;}
    const text = documents.get(req.url!); res.writeHead(text === undefined ? 404 : 200, {'Content-Type': 'text/xml'}); res.end(text ?? '');
  });
  const first = serve(false), second = serve(true);
  const listen = async (server: Server) => {server.listen(0, '127.0.0.1'); await once(server, 'listening'); const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Owned listener missing'); return `https://127.0.0.1:${addr.port}`;};
  const stop = async (server: Server) => {server.closeAllConnections(); if (server.listening) {const closed = once(server, 'close'); server.close(); await closed;}};
  try {
    const endpoint = await listen(soap), origin = await listen(first); secondOrigin = await listen(second);
    const fixture = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8');
    const schema = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd', 'utf8');
    const definitions = fixture.replace(/<wsdl:service[\s\S]*?<\/wsdl:service>/, '').replace('import-relative-types-types.xsd', 'schemas/types?xsd=0');
    documents.set('/entry/defs.wsdl', definitions);
    documents.set('/entry/root.wsdl', `<w:definitions xmlns:w="http://schemas.xmlsoap.org/wsdl/" xmlns:s="http://schemas.xmlsoap.org/wsdl/soap/" xmlns:p="urn:conformance:import-relative-types" targetNamespace="urn:owned:w2"><w:import namespace="urn:conformance:import-relative-types" location="defs.wsdl"/><w:service name="Entry"><w:port name="Port" binding="p:ImportBinding"><s:address location="${endpoint}/declared"/></w:port></w:service></w:definitions>`);
    documents.set('/model/types?xsd=0', schema.replace('<xs:complexType', '<xs:include schemaLocation="nested/leaf?xsd=1"/><xs:include schemaLocation="nested/leaf?xsd=2"/><xs:complexType'));
    for (const query of [1, 2]) documents.set('/model/nested/leaf?xsd=' + query,
      `<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:conformance:import-relative-types:types"><xs:include schemaLocation="common?shared=1"/><xs:simpleType name="Unused${query}"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema>`);
    documents.set('/model/nested/common?shared=1', '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema" targetNamespace="urn:conformance:import-relative-types:types"><xs:simpleType name="Shared"><xs:restriction base="xs:string"/></xs:simpleType></xs:schema>');
    const {tooling, tarball, cli} = shared;
    const api = ['--input-type=module', '-e', 'import {planCheckedComponents} from "@techspokes/typescript-wsdl-client"; console.log(JSON.stringify(await planCheckedComponents(process.argv[1],JSON.parse(process.argv[2]))));'];
    const plan = async (label: string, choices = {}, source = origin + '/start') => JSON.parse((await run(label, [...api, source, JSON.stringify(choices)], tooling)).stdout) as CheckedComponentPlan;
    const metadataBefore = metadata.length;
    expect((await plan('same-origin')).ready).toBe(true);
    const acquired = metadata.slice(metadataBefore);
    for (const resource of ['/model/nested/leaf?xsd=1', '/model/nested/leaf?xsd=2', '/model/nested/common?shared=1'])
      expect(acquired.filter(request => request === 'first:' + resource)).toHaveLength(1);
    cross = true;
    const secondBefore = metadata.filter(m => m.startsWith('second:')).length;
    expect((await plan('denied-cross')).blockers[0]?.category).toBe('permission');
    expect(metadata.filter(m => m.startsWith('second:'))).toHaveLength(secondBefore);
    expect((await plan('explicit-empty-origins', {sourceOrigins: []})).blockers[0]?.category).toBe('permission');
    const choices = {sourceOrigins: [secondOrigin]};
    expect((await plan('allowed-cross', choices)).ready).toBe(true);
    expect((await plan('remote-empty-snapshots', {...choices, sourceResources: []})).ready).toBe(false);
    documents.set('/entry/defs.wsdl', definitions.replace(' schemaLocation="schemas/types?xsd=0"', ''));
    const missing = await plan('missing-location', choices); expect(missing.blockers[0]?.reason).toContain('locationless-import');
    const recovery = missing.resolution!.configuration;
    await writeFile(path.join(logs, 'before.json'), JSON.stringify(recovery, null, 2));
    const resolved = {...recovery, namespaceLocations: [{namespace: 'urn:conformance:import-relative-types:types', location: secondOrigin + '/model/types?xsd=0'}]};
    expect((await plan('resolved-location', resolved)).ready).toBe(true);
    await writeFile(path.join(logs, 'after.json'), JSON.stringify(resolved, null, 2));
    documents.set('/entry/defs.wsdl', definitions);
    for (const mode of ['cli', 'api', 'recovery']) {
      cross = mode !== 'cli';
      documents.set('/entry/defs.wsdl', mode === 'recovery' ? definitions.replace(' schemaLocation="schemas/types?xsd=0"', '') : definitions);
      const project = path.join(consumer, mode);
      const opts = {model: 'checked-components-v1', wsdl: origin + '/start', checkedComponents: mode === 'recovery' ? resolved : mode === 'api' ? choices : undefined, clientOutDir: path.join(project, 'client'),
        openapi: {outFile: path.join(project, 'openapi.json')}, gateway: {outDir: path.join(project, 'gateway'), versionSlug: 'v1', serviceSlug: 'import'}, app: {appDir: project}, test: {testDir: path.join(project, 'test')}};
      const args = mode === 'cli' ? [cli, 'pipeline', '--model', opts.model, '--wsdl-source', opts.wsdl,
        '--client-dir', opts.clientOutDir, '--openapi-file', opts.openapi.outFile, '--gateway-dir', opts.gateway.outDir, '--gateway-version-prefix', 'v1', '--gateway-service-name', 'import', '--init-app', '--app-dir', project, '--test-dir', opts.test.testDir]
        : ['--input-type=module', '-e', 'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client"; await runGenerationPipeline(JSON.parse(process.argv[1]));', JSON.stringify(opts)];
      await run(mode + '-generate', args, tooling); expect(calls).toHaveLength(0);
      await writeFile(path.join(logs, mode + '-artifacts.json'), JSON.stringify((await readdir(project, {recursive: true})).sort(), null, 2));
      for (const file of ['inventory.json', 'source-resources.json']) await copyFile(path.join(project, 'client', file), path.join(logs, mode + '-' + file));
      await run(mode + '-install', [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], project);
      for (const command of ['typecheck', 'test', 'build']) await run(mode + '-' + command, [npm, 'run', command], project);
      expect(calls).toHaveLength(0);
      await copyFile(certFile, path.join(project, 'test-cert.pem'));
      await copyFile('test/helpers/urlIntakeInstalledProcess.ts', path.join(project, 'wire.ts'));
      await copyFile('test/helpers/ownedParentGuard.ts', path.join(project, 'parent-guard.ts'));
    }
    await stop(first); await stop(second);
    for (const mode of ['cli', 'api', 'recovery']) {
      const project = path.join(consumer, mode + '-relocated'); await rename(path.join(consumer, mode), project);
      const before = calls.length;
      const result = await run(mode + '-offline-wire', ['--permission', '--allow-child-process', '--allow-fs-read=' + project, '--allow-fs-write=' + project,
        path.join(project, 'wire.ts'), endpoint + '/override', path.join(checkout, 'package.json')], project);
      expect(JSON.parse(result.stdout)).toMatchObject({exchanges: 4, offlineMetadata: true});
      expect(calls.slice(before)).toEqual(['/declared', '/override', '/override', '/declared']);
    }
    expect(failures).toEqual([]);
    await writeFile(path.join(logs, 'result.json'), JSON.stringify({status: 'passed', projects: 3, resourcesPerProject: 6, operationsPerProject: 1, exchanges: calls, metadata, failures}, null, 2));
  } finally {await stop(first); await stop(second); await stop(soap); await rm(consumer, {recursive: true, force: true, maxRetries: 10, retryDelay: 200});}
}
