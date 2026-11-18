import {mkdtemp, readFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {expect, it} from 'vitest';
import {runGenerationPipeline} from '../../src/pipeline.js';

it('regenerates byte-identical Weather artifacts at the same output path', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wsdl-repeat-'));
  const out = path.join(root, 'output');
  const generate = async () => {
    await runGenerationPipeline({
      wsdl: 'examples/minimal/weather.wsdl',
      catalogOut: path.join(out, 'client/catalog.json'),
      clientOutDir: path.join(out, 'client'),
      openapi: {outFile: path.join(out, 'openapi.json'), format: 'json'},
      gateway: {outDir: path.join(out, 'gateway'), versionSlug: 'v1', serviceSlug: 'weather'},
      test: {testDir: path.join(out, 'tests')},
    });
    const entries = await readdir(out, {recursive: true, withFileTypes: true});
    const files = entries.filter(entry => entry.isFile()).map(entry =>
      path.relative(out, path.join(entry.parentPath, entry.name))).sort();
    return new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(out, file))] as const)));
  };
  try {
    const before = await generate();
    expect(before.size).toBeGreaterThan(0);
    await rm(out, {recursive: true});
    expect(await generate()).toEqual(before);
  } finally {
    await rm(root, {recursive: true, force: true});
  }
});
