import {execFileSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {describe, expect, it} from 'vitest';

function sources(directory: string): string[] {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.(?:ts|mts|mjs)$/.test(entry.name) ? [file] : [];
  });
}

describe('product and research boundary', () => {
  it('keeps product implementations, tests and automation independent of research imports', () => {
    const violations: string[] = [];
    for (const file of ['src', 'test', 'scripts'].flatMap(sources)) {
      const source = ts.preProcessFile(readFileSync(file, 'utf8'), true, true);
      for (const imported of source.importedFiles) {
        if (!imported.fileName.startsWith('.')) continue;
        const target = path.relative(process.cwd(), path.resolve(path.dirname(file), imported.fileName)).replaceAll('\\', '/');
        if (/^(?:research\/|test\/research\/)/.test(target)) violations.push(`${file} -> ${target}`);
      }
    }
    expect(violations).toEqual([]);
    const map = JSON.parse(readFileSync('test/conformance/reference/migration-map.json', 'utf8')) as {obligations: {target: string}[]};
    expect(map.obligations.every(row => row.target.startsWith('test/conformance/reference/'))).toBe(true);
  });

  it('collects the complete product suite without collecting research tests', () => {
    const result = JSON.parse(execFileSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'list', '--filesOnly', '--json'], {encoding: 'utf8'})) as {file: string}[];
    const files = result.map(row => path.relative(process.cwd(), row.file).replaceAll('\\', '/'));
    expect(files.some(file => file.startsWith('test/conformance/reference/'))).toBe(true);
    expect(files).toContain('test/conformance/conformance.test.ts');
    expect(files).toContain('test/integration/checked-gateway-installed.test.ts');
    expect(files.some(file => file.startsWith('research/') || file.startsWith('test/research/'))).toBe(false);
  });

  it('keeps research commands outside product CI and runs tooling guards in both hosted lanes', () => {
    const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as {scripts: Record<string, string>}).scripts;
    function inspect(name: string, visited = new Set<string>()): void {
      if (visited.has(name)) return;
      visited.add(name);
      expect(name).not.toMatch(/research/);
      const command = scripts[name];
      expect(command, name).toBeDefined();
      expect(command, name).not.toMatch(/(?:test\/research|research\/|vitest\.research)/);
      for (const match of command!.matchAll(/npm run ([\w:-]+)/g)) inspect(match[1]!, visited);
    }
    for (const name of ['ci', 'ci:github', 'ci:github:node26', 'release:publish-check']) inspect(name);
    expect(scripts['test:github']).toContain('test/tooling');
    expect(scripts['ci:github:node26']).toContain('test/tooling');
  });
});
