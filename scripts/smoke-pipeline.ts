import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {runOwnedNode} from '../test/helpers/ownedNodeProcess.js';
import {directDependencyRanges, failIfErrors, verifyGeneratedApp} from './lib/deps.mjs';

const workspace = process.env.WSDL_TEST_RUN_DIR;
if (!workspace) throw new Error('Run this check using npm run smoke:pipeline');
const out = path.join(workspace, 'smoke');
const root = process.cwd();
const run = (args: string[]) => runOwnedNode(args, {
  cwd: root, timeoutMs: 120_000, onOutput: chunk => process.stdout.write(chunk),
});
await mkdir(out);
await run(['--import', 'tsx', 'src/cli.ts', 'pipeline',
  '--wsdl-source', 'examples/minimal/weather.wsdl',
  '--client-dir', path.join(out, 'client'),
  '--openapi-file', path.join(out, 'openapi.json'),
  '--gateway-dir', path.join(out, 'gateway'),
  '--gateway-service-name', 'weather', '--gateway-version-prefix', 'v1',
  '--openapi-format', 'json', '--init-app',
]);
const config = path.join(out, 'tsconfig.json');
await writeFile(config, JSON.stringify({
  extends: path.join(root, 'tsconfig.smoke.json'),
  include: ['**/*.ts', path.join(root, 'src/types/soap.d.ts')],
}));
await run(['node_modules/typescript/bin/tsc', '-p', config]);

if (process.argv.includes('--verify-app-deps')) {
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as Parameters<typeof directDependencyRanges>[0];
  failIfErrors(verifyGeneratedApp(directDependencyRanges(pkg), path.join(out, 'app', 'package.json')));
  console.log('Fresh generated app dependency pins match the repository manifest.');
}
