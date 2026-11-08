/**
 * Checks the actual consumer payload rather than the repository's directory sizes.
 * @since Unreleased
 */
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parsePackOutput} from './lib/npm-pack-output.mjs';
import {validatePreambleDirectory} from './lib/preamble-validation.mjs';
import {extractMarkdownLinks} from './validate-docs.mjs';

interface PackedFile {path: string; size: number}
interface PackReport {size: number; unpackedSize: number; files: PackedFile[]}

const requiredFiles = [
  'dist/cli.js', 'dist/index.js', 'dist/index.d.ts', 'dist/checkedPipeline.js',
  'dist/gateway/generateCheckedGateway.js', 'dist/app/generateCheckedApp.js',
  'dist/test/generateCheckedTests.js', 'dist/generation/preamble.js',
  'dist/generation/writeGeneratedSource.js', 'docs/checked-gateway.md',
  'docs/examples/checked-forecast.wsdl', 'docs/agent-skill.md',
  'src/generation/preambles/typescript.preamble',
  'src/generation/preambles/app/typescript.preamble',
  'src/generation/preambles/test/typescript.preamble',
  'src/runtime/appSecurity.tpl.txt', 'src/runtime/checkedGatewayHost.tpl.txt',
  'src/runtime/clientStreamMethods.tpl.txt', 'src/runtime/jsonArray.ts',
  'src/runtime/ndjson.ts', 'src/runtime/operationsStreamHelper.tpl.txt', 'src/runtime/streamXml.ts',
  'README.md', 'LICENSE', 'package.json', 'llms.txt',
];
const forbidden = /^(?:agent-skill|scripts|test|research|tmp|\.github|\.idea|node_modules)\/|^dist\/(?:assets|agent-skill)\/|^docs\/(?:content-model-|roadmap\/|releases\/|decisions\/|architecture\.md|reference-validation\.md|checked-consolidation-acceptance\.md|noaa-ndfd-qualification\.md)/;

/**
 * Rejects missing runtime resources, development material and broken consumer navigation.
 * @param files Paths from the exact npm pack result.
 * @param readText Reads a packaged Markdown file from the candidate tree.
 * @returns Nothing when required resources and package-local links are present.
 * @throws Error When development files leak, required resources are missing or a local link leaves the package.
 */
export function validatePackageFiles(files: readonly string[], readText: (file: string) => string): void {
  const published = new Set(files);
  const errors: string[] = [];
  for (const file of files) if (forbidden.test(file)) errors.push(`Forbidden package file: ${file}`);
  for (const file of requiredFiles) if (!published.has(file)) errors.push(`Required package file is missing: ${file}`);
  errors.push(...findMissingPackageLinks(files, readText));
  if (errors.length) throw new Error(errors.join('\n'));
}

/**
 * Finds links that work in the checkout but would break in an installed package.
 * @param files Actual package-relative paths.
 * @param readText Reads the candidate's packaged documentation.
 * @returns Errors for relative links whose target is absent from the package.
 * @throws URIError When a local target contains malformed URL escapes.
 */
export function findMissingPackageLinks(files: readonly string[], readText: (file: string) => string): string[] {
  const published = new Set(files);
  const errors: string[] = [];
  for (const file of files.filter(file => file.endsWith('.md') || file === 'llms.txt')) {
    for (const link of extractMarkdownLinks(readText(file))) {
      if (!link.target || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(link.target)) continue;
      const target = decodeURIComponent(link.target.split('#')[0]!);
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), target));
      if (!published.has(resolved)) errors.push(`${file}:${link.line} package link is missing: ${link.target}`);
    }
  }
  return errors;
}

function runNpmPackDryRun(root: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? process.env.ComSpec ?? 'cmd.exe' : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm pack --dry-run --json --ignore-scripts --cache tmp/cache/npm']
      : ['pack', '--dry-run', '--json', '--ignore-scripts', '--cache', 'tmp/cache/npm'];
    const child = spawn(command, args, {cwd: root, env: {...process.env, npm_config_loglevel: 'silent'}, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {stdout += chunk;});
    child.stderr.on('data', (chunk: string) => {stderr += chunk;});
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`npm pack failed (${code}): ${stderr}`)));
  });
}

async function main(): Promise<void> {
  const root = fileURLToPath(new URL('../', import.meta.url));
  validatePreambleDirectory(path.join(root, 'src/generation/preambles'));
  const output = await runNpmPackDryRun(root);
  const files = parsePackOutput(output);
  validatePackageFiles(files, file => readFileSync(path.join(root, file), 'utf8'));
  const parsed: unknown = JSON.parse(output);
  const results: unknown[] = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>);
  const report = results[0] as PackReport;
  const categories = new Map<string, {files: number; bytes: number}>();
  for (const file of report.files) {
    const category = file.path.startsWith('dist/') ? 'compiled code and declarations'
      : file.path.startsWith('docs/') ? 'consumer guides and examples'
      : file.path.startsWith('src/') ? 'generation resources' : 'package metadata';
    const total = categories.get(category) ?? {files: 0, bytes: 0};
    total.files++;
    total.bytes += file.size;
    categories.set(category, total);
  }
  console.log(`NPM package validation passed: ${files.length} files; ${report.size} bytes compressed; ${report.unpackedSize} bytes unpacked.`);
  for (const [category, total] of [...categories].sort(([a], [b]) => a.localeCompare(b)))
    console.log(`  ${category}: ${total.files} files, ${total.bytes} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;});
}
