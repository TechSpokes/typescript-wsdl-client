import {it, expect} from 'vitest';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, rm, realpath, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectSourceCapsule, reconstructDirectSourceCapsule} from '../../src/compiler/directSourceCapsule.js';
import {generateDirectClient, writeDirectClient} from '../../src/client/generateDirectClient.js';

const exec = promisify(execFile);
it('compiles and executes actual generated installed clients with checkout access denied', async () => {
  const root = process.cwd(), evidence = path.join(root, 'tmp/conformance/p37-evidence');
  const consumer = await realpath(await mkdtemp(path.join(tmpdir(), 'wsdl-generated-')));
  const fixture = path.join(root, 'test/conformance/fixtures/assessment/forecast.wsdl');
  const original = await readFile(fixture, 'utf8');
  const variants = [
    {name: 'forecast', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast', source: original},
    {name: 'alias', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast', source: original.replaceAll('xmlns:t=', 'xmlns:q=').replaceAll('t:', 'q:').replaceAll('xmlns:xs=', 'xmlns:x=').replaceAll('xs:', 'x:')},
    {name: 'renamed', ns: 'urn:renamed:climate', prefix: 'Climate', op: 'ReadClimate', source: original.replaceAll('urn:checked:forecast', 'urn:renamed:climate').replaceAll('GetForecast', 'ReadClimate').replaceAll('Forecast', 'Climate').replaceAll('city', 'place-name').replaceAll('days', 'class').replaceAll('temperature', 'value-list').replaceAll('complete', 'default')},
    {name: 'shapes', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'createClient', source: original.replaceAll('GetForecast', 'createClient').replace('<xs:element name="city" type="xs:string"/><xs:element name="days" type="xs:int"/>', '<xs:element name="city" type="xs:string" minOccurs="0"/><xs:element name="days" type="xs:int" minOccurs="1" maxOccurs="unbounded"/>')},
    {name: 'scalar', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'GetForecast', source: original.replace('type="t:ForecastRequest"', 'type="xs:boolean"').replace('type="t:ForecastResponse"', 'type="xs:int"').replace('name="ForecastFault" type="t:ForecastFault"', 'name="ForecastFault" type="xs:string"')},
    {name: 'empty', ns: 'urn:checked:forecast', prefix: 'Forecast', op: 'value-list', source: original.replaceAll('GetForecast', 'value-list').replace(/<xs:sequence>.*?<\/xs:sequence>/g, '<xs:sequence/>')},
  ];
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Use npm test');
  const env: NodeJS.ProcessEnv = {...process.env, NODE_OPTIONS: '--use-system-ca', npm_config_cache: path.join(root, 'tmp/cache/npm')};
  delete env.NODE_PATH;
  const run = (args: string[], cwd = consumer) => exec(process.execPath, args, {cwd, env, timeout: 180_000, maxBuffer: 4 * 1024 * 1024});
  try {
    await mkdir(evidence, {recursive: true});
    await mkdir(path.join(consumer, 'authorized'));
    try {await symlink(fixture, path.join(consumer, 'authorized/link.wsdl'), 'file');}
    catch (error) {if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;}
    for (const v of variants) {
      const file = path.join(consumer, 'authorized', v.name + '.wsdl'); await writeFile(file, v.source);
      const selected = await selectDirectOperation(file, {portType: {namespace: v.ns, local: v.prefix + 'PortType'}, binding: {namespace: v.ns, local: v.prefix + 'Binding'}, operation: v.op}, {loading: {policy: {fileRoots: [path.dirname(file)]}}});
      if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
      const capsule = createDirectSourceCapsule(selected.contract, {service: {namespace: v.ns, local: v.prefix + 'Service'}, port: v.prefix + 'Port'});
      if (capsule.kind !== 'direct-capsule') throw new Error(JSON.stringify(capsule));
      const generate = async () => {
        const native = await reconstructDirectSourceCapsule(capsule.bytes, file, {policy: {fileRoots: [path.dirname(file)]}});
        if (native.kind !== 'reconstructed-direct') throw new Error(JSON.stringify(native));
        return generateDirectClient(native);
      };
      const generated = await generate(), repeated = await generate();
      if (generated.kind !== 'generated-direct-client' || repeated.kind !== 'generated-direct-client') throw new Error(JSON.stringify([generated, repeated]));
      expect(generated.source).toBe(repeated.source);
      expect(generated.source).not.toContain(root);
      expect(generated.source).not.toContain('from "@techspokes/');
      writeDirectClient(path.join(consumer, v.name + '.ts'), generated);
      await writeFile(path.join(consumer, v.name + '.json'), generated.capsule);
      writeDirectClient(path.join(evidence, v.name + '.ts'), generated);
    }
    const packed = await run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', evidence], root);
    const filename = (JSON.parse(packed.stdout) as {filename: string}[])[0]!.filename;
    expect(path.basename(filename)).toBe(filename);
    await writeFile(path.join(consumer, 'package.json'), JSON.stringify({private: true, type: 'module'}));
    await run([npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev', path.join(evidence, filename), 'typescript@6.0.3']);
    await copyFile(path.join(root, 'test/helpers/generatedDirectInstalledProcess.ts'), path.join(consumer, 'process.ts'));
    await writeFile(path.join(consumer, 'usage.ts'), `import type {Request, Response, DeclaredFault} from './forecast.js';
import type {Request as Shapes} from './shapes.js';
import type {Request as Empty} from './empty.js';
const request: Request = {city: 'Paris', days: 2};
const response: Response = {city: '', temperature: [], complete: true};
const shape: Shapes = {days: [1, 2]};
const empty: Empty = {};
declare const fault: DeclaredFault;
const exact: 'ForecastError' = fault.fault.name;
const message: string = fault.value.message;
// @ts-expect-error wrong scalar
const bad: Request = {city: 'Paris', days: '2'};
// @ts-expect-error required field
const missing: Request = {city: 'Paris'};
// @ts-expect-error response direction
const wrong: Request = response;
// @ts-expect-error required nonempty array
const none: Shapes = {days: []};
// @ts-expect-error no members in empty sequence
const extra: Empty = {other: ''};
// @ts-expect-error invalid boolean
const boolean: Response = {city: '', temperature: [], complete: 1};
void [request, shape, empty, exact, message];
`);
    await writeFile(path.join(consumer, 'tsconfig.json'), JSON.stringify({compilerOptions: {strict: true, exactOptionalPropertyTypes: true, target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', outDir: 'compiled', types: []}, include: variants.map(v => v.name + '.ts').concat('usage.ts')}));
    await run(['--permission', '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer,
      path.join(consumer, 'node_modules/typescript/bin/tsc'), '-p', path.join(consumer, 'tsconfig.json')]);
    const networkPermission = process.allowedNodeEnvironmentFlags.has('--allow-net') ? ['--allow-net=127.0.0.1'] : [];
    const executed = await run(['--permission', ...networkPermission, '--allow-fs-read=' + consumer, '--allow-fs-write=' + consumer, path.join(consumer, 'process.ts'), fixture]);
    expect(JSON.parse(executed.stdout)).toMatchObject({kind: 'generated-installed-soap', admitted: false});
    await writeFile(path.join(evidence, 'consumer.log'), executed.stdout + executed.stderr);
  } finally {await rm(consumer, {recursive: true, force: true});}
}, 180_000);
