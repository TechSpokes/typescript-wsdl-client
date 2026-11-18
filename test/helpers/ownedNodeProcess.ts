/**
 * Runs bounded qualification commands and owns their process trees until cleanup.
 * @since 1.1.6
 * @constraints Test-only trusted commands must await their children on normal completion.
 */
import {spawn, execFile, type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import path from 'node:path';

interface Options {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly signal?: AbortSignal;
  readonly timeoutMs: number;
  readonly maxBuffer?: number;
  readonly childProcessesDenied?: boolean;
  readonly onSpawn?: (pid: number) => void;
  readonly onOutput?: (text: string) => void;
}

interface PosixProcess {
  pid: number;
  parent: number;
  group: number;
  state: string;
}

function signalGroup(group: number, signal: NodeJS.Signals): void {
  try {process.kill(-group, signal);}
  catch (error) {if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;}
}

async function posixProcesses(): Promise<PosixProcess[]> {
  const {stdout} = await promisify(execFile)('ps', ['-A', '-o', 'pid=,ppid=,pgid=,stat='],
    {encoding: 'utf8', timeout: 5000});
  return stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
    const [pid, parent, group, state] = line.trim().split(/\s+/);
    if (!/^\d+$/.test(pid ?? '') || !/^\d+$/.test(parent ?? '') || !/^\d+$/.test(group ?? '') || !state) {
      throw new Error('Could not inspect owned process groups');
    }
    return {pid: Number(pid), parent: Number(parent), group: Number(group), state};
  });
}

async function stopPosixTree(leader: number, requireTrace: boolean): Promise<void> {
  const groups = new Set([leader]);
  function stopGroup(group: number): void {
    signalGroup(group, 'SIGSTOP');
    groups.add(group);
  }
  try {
    stopGroup(leader);
    // @why Nested qualification commands may have created their own detached process groups.
    // Freeze each newly found group before looking for more descendants.
    for (let pass = 0; ; pass++) {
      if (pass === 32) throw new Error('Owned process tree did not settle during cancellation');
      const table = await posixProcesses();
      const owned = new Set(table.filter(entry => groups.has(entry.group)).map(entry => entry.pid));
      if (pass === 0 && requireTrace && owned.size === 0) {
        throw new Error('Terminated command left no group members from which to trace detached descendants');
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const entry of table) {
          if (!owned.has(entry.pid) && owned.has(entry.parent)) {
            owned.add(entry.pid);
            changed = true;
          }
        }
      }
      const nested = new Set(table.filter(entry => owned.has(entry.pid) && !groups.has(entry.group) && entry.group > 0)
        .map(entry => entry.group));
      if (!nested.size) break;
      for (const group of nested) stopGroup(group);
    }
  } finally {
    for (const group of groups) signalGroup(group, 'SIGKILL');
  }
  for (let attempt = 0; attempt < 50; attempt++) {
    const running = (await posixProcesses()).some(entry => groups.has(entry.group) && !/^[ZX]/.test(entry.state));
    if (!running) return;
    await delay(100);
  }
  throw new Error('Owned process groups remained active after cancellation');
}

async function stopTree(child: ChildProcess): Promise<void> {
  if (child.pid === undefined) return;
  if (process.platform === 'win32') {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error('Command leader exited before Windows tree cleanup; descendants cannot be certified');
    }
    await promisify(execFile)(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32/taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'], {windowsHide: true, timeout: 10_000});
  } else await stopPosixTree(child.pid, child.signalCode !== null);
}

/**
 * Resolve only after an owned Node command has closed and requested cleanup has finished.
 * @param args Arguments to the current supported Node executable, without shell evaluation.
 * @param options Explicit stage deadline, output bound and caller cancellation.
 * @returns Captured stdout/stderr after successful completion.
 * @throws For cancellation, deadline/output limits, command failure or failed tree cleanup.
 * @sideEffects Creates a child group on POSIX; stops only its owned group/tree on failure.
 */
