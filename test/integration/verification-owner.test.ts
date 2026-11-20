import {it, expect} from 'vitest';
import {mkdtemp, mkdir, writeFile, readFile, rename, rm, access, readdir, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

it('cleans the delivery workspace after success, nonzero exit and cancellation', async context => {
  const root = await mkdtemp(path.join(tmpdir(), 'wsdl-verification-owner-'));
  const runner = path.resolve('scripts/run-verification.ts');
  const tsx = import.meta.resolve('tsx');
  const control = path.join(root, 'ready.json');
  const cache = path.join(root, 'tmp/cache');
  const asset = path.join(root, 'dist/assets/release.zip');
  const base = path.join(root, 'tmp/verification');
  const outside = path.join(root, 'protected');
  const pending: Promise<number>[] = [];
  const transcript: string[] = [];
  context.onTestFinished(async () => {
    await Promise.allSettled(pending);
    await rm(root, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  }, 60_000);

  for (const directory of [cache, path.dirname(asset), outside]) await mkdir(directory, {recursive: true});
  await writeFile(path.join(cache, 'keep'), 'cache');
  await writeFile(path.join(outside, 'keep'), 'protected');
  await writeFile(asset, 'release');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({private: true, type: 'module', scripts: {'ci:run': 'node fixture.ts'}}));
  await writeFile(path.join(root, 'fixture.ts'), `import {writeFileSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import path from 'node:path';
const run = process.env.WSDL_TEST_RUN_DIR;
symlinkSync(path.resolve('protected'), path.join(run, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
writeFileSync('dist/owned.js', '');
writeFileSync(path.join(tmpdir(), 'outside-scratch.txt'), '');
const nested = process.env.PROBE_MODE === 'hold' || process.env.PROBE_MODE === 'kill-npm'
  ? spawn(process.execPath, ['-e', "const server = require('node:http').createServer((_req, res) => res.end('owned verification fixture')); server.listen(0, '127.0.0.1', () => console.log(server.address().port));"], {
    detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'inherit'],
  })
  : undefined;
const port = nested ? Number(await new Promise(resolve => nested.stdout.once('data', resolve))) : undefined;
writeFileSync('ready.json', JSON.stringify({port, nested: nested?.pid, name: path.basename(run), external: tmpdir()}));
if (nested) setInterval(() => {}, 1000);
else if (process.env.PROBE_MODE === 'fail') process.exitCode = 23;
else if (process.env.PROBE_MODE === 'retain-external') {
  writeFileSync(path.join(run, 'external-recovery-required'), tmpdir());
  process.exitCode = 23;
}
`);
  await writeFile(path.join(root, 'entry.ts'), `import {existsSync} from 'node:fs';
const timer = setInterval(() => {if (existsSync('cancel')) {clearInterval(timer); process.emit('SIGINT');}}, 25);
try {await import(${JSON.stringify(pathToFileURL(runner).href)});} finally {clearInterval(timer);}
`);
  const launch = (mode: string, args = ['ci:run']) => {
    const result = runOwnedNode(['--import', tsx, path.join(root, 'entry.ts'), ...args], {
      cwd: root, timeoutMs: 25_000, signal: context.signal, env: {...process.env, PROBE_MODE: mode},
      onOutput: text => transcript.push(text),
    }).then(() => 0, (error: Error & {exitCode?: number}) => {
      if (error.exitCode === undefined) throw error;
      return error.exitCode;
    });
    pending.push(result);
    return result;
  };
  const expectClean = async () => {
    expect(await readdir(base), transcript.join('')).toEqual([]);
    await expect(access(path.join(root, 'dist/owned.js'))).rejects.toMatchObject({code: 'ENOENT'});
    expect(await readFile(asset, 'utf8')).toBe('release');
    expect(await readFile(path.join(cache, 'keep'), 'utf8')).toBe('cache');
    expect(await readFile(path.join(outside, 'keep'), 'utf8')).toBe('protected');
    const {external} = JSON.parse(await readFile(control, 'utf8')) as {external: string};
    await expect(access(external)).rejects.toMatchObject({code: 'ENOENT'});
  };
  expect(await launch('success')).toBe(0);
  await expectClean();
  expect(await launch('fail')).toBe(23);
  await expectClean();
  expect(await launch('retain-external')).toBe(23);
  const retained = JSON.parse(await readFile(control, 'utf8')) as {name: string; external: string};
  expect(await readFile(path.join(retained.external, 'outside-scratch.txt'), 'utf8')).toBe('');
  expect(await readFile(path.join(base, retained.name, 'external-recovery-required'), 'utf8')).toBe(retained.external);
  expect(await launch('success', ['recover', retained.name])).toBe(0);
  await expectClean();

  const modes = process.platform === 'win32' ? ['hold'] : ['hold', 'kill-npm'];
  for (const mode of modes) {
    await rm(control);
    const active = launch(mode);
    let listener: {port: number; nested: number} | undefined;
    try {
      const readControl = () => readFile(control, 'utf8').then(text => JSON.parse(text) as {port: number; nested: number; name: string});
      let ready: Awaited<ReturnType<typeof readControl>> | undefined;
      for (let attempt = 0; !ready && attempt < 100; attempt++) {
        ready = await readControl().catch(() => undefined);
        if (!ready) await delay(50);
      }
      if (!ready) throw new Error('The nested verification listener did not start: ' + transcript.join(''));
      listener = ready;
      const endpoint = `http://127.0.0.1:${ready.port}`;
      expect(await (await fetch(endpoint, {signal: AbortSignal.timeout(2000)})).text()).toBe('owned verification fixture');
      if (mode === 'hold') {
        expect(await launch('success')).toBe(1);
        expect(await launch('success', ['recover', ready.name])).toBe(1);
        await writeFile(path.join(root, 'cancel'), '');
        expect(await active).toBe(130);
      } else {
        const pid = Number(await readFile(path.join(base, ready.name, 'child'), 'utf8'));
        process.kill(pid, 'SIGKILL');
        expect(await active).toBe(1);
      }
      await expect(fetch(endpoint, {signal: AbortSignal.timeout(2000)})).rejects.toThrow();
      await expectClean();
    } finally {
      await writeFile(path.join(root, 'cancel'), '');
      await active.catch(() => undefined);
      await rm(path.join(root, 'cancel'));
      if (listener) {
        const response = await fetch(`http://127.0.0.1:${listener.port}`, {signal: AbortSignal.timeout(1000)}).catch(() => undefined);
        if (response && await response.text() === 'owned verification fixture') process.kill(listener.nested, 'SIGKILL');
      }
    }
  }

  // @why Assemble a stopped owner's on-disk state without leaving a live orphan during the test.
  const stale = 'run-Xy12ab';
  const abandoned = path.join(base, stale);
  const oldOwner = await runOwnedNode(['-e', 'console.log(process.pid)'], {cwd: root, timeoutMs: 5000});
  await symlink(outside, abandoned, process.platform === 'win32' ? 'junction' : 'dir');
  expect(await launch('success', ['recover', stale])).toBe(1);
  await rm(abandoned);
  await mkdir(abandoned);
  await writeFile(path.join(abandoned, 'owner'), oldOwner.stdout.trim());
  await writeFile(path.join(abandoned, 'child'), String(process.pid));
  expect(await launch('success', ['recover', stale])).toBe(1);
  await rm(path.join(abandoned, 'child'));
  await rename(path.join(root, 'dist'), path.join(abandoned, 'previous-dist'));
  expect(await launch('success', ['recover', stale])).toBe(1);
  expect(await readFile(path.join(abandoned, 'previous-dist/assets/release.zip'), 'utf8')).toBe('release');
  await writeFile(path.join(base, 'build-owner'), stale);
  await mkdir(path.join(root, 'dist'));
  await writeFile(path.join(root, 'dist/.verification-owner'), stale);
  await writeFile(path.join(root, 'dist/owned.js'), '');
  expect(await launch('success', ['recover', stale])).toBe(0);
  await expectClean();
}, 120_000);
