/** Reproducible diagnostic probe; run each installed build in its own process. */
import {mkdtemp, readFile, writeFile, rm, mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import type * as Operation from '../../src/compiler/directOperation.js';
import type * as Values from '../../src/compiler/directValues.js';
import type * as Capsules from '../../src/compiler/directSourceCapsule.js';
import type * as Soap from '../../src/compiler/directSoap.js';
import type * as Budget from '../../src/compiler/semanticBudget.js';

const root = path.resolve(process.argv[2]!);
const load = (name: string) => import(pathToFileURL(path.join(root, 'dist/compiler', name + '.js')).href);
const operations: typeof Operation = await load('directOperation');
const values: typeof Values = await load('directValues');
const capsules: typeof Capsules = await load('directSourceCapsule');
const soap: typeof Soap = await load('directSoap');
const budgets: typeof Budget = await load('semanticBudget');
const namespace = 'urn:checked:forecast';
const selection = {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort'};
const original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl', 'utf8');
const text = original.replace('<wsdl:types>', '<!--' + 'padding '.repeat(1024) + '--><wsdl:types>');
await mkdir('tmp/conformance/resource-policy', {recursive: true});
const directory = await mkdtemp(path.resolve('tmp/conformance/resource-policy/probe-'));
let requests = 0;
const server = createServer((request, response) => {
  request.resume(); request.on('end', () => {
    requests++;
    response.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'});
    response.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><t:GetForecastResponse xmlns:t="urn:checked:forecast"><t:city>Paris</t:city><t:complete>true</t:complete></t:GetForecastResponse></s:Body></s:Envelope>');
  });
});
server.listen(0, '127.0.0.1'); await once(server, 'listening');
try {
  const file = path.join(directory, 'source.wsdl'); await writeFile(file, text);
  const selected = await operations.selectDirectOperation(file, {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'}, {loading: {policy: {fileRoots: [directory]}}});
  if (selected.kind !== 'selected') throw new Error(JSON.stringify(selected));
  const capsule = capsules.createDirectSourceCapsule(selected.contract, selection);
  if (capsule.kind !== 'direct-capsule') throw new Error(JSON.stringify(capsule));
  const readerBudget = budgets.createSemanticBudget({maxWork: 4096});
  const read = capsules.readDirectSourceCapsule(capsule.bytes, readerBudget);
  const mapping = values.createDirectValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'direct-mapping') throw new Error(JSON.stringify(mapping));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No endpoint');
  const endpoint = `http://127.0.0.1:${address.port}/owned`;
  const start = performance.now(), cpu = process.cpuUsage();
  const result = await soap.exchangeDirectSoap(selected.contract, mapping, {city: 'Paris', days: 2}, {...selection, endpoint, allowEndpoint: url => url.href === endpoint, timeoutMs: 1000});
  const used = process.cpuUsage(cpu);
  console.log(JSON.stringify({sourceBytes: Buffer.byteLength(text), result: result.kind, requests, work: result.usage.work,
    capsuleReader: 'versions' in read ? 'data' : read.kind, readerWork: readerBudget.usage().work, readerExhausted: readerBudget.exhausted(),
    diagnosticElapsedMs: Math.round(performance.now() - start), diagnosticCpuMs: Math.round((used.user + used.system) / 1000)}));
} finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, {recursive: true, force: true});}
