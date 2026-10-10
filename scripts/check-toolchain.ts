/** Static migration guard. Execution qualification is still required for dynamic commands. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { load } from 'js-yaml';
export interface InputFile {
    path: string;
    text: string;
}
export interface Violation {
    path: string;
    entry: string;
    reason: string;
}
const forbiddenCommand = /(?:^|[\s;&|"'`/\\])(?:python(?:\d+(?:\.\d+)*)?|pip\d*|virtualenv|venv|java|javac|node-gyp|emcc|emmake)(?:\.exe)?(?=$|[\s;&|"'`])/i;
const forbiddenSource = /\.(?:py|pyw|java|c|cpp|cxx)$/i;
const forbiddenManifest = /(?:^|\/)(?:requirements(?:[-.][^/]*)?\.txt|Pipfile(?:\.lock)?|pyproject\.toml|poetry\.lock|uv\.lock)$/i;
const forbiddenAction = /^actions\/setup-(?:python|java)@/;
const processCalls = new Set(['execFile', 'execFileSync', 'exec', 'execSync', 'spawn', 'spawnSync']);
export function checkFiles(files: readonly InputFile[]): Violation[] {
    const violations: Violation[] = [];
    for (const { path, text } of files) {
        const fail = (entry: string, reason: string) => violations.push({ path, entry, reason });
        if (forbiddenSource.test(path) || forbiddenManifest.test(path)) {
            fail('filename', 'Additional language source or Python setup manifest is prohibited.');
            continue;
        }
        const checkEntry = (entry: string, value: string, action = false) => {
            if (action ? forbiddenAction.test(value) : forbiddenCommand.test(value))
                fail(entry, 'Executable toolchain setup/invocation requires an explicit scope decision.');
        };
        if (path === 'package.json') {
            const data = JSON.parse(text) as {
                scripts?: Record<string, string>;
            };
            for (const [name, value] of Object.entries(data.scripts ?? {}))
                checkEntry('scripts.' + name, value);
        }
        else if (/^\.github\/workflows\/.*\.ya?ml$/.test(path)) {
            const walk = (node: unknown, key: string): void => {
                if (Array.isArray(node))
                    node.forEach((v, i) => walk(v, `${key}.${i}`));
                else if (node && typeof node === 'object')
                    for (const [k, v] of Object.entries(node)) {
                        const entry = `${key}.${k}`;
                        if (typeof v === 'string' && (k === 'run' || k === 'uses'))
                            checkEntry(entry, v, k === 'uses');
                        else
                            walk(v, entry);
                    }
            };
            walk(load(text), 'workflow');
        }
        else if (/\.(?:sh|ps1|bat|cmd)$/.test(path)) {
            text.split('\n').forEach((line, i) => { if (!/^\s*(?:#|REM\b)/i.test(line))
                checkEntry('line ' + (i + 1), line); });
        }
        else if (/\.(?:[cm]?js|[cm]?ts)$/.test(path)) {
            const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
            const visit = (node: ts.Node): void => {
                if (ts.isCallExpression(node)) {
                    const name = ts.isIdentifier(node.expression) ? node.expression.text : ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : '';
                    if (processCalls.has(name)) {
                        let found = false;
                        const scan = (child: ts.Node): void => {
                            if (ts.isStringLiteralLike(child) && (forbiddenCommand.test(child.text) || /\.(?:py|pyw)$/.test(child.text)))
                                found = true;
                            if (ts.isIdentifier(child) && /^(?:python\d*|pip\d*|javac|java)$/.test(child.text))
                                found = true;
                            ts.forEachChild(child, scan);
                        };
                        node.arguments.forEach(scan);
                        if (found)
                            fail(`line ${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, 'Prohibited interpreter process invocation.');
                    }
                }
                ts.forEachChild(node, visit);
            };
            visit(source);
        }
    }
    return violations;
}
export function checkRepository(): Violation[] {
    const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
    const files: InputFile[] = [];
    for (const path of paths) {
        try {
            files.push({ path, text: readFileSync(path, 'utf8') });
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
    }
    return checkFiles(files);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const violations = checkRepository();
    for (const issue of violations)
        console.error(`${issue.path}:${issue.entry}: ${issue.reason}`);
    if (violations.length)
        process.exitCode = 1;
    else
        console.log('Toolchain guard passed (no legacy allowance).');
}
