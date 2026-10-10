/** Dependency-free execution controls, run with Node's built-in TypeScript stripping before npm ci. */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { accessSync, chmodSync, constants, copyFileSync, existsSync, mkdirSync, readFileSync,
    readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
export interface AclTarget {
    readonly path: string;
    readonly kind: 'link' | 'file';
    // Deny file data and execution without READ_CONTROL, which native ACL restoration needs.
    readonly permission: 'X' | 'RD,X';
}
export interface AclBackup extends AclTarget {
    readonly backup: string;
    applied: boolean;
    restored: boolean;
}
export interface AliasLookup { readonly alias: FileAlias; readonly canonicalization: Canonicalization }
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
    aliasLookups?: readonly AliasLookup[];
    targetPreparationErrors?: readonly string[];
    control?: { path: string; sourceHash: string; before: Probe; after?: Probe };
    enforcedAt?: string;
    verifiedAt?: string;
    restoredAt?: string;
    failure?: string;
    restoreErrors?: readonly string[];
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
export function prepareWindowsTargets(paths: readonly string[], fileAliases: readonly FileAlias[], operations: TargetOperations = targetOperations): {
    targets: AclTarget[]; aliasLookups: AliasLookup[]; errors: string[];
} {
    const targets = new Map<string, AclTarget>();
    const add = (target: AclTarget): void => {
        const key = target.kind + ':' + target.path.toLowerCase();
        const previous = targets.get(key);
        targets.set(key, previous?.permission === 'RD,X' ? previous : target);
    };
    const file = (path: string): AclTarget => ({ path, kind: 'file',
        permission: scriptExtension.test(path) || isWindowsLogicalWrapperPath(path) ? 'RD,X' : 'X' });
    const aliases = new Map(fileAliases.map(alias => [alias.path.toLowerCase(), alias]));
    const aliasLookups: AliasLookup[] = [];
    const errors: string[] = [];
    for (const path of [...new Set(paths)].sort()) {
        const lookup = canonicalization(path, operations);
        const alias = aliases.get(path.toLowerCase());
        if (alias) aliasLookups.push({ alias, canonicalization: lookup });
        if (alias?.dirent === 'symbolic-link') {
            // Lookup errors do not prove denial. Control the inventoried link object itself;
            // only actual negative probes after icacls /L can establish blocked execution.
            add({ path, kind: 'link', permission: 'RD,X' });
            if (lookup.outcome === 'resolved' && lookup.target.toLowerCase() !== path.toLowerCase())
                add({ path: lookup.target, kind: 'file', permission: 'RD,X' });
        } else if (lookup.outcome === 'resolved') {
            add(file(path));
            add(file(lookup.target));
        } else errors.push('Ordinary ACL target cannot be canonicalized: ' + path + ' (' + lookup.error + ')');
    }
    return { targets: [...targets.values()].sort((left, right) => left.path.localeCompare(right.path) || left.kind.localeCompare(right.kind)), aliasLookups, errors };
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

/** Enumerate canonical directory targets once; file aliases remain separate ACL/probe candidates. */
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
export type AclInvoker = (args: readonly string[], cwd?: string) => void;
const linkOptions = (target: AclTarget): string[] => target.kind === 'link' ? ['/L'] : [];
export function saveAndDenyTargets(targets: readonly AclTarget[], backups: AclBackup[], stateDirectory: string, sid: string,
    invoke: AclInvoker = icacls, persist: () => void = () => {}): void {
    // Save every link-object and physical-file original before mutating either one.
    for (const target of targets) {
        const backup = join(stateDirectory, 'acl-' + String(backups.length).padStart(5, '0') + '.txt');
        invoke([win32.basename(target.path), '/save', backup, ...linkOptions(target), '/q'], win32.dirname(target.path));
        backups.push({ ...target, backup, applied: false, restored: false });
        persist();
    }
    for (const entry of backups) {
        entry.applied = true; // Persist intent before a partially failing native mutation too.
        persist();
        invoke([entry.path, '/deny', '*' + sid + ':(' + entry.permission + ')', ...linkOptions(entry), '/q']);
    }
}
export function restoreAclBackups(backups: readonly AclBackup[], invoke: AclInvoker = icacls, persist: () => void = () => {}): string[] {
    const errors: string[] = [];
    for (const entry of [...backups].reverse()) {
        if (!entry.applied || entry.restored) continue;
        try {
            invoke([win32.dirname(entry.path), '/restore', entry.backup, ...linkOptions(entry), '/q']);
            entry.restored = true;
            persist();
        } catch (error) { errors.push(entry.path + ': ' + message(error)); }
    }
    return errors;
}
export interface LinkProbeOperations { readonly native: (path: string) => Probe; readonly read: (path: string) => Probe }
export function probeAclLinks(targets: readonly AclTarget[], operations: LinkProbeOperations = { native: probeExecutable, read: probeScriptRead }): Probe[] {
    return targets.filter(target => target.kind === 'link').flatMap(target => [operations.native(target.path), operations.read(target.path)]);
}
function saveAndDeny(state: EnvironmentEnforcement, report: string, targets: readonly AclTarget[]): void {
    const command = systemCommand('whoami.exe');
    const output = execFileSync(command, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
    const sid = output.match(/S-\d+(?:-\d+)+/)?.[0];
    if (!sid) throw new Error('Cannot identify Windows runner SID');
    state.sid = sid;
    saveAndDenyTargets(targets, state.aclBackups, state.stateDirectory, sid, icacls, () => writeState(report, state));
}
export function restoreEnvironment(report: string): EnvironmentEnforcement {
    const state = readState(report);
    const errors = restoreAclBackups(state.aclBackups, icacls, () => writeState(report, state));
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
            if (before.outcome !== 'started' || before.status !== 0) throw new Error('Copied Node control cannot execute before ACL denial');
            state.control = { path: controlPath, sourceHash: sha(controlPath), before };
            writeState(report, state);
            const preparation = prepareWindowsTargets([...state.inventory.paths, controlPath], state.inventory.fileAliases);
            state.aliasLookups = preparation.aliasLookups;
            state.targetPreparationErrors = preparation.errors;
            // Lookup failures remain diagnostic; only denied execution/read probes after ACLs qualify.
            writeState(report, state);
            if (preparation.errors.length) throw new Error('Incomplete Windows target enforcement: ' + preparation.errors.join('; '));
            saveAndDeny(state, report, preparation.targets);
            state.control.after = probeExecutable(controlPath);
            if (state.control.after.outcome !== 'denied') throw new Error('Windows execute ACL did not block the copied Node control');
        }
        state.initialProbes = [...collectProbes(state.inventory, platform),
            ...(platform === 'win32' ? probeAclLinks(state.aclBackups) : [])];
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
        state.verificationInventory = platformInventory(state.platform);
        if (state.verificationInventory.errors.length) throw new Error('Incomplete verification inventory: ' + state.verificationInventory.errors.join('; '));
        if (state.platform === 'win32') {
            const controlled = new Set(state.aclBackups.filter(entry => entry.applied && !entry.restored)
                .map(entry => entry.kind + ':' + entry.path.toLowerCase()));
            const links = new Set(state.verificationInventory.fileAliases.filter(alias => alias.dirent === 'symbolic-link')
                .map(alias => alias.path.toLowerCase()));
            const additions = state.verificationInventory.paths.filter(path =>
                !controlled.has((links.has(path.toLowerCase()) ? 'link:' : 'file:') + path.toLowerCase()));
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
        state.verificationProbes = [...collectProbes(state.verificationInventory, state.platform, state.inventory?.paths ?? []),
            ...(state.platform === 'win32' ? probeAclLinks(state.aclBackups.filter(entry => entry.applied && !entry.restored)) : [])];
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
