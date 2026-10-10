/** Dependency-free execution controls, run with Node's built-in TypeScript stripping before npm ci. */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync,
    readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { release } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type EnforcementPlatform = 'linux' | 'win32';
export interface InventoryRoot { readonly path: string; readonly recursive: boolean }
export interface Inventory {
    readonly roots: readonly InventoryRoot[];
    readonly paths: readonly string[];
    readonly directoriesRead: number;
    readonly errors: readonly string[];
}
export interface Probe {
    readonly candidate: string;
    readonly method: 'spawn' | 'script-read';
    readonly outcome: 'unavailable' | 'denied' | 'started' | 'unresolved';
    readonly errorCode?: string;
    readonly pid?: number;
    readonly status: number | null;
    readonly signal?: string | null;
}
export interface SpawnObservation {
    readonly pid?: number;
    readonly status: number | null;
    readonly signal?: string | null;
    readonly error?: NodeJS.ErrnoException;
}
interface AclBackup {
    readonly path: string;
    readonly backup: string;
    readonly permission: 'X' | 'RX';
    applied: boolean;
    restored: boolean;
}
export interface EnvironmentEnforcement {
    readonly formatVersion: 1;
    readonly platform: EnforcementPlatform;
    readonly node: string;
    readonly arch: string;
    readonly osRelease: string;
    readonly startedAt: string;
    readonly testedRevision: string;
    readonly testedTree: string;
    readonly workingTreeDirty: boolean;
    readonly sourceHash: string;
    readonly packageLockHash: string;
    readonly nodeExecutableHash: string;
    readonly stateDirectory: string;
    phase: 'preparing' | 'enforced' | 'verified' | 'failed' | 'restored';
    qualified: boolean;
    inventory?: Inventory;
    verificationInventory?: Inventory;
    initialProbes?: readonly Probe[];
    verificationProbes?: readonly Probe[];
    sid?: string;
    aclBackups: AclBackup[];
    control?: { path: string; sourceHash: string; before: Probe; after?: Probe };
    enforcedAt?: string;
    verifiedAt?: string;
    restoredAt?: string;
    failure?: string;
    restoreErrors?: readonly string[];
}

const names = ['python', 'python2', 'python2.7', 'python3', 'pythonw', 'py', 'pip', 'pip2', 'pip3',
    'pypy', 'pypy3', 'ipython', 'pipx', 'pipenv', 'virtualenv',
    ...Array.from({ length: 10 }, (_, index) => 'python3.' + (index + 7))];
const interpreter = /^(?:pythonw?(?:\d+(?:\.\d+)*)?(?:t|w|_d)?|pypy(?:\d+(?:\.\d+)*)?|pip(?:\d+(?:\.\d+)*)?|py|ipython\d*|pipx|pipenv|virtualenv)(?:\.(?:exe|com|bin|real|cmd|bat|ps1|vbs|vbe|js|jse|wsf|wsh))?$/i;
const scriptExtension = /\.(?:cmd|bat|ps1|vbs|vbe|js|jse|wsf|wsh)$/i;
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
export const isInterpreterName = (name: string): boolean => interpreter.test(name);

/** Only a failed spawn proves that the candidate did not start. A nonzero exit never does. */
export function classifySpawn(candidate: string, result: SpawnObservation): Probe {
    const errorCode = result.error?.code;
    const started = (result.pid ?? 0) > 0 || result.status !== null;
    const outcome = started ? 'started' : errorCode === 'ENOENT' || errorCode === 'ENOTDIR' ? 'unavailable'
        : errorCode === 'EACCES' || errorCode === 'EPERM' ? 'denied' : 'unresolved';
    return { candidate, method: 'spawn', outcome, errorCode, pid: result.pid,
        status: result.status, signal: result.signal };
}
export function probeExecutable(candidate: string, args: readonly string[] = ['--version']): Probe {
    return classifySpawn(candidate, spawnSync(candidate, [...args], {
        encoding: 'utf8', timeout: 5000, windowsHide: true, shell: false, maxBuffer: 65536,
    }));
}
function probeScriptRead(candidate: string): Probe {
    try {
        readFileSync(candidate);
        return { candidate, method: 'script-read', outcome: 'unresolved', status: null };
    } catch (error) {
        const errorCode = (error as NodeJS.ErrnoException).code;
        const outcome = errorCode === 'ENOENT' || errorCode === 'ENOTDIR' ? 'unavailable'
            : errorCode === 'EACCES' || errorCode === 'EPERM' ? 'denied' : 'unresolved';
        return { candidate, method: 'script-read', outcome, errorCode, status: null };
    }
}
const probe = (candidate: string, platform: EnforcementPlatform) =>
    platform === 'win32' && scriptExtension.test(candidate) ? probeScriptRead(candidate) : probeExecutable(candidate);