export async function runOwnedNode(args: readonly string[], options: Options): Promise<{stdout: string; stderr: string}> {
  options.signal?.throwIfAborted();
  const maxBuffer = options.maxBuffer ?? 8 * 1024 * 1024;
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0
    || !Number.isSafeInteger(maxBuffer) || maxBuffer <= 0) throw new RangeError('Positive command limits required');
  if (options.childProcessesDenied && (args[0] !== '--permission'
    || args.some(arg => arg.startsWith('--allow-child-process'))
    || /--allow-child-process/.test(options.env?.NODE_OPTIONS ?? process.env.NODE_OPTIONS ?? ''))) {
    throw new Error('Leaf command requires Node permissions denying child processes');
  }
  const child = spawn(process.execPath, [...args], {cwd: options.cwd, env: options.env,
    windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
  let stdout = '', stderr = '', stdoutBytes = 0, stderrBytes = 0;
  let failure: Error | undefined, cleanupError: unknown, stopping: Promise<void> | undefined;
  const closed = new Promise<{code: number | null; signal: NodeJS.Signals | null}>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({code, signal}));
  });
  const error = (message: string, cause?: unknown) => Object.assign(new Error(message, {cause}), {stdout, stderr});
  const stop = (reason: Error) => {
    if (stopping) return;
    failure = reason;
    stopping = stopTree(child).catch(cause => {
      cleanupError = cause;
      // @constraints A failed tree stop is an infrastructure failure, never a successful qualification.
      child.kill('SIGKILL');
      child.stdout.destroy(); child.stderr.destroy();
    });
  };
  const abort = () => stop(error('Owned command cancelled: ' + String(options.signal?.reason), options.signal?.reason));
  let drainTimer: ReturnType<typeof setTimeout> | undefined;
  child.once('exit', (code, signal) => {
    // @why taskkill needs a live Windows leader. A normal nonzero exit still drains its pipes.
    if (code !== 0 && (process.platform !== 'win32' || signal !== null)) {
      const reason = Object.assign(error(`Owned command exited ${code ?? signal}: ${stderr}`), {exitCode: code});
      if (!options.childProcessesDenied) stop(reason);
    }
    // @why An exited leader can leave inherited pipes open; never wait indefinitely for close.
    drainTimer = setTimeout(() => stop(error('Owned command pipes remained open after leader exit')), 5000);
  });
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    if (failure) return;
    stdoutBytes += Buffer.byteLength(chunk);
    if (stdoutBytes > maxBuffer) stop(error('Owned command stdout limit'));
    else {stdout += chunk; options.onOutput?.(chunk);}
  });
  child.stderr.on('data', (chunk: string) => {
    if (failure) return;
    stderrBytes += Buffer.byteLength(chunk);
    if (stderrBytes > maxBuffer) stop(error('Owned command stderr limit'));
    else {stderr += chunk; options.onOutput?.(chunk);}
  });
  const timer = setTimeout(() => stop(error(`Owned command exceeded ${options.timeoutMs}ms`)), options.timeoutMs);
  options.signal?.addEventListener('abort', abort, {once: true});
  if (options.signal?.aborted) abort();
  try {
    if (child.pid !== undefined) options.onSpawn?.(child.pid);
  } catch (cause) {
    stop(error('Could not record owned command', cause));
  }
  try {
    const result = await closed;
    await stopping;
    if (cleanupError) throw Object.assign(new AggregateError([failure, cleanupError],
      'Owned command tree cleanup failed'), {stdout, stderr});
    if (failure) throw failure;
    options.signal?.throwIfAborted();
    if (result.code !== 0) {
      throw Object.assign(error(`Owned command exited ${result.code ?? result.signal}: ${stderr}`), {exitCode: result.code});
    }
    return {stdout, stderr};
  } finally {
    clearTimeout(timer);
    clearTimeout(drainTimer);
    options.signal?.removeEventListener('abort', abort);
    await stopping;
  }
}
