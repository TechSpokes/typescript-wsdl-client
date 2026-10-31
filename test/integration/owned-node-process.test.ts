import {describe, expect, it} from 'vitest';
import {mkdir, mkdtemp, readFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';

const fixture = path.resolve('test/helpers/ownedNodeProcessFixture.ts');
describe('qualification command ownership', () => {
  it('retains bounded stdout/stderr and refuses output overflow', async () => {
    expect(await runOwnedNode([fixture, 'success'], {cwd: process.cwd(), timeoutMs: 8000}))
      .toEqual({stdout: 'owned stdout', stderr: 'owned stderr'});
    await expect(runOwnedNode([fixture, 'overflow'], {cwd: process.cwd(), timeoutMs: 8000, maxBuffer: 128}))
      .rejects.toThrow('stdout limit');
  });

  for (const reason of ['cancellation', 'deadline', 'early-exit'] as const) {
    it(`closes an actual descendant HTTP listener after ${reason}`, async context => {
      await mkdir('tmp/test-generation', {recursive: true});
      const directory = await mkdtemp(path.resolve('tmp/test-generation/owned-node-'));
      const marker = path.join(directory, 'listener.json');
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, context.signal]);
      const work = runOwnedNode([fixture, reason === 'early-exit' ? 'early-exit' : 'tree', marker], {cwd: process.cwd(), signal,
        timeoutMs: reason === 'deadline' ? 8000 : 20_000});
      void work.catch(() => undefined);
      let listener: {pid: number; port: number} | undefined;
      try {
        const started = performance.now();
        while (!listener && performance.now() - started < 6000) {
          try {listener = JSON.parse(await readFile(marker, 'utf8')) as {pid: number; port: number};}
          catch {await delay(25);}
        }
        expect(listener, 'owned descendant started before the failure control').toBeDefined();
        if (!listener) throw new Error('Fixture listener did not start');
        const endpoint = `http://127.0.0.1:${listener.port}`;
        expect(await (await fetch(endpoint, {signal: AbortSignal.timeout(2000)})).json())
          .toMatchObject({kind: 'owned-process-fixture', pid: listener.pid, marker});
        if (reason === 'cancellation') controller.abort(new Error('explicit fixture cancellation'));
        await expect(work).rejects.toThrow(reason === 'cancellation' ? 'explicit fixture cancellation'
          : reason === 'deadline' ? 'exceeded 8000ms' : 'Owned command');
        if (reason === 'early-exit') await delay(250);
        await expect(fetch(endpoint, {signal: AbortSignal.timeout(2000)})).rejects.toThrow();
      } finally {
        controller.abort(new Error('fixture cleanup'));
        await work.catch(() => undefined);
        // @constraints Kill a surviving fixture only after its own HTTP response proves this test's ownership.
        if (listener) {
          try {
            const response = await fetch(`http://127.0.0.1:${listener.port}`, {signal: AbortSignal.timeout(1000)});
            const value = await response.json() as {kind?: string; pid?: number; marker?: string};
            if (value.kind === 'owned-process-fixture' && value.pid === listener.pid && value.marker === marker) {
              process.kill(listener.pid, 'SIGKILL');
            }
          } catch { /* The expected closed listener needs no fallback cleanup. */ }
        }
        await rm(directory, {recursive: true, force: true});
      }
    });
  }
});
