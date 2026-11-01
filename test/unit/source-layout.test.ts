import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {mkdir, mkdtemp, readFile, rm, writeFile, symlink} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {commonSourceDirectory, assertCanonicalSourceLayout} from '../../src/generation/sourceLayout.js';
import {loadSemanticSchemaInput} from '../../src/loader/schemaInput.js';

describe('bounded copied source layouts', () => {
  it('treats two-dot-prefixed names as ordinary Windows segments and stops at the volume root', () => {
    expect(commonSourceDirectory('C:\\..models\\service.wsdl', ['C:\\..models\\..types.xsd'], () => {}, path.win32)).toBe('C:\\..models');
    expect(commonSourceDirectory('C:\\service.wsdl', ['C:\\..models\\types.xsd'], () => {}, path.win32)).toBe('C:\\');
    expect(commonSourceDirectory('C:\\models\\service.wsdl', ['C:\\shared\\types.xsd'], () => {}, path.win32)).toBe('C:\\');
    expect(() => commonSourceDirectory('C:\\service.wsdl', ['D:\\types.xsd'], () => {}, path.win32)).toThrow('Cross-volume');
    expect(() => commonSourceDirectory('C:\\models\\service.wsdl', ['C:\\shared\\types.xsd'], () => {throw new Error('cancelled');}, path.win32)).toThrow('cancelled');
  });

  it('detects an authenticated retrieval alias before copying and refuses forged source reports', async () => {
    await mkdir('tmp/conformance/source-layout', {recursive: true});
    const root = await mkdtemp(path.resolve('tmp/conformance/source-layout/case-'));
    const schema = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd');
    const server = createServer((request, response) => {
      if (request.url === '/alias.xsd') {response.writeHead(302, {location: '/actual.xsd'}); response.end();}
      else {response.writeHead(200, {'Content-Type': 'application/xml'}); response.end(schema);}
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Owned address required');
    const origin = `http://127.0.0.1:${address.port}`;
    try {
      const file = path.join(root, 'source.wsdl');
      const original = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8');
      await writeFile(file, original.replace('schemaLocation="import-relative-types-types.xsd"', `schemaLocation="${origin}/alias.xsd"`));
      const aliased = await loadSemanticSchemaInput(file, {policy: {fileRoots: [root], allowedOrigins: [origin]}});
      expect(() => assertCanonicalSourceLayout(aliased, () => {})).toThrow('retrieval aliases');
      expect(() => assertCanonicalSourceLayout({...aliased}, () => {})).toThrow(TypeError);
      await writeFile(file, original.replace('schemaLocation="import-relative-types-types.xsd"', `schemaLocation="${origin}/actual.xsd"`));
      const direct = await loadSemanticSchemaInput(file, {policy: {fileRoots: [root], allowedOrigins: [origin]}});
      expect(() => assertCanonicalSourceLayout(direct, () => {})).not.toThrow();
    } finally {server.close(); await once(server, 'close'); await rm(root, {recursive: true, force: true});}
  });

  it.skipIf(process.platform !== 'win32')('refuses a real Windows junction import before copied-source generation', async () => {
    await mkdir('tmp/conformance/source-layout', {recursive: true});
    const root = await mkdtemp(path.resolve('tmp/conformance/source-layout/junction-'));
    try {
      const actual = path.join(root, 'actual'); await mkdir(actual);
      await writeFile(path.join(actual, 'types.xsd'), await readFile('test/conformance/fixtures/xsd/imports/import-relative-types-types.xsd'));
      await symlink(actual, path.join(root, 'alias'), 'junction');
      const original = await readFile('test/conformance/fixtures/xsd/imports/import-relative-types.wsdl', 'utf8');
      const file = path.join(root, 'source.wsdl');
      await writeFile(file, original.replace('schemaLocation="import-relative-types-types.xsd"', 'schemaLocation="alias/types.xsd"'));
      const input = await loadSemanticSchemaInput(file, {policy: {fileRoots: [root]}});
      expect(() => assertCanonicalSourceLayout(input, () => {})).toThrow('retrieval aliases');
    } finally {await rm(root, {recursive: true, force: true});}
  });
});
