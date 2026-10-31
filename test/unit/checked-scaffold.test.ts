import {afterEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {generateCheckedApp} from '../../src/app/generateCheckedApp.js';
import {generateCheckedTests} from '../../src/test/generateCheckedTests.js';

const disposable: string[] = [];
afterEach(() => {
  for (const root of disposable.splice(0)) fs.rmSync(root, {recursive: true, force: true});
});
function fixture() {
  const parent = path.resolve('tmp/test-generation');
  fs.mkdirSync(parent, {recursive: true});
  const appDir = fs.mkdtempSync(path.join(parent, 'checked-scaffold-'));
  disposable.push(appDir);
  return {appDir, clientDir: path.join(appDir, 'client'), gatewayDir: path.join(appDir, 'gateway'),
    openapiFile: path.join(appDir, 'openapi.json')};
}

describe('checked app/test scaffold ownership', () => {
  it('preserves every customized consumer file and only overwrites with explicit force', async () => {
    const options = fixture();
    await generateCheckedApp(options);
    const names = ['server.ts', 'package.json', 'tsconfig.json', 'README.md', 'checked-gateway.example.json', '.gitignore'];
    for (const name of names) fs.writeFileSync(path.join(options.appDir, name), 'consumer-owned ' + name);
    await generateCheckedApp(options);
    for (const name of names) expect(fs.readFileSync(path.join(options.appDir, name), 'utf8')).toBe('consumer-owned ' + name);
    await generateCheckedApp({...options, force: true});
    for (const name of names) expect(fs.readFileSync(path.join(options.appDir, name), 'utf8')).not.toBe('consumer-owned ' + name);
    const manifest = JSON.parse(fs.readFileSync(path.join(options.appDir, 'package.json'), 'utf8'));
    expect(manifest.scripts).toMatchObject({typecheck: 'tsc --noEmit', test: 'vitest run', build: 'tsc', start: 'node dist/server.js'});
    expect(manifest.dependencies).toHaveProperty('@techspokes/typescript-wsdl-client');
    const config = JSON.parse(fs.readFileSync(path.join(options.appDir, 'checked-gateway.example.json'), 'utf8'));
    expect(config.allowedEndpoints).toEqual([]);
    expect(config.fileRoots).toEqual(['./client']);
  });

  it('preserves test customizations and distinguishes scaffold checks from independent oracles', async () => {
    const options = fixture();
    const testOptions = {...options, testDir: path.join(options.appDir, 'test'), routePath: '/v1/forecast/GetForecast'};
    await generateCheckedTests(testOptions);
    const file = path.join(testOptions.testDir, 'checked-scaffold.test.ts');
    const original = fs.readFileSync(file, 'utf8');
    expect(original).toContain('independent wire/business oracles are separate');
    expect(original).toContain("allowedEndpoints: []");
    fs.writeFileSync(file, 'consumer test');
    await generateCheckedTests(testOptions);
    expect(fs.readFileSync(file, 'utf8')).toBe('consumer test');
    await generateCheckedTests({...testOptions, force: true});
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('rejects sibling artifact paths rather than producing an incomplete standalone project', async () => {
    const options = fixture();
    await expect(generateCheckedApp({...options, clientDir: path.resolve(options.appDir, '..', 'outside')}))
      .rejects.toThrow('contained in appDir');
  });
});
