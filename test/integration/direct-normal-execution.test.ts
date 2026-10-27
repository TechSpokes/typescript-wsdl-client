import {expect, it} from 'vitest';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {selectDirectOperation, inspectDirectOperation} from '../../src/compiler/directOperation.js';

const namespace = 'urn:checked:forecast';
const selector = {portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast'};
async function owned(handler: (request: IncomingMessage, response: ServerResponse) => void, run: (origin: string) => Promise<void>) {
  const server = createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No source endpoint');
  try {await run(`http://127.0.0.1:${address.port}`);}
  finally {server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));}
}
it('normal WSDL retrieval follows more than five authorized redirects without profiling quotas', async () => {
  const original = await readFile('test/conformance/fixtures/assessment/forecast.wsdl');
  let requests = 0;
  await owned((request, response) => {
    requests++;
    const hop = Number(request.url!.slice(1));
    if (hop < 7) {response.writeHead(302, {Location: '/' + (hop + 1)}); response.end();}
    else {response.writeHead(200, {'Content-Type': 'text/xml'}); response.end(original);}
  }, async origin => {
    const result = await selectDirectOperation(origin + '/0', selector, {loading: {policy: {allowedOrigins: [origin]}}});
    expect(result.kind).toBe('selected'); expect(requests).toBe(8);
    expect(result.usage).toEqual({work: 0, nodes: 0});
    if (result.kind !== 'selected') throw new Error(result.kind);
    const {source} = inspectDirectOperation(result.contract);
    expect(source.limits.resourceMs).toBe(0); expect(source.limits.totalIoMs).toBe(0);
    requests = 0;
    const limited = await selectDirectOperation(origin + '/0', selector,
      {loading: {policy: {allowedOrigins: [origin]}, limits: {redirects: 2}}});
    expect(limited.kind).toBe('resource-limit'); expect(requests).toBe(3);
  });
});
it('caller cancellation interrupts a stalled WSDL fetch even with no default deadline', async () => {
  let received!: () => void;
  const receiving = new Promise<void>(resolve => {received = resolve;});
  await owned((_request, _response) => received(), async origin => {
    const controller = new AbortController();
    const pending = selectDirectOperation(origin + '/never', selector,
      {loading: {policy: {allowedOrigins: [origin]}}, signal: controller.signal});
    await receiving; controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([pending, new Promise<never>((_, reject) => {
        // Test safeguard only; it is not supplied to the operation under test.
        timer = setTimeout(() => reject(new Error('caller cancellation did not settle')), 2000);
      })]);
      expect(result.kind).toBe('cancelled'); expect(result.usage).toEqual({work: 0, nodes: 0});
    } finally {clearTimeout(timer);}
  });
});
