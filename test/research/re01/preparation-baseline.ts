/** Reproduce pinned main with today's instrumentation while preserving every checkout. */
import {execFileSync} from 'node:child_process';
import {cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PREPARATION_BASELINE} from './preparation-corpus.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const outputIndex = process.argv.indexOf('--output'), output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
if (!output) throw new Error('Usage: preparation-baseline.ts --output tmp/conformance/preparation/baseline.json');
const directory = path.resolve(root, 'tmp/conformance/preparation');
await mkdir(directory, {recursive: true});
const snapshot = await mkdtemp(path.join(directory, 'baseline-'));
try {
  const archive = execFileSync('git', ['archive', PREPARATION_BASELINE, 'src', 'examples', 'test/conformance', 'package.json', 'package-lock.json'], {cwd: root, maxBuffer: 32 * 1024 * 1024});
  execFileSync('tar', ['-x', '-C', snapshot], {input: archive});
  const research = path.join(snapshot, 'test/research/re01');
  await mkdir(research, {recursive: true});
  for (const file of ['preparation-corpus.ts', 'preparation-probe.ts', 'preparation-measure.ts']) await cp(path.join(root, 'test/research/re01', file), path.join(research, file));
  await symlink(path.join(root, 'node_modules'), path.join(snapshot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  const corpusIndex = process.argv.indexOf('--corpus'), corpus = corpusIndex >= 0 ? process.argv[corpusIndex + 1] : undefined;
  const outputFile = path.resolve(root, output);
  execFileSync(process.execPath, ['--import', 'tsx', path.join(research, 'preparation-measure.ts'), '--output', outputFile, ...(corpus ? ['--corpus', corpus] : [])], {cwd: snapshot, stdio: 'inherit'});
  // The archive is inside the caller's worktree, so git rev-parse there sees the
  // caller's HEAD. Name both revisions instead of presenting that HEAD as source.
  const report = JSON.parse(await readFile(outputFile, 'utf8')) as Record<string, unknown>;
  await writeFile(outputFile, JSON.stringify({...report, parentWorktreeRevision: report.revision, revision: PREPARATION_BASELINE, sourceMode: 'pinned-git-archive'}, null, 2) + '\n');
} finally {await rm(snapshot, {recursive: true, force: true});}
