import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {createServer, type ServerResponse} from 'node:http';
import type {Socket} from 'node:net';
import {once, getEventListeners} from 'node:events';
import {readFile, mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import {selectDirectOperation} from '../../src/compiler/directOperation.js';
import {createDirectValueMapping} from '../../src/compiler/directValues.js';
import {exchangeDirectSoap} from '../../src/compiler/directSoap.js';
import type {DirectSoapOptions} from '../../src/compiler/directSoap.js';

const namespace = 'urn:checked:forecast';
const fixture = path.resolve('test/conformance/fixtures/assessment/forecast.wsdl');
let original: string, response: Buffer, scratch: string;
beforeAll(async () => {
  original = await readFile(fixture, 'utf8');
  response = await readFile(path.join(path.dirname(fixture), 'forecast-messages/response.xml'));
  await mkdir('tmp/conformance/direct-soap-independent', {recursive: true});
  scratch = await mkdtemp(path.resolve('tmp/conformance/direct-soap-independent/suite-'));
});
afterAll(async () => {await rm(scratch, {recursive: true, force: true});});
async function operation(text?: string) {
  const directory = text === undefined ? path.dirname(fixture) : await mkdtemp(path.join(scratch, 'source-'));
  const file = text === undefined ? fixture : path.join(directory, 'source.wsdl');
  if (text !== undefined) await writeFile(file, text);
  const selected = await selectDirectOperation(file, {
    portType: {namespace, local: 'ForecastPortType'}, binding: {namespace, local: 'ForecastBinding'}, operation: 'GetForecast',
  }, {limits: {}, loading: {policy: {fileRoots: [directory]}}});
  if (selected.kind !== 'selected') throw new Error(selected.kind + ':' + selected.rule);
  const mapping = createDirectValueMapping(selected.contract, {kind: 'input'});
  if (mapping.kind !== 'direct-mapping') throw new Error(mapping.kind);
  return {contract: selected.contract, mapping};
}
const value = {city: 'Paris', days: 2};
async function owned<T>(reply: (response: ServerResponse) => void, work: (state: {
  options: DirectSoapOptions;
  count: () => number;
  received: Promise<void>;
  sockets: Set<Socket>;
}) => Promise<T>): Promise<T> {
  let count = 0, markReceived!: () => void;
  const received = new Promise<void>(resolve => {markReceived = resolve;});
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    request.resume();
    request.on('end', () => {count++; markReceived(); reply(response);});
  });
  server.on('connection', socket => {sockets.add(socket); socket.once('close', () => sockets.delete(socket));});
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No server port');
  const endpoint = `http://127.0.0.1:${address.port}/independent`;
  try {
    return await work({count: () => count, received, sockets,
      options: {service: {namespace, local: 'ForecastService'}, port: 'ForecastPort', endpoint,
        allowEndpoint: url => url.href === endpoint, timeoutMs: 1000}});
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
const normal = (res: ServerResponse) => {res.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'}); res.end(response);};
async function closedByAdapter(sockets: Set<Socket>): Promise<void> {
  // Register before yielding; forced server cleanup happens only after this test.
  await Promise.all([...sockets].map(socket => once(socket, 'close')));
  expect(sockets.size).toBe(0);
}

describe('independent buffered SOAP transport/security controls', () => {
  it('rejects options accessors and proxies without invoking their code or sending a request', async () => {
    await owned(normal, async server => {
      const {contract, mapping} = await operation();
      let calls = 0;
      const options = {...server.options};
      Object.defineProperty(options, 'signal', {get() {calls++; return undefined;}, enumerable: true});
      expect((await exchangeDirectSoap(contract, mapping, value, options)).kind).toBe('unsupported');
      const proxy = new Proxy(server.options, {ownKeys() {calls++; throw new Error('proxy evaluated');}});
      expect((await exchangeDirectSoap(contract, mapping, value, proxy)).kind).toBe('unsupported');
      expect(calls).toBe(0); expect(server.count()).toBe(0);
    });
  });

  it('keeps snapshotted selection and the original signal when authorization mutates caller options', async () => {
    await owned(() => {}, async server => {
      const {contract, mapping} = await operation();
      const originalSignal = new AbortController(), replacement = new AbortController();
      const mutable = {...server.options, service: {...server.options.service}, signal: originalSignal.signal};
      mutable.allowEndpoint = () => {
        mutable.signal = replacement.signal;
        mutable.endpoint = 'http://127.0.0.1:1/forbidden';
        mutable.port = 'WrongPort'; mutable.service.local = 'WrongService';
        return true;
      };
      expect(getEventListeners(originalSignal.signal, 'abort')).toHaveLength(0);
      const pending = exchangeDirectSoap(contract, mapping, value, mutable);
      await server.received;
      originalSignal.abort();
      expect((await pending).kind).toBe('cancelled');
      expect(server.count()).toBe(1);
      await closedByAdapter(server.sockets);
      expect(getEventListeners(originalSignal.signal, 'abort')).toHaveLength(0);
      expect(getEventListeners(replacement.signal, 'abort')).toHaveLength(0);
    });
  });

  it.each([{}, {authentication: true}, true, ''])('rejects malformed requested capabilities %j before dispatch', async capabilities => {
    await owned(normal, async server => {
      const {contract, mapping} = await operation();
      expect((await exchangeDirectSoap(contract, mapping, value, {...server.options, capabilities: capabilities as never})).kind).toBe('unsupported');
      expect(server.count()).toBe(0);
    });
  });

  it('rejects a quoted-string backslash in source SOAPAction before dispatch', async () => {
    await owned(normal, async server => {
      const {contract, mapping} = await operation(original.replace('soapAction="urn:checked:GetForecast"', 'soapAction="urn:checked:Get\\Forecast"'));
      expect((await exchangeDirectSoap(contract, mapping, value, server.options)).kind).toBe('unsupported');
      expect(server.count()).toBe(0);
    });
  });

  it.each(['text/xml; charset="utf-8', 'text/xml; charset=utf-8"'])('rejects unmatched Content-Type quoting: %s', async contentType => {
    await owned(res => {res.writeHead(200, {'Content-Type': contentType}); res.end(response);}, async server => {
      const {contract, mapping} = await operation();
      const result = await exchangeDirectSoap(contract, mapping, value, server.options);
      expect(result.kind).toBe('protocol'); expect(result).not.toHaveProperty('decoded');
      expect(server.count()).toBe(1);
    });
  });

  it('enforces the actual response byte boundary after sending a smaller valid request', async () => {
    const bytes = Buffer.from(response.toString().replace('Paris', 'x'.repeat(2000)));
    for (const difference of [0, -1]) {
      await owned(res => {res.writeHead(200, {'Content-Type': 'text/xml'}); res.end(bytes);}, async server => {
        const {contract, mapping} = await operation();
        const result = await exchangeDirectSoap(contract, mapping, value, {...server.options, limits: {maxBytes: bytes.length + difference}});
        expect(server.count()).toBe(1);
        if (difference === 0) {
          expect(result.kind).toBe('soap-response');
          if (result.kind !== 'soap-response') throw new Error(JSON.stringify(result));
          expect(Buffer.from(result.responseBytes)).toEqual(bytes);
          expect(result.decoded.validated.value).toEqual({city: 'x'.repeat(2000), temperature: [18, -2], complete: true});
        } else {
          expect(result).toMatchObject({kind: 'resource-limit', rule: 'HTTP response byte limit'});
          expect(result).not.toHaveProperty('decoded'); expect(result).not.toHaveProperty('responseBytes');
        }
        await closedByAdapter(server.sockets);
      });
    }
  });

  it('reports an early remote socket close as transport failure without partial publication', async () => {
    await owned(res => {
      res.writeHead(200, {'Content-Type': 'text/xml', 'Content-Length': response.length});
      res.write(response.subarray(0, 24));
      res.socket?.destroy();
    }, async server => {
      const {contract, mapping} = await operation();
      const result = await exchangeDirectSoap(contract, mapping, value, server.options);
      expect(result.kind).toBe('transport'); expect(server.count()).toBe(1);
      expect(result).not.toHaveProperty('decoded'); expect(result).not.toHaveProperty('responseBytes');
      await closedByAdapter(server.sockets);
    });
  });

  it('closes the hanging response socket on deadline before server teardown', async () => {
    await owned(() => {}, async server => {
      const {contract, mapping} = await operation();
      const result = await exchangeDirectSoap(contract, mapping, value, {...server.options, timeoutMs: 25});
      expect(result).toMatchObject({kind: 'transport', rule: 'SOAP deadline exceeded'});
      expect(server.count()).toBe(1);
      await closedByAdapter(server.sockets);
    });
  });
});

it('rejects ignored foreign local-name import triggers before dependency bootstrap or I/O', async () => {
  await owned(normal, async server => {
    const source = original.replace('</wsdl:definitions>', `<wsdl:documentation><foreign:import xmlns:foreign="urn:foreign" namespace="urn:dependency" location="${server.options.endpoint}"/></wsdl:documentation></wsdl:definitions>`);
    const {contract, mapping} = await operation(source);
    const result = await exchangeDirectSoap(contract, mapping, value, server.options);
    expect(result).toMatchObject({kind: 'unsupported', rule: 'dependency bootstrap imports'});
    expect(server.count()).toBe(0);
  });
});

it('rejects an XML-escaped namespace quote before node-soap can interpolate it into a request', async () => {
  await owned(normal, async server => {
    const source = original.replace('<wsdl:definitions ', '<wsdl:definitions xmlns:unused="urn:unused&quot;injected" ');
    const {contract, mapping} = await operation(source);
    expect((await exchangeDirectSoap(contract, mapping, value, server.options)).kind).toBe('unsupported');
    expect(server.count()).toBe(0);
  });
});

it('refuses prototype-sensitive dependency service names before dispatch', async () => {
  await owned(normal, async server => {
    const {contract, mapping} = await operation(original.replace('name="ForecastService"', 'name="constructor"'));
    expect((await exchangeDirectSoap(contract, mapping, value, {...server.options, service: {namespace, local: 'constructor'}})).kind).toBe('unsupported');
    expect(server.count()).toBe(0);
  });
});

it('refuses incoming SOAP security before any invalid body scalar can be normalized', async () => {
  const bytes = Buffer.from(response.toString().replace('<soap:Body>', '<soap:Header><Security xmlns="urn:security"/></soap:Header><soap:Body>').replace('true', 'not-a-boolean'));
  await owned(res => {res.writeHead(200, {'Content-Type': 'text/xml'}); res.end(bytes);}, async server => {
    const {contract, mapping} = await operation();
    const result = await exchangeDirectSoap(contract, mapping, value, server.options);
    expect(result).toMatchObject({kind: 'unsupported', rule: 'incoming SOAP headers'});
    expect(result).not.toHaveProperty('decoded');
  });
});

it('fails malformed original UTF-8 without replacement decoding or partial publication', async () => {
  const cut = response.indexOf('Paris');
  const bytes = Buffer.concat([response.subarray(0, cut), Buffer.from([0xc3, 0x28]), response.subarray(cut + 5)]);
  await owned(res => {res.writeHead(200, {'Content-Type': 'text/xml; charset=utf-8'}); res.end(bytes);}, async server => {
    const {contract, mapping} = await operation();
    const result = await exchangeDirectSoap(contract, mapping, value, server.options);
    expect(result.kind).toBe('xml-invalid');
    expect(result).not.toHaveProperty('decoded'); expect(result).not.toHaveProperty('responseBytes');
  });
});

it('honors an explicitly chosen byte capacity without an allocation reservation', async () => {
  await owned(normal, async server => {
    const {contract, mapping} = await operation();
    const result = await exchangeDirectSoap(contract, mapping, value, {...server.options, limits: {maxBytes: Number.MAX_SAFE_INTEGER}});
    expect(result.kind).toBe('soap-response');
    expect(result).toHaveProperty('decoded'); expect(server.count()).toBe(1);
  });
});

it('pins the declared port and request-local action when a later SOAP 1.1 binding shares the port type', async () => {
  const actions: (string | string[] | undefined)[] = [];
  await owned(res => {actions.push(res.req.headers.soapaction); normal(res);}, async server => {
    const binding = original.match(/<wsdl:binding name="ForecastBinding"[\s\S]*?<\/wsdl:binding>/)?.[0];
    if (!binding) throw new Error('Independent fixture binding missing');
    const shadow = binding.replace('name="ForecastBinding"', 'name="ShadowBinding"').replace('urn:checked:GetForecast', 'urn:wrong:ShadowAction');
    const text = original.replace('<wsdl:service name="ForecastService">', shadow + '<wsdl:service name="ForecastService"><wsdl:port name="FirstPort" binding="t:ShadowBinding"><soap:address location="http://127.0.0.1:1/forbidden"/></wsdl:port>');
    const {contract, mapping} = await operation(text);
    const result = await exchangeDirectSoap(contract, mapping, value, server.options);
    expect(result.kind).toBe('soap-response');
    expect(actions).toEqual(['"urn:checked:GetForecast"']);
    expect(server.count()).toBe(1);
  });
});

it('isolates actions across simultaneous native operations sharing one authorized HTTP endpoint', async () => {
  const actions: (string | string[] | undefined)[] = [];
  await owned(res => {actions.push(res.req.headers.soapaction); normal(res);}, async server => {
    const a = await operation(original.replace('soapAction="urn:checked:GetForecast"', 'soapAction="urn:independent:A"'));
    const b = await operation(original.replace('soapAction="urn:checked:GetForecast"', 'soapAction="urn:independent:B"'));
    const results = await Promise.all([
      exchangeDirectSoap(a.contract, a.mapping, value, server.options),
      exchangeDirectSoap(b.contract, b.mapping, value, server.options),
    ]);
    expect(results.map(result => result.kind)).toEqual(['soap-response', 'soap-response']);
    expect(actions.sort()).toEqual(['"urn:independent:A"', '"urn:independent:B"']);
    expect(server.count()).toBe(2);
  });
});
