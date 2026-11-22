/**
 * Emits consumer-owned checks for the checked gateway scaffold.
 * @since 1.1.6
 * @constraints These checks are distinct from independently specified SOAP wire/business oracles.
 */
import fs from 'node:fs';
import path from 'node:path';
import {checkedModulePath, hasModuleUrlDelimiters} from '../generation/checkedModulePath.js';
import {writeGeneratedSource} from '../generation/writeGeneratedSource.js';

export interface GenerateCheckedTestsOptions {
  readonly testDir: string;
  readonly appDir: string;
  readonly clientDir: string;
  readonly gatewayDir: string;
  readonly routePath: string;
  readonly force?: boolean;
  readonly routePaths?: readonly string[];
  readonly sourceFile: string;
}

/**
 * Emits runnable host checks without authorizing any production transaction.
 * @param options - Explicit project paths and the selected generated operation route.
 * @returns Resolves after writing missing scaffold tests.
 * @throws If writing or preamble resolution fails.
 * @sideEffects Creates a test file, preserving an existing file unless forced.
 */
export async function generateCheckedTests(options: GenerateCheckedTestsOptions): Promise<void> {
  const testDir = path.resolve(options.testDir);
  const serverImport = checkedModulePath(testDir, path.join(options.appDir, 'server.js'));
  const localSource = path.relative(testDir, options.sourceFile).split(path.sep).join('/');
  const fileRoot = path.relative(testDir, options.clientDir).split(path.sep).join('/');
  fs.mkdirSync(testDir, {recursive: true});
  const destination = path.join(testDir, 'checked-scaffold.test.ts');
  if (!options.force && fs.existsSync(destination)) return;
  const nativeLoad = [options.clientDir, options.gatewayDir]
    .some(dir => hasModuleUrlDelimiters(checkedModulePath(options.appDir, dir)));
  const testImports = nativeLoad ? `import {afterAll, afterEach, beforeAll, describe, expect, it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const project = path.resolve(testDir, ${JSON.stringify(checkedModulePath(testDir, options.appDir))});
const require = createRequire(import.meta.url);
let buildDir: string | undefined;
type ServerModule = typeof import(${JSON.stringify(serverImport)});
let buildServer: ServerModule['buildServer'];

// @why Node resolves escaped ESM file URLs in artifact paths that Vite treats as URL syntax.
// The owned build leaves the consumer's regular dist directory untouched.
beforeAll(async () => {
  buildDir = mkdtempSync(path.join(project, '.checked-scaffold-'));
  execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', path.join(project, 'tsconfig.json'), '--outDir', buildDir],
    {cwd: project, stdio: 'inherit', timeout: 60_000});
  const bridge = path.join(buildDir, 'import-host.cts');
  writeFileSync(bridge, 'module.exports = (url: string) => import(url);\\n');
  const importHost = require(bridge) as (url: string) => Promise<ServerModule>;
  ({buildServer} = await importHost(pathToFileURL(path.join(buildDir, 'server.js')).href));
}, 65_000);
afterAll(() => {if (buildDir !== undefined) rmSync(buildDir, {recursive: true, force: true});});`
    : `import {afterEach, describe, expect, it} from 'vitest';
import {fileURLToPath} from 'node:url';
import {buildServer} from ${JSON.stringify(serverImport)};`;
  const sourcePath = (file: string) => nativeLoad || hasModuleUrlDelimiters(file)
    ? `path.resolve(${nativeLoad ? 'testDir' : 'fileURLToPath(new URL(".", import.meta.url))'}, ${JSON.stringify(file)})`
    : `fileURLToPath(new URL(${JSON.stringify(file)}, import.meta.url))`;
  // @why Native loading defers gateway imports and their module initialization to the first host check.
  const hostTimeout = nativeLoad ? ', 30_000' : '';
  writeGeneratedSource(destination, `${testImports}${!nativeLoad && [localSource, fileRoot].some(hasModuleUrlDelimiters)
    ? "\nimport path from 'node:path';" : ''}

describe('generated scaffold checks (independent wire/business oracles are separate)', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  afterEach(async () => {await app?.close();});
  async function host() {
    app = await buildServer({
      localSource: ${sourcePath(localSource)},
      fileRoots: [${sourcePath(fileRoot + '/')}],
      endpoint: 'http://127.0.0.1:1/soap',
      allowedEndpoints: [],
      sourceResources: [], sourceOrigins: [],
    });
    return app;
  }
  it('serves health and selected OpenAPI without upstream SOAP calls', async () => {
    const server = await host();
    expect((await server.inject({method: 'GET', url: '/health'})).json()).toEqual({status: 'ok'});
    const spec = (await server.inject({method: 'GET', url: '/openapi.json'})).json();
    expect(spec.openapi).toBe('3.1.1');
    for (const route of ${JSON.stringify(options.routePaths ?? [options.routePath])}) expect(spec.paths).toHaveProperty(route);
  }${hostTimeout});
  it.each(${JSON.stringify(options.routePaths ?? [options.routePath])})('rejects an invalid shape before upstream dispatch: %s', async route => {
    const server = await host();
    // @constraints Every supported checked root is non-nullable; no field spelling is reserved for test sentinels.
    const response = await server.inject({method: 'POST', url: route,
      headers: {'content-type': 'application/json'}, payload: 'null'});
    expect(response.statusCode).toBe(400);
  }${hostTimeout});
});
`, 'test');
}
