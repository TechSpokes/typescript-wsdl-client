import {it, expect} from 'vitest';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {installIntakeProject, type InstalledIntakeTooling} from '../helpers/installedIntakeTooling.js';

it('reuses only identical manifests and candidate locations while preserving independent consumer requirements', async () => {
  await mkdir(path.resolve('tmp/conformance'), {recursive: true});
  const root = await mkdtemp(path.resolve('tmp/conformance/intake-lock-control-'));
  const evidence = path.join(root, 'evidence'); await mkdir(evidence);
  const shared: InstalledIntakeTooling = {root, tooling: '', cli: '', tarball: path.join(root, 'candidate.tgz')};
  const manifest = {name: 'independent-consumer', private: true, engines: {node: '>=24.0.0'},
    dependencies: {'@techspokes/typescript-wsdl-client': '^1.1.7'}, scripts: {test: 'vitest run'}};
  const generated = JSON.stringify(manifest);
  const installed = JSON.stringify({...manifest, dependencies: {'@techspokes/typescript-wsdl-client': 'file:../candidate.tgz'}});
  const lock = JSON.stringify({packages: {'': {...manifest}, 'node_modules/@techspokes/typescript-wsdl-client': {version: '1.1.7'}}});
  const env = {...process.env, npm_config_cache: path.join(root, 'cache')};
  try {
    for (const [name, text] of [['first', generated], ['same', generated], ['nested/other', generated],
      ['changed', JSON.stringify({...manifest, engines: {node: '>=26.0.0'}})]] as const) {
      const project = path.join(root, name); await mkdir(project, {recursive: true});
      await writeFile(path.join(project, 'package.json'), text);
      await installIntakeProject(shared, project, evidence, env, async (_label, args, cwd) => {
        expect(cwd).toBe(project);
        if (name === 'same') {
          expect(args[1]).toBe('ci');
          expect(await readFile(path.join(project, 'package.json'), 'utf8')).toBe(installed);
          expect(await readFile(path.join(project, 'package-lock.json'), 'utf8')).toBe(lock);
        } else {
          expect(args[1]).toBe('install');
          expect(args.at(-1)).toBe(shared.tarball);
          expect(await readFile(path.join(project, 'package.json'), 'utf8')).toBe(text);
          await expect(readFile(path.join(project, 'package-lock.json'))).rejects.toMatchObject({code: 'ENOENT'});
          await writeFile(path.join(project, 'package.json'), name === 'first' ? installed : text);
          await writeFile(path.join(project, 'package-lock.json'), lock);
        }
      }, name + '-install');
    }
    const context = JSON.parse(await readFile(path.join(evidence, 'context.json'), 'utf8')) as Record<string, {lockReused: boolean}>;
    expect(Object.fromEntries(Object.entries(context).map(([name, value]) => [name, value.lockReused])))
      .toEqual({first: false, same: true, other: false, changed: false});
    expect(await readFile(path.join(root, 'first/package.json'), 'utf8')).toBe(installed);
  } finally {await rm(root, {recursive: true, force: true});}
});