/** Follow directory links once, retain every interpreter alias, and report unreadable inventory. */
export function inventoryInterpreters(roots: readonly InventoryRoot[], excluded: readonly string[] = []): Inventory {
    const paths = new Set<string>();
    const errors: string[] = [];
    const visited = new Map<string, boolean>();
    const exclusions = new Set(excluded.map(path => resolve(path)));
    const pending = [...roots];
    let directoriesRead = 0;
    while (pending.length) {
        const root = pending.pop()!;
        const path = resolve(root.path);
        if (exclusions.has(path)) continue;
        try {
            const canonical = realpathSync(path);
            const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
            if (visited.get(key) || visited.has(key) && !root.recursive) continue;
            visited.set(key, root.recursive);
            const entries = readdirSync(path, { withFileTypes: true });
            directoriesRead++;
            for (const entry of entries) {
                const child = join(path, entry.name);
                const named = isInterpreterName(entry.name);
                if (entry.isFile() && named) paths.add(child);
                else if (entry.isDirectory() && root.recursive) pending.push({ path: child, recursive: true });
                else if (entry.isSymbolicLink()) {
                    if (named) paths.add(child);
                    try {
                        if (root.recursive && statSync(child).isDirectory()) pending.push({ path: child, recursive: true });
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(child + ': ' + message(error));
                    }
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(path + ': ' + message(error));
        }
    }
    return { roots, paths: [...paths].sort(), directoriesRead, errors };
}
export function platformRoots(platform: EnforcementPlatform): InventoryRoot[] {
    if (platform === 'linux') return [{ path: '/', recursive: true }];
    const drive = process.env.SystemDrive ?? 'C:';
    const windows = process.env.SystemRoot ?? drive + '\\Windows';
    const recursive = [process.cwd(), process.env.GITHUB_WORKSPACE, process.env.RUNNER_TEMP,
        process.env.RUNNER_TOOL_CACHE, process.env.AGENT_TOOLSDIRECTORY,
        process.env.USERPROFILE, process.env.LOCALAPPDATA, process.env.APPDATA,
        process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432,
        drive + '\\hostedtoolcache', drive + '\\Users', drive + '\\Program Files',
        drive + '\\Program Files (x86)', drive + '\\ProgramData', drive + '\\tools',
        drive + '\\msys64', drive + '\\mingw64', drive + '\\cygwin64',
        join(windows, 'System32'), join(windows, 'SysWOW64')].filter((path): path is string => !!path);
    for (const entry of readdirSync(drive + '\\', { withFileTypes: true }))
        if (entry.isDirectory() && /(?:python|conda|pypy|portable|apps|tools)/i.test(entry.name)) recursive.push(drive + '\\' + entry.name);
    const direct = [drive + '\\', windows, ...(process.env.PATH ?? '').split(';')].filter(Boolean);
    return [...new Set(recursive)].map(path => ({ path, recursive: true }))
        .concat([...new Set(direct)].map(path => ({ path, recursive: false })));
}
function knownPaths(platform: EnforcementPlatform): string[] {
    if (platform === 'linux') return ['/bin', '/usr/bin', '/usr/local/bin', '/opt/bin']
        .flatMap(directory => names.map(name => join(directory, name)));
    const drive = process.env.SystemDrive ?? 'C:';
    const windows = process.env.SystemRoot ?? drive + '\\Windows';
    const directories = [join(windows, 'System32'), windows,
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps'),
        ...(process.env.PATH ?? '').split(';')].filter((path): path is string => !!path);
    return directories.flatMap(directory => names.flatMap(name => [join(directory, name + '.exe'),
        join(directory, name + '.cmd'), join(directory, name + '.bat')]));
}
function collectProbes(inventory: Inventory, platform: EnforcementPlatform): Probe[] {
    return [...new Set([...names, ...inventory.paths.map(path => basename(path)),
        ...knownPaths(platform), ...inventory.paths])].map(candidate => probe(candidate, platform));
}
function assertProbes(probes: readonly Probe[]): void {
    const failed = probes.filter(probe => probe.outcome !== 'denied' && probe.outcome !== 'unavailable');
    if (failed.length) throw new Error('Interpreter execution is not blocked: ' +
        failed.map(probe => probe.candidate + ' (' + probe.outcome + ')').join(', '));
}
function writeState(path: string, state: EnvironmentEnforcement): void {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = path + '.partial';
    writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n');
    renameSync(temporary, path);
}
function readState(path: string): EnvironmentEnforcement {
    const state = JSON.parse(readFileSync(path, 'utf8')) as EnvironmentEnforcement;
    if (state.formatVersion !== 1 || !['linux', 'win32'].includes(state.platform) || !Array.isArray(state.aclBackups))
        throw new Error('Invalid platform enforcement state');
    return state;
}
const systemCommand = (name: string) => join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', name);
function icacls(args: readonly string[], cwd?: string): void {
    const command = systemCommand('icacls.exe');
    execFileSync(command, [...args], { cwd, encoding: 'utf8', windowsHide: true });
}
function saveAndDeny(state: EnvironmentEnforcement, report: string, paths: readonly string[]): void {
    const command = systemCommand('whoami.exe');
    const output = execFileSync(command, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = output.match(/S-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw new Error('Cannot identify Windows runner SID');
    state.sid = sid;
    // Save every original ACL before modifying any hard-link/alias target.
    for (const path of [...new Set(paths)].sort()) {
        const backup = join(state.stateDirectory, 'acl-' + String(state.aclBackups.length).padStart(5, '0') + '.txt');
        icacls([basename(path), '/save', backup, '/q'], dirname(path));
        state.aclBackups.push({ path, backup, permission: scriptExtension.test(path) ? 'RX' : 'X', applied: false, restored: false });
        writeState(report, state);
    }
    for (const entry of state.aclBackups) {
        // Record intent first so an interrupted or partially failed mutation is restored too.
        entry.applied = true;
        writeState(report, state);
        icacls([entry.path, '/deny', '*' + sid + ':(' + entry.permission + ')', '/q']);
    }
}
export function restoreEnvironment(report: string): EnvironmentEnforcement {
    const state = readState(report);
    const errors: string[] = [];
    for (const entry of [...state.aclBackups].reverse()) {
        if (!entry.applied || entry.restored) continue;
        try {
            icacls([dirname(entry.path), '/restore', entry.backup, '/q']);
            entry.restored = true;
            writeState(report, state);
        } catch (error) { errors.push(entry.path + ': ' + message(error)); }
    }
    state.restoreErrors = errors;
    if (!errors.length) {
        state.phase = 'restored';
        state.restoredAt = new Date().toISOString();
        if (state.control) rmSync(state.control.path, { force: true });
    }
    writeState(report, state);
    if (errors.length) throw new Error('Windows ACL restoration failed: ' + errors.join('; '));
    return state;
}
export function enforceEnvironment(report: string): EnvironmentEnforcement {
    if (process.platform !== 'linux' && process.platform !== 'win32') throw new Error('Unqualified platform: ' + process.platform);
    if (existsSync(report) && readState(report).phase !== 'restored') throw new Error('Restore the previous enforcement state before replacing it');
    const platform = process.platform;
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const stateDirectory = resolve(dirname(report), 'platform-enforcement-state');
    mkdirSync(stateDirectory, { recursive: true });
    const state: EnvironmentEnforcement = { formatVersion: 1, platform, node: process.version,
        arch: process.arch, osRelease: release(), startedAt: new Date().toISOString(),
        testedRevision: git('rev-parse', 'HEAD'), testedTree: git('rev-parse', 'HEAD^{tree}'),
        workingTreeDirty: git('status', '--porcelain').length > 0,
        sourceHash: sha(fileURLToPath(import.meta.url)),
        packageLockHash: sha('package-lock.json'), nodeExecutableHash: sha(process.execPath),
        stateDirectory, phase: 'preparing', qualified: false, aclBackups: [] };
    writeState(report, state);
    try {
        state.inventory = inventoryInterpreters(platformRoots(platform), platform === 'linux' ? ['/proc', '/sys', '/dev'] : []);
        if (state.inventory.errors.length) throw new Error('Incomplete interpreter inventory: ' + state.inventory.errors.join('; '));
        if (platform === 'linux') {
            const executable = state.inventory.paths.filter(path => {
                try { accessSync(path, constants.X_OK); return true; }
                catch (error) {
                    if (!['EACCES', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
                    return false;
                }
            });
            if (executable.length) throw new Error('Linux image contains executable interpreters: ' + executable.join(', '));
            const controlPath = join(stateDirectory, 'python');
            copyFileSync(process.execPath, controlPath);
            chmodSync(controlPath, 0o700);
            const before = probeExecutable(controlPath, ['--version']);
            if (before.outcome !== 'started' || before.status !== 0) throw new Error('Copied Node control cannot execute before permission denial');
            state.control = { path: controlPath, sourceHash: sha(controlPath), before };
            writeState(report, state);
            chmodSync(controlPath, 0o600);
            state.control.after = probeExecutable(controlPath);
            if (state.control.after.outcome !== 'denied') throw new Error('Linux mode bits did not block the copied Node control');
        } else {
            const controlPath = join(stateDirectory, 'python.exe');
            copyFileSync(process.execPath, controlPath);
            const before = probeExecutable(controlPath, ['--version']);
            if (before.outcome !== 'started' || before.status !== 0) throw new Error('Copied Node control cannot execute before ACL denial');
            state.control = { path: controlPath, sourceHash: sha(controlPath), before };
            writeState(report, state);
            const targets = [...state.inventory.paths, controlPath];
            for (const path of state.inventory.paths) {
                try { targets.push(realpathSync(path)); } catch (error) {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                }
            }
            saveAndDeny(state, report, targets.filter(path => existsSync(path)));
            state.control.after = probeExecutable(controlPath);
            if (state.control.after.outcome !== 'denied') throw new Error('Windows execute ACL did not block the copied Node control');
        }
        state.initialProbes = collectProbes(state.inventory, platform);
        assertProbes(state.initialProbes);
        state.phase = 'enforced';
        state.enforcedAt = new Date().toISOString();
        state.qualified = true;
        writeState(report, state);
        return state;
    } catch (error) {
        state.phase = 'failed';
        state.qualified = false;
        state.failure = message(error);
        writeState(report, state);
        try { restoreEnvironment(report); } catch { /* The persisted rollback failures remain visible. */ }
        throw error;
    }
}
export function verifyEnvironment(report: string): EnvironmentEnforcement {
    const state = readState(report);
    if (!['enforced', 'verified'].includes(state.phase) || !state.qualified) throw new Error('No active qualified environment control');
    try {
        if (state.platform !== process.platform || state.node !== process.version || state.nodeExecutableHash !== sha(process.execPath))
            throw new Error('Environment changed after interpreter enforcement');
        if (state.packageLockHash !== sha('package-lock.json')) throw new Error('Install changed the package lock');
        if (state.sourceHash !== sha(fileURLToPath(import.meta.url))) throw new Error('Enforcement source changed during qualification');
        const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
        if (state.testedRevision !== git('rev-parse', 'HEAD') || state.testedTree !== git('rev-parse', 'HEAD^{tree}'))
            throw new Error('Git candidate changed during qualification');
        state.verificationInventory = inventoryInterpreters(platformRoots(state.platform), state.platform === 'linux' ? ['/proc', '/sys', '/dev'] : []);
        if (state.verificationInventory.errors.length) throw new Error('Incomplete verification inventory: ' + state.verificationInventory.errors.join('; '));
        if (state.platform === 'win32') {
            const controlled = new Set(state.aclBackups.map(entry => entry.path.toLowerCase()));
            const additions = state.verificationInventory.paths.filter(path => !controlled.has(path.toLowerCase()));
            if (additions.length) throw new Error('Install introduced uncontrolled interpreter paths: ' + additions.join(', '));
            if (!state.control || probeExecutable(state.control.path).outcome !== 'denied') throw new Error('Windows execute ACL control no longer blocks execution');
        } else {
            if (!state.control || probeExecutable(state.control.path).outcome !== 'denied') throw new Error('Linux execute mode control no longer blocks execution');
            const executable = state.verificationInventory.paths.filter(path => {
                try { accessSync(path, constants.X_OK); return true; }
                catch (error) {
                    if (!['EACCES', 'ENOENT'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
                    return false;
                }
            });
            if (executable.length) throw new Error('Install introduced executable interpreters: ' + executable.join(', '));
        }
        state.verificationProbes = collectProbes(state.verificationInventory, state.platform);
        assertProbes(state.verificationProbes);
        state.phase = 'verified';
        state.verifiedAt = new Date().toISOString();
        writeState(report, state);
        return state;
    } catch (error) {
        state.phase = 'failed';
        state.qualified = false;
        state.failure = message(error);
        writeState(report, state);
        throw error;
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const report = resolve(process.argv[3] ?? 'tmp/conformance/platform-enforcement.json');
    const action = process.argv[2];
    try {
        const result = action === 'enforce' ? enforceEnvironment(report) : action === 'verify' ? verifyEnvironment(report)
            : action === 'restore' ? restoreEnvironment(report) : (() => { throw new Error('Expected enforce, verify or restore'); })();
        console.log(JSON.stringify({ report, phase: result.phase, qualified: result.qualified,
            inventoriedPaths: result.inventory?.paths.length, directoriesRead: result.inventory?.directoriesRead,
            probes: (result.verificationProbes ?? result.initialProbes)?.length, restoreErrors: result.restoreErrors }));
    } catch (error) { console.error(message(error)); process.exitCode = 1; }
}
