import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { assertProbes, classifySpawn, inventoryInterpreters, isInterpreterName, isWindowsLogicalWrapperPath,
    parseRegistryInstallPaths, prepareWindowsTargets, probeAclLinks, probeCandidates, probeExecutable, probesForCandidate,
    restoreAclBackups, saveAndDenyTargets,
    windowsInstallationPlan } from './environment.js';
import type { AclBackup, AclTarget, FileAlias, Probe, TargetOperations, WindowsInstallationContext } from './environment.js';

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
        if (process.platform === 'win32') return; // Windows alias creation requires privileges; hosted ACL controls are separate.
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
    it('prepares separate link-object and resolved file targets with the stronger read denial preserved', () => {
        const canonical = 'C:\\tools\\python.exe';
        const regular = 'C:\\control\\python.exe';
        const preparation = prepareWindowsTargets([regular, canonical, storeAlias.path], [storeAlias], {
            canonicalize: path => path === storeAlias.path ? canonical : path,
        });
        expect(preparation.targets).toEqual(expect.arrayContaining([
            { path: regular, kind: 'file', permission: 'X' },
            { path: canonical, kind: 'file', permission: 'RX' },
            { path: storeAlias.path, kind: 'link', permission: 'RX' },
        ]));
        expect(preparation.targets).toHaveLength(3);
        expect(preparation.errors).toEqual([]);
        expect(preparation.aliasLookups).toEqual([{ alias: storeAlias, canonicalization: { outcome: 'resolved', target: canonical } }]);
    });
    it('controls an identified symbolic link directly while treating lookup failures as diagnostic evidence', () => {
        for (const code of ['EACCES', 'EPERM', 'ENOENT', 'ENOTDIR', 'EINVAL', 'EIO']) {
            const preparation = prepareWindowsTargets([storeAlias.path], [storeAlias], failedLookup(code));
            expect(preparation.targets).toEqual([{ path: storeAlias.path, kind: 'link', permission: 'RX' }]);
            expect(preparation.errors).toEqual([]);
            expect(preparation.aliasLookups).toEqual([{ alias: storeAlias,
                canonicalization: { outcome: 'failed', errorCode: code, error: storeAlias.path + ': ' + code } }]);
            const ordinary = prepareWindowsTargets([storeAlias.path], [], failedLookup(code));
            expect(ordinary.targets).toEqual([]);
            expect(ordinary.errors).toHaveLength(1); // Missing/stat-denied ordinary targets are not silently dropped.
            const fileInAliasDirectory: FileAlias = { ...storeAlias, dirent: 'file', identification: 'windows-apps-command-entry' };
            expect(prepareWindowsTargets([storeAlias.path], [fileInAliasDirectory], failedLookup(code)).errors).toHaveLength(1);
        }
    });
    it('uses /L for link save, RX denial and matching parent-directory restoration, saving all originals first', () => {
        const physical = 'C:\\Applications\\python.exe';
        const targets: AclTarget[] = [{ path: physical, kind: 'file', permission: 'RX' }, { path: storeAlias.path, kind: 'link', permission: 'RX' }];
        const backups: AclBackup[] = [];
        const commands: { args: readonly string[]; cwd?: string }[] = [];
        const invoke = (args: readonly string[], cwd?: string): void => {
            if (args.includes('/deny')) expect(backups.every(backup => !!backup.backup)).toBe(true);
            if (args.includes('/deny')) expect(backups.find(backup => backup.path === args[0])?.applied).toBe(true);
            commands.push({ args: [...args], cwd });
        };
        let persisted = 0;
        saveAndDenyTargets(targets, backups, 'tmp/conformance/icacls-command-control', 'S-1-5-21-239', invoke, () => { persisted++; });
        expect(commands.map(command => command.args[1])).toEqual(['/save', '/save', '/deny', '/deny']);
        expect(commands[0]).toEqual({ args: ['python.exe', '/save', backups[0]!.backup, '/q'], cwd: 'C:\\Applications' });
        expect(commands[1]).toEqual({ args: ['python.exe', '/save', backups[1]!.backup, '/L', '/q'],
            cwd: 'C:\\Users\\runner\\AppData\\Local\\Microsoft\\WindowsApps' });
        expect(commands[2]!.args).toEqual([physical, '/deny', '*S-1-5-21-239:(RX)', '/q']);
        expect(commands[3]!.args).toEqual([storeAlias.path, '/deny', '*S-1-5-21-239:(RX)', '/L', '/q']);
        expect(persisted).toBe(4); // Each saved original and each mutation intent was persisted.
        expect(restoreAclBackups(backups, invoke)).toEqual([]);
        expect(commands.slice(4).map(command => command.args)).toEqual([
            ['C:\\Users\\runner\\AppData\\Local\\Microsoft\\WindowsApps', '/restore', backups[1]!.backup, '/L', '/q'],
            ['C:\\Applications', '/restore', backups[0]!.backup, '/q'],
        ]);
        expect(backups.every(backup => backup.restored)).toBe(true);
    });
    it('restores successful and partially failed denial intents in reverse with their original link/file modes', () => {
        const physical = 'C:\\Applications\\python.exe';
        const targets: AclTarget[] = [{ path: physical, kind: 'file', permission: 'X' }, { path: storeAlias.path, kind: 'link', permission: 'RX' }];
        const backups: AclBackup[] = [];
        const calls: string[][] = [];
        const invoke = (args: readonly string[]): void => {
            calls.push([...args]);
            if (args[0] === storeAlias.path && args.includes('/deny')) throw new Error('partial link denial failure');
        };
        expect(() => saveAndDenyTargets(targets, backups, 'tmp/conformance/icacls-failure-control', 'S-1-5-21-239', invoke)).toThrow('partial link denial failure');
        expect(calls.slice(0, 2).every(args => args.includes('/save'))).toBe(true);
        expect(backups.map(backup => backup.applied)).toEqual([true, true]);
        expect(restoreAclBackups(backups, invoke)).toEqual([]);
        expect(calls.slice(-2).map(args => ({ directory: args[0], link: args.includes('/L') }))).toEqual([
            { directory: 'C:\\Users\\runner\\AppData\\Local\\Microsoft\\WindowsApps', link: true },
            { directory: 'C:\\Applications', link: false },
        ]);
        expect(backups.every(backup => backup.restored)).toBe(true);
    });
    it('never mutates ACLs when saving an original link ACL fails', () => {
        const targets: AclTarget[] = [{ path: 'C:\\Applications\\python.exe', kind: 'file', permission: 'X' },
            { path: storeAlias.path, kind: 'link', permission: 'RX' }];
        const backups: AclBackup[] = [];
        const calls: string[][] = [];
        expect(() => saveAndDenyTargets(targets, backups, 'tmp/conformance/icacls-save-failure-control', 'S-1-5-21-239', args => {
            calls.push([...args]);
            if (args.includes('/L')) throw new Error('link ACL save failed');
        })).toThrow('link ACL save failed');
        expect(calls.every(args => args.includes('/save'))).toBe(true);
        expect(backups.every(backup => !backup.applied)).toBe(true);
        const restore = vi.fn();
        expect(restoreAclBackups(backups, restore)).toEqual([]);
        expect(restore).not.toHaveBeenCalled();
    });
    it('keeps original link absolute, native/read and named probes after installation, including disappeared links', () => {
        const targets: AclTarget[] = [{ path: storeAlias.path, kind: 'link', permission: 'RX' }];
        const native = vi.fn((path: string) => failedProbe(path, 'spawn', 'ENOENT'));
        const read = vi.fn((path: string) => failedProbe(path, 'script-read', 'ENOENT'));
        const probes = probeAclLinks(targets, { native, read });
        expect(probes.map(probe => probe.method)).toEqual(['spawn', 'script-read']);
        expect(() => assertProbes(probes)).not.toThrow();
        expect(native).toHaveBeenCalledExactlyOnceWith(storeAlias.path);
        expect(read).toHaveBeenCalledExactlyOnceWith(storeAlias.path);
        const disappearedVersionedWrapper = 'C:\\Users\\runner\\AppData\\Local\\Microsoft\\WindowsApps\\pypy3.10.cmd';
        expect(probeCandidates([], 'win32', [storeAlias.path, disappearedVersionedWrapper]))
            .toEqual(expect.arrayContaining([disappearedVersionedWrapper, 'pypy3.10.cmd']));
    });
    it('rejects started AppInstaller stubs, readable aliases and unresolved probes after link ACL denial', () => {
        const targets: AclTarget[] = [{ path: storeAlias.path, kind: 'link', permission: 'RX' }];
        const native = (path: string) => failedProbe(path, 'spawn');
        const read = (path: string) => failedProbe(path, 'script-read');
        expect(() => assertProbes(probeAclLinks(targets, { native, read }))).not.toThrow();
        expect(() => assertProbes(probeAclLinks(targets, { native: candidate => classifySpawn(candidate, { pid: 8216, status: 9009 }), read })))
            .toThrow('Interpreter execution is not blocked');
        expect(() => assertProbes(probeAclLinks(targets, { native, read: candidate => ({ candidate, method: 'script-read', outcome: 'unresolved', status: null }) })))
            .toThrow('Interpreter execution is not blocked');
        expect(() => assertProbes(probeAclLinks(targets, { native: candidate => failedProbe(candidate, 'spawn', 'EINVAL'), read })))
            .toThrow('Interpreter execution is not blocked');
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
