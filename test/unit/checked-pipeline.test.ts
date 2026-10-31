import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {runGenerationPipeline, type PipelineOptions} from '../../src/index.js';
import {parseCheckedDirectOptions} from '../../src/checkedPipeline.js';

const namespace = 'urn:checked:forecast';
const roots: string[] = [];
afterEach(() => {for (const root of roots.splice(0)) fs.rmSync(root, {recursive: true, force: true});});
function options(): PipelineOptions {
  fs.mkdirSync('tmp/test-generation', {recursive: true});
  const root = fs.mkdtempSync(path.resolve('tmp/test-generation/checked-pipeline-'));
  roots.push(root);
  const wsdl = path.join(root, 'input.wsdl');
  fs.copyFileSync('test/conformance/fixtures/assessment/forecast.wsdl', wsdl);
  return {model: 'checked-direct-v1', wsdl,
    checkedDirect: {selector: {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'},
      service: {namespace, local: 'ForecastService'}, port: 'ForecastPort', fileRoots: [root]},
    clientOutDir: path.join(root, 'project/client'), openapi: {outFile: path.join(root, 'project/openapi.json')},
    gateway: {outDir: path.join(root, 'project/gateway'), versionSlug: 'v1', serviceSlug: 'forecast'},
    app: {appDir: path.join(root, 'project')}, test: {testDir: path.join(root, 'project/test')}};
}

describe('public checked pipeline selection', () => {
  it('bundles the unchanged independent Forecast source for installed examples', () => {
    expect(fs.readFileSync('docs/examples/checked-forecast.wsdl')).toEqual(fs.readFileSync('test/conformance/fixtures/assessment/forecast.wsdl'));
  });
  it('generates from native source and inventories unselected operations without a legacy catalog', async () => {
    const opts = options();
    const source = fs.readFileSync(opts.wsdl, 'utf8').replace('</wsdl:portType>',
      '<wsdl:operation name="Other"><wsdl:input message="t:ForecastInput"/><wsdl:output message="t:ForecastOutput"/></wsdl:operation></wsdl:portType>');
    fs.writeFileSync(opts.wsdl, source);
    const result = await runGenerationPipeline(opts);
    expect(result.compiled).toBeUndefined();
    expect(result.checked?.operations).toEqual([
      expect.objectContaining({operation: 'GetForecast', requested: true, generated: true, executed: false, status: 'generated'}),
      expect.objectContaining({operation: 'Other', requested: false, generated: false, executed: false, status: 'unselected-not-assessed'}),
    ]);
    expect(fs.readFileSync(path.join(opts.clientOutDir!, 'source.wsdl'), 'utf8')).toBe(source);
    expect(fs.existsSync(path.join(opts.clientOutDir!, 'catalog.json'))).toBe(false);
    const client = fs.readFileSync(path.join(opts.clientOutDir!, 'client.ts'), 'utf8');
    const gateway = fs.readFileSync(path.join(opts.gateway!.outDir, 'plugin.ts'), 'utf8');
    await runGenerationPipeline(opts);
    expect(fs.readFileSync(path.join(opts.clientOutDir!, 'client.ts'), 'utf8')).toBe(client);
    expect(fs.readFileSync(path.join(opts.gateway!.outDir, 'plugin.ts'), 'utf8')).toBe(gateway);
  });

  it('refuses an unsupported requested operation without emitting a partial success', async () => {
    const opts = options();
    fs.writeFileSync(opts.wsdl, fs.readFileSync(opts.wsdl, 'utf8').replace('style="document"', 'style="rpc"'));
    await expect(runGenerationPipeline(opts)).rejects.toThrow(/GetForecast refused: unsupported/);
    expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
  });

  it('retains source permission and cancellation before output', async () => {
    const opts = options();
    await expect(runGenerationPipeline({...opts, checkedDirect: {...opts.checkedDirect!, fileRoots: [path.join(roots.at(-1)!, 'unrelated')]}}))
      .rejects.toThrow(/refused/);
    const controller = new AbortController(); controller.abort();
    await expect(runGenerationPipeline({...opts, checkedDirect: {...opts.checkedDirect!, signal: controller.signal}}))
      .rejects.toThrow(/cancelled/);
    expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
  });

  it('requires explicit selection and rejects unknown or unsupported controls', async () => {
    const opts = options();
    expect(() => parseCheckedDirectOptions({...opts.checkedDirect, operations: ['GetForecast', 'Other']})).toThrow('unsupported fields');
    expect(() => parseCheckedDirectOptions({...opts.checkedDirect, fileRoots: []})).toThrow('source roots');
    await expect(runGenerationPipeline({...opts, model: 'legacy'})).rejects.toThrow('Explicit model');
    await expect(runGenerationPipeline({...opts, compiler: {choice: 'union'}})).rejects.toThrow('legacy compiler');
    await expect(runGenerationPipeline({...opts, openapi: {...opts.openapi!, flattenArrayWrappers: false}})).rejects.toThrow('stage control');
    await expect(runGenerationPipeline({...opts, gateway: {...opts.gateway!, stubHandlers: true}})).rejects.toThrow('stage control');
    expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
  });

  it('refuses overlapping or nonportable project paths before writes', async () => {
    const opts = options();
    await expect(runGenerationPipeline({...opts, clientOutDir: opts.app!.appDir})).rejects.toThrow('within appDir');
    await expect(runGenerationPipeline({...opts, openapi: {outFile: path.join(opts.clientOutDir!, 'openapi.json')}})).rejects.toThrow('not overlap');
    expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
  });

  it('refuses scaffold and build-directory collisions before artifact emission', async () => {
    const opts = options();
    for (const name of ['server.ts', 'package.json', 'tsconfig.json', 'checked-gateway.example.json', 'dist/openapi.json', 'node_modules/spec.json']) {
      await expect(runGenerationPipeline({...opts, openapi: {outFile: path.join(opts.app!.appDir, name)}})).rejects.toThrow('scaffold files');
      expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
    }
    await expect(runGenerationPipeline({...opts, gateway: {...opts.gateway!, outDir: path.join(opts.app!.appDir, 'server.ts/nested')}}))
      .rejects.toThrow('scaffold files');
    expect(fs.existsSync(opts.clientOutDir!)).toBe(false);
  });
});
