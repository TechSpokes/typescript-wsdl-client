import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { assertDisposableWindows, assertProbes, assertRemovalInventory, assertUnavailableProbes, classifySpawn, cleanupEnvironment,
    inventoryInterpreters, isInterpreterName, isWindowsLogicalWrapperPath,
    parseRegistryInstallPaths, prepareWindowsRemoval, probeCandidates, probeExecutable, probeRemovalPaths, probesForCandidate, removeTargets,
    windowsInstallationPlan } from './environment.js';
import type { EnvironmentEnforcement, FileAlias, Probe, RemovalRecord, RemovalTarget, TargetOperations, WindowsInstallationContext } from './environment.js';

function fixtureContext(root: string): WindowsInstallationContext {
    return { driveRoot: resolve(root), windows: resolve(root, 'Windows'), users: resolve(root, 'Users'),
        programData: resolve(root, 'ProgramData'), programFiles: [resolve(root, 'Program Files'), resolve(root, 'Program Files (x86)')],
        recursiveDirectories: [resolve(root, 'workspace'), resolve(root, 'runner-temp'), resolve(root, 'hostedtoolcache')],
        pathDirectories: [resolve(root, 'path-commands')] };
}
function fixtureFile(root: string, path: string): string {
    const absolute = resolve(root, ...path.split('/'));
    mkdirSync(resolve(absolute, '..'), { recursive: true });
    writeFileSync(absolute, 'non-executable inventory fixture');
    return absolute;
}
const storeAlias: FileAlias = { path: 'C:\\Users\\runner\\AppData\\Local\\Microsoft\\WindowsApps\\python.exe',
    dirent: 'symbolic-link', identification: 'symbolic-file-alias' };
function failedProbe(candidate: string, method: Probe['method'], code = 'EACCES'): Probe {
    return { ...classifySpawn(candidate, { status: null, error: Object.assign(new Error(code), { code }) }), method };
}
function failedLookup(code = 'EACCES'): TargetOperations {
    return { canonicalize: path => { throw Object.assign(new Error(path + ': ' + code), { code }); } };
}

