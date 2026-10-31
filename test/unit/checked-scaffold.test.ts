import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {generateCheckedApp} from '../../src/app/generateCheckedApp.js';
import {generateCheckedTests} from '../../src/test/generateCheckedTests.js';
import {runGenerationPipeline} from '../../src/pipeline.js';

const disposable: string[] = [];
afterEach(() => {
  for (const root of disposable.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});
function fixture() {
  const parent = path.resolve('tmp/test-generation');
  fs.mkdirSync(parent, {recursive: true});
  const appDir = fs.mkdtempSync(path.join(parent, 'checked-scaffold-'));
  disposable.push(appDir);
  return {appDir, clientDir: path.join(appDir, 'client'), gatewayDir: path.join(appDir, 'gateway'),
    openapiFile: path.join(appDir, 'openapi.json')};
}

describe('checked app/test scaffold ownership', () => {
  it('preserves every customized consumer file and only overwrites with explicit force', async () => {
    const options = fixture();
    await generateCheckedApp(options);
    const names = ['server.ts', 'package.json', 'tsconfig.json', 'README.md', 'checked-gateway.example.json', '.gitignore'];
    for (const name of names) fs.writeFileSync(path.join(options.appDir, name), 'consumer-owned ' + name);
    await generateCheckedApp(options);
    for (const name of names) expect(fs.readFileSync(path.join(options.appDir, name), 'utf8')).toBe('consumer-owned ' + name);
    await generateCheckedApp({...options, force: true});
    for (const name of names) expect(fs.readFileSync(path.join(options.appDir, name), 'utf8')).not.toBe('consumer-owned ' + name);
    const manifest = JSON.parse(fs.readFileSync(path.join(options.appDir, 'package.json'), 'utf8'));
    expect(manifest.scripts).toMatchObject({typecheck: 'tsc --noEmit', test: 'vitest run', build: 'tsc', start: 'node dist/server.js'});
    expect(manifest.dependencies).toHaveProperty('@techspokes/typescript-wsdl-client');
    const config = JSON.parse(fs.readFileSync(path.join(options.appDir, 'checked-gateway.example.json'), 'utf8'));
    expect(config.allowedEndpoints).toEqual([]);
    expect(config.fileRoots).toEqual(['./client']);
  });

  it('preserves test customizations and distinguishes scaffold checks from independent oracles', async () => {
    const options = fixture();
    const testOptions = {...options, testDir: path.join(options.appDir, 'test'), routePath: '/v1/forecast/GetForecast'};
    await generateCheckedTests(testOptions);
    const file = path.join(testOptions.testDir, 'checked-scaffold.test.ts');
    const original = fs.readFileSync(file, 'utf8');
    expect(original).toContain('independent wire/business oracles are separate');
    expect(original).toContain("allowedEndpoints: []");
    fs.writeFileSync(file, 'consumer test');
    await generateCheckedTests(testOptions);
    expect(fs.readFileSync(file, 'utf8')).toBe('consumer test');
    await generateCheckedTests({...testOptions, force: true});
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('rejects sibling artifact paths rather than producing an incomplete standalone project', async () => {
    const options = fixture();
    await expect(generateCheckedApp({...options, clientDir: path.resolve(options.appDir, '..', 'outside')}))
      .rejects.toThrow('contained in appDir');
  });

  it('executes generated configuration refusal and preserves requested native capabilities', async () => {
    const options = fixture();
    const namespace = 'urn:checked:forecast';
    const wsdl = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
    await runGenerationPipeline({model: 'checked-direct-v1', wsdl,
      checkedDirect: {selector: {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'},
        service: {namespace, local: 'ForecastService'}, port: 'ForecastPort', fileRoots: [path.dirname(wsdl)]},
      clientOutDir: options.clientDir, openapi: {outFile: options.openapiFile},
      gateway: {outDir: options.gatewayDir, versionSlug: 'v1', serviceSlug: 'forecast'}, app: {appDir: options.appDir}});
    // @constraints Unit tests bind the real source runtime; separate installed tests verify the packed package.
    const runtimePackage = path.join(options.appDir, 'node_modules/@techspokes/typescript-wsdl-client');
    fs.mkdirSync(runtimePackage, {recursive: true});
    fs.writeFileSync(path.join(runtimePackage, 'package.json'), JSON.stringify({type: 'module', exports: './index.ts'}));
    fs.writeFileSync(path.join(runtimePackage, 'index.ts'),
      `export {checkedDirectRuntimeV1} from ${JSON.stringify(pathToFileURL(path.resolve('src/client/checkedDirectRuntime.ts')).href)};\n`);
    const {buildServer} = await import(pathToFileURL(path.join(options.appDir, 'server.ts')).href);
    const config = {localSource: path.join(options.clientDir, 'source.wsdl'), fileRoots: [options.clientDir],
      endpoint: 'http://127.0.0.1:1/soap', allowedEndpoints: ['http://127.0.0.1:1/soap']};
    await expect(buildServer({...config, authentication: true})).rejects.toThrow('Unsupported checked gateway configuration field');
    const server = await buildServer({...config, capabilities: ['authentication']});
    try {
      const result = await server.inject({method: 'POST', url: '/v1/forecast/GetForecast', payload: {city: 'Oslo', days: 1}});
      expect(result.json()).toMatchObject({kind: 'unsupported', rule: 'SOAP capability'});
      expect(result.statusCode).not.toBe(200);
    } finally {await server.close();}
  });
});
