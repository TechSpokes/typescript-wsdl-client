/**
 * Emits consumer-owned checks for the checked gateway scaffold.
 * @since 1.1.6
 * @constraints These checks are distinct from independently specified SOAP wire/business oracles.
 */
import fs from 'node:fs';
import path from 'node:path';
import {writeGeneratedSource} from '../generation/writeGeneratedSource.js';

export interface GenerateCheckedTestsOptions {
  readonly testDir: string;
  readonly appDir: string;
  readonly clientDir: string;
  readonly routePath: string;
  readonly force?: boolean;
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
  let serverImport = path.relative(testDir, path.join(options.appDir, 'server.js')).split(path.sep).join('/');
  if (!serverImport.startsWith('.')) serverImport = './' + serverImport;
  const localSource = path.relative(testDir, path.join(options.clientDir, 'source.wsdl')).split(path.sep).join('/');
  const fileRoot = path.relative(testDir, options.clientDir).split(path.sep).join('/');
  fs.mkdirSync(testDir, {recursive: true});
  const destination = path.join(testDir, 'checked-scaffold.test.ts');
  if (!options.force && fs.existsSync(destination)) return;
  writeGeneratedSource(destination, `import {afterEach, describe, expect, it} from 'vitest';
import {fileURLToPath} from 'node:url';
import {buildServer} from ${JSON.stringify(serverImport)};

describe('generated scaffold checks (independent wire/business oracles are separate)', () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;
  afterEach(async () => {await app?.close();});
  async function host() {
    app = await buildServer({
      localSource: fileURLToPath(new URL(${JSON.stringify(localSource)}, import.meta.url)),
      fileRoots: [fileURLToPath(new URL(${JSON.stringify(fileRoot + '/')}, import.meta.url))],
      endpoint: 'http://127.0.0.1:1/soap',
      allowedEndpoints: [],
    });
    return app;
  }
  it('serves health and selected OpenAPI without upstream SOAP calls', async () => {
    const server = await host();
    expect((await server.inject({method: 'GET', url: '/health'})).json()).toEqual({status: 'ok'});
    const spec = (await server.inject({method: 'GET', url: '/openapi.json'})).json();
    expect(spec.openapi).toBe('3.1.1');
    expect(spec.paths).toHaveProperty(${JSON.stringify(options.routePath)});
  });
  it('rejects an invalid shape before upstream dispatch', async () => {
    const server = await host();
    const response = await server.inject({method: 'POST', url: ${JSON.stringify(options.routePath)}, payload: {__invalidField: true}});
    expect(response.statusCode).toBe(400);
  });
});
`, 'test');
}
