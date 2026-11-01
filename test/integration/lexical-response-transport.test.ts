import {expect, it} from 'vitest';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import Fastify from 'fastify';
import {runGenerationPipeline} from '../../src/pipeline.js';

it('preserves text-only complex values and converts only valid XML boolean attributes through actual SOAP', async () => {
  await mkdir('tmp/conformance', {recursive: true});
  const output = await mkdtemp(path.resolve('tmp/conformance/lexical-response-'));
  const source = path.resolve('test/conformance/fixtures/xsd/simple-content/lexical-response.wsdl');
  let lexical = 'true';
  let withAttributes = false;
  let calls = 0;
  const server = createServer(async (request, response) => {
    calls++;
    let requestXml = '';
    for await (const chunk of request) requestXml += String(chunk);
    expect(request.headers.soapaction).toBe('"urn:fixture:Echo"');
    expect(requestXml).toContain('Token="synthetic"');
    response.writeHead(200, {'content-type': 'text/xml'});
    response.end(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><Reply xmlns="urn:fixture:lexical-response" Enabled="${lexical}"><Label${withAttributes ? ' Code="owned"' : ''}>Owned text</Label></Reply></s:Body></s:Envelope>`);
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing owned port');
  const app = Fastify();
  try {
    await runGenerationPipeline({wsdl: source, catalogOut: path.join(output, 'client/catalog.json'),
      clientOutDir: path.join(output, 'client'), compiler: {imports: 'js'},
      openapi: {outFile: path.join(output, 'openapi.json')},
      gateway: {outDir: path.join(output, 'gateway'), versionSlug: 'v1', serviceSlug: 'lexical'},
    });
    const {LexicalService} = await import(pathToFileURL(path.join(output, 'client/client.ts')).href);
    const client = new LexicalService({source, options: {endpoint: `http://127.0.0.1:${address.port}/soap`}});
    const {default: gateway} = await import(pathToFileURL(path.join(output, 'gateway/plugin.ts')).href);
    await app.register(gateway, {client});
    for (const [xmlValue, expected] of [['true', true], ['false', false], ['1', true], ['0', false], [' true ', true]] as const) {
      lexical = xmlValue;
      const response = await app.inject({method: 'POST', url: '/echo', payload: {Token: 'synthetic'}});
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data).toEqual({Enabled: expected, Label: {$value: 'Owned text'}});
    }
    withAttributes = true;
    const withCode = await app.inject({method: 'POST', url: '/echo', payload: {Token: 'synthetic'}});
    expect(withCode.statusCode, withCode.body).toBe(200);
    expect(withCode.json().data.Label).toEqual({Code: 'owned', $value: 'Owned text'});
    for (const invalid of ['yes', '2', '']) {
      lexical = invalid;
      const response = await app.inject({method: 'POST', url: '/echo', payload: {Token: 'synthetic'}});
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
    const before = calls;
    const invalidHttp = await app.inject({method: 'POST', url: '/echo', payload: []});
    expect(invalidHttp.statusCode).toBe(400); expect(calls).toBe(before);
  } finally {
    await app.close();
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(output, {recursive: true, force: true});
  }
}, 30_000);
