import {it, expect} from 'vitest';
import {mkdtemp, mkdir, writeFile, readFile, rm, access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {runOwnedNode} from '../helpers/ownedNodeProcess.js';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

it('refuses a competing owner and releases ownership after success, failure and cancellation', async context => {
  const base = path.resolve('tmp/conformance/verification-owner');
  await mkdir(base, {recursive: true});
  const root = await mkdtemp(path.join(base, 'case-'));
  const runner = path.resolve('scripts/run-verification.ts');
  const lock = path.join(root, 'tmp/conformance/verification/active.json');
  execFileSync('git', ['init', '--quiet', root], {windowsHide: true});
  await writeFile(path.join(root, 'package.json'), JSON.stringify({private: true, type: 'module', scripts: {'test:run': 'node fixture.ts'}}));
  await writeFile(path.join(root, 'fixture.ts'), `import {writeFileSync} from 'node:fs';
writeFileSync('ready', String(process.pid));
if (process.env.PROBE_MODE === 'hold') setInterval(() => {}, 1000);
else process.exitCode = process.env.PROBE_MODE === 'fail' ? 1 : 0;
`);
  await writeFile(path.join(root, 'entry.ts'), `import {existsSync} from 'node:fs';
const timer = setInterval(() => {if (existsSync('cancel')) {clearInterval(timer); process.emit('SIGINT');}}, 50);
process.argv = [process.execPath, ${JSON.stringify(runner)}, 'test:run'];
try {await import(${JSON.stringify(pathToFileURL(runner).href)});} finally {clearInterval(timer);}
`);
  const pending: Promise<boolean>[] = [];
  const start = (mode: string) => {
    let output = '';
    const done = runOwnedNode(['--import', 'tsx', path.join(root, 'entry.ts')], {cwd: root,
      timeoutMs: 20_000, signal: context.signal, env: {...process.env, PROBE_MODE: mode},
      onOutput: chunk => {output += chunk;}}).then(() => true, error => {output += String(error); return false;});
    pending.push(done);
    return {done, output: () => output};
  };
  context.onTestFinished(async () => {await Promise.all(pending);}, 60_000);
  try {
    for (const mode of ['success', 'fail']) {
      const run = start(mode);
      expect(await run.done, run.output()).toBe(mode === 'success');
      await expect(access(lock)).rejects.toMatchObject({code: 'ENOENT'});
    }
    await rm(path.join(root, 'ready'));
    const owner = start('hold');
    try {
      for (let n = 0; ; n++) {
        if (await access(path.join(root, 'ready')).then(() => true, () => false)) break;
        if (n === 100) throw new Error('Probe did not become ready: ' + owner.output());
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      const competitor = start('success');
      expect(await competitor.done, competitor.output()).toBe(false);
      expect(competitor.output()).toContain('Verification already running');
      const pid = Number(await readFile(path.join(root, 'ready'), 'utf8'));
      await writeFile(path.join(root, 'cancel'), 'cancel');
      expect(await owner.done, owner.output()).toBe(false);
      await expect(access(lock)).rejects.toMatchObject({code: 'ENOENT'});
      expect(() => process.kill(pid, 0)).toThrow();
    } finally {await writeFile(path.join(root, 'cancel'), 'cancel'); await owner.done;}
  } finally {await Promise.all(pending); await rm(root, {recursive: true, force: true});}
}, 120_000);
