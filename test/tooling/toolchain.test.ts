import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { checkFiles, checkRepository } from '../../scripts/check-toolchain.js';
import type { Allowance } from '../../scripts/check-toolchain.js';
const allowance = JSON.parse(readFileSync(new URL('./legacy-toolchain-allowance.json', import.meta.url), 'utf8')) as Allowance;
describe('toolchain guard', () => {
    it('rejects new Python source and manifests, including the #231 rebase hazard', () => {
        for (const path of ['test/conformance/reference/schema_assessment_contract_test.py', 'scripts/new.pyw', 'native/new.cpp', 'requirements-dev.txt', 'pyproject.toml', 'uv.lock'])
            expect(checkFiles([{ path, text: '' }], allowance)).toHaveLength(1);
    });
    it('freezes legacy content and permits removal without discovering a larger allowance', () => {
        const path = 'test/research/re01/witness_probe.py', text = readFileSync(path, 'utf8');
        expect(checkFiles([{ path, text }], allowance)).toEqual([]);
        expect(checkFiles([{ path, text: text + '\n# expanded' }], allowance)).toHaveLength(1);
        expect(checkFiles([], allowance)).toEqual([]);
    });
    it('rejects package commands and changed executable workflow entries', () => {
        expect(checkFiles([{ path: 'package.json', text: JSON.stringify({ scripts: { test: 'python3 -m unittest' } }) }])).toHaveLength(1);
        for (const uses of ['actions/setup-python@v6', 'actions/setup-java@v5'])
            expect(checkFiles([{ path: '.github/workflows/new.yml', text: `jobs:\n  test:\n    steps:\n      - uses: ${uses}\n` }], allowance)).toHaveLength(1);
        expect(checkFiles([{ path: '.github/workflows/new.yml', text: 'jobs:\n  test:\n    steps:\n      - run: pip install X\n' }])).toHaveLength(1);
        expect(checkFiles([{ path: '.github/workflows/ci.yml', text: 'jobs:\n  test:\n    steps:\n      - uses: actions/setup-python@v7\n' }], allowance)).toHaveLength(1);
    });
    it('rejects known process calls without treating source links as invocations', () => {
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
    it('passes the staging repository without executing the frozen legacy harness', () => { expect(checkRepository()).toEqual([]); });
});
