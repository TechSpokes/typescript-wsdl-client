/** Actual clean-install qualification. This bootstrap needs only Node built-ins. */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { release } from 'node:os';
const script = 'test/conformance/reference/qualification/platform-run.ts';
const enforcement = 'test/conformance/reference/qualification/environment.ts';
const git = (...args: string[]) => execFileSync('git', args, {encoding: 'utf8'}).trim();
function command(file: string, args: string[]): void {
    console.log('Qualification command: ' + [file, ...args].join(' '));
    const result = spawnSync(file, args, {stdio: 'inherit', shell: process.platform === 'win32' && file === 'npm', env: {...process.env, npm_config_cache: resolve('tmp/cache/npm')}});
    if (result.error || result.status !== 0) throw new Error('Qualification command failed: ' + [file, ...args].join(' ') + '; ' + String(result.error ?? result.status));
}
function sourceHashes(): Record<string, string> {
    const paths = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
    return Object.fromEntries(paths.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]));
}
function inside(): void {
    const startedAt = new Date().toISOString();
    const revision = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
    if (git('status', '--porcelain')) throw new Error('Qualification requires a clean exact candidate checkout');
    const hashes = sourceHashes(), commands: Array<{command: string; status: 'passed'}> = [];
    const run = (file: string, args: string[]) => { command(file, args); commands.push({command: [file, ...args].join(' '), status: 'passed'}); };
    const output = 'tmp/conformance/platform-results.json';
    mkdirSync('tmp/conformance', {recursive: true});
    let failure: string | undefined;
    try {
        run(process.execPath, [enforcement, 'enforce']);
        // Keep the established npm behavior: later defaults may silently withhold dependency install hooks.
        run('npm', ['install', '--global', 'npm@11.9.0']);
        run('npm', ['ci']);
        for (const name of ['check:toolchain', 'typecheck:tooling', 'typecheck:research', 'typecheck:reference', 'typecheck:integration']) run('npm', ['run', name]);
        if (process.platform === 'linux') run('npm', ['run', process.versions.node.startsWith('24.') ? 'ci' : 'ci:github:node26']);
        run('npm', ['run', 'test:reference:full']);
        run('npm', ['run', 'test:research:ports']);
        run('npm', ['run', 'research:re01:measure']);
        run(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'test/research/s06-pw01', 'test/research/dt01']);
        if (process.platform === 'win32') run('npm', ['run', 'test:feasibility']);
        run(process.execPath, [enforcement, 'verify']);
        if (git('status', '--porcelain') || JSON.stringify(sourceHashes()) !== JSON.stringify(hashes)) throw new Error('Qualification candidate changed during execution');
    } catch (error) { failure = String(error); }
    finally {
        const report = {formatVersion: 1, startedAt, finishedAt: new Date().toISOString(), testedRevision: revision, testedTree: tree,
            workingTreeDirty: !!git('status', '--porcelain'), platform: process.platform, osRelease: release(), node: process.version,
            npm: execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], {encoding: 'utf8', shell: process.platform === 'win32'}).trim(),
            sourceHashes: hashes, packageLockSha256: hashes['package-lock.json'], commands,
            enforcement: existsSync('tmp/conformance/platform-enforcement.json') ? JSON.parse(readFileSync('tmp/conformance/platform-enforcement.json', 'utf8')) as unknown : null,
            status: failure ? 'failed' : 'passed', failure};
        writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
        command(process.execPath, [enforcement, 'restore']);
    }
    if (failure) throw new Error(failure);
}
function container(major: string): void {
    if (!['24', '26'].includes(major)) throw new Error('Qualified Node major must be 24 or 26');
    if (git('status', '--porcelain')) throw new Error('Commit the final candidate before platform qualification');
    const directory = resolve('tmp/conformance/platform-' + major);
    mkdirSync(directory, {recursive: true});
    const checkout = resolve(directory, 'checkout');
    if (existsSync(checkout)) throw new Error('Fresh qualification checkout already exists: ' + checkout);
    command('git', ['clone', '--quiet', '--local', '--no-hardlinks', '--no-checkout', resolve('.'), checkout]);
    command('git', ['-C', checkout, 'checkout', '--quiet', '--detach', git('rev-parse', 'HEAD')]);
    const image = 'node:' + major + '-bookworm-slim';
    command('docker', ['pull', image]);
    writeFileSync(resolve(directory, 'image.json'), execFileSync('docker', ['image', 'inspect', image], {encoding: 'utf8'}));
    const args = ['run', '--rm', '--mount', `type=bind,src=${checkout},dst=/source,readonly`, '--mount', `type=bind,src=${directory},dst=/output`, '--workdir', '/work'];
    const certificate = process.env.CODEX_PROXY_CERT;
    if (certificate) args.push('--mount', `type=bind,src=${certificate},dst=/run/proxy-ca.pem,readonly`, '-e', 'NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem');
    args.push(image, 'node', '/source/' + script, '--bootstrap');
    command('docker', args);
}
function bootstrap(): void {
    command('apt-get', ['update']);
    command('apt-get', ['install', '-y', '--no-install-recommends', 'git', 'ca-certificates']);
    cpSync('/source', '/work', {recursive: true});
    process.chdir('/work');
    command('git', ['config', '--global', '--add', 'safe.directory', '/work']);
    let failure: unknown;
    try { inside(); } catch (error) { failure = error; }
    finally { cpSync('/work/tmp/conformance', '/output/results', {recursive: true}); }
    if (failure) throw failure;
}
const mode = process.argv[2];
try {
    if (mode === '--container') container(process.argv[3]);
    else if (mode === '--bootstrap') bootstrap();
    else if (mode === '--windows' && process.platform === 'win32') inside();
    else throw new Error('Use --container 24|26 or --windows');
} catch (error) { console.error(String(error)); process.exitCode = 1; }
