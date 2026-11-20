import {lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {runOwnedNode} from '../test/helpers/ownedNodeProcess.js';

const commands = new Set([
  'ci:run', 'ci:platform:run', 'test:run', 'test:unit:run', 'test:integration:run', 'test:corpus:run',
  'test:conformance:run', 'test:installed:run', 'test:reference:run', 'smoke:pipeline:run', 'package:smoke:run',
]);
const root = await realpath(process.cwd());
const tmp = path.join(root, 'tmp');
const base = path.join(tmp, 'verification');
const buildOwner = path.join(base, 'build-owner');
const dist = path.join(root, 'dist');
const systemTemp = await realpath(tmpdir());

async function inspect(file: string) {
  return lstat(file).catch(error => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
}

async function plainDirectory(directory: string, create = false): Promise<void> {
  if (create) {
    await mkdir(directory).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
  }
  if (!(await inspect(directory))?.isDirectory() || path.relative(directory, await realpath(directory)) !== '') {
    throw new Error(`Expected an ordinary directory at ${directory}`);
  }
}

async function readMarker(file: string): Promise<string | undefined> {
  const entry = await inspect(file);
  if (!entry) return undefined;
  if (!entry.isFile() || entry.nlink !== 1) throw new Error(`Expected an ordinary file at ${file}`);
  return readFile(file, 'utf8');
}

async function prepareExternal(run: string): Promise<string> {
  const relative = path.relative(root, systemTemp);
  if (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative)) {
    throw new Error('Configure the operating-system temporary directory outside this checkout');
  }
  const directory = await mkdtemp(path.join(systemTemp, 'wsdl-verify-'));
  await writeFile(directory + '.owner', run, {flag: 'wx'});
  await writeFile(path.join(run, 'external'), directory);
  return directory;
}

async function cleanExternal(run: string): Promise<void> {
  const directory = await readMarker(path.join(run, 'external'));
  if (!directory) return;
  if (path.relative(systemTemp, path.dirname(directory)) !== '' || !/^wsdl-verify-[a-zA-Z0-9]{6}$/.test(path.basename(directory))) {
    throw new Error(`Unexpected external verification path: ${directory}`);
  }
  const owner = await readMarker(directory + '.owner');
  const entry = await inspect(directory);
  if (!owner && !entry) return;
  if (owner !== run) throw new Error(`External workspace is not owned by ${run}: ${directory}`);
  if (entry) {
    await plainDirectory(directory);
    await rm(directory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
  }
  await unlink(directory + '.owner');
}

async function prepareBuild(run: string): Promise<void> {
  const name = path.basename(run);
  const staged = path.join(run, 'fresh-dist');
  await mkdir(staged);
  await writeFile(path.join(staged, '.verification-owner'), name);
  await writeFile(buildOwner, name, {flag: 'wx'}).catch(error => {
    if (error.code !== 'EEXIST') throw error;
    throw new Error(`This checkout already has a delivery build owner. See ${buildOwner} and the testing guide.`);
  });
  if (await inspect(dist)) {
    await plainDirectory(dist);
    await rename(dist, path.join(run, 'previous-dist'));
  }
  await rename(staged, dist);
}

async function clean(run: string): Promise<void> {
  await plainDirectory(tmp);
  await plainDirectory(base);
  await plainDirectory(run);
  const name = path.basename(run);
  const previous = path.join(run, 'previous-dist');
  const backup = await inspect(previous);
  const ownsBuild = await readMarker(buildOwner) === name;
  if (backup && !ownsBuild) throw new Error(`Cannot restore ${previous} without a matching build owner`);
  await cleanExternal(run);
  if (ownsBuild) {
    if (backup) await plainDirectory(previous);
    const build = await inspect(dist);
    if (build) {
      if (build.isDirectory() && await readMarker(path.join(dist, '.verification-owner')) === name) {
        await plainDirectory(dist);
        await rename(dist, path.join(run, 'finished-dist'));
      } else if (backup) {
        throw new Error(`Cannot restore ${previous} over an unowned dist directory`);
      }
    }
    if (backup) await rename(previous, dist);
    await unlink(buildOwner);
  }
  await rm(run, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
}

function requireStopped(record: string, value: string): void {
  const pid = Number(value);
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error(`Invalid verification ${record} PID`);
  try {
    process.kill(pid, 0);
    throw new Error(`Verification ${record} PID ${pid} still exists. Wait for the run before recovery.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

async function recover(name: string | undefined): Promise<void> {
  if (!name || !/^run-[a-zA-Z0-9]{6}$/.test(name)) throw new Error('Supply the interrupted run directory name');
  const run = path.join(base, name);
  await plainDirectory(run);
  const owner = await readMarker(path.join(run, 'owner'));
  if (!owner) throw new Error(`Missing owner record for ${name}`);
  requireStopped('owner', owner);
  const child = await readMarker(path.join(run, 'child'));
  if (child !== undefined) requireStopped('child', child);
  await clean(run);
}

const [command, ...args] = process.argv.slice(2);
await plainDirectory(tmp, true);
await plainDirectory(base, true);
if (command === 'recover') {
  await recover(args[0]);
} else {
  const npm = process.env.npm_execpath;
  if (!command || !npm || !commands.has(command)) throw new Error('Unknown verification command or missing npm launcher');
  // @why The frozen reference adapter creates and removes its own child under this parent.
  if (['test:run', 'test:conformance:run', 'test:reference:run', 'ci:run', 'ci:platform:run'].includes(command)) {
    await plainDirectory(path.join(tmp, 'conformance'), true);
  }
  const run = await mkdtemp(path.join(base, 'run-'));
  await writeFile(path.join(run, 'owner'), String(process.pid));
  console.info(`Verification workspace: ${run}`);
  const controller = new AbortController();
  const interrupt = () => controller.abort(130);
  const terminate = () => controller.abort(143);
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', terminate);
  let treeStopped = true;
  try {
    const external = await prepareExternal(run);
    if (command === 'ci:run' || command === 'ci:platform:run' || command === 'test:corpus:run') await prepareBuild(run);
    await runOwnedNode([npm, 'run', command, '--', ...args], {
      cwd: root, signal: controller.signal, timeoutMs: 45 * 60_000, maxBuffer: 64 * 1024 * 1024,
      env: {...process.env, WSDL_TEST_RUN_DIR: run, TEMP: external, TMP: external, TMPDIR: external},
      onOutput: chunk => process.stdout.write(chunk),
      onSpawn: pid => writeFileSync(path.join(run, 'child'), String(pid), {flag: 'wx'}),
    });
  } catch (error) {
    const failure = error as Error & {exitCode?: number};
    treeStopped = !(error instanceof AggregateError);
    console.error(treeStopped ? failure.message.split(/\r?\n/, 1)[0] : failure);
    process.exitCode = controller.signal.aborted ? controller.signal.reason as number : failure.exitCode ?? 1;
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', terminate);
    if (treeStopped && !await inspect(path.join(run, 'external-recovery-required'))) {
      try {await clean(run);}
      catch (error) {
        console.error(`Workspace cleanup failed at ${run}`, error);
        process.exitCode ||= 1;
      }
    } else {
      console.error(`Workspace retained at ${run}. Verify child processes have stopped before recovery.`);
      process.exitCode ||= 1;
    }
  }
}
