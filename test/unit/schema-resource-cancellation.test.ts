import {afterEach, expect, it, vi} from 'vitest';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {SchemaResourceLoader} from '../../src/loader/schemaResources.js';

const boundary = vi.hoisted(() => ({abort: undefined as (() => void) | undefined, streams: 0, closed: false}));
vi.mock('node:fs/promises', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return {...fs, open: async (...args: Parameters<typeof fs.open>) => {
    const file = await fs.open(...args);
    return {
      stat: async () => {const result = await file.stat(); boundary.abort?.(); return result;},
      createReadStream: (options: Parameters<typeof file.createReadStream>[0]) => {
        boundary.streams++; return file.createReadStream(options);
      },
      close: async () => {await file.close(); boundary.closed = true;},
    };
  }};
});

afterEach(() => {boundary.abort = undefined; boundary.streams = 0; boundary.closed = false;});
it('closes a source file when cancellation arrives during its metadata check', async () => {
  await mkdir('tmp/test-generation', {recursive: true});
  const directory = await mkdtemp(path.resolve('tmp/test-generation/source-cancellation-'));
  try {
    const source = path.join(directory, 'source.xsd');
    await writeFile(source, '<schema/>');
    const controller = new AbortController();
    const loader = await SchemaResourceLoader.create({fileRoots: [directory]}, undefined, undefined, undefined, controller.signal);
    boundary.abort = () => controller.abort();
    await expect(loader.fetchResource(source)).rejects.toMatchObject({category: 'transport'});
    expect(boundary.closed).toBe(true);
    expect(boundary.streams).toBe(0);
    expect(loader.metadata).toEqual([]);
  } finally {await rm(directory, {recursive: true, force: true});}
});
