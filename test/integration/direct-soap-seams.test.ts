import {expect, it} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {WSDL} from 'soap/lib/wsdl/index.js';
import {Client} from 'soap/lib/client.js';
import {HttpClient} from 'soap/lib/http.js';

it('bootstraps original Forecast bytes and intercepts bounded original HTTP bytes before text or object parsing', async () => {
  const source = await readFile('test/conformance/fixtures/assessment/forecast.wsdl');
  // UTF-16LE with BOM makes a decoded/re-encoded UTF-8 substitute observably wrong.
  const text = '<?xml version="1.0" encoding="UTF-16"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><x xmlns="urn:wire">café</x></s:Body></s:Envelope>';
  const wire = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  const requests: {body: string; action: string | string[] | undefined}[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      requests.push({body: Buffer.concat(chunks).toString(), action: req.headers.soapaction});
      res.writeHead(200, {'Content-Type': 'text/xml; charset=utf-16'}); res.end(wire);
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No port');
  let captured: Buffer | undefined, parsed = false;
  const complete = new Error('raw-capture-complete');
  class Raw extends HttpClient {
    override request(url: string, data: string, callback: (error: unknown) => void, headers: Record<string, string>, options: Record<string, unknown>) {
      return super.request(url, data, (error: unknown, _res: unknown, body: unknown) => {
        if (Buffer.isBuffer(body)) captured = body;
        callback(error ?? complete);
      }, headers, {...options, responseType: 'arraybuffer', decompress: false, maxRedirects: 0, maxContentLength: 4096, proxy: false});
    }
  }
  try {
    const wsdl = new WSDL(new TextDecoder('utf-8', {fatal: true}).decode(source), pathToFileURL(resolve('test/conformance/fixtures/assessment/forecast.wsdl')).href, {
      wsdl_options: {overrideImportLocation: () => {throw new Error('Unexpected resource');}},
    });
    await new Promise<void>((resolve, reject) => wsdl.onReady(error => error ? reject(error) : resolve()));
    wsdl.xmlToObject = () => {parsed = true; throw new Error('Lossy parser invoked');};
    const client = new Client(wsdl, `http://127.0.0.1:${address.port}/owned`, {httpClient: new Raw()});
    const body = '<t:GetForecast xmlns:t="urn:checked:forecast"><t:city>Paris</t:city><t:days>2</t:days></t:GetForecast>';
    await new Promise<void>((resolve, reject) => client.ForecastService.ForecastPort.GetForecast({_xml: body}, (error: unknown) => {
      if (error === complete) resolve(); else reject(error);
    }, {}, {SOAPAction: '"urn:checked:GetForecast"'}));
    expect(captured).toEqual(wire); expect(parsed).toBe(false);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.action).toBe('"urn:checked:GetForecast"');
    expect(requests[0]!.body).toContain(body);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
