import {it, expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, copyFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule} from '../../src/compiler/directSourceCapsule.js';

const exec = promisify(execFile);
it('requalifies a separately authorized source in a real installed process with checkout access denied', async () => {
  const root = process.cwd();
  const consumer = await mkdtemp(path.join(tmpdir(), 'wsdl-portable-'));
  const artifact = path.join(root, 'tmp/conformance/p36-evidence');
  const fixture = path.join(root, 'test/conformance/fixtures/assessment/forecast.wsdl');
  const namespace = 'urn:checked:forecast';
  const selected = await selectDirectOperation(fixture, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [path.dirname(fixture)]}}});
  expect(selected.kind).toBe('selected');
  if (selected.kind !== 'selected') throw new Error('source selection failed');
  const capsule = createDirectSourceCapsule(selected.contract, {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'});
  if (capsule.kind !== 'direct-capsule') throw new Error(JSON.stringify(capsule));
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run installed qualification using npm test or npm exec');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.join(root, 'tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = (args: string[], cwd: string) => exec(process.execPath, args, {cwd, env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024});
  try {
    await mkdir(artifact, {recursive: true});
    const packed = await run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', artifact], root);
    const packs = JSON.parse(packed.stdout) as {filename: string}[];
    const filename = packs[0]!.filename;
    expect(path.basename(filename)).toBe(filename);
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
    await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', '--cache', path.join(root, 'tmp/cache/npm'), path.join(artifact, filename)], consumer);
    await mkdir(path.join(consumer, 'authorized'));
    await copyFile(fixture, path.join(consumer, 'authorized/source.wsdl'));
    await copyFile(path.join(root, 'test/helpers/portableInstalledProcess.ts'), path.join(consumer, 'process.ts'));
    await writeFile(path.join(consumer, 'saved.json'), JSON.stringify(selected.kind === 'selected' ? selected.contract : selected));
    await writeFile(path.join(consumer, 'capsule.json'), capsule.bytes);
    const result = await run(['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer, path.join(consumer, 'process.ts'), fixture], consumer);
    expect(JSON.parse(result.stdout)).toMatchObject({kind: 'fresh-installed-authority', admitted: false, slots: 2, fetches: 0});
    await writeFile(path.join(artifact, 'authority-process.log'), result.stdout + result.stderr);
  } finally {await rm(consumer, {recursive: true, force: true});}
}, 180_000);
