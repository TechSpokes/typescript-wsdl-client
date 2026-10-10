import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.platform === 'win32')('qualification bootstrap logging', () => {
    it.each([0, 7, 'startup-failure'] as const)('keeps environment-derived arguments out of logs with Docker outcome %s', status => {
        mkdirSync('tmp/conformance', { recursive: true });
        const root = resolve(mkdtempSync('tmp/conformance/platform-log-control-'));
        const checkout = join(root, 'candidate'), bin = join(root, 'bin'), received = join(root, 'received.json');
        const certificate = join(root, 'private-certificate-sentinel.pem');
        try {
            mkdirSync(checkout);
            mkdirSync(bin);
            const gitExecutable = (process.env.PATH ?? '').split(delimiter).map(directory => join(directory, 'git')).find(existsSync);
            if (!gitExecutable) throw new Error('Git is required for the qualification control');
            symlinkSync(gitExecutable, join(bin, 'git'));
            writeFileSync(join(checkout, '.gitignore'), 'tmp/\n');
            execFileSync('git', ['init', '--quiet', checkout]);
            execFileSync('git', ['-C', checkout, 'add', '.gitignore']);
            execFileSync('git', ['-C', checkout, '-c', 'user.name=Qualification control', '-c', 'user.email=control@example.invalid',
                '-c', 'core.hooksPath=/dev/null', 'commit', '--quiet', '-m', 'Qualification control']);
            const docker = join(bin, 'docker');
            writeFileSync(docker, '#!' + process.execPath + '\n' + [
                "import fs from 'node:fs';",
                'const args = process.argv.slice(2);',
                "if (args[0] === 'image') { process.stdout.write('[]'); " +
                    (status === 'startup-failure' ? 'fs.unlinkSync(process.argv[1]); ' : '') + '}',
                "if (args[0] === 'run') {",
                'fs.writeFileSync(' + JSON.stringify(received) + ', JSON.stringify(args));',
                'process.exit(' + (status === 'startup-failure' ? 0 : status) + ');',
                '}',
            ].join('\n'));
            chmodSync(docker, 0o755);
            const result = spawnSync(process.execPath, [resolve('test/conformance/reference/qualification/platform-run.ts'), '--container', '24'], {
                cwd: checkout, encoding: 'utf8', env: { ...process.env, CODEX_PROXY_CERT: certificate,
                    PATH: bin },
            });
            expect(result.error).toBeUndefined();
            expect(result.status, result.stdout + result.stderr).toBe(status === 0 ? 0 : 1);
            if (status === 'startup-failure') expect(existsSync(received)).toBe(false);
            else {
                const argumentsReceived = JSON.parse(readFileSync(received, 'utf8')) as string[];
                expect(argumentsReceived).toContain('type=bind,src=' + certificate + ',dst=/run/proxy-ca.pem,readonly');
                expect(argumentsReceived).toContain('NODE_EXTRA_CA_CERTS=/run/proxy-ca.pem');
            }
            expect(result.stdout + result.stderr).not.toContain(certificate);
            expect(result.stdout).toContain('Qualification executable: docker');
            if (status !== 0) expect(result.stderr).toContain('Platform qualification failed');
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
});