describe('interpreter execution qualification controls', () => {
    it('does not equate a failed interpreter exit with a blocked spawn', () => {
        const candidate = process.execPath;
        expect(probeExecutable(candidate, ['--definitely-not-a-real-node-option'])).toMatchObject({ outcome: 'started', status: 9 });
        expect(classifySpawn('candidate', { pid: 42, status: null, error: Object.assign(new Error(), { code: 'ETIMEDOUT' }) }))
            .toMatchObject({ outcome: 'started', errorCode: 'ETIMEDOUT' });
    });
    it('accepts only missing or permission-denied spawn failures', () => {
        for (const code of ['ENOENT', 'ENOTDIR'])
            expect(classifySpawn('candidate', { status: null, error: Object.assign(new Error(), { code }) }).outcome).toBe('unavailable');
        for (const code of ['EACCES', 'EPERM'])
            expect(classifySpawn('candidate', { status: null, error: Object.assign(new Error(), { code }) }).outcome).toBe('denied');
        for (const code of ['EINVAL', 'ENOEXEC', 'ETIMEDOUT'])
            expect(classifySpawn('candidate', { status: null, error: Object.assign(new Error(), { code }) }).outcome).toBe('unresolved');
    });
    it('inventories versions, launchers and shell wrappers without mistaking ordinary source text for binaries', () => {
        for (const name of ['python', 'python3.14t.exe', 'pythonw.exe', 'pip3.13', 'py.exe', 'pyw.exe', 'pypy3', 'python.cmd', 'pip.ps1'])
            expect(isInterpreterName(name), name).toBe(true);
        for (const name of ['python.py', 'python.ts', 'python-usage.md', 'libpython3.13.so'])
            expect(isInterpreterName(name), name).toBe(false);
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/platform-inventory-');
        try {
            mkdirSync(join(root, 'nested'));
            writeFileSync(join(root, 'nested', 'python.exe'), 'non-executable fixture');
            writeFileSync(join(root, 'nested', 'python.ts'), 'historical prose');
            const inventory = inventoryInterpreters([{ path: root, recursive: true }]);
            expect(inventory.errors).toEqual([]);
            expect(inventory.paths).toEqual([resolve(root, 'nested', 'python.exe')]);
            expect(inventory.directoriesRead).toBe(2);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('requires read protection for versioned logical wrappers and extensionless registered launchers', () => {
        for (const name of ['python', 'python3.14', 'python3.14t', 'python3.14_d', 'pip3.13', 'pypy3.10', 'pyw', 'custom-launcher'])
            expect(isWindowsLogicalWrapperPath('C:\\qualification-control\\' + name), name).toBe(true);
        for (const name of ['python.exe', 'python3.14.EXE', 'pyw.exe', 'python.com', 'python.bin', 'python.real',
            'python.cmd', 'python.bat', 'pip.ps1', 'py.js', 'custom-launcher.exe', 'python.ts', 'library.so'])
            expect(isWindowsLogicalWrapperPath('C:\\qualification-control\\' + name), name).toBe(false);
        expect(isWindowsLogicalWrapperPath('python3.14')).toBe(false); // Named PATH controls remain native spawn probes.
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/versioned-wrapper-controls-');
        try {
            for (const name of ['python3.14', 'pip3.13', 'custom-launcher']) {
                const candidate = fixtureFile(root, name);
                const probes = probesForCandidate(candidate, 'win32');
                expect(probes.map(probe => probe.method)).toEqual(['spawn', 'script-read']);
                // Readable text has not been blocked, regardless of whether its native spawn failed.
                expect(probes[1]).toMatchObject({ candidate, outcome: 'unresolved', method: 'script-read' });
                expect(probesForCandidate(candidate, 'linux').map(probe => probe.method)).toEqual(['spawn']);
            }
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('follows Linux directory aliases once and retains interpreter aliases', () => {
        if (process.platform === 'win32') return; // Windows alias creation requires privileges; hosted removal controls are separate.
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/platform-links-');
        try {
            mkdirSync(join(root, 'nested'));
            writeFileSync(join(root, 'nested', 'python3'), 'non-executable fixture');
            symlinkSync(join(resolve(root), 'nested'), join(root, 'directory-alias'));
            symlinkSync(join(resolve(root), 'nested', 'python3'), join(root, 'py'));
            const inventory = inventoryInterpreters([{ path: root, recursive: true }]);
            expect(inventory.errors).toEqual([]);
            expect(inventory.paths.some(path => path.endsWith('/py'))).toBe(true);
            expect(inventory.paths.some(path => path.endsWith('/python3'))).toBe(true);
            expect(inventory.directoriesRead).toBe(2);
            expect(inventory.aliases).toContainEqual({ path: resolve(root, 'directory-alias'), target: resolve(root, 'nested') });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('finds hosted embedded interpreters, package managers, user installs, Store aliases and registered nonstandard roots', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/windows-installations-');
        try {
            const layouts = [
                'Miniconda/pkgs/python-version/python.exe',
                'Program Files (x86)/Android/AndroidNDK/toolchains/python3/python.exe',
                'Program Files (x86)/pipx/venvs/yamllint/Scripts/python.exe',
                'Program Files/Amazon/AWSSAMCLI/runtime/python.exe',
                'Program Files/Microsoft SDKs/Azure/CLI2/Scripts/pip.exe',
                'Program Files/PostgreSQL/17/pgAdmin 4/python/python.exe',
                'Program Files/dotnet/packs/embedded/tools/python.exe',
                'Program Files/WindowsApps/PythonSoftwareFoundation/runtime/python.exe',
                'hostedtoolcache/windows/Python/3.14/x64/python.exe',
                'hostedtoolcache/windows/PyPy/version/x86/pypy.exe',
                'msys64/usr/share/bash-completion/helpers-core/python',
                'mingw64/opt/bin/python3.14.exe',
                'ProgramData/chocolatey/lib/python/tools/python.exe',
                'ProgramData/scoop/apps/python/current/python.exe',
                'ProgramData/Microsoft/VisualStudio/Packages/python/python.exe',
                'Users/runner/AppData/Local/Programs/Python/Python314/python.exe',
                'Users/runner/AppData/Local/Microsoft/WindowsApps/python.exe',
                'Users/runner/AppData/Local/Packages/PythonSoftwareFoundation.Python/LocalCache/pip.exe',
                'Users/runner/AppData/Local/uv/python/cpython/python.exe',
                'Users/runner/AppData/Roaming/Python/Scripts/pip.exe',
                'Users/runner/.pyenv/versions/3.14/python.exe',
                'Users/runner/.virtualenvs/example/Scripts/python.exe',
                'Users/runner/.local/share/uv/python/python.exe',
                'Users/runner/miniconda3/python.exe',
                'Users/runner/scoop/apps/python/current/python.exe',
                'workspace/.venv/Scripts/python.exe', 'runner-temp/python.exe', 'path-commands/python.exe',
                'Windows/py.exe', 'Windows/System32/python.exe', 'Windows/SysWOW64/python.exe',
                'Windows/System32/config/systemprofile/AppData/Local/Programs/Python/python.exe',
                'Windows/System32/config/systemprofile/AppData/Local/Microsoft/WindowsApps/python.exe',
                'registered-elsewhere/runtime/custom-launcher.exe',
            ];
            const paths = layouts.map(path => fixtureFile(root, path));
            const plan = windowsInstallationPlan({ ...fixtureContext(root), registry: [{ key: 'fixture-registry', view: '64', outcome: 'found',
                installPaths: [resolve(root, 'registered-elsewhere')], executablePaths: [paths.at(-1)!] }] });
            const inventory = inventoryInterpreters(plan.roots, plan.exclusions, { ...plan, platform: 'win32' });
            expect(inventory.errors).toEqual([]);
            expect(inventory.paths).toEqual([...paths].sort());
            expect(inventory.registry).toEqual(plan.registry);
            expect(inventory.fileAliases).toContainEqual({ path: resolve(root, 'Users/runner/AppData/Local/Microsoft/WindowsApps/python.exe'),
                dirent: 'file', identification: 'windows-apps-command-entry' });
            expect(inventory.roots.some(entry => entry.path === resolve(root, 'Windows', 'System32') && !entry.recursive)).toBe(true);
            expect(inventory.roots.some(entry => entry.path === resolve(root, 'ProgramData') && !entry.recursive)).toBe(true);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('records the protected OS-data boundary without claiming unreadable installation roots are blocked interpreters', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/windows-scope-');
        try {
            const outside = fixtureFile(root, 'Windows/System32/config/unrelated-data/python.exe');
            const protectedData = fixtureFile(root, 'Program Files/Windows Defender Advanced Threat Protection/Configuration/python.exe');
            const inside = fixtureFile(root, 'Program Files/real-application/python.exe');
            const plan = windowsInstallationPlan(fixtureContext(root));
            const inventory = inventoryInterpreters(plan.roots, plan.exclusions, { ...plan, platform: 'win32', readDirectory: path => {
                if (path === resolve(inside, '..') || path === resolve(protectedData, '..'))
                    throw Object.assign(new Error('unreadable chosen directory'), { code: 'EACCES' });
                return readdirSync(path, { withFileTypes: true });
            } });
            expect(inventory.paths).not.toContain(outside);
            expect(inventory.errors).toHaveLength(1);
            expect(inventory.errors[0]).toContain(resolve(inside, '..'));
            expect(inventory.scopeExclusions).toContainEqual({ path: resolve(protectedData, '..'),
                reason: 'Protected security-service configuration, outside interpreter installation scope' });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('rejects an explicitly selected excluded root while preserving the exclusion during ordinary recursion', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/selected-exclusion-controls-');
        try {
            const excluded = resolve(root, 'protected-data');
            fixtureFile(root, 'protected-data/python.exe');
            const ordinary = fixtureFile(root, 'application/python.exe');
            const recursive = inventoryInterpreters([{ path: root, recursive: true }], [excluded]);
            expect(recursive.errors).toEqual([]);
            expect(recursive.paths).toEqual([ordinary]);
            const explicit = inventoryInterpreters([{ path: excluded, recursive: false }], [excluded]);
            expect(explicit.errors).toHaveLength(1);
            expect(explicit.errors[0]).toContain('Selected installation inventory root conflicts with scope exclusion');
            expect(explicit.directoriesRead).toBe(0);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('rejects registered and PATH selections inside excluded data, including canonical directory aliases', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/registered-exclusion-controls-');
        try {
            const candidate = fixtureFile(root, 'Windows/System32/config/registered-install/python.exe');
            const excluded = resolve(root, 'Windows', 'System32', 'config');
            const selected = resolve(candidate, '..');
            const alias = resolve(root, 'registered-alias');
            symlinkSync(selected, alias, process.platform === 'win32' ? 'junction' : 'dir');
            for (const path of [selected, alias]) {
                for (const selection of ['path', 'registry'] as const) {
                    const inventory = inventoryInterpreters([{ path, recursive: true, selection }], [excluded]);
                    expect(inventory.errors).toHaveLength(1);
                    expect(inventory.errors[0]).toContain('Selected ' + selection + ' inventory root conflicts with scope exclusion');
                    expect(inventory.directoriesRead).toBe(0);
                    if (path === alias) expect(inventory.aliases).toContainEqual({ path: alias, target: selected });
                }
            }
            const plan = windowsInstallationPlan({ ...fixtureContext(root), pathDirectories: [selected], registry: [{
                key: 'fixture-registry', view: '64', outcome: 'found', installPaths: [alias], executablePaths: [],
            }] });
            const inventory = inventoryInterpreters(plan.roots, plan.exclusions, { ...plan, platform: 'win32' });
            expect(inventory.errors).toHaveLength(2);
            expect(inventory.errors.some(error => error.startsWith('Selected path'))).toBe(true);
            expect(inventory.errors.some(error => error.startsWith('Selected registry'))).toBe(true);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('rejects an explicitly selected canonical alias to an excluded root itself', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/canonical-exclusion-controls-');
        try {
            const target = resolve(fixtureFile(root, 'excluded/python.exe'), '..');
            const alias = resolve(root, 'alias');
            symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
            const inventory = inventoryInterpreters([{ path: alias, recursive: true }], [target]);
            expect(inventory.errors).toHaveLength(1);
            expect(inventory.errors[0]).toContain('Selected installation inventory root conflicts with scope exclusion');
            expect(inventory.aliases).toContainEqual({ path: alias, target });
            expect(inventory.directoriesRead).toBe(0);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('enumerates canonical directory aliases and keeps an unsuccessful read eligible for retry while retaining the failure', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/windows-junctions-');
        try {
            const candidate = fixtureFile(root, 'physical/python.exe');
            const target = resolve(root, 'physical');
            const alias = resolve(root, 'legacy-junction');
            symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
            let attempts = 0;
            const inventory = inventoryInterpreters([{ path: target, recursive: true }, { path: alias, recursive: true }], [], {
                readDirectory: path => {
                    expect(path).toBe(target);
                    if (++attempts === 1) throw Object.assign(new Error('failed installation read'), { code: 'EACCES' });
                    return readdirSync(path, { withFileTypes: true });
                },
            });
            expect(attempts).toBe(2);
            expect(inventory.directoriesRead).toBe(1);
            expect(inventory.paths).toEqual([candidate]);
            expect(inventory.errors).toHaveLength(1);
            expect(inventory.aliases).toContainEqual({ path: alias, target });
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('retains interpreter file aliases without statting unrelated Windows executable aliases', () => {
        if (process.platform === 'win32') return; // File symlinks need Windows privilege; hosted AppExecLinks provide the actual control.
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/windows-file-aliases-');
        try {
            symlinkSync(resolve(root, 'absent-target'), resolve(root, 'ActionsMcpHost.exe'));
            symlinkSync(resolve(root, 'absent-interpreter-target'), resolve(root, 'python.exe'));
            const inventory = inventoryInterpreters([{ path: root, recursive: true }], [], { platform: 'win32' });
            expect(inventory.errors).toEqual([]);
            expect(inventory.paths).toEqual([resolve(root, 'python.exe')]);
            expect(inventory.fileAliases).toEqual([{ path: resolve(root, 'python.exe'), dirent: 'symbolic-link', identification: 'symbolic-file-alias' }]);
            const plan = windowsInstallationPlan(fixtureContext(root));
            expect(plan.errors).toEqual([]);
            expect(plan.roots.some(entry => entry.path === resolve(root, 'python.exe'))).toBe(false);
            expect(inventoryInterpreters(plan.roots, plan.exclusions, { ...plan, platform: 'win32' }).errors).toEqual([]);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('plans every original path and canonical physical destination before any removal', () => {
        const physical = 'C:\\tools\\embedded-runtime.exe';
        const registered = 'C:\\registered\\custom-launcher.exe';
        const wrapper = 'C:\\wrappers\\python3.14';
        const preparation = prepareWindowsRemoval([registered, wrapper, physical, storeAlias.path], [storeAlias], {
            canonicalize: path => path === storeAlias.path ? physical : path,
        });
        expect(preparation.errors).toEqual([]);
        expect(preparation.targets).toEqual(expect.arrayContaining([
            { path: physical, kind: 'file' }, { path: registered, kind: 'file' },
            { path: wrapper, kind: 'file' }, { path: storeAlias.path, kind: 'link' },
        ]));
        expect(preparation.targets).toHaveLength(4);
        expect(preparation.targetLookups).toHaveLength(4);
        expect(preparation.aliasLookups).toEqual([{ alias: storeAlias, canonicalization: { outcome: 'resolved', target: physical } }]);
        expect(Object.isFrozen(preparation.targets)).toBe(true);
        expect(preparation.targets.every(Object.isFrozen)).toBe(true);
    });
    it('can plan an identified link object with failed lookup while rejecting unresolved ordinary targets', () => {
        for (const code of ['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EINVAL', 'EIO']) {
            const preparation = prepareWindowsRemoval([storeAlias.path], [storeAlias], failedLookup(code));
            expect(preparation.targets).toEqual([{ path: storeAlias.path, kind: 'link' }]);
            expect(preparation.errors).toEqual([]);
            expect(preparation.aliasLookups).toEqual([{ alias: storeAlias,
                canonicalization: { outcome: 'failed', errorCode: code, error: storeAlias.path + ': ' + code } }]);
            const ordinary = prepareWindowsRemoval([storeAlias.path], [], failedLookup(code));
            expect(ordinary.targets).toEqual([]);
            expect(ordinary.errors).toHaveLength(1);
            const fileInAliasDirectory: FileAlias = { ...storeAlias, dirent: 'file', identification: 'windows-apps-command-entry' };
            expect(prepareWindowsRemoval([storeAlias.path], [fileInAliasDirectory], failedLookup(code)).errors).toHaveLength(1);
        }
    });
    it('protects both the running Node path and its resolved executable from direct or aliased removal', () => {
        const node = 'C:\\tools\\node.exe';
        const physical = 'C:\\physical\\node.exe';
        const alias: FileAlias = { ...storeAlias, path: 'C:\\aliases\\python.exe' };
        for (const protectedPath of [node, physical]) {
            const preparation = prepareWindowsRemoval([protectedPath.toUpperCase(), alias.path], [alias], {
                canonicalize: path => path === alias.path ? protectedPath : path,
            }, [node, physical]);
            expect(preparation.errors.some(error => error.includes('running Node executable'))).toBe(true);
            expect(preparation.targets).not.toEqual(expect.arrayContaining([{ path: protectedPath, kind: 'file' }]));
            expect(preparation.targets.filter(target => target.kind === 'file')).toEqual([]);
        }
    });
    it('requires Windows, GitHub-hosted infrastructure and the explicit task marker for native removal', () => {
        const accepted = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', NODE_REFERENCE_DISPOSABLE_WINDOWS: 'true' };
        expect(assertDisposableWindows('win32', accepted)).toEqual({
            githubActions: 'true', runnerEnvironment: 'github-hosted', taskMarker: 'true',
        });
        for (const platform of ['linux', 'darwin'] as const)
            expect(() => assertDisposableWindows(platform, accepted)).toThrow('disposable GitHub-hosted Windows runner');
        for (const key of Object.keys(accepted)) {
            const missing: NodeJS.ProcessEnv = { ...accepted };
            delete missing[key];
            expect(() => assertDisposableWindows('win32', missing)).toThrow('disposable GitHub-hosted Windows runner');
        }
        for (const rejected of [
            { ...accepted, GITHUB_ACTIONS: 'True' }, { ...accepted, RUNNER_ENVIRONMENT: 'self-hosted' },
            { ...accepted, NODE_REFERENCE_DISPOSABLE_WINDOWS: 'false' }, {},
        ]) expect(() => assertDisposableWindows('win32', rejected)).toThrow('disposable GitHub-hosted Windows runner');
    });
    it('persists the whole plan and each removal intent, records every error and never skips a target', () => {
        const targets: RemovalTarget[] = [
            { path: 'C:\\tools\\python.exe', kind: 'file' }, { path: storeAlias.path, kind: 'link' },
            { path: 'C:\\tools\\pip.exe', kind: 'file' },
        ];
        const records: RemovalRecord[] = [];
        const snapshots: string[][] = [];
        const calls: string[] = [];
        const errors = removeTargets(targets, records, path => {
            expect(records).toHaveLength(targets.length);
            expect(records.find(record => record.path === path)?.outcome).toBe('removing');
            expect(snapshots.at(-1)).toContain(path + ':removing');
            calls.push(path);
            if (path === storeAlias.path) throw Object.assign(new Error('Cannot unlink alias'), { code: 'EACCES' });
        }, () => { snapshots.push(records.map(record => record.path + ':' + record.outcome)); });
        expect(snapshots[0]).toEqual(targets.map(target => target.path + ':planned'));
        expect(calls).toEqual(targets.map(target => target.path));
        expect(records.map(record => record.outcome)).toEqual(['removed', 'failed', 'removed']);
        expect(records[1]).toMatchObject({ errorCode: 'EACCES', error: 'Cannot unlink alias' });
        expect(errors).toEqual([storeAlias.path + ': Cannot unlink alias']);
    });
    it('records explicit native absence separately and treats other deletion failures as fatal', () => {
        for (const code of ['ENOENT', 'ENOTDIR', 'EPERM', 'EBUSY', 'EIO']) {
            const records: RemovalRecord[] = [];
            const errors = removeTargets([{ path: storeAlias.path, kind: 'link' }], records, () => {
                throw Object.assign(new Error(code), { code });
            });
            expect(records[0]?.errorCode).toBe(code);
            const missing = code === 'ENOENT' || code === 'ENOTDIR';
            expect(records[0]?.outcome).toBe(missing ? 'missing' : 'failed');
            expect(errors).toHaveLength(missing ? 0 : 1);
        }
    });
    it('proves a copied Node control starts before removal and is actually unavailable afterward', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/removal-node-control-');
        const candidate = resolve(root, 'python.exe');
        try {
            copyFileSync(process.execPath, candidate);
            expect(probeExecutable(candidate, ['--version'])).toMatchObject({ outcome: 'started', status: 0 });
            expect(() => assertUnavailableProbes(probeRemovalPaths([candidate]))).toThrow('unavailable controls');
            const records: RemovalRecord[] = [];
            expect(removeTargets([{ path: candidate, kind: 'file' }], records, path => unlinkSync(path))).toEqual([]);
            expect(records[0]?.outcome).toBe('removed');
            const probes = probeRemovalPaths([candidate]);
            expect(probes.map(probe => probe.method)).toEqual(['spawn', 'script-read']);
            expect(probes.every(probe => probe.outcome === 'unavailable')).toBe(true);
            expect(() => assertUnavailableProbes(probes)).not.toThrow();
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('retains disappeared original aliases, physical destinations and their names while probing registry-retained candidates', () => {
        const physical = 'C:\\tools\\embedded-runtime.exe';
        const registered = 'C:\\registered\\custom-launcher.exe';
        const originals = [storeAlias.path, physical, registered];
        expect(() => assertRemovalInventory([registered], originals)).not.toThrow(); // Registry metadata can outlive a deleted file.
        const native = vi.fn((path: string) => failedProbe(path, 'spawn', 'ENOENT'));
        const read = vi.fn((path: string) => failedProbe(path, 'script-read', 'ENOENT'));
        const probes = probeRemovalPaths([...originals, registered], { native, read });
        expect(probes).toHaveLength(6);
        expect(() => assertUnavailableProbes(probes)).not.toThrow();
        for (const path of originals) {
            expect(native).toHaveBeenCalledWith(path);
            expect(read).toHaveBeenCalledWith(path);
        }
        const disappearedVersionedWrapper = 'C:\\Users\\runner\\AppData\\Local\\Microsoft\\WindowsApps\\pypy3.10.cmd';
        expect(probeCandidates([registered], 'win32', [...originals, disappearedVersionedWrapper]))
            .toEqual(expect.arrayContaining([storeAlias.path, physical, registered, disappearedVersionedWrapper, 'pypy3.10.cmd']));
        expect(() => assertRemovalInventory([...originals, 'C:\\new\\python.exe'], originals)).toThrow('new interpreter paths');
    });
    it('rejects residual readable files, denied controls, unresolved failures and started AppInstaller stubs', () => {
        const native = (path: string) => failedProbe(path, 'spawn', 'ENOENT');
        const read = (path: string) => failedProbe(path, 'script-read', 'ENOENT');
        expect(() => assertUnavailableProbes(probeRemovalPaths([storeAlias.path], { native, read }))).not.toThrow();
        expect(() => assertUnavailableProbes(probeRemovalPaths([storeAlias.path], {
            native: candidate => classifySpawn(candidate, { pid: 8216, status: 9009 }), read,
        }))).toThrow('unavailable controls');
        expect(() => assertUnavailableProbes(probeRemovalPaths([storeAlias.path], {
            native, read: candidate => ({ candidate, method: 'script-read', outcome: 'unresolved', status: null }),
        }))).toThrow('unavailable controls');
        for (const code of ['EACCES', 'EPERM', 'EINVAL'])
            expect(() => assertUnavailableProbes(probeRemovalPaths([storeAlias.path], {
                native: candidate => failedProbe(candidate, 'spawn', code), read,
            }))).toThrow('unavailable controls');
    });
    it('cleans only task-owned control state idempotently without restoring interpreters or changing a failed result', () => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/removal-cleanup-control-');
        const report = resolve(root, 'platform-enforcement.json');
        const stateDirectory = resolve(root, 'platform-enforcement-state');
        mkdirSync(stateDirectory);
        fixtureFile(stateDirectory, 'python');
        const state: EnvironmentEnforcement = {
            formatVersion: 1, platform: 'linux', node: process.version, arch: process.arch, osRelease: 'fixture',
            startedAt: 'fixture', testedRevision: 'fixture', testedTree: 'fixture', workingTreeDirty: false,
            sourceHash: 'fixture', packageLockHash: 'fixture', nodeExecutableHash: 'fixture', stateDirectory,
            strategy: 'linux-absence', phase: 'failed', qualified: false, removalTargets: [], removals: [], failure: 'native removal failed',
        };
        writeFileSync(report, JSON.stringify(state));
        try {
            const first = cleanupEnvironment(report);
            const second = cleanupEnvironment(report);
            expect(first.phase).toBe('cleaned');
            expect(second.cleanedAt).toBe(first.cleanedAt);
            expect(second.qualified).toBe(false);
            expect(second.failure).toBe('native removal failed');
            expect(second.cleanupErrors).toEqual([]);
            expect(JSON.parse(readFileSync(report, 'utf8')) as unknown).not.toHaveProperty('restoredAt');
            expect(() => readFileSync(resolve(stateDirectory, 'python'))).toThrow();
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('reads both PEP 514 executable paths and expanded installation roots, and preserves registry failures', () => {
        const output = ['HKEY_LOCAL_MACHINE\\SOFTWARE\\Python\\PythonCore\\3.14\\InstallPath',
            '    (Default)    REG_EXPAND_SZ    %SYSTEMDRIVE%\\custom-install\\',
            '    ExecutablePath    REG_SZ    C:\\custom-install\\python.exe',
            '    WindowedExecutablePath    REG_SZ    C:\\custom-install\\pythonw.exe'].join('\r\n');
        expect(parseRegistryInstallPaths(output, { SystemDrive: 'C:' })).toEqual({
            installPaths: ['C:\\custom-install\\'], executablePaths: ['C:\\custom-install\\python.exe', 'C:\\custom-install\\pythonw.exe'], errors: [],
        });
        expect(parseRegistryInstallPaths(output, {}).errors).toHaveLength(1);
        mkdirSync('tmp/conformance', { recursive: true });
        const root = mkdtempSync('tmp/conformance/windows-registry-');
        try {
            const plan = windowsInstallationPlan({ ...fixtureContext(root), registry: [{ key: 'fixture-registry', view: '64', outcome: 'error',
                installPaths: [], executablePaths: [], error: 'access denied' }] });
            expect(inventoryInterpreters(plan.roots, plan.exclusions, { ...plan, platform: 'win32' }).errors)
                .toContain('fixture-registry (64-bit): access denied');
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
