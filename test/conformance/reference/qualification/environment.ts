/** Dependency-free execution controls, run with Node's built-in TypeScript stripping before npm ci. */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync,
    readdirSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { basename, dirname, join, resolve, sep, win32 } from 'node:path';
import { release } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type EnforcementPlatform = 'linux' | 'win32';
export interface InventoryRoot {
    readonly path: string;
    readonly recursive: boolean;
    readonly reason?: string;
    readonly selection?: 'path' | 'registry';
}
export interface InventoryExclusion { readonly path: string; readonly reason: string }
export interface CanonicalAlias { readonly path: string; readonly target: string }
export interface FileAlias {
    readonly path: string;
    readonly dirent: 'symbolic-link' | 'file';
    readonly identification: 'symbolic-file-alias' | 'windows-apps-command-entry';
}
export interface RegistryObservation {
    readonly key: string;
    readonly view: '32' | '64';
    readonly outcome: 'found' | 'missing' | 'error';
    readonly installPaths: readonly string[];
    readonly executablePaths: readonly string[];
    readonly error?: string;
}
export interface InventoryPlan {
    readonly roots: readonly InventoryRoot[];
    readonly exclusions: readonly InventoryExclusion[];
    readonly aliases: readonly CanonicalAlias[];
    readonly candidates: readonly string[];
    readonly registry: readonly RegistryObservation[];
    readonly errors: readonly string[];
}
export interface Inventory {
    readonly roots: readonly InventoryRoot[];
    readonly paths: readonly string[];
    readonly directoriesRead: number;
    readonly errors: readonly string[];
    readonly aliases: readonly CanonicalAlias[];
    readonly fileAliases: readonly FileAlias[];
    readonly scopeExclusions: readonly InventoryExclusion[];
    readonly missingRoots: readonly string[];
    readonly registry: readonly RegistryObservation[];
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
export type Canonicalization = { readonly outcome: 'resolved'; readonly target: string }
    | { readonly outcome: 'failed'; readonly errorCode?: string; readonly error: string };
export interface RemovalTarget {
    readonly path: string;
    readonly kind: 'link' | 'file';
}
export interface RemovalRecord extends RemovalTarget {
    outcome: 'planned' | 'removing' | 'removed' | 'missing' | 'failed';
    errorCode?: string;
    error?: string;
}
export interface AliasLookup { readonly alias: FileAlias; readonly canonicalization: Canonicalization }
export interface TargetLookup { readonly path: string; readonly canonicalization: Canonicalization }
export interface DisposableWindowsHost {
    readonly githubActions: 'true';
    readonly runnerEnvironment: 'github-hosted';
    readonly taskMarker: 'true';
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
    readonly strategy: 'linux-absence' | 'disposable-windows-removal';
    readonly disposableHost?: DisposableWindowsHost;
    phase: 'preparing' | 'enforced' | 'verified' | 'failed' | 'cleaned';
    qualified: boolean;
    inventory?: Inventory;
    verificationInventory?: Inventory;
    initialProbes?: readonly Probe[];
    verificationProbes?: readonly Probe[];
    removalTargets: readonly RemovalTarget[];
    removals: RemovalRecord[];
    removalErrors?: readonly string[];
    targetLookups?: readonly TargetLookup[];
    aliasLookups?: readonly AliasLookup[];
    targetPreparationErrors?: readonly string[];
    control?: { path: string; sourceHash: string; before: Probe; after?: Probe };
    enforcedAt?: string;
    verifiedAt?: string;
    cleanedAt?: string;
    failure?: string;
    cleanupErrors?: readonly string[];
}

const names = ['python', 'python2', 'python2.7', 'python3', 'pythonw', 'py', 'pyw', 'pip', 'pip2', 'pip3',
    'pypy', 'pypy3', 'ipython', 'pipx', 'pipenv', 'virtualenv',
    ...Array.from({ length: 10 }, (_, index) => 'python3.' + (index + 7))];
const interpreter = /^(?:pythonw?(?:\d+(?:\.\d+)*)?(?:t|w|_d)?|pypy(?:\d+(?:\.\d+)*)?|pip(?:\d+(?:\.\d+)*)?|pyw?|ipython\d*|pipx|pipenv|virtualenv)(?:\.(?:exe|com|bin|real|cmd|bat|ps1|vbs|vbe|js|jse|wsf|wsh))?$/i;
const scriptExtension = /\.(?:cmd|bat|ps1|vbs|vbe|js|jse|wsf|wsh)$/i;
const candidateSuffix = /\.(?:exe|com|bin|real|cmd|bat|ps1|vbs|vbe|js|jse|wsf|wsh)$/i;
const windowsFileLink = /\.(?:exe|com|cmd|bat|ps1|vbs|vbe|js|jse|wsf|wsh)$/i;
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
/** Numeric version dots are part of a logical name, not a binary or script suffix. */
export function isWindowsLogicalWrapperPath(path: string): boolean {
    const name = win32.basename(path);
    return win32.isAbsolute(path) && !candidateSuffix.test(name) && (isInterpreterName(name) || !win32.extname(name));
}
export function probesForCandidate(candidate: string, platform: EnforcementPlatform): Probe[] {
    return platform === 'win32' && isWindowsLogicalWrapperPath(candidate)
        ? [probeExecutable(candidate), probeScriptRead(candidate)] : [probe(candidate, platform)];
}

export interface TargetOperations {
    readonly canonicalize: (path: string) => string;
}
const targetOperations: TargetOperations = { canonicalize: path => realpathSync(path) };
function canonicalization(path: string, operations: TargetOperations): Canonicalization {
    try { return { outcome: 'resolved', target: operations.canonicalize(path) }; }
    catch (error) { return { outcome: 'failed', errorCode: (error as NodeJS.ErrnoException).code, error: message(error) }; }
}
const windowsPathKey = (path: string): string => win32.normalize(path).toLowerCase();
export function assertDisposableWindows(platform: NodeJS.Platform = process.platform, environment: NodeJS.ProcessEnv = process.env): DisposableWindowsHost {
    if (platform !== 'win32' || environment.GITHUB_ACTIONS !== 'true' || environment.RUNNER_ENVIRONMENT !== 'github-hosted'
        || environment.NODE_REFERENCE_DISPOSABLE_WINDOWS !== 'true')
        throw new Error('Interpreter removal requires an explicitly marked disposable GitHub-hosted Windows runner');
    return { githubActions: 'true', runnerEnvironment: 'github-hosted', taskMarker: 'true' };
}
export function prepareWindowsRemoval(paths: readonly string[], fileAliases: readonly FileAlias[], operations: TargetOperations = targetOperations,
    protectedPaths: readonly string[] = [process.execPath, realpathSync(process.execPath)]): {
    targets: readonly RemovalTarget[]; targetLookups: TargetLookup[]; aliasLookups: AliasLookup[]; errors: string[];
} {
    const targets = new Map<string, RemovalTarget>();
    const protectedKeys = new Set(protectedPaths.map(windowsPathKey));
    const errors: string[] = [];
    const add = (target: RemovalTarget): void => {
        const key = windowsPathKey(target.path);
        if (protectedKeys.has(key)) errors.push('Removal target is the running Node executable: ' + target.path);
        else targets.set(key, Object.freeze(target));
    };
    const aliases = new Map(fileAliases.map(alias => [alias.path.toLowerCase(), alias]));
    const targetLookups: TargetLookup[] = [];
    const aliasLookups: AliasLookup[] = [];
    for (const path of [...new Set(paths)].sort()) {
        const lookup = canonicalization(path, operations);
        targetLookups.push({ path, canonicalization: lookup });
        const alias = aliases.get(path.toLowerCase());
        if (alias) aliasLookups.push({ alias, canonicalization: lookup });
        if (alias?.dirent === 'symbolic-link') {
            // An identified link can be unlinked without opening its destination.
            // Failed lookup is diagnostic; actual unavailable probes are still required.
            add({ path, kind: 'link' });
            if (lookup.outcome === 'resolved' && lookup.target.toLowerCase() !== path.toLowerCase())
                add({ path: lookup.target, kind: 'file' });
        } else if (lookup.outcome === 'resolved') {
            add({ path, kind: 'file' });
            add({ path: lookup.target, kind: 'file' });
        } else errors.push('Ordinary removal target cannot be canonicalized: ' + path + ' (' + lookup.error + ')');
    }
    return { targets: Object.freeze([...targets.values()].sort((left, right) => left.path.localeCompare(right.path))), targetLookups, aliasLookups, errors };
}

export type DirectoryReader = (path: string) => readonly Dirent[];
const readDirectory: DirectoryReader = path => readdirSync(path, { withFileTypes: true });
interface InventoryOptions {
    readonly platform?: EnforcementPlatform;
    readonly readDirectory?: DirectoryReader;
    readonly candidates?: readonly string[];
    readonly aliases?: readonly CanonicalAlias[];
    readonly fileAliases?: readonly FileAlias[];
    readonly registry?: readonly RegistryObservation[];
    readonly errors?: readonly string[];
}

/** Enumerate canonical directory targets once; retain file aliases as separate candidates. */
export function inventoryInterpreters(roots: readonly InventoryRoot[], excluded: readonly (string | InventoryExclusion)[] = [],
    options: InventoryOptions = {}): Inventory {
    const paths = new Set<string>(options.candidates ?? []);
    const errors: string[] = [...options.errors ?? []];
    const aliases: CanonicalAlias[] = [...options.aliases ?? []];
    const fileAliases: FileAlias[] = [...options.fileAliases ?? []];
    const missingRoots: string[] = [];
    const visited = new Map<string, boolean>();
    const platform = options.platform ?? process.platform;
    const key = (path: string) => platform === 'win32' ? path.toLowerCase() : path;
    const registeredCandidates = new Set((options.candidates ?? []).map(key));
    const scopeExclusions = excluded.map(entry => typeof entry === 'string'
        ? { path: resolve(entry), reason: 'Non-installation filesystem root' } : entry);
    const exclusions = new Set(scopeExclusions.map(entry => key(resolve(entry.path))));
    const pending = roots.map(root => ({ root, explicit: true }));
    const reader = options.readDirectory ?? readDirectory;
    const exclusionFor = (path: string, subtree: boolean): string | undefined => {
        const actual = key(path);
        return [...exclusions].find(excluded => actual === excluded || subtree && actual.startsWith(excluded + sep));
    };
    const excludedRoot = (root: InventoryRoot, path: string, explicit: boolean): boolean => {
        const excluded = exclusionFor(path, explicit && !!root.selection);
        if (!excluded) return false;
        if (explicit) errors.push('Selected ' + (root.selection ?? 'installation') + ' inventory root conflicts with scope exclusion: '
            + resolve(root.path) + ' -> ' + path + ' (excluded ' + excluded + ')');
        return true;
    };
    let directoriesRead = 0;
    while (pending.length) {
        const { root, explicit } = pending.pop()!;
        const path = resolve(root.path);
        if (excludedRoot(root, path, explicit)) continue;
        try {
            const canonical = realpathSync(path);
            if (path !== canonical) aliases.push({ path, target: canonical });
            const canonicalKey = key(canonical);
            if (excludedRoot(root, canonical, explicit)) continue;
            if (visited.get(canonicalKey) || visited.has(canonicalKey) && !root.recursive) continue;
            // Legacy profile junctions can deny listing the alias while their physical target is readable.
            // Do not mark a target visited until its enumeration succeeds.
            const entries = reader(canonical);
            visited.set(canonicalKey, root.recursive);
            directoriesRead++;
            for (const entry of entries) {
                const child = join(canonical, entry.name);
                const named = isInterpreterName(entry.name);
                const candidate = named || registeredCandidates.has(key(child));
                if (entry.isFile() && candidate) {
                    paths.add(child);
                    // AppExecLinks can be reported as files rather than symbolic links. Record the
                    // observed type and command-alias location, without asserting an unseen reparse tag.
                    if (platform === 'win32' && win32.basename(canonical).toLowerCase() === 'windowsapps'
                        && win32.basename(win32.dirname(canonical)).toLowerCase() === 'microsoft')
                        fileAliases.push({ path: child, dirent: 'file', identification: 'windows-apps-command-entry' });
                }
                else if (entry.isDirectory() && root.recursive) pending.push({ root: { path: child, recursive: true }, explicit: false });
                else if (entry.isSymbolicLink()) {
                    if (candidate) {
                        paths.add(child);
                        fileAliases.push({ path: child, dirent: 'symbolic-link', identification: 'symbolic-file-alias' });
                    }
                    // Windows AppExecLinks are file aliases, not directory links. Statting unrelated
                    // .exe aliases can return EACCES even though the containing install directory was read.
                    if (platform === 'win32' && windowsFileLink.test(entry.name)) continue;
                    try {
                        if (root.recursive && statSync(child).isDirectory()) pending.push({ root: { path: child, recursive: true }, explicit: false });
                    } catch (error) {
                        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(child + ': ' + message(error));
                    }
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') missingRoots.push(path);
            else errors.push(path + ': ' + message(error));
        }
    }
    return { roots, paths: [...paths].sort(), directoriesRead, errors,
        aliases: [...new Map(aliases.map(alias => [alias.path, alias])).values()],
        fileAliases: [...new Map(fileAliases.map(alias => [alias.path, alias])).values()],
        scopeExclusions, missingRoots: [...new Set(missingRoots)].sort(), registry: options.registry ?? [] };
}

export interface WindowsInstallationContext {
    readonly driveRoot: string;
    readonly windows: string;
    readonly users: string;
    readonly programData: string;
    readonly programFiles: readonly string[];
    readonly recursiveDirectories: readonly string[];
    readonly pathDirectories: readonly string[];
    readonly profiles?: readonly string[];
    readonly localAppData?: string;
    readonly appData?: string;
    readonly registry?: readonly RegistryObservation[];
}

/** Installation trees and direct system commands, not recursive OS logs, databases or profile data. */
export function windowsInstallationPlan(context: WindowsInstallationContext): InventoryPlan {
    const roots = new Map<string, InventoryRoot>();
    const errors: string[] = [];
    const aliases: CanonicalAlias[] = [];
    const add = (path: string, recursive: boolean, reason: string, selection?: InventoryRoot['selection']): void => {
        const key = resolve(path).toLowerCase();
        const previous = roots.get(key);
        roots.set(key, { path: resolve(path), recursive: recursive || !!previous?.recursive,
            reason: selection ? reason : previous?.reason ?? reason, selection: selection ?? previous?.selection });
    };
    const discover = (path: string): readonly Dirent[] => {
        try {
            const canonical = realpathSync(path);
            if (resolve(path) !== canonical) aliases.push({ path: resolve(path), target: canonical });
            return readDirectory(canonical);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(path + ': ' + message(error));
            return [];
        }
    };
    const installationName = /(?:python|pypy|conda|portable|apps|tools|pipx|pyenv|virtualenv|venv|scoop|^\.?uv$)/i;
    const dynamic = (path: string): void => {
        for (const entry of discover(path))
            if ((entry.isDirectory() || entry.isSymbolicLink() && !windowsFileLink.test(entry.name)) && installationName.test(entry.name))
                add(join(path, entry.name), true, 'Named interpreter/tool installation tree');
    };
    for (const path of context.recursiveDirectories) add(path, true, 'Workspace, temporary or hosted tool installation tree');
    for (const path of context.programFiles) add(path, true, 'Application installations, including embedded interpreters');
    for (const name of ['hostedtoolcache', 'tools', 'msys64', 'mingw64', 'cygwin64', 'scoop'])
        add(join(context.driveRoot, name), true, 'Machine tool installation tree');
    dynamic(context.driveRoot);
    add(context.driveRoot, false, 'Direct system-drive commands');
    for (const path of [context.windows, join(context.windows, 'System32'), join(context.windows, 'SysWOW64')])
        add(path, false, 'Direct OS commands');
    for (const path of context.pathDirectories) add(path, false, 'Direct PATH commands', 'path');
    add(context.programData, false, 'Direct shared installation commands');
    dynamic(context.programData);
    dynamic(join(context.programData, 'Microsoft'));
    for (const name of ['chocolatey', 'scoop', 'pipx', 'uv', 'pyenv'])
        add(join(context.programData, name), true, 'Shared package-manager installations');
    add(join(context.programData, 'Microsoft', 'VisualStudio', 'Packages'), true, 'Visual Studio installation packages');

    const local = (path: string): void => {
        add(path, false, 'Direct user application commands');
        dynamic(path);
        for (const name of ['Programs', 'uv', 'pipx', 'pypoetry', 'pyenv', 'virtualenv'])
            add(join(path, name), true, 'User application/interpreter installation tree');
        add(join(path, 'Microsoft', 'WindowsApps'), false, 'Store interpreter command aliases');
        dynamic(join(path, 'Packages')); // Include Python Store package-local scripts without unrelated package data.
    };
    const roaming = (path: string): void => {
        add(path, false, 'Direct roaming application commands');
        dynamic(path);
        for (const name of ['Python', 'uv', 'pipx', 'pypoetry', 'pyenv', 'virtualenv'])
            add(join(path, name), true, 'Roaming interpreter/user package installations');
    };
    const profiles = new Set(context.profiles ?? []);
    for (const entry of discover(context.users)) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        const path = join(context.users, entry.name);
        try {
            const canonical = realpathSync(path);
            if (resolve(path) !== canonical) aliases.push({ path: resolve(path), target: canonical });
            profiles.add(canonical);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') errors.push(path + ': ' + message(error));
        }
    }
    for (const profile of profiles) {
        add(profile, false, 'Direct physical user-profile commands');
        dynamic(profile);
        for (const name of ['.local', '.pyenv', '.conda', '.virtualenvs', '.venv', 'venv', 'scoop'])
            add(join(profile, name), true, 'User interpreter/package-manager installations');
        local(join(profile, 'AppData', 'Local'));
        roaming(join(profile, 'AppData', 'Roaming'));
    }
    if (context.localAppData) local(context.localAppData);
    if (context.appData) roaming(context.appData);
    // System accounts have their own Store aliases; do not recursively traverse the OS configuration tree.
    for (const profile of [join(context.windows, 'System32', 'config', 'systemprofile'),
        join(context.windows, 'ServiceProfiles', 'LocalService'), join(context.windows, 'ServiceProfiles', 'NetworkService')]) {
        add(join(profile, 'AppData', 'Local', 'Programs'), true, 'System-profile application installations');
        add(join(profile, 'AppData', 'Local', 'Microsoft', 'WindowsApps'), false, 'System-profile interpreter aliases');
    }
    const registry = context.registry ?? [];
    const candidates: string[] = [];
    for (const observation of registry) {
        if (observation.outcome === 'error') errors.push(observation.key + ' (' + observation.view + '-bit): ' + observation.error);
        for (const path of observation.installPaths) add(path, true, 'PEP 514 registered interpreter installation', 'registry');
        for (const path of observation.executablePaths) {
            candidates.push(path);
            add(dirname(path), true, 'PEP 514 registered interpreter executable directory', 'registry');
        }
    }
    const exclusions: InventoryExclusion[] = [
        { path: join(context.windows, 'System32', 'LogFiles'), reason: 'OS log data; only direct system commands are audited' },
        { path: join(context.windows, 'System32', 'config'), reason: 'OS configuration data; explicit system-profile installation roots remain audited' },
        { path: join(context.programData, 'Microsoft', 'Windows'), reason: 'OS shared data; shared application installation roots are separately audited' },
        { path: join(context.programData, 'Microsoft', 'Windows Defender Advanced Threat Protection'), reason: 'Protected security-service data, outside interpreter installation scope' },
        ...context.programFiles.flatMap(path => ['Classification', 'Configuration'].map(name => ({
            path: join(path, 'Windows Defender Advanced Threat Protection', name),
            reason: 'Protected security-service configuration, outside interpreter installation scope',
        }))),
    ];
    return { roots: [...roots.values()], exclusions, aliases, candidates, registry, errors };
}

export function parseRegistryInstallPaths(output: string, environment: NodeJS.ProcessEnv = process.env): {
    installPaths: string[]; executablePaths: string[]; errors: string[];
} {
    const installPaths: string[] = [];
    const executablePaths: string[] = [];
    const errors: string[] = [];
    let key = '';
    for (const line of output.split(/\r?\n/)) {
        if (/^HKEY_/i.test(line.trim())) { key = line.trim(); continue; }
        if (!/\\InstallPath$/i.test(key)) continue;
        const value = /^\s+(.+?)\s{2,}(REG_SZ|REG_EXPAND_SZ)\s{2,}(.*)$/i.exec(line);
        if (!value) continue;
        const name = value[1]!.trim();
        const executable = /^(?:ExecutablePath|WindowedExecutablePath)$/i.test(name);
        if (!executable && name !== '(Default)') continue;
        const path = value[3]!.trim().replace(/%([^%]+)%/g, (match: string, variable: string) => {
            const actual = Object.keys(environment).find(name => name.toLowerCase() === variable.toLowerCase());
            return actual ? environment[actual] ?? match : match;
        });
        if (!win32.isAbsolute(path) || /%[^%]+%/.test(path)) errors.push(key + ': unresolved or non-absolute installation value ' + name);
        else (executable ? executablePaths : installPaths).push(path);
    }
    return { installPaths: [...new Set(installPaths)], executablePaths: [...new Set(executablePaths)], errors };
}

function registryInstallations(): RegistryObservation[] {
    const command = systemCommand('reg.exe');
    const observations: RegistryObservation[] = [];
    const keys = ['HKLM\\SOFTWARE\\Python', 'HKCU\\SOFTWARE\\Python'];
    for (const key of keys) for (const view of ['64', '32'] as const) {
        const result = spawnSync(command, ['query', key, '/s', '/reg:' + view], {
            encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 4 * 1024 * 1024,
        });
        const output = (result.stdout ?? '') + (result.stderr ?? '');
        if (!result.error && result.status === 1 && /unable to find the specified registry key or value/i.test(output)
            && !/access (?:is )?denied/i.test(output)) {
            observations.push({ key, view, outcome: 'missing', installPaths: [], executablePaths: [] });
        } else if (result.error || result.status !== 0) {
            observations.push({ key, view, outcome: 'error', installPaths: [], executablePaths: [],
                error: result.error ? message(result.error) : 'Registry query failed: ' + output.trim() });
        } else {
            const parsed = parseRegistryInstallPaths(output);
            observations.push({ key, view, outcome: parsed.errors.length ? 'error' : 'found',
                installPaths: parsed.installPaths, executablePaths: parsed.executablePaths,
                ...(parsed.errors.length ? { error: parsed.errors.join('; ') } : {}) });
        }
    }
    return observations;
}

function platformInventory(platform: EnforcementPlatform): Inventory {
    if (platform === 'linux') return inventoryInterpreters([{ path: '/', recursive: true }], ['/proc', '/sys', '/dev']);
    const driveRoot = (process.env.SystemDrive ?? 'C:') + '\\';
    const windows = process.env.SystemRoot ?? join(driveRoot, 'Windows');
    const present = (paths: readonly (string | undefined)[]) => paths.filter((path): path is string => !!path);
    const plan = windowsInstallationPlan({ driveRoot, windows, users: join(driveRoot, 'Users'),
        programData: process.env.ProgramData ?? join(driveRoot, 'ProgramData'),
        programFiles: present([process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.ProgramW6432,
            join(driveRoot, 'Program Files'), join(driveRoot, 'Program Files (x86)')]),
        recursiveDirectories: present([process.cwd(), process.env.GITHUB_WORKSPACE, process.env.RUNNER_TEMP,
            process.env.RUNNER_TOOL_CACHE, process.env.AGENT_TOOLSDIRECTORY]),
        profiles: present([process.env.USERPROFILE]), localAppData: process.env.LOCALAPPDATA, appData: process.env.APPDATA,
        pathDirectories: (process.env.PATH ?? '').split(';').filter(Boolean), registry: registryInstallations() });
    return inventoryInterpreters(plan.roots, plan.exclusions, { ...plan, platform });
}
function knownPaths(platform: EnforcementPlatform): string[] {
    if (platform === 'linux') return ['/bin', '/usr/bin', '/usr/local/bin', '/opt/bin']
        .flatMap(directory => names.map(name => join(directory, name)));
    const drive = process.env.SystemDrive ?? 'C:';
    const windows = process.env.SystemRoot ?? drive + '\\Windows';
    const directories = [join(windows, 'System32'), join(windows, 'SysWOW64'), windows,
        process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps'),
        ...(process.env.PATH ?? '').split(';')].filter((path): path is string => !!path);
    return directories.flatMap(directory => names.flatMap(name => [join(directory, name + '.exe'),
        join(directory, name + '.cmd'), join(directory, name + '.bat')]));
}
export function probeCandidates(paths: readonly string[], platform: EnforcementPlatform, previousPaths: readonly string[] = []): string[] {
    const retained = [...new Set([...previousPaths, ...paths])];
    return [...new Set([...names, ...retained.map(path => platform === 'win32' ? win32.basename(path) : basename(path)),
        ...knownPaths(platform), ...retained])];
}
function collectProbes(inventory: Inventory, platform: EnforcementPlatform, previousPaths: readonly string[] = []): Probe[] {
    return probeCandidates(inventory.paths, platform, previousPaths).flatMap(candidate => probesForCandidate(candidate, platform));
}
export function assertProbes(probes: readonly Probe[]): void {
    const failed = probes.filter(probe => probe.outcome !== 'denied' && probe.outcome !== 'unavailable');
    if (failed.length) throw new Error('Interpreter execution is not blocked: ' +
        failed.map(probe => probe.candidate + ' (' + probe.outcome + ')').join(', '));
}
export function assertUnavailableProbes(probes: readonly Probe[]): void {
    const failed = probes.filter(probe => probe.outcome !== 'unavailable');
    if (failed.length) throw new Error('Interpreter removal did not produce unavailable controls: ' +
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
    if (state.formatVersion !== 1 || !['linux', 'win32'].includes(state.platform)
        || !Array.isArray(state.removalTargets) || !Array.isArray(state.removals))
        throw new Error('Invalid platform enforcement state');
    return state;
}
const systemCommand = (name: string) => join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', name);
/** Pure controller: callers provide the removal operation; the native Windows operation guards itself. */
export function removeTargets(targets: readonly RemovalTarget[], records: RemovalRecord[], remove: (path: string) => void,
    persist: () => void = () => {}): string[] {
    records.push(...targets.map(target => ({ ...target, outcome: 'planned' as const })));
    persist(); // Persist the whole plan before any target can be removed.
    const errors: string[] = [];
    for (const entry of records) {
        entry.outcome = 'removing';
        persist(); // Persist intent even if a native call partially succeeds before failing.
        try {
            remove(entry.path);
            entry.outcome = 'removed';
        } catch (error) {
            entry.errorCode = (error as NodeJS.ErrnoException).code;
            entry.error = message(error);
            if (entry.errorCode === 'ENOENT' || entry.errorCode === 'ENOTDIR') entry.outcome = 'missing';
            else {
                entry.outcome = 'failed';
                errors.push(entry.path + ': ' + entry.error);
            }
        }
        persist();
    }
    return errors;
}
export interface RemovalProbeOperations { readonly native: (path: string) => Probe; readonly read: (path: string) => Probe }
export function probeRemovalPaths(paths: readonly string[], operations: RemovalProbeOperations = { native: probeExecutable, read: probeScriptRead }): Probe[] {
    return [...new Set(paths)].flatMap(path => [operations.native(path), operations.read(path)]);
}
function removeWindowsFile(path: string): void {
    assertDisposableWindows();
    if ([process.execPath, realpathSync(process.execPath)].some(protectedPath => windowsPathKey(path) === windowsPathKey(protectedPath)))
        throw new Error('Cannot remove the running Node executable: ' + path);
    unlinkSync(path); // File/link primitive: no pre-stat, recursive removal or permission changes.
}
export function assertRemovalInventory(paths: readonly string[], originalPaths: readonly string[]): void {
    const originals = new Set(originalPaths.map(windowsPathKey));
    const additions = paths.filter(path => !originals.has(windowsPathKey(path)));
    if (additions.length) throw new Error('Install introduced new interpreter paths: ' + additions.join(', '));
}
export function cleanupEnvironment(report: string): EnvironmentEnforcement {
    const state = readState(report);
    if (state.platform === 'win32') assertDisposableWindows();
    const expectedDirectory = resolve(dirname(report), 'platform-enforcement-state');
    if (resolve(state.stateDirectory) !== expectedDirectory) throw new Error('Unexpected task-control state directory');
    const errors: string[] = [];
    try { rmSync(expectedDirectory, { recursive: true, force: true }); }
    catch (error) { errors.push(message(error)); }
    state.cleanupErrors = errors;
    if (!errors.length) {
        state.phase = 'cleaned';
        state.cleanedAt ??= new Date().toISOString();
    }
    writeState(report, state);
    if (errors.length) throw new Error('Task-control cleanup failed: ' + errors.join('; '));
    return state;
}
export function enforceEnvironment(report: string): EnvironmentEnforcement {
    if (process.platform !== 'linux' && process.platform !== 'win32') throw new Error('Unqualified platform: ' + process.platform);
    const platform = process.platform;
    const disposableHost = platform === 'win32' ? assertDisposableWindows() : undefined;
    if (existsSync(report) && readState(report).phase !== 'cleaned') throw new Error('Clean the previous enforcement state before replacing it');
    const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
    const stateDirectory = resolve(dirname(report), 'platform-enforcement-state');
    mkdirSync(stateDirectory, { recursive: true });
    const state: EnvironmentEnforcement = { formatVersion: 1, platform, node: process.version,
        arch: process.arch, osRelease: release(), startedAt: new Date().toISOString(),
        testedRevision: git('rev-parse', 'HEAD'), testedTree: git('rev-parse', 'HEAD^{tree}'),
        workingTreeDirty: git('status', '--porcelain').length > 0,
        sourceHash: sha(fileURLToPath(import.meta.url)),
        packageLockHash: sha('package-lock.json'), nodeExecutableHash: sha(process.execPath),
        stateDirectory, strategy: platform === 'win32' ? 'disposable-windows-removal' : 'linux-absence',
        disposableHost, phase: 'preparing', qualified: false, removalTargets: [], removals: [] };
    writeState(report, state);
    try {
        state.inventory = platformInventory(platform);
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
            if (before.outcome !== 'started' || before.status !== 0) throw new Error('Copied Node control cannot execute before removal');
            state.control = { path: controlPath, sourceHash: sha(controlPath), before };
            writeState(report, state);
            const preparation = prepareWindowsRemoval([...state.inventory.paths, controlPath], state.inventory.fileAliases);
            state.removalTargets = preparation.targets;
            state.targetLookups = preparation.targetLookups;
            state.aliasLookups = preparation.aliasLookups;
            state.targetPreparationErrors = preparation.errors;
            writeState(report, state);
            if (preparation.errors.length) throw new Error('Incomplete Windows target enforcement: ' + preparation.errors.join('; '));
            state.removalErrors = removeTargets(state.removalTargets, state.removals, removeWindowsFile, () => writeState(report, state));
            if (state.removalErrors.length) throw new Error('Windows interpreter removal failed: ' + state.removalErrors.join('; '));
            state.control.after = probeExecutable(controlPath);
            assertUnavailableProbes([state.control.after]);
        }
        const removedPaths = state.removalTargets.map(target => target.path);
        state.initialProbes = [...collectProbes(state.inventory, platform, removedPaths),
            ...(platform === 'win32' ? probeRemovalPaths(removedPaths) : [])];
        if (platform === 'win32') assertUnavailableProbes(state.initialProbes);
        else assertProbes(state.initialProbes);
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
        try { cleanupEnvironment(report); } catch { /* The persisted cleanup failures remain visible. */ }
        throw error;
    }
}
export function verifyEnvironment(report: string): EnvironmentEnforcement {
    const state = readState(report);
    if (!['enforced', 'verified'].includes(state.phase) || !state.qualified) throw new Error('No active qualified environment control');
    try {
        if (state.platform === 'win32') assertDisposableWindows();
        if (state.platform !== process.platform || state.node !== process.version || state.nodeExecutableHash !== sha(process.execPath))
            throw new Error('Environment changed after interpreter enforcement');
        if (state.packageLockHash !== sha('package-lock.json')) throw new Error('Install changed the package lock');
        if (state.sourceHash !== sha(fileURLToPath(import.meta.url))) throw new Error('Enforcement source changed during qualification');
        const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
        if (state.testedRevision !== git('rev-parse', 'HEAD') || state.testedTree !== git('rev-parse', 'HEAD^{tree}'))
            throw new Error('Git candidate changed during qualification');
        state.verificationInventory = platformInventory(state.platform);
        if (state.verificationInventory.errors.length) throw new Error('Incomplete verification inventory: ' + state.verificationInventory.errors.join('; '));
        if (state.platform === 'win32') {
            if (!state.control) throw new Error('Missing copied Node removal control');
            assertUnavailableProbes([probeExecutable(state.control.path)]);
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
        const originalPaths = [...state.inventory?.paths ?? [], ...state.removalTargets.map(target => target.path)];
        state.verificationProbes = [...collectProbes(state.verificationInventory, state.platform, originalPaths),
            ...(state.platform === 'win32' ? probeRemovalPaths([...originalPaths, ...state.verificationInventory.paths]) : [])];
        if (state.platform === 'win32') {
            // Registered paths can remain inventoried after deletion; actual unavailable probes decide absence.
            assertRemovalInventory(state.verificationInventory.paths, originalPaths);
            assertUnavailableProbes(state.verificationProbes);
        } else assertProbes(state.verificationProbes);
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
            : action === 'cleanup' ? cleanupEnvironment(report) : (() => { throw new Error('Expected enforce, verify or cleanup'); })();
        console.log(JSON.stringify({ report, phase: result.phase, qualified: result.qualified,
            inventoriedPaths: result.inventory?.paths.length, directoriesRead: result.inventory?.directoriesRead,
            probes: (result.verificationProbes ?? result.initialProbes)?.length,
            removals: result.removals.length, removalErrors: result.removalErrors, cleanupErrors: result.cleanupErrors }));
    } catch (error) { console.error(message(error)); process.exitCode = 1; }
}
