import { describe, expect, it } from 'vitest';
import { checkFiles, checkRepository } from '../../scripts/check-toolchain.js';
describe('toolchain guard', () => {
    it('rejects new Python source and manifests, including the #231 rebase hazard', () => {
        for (const path of ['test/conformance/reference/schema_assessment_contract_test.py', 'scripts/new.pyw', 'native/new.cpp', 'requirements-dev.txt', 'pyproject.toml', 'uv.lock'])
            expect(checkFiles([{ path, text: '' }])).toHaveLength(1);
    });
    it('rejects reintroduction of any removed legacy source and permits historical data', () => {
        expect(checkFiles([{path: 'test/research/re01/witness_probe.py', text: 'historical code'}])).toHaveLength(1);
        expect(checkFiles([{path: 'test/conformance/reference/legacy-source-snapshot.json', text: '{"text":"import xmlschema"}'}])).toEqual([]);
        expect(checkFiles([])).toEqual([]);
    });
    it('rejects package commands and changed executable workflow entries', () => {
        expect(checkFiles([{ path: 'package.json', text: JSON.stringify({ scripts: { test: 'python3 -m unittest' } }) }])).toHaveLength(1);
        for (const command of ['py.exe -3 -c pass', 'pyw.exe -3 -c pass', 'pypy3 -c pass', 'ipython -c pass', 'python3.14t.exe -c pass', 'pip3.14.cmd install X']) {
            expect(checkFiles([{ path: 'package.json', text: JSON.stringify({ scripts: { test: command } }) }]), command).toHaveLength(1);
            expect(checkFiles([{ path: '.github/workflows/new.yml', text: 'jobs:\n  test:\n    steps:\n      - run: ' + command + '\n' }]), command).toHaveLength(1);
        }
        for (const uses of ['actions/setup-python@v6', 'actions/setup-java@v5'])
            expect(checkFiles([{ path: '.github/workflows/new.yml', text: `jobs:\n  test:\n    steps:\n      - uses: ${uses}\n` }])).toHaveLength(1);
        expect(checkFiles([{ path: '.github/workflows/new.yml', text: 'jobs:\n  test:\n    steps:\n      - run: pip install X\n' }])).toHaveLength(1);
        expect(checkFiles([{ path: '.github/workflows/ci.yml', text: 'jobs:\n  test:\n    steps:\n      - uses: actions/setup-python@v7\n' }])).toHaveLength(1);
    });
    it('rejects known process calls without treating source links as invocations', () => {
        for (const interpreter of ['py.exe', 'pyw.exe', 'pypy3', 'ipython', 'python3.14t.exe', 'pip3.14.cmd'])
            expect(checkFiles([{path: 'scripts/new.ts', text: 'spawn(' + JSON.stringify(interpreter) + ', []);'}]), interpreter).toHaveLength(1);
        for (const text of ['execFileSync("python3",["a.py"]);', 'spawn("java",[]);', 'execSync("node-gyp rebuild");', 'execFileSync(python,["old.py"]);', 'execFileSync("/usr/bin/python3",["-c","print(1)"]);', 'spawn("C:\\\\Python312\\\\python.exe",[]);'])
            expect(checkFiles([{ path: 'scripts/new.ts', text }])).toHaveLength(1);
        expect(checkFiles([{ path: 'test/source-link.test.ts', text: 'const historical="https://example.test/a.py";' }])).toEqual([]);
        expect(checkFiles([{ path: 'scripts/tool.sh', text: 'python3 old.py' }])).toHaveLength(1);
        expect(checkFiles([{ path: 'scripts/tool.ps1', text: 'pip install x' }])).toHaveLength(1);
        expect(checkFiles([{ path: 'examples/ci-cd/generate.sh', text: '# Historical Python reference\nnode cli.js' }])).toEqual([]);
    });
    it('allows historical prose, pinned links, JavaScript license metadata and ordinary Node commands', () => {
        expect(checkFiles([{ path: 'docs/history.md', text: 'Python observations from https://example.test/a.py' }, { path: 'package-lock.json', text: '{"license":"Python-2.0"}' }, { path: 'package.json', text: '{"scripts":{"test":"vitest run","build":"tsc"}}' }])).toEqual([]);
    });
    it('passes the required repository with no legacy allowance', () => { expect(checkRepository()).toEqual([]); });
});
