/** Installed declaration-definition check using the consumer's TypeScript language service. */
import assert from 'node:assert/strict';
import {readFileSync, realpathSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const file = path.resolve('public-navigation.ts');
const source = 'import {runGenerationPipeline} from "@techspokes/typescript-wsdl-client";\nvoid runGenerationPipeline;\n';
writeFileSync(file, source);
const installed = realpathSync('node_modules/@techspokes/typescript-wsdl-client');
const host: ts.LanguageServiceHost = {
  getCompilationSettings: () => ({module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext}),
  getScriptFileNames: () => [file], getScriptVersion: () => '0',
  getScriptSnapshot: name => ts.sys.fileExists(name) ? ts.ScriptSnapshot.fromString(ts.sys.readFile(name)!) : undefined,
  getCurrentDirectory: () => process.cwd(), getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
  fileExists: ts.sys.fileExists, readFile: ts.sys.readFile, readDirectory: ts.sys.readDirectory,
};
const service = ts.createLanguageService(host);
try {
  const definitions = service.getDefinitionAtPosition(file, source.lastIndexOf('runGenerationPipeline'));
  assert.ok(definitions?.length, 'Public API definition must resolve in the installed consumer');
  for (const definition of definitions) {
    const target = realpathSync(definition.fileName);
    assert.ok(target.startsWith(installed + path.sep), target);
    assert.ok(target.endsWith('.d.ts'), target);
    assert.ok(!readFileSync(target, 'utf8').includes('sourceMappingURL='), 'No dangling declaration map');
  }
  console.log('Installed public API definition resolves to packaged declarations; original-source navigation is not asserted.');
} finally {service.dispose();}
