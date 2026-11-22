import {once} from 'node:events';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer, type ServerResponse} from 'node:http';
import {resolve, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import Fastify, {type FastifyPluginAsync} from 'fastify';
import {expect, it, vi} from 'vitest';
import {runGenerationPipeline} from '../../src/pipeline.js';
import {verificationPath} from '../helpers/verificationPath.js';
import {readWireElements} from '../helpers/streamWireXml.js';
import {checkedComponentRuntimeV3, checkedComponentStreamRuntimeV1, generateCheckedClient, planCheckedComponents} from '../../src/index.js';
import {prepareCheckedComponentPlan} from '../../src/checkedPlanning.js';
import {decodeComponentStream} from '../../src/compiler/componentStreamSoap.js';

vi.mock('@techspokes/typescript-wsdl-client', () => import('../../src/index.js'));

const fixture = resolve('test/fixtures/wsdl/stream-mapping.wsdl');
const namespace = 'urn:stream-mapping';
const selector = {operation: 'Read', binding: {namespace, local: 'MappingBinding'}, portType: {namespace, local: 'MappingPort'}};
const qualified = (local: string) => ({namespace, local});
const prefix = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><s:Body><ReadResponse xmlns="urn:stream-mapping">';
const record = '<Record Enabled="1" Rank="7"><Count>42</Count><Total>12.50</Total><Large>9007199254740993</Large><Label Active="false">3.50</Label><BareLabel>4.50</BareLabel><Tag>été</Tag><Nil xsi:nil="true"/><Children><Child Active="true"/></Children></Record>';
const suffix = '</ReadResponse></s:Body></s:Envelope>';
const expected = {Enabled: true, Rank: 7, Count: 42, Total: '12.5', Large: '9007199254740993', Label: {Active: false, $value: '3.5'},
  BareLabel: {$value: '4.5'}, Tag: ['été'], Nil: {$nil: true}, Children: {Child: [{Active: true}]}, RepeatedList: [], RepeatedInlineList: []};
const input = {Enabled: true, Options: {Active: false}, RequestLabel: {Active: true, $value: '5.25'}};

it.each(['ndjson', 'json-array'] as const)('yields a checked %s item before the owned SOAP server releases the suffix', async format => {
  const directory = await mkdtemp(verificationPath('tmp/checked-streaming-'));
  const soap = createServer();
  const app = Fastify();
  const requests: {xml: string; action?: string; url?: string}[] = [];
  const submitted = JSON.stringify(input);
  let release = () => {};
  let ended = false;
  function hold() {
    ended = false;
    const gate = new Promise<void>(resolve => {release = resolve;});
    soap.once('request', async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      requests.push({xml: Buffer.concat(chunks).toString(), action: req.headers.soapaction as string, url: req.url});
      res.writeHead(200, {'content-type': 'text/xml; charset=utf-8'});
      res.write(prefix + record);
      await gate;
      ended = true;
      res.end(suffix);
    });
  }
  const url = (address: ReturnType<typeof soap.address>, path: string) => {
    if (!address || typeof address === 'string') throw new Error('Expected an owned TCP listener');
    return `http://127.0.0.1:${address.port}${path}`;
  };
  try {
    soap.listen(0, '127.0.0.1');
    await once(soap, 'listening');
    const endpoint = url(soap.address(), '/owned?soap=1');
    const clientOutDir = join(directory, 'client');
    const gatewayDir = join(directory, 'gateway');
    await runGenerationPipeline({model: 'checked-components-v1', wsdl: fixture, clientOutDir,
      checkedComponents: {streams: [{selector, path: [qualified('ReadResponse'), qualified('Record')], format}]},
      openapi: {outFile: join(directory, 'openapi.json')}, gateway: {outDir: gatewayDir, serviceSlug: 'mapping', versionSlug: 'v1'}});
    const capsule = await readFile(join(clientOutDir, 'operations/0/contract.json'));
    const options = {localSource: fixture, fileRoots: [resolve('test/fixtures/wsdl')], sourceResources: [], sourceOrigins: [],
      soap: {service: qualified('StreamMapping'), port: 'MappingPort', endpoint, allowEndpoint: (value: URL) => value.href === endpoint}};
    const {createStreamClient, createClient} = await import(pathToFileURL(join(clientOutDir, 'client.ts')).href);
    const client = createStreamClient(checkedComponentStreamRuntimeV1);
    hold();
    const stream = client.Read(input, {...options, capsule});
    const iterator = stream.records[Symbol.asyncIterator]();
    expect(await iterator.next()).toEqual({value: expected, done: false});
    expect(ended).toBe(false);
    release();
    expect((await iterator.next()).done).toBe(true);
    expect(await stream.completion).toMatchObject({kind: 'complete', scope: 'full-response', records: 1});

    const plugin = (await import(pathToFileURL(join(gatewayDir, 'plugin.ts')).href)).default as FastifyPluginAsync<{
      clientOptions: typeof options; capsules: {Read: Uint8Array};
    }>;
    await app.register(plugin, {clientOptions: options, capsules: {Read: capsule}});
    await app.listen({host: '127.0.0.1', port: 0});
    hold();
    const response = await fetch(url(app.server.address(), '/v1/mapping/Read'), {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(input),
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let wire = '';
    for (;;) {
      const next = await reader.read();
      if (next.done) throw new Error('HTTP stream completed before first-item handshake');
      wire += decoder.decode(next.value, {stream: true});
      try {
        const first: unknown = format === 'ndjson'
          ? wire.includes('\n') ? JSON.parse(wire.split('\n')[0]!) : undefined
          : (JSON.parse(wire + ']') as unknown[])[0];
        if (first !== undefined) {
          expect(first).toEqual(expected);
          break;
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    expect(ended).toBe(false);
    release();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      wire += decoder.decode(next.value, {stream: true});
    }
    expect(format === 'ndjson' ? [JSON.parse(wire)] : JSON.parse(wire)).toEqual([expected]);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request).toMatchObject({action: '"urn:stream-mapping:read"', url: '/owned?soap=1'});
      expect(readWireElements(request.xml)).toEqual([
        {name: '{http://schemas.xmlsoap.org/soap/envelope/}Envelope', attributes: {}, text: ''},
        {name: '{http://schemas.xmlsoap.org/soap/envelope/}Body', attributes: {}, text: ''},
        {name: '{urn:stream-mapping}Read', attributes: {'{}Enabled': 'true'}, text: ''},
        {name: '{urn:stream-mapping}Options', attributes: {'{}Active': 'false'}, text: ''},
        {name: '{urn:stream-mapping}RequestLabel', attributes: {'{}Active': 'true'}, text: '5.25'},
      ]);
    }

    const send = (body: unknown) => fetch(url(app.server.address(), '/v1/mapping/Read'), {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body),
    });
    let additionalDispatches = 0;
    let respond: (res: ServerResponse) => void =
      res => res.end(prefix + record + suffix);
    soap.on('request', (req, res) => {
      req.resume();
      additionalDispatches++;
      res.setHeader('content-type', 'text/xml');
      respond(res);
    });
    const call = () => client.Read(input, {...options, capsule});
    async function refuse(next: ReturnType<typeof call>, kind: string, rule?: string) {
      await expect(next.records[Symbol.asyncIterator]().next()).rejects.toThrow();
      expect(await next.completion).toMatchObject({kind, ...(rule ? {rule} : {})});
    }
    await refuse(client.Read({Enabled: 'invalid'}, {...options, capsule}), 'value-invalid');
    await refuse(client.Read(input, {...options, capsule: Buffer.from('mixed')}), 'incompatible-artifact');
    await refuse(createStreamClient({version: 'old', open() {throw new Error('unexpected runtime invocation');}}).Read(input, {...options, capsule}),
      'incompatible-artifact', 'generated-stream-runtime-version');
    await refuse(client.Read(input, {...options, capsule, soap: {...options.soap, allowEndpoint: () => false}}), 'unsupported', 'endpoint authorization');
    await refuse(client.Read(input, {...options, capsule, soap: {...options.soap, upstream: {profile: 'basic'}}}), 'unsupported');
    for (const limits of [null, 1, []]) {
      await refuse(client.Read(input, {...options, capsule, soap: {...options.soap, limits}}), 'unsupported', 'invalid checked stream limits');
    }
    const abandoned = call();
    abandoned.cancel();
    expect(await abandoned.completion).toMatchObject({kind: 'cancelled'});
    expect((await send({Enabled: 'invalid'})).status).toBe(400);
    const invalidScalar = await send({...input, RequestLabel: {$value: 'invalid-decimal'}});
    expect(invalidScalar.status).toBe(400);
    expect(await invalidScalar.json()).toMatchObject({kind: 'scalar-invalid'});
    expect(additionalDispatches).toBe(0);

    const buffered = createClient(checkedComponentRuntimeV3);
    expect(await buffered.Read(input, {...options, capsule})).toMatchObject({kind: 'soap-response', value: {Record: [expected]}});

    respond = res => res.end(prefix + suffix);
    await refuse(call(), 'mismatch', 'incomplete checked stream wrapper');
    const emptyRead = await send(input);
    expect(emptyRead.status).toBe(502);
    expect(await emptyRead.json()).toMatchObject({kind: 'mismatch'});

    respond = res => {
      res.statusCode = 500;
      res.end('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Server</faultcode><faultstring>owned failure</faultstring></s:Fault></s:Body></s:Envelope>');
    };
    await refuse(call(), 'soap-fault');
    const fault = await send(input);
    expect(fault.status).toBe(502);
    expect(await fault.json()).toMatchObject({fault: {version: '1.1', string: 'owned failure'}});
    respond = res => {res.statusCode = 500; res.end(prefix + record + suffix);};
    await refuse(call(), 'protocol', 'HTTP 500 requires SOAP Fault');
    respond = res => {res.setHeader('content-encoding', 'gzip'); res.end(prefix + record + suffix);};
    await refuse(call(), 'unsupported', 'HTTP compression');
    respond = res => res.write('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Header><x:Access xmlns:x="urn:owned" s:mustUnderstand="1">');
    await refuse(call(), 'unsupported', 'incoming mandatory SOAP header');

    let redirects = 0;
    const redirectTarget = createServer((_req, res) => {redirects++; res.end();});
    redirectTarget.listen(0, '127.0.0.1');
    await once(redirectTarget, 'listening');
    try {
      respond = res => {res.writeHead(307, {location: url(redirectTarget.address(), '/unexpected')}); res.end();};
      await refuse(call(), 'transport', 'SOAP HTTP status');
      expect(redirects).toBe(0);
    } finally {
      redirectTarget.closeAllConnections();
      await new Promise<void>(resolve => redirectTarget.close(() => resolve()));
    }

    for (const tail of ['</ReadResponse><s:Fault/></s:Body></s:Envelope>', '</mismatch>', Buffer.from([0xff])]) {
      respond = res => res.end(Buffer.concat([Buffer.from(prefix + record), Buffer.from(tail)]));
      const failure = call();
      const records = failure.records[Symbol.asyncIterator]();
      expect((await records.next()).value).toEqual(expected);
      await expect(records.next()).rejects.toThrow();
      expect(await failure.completion).toMatchObject({kind: expect.stringMatching(/^(xml-invalid|protocol)$/)});
      const httpFailure = await send(input);
      expect(httpFailure.status).toBe(200);
      await expect(httpFailure.text()).rejects.toThrow();
    }

    const cancelled = new AbortController();
    let onDemand = () => {};
    let onClosed = () => {};
    const demand = new Promise<void>(resolve => {onDemand = resolve;});
    const closed = new Promise<void>(resolve => {onClosed = resolve;});
    respond = res => {
      res.write(prefix);
      res.once('close', onClosed);
      onDemand();
    };
    const stopped = client.Read(input, {...options, capsule, soap: {...options.soap, signal: cancelled.signal}});
    const pending = expect(stopped.records[Symbol.asyncIterator]().next()).rejects.toThrow();
    await demand;
    cancelled.abort();
    stopped.cancel();
    await pending;
    await closed;
    expect(await stopped.completion).toMatchObject({kind: 'cancelled'});

    let framed = () => {};
    const framedGate = new Promise<void>(resolve => {framed = resolve;});
    respond = res => {
      res.setHeader('content-length', Buffer.byteLength(prefix + record + suffix) + 10);
      res.write(prefix + record + suffix, () => {void framedGate.then(() => res.socket?.destroy());});
    };
    const truncated = call();
    const next = truncated.records[Symbol.asyncIterator]();
    expect((await next.next()).value).toEqual(expected);
    framed();
    await expect(next.next()).rejects.toThrow();
    expect(await truncated.completion).toMatchObject({kind: 'transport'});

    respond = res => res.write(prefix + record);
    const timed = client.Read(input, {...options, capsule, soap: {...options.soap, timeoutMs: 180}});
    const slow = timed.records[Symbol.asyncIterator]();
    expect((await slow.next()).value).toEqual(expected);
    let completed = false;
    void timed.completion.then(() => {completed = true;});
    await delay(300);
    expect(completed).toBe(false);
    await expect(slow.next()).rejects.toThrow('SOAP upstream inactivity');
    expect(await timed.completion).toMatchObject({kind: 'transport', rule: 'SOAP upstream inactivity'});
    expect(JSON.stringify(input)).toBe(submitted);
  } finally {
    release();
    app.server.closeAllConnections();
    await app.close();
    soap.closeAllConnections();
    await new Promise<void>(resolve => soap.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
}, 30_000);

it('qualifies Fetch empty output, native footer validation and the explicit companion wrapper', async () => {
  const directory = await mkdtemp(verificationPath('tmp/checked-fetch-'));
  const fixtures = resolve('test/conformance/fixtures/xsd/standard-schema-element');
  const fetchNamespace = 'urn:owned:wrapper';
  const name = (local: string) => ({namespace: fetchNamespace, local});
  const ordinary = join(fixtures, 'records.wsdl');
  const outer = join(fixtures, 'wrapper.wsdl');
  const variant = join(directory, 'footer.wsdl');
  const ordered = join(directory, 'ordered-companion.wsdl');
  const source = await readFile(ordinary, 'utf8');
  await writeFile(variant, source.replace('<xs:attribute name="Stamp" type="xs:string"/>', '<xs:attribute name="Stamp" type="xs:boolean" use="required"/>')
    .replace('</xs:sequence></xs:complexType></xs:element>\n    </xs:sequence>', '</xs:sequence></xs:complexType></xs:element>\n      <xs:element name="Footer" type="xs:boolean"/>\n    </xs:sequence>')
    .replace('</xs:sequence></xs:complexType></xs:element>\r\n    </xs:sequence>', '</xs:sequence></xs:complexType></xs:element>\r\n      <xs:element name="Footer" type="xs:boolean"/>\r\n    </xs:sequence>'));
  await writeFile(ordered, source.replace('<xs:element name="Records"><xs:complexType><xs:sequence>',
    '<xs:element name="Records"><xs:complexType><xs:choice minOccurs="0" maxOccurs="unbounded">')
    .replace(/(<\/xs:complexType><\/xs:element>\s*)<\/xs:sequence>(<\/xs:complexType><\/xs:element>\s*<\/xs:sequence><xs:attribute name="Stamp")/,
      '$1<xs:element name="Note" type="xs:string"/></xs:choice>$2'));
  const recordSelector = {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'};
  const outerSelector = {portType: name('WrapperPortType'), binding: name('WrapperBinding'), operation: 'Fetch'};
  const xmlStart = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:owned:wrapper"><s:Body>';
  const xmlEnd = '</s:Body></s:Envelope>';
  const item = '<Record Code="A"><Name>Été &amp; café</Name><Active>1</Active><Quantity>7</Quantity></Record>';
  const itemValue = {Code: 'A', Name: 'Été & café', Active: true, Quantity: 7};
  const schemaElement = '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="A" type="xs:string"/></xs:schema>';
  const contents = (inside: string, stamp = 'true') => `<Envelope Stamp="${stamp}"><Records>${inside}</Records>`;
  let respond = (_res: ServerResponse) => {};
  const soap = createServer((req, res) => {
    req.resume();
    res.setHeader('content-type', 'text/xml');
    respond(res);
  });
  try {
    soap.listen(0, '127.0.0.1');
    await once(soap, 'listening');
    const address = soap.address();
    if (!address || typeof address === 'string') throw new Error('Expected an owned TCP listener');
    const endpoint = `http://127.0.0.1:${address.port}/fetch`;
    async function generate(wsdl: string, scoped = false, recordSource = ordinary) {
      const selector = scoped ? outerSelector : recordSelector;
      const path = scoped ? ['Envelope', 'Envelope', 'Records', 'Record'] : ['Envelope', 'Records', 'Record'];
      const checkedComponents = {fileRoots: [fixtures, directory], streams: [{selector, path, format: 'ndjson' as const}],
        ...(scoped ? {recordProjections: [{selector, source: recordSource, recordSelector, scope: 'records-with-declared-wrapper-scope' as const}]} : {})};
      const report = await planCheckedComponents(wsdl, checkedComponents);
      expect(report.blockers).toEqual([]);
      expect(report.streams?.[0]).toMatchObject({path: path.map(name), scope: scoped ? 'records-with-declared-wrapper-scope' : 'full-response'});
      const clientOutDir = await mkdtemp(join(directory, 'fetch-'));
      await generateCheckedClient({wsdl, clientOutDir, checkedComponents});
      const capsule = await readFile(join(clientOutDir, 'operations/0/contract.json'));
      const {createStreamClient} = await import(pathToFileURL(join(clientOutDir, 'client.ts')).href);
      const client = createStreamClient(checkedComponentStreamRuntimeV1);
      return () => client.Fetch({Code: 'A'}, {localSource: wsdl, fileRoots: [fixtures, directory], capsule, sourceResources: [], sourceOrigins: [],
        ...(scoped ? {recordSources: [{selector, source: recordSource}], standardLibraries: ['w3c-xsd10-schema-element-2004-v1']} : {}),
        soap: {service: name(scoped ? 'WrapperService' : 'RecordService'), port: scoped ? 'WrapperPort' : 'RecordPort', endpoint,
          allowEndpoint: (url: URL) => url.href === endpoint}});
    }
    async function check(open: Awaited<ReturnType<typeof generate>>, xml: string, records: unknown[], completion: object) {
      respond = res => res.end(xmlStart + xml + xmlEnd);
      const call = open();
      const seen: unknown[] = [];
      let failed = false;
      try {for await (const record of call.records) seen.push(record);} catch {failed = true;}
      expect(seen).toEqual(records);
      expect(await call.completion).toMatchObject(completion);
      expect(failed).toBe(!('records' in completion));
    }
    const empty = await generate(ordinary);
    await check(empty, contents('') + '</Envelope>', [], {kind: 'complete', records: 0});
    const footer = await generate(variant);
    await check(footer, contents(item + item) + '<Footer>0</Footer></Envelope>', [itemValue, itemValue], {kind: 'complete', records: 2});
    await check(footer, contents(item) + '</Envelope>', [itemValue], {kind: 'mismatch'});
    await check(footer, contents(item) + '<Footer>maybe</Footer></Envelope>', [itemValue], {kind: 'scalar-invalid'});
    await check(footer, contents(item) + '<Footer>true</Footer><Footer>true</Footer></Envelope>', [itemValue], {kind: 'mismatch'});
    await check(footer, contents(item, 'maybe') + '<Footer>true</Footer></Envelope>', [], {kind: 'scalar-invalid'});
    const companion = await generate(outer, true);
    await check(companion, '<Envelope>' + schemaElement + contents(item) + '</Envelope></Envelope>', [itemValue],
      {kind: 'complete', scope: 'records-with-declared-wrapper-scope', records: 1});
    await check(companion, '<Envelope>' + schemaElement + '<Wrong><Records>' + item + '</Records></Wrong></Envelope>', [], {kind: 'mismatch'});
    const orderedCompanion = await generate(outer, true, ordered);
    await check(orderedCompanion, '<Envelope>' + schemaElement + contents(item + '<Note>retained value</Note>' + item) + '</Envelope></Envelope>',
      [itemValue, itemValue], {kind: 'complete', scope: 'records-with-declared-wrapper-scope', records: 2});
  } finally {
    soap.closeAllConnections();
    await new Promise<void>(resolve => soap.close(() => resolve()));
    await rm(directory, {recursive: true, force: true});
  }
}, 40_000);

it('preserves the checked record prefix at every byte split and pauses before the next source read', async () => {
  const wsdl = resolve('test/conformance/fixtures/xsd/standard-schema-element/records.wsdl');
  const namespace = 'urn:owned:wrapper', name = (local: string) => ({namespace, local});
  const selector = {portType: name('RecordPortType'), binding: name('RecordBinding'), operation: 'Fetch'};
  const {native, report} = await prepareCheckedComponentPlan(wsdl, {streams: [{selector, format: 'ndjson', path: ['Envelope', 'Records', 'Record']}]});
  expect(report.blockers).toEqual([]);
  const [operation, plan] = [...native!.streams][0]!;
  const metadata = {status: 200, contentType: 'text/xml', retrievalUri: 'http://example.invalid/soap'};
  const lead = '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" xmlns="urn:owned:wrapper" xmlns:r="urn:ignored"><s:Body><Envelope><Records>';
  const child = '<r:Record xmlns:r="urn:owned:wrapper" Code="A"><r:Name>é &amp; 茶</r:Name><r:Active>1</r:Active><r:Quantity>7</r:Quantity></r:Record>';
  const tail = '</Records></Envelope></s:Body></s:Envelope>';
  const complete = Buffer.from(lead + child + tail);
  const first = {Code: 'A', Name: 'é & 茶', Active: true, Quantity: 7};
  function read(pieces: Buffer[], controls: Parameters<typeof decodeComponentStream>[3] = {}) {
    const source = pieces[Symbol.iterator]();
    let pulls = 0;
    const stream = decodeComponentStream(plan, operation.mappings[0], metadata, controls, async () => {
      pulls++;
      return source.next();
    }, () => true);
    return {stream, pulls: () => pulls};
  }
  for (let split = 0; split <= complete.length; split++) {
    const {stream} = read([complete.subarray(0, split), complete.subarray(split)]);
    expect(await stream.next()).toEqual({done: false, value: first});
    expect(await stream.next()).toMatchObject({done: true, value: {kind: 'complete', records: 1}});
  }
  const other = child.replace('é &amp; 茶', 'π');
  const isolated = await Promise.all([read([complete]).stream.next(), read([Buffer.from(lead + other + tail)]).stream.next()]);
  expect(isolated.map(next => next.value)).toEqual([first, {...first, Name: 'π'}]);
  for (const tail of [Buffer.from('</wrong>'), Buffer.from([0xef, 0xbb]), Buffer.from([0xff])]) {
    const valid = Buffer.from(lead + child);
    for (const buffers of [[valid, tail], [Buffer.concat([valid, tail])]]) {
      const {stream} = read(buffers);
      expect(await stream.next()).toEqual({done: false, value: first});
      await expect(stream.next()).rejects.toMatchObject({outcome: {kind: 'xml-invalid'}});
    }
  }
  const many = 20;
  const paused = read([Buffer.from(lead + child.repeat(many)), Buffer.from(tail)]);
  for (let index = 0; index < many; index++) {
    expect(await paused.stream.next()).toEqual({done: false, value: first});
    expect(paused.pulls()).toBe(1);
  }
  expect(await paused.stream.next()).toMatchObject({done: true, value: {kind: 'complete', records: many}});
  expect(paused.pulls()).toBe(3);

  const recordBytes = 4 * 1024 * 1024;
  const filled = child.replace('é &amp; 茶', 'x'.repeat(recordBytes - Buffer.byteLength(child.replace('é &amp; 茶', ''))));
  const bounded = {maxRecordBytes: recordBytes, maxRetainedBytes: 8 * 1024 * 1024, maxDepth: 20};
  const inclusive = read([Buffer.from(lead + filled + tail)], bounded);
  expect((await inclusive.stream.next()).done).toBe(false);
  expect((await inclusive.stream.next()).done).toBe(true);
  const excessive = read([Buffer.from(lead + filled.replace('</r:Name>', 'x</r:Name>') + tail)], bounded);
  await expect(excessive.stream.next()).rejects.toMatchObject({outcome: {kind: 'resource-limit', rule: 'SOAP stream record byte limit'}});
  const comment = '<!--' + 'x'.repeat(bounded.maxRetainedBytes - 7) + '-->';
  const retainedAtLimit = read([Buffer.from(lead + comment + child + tail)], bounded);
  expect((await retainedAtLimit.stream.next()).value).toEqual(first);
  expect((await retainedAtLimit.stream.next()).done).toBe(true);
  const oversizedToken = read([Buffer.from(lead + comment.replace('-->', 'x-->') + child + tail)], bounded);
  await expect(oversizedToken.stream.next()).rejects.toMatchObject({outcome: {kind: 'resource-limit', rule: 'SOAP stream retained XML byte limit'}});
  expect((await read([complete], {maxDepth: 6}).stream.next()).value).toEqual(first);
  await expect(read([complete], {maxDepth: 5}).stream.next()).rejects.toMatchObject({outcome: {kind: 'resource-limit', rule: 'XML syntax depth limit'}});
  const entity = read([Buffer.from('<!DOCTYPE s:Envelope SYSTEM "https://example.invalid/external">' + lead + child + tail)]);
  await expect(entity.stream.next()).rejects.toMatchObject({outcome: {kind: 'unsupported', rule: 'DTDs and entity declarations are forbidden'}});
});

it('plans source-qualified paths and composes a buffered operation beside a streamed operation', async () => {
  const directory = await mkdtemp(verificationPath('tmp/checked-mixed-stream-'));
  try {
    const wsdl = join(directory, 'mixed.wsdl');
    const xml = (await readFile(fixture, 'utf8')).replace(
      /(<wsdl:operation name="Read">[\s\S]*?<\/wsdl:operation>)/g,
      operation => operation + operation.replace('name="Read"', 'name="ReadBuffered"').replace(':read"', ':buffered"'));
    await writeFile(wsdl, xml);
    const stream = {selector, path: ['ReadResponse', 'Record'], format: 'ndjson' as const};
    const rejected = await planCheckedComponents(wsdl, {streams: [{...stream, recordType: qualified('Child')}]});
    expect(rejected).toMatchObject({ready: false, blockers: [expect.objectContaining({
      reason: 'checked-stream:recordType does not match the source declaration',
    })]});
    const clientOutDir = join(directory, 'client');
    const result = await generateCheckedClient({wsdl, clientOutDir, checkedComponents: {streams: [stream]}});
    expect(result.planning.streams).toMatchObject([{path: [qualified('ReadResponse'), qualified('Record')]}]);
    const {createClient, createStreamClient} = await import(pathToFileURL(join(clientOutDir, 'client.ts')).href);
    expect(Object.keys(createClient(checkedComponentRuntimeV3)).sort()).toEqual(['Read', 'ReadBuffered']);
    expect(Object.keys(createStreamClient(checkedComponentStreamRuntimeV1))).toEqual(['Read']);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});
