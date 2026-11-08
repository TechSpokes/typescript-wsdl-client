import {execFileSync} from 'node:child_process';
import {mkdir, open, readFile, unlink, mkdtemp, writeFile, stat, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {runOwnedNode} from '../test/helpers/ownedNodeProcess.js';

const command = process.argv[2];
if (!command || !['ci:run', 'test:run', 'test:integration:run', 'test:unit:run', 'test:corpus:run', 'test:conformance:run', 'test:installed:run'].includes(command)) throw new Error('Unknown verification command');
const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {encoding: 'utf8', timeout: 5000, windowsHide: true}).trim();
const directory = path.join(path.dirname(common), 'tmp/conformance/verification');
await mkdir(directory, {recursive: true});
const lock = path.join(directory, 'active.json');
// A live owner is authoritative, including owners in another worktree of this repository.
try {
  const owner = JSON.parse(await readFile(lock, 'utf8')) as {pid: number; command: string};
  let alive = true;
  try {process.kill(owner.pid, 0);} catch (error) {if ((error as NodeJS.ErrnoException).code === 'ESRCH') alive = false;}
  if (alive) throw new Error(`Verification already running: ${owner.command} (PID ${owner.pid}). Wait for that run.`);
  throw new Error(`Previous verification owner ${owner.pid} has stopped. Inspect and remove ${lock} before starting a replacement.`);
} catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;}
const handle = await open(lock, 'wx');
await handle.writeFile(JSON.stringify({pid: process.pid, command, cwd: process.cwd()}));
await handle.close();
const controller = new AbortController();
const cancel = () => controller.abort();
process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
try {
  const attempt = await mkdtemp(path.join(directory, 'attempt-'));
  const started = new Date().toISOString();
  await writeFile(path.join(attempt, 'context.json'), JSON.stringify({command, started, cwd: process.cwd()}));
  console.info(`Verification evidence: ${attempt}`);
  const result = await runOwnedNode([process.env.npm_execpath!, 'run', command, '--', ...process.argv.slice(3)], {
    cwd: process.cwd(), signal: controller.signal, timeoutMs: 45 * 60_000, maxBuffer: 64 * 1024 * 1024,
    env: {...process.env, WSDL_TEST_RUN_DIR: attempt}, onOutput: chunk => process.stdout.write(chunk),
  }).then(result => ({...result, passed: true}), (error: Error & {stdout?: string; stderr?: string}) => ({stdout: error.stdout ?? '', stderr: (error.stderr ?? '') + '\n' + error.message, passed: false}));
  await writeFile(path.join(attempt, 'command.log'), result.stdout + result.stderr);
  if (command === 'ci:run') {
    const report = path.resolve('tmp/conformance/product-tests.json');
    const metadata = await stat(report).catch(() => undefined);
    if (metadata && metadata.mtimeMs >= Date.parse(started)) await copyFile(report, path.join(attempt, 'product-tests.json'));
  }
  await writeFile(path.join(attempt, 'result.json'), JSON.stringify({passed: result.passed, finished: new Date().toISOString()}));
  if (!result.passed) process.exitCode = 1;
} finally {
  process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel);
  await unlink(lock);
}
